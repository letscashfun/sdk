/**
 * Config derivation, with the real published tiers as fixtures.
 *
 * The reason these are exact-equality assertions rather than `toBeCloseTo`:
 * the derived percentages are rendered straight into UIs, and the original
 * arithmetic returned 0.30000000000000004 for the platform's cut and
 * 4.699999999999999 for the 5% tier's creator share. A tolerance-based
 * assertion passes on both, which is how it survived the first e2e pass.
 */

import { describe, expect, it } from "vitest";

import { ETHER, USDG } from "../src/amount.js";
import { deriveConfig, matchesFilter, type RawLaunchConfig } from "../src/configs.js";

/** The four fee tiers as published on mainnet. */
const TIERS = [
  { feeRate: 10_000, creatorFeeBps: 7000, feePercent: 1, creator: 0.7, platform: 0.3 },
  { feeRate: 30_000, creatorFeeBps: 9000, feePercent: 3, creator: 2.7, platform: 0.3 },
  { feeRate: 50_000, creatorFeeBps: 9400, feePercent: 5, creator: 4.7, platform: 0.3 },
  { feeRate: 100_000, creatorFeeBps: 9700, feePercent: 10, creator: 9.7, platform: 0.3 },
] as const;

function raw(overrides: Partial<RawLaunchConfig> = {}): RawLaunchConfig {
  return {
    moduleSetId: 0n,
    quote: ETHER.address,
    supply: 10n ** 27n,
    tickSpacing: 200,
    startTick: 204_200,
    creatorFeeBps: 7000,
    feeRate: 10_000,
    enabled: true,
    selfBurn: false,
    exists: true,
    ...overrides,
  };
}

describe("deriveConfig", () => {
  for (const tier of TIERS) {
    it(`${tier.feePercent}% tier derives exactly, with no floating-point residue`, () => {
      const config = deriveConfig(
        1000,
        raw({ feeRate: tier.feeRate, creatorFeeBps: tier.creatorFeeBps }),
        ETHER,
      );
      expect(config.feePercent).toBe(tier.feePercent);
      expect(config.creatorPercentOfVolume).toBe(tier.creator);
      expect(config.platformPercentOfVolume).toBe(tier.platform);
    });
  }

  it("takes a flat 0.3% for the platform on every tier", () => {
    // The creator shares 70/90/94/97 are solved to make this constant. If a
    // future row breaks it, that is a pricing change and should be loud.
    for (const tier of TIERS) {
      const config = deriveConfig(1000, raw(tier), ETHER);
      expect(config.platformPercentOfVolume).toBe(0.3);
    }
  });

  it("splits the fee without losing anything to rounding", () => {
    for (const tier of TIERS) {
      const config = deriveConfig(1000, raw(tier), ETHER);
      expect(config.creatorPercentOfVolume + config.platformPercentOfVolume).toBe(
        config.feePercent,
      );
    }
  });

  it("converts supply to whole tokens", () => {
    expect(deriveConfig(1000, raw(), ETHER).supplyTokens).toBe(1_000_000_000);
    expect(deriveConfig(1000, raw({ supply: 10n ** 28n }), ETHER).supplyTokens).toBe(
      10_000_000_000,
    );
  });

  it("carries the resolved quote through, decimals and all", () => {
    const config = deriveConfig(1008, raw({ quote: USDG.address }), USDG);
    expect(config.quote.symbol).toBe("USDG");
    expect(config.quote.decimals).toBe(6);
  });
});

describe("matchesFilter", () => {
  const ethStandard = deriveConfig(1000, raw(), ETHER);
  const ethBurn = deriveConfig(1001, raw({ selfBurn: true }), ETHER);
  const usdgFive = deriveConfig(
    1012,
    raw({ quote: USDG.address, feeRate: 50_000, creatorFeeBps: 9400 }),
    USDG,
  );
  const disabled = deriveConfig(1003, raw({ enabled: false }), ETHER);

  it("filters to enabled rows by default", () => {
    expect(matchesFilter(ethStandard, {})).toBe(true);
    expect(matchesFilter(disabled, {})).toBe(false);
  });

  it("an explicit undefined still means enabled-only", () => {
    // Indistinguishable from an absent key at runtime, which is why
    // getAllConfigs() exists rather than a filter value meaning "either".
    //
    // The cast is needed because `exactOptionalPropertyTypes` already refuses
    // this at compile time — so a TypeScript caller cannot make the mistake
    // and only a JavaScript one can. Worth pinning the runtime behaviour
    // anyway, since that guard is a tsconfig setting a consumer may not share.
    const filter = { enabled: undefined } as unknown as { enabled?: boolean };
    expect(matchesFilter(disabled, filter)).toBe(false);
  });

  it("matches a quote by symbol or by address", () => {
    expect(matchesFilter(usdgFive, { quote: "USDG" })).toBe(true);
    expect(matchesFilter(usdgFive, { quote: "usdg" })).toBe(true);
    expect(matchesFilter(usdgFive, { quote: USDG.address })).toBe(true);
    expect(matchesFilter(usdgFive, { quote: USDG.address.toLowerCase() })).toBe(true);
    expect(matchesFilter(ethStandard, { quote: "USDG" })).toBe(false);
  });

  it("filters on self-burn and fee tier", () => {
    expect(matchesFilter(ethBurn, { selfBurn: true })).toBe(true);
    expect(matchesFilter(ethStandard, { selfBurn: true })).toBe(false);
    expect(matchesFilter(usdgFive, { feePercent: 5 })).toBe(true);
    expect(matchesFilter(usdgFive, { feePercent: 1 })).toBe(false);
  });

  it("tells two supplies apart at the same quote and fee tier", () => {
    // The case this filter exists for: once a 10B row is published alongside
    // the 1B one, every other field on them is identical, so nothing else in
    // the filter can separate them.
    const oneBillion = deriveConfig(1000, raw(), ETHER);
    const tenBillion = deriveConfig(
      1016,
      raw({ supply: 10_000_000_000n * 10n ** 18n, startTick: 227_200 }),
      ETHER,
    );

    const shared = { quote: "ETH", feePercent: 1, selfBurn: false } as const;
    expect(matchesFilter(oneBillion, shared)).toBe(true);
    expect(matchesFilter(tenBillion, shared)).toBe(true);

    expect(matchesFilter(oneBillion, { ...shared, supplyTokens: 1_000_000_000 })).toBe(true);
    expect(matchesFilter(tenBillion, { ...shared, supplyTokens: 1_000_000_000 })).toBe(false);
    expect(matchesFilter(tenBillion, { ...shared, supplyTokens: 10_000_000_000 })).toBe(true);
    expect(matchesFilter(oneBillion, { ...shared, supplyTokens: 10_000_000_000 })).toBe(false);
  });

  it("combines filters with AND", () => {
    expect(matchesFilter(usdgFive, { quote: "USDG", feePercent: 5, selfBurn: false })).toBe(true);
    expect(matchesFilter(usdgFive, { quote: "USDG", feePercent: 1 })).toBe(false);
  });
});
