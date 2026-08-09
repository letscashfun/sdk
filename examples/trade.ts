/**
 * Buying and selling without a trading terminal.
 *
 *     PRIVATE_KEY=0x… TOKEN=0x… tsx examples/trade.ts
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

const token = await client.token(process.env.TOKEN as `0x${string}`);
const meta = await token.metadata();

console.log(`${meta.name} (${meta.symbol})`);
console.log(`  quoted in ${token.quote.symbol}`);
console.log(`  you hold  ${(await token.balanceOf(account.address)).format({ maxDecimals: 2 })}`);

// ─────────────────────────── price it first ───────────────────────────
// getQuote sends nothing. Worth doing before every trade — the quoter
// simulates against current state, so it accounts for depth, not just spot.

const spend = Amount.parse("0.1", token.quote);
const preview = await token.trade.getQuote("buy", spend, 100); // 100 bps slippage

console.log(`\n${preview.amountIn} buys ${preview.amountOut.format({ maxDecimals: 2 })}`);
console.log(`  floor ${preview.minAmountOut.format({ maxDecimals: 2 })} at ${preview.slippageBps} bps`);
console.log(`  gas   ~${preview.gasEstimate}`);

// Refuse a trade whose price impact is worse than you are willing to wear.
// The quote tells you the impact; only you know your tolerance.
const impact = 1 - Number(preview.minAmountOut.raw) / Number(preview.amountOut.raw);
if (impact > 0.05) {
  console.log("\nprice impact above 5% — not trading");
  process.exit(0);
}

// ─────────────────────────── buy ───────────────────────────
// Permit2 approvals are granted automatically when the settled asset is an
// ERC-20. That includes a *buy* on a USDG pool, not only a sell.

const bought = await token.trade.buy(spend, { slippageBps: 100 });
console.log(`\nbought — ${bought.hash}`);
console.log(`  now holding ${(await token.balanceOf(account.address)).format({ maxDecimals: 2 })}`);

// ─────────────────────────── sell half back ───────────────────────────

const held = await token.balanceOf(account.address);
const half = Amount.raw(held.raw / 2n, token.asset);

const sellPreview = await token.trade.getQuote("sell", half);
console.log(`\n${half.format({ maxDecimals: 2 })} sells for ${sellPreview.amountOut}`);

const sold = await token.trade.sell(half, { slippageBps: 100 });
console.log(`sold — ${sold.hash}`);
