import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Repairs the ambient localStorage/sessionStorage on Node >= 25 (see
    // test/setup.ts); a no-op on the Node 20 CI runs.
    setupFiles: ["test/setup.ts"],
  },
});
