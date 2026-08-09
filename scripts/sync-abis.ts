/**
 * Regenerates every ABI in this package from the contract repo's build output.
 *
 * The ABIs are generated, never hand-edited. This exists because the same ABIs
 * are currently written out by hand in three places across the letscash
 * codebase — the backend, the frontend, and inline in a couple of components —
 * and hand-copied ABIs drift silently: a struct gains a field, one copy is
 * updated, and the others decode garbage without erroring.
 *
 * Run after any contract change:
 *
 *     cd ../cashcat-contract && forge build
 *     npm run sync:abis
 *
 * Emits two things from one source:
 *
 *   src/abis/<name>.ts   const-asserted TypeScript, for viem's type inference
 *   abis/<name>.json     plain JSON, for anyone not using TypeScript
 *
 * The Solidity interfaces under `solidity/` are NOT generated. `cast interface`
 * emits the full contract surface, which for the hook means forty Uniswap
 * callbacks an integrator will never call, and its output does not compile
 * anyway (user-defined value types land out of scope, and overloaded errors
 * are emitted twice). They are hand-written and curated instead — and
 * `test/solidity-interfaces.test.ts` checks every selector in them against
 * these generated ABIs, so a curated interface still cannot drift.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

/** Where the Foundry project lives. Override when it is not a sibling. */
const CONTRACTS = process.env.LETSCASH_CONTRACTS_DIR
  ? resolve(process.env.LETSCASH_CONTRACTS_DIR)
  : resolve(ROOT, "..", "cashcat-contract");

/** Which contracts get an ABI, and what the export is called. */
const CONTRACTS_TO_SYNC = [
  { artifact: "CashCatFactoryVNext", export: "factoryAbi" },
  { artifact: "CashCatHookV2", export: "hookAbi" },
  { artifact: "CashCatTokenV2", export: "tokenAbi" },
  { artifact: "CashCatLaunchSplitter", export: "launchSplitterAbi" },
  { artifact: "CashCatSelfBurnerV2", export: "selfBurnerAbi" },
  { artifact: "CashCatRevenueConverter", export: "revenueConverterAbi" },
  { artifact: "CashCatRevenueSplitter", export: "revenueSplitterAbi" },
] as const;

type AbiEntry = { type: string; name?: string };

function readArtifactAbi(artifact: string): AbiEntry[] {
  const path = join(CONTRACTS, "out", `${artifact}.sol`, `${artifact}.json`);
  if (!existsSync(path)) {
    throw new Error(
      `No build artifact at ${path}\n` +
        `Run \`forge build\` in ${CONTRACTS} first, or set LETSCASH_CONTRACTS_DIR.`,
    );
  }
  const parsed = JSON.parse(readFileSync(path, "utf8")) as { abi?: AbiEntry[] };
  if (!parsed.abi || parsed.abi.length === 0) {
    throw new Error(`Artifact ${artifact} has no ABI — is it an interface or an abstract contract?`);
  }
  return parsed.abi;
}

/** A banner on every generated file, so nobody edits one by hand. */
function banner(artifact: string): string {
  return [
    "// GENERATED FILE — DO NOT EDIT.",
    "//",
    `// Source: ${artifact}.sol, via \`npm run sync:abis\`.`,
    "// Any hand edit is lost on the next contract change, and a hand-edited ABI",
    "// that disagrees with deployed bytecode decodes silently rather than failing.",
    "",
  ].join("\n");
}

function main(): void {
  const tsDir = join(ROOT, "src", "abis");
  const jsonDir = join(ROOT, "abis");

  for (const dir of [tsDir, jsonDir]) mkdirSync(dir, { recursive: true });

  const generated: { export: string; module: string }[] = [];

  for (const entry of CONTRACTS_TO_SYNC) {
    const abi = readArtifactAbi(entry.artifact);
    const moduleName = entry.export.replace(/Abi$/, "");

    // Const-asserted so viem can infer argument and return types from it.
    // Without `as const` every call degrades to `unknown` and the package
    // stops being worth using.
    writeFileSync(
      join(tsDir, `${moduleName}.ts`),
      `${banner(entry.artifact)}export const ${entry.export} = ${JSON.stringify(abi, null, 2)} as const;\n`,
    );

    writeFileSync(join(jsonDir, `${moduleName}.json`), `${JSON.stringify(abi, null, 2)}\n`);

    generated.push({ export: entry.export, module: moduleName });
    const fnCount = abi.filter((item) => item.type === "function").length;
    console.log(`  ${entry.artifact.padEnd(26)} ${String(fnCount).padStart(3)} functions`);
  }

  // The barrel. Also generated, so adding a contract above is the only edit
  // needed to expose it.
  const barrel = [
    "// GENERATED FILE — DO NOT EDIT. See scripts/sync-abis.ts.",
    "//",
    "// Every ABI in this package, plus the external ones we do not own.",
    "",
    ...generated.map((g) => `export { ${g.export} } from "./${g.module}.js";`),
    "",
    "// Not generated: these belong to Uniswap and Permit2, not to us, so they",
    "// are hand-written minimal fragments rather than full ABIs.",
    'export * from "./external.js";',
    "",
  ].join("\n");
  writeFileSync(join(tsDir, "index.ts"), barrel);

  console.log(`\n  Wrote ${generated.length} ABIs to src/abis/ and abis/.`);
}

main();
