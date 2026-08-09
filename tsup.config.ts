import { defineConfig } from "tsup";

export default defineConfig({
  // Two entries. `abis` is separate so a caller who only wants the ABIs — to
  // hand to their own viem setup, or to another language's codegen — does not
  // pull the whole client in with them.
  entry: {
    index: "src/index.ts",
    abis: "src/abis/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  // viem is a peer dependency: the caller brings their own, and bundling a
  // second copy would give them two incompatible `Address` types.
  external: ["viem"],
});
