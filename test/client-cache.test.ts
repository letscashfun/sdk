/**
 * The client's caches, measured by counting RPC calls rather than asserted.
 *
 * Module sets and token decimals are written once and never move, so both are
 * cacheable — but "is cached" is the kind of claim that rots quietly when a
 * refactor moves a read. Counting the calls is the only assertion that stays
 * honest.
 *
 * The case that motivated this: an indexer calling `isSelfBurn()` across a
 * list of tokens. Uncached that is `1 + n` round trips per token, for state
 * that cannot have changed between two of them.
 */

import { describe, expect, it } from "vitest";
import type { Address, PublicClient } from "viem";

import { LetscashClient } from "../src/client.js";
import { InvalidArgumentError } from "../src/errors.js";

const HOOK_0 = "0x75A54357D9C78a2Db19004a5FDc76c50F9242AEC" as Address;
const HOOK_1 = "0xEfe669814e5Eec33406Bd50ffa8331618D076aEc" as Address;

/** A publicClient that answers module-set reads and counts every call. */
function countingClient(setCount = 2) {
  const calls: string[] = [];
  const sets = [
    { hook: HOOK_0, suffix: "aa" },
    { hook: HOOK_1, suffix: "bb" },
  ];

  const publicClient = {
    readContract: async ({ functionName, args }: { functionName: string; args?: unknown[] }) => {
      calls.push(functionName);
      if (functionName === "moduleSetCount") return BigInt(setCount);
      if (functionName === "getModuleSet") {
        const id = Number(args?.[0]);
        const set = sets[id];
        if (!set) return { hook: `0x${"0".repeat(40)}`, exists: false };
        return {
          hook: set.hook,
          tokenMaster: `0x${set.suffix.repeat(20)}`.slice(0, 42),
          selfBurner: `0x${set.suffix.repeat(20)}`.slice(0, 42),
          splitterMaster: `0x${set.suffix.repeat(20)}`.slice(0, 42),
          exists: true,
        };
      }
      throw new Error(`unexpected call: ${functionName}`);
    },
  } as unknown as PublicClient;

  return { publicClient, calls };
}

describe("module set caching", () => {
  it("reads a set once and serves every repeat from memory", async () => {
    const { publicClient, calls } = countingClient();
    const client = new LetscashClient({ publicClient, chainId: 4663 });

    await client.getModuleSet(0);
    expect(calls.filter((c) => c === "getModuleSet")).toHaveLength(1);

    for (let i = 0; i < 5; i++) await client.getModuleSet(0);
    expect(calls.filter((c) => c === "getModuleSet")).toHaveLength(1);
  });

  it("resolves a hook once, however many times it is asked", async () => {
    const { publicClient, calls } = countingClient();
    const client = new LetscashClient({ publicClient, chainId: 4663 });

    await client.getModuleSetForHook(HOOK_0);
    const first = calls.length;
    expect(first).toBeGreaterThan(0);

    // The indexer case: a hundred tokens, all on the same hook.
    for (let i = 0; i < 100; i++) await client.getModuleSetForHook(HOOK_0);
    expect(calls.length).toBe(first);
  });

  it("keeps every set it walks past, not only the one it was looking for", async () => {
    const { publicClient, calls } = countingClient();
    const client = new LetscashClient({ publicClient, chainId: 4663 });

    // HOOK_1 is set 1, so finding it walks past set 0.
    await client.getModuleSetForHook(HOOK_1);
    const afterFirst = calls.length;

    // Set 0 was seen on the way, so asking for it costs nothing.
    await client.getModuleSetForHook(HOOK_0);
    expect(calls.length).toBe(afterFirst);
  });

  it("does not cache a missing set, so one published later is still found", async () => {
    const { publicClient, calls } = countingClient(2);
    const client = new LetscashClient({ publicClient, chainId: 4663 });

    await expect(client.getModuleSet(9)).rejects.toThrow(InvalidArgumentError);
    const afterFirst = calls.filter((c) => c === "getModuleSet").length;

    await expect(client.getModuleSet(9)).rejects.toThrow(InvalidArgumentError);
    // Re-read rather than served from a negative cache — a set published after
    // this client was constructed has to become visible.
    expect(calls.filter((c) => c === "getModuleSet").length).toBeGreaterThan(afterFirst);
  });

  it("throws rather than returning zero addresses for an unknown hook", async () => {
    const { publicClient } = countingClient();
    const client = new LetscashClient({ publicClient, chainId: 4663 });
    await expect(
      client.getModuleSetForHook("0x1111111111111111111111111111111111111111"),
    ).rejects.toThrow(/No published module set uses hook/);
  });
});
