/**
 * Amounts that carry their own denomination.
 *
 * Every pool on the launchpad is quoted in either ether (18 decimals) or USDG
 * (6), and a fee stream pays out in whichever its pool uses. A bare `bigint`
 * cannot tell you which, so the classic bug is reading a USDG balance and
 * formatting it as wei — off by a factor of a trillion, and it renders as a
 * plausible number rather than an error. That exact bug is live in letscash's
 * own backend today, which is the best argument there is for this type.
 *
 * `Amount` makes the mistake unrepresentable: arithmetic across two different
 * assets throws, and formatting always uses the right scale.
 */

import { formatUnits, parseUnits } from "viem";
import type { Address } from "viem";

import { NATIVE_CURRENCY, isNativeCurrency } from "./chain.js";

/** A currency, with everything needed to scale and label it. */
export interface Asset {
  /** Contract address. Zero for native ether. */
  readonly address: Address;
  /** Display symbol, e.g. "ETH" or "USDG". */
  readonly symbol: string;
  /** Decimal places. 18 for ether, 6 for USDG. */
  readonly decimals: number;
}

/** Native ether. */
export const ETHER: Asset = {
  address: NATIVE_CURRENCY,
  symbol: "ETH",
  decimals: 18,
} as const;

/** USDG on Robinhood Chain. Six decimals, not eighteen. */
export const USDG: Asset = {
  address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
  symbol: "USDG",
  decimals: 6,
} as const;

/** The quote assets the launchpad supports today, by address (lowercased). */
const KNOWN_ASSETS: ReadonlyMap<string, Asset> = new Map([
  [ETHER.address.toLowerCase(), ETHER],
  [USDG.address.toLowerCase(), USDG],
]);

/**
 * Looks up a known quote asset by address.
 *
 * Returns `undefined` for anything unrecognised rather than guessing 18
 * decimals — guessing is how the bug this module prevents gets reintroduced.
 * For an unknown asset, read `decimals()` off the contract and build the
 * `Asset` yourself.
 */
export function knownAsset(address: Address): Asset | undefined {
  return KNOWN_ASSETS.get(address.toLowerCase());
}

/** Raised when two amounts in different assets are combined or compared. */
export class AssetMismatchError extends Error {
  override readonly name = "AssetMismatchError";
  constructor(
    readonly left: Asset,
    readonly right: Asset,
  ) {
    super(
      `Cannot combine ${left.symbol} (${left.decimals} decimals) with ` +
        `${right.symbol} (${right.decimals} decimals). These are different ` +
        `assets on different scales; convert explicitly if that is what you meant.`,
    );
  }
}

/**
 * A quantity of a specific asset.
 *
 * Immutable. Every operation returns a new `Amount`.
 *
 * @example
 * ```ts
 * const fee = Amount.parse("1.5", USDG);
 * fee.raw;          // 1500000n  — six decimals, not eighteen
 * fee.toString();   // "1.5 USDG"
 * fee.plus(Amount.parse("0.5", ETHER)); // throws AssetMismatchError
 * ```
 */
export class Amount {
  private constructor(
    /** The on-chain integer value, in the asset's smallest unit. */
    readonly raw: bigint,
    /** What this is denominated in. */
    readonly asset: Asset,
  ) {}

  /** Wraps a raw on-chain value. */
  static raw(value: bigint, asset: Asset): Amount {
    return new Amount(value, asset);
  }

  /**
   * Parses a human decimal string.
   *
   * @example `Amount.parse("0.05", ETHER)` → 50000000000000000n
   * @throws If `value` is not a valid decimal number.
   */
  static parse(value: string | number, asset: Asset): Amount {
    return new Amount(parseUnits(String(value), asset.decimals), asset);
  }

  /** Zero, in a given asset. */
  static zero(asset: Asset): Amount {
    return new Amount(0n, asset);
  }

  /** True when the value is exactly zero. */
  get isZero(): boolean {
    return this.raw === 0n;
  }

  /** True when this is native ether rather than an ERC-20. */
  get isNative(): boolean {
    return isNativeCurrency(this.asset.address);
  }

  /** The value as a decimal string, unrounded and without a symbol. */
  get decimal(): string {
    return formatUnits(this.raw, this.asset.decimals);
  }

  /**
   * A human-readable string.
   *
   * @param options.maxDecimals Trailing digits to keep. Truncates rather than
   *        rounds, so a displayed balance is never more than the real one.
   * @param options.symbol Whether to append the asset symbol. Default true.
   *
   * @example
   * ```ts
   * Amount.parse("1000.25", USDG).format({ maxDecimals: 1 }); // "1000.2 USDG"
   * Amount.parse("1000.25", USDG).format({ maxDecimals: 0 }); // "1000 USDG"
   * Amount.parse("0.5", ETHER).format({ maxDecimals: 0 });    // "0 ETH"
   * ```
   */
  format(options?: { maxDecimals?: number; symbol?: boolean }): string {
    const withSymbol = options?.symbol ?? true;
    let text = this.decimal;

    const max = options?.maxDecimals;
    if (max !== undefined) {
      const dot = text.indexOf(".");
      if (dot !== -1) {
        // Split first, and only ever touch the fraction. Trimming trailing
        // zeros off the whole string turns 1000.25 into "1" and 0.5 into ""
        // — the integer's own zeros get eaten once the decimal point has
        // been truncated away.
        const whole = text.slice(0, dot);
        const fraction = text.slice(dot + 1, dot + 1 + max).replace(/0+$/, "");
        text = fraction === "" ? whole : `${whole}.${fraction}`;
      }
    }
    // "-0.4" truncated to zero decimals leaves "-0", which reads as a bug.
    if (text === "-0") text = "0";
    return withSymbol ? `${text} ${this.asset.symbol}` : text;
  }

  /** @throws {AssetMismatchError} If the other amount is a different asset. */
  private sameAsset(other: Amount): void {
    if (this.asset.address.toLowerCase() !== other.asset.address.toLowerCase()) {
      throw new AssetMismatchError(this.asset, other.asset);
    }
  }

  /** @throws {AssetMismatchError} */
  plus(other: Amount): Amount {
    this.sameAsset(other);
    return new Amount(this.raw + other.raw, this.asset);
  }

  /** @throws {AssetMismatchError} */
  minus(other: Amount): Amount {
    this.sameAsset(other);
    return new Amount(this.raw - other.raw, this.asset);
  }

  /**
   * Scales by a basis-point fraction, rounding down.
   *
   * Rounds down deliberately: this is used to compute slippage floors and fee
   * shares, and rounding up either way would ask for more than a contract
   * would ever give.
   */
  percentBps(bps: number | bigint): Amount {
    return new Amount((this.raw * BigInt(bps)) / 10_000n, this.asset);
  }

  /** @throws {AssetMismatchError} */
  eq(other: Amount): boolean {
    this.sameAsset(other);
    return this.raw === other.raw;
  }

  /** @throws {AssetMismatchError} */
  gt(other: Amount): boolean {
    this.sameAsset(other);
    return this.raw > other.raw;
  }

  /** @throws {AssetMismatchError} */
  gte(other: Amount): boolean {
    this.sameAsset(other);
    return this.raw >= other.raw;
  }

  /** @throws {AssetMismatchError} */
  lt(other: Amount): boolean {
    this.sameAsset(other);
    return this.raw < other.raw;
  }

  /** @throws {AssetMismatchError} */
  lte(other: Amount): boolean {
    this.sameAsset(other);
    return this.raw <= other.raw;
  }

  /** `"1.5 USDG"`. */
  toString(): string {
    return this.format();
  }

  /**
   * JSON form.
   *
   * `raw` is a string because `JSON.stringify` cannot serialise a bigint, and
   * a silently-lost precision here would be the same class of bug this module
   * exists to prevent.
   */
  toJSON(): { raw: string; decimal: string; symbol: string; decimals: number } {
    return {
      raw: this.raw.toString(),
      decimal: this.decimal,
      symbol: this.asset.symbol,
      decimals: this.asset.decimals,
    };
  }
}
