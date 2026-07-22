import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // gh-pages serves the site under /snaglist/.
  base: "/snaglist/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // The demo runs the live library source.
      snaglist: fileURLToPath(new URL("../src/index.ts", import.meta.url)),
    },
  },
});
