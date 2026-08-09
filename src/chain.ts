/**
 * Chain definition and deployed addresses.
 *
 * Addresses are keyed by chain id rather than exported loose, so adding a
 * second deployment later does not change any call signature.
 */

import { defineChain } from "viem";
import type { Address } from "viem";

/** Robinhood Chain — an Arbitrum Orbit L2. */
export const ROBINHOOD_CHAIN_ID = 4663 as const;

/**
 * Robinhood Chain, as a viem chain object.
 *
 * The RPC listed here is the public endpoint. It works, but it is shared and
 * rate-limited: pass your own transport to the client for anything that polls.
 */
export const robinhoodChain = defineChain({
  id: ROBINHOOD_CHAIN_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.mainnet.chain.robinhood.com"] },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" },
  },
});

/** Native ether, as Uniswap v4 represents it inside a pool key. */
export const NATIVE_CURRENCY = "0x0000000000000000000000000000000000000000" as const;

/** True for the zero address, which is how v4 spells native ether. */
export function isNativeCurrency(currency: Address | string): boolean {
  return currency.toLowerCase() === NATIVE_CURRENCY;
}

/** Every contract this package talks to on a given chain. */
export interface LetscashAddresses {
  /**
   * The launchpad factory.
   *
   * A UUPS proxy, so this address survives upgrades and is the one stable
   * thing to hold on to. Everything else — hook, token master, self-burner,
   * splitter master — is read off it at runtime rather than hardcoded,
   * because a future release can move them.
   */
  readonly factory: Address;
  /** Uniswap v4's singleton. Every pool on this chain lives inside it. */
  readonly poolManager: Address;
  /** Uniswap's UniversalRouter, used for swaps. */
  readonly universalRouter: Address;
  /** Uniswap's v4 Quoter. Simulates a swap; not actually a view function. */
  readonly v4Quoter: Address;
  /** Permit2. Every non-native asset is pulled through it. */
  readonly permit2: Address;
  /**
   * The platform's revenue converter.
   *
   * Not part of a module set, and not something a creator ever needs — it
   * turns the platform's own non-native revenue into ether. Exposed because
   * `convert` is permissionless and someone may want to run it.
   */
  readonly revenueConverter: Address;
  /** Quote assets the launchpad supports, by symbol. */
  readonly quotes: Readonly<Record<string, Address>>;
  /**
   * Hooks this package will build a pool key against.
   *
   * A pool key decides which pool a swap touches, so an unrecognised hook is
   * refused rather than traded through. Adding a hook deployment means adding
   * a line here — deliberately, since the alternative is trusting whatever a
   * caller's data source hands over.
   */
  readonly knownHooks: readonly Address[];
}

const ROBINHOOD_ADDRESSES: LetscashAddresses = {
  factory: "0x5bd1Fbe78a78fe8236fa00CF48fbEBA74ae34661",
  poolManager: "0x8366a39CC670B4001A1121B8F6A443A643e40951",
  universalRouter: "0x8876789976dEcBfCbBbe364623C63652db8C0904",
  v4Quoter: "0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94",
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  revenueConverter: "0xD6A19060b0d372907Eb997589BBe0f65FfCE342e",
  quotes: {
    ETH: NATIVE_CURRENCY,
    USDG: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
  },
  knownHooks: [
    // vNext, live since 6 August 2026.
    "0x75A54357D9C78a2Db19004a5FDc76c50F9242AEC",
    // The pre-vNext hook. Its pools still trade and still pay out — a pool's
    // hook is fixed at creation, so nothing migrated.
    "0xEfe669814e5Eec33406Bd50ffa8331618D076aEc",
  ],
} as const;

const BY_CHAIN: Readonly<Record<number, LetscashAddresses>> = {
  [ROBINHOOD_CHAIN_ID]: ROBINHOOD_ADDRESSES,
};

/** Thrown when asked for a chain the launchpad is not deployed on. */
export class UnsupportedChainError extends Error {
  override readonly name = "UnsupportedChainError";
  constructor(readonly chainId: number) {
    super(
      `letscash is not deployed on chain ${chainId}. ` +
        `Supported: ${Object.keys(BY_CHAIN).join(", ")}.`,
    );
  }
}

/**
 * Deployed addresses for a chain.
 *
 * @throws {UnsupportedChainError} If the launchpad is not deployed there.
 */
export function getAddresses(chainId: number): LetscashAddresses {
  const addresses = BY_CHAIN[chainId];
  if (!addresses) throw new UnsupportedChainError(chainId);
  return addresses;
}

/** Whether the launchpad is deployed on a chain, without throwing. */
export function isSupportedChain(chainId: number): boolean {
  return chainId in BY_CHAIN;
}

/** Case-insensitive membership test against the known-hook list. */
export function isKnownHook(chainId: number, hook: Address | string): boolean {
  const needle = hook.toLowerCase();
  return getAddresses(chainId).knownHooks.some((known) => known.toLowerCase() === needle);
}
