/**
 * A burn keeper.
 *
 * The self-burner buys a token with its accrued fees and burns it, and pays
 * the caller a bounty for triggering it. That makes this the one keeper job on
 * the platform that pays for itself — `sweep` and `convert` are also
 * permissionless but pay nothing, so nobody runs them out of altruism.
 *
 *     PRIVATE_KEY=0x… POOLS=0xpool1,0xpool2 tsx examples/keeper.ts
 */

import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { ContractRevertError, LetscashClient, robinhoodChain } from "../src/index.js";
import type { Hex } from "viem";

const rpc = process.env.RPC_URL ?? robinhoodChain.rpcUrls.default.http[0];
const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);

const client = new LetscashClient({
  publicClient: createPublicClient({ chain: robinhoodChain, transport: http(rpc) }),
  walletClient: createWalletClient({ account, chain: robinhoodChain, transport: http(rpc) }),
});

const pools = (process.env.POOLS ?? "").split(",").filter(Boolean) as Hex[];
const burner = await client.selfBurner();

console.log(`burner ${burner.address}, bounty ${await burner.bountyBps()} bps`);
console.log(`watching ${pools.length} pools\n`);

for (;;) {
  for (const poolId of pools) {
    try {
      // The stream must actually point at the burner. A pool whose creator is
      // an ordinary wallet has nothing here, and calling burn on it reverts
      // NotFeeRecipient every tick.
      const stream = client.feeStream(poolId);
      const config = await stream.config();
      const waiting = await burner.unburned(poolId, config.quote);

      if (waiting.isZero) continue;

      const { hash } = await burner.burn(poolId);
      console.log(`${new Date().toISOString()}  burned ${waiting} on ${poolId.slice(0, 10)}  ${hash}`);
    } catch (error) {
      if (error instanceof ContractRevertError) {
        // Both of these are ordinary rather than exceptional: one burn per
        // block, and nothing to burn until fees accrue.
        if (error.errorName === "BurnedThisBlock" || error.errorName === "NothingToBurn") continue;
        if (error.errorName === "NotFeeRecipient") {
          console.warn(`${poolId} is not a self-burn pool — drop it from POOLS`);
          continue;
        }
      }
      console.error(`${poolId} failed:`, error);
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 30_000));
}
