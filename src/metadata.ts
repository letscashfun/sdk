/**
 * Token metadata, for the terminals that read it.
 *
 * **This package does not pin anything.** Pinning costs money and needs a
 * credential, so the SDK will not quietly spend someone else's — you pin, with
 * whatever provider you like, and pass the resulting URI to `launch`.
 *
 * What it does do is build the JSON, which is the part that is easy to get
 * subtly wrong. Aggregators and trading terminals read this document off the
 * token's `metadataURI`, and two of their expectations are not obvious:
 *
 *  - **Socials must be full URLs.** Terminals hyperlink these fields verbatim,
 *    so a bare `@handle` is not a link and gets dropped silently — the coin
 *    just appears to have no Twitter.
 *  - **Every field is length-capped.** Not by the standard, but by what the
 *    launchpad's own pinning does, and a token that exceeds those caps renders
 *    differently from every other coin on the platform.
 *
 * {@link buildTokenMetadata} produces byte-for-byte what letscash.fun's own
 * launch form pins, so a token launched through this SDK is indistinguishable
 * from one launched through the website.
 *
 * @example
 * ```ts
 * const metadata = buildTokenMetadata({
 *   name: "My Coin",
 *   symbol: "MINE",
 *   description: "the best coin",
 *   image: "ipfs://bafk…",     // you pinned this
 *   twitter: "mycoin",          // expanded to https://x.com/mycoin
 * });
 *
 * const metadataURI = await yourPinningProvider(metadata);  // your call
 *
 * await client.launch({
 *   configId: config.id,
 *   name: "My Coin",
 *   symbol: "MINE",
 *   logo: "ipfs://bafk…",
 *   metadataURI,
 * });
 * ```
 */

import { InvalidArgumentError } from "./errors.js";

/** What you supply. Handles may be bare; they get expanded. */
export interface TokenMetadataInput {
  /** Required. Capped at 100 characters. */
  name: string;
  /** Required. Capped at 20. */
  symbol: string;
  /** Capped at 1000. */
  description?: string;
  /**
   * The token image, as a URI you have already pinned.
   *
   * `ipfs://<CID>` or an `https://` URL. A bare CID is rejected — terminals
   * cannot resolve one, and the failure is silent.
   */
  image?: string;
  /** Bare handle or full URL. `mycoin` becomes `https://x.com/mycoin`. */
  twitter?: string;
  /** Bare handle or full URL. `mycoin` becomes `https://t.me/mycoin`. */
  telegram?: string;
  /** Bare domain or full URL. */
  website?: string;
  /** Invite path or full URL. */
  discord?: string;
}

/** The document terminals read. Keys are omitted rather than left empty. */
export interface TokenMetadata {
  readonly name: string;
  readonly symbol: string;
  readonly description: string;
  readonly image: string;
  readonly website?: string;
  /** The same value as `website`. Some terminals read only this one. */
  readonly external_url?: string;
  readonly twitter?: string;
  readonly telegram?: string;
  readonly discord?: string;
  readonly attributes: readonly { trait_type: string; value: string }[];
}

/** The outcome of a dry run over some metadata input. */
export interface MetadataCheck {
  /** False when something would throw. Nothing is worth pinning until this is true. */
  readonly ok: boolean;
  /** The hard failure, if there was one. */
  readonly error?: string;
  /** Things that are legal but probably not what was meant. */
  readonly warnings: readonly MetadataWarning[];
  /** What would be produced, when `ok`. */
  readonly metadata?: TokenMetadata;
}

/**
 * Checks metadata input without building or pinning anything.
 *
 * Use it to show a user what their links will actually become before they pay
 * for a pin, or to gate a CI job. Every social field is normalised the same
 * way `buildTokenMetadata` does, so what comes back under `metadata` is
 * exactly what would be pinned.
 *
 * @example
 * ```ts
 * const check = checkTokenMetadata({ name: "My Coin", symbol: "MINE", twitter: "x.com/mycoin" });
 * check.ok;                          // true
 * check.metadata?.twitter;           // "https://x.com/mycoin" — not doubled
 *
 * for (const w of check.warnings) console.warn(`${w.field}: ${w.message}`);
 * ```
 */
export function checkTokenMetadata(input: TokenMetadataInput): MetadataCheck {
  const warnings: MetadataWarning[] = [];
  try {
    const metadata = buildTokenMetadata(input, { onWarning: (w) => warnings.push(w) });
    return { ok: true, warnings, metadata };
  } catch (error) {
    return { ok: false, error: (error as Error).message, warnings };
  }
}

/** Caps, matching what letscash.fun's own pinning applies. */
const CAPS = {
  name: 100,
  symbol: 20,
  description: 1000,
  image: 300,
  social: 300,
} as const;

/** Truncate then trim, in that order — the same as the platform's endpoint. */
function clamp(value: string | undefined, max: number): string {
  return typeof value === "string" ? value.slice(0, max).trim() : "";
}

/** Something worth telling the caller about, that is not worth refusing. */
export interface MetadataWarning {
  /** Which input it came from, e.g. `"twitter"`. */
  readonly field: string;
  /** What was passed. */
  readonly value: string;
  /** What looks off about it. */
  readonly message: string;
}

type PlatformName = "twitter" | "telegram" | "discord" | "website";

/** What each social field expects, and what it tolerates being given. */
const PLATFORMS: Record<
  PlatformName,
  { prefix: string; label: string; hosts: readonly string[] }
> = {
  twitter: {
    prefix: "https://x.com/",
    label: "Twitter/X",
    hosts: ["x.com", "twitter.com", "mobile.twitter.com", "mobile.x.com"],
  },
  telegram: {
    prefix: "https://t.me/",
    label: "Telegram",
    hosts: ["t.me", "telegram.me", "telegram.dog"],
  },
  /**
   * Discord's handling is **inference, not evidence.**
   *
   * The twitter and telegram rules were derived from real launches — bare
   * handles on chain there are observably broken links. A sample of 220
   * launches contained **zero** discord values, so nothing here has been
   * validated against a coin anybody actually shipped.
   *
   * The behaviour chosen is the conservative one: a bare `https://` prefix, so
   * `discord.gg/abc` works and anything else is passed through rather than
   * being reshaped into a guess. Revisit once real values exist.
   */
  discord: {
    prefix: "https://",
    label: "Discord",
    hosts: ["discord.gg", "discord.com", "discordapp.com"],
  },
  website: { prefix: "https://", label: "a website", hosts: [] },
};

/**
 * Turns whatever was given into the URL a terminal will hyperlink.
 *
 * Handles four shapes, because all four get pasted in practice:
 *
 * | given                       | result                    |
 * |-----------------------------|---------------------------|
 * | `mycoin`                    | `https://x.com/mycoin`    |
 * | `@mycoin`                   | `https://x.com/mycoin`    |
 * | `x.com/mycoin`              | `https://x.com/mycoin`    |
 * | `https://twitter.com/mycoin`| left exactly as given     |
 *
 * The third row is the one that used to be wrong: prefixing a value that
 * already carries its domain produced `https://x.com/x.com/mycoin`, which is a
 * live link to nothing.
 *
 * A full URL is never rewritten and never questioned, wherever it points.
 * Plenty of projects put a Linktree or a docs site in the Twitter field, and
 * that is a normal thing to want. The only thing enforced is that the value
 * ends up as a real URL — a field that is not one renders as dead text, and
 * that is the failure worth catching.
 *
 * @throws {InvalidArgumentError} If the result is not a usable URL.
 */
function asUrl(
  value: string,
  platform: PlatformName,
  warn: (warning: MetadataWarning) => void,
): string {
  if (!value) return "";
  const { prefix, label, hosts } = PLATFORMS[platform];

  // Already a URL: taken exactly as given.
  //
  // Deliberately no check on *where* it points. Plenty of projects put a
  // Linktree, a docs site or a launch thread in the Twitter field, and that is
  // a normal thing to want. The only question worth asking is whether it is a
  // URL at all — a field that is not one renders as dead text.
  if (/^https?:\/\//i.test(value)) {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new InvalidArgumentError(
        `${platform} is "${value}", which starts like a URL but does not parse as one. ` +
          `Terminals hyperlink this verbatim, so it would render as a dead link.`,
      );
    }
    // A scheme does not make a hostname. "https://mycoin" parses perfectly and
    // resolves for nobody — this check used to run only on the no-scheme path,
    // so typing the scheme yourself skipped it.
    if (!parsed.hostname.includes(".")) {
      throw new InvalidArgumentError(
        `${platform} is "${value}", whose host "${parsed.hostname}" has no domain suffix. ` +
          `It parses as a URL and resolves for nobody.`,
      );
    }
    return value;
  }

  // Something carrying "://" that is not http or https. Whatever was meant, a
  // handle was not, and prefixing it produces a live link to nothing —
  // "ht!tp://x" would otherwise become "https://x.com/ht!tp://x".
  if (value.includes("://")) {
    throw new InvalidArgumentError(
      `${platform} is "${value}", which looks like a URL with a broken or unsupported ` +
        `scheme. Use http:// or https://, or give a bare handle.`,
    );
  }

  // A bare domain, or a domain with a path: prefix the scheme only, never the
  // platform's domain on top of the one already there.
  const withoutLeadingSlash = value.replace(/^\/+/, "");
  const firstSegment = withoutLeadingSlash.split("/")[0]?.replace(/^www\./, "").toLowerCase() ?? "";
  if (hosts.includes(firstSegment)) {
    return `https://${withoutLeadingSlash}`;
  }

  // A handle.
  const handle = withoutLeadingSlash.replace(/^@+/, "");

  if (platform === "website") {
    // A website with no dot is not a hostname. `https://mycoin` resolves for
    // nobody, and it is a plausible typo for `mycoin.xyz`.
    if (!handle.includes(".")) {
      throw new InvalidArgumentError(
        `website is "${value}", which has no domain suffix. Terminals would link to ` +
          `"https://${handle}", which resolves for nobody. Did you mean "${handle}.xyz" ` +
          `or similar?`,
      );
    }
  } else if (handle.includes(".") && !handle.includes("/")) {
    // "mycoin.xyz" in the Twitter field is a website, not a handle — and
    // https://x.com/mycoin.xyz is a live link to a profile that is not theirs.
    warn({
      field: platform,
      value,
      message:
        `looks like a domain rather than a ${label} handle. It will link to ` +
        `"${prefix}${handle}". Put it in \`website\` if that is what it is.`,
    });
  }

  if (/\s/.test(handle)) {
    throw new InvalidArgumentError(
      `${platform} is "${value}", which contains a space. There is no handle or URL ` +
        `that works with one in it.`,
    );
  }

  const url = `${prefix}${handle}`;
  try {
    new URL(url);
  } catch {
    throw new InvalidArgumentError(
      `${platform} is "${value}", which does not produce a usable URL ("${url}").`,
    );
  }
  return url;
}

/** True for something that looks like a bare CID rather than a URI. */
function looksLikeBareCid(value: string): boolean {
  // CIDv0 is base58 starting Qm; CIDv1 base32 starts bafy/bafk/bafr and
  // friends. letscash pins v1, so bafk… is what most of these will be.
  return /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|ba[a-z2-7]{57,})$/.test(value);
}

/**
 * Checks a URI is something a terminal can resolve.
 *
 * Exported because the same check applies to `logo` and `metadataURI` on the
 * launch itself, not only to fields inside the JSON.
 *
 * @throws {InvalidArgumentError} On a bare CID or an unrecognised scheme.
 */
export function assertResolvableUri(value: string, field: string): void {
  if (value === "") return;
  if (looksLikeBareCid(value)) {
    throw new InvalidArgumentError(
      `${field} looks like a bare CID ("${value.slice(0, 16)}…"). Terminals cannot ` +
        `resolve one — prefix it with "ipfs://". This is worth catching here because ` +
        `on chain it is just a string: the launch succeeds and the token simply ` +
        `renders with no image.`,
    );
  }
  if (!/^(ipfs|https?|ar):\/\//i.test(value)) {
    throw new InvalidArgumentError(
      `${field} must be an ipfs://, https:// or ar:// URI, got "${value.slice(0, 40)}".`,
    );
  }
}

/**
 * Builds the metadata document, ready to pin.
 *
 * Pure — no network, no credentials. Pin the result yourself and pass the URI
 * to `launch` as `metadataURI`.
 *
 * @throws {InvalidArgumentError} If name or symbol is empty, or `image` is not
 *         a resolvable URI.
 */
export function buildTokenMetadata(
  input: TokenMetadataInput,
  options?: { onWarning?: (warning: MetadataWarning) => void },
): TokenMetadata {
  // Warnings go to a callback rather than the console. A library writing to
  // stdout is a library that cannot be used inside anything with its own
  // logging, and silently swallowing them is worse. Default is to drop them —
  // use `checkTokenMetadata` if you want to see them without building.
  const warn = options?.onWarning ?? (() => {});

  const name = clamp(input.name, CAPS.name);
  const symbol = clamp(input.symbol, CAPS.symbol);
  if (!name) throw new InvalidArgumentError("Metadata needs a non-empty name.");
  if (!symbol) throw new InvalidArgumentError("Metadata needs a non-empty symbol.");

  const image = clamp(input.image, CAPS.image);
  assertResolvableUri(image, "image");

  const website = asUrl(clamp(input.website, CAPS.social), "website", warn);
  const twitter = asUrl(clamp(input.twitter, CAPS.social), "twitter", warn);
  const telegram = asUrl(clamp(input.telegram, CAPS.social), "telegram", warn);
  const discord = asUrl(clamp(input.discord, CAPS.social), "discord", warn);

  return {
    name,
    symbol,
    description: clamp(input.description, CAPS.description),
    image,
    // Spread rather than set-to-empty: a key present with an empty value is
    // rendered by some terminals as a broken link.
    ...(website && { website, external_url: website }),
    ...(twitter && { twitter }),
    ...(telegram && { telegram }),
    ...(discord && { discord }),
    attributes: [
      // What an aggregator files the launchpad under. Matching the platform's
      // own value is the point of this helper — a token pinned with a
      // different provider string gets categorised somewhere else.
      { trait_type: "launch_provider", value: "letscash" },
      { trait_type: "chain", value: "robinhood" },
    ],
  };
}
