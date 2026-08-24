import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";

/**
 * Reader for sluglist artifacts — the inverse of `yaml.ts` + `artifacts.ts`.
 *
 * Hand-rolled for the same reason the serializer is: the artifact format is a
 * contract we own end to end, so the reader parses exactly the subset the
 * writer emits (block maps, block sequences, sequences of maps, `[]`, and
 * scalars that are either bare or JSON-quoted). No anchors, flow collections,
 * multi-line scalars or documents — the writer cannot produce them. This keeps
 * `npm install sluglist` free of a YAML dependency, and is round-trip tested
 * against the serializer so the two cannot drift.
 *
 * Node-only: used by `sluglist report`, never by the browser bundle.
 */

export type YamlNode =
  | string
  | number
  | boolean
  | null
  | YamlNode[]
  | { [key: string]: YamlNode };

const NUMERIC = /^[+-]?(\d[\d_]*\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

interface Line {
  indent: number;
  text: string;
}

function scan(source: string): Line[] {
  const lines: Line[] = [];
  for (const raw of source.split("\n")) {
    // Comments are never emitted by the writer; a whole-line one is tolerated.
    if (!raw.trim() || raw.trimStart().startsWith("#")) {
      continue;
    }
    lines.push({ indent: raw.length - raw.trimStart().length, text: raw.trim() });
  }
  return lines;
}

/** Parse one scalar token as written by `formatScalar`. */
export function parseScalar(token: string): YamlNode {
  const value = token.trim();
  if (value === "" || value === "null" || value === "~") {
    return null;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  if (value.startsWith('"')) {
    try {
      return JSON.parse(value) as string;
    } catch {
      // A quoted scalar that will not JSON-parse is malformed; keep the raw
      // text rather than losing the value.
      return value;
    }
  }
  if (value === "[]") {
    return [];
  }
  // The writer quotes anything numeric-looking that is meant to be a string,
  // so a bare numeric token is genuinely a number.
  if (NUMERIC.test(value)) {
    return Number(value.replace(/_/g, ""));
  }
  return value;
}

/** Split `key: value` at the first `: ` outside a quoted scalar. */
function splitEntry(text: string): { key: string; rest: string } | null {
  if (text.startsWith('"')) {
    // The writer never emits a quoted key.
    return null;
  }
  const colon = text.indexOf(":");
  if (colon < 0) {
    return null;
  }
  const after = text[colon + 1];
  if (after !== undefined && after !== " ") {
    return null;
  }
  return { key: text.slice(0, colon), rest: text.slice(colon + 1).trim() };
}

interface Cursor {
  i: number;
}

function parseBlock(lines: Line[], cursor: Cursor, indent: number): YamlNode {
  if (cursor.i >= lines.length) {
    return null;
  }
  return lines[cursor.i].text.startsWith("- ") || lines[cursor.i].text === "-"
    ? parseSequence(lines, cursor, indent)
    : parseMapping(lines, cursor, indent);
}

function parseSequence(lines: Line[], cursor: Cursor, indent: number): YamlNode[] {
  const out: YamlNode[] = [];
  while (cursor.i < lines.length) {
    const line = lines[cursor.i];
    if (line.indent < indent || !(line.text.startsWith("- ") || line.text === "-")) {
      break;
    }
    if (line.indent > indent) {
      // Deeper than this sequence's own indent — belongs to a nested block that
      // the entry handler below has already consumed.
      break;
    }
    const inline = line.text === "-" ? "" : line.text.slice(2);
    if (!inline) {
      cursor.i++;
      out.push(parseBlock(lines, cursor, indent + 2));
      continue;
    }
    const entry = splitEntry(inline);
    if (!entry) {
      // A plain scalar item.
      cursor.i++;
      out.push(parseScalar(inline));
      continue;
    }
    // A map item: its first key sits on the dash line, the rest are indented
    // to where that key starts (dash + space = 2 columns).
    const itemIndent = line.indent + 2;
    const rewritten: Line[] = [{ indent: itemIndent, text: inline }, ...lines.slice(cursor.i + 1)];
    const sub: Cursor = { i: 0 };
    const value = parseMapping(rewritten, sub, itemIndent);
    cursor.i += sub.i;
    out.push(value);
  }
  return out;
}

function parseMapping(
  lines: Line[],
  cursor: Cursor,
  indent: number
): Record<string, YamlNode> {
  const out: Record<string, YamlNode> = {};
  while (cursor.i < lines.length) {
    const line = lines[cursor.i];
    if (line.indent < indent || line.text.startsWith("- ")) {
      break;
    }
    if (line.indent > indent) {
      // Stray deeper line (already-consumed nesting); skip defensively.
      cursor.i++;
      continue;
    }
    const entry = splitEntry(line.text);
    if (!entry) {
      cursor.i++;
      continue;
    }
    cursor.i++;
    if (entry.rest !== "") {
      out[entry.key] = parseScalar(entry.rest);
      continue;
    }
    // Empty value ⇒ a nested block on the following, more-indented lines. A
    // sequence may sit at the SAME indent as its key (block sequences in this
    // format are written that way for `screenshots:` style lists).
    const next = lines[cursor.i];
    if (
      next &&
      (next.indent > indent ||
        (next.indent === indent && (next.text.startsWith("- ") || next.text === "-")))
    ) {
      out[entry.key] = parseBlock(lines, cursor, next.indent);
    } else {
      out[entry.key] = null;
    }
  }
  return out;
}

/** Parse a YAML document written by this package's serializer. */
export function parseYaml(source: string): YamlNode {
  const lines = scan(source);
  if (lines.length === 0) {
    return null;
  }
  const cursor: Cursor = { i: 0 };
  return parseBlock(lines, cursor, lines[0].indent);
}

/* ------------------------------------------------------------------ */
/* Artifact-level readers                                              */
/* ------------------------------------------------------------------ */

export interface ParsedIssue {
  /** Frontmatter fields, verbatim. */
  frontmatter: Record<string, YamlNode>;
  /** Everything after the closing `---`, trimmed. */
  body: string;
  /** The markdown file's own name, e.g. "01-export-button-missing.md". */
  file: string;
}

/**
 * Split an issue markdown file into frontmatter and body. A file without a
 * leading `---` block is treated as all-body (never throws — a report must
 * render whatever is on disk).
 */
export function parseIssueMarkdown(source: string, file: string): ParsedIssue {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(source);
  if (!match) {
    return { frontmatter: {}, body: source.trim(), file };
  }
  const parsed = parseYaml(match[1]);
  return {
    frontmatter:
      parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {},
    body: source.slice(match[0].length).trim(),
    file,
  };
}

export interface SessionBundle {
  /** Absolute path of the session folder. */
  dir: string;
  /** Parsed session.yaml. */
  session: Record<string, YamlNode>;
  /** Parsed fixes.yaml, or null when the session was never fixed. */
  fixes: Record<string, YamlNode> | null;
  /** Every `NN-*.md` in the folder, in id order. */
  issues: ParsedIssue[];
  /** Names of every file in the session folder (one level). */
  files: string[];
}

function asRecord(node: YamlNode): Record<string, YamlNode> {
  return node && typeof node === "object" && !Array.isArray(node) ? node : {};
}

/** Read and parse a whole session folder. */
export async function readSession(dir: string): Promise<SessionBundle> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = entries.filter((e) => e.isFile()).map((e) => e.name);

  if (!files.includes("session.yaml")) {
    throw new Error(
      `[sluglist] ${dir} has no session.yaml — not a session folder`
    );
  }
  const session = asRecord(
    parseYaml(await readFile(join(dir, "session.yaml"), "utf8"))
  );

  let fixes: Record<string, YamlNode> | null = null;
  if (files.includes("fixes.yaml")) {
    fixes = asRecord(parseYaml(await readFile(join(dir, "fixes.yaml"), "utf8")));
  }

  const issueFiles = files
    .filter((name) => /^\d+-.*\.md$/.test(name))
    .sort((a, b) => a.localeCompare(b, "en"));
  const issues: ParsedIssue[] = [];
  for (const name of issueFiles) {
    issues.push(
      parseIssueMarkdown(await readFile(join(dir, name), "utf8"), name)
    );
  }

  return { dir, session, fixes, issues, files };
}

/**
 * Find the newest session folder under `root` (a folder named `session-*`
 * containing a session.yaml). Sessions sort by their id, whose date prefix
 * makes lexical order chronological. Returns null when there is none.
 */
export async function latestSessionDir(root: string): Promise<string | null> {
  let entries: string[];
  try {
    entries = (await readdir(root, { withFileTypes: true }))
      .filter((e) => e.isDirectory() && e.name.startsWith("session-"))
      .map((e) => e.name);
  } catch {
    return null;
  }
  entries.sort((a, b) => a.localeCompare(b, "en"));
  for (const name of entries.reverse()) {
    const dir = join(root, name);
    try {
      const files = await readdir(dir);
      if (files.includes("session.yaml")) {
        return dir;
      }
    } catch {
      // Unreadable folder — keep looking.
    }
  }
  return null;
}

/**
 * Every session folder under `root`, oldest first. The session id carries the
 * date, so a lexical sort is chronological.
 */
export async function sessionDirs(root: string): Promise<string[]> {
  let names: string[];
  try {
    names = (await readdir(root, { withFileTypes: true }))
      .filter((e) => e.isDirectory() && e.name.startsWith("session-"))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b, "en"));
  } catch {
    return [];
  }
  const dirs: string[] = [];
  for (const name of names) {
    const dir = join(root, name);
    if (await isSessionDir(dir)) {
      dirs.push(dir);
    }
  }
  return dirs;
}

/** True when `dir` is itself a session folder. */
export async function isSessionDir(dir: string): Promise<boolean> {
  try {
    return (await readdir(dir)).includes("session.yaml");
  } catch {
    return false;
  }
}

/** The session folder's own name, for display. */
export function sessionName(dir: string): string {
  return basename(dir);
}
