/**
 * The per-launch fee splitter.
 *
 * Deployed as a clone when a launch names more than one fee recipient. A
 * single recipient deploys nothing at all — the stream just points at that
 * address — so `token.splitterAddress()` returning null is normal.
 *
 * The important property: **both writes belong to the recipient alone.**
 * Whoever launched the coin cannot redirect a share they promised away and
 * cannot claw one back. Shares are fixed at launch and changeable by nobody.
 */

import { decodeEventLog } from "viem";
import type { Address, Hex } from "viem";

import { launchSplitterAbi } from "./abis/launchSplitter.js";
import { type Asset, Amount } from "./amount.js";
import {
  type ClientContext,
  type TxResult,
  type WriteOptions,
  executeWrite,
  requireAccount,
} from "./client.js";
import { InvalidArgumentError } from "./errors.js";
import { FeeStream } from "./fees.js";

/** One slice of the stream. */
export interface SplitSlice {
  readonly address: Address;
  /** Share in basis points. All slices sum to 10000. */
  readonly shareBps: number;
  /** The same share as a percentage, for display. */
  readonly sharePercent: number;
}

/** What a distribution actually split, so a keeper can tell a no-op from work. */
export interface DistributeResult extends TxResult<void> {
  /** Allocated across the recipients by this call. Zero means nothing had arrived. */
  readonly distributed: Amount;
}

/** Where an address stands in a splitter. */
export interface SlotInfo {
  /**
   * Index into the recipient list.
   *
   * Meaningless when `isRecipient` is false — check the flag rather than the
   * index, because slot zero is a real slot and `0` is falsy.
   */
  readonly slot: number;
  readonly isRecipient: boolean;
}

/** A bound fee splitter. Get one from `client.splitter(address, quote)`. */
export class LaunchSplitter {
  constructor(
    private readonly ctx: ClientContext,
    /** The splitter clone. */
    readonly address: Address,
    /** What it pays out in — the pool's quote. */
    readonly quote: Asset,
  ) {}

  /**
   * What an address has been allocated and not yet withdrawn.
   *
   * Only counts revenue that has been through `distribute`. Money that has
   * arrived but not been distributed shows in {@link unallocated}, so a
   * recipient checking their balance should either call {@link distribute}
   * first or read {@link collectable}, which accounts for both.
   */
  async owed(who: Address): Promise<Amount> {
    const raw = await this.ctx.publicClient.readContract({
      address: this.address,
      abi: launchSplitterAbi,
      functionName: "owed",
      args: [who],
    });
    return Amount.raw(raw, this.quote);
  }

  /** Revenue that has arrived but not yet been split across recipients. */
  async unallocated(): Promise<Amount> {
    const raw = await this.ctx.publicClient.readContract({
      address: this.address,
      abi: launchSplitterAbi,
      functionName: "unallocated",
    });
    return Amount.raw(raw, this.quote);
  }

  /** The hook and pool this splitter draws from. */
  async source(): Promise<{ feeSource: Address; poolId: Hex }> {
    const [feeSource, poolId] = await Promise.all([
      this.ctx.publicClient.readContract({
        address: this.address,
        abi: launchSplitterAbi,
        functionName: "feeSource",
      }),
      this.ctx.publicClient.readContract({
        address: this.address,
        abi: launchSplitterAbi,
        functionName: "poolId",
      }),
    ]);
    return { feeSource, poolId };
  }

  /**
   * What an address would actually receive from a collect right now.
   *
   * Three layers have to be added up, and missing any of them under-reports:
   *
   *  1. `owed` — already allocated to them.
   *  2. Their share of {@link unallocated} — arrived at the splitter, not yet split.
   *  3. Their share of what the splitter can still claim from the hook.
   *
   * The third is the one that catches people out. `distribute` pulls from the
   * hook before allocating, so until it runs the splitter's own balance is
   * empty and the money is still sitting in the fee stream. A bot reading
   * `owed`, or even `owed + unallocated`, sees nothing while fees accrue.
   */
  async collectable(who: Address): Promise<Amount> {
    const [owed, unallocated, slices, { feeSource, poolId }] = await Promise.all([
      this.owed(who),
      this.unallocated(),
      this.split(),
      this.source(),
    ]);

    const slice = slices.find((s) => s.address.toLowerCase() === who.toLowerCase());
    if (!slice) return owed;

    const upstream = await new FeeStream(this.ctx, poolId, feeSource).claimable();
    return owed.plus(unallocated.plus(upstream).percentBps(slice.shareBps));
  }

  /** The full recipient list and their shares. */
  async split(): Promise<SplitSlice[]> {
    const [recipients, shares] = await this.ctx.publicClient.readContract({
      address: this.address,
      abi: launchSplitterAbi,
      functionName: "split",
    });
    return recipients.map((address, index) => {
      const shareBps = shares[index] ?? 0;
      return { address, shareBps, sharePercent: (shareBps / 10_000) * 100 };
    });
  }

  /** Which slot an address holds, if any. */
  async slotOf(who: Address): Promise<SlotInfo> {
    const [slot, isRecipient] = await this.ctx.publicClient.readContract({
      address: this.address,
      abi: launchSplitterAbi,
      functionName: "slotOf",
      args: [who],
    });
    return { slot: Number(slot), isRecipient };
  }

  /**
   * Splits everything that has arrived since the last call.
   *
   * Permissionless, and unnecessary in normal use — the collect functions
   * distribute first. Worth calling directly only to make {@link owed} read
   * true without moving any money.
   */
  async distribute(options?: WriteOptions): Promise<DistributeResult> {
    const tx = await executeWrite<void>(this.ctx, "distribute", options, () => ({
      address: this.address,
      abi: launchSplitterAbi,
      functionName: "distribute",
    }));

    // Returned rather than discarded: a caller running this on a timer needs
    // to know whether the call moved anything, and a zero here is the signal
    // to back off rather than keep paying gas for nothing.
    let distributed = 0n;
    for (const log of tx.receipt.logs) {
      if (log.address.toLowerCase() !== this.address.toLowerCase()) continue;
      try {
        const decoded = decodeEventLog({
          abi: launchSplitterAbi,
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName === "Distributed") {
          distributed = (decoded.args as unknown as { amount: bigint }).amount;
        }
      } catch {
        // Another event from this contract.
      }
    }
    return { ...tx, distributed: Amount.raw(distributed, this.quote) };
  }

  /** Pays the caller their allocated balance. */
  async collect(options?: WriteOptions): Promise<TxResult<bigint>> {
    return executeWrite<bigint>(this.ctx, "collect", options, () => ({
      address: this.address,
      abi: launchSplitterAbi,
      functionName: "collect",
      args: [],
    }));
  }

  /**
   * Pays the caller's balance to an address they name.
   *
   * Does not change who holds the slot — use {@link rotate} for that.
   */
  async collectTo(to: Address, options?: WriteOptions): Promise<TxResult<bigint>> {
    return executeWrite<bigint>(this.ctx, "collect", options, () => ({
      address: this.address,
      abi: launchSplitterAbi,
      functionName: "collect",
      args: [to],
    }));
  }

  /** Pays part of the caller's balance. */
  async collectAmount(
    to: Address,
    amount: Amount | bigint,
    options?: WriteOptions,
  ): Promise<TxResult<bigint>> {
    const raw = amount instanceof Amount ? amount.raw : amount;
    return executeWrite<bigint>(this.ctx, "collect", options, () => ({
      address: this.address,
      abi: launchSplitterAbi,
      functionName: "collect",
      args: [to, raw],
    }));
  }

  /**
   * Hands the caller's slot to another address. **Irreversible.**
   *
   * Moves the future percentage *and* the balance already allocated to it. The
   * destination must not already hold a slot in this splitter. Collect first
   * if you want to keep what has accrued.
   *
   * @throws {InvalidArgumentError} If the caller holds no slot, or the
   *         destination already does — both revert on chain, and finding out
   *         before the wallet prompt is cheaper.
   */
  async rotate(to: Address, options?: WriteOptions): Promise<TxResult<void>> {
    const account = requireAccount(this.ctx, "rotate", options?.account);
    const from = typeof account === "string" ? account : account.address;

    const [mine, theirs] = await Promise.all([this.slotOf(from), this.slotOf(to)]);
    if (!mine.isRecipient) {
      throw new InvalidArgumentError(
        `${from} holds no slot in splitter ${this.address}, so there is nothing to rotate.`,
      );
    }
    if (theirs.isRecipient) {
      throw new InvalidArgumentError(
        `${to} already holds slot ${theirs.slot} in this splitter. An address may hold ` +
          `only one, so rotating onto it would merge two slices — which the contract refuses.`,
      );
    }

    return executeWrite<void>(this.ctx, "rotate", options, () => ({
      address: this.address,
      abi: launchSplitterAbi,
      functionName: "rotate",
      args: [to],
    }));
  }
}
