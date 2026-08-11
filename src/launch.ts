/**
 * Launching a token.
 *
 * This is the part of the launchpad you cannot work out from the ABI, and the
 * reason a hand-rolled integration usually fails on the first try:
 *
 *  - **The salt is not free.** `launch` rejects any salt whose resulting token
 *    address does not end in `cc` *and* sort above the quote. Salts must come
 *    from `mineSalt`, which is a free `eth_call` that searches for one. A hit
 *    takes ~1000 tries against ether and roughly double that against an ERC-20
 *    quote, and a window can come up empty — so it needs retrying.
 *  - **There are three entrypoints**, picked by what the launch needs. Plain
 *    `launch` has no recipients parameter at all, so a fee split has to go
 *    through `launchWithFeeSplit`, and a stablecoin first buy through
 *    `launchWithPermit` if you want it in one transaction.
 *  - **`value` is not the launch fee.** It is the fee plus the first buy, but
 *    only when the quote is native. On a USDG config the first buy is pulled
 *    as an ERC-20, and adding it to `value` sends real ether into a call that
 *    never asked for it.
 *
 * {@link launchToken} handles all of it.
 */

import { decodeEventLog, parseSignature } from "viem";
import type { Account, Address, Hex, Log, TransactionReceipt } from "viem";

import { erc2612Abi, erc20Abi } from "./abis/external.js";
import { factoryAbi } from "./abis/factory.js";
import { type Asset, Amount } from "./amount.js";
import { isNativeCurrency } from "./chain.js";
import {
  type ClientContext,
  type TxResult,
  type WriteOptions,
  executeWrite,
  requireAccount,
} from "./client.js";
import { BPS_DENOMINATOR, type LaunchConfig } from "./configs.js";
import { InvalidArgumentError, WalletRequiredError, withDecodedErrors } from "./errors.js";
import { assertResolvableUri } from "./metadata.js";

/** Links attached to the token. Every field is optional. */
export interface SocialsInput {
  telegram?: string;
  twitter?: string;
  discord?: string;
  website?: string;
  extra?: string;
}

/**
 * The most addresses a fee split can name.
 *
 * `MAX_RECIPIENTS` on the splitter, checked against the deployed contract in
 * the e2e suite. Exceeding it reverts `InvalidRecipientCount`.
 */
export const MAX_FEE_RECIPIENTS = 4;

/** One slice of a split fee stream. */
export interface FeeRecipient {
  /** Who gets paid. */
  address: Address;
  /** Their share in basis points. All shares must sum to 10000. */
  shareBps: number;
}

/** How hard to search for a launchable salt. */
export interface SaltMiningOptions {
  /**
   * Salts to try per call. Default 4096.
   *
   * The search runs on the node as an `eth_call`, so this costs latency, not
   * gas. Larger windows mean fewer round trips but a slower single call.
   */
  rounds?: number;
  /** How many windows to try before giving up. Default 6. */
  maxAttempts?: number;
  /**
   * First salt to try. Default random.
   *
   * Randomising matters: a fixed start means two people launching at the same
   * moment mine the same salt, and the second transaction reverts.
   */
  start?: bigint;
}

export interface LaunchTokenParams {
  /** Which menu row to launch under. Read the menu; do not hardcode. */
  configId: number;
  /** Token name. Must be non-empty. */
  name: string;
  /** Token symbol. Must be non-empty. */
  symbol: string;

  /**
   * The token image, as an `ipfs://` or `https://` URI.
   *
   * You pin it. This package does not — pinning costs money and needs a
   * credential, and the SDK will not quietly spend someone else's.
   *
   * A bare CID is rejected: the contract would store it happily and the token
   * would render with no image, permanently, because these fields are set at
   * mint and cannot be edited afterwards.
   */
  logo?: string;
  description?: string;
  /**
   * URI of the pinned metadata JSON that trading terminals read.
   *
   * Build the document with {@link buildTokenMetadata} so it matches what the
   * launchpad's own form pins, then pin it wherever you like and pass the URI
   * here. Omitting it launches a token that terminals show without an image or
   * links — legal, and irreversible.
   */
  metadataURI?: string;
  /**
   * Socials stored **on chain**, separate from the pinned JSON.
   *
   * Bare handles are fine here — this is the contract's own record. The pinned
   * document needs full URLs instead, which `buildTokenMetadata` handles.
   */
  socials?: SocialsInput;

  /**
   * Buy your own token in the same transaction as the launch.
   *
   * Denominated in the config's quote. On an ether config this is added to
   * `value`; on a stablecoin config it is pulled as an ERC-20, which needs
   * either a permit signature or a standing allowance.
   */
  firstBuy?: Amount | bigint;
  /**
   * Minimum tokens the first buy must return. Default `0n`.
   *
   * Zero is the right default here, which is unusual enough to be worth
   * explaining. Slippage floors exist to stop a sandwich, and a launch cannot
   * be sandwiched: the pool is created, seeded and bought from inside a single
   * transaction, so there is no earlier state for anyone to trade against. The
   * output is fully determined by the config's supply and start tick, both of
   * which are immutable once published.
   *
   * Set it if you want belt and braces. A non-zero value that turns out too
   * high reverts the whole launch with `FirstBuySlippage`.
   */
  firstBuyMinOut?: bigint;

  /**
   * Where the fee stream goes.
   *
   * Omit and it goes to the launching account. One recipient at 10000 bps
   * names that address directly and deploys nothing. Two or more deploys a
   * splitter clone, up to {@link MAX_FEE_RECIPIENTS}. Shares must sum to
   * exactly 10000.
   *
   * Meaningless on a self-burn config, which routes the creator's share to the
   * burner instead — passing both is rejected.
   */
  feeRecipients?: FeeRecipient[];

  /** Tuning for the salt search. Defaults are fine. */
  saltMining?: SaltMiningOptions;

  /**
   * Use an EIP-2612 permit for a stablecoin first buy. Default true.
   *
   * Set false to fall back to a plain ERC-20 approval, which costs an extra
   * transaction. Needed only for a quote token that does not implement permit,
   * or a wallet that cannot sign typed data.
   */
  usePermit?: boolean;
}

/** What a launch produced. */
export interface LaunchResult extends TxResult<readonly [Address, Hex]> {
  /** The deployed token. */
  readonly token: Address;
  /** Its Uniswap v4 pool. Every later fee call needs this. */
  readonly poolId: Hex;
  /** The config it launched under. */
  readonly config: LaunchConfig;
  /** Where the fee stream points. */
  readonly feeRecipient: Address;
  /** The splitter clone, if one was deployed. */
  readonly splitter: Address | null;
  /** Tokens received from the first buy, if there was one. */
  readonly firstBuyOut: bigint;
}

/** The token metadata tuple, in the order the contract expects. */
interface TokenParamsTuple {
  name: string;
  symbol: string;
  logo: string;
  description: string;
  metadataURI: string;
  socials: {
    telegram: string;
    twitter: string;
    discord: string;
    website: string;
    extra: string;
  };
  creator: Address;
}

function buildTokenParams(params: LaunchTokenParams, creator: Address): TokenParamsTuple {
  return {
    name: params.name,
    symbol: params.symbol,
    logo: params.logo ?? "",
    description: params.description ?? "",
    metadataURI: params.metadataURI ?? "",
    socials: {
      telegram: params.socials?.telegram ?? "",
      twitter: params.socials?.twitter ?? "",
      discord: params.socials?.discord ?? "",
      website: params.socials?.website ?? "",
      extra: params.socials?.extra ?? "",
    },
    creator,
  };
}

/**
 * Everything the factory refuses as a fee recipient.
 *
 * The contract enforces this and reverts `FeeRouteForbidden`, but a revert
 * after a wallet prompt is a poor way to learn you named the hook by mistake.
 */
async function forbiddenRecipients(
  ctx: ClientContext,
  config: LaunchConfig,
): Promise<Set<string>> {
  const modules = await ctx.publicClient.readContract({
    address: ctx.addresses.factory,
    abi: factoryAbi,
    functionName: "getModuleSet",
    args: [config.moduleSetId],
  });
  return new Set(
    [
      ctx.addresses.factory,
      ctx.addresses.poolManager,
      config.quote.address,
      modules.hook,
      modules.tokenMaster,
      modules.selfBurner,
      modules.splitterMaster,
    ].map((a) => a.toLowerCase()),
  );
}

/**
 * Checks a launch before anything is signed.
 *
 * Everything here is also enforced on chain. It is duplicated because the
 * shares are fixed at launch and changeable by nobody afterwards — not the
 * creator, not the platform — so this is genuinely the last moment a wrong
 * number can be caught, and a decoded revert arrives too late to be useful.
 *
 * @throws {InvalidArgumentError}
 */
export async function validateLaunch(
  ctx: ClientContext,
  params: LaunchTokenParams,
  config: LaunchConfig,
): Promise<void> {
  if (params.name.trim() === "") throw new InvalidArgumentError("Token name cannot be empty.");
  if (params.symbol.trim() === "") throw new InvalidArgumentError("Token symbol cannot be empty.");

  // Both are opaque strings to the contract, so a bare CID launches happily
  // and the token simply renders with no image and no links anywhere. Caught
  // here because on chain it is unfixable — these fields are set at mint.
  assertResolvableUri(params.logo ?? "", "logo");
  assertResolvableUri(params.metadataURI ?? "", "metadataURI");

  if (!config.enabled) {
    throw new InvalidArgumentError(
      `Config ${config.id} is published but switched off, so launching under it ` +
        `reverts. Filter the menu on \`enabled\`.`,
    );
  }

  const recipients = params.feeRecipients;
  if (!recipients || recipients.length === 0) return;

  if (config.selfBurn) {
    throw new InvalidArgumentError(
      `Config ${config.id} is a self-burn config: the creator's share is routed to ` +
        `the burner and buys and burns the token, so there are no creator earnings ` +
        `to send anywhere. Drop feeRecipients, or pick a non-self-burn config.`,
    );
  }

  if (recipients.length > MAX_FEE_RECIPIENTS) {
    throw new InvalidArgumentError(
      `A fee split takes at most ${MAX_FEE_RECIPIENTS} recipients, got ${recipients.length}. ` +
        `The splitter has a fixed slot count. To pay more parties than that, point ` +
        `one slot at a contract of your own that fans out further.`,
    );
  }

  const total = recipients.reduce((sum, r) => sum + r.shareBps, 0);
  if (total !== BPS_DENOMINATOR) {
    throw new InvalidArgumentError(
      `Fee shares must sum to exactly ${BPS_DENOMINATOR} basis points (100%), got ${total}. ` +
        `Shares are fixed at launch and cannot be changed by anyone afterwards.`,
    );
  }

  const seen = new Set<string>();
  for (const recipient of recipients) {
    const key = recipient.address.toLowerCase();
    if (/^0x0{40}$/.test(key)) {
      throw new InvalidArgumentError("A fee recipient is the zero address.");
    }
    if (recipient.shareBps <= 0) {
      throw new InvalidArgumentError(
        `Recipient ${recipient.address} has a share of ${recipient.shareBps}. Remove them instead.`,
      );
    }
    if (seen.has(key)) {
      throw new InvalidArgumentError(
        `Recipient ${recipient.address} appears twice. Each address may hold one slot; ` +
          `combine their shares into a single entry.`,
      );
    }
    seen.add(key);
  }

  const forbidden = await forbiddenRecipients(ctx, config);
  for (const recipient of recipients) {
    if (forbidden.has(recipient.address.toLowerCase())) {
      throw new InvalidArgumentError(
        `Fee recipient ${recipient.address} is a protocol address. The factory, hook, ` +
          `pool manager, quote token and module templates are all refused.`,
      );
    }
  }
}

/**
 * Searches for a salt whose token address the factory will accept.
 *
 * Retries across successive windows, because a single window genuinely can
 * come up empty — the search is probabilistic, not deterministic.
 *
 * @throws {InvalidArgumentError} If every window is exhausted.
 */
export async function mineSalt(
  ctx: ClientContext,
  tokenParams: TokenParamsTuple,
  configId: number,
  sender: Address,
  options: SaltMiningOptions = {},
): Promise<{ salt: Hex; token: Address }> {
  const rounds = BigInt(options.rounds ?? 4096);
  const maxAttempts = options.maxAttempts ?? 6;

  // Random start by default. A fixed one means two simultaneous launches mine
  // the same salt and the slower transaction reverts.
  let start =
    options.start ??
    BigInt(`0x${Array.from(crypto.getRandomValues(new Uint8Array(8)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")}`);

  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const [salt, token] = await ctx.publicClient.readContract({
        address: ctx.addresses.factory,
        abi: factoryAbi,
        functionName: "mineSalt",
        args: [tokenParams, BigInt(configId), sender, start, rounds],
      });
      return { salt, token };
    } catch (error) {
      lastError = error;
      start += rounds;
    }
  }

  throw new InvalidArgumentError(
    `No launchable salt found after ${maxAttempts} windows of ${rounds} ` +
      `(${maxAttempts * Number(rounds)} candidates). This is very unlikely — a hit ` +
      `normally takes about a thousand tries. Check the config id is valid and that ` +
      `\`sender\` is the address that will actually send the transaction.`,
    { cause: lastError },
  );
}

/**
 * Signs an EIP-2612 permit letting the factory pull the first buy.
 *
 * `signer` must be the Account object when there is one, not just its address.
 * viem signs locally for an Account and forwards to `eth_signTypedData_v4` for
 * a bare address — and most nodes hold no key, so that path fails with
 * "No Signer available".
 */
async function signPermit(
  ctx: ClientContext,
  quote: Asset,
  signer: Account | Address,
  value: bigint,
): Promise<{ value: bigint; deadline: bigint; v: number; r: Hex; s: Hex }> {
  const wallet = ctx.walletClient;
  if (!wallet) throw new WalletRequiredError("Signing a permit");
  const owner = typeof signer === "string" ? signer : signer.address;

  const [nonce, name, version] = await Promise.all([
    ctx.publicClient.readContract({
      address: quote.address,
      abi: erc2612Abi,
      functionName: "nonces",
      args: [owner],
    }),
    ctx.publicClient.readContract({ address: quote.address, abi: erc2612Abi, functionName: "name" }),
    ctx.publicClient
      .readContract({ address: quote.address, abi: erc2612Abi, functionName: "version" })
      // `version` is optional in EIP-2612. "1" is what the reference
      // implementation uses and what the domain defaults to. Guessing wrong
      // produces a signature that recovers to some other address and a permit
      // that silently does nothing.
      .catch(() => "1"),
  ]);

  // Long enough to survive a slow wallet and a slow block, short enough that
  // an abandoned signature is not a standing allowance.
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);

  const signature = await wallet.signTypedData({
    account: signer,
    domain: { name, version, chainId: ctx.chainId, verifyingContract: quote.address },
    types: {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "Permit",
    message: { owner, spender: ctx.addresses.factory, value, nonce, deadline },
  });

  const { r, s } = parseSignature(signature);
  return { value, deadline, v: recoveryId(signature), r, s };
}

/**
 * The `v` byte a Solidity `ecrecover` expects, from any signature encoding.
 *
 * Exported so it can be tested directly. It cannot be covered end to end:
 * viem's local signer always produces legacy 27/28 signatures, so every
 * fork test takes the easy branch and a bug in the other one stays invisible
 * right up until a real wallet signs.
 *
 * viem populates `v` only for a legacy signature. A signer returning 0/1
 * parity — which browser wallets and hardware devices do — leaves it
 * undefined, and defaulting to 27 is then wrong exactly half the time. The
 * permit recovers to a different address, grants no allowance, and the launch
 * reverts with nothing pointing back at the signature.
 *
 * `yParity` is always present, so it is the reliable source.
 */
export function recoveryId(signature: Hex): number {
  const { v, yParity } = parseSignature(signature);
  return v !== undefined ? Number(v) : yParity + 27;
}

/** Pulls the launch result out of the receipt rather than the simulation. */
function parseLaunchLogs(
  receipt: TransactionReceipt,
  factory: Address,
): { token?: Address; poolId?: Hex; feeRecipient?: Address; splitter?: Address; firstBuyOut?: bigint } {
  const out: ReturnType<typeof parseLaunchLogs> = {};
  for (const log of receipt.logs as Log[]) {
    if (log.address.toLowerCase() !== factory.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({ abi: factoryAbi, data: log.data, topics: log.topics });
      if (decoded.eventName === "TokenLaunched") {
        const args = decoded.args as unknown as {
          token: Address;
          poolId: Hex;
          feeRecipient: Address;
          firstBuyOut: bigint;
        };
        out.token = args.token;
        out.poolId = args.poolId;
        out.feeRecipient = args.feeRecipient;
        out.firstBuyOut = args.firstBuyOut;
      } else if (decoded.eventName === "TokenLaunchedVNext") {
        const args = decoded.args as unknown as { splitter: Address };
        if (!/^0x0{40}$/i.test(args.splitter)) out.splitter = args.splitter;
      }
    } catch {
      // Another contract's log, or an event not in this ABI.
    }
  }
  return out;
}

/**
 * Launches a token.
 *
 * Handles salt mining and its retries, entrypoint selection, the `value`
 * computation, permit signing for a stablecoin first buy, and reading the
 * result out of the receipt.
 *
 * @example An ether launch, fees to the launcher
 * ```ts
 * const config = await client.selectConfig({ quote: "ETH", feePercent: 1, supplyTokens: 1_000_000_000 });
 * const result = await launchToken(client.context, {
 *   configId: config.id,
 *   name: "My Coin",
 *   symbol: "MINE",
 * });
 * console.log(result.token, result.poolId);
 * ```
 *
 * @example Fees split three ways, with a first buy
 * ```ts
 * await launchToken(client.context, {
 *   configId: config.id,
 *   name: "My Coin",
 *   symbol: "MINE",
 *   firstBuy: Amount.parse("0.1", ETHER),
 *   feeRecipients: [
 *     { address: "0xaaa…", shareBps: 5000 },
 *     { address: "0xbbb…", shareBps: 3000 },
 *     { address: "0xccc…", shareBps: 2000 },
 *   ],
 * });
 * ```
 */
export async function launchToken(
  ctx: ClientContext,
  params: LaunchTokenParams,
  config: LaunchConfig,
  options?: WriteOptions,
): Promise<LaunchResult> {
  const account = requireAccount(ctx, "launch", options?.account);
  const creator = typeof account === "string" ? account : account.address;

  await validateLaunch(ctx, params, config);

  const quote = config.quote;
  const firstBuyIn =
    params.firstBuy === undefined
      ? 0n
      : params.firstBuy instanceof Amount
        ? params.firstBuy.raw
        : params.firstBuy;

  // Case-insensitive. A checksummed address from one source and a lowercase
  // one from another are the same asset, and rejecting the pair would refuse
  // a perfectly correct call.
  if (
    params.firstBuy instanceof Amount &&
    params.firstBuy.asset.address.toLowerCase() !== quote.address.toLowerCase()
  ) {
    throw new InvalidArgumentError(
      `firstBuy is denominated in ${params.firstBuy.asset.symbol}, but config ` +
        `${config.id} is quoted in ${quote.symbol}.`,
    );
  }

  const launchFee = await ctx.publicClient.readContract({
    address: ctx.addresses.factory,
    abi: factoryAbi,
    functionName: "launchFee",
  });

  // Native first buys ride along in `value`. ERC-20 ones are pulled, and
  // adding them here would send ether into a call that never asked for it.
  const quoteIsNative = isNativeCurrency(quote.address);
  const value = quoteIsNative ? launchFee + firstBuyIn : launchFee;

  const firstBuyMinOut = params.firstBuyMinOut ?? 0n;
  const tokenParams = buildTokenParams(params, creator);

  // Signed once, outside the mining loop. A permit's nonce is only consumed by
  // a transaction that lands, so a failed simulate leaves the signature valid;
  // signing inside would prompt the wallet again on every retry.
  const needsPull = !quoteIsNative && firstBuyIn > 0n;
  const usePermit = params.usePermit ?? true;
  const permit =
    needsPull && usePermit ? await signPermit(ctx, quote, account, firstBuyIn) : null;

  if (needsPull && !permit) {
    const allowance = await ctx.publicClient.readContract({
      address: quote.address,
      abi: erc20Abi,
      functionName: "allowance",
      args: [creator, ctx.addresses.factory],
    });
    if (allowance < firstBuyIn) {
      throw new InvalidArgumentError(
        `The factory needs an allowance of ${firstBuyIn} ${quote.symbol} to pull the ` +
          `first buy, and has ${allowance}. Either approve it first, or leave ` +
          `usePermit on so the launch stays one transaction.`,
      );
    }
  }

  const recipients = params.feeRecipients ?? [];
  const recipientAddresses = recipients.map((r) => r.address);
  const recipientShares = recipients.map((r) => r.shareBps);

  const { salt } = await withDecodedErrors(() =>
    mineSalt(ctx, tokenParams, config.id, creator, params.saltMining ?? {}),
  );

  const tx = await executeWrite<readonly [Address, Hex]>(ctx, "launch", options, () => {
    if (permit) {
      return {
        address: ctx.addresses.factory,
        abi: factoryAbi,
        functionName: "launchWithPermit",
        args: [
          tokenParams,
          BigInt(config.id),
          firstBuyIn,
          firstBuyMinOut,
          salt,
          recipientAddresses,
          recipientShares,
          permit,
        ],
        value,
      };
    }
    if (recipientAddresses.length > 0) {
      return {
        address: ctx.addresses.factory,
        abi: factoryAbi,
        functionName: "launchWithFeeSplit",
        args: [
          tokenParams,
          BigInt(config.id),
          firstBuyIn,
          firstBuyMinOut,
          salt,
          recipientAddresses,
          recipientShares,
        ],
        value,
      };
    }
    return {
      address: ctx.addresses.factory,
      abi: factoryAbi,
      functionName: "launch",
      args: [tokenParams, BigInt(config.id), firstBuyIn, firstBuyMinOut, salt],
      value,
    };
  });

  const parsed = parseLaunchLogs(tx.receipt, ctx.addresses.factory);
  const token = parsed.token ?? tx.result[0];
  const poolId = parsed.poolId ?? tx.result[1];

  return {
    ...tx,
    token,
    poolId,
    config,
    feeRecipient: parsed.feeRecipient ?? creator,
    splitter: parsed.splitter ?? null,
    firstBuyOut: parsed.firstBuyOut ?? 0n,
  };
}
