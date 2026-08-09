/**
 * The whole lifecycle: pick a config, launch with metadata, then claim fees
 * on a loop.
 *
 * This is the script most people want first. Everything else in examples/ is a
 * slice of it.
 *
 *     PINATA_JWT=eyJ… \
 *     PRIVATE_KEY=0x… \
 *     IMAGE=./mycoin.png \
 *     tsx examples/full-launch.ts
 *
 * Optional:
 *     RPC_URL=…          your own node (recommended — the public one is shared)
 *     FIRST_BUY=0.5      buy your own token in the launch transaction
 *     CLAIM_THRESHOLD=0.01
 *
 * To try it without spending anything, point RPC_URL at a local fork:
 *     anvil --fork-url https://rpc.mainnet.chain.robinhood.com
 */

import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  Amount,
  ContractRevertError,
  LetscashClient,
  pinataPinner,
  robinhoodChain,
} from "../src/index.js";

// ──────────────────────────────── setup ────────────────────────────────

const PINATA_JWT = process.env.PINATA_JWT;
const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}` | undefined;
if (!PINATA_JWT) throw new Error("Set PINATA_JWT — see COOKBOOK.md for the two-minute setup.");
if (!PRIVATE_KEY) throw new Error("Set PRIVATE_KEY.");

const rpc = process.env.RPC_URL ?? robinhoodChain.rpcUrls.default.http[0];
const account = privateKeyToAccount(PRIVATE_KEY);

const client = new LetscashClient({
  publicClient: createPublicClient({ chain: robinhoodChain, transport: http(rpc) }),
  walletClient: createWalletClient({ account, chain: robinhoodChain, transport: http(rpc) }),
});

console.log(`launching as ${account.address}\n`);

// ─────────────────────────── 1. pick a config ───────────────────────────
// Read the menu. Never hardcode an id — rows get added, and enabled and
// disabled, with no release on our side.

console.log("available configs:");
for (const c of await client.getConfigs()) {
  console.log(
    `  ${String(c.id).padEnd(5)} ${c.quote.symbol.padEnd(5)} ${String(c.feePercent).padStart(3)}%  ` +
      `you keep ${c.creatorPercentOfVolume}% of volume  ` +
      `${c.supplyTokens.toLocaleString()} supply` +
      (c.selfBurn ? "  [self-burn — no creator earnings]" : ""),
  );
}

// ETH-quoted, 1% fee, creator keeps the stream. Swap the filter for what you
// want: { quote: "USDG", feePercent: 5 }, { selfBurn: true }, and so on.
const [config] = await client.getConfigs({ quote: "ETH", feePercent: 1, selfBurn: false });
if (!config) throw new Error("no enabled ETH 1% config");

console.log(`\nusing config ${config.id} — ${config.feePercent}% fee, you keep ${config.creatorPercentOfVolume}%`);

const launchFee = await client.getLaunchFee();
console.log(`launch fee: ${Amount.raw(launchFee, config.quote)}`);

// ─────────────────────────── 2. launch ───────────────────────────
// Pins the image, builds the metadata document with that URI inside it, pins
// that, fills the on-chain socials from the same links, and launches.

const firstBuy = process.env.FIRST_BUY;

const launch = await client.launchWithMetadata({
  configId: config.id,
  name: "My Coin",
  symbol: "MINE",
  description: "launched programmatically, looks like it wasn't",

  // A file path, raw bytes, or an ipfs:// URI you pinned earlier.
  image: { path: process.env.IMAGE ?? "./token.png" },

  // Bare handles are fine as input. They get expanded to complete URLs in
  // both places that matter: the pinned document and the on-chain record.
  // Terminals hyperlink these verbatim, so "mycoin" alone is not a link and
  // gets dropped — and the on-chain field cannot be edited after mint.
  twitter: "mycoin",
  telegram: "mycoin",
  website: "mycoin.xyz",

  // Buy your own token in the same transaction. On an ether config this rides
  // along in `value`; on a USDG one it is pulled via a permit. The SDK works
  // out which from the config's quote.
  ...(firstBuy && { firstBuy: Amount.parse(firstBuy, config.quote) }),

  // Your credential, never ours. Swap in any Pinner to use another provider.
  pinner: pinataPinner(PINATA_JWT),
});

console.log(`\nlaunched`);
console.log(`  token    ${launch.token}`);
console.log(`  pool     ${launch.poolId}`);
console.log(`  image    ${launch.logo}`);
console.log(`  metadata ${launch.metadataURI}`);
console.log(`  fees to  ${launch.feeRecipient}`);

// ─────────────────────────── 3. claim fees ───────────────────────────
// Resolved once. poolId, hook and quote come off the token itself and are then
// plain properties — no lookup on every tick.

const coin = await client.token(launch.token);

if (launch.firstBuyOut > 0n) {
  // Denominated in the TOKEN, not the quote — it is what the buy returned,
  // not what it cost. `coin.asset` is the token; `coin.quote` is the ETH or
  // USDG side.
  console.log(`  bought   ${Amount.raw(launch.firstBuyOut, coin.asset).format({ maxDecimals: 2 })}`);
}

// Below this, gas costs more than the fees are worth. Claiming dust is a slow
// way to donate to validators.
const threshold = Amount.parse(process.env.CLAIM_THRESHOLD ?? "0.01", coin.quote);

console.log(`\nwatching for fees — claiming above ${threshold}\n`);

for (;;) {
  try {
    // claimable(), not tab(). Fees sit unswept inside Uniswap's pool manager,
    // so tab() reads zero while real money accrues. claimable() is
    // tab + your share of pending, which is what a claim actually pays.
    const owed = await coin.fees.claimable();
    const stamp = new Date().toISOString().slice(11, 19);

    if (owed.gte(threshold)) {
      const { amount, hash } = await coin.fees.claim();
      console.log(`${stamp}  claimed ${amount}  ${hash}`);
    } else {
      console.log(`${stamp}  ${owed} — below threshold`);
    }
  } catch (error) {
    if (error instanceof ContractRevertError && error.errorName === "NotCreator") {
      // updateCreator is irreversible. Nothing to wait for.
      console.error("fee stream was handed to someone else — stopping");
      break;
    }
    // Anything else is probably transient: a dropped connection, a reorg, a
    // node hiccup. Log and try again next tick.
    console.error("tick failed, retrying:", (error as Error).message);
  }

  await new Promise((resolve) => setTimeout(resolve, 60_000));
}
