import fs from "node:fs";
import path from "node:path";
import { marked } from "marked";

marked.setOptions({ gfm: true });

/** Render a markdown file (path relative to the docs app root) to HTML at build time. */
export function renderMarkdownFile(relPath: string): string {
  const file = path.join(process.cwd(), relPath);
  const raw = fs.readFileSync(file, "utf8");
  return marked.parse(raw) as string;
}

/** Render a markdown string to HTML at build time. */
export function renderMarkdown(raw: string): string {
  return marked.parse(raw) as string;
}
