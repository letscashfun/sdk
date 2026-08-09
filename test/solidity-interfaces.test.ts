/**
 * The Solidity interfaces under `solidity/` are hand-written, and hand-written
 * means they can drift. This recomputes every function selector in them from
 * the source text and checks it against the ABI generated out of the compiled
 * contract, so a parameter added on chain fails here rather than in an
 * integrator's production contract.
 *
 * Drift in this direction is quiet and expensive: a Solidity interface with a
 * stale signature still compiles, still deploys, and reverts on the first real
 * call with nothing but "execution reverted" to go on.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { type AbiFunction, toFunctionSelector } from "viem";
import { describe, expect, it } from "vitest";

import { factoryAbi } from "../src/abis/factory.js";
import { hookAbi } from "../src/abis/hook.js";
import { launchSplitterAbi } from "../src/abis/launchSplitter.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Strips `//` and block comments so they cannot be mistaken for code. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/**
 * Every `struct Name { ... }` in the file, as an ordered list of field types.
 *
 * Kept unexpanded at this stage: a struct may reference another struct
 * declared after it, so expansion has to be a second pass.
 */
function collectStructs(source: string): Map<string, string[]> {
  const structs = new Map<string, string[]>();
  const re = /struct\s+(\w+)\s*\{([^}]*)\}/g;
  for (const match of source.matchAll(re)) {
    const [, name, body] = match;
    if (!name || body === undefined) continue;
    const fields = body
      .split(";")
      .map((field) => field.trim())
      .filter(Boolean)
      // "uint16 creatorFeeBps" -> "uint16"; "address[] recipients" -> "address[]"
      .map((field) => field.split(/\s+/)[0] ?? "");
    structs.set(name, fields);
  }
  return structs;
}

/** Turns a possibly-struct type into its canonical ABI form, recursively. */
function canonicalType(type: string, structs: Map<string, string[]>): string {
  const arraySuffix = type.match(/(\[\d*\])+$/)?.[0] ?? "";
  const base = arraySuffix ? type.slice(0, -arraySuffix.length) : type;
  const fields = structs.get(base);
  if (!fields) return type;
  return `(${fields.map((f) => canonicalType(f, structs)).join(",")})${arraySuffix}`;
}

/**
 * Canonical signatures for every function declared in an interface file.
 *
 * Declarations wrap across lines and carry `calldata` / `memory` / `returns`
 * clauses, so the text is flattened first and everything from `returns`
 * onwards discarded — a selector is name and inputs only.
 */
function functionSignatures(source: string): string[] {
  const clean = stripComments(source);
  const structs = collectStructs(clean);
  const flat = clean.replace(/\s+/g, " ");

  const signatures: string[] = [];
  // Match up to the closing paren of the parameter list, balanced one level
  // deep so nested parens in `returns` clauses cannot end the match early.
  for (const match of flat.matchAll(/function\s+(\w+)\s*\(([^()]*)\)/g)) {
    const [, name, rawParams] = match;
    if (!name || rawParams === undefined) continue;

    const params = rawParams
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        // "TokenParams calldata params" -> "TokenParams"
        const type = p.split(/\s+/)[0] ?? "";
        return canonicalType(type, structs);
      });

    signatures.push(`${name}(${params.join(",")})`);
  }
  return signatures;
}

/**
 * Every function selector present in a generated ABI.
 *
 * The ABI item goes to viem whole rather than being stringified here. A tuple
 * parameter is `{ type: "tuple", components: [...] }`, so building the
 * signature by joining `.type` yields the literal word "tuple" and hashes to a
 * selector no contract has — which looks exactly like drift.
 */
function abiSelectors(abi: readonly unknown[]): Set<string> {
  const selectors = new Set<string>();
  for (const item of abi as AbiFunction[]) {
    if (item.type !== "function") continue;
    selectors.add(toFunctionSelector(item));
  }
  return selectors;
}

const CASES = [
  { file: "ILetscashHook.sol", abi: hookAbi, label: "hook" },
  { file: "ILetscashFactory.sol", abi: factoryAbi, label: "factory" },
  { file: "ILaunchSplitter.sol", abi: launchSplitterAbi, label: "launch splitter" },
] as const;

describe("hand-written Solidity interfaces match the deployed ABIs", () => {
  for (const testCase of CASES) {
    it(`${testCase.label}: every declared function exists on chain`, () => {
      const source = readFileSync(join(ROOT, "solidity", testCase.file), "utf8");
      const declared = functionSignatures(source);
      const onChain = abiSelectors(testCase.abi);

      // A file that parsed to nothing would pass every assertion below while
      // proving nothing at all.
      expect(declared.length).toBeGreaterThan(4);

      const missing = declared.filter((sig) => !onChain.has(toFunctionSelector(sig)));
      expect(missing, `not present in the generated ABI: ${missing.join(", ")}`).toEqual([]);
    });
  }
});
