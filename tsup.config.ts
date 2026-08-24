import { defineConfig } from "tsup";

export default defineConfig([
  // Package build for bundlers: ESM + CJS + types, deps kept external so
  // html-to-image stays a lazily-imported chunk and jszip is only pulled in
  // by consumers that use DownloadConnector.
  {
    entry: ["src/index.ts", "src/labels.ts", "src/contract.ts"],
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    external: ["html-to-image", "jszip"],
    target: "es2022",
  },
  // Standalone browser bundle for a no-build <script> drop-in (unpkg / jsDelivr).
  // Dependencies are inlined and exposed on a global `Sluglist`.
  {
    entry: { sluglist: "src/index.ts" },
    format: ["iife"],
    globalName: "Sluglist",
    platform: "browser",
    minify: true,
    sourcemap: true,
    noExternal: ["html-to-image", "jszip"],
    target: "es2020",
  },
  // Node-only headless writer (`sluglist/node`) for agents and scripts.
  // Separate entry so its node:fs imports never reach the browser bundle.
  {
    entry: { node: "src/node/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    platform: "node",
    target: "node18",
    sourcemap: true,
  },
  // Node-only CLI (`sluglist dev`). Separate entry so its node:fs/node:http
  // imports never reach the browser bundle. Emitted as an executable ESM file.
  {
    entry: { cli: "src/cli/index.ts" },
    format: ["esm"],
    platform: "node",
    target: "node18",
    banner: { js: "#!/usr/bin/env node" },
    sourcemap: false,
    dts: false,
  },
]);
