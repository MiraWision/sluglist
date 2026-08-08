export const SITE_URL = "https://sluglist.dev";
export const SITE_NAME = "sluglist";
export const SITE_TITLE = "sluglist — visual feedback that your agent fixes";
export const SITE_DESCRIPTION =
  "Drop-in visual feedback widget for dev and staging sites: pick an element, screenshot, annotate, and deliver clean artifacts. Feedback lands in a local folder that Claude Code reads and fixes.";

export const REPO = "https://github.com/MiraWision/sluglist";
export const NPM = "https://www.npmjs.com/package/sluglist";

export const OG_IMAGE = `${SITE_URL}/og-image.png`;
export const OG_IMAGE_ALT =
  "sluglist — a drop-in visual feedback widget whose artifacts a coding agent reads and fixes";

/** Absolute canonical URL for a route path ("/", "/docs/quick-start/"). */
export function canonical(path: string): string {
  const p = path.endsWith("/") ? path : `${path}/`;
  return `${SITE_URL}${p}`;
}
