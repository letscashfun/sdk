/**
 * Launching a token, three ways.
 *
 *     PRIVATE_KEY=0x… tsx examples/launch.ts
 *
 * Points at mainnet by default. To try it for free, run a fork first and set
 * RPC_URL to it:
 *
 *     anvil --fork-url https://rpc.mainnet.chain.robinhood.com
 *     RPC_URL=http://127.0.0.1:8545 PRIVATE_KEY=0x… tsx examples/launch.ts
 */

import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { Amount, LetscashClient, robinhoodChain } from "../src/index.js";

const rpc = process.env.RPC_URL ?? robinhoodChain.rpcUrls.default.http[0];
const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);

const client = new LetscashClient({
  publicClient: createPublicClient({ chain: robinhoodChain, transport: http(rpc) }),
  walletClient: createWalletClient({ account, chain: robinhoodChain, transport: http(rpc) }),
});

// ─────────────────────────── the menu ───────────────────────────
// Read it. Ids change as rows are published, and rows get switched on and off
// without any redeployment, so a hardcoded id eventually reverts.

console.log("available configs:\n");
for (const config of await client.getConfigs()) {
  console.log(
    `  ${String(config.id).padEnd(5)} ${config.quote.symbol.padEnd(5)} ` +
      `${String(config.feePercent).padStart(3)}%  ` +
      `creator ${config.creatorPercentOfVolume.toFixed(2)}%  ` +
      `${config.supplyTokens.toLocaleString()} supply` +
      (config.selfBurn ? "  [self-burn]" : ""),
  );
}

// ─────────────────────── 1. the simple case ───────────────────────
// Fees go to the launching account.

const [oneEth] = await client.getConfigs({ quote: "ETH", feePercent: 1, selfBurn: false });
if (!oneEth) throw new Error("no enabled ETH 1% config");

const simple = await client.launch({
  configId: oneEth.id,
  name: "Example Coin",
  symbol: "EXMPL",
  description: "launched with @letscashfun/sdk",
  socials: { twitter: "letscashfun", website: "https://letscash.fun" },
});

console.log(`\nlaunched ${simple.token}`);
console.log(`  pool  ${simple.poolId}`);
console.log(`  fees  ${simple.feeRecipient}`);

// ─────────────────────── 2. with a first buy ───────────────────────
// Buys your own token in the same transaction. On an ether config this rides
// along in `value`; the SDK works that out from the config's quote.

const withBuy = await client.launch({
  configId: oneEth.id,
  name: "Founder Coin",
  symbol: "FNDR",
  firstBuy: Amount.parse("0.05", oneEth.quote),
});

console.log(`\nlaunched ${withBuy.token} with a first buy`);
console.log(`  received ${withBuy.firstBuyOut} base units`);

// ─────────────────────── 3. with a split stream ───────────────────────
// Shares are fixed at launch. Nobody can change them afterwards — not the
// creator, not the platform — so this is the last moment to get them right.

const split = await client.launch({
  configId: oneEth.id,
  name: "Team Coin",
  symbol: "TEAM",
  feeRecipients: [
    { address: "0x1111111111111111111111111111111111111111", shareBps: 6000 },
    { address: "0x2222222222222222222222222222222222222222", shareBps: 4000 },
  ],
});

console.log(`\nlaunched ${split.token} with a split stream`);
console.log(`  splitter ${split.splitter}`);
