import fs from "node:fs";
import path from "node:path";
import { Marked } from "marked";
import { syncHighlighter } from "./highlight";

/**
 * Markdown → HTML at build time: Shiki-highlighted code fences, and callouts
 * for the lines a reader must not skim past.
 *
 * The renderer is built per call rather than kept as module state: `marked`'s
 * hooks are synchronous, so the highlighter has to be loaded (async) before
 * parsing starts. Loading is memoized inside `highlight.ts`, so the cost is
 * paid once for the whole build.
 */

/**
 * Callout types, in GitHub's alert syntax — a blockquote whose first line is
 * `[!WARNING]`. Using the same spelling as GitHub means a docs file still reads
 * correctly in the repo, not only on the site.
 *
 * Each is one glyph and one colour role, drawn like the rest of the icon set:
 * 24px box, weight 1.6, `currentColor`, no fill.
 */
const CALLOUTS = {
  note: {
    label: "Note",
    tint: "tint-brand",
    path: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.4"/>',
  },
  tip: {
    label: "Tip",
    tint: "tint-pass",
    path: '<path d="M9 17.5h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9v1.1h7v-1.1A6 6 0 0 0 12 3z"/>',
  },
  important: {
    label: "Important",
    tint: "tint-brand",
    path: '<path d="M4.5 5.5h15v10h-9l-4 3.5v-13.5z"/><path d="M12 8.5v3.5M12 14v.4"/>',
  },
  warning: {
    label: "Warning",
    tint: "tint-gap",
    path: '<path d="M12 4.5 21 19.5H3l9-15z"/><path d="M12 10v4M12 16.5v.5"/>',
  },
  caution: {
    label: "Caution",
    tint: "tint-fail",
    path: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 8.5 15.5 15.5M15.5 8.5 8.5 15.5"/>',
  },
} as const;

type CalloutType = keyof typeof CALLOUTS;

const MARKER = /^<p>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*\n?/i;

function icon(paths: string): string {
  return `<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

/**
 * A blockquote is either a callout (first line `[!TYPE]`) or a plain quote.
 * Both get the same panel shape so the prose has one visual vocabulary.
 */
function blockquote(inner: string): string {
  const match = MARKER.exec(inner);
  if (!match) {
    return `<div class="callout callout-quote"><div class="callout-body">${inner}</div></div>`;
  }
  const type = match[1].toLowerCase() as CalloutType;
  const { label, tint, path: glyph } = CALLOUTS[type];
  const body = inner.replace(MARKER, "<p>");
  return [
    `<div class="callout ${tint}">`,
    `<div class="callout-mark">${icon(glyph)}`,
    `<span class="callout-label">${label}</span>`,
    "</div>",
    `<div class="callout-body">${body}</div>`,
    "</div>",
  ].join("");
}

interface RenderOptions {
  /**
   * Rewrite repo-relative links (`SPEC.md`, `docs/…`, `examples/…`) to the
   * file on GitHub. Needed for markdown written for the repository (the
   * changelog): rendered on the site, those hrefs would otherwise resolve
   * against the page URL and 404.
   */
  repoLinks?: boolean;
}

const REPO_BLOB = "https://github.com/MiraWision/sluglist/blob/main/";

async function parser(opts: RenderOptions = {}): Promise<Marked> {
  const highlight = await syncHighlighter();
  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      // Shiki emits the whole `<pre><code>…` wrapper, so the default renderer
      // is replaced rather than wrapped.
      code({ text, lang }) {
        return highlight(text, lang);
      },
      blockquote({ tokens }) {
        return blockquote(this.parser.parse(tokens));
      },
      link({ href, title, tokens }) {
        const inner = this.parser.parseInline(tokens);
        const isRelative = !/^([a-z]+:|\/|#)/i.test(href);
        const target = opts.repoLinks && isRelative ? `${REPO_BLOB}${href}` : href;
        const titleAttr = title ? ` title="${title}"` : "";
        return `<a href="${target}"${titleAttr}>${inner}</a>`;
      },
    },
  });
  return marked;
}

/** Render a markdown file (path relative to the docs app root) to HTML. */
export async function renderMarkdownFile(
  relPath: string,
  opts: RenderOptions = {}
): Promise<string> {
  const file = path.join(process.cwd(), relPath);
  const raw = fs.readFileSync(file, "utf8");
  return (await parser(opts)).parse(raw) as string;
}

/** Render a markdown string to HTML. */
export async function renderMarkdown(raw: string): Promise<string> {
  return (await parser()).parse(raw) as string;
}
