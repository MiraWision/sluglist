import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // The endpoint example imports `sluglist/contract` the way a consumer does.
  // Mapped to source so the test exercises the same module the package ships,
  // without needing a build first.
  resolve: {
    alias: {
      "sluglist/contract": fileURLToPath(
        new URL("./src/contract.ts", import.meta.url)
      ),
      sluglist: fileURLToPath(new URL("./src/index.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Repairs the ambient localStorage/sessionStorage on Node >= 25 (see
    // test/setup.ts); a no-op on the Node 20 CI runs.
    setupFiles: ["test/setup.ts"],
  },
});
