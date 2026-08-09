/**
 * Pool identity, checked against real mainnet values.
 *
 * The fixtures are not invented — they are read off Robinhood Chain, so this
 * suite proves the derivation reproduces what the launchpad actually did,
 * rather than proving the implementation agrees with itself.
 */

import { describe, expect, it } from "vitest";

import { NATIVE_CURRENCY } from "../src/chain.js";
import {
  PoolKeyMismatchError,
  PoolOrderingError,
  assertPoolKey,
  buildPoolKey,
  poolIdOf,
  verifyPoolKey,
} from "../src/pool.js";

/** LONGCAT, an ether-quoted pool launched under the vNext hook. */
const LONGCAT = {
  token: "0xfd453d9bab9f807165cd3464ac6c9700ad9ee5cc",
  hook: "0x75A54357D9C78a2Db19004a5FDc76c50F9242AEC",
  poolId: "0xb3cf89046f47b2abe13ce5e54d3380007fc3b52e55aa14874502b26996dc807b",
} as const;

const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as const;

describe("poolIdOf", () => {
  it("reproduces the id a real pool launched with", () => {
    const key = buildPoolKey({ token: LONGCAT.token, hook: LONGCAT.hook });
    expect(poolIdOf(key)).toBe(LONGCAT.poolId);
  });

  it("is case-insensitive on the input addresses", () => {
    const lower = buildPoolKey({
      token: LONGCAT.token.toLowerCase() as `0x${string}`,
      hook: LONGCAT.hook.toLowerCase() as `0x${string}`,
    });
    // Addresses are hashed as 20 bytes, not as text, so checksum casing in the
    // input must not change the id. A caller passing a checksummed address
    // from one source and a lowercase one from another has to land in the
    // same pool.
    expect(poolIdOf(lower)).toBe(LONGCAT.poolId);
  });

  /**
   * The whole reason this module is defensive.
   *
   * Quoting LONGCAT against USDG is wrong — it is an ether pool — but the
   * derivation does not care. It returns a well-formed id for a pool that has
   * never existed, and every read against it comes back zero.
   */
  it("returns a plausible but wrong id when the quote is wrong", () => {
    const wrong = buildPoolKey({ token: LONGCAT.token, hook: LONGCAT.hook, quote: USDG });
    const id = poolIdOf(wrong);
    expect(id).toMatch(/^0x[0-9a-f]{64}$/);
    expect(id).not.toBe(LONGCAT.poolId);
  });

  it("changes when the tick spacing changes", () => {
    const key = buildPoolKey({ token: LONGCAT.token, hook: LONGCAT.hook, tickSpacing: 60 });
    expect(poolIdOf(key)).not.toBe(LONGCAT.poolId);
  });
});

describe("buildPoolKey", () => {
  it("puts the quote in currency0 and the token in currency1", () => {
    const key = buildPoolKey({ token: LONGCAT.token, hook: LONGCAT.hook });
    expect(key.currency0).toBe(NATIVE_CURRENCY);
    expect(key.currency1).toBe(LONGCAT.token);
  });

  it("uses a zero LP fee, because the hook takes the fee instead", () => {
    expect(buildPoolKey({ token: LONGCAT.token, hook: LONGCAT.hook }).fee).toBe(0);
  });

  it("refuses to silently reorder a token that sorts below its quote", () => {
    // Swapping the arguments is the realistic mistake. Sorting them for the
    // caller would hand back a key for a different pool.
    expect(() => buildPoolKey({ token: NATIVE_CURRENCY, hook: LONGCAT.hook, quote: USDG })).toThrow(
      PoolOrderingError,
    );
  });
});

describe("verifyPoolKey / assertPoolKey", () => {
  it("accepts a key that reproduces the real id", () => {
    const key = buildPoolKey({ token: LONGCAT.token, hook: LONGCAT.hook });
    expect(verifyPoolKey(key, LONGCAT.poolId)).toBe(true);
    expect(() => assertPoolKey(key, LONGCAT.poolId)).not.toThrow();
  });

  it("rejects the wrong-quote key that poolIdOf would happily hash", () => {
    const wrong = buildPoolKey({ token: LONGCAT.token, hook: LONGCAT.hook, quote: USDG });
    expect(verifyPoolKey(wrong, LONGCAT.poolId)).toBe(false);
    expect(() => assertPoolKey(wrong, LONGCAT.poolId)).toThrow(PoolKeyMismatchError);
  });

  it("names both ids in the error, so the mismatch is diagnosable", () => {
    const wrong = buildPoolKey({ token: LONGCAT.token, hook: LONGCAT.hook, quote: USDG });
    try {
      assertPoolKey(wrong, LONGCAT.poolId);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as Error).message).toContain(LONGCAT.poolId);
      expect((error as Error).message).toContain(USDG);
    }
  });
});
