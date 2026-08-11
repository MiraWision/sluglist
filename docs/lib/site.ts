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

/**
 * Per-page social metadata.
 *
 * The root layout's `openGraph`/`twitter` values are defaults, and Next only
 * replaces the keys a page actually sets — so a page that declares just `title`
 * and `description` still shares as the HOME page's og:title and og:url. Every
 * page therefore has to restate them, which is what this returns: canonical
 * URL, the page's own title and description, and the shared og:image.
 *
 * `type` is `article` for real content pages (docs, comparisons, use cases) and
 * `website` for the home and index pages.
 */
export function pageMetadata(options: {
  path: string;
  title: string;
  description: string;
  type?: "article" | "website";
}) {
  const url = canonical(options.path);
  // The layout's `title.template` ("%s — sluglist") applies to <title> only;
  // og:title and twitter:title are not templated, so the suffix is added here
  // to keep the shared card identical to the browser tab.
  const socialTitle = `${options.title} — ${SITE_NAME}`;
  return {
    title: options.title,
    description: options.description,
    alternates: { canonical: options.path },
    openGraph: {
      type: options.type ?? "article",
      siteName: SITE_NAME,
      url,
      title: socialTitle,
      description: options.description,
      images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: OG_IMAGE_ALT }],
    },
    twitter: {
      card: "summary_large_image" as const,
      title: socialTitle,
      description: options.description,
      images: [{ url: OG_IMAGE, alt: OG_IMAGE_ALT }],
    },
  };
}
