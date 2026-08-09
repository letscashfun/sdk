/**
 * Getting an image and a metadata document onto IPFS, in one call.
 *
 * The SDK still never holds a credential — you pass yours in. What it removes
 * is the four-step dance: pin the image, build the document with the image URI
 * inside it, pin that, then hand both URIs to `launch` in the right fields.
 * Getting the order wrong produces a token that launches fine and renders
 * blank, permanently.
 *
 * {@link Pinner} is an interface rather than a Pinata client, because anyone
 * can pin anywhere. {@link pinataPinner} is the batteries-included one because
 * it is what letscash.fun uses, so it is the path with no surprises.
 *
 * @example
 * ```ts
 * const { logo, metadataURI } = await prepareLaunchMetadata(
 *   pinataPinner(process.env.PINATA_JWT!),
 *   {
 *     name: "My Coin",
 *     symbol: "MINE",
 *     description: "the best coin",
 *     image: { path: "./mycoin.png" },
 *     twitter: "mycoin",
 *     website: "mycoin.xyz",
 *   },
 * );
 * ```
 */

import { InvalidArgumentError, LetscashError } from "./errors.js";
import {
  type TokenMetadata,
  type TokenMetadataInput,
  buildTokenMetadata,
} from "./metadata.js";

/**
 * Somewhere to put files.
 *
 * Implement this against whatever you use — Pinata, web3.storage, Filebase,
 * an S3 bucket behind a CDN, your own node. Both methods must return a URI a
 * trading terminal can resolve: `ipfs://<CID>` or an `https://` URL.
 */
export interface Pinner {
  /** Pins bytes. Returns a resolvable URI. */
  pinFile(file: { data: Blob; filename: string }): Promise<string>;
  /** Pins a JSON document. Returns a resolvable URI. */
  pinJson(content: unknown): Promise<string>;
}

/**
 * The image to attach.
 *
 * A plain string is treated as an already-pinned URI and passed through
 * untouched, so you can reuse an image across launches without re-pinning.
 */
export type ImageInput =
  | string
  | { path: string }
  | { data: Uint8Array | ArrayBuffer | Blob; mimeType: string; filename?: string };

/** Raster only, matching what the platform accepts. */
const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

/**
 * Pinata, ready to use.
 *
 * Get a JWT at app.pinata.cloud → API Keys → New Key, with `pinFileToIPFS` and
 * `pinJSONToIPFS` ticked. Admin rights are not needed and should not be
 * granted. Keep it server-side: a JWT in a browser bundle is a JWT anyone can
 * pin with, on your bill.
 *
 * @param jwt The Pinata JWT — not the API key or the secret.
 */
export function pinataPinner(jwt: string, options?: { gateway?: string }): Pinner {
  if (!jwt) {
    throw new InvalidArgumentError(
      "pinataPinner needs a JWT. Get one at app.pinata.cloud under API Keys — the " +
        "JWT, not the API key or secret.",
    );
  }
  const gateway = options?.gateway ?? "https://ipfs.io/ipfs/";

  async function post(path: string, init: RequestInit): Promise<string> {
    const res = await fetch(`https://api.pinata.cloud/pinning/${path}`, {
      method: "POST",
      ...init,
      headers: { Authorization: `Bearer ${jwt}`, ...(init.headers ?? {}) },
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new InvalidArgumentError(
        `Pinata ${path} failed (${res.status}). ${
          res.status === 401
            ? "Check the JWT is current and has pinning scopes."
            : detail.slice(0, 300)
        }`,
      );
    }
    const { IpfsHash } = (await res.json()) as { IpfsHash?: string };
    if (!IpfsHash) throw new InvalidArgumentError(`Pinata ${path} returned no IpfsHash.`);
    return IpfsHash;
  }

  return {
    async pinFile({ data, filename }) {
      const form = new FormData();
      form.append("file", data, filename);
      // cidVersion 1 gives the bafk… CIDs letscash.fun produces. Cosmetic,
      // but it keeps tokens consistent across the platform.
      form.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));
      return `ipfs://${await post("pinFileToIPFS", { body: form })}`;
    },

    async pinJson(content) {
      const cid = await post("pinJSONToIPFS", {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinataOptions: { cidVersion: 1 }, pinataContent: content }),
      });
      // Pre-warm a public gateway. An indexer probing the token seconds after
      // launch would otherwise cache a miss while the pin propagates, and some
      // hold that miss for a long time. Fire and forget — a failure here does
      // not mean the pin failed.
      void fetch(`${gateway}${cid}`).catch(() => {});
      return `ipfs://${cid}`;
    },
  };
}

/** Turns any {@link ImageInput} into something a {@link Pinner} accepts. */
async function toBlob(image: Exclude<ImageInput, string>): Promise<{ data: Blob; filename: string }> {
  if ("path" in image) {
    const extension = image.path.split(".").pop()?.toLowerCase() ?? "";
    const mimeType = MIME_BY_EXTENSION[extension];
    if (!mimeType) {
      throw new InvalidArgumentError(
        `Unsupported image type "${extension}". Use png, jpg, webp or gif — an SVG or ` +
          `a video pins fine and then fails to render on half the terminals that read it.`,
      );
    }
    // Imported lazily so the package still loads in a browser, where `path`
    // is not a usable input anyway.
    const { readFile } = await import("node:fs/promises");
    const bytes = await readFile(image.path);
    return {
      data: new Blob([new Uint8Array(bytes)], { type: mimeType }),
      filename: image.path.split("/").pop() ?? "image",
    };
  }

  const data =
    image.data instanceof Blob
      ? image.data
      : new Blob([image.data instanceof Uint8Array ? image.data : new Uint8Array(image.data)], {
          type: image.mimeType,
        });
  return { data, filename: image.filename ?? "image" };
}

/**
 * Raised when pinned content cannot be read back before a launch.
 *
 * Its own class rather than an {@link InvalidArgumentError}: the arguments
 * were fine and the call succeeded — the content did not show up. Nothing has
 * been launched when this throws, so the recovery is to retry, not to change
 * what you passed.
 */
export class PinVerificationError extends LetscashError {
  override readonly name = "PinVerificationError";
}

/** How hard to check that a pin actually took. */
export interface VerifyOptions {
  /**
   * Read the pinned content back before returning. Default **true**.
   *
   * On by default because the alternative is unrecoverable. `logo` and
   * `metadataURI` are set at mint and can never be edited, so a pin that
   * reported success and did not stick produces a token that renders blank
   * forever. A provider returning 200 with a CID is not the same as that CID
   * resolving — the write can be accepted and still not propagate.
   *
   * Turn it off only if you are pinning somewhere with no public gateway, or
   * you have already verified out of band.
   */
  verify?: boolean;
  /** Gateway to read back through. Defaults to ipfs.io. */
  gateway?: string;
  /** How long to keep retrying before giving up. Default 30s. */
  timeoutMs?: number;
}

const DEFAULT_GATEWAY = "https://ipfs.io/ipfs/";

/** Turns `ipfs://<CID>` into a URL, and passes an http(s) URI through. */
function toHttpUrl(uri: string, gateway: string): string | undefined {
  if (uri.startsWith("ipfs://")) return `${gateway}${uri.slice("ipfs://".length)}`;
  if (/^https?:\/\//i.test(uri)) return uri;
  return undefined; // ar:// and anything else — nothing to check against
}

/**
 * Reads pinned content back, retrying while it propagates.
 *
 * Distinguishes three outcomes, because they need different answers:
 *
 *  - resolved            → return the body
 *  - resolved as missing → the pin did not stick. Refuse the launch.
 *  - could not tell      → the gateway itself is unreachable or erroring.
 *                          Also refuse, but say so differently: blocking a
 *                          good launch on a flaky gateway is annoying, and
 *                          launching a blank token is permanent.
 */
async function readBack(
  uri: string,
  label: string,
  options: VerifyOptions,
): Promise<string | undefined> {
  const gateway = options.gateway ?? DEFAULT_GATEWAY;
  const url = toHttpUrl(uri, gateway);
  if (!url) return undefined;

  const deadline = Date.now() + (options.timeoutMs ?? 30_000);
  let lastStatus: number | undefined;
  let lastNetworkError: unknown;
  let attempt = 0;

  while (Date.now() < deadline) {
    attempt++;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (res.ok) {
        const body = await res.text();
        // A zero-length body is a resolved-but-empty pin, which renders the
        // same as a missing one.
        if (body.length > 0) return body;
        lastStatus = 204;
      } else {
        lastStatus = res.status;
      }
    } catch (error) {
      lastNetworkError = error;
    }
    // Propagation is not instant. Back off rather than hammering.
    await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * attempt, 5000)));
  }

  if (lastStatus !== undefined) {
    throw new PinVerificationError(
      `${label} was pinned as ${uri}, but ${gateway} still answers ${lastStatus} for it ` +
        `after ${Math.round((options.timeoutMs ?? 30_000) / 1000)}s. The provider accepted ` +
        `the write and the content is not resolving — launching now would mint a token ` +
        `that renders blank permanently, because this field cannot be edited after mint. ` +
        `Check the pin in your provider's dashboard and retry.`,
    );
  }

  throw new PinVerificationError(
    `${label} was pinned as ${uri}, but ${gateway} could not be reached to confirm it ` +
      `(${String(lastNetworkError).slice(0, 120)}). The pin may well be fine — this is a ` +
      `gateway problem, not necessarily a pinning one. Retry, point \`gateway\` at one ` +
      `you trust, or pass \`verify: false\` if you have confirmed the pin yourself.`,
  );
}

/** Everything needed to describe a token, minus the URIs you do not have yet. */
export interface PrepareMetadataInput extends Omit<TokenMetadataInput, "image"> {
  /**
   * The image: a file path, raw bytes, or an already-pinned URI.
   *
   * Omit it entirely and the token launches without a picture — legal, and
   * irreversible.
   */
  image?: ImageInput;
}

/** The two URIs a launch needs, plus the document that was pinned. */
export interface PreparedMetadata {
  /** Pass to `launch` as `logo`. */
  readonly logo: string;
  /** Pass to `launch` as `metadataURI`. */
  readonly metadataURI: string;
  /** The document that was pinned, in case you want to log or cache it. */
  readonly metadata: TokenMetadata;
}

/**
 * Pins the image, builds the metadata document, and pins that too.
 *
 * The ordering matters and is the reason this exists: the document has to
 * contain the image's URI, so the image must be pinned first. Doing it the
 * other way round produces a document with an empty `image`, which pins
 * successfully and renders blank.
 *
 * @example
 * ```ts
 * const prepared = await prepareLaunchMetadata(pinataPinner(jwt), {
 *   name: "My Coin",
 *   symbol: "MINE",
 *   image: { path: "./mycoin.png" },
 *   twitter: "mycoin",              // bare handle; expanded for you
 * });
 *
 * await client.launch({
 *   configId: config.id,
 *   name: "My Coin",
 *   symbol: "MINE",
 *   logo: prepared.logo,
 *   metadataURI: prepared.metadataURI,
 * });
 * ```
 */
export async function prepareLaunchMetadata(
  pinner: Pinner,
  input: PrepareMetadataInput,
  options: VerifyOptions = {},
): Promise<PreparedMetadata> {
  const { image, ...rest } = input;
  const verify = options.verify ?? true;

  const logo =
    image === undefined
      ? ""
      : typeof image === "string"
        ? image
        : await pinner.pinFile(await toBlob(image));

  // Built after the image is pinned, because the URI goes inside it.
  const metadata = buildTokenMetadata({ ...rest, image: logo });
  const metadataURI = await pinner.pinJson(metadata);

  if (verify) {
    // Both, and the image first — an unreadable image is the more common
    // failure and the cheaper one to report.
    if (logo) await readBack(logo, "The token image", options);

    const body = await readBack(metadataURI, "The metadata document", options);

    // Not just "something is there" — that it is the document we pinned.
    // A gateway serving a stale or truncated object would otherwise pass.
    if (body !== undefined) {
      let served: { name?: string; symbol?: string; image?: string };
      try {
        served = JSON.parse(body) as typeof served;
      } catch {
        throw new PinVerificationError(
          `The metadata document at ${metadataURI} came back as something that is not ` +
            `JSON. Terminals will fail to parse it exactly as this did.`,
        );
      }
      if (served.name !== metadata.name || served.symbol !== metadata.symbol) {
        throw new PinVerificationError(
          `The metadata document at ${metadataURI} resolves, but to different content ` +
            `(got name "${served.name}", symbol "${served.symbol}"). Refusing to launch ` +
            `against a URI that does not hold what was pinned.`,
        );
      }
      if (served.image !== metadata.image) {
        throw new PinVerificationError(
          `The metadata document at ${metadataURI} resolves, but its image field is ` +
            `"${served.image}" rather than "${metadata.image}". The token would render ` +
            `the wrong picture, or none.`,
        );
      }
    }
  }

  return { logo, metadataURI, metadata };
}
