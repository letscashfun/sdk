/**
 * Buying and selling.
 *
 * Swaps go through Uniswap's UniversalRouter, and there are three things here
 * that are not guessable from the ABI:
 *
 *  - **This chain's router is a modified build.** Its
 *    `ExactInputSingleParams` carries an extra `uint256 minHopPriceX36` between
 *    `amountOutMinimum` and `hookData` — confirmed in the router's verified
 *    source on Blockscout, `IV4Router.sol:27-34`. The canonical five-field
 *    struct decodes on an ether pool *by accident* — the misaligned `hookData`
 *    offset lands its length on `currency0`, which is the zero address — and
 *    reverts on every USDG pool, where `currency0` is a real address. So the
 *    bug is invisible on every pool that existed before vNext and fatal on the
 *    rest.
 *  - **Approvals are two-step.** Non-native assets are pulled through Permit2,
 *    so the ERC-20 approves Permit2 and then Permit2 approves the router.
 *    Missing the second is the usual cause of an opaque revert on a sell.
 *  - **"Needs an approval" is not "is a sell".** A buy settles `currency0`,
 *    which is ether on an ether pool but USDG on a stablecoin one. The question
 *    is whether the settled currency is native, not which direction you trade.
 */

import { encodeAbiParameters } from "viem";
import type { Address, Hex } from "viem";

import { erc20Abi, permit2Abi, universalRouterAbi, v4QuoterAbi } from "./abis/external.js";
import { type Asset, Amount } from "./amount.js";
import { isNativeCurrency } from "./chain.js";
import {
  type ClientContext,
  type TxResult,
  type WriteOptions,
  executeWrite,
  requireAccount,
} from "./client.js";
import { InvalidArgumentError, withDecodedErrors } from "./errors.js";
import type { PoolKey } from "./pool.js";

/** UniversalRouter command for a v4 swap. */
const V4_SWAP = "0x10" as const;

/** v4 router actions: SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL. */
const ACTIONS = "0x060c0f" as const;

/**
 * How long a Permit2 allowance to the router stays live.
 *
 * Uniswap's own interface uses thirty days, which suits an app people use
 * daily. Integrators here tend to trade in bursts, so that choice would leave
 * a standing allowance long after the one sell it was granted for. Half an
 * hour covers retries and nothing else.
 */
export const PERMIT2_APPROVAL_TTL_SECONDS = 30 * 60;

/** Permit2 allowances are uint160 while balances are uint256. */
const UINT160_MAX = 2n ** 160n - 1n;

/**
 * Slippage ceiling.
 *
 * `minOut` is the only thing between a trade and a sandwich, so this is a
 * safety limit rather than a preference. Nobody chooses to lose 99% — they
 * paste a large number in to force a reverting trade through, and hand the
 * difference to a bot.
 */
export const MAX_SLIPPAGE_BPS = 2500;

/** Above this, a trade still goes through but deserves a warning in your UI. */
export const HIGH_SLIPPAGE_BPS = 1000;

/** What a quote came back with. */
export interface SwapQuote {
  /** What you put in. */
  readonly amountIn: Amount;
  /** What you would get out, at current state. */
  readonly amountOut: Amount;
  /** The floor that will be enforced, after slippage. */
  readonly minAmountOut: Amount;
  /** Slippage applied, in basis points. */
  readonly slippageBps: number;
  /** The router's gas estimate for the swap itself. */
  readonly gasEstimate: bigint;
}

/** A completed swap. */
export interface SwapResult extends TxResult<void> {
  /** What was spent. */
  readonly amountIn: Amount;
  /** The floor that was enforced. Actual output is at least this. */
  readonly minAmountOut: Amount;
}

/**
 * Encodes one exact-input v4 swap for `UniversalRouter.execute`.
 *
 * Exported so the layout can be pinned by a test, and so anyone building
 * their own router call can reuse it rather than rediscovering the extra
 * `minHopPriceX36` field the hard way.
 *
 * The layout matches the router's verified source on Blockscout:
 * `IV4Router.sol:27-34` for the struct, and `V4Router.sol:93` for the fact
 * that a zero `minHopPriceX36` disables the per-hop floor — leaving
 * `amountOutMinimum` as the real slippage protection, which is why zero is
 * passed here.
 */
export function encodeV4Swap(
  key: PoolKey,
  zeroForOne: boolean,
  amountIn: bigint,
  minAmountOut: bigint,
): { commands: Hex; inputs: Hex[]; value: bigint } {
  const poolKeyComponents = [
    { name: "currency0", type: "address" },
    { name: "currency1", type: "address" },
    { name: "fee", type: "uint24" },
    { name: "tickSpacing", type: "int24" },
    { name: "hooks", type: "address" },
  ] as const;

  const swapParams = encodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          { name: "poolKey", type: "tuple", components: poolKeyComponents },
          { name: "zeroForOne", type: "bool" },
          { name: "amountIn", type: "uint128" },
          { name: "amountOutMinimum", type: "uint128" },
          // Present only on this chain's router build. Zero disables the
          // per-hop floor (V4Router.sol:93); `amountOutMinimum` is the real
          // protection.
          { name: "minHopPriceX36", type: "uint256" },
          { name: "hookData", type: "bytes" },
        ],
      },
    ],
    [
      {
        poolKey: key,
        zeroForOne,
        amountIn,
        amountOutMinimum: minAmountOut,
        minHopPriceX36: 0n,
        hookData: "0x",
      },
    ],
  );

  const settleCurrency = zeroForOne ? key.currency0 : key.currency1;
  const takeCurrency = zeroForOne ? key.currency1 : key.currency0;

  const settle = encodeAbiParameters(
    [{ type: "address" }, { type: "uint256" }],
    [settleCurrency, amountIn],
  );
  const take = encodeAbiParameters(
    [{ type: "address" }, { type: "uint256" }],
    [takeCurrency, minAmountOut],
  );
  const input = encodeAbiParameters(
    [{ type: "bytes" }, { type: "bytes[]" }],
    [ACTIONS, [swapParams, settle, take]],
  );

  return {
    commands: V4_SWAP,
    inputs: [input],
    // Ether is attached; anything else is pulled. Attaching value on a USDG
    // pool sends real ether into a swap that never asked for it, while SETTLE
    // tries to pull USDG the router was never approved for.
    value: isNativeCurrency(settleCurrency) ? amountIn : 0n,
  };
}

/**
 * Trading against one pool.
 *
 * Get one from `token.trade` rather than constructing it, so the pool key has
 * already been checked against the id the pool launched with.
 */
export class Trader {
  constructor(
    private readonly ctx: ClientContext,
    /** The verified pool key. */
    readonly poolKey: PoolKey,
    /** What the pool is quoted in. */
    readonly quote: Asset,
    /** The launched token, as an asset. */
    readonly token: Asset,
  ) {}

  /** True for a buy: quote in, token out. */
  #isBuy(direction: "buy" | "sell"): boolean {
    // currency0 is always the quote on a letscash pool, so buying is always
    // zeroForOne and selling always the reverse.
    return direction === "buy";
  }

  /**
   * Prices a trade without sending anything.
   *
   * The quoter is not a view function despite behaving like one — it simulates
   * the swap and reverts to return the answer — so this costs a simulation
   * round trip rather than a plain call.
   *
   * @param direction `"buy"` spends quote, `"sell"` spends token.
   * @param amountIn How much to spend, in the input asset.
   * @param slippageBps Tolerance for the floor. Default 100 (1%).
   */
  async getQuote(
    direction: "buy" | "sell",
    amountIn: Amount | bigint,
    slippageBps = 100,
  ): Promise<SwapQuote> {
    if (slippageBps < 0 || slippageBps > MAX_SLIPPAGE_BPS) {
      throw new InvalidArgumentError(
        `Slippage of ${slippageBps} bps is outside the accepted range (0–${MAX_SLIPPAGE_BPS}). ` +
          `A very high tolerance is not protection, it is a donation to whoever is watching.`,
      );
    }

    const isBuy = this.#isBuy(direction);
    const inAsset = isBuy ? this.quote : this.token;
    const outAsset = isBuy ? this.token : this.quote;

    const raw = amountIn instanceof Amount ? amountIn.raw : amountIn;
    // Case-insensitive: checksummed and lowercase spellings are one asset.
    if (
      amountIn instanceof Amount &&
      amountIn.asset.address.toLowerCase() !== inAsset.address.toLowerCase()
    ) {
      throw new InvalidArgumentError(
        `A ${direction} spends ${inAsset.symbol}, but the amount is in ${amountIn.asset.symbol}.`,
      );
    }
    if (raw <= 0n) throw new InvalidArgumentError("amountIn must be greater than zero.");

    const { result } = await withDecodedErrors(() =>
      this.ctx.publicClient.simulateContract({
        address: this.ctx.addresses.v4Quoter,
        abi: v4QuoterAbi,
        functionName: "quoteExactInputSingle",
        args: [
          {
            poolKey: this.poolKey,
            zeroForOne: isBuy,
            exactAmount: raw,
            hookData: "0x",
          },
        ],
      }),
    );

    const [amountOut, gasEstimate] = result;
    const out = Amount.raw(amountOut, outAsset);
    return {
      amountIn: Amount.raw(raw, inAsset),
      amountOut: out,
      minAmountOut: out.percentBps(BigInt(10_000 - slippageBps)),
      slippageBps,
      gasEstimate,
    };
  }

  /**
   * Grants whatever approvals the trade needs, if they are missing.
   *
   * Up to two transactions: the ERC-20 approving Permit2, then Permit2
   * approving the router. Returns the hashes of any that were actually sent —
   * an empty array means everything was already in place.
   *
   * Called automatically by {@link buy} and {@link sell}.
   */
  async ensureApprovals(
    direction: "buy" | "sell",
    amountIn: bigint,
    options?: WriteOptions,
  ): Promise<Hex[]> {
    const settleCurrency = this.#isBuy(direction)
      ? this.poolKey.currency0
      : this.poolKey.currency1;

    // Native ether is attached to the call, never pulled, so it needs nothing.
    if (isNativeCurrency(settleCurrency)) return [];

    const account = requireAccount(this.ctx, "approve", options?.account);
    const owner = typeof account === "string" ? account : account.address;
    const { permit2, universalRouter } = this.ctx.addresses;
    const sent: Hex[] = [];

    const erc20Allowance = await this.ctx.publicClient.readContract({
      address: settleCurrency,
      abi: erc20Abi,
      functionName: "allowance",
      args: [owner, permit2],
    });
    if (erc20Allowance < amountIn) {
      const tx = await executeWrite<boolean>(this.ctx, "approve Permit2", options, () => ({
        address: settleCurrency,
        abi: erc20Abi,
        functionName: "approve",
        // Permit2's own model is a max ERC-20 approval plus a short-lived,
        // amount-bounded allowance on top. The bound that matters is the
        // second one.
        args: [permit2, UINT160_MAX],
      }));
      sent.push(tx.hash);
    }

    const [allowed, expiration] = await this.ctx.publicClient.readContract({
      address: permit2,
      abi: permit2Abi,
      functionName: "allowance",
      args: [owner, settleCurrency, universalRouter],
    });
    const now = Math.floor(Date.now() / 1000);
    if (BigInt(allowed) < amountIn || Number(expiration) <= now) {
      const tx = await executeWrite<void>(this.ctx, "approve router via Permit2", options, () => ({
        address: permit2,
        abi: permit2Abi,
        functionName: "approve",
        args: [
          settleCurrency,
          universalRouter,
          amountIn > UINT160_MAX ? UINT160_MAX : amountIn,
          now + PERMIT2_APPROVAL_TTL_SECONDS,
        ],
      }));
      sent.push(tx.hash);
    }

    return sent;
  }

  /**
   * Buys the token, spending the pool's quote asset.
   *
   * @example
   * ```ts
   * const token = await client.token("0xfd45…");
   * const preview = await token.trade.getQuote("buy", Amount.parse("0.1", token.quote));
   * console.log(`${preview.amountOut}`);
   * await token.trade.buy(Amount.parse("0.1", token.quote));
   * ```
   */
  async buy(
    amountIn: Amount | bigint,
    options?: WriteOptions & { slippageBps?: number; skipApprovals?: boolean },
  ): Promise<SwapResult> {
    return this.#swap("buy", amountIn, options);
  }

  /** Sells the token back for the pool's quote asset. */
  async sell(
    amountIn: Amount | bigint,
    options?: WriteOptions & { slippageBps?: number; skipApprovals?: boolean },
  ): Promise<SwapResult> {
    return this.#swap("sell", amountIn, options);
  }

  async #swap(
    direction: "buy" | "sell",
    amountIn: Amount | bigint,
    options?: WriteOptions & { slippageBps?: number; skipApprovals?: boolean },
  ): Promise<SwapResult> {
    const slippageBps = options?.slippageBps ?? 100;
    const priced = await this.getQuote(direction, amountIn, slippageBps);
    const raw = priced.amountIn.raw;

    if (!options?.skipApprovals) {
      await this.ensureApprovals(direction, raw, options);
    }

    const { commands, inputs, value } = encodeV4Swap(
      this.poolKey,
      this.#isBuy(direction),
      raw,
      priced.minAmountOut.raw,
    );

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 120);
    const tx = await executeWrite<void>(this.ctx, direction, options, () => ({
      address: this.ctx.addresses.universalRouter,
      abi: universalRouterAbi,
      functionName: "execute",
      args: [commands, inputs, deadline],
      value,
    }));

    return { ...tx, amountIn: priced.amountIn, minAmountOut: priced.minAmountOut };
  }
}
