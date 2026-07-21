import { defineConfig } from "tsup";

export default defineConfig([
  // Package build for bundlers: ESM + CJS + types, deps kept external so
  // html-to-image stays a lazily-imported chunk and jszip is only pulled in
  // by consumers that use DownloadConnector.
  {
    entry: ["src/index.ts"],
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
]);
