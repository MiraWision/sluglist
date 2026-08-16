import fs from "node:fs";
import path from "node:path";
import { Marked } from "marked";
import { syncHighlighter } from "./highlight";

/**
 * Markdown → HTML at build time, with Shiki-highlighted code fences.
 *
 * The renderer is built per call rather than kept as module state: `marked`'s
 * `code` hook is synchronous, so the highlighter has to be loaded (async)
 * before parsing starts. Loading is memoized inside `highlight.ts`, so the cost
 * is paid once for the whole build.
 */
async function parser(): Promise<Marked> {
  const highlight = await syncHighlighter();
  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      // Shiki emits the whole `<pre><code>…` wrapper, so the default renderer
      // is replaced rather than wrapped.
      code({ text, lang }) {
        return highlight(text, lang);
      },
    },
  });
  return marked;
}

/** Render a markdown file (path relative to the docs app root) to HTML. */
export async function renderMarkdownFile(relPath: string): Promise<string> {
  const file = path.join(process.cwd(), relPath);
  const raw = fs.readFileSync(file, "utf8");
  return (await parser()).parse(raw) as string;
}

/** Render a markdown string to HTML. */
export async function renderMarkdown(raw: string): Promise<string> {
  return (await parser()).parse(raw) as string;
}
