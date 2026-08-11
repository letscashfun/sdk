/**
 * @letscashfun/sdk — the letscash.fun launchpad, as a typed TypeScript API.
 *
 * Launch tokens, read and claim fee streams, move a stream elsewhere, trade,
 * and run the permissionless keeper jobs, without reimplementing the parts of
 * the protocol that are not visible in an ABI.
 *
 * ## Quickstart
 *
 * ```ts
 * import { createPublicClient, createWalletClient, http } from "viem";
 * import { privateKeyToAccount } from "viem/accounts";
 * import { Amount, LetscashClient, robinhoodChain } from "@letscashfun/sdk";
 *
 * const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
 * const client = new LetscashClient({
 *   publicClient: createPublicClient({ chain: robinhoodChain, transport: http() }),
 *   walletClient: createWalletClient({ account, chain: robinhoodChain, transport: http() }),
 * });
 *
 * // Launch, fees to the launching account
 * const config = await client.selectConfig({ quote: "ETH", feePercent: 1, supplyTokens: 1_000_000_000 });
 * const { token, poolId } = await client.launch({
 *   configId: config.id,
 *   name: "My Coin",
 *   symbol: "MINE",
 * });
 *
 * // Later: claim what it has earned
 * const coin = await client.token(token);
 * console.log((await coin.fees.claimable()).toString()); // "0.42 ETH"
 * const { amount } = await coin.fees.claim();
 * ```
 *
 * ## Three things worth reading before you build
 *
 * 1. **Never derive a pool id if you can read one.** `client.token(address)`
 *    reads it off the token and verifies it. A key you assemble yourself
 *    hashes to a valid-looking id for a pool that does not exist, and every
 *    read then returns zero — indistinguishable from "no fees yet".
 * 2. **`claim` sweeps for you**, so the claimable total is `tab + pending`.
 *    A bot thresholding on `tab` alone sees zero while fees accrue. Use
 *    {@link FeeStream.claimable}.
 * 3. **Amounts carry their decimals.** A USDG pool pays in 6-decimal USDG, an
 *    ether pool in 18-decimal wei. {@link Amount} keeps them apart; mixing
 *    them throws rather than silently reporting a number a trillion times off.
 */

// ——— entry point ———
export {
  LetscashClient,
  type ClientContext,
  type LaunchWithMetadataParams,
  type LetscashClientOptions,
  type ModuleSet,
  type TxResult,
  type WriteOptions,
  type WriteRequest,
} from "./client.js";

// ——— pinning ———
// You bring the credential; the SDK never holds one. `pinataPinner` is the
// batteries-included option because it is what letscash.fun uses, but `Pinner`
// is an interface — anyone can pin anywhere.
export {
  pinataPinner,
  prepareLaunchMetadata,
  type ImageInput,
  type PrepareMetadataInput,
  type PreparedMetadata,
  type VerifyOptions,
  PinVerificationError,
  type Pinner,
} from "./pinning.js";

// ——— chain and addresses ———
export {
  NATIVE_CURRENCY,
  ROBINHOOD_CHAIN_ID,
  UnsupportedChainError,
  getAddresses,
  isKnownHook,
  isNativeCurrency,
  isSupportedChain,
  robinhoodChain,
  type LetscashAddresses,
} from "./chain.js";

// ——— amounts ———
export { Amount, AssetMismatchError, ETHER, USDG, knownAsset, type Asset } from "./amount.js";

// ——— the launch menu ———
export {
  BPS_DENOMINATOR,
  PIPS_PER_100_PERCENT,
  deriveConfig,
  matchesFilter,
  type ConfigFilter,
  type LaunchConfig,
  type RawLaunchConfig,
} from "./configs.js";

// ——— launching ———
export {
  MAX_FEE_RECIPIENTS,
  launchToken,
  mineSalt,
  recoveryId,
  validateLaunch,
  type FeeRecipient,
  type LaunchResult,
  type LaunchTokenParams,
  type SaltMiningOptions,
  type SocialsInput,
} from "./launch.js";

// ——— tokens ———
export { Token, type Socials, type TokenMetadata as TokenOnChainMetadata } from "./token.js";

// ——— metadata for terminals ———
// This package builds the document; it never pins it. You pin, with whatever
// provider you like, and pass the URI to `launch`.
export {
  assertResolvableUri,
  checkTokenMetadata,
  buildTokenMetadata,
  type TokenMetadata,
  type MetadataCheck,
  type MetadataWarning,
  type TokenMetadataInput,
} from "./metadata.js";

// ——— fee streams ———
export {
  FeeStream,
  type ClaimResult,
  type PoolFeeConfig,
  type SweepResult,
} from "./fees.js";

// ——— pool identity ———
export {
  DEFAULT_TICK_SPACING,
  LETSCASH_POOL_FEE,
  PoolKeyMismatchError,
  PoolOrderingError,
  assertPoolKey,
  buildPoolKey,
  poolIdOf,
  verifyPoolKey,
  type PoolKey,
} from "./pool.js";

// ——— trading ———
export {
  HIGH_SLIPPAGE_BPS,
  MAX_SLIPPAGE_BPS,
  PERMIT2_APPROVAL_TTL_SECONDS,
  Trader,
  encodeV4Swap,
  type SwapQuote,
  type SwapResult,
} from "./trade.js";

// ——— fee splitters ———
export {
  LaunchSplitter,
  type DistributeResult,
  type SlotInfo,
  type SplitSlice,
} from "./splitter.js";

// ——— the permissionless lane ———
export { RevenueConverter, SelfBurner, type BurnResult } from "./keeper.js";

// ——— errors ———
export {
  ContractRevertError,
  InvalidArgumentError,
  LetscashError,
  WalletRequiredError,
  decodeRevert,
  withDecodedErrors,
} from "./errors.js";

// ——— ABIs ———
// Also available as `@letscashfun/sdk/abis` on its own, and as plain JSON under
// `abis/` for anyone not using TypeScript.
export * from "./abis/index.js";
