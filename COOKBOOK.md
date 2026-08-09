# Cookbook

Copy-paste recipes for every shape of launch, fee stream and claim.

Each snippet assumes the [setup block](#setup) is already in scope.

- [Setup](#setup)
- [Choosing a config](#choosing-a-config)
- [Images and metadata](#images-and-metadata)
- [Launching](#launching)
- [Reading what you are owed](#reading-what-you-are-owed)
- [Claiming](#claiming)
- [Fee splitters](#fee-splitters)
- [Transferring the fee stream](#transferring-the-fee-stream)
- [Trading](#trading)
- [Keeper jobs](#keeper-jobs)
- [Handling errors](#handling-errors)
- [Gotchas](#gotchas)

---

## Setup

Once, at the top of anything below.

```ts
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { Amount, LetscashClient, robinhoodChain } from "@letscashfun/sdk";

const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);

const client = new LetscashClient({
  publicClient: createPublicClient({ chain: robinhoodChain, transport: http() }),
  walletClient: createWalletClient({ account, chain: robinhoodChain, transport: http() }),
});
```

**Read-only?** Drop the wallet. Everything that only reads still works.

```ts
const client = new LetscashClient({ publicClient });
```

---

## Choosing a config

Every launch picks one row off the menu. Read it — ids get added, and rows get switched on and off, without any release.

### See everything on offer

```ts
for (const c of await client.getConfigs()) {
  console.log(
    c.id,
    c.quote.symbol,          // "ETH" | "USDG"
    `${c.feePercent}%`,      // 1 | 3 | 5 | 10
    `creator ${c.creatorPercentOfVolume}%`,   // 0.7 on a 1% pool
    `platform ${c.platformPercentOfVolume}%`, // always 0.3
    c.supplyTokens,          // 1_000_000_000
    c.selfBurn ? "self-burn" : "standard",
  );
}
```

### Filter to exactly what you want

```ts
// ETH, 1%, creator keeps the fees
const [ethOne] = await client.getConfigs({ quote: "ETH", feePercent: 1, selfBurn: false });

// USDG, 5%
const [usdgFive] = await client.getConfigs({ quote: "USDG", feePercent: 5 });

// Any self-burn config
const burners = await client.getConfigs({ selfBurn: true });

// Everything quoted in a stablecoin
const stables = await client.getConfigs({ quote: "USDG" });
```

`getConfigs()` returns enabled rows only, and there is no filter value that
un-hides the rest. For the full published set — including rows that exist but
are switched off, which are a preview of what is coming — use:

```ts
const everything = await client.getAllConfigs();
```

### What the tiers mean

The creator picks the tax rate. The platform's cut never moves.

| Fee | Creator keeps | Platform takes |
|---|---|---|
| 1% | 0.70% of volume | 0.30% |
| 3% | 2.70% | 0.30% |
| 5% | 4.70% | 0.30% |
| 10% | 9.70% | 0.30% |

Charged on the quote leg — the ETH or USDG side — on both buys and sells.

---

## Images and metadata

A token launched through this SDK appears on a trading terminal identically to
one launched through letscash.fun — same image, same links, same
categorisation. That requires two pinned files and one helper.

**Pinning is performed with your own IPFS credential.** This package never
holds one. It builds the metadata document, which is the part with
non-obvious requirements; where that document is hosted is your choice.

### What goes on chain

Three fields, all set at mint and **never editable afterwards**:

| Field | Holds | If wrong |
|---|---|---|
| `logo` | `ipfs://<CID>` of the image | no picture, forever |
| `metadataURI` | `ipfs://<CID>` of the JSON | no image and no links on terminals |
| `socials` | complete URLs, on chain | not a link; terminals drop it |

### Setting up Pinata

Any IPFS provider works — Pinata is what letscash.fun uses, so it is the path
with no surprises.

1. Make a free account at [app.pinata.cloud](https://app.pinata.cloud). The
   free tier is far more than a launch needs.
2. **API Keys → New Key.** Tick `pinFileToIPFS` and `pinJSONToIPFS`. Admin
   rights are not required and you should not grant them.
3. Copy the **JWT** — not the API key or secret. It is shown once.
4. Keep it server-side. A JWT in a browser bundle is a JWT anyone can pin with,
   on your bill.

```bash
export PINATA_JWT="eyJhbGciOi…"
```

### Pinning and launching in one call

```ts
import { LetscashClient, pinataPinner } from "@letscashfun/sdk";

const { token, poolId, logo, metadataURI } = await client.launchWithMetadata({
  configId: config.id,
  name: "My Coin",
  symbol: "MINE",
  description: "the best coin",

  image: { path: "./mycoin.png" },   // or raw bytes, or an ipfs:// URI

  twitter: "mycoin",                  // bare handles are fine
  telegram: "mycoin",
  website: "mycoin.xyz",

  pinner: pinataPinner(process.env.PINATA_JWT!),
});
```

That pins the image, builds the document with the image URI inside it, pins
that, writes the normalised links to the on-chain socials, and launches. The
result is byte-compatible with a website launch.

Links are given **once** and are expanded to complete URLs in *both* places
they land — the pinned document and the on-chain `socials`. A complete URL is
the canonical on-chain shape; a bare handle there is not a link, terminals drop
it, and the field cannot be edited after mint.

`image` takes a file path, `{ data, mimeType }` for raw bytes (browsers, or
anything not reading from disk), or a plain `ipfs://` string to reuse an image
you have already pinned.

### A failed pin never reaches the chain

`logo` and `metadataURI` are set at mint and **can never be edited**. So the
SDK reads both pins back through a gateway before it will launch, and refuses
if either does not resolve.

That closes a gap a provider's own response cannot: Pinata returning `200` with
a CID is not the same as that CID resolving. The write can be accepted and
still not propagate, and the result is a token that renders blank forever.

```ts
try {
  await client.launchWithMetadata({ ...params, pinner });
} catch (error) {
  if (error instanceof PinVerificationError) {
    // Nothing was launched. Retry — the pin may just be slow to propagate.
  }
}
```

Three outcomes, distinguished because they need different responses:

| What happened | What the SDK does |
|---|---|
| Both resolve, content matches | launches |
| Gateway answers 404 | refuses — the pin did not stick |
| Gateway unreachable | refuses, but says it may be the gateway's fault |

It also checks the document is the one you pinned, not just that *something*
is there — a gateway serving stale or truncated content would otherwise pass.

Tuning:

```ts
await client.launchWithMetadata({
  ...params,
  pinner,
  verifyPins: {
    gateway: "https://my-gateway.example/ipfs/",  // one you trust
    timeoutMs: 60_000,                            // slow propagation
  },
});
```

Skipping it is possible and rarely right:

```ts
verifyPins: { verify: false }
```

Reasonable if you pin somewhere with no public gateway, or you have already
confirmed the content. Not reasonable as a way to make a flaky launch go
through — the thing it makes go through is a permanently blank token.

### Pinning without launching

Same work, stopping before the transaction — useful if you want to inspect or
cache the document first.

```ts
import { prepareLaunchMetadata, pinataPinner } from "@letscashfun/sdk";

const { logo, metadataURI, metadata } = await prepareLaunchMetadata(
  pinataPinner(process.env.PINATA_JWT!),
  {
    name: "My Coin",
    symbol: "MINE",
    image: { path: "./mycoin.png" },
    twitter: "mycoin",
  },
);

console.log(metadata);   // exactly what was pinned

await client.launch({ configId: config.id, name: "My Coin", symbol: "MINE", logo, metadataURI });
```

### Using something other than Pinata

`Pinner` is a two-method interface. Implement it against whatever you already
run — web3.storage, Filebase, an S3 bucket behind a CDN, your own node.

```ts
import type { Pinner } from "@letscashfun/sdk";

const myPinner: Pinner = {
  async pinFile({ data, filename }) {
    // ...upload, return a resolvable URI
    return `ipfs://${cid}`;
  },
  async pinJson(content) {
    return `ipfs://${cid}`;
  },
};
```

Both methods must return something a terminal can resolve — `ipfs://<CID>` or
an `https://` URL. A bare CID is rejected downstream.

### What the SDK checks about your links

Deliberately light. The one thing that has to be true is that each field ends
up as a **real URL** — terminals hyperlink them verbatim, so anything that
isn't renders as dead text.

**Handles and partial URLs are normalised**, not rejected:

| you write | you get |
|---|---|
| `mycoin` | `https://x.com/mycoin` |
| `@mycoin` | `https://x.com/mycoin` |
| `x.com/mycoin` | `https://x.com/mycoin` |
| `twitter.com/mycoin` | `https://twitter.com/mycoin` |
| `https://linktr.ee/mycoin` | left exactly as given |

**Where a full URL points is never questioned.** Putting a Linktree, a docs
site or a launch thread in the Twitter field is normal usage, and the SDK says
nothing about it.

**Three things throw**, because they can't produce a working link:

```ts
twitter: "my coin"      // a space — no handle or URL survives one
website: "mycoin"       // no domain suffix; https://mycoin resolves for nobody
website: "https://"     // starts like a URL, isn't one
```

**One thing warns.** A bare domain in a handle field is genuinely ambiguous —
`twitter: "mycoin.xyz"` becomes `https://x.com/mycoin.xyz`, a live link to a
profile that isn't yours. Legal, so it isn't blocked, but you probably meant
`website`.

Warnings go to a callback rather than the console, so they can't pollute your
logging:

```ts
buildTokenMetadata(input, {
  onWarning: (w) => console.warn(`${w.field}: ${w.message}`),
});
```

### Preview links before you pin

`checkTokenMetadata` runs the same normalisation with nothing pinned and
nothing thrown — useful for showing a user what their links will become, or
gating a CI job.

```ts
import { checkTokenMetadata } from "@letscashfun/sdk";

const check = checkTokenMetadata({
  name: "My Coin",
  symbol: "MINE",
  twitter: "x.com/mycoin",
});

check.ok;                    // true
check.metadata?.twitter;     // "https://x.com/mycoin" — not doubled
check.warnings;              // []
check.error;                 // undefined
```

### Why use the helper

You can. `buildTokenMetadata` exists because three things about it are not
obvious and all three fail silently:

**Socials must be full URLs.** Terminals hyperlink these verbatim, so a bare
`@mycoin` is not a link and gets dropped. Your coin appears to have no Twitter.
The helper expands `mycoin`, `@mycoin` and `https://x.com/mycoin` to the same
thing.

**`website` has to appear twice**, as `website` and `external_url`. Different
terminals read different keys.

**The `attributes` tags decide where aggregators file you.** The helper always
emits `launch_provider: letscash` and `chain: robinhood`, matching the
platform's own pinning. A different string files your coin somewhere else.

Empty fields are omitted rather than emitted blank, because some terminals
render an empty value as a broken link.

### Pre-warm the gateway

letscash.fun does this and it is worth copying: after pinning, fetch the
document once through a public gateway. An indexer probing your token seconds
after launch will otherwise cache a miss while the pin propagates, and some
cache it for a long time.

```ts
fetch(`https://ipfs.io/ipfs/${cid}`).catch(() => {});  // fire and forget
```

### Socials live in two places

On chain in `socials`, and in the pinned JSON. **Both hold complete URLs.**
That is the canonical on-chain shape — a bare handle there is not a link, so
terminals drop it, and the field cannot be edited after mint.

`launchWithMetadata` writes the normalised URLs to both from a single input, so
they cannot drift. If you call `launch` directly, normalise the socials
yourself: `buildTokenMetadata` returns the expanded values to copy across.

### A bare CID is rejected

Pinning services hand back a bare CID, so pasting it straight in is the natural
mistake. The SDK refuses it before the transaction:

```ts
await client.launch({ ..., logo: "bafkreiabc…" });
// InvalidArgumentError: logo looks like a bare CID …prefix it with "ipfs://"
```

Worth catching, because on chain it is just a string — the launch would succeed
and the token would render blank, permanently.

---

## Launching

### Minimal launch

Fees go to the launching account.

```ts
const [config] = await client.getConfigs({ quote: "ETH", feePercent: 1 });

const { token, poolId } = await client.launch({
  configId: config.id,
  name: "My Coin",
  symbol: "MINE",
});
```

### With full metadata

See [images and metadata](#images-and-metadata) for how to produce the two URIs.

```ts
const { token } = await client.launch({
  configId: config.id,
  name: "My Coin",
  symbol: "MINE",
  logo: "ipfs://bafk…",        // you pinned this
  description: "the best coin",
  metadataURI: "ipfs://bafk…", // and this
  socials: {
    twitter: "mycoin",
    telegram: "mycoin",
    discord: "https://discord.gg/…",
    website: "https://mycoin.xyz",
    extra: "",
  },
});
```

### With a dev buy — ETH pool

Buys your own token in the same transaction. On an ether config this rides along in `value`; the SDK works that out.

```ts
const [config] = await client.getConfigs({ quote: "ETH", feePercent: 1 });

const result = await client.launch({
  configId: config.id,
  name: "Founder Coin",
  symbol: "FNDR",
  firstBuy: Amount.parse("0.5", config.quote),   // 0.5 ETH
});

console.log(`got ${result.firstBuyOut} base units`);
```

### With a dev buy — USDG pool

Identical call. The SDK notices the quote is an ERC-20, signs an EIP-2612 permit, and routes to `launchWithPermit` so it stays **one transaction** with no separate approval.

```ts
const [config] = await client.getConfigs({ quote: "USDG", feePercent: 3 });

await client.launch({
  configId: config.id,
  name: "Stable Coin",
  symbol: "STBL",
  firstBuy: Amount.parse("1000", config.quote),  // 1000 USDG — six decimals
});
```

If your quote token has no `permit`, or your signer cannot sign typed data:

```ts
await client.launch({
  configId: config.id,
  name: "Stable Coin",
  symbol: "STBL",
  firstBuy: Amount.parse("1000", config.quote),
  usePermit: false,     // you must approve the factory yourself first
});
```

### Fees to a different wallet

One recipient at 10000 bps. **No splitter is deployed** — the stream just points at that address directly.

```ts
await client.launch({
  configId: config.id,
  name: "Treasury Coin",
  symbol: "TRSY",
  feeRecipients: [
    { address: "0xTreasury…", shareBps: 10_000 },
  ],
});
```

### Fees split between wallets

Two or more deploys a splitter clone. Shares must sum to exactly 10000, and
**a split takes at most four recipients** — the splitter has a fixed slot count.
To pay more parties than that, point one slot at a contract of your own that
fans out further.

```ts
const { token, splitter } = await client.launch({
  configId: config.id,
  name: "Team Coin",
  symbol: "TEAM",
  feeRecipients: [
    { address: "0xAlice…", shareBps: 5000 },  // 50%
    { address: "0xBob…",   shareBps: 3000 },  // 30%
    { address: "0xCarol…", shareBps: 2000 },  // 20%
  ],
});

console.log(`splitter deployed at ${splitter}`);
```

> **Shares are fixed at launch.** Not changeable by the creator, not by the platform, not by anyone. A recipient can hand their own slot on with `rotate`, but the percentages never move. This is the last moment a wrong number can be corrected.

The cap is exported, so you can check against it rather than hardcoding four:

```ts
import { MAX_FEE_RECIPIENTS } from "@letscashfun/sdk";
```

### Fees to a contract

Same as any other address. If your contract cannot *receive* the asset — no payable `receive()` on an ether pool — launch normally and use `claimTo` later to name somewhere that can.

```ts
await client.launch({
  configId: config.id,
  name: "Strategy Coin",
  symbol: "STRAT",
  feeRecipients: [{ address: myStrategyContract, shareBps: 10_000 }],
});
```

### Self-burn

The creator's share buys the token and burns it. There are no creator earnings, so `feeRecipients` is rejected on these configs.

```ts
const [burnConfig] = await client.getConfigs({ quote: "ETH", selfBurn: true });

await client.launch({
  configId: burnConfig.id,
  name: "Deflation Coin",
  symbol: "DEFL",
});
```

### Launching under every configuration

```ts
const combos = await client.getConfigs();

for (const config of combos) {
  await client.launch({
    configId: config.id,
    name: `${config.quote.symbol} ${config.feePercent}% ${config.selfBurn ? "burn" : "std"}`,
    symbol: `T${config.id}`,
  });
}
```

---

## Reading what you are owed

```ts
const coin = await client.token(tokenAddress);

await coin.fees.claimable();      // what a claim pays you, right now  ← use this
await coin.fees.tab();            // already swept and banked
await coin.fees.pendingGross();   // unswept — the WHOLE fee, not just your share
await coin.fees.creator();        // who owns the stream today
await coin.fees.config();         // { creator, creatorFeeBps, feeRate, feePercent, quote }
```

Amounts know their own scale:

```ts
const owed = await coin.fees.claimable();

owed.raw                            // 7000000n
owed.toString()                     // "7 USDG"
owed.format({ maxDecimals: 2 })     // "7 USDG"
owed.format({ symbol: false })      // "7"
owed.asset.decimals                 // 6
owed.isZero                         // false
owed.gte(Amount.parse("5", owed.asset))  // true
```

---

## Claiming

### To yourself

```ts
const { amount, hash } = await coin.fees.claim();
console.log(`claimed ${amount}`);
```

No need to `sweep()` first — `claim` does it.

### To another address

Still called by you; this only chooses the destination.

```ts
await coin.fees.claimTo("0xColdWallet…");
```

Useful when the caller is a contract that can call but cannot receive.

### Part of the balance

```ts
const owed = await coin.fees.claimable();
await coin.fees.claimAmount("0xSomewhere…", owed.percentBps(5000));  // half
```

### Sweep without taking the money

Permissionless. Anyone can call it. Settles the accounting so `tab()` reads exact.

```ts
await coin.fees.sweep();
```

### What you cannot do

**You can never claim on someone else's behalf.** All three claim forms check `msg.sender` against the pool's current creator. Naming a destination chooses where *your* money goes; it does not let you move anyone else's.

```ts
// ✗ There is no API for this, because the contract has no function for it.
// await coin.fees.claimFor(someoneElse);
```

The only thing you can do for another creator is `sweep()`, which moves their fees from the pool manager into their tab. They still have to claim it.

---

## Fee splitters

Get one from the token. `null` means the stream is not split.

```ts
const coin = await client.token(tokenAddress);
const splitter = await coin.splitter();
if (!splitter) throw new Error("this stream is not split");
```

### Read the split

```ts
for (const slice of await splitter.split()) {
  console.log(slice.address, slice.shareBps, `${slice.sharePercent}%`);
}
// 0xAlice…  5000  50%
// 0xBob…    3000  30%
// 0xCarol…  2000  20%
```

### Check your own balance

```ts
await splitter.collectable(account.address);  // ← use this
await splitter.owed(account.address);         // allocated only
await splitter.unallocated();                 // arrived, not yet split
```

`collectable` adds three things: what is allocated to you, your share of what has arrived but not been split, and your share of what is still upstream at the hook. `owed` alone reads zero while fees accrue.

### Checking slot membership

```ts
const { slot, isRecipient } = await splitter.slotOf(account.address);
if (!isRecipient) throw new Error("not a recipient");
// Check the flag, not the index — slot 0 is a real slot.
```

### Collect your share

```ts
await splitter.collect();                          // to yourself
await splitter.collectTo("0xColdWallet…");         // to an address you name
await splitter.collectAmount("0xSomewhere…", part); // part of it
```

### Trigger a distribution for everybody

The one permissionless write. Splits everything that has arrived across all recipients — helps every slot, moves nobody's money out.

```ts
await splitter.distribute();
```

Worth calling before reading `owed`, or if you want the ledger current without collecting.

### Collecting for other people

**You cannot.** `collect` pays down `owed[msg.sender]`. Each recipient collects for themselves.

What you *can* do is `distribute()`, which allocates everyone's share so they each have a balance waiting.

```ts
// ✓ helps everyone
await splitter.distribute();

// ✗ not possible — no contract function does this
// await splitter.collectFor(alice);
```

### Hand your slot to someone else

Moves the future percentage **and** the balance already allocated to it. Irreversible. The destination must not already hold a slot.

```ts
await splitter.collect();               // take what you have first
await splitter.rotate("0xNewOwner…");   // then hand the slot over
```

### A splitter recipient's bot

```ts
const splitter = await coin.splitter();
if (!splitter) throw new Error("not split");

setInterval(async () => {
  const owed = await splitter.collectable(account.address);
  if (owed.gte(Amount.parse("0.05", coin.quote))) {
    await splitter.distribute();   // pull from the hook and allocate
    await splitter.collect();      // take your slice
  }
}, 60_000);
```

---

## Transferring the fee stream

**Irreversible, immediate, and it carries the unclaimed balance with it.**

```ts
await coin.fees.claim();                     // take what has built up
await coin.fees.transferTo("0xNewOwner…");   // then hand it over
```

After this only the new owner can move anything, including fees that accrued while you held it. There is no reverse call and no platform override.

```ts
// Confirm it landed
const owner = await coin.fees.creator();
console.log(owner === newOwner);  // true

// The old owner is now a stranger
await coin.fees.claim();  // throws ContractRevertError, errorName "NotCreator"
```

Sending it to the zero address is refused by the SDK before it reaches the chain — it would strand every future fee the pool earns.

---

## Trading

### Price it first

```ts
const preview = await coin.trade.getQuote("buy", Amount.parse("0.1", coin.quote), 100);

preview.amountOut       // what you would get
preview.minAmountOut    // the floor that will be enforced
preview.gasEstimate
```

### Buy and sell

```ts
await coin.trade.buy(Amount.parse("0.1", coin.quote), { slippageBps: 100 });
await coin.trade.sell(Amount.parse("1000000", coin.asset), { slippageBps: 100 });
```

Permit2 approvals are handled for you. Note "needs an approval" is not "is a sell" — a buy on a USDG pool settles an ERC-20 too.

### Grant approvals up front

For a bot that trades repeatedly and does not want an allowance check on every tick.

```ts
const amount = Amount.parse("1000000", coin.asset);

// Takes the raw value, since an approval is not denominated in anything —
// it is a ceiling on the token's own units.
await coin.trade.ensureApprovals("sell", amount.raw);
await coin.trade.sell(amount, { skipApprovals: true });
```

### Balances

```ts
await coin.balanceOf(account.address);   // an Amount, formats correctly
```

---

## Keeper jobs

### Burn bot — pays a bounty

```ts
const burner = await client.selfBurner();

console.log(await burner.bountyBps());                    // 100 = 1%
console.log(await burner.unburned(poolId, coin.quote));

await burner.burn(poolId);
```

One burn per block. `BurnedThisBlock` and `NothingToBurn` are ordinary outcomes, not failures.

### Convert platform revenue — pays nothing

```ts
const converter = client.revenueConverter();

await converter.convertibleNow(usdg);
await converter.quoteFloor(usdg);   // { fair, floor } — why a convert is refusing
await converter.convert(usdg);
```

---

## Handling errors

Every revert comes back decoded, with a hint about what to do.

```ts
import { ContractRevertError } from "@letscashfun/sdk";

try {
  await coin.fees.claim();
} catch (error) {
  if (error instanceof ContractRevertError) {
    switch (error.errorName) {
      case "NotCreator":
        // the stream was handed on — stop retrying
        break;
      case "UnknownPool":
        // almost always a wrongly derived pool id
        break;
      default:
        console.error(error.message);  // includes the hint
    }
  }
}
```

Writes are simulated before they are signed, so a revert costs no gas.

### Errors worth catching by name

| Error | Means |
|---|---|
| `NotCreator` | The fee stream is not yours. Permanent — stop. |
| `NothingOwed` | Splitter balance is zero. Try `distribute()` first. |
| `NotARecipient` | You hold no slot in that splitter. |
| `BurnedThisBlock` | One burn per block. Wait. |
| `NothingToBurn` | No fees accrued yet. Normal. |
| `AmountNotOwed` | Partial claim above the balance. |
| `ConfigDisabled` | That row was switched off. Re-read the menu. |
| `SaltNotFound` | Mining window empty. The SDK retries; if it surfaces, something else is wrong. |

---

## Gotchas

**`claimable()`, not `tab()`.** Fees sit unswept in Uniswap's pool manager. `tab()` reads zero while real money accrues.

**`pendingGross()` is not your share.** It is the whole fee before the creator/platform split. Adding it to `tab()` overstates what you are owed by 30% on a 1% pool.

**`claim(poolId, to)` with an empty balance succeeds and pays nothing.** `claimAmount(to, 0n)` *reverts* with `AmountNotOwed`. The whole-balance form treats an empty tab as fine; naming a figure the pool does not hold is treated as a mistake at the call site.

**Never hardcode a config id.** Read the menu and filter.

**Never derive a pool id if you can read one.** `client.token(address)` reads it off the token and verifies it. A key you assemble by hand hashes to a valid-looking id for a pool that does not exist, and every read returns zero — indistinguishable from "no fees yet".

**USDG is six decimals.** Use `Amount`; never assume 18.

**`transferTo` and `rotate` are irreversible.** Claim or collect first.

**A single fee recipient deploys no splitter.** `coin.splitter()` returns `null` and that is correct, not an error.

**A split takes at most four recipients.** Use `MAX_FEE_RECIPIENTS` rather than hardcoding it.

**`format({ maxDecimals })` truncates, it does not round.** A displayed balance is never more than the real one, so a bot never thresholds on a number it cannot claim.
