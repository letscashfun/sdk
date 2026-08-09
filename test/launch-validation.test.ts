/**
 * Pre-flight validation and signature handling.
 *
 * Both are places where an e2e run gives false confidence:
 *
 *  - Validation duplicates checks the contract also makes, so a passing fork
 *    test proves the *contract* rejects a bad split, not that the SDK caught
 *    it before the wallet prompt. Only a unit test proves the early exit.
 *  - `recoveryId` cannot be exercised on a fork at all. viem's local signer
 *    always emits legacy 27/28 signatures, so all 18 e2e tests take one branch
 *    and the other stays unproven until a real wallet signs.
 */

import { describe, expect, it } from "vitest";
import type { Address, Hex, PublicClient } from "viem";

import { ETHER, USDG } from "../src/amount.js";
import type { ClientContext } from "../src/client.js";
import { deriveConfig, type RawLaunchConfig } from "../src/configs.js";
import { InvalidArgumentError } from "../src/errors.js";
import { MAX_FEE_RECIPIENTS, recoveryId, validateLaunch } from "../src/launch.js";

// ————————————————————————— recoveryId —————————————————————————

describe("recoveryId", () => {
  const r = "11".repeat(32);
  const s = "22".repeat(32);

  it("passes a legacy 27/28 signature straight through", () => {
    expect(recoveryId(`0x${r}${s}1b`)).toBe(27);
    expect(recoveryId(`0x${r}${s}1c`)).toBe(28);
  });

  it("converts 0/1 parity to 27/28 instead of defaulting to 27", () => {
    // The bug: viem returns `v: undefined` here, and `Number(v ?? 27n)` sent
    // 27 for both — wrong half the time, which is a ~50% failure rate on
    // permit launches from any wallet that signs this way.
    expect(recoveryId(`0x${r}${s}00`)).toBe(27);
    expect(recoveryId(`0x${r}${s}01`)).toBe(28);
  });

  it("agrees across both encodings of the same parity", () => {
    expect(recoveryId(`0x${r}${s}01`)).toBe(recoveryId(`0x${r}${s}1c`));
    expect(recoveryId(`0x${r}${s}00`)).toBe(recoveryId(`0x${r}${s}1b`));
  });
});

// ————————————————————————— validateLaunch —————————————————————————

const FACTORY = "0x5bd1Fbe78a78fe8236fa00CF48fbEBA74ae34661" as Address;
const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951" as Address;
const HOOK = "0x75A54357D9C78a2Db19004a5FDc76c50F9242AEC" as Address;

/**
 * A context whose only network call is `getModuleSet`.
 *
 * Anything else throws, which is deliberate: a validation that reached for the
 * chain before making its cheap local checks would fail here rather than pass
 * quietly.
 */
function stubContext(): ClientContext {
  return {
    publicClient: {
      readContract: async ({ functionName }: { functionName: string }) => {
        if (functionName !== "getModuleSet") {
          throw new Error(`unexpected network call: ${functionName}`);
        }
        return {
          hook: HOOK,
          tokenMaster: "0xd6Da7f07eE822C8538C901217b37D1e7d86c76E5" as Address,
          selfBurner: "0x47b846F7111919C652026ea750DDBD247Bf79d21" as Address,
          splitterMaster: "0xAfB17a5B4594Bcd7a7D7c740Cd699b46a30194bd" as Address,
          exists: true,
        };
      },
    } as unknown as PublicClient,
    walletClient: undefined,
    addresses: { factory: FACTORY, poolManager: POOL_MANAGER } as ClientContext["addresses"],
    chainId: 4663,
    resolveAsset: async () => ETHER,
    moduleSetForHook: async () => {
      throw new Error("validateLaunch should not need to resolve a module set by hook");
    },
  };
}

function config(overrides: Partial<RawLaunchConfig> = {}) {
  return deriveConfig(
    1000,
    {
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
    },
    ETHER,
  );
}

const wallet = (n: number) => (`0x${String(n).repeat(40).slice(0, 40)}`) as Address;

describe("validateLaunch", () => {
  const ctx = stubContext();
  const base = { configId: 1000, name: "Coin", symbol: "COIN" };

  it("accepts a minimal launch", async () => {
    await expect(validateLaunch(ctx, base, config())).resolves.toBeUndefined();
  });

  it("rejects an empty name or symbol", async () => {
    await expect(validateLaunch(ctx, { ...base, name: "  " }, config())).rejects.toThrow(
      /name cannot be empty/,
    );
    await expect(validateLaunch(ctx, { ...base, symbol: "" }, config())).rejects.toThrow(
      /symbol cannot be empty/,
    );
  });

  it("rejects a disabled config before anything is signed", async () => {
    await expect(validateLaunch(ctx, base, config({ enabled: false }))).rejects.toThrow(
      /switched off/,
    );
  });

  it("rejects fee recipients on a self-burn config", async () => {
    // There are no creator earnings in self-burn mode, so naming somewhere to
    // send them is a misunderstanding rather than a typo.
    await expect(
      validateLaunch(
        ctx,
        { ...base, feeRecipients: [{ address: wallet(1), shareBps: 10_000 }] },
        config({ selfBurn: true }),
      ),
    ).rejects.toThrow(/self-burn/);
  });

  describe("fee splits", () => {
    it("accepts shares summing to exactly 10000", async () => {
      await expect(
        validateLaunch(
          ctx,
          {
            ...base,
            feeRecipients: [
              { address: wallet(1), shareBps: 5000 },
              { address: wallet(2), shareBps: 3000 },
              { address: wallet(3), shareBps: 2000 },
            ],
          },
          config(),
        ),
      ).resolves.toBeUndefined();
    });

    it("rejects shares that do not sum to 10000", async () => {
      for (const [a, b] of [
        [5000, 4000],
        [5000, 6000],
        [1, 1],
      ]) {
        await expect(
          validateLaunch(
            ctx,
            {
              ...base,
              feeRecipients: [
                { address: wallet(1), shareBps: a! },
                { address: wallet(2), shareBps: b! },
              ],
            },
            config(),
          ),
        ).rejects.toThrow(/sum to exactly 10000/);
      }
    });

    it("rejects more recipients than the splitter has slots", async () => {
      const tooMany = Array.from({ length: MAX_FEE_RECIPIENTS + 1 }, (_, i) => ({
        address: wallet(i + 1),
        shareBps: 10_000 / (MAX_FEE_RECIPIENTS + 1),
      }));
      await expect(
        validateLaunch(ctx, { ...base, feeRecipients: tooMany }, config()),
      ).rejects.toThrow(new RegExp(`at most ${MAX_FEE_RECIPIENTS} recipients`));
    });

    it("accepts exactly the maximum", async () => {
      const exact = Array.from({ length: MAX_FEE_RECIPIENTS }, (_, i) => ({
        address: wallet(i + 1),
        shareBps: 10_000 / MAX_FEE_RECIPIENTS,
      }));
      await expect(
        validateLaunch(ctx, { ...base, feeRecipients: exact }, config()),
      ).resolves.toBeUndefined();
    });

    it("rejects a duplicate recipient", async () => {
      await expect(
        validateLaunch(
          ctx,
          {
            ...base,
            feeRecipients: [
              { address: wallet(1), shareBps: 5000 },
              { address: wallet(1), shareBps: 5000 },
            ],
          },
          config(),
        ),
      ).rejects.toThrow(/appears twice/);
    });

    it("rejects the zero address and a zero share", async () => {
      await expect(
        validateLaunch(
          ctx,
          {
            ...base,
            feeRecipients: [
              { address: "0x0000000000000000000000000000000000000000", shareBps: 10_000 },
            ],
          },
          config(),
        ),
      ).rejects.toThrow(/zero address/);

      await expect(
        validateLaunch(
          ctx,
          {
            ...base,
            feeRecipients: [
              { address: wallet(1), shareBps: 10_000 },
              { address: wallet(2), shareBps: 0 },
            ],
          },
          config(),
        ),
      ).rejects.toThrow(/Remove them instead/);
    });

    it("rejects every protocol address the factory refuses", async () => {
      for (const forbidden of [FACTORY, POOL_MANAGER, HOOK, ETHER.address]) {
        await expect(
          validateLaunch(
            ctx,
            { ...base, feeRecipients: [{ address: forbidden, shareBps: 10_000 }] },
            config(),
          ),
        ).rejects.toThrow(InvalidArgumentError);
      }
    });

    it("makes its local checks before touching the network", async () => {
      // The stub throws on any call other than getModuleSet, so a validation
      // that reached for chain state first would surface here.
      const noNetwork: ClientContext = {
        ...ctx,
        publicClient: {
          readContract: async () => {
            throw new Error("should not have hit the network");
          },
        } as unknown as PublicClient,
      };
      await expect(
        validateLaunch(
          noNetwork,
          {
            ...base,
            feeRecipients: [
              { address: wallet(1), shareBps: 5000 },
              { address: wallet(2), shareBps: 4000 },
            ],
          },
          config(),
        ),
      ).rejects.toThrow(/sum to exactly 10000/);
    });
  });

  it("carries a USDG config's quote through without complaint", async () => {
    const usdgConfig = deriveConfig(
      1008,
      {
        moduleSetId: 0n,
        quote: USDG.address,
        supply: 10n ** 27n,
        tickSpacing: 200,
        startTick: 398_400,
        creatorFeeBps: 7000,
        feeRate: 10_000,
        enabled: true,
        selfBurn: false,
        exists: true,
      },
      USDG,
    );
    await expect(validateLaunch(ctx, base, usdgConfig)).resolves.toBeUndefined();
  });
});
