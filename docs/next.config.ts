import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export deployed to GitHub Pages behind the sluglist.dev CNAME.
  output: "export",
  // Folder-per-route output (`/docs/quick-start/index.html`) so GitHub Pages
  // serves every route without rewrite rules. Canonicals carry the slash too.
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
