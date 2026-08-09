/**
 * A launched token, resolved.
 *
 * `client.token(address)` is async on purpose. It reads the pool id, hook and
 * quote off the token itself once, then hands back an object where everything
 * else is already known — so `token.fees`, `token.poolKey` and `token.quote`
 * are plain properties rather than a chain of awaits.
 *
 * Reading those three off the token matters. The pool id is *stored* on the
 * token at launch, so asking the token is authoritative; deriving it from a
 * key you assembled yourself is the single most common way to end up querying
 * a pool that does not exist.
 */

import type { Address, Hex } from "viem";

import { erc20Abi } from "./abis/external.js";
import { factoryAbi } from "./abis/factory.js";
import { hookAbi } from "./abis/hook.js";
import { tokenAbi } from "./abis/token.js";
import { type Asset, Amount } from "./amount.js";
import { isKnownHook } from "./chain.js";
import type { ClientContext } from "./client.js";
import { InvalidArgumentError } from "./errors.js";
import { FeeStream } from "./fees.js";
import { type PoolKey, assertPoolKey, buildPoolKey } from "./pool.js";
import { LaunchSplitter } from "./splitter.js";
import { Trader } from "./trade.js";

/** Links attached to a token at launch. Any field may be empty. */
export interface Socials {
  readonly telegram: string;
  readonly twitter: string;
  readonly discord: string;
  readonly website: string;
  readonly extra: string;
}

/** Everything descriptive about a token. */
export interface TokenMetadata {
  readonly name: string;
  readonly symbol: string;
  readonly decimals: number;
  readonly totalSupply: bigint;
  /** Who launched it. Not necessarily who owns the fee stream now. */
  readonly deployer: Address;
  readonly logo: string;
  readonly description: string;
  readonly socials: Socials;
  /** Block the token was launched in. */
  readonly launchBlock: bigint;
}

/**
 * A resolved token.
 *
 * Construct through `client.token(address)`, never directly — the constructor
 * takes already-verified values and does no checking of its own.
 */
export class Token {
  /** The fee stream for this token's pool. */
  readonly fees: FeeStream;
  /** Buying and selling against this token's pool. */
  readonly trade: Trader;

  constructor(
    private readonly ctx: ClientContext,
    /** The token contract. */
    readonly address: Address,
    /** The Uniswap v4 pool, as stored on the token at launch. */
    readonly poolId: Hex,
    /** The hook this token launched under. */
    readonly hook: Address,
    /** What the pool is quoted and paid out in. */
    readonly quote: Asset,
    /** The verified pool key. Safe to hand to a router. */
    readonly poolKey: PoolKey,
    /** This token as an {@link Asset}, so its balances format correctly too. */
    readonly asset: Asset,
  ) {
    this.fees = new FeeStream(ctx, poolId, hook);
    this.trade = new Trader(ctx, poolKey, quote, asset);
  }

  /**
   * Resolves a token address into a {@link Token}.
   *
   * Reads `poolId()` and `hook()` off the token, then rebuilds the pool key
   * and checks it hashes back to that same id. If it does not, something about
   * the pool is not what this package assumes and it says so rather than
   * handing back a key that would route a swap somewhere unintended.
   *
   * @throws {InvalidArgumentError} If the address is not a letscash token, or
   *         its hook is not one this package recognises.
   * @throws {PoolKeyMismatchError} If the rebuilt key does not match.
   */
  static async resolve(ctx: ClientContext, address: Address): Promise<Token> {
    let poolId: Hex;
    let hook: Address;
    try {
      [poolId, hook] = await Promise.all([
        ctx.publicClient.readContract({ address, abi: tokenAbi, functionName: "poolId" }),
        ctx.publicClient.readContract({ address, abi: tokenAbi, functionName: "hook" }),
      ]);
    } catch (cause) {
      throw new InvalidArgumentError(
        `${address} does not look like a letscash token — it has no poolId() or ` +
          `hook(). If it is a plain ERC-20, it did not come from this launchpad.`,
        { cause },
      );
    }

    // A hook decides which pool a key points at, so an unrecognised one is
    // refused rather than trusted. Failing loudly here beats signing a swap
    // routed through a pool somebody else controls.
    if (!isKnownHook(ctx.chainId, hook)) {
      throw new InvalidArgumentError(
        `Token ${address} uses hook ${hook}, which this version of the SDK does ` +
          `not recognise. Upgrade the package — a new hook deployment needs a ` +
          `release before its tokens can be traded through here.`,
      );
    }

    // The quote is not stored on the token, so it comes from the hook's record
    // of the pool. That record is keyed by the pool id the token itself gave
    // us, so there is no assumption to get wrong.
    const [, , , exists, quoteAddress] = await ctx.publicClient.readContract({
      address: hook,
      abi: hookAbi,
      functionName: "poolConfigs",
      args: [poolId],
    });
    if (!exists) {
      throw new InvalidArgumentError(
        `Hook ${hook} has no record of pool ${poolId}, which the token claims as ` +
          `its own. The token and hook disagree; do not trade against this pool.`,
      );
    }

    const quote = await ctx.resolveAsset(quoteAddress);
    const poolKey = buildPoolKey({ token: address, hook, quote: quote.address });
    assertPoolKey(poolKey, poolId);

    // Read rather than assume 18. Every token this factory mints is 18, but
    // this object also formats balances, and an assumed scale is the exact
    // mistake `Amount` exists to prevent.
    const [symbol, decimals] = await Promise.all([
      ctx.publicClient.readContract({ address, abi: erc20Abi, functionName: "symbol" }),
      ctx.publicClient.readContract({ address, abi: erc20Abi, functionName: "decimals" }),
    ]);

    return new Token(ctx, address, poolId, hook, quote, poolKey, { address, symbol, decimals });
  }

  /**
   * Name, symbol, supply, links and launch block.
   *
   * Written out call by call rather than through a loop: viem infers each
   * return type from the ABI's function name, and a `functionName: string`
   * helper throws that away and lands everything back on `unknown`.
   */
  async metadata(): Promise<TokenMetadata> {
    const at = { address: this.address, abi: tokenAbi } as const;
    const [name, symbol, decimals, totalSupply, deployer, launchBlock, info] = await Promise.all([
      this.ctx.publicClient.readContract({ ...at, functionName: "name" }),
      this.ctx.publicClient.readContract({ ...at, functionName: "symbol" }),
      this.ctx.publicClient.readContract({ ...at, functionName: "decimals" }),
      this.ctx.publicClient.readContract({ ...at, functionName: "totalSupply" }),
      this.ctx.publicClient.readContract({ ...at, functionName: "deployer" }),
      this.ctx.publicClient.readContract({ ...at, functionName: "launchBlock" }),
      this.ctx.publicClient.readContract({ ...at, functionName: "getTokenInfo" }),
    ]);

    const [, logo, description, socials] = info;
    return { name, symbol, decimals, totalSupply, deployer, logo, description, socials, launchBlock };
  }

  /** An address's token balance, denominated so it formats correctly. */
  async balanceOf(owner: Address): Promise<Amount> {
    const raw = await this.ctx.publicClient.readContract({
      address: this.address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [owner],
    });
    return Amount.raw(raw, this.asset);
  }

  /** Zero, denominated in this pool's quote — handy for comparisons. */
  zeroQuote(): Amount {
    return Amount.zero(this.quote);
  }

  /**
   * The splitter contract for this pool, if the fee stream was split at launch.
   *
   * Returns `null` when the stream points at a single address, which includes
   * a launch that named exactly one recipient — that case deploys no splitter
   * at all, it just names the address directly.
   */
  async splitterAddress(): Promise<Address | null> {
    const address = await this.ctx.publicClient.readContract({
      address: this.ctx.addresses.factory,
      abi: factoryAbi,
      functionName: "launchSplitterOf",
      args: [this.poolId],
    });
    return /^0x0{40}$/i.test(address) ? null : address;
  }

  /**
   * This pool's fee splitter, bound and ready to use.
   *
   * `null` when the stream is not split. Already knows the quote, so amounts
   * come back correctly denominated.
   */
  async splitter(): Promise<LaunchSplitter | null> {
    const address = await this.splitterAddress();
    return address ? new LaunchSplitter(this.ctx, address, this.quote) : null;
  }

  /**
   * Whether this pool's fees are routed into the self-burner.
   *
   * True for a token launched under a self-burn config: the creator's share
   * buys the token and burns it, and there are no creator earnings to claim.
   * `fees.claim()` on such a pool pays nothing.
   */
  async isSelfBurn(): Promise<boolean> {
    // Found by hook rather than assumed to be set zero. That assumption is
    // correct only while one module set exists, and would silently report
    // false for every token launched under a later one — a self-burn coin
    // then looks like an ordinary one whose fees nobody is claiming.
    const burner = await this.selfBurnerAddress();
    const creator = await this.fees.creator();
    return creator.toLowerCase() === burner.toLowerCase();
  }

  /**
   * The self-burner belonging to this token's module set.
   *
   * Goes through the client's cache rather than walking the sets again. An
   * indexer calling `isSelfBurn()` across a list of tokens would otherwise pay
   * `1 + n` round trips per token for state that is written once and never
   * moves.
   */
  async selfBurnerAddress(): Promise<Address> {
    return (await this.ctx.moduleSetForHook(this.hook)).selfBurner;
  }
}
