import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // Served at the root of the custom domain sluglist.dev (see public/CNAME).
  base: "/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // The demo runs the live library source.
      sluglist: fileURLToPath(new URL("../src/index.ts", import.meta.url)),
    },
  },
});
