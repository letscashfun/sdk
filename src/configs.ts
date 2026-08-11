/**
 * The launch menu.
 *
 * Every launch picks one row. Rows are immutable once published and are added
 * over time, so **read the menu rather than hardcoding an id** — a hardcoded id
 * goes stale the moment a new set of rows ships, and ids are also enabled and
 * disabled without any redeployment.
 */

import type { Address } from "viem";

import type { Asset } from "./amount.js";

/**
 * Fee rates are in hundredths of a basis point, Uniswap-style.
 *
 * 1e6 is 100%, so a 1% fee is 10000. Reading `feeRate` as basis points gives
 * an answer a hundred times too large.
 */
export const PIPS_PER_100_PERCENT = 1_000_000;

/** Basis points denominator: 10000 bps is 100%. */
export const BPS_DENOMINATOR = 10_000;

/** One row of the launch menu, with the raw fields resolved into usable ones. */
export interface LaunchConfig {
  /** The id to pass to `launch`. */
  readonly id: number;
  /** Which module set (hook, token master, burner, splitter) this builds from. */
  readonly moduleSetId: bigint;
  /** What the pool trades against, resolved to a full asset. */
  readonly quote: Asset;
  /** Total token supply, in the token's smallest unit (18 decimals). */
  readonly supply: bigint;
  /** Tick granularity of the pool. */
  readonly tickSpacing: number;
  /** Opening price tick. Together with supply this sets the starting FDV. */
  readonly startTick: number;
  /** The creator's share of the fee, in basis points. */
  readonly creatorFeeBps: number;
  /** The total fee, in hundredths of a basis point. */
  readonly feeRate: number;
  /** Whether this row can currently be launched under. */
  readonly enabled: boolean;
  /**
   * Self-burn mode.
   *
   * The creator's share is routed to the burner, which buys the launched token
   * and burns it. There are no creator earnings at all in this mode — naming a
   * fee recipient alongside it makes no sense.
   */
  readonly selfBurn: boolean;

  // ——— derived, because the raw numbers are easy to misread ———

  /** The total fee as a percentage, e.g. `1` for a 1% pool. */
  readonly feePercent: number;
  /** The creator's cut of trade volume as a percentage, e.g. `0.7` on a 1% pool. */
  readonly creatorPercentOfVolume: number;
  /** The platform's cut of trade volume as a percentage. A flat 0.3 on every row. */
  readonly platformPercentOfVolume: number;
  /** Supply in whole tokens, e.g. `1_000_000_000`. */
  readonly supplyTokens: number;
}

/** The raw tuple `getLaunchConfig` returns. */
export interface RawLaunchConfig {
  moduleSetId: bigint;
  quote: Address;
  supply: bigint;
  tickSpacing: number;
  startTick: number;
  creatorFeeBps: number;
  feeRate: number;
  enabled: boolean;
  selfBurn: boolean;
  exists: boolean;
}

/**
 * Fills in the derived fields on a raw config.
 *
 * Kept pure and separate from reading so it can be unit-tested without a node,
 * and so a caller who already has the raw tuple can use it.
 */
export function deriveConfig(id: number, raw: RawLaunchConfig, quote: Asset): LaunchConfig {
  // Each of these is ONE division of an exact integer, never a chain of
  // multiplications through a non-representable fraction.
  //
  // The obvious spelling — `feePercent * (creatorFeeBps / 10000)` — routes
  // through values like 0.94, which binary floating point cannot hold, and
  // hands back 4.699999999999999 for the 5% tier and 0.30000000000000004 for
  // the platform's cut. Both then get rendered straight into a UI.
  //
  // Scaling the numerator up first keeps every intermediate an integer:
  // 50000 × 9400 = 470,000,000, over 1e8, is exactly 4.7.
  const PERCENT_SCALE = PIPS_PER_100_PERCENT / 100; // 10_000 pips per percent
  const feePercent = raw.feeRate / PERCENT_SCALE;
  const platformFeeBps = BPS_DENOMINATOR - raw.creatorFeeBps;
  return {
    id,
    moduleSetId: raw.moduleSetId,
    quote,
    supply: raw.supply,
    tickSpacing: raw.tickSpacing,
    startTick: raw.startTick,
    creatorFeeBps: raw.creatorFeeBps,
    feeRate: raw.feeRate,
    enabled: raw.enabled,
    selfBurn: raw.selfBurn,
    feePercent,
    creatorPercentOfVolume: (raw.feeRate * raw.creatorFeeBps) / (PERCENT_SCALE * BPS_DENOMINATOR),
    platformPercentOfVolume: (raw.feeRate * platformFeeBps) / (PERCENT_SCALE * BPS_DENOMINATOR),
    // Supply is always an 18-decimal token, and always a round number of whole
    // tokens, so this division is exact rather than lossy.
    supplyTokens: Number(raw.supply / 10n ** 18n),
  };
}

/** Filters for narrowing the menu without hand-writing predicates. */
export interface ConfigFilter {
  /**
   * Only rows that can currently be launched. Defaults to true.
   *
   * There is no value here meaning "either" — `undefined` is indistinguishable
   * from omitting the key, so it still means enabled-only. Use
   * `client.getAllConfigs()` for the full published set.
   */
  enabled?: boolean;
  /** Only rows quoted in this asset. Accepts an address or a symbol. */
  quote?: Address | string;
  /** Only self-burn rows, or only ordinary ones. */
  selfBurn?: boolean;
  /** Only rows whose total fee matches, as a percentage. */
  feePercent?: number;
  /**
   * Only rows minting this many whole tokens, e.g. `1_000_000_000`.
   *
   * Name it whenever more than one supply is published for the same quote and
   * fee tier, because the rest of this filter cannot tell those rows apart. A
   * filter that matches two rows is not an error — `getConfigs` returns both,
   * in ascending id order — but taking `[0]` from it silently picks whichever
   * was published first. Use {@link LetscashClient.selectConfig} to be told
   * about the ambiguity instead of quietly resolving it.
   */
  supplyTokens?: number;
}

/** Applies a {@link ConfigFilter}. Exported so callers can reuse the semantics. */
export function matchesFilter(config: LaunchConfig, filter: ConfigFilter): boolean {
  if ((filter.enabled ?? true) !== config.enabled) return false;
  if (filter.selfBurn !== undefined && filter.selfBurn !== config.selfBurn) return false;
  if (filter.feePercent !== undefined && filter.feePercent !== config.feePercent) return false;
  // Exact equality is safe: supplyTokens is a whole number of tokens derived by
  // integer division, not a float like the percentage fields.
  if (filter.supplyTokens !== undefined && filter.supplyTokens !== config.supplyTokens) {
    return false;
  }
  if (filter.quote !== undefined) {
    const wanted = filter.quote.toLowerCase();
    const matches =
      config.quote.address.toLowerCase() === wanted || config.quote.symbol.toLowerCase() === wanted;
    if (!matches) return false;
  }
  return true;
}
