/**
 * Picking one config out of the menu.
 *
 * `const [config] = await getConfigs(...)` is the pattern this exists to
 * replace. It was safe only while every quote-and-fee combination named exactly
 * one row; publishing a second supply makes the same filter match two, and
 * taking `[0]` resolves that by publication order rather than by intent.
 */

import { describe, expect, it } from "vitest";
import type { Address, PublicClient } from "viem";

import { LetscashClient } from "../src/client.js";
import { InvalidArgumentError } from "../src/errors.js";
import { NATIVE_CURRENCY } from "../src/chain.js";
import { USDG } from "../src/amount.js";

const FIRST_ID = 1000n;

interface Row {
  quote: Address;
  supply: bigint;
  feeRate: number;
  creatorFeeBps: number;
  selfBurn?: boolean;
  enabled?: boolean;
  startTick?: number;
}

const ONE_B = 1_000_000_000n * 10n ** 18n;
const TEN_B = 10_000_000_000n * 10n ** 18n;

/** A client whose menu is exactly the rows given. */
function clientWith(rows: Row[]): LetscashClient {
  const publicClient = {
    readContract: async ({ functionName, args }: { functionName: string; args?: unknown[] }) => {
      if (functionName === "FIRST_CONFIG_ID") return FIRST_ID;
      if (functionName === "configCount") return FIRST_ID + BigInt(rows.length);
      if (functionName === "getLaunchConfig") {
        const row = rows[Number(BigInt(String(args?.[0])) - FIRST_ID)];
        if (!row) throw new Error("no such config");
        return {
          moduleSetId: 0n,
          quote: row.quote,
          supply: row.supply,
          tickSpacing: 200,
          startTick: row.startTick ?? 204_200,
          creatorFeeBps: row.creatorFeeBps,
          feeRate: row.feeRate,
          enabled: row.enabled ?? true,
          selfBurn: row.selfBurn ?? false,
          exists: true,
        };
      }
      throw new Error(`unexpected call: ${functionName}`);
    },
  } as unknown as PublicClient;

  return new LetscashClient({ publicClient });
}

/** The menu as it will look once both supplies are live: two rows per tier. */
function bothSupplies(): LetscashClient {
  return clientWith([
    { quote: NATIVE_CURRENCY, supply: ONE_B, feeRate: 10_000, creatorFeeBps: 7000 },
    { quote: NATIVE_CURRENCY, supply: ONE_B, feeRate: 50_000, creatorFeeBps: 9400 },
    { quote: USDG.address, supply: ONE_B, feeRate: 10_000, creatorFeeBps: 7000 },
    { quote: NATIVE_CURRENCY, supply: TEN_B, feeRate: 10_000, creatorFeeBps: 7000, startTick: 227_200 },
    { quote: NATIVE_CURRENCY, supply: TEN_B, feeRate: 50_000, creatorFeeBps: 9400, startTick: 227_200 },
    { quote: USDG.address, supply: TEN_B, feeRate: 10_000, creatorFeeBps: 7000, startTick: 421_400 },
  ]);
}

describe("selectConfig", () => {
  it("returns the row when exactly one matches", async () => {
    const client = bothSupplies();
    const config = await client.selectConfig({
      quote: "ETH",
      feePercent: 1,
      supplyTokens: 10_000_000_000,
    });
    expect(config.id).toBe(1003);
    expect(config.supplyTokens).toBe(10_000_000_000);
    expect(config.startTick).toBe(227_200);
  });

  it("refuses to pick when two supplies match, and names both", async () => {
    const client = bothSupplies();
    // This is exactly what `const [config] = await getConfigs(...)` would have
    // resolved silently, in favour of whichever was published first.
    const ambiguous = client.selectConfig({ quote: "ETH", feePercent: 1 });

    await expect(ambiguous).rejects.toBeInstanceOf(InvalidArgumentError);
    await expect(ambiguous).rejects.toThrow(/2 launch configs match/);
    await expect(ambiguous).rejects.toThrow(/#1000/);
    await expect(ambiguous).rejects.toThrow(/#1003/);
    // And it says which field would separate them.
    await expect(ambiguous).rejects.toThrow(/supplyTokens/);
  });

  it("the ambiguity it refuses is the one getConfigs resolves by order", async () => {
    const client = bothSupplies();
    const matches = await client.getConfigs({ quote: "ETH", feePercent: 1 });

    expect(matches).toHaveLength(2);
    // Ascending id, so today the 1B row wins by luck of being published first.
    expect(matches[0]!.supplyTokens).toBe(1_000_000_000);
    expect(matches[1]!.supplyTokens).toBe(10_000_000_000);
  });

  it("explains what is available when nothing matches", async () => {
    const client = bothSupplies();
    const missing = client.selectConfig({ quote: "ETH", feePercent: 3 });

    await expect(missing).rejects.toBeInstanceOf(InvalidArgumentError);
    await expect(missing).rejects.toThrow(/No enabled launch config matches/);
    // The message lists what a caller could have asked for instead.
    await expect(missing).rejects.toThrow(/6 rows are launchable/);
  });

  it("ignores disabled rows, so a published-but-off twin is not an ambiguity", async () => {
    const client = clientWith([
      { quote: NATIVE_CURRENCY, supply: ONE_B, feeRate: 10_000, creatorFeeBps: 7000 },
      {
        quote: NATIVE_CURRENCY,
        supply: TEN_B,
        feeRate: 10_000,
        creatorFeeBps: 7000,
        enabled: false,
      },
    ]);

    // Rows are published ahead of being switched on, so during the rollout
    // window the 10B twin exists and is not launchable. That must not break
    // callers who have not adopted the new filter yet.
    const config = await client.selectConfig({ quote: "ETH", feePercent: 1 });
    expect(config.supplyTokens).toBe(1_000_000_000);
  });

  it("separates self-burn twins too, not only supplies", async () => {
    const client = clientWith([
      { quote: NATIVE_CURRENCY, supply: ONE_B, feeRate: 10_000, creatorFeeBps: 7000 },
      {
        quote: NATIVE_CURRENCY,
        supply: ONE_B,
        feeRate: 10_000,
        creatorFeeBps: 7000,
        selfBurn: true,
      },
    ]);

    await expect(client.selectConfig({ quote: "ETH", feePercent: 1 })).rejects.toThrow(/selfBurn/);
    const burn = await client.selectConfig({ quote: "ETH", feePercent: 1, selfBurn: true });
    expect(burn.selfBurn).toBe(true);
  });
});
