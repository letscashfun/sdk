# Security

This package sits next to private keys. Here is exactly what it does and does
not touch, so you can decide whether to trust it rather than assume.

## It never sees your key

`@letscashfun/sdk` has **no key handling of any kind**. It never reads, stores,
transmits or derives one, and there is no code path that could.

Signing belongs entirely to the [viem](https://viem.sh) `WalletClient` you
construct and pass in. The SDK builds a transaction request and hands it to
your client to sign; whether that client wraps a local key, a browser wallet, a
hardware device or a remote signer is invisible to this package and none of its
business.

```ts
// Your account, your client, your key. The SDK receives an object with a
// `signTypedData` and a `writeContract` method and nothing else.
const walletClient = createWalletClient({ account, chain, transport });
const client = new LetscashClient({ publicClient, walletClient });
```

The one place the SDK asks for a signature rather than a transaction is the
EIP-2612 permit used to make a stablecoin launch a single transaction. It calls
`walletClient.signTypedData` with a permit scoped to **one spender (the
factory), one exact amount, and a thirty-minute deadline**. It never requests an
unlimited approval. You can decline that path entirely with
`usePermit: false`, at the cost of a separate approval transaction.

## It sends nothing anywhere

No telemetry, no analytics, no error reporting, no phone-home. The only network
calls this package makes are:

| To | When | Why |
|---|---|---|
| Your RPC endpoint | reads and writes | the chain |
| Your IPFS provider | only if you call the pinning helpers | pinning, with **your** credential |
| A public IPFS gateway | only after pinning | reading a pin back to confirm it resolves |

The gateway read is a plain `GET` of content you just published. Nothing else
leaves the process.

## Supply chain

**Zero runtime dependencies.** Installing this package adds exactly one thing
to your tree: this package.

```
dependencies:     {}
peerDependencies: { "viem": "^2.21.0" }
```

viem is a *peer* dependency, so you choose and audit the version. Nothing is
bundled and no second copy is installed.

**No install scripts.** There is no `preinstall`, `install`, `postinstall` or
`prepare` script. `npm install @letscashfun/sdk` executes no code.

**Published with provenance.** Every release is built and published by a
[GitHub Actions workflow](.github/workflows/publish.yml) using npm's provenance
attestation. npm shows a "Built and signed on GitHub Actions" badge, and you can
verify the tarball came from a specific public commit:

```bash
npm audit signatures
```

Publishing uses npm trusted publishing, so no credential is stored in this
repository at all. A compromised developer machine cannot ship a release, and
there is no token to leak or rotate.

`0.1.0` is the one exception: it was published by hand to create the package,
before a trusted publisher could be registered against it, and therefore
carries no attestation. Every release from `0.1.1` onwards is attested.

**Source is shipped.** The `src/` directory is in the published tarball, not
just the built output. You can read what you installed without cloning
anything, and the sourcemaps resolve to real files.

## Verifying a release yourself

```bash
# What is actually in the tarball
npm pack @letscashfun/sdk && tar -tzf letscashfun-sdk-*.tgz

# Signature and provenance attestations
npm audit signatures

# Nothing known-vulnerable
npm audit --omit=dev
```

CI runs `npm audit --omit=dev --audit-level=low` on every push and every
release, so a runtime dependency with any known advisory fails the build. It
also prints the exact file list on every run, so an accidental inclusion shows
up in a public log rather than on the registry.

## What the SDK will refuse to do

Several checks exist specifically because the failure they prevent is silent
and permanent:

- **A launch will not proceed against a pin that did not resolve.** `logo` and
  `metadataURI` are set at mint and can never be edited, so both are read back
  through a gateway first.
- **A bare CID is rejected.** On chain it is just a string, so the launch would
  succeed and the token would render blank forever.
- **A pool key that does not hash to the token's own `poolId` throws.** A wrong
  key produces a valid-looking id for a pool that does not exist, and every
  read then returns zero.
- **An unrecognised hook is refused.** A hook decides which pool a swap touches,
  so trading through an unknown one is refused rather than signed.
- **Writes are simulated before they are signed**, so a revert costs no gas and
  arrives as a decoded error.

## Reporting a vulnerability

Please do not open a public issue.

Report privately through GitHub's
[security advisory form](https://github.com/letscashfun/sdk/security/advisories/new),
which is visible only to the maintainers.

Include what you found, how to reproduce it, and what it lets an attacker do.
You will get an acknowledgement within 72 hours, and a fix or an explanation of
why it is not one before any public disclosure.

## Scope

This document covers the SDK package. The contracts it talks to are audited
separately, and their addresses are verified on
[Blockscout](https://robinhoodchain.blockscout.com) — you can read the deployed
source for every one of them.

The Uniswap UniversalRouter on Robinhood Chain is a modified build — its
`ExactInputSingleParams` carries an extra field the canonical struct does not.
It is verified on Blockscout, and the SDK's encoding is pinned to that source
rather than to observed behaviour; see the header of
[`test/swap-encoding.test.ts`](test/swap-encoding.test.ts) for the file and
line references.
