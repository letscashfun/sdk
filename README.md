# @letscashfun/sdk

TypeScript SDK for the [letscash.fun](https://letscash.fun) launchpad on Robinhood Chain.

Launch tokens, read and claim fee streams, transfer stream ownership, trade, and run the permissionless keeper jobs.

```bash
npm install @letscashfun/sdk viem
```

**Requirements:** Node 20 or later, and viem 2.21 or later as a peer dependency. The package has no runtime dependencies of its own and runs no install scripts.

- [Cookbook](./COOKBOOK.md) — recipes for every launch shape, claim form and splitter operation
- [Security](./SECURITY.md) — key handling, supply chain, and reporting a vulnerability

---

## Quickstart

```ts
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { LetscashClient, robinhoodChain } from "@letscashfun/sdk";

const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);

const client = new LetscashClient({
  publicClient: createPublicClient({ chain: robinhoodChain, transport: http() }),
  walletClient: createWalletClient({ account, chain: robinhoodChain, transport: http() }),
});

const [config] = await client.getConfigs({ quote: "ETH", feePercent: 1 });

const { token, poolId } = await client.launch({
  configId: config.id,
  name: "My Coin",
  symbol: "MINE",
});

const coin = await client.token(token);
console.log((await coin.fees.claimable()).toString()); // "0.42 ETH"
await coin.fees.claim();
```

Reads require no wallet:

```ts
const client = new LetscashClient({ publicClient });
const coin = await client.token("0xfd45…");
await coin.fees.claimable();
```

Signing is performed entirely by the viem `WalletClient` you supply. The SDK never handles a private key.

---

## How it works

A launch mints a fixed-supply ERC-20 and initialises a Uniswap v4 pool quoted in ETH or USDG, seeded single-sided from the full supply. The pool carries no LP fee; a custom hook takes a configurable fee on the quote leg of every trade and accrues it per pool.

That fee stream is the part most integrations are built around. It can pay the creator, be split across up to four addresses, or be routed into a self-burner that buys and burns the token. Ownership of a stream can be transferred at any time.

### The launch menu

Every launch selects a published configuration. Configurations are immutable once published, can be enabled or disabled without a redeployment, and are added over time — so read the menu rather than hardcoding an id.

```ts
const enabled = await client.getConfigs();
const usdg = await client.getConfigs({ quote: "USDG" });
const burn = await client.getConfigs({ selfBurn: true });
const all = await client.getAllConfigs();   // including disabled rows
```

Each row exposes the raw contract fields plus derived values:

```ts
config.feePercent               // 1 | 3 | 5 | 10
config.creatorPercentOfVolume   // 0.7 on a 1% pool
config.platformPercentOfVolume  // 0.3 on every tier
config.supplyTokens             // 1_000_000_000
config.quote                    // { address, symbol, decimals }
```

### Fee streams

```ts
const coin = await client.token(tokenAddress);

await coin.fees.claimable();     // what a claim pays out, now
await coin.fees.tab();           // swept and banked
await coin.fees.pendingGross();  // unswept, before the creator/platform split
await coin.fees.creator();       // current owner of the stream

await coin.fees.claim();                  // to the caller
await coin.fees.claimTo(address);         // to a named address
await coin.fees.claimAmount(to, amount);  // a partial claim
```

`claim` sweeps internally, so no separate sweep is required.

Transferring a stream is irreversible and carries the unclaimed balance with it:

```ts
await coin.fees.claim();
await coin.fees.transferTo(newOwner);
```

Event subscriptions are available for fee accrual, claims and new launches:

```ts
const unsubscribe = coin.fees.onFeeAccrued((fee) => console.log(fee.toString()));
client.watchLaunches(({ token, poolId, creator }) => { /* … */ });
```

### Trading

```ts
const quote = await coin.trade.getQuote("buy", Amount.parse("0.1", coin.quote));

await coin.trade.buy(Amount.parse("0.1", coin.quote), { slippageBps: 100 });
await coin.trade.sell(Amount.parse("1000000", coin.asset), { slippageBps: 100 });
```

Permit2 approvals are granted automatically when the settled asset is an ERC-20. Note this includes buys on a USDG pool, not only sells.

### Split fee streams

```ts
const { splitter } = await client.launch({
  configId: config.id,
  name: "My Coin",
  symbol: "MINE",
  feeRecipients: [
    { address: alice, shareBps: 5000 },
    { address: bob,   shareBps: 3000 },
    { address: carol, shareBps: 2000 },
  ],
});
```

Shares must sum to 10000 and are fixed at launch — they cannot be changed by the creator or by the platform. A maximum of four recipients is supported; a single recipient names that address directly and deploys no splitter.

From a recipient's side:

```ts
const s = await coin.splitter();     // null when the stream is not split
await s.collectable(myAddress);      // includes fees still held at the hook
await s.collect();
await s.rotate(newAddress);          // transfers the slot, irreversibly
```

A recipient can only move their own balance. `distribute` is the sole permissionless write.

### Keeper jobs

```ts
const burner = await client.selfBurner();
await burner.burn(poolId);          // permissionless, pays a bounty

const converter = client.revenueConverter();
await converter.convert(usdg);      // permissionless, pays no bounty
```

---

## Protocol behaviour to be aware of

Five aspects of the protocol are not evident from the ABI and are handled by the SDK.

**Pool identity.** A Uniswap v4 pool is identified by the hash of a five-field key. An incorrect quote, tick spacing or hook produces a well-formed identifier for a pool that does not exist, and every subsequent read returns zero rather than an error. `client.token(address)` reads the identifier stored on the token, rebuilds the key, and verifies the two agree.

**Launch salts.** The factory rejects any salt whose resulting token address does not carry the `cc` suffix and sort above the quote asset. Salts must be obtained from `mineSalt`, a read-only search that succeeds after roughly a thousand attempts and can exhaust a window. `client.launch()` performs the search and retries.

**Fee accounting.** `tab` holds the creator's share after the split; `pending` holds the gross fee before it. Summing them overstates the claimable balance by the platform's share — 30% on a 1% pool. `fees.claimable()` applies the split correctly.

**Token metadata.** Trading terminals hyperlink social fields verbatim, so a bare handle is not rendered as a link. `buildTokenMetadata()` produces the same document letscash.fun publishes, with handles expanded to complete URLs. Pinning is performed with your own IPFS credential; see the [cookbook](./COOKBOOK.md#images-and-metadata).

**Decimals.** ETH pools settle in 18 decimals and USDG pools in 6. Every value returned by the SDK is an `Amount` carrying its own scale, and arithmetic across two different assets throws.

---

## Errors

Contract reverts are decoded into a `ContractRevertError` carrying the Solidity error name and guidance for that specific error:

```ts
import { ContractRevertError } from "@letscashfun/sdk";

try {
  await coin.fees.claim();
} catch (error) {
  if (error instanceof ContractRevertError && error.errorName === "NotCreator") {
    // stream ownership has been transferred
  }
}
```

Writes are simulated before signing, so a revert is reported before any gas is spent.

---

## Consuming from other languages

ABIs are generated from the compiled contracts and published in three forms:

| Path | Format |
|---|---|
| `@letscashfun/sdk/abis` | const-asserted TypeScript, for viem type inference |
| `abis/*.json` | plain JSON, for any language |
| `solidity/*.sol` | curated interfaces for integrating contracts |

The Solidity interfaces cover the functions an integrator calls, rather than the full deployed surface. Their selectors are verified against the generated ABIs in the test suite.

```solidity
import { ILetscashHook } from "@letscashfun/sdk/solidity/ILetscashHook.sol";

contract MyStrategy {
    function harvest(ILetscashHook hook, bytes32 poolId) external {
        hook.claim(poolId, treasury);
    }
}
```

---

## Contract addresses

Robinhood Chain, chain id 4663.

| Contract | Address |
|---|---|
| Factory (UUPS proxy) | `0x5bd1Fbe78a78fe8236fa00CF48fbEBA74ae34661` |
| Hook | `0x75A54357D9C78a2Db19004a5FDc76c50F9242AEC` |
| Pool manager | `0x8366a39CC670B4001A1121B8F6A443A643e40951` |
| USDG | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` |

All contracts are verified on [Blockscout](https://robinhoodchain.blockscout.com). The factory address is stable across upgrades; the hook and other modules are read from it at runtime rather than hardcoded, so a future release does not require an SDK update.

---

## Development

```bash
npm install
npm run typecheck
npm run test:unit
npm run build
```

The end-to-end suite runs against a local [anvil](https://book.getfoundry.sh/anvil/) fork and is skipped when no fork is reachable:

```bash
npm run anvil        # in one terminal
npm run test:e2e     # in another
```

ABIs are generated, never edited by hand. After a contract change, run `forge build` in the contract repository and then `npm run sync:abis`.

---

## Licence

MIT
