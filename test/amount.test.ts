/**
 * `Amount` exists to stop a number being plausibly wrong, so it is the last
 * place a formatting bug should survive — and one did: `maxDecimals: 0`
 * rendered 0.5 ETH as " ETH" and 1000.25 USDG as "1 USDG", because trimming
 * trailing zeros off the whole string ate the integer's own zeros once the
 * decimal point had been truncated away.
 *
 * Table-driven for that reason. The bug lived in one branch nothing happened
 * to call.
 */

import { describe, expect, it } from "vitest";

import { Amount, AssetMismatchError, ETHER, USDG, knownAsset } from "../src/amount.js";

describe("Amount.parse and raw", () => {
  it("scales by the asset's own decimals, not a default", () => {
    expect(Amount.parse("1", ETHER).raw).toBe(10n ** 18n);
    // The whole point: the same "1" is a million in USDG, not a quintillion.
    expect(Amount.parse("1", USDG).raw).toBe(1_000_000n);
  });

  it("round-trips through decimal", () => {
    for (const value of ["0.5", "1000.25", "0.000001", "123456789"]) {
      expect(Amount.parse(value, USDG).decimal).toBe(value);
    }
  });

  it("knows zero and nativeness", () => {
    expect(Amount.zero(ETHER).isZero).toBe(true);
    expect(Amount.zero(ETHER).isNative).toBe(true);
    expect(Amount.zero(USDG).isNative).toBe(false);
  });
});

describe("Amount.format", () => {
  const cases: [string, typeof ETHER | typeof USDG, number | undefined, string][] = [
    // The regression. Every one of these returned something wrong before.
    ["0.5", ETHER, 0, "0 ETH"],
    ["1000.25", USDG, 0, "1000 USDG"],
    ["0.0001", ETHER, 0, "0 ETH"],
    ["100", USDG, 0, "100 USDG"],
    ["1000", USDG, 0, "1000 USDG"],
    ["10.05", USDG, 0, "10 USDG"],

    // Truncation, never rounding — a displayed balance must not exceed the
    // real one, or a bot thresholds on a number it cannot actually claim.
    ["1000.25", USDG, 1, "1000.2 USDG"],
    ["0.999999", ETHER, 2, "0.99 ETH"],
    ["1.5", ETHER, 2, "1.5 ETH"],
    ["1.50", ETHER, 2, "1.5 ETH"],

    // No cap: full precision.
    ["0.123456", USDG, undefined, "0.123456 USDG"],
    ["7", USDG, undefined, "7 USDG"],
  ];

  for (const [value, asset, maxDecimals, expected] of cases) {
    const label = maxDecimals === undefined ? "no cap" : `maxDecimals: ${maxDecimals}`;
    it(`${value} ${asset.symbol} at ${label} -> "${expected}"`, () => {
      const amount = Amount.parse(value, asset);
      const formatted =
        maxDecimals === undefined ? amount.format() : amount.format({ maxDecimals });
      expect(formatted).toBe(expected);
    });
  }

  it("never returns a string that starts with a space or is empty", () => {
    // The original bug produced exactly this — " ETH" — so it is worth
    // asserting as a property rather than only case by case.
    for (const value of ["0", "0.5", "0.0001", "1", "1000.25", "999999999.999999"]) {
      for (const max of [0, 1, 2, 6]) {
        const text = Amount.parse(value, USDG).format({ maxDecimals: max });
        expect(text.startsWith(" "), `"${text}" for ${value} @ ${max}`).toBe(false);
        expect(text.trim().split(" ")[0]).not.toBe("");
      }
    }
  });

  it("omits the symbol when asked", () => {
    expect(Amount.parse("1.5", ETHER).format({ symbol: false })).toBe("1.5");
  });

  it("does not render negative zero", () => {
    expect(Amount.raw(-1n, USDG).format({ maxDecimals: 0 })).toBe("0 USDG");
  });
});

describe("Amount arithmetic", () => {
  it("adds and subtracts within one asset", () => {
    const a = Amount.parse("1.5", USDG);
    const b = Amount.parse("0.5", USDG);
    expect(a.plus(b).decimal).toBe("2");
    expect(a.minus(b).decimal).toBe("1");
  });

  it("refuses to combine two different assets", () => {
    const eth = Amount.parse("1", ETHER);
    const usdg = Amount.parse("1", USDG);
    // Both are `1`, and both would look fine added together. The scales are
    // twelve orders of magnitude apart.
    expect(() => eth.plus(usdg)).toThrow(AssetMismatchError);
    expect(() => eth.minus(usdg)).toThrow(AssetMismatchError);
    expect(() => eth.gt(usdg)).toThrow(AssetMismatchError);
    expect(() => eth.eq(usdg)).toThrow(AssetMismatchError);
  });

  it("scales by basis points, rounding down", () => {
    // 70% of a 1% fee — the creator's share on the standard tier.
    expect(Amount.parse("0.01", ETHER).percentBps(7000).decimal).toBe("0.007");
    // Rounds down: 1 wei at 50% is zero, not a half wei.
    expect(Amount.raw(1n, ETHER).percentBps(5000).raw).toBe(0n);
    expect(Amount.raw(3n, USDG).percentBps(5000).raw).toBe(1n);
  });

  it("compares correctly", () => {
    const small = Amount.parse("1", USDG);
    const big = Amount.parse("2", USDG);
    expect(small.lt(big)).toBe(true);
    expect(small.lte(small)).toBe(true);
    expect(big.gt(small)).toBe(true);
    expect(big.gte(big)).toBe(true);
    expect(small.eq(Amount.parse("1", USDG))).toBe(true);
  });
});

describe("Amount serialisation", () => {
  it("survives JSON without losing the bigint or the scale", () => {
    const json = Amount.parse("1000.25", USDG).toJSON();
    expect(json).toEqual({
      raw: "1000250000",
      decimal: "1000.25",
      symbol: "USDG",
      decimals: 6,
    });
    // A bigint would throw here; a number would lose precision.
    expect(() => JSON.stringify(json)).not.toThrow();
  });

  it("stringifies with the symbol", () => {
    expect(`${Amount.parse("1.5", USDG)}`).toBe("1.5 USDG");
  });
});

describe("knownAsset", () => {
  it("resolves the quote assets case-insensitively", () => {
    expect(knownAsset(USDG.address)?.decimals).toBe(6);
    expect(knownAsset(USDG.address.toLowerCase() as `0x${string}`)?.decimals).toBe(6);
    expect(knownAsset(ETHER.address)?.decimals).toBe(18);
  });

  it("returns undefined rather than guessing 18 for something unknown", () => {
    // Guessing is how the bug this module prevents gets reintroduced.
    expect(knownAsset("0x1111111111111111111111111111111111111111")).toBeUndefined();
  });
});
