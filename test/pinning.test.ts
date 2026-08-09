/**
 * The pinning helper, against a fake pinner that records what it was asked.
 *
 * The ordering is the whole reason this helper exists: the metadata document
 * has to contain the image's URI, so the image must be pinned first. Do it the
 * other way round and you get a document with an empty `image` that pins
 * successfully and renders blank — no error anywhere.
 *
 * A real Pinata call is deliberately not exercised. It would need a
 * credential, cost money, and prove only that Pinata works.
 */

import { describe, expect, it, vi } from "vitest";

import { InvalidArgumentError } from "../src/errors.js";
import {
  PinVerificationError,
  type Pinner,
  pinataPinner,
  prepareLaunchMetadata,
} from "../src/pinning.js";

/** Records every call in order, and what the JSON pin actually received. */
function fakePinner() {
  const calls: string[] = [];
  let pinnedJson: unknown;

  const pinner: Pinner = {
    async pinFile({ filename }) {
      calls.push(`pinFile:${filename}`);
      return "ipfs://bafkIMAGE";
    },
    async pinJson(content) {
      calls.push("pinJson");
      pinnedJson = content;
      return "ipfs://bafkJSON";
    },
  };

  return { pinner, calls, json: () => pinnedJson as Record<string, unknown> };
}

/**
 * Verification is on by default and is exercised in its own block below. These
 * tests are about ordering and document contents, so they skip the read-back
 * rather than stubbing a gateway for every case.
 */
const prepare = (pinner: Pinner, input: Parameters<typeof prepareLaunchMetadata>[1]) =>
  prepareLaunchMetadata(pinner, input, { verify: false });

describe("prepareLaunchMetadata", () => {
  it("pins the image before the document, and puts the URI inside it", async () => {
    const { pinner, calls, json } = fakePinner();

    const result = await prepare(pinner, {
      name: "My Coin",
      symbol: "MINE",
      image: { data: new Uint8Array([1, 2, 3]), mimeType: "image/png", filename: "coin.png" },
    });

    expect(calls).toEqual(["pinFile:coin.png", "pinJson"]);
    // The assertion that matters: the document carries the image's real URI,
    // not an empty string.
    expect(json().image).toBe("ipfs://bafkIMAGE");
    expect(result.logo).toBe("ipfs://bafkIMAGE");
    expect(result.metadataURI).toBe("ipfs://bafkJSON");
  });

  it("passes an already-pinned URI straight through without re-pinning", async () => {
    const { pinner, calls, json } = fakePinner();

    const result = await prepare(pinner, {
      name: "My Coin",
      symbol: "MINE",
      image: "ipfs://bafkEXISTING",
    });

    expect(calls).toEqual(["pinJson"]);
    expect(result.logo).toBe("ipfs://bafkEXISTING");
    expect(json().image).toBe("ipfs://bafkEXISTING");
  });

  it("launches without a picture when no image is given", async () => {
    const { pinner, calls, json } = fakePinner();
    const result = await prepare(pinner, { name: "n", symbol: "s" });

    expect(calls).toEqual(["pinJson"]);
    expect(result.logo).toBe("");
    expect(json().image).toBe("");
  });

  it("expands social handles inside the pinned document", async () => {
    const { pinner, json } = fakePinner();
    await prepare(pinner, {
      name: "n",
      symbol: "s",
      twitter: "@mycoin",
      telegram: "mycoin",
      website: "mycoin.xyz",
    });

    // Bare handles in, full URLs pinned — which is what a terminal needs to
    // render a link at all.
    expect(json().twitter).toBe("https://x.com/mycoin");
    expect(json().telegram).toBe("https://t.me/mycoin");
    expect(json().website).toBe("https://mycoin.xyz");
    expect(json().external_url).toBe("https://mycoin.xyz");
  });

  it("tags the document so aggregators file it as a letscash launch", async () => {
    const { pinner, json } = fakePinner();
    await prepare(pinner, { name: "n", symbol: "s" });
    expect(json().attributes).toEqual([
      { trait_type: "launch_provider", value: "letscash" },
      { trait_type: "chain", value: "robinhood" },
    ]);
  });

  it("returns the document it pinned, for logging or caching", async () => {
    const { pinner } = fakePinner();
    const result = await prepare(pinner, { name: "My Coin", symbol: "MINE" });
    expect(result.metadata.name).toBe("My Coin");
    expect(result.metadata.symbol).toBe("MINE");
  });

  it("rejects an image extension terminals cannot render", async () => {
    const { pinner } = fakePinner();
    await expect(
      prepare(pinner, { name: "n", symbol: "s", image: { path: "./logo.svg" } }),
    ).rejects.toThrow(/Unsupported image type/);
  });

  it("does not pin anything when the image is rejected", async () => {
    const { pinner, calls } = fakePinner();
    await expect(
      prepare(pinner, { name: "n", symbol: "s", image: { path: "./a.mp4" } }),
    ).rejects.toThrow();
    // A half-done launch that pinned a document with no image would be worse
    // than failing outright.
    expect(calls).toEqual([]);
  });
});

describe("verifying that a pin actually took", () => {
  /**
   * The whole point of verification.
   *
   * A provider returning 200 with a CID is not the same as that CID resolving.
   * `logo` and `metadataURI` are set at mint and can never be edited, so a pin
   * that reported success and did not stick mints a token that renders blank
   * forever — there is no fixing it afterwards.
   */
  function gatewayReturning(handler: (url: string) => Response) {
    const seen: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      seen.push(url);
      return handler(url);
    });
    return seen;
  }

  it("passes when both pins read back with the right content", async () => {
    const { pinner } = fakePinner();
    gatewayReturning((url) =>
      url.includes("bafkJSON")
        ? new Response(
            JSON.stringify({ name: "My Coin", symbol: "MINE", image: "ipfs://bafkIMAGE" }),
          )
        : new Response("image-bytes"),
    );

    await expect(
      prepareLaunchMetadata(
        pinner,
        { name: "My Coin", symbol: "MINE", image: "ipfs://bafkIMAGE" },
        { timeoutMs: 2000 },
      ),
    ).resolves.toMatchObject({ metadataURI: "ipfs://bafkJSON" });

    vi.unstubAllGlobals();
  });

  it("refuses to launch when the gateway says the pin is not there", async () => {
    const { pinner } = fakePinner();
    gatewayReturning(() => new Response("not found", { status: 404 }));

    await expect(
      prepareLaunchMetadata(
        pinner,
        { name: "n", symbol: "s", image: "ipfs://bafkIMAGE" },
        { timeoutMs: 1500 },
      ),
    ).rejects.toThrow(PinVerificationError);

    vi.unstubAllGlobals();
  });

  it("says a 404 is the pin, and an unreachable gateway is not", async () => {
    const { pinner } = fakePinner();

    gatewayReturning(() => new Response("", { status: 404 }));
    await expect(
      prepareLaunchMetadata(pinner, { name: "n", symbol: "s" }, { timeoutMs: 1200 }),
    ).rejects.toThrow(/still answers 404.*renders blank permanently/s);
    vi.unstubAllGlobals();

    // A network failure is genuinely ambiguous — the pin may be perfectly
    // fine. Still refuses, but tells you it might be the gateway's fault.
    vi.stubGlobal("fetch", async () => {
      throw new Error("ECONNREFUSED");
    });
    await expect(
      prepareLaunchMetadata(pinner, { name: "n", symbol: "s" }, { timeoutMs: 1200 }),
    ).rejects.toThrow(/could not be reached.*gateway problem/s);
    vi.unstubAllGlobals();
  });

  it("catches a gateway serving different content than was pinned", async () => {
    const { pinner } = fakePinner();
    gatewayReturning(
      () => new Response(JSON.stringify({ name: "Someone Else", symbol: "ELSE" })),
    );

    await expect(
      prepareLaunchMetadata(pinner, { name: "My Coin", symbol: "MINE" }, { timeoutMs: 1500 }),
    ).rejects.toThrow(/resolves, but to different content/);

    vi.unstubAllGlobals();
  });

  it("catches a document whose image field is not the image that was pinned", async () => {
    const { pinner } = fakePinner();
    gatewayReturning((url) =>
      url.includes("bafkJSON")
        ? new Response(JSON.stringify({ name: "n", symbol: "s", image: "ipfs://SOMETHINGELSE" }))
        : new Response("image-bytes"),
    );

    await expect(
      prepareLaunchMetadata(
        pinner,
        { name: "n", symbol: "s", image: "ipfs://bafkIMAGE" },
        { timeoutMs: 1500 },
      ),
    ).rejects.toThrow(/image field is/);

    vi.unstubAllGlobals();
  });

  it("treats a resolved-but-empty body as a failed pin", async () => {
    const { pinner } = fakePinner();
    gatewayReturning(() => new Response(""));

    await expect(
      prepareLaunchMetadata(pinner, { name: "n", symbol: "s" }, { timeoutMs: 1200 }),
    ).rejects.toThrow(PinVerificationError);

    vi.unstubAllGlobals();
  });

  it("skips the read-back entirely when asked", async () => {
    const { pinner } = fakePinner();
    const seen = gatewayReturning(() => new Response("", { status: 500 }));

    await expect(
      prepareLaunchMetadata(pinner, { name: "n", symbol: "s" }, { verify: false }),
    ).resolves.toMatchObject({ metadataURI: "ipfs://bafkJSON" });
    expect(seen).toEqual([]);

    vi.unstubAllGlobals();
  });

  it("verifies by default, without being asked", async () => {
    const { pinner } = fakePinner();
    // A good response, so this proves the read-back happened without sitting
    // through a retry timeout. The safe behaviour has to be the one you get
    // for free, because the unsafe one is unrecoverable.
    const seen = gatewayReturning(() => new Response(JSON.stringify({ name: "n", symbol: "s", image: "" })));

    await expect(
      prepareLaunchMetadata(pinner, { name: "n", symbol: "s" }),
    ).resolves.toBeDefined();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0]).toContain("bafkJSON");

    vi.unstubAllGlobals();
  });
});

describe("pinataPinner", () => {
  it("refuses to construct without a JWT", () => {
    expect(() => pinataPinner("")).toThrow(InvalidArgumentError);
    expect(() => pinataPinner("")).toThrow(/JWT, not the API key or secret/);
  });

  it("sends the bearer token and asks for CIDv1", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ IpfsHash: "bafkABC" })));
    vi.stubGlobal("fetch", fetchMock);

    const uri = await pinataPinner("jwt-123").pinJson({ hello: "world" });
    expect(uri).toBe("ipfs://bafkABC");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("pinJSONToIPFS");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer jwt-123");
    // cidVersion 1 is what produces the bafk… CIDs the platform pins.
    expect(JSON.parse(init.body as string).pinataOptions).toEqual({ cidVersion: 1 });

    vi.unstubAllGlobals();
  });

  it("explains a 401 rather than passing the status through", async () => {
    vi.stubGlobal("fetch", async () => new Response("nope", { status: 401 }));
    await expect(pinataPinner("stale").pinJson({})).rejects.toThrow(/JWT is current/);
    vi.unstubAllGlobals();
  });
});
