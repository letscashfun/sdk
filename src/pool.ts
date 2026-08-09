/**
 * Pool identity.
 *
 * A Uniswap v4 pool is not a contract — it is an entry inside the singleton
 * PoolManager, identified by the hash of its key. Deriving that hash is the
 * single most error-prone part of integrating, because **getting it wrong does
 * not produce an error**. A wrong key hashes to a perfectly valid id for a pool
 * that does not exist, every read comes back zero, and it reads as "no fees
 * yet" rather than "you built the key wrong".
 *
 * So this module never returns a key it has not checked. Prefer
 * `client.token(...).poolId()`, which asks the token itself and cannot be
 * wrong; use the derivation here when you have no network, or to verify.
 */

import { encodeAbiParameters, keccak256 } from "viem";
import type { Address, Hex } from "viem";

import { NATIVE_CURRENCY } from "./chain.js";

/**
 * The five fields that identify a v4 pool.
 *
 * Change any one and it is a different pool — including `hooks`, which is why
 * the same pair can exist both hooked and unhooked at the same time.
 */
export interface PoolKey {
  /** The lower-sorting currency. Always the quote on a letscash pool. */
  readonly currency0: Address;
  /** The higher-sorting currency. Always the launched token. */
  readonly currency1: Address;
  /** LP fee in hundredths of a basis point. Always 0 here — see below. */
  readonly fee: number;
  /** Tick granularity. 200 on every letscash pool so far. */
  readonly tickSpacing: number;
  /** The hook contract. */
  readonly hooks: Address;
}

/**
 * letscash pools carry **no LP fee at all**.
 *
 * The entire fee is taken by the hook, on the quote leg, in `beforeSwap`. So a
 * "1% pool" has `fee: 0` in its key — describing it by its LP fee is wrong,
 * and building a key with a non-zero fee produces an id that matches nothing.
 */
export const LETSCASH_POOL_FEE = 0 as const;

/** Tick spacing used by every config published so far. */
export const DEFAULT_TICK_SPACING = 200 as const;

const POOL_KEY_COMPONENTS = [
  { name: "currency0", type: "address" },
  { name: "currency1", type: "address" },
  { name: "fee", type: "uint24" },
  { name: "tickSpacing", type: "int24" },
  { name: "hooks", type: "address" },
] as const;

/**
 * The pool id for a key: `keccak256(abi.encode(key))`.
 *
 * Pure, and it will happily hash nonsense. Use `verifyPoolKey` or the token's
 * own `poolId()` if the inputs are not already trusted.
 */
export function poolIdOf(key: PoolKey): Hex {
  return keccak256(encodeAbiParameters([{ type: "tuple", components: POOL_KEY_COMPONENTS }], [key]));
}

/** Raised when a token would not sort above its quote. */
export class PoolOrderingError extends Error {
  override readonly name = "PoolOrderingError";
  constructor(
    readonly token: Address,
    readonly quote: Address,
  ) {
    super(
      `Token ${token} sorts below quote ${quote}, so it cannot be currency1. ` +
        `Every letscash token is mined to sort above its quote, so this means ` +
        `the token and quote arguments are the wrong way round, or the quote is ` +
        `not the one this token launched against.`,
    );
  }
}

/**
 * Builds the pool key for a launched token.
 *
 * v4 orders a key's currencies by address, and the factory mines every token's
 * address to sort above its quote — so the quote is always `currency0` and the
 * token always `currency1`. That ordering is asserted rather than fixed up:
 * silently swapping them would produce a key for a different pool, which is
 * precisely the failure this module exists to prevent.
 *
 * @throws {PoolOrderingError} If the token does not sort above the quote.
 */
export function buildPoolKey(args: {
  /** The launched token. */
  token: Address;
  /** The hook the token launched under. Read it from the token's `hook()`. */
  hook: Address;
  /** What the pool is quoted in. Defaults to native ether. */
  quote?: Address;
  /** Defaults to 200, which every config published so far uses. */
  tickSpacing?: number;
}): PoolKey {
  const quote = args.quote ?? NATIVE_CURRENCY;
  if (quote.toLowerCase() >= args.token.toLowerCase()) {
    throw new PoolOrderingError(args.token, quote);
  }
  return {
    currency0: quote,
    currency1: args.token,
    fee: LETSCASH_POOL_FEE,
    tickSpacing: args.tickSpacing ?? DEFAULT_TICK_SPACING,
    hooks: args.hook,
  };
}

/**
 * Checks a derived key against the id the pool actually launched with.
 *
 * The pool id is the one value that cannot be wrong, because the token stores
 * the id it was launched with. Everything else — hook, quote, spacing — is an
 * assumption, and this is how you find out an assumption was false before
 * signing anything.
 */
export function verifyPoolKey(key: PoolKey, expectedPoolId: Hex): boolean {
  return poolIdOf(key).toLowerCase() === expectedPoolId.toLowerCase();
}

/** Raised when a derived key does not reproduce the pool's real id. */
export class PoolKeyMismatchError extends Error {
  override readonly name = "PoolKeyMismatchError";
  constructor(
    readonly key: PoolKey,
    readonly expectedPoolId: Hex,
    readonly derivedPoolId: Hex,
  ) {
    super(
      `Derived pool key does not match the pool's real id.\n` +
        `  expected ${expectedPoolId}\n` +
        `  derived  ${derivedPoolId}\n` +
        `  key      quote=${key.currency0} token=${key.currency1} ` +
        `fee=${key.fee} spacing=${key.tickSpacing} hook=${key.hooks}\n` +
        `One of quote, tick spacing or hook is wrong for this token.`,
    );
  }
}

/**
 * `verifyPoolKey`, but throws with the mismatch spelled out.
 *
 * Use this on any path that ends in a signature. A pool key that hashes to
 * nothing costs a reverted transaction at best; on a swap it is the difference
 * between the pool you meant and one somebody else controls.
 *
 * @throws {PoolKeyMismatchError}
 */
export function assertPoolKey(key: PoolKey, expectedPoolId: Hex): void {
  const derived = poolIdOf(key);
  if (derived.toLowerCase() !== expectedPoolId.toLowerCase()) {
    throw new PoolKeyMismatchError(key, expectedPoolId, derived);
  }
}
