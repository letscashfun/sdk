/**
 * Every SDK surface, exercised against a local anvil fork of Robinhood Chain.
 *
 * Nothing here touches mainnet. Start the fork first:
 *
 *     anvil --fork-url https://rpc.mainnet.chain.robinhood.com --port 8545
 *     npm run test:e2e
 *
 * Skipped automatically when no fork is reachable, so `npm test` stays green
 * without one.
 *
 * The discipline throughout: **read state back independently rather than
 * trusting a return value.** Two real bugs in this package were found exactly
 * that way — a claimable balance that read 30% high, and a splitter balance
 * that read zero while fees accrued. Both returned plausible numbers rather
 * than failing, which is the failure mode worth designing tests around.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { launchSplitterAbi } from "../../src/abis/launchSplitter.js";
import { tokenAbi } from "../../src/abis/token.js";
import { Amount } from "../../src/amount.js";
import { ContractRevertError } from "../../src/errors.js";
import { MAX_FEE_RECIPIENTS } from "../../src/launch.js";
import {
  ANVIL_URL,
  clientFor,
  freshAccount,
  fundedAccount,
  netEtherDelta,
  publicClient,
  readClient,
  setErc20Balance,
  testClient,
} from "./harness.js";
import type { LaunchConfig } from "../../src/configs.js";

const anvilUp = await fetch(ANVIL_URL, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
})
  .then((r) => r.ok)
  .catch(() => false);

describe.skipIf(!anvilUp)("end to end against an anvil fork", () => {
  let enabled: LaunchConfig[];
  let ethConfig: LaunchConfig;

  beforeAll(async () => {
    enabled = await readClient.getConfigs();
    const found = enabled.find((c) => c.quote.symbol === "ETH" && c.feePercent === 1 && !c.selfBurn);
    if (!found) throw new Error("no enabled ETH 1% config on the fork");
    ethConfig = found;
  });

  describe("the launch menu", () => {
    it("selectConfig resolves against the live menu, naming the supply or not", async () => {
      // Today every quote-and-tier names exactly one row, so both forms work.
      // Once a second supply is published the unnamed form starts throwing,
      // which is the entire point — it fails loudly rather than picking one.
      const named = await readClient.selectConfig({
        quote: "ETH",
        feePercent: 1,
        selfBurn: false,
        supplyTokens: 1_000_000_000,
      });
      const unnamed = await readClient.selectConfig({
        quote: "ETH",
        feePercent: 1,
        selfBurn: false,
      });
      expect(named.id).toBe(unnamed.id);
      expect(named.supplyTokens).toBe(1_000_000_000);
    });

    it("selectConfig refuses a filter nothing matches, and says what is live", async () => {
      await expect(
        readClient.selectConfig({ quote: "ETH", feePercent: 1, supplyTokens: 10_000_000_000 }),
      ).rejects.toThrow(/No enabled launch config matches/);
    });

    it("every live row is one billion, so the supply filter is a no-op today", async () => {
      // Pins the precondition the rollout assumes. When this starts failing,
      // the 10B rows have landed and the ambiguity is live.
      const all = await readClient.getAllConfigs();
      expect(all.every((c) => c.supplyTokens === 1_000_000_000)).toBe(true);
    });

    it("reads published rows and separates enabled from disabled", async () => {
      const all = await readClient.getAllConfigs();

      // Strictly greater, not >=. Rows are published ahead of being switched
      // on, so some disabled ones exist — and an assertion of >= would pass
      // even if getAllConfigs were quietly filtering the same way getConfigs
      // does, which is the bug this replaced.
      expect(all.length).toBeGreaterThan(enabled.length);
      expect(all.some((c) => !c.enabled)).toBe(true);
      expect(enabled.every((c) => c.enabled)).toBe(true);
    });

    it("takes a flat 0.30% for the platform on every row, whatever the tier", () => {
      // The creator shares (70/90/94/97) are not arbitrary — they are solved
      // so the platform's cut of volume is constant. If a new row ever breaks
      // that, it is a pricing change and should fail loudly here.
      //
      // Exact equality, not toBeCloseTo. A tolerance here passed happily on
      // 0.30000000000000004, which is the value that was being rendered into
      // the README's own example.
      for (const config of enabled) {
        expect(config.platformPercentOfVolume).toBe(0.3);
      }
    });

    it("derives every live tier to the exact published figures", () => {
      // Pinned literals rather than the derivation re-expressed. Asserting
      // feePercent against `(feeRate / 1e6) * 100` restates what deriveConfig
      // computes, so it cannot fail — a tautology, not a test.
      const EXPECTED: Record<number, { fee: number; creator: number; platform: number }> = {
        10_000: { fee: 1, creator: 0.7, platform: 0.3 },
        30_000: { fee: 3, creator: 2.7, platform: 0.3 },
        50_000: { fee: 5, creator: 4.7, platform: 0.3 },
        100_000: { fee: 10, creator: 9.7, platform: 0.3 },
      };

      for (const config of enabled) {
        const expected = EXPECTED[config.feeRate];
        expect(expected, `unpinned fee rate ${config.feeRate} on config ${config.id}`).toBeDefined();
        if (!expected) continue;
        expect(config.feePercent).toBe(expected.fee);
        expect(config.creatorPercentOfVolume).toBe(expected.creator);
        expect(config.platformPercentOfVolume).toBe(expected.platform);
        // The split loses nothing. Exact, because the arithmetic is now
        // integer-first specifically so that it can be.
        expect(config.creatorPercentOfVolume + config.platformPercentOfVolume).toBe(
          config.feePercent,
        );
      }
    });
  });

  describe("an ether launch, fees to the launcher", () => {
    it("launches, resolves back, and agrees with itself on identity", async () => {
      const { account, client } = await fundedAccount();
      const launched = await client.launch({
        configId: ethConfig.id,
        name: "E2E Coin",
        symbol: "E2E",
      });

      expect(launched.token).toMatch(/^0x[0-9a-fA-F]{40}$/);
      // The factory only accepts a mined salt, so the address must carry the
      // stamp. If this ever fails, mineSalt was bypassed somewhere.
      expect(launched.token.toLowerCase().endsWith("cc")).toBe(true);
      expect(launched.splitter).toBeNull();
      expect(launched.feeRecipient.toLowerCase()).toBe(account.address.toLowerCase());

      const token = await client.token(launched.token);
      expect(token.poolId).toBe(launched.poolId);
      expect(token.quote.symbol).toBe("ETH");
      expect(token.quote.decimals).toBe(18);
      expect((await token.fees.creator()).toLowerCase()).toBe(account.address.toLowerCase());
      expect(await token.isSelfBurn()).toBe(false);

      const meta = await token.metadata();
      expect(meta.name).toBe("E2E Coin");
      expect(meta.symbol).toBe("E2E");
      expect(meta.totalSupply).toBe(ethConfig.supply);
    });

    it("accrues exactly the creator's share, and claims exactly what it promised", async () => {
      const { account, client } = await fundedAccount();
      const launched = await client.launch({
        configId: ethConfig.id,
        name: "Fee Coin",
        symbol: "FEE",
      });
      const token = await client.token(launched.token);

      expect((await token.fees.claimable()).isZero).toBe(true);

      const spend = Amount.parse("1", token.quote);
      await token.trade.buy(spend);

      // 1% of the quote leg, of which the creator takes 70%.
      const expectedGross = spend.percentBps(100);
      const expectedCreator = expectedGross.percentBps(ethConfig.creatorFeeBps);

      expect((await token.fees.pendingGross()).raw).toBe(expectedGross.raw);
      const claimable = await token.fees.claimable();
      expect(claimable.raw).toBe(expectedCreator.raw);

      // The bug that motivated this assertion: tab and pending sit on opposite
      // sides of the split, so adding them raw overstated this by 30%.
      const before = await publicClient.getBalance({ address: account.address });
      const claimed = await token.fees.claim();
      expect(claimed.amount.raw).toBe(claimable.raw);
      expect((await token.fees.claimable()).isZero).toBe(true);

      // The money moved, and moved by exactly the amount claimed.
      //
      // This replaced `expect(after).toBeGreaterThan(0n)` on an account funded
      // with 1000 ETH — an assertion that passes whether the payout is right,
      // wrong, or never happens. Netting out gas makes the delta equal the
      // payout exactly, so a wrong amount or a payout to the wrong address
      // both fail here.
      const delta = await netEtherDelta(account.address, before, claimed.receipt);
      expect(delta).toBe(claimed.amount.raw);
    });

    it("pays a claim to the address you name, and not to the caller", async () => {
      const { account, client } = await fundedAccount();
      const launched = await client.launch({
        configId: ethConfig.id,
        name: "ClaimTo Coin",
        symbol: "CTO",
      });
      const token = await client.token(launched.token);
      await token.trade.buy(Amount.parse("1", token.quote));

      const owed = await token.fees.claimable();
      expect(owed.raw).toBeGreaterThan(0n);

      // A fresh address with no balance, so there is nothing to confuse the
      // delta with.
      const destination = freshAccount().address;
      const callerBefore = await publicClient.getBalance({ address: account.address });

      const claimed = await token.fees.claimTo(destination);

      // The destination got exactly the payout...
      expect(await publicClient.getBalance({ address: destination })).toBe(claimed.amount.raw);
      // ...and the caller, who signed and paid for it, got nothing but the bill.
      const callerDelta = await netEtherDelta(account.address, callerBefore, claimed.receipt);
      expect(callerDelta).toBe(0n);
    });

    it("quotes a buy and delivers at least the floor", async () => {
      const { account, client } = await fundedAccount();
      const launched = await client.launch({
        configId: ethConfig.id,
        name: "Quote Coin",
        symbol: "QUOT",
      });
      const token = await client.token(launched.token);

      const spend = Amount.parse("1", token.quote);
      const preview = await token.trade.getQuote("buy", spend, 100);
      expect(preview.amountOut.raw).toBeGreaterThan(0n);
      expect(preview.minAmountOut.raw).toBeLessThan(preview.amountOut.raw);

      await token.trade.buy(spend, { slippageBps: 100 });
      const held = await token.balanceOf(account.address);
      expect(held.raw).toBeGreaterThanOrEqual(preview.minAmountOut.raw);
    });

    it("sells back and accrues a fee on the way out too", async () => {
      const { account, client } = await fundedAccount();
      const launched = await client.launch({
        configId: ethConfig.id,
        name: "Sell Coin",
        symbol: "SELL",
      });
      const token = await client.token(launched.token);

      await token.trade.buy(Amount.parse("1", token.quote));
      await token.fees.claim();
      expect((await token.fees.claimable()).isZero).toBe(true);

      const held = await token.balanceOf(account.address);
      await token.trade.sell(Amount.raw(held.raw / 2n, token.asset));

      // Fees are charged on both legs, so a sell leaves something claimable.
      expect((await token.fees.claimable()).raw).toBeGreaterThan(0n);
      expect((await token.balanceOf(account.address)).raw).toBeLessThan(held.raw);
    });

    it("rejects a slippage tolerance above the ceiling", async () => {
      const { client } = await fundedAccount();
      const launched = await client.launch({
        configId: ethConfig.id,
        name: "Slip Coin",
        symbol: "SLIP",
      });
      const token = await client.token(launched.token);
      await expect(
        token.trade.getQuote("buy", Amount.parse("1", token.quote), 9900),
      ).rejects.toThrow(/outside the accepted range/);
    });
  });

  describe("launching with metadata", () => {
    it("pins, launches, and lands both URIs and the socials on chain", async () => {
      const { client } = await fundedAccount();

      // A fake pinner — a real Pinata call would need a credential, cost
      // money, and prove only that Pinata works. What matters here is that
      // whatever it returns reaches the token intact.
      const pinner = {
        async pinFile() {
          return "ipfs://bafkIMAGE";
        },
        async pinJson() {
          return "ipfs://bafkJSON";
        },
      };

      const result = await client.launchWithMetadata({
        configId: ethConfig.id,
        name: "Meta Coin",
        symbol: "META",
        description: "has a picture",
        image: { data: new Uint8Array([1, 2, 3]), mimeType: "image/png" },
        twitter: "@metacoin",
        telegram: "metacoin",
        website: "metacoin.xyz",
        pinner,
        // The fake pinner returns CIDs that resolve nowhere, so the read-back
        // would correctly refuse this launch. Verification has its own tests
        // in test/pinning.test.ts; what this one proves is that whatever the
        // pinner returns reaches the token intact.
        verifyPins: { verify: false },
      });

      expect(result.logo).toBe("ipfs://bafkIMAGE");
      expect(result.metadataURI).toBe("ipfs://bafkJSON");
      // Handles expanded in the pinned document, because terminals hyperlink
      // these verbatim.
      expect(result.metadata.twitter).toBe("https://x.com/metacoin");
      expect(result.metadata.image).toBe("ipfs://bafkIMAGE");

      // And the contract kept all of it. These fields are set at mint and
      // cannot be edited, so a silent truncation here would be permanent.
      const token = await client.token(result.token);
      const meta = await token.metadata();
      expect(meta.logo).toBe("ipfs://bafkIMAGE");
      expect(meta.description).toBe("has a picture");

      // The on-chain socials must be COMPLETE URLS, not the raw input.
      //
      // This is the assertion that was missing. The SDK computed the right URL,
      // pinned it, and then wrote the raw handle to the chain — reproducing a
      // bug the website already fixed and still carries legacy readers for. A
      // bare handle is not a link, terminals drop it, and the field cannot be
      // edited after mint.
      expect(meta.socials.twitter).toBe("https://x.com/metacoin");
      expect(meta.socials.telegram).toBe("https://t.me/metacoin");
      expect(meta.socials.website).toBe("https://metacoin.xyz");

      // Chain and pinned document agree, which is the whole point.
      expect(meta.socials.twitter).toBe(result.metadata.twitter);
      expect(meta.socials.telegram).toBe(result.metadata.telegram);
      expect(meta.socials.website).toBe(result.metadata.website);

      // Nothing bare survived anywhere.
      for (const value of [meta.socials.twitter, meta.socials.telegram, meta.socials.website]) {
        expect(value).toMatch(/^https:\/\//);
      }

      const metaURI = await publicClient.readContract({
        address: result.token,
        abi: tokenAbi,
        functionName: "metaURI",
      });
      expect(metaURI).toBe("ipfs://bafkJSON");
    });

    it("refuses a bare CID before the transaction, since it cannot be fixed after", async () => {
      const { client } = await fundedAccount();
      await expect(
        client.launch({
          configId: ethConfig.id,
          name: "Bare CID",
          symbol: "BARE",
          logo: "bafkreibvjvcv745gig4mvqs4hctx4zfkono4rjejm2ta6gtyzkqxfjeily",
        }),
      ).rejects.toThrow(/bare CID/);
    });
  });

  describe("a split fee stream", () => {
    it("deploys a splitter, allocates by share, collects and rotates", async () => {
      const { client } = await fundedAccount();
      const alice = freshAccount();
      const bob = freshAccount();
      const carol = freshAccount();

      const launched = await client.launch({
        configId: ethConfig.id,
        name: "Split Coin",
        symbol: "SPLIT",
        feeRecipients: [
          { address: alice.address, shareBps: 5000 },
          { address: bob.address, shareBps: 3000 },
          { address: carol.address, shareBps: 2000 },
        ],
      });
      expect(launched.splitter).not.toBeNull();

      const token = await client.token(launched.token);
      const splitter = await token.splitter();
      expect(splitter).not.toBeNull();
      if (!splitter) return;

      // The stream points at the splitter, not at the launcher.
      expect((await token.fees.creator()).toLowerCase()).toBe(splitter.address.toLowerCase());

      const slices = await splitter.split();
      expect(slices.map((s) => s.shareBps)).toEqual([5000, 3000, 2000]);
      expect(slices.reduce((sum, s) => sum + s.shareBps, 0)).toBe(10_000);

      const { feeSource, poolId } = await splitter.source();
      expect(feeSource.toLowerCase()).toBe(token.hook.toLowerCase());
      expect(poolId).toBe(token.poolId);

      await token.trade.buy(Amount.parse("2", token.quote));
      const upstream = await token.fees.claimable();
      expect(upstream.raw).toBeGreaterThan(0n);

      // Before distribute the splitter holds nothing, so `owed` is zero while
      // `collectable` must already see the money sitting upstream.
      expect((await splitter.owed(alice.address)).isZero).toBe(true);
      const aliceCollectable = await splitter.collectable(alice.address);
      expect(aliceCollectable.raw).toBe(upstream.percentBps(5000).raw);

      await splitter.distribute();
      expect((await splitter.owed(alice.address)).raw).toBe(upstream.percentBps(5000).raw);
      expect((await splitter.owed(bob.address)).raw).toBe(upstream.percentBps(3000).raw);
      expect((await splitter.owed(carol.address)).raw).toBe(upstream.percentBps(2000).raw);

      // Alice collects with her own key — the slot authorises it, not the launcher.
      await testClient.setBalance({ address: alice.address, value: 10n ** 18n });
      const aliceSplitter = clientFor(alice).splitter(splitter.address, token.quote);
      const before = await publicClient.getBalance({ address: alice.address });
      await aliceSplitter.collect();
      expect(await publicClient.getBalance({ address: alice.address })).toBeGreaterThan(before);
      expect((await splitter.owed(alice.address)).isZero).toBe(true);

      // Rotating moves the slot itself.
      const dave = freshAccount();
      expect((await splitter.slotOf(alice.address)).isRecipient).toBe(true);
      await aliceSplitter.rotate(dave.address);
      expect((await splitter.slotOf(alice.address)).isRecipient).toBe(false);
      expect((await splitter.slotOf(dave.address)).isRecipient).toBe(true);
    });

    it("refuses a split that does not sum to 10000 before anything is signed", async () => {
      const { client } = await fundedAccount();
      await expect(
        client.launch({
          configId: ethConfig.id,
          name: "Bad Split",
          symbol: "BAD",
          feeRecipients: [
            { address: freshAccount().address, shareBps: 5000 },
            { address: freshAccount().address, shareBps: 4000 },
          ],
        }),
      ).rejects.toThrow(/sum to exactly 10000/);
    });

    it("refuses a duplicate recipient", async () => {
      const { client } = await fundedAccount();
      const dup = freshAccount().address;
      await expect(
        client.launch({
          configId: ethConfig.id,
          name: "Dup Split",
          symbol: "DUP",
          feeRecipients: [
            { address: dup, shareBps: 5000 },
            { address: dup, shareBps: 5000 },
          ],
        }),
      ).rejects.toThrow(/appears twice/);
    });

    it("agrees with the deployed splitter on how many slots there are", async () => {
      // MAX_FEE_RECIPIENTS is a constant in the SDK, so it can drift from the
      // contract. Reading it here is the only thing that stops that.
      const { splitterMaster } = await readClient.getModuleSet();
      const onChain = await publicClient.readContract({
        address: splitterMaster,
        abi: launchSplitterAbi,
        functionName: "MAX_RECIPIENTS",
      });
      expect(Number(onChain)).toBe(MAX_FEE_RECIPIENTS);
    });

    it("refuses more recipients than there are slots", async () => {
      const { client } = await fundedAccount();
      const tooMany = Array.from({ length: MAX_FEE_RECIPIENTS + 1 }, () => ({
        address: freshAccount().address,
        shareBps: 10_000 / (MAX_FEE_RECIPIENTS + 1),
      }));
      await expect(
        client.launch({ configId: ethConfig.id, name: "Too Many", symbol: "MANY", feeRecipients: tooMany }),
      ).rejects.toThrow(/at most 4 recipients/);
    });

    it("refuses a protocol address as a recipient", async () => {
      const { client } = await fundedAccount();
      await expect(
        client.launch({
          configId: ethConfig.id,
          name: "Bad Route",
          symbol: "ROUTE",
          feeRecipients: [
            { address: readClient.addresses.factory, shareBps: 10_000 },
          ],
        }),
      ).rejects.toThrow(/protocol address/);
    });
  });

  describe("a self-burn launch", () => {
    it("routes fees to the burner and burns supply for a bounty", async () => {
      const burnConfig = enabled.find((c) => c.quote.symbol === "ETH" && c.selfBurn);
      if (!burnConfig) return;

      const { client } = await fundedAccount();
      const launched = await client.launch({
        configId: burnConfig.id,
        name: "Burn Coin",
        symbol: "BURN",
      });
      const token = await client.token(launched.token);
      expect(await token.isSelfBurn()).toBe(true);

      await token.trade.buy(Amount.parse("2", token.quote));

      const supplyBefore = (await token.metadata()).totalSupply;
      const keeper = await fundedAccount(1);
      const burner = await keeper.client.selfBurner();
      expect(await burner.bountyBps()).toBeGreaterThan(0);

      await burner.burn(token.poolId);

      const supplyAfter = (await token.metadata()).totalSupply;
      expect(supplyAfter).toBeLessThan(supplyBefore);
    });
  });

  describe("a USDG launch", () => {
    it("pays the first buy with a permit and denominates everything in 6 decimals", async () => {
      const usdgConfig = enabled.find((c) => c.quote.symbol === "USDG" && !c.selfBurn);
      if (!usdgConfig) return;

      const { account, client } = await fundedAccount();
      const usdg = usdgConfig.quote;
      const funded = await setErc20Balance(usdg.address, account.address, 5_000_000_000n);
      expect(funded, "could not find the USDG balance slot on the fork").toBe(true);

      const firstBuy = Amount.parse("1000", usdg);
      const launched = await client.launch({
        configId: usdgConfig.id,
        name: "Stable Test",
        symbol: "STAB",
        firstBuy,
      });
      expect(launched.firstBuyOut).toBeGreaterThan(0n);

      const token = await client.token(launched.token);
      expect(token.quote.decimals).toBe(6);

      // 1% of 1000 USDG, 70% of it to the creator, expressed in six decimals.
      const expected = firstBuy.percentBps(100).percentBps(usdgConfig.creatorFeeBps);
      expect((await token.fees.claimable()).raw).toBe(expected.raw);
      // And it renders as a human number, not as a raw integer.
      expect((await token.fees.claimable()).format()).toBe("7 USDG");

      // A USDG buy settles an ERC-20, so it goes through Permit2 — the path a
      // naive integration misses because an ether buy never needs it.
      await token.trade.buy(Amount.parse("500", usdg));
      const claimed = await token.fees.claim();
      expect(claimed.amount.asset.decimals).toBe(6);
      expect(claimed.amount.raw).toBeGreaterThan(expected.raw);
    });
  });

  describe("moving a fee stream", () => {
    it("transfers ownership irreversibly and locks the old owner out", async () => {
      const { client } = await fundedAccount();
      const launched = await client.launch({
        configId: ethConfig.id,
        name: "Move Coin",
        symbol: "MOVE",
      });
      const token = await client.token(launched.token);
      const newOwner = freshAccount();

      await token.fees.transferTo(newOwner.address);
      expect((await token.fees.creator()).toLowerCase()).toBe(newOwner.address.toLowerCase());

      await token.trade.buy(Amount.parse("1", token.quote));

      // The old owner is now a stranger to this stream.
      await expect(token.fees.claim()).rejects.toThrow(ContractRevertError);
      await expect(token.fees.claim()).rejects.toMatchObject({ errorName: "NotCreator" });

      // And the new owner can take it.
      await testClient.setBalance({ address: newOwner.address, value: 10n ** 18n });
      const asNewOwner = clientFor(newOwner);
      const theirStream = asNewOwner.feeStream(token.poolId, token.hook);
      const claimed = await theirStream.claim();
      expect(claimed.amount.raw).toBeGreaterThan(0n);
    });

    it("refuses to send a stream to the zero address", async () => {
      const { client } = await fundedAccount();
      const launched = await client.launch({
        configId: ethConfig.id,
        name: "Zero Coin",
        symbol: "ZERO",
      });
      const token = await client.token(launched.token);
      await expect(
        token.fees.transferTo("0x0000000000000000000000000000000000000000"),
      ).rejects.toThrow(/zero address/);
    });
  });

  describe("guard rails", () => {
    it("refuses to resolve a token that is not from this launchpad", async () => {
      await expect(readClient.token(readClient.addresses.permit2)).rejects.toThrow(
        /does not look like a letscash token/,
      );
    });

    it("refuses a write with no wallet attached", async () => {
      const launchedBy = await fundedAccount();
      const launched = await launchedBy.client.launch({
        configId: ethConfig.id,
        name: "ReadOnly Coin",
        symbol: "RO",
      });
      const token = await readClient.token(launched.token);
      await expect(token.fees.claim()).rejects.toThrow(/has no wallet/);
    });
  });
});
