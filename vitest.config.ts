import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The e2e suite launches real tokens and trades against a fork. Each
    // launch mines a salt over several RPC round trips, so the default 5s
    // timeout is nowhere near enough.
    testTimeout: 180_000,
    hookTimeout: 60_000,
    // State is shared within a file by design — a launch, then trades against
    // it, then a claim. Running those concurrently would race.
    fileParallelism: false,
  },
});
