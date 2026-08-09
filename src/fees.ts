/**
 * The fee stream.
 *
 * Everything a pool owes, who it is owed to, and how to move it. This is where
 * most integrators spend their time — a coin whose fees do something needs to
 * read a balance, claim it, and occasionally hand the whole stream elsewhere.
 *
 * Three things about this surface routinely surprise people:
 *
 *  - **`claim` sweeps for you.** There is no sweep-then-claim dance. One call
 *    settles the accounting and pays out.
 *  - **`tab` alone under-reports.** Fees sit in Uniswap's pool manager until
 *    swept, so a bot polling only `tab` sees zero while real money accrues.
 *  - **`tab` and the contract's `pending` are on different sides of the
 *    creator/platform split**, so adding them together overstates what you are
 *    owed — by 30% on a 1% pool. `tab` is already your share; `pending` is the
 *    whole fee. {@link FeeStream.claimable} does the arithmetic correctly and
 *    is what a bot should threshold against.
 */

import { decodeEventLog } from "viem";
import type { Address, Hex, Log, TransactionReceipt } from "viem";

import { hookAbi } from "./abis/hook.js";
import { type Asset, Amount } from "./amount.js";
import {
  type ClientContext,
  type TxResult,
  type WriteOptions,
  executeWrite,
} from "./client.js";
import { InvalidArgumentError } from "./errors.js";

/** A pool's fee settings, as the hook holds them. */
export interface PoolFeeConfig {
  /** Who currently owns the stream. Not necessarily whoever launched the token. */
  readonly creator: Address;
  /** The creator's share of the fee, in basis points. */
  readonly creatorFeeBps: number;
  /** The total fee, in hundredths of a basis point. 10000 is 1%. */
  readonly feeRate: number;
  /** The total fee as a percentage. */
  readonly feePercent: number;
  /** What the pool pays out in. */
  readonly quote: Asset;
}

/** A claim, with the amount taken from the emitted event rather than a simulation. */
export interface ClaimResult extends TxResult<bigint> {
  /** What actually moved, decoded from `CreatorFeesClaimed`. */
  readonly amount: Amount;
}

/** A sweep, split the way the hook books it. */
export interface SweepResult extends TxResult<readonly [bigint, bigint]> {
  /** Booked to the creator. */
  readonly creatorAmount: Amount;
  /** Booked to the platform. */
  readonly platformAmount: Amount;
}

/**
 * Pulls the first matching event out of a receipt.
 *
 * Returns `undefined` rather than throwing: a claim of zero emits nothing, and
 * that is a legitimate outcome rather than a failure.
 */
function findEvent<T extends Record<string, unknown>>(
  receipt: TransactionReceipt,
  hook: Address,
  eventName: string,
): T | undefined {
  const fromHook = receipt.logs.filter(
    (log: Log) => log.address.toLowerCase() === hook.toLowerCase(),
  );
  for (const log of fromHook) {
    try {
      const decoded = decodeEventLog({ abi: hookAbi, data: log.data, topics: log.topics });
      if (decoded.eventName === eventName) return decoded.args as unknown as T;
    } catch {
      // Not an event from this ABI. Hooks emit several, and a receipt carries
      // logs from the pool manager and the token too.
    }
  }
  return undefined;
}

/**
 * A bound fee stream for one pool.
 *
 * Get one from `client.token(address).fees` rather than constructing it, so
 * the pool id comes off the token itself and cannot be derived wrong.
 */
export class FeeStream {
  #config: PoolFeeConfig | undefined;

  constructor(
    private readonly ctx: ClientContext,
    /** The pool this stream belongs to. */
    readonly poolId: Hex,
    /** The hook holding the accounting. */
    readonly hook: Address,
  ) {}

  /**
   * The pool's fee settings, including who owns the stream right now.
   *
   * Cached after the first read except for `creator`, which can change at any
   * time — use {@link creator} for that rather than reading it from here.
   *
   * @throws {InvalidArgumentError} If the hook has no record of this pool,
   *         which nearly always means the pool id is wrong.
   */
  async config(): Promise<PoolFeeConfig> {
    if (this.#config) return this.#config;

    const [creator, creatorFeeBps, feeRate, exists, quoteAddress] =
      await this.ctx.publicClient.readContract({
        address: this.hook,
        abi: hookAbi,
        functionName: "poolConfigs",
        args: [this.poolId],
      });

    if (!exists) {
      throw new InvalidArgumentError(
        `Hook ${this.hook} has no record of pool ${this.poolId}. ` +
          `Usually the pool id was derived from the wrong quote, tick spacing or ` +
          `hook — read poolId() off the token instead of deriving it.`,
      );
    }

    const quote = await this.ctx.resolveAsset(quoteAddress);
    this.#config = {
      creator,
      creatorFeeBps,
      feeRate,
      feePercent: (feeRate / 1_000_000) * 100,
      quote,
    };
    return this.#config;
  }

  /** What the pool pays out in. */
  async quote(): Promise<Asset> {
    return (await this.config()).quote;
  }

  /**
   * Who currently owns the stream.
   *
   * Read fresh every time. `updateCreator` is irreversible and takes effect
   * immediately, so a cached value here would be a way to claim into an
   * address that no longer controls anything.
   */
  async creator(): Promise<Address> {
    const [creator] = await this.ctx.publicClient.readContract({
      address: this.hook,
      abi: hookAbi,
      functionName: "poolConfigs",
      args: [this.poolId],
    });
    return creator;
  }

  /** Fees already swept and waiting. Not the full claimable total. */
  async tab(): Promise<Amount> {
    const [raw, quote] = await Promise.all([
      this.ctx.publicClient.readContract({
        address: this.hook,
        abi: hookAbi,
        functionName: "tab",
        args: [this.poolId],
      }),
      this.quote(),
    ]);
    return Amount.raw(raw, quote);
  }

  /**
   * Unswept fees sitting in the pool manager — **the gross fee, before the
   * creator/platform split.**
   *
   * This is the raw number the contract holds, and it is not what you are
   * owed. The split happens during the sweep: on a 1% pool the creator's share
   * is 70% of this, and adding it to `tab` as if both were yours overstates
   * the claimable balance by the platform's cut.
   *
   * Use {@link claimable} unless you specifically want the gross figure.
   */
  async pendingGross(): Promise<Amount> {
    const [raw, quote] = await Promise.all([
      this.ctx.publicClient.readContract({
        address: this.hook,
        abi: hookAbi,
        functionName: "pending",
        args: [this.poolId],
      }),
      this.quote(),
    ]);
    return Amount.raw(raw, quote);
  }

  /** The creator's share of what is unswept — `pendingGross` after the split. */
  async pending(): Promise<Amount> {
    const [gross, config] = await Promise.all([this.pendingGross(), this.config()]);
    return gross.percentBps(config.creatorFeeBps);
  }

  /**
   * Everything a claim would actually pay you.
   *
   * `tab` is already the creator's share, banked. `pendingGross` is not — it
   * is the whole fee, and only `creatorFeeBps` of it becomes yours when it is
   * swept. So this is `tab + pendingGross × creatorFeeBps / 10000`, not the
   * two added together.
   *
   * This is the number to threshold a bot against. Polling `tab` alone reads
   * zero while fees accrue, because they sit unswept until something touches
   * the pool.
   *
   * Exact for an ether pool. For an ERC-20 quote the sweep books what actually
   * arrived rather than what was redeemed, so a token that taxed transfers
   * would pay marginally less than this predicts. No approved quote does today.
   */
  async claimable(): Promise<Amount> {
    const [tab, pending] = await Promise.all([this.tab(), this.pending()]);
    return tab.plus(pending);
  }

  /**
   * Claims everything owed, to the caller.
   *
   * Sweeps internally, so this is the only call needed. Callable only by the
   * current creator.
   *
   * @throws {ContractRevertError} `NotCreator` if the stream is not yours.
   */
  async claim(options?: WriteOptions): Promise<ClaimResult> {
    return this.#claimVia("claim", [this.poolId], options);
  }

  /**
   * Claims everything owed, to an address you name.
   *
   * Still callable only by the creator — this chooses the destination, not who
   * may move the money. Use it when your contract can call but cannot receive:
   * a contract with no payable `receive()` cannot be paid ether directly.
   */
  async claimTo(to: Address, options?: WriteOptions): Promise<ClaimResult> {
    return this.#claimVia("claim", [this.poolId, to], options);
  }

  /**
   * Claims part of what is owed.
   *
   * Exists so a balance can be drawn down in pieces if a quote token ever
   * refuses a transfer above some size. Reverts `AmountNotOwed` if `amount`
   * exceeds the balance — check {@link claimable} first.
   */
  async claimAmount(to: Address, amount: Amount | bigint, options?: WriteOptions): Promise<ClaimResult> {
    const raw = amount instanceof Amount ? amount.raw : amount;
    return this.#claimVia("claim", [this.poolId, to, raw], options);
  }

  async #claimVia(
    functionName: "claim",
    args: readonly unknown[],
    options: WriteOptions | undefined,
  ): Promise<ClaimResult> {
    const quote = await this.quote();
    const tx = await executeWrite<bigint>(this.ctx, "claim", options, () => ({
      address: this.hook,
      abi: hookAbi,
      functionName,
      args,
    }));

    // The event is authoritative. The simulated return was computed against
    // state before the transaction landed; if a swap settled in between, more
    // fees accrued and the real payout is larger than the simulation said.
    const event = findEvent<{ amount: bigint }>(tx.receipt, this.hook, "CreatorFeesClaimed");
    return { ...tx, amount: Amount.raw(event?.amount ?? tx.result, quote) };
  }

  /**
   * Moves accrued fees out of the pool manager and books them.
   *
   * Permissionless — anyone may call it, and it pays no bounty. Unnecessary
   * before claiming, since `claim` sweeps for you. Useful only when you want
   * the accounting settled without taking the money.
   */
  async sweep(options?: WriteOptions): Promise<SweepResult> {
    const quote = await this.quote();
    const tx = await executeWrite<readonly [bigint, bigint]>(this.ctx, "sweep", options, () => ({
      address: this.hook,
      abi: hookAbi,
      functionName: "sweep",
      args: [this.poolId],
    }));

    const event = findEvent<{ creatorAmount: bigint; platformAmount: bigint }>(
      tx.receipt,
      this.hook,
      "FeesSwept",
    );
    return {
      ...tx,
      creatorAmount: Amount.raw(event?.creatorAmount ?? tx.result[0], quote),
      platformAmount: Amount.raw(event?.platformAmount ?? tx.result[1], quote),
    };
  }

  /**
   * Calls back whenever this pool accrues a fee.
   *
   * Event-driven beats polling for a bot that wants to react promptly: fees
   * accrue on every swap, and a one-minute poll can sit idle through a burst.
   *
   * The amount reported is the **gross** fee, matching the contract's event.
   * Your share of it is `amount × creatorFeeBps / 10000` — or just call
   * {@link claimable}, which does that arithmetic.
   *
   * @returns An unsubscribe function.
   */
  onFeeAccrued(callback: (fee: Amount) => void): () => void {
    return this.ctx.publicClient.watchContractEvent({
      address: this.hook,
      abi: hookAbi,
      eventName: "FeeAccrued",
      args: { poolId: this.poolId },
      onLogs: (logs) => {
        for (const log of logs) {
          const amount = (log.args as { amount?: bigint }).amount;
          if (amount === undefined) continue;
          // The quote is resolved lazily and cached, so this is a no-op read
          // after the first event.
          void this.quote().then((asset) => callback(Amount.raw(amount, asset)));
        }
      },
    });
  }

  /**
   * Calls back whenever this pool's fees are claimed, by anyone.
   *
   * Useful for a watcher that is not the claimant — an accounting service, or
   * a dashboard.
   *
   * @returns An unsubscribe function.
   */
  onClaimed(callback: (event: { recipient: Address; amount: Amount }) => void): () => void {
    return this.ctx.publicClient.watchContractEvent({
      address: this.hook,
      abi: hookAbi,
      eventName: "CreatorFeesClaimed",
      args: { poolId: this.poolId },
      onLogs: (logs) => {
        for (const log of logs) {
          const args = log.args as { recipient?: Address; amount?: bigint };
          if (!args.recipient || args.amount === undefined) continue;
          void this.quote().then((asset) =>
            callback({ recipient: args.recipient!, amount: Amount.raw(args.amount!, asset) }),
          );
        }
      },
    });
  }

  /**
   * Hands the entire fee stream to another address. **Irreversible.**
   *
   * Takes effect immediately, and carries the unclaimed balance with it — from
   * then on only `newCreator` can move any of it, including fees that accrued
   * while you held it. There is no call that reverses this and no owner
   * override.
   *
   * Claim first if you want to keep what has built up:
   *
   * ```ts
   * await stream.claim();
   * await stream.transferTo(newOwner);
   * ```
   *
   * @throws {ContractRevertError} `NotCreator` if the stream is not yours.
   */
  async transferTo(newCreator: Address, options?: WriteOptions): Promise<TxResult<void>> {
    if (/^0x0{40}$/i.test(newCreator)) {
      throw new InvalidArgumentError(
        "Refusing to transfer the fee stream to the zero address. This is " +
          "irreversible and would strand every future fee the pool earns.",
      );
    }
    const result = await executeWrite<void>(this.ctx, "updateCreator", options, () => ({
      address: this.hook,
      abi: hookAbi,
      functionName: "updateCreator",
      args: [this.poolId, newCreator],
    }));
    // The cached config holds a now-stale creator.
    this.#config = undefined;
    return result;
  }
}
