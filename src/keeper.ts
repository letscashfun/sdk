/**
 * The permissionless lane.
 *
 * Three calls anyone may make, kept together because they are what a keeper
 * bot runs rather than what a creator does.
 *
 * Worth knowing before you build on these: **only the burn pays a bounty.**
 * `sweep` and `convert` pay nobody, which is a deliberate choice on the
 * protocol's side rather than an oversight — so nobody runs them out of
 * altruism, and you should only wire them up if your own position benefits.
 */

import { decodeEventLog } from "viem";
import type { Address, Hex, TransactionReceipt } from "viem";

import { revenueConverterAbi } from "./abis/revenueConverter.js";
import { selfBurnerAbi } from "./abis/selfBurner.js";
import { type Asset, Amount } from "./amount.js";
import {
  type ClientContext,
  type TxResult,
  type WriteOptions,
  executeWrite,
} from "./client.js";

/** The self-burner, from a keeper's side. */
export class SelfBurner {
  constructor(
    private readonly ctx: ClientContext,
    /** The burner contract. */
    readonly address: Address,
  ) {}

  /**
   * Fees accrued to this pool's burner and not yet spent buying the token.
   *
   * Denominated in the pool's quote, which is why the asset has to be passed
   * in — the burner serves pools of both kinds.
   */
  async unburned(poolId: Hex, quote: Asset): Promise<Amount> {
    const raw = await this.ctx.publicClient.readContract({
      address: this.address,
      abi: selfBurnerAbi,
      functionName: "unburned",
      args: [poolId],
    });
    return Amount.raw(raw, quote);
  }

  /** The bounty, in basis points of the amount burned. */
  async bountyBps(): Promise<number> {
    const raw = await this.ctx.publicClient.readContract({
      address: this.address,
      abi: selfBurnerAbi,
      functionName: "BOUNTY_BPS",
    });
    return Number(raw);
  }

  /**
   * Buys the launched token with its accrued fees and burns it.
   *
   * Permissionless, and pays the caller a bounty — so this one is genuinely
   * worth running as a bot, and the bounty is returned rather than discarded:
   * a keeper needs it to know whether the call cleared its own gas.
   *
   * Two failure modes are normal rather than exceptional and are worth
   * catching by name: `BurnedThisBlock` (one burn per block, wait for the
   * next) and `NothingToBurn` (nothing has accrued yet).
   *
   * @param quote The pool's quote asset, so the spend and bounty come back
   *        correctly denominated. Omit and they are returned raw.
   */
  async burn(poolId: Hex, quote?: Asset, options?: WriteOptions): Promise<BurnResult> {
    const tx = await executeWrite<void>(this.ctx, "burn", options, () => ({
      address: this.address,
      abi: selfBurnerAbi,
      functionName: "burn",
      args: [poolId],
    }));

    const event = findBurnEvent(tx.receipt, this.address);
    return {
      ...tx,
      ethSpent: quote && event ? Amount.raw(event.ethSpent, quote) : undefined,
      ethSpentRaw: event?.ethSpent ?? 0n,
      tokensBurned: event?.tokensBurned ?? 0n,
      bounty: quote && event ? Amount.raw(event.bounty, quote) : undefined,
      bountyRaw: event?.bounty ?? 0n,
    };
  }
}

/** What a burn actually did, decoded from the event rather than assumed. */
export interface BurnResult extends TxResult<void> {
  /** Quote spent buying the token, denominated when a quote was supplied. */
  readonly ethSpent: Amount | undefined;
  /** The same, raw. */
  readonly ethSpentRaw: bigint;
  /** Tokens bought and sent to the burn address. */
  readonly tokensBurned: bigint;
  /** Paid to the caller for triggering it. */
  readonly bounty: Amount | undefined;
  /** The same, raw. */
  readonly bountyRaw: bigint;
}

function findBurnEvent(
  receipt: TransactionReceipt,
  burner: Address,
): { ethSpent: bigint; tokensBurned: bigint; bounty: bigint } | undefined {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== burner.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({ abi: selfBurnerAbi, data: log.data, topics: log.topics });
      if (decoded.eventName === "Burned") {
        return decoded.args as unknown as {
          ethSpent: bigint;
          tokensBurned: bigint;
          bounty: bigint;
        };
      }
    } catch {
      // Another event from the same contract, or one not in this ABI.
    }
  }
  return undefined;
}

/** The platform's revenue converter. */
export class RevenueConverter {
  constructor(
    private readonly ctx: ClientContext,
    /** The converter contract. */
    readonly address: Address,
  ) {}

  /**
   * How much of a quote asset could be converted right now.
   *
   * Bounded by the route's per-call ceiling as well as the booked balance, so
   * a large backlog converts over several calls rather than one.
   */
  async convertibleNow(quote: Asset): Promise<Amount> {
    const raw = await this.ctx.publicClient.readContract({
      address: this.address,
      abi: revenueConverterAbi,
      functionName: "convertibleNow",
      args: [quote.address],
    });
    return Amount.raw(raw, quote);
  }

  /**
   * The price the next conversion is held to.
   *
   * `fair` is the reference price — the worse of spot and the TWAP. `floor` is
   * that minus the route's slippage band, and is what the fill must clear.
   *
   * Worth reading when a conversion reverts: the usual cause is that the sale
   * is too large for current depth to land inside the band, which shows up
   * here as a floor the pool cannot meet rather than as anything being broken.
   */
  async quoteFloor(quote: Asset): Promise<{ fair: bigint; floor: bigint }> {
    const [fair, floor] = await this.ctx.publicClient.readContract({
      address: this.address,
      abi: revenueConverterAbi,
      functionName: "quoteFloor",
      args: [quote.address],
    });
    return { fair, floor };
  }

  /**
   * Converts booked platform revenue in a quote asset into ether.
   *
   * Permissionless but pays no bounty. Priced against a TWAP with a slippage
   * band, so it refuses rather than fills at a bad price — a revert here often
   * means the band is too tight for current depth, not that anything is broken.
   *
   * @param minOut Floor on the output, in wei. Zero leaves the contract's own
   *        TWAP band as the only protection, which is usually what you want
   *        since it is stricter than anything you would set by hand.
   */
  async convert(quote: Asset, minOut = 0n, options?: WriteOptions): Promise<TxResult<bigint>> {
    return executeWrite<bigint>(this.ctx, "convert", options, () => ({
      address: this.address,
      abi: revenueConverterAbi,
      functionName: "convert",
      args: [quote.address, minOut],
    }));
  }
}
