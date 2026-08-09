/**
 * Turning contract reverts into errors you can act on.
 *
 * A custom error reaches the caller as four bytes. viem decodes the name for
 * you, but a name alone still leaves you guessing: `VanityAddressRequired`
 * does not tell anyone that salts have to come from `mineSalt`, and
 * `UnknownPool` almost always means the pool id was derived wrong rather than
 * that the pool is missing.
 *
 * So every error the contracts can raise gets a hint here, and the hint says
 * what to do rather than what happened.
 */

import { BaseError, ContractFunctionRevertedError } from "viem";

/** Base class for everything this package throws. */
export class LetscashError extends Error {
  override readonly name: string = "LetscashError";
}

/**
 * What to tell someone who hit a given contract error.
 *
 * Keyed by the Solidity error name. Overlapping names across contracts (both
 * the hook and the splitter raise `AmountNotOwed`) share one entry, because
 * the advice is the same.
 */
const HINTS: Readonly<Record<string, string>> = {
  // ——— launching ———
  SaltNotFound:
    "The salt search window was exhausted without a hit. This is expected " +
    "occasionally — call mineSalt again with `start` advanced past the window " +
    "you just tried. The SDK's launch() retries automatically.",
  VanityAddressRequired:
    "The salt did not produce a token address ending in 'cc'. Salts must come " +
    "from mineSalt(); an arbitrary salt is always rejected.",
  QuoteMustSortFirst:
    "The token address would sort below its quote, so it cannot be currency1. " +
    "mineSalt() only returns salts that satisfy this — re-mine rather than " +
    "reusing a salt across configs, since the quote can differ between them.",
  CreatorMustBeSender:
    "params.creator must equal the address sending the transaction. To send " +
    "the fee stream elsewhere, launch with a fee split naming that address, or " +
    "launch as yourself and call updateCreator afterwards.",
  IncorrectValue:
    "msg.value did not match what the launch costs. Send launchFee(), plus " +
    "firstBuyIn on top when the config's quote is native ether. On a USDG " +
    "config, firstBuyIn is pulled as an ERC-20 and must NOT be added to value.",
  ConfigDisabled:
    "That config exists but is switched off. Read the menu and filter on " +
    "`enabled` rather than hardcoding an id — rows get enabled and disabled " +
    "without any redeployment.",
  InvalidConfigId:
    "No such config. Valid ids run from FIRST_CONFIG_ID() up to configCount().",
  LaunchesPaused: "Launching is paused platform-wide. Nothing you can do from the caller's side.",
  QuoteNotApproved:
    "That quote asset is not approved on the factory. Only approved quotes can " +
    "back a launch; read the menu to see which are in use.",
  FirstBuySlippage:
    "The first buy would have returned less than firstBuyMinOut. Raise your " +
    "slippage tolerance or lower firstBuyIn.",
  SupplyOutOfRange: "The config's supply is outside the factory's accepted bounds.",
  EmptyString: "A required metadata field was empty. Name and symbol must both be non-empty.",

  // ——— the permit path ———
  // Now that the signature's `v` is derived correctly, these are the realistic
  // reverts a stablecoin integrator meets — and they arrive on the path the
  // SDK enables by default.
  PermitFailed:
    "The permit did not grant the allowance the launch needed. Usual causes: the " +
    "quote token does not implement EIP-2612; its `version` differs from the '1' " +
    "assumed when it exposes no `version()`; or the nonce moved between signing " +
    "and sending, which another transaction from the same account will do. " +
    "Retrying signs a fresh permit. Passing `usePermit: false` falls back to a " +
    "plain approval, at the cost of a second transaction.",
  PermitNotApplicable:
    "A permit was supplied for a launch that pulls nothing — an ether-quoted " +
    "config, or a stablecoin one with no first buy. Drop the first buy or drop " +
    "the permit; the SDK only signs one when the quote is an ERC-20 and " +
    "firstBuy is above zero.",
  PermitValueMismatch:
    "The permit was signed for a different amount than the launch is pulling. " +
    "Sign for exactly `firstBuyIn`; a permit for more is refused rather than " +
    "partially spent.",

  // ——— the converter ———
  ConvertedThisBlock: "One conversion per block. Wait for the next one.",
  NoRoute: "No conversion route is published for that quote asset.",
  OracleNotReady: "The route's price oracle has no usable observation yet.",
  RingTooShort:
    "The pool's observation ring is too short for the route's TWAP window. This is " +
    "a route configuration problem on the platform's side, not a caller error.",
  SlippageExceeded:
    "The fill fell outside the route's price band. Usually the sale is too large " +
    "for current depth rather than anything being broken — read quoteFloor() to " +
    "see the reference price and the floor it must clear.",
  PoolHasNoLiquidity: "The route's pool has no active liquidity to fill against.",
  IncompleteFill: "The swap did not consume the whole input, so it was rejected rather than partly filled.",

  // ——— generic, but worth naming ———
  ZeroAddress: "An address argument was the zero address, which this call refuses.",
  Reentrancy: "A guarded function was re-entered.",

  // ——— fee routes ———
  InvalidFeeRoute:
    "The fee split is malformed. Shares must sum to exactly 10000, no recipient " +
    "may be the zero address, and a single recipient must hold the full 10000.",
  FeeRouteForbidden:
    "A recipient is a protocol address. The factory, hook, pool manager, quote " +
    "token, the token being launched, and the module templates are all refused.",
  SharesMustSumToDenominator: "Splitter shares must sum to exactly 10000 basis points.",
  DuplicateRecipient: "The same address appears twice in the split. Each may hold one slot only.",
  ZeroShare: "A recipient was given zero basis points. Remove them instead.",
  InvalidRecipientCount: "Too few or too many recipients for a splitter.",
  SelfPayment: "A payment destination pointed back at the contract making the payment.",

  // ——— claiming ———
  NotCreator:
    "Only the pool's current fee recipient may claim. Read poolConfigs(poolId).creator " +
    "to see who that is — if the stream was handed on with updateCreator, it is " +
    "no longer whoever launched the token.",
  UnknownPool:
    "This hook has no record of that pool. Nine times out of ten the pool id was " +
    "derived from the wrong quote, tick spacing or hook, rather than the pool " +
    "being missing. Read poolId() off the token instead of deriving it.",
  AmountNotOwed:
    "You asked for more than the balance. Read tab() + pending() first — claim " +
    "sweeps internally, so the claimable total is both together, not tab alone.",
  NothingOwed: "Nothing is allocated to you. Call distribute() first if revenue has arrived but not been split.",
  NotARecipient: "That address holds no slot in this splitter.",
  EthTransferFailed:
    "The destination rejected native ether. A contract with no payable receive() " +
    "cannot be paid directly — use the claim(poolId, to) form and name somewhere " +
    "that can accept it.",

  // ——— burning ———
  NothingToBurn: "No fees have accrued to burn yet.",
  BurnedThisBlock: "The self-burner allows one burn per block. Wait for the next one.",
  NotFeeRecipient: "This pool's fee stream does not point at the self-burner, so there is nothing for it to burn.",

  // ——— generic plumbing ———
  NotFactory: "Only the factory may call that. It is not part of the public surface.",
  NotPoolManager: "Only Uniswap's PoolManager may call that. It is a hook callback, not an entry point.",
  OwnableUnauthorizedAccount: "That function is owner-only and the caller is not the owner.",
  ReentrancyGuardReentrantCall: "Re-entered a guarded function.",
  SafeERC20FailedOperation: "An ERC-20 call failed. Usually an allowance or balance shortfall on the token named in the error.",
};

/**
 * A decoded contract revert.
 *
 * `hint` is populated when the error is one this package knows about; it is
 * the field worth showing a user.
 */
export class ContractRevertError extends LetscashError {
  override readonly name = "ContractRevertError";
  constructor(
    /** The Solidity error name, e.g. `"SaltNotFound"`. */
    readonly errorName: string,
    /** Decoded arguments, if the error carries any. */
    readonly args: readonly unknown[],
    /** What to do about it, when known. */
    readonly hint: string | undefined,
    /** The original viem error, for anything this did not capture. */
    override readonly cause: unknown,
  ) {
    const argText = args.length > 0 ? `(${args.map(String).join(", ")})` : "";
    super(hint ? `${errorName}${argText}: ${hint}` : `${errorName}${argText}`);
  }
}

/**
 * Pulls a typed error out of whatever viem threw.
 *
 * Returns `undefined` when the failure was not a contract revert — a dropped
 * connection, a rejected signature, a gas estimation failure — because those
 * are not ours to reinterpret.
 */
export function decodeRevert(error: unknown): ContractRevertError | undefined {
  if (!(error instanceof BaseError)) return undefined;

  const reverted = error.walk((e) => e instanceof ContractFunctionRevertedError);
  if (!(reverted instanceof ContractFunctionRevertedError)) return undefined;

  const name = reverted.data?.errorName;
  if (!name) return undefined;

  return new ContractRevertError(name, reverted.data?.args ?? [], HINTS[name], error);
}

/**
 * Runs a call, and rethrows any contract revert as a {@link ContractRevertError}.
 *
 * Every write in this package goes through here, so callers can catch one type
 * and read `errorName` rather than string-matching viem's message.
 *
 * @example
 * ```ts
 * try {
 *   await client.token(addr).fees.claim();
 * } catch (error) {
 *   if (error instanceof ContractRevertError && error.errorName === "NotCreator") {
 *     // the stream was handed on
 *   }
 * }
 * ```
 */
export async function withDecodedErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw decodeRevert(error) ?? error;
  }
}

/** Raised when an argument is wrong before anything reaches the chain. */
export class InvalidArgumentError extends LetscashError {
  override readonly name = "InvalidArgumentError";
}

/** Raised when a write is attempted on a client with no wallet attached. */
export class WalletRequiredError extends LetscashError {
  override readonly name = "WalletRequiredError";
  constructor(operation: string) {
    super(
      `${operation} sends a transaction, but this client has no wallet. ` +
        `Pass a viem WalletClient as \`walletClient\` when constructing the client.`,
    );
  }
}
