/**
 * Pins the router calldata layout, against verified source.
 *
 * The deployed UniversalRouter at `0x8876…0904` is a modified build, and this
 * suite spent a while asserting its shape was unverifiable. It is not — the
 * contract is verified on Blockscout with 110 source files, and both of the
 * SDK's claims about it are confirmed there:
 *
 *   `IV4Router.sol:27-34` — ExactInputSingleParams carries
 *     `uint256 minHopPriceX36` between `amountOutMinimum` and `hookData`,
 *     exactly as encoded below.
 *   `V4Router.sol:93` — `if (params.minHopPriceX36 != 0)`, so passing zero
 *     disables the per-hop floor and leaves `amountOutMinimum` as the only
 *     slippage protection. Which is what the SDK does.
 *
 * So the expectations here are pinned to a real struct rather than to observed
 * behaviour. What the suite guards is drift: a refactor that dropped the
 * field, reordered it, or changed the action bytes would still pass an
 * ether-pool test — the canonical five-field layout decodes on those by
 * accident — and would break every stablecoin trade.
 */

import { decodeAbiParameters, encodeAbiParameters, parseEther } from "viem";
import type { Address } from "viem";
import { describe, expect, it } from "vitest";

import { NATIVE_CURRENCY } from "../src/chain.js";
import { buildPoolKey } from "../src/pool.js";
import { encodeV4Swap } from "../src/trade.js";

const TOKEN = "0xfd453d9bab9f807165cd3464ac6c9700ad9ee5cc" as Address;
const HOOK = "0x75A54357D9C78a2Db19004a5FDc76c50F9242AEC" as Address;
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as Address;

const ethKey = buildPoolKey({ token: TOKEN, hook: HOOK });
const usdgKey = buildPoolKey({ token: TOKEN, hook: HOOK, quote: USDG });

/** The struct the router is believed to decode, including the extra field. */
const SWAP_PARAMS = [
  {
    type: "tuple",
    components: [
      {
        name: "poolKey",
        type: "tuple",
        components: [
          { name: "currency0", type: "address" },
          { name: "currency1", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickSpacing", type: "int24" },
          { name: "hooks", type: "address" },
        ],
      },
      { name: "zeroForOne", type: "bool" },
      { name: "amountIn", type: "uint128" },
      { name: "amountOutMinimum", type: "uint128" },
      { name: "minHopPriceX36", type: "uint256" },
      { name: "hookData", type: "bytes" },
    ],
  },
] as const;

/** Unwraps `execute`'s single input back into (actions, params[]). */
function unwrap(input: `0x${string}`) {
  const [actions, params] = decodeAbiParameters(
    [{ type: "bytes" }, { type: "bytes[]" }],
    input,
  );
  return { actions, params: params as readonly `0x${string}`[] };
}

describe("encodeV4Swap", () => {
  it("uses the V4_SWAP command and the three expected actions", () => {
    const { commands, inputs } = encodeV4Swap(ethKey, true, parseEther("1"), 0n);
    expect(commands).toBe("0x10");
    expect(inputs).toHaveLength(1);

    // SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL. Reordering these silently
    // changes what the router does with the params that follow.
    const { actions, params } = unwrap(inputs[0]!);
    expect(actions).toBe("0x060c0f");
    expect(params).toHaveLength(3);
  });

  it("carries minHopPriceX36 between amountOutMinimum and hookData", () => {
    // The whole point. Decoding with the six-field struct must round-trip
    // every value — if the field were missing or misplaced, the offsets shift
    // and hookData reads garbage.
    const amountIn = parseEther("1.5");
    const minOut = 12345678n;
    const { inputs } = encodeV4Swap(ethKey, true, amountIn, minOut);
    const { params } = unwrap(inputs[0]!);

    const [decoded] = decodeAbiParameters(SWAP_PARAMS, params[0]!);
    expect(decoded.poolKey.currency0).toBe(ethKey.currency0);
    expect(decoded.poolKey.currency1.toLowerCase()).toBe(ethKey.currency1.toLowerCase());
    expect(decoded.poolKey.fee).toBe(0);
    expect(decoded.poolKey.tickSpacing).toBe(200);
    expect(decoded.zeroForOne).toBe(true);
    expect(decoded.amountIn).toBe(amountIn);
    expect(decoded.amountOutMinimum).toBe(minOut);
    expect(decoded.minHopPriceX36).toBe(0n);
    expect(decoded.hookData).toBe("0x");
  });

  it("is exactly one word longer than the canonical five-field encoding", () => {
    // Both encodings are built here and measured, rather than one being
    // asserted against a restatement of itself. Drop the field and the
    // difference vanishes — while an ether-pool swap keeps working, which is
    // precisely why this was invisible before USDG pools existed.
    const { inputs } = encodeV4Swap(ethKey, true, parseEther("1"), 0n);
    const { params } = unwrap(inputs[0]!);
    const actual = (params[0]!.length - 2) / 2;

    const canonical = encodeAbiParameters(
      [
        {
          type: "tuple",
          components: [
            {
              name: "poolKey",
              type: "tuple",
              components: [
                { name: "currency0", type: "address" },
                { name: "currency1", type: "address" },
                { name: "fee", type: "uint24" },
                { name: "tickSpacing", type: "int24" },
                { name: "hooks", type: "address" },
              ],
            },
            { name: "zeroForOne", type: "bool" },
            { name: "amountIn", type: "uint128" },
            { name: "amountOutMinimum", type: "uint128" },
            { name: "hookData", type: "bytes" },
          ],
        },
      ],
      [
        {
          poolKey: ethKey,
          zeroForOne: true,
          amountIn: parseEther("1"),
          amountOutMinimum: 0n,
          hookData: "0x",
        },
      ],
    );

    expect(actual).toBe(384);
    expect(actual - (canonical.length - 2) / 2).toBe(32);
  });

  describe("settle and take pick the right side", () => {
    it("a buy settles currency0 and takes currency1", () => {
      const { inputs } = encodeV4Swap(ethKey, true, parseEther("1"), 500n);
      const { params } = unwrap(inputs[0]!);
      const [settleCurrency] = decodeAbiParameters(
        [{ type: "address" }, { type: "uint256" }],
        params[1]!,
      );
      const [takeCurrency] = decodeAbiParameters(
        [{ type: "address" }, { type: "uint256" }],
        params[2]!,
      );
      expect(settleCurrency).toBe(ethKey.currency0);
      expect((takeCurrency as string).toLowerCase()).toBe(ethKey.currency1.toLowerCase());
    });

    it("a sell settles currency1 and takes currency0", () => {
      const { inputs } = encodeV4Swap(ethKey, false, 1000n, 5n);
      const { params } = unwrap(inputs[0]!);
      const [settleCurrency] = decodeAbiParameters(
        [{ type: "address" }, { type: "uint256" }],
        params[1]!,
      );
      expect((settleCurrency as string).toLowerCase()).toBe(ethKey.currency1.toLowerCase());
    });
  });

  describe("value follows the settled currency, not the direction", () => {
    it("attaches ether when buying on an ether pool", () => {
      const amount = parseEther("2");
      expect(encodeV4Swap(ethKey, true, amount, 0n).value).toBe(amount);
    });

    it("attaches nothing when buying on a USDG pool", () => {
      // The trap: a buy is not always native. Attaching value here sends real
      // ether into a swap that never asked for it while SETTLE tries to pull
      // USDG the router was never approved for.
      expect(encodeV4Swap(usdgKey, true, 1_000_000n, 0n).value).toBe(0n);
      expect(usdgKey.currency0).toBe(USDG);
      expect(NATIVE_CURRENCY).not.toBe(usdgKey.currency0);
    });

    it("attaches nothing when selling, on either pool", () => {
      expect(encodeV4Swap(ethKey, false, 1000n, 0n).value).toBe(0n);
      expect(encodeV4Swap(usdgKey, false, 1000n, 0n).value).toBe(0n);
    });
  });
});
