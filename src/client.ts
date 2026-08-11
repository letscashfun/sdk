/**
 * The client, and the plumbing every module shares.
 *
 * Read-only use needs nothing but a `PublicClient`. A `WalletClient` is only
 * required for writes, and asking for one you do not need is a good way to
 * make an indexer harder to run than it should be.
 */

import type {
  Account,
  Address,
  Hex,
  PublicClient,
  TransactionReceipt,
  WalletClient,
} from "viem";

import { factoryAbi } from "./abis/factory.js";
import { type Asset, ETHER, knownAsset } from "./amount.js";
import { erc20Abi } from "./abis/external.js";
import {
  type LetscashAddresses,
  ROBINHOOD_CHAIN_ID,
  getAddresses,
  isNativeCurrency,
} from "./chain.js";
import {
  type ConfigFilter,
  type LaunchConfig,
  type RawLaunchConfig,
  deriveConfig,
  matchesFilter,
} from "./configs.js";
import { InvalidArgumentError, WalletRequiredError, withDecodedErrors } from "./errors.js";
import { FeeStream } from "./fees.js";
import { RevenueConverter, SelfBurner } from "./keeper.js";
import {
  type LaunchResult,
  type LaunchTokenParams,
  type SocialsInput,
  launchToken,
} from "./launch.js";
import {
  type ImageInput,
  type Pinner,
  type PreparedMetadata,
  type VerifyOptions,
  prepareLaunchMetadata,
} from "./pinning.js";
import { LaunchSplitter } from "./splitter.js";
import { Token } from "./token.js";

/** What every module needs to talk to the chain. */
export interface ClientContext {
  readonly publicClient: PublicClient;
  readonly walletClient: WalletClient | undefined;
  readonly addresses: LetscashAddresses;
  readonly chainId: number;
  /** Resolves an address to a full asset, caching and reading decimals when unknown. */
  resolveAsset(address: Address): Promise<Asset>;
  /** Finds the module set a hook belongs to. Cached; sets never move. */
  moduleSetForHook(hook: Address): Promise<ModuleSet & { id: number }>;
}

/** The result of a write: what was simulated, and what actually landed. */
export interface TxResult<T = void> {
  /** The transaction hash. */
  readonly hash: Hex;
  /** The mined receipt. Always waited for. */
  readonly receipt: TransactionReceipt;
  /**
   * What the function returned, taken from the simulation.
   *
   * A simulated return is the value the call *would* produce against the state
   * at simulation time. For anything that must be exact — a claimed amount, a
   * launched token address — read it out of the receipt's logs instead, which
   * this package does wherever it matters.
   */
  readonly result: T;
}

/**
 * Options accepted by every write in this package.
 *
 * Every write waits for its receipt. There is deliberately no fire-and-forget
 * switch: {@link TxResult} guarantees a mined receipt, and a flag that made
 * that field sometimes-absent would push the check onto every caller — where
 * forgetting it means treating a reverted transaction as a success.
 */
export interface WriteOptions {
  /** Override the account. Defaults to the wallet client's own. */
  account?: Account | Address;
  /** Confirmations to wait for. Defaults to 1. */
  confirmations?: number;
}

export interface LetscashClientOptions {
  /** For reads. Required. */
  publicClient: PublicClient;
  /** For writes. Omit for a read-only client. */
  walletClient?: WalletClient;
  /**
   * Which chain's deployment to use.
   *
   * Defaults to the public client's chain, then to Robinhood Chain. Pass it
   * explicitly if your transport has no chain attached.
   */
  chainId?: number;
  /**
   * Override individual addresses.
   *
   * For forks and local rehearsals. Anything omitted keeps its mainnet value.
   */
  addresses?: Partial<LetscashAddresses>;
}

/**
 * The entry point.
 *
 * @example Read-only
 * ```ts
 * import { createPublicClient, http } from "viem";
 * import { LetscashClient, robinhoodChain } from "@letscashfun/sdk";
 *
 * const client = new LetscashClient({
 *   publicClient: createPublicClient({ chain: robinhoodChain, transport: http() }),
 * });
 *
 * const token = await client.token("0xfd45…");
 * console.log((await token.fees.claimable()).toString()); // "0.42 ETH"
 * ```
 *
 * @example With a wallet
 * ```ts
 * const client = new LetscashClient({
 *   publicClient,
 *   walletClient: createWalletClient({ account, chain: robinhoodChain, transport: http() }),
 * });
 * const token = await client.token("0xfd45…");
 * const { amount } = await token.fees.claim();
 * ```
 */
export class LetscashClient {
  readonly publicClient: PublicClient;
  readonly walletClient: WalletClient | undefined;
  readonly addresses: LetscashAddresses;
  readonly chainId: number;

  /** Assets resolved so far. Decimals never change, so this never expires. */
  readonly #assetCache = new Map<string, Asset>();
  /** Module sets by id, and the same sets indexed by hook. Both immutable once published. */
  readonly #moduleSets = new Map<number, ModuleSet>();
  readonly #moduleSetsByHook = new Map<string, ModuleSet & { id: number }>();
  /** The launch menu, once read. Rows are immutable, but `enabled` is not. */
  #menuCache: LaunchConfig[] | undefined;

  constructor(options: LetscashClientOptions) {
    this.publicClient = options.publicClient;
    this.walletClient = options.walletClient;
    this.chainId = options.chainId ?? options.publicClient.chain?.id ?? ROBINHOOD_CHAIN_ID;
    // getAddresses throws for an unsupported chain, which is the right moment
    // to find out — before any call is built against addresses that do not exist.
    this.addresses = { ...getAddresses(this.chainId), ...options.addresses };
  }

  /** Internal handle passed to the other modules. */
  get context(): ClientContext {
    return {
      publicClient: this.publicClient,
      walletClient: this.walletClient,
      addresses: this.addresses,
      chainId: this.chainId,
      resolveAsset: (address) => this.resolveAsset(address),
      moduleSetForHook: (hook) => this.getModuleSetForHook(hook),
    };
  }

  /**
   * Resolves an address into a full asset.
   *
   * Known quotes are answered from a table. Anything else has its `decimals`
   * and `symbol` read off the contract — never assumed, because assuming 18 is
   * how a six-decimal balance ends up reported as a trillion times itself.
   */
  async resolveAsset(address: Address): Promise<Asset> {
    if (isNativeCurrency(address)) return ETHER;

    const key = address.toLowerCase();
    const cached = this.#assetCache.get(key);
    if (cached) return cached;

    const known = knownAsset(address);
    if (known) {
      this.#assetCache.set(key, known);
      return known;
    }

    const [decimals, symbol] = await Promise.all([
      this.publicClient.readContract({ address, abi: erc20Abi, functionName: "decimals" }),
      this.publicClient.readContract({ address, abi: erc20Abi, functionName: "symbol" }),
    ]);
    const asset: Asset = { address, symbol, decimals };
    this.#assetCache.set(key, asset);
    return asset;
  }

  // ————————————————————————— the launch menu —————————————————————————

  /**
   * Reads the whole launch menu.
   *
   * Filters to enabled rows by default, which is almost always what you want:
   * a disabled row reverts `ConfigDisabled` at launch.
   *
   * @example
   * ```ts
   * const usdgSelfBurn = await client.getConfigs({ quote: "USDG", selfBurn: true });
   * ```
   */
  async getConfigs(filter: ConfigFilter = {}): Promise<LaunchConfig[]> {
    const menu = this.#menuCache ?? (await this.#readMenu());
    return menu.filter((config) => matchesFilter(config, filter));
  }

  /**
   * The one row matching a filter, or an error saying why there isn't one.
   *
   * `const [config] = await getConfigs(...)` is the natural way to pick a row
   * and the wrong one: it takes whichever matched first and says nothing when
   * several did. That was harmless while every quote and fee tier named exactly
   * one row, and stops being harmless the moment a second supply is published —
   * the same filter then matches two, and the launch quietly gets whichever was
   * published earlier.
   *
   * This refuses instead, and the error names the rows it could not choose
   * between, so the fix is visible from the message.
   *
   * @example
   * ```ts
   * const config = await client.selectConfig({
   *   quote: "ETH",
   *   feePercent: 1,
   *   supplyTokens: 10_000_000_000,
   * });
   * ```
   *
   * @throws {InvalidArgumentError} If no row matches, or more than one does.
   */
  async selectConfig(filter: ConfigFilter = {}): Promise<LaunchConfig> {
    const matches = await this.getConfigs(filter);
    const described = JSON.stringify(filter);

    if (matches.length === 1) return matches[0]!;

    if (matches.length === 0) {
      const enabled = await this.getConfigs({});
      throw new InvalidArgumentError(
        `No enabled launch config matches ${described}. ` +
          `${enabled.length} rows are launchable right now: ` +
          `${enabled.map((c) => `#${c.id} ${c.quote.symbol} ${c.feePercent}% ${c.supplyTokens.toLocaleString("en-US")}${c.selfBurn ? " self-burn" : ""}`).join(", ")}.`,
      );
    }

    // The fields that actually differ are the ones worth naming, since those
    // are what the caller has to add to the filter to resolve it.
    const differing = (["supplyTokens", "feePercent", "selfBurn"] as const).filter(
      (key) => new Set(matches.map((c) => c[key])).size > 1,
    );
    throw new InvalidArgumentError(
      `${matches.length} launch configs match ${described}, so this cannot pick one: ` +
        `${matches.map((c) => `#${c.id} (${c.supplyTokens.toLocaleString("en-US")} supply, ${c.feePercent}%)`).join(", ")}. ` +
        (differing.length > 0
          ? `Add ${differing.map((k) => `\`${k}\``).join(" or ")} to the filter.`
          : `Pass the id to \`getConfig\` instead.`),
    );
  }

  /**
   * Every published row, enabled or not.
   *
   * `getConfigs()` hides disabled rows, and there is no filter value that
   * un-hides them — `{ enabled: undefined }` is indistinguishable from omitting
   * the key, so it still means "enabled only". This is the way to see the full
   * published set.
   *
   * Useful for tooling that wants to show what exists rather than what can be
   * launched: rows are published ahead of being switched on, so the disabled
   * ones are a preview of what is coming.
   */
  async getAllConfigs(): Promise<LaunchConfig[]> {
    return this.#menuCache ?? (await this.#readMenu());
  }

  /**
   * Reads one row by id.
   *
   * @throws {InvalidArgumentError} If no such row exists.
   */
  async getConfig(id: number): Promise<LaunchConfig> {
    const menu = this.#menuCache ?? (await this.#readMenu());
    const found = menu.find((config) => config.id === id);
    if (!found) {
      const ids = menu.map((c) => c.id);
      throw new InvalidArgumentError(
        `No launch config ${id}. Published ids: ${ids[0]}–${ids[ids.length - 1]}.`,
      );
    }
    return found;
  }

  /** Drops the cached menu, so the next read picks up newly published rows. */
  refreshConfigs(): void {
    this.#menuCache = undefined;
  }

  async #readMenu(): Promise<LaunchConfig[]> {
    const factory = this.addresses.factory;
    const [firstId, count] = await Promise.all([
      this.publicClient.readContract({ address: factory, abi: factoryAbi, functionName: "FIRST_CONFIG_ID" }),
      this.publicClient.readContract({ address: factory, abi: factoryAbi, functionName: "configCount" }),
    ]);

    const ids: number[] = [];
    for (let id = Number(firstId); id < Number(count); id++) ids.push(id);

    const raw = await Promise.all(
      ids.map((id) =>
        this.publicClient.readContract({
          address: factory,
          abi: factoryAbi,
          functionName: "getLaunchConfig",
          args: [BigInt(id)],
        }),
      ),
    );

    const configs: LaunchConfig[] = [];
    for (const [index, row] of raw.entries()) {
      const id = ids[index];
      // `exists` distinguishes a published row from an empty slot. A slot that
      // was never published decodes as all-zeros, which would otherwise look
      // like a legitimate free config with zero supply.
      if (id === undefined || !row.exists) continue;
      const quote = await this.resolveAsset(row.quote);
      configs.push(deriveConfig(id, row as RawLaunchConfig, quote));
    }

    this.#menuCache = configs;
    return configs;
  }

  /** The flat fee every launch must pay, in ether. */
  async getLaunchFee(): Promise<bigint> {
    return this.publicClient.readContract({
      address: this.addresses.factory,
      abi: factoryAbi,
      functionName: "launchFee",
    });
  }

  /** False when launching is paused platform-wide. */
  async isLaunchEnabled(): Promise<boolean> {
    return this.publicClient.readContract({
      address: this.addresses.factory,
      abi: factoryAbi,
      functionName: "launchEnabled",
    });
  }

  // ————————————————————————— launching —————————————————————————

  /**
   * Launches a token.
   *
   * Handles the mandatory salt mining and its retries, picks the right
   * entrypoint, computes `value` correctly for the config's quote, and signs a
   * permit when a stablecoin first buy needs one.
   *
   * @example
   * ```ts
   * const config = await client.selectConfig({ quote: "ETH", feePercent: 1, supplyTokens: 1_000_000_000 });
   * const { token, poolId } = await client.launch({
   *   configId: config.id,
   *   name: "My Coin",
   *   symbol: "MINE",
   * });
   * ```
   */
  async launch(params: LaunchTokenParams, options?: WriteOptions): Promise<LaunchResult> {
    const config = await this.getConfig(params.configId);
    return launchToken(this.context, params, config, options);
  }

  /**
   * Pins the image and metadata, then launches — the whole thing in one call.
   *
   * This is the streamlined path. Give it a name, a description, an image and
   * your links, plus a pinner holding your own credential, and the resulting
   * token is indistinguishable on a trading terminal from one launched through
   * letscash.fun: same document shape, same expanded social URLs, same
   * provider tags.
   *
   * The SDK never holds an IPFS credential — {@link pinataPinner} takes yours,
   * or implement {@link Pinner} against whatever you already use.
   *
   * The on-chain `socials` are filled from the **normalised** links unless you
   * override them, so the chain and the pinned document carry the same URLs. A
   * complete URL is the canonical on-chain shape; a bare handle there is not a
   * link and gets dropped, and the field cannot be edited after mint.
   *
   * @example
   * ```ts
   * const { token, poolId, metadataURI } = await client.launchWithMetadata({
   *   configId: config.id,
   *   name: "My Coin",
   *   symbol: "MINE",
   *   description: "the best coin",
   *   image: { path: "./mycoin.png" },
   *   twitter: "mycoin",
   *   telegram: "mycoin",
   *   website: "mycoin.xyz",
   *   pinner: pinataPinner(process.env.PINATA_JWT!),
   * });
   * ```
   */
  async launchWithMetadata(
    params: LaunchWithMetadataParams,
    options?: WriteOptions,
  ): Promise<LaunchResult & PreparedMetadata> {
    const {
      pinner,
      image,
      twitter,
      telegram,
      website,
      discord,
      socials,
      verifyPins,
      ...launchParams
    } = params;

    // Pinning and verification happen entirely before the transaction. If
    // either fails, nothing is launched — which is the only safe ordering,
    // since `logo` and `metadataURI` are set at mint and can never be edited.
    // A wasted pin is recoverable; a token that renders blank forever is not.
    const prepared = await prepareLaunchMetadata(
      pinner,
      {
        name: params.name,
        symbol: params.symbol,
        ...(params.description !== undefined && { description: params.description }),
        ...(image !== undefined && { image }),
        ...(twitter !== undefined && { twitter }),
        ...(telegram !== undefined && { telegram }),
        ...(website !== undefined && { website }),
        ...(discord !== undefined && { discord }),
      },
      verifyPins ?? {},
    );

    // The on-chain record takes the NORMALISED links, not the raw input.
    //
    // A complete URL for every field is the canonical on-chain shape — the
    // website's own normalisers say so and call it load-bearing, and they
    // still carry legacy readers for coins launched before that was true.
    // Writing a bare handle here reproduces exactly that old bug, and the
    // field cannot be edited after mint.
    //
    // `prepared.metadata` already holds the expanded URLs, so sourcing them
    // from the raw inputs one line below it would compute the right value,
    // pin it, and then write the wrong one to the chain.
    const result = await this.launch(
      {
        ...launchParams,
        logo: prepared.logo,
        metadataURI: prepared.metadataURI,
        socials: socials ?? {
          ...(prepared.metadata.twitter !== undefined && { twitter: prepared.metadata.twitter }),
          ...(prepared.metadata.telegram !== undefined && { telegram: prepared.metadata.telegram }),
          ...(prepared.metadata.discord !== undefined && { discord: prepared.metadata.discord }),
          ...(prepared.metadata.website !== undefined && { website: prepared.metadata.website }),
        },
      },
      options,
    );

    return { ...result, ...prepared };
  }

  // ————————————————————————— handles —————————————————————————

  /**
   * Resolves a launched token.
   *
   * Async because it reads the pool id, hook and quote off the token once and
   * verifies they agree. Everything on the returned object is then a plain
   * property, so this is the only await you pay for identity.
   *
   * @example
   * ```ts
   * const token = await client.token("0xfd45…");
   * token.poolId;                       // known, not derived
   * await token.fees.claimable();       // "0.42 ETH"
   * ```
   */
  async token(address: Address): Promise<Token> {
    return Token.resolve(this.context, address);
  }

  /**
   * A fee stream for a pool you already know the id and hook of.
   *
   * Synchronous, and skips the verification `token()` does. For bots that
   * stored a pool id at launch and do not want a lookup on every tick.
   */
  feeStream(poolId: Hex, hook?: Address): FeeStream {
    const resolved = hook ?? this.addresses.knownHooks[0];
    if (!resolved) throw new InvalidArgumentError("No hook known for this chain.");
    return new FeeStream(this.context, poolId, resolved);
  }

  /**
   * Calls back for every token launched from now on.
   *
   * The whole feed, not one pool — for an indexer, a Discord bot, or anything
   * that wants to see new coins as they appear.
   *
   * @returns An unsubscribe function.
   */
  watchLaunches(
    callback: (launch: { token: Address; poolId: Hex; creator: Address; configId: bigint }) => void,
  ): () => void {
    return this.publicClient.watchContractEvent({
      address: this.addresses.factory,
      abi: factoryAbi,
      eventName: "TokenLaunched",
      onLogs: (logs) => {
        for (const log of logs) {
          const args = log.args as {
            token?: Address;
            poolId?: Hex;
            creator?: Address;
            configId?: bigint;
          };
          if (!args.token || !args.poolId || !args.creator || args.configId === undefined) continue;
          callback({
            token: args.token,
            poolId: args.poolId,
            creator: args.creator,
            configId: args.configId,
          });
        }
      },
    });
  }

  /**
   * The contracts a given config builds tokens from.
   *
   * @throws {InvalidArgumentError} If no such module set exists. An unpublished
   *         id decodes as four zero addresses and an `exists` of false — so
   *         dropping the flag would hand back a set that looks structurally
   *         fine and routes every comparison against it to the zero address.
   */
  async getModuleSet(moduleSetId: bigint | number = 0n): Promise<ModuleSet> {
    const id = Number(moduleSetId);
    const cached = this.#moduleSets.get(id);
    if (cached) return cached;

    const modules = await this.publicClient.readContract({
      address: this.addresses.factory,
      abi: factoryAbi,
      functionName: "getModuleSet",
      args: [BigInt(moduleSetId)],
    });
    if (!modules.exists) {
      throw new InvalidArgumentError(
        `No module set ${moduleSetId} has been published. Valid ids run from 0 to ` +
          `moduleSetCount() - 1.`,
      );
    }
    const set: ModuleSet = {
      hook: modules.hook,
      tokenMaster: modules.tokenMaster,
      selfBurner: modules.selfBurner,
      splitterMaster: modules.splitterMaster,
    };
    // Published once and never edited — the same reasoning as the asset cache,
    // where decimals never change either. Only a published set is cached; a
    // missing one throws above and is re-checked next time, so a set published
    // after this client was constructed is still found.
    this.#moduleSets.set(id, set);
    return set;
  }

  /**
   * The module set a given hook belongs to.
   *
   * Tokens record their hook, not their module set, so this is how a token
   * finds its own burner and splitter master. Searching beats assuming set
   * zero: that is right only while one set exists, and silently wrong for
   * every token launched after a second one ships.
   *
   * Cached by hook, because the obvious caller is an indexer classifying a
   * list of tokens — `isSelfBurn()` per token, each costing `1 + n` round
   * trips uncached. Module sets never move, so there is nothing to invalidate.
   *
   * @throws {InvalidArgumentError} If no published set uses that hook.
   */
  async getModuleSetForHook(hook: Address): Promise<ModuleSet & { id: number }> {
    const needle = hook.toLowerCase();
    const cached = this.#moduleSetsByHook.get(needle);
    if (cached) return cached;

    const count = await this.publicClient.readContract({
      address: this.addresses.factory,
      abi: factoryAbi,
      functionName: "moduleSetCount",
    });

    for (let id = 0; id < Number(count); id++) {
      const set = await this.getModuleSet(id);
      // Every set seen on the way is worth keeping, not only the match — a
      // second lookup for a different hook then costs nothing.
      this.#moduleSetsByHook.set(set.hook.toLowerCase(), { ...set, id });
      if (set.hook.toLowerCase() === needle) return { ...set, id };
    }
    throw new InvalidArgumentError(
      `No published module set uses hook ${hook}. Either the hook predates this ` +
        `factory, or the SDK is pointed at the wrong deployment.`,
    );
  }

  /** A bound splitter. Prefer `token.splitter()`, which knows the quote already. */
  splitter(address: Address, quote: Asset): LaunchSplitter {
    return new LaunchSplitter(this.context, address, quote);
  }

  /**
   * The self-burner for a module set.
   *
   * Its `burn` is permissionless and pays a bounty, so this is the one keeper
   * job that pays for itself.
   */
  async selfBurner(moduleSetId: bigint | number = 0n): Promise<SelfBurner> {
    const { selfBurner } = await this.getModuleSet(moduleSetId);
    return new SelfBurner(this.context, selfBurner);
  }

  /** The platform's revenue converter. Permissionless, but pays no bounty. */
  revenueConverter(): RevenueConverter {
    return new RevenueConverter(this.context, this.addresses.revenueConverter);
  }
}

/**
 * A launch that pins its own metadata.
 *
 * The links are given once, as bare handles if you like, and end up in both
 * places they need to be — expanded to complete URLs in the pinned document
 * AND in the on-chain `socials`. A complete URL is the canonical on-chain
 * shape; a bare handle there is not a link and terminals drop it.
 */
export interface LaunchWithMetadataParams
  extends Omit<LaunchTokenParams, "logo" | "metadataURI" | "socials"> {
  /** Where to pin. `pinataPinner(jwt)`, or your own {@link Pinner}. */
  pinner: Pinner;
  /** A file path, raw bytes, or an already-pinned URI. */
  image?: ImageInput;
  /** Bare handle or full URL. */
  twitter?: string;
  /** Bare handle or full URL. */
  telegram?: string;
  /** Bare domain or full URL. */
  website?: string;
  /** Invite path or full URL. */
  discord?: string;
  /**
   * Override what goes on chain.
   *
   * Defaults to the links above, which is almost always right — setting this
   * separately is how the site's display and the terminals' drift apart.
   */
  socials?: SocialsInput;
  /**
   * How hard to confirm the pins took before launching. Verification is **on
   * by default**; this only tunes it.
   *
   * `{ verify: false }` skips the read-back. Reasonable only when pinning
   * somewhere with no public gateway, or when you have confirmed the content
   * yourself — a launch against a pin that silently failed produces a token
   * that renders blank permanently.
   */
  verifyPins?: VerifyOptions;
}

/** The contracts a module set is made of. */
export interface ModuleSet {
  readonly hook: Address;
  readonly tokenMaster: Address;
  readonly selfBurner: Address;
  readonly splitterMaster: Address;
}

// ————————————————————————— shared write plumbing —————————————————————————

/**
 * The account a write will be sent from.
 *
 * @throws {WalletRequiredError} If the client has no wallet.
 * @throws {InvalidArgumentError} If the wallet has no account and none was given.
 */
export function requireAccount(
  ctx: ClientContext,
  operation: string,
  override?: Account | Address,
): Account | Address {
  if (override) return override;
  if (!ctx.walletClient) throw new WalletRequiredError(operation);
  const account = ctx.walletClient.account;
  if (!account) {
    throw new InvalidArgumentError(
      `${operation} needs an account. The wallet client has none attached — ` +
        `either construct it with \`account\`, or pass \`{ account }\` to this call.`,
    );
  }
  return account;
}

/**
 * A contract call, as the modules in this package describe one.
 *
 * Deliberately structural rather than viem's own `SimulateContractParameters`.
 * That type is a large conditional union keyed on the ABI and function name,
 * which is exactly what you want at a call site — and unusable as the return
 * type of a generic builder, where neither is known statically.
 */
export interface WriteRequest {
  address: Address;
  abi: readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
}

/**
 * Simulates a write, sends it, and waits for the receipt.
 *
 * Simulating first is the whole point. A contract revert then surfaces as a
 * decoded {@link ContractRevertError} with a hint attached, before a
 * transaction is signed — rather than as a mined failure that cost gas and
 * says nothing but "execution reverted".
 */
export async function executeWrite<T>(
  ctx: ClientContext,
  operation: string,
  options: WriteOptions | undefined,
  build: (account: Account | Address) => WriteRequest,
): Promise<TxResult<T>> {
  const account = requireAccount(ctx, operation, options?.account);
  const wallet = ctx.walletClient;
  if (!wallet) throw new WalletRequiredError(operation);

  return withDecodedErrors(async () => {
    const simulated = await ctx.publicClient.simulateContract({
      ...build(account),
      account,
    } as unknown as Parameters<PublicClient["simulateContract"]>[0]);

    const hash = await wallet.writeContract(
      simulated.request as Parameters<WalletClient["writeContract"]>[0],
    );

    const receipt = await ctx.publicClient.waitForTransactionReceipt({
      hash,
      confirmations: options?.confirmations ?? 1,
    });

    // A mined-but-reverted transaction is not a success. viem does not throw
    // for it, so it has to be checked, or a caller reads `result` from the
    // simulation and believes something happened that did not.
    if (receipt.status !== "success") {
      throw new InvalidArgumentError(
        `${operation} reverted on chain (${hash}). It simulated cleanly, so state ` +
          `changed between simulation and inclusion — usually another transaction ` +
          `took the same funds or window first.`,
      );
    }

    return { hash, receipt, result: simulated.result as T };
  });
}
