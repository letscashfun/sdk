/**
 * Metadata building, checked against what letscash.fun's own endpoint pins.
 *
 * The point of the helper is that a token launched through the SDK is
 * indistinguishable on a terminal from one launched through the website. That
 * only holds if this stays byte-compatible with the platform's pinning, so the
 * expectations here are written as the literal documents that endpoint
 * produces rather than as properties of this implementation.
 */

import { describe, expect, it } from "vitest";

import { InvalidArgumentError } from "../src/errors.js";
import {
  assertResolvableUri,
  buildTokenMetadata,
  checkTokenMetadata,
} from "../src/metadata.js";

const ATTRIBUTES = [
  { trait_type: "launch_provider", value: "letscash" },
  { trait_type: "chain", value: "robinhood" },
];

describe("buildTokenMetadata", () => {
  it("produces the document the platform pins", () => {
    expect(
      buildTokenMetadata({
        name: "My Coin",
        symbol: "MINE",
        description: "the best coin",
        image: "ipfs://bafkreiabc",
        twitter: "mycoin",
        telegram: "mycoin",
        website: "mycoin.xyz",
      }),
    ).toEqual({
      name: "My Coin",
      symbol: "MINE",
      description: "the best coin",
      image: "ipfs://bafkreiabc",
      website: "https://mycoin.xyz",
      external_url: "https://mycoin.xyz",
      twitter: "https://x.com/mycoin",
      telegram: "https://t.me/mycoin",
      attributes: ATTRIBUTES,
    });
  });

  describe("social handles", () => {
    it("expands a bare handle to the URL a terminal will hyperlink", () => {
      // The failure this prevents is silent: a terminal links these verbatim,
      // so "mycoin" is not a link and the coin appears to have no Twitter.
      const meta = buildTokenMetadata({ name: "n", symbol: "s", twitter: "mycoin" });
      expect(meta.twitter).toBe("https://x.com/mycoin");
    });

    it("strips leading @ before expanding", () => {
      expect(buildTokenMetadata({ name: "n", symbol: "s", twitter: "@mycoin" }).twitter).toBe(
        "https://x.com/mycoin",
      );
      expect(buildTokenMetadata({ name: "n", symbol: "s", twitter: "@@mycoin" }).twitter).toBe(
        "https://x.com/mycoin",
      );
    });

    it("leaves a full URL alone, whatever the scheme case", () => {
      for (const url of ["https://x.com/mycoin", "http://x.com/mycoin", "HTTPS://x.com/mycoin"]) {
        expect(buildTokenMetadata({ name: "n", symbol: "s", twitter: url }).twitter).toBe(url);
      }
    });

    it("uses the right prefix per platform", () => {
      const meta = buildTokenMetadata({
        name: "n",
        symbol: "s",
        twitter: "a",
        telegram: "b",
        website: "c.xyz",
        discord: "discord.gg/abc123",
      });
      expect(meta.twitter).toBe("https://x.com/a");
      expect(meta.telegram).toBe("https://t.me/b");
      expect(meta.website).toBe("https://c.xyz");
      expect(meta.discord).toBe("https://discord.gg/abc123");
    });

    describe("a pasted partial URL", () => {
      // The bug this replaced: prefixing a value that already carries its
      // domain produced https://x.com/x.com/mycoin — a live link to nothing.
      const cases: [string, string, string][] = [
        ["twitter", "x.com/mycoin", "https://x.com/mycoin"],
        ["twitter", "twitter.com/mycoin", "https://twitter.com/mycoin"],
        ["twitter", "www.x.com/mycoin", "https://www.x.com/mycoin"],
        ["telegram", "t.me/mycoin", "https://t.me/mycoin"],
        ["telegram", "telegram.me/mycoin", "https://telegram.me/mycoin"],
        ["discord", "discord.gg/abc", "https://discord.gg/abc"],
      ];

      for (const [field, given, expected] of cases) {
        it(`${field}: "${given}" -> ${expected}`, () => {
          const meta = buildTokenMetadata({ name: "n", symbol: "s", [field]: given });
          expect(meta[field as "twitter" | "telegram" | "discord"]).toBe(expected);
          // The failure mode being guarded: the domain appearing twice.
          expect(meta[field as "twitter"]).not.toMatch(/x\.com\/x\.com|t\.me\/t\.me/);
        });
      }

      it("strips a leading slash rather than doubling it", () => {
        expect(buildTokenMetadata({ name: "n", symbol: "s", twitter: "/mycoin" }).twitter).toBe(
          "https://x.com/mycoin",
        );
      });
    });
  });

  describe("validation", () => {
    it("rejects a value with a space in it", () => {
      expect(() => buildTokenMetadata({ name: "n", symbol: "s", twitter: "my coin" })).toThrow(
        /contains a space/,
      );
    });

    it("rejects a host with no domain suffix, with or without a scheme", () => {
      // Both resolve for nobody. The scheme'd form used to slip through,
      // because the check only ran on the no-scheme path — so typing
      // "https://" yourself skipped the very rule meant to catch this.
      expect(() => buildTokenMetadata({ name: "n", symbol: "s", website: "mycoin" })).toThrow(
        /no domain suffix/,
      );
      expect(() =>
        buildTokenMetadata({ name: "n", symbol: "s", website: "https://mycoin" }),
      ).toThrow(/no domain suffix/);
    });

    it("rejects something that starts like a URL but is not one", () => {
      expect(() =>
        buildTokenMetadata({ name: "n", symbol: "s", website: "https://" }),
      ).toThrow(/does not parse as one/);
    });

    it("rejects a broken or unsupported scheme rather than treating it as a handle", () => {
      // "ht!tp://x" has :// but no recognised scheme, so it fell through to
      // handle-prefixing and became https://x.com/ht!tp://x — a live link to
      // nothing, which is the class of thing these rules exist to stop.
      for (const value of ["ht!tp://x", "ftp://files.example", "javascript://x"]) {
        expect(() => buildTokenMetadata({ name: "n", symbol: "s", twitter: value })).toThrow(
          /broken or unsupported scheme/,
        );
      }
    });

    it("accepts a full URL pointing anywhere, without comment", () => {
      // Deliberately unpoliced. Projects routinely put a Linktree, a docs site
      // or a launch thread in the Twitter field, and that is normal usage —
      // warning about it would be noise, and noisy warnings get ignored, which
      // costs the ones that matter.
      const warnings: unknown[] = [];
      for (const url of [
        "https://linktr.ee/mycoin",
        "https://mycoin.xyz/socials",
        "http://example.com",
      ]) {
        const meta = buildTokenMetadata(
          { name: "n", symbol: "s", twitter: url },
          { onWarning: (w) => warnings.push(w) },
        );
        expect(meta.twitter).toBe(url);
      }
      expect(warnings).toEqual([]);
    });

    it("warns when a domain is put in a handle field", () => {
      const warnings: { field: string; message: string }[] = [];
      buildTokenMetadata(
        { name: "n", symbol: "s", twitter: "mycoin.xyz" },
        { onWarning: (w) => warnings.push(w) },
      );
      // https://x.com/mycoin.xyz is a live link to somebody else's profile.
      expect(warnings[0]?.message).toContain("looks like a domain");
    });

    it("does not warn on an ordinary handle or a matching URL", () => {
      const warnings: unknown[] = [];
      buildTokenMetadata(
        {
          name: "n",
          symbol: "s",
          twitter: "mycoin",
          telegram: "https://t.me/mycoin",
          website: "mycoin.xyz",
        },
        { onWarning: (w) => warnings.push(w) },
      );
      expect(warnings).toEqual([]);
    });
  });

  describe("checkTokenMetadata", () => {
    it("reports what a value would become, without pinning", () => {
      const check = checkTokenMetadata({ name: "My Coin", symbol: "MINE", twitter: "x.com/mycoin" });
      expect(check.ok).toBe(true);
      expect(check.metadata?.twitter).toBe("https://x.com/mycoin");
      expect(check.warnings).toEqual([]);
    });

    it("returns the failure instead of throwing", () => {
      const check = checkTokenMetadata({ name: "", symbol: "MINE" });
      expect(check.ok).toBe(false);
      expect(check.error).toMatch(/non-empty name/);
      expect(check.metadata).toBeUndefined();
    });

    it("collects warnings for a value that is legal but probably wrong", () => {
      // A bare domain in a handle field is the ambiguous case worth flagging:
      // it becomes https://x.com/mycoin.xyz, a live link to a profile that is
      // not theirs. A full URL pointing anywhere is not flagged — that is
      // deliberate usage, not a slip.
      const check = checkTokenMetadata({ name: "n", symbol: "s", twitter: "mycoin.xyz" });
      expect(check.ok).toBe(true);
      expect(check.warnings).toHaveLength(1);

      const clean = checkTokenMetadata({ name: "n", symbol: "s", twitter: "https://example.com/x" });
      expect(clean.warnings).toEqual([]);
    });

    it("mirrors website into external_url, since some terminals read only that", () => {
      const meta = buildTokenMetadata({ name: "n", symbol: "s", website: "mycoin.xyz" });
      expect(meta.external_url).toBe(meta.website);
    });
  });

  describe("empty fields", () => {
    it("omits absent socials rather than emitting empty strings", () => {
      // A key present with an empty value renders as a broken link on some
      // terminals, which is worse than the field being absent.
      const meta = buildTokenMetadata({ name: "n", symbol: "s" });
      expect(meta).not.toHaveProperty("twitter");
      expect(meta).not.toHaveProperty("telegram");
      expect(meta).not.toHaveProperty("website");
      expect(meta).not.toHaveProperty("external_url");
      expect(meta).not.toHaveProperty("discord");
    });

    it("still emits description and image, empty, because terminals expect the keys", () => {
      const meta = buildTokenMetadata({ name: "n", symbol: "s" });
      expect(meta.description).toBe("");
      expect(meta.image).toBe("");
    });

    it("treats a whitespace-only social as absent", () => {
      expect(buildTokenMetadata({ name: "n", symbol: "s", twitter: "   " })).not.toHaveProperty(
        "twitter",
      );
    });
  });

  describe("length caps", () => {
    it("truncates to the platform's limits", () => {
      const meta = buildTokenMetadata({
        name: "n".repeat(200),
        symbol: "s".repeat(50),
        description: "d".repeat(2000),
      });
      expect(meta.name).toHaveLength(100);
      expect(meta.symbol).toHaveLength(20);
      expect(meta.description).toHaveLength(1000);
    });

    it("truncates then trims, matching the endpoint's order", () => {
      // "aaaa " sliced to 4 is "aaaa"; sliced to 5 then trimmed is also
      // "aaaa". Trimming first would give a different length at the boundary.
      const meta = buildTokenMetadata({ name: `${"a".repeat(99)}   `, symbol: "s" });
      expect(meta.name).toBe("a".repeat(99));
    });
  });

  describe("required fields", () => {
    it("rejects an empty name or symbol", () => {
      expect(() => buildTokenMetadata({ name: "", symbol: "s" })).toThrow(InvalidArgumentError);
      expect(() => buildTokenMetadata({ name: "n", symbol: "" })).toThrow(InvalidArgumentError);
      expect(() => buildTokenMetadata({ name: "   ", symbol: "s" })).toThrow(/non-empty name/);
    });
  });

  describe("image URIs", () => {
    it("accepts ipfs, https and arweave", () => {
      for (const uri of ["ipfs://bafkreiabc", "https://cdn.example/a.png", "ar://abc"]) {
        expect(buildTokenMetadata({ name: "n", symbol: "s", image: uri }).image).toBe(uri);
      }
    });

    it("rejects a bare CID, which is the realistic mistake", () => {
      // Pinning services return a bare CID, so pasting it straight in is the
      // natural error. On chain it is just a string: the launch succeeds and
      // the token renders with no image, permanently.
      for (const cid of [
        "bafkreibvjvcv745gig4mvqs4hctx4zfkono4rjejm2ta6gtyzkqxfjeily",
        "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG",
      ]) {
        expect(() => buildTokenMetadata({ name: "n", symbol: "s", image: cid })).toThrow(
          /bare CID/,
        );
      }
    });

    it("rejects an unrecognised scheme", () => {
      expect(() =>
        buildTokenMetadata({ name: "n", symbol: "s", image: "ftp://example/a.png" }),
      ).toThrow(/must be an ipfs/);
    });
  });

  it("always tags the launch provider and chain", () => {
    // This is what an aggregator files the launchpad under. A token pinned
    // with a different provider string gets categorised somewhere else.
    expect(buildTokenMetadata({ name: "n", symbol: "s" }).attributes).toEqual(ATTRIBUTES);
  });
});

describe("assertResolvableUri", () => {
  it("allows an empty value, since both fields are optional", () => {
    expect(() => assertResolvableUri("", "logo")).not.toThrow();
  });

  it("names the field it rejected", () => {
    expect(() => assertResolvableUri("QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG", "logo")).toThrow(
      /^logo looks like a bare CID/,
    );
  });

  it("does not mistake a short string for a CID", () => {
    // "bafk" alone is not a CID, and a false positive here would block a
    // legitimate value.
    expect(() => assertResolvableUri("https://example.com/bafk", "logo")).not.toThrow();
  });
});
