/**
 * Shared setup for the end-to-end suite.
 *
 * Everything runs against a local anvil fork of Robinhood Chain. Nothing here
 * touches mainnet, and no real transaction is ever sent.
 *
 * Start the fork first:
 *
 *     anvil --fork-url https://rpc.mainnet.chain.robinhood.com --port 8545
 */

import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  http,
  parseEther,
  type Address,
  type Hex,
  type PublicClient,
  type TestClient,
  type WalletClient,
} from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";

import { LetscashClient } from "../../src/client.js";
import { robinhoodChain } from "../../src/chain.js";

export const ANVIL_URL = process.env.ANVIL_URL ?? "http://127.0.0.1:8545";

/** The fork keeps mainnet's chain id, so the SDK's address table applies. */
export const forkChain = { ...robinhoodChain, rpcUrls: { default: { http: [ANVIL_URL] } } };

// Annotated rather than inferred. viem's client types reference internal
// action modules that a declaration file cannot name portably, so leaving
// these inferred fails the build with TS2742.
export const publicClient: PublicClient = createPublicClient({
  chain: forkChain,
  transport: http(ANVIL_URL),
});
export const testClient: TestClient<"anvil"> = createTestClient({
  chain: forkChain,
  transport: http(ANVIL_URL),
  mode: "anvil",
});

/**
 * Makes a funded account with a freshly generated key.
 *
 * Deliberately NOT one of anvil's default accounts. Robinhood Chain carries
 * EIP-7702 sweeper delegations against well-known development keys, and those
 * delegations are part of the forked state — so anything credited to a default
 * anvil account is drained the moment it tries to spend. A random key has no
 * delegation attached and keeps its balance.
 */
export async function fundedAccount(ether = 1000): Promise<{
  account: PrivateKeyAccount;
  walletClient: WalletClient;
  client: LetscashClient;
}> {
  const account = privateKeyToAccount(generatePrivateKey());
  await testClient.setBalance({ address: account.address, value: parseEther(String(ether)) });
  const walletClient = createWalletClient({ account, chain: forkChain, transport: http(ANVIL_URL) });
  const client = new LetscashClient({ publicClient, walletClient });
  return { account, walletClient, client };
}

/**
 * A brand-new keypair, unfunded.
 *
 * Always generated, never one of anvil's defaults — the fork carries mainnet's
 * EIP-7702 sweeper delegations against well-known development keys, so a
 * default account loses anything credited to it.
 */
export function freshAccount(): PrivateKeyAccount {
  return privateKeyToAccount(generatePrivateKey());
}

/** Wraps an existing account so it can act for itself. */
export function clientFor(account: PrivateKeyAccount): LetscashClient {
  return new LetscashClient({
    publicClient,
    walletClient: createWalletClient({ account, chain: forkChain, transport: http(ANVIL_URL) }),
  });
}

/** A read-only client, for checking state without a wallet in the way. */
export const readClient = new LetscashClient({ publicClient });

/**
 * Gives an address an ERC-20 balance by writing the storage slot directly.
 *
 * Finds the balances mapping by probing candidate slots and checking whether
 * the write took, rather than assuming a layout. Returns false if no slot in
 * range produced the expected balance.
 */
export async function setErc20Balance(
  token: Address,
  holder: Address,
  amount: bigint,
): Promise<boolean> {
  const { keccak256, encodeAbiParameters, toHex } = await import("viem");
  const erc20 = [
    {
      type: "function",
      name: "balanceOf",
      stateMutability: "view",
      inputs: [{ type: "address" }],
      outputs: [{ type: "uint256" }],
    },
  ] as const;

  for (let slot = 0; slot < 20; slot++) {
    const key = keccak256(
      encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [holder, BigInt(slot)]),
    );
    const before = await publicClient.readContract({
      address: token,
      abi: erc20,
      functionName: "balanceOf",
      args: [holder],
    });
    await testClient.setStorageAt({
      address: token,
      index: key,
      value: toHex(amount, { size: 32 }) as Hex,
    });
    const after = await publicClient.readContract({
      address: token,
      abi: erc20,
      functionName: "balanceOf",
      args: [holder],
    });
    if (after === amount && after !== before) return true;
  }
  return false;
}

/**
 * How much an address's ether balance changed, net of the gas it paid.
 *
 * The naive check — balance went up — is worthless on an account funded with
 * 1000 ETH for the test: it passes whether the payout was the right amount,
 * the wrong amount, or never happened at all. And a raw before/after delta is
 * wrong in the other direction, because the claimant also paid for the
 * transaction, so a correct payout smaller than its own gas reads as a loss.
 *
 * Netting the gas out is what makes the delta equal the payout exactly, which
 * is the only version of this assertion that can fail when the code is wrong.
 */
export async function netEtherDelta(
  address: Address,
  before: bigint,
  receipt: { gasUsed: bigint; effectiveGasPrice: bigint },
): Promise<bigint> {
  const after = await publicClient.getBalance({ address });
  return after - before + receipt.gasUsed * receipt.effectiveGasPrice;
}

/** Formats a heading so the run log is readable. */
export function section(title: string): void {
  console.log(`\n${"─".repeat(72)}\n  ${title}\n${"─".repeat(72)}`);
}
