/**
 * A fee-stream bot.
 *
 * The main reason this SDK exists: a coin whose fees do something needs a
 * process that watches a balance and claims it when it is worth the gas. This
 * is that, in about forty lines.
 *
 *     PRIVATE_KEY=0x… TOKEN=0x… tsx examples/fee-bot.ts
 */

import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { Amount, ContractRevertError, LetscashClient, robinhoodChain } from "../src/index.js";

const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const tokenAddress = process.env.TOKEN as `0x${string}`;

const client = new LetscashClient({
  publicClient: createPublicClient({ chain: robinhoodChain, transport: http() }),
  walletClient: createWalletClient({ account, chain: robinhoodChain, transport: http() }),
});

// Resolved once. The pool id, hook and quote come off the token itself and are
// then plain properties — no lookup on every tick.
const token = await client.token(tokenAddress);

// Claim once this much has built up. Below it the gas costs more than the fees
// are worth, and claiming a dust balance is a slow way to donate to validators.
const threshold = Amount.parse("0.01", token.quote);

console.log(`watching ${tokenAddress}`);
console.log(`  pool    ${token.poolId}`);
console.log(`  quote   ${token.quote.symbol}`);
console.log(`  claim at ${threshold}`);

// Only the current owner can claim, and ownership can be handed on at any
// time. Checking once at startup beats discovering it mid-loop.
const owner = await token.fees.creator();
if (owner.toLowerCase() !== account.address.toLowerCase()) {
  throw new Error(`fee stream belongs to ${owner}, not to ${account.address}`);
}

for (;;) {
  try {
    // claimable(), not tab(). Fees sit unswept in the pool manager until
    // something touches them, so tab alone reads zero while money accrues.
    const owed = await token.fees.claimable();

    if (owed.gte(threshold)) {
      const { amount, hash } = await token.fees.claim();
      console.log(`${new Date().toISOString()}  claimed ${amount}  ${hash}`);
    } else {
      console.log(`${new Date().toISOString()}  ${owed} — below threshold`);
    }
  } catch (error) {
    if (error instanceof ContractRevertError && error.errorName === "NotCreator") {
      // Irreversible: somebody called updateCreator. Nothing to wait for.
      console.error("fee stream was handed to someone else — stopping");
      break;
    }
    console.error("tick failed, retrying:", error);
  }

  await new Promise((resolve) => setTimeout(resolve, 60_000));
}
