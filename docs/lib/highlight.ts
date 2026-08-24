import { createHighlighter, type Highlighter } from "shiki";

/**
 * Syntax highlighting, VS Code's own — Shiki runs the same TextMate grammars
 * and themes the editor does.
 *
 * All of it happens at build time: the site is a static export, so the output
 * is plain HTML with per-token colours and **no client JavaScript**. Shiki is a
 * devDependency of the docs app; the published `sluglist` package is untouched.
 *
 * Both themes are emitted at once. With `defaultColor: false` each token
 * carries `--shiki-light` and `--shiki-dark` custom properties, and the CSS in
 * `globals.css` picks one by `prefers-color-scheme` — so a reader who flips
 * their system theme gets the right palette without a reload or a flash.
 */

const THEMES = { light: "light-plus", dark: "dark-plus" } as const;

/** Grammars actually used in the docs, the README and the code samples. */
const LANGS = [
  "ts",
  "tsx",
  "js",
  "json",
  "yaml",
  "bash",
  "markdown",
  "html",
  "css",
  "diff",
] as const;

/** Fence labels that are not grammar names. */
const ALIASES: Record<string, string> = {
  text: "plaintext",
  txt: "plaintext",
  "": "plaintext",
  md: "markdown",
  sh: "bash",
  shell: "bash",
  yml: "yaml",
  typescript: "ts",
  javascript: "js",
};

let pending: Promise<Highlighter> | null = null;

/** One highlighter for the whole build — loading grammars is the expensive part. */
function highlighter(): Promise<Highlighter> {
  pending ??= createHighlighter({
    themes: [THEMES.light, THEMES.dark],
    langs: [...LANGS],
  });
  return pending;
}

function resolveLang(lang: string | undefined, loaded: string[]): string {
  const name = (lang ?? "").trim().toLowerCase();
  const mapped = ALIASES[name] ?? name;
  // An unknown grammar renders as plain text rather than throwing: a code
  // fence with a typo in its label must never fail the build.
  return mapped === "plaintext" || loaded.includes(mapped) ? mapped : "plaintext";
}

/** Highlight one block, returning Shiki's `<pre class="shiki">…</pre>`. */
export async function highlight(
  code: string,
  lang?: string
): Promise<string> {
  const shiki = await highlighter();
  return shiki.codeToHtml(code.replace(/\n+$/, ""), {
    lang: resolveLang(lang, shiki.getLoadedLanguages()),
    themes: THEMES,
    defaultColor: false,
  });
}

/**
 * Preload the highlighter and hand back the synchronous API, for callers that
 * cannot await inside their own loop (the markdown renderer).
 */
export async function syncHighlighter(): Promise<
  (code: string, lang?: string) => string
> {
  const shiki = await highlighter();
  const loaded = shiki.getLoadedLanguages();
  return (code, lang) =>
    shiki.codeToHtml(code.replace(/\n+$/, ""), {
      lang: resolveLang(lang, loaded),
      themes: THEMES,
      defaultColor: false,
    });
}
