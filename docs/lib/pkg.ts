import fs from "node:fs";
import path from "node:path";

/**
 * Facts about the published package, read from the library's own
 * `package.json` at build time.
 *
 * The point is that they cannot go stale: the version and the dependency count
 * on the home page are whatever the last release actually shipped, not a number
 * someone remembered to update.
 */
interface Pkg {
  version: string;
  license: string;
  dependencies?: Record<string, string>;
}

function read(): Pkg {
  const file = path.join(process.cwd(), "..", "package.json");
  return JSON.parse(fs.readFileSync(file, "utf8")) as Pkg;
}

const pkg = read();

export const VERSION = pkg.version;
export const LICENSE = pkg.license;
export const DEPENDENCY_COUNT = Object.keys(pkg.dependencies ?? {}).length;
