/**
 * A launch that looks exactly like one done through letscash.fun.
 *
 * One call. It pins the image, builds the metadata document with the image URI
 * inside it, pins that, and launches — so the token appears on trading
 * terminals with its picture and links intact, indistinguishable from a
 * website launch.
 *
 * You bring the Pinata account. This package never holds an IPFS credential.
 * The free tier is far more than a launch needs; setup is two minutes and
 * COOKBOOK.md walks it.
 *
 *     PINATA_JWT=eyJ… PRIVATE_KEY=0x… IMAGE=./mycoin.png tsx examples/launch-with-metadata.ts
 */

import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { LetscashClient, pinataPinner, robinhoodChain } from "../src/index.js";

const PINATA_JWT = process.env.PINATA_JWT;
if (!PINATA_JWT) throw new Error("Set PINATA_JWT. See COOKBOOK.md for how to get one.");

const rpc = process.env.RPC_URL ?? robinhoodChain.rpcUrls.default.http[0];
const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);

const client = new LetscashClient({
  publicClient: createPublicClient({ chain: robinhoodChain, transport: http(rpc) }),
  walletClient: createWalletClient({ account, chain: robinhoodChain, transport: http(rpc) }),
});

const config = await client.selectConfig({
  quote: "ETH",
  feePercent: 1,
  selfBurn: false,
  supplyTokens: 1_000_000_000,
});
if (!config) throw new Error("no enabled ETH 1% config");

const result = await client.launchWithMetadata({
  configId: config.id,
  name: "My Coin",
  symbol: "MINE",
  description: "launched programmatically, looks like it wasn't",

  // A file path, raw bytes, or an ipfs:// URI you pinned earlier.
  image: { path: process.env.IMAGE ?? "./token.png" },

  // Bare handles are fine as input. They get expanded to complete URLs in
  // both the pinned document and the on-chain record — terminals hyperlink
  // these verbatim, so "mycoin" on its own is not a link and gets dropped,
  // and the on-chain field cannot be edited after mint.
  twitter: "mycoin",
  telegram: "mycoin",
  website: "mycoin.xyz",

  // Your credential, never ours. Swap in any Pinner implementation to use a
  // different provider.
  pinner: pinataPinner(PINATA_JWT),
});

console.log(`token    ${result.token}`);
console.log(`pool     ${result.poolId}`);
console.log(`image    ${result.logo}`);
console.log(`metadata ${result.metadataURI}`);
console.log(`fees     ${result.feeRecipient}`);
console.log(`\npinned document:\n${JSON.stringify(result.metadata, null, 2)}`);
