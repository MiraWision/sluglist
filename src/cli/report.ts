import { readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  AGGRESSIVE_EMBED,
  DEFAULT_EMBED,
  type EmbedOptions,
  embedImage,
  fileSize,
  formatBytes,
  SIZE_LIMIT,
} from "./embed";
import type { ParsedIssue, SessionBundle, YamlNode } from "../node/read";
import { REPORT_CSS, REPORT_JS } from "./report-assets";

/**
 * `sluglist report` — renders one session folder into a single self-contained
 * HTML file: a short article a client can open from `file://`, offline, and
 * read as proof that the work was tested.
 *
 * Constraints that shape everything here:
 * - **Zero external requests.** CSS and JS are inlined, fonts are the system
 *   stack, images are `data:` URIs. The file must work with no network.
 * - **One artifact.** No sidecar folder, no viewer app — it is emailable.
 * - **Static.** The report is a snapshot of a finished run, never live.
 *
 * English only in v1 (see the deferrals in RUN_EVIDENCE.md).
 */

export interface BuildReportOptions {
  /**
   * Author-written headings, keyed by `<session-id>/<file>` (or by file name
   * alone). Loaded from `--titles <file>`; see `titles.json` in the docs.
   */
  titles?: Map<string, string>;
}

export interface BuildReportResult {
  html: string;
  /** Byte length of the HTML. */
  bytes: number;
  /** Non-fatal notes for the CLI to print (missing files, size pressure). */
  warnings: string[];
  /** Whether the harsher image pass was used. */
  degraded: boolean;
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escape for HTML text and attribute contexts. */
export function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

function str(node: YamlNode | undefined): string {
  if (node === null || node === undefined) {
    return "";
  }
  if (typeof node === "object") {
    return "";
  }
  return String(node);
}

function record(node: YamlNode | undefined): Record<string, YamlNode> {
  return node && typeof node === "object" && !Array.isArray(node)
    ? (node as Record<string, YamlNode>)
    : {};
}

function list(node: YamlNode | undefined): YamlNode[] {
  return Array.isArray(node) ? node : [];
}

/** ISO timestamp → "11 August 2026, 16:29 UTC". Falls back to the raw text. */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const day = date.getUTCDate();
  const month = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ][date.getUTCMonth()];
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  return `${day} ${month} ${date.getUTCFullYear()}, ${hh}:${mm} UTC`;
}

/** Clip to `max` chars on a word boundary, adding an ellipsis when clipped. */
export function truncate(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  const cut = value.slice(0, max);
  const space = cut.lastIndexOf(" ");
  // Only back off to the word boundary when it does not gut the string.
  const body = space > max * 0.6 ? cut.slice(0, space) : cut;
  return `${body.replace(/[\s,.;:—-]+$/, "")}…`;
}

/** Render a markdown-ish issue body: paragraphs, `## headings`, `- ` lists. */
export function renderBody(body: string): string {
  if (!body.trim()) {
    return "";
  }
  const blocks = body.trim().split(/\n{2,}/);
  const out: string[] = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    if (lines[0].startsWith("## ")) {
      out.push(`<h4>${esc(lines[0].slice(3))}</h4>`);
      const rest = lines.slice(1).filter((l) => l.trim());
      if (rest.length > 0) {
        out.push(renderLines(rest));
      }
      continue;
    }
    out.push(renderLines(lines));
  }
  return out.join("\n");
}

/**
 * Split one `## Section` out of the body, returning it and the rest.
 *
 * Used for the action trail: it is evidence, so it cannot be dropped, but a
 * 25-step trail is longer than the report it belongs to and buries the sentence
 * a human actually wrote. It moves into the spoiler instead.
 */
export function takeSection(
  body: string,
  name: string
): { rest: string; lines: string[] } {
  const blocks = body.trim().split(/\n{2,}/);
  const kept: string[] = [];
  let lines: string[] = [];
  for (const block of blocks) {
    const head = block.split("\n")[0].trim();
    if (head.toLowerCase() === `## ${name.toLowerCase()}`) {
      lines = block
        .split("\n")
        .slice(1)
        .filter((l) => l.trim());
      continue;
    }
    kept.push(block);
  }
  return { rest: kept.join("\n\n"), lines };
}

/** `- [12s before report] click #save ("Save")` → a row with a fixed stamp. */
function renderTrail(lines: string[]): string {
  const items = lines.map((line) => {
    const text = line.replace(/^- /, "");
    const match = /^\[([^\]]+)\]\s*(.*)$/.exec(text);
    return match
      ? `<li><span class="stamp">${esc(match[1])}</span><code>${esc(match[2])}</code></li>`
      : `<li><code>${esc(text)}</code></li>`;
  });
  return `<ol class="trail">${items.join("")}</ol>`;
}

function renderLines(lines: string[]): string {
  if (lines.every((l) => l.startsWith("- ") || l.startsWith("    "))) {
    const items: string[] = [];
    for (const line of lines) {
      if (line.startsWith("- ")) {
        items.push(`<li>${esc(line.slice(2))}</li>`);
      } else if (items.length > 0) {
        // Continuation (an indented stack frame) belongs to the last item.
        items[items.length - 1] = items[items.length - 1].replace(
          "</li>",
          `<br><span class="cont">${esc(line.trim())}</span></li>`
        );
      }
    }
    return `<ul>${items.join("")}</ul>`;
  }
  return `<p>${lines.map((l) => esc(l)).join("<br>")}</p>`;
}

/* ------------------------------------------------------------------ */
/* Model                                                               */
/* ------------------------------------------------------------------ */

type VerdictKind = "pass" | "fail" | "skip" | "not-tested";

const VERDICT_LABEL: Record<VerdictKind, string> = {
  pass: "Pass",
  fail: "Fail",
  skip: "Skipped",
  "not-tested": "Not tested",
};

function verdictOf(node: YamlNode | undefined): VerdictKind {
  const value = str(node);
  if (value === "pass" || value === "fail" || value === "skip") {
    return value;
  }
  return "not-tested";
}

interface FixInfo {
  status: string;
  note: string;
  commit: string;
}

function fixesByIssue(bundle: SessionBundle): Map<string, FixInfo> {
  const out = new Map<string, FixInfo>();
  for (const raw of list(bundle.fixes?.items)) {
    const item = record(raw);
    const issue = str(item.issue);
    if (issue) {
      out.set(issue, {
        status: str(item.status),
        note: str(item.note),
        commit: str(item.commit),
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

/**
 * A caption a reader can act on. The file name is provenance, not information —
 * `ev-archive-lists-everything-01.png` says nothing that the item's own heading
 * has not already said — so the caption says what the picture *is*, and the
 * name stays on the figure as a tooltip for anyone checking the artifact.
 */
function captionFor(name: string, index: number, total: number): string {
  const frame = /-frames\/([^/]+)\/(\d+)\.png$/.exec(name);
  if (frame) {
    return `Recording ${frame[1].replace(/-/g, " ")}, frame ${Number(frame[2])}`;
  }
  const nth = total > 1 ? ` ${index + 1} of ${total}` : "";
  if (/^ev-/.test(name)) {
    return `Evidence${nth}`;
  }
  if (/-att-\d+\./.test(name)) {
    return `Attachment${nth}`;
  }
  if (/^\d+-.*\.png$/.test(name)) {
    return `Screenshot${nth}`;
  }
  return name;
}

/** One figure: a thumbnail that opens the full image in the lightbox. */
function figure(uri: string, caption: string, id: string, file: string): string {
  return [
    '<figure class="shot">',
    `<button type="button" class="shot-open" data-full="${id}" title="${esc(file)}"` +
      ` aria-label="Open full screen: ${esc(caption)}">`,
    // No `loading="lazy"`: every image is already in the file, and a lazy one
    // that has not been decoded yet prints as a blank box — which is the worst
    // possible failure in a document whose whole job is showing the evidence.
    `<img src="${uri}" alt="${esc(caption)}" data-file="${esc(file)}">`,
    "</button>",
    caption ? `<figcaption>${esc(caption)}</figcaption>` : "",
    "</figure>",
  ].join("");
}

async function renderEvidence(
  bundle: SessionBundle,
  evidence: Record<string, YamlNode>,
  verdict: VerdictKind,
  options: EmbedOptions,
  warnings: string[]
): Promise<string> {
  const shots = list(evidence.screenshots).map(str).filter(Boolean);
  const note = str(evidence.note);
  const parts: string[] = [];
  if (note) {
    // The same quoted block a filed report gets: this sentence is the tester's
    // observation, not the renderer's summary, and the accent bar says so. On
    // an item nobody could test it is not an observation but a reason, and
    // calling it "Observed" would read as though the check had happened.
    const label =
      verdict === "pass" || verdict === "fail" ? "Observed" : "Why not";
    parts.push(
      `<div class="quote quote-${verdict}"><span class="quote-label">${label}</span>` +
        `<p>${esc(note)}</p></div>`
    );
  }
  const figures: string[] = [];
  for (const [i, name] of shots.entries()) {
    const image = await embedImage(bundle.dir, name, options);
    if (!image) {
      warnings.push(`evidence image not found: ${name}`);
      continue;
    }
    figures.push(figure(image.uri, captionFor(name, i, shots.length), name, name));
  }
  if (figures.length > 0) {
    parts.push(`<div class="shots">${figures.join("")}</div>`);
  }
  return parts.join("\n");
}

async function renderChecklist(
  bundle: SessionBundle,
  options: EmbedOptions,
  warnings: string[]
): Promise<string> {
  const checklist = record(bundle.session.checklist);
  const items = list(checklist.items).map(record);
  if (items.length === 0) {
    return "";
  }

  // Group by section, preserving first-seen order.
  const sections: { title: string; items: Record<string, YamlNode>[] }[] = [];
  for (const item of items) {
    const title = str(item.section);
    let section = sections.find((s) => s.title === title);
    if (!section) {
      section = { title, items: [] };
      sections.push(section);
    }
    section.items.push(item);
  }

  const out: string[] = [];
  let ordinal = 0;
  for (const section of sections) {
    if (section.title) {
      out.push(`<h3 class="group">${esc(section.title)}</h3>`);
    }
    for (const item of section.items) {
      const verdict = verdictOf(item.verdict);
      const issue = str(item.issue);
      ordinal++;
      // A checked item is the same kind of block as a filed report — number,
      // heading, tags, then the words and the proof. The verdict rides in the
      // tag row: it is one more fact about the item, and a reader scanning a
      // column of blocks reads its colour before they read anything else.
      out.push(
        `<section class="report check check-${verdict}" id="check-${esc(str(item.id))}">`
      );
      out.push(
        '<div class="report-head">' +
          `<span class="num">${String(ordinal).padStart(2, "0")}</span>` +
          `<h3>${esc(str(item.title))}</h3>` +
          "</div>"
      );
      const tags: string[] = [
        `<span class="tag tag-verdict tag-${verdict}">${VERDICT_LABEL[verdict]}</span>`,
      ];
      if (str(item.id)) {
        tags.push(`<span class="tag tag-page"><code>${esc(str(item.id))}</code></span>`);
      }
      if (issue) {
        tags.push(
          `<span class="tag tag-link"><a href="#issue-${esc(issue)}">report ${esc(issue)}</a></span>`
        );
      }
      out.push(`<div class="tags">${tags.join("")}</div>`);

      const evidence = record(item.evidence);
      if (Object.keys(evidence).length > 0) {
        out.push(await renderEvidence(bundle, evidence, verdict, options, warnings));
      }
      out.push("</section>");
    }
  }
  return out.join("\n");
}

/**
 * The heading. An author-written title beats a truncated first sentence, which
 * usually repeats the paragraph directly under it — but it never *replaces* the
 * report: the original text stays verbatim below, so a title that drifts from
 * what the person meant can always be checked against the source.
 *
 * Precedence: an explicit titles file, then `title:` in the frontmatter, then
 * the old first-sentence fallback so existing sessions render unchanged.
 */
function headingFor(
  bundle: SessionBundle,
  issue: ParsedIssue,
  id: string,
  titles: Map<string, string>
): string {
  const sessionId = str(bundle.session.session_id);
  const keyed = titles.get(`${sessionId}/${issue.file}`) ?? titles.get(issue.file);
  const title =
    keyed?.trim() ||
    str(issue.frontmatter.title).trim() ||
    issue.body.split("\n")[0]?.trim() ||
    `Issue ${id}`;
  return truncate(title, 120);
}

/**
 * Frontmatter rows, in reading order: the report first, its session last.
 *
 * Labels are written out ("Console errors", not `errors_count`): the spoiler is
 * where a client goes when they doubt the text, and a column of snake_case keys
 * reads as a database dump rather than as evidence. Values that are literally
 * code — a path, a selector, a component name — are marked so.
 */
type MetaRow = [label: string, value: string, code?: boolean];

function metaRows(
  bundle: SessionBundle,
  fm: Record<string, YamlNode>
): MetaRow[] {
  const session = bundle.session;
  const os = [str(session.browser), str(session.os)].filter(Boolean).join(" · ");
  const pairs: MetaRow[] = [
    ["Page", str(fm.url), true],
    ["Category", str(fm.category)],
    ["Capture mode", str(fm.mode)],
    ["Element text", str(fm.element_text)],
    ["Selector", str(fm.selector), true],
    ["Selector strategy", str(fm.selector_strategy)],
    ["Component", str(fm.component), true],
    ["DOM path", str(fm.dom_path), true],
    ["Checklist item", str(fm.checklist_item), true],
    ["Viewport", str(fm.viewport)],
    ["Screen", str(fm.screen)],
    ["Console errors", fm.errors_count === undefined ? "" : String(fm.errors_count)],
    ["Actions recorded", fm.actions_count === undefined ? "" : String(fm.actions_count)],
    ["Frames", fm.frames_count === undefined ? "" : String(fm.frames_count)],
    ["Recording", fm.recording === true ? "yes" : ""],
    ["Masked", fm.masked === true ? "yes" : ""],
    ["Scrubbed", fm.scrubbed === true ? "yes" : ""],
    ["Reported", str(fm.created_at) ? formatDate(str(fm.created_at)) : ""],
    ["Report id", str(fm.id)],
    ["Session", str(session.session_id), true],
    ["Site", str(session.base_url), true],
    ["Browser", os],
    ["Timezone", str(session.timezone)],
    ["Language", str(session.language)],
    ["Color scheme", str(session.color_scheme)],
  ];
  return pairs.filter(([, value]) => value !== "");
}

async function renderIssue(
  bundle: SessionBundle,
  issue: ParsedIssue,
  fixes: Map<string, FixInfo>,
  options: EmbedOptions,
  warnings: string[],
  titles: Map<string, string>
): Promise<string> {
  const fm = issue.frontmatter;
  const id = str(fm.id) || issue.file.split("-")[0];
  const out: string[] = [`<section class="report" id="issue-${esc(id)}">`];

  out.push(
    '<div class="report-head">' +
      `<span class="num">${esc(id)}</span>` +
      `<h3>${esc(headingFor(bundle, issue, id, titles))}</h3>` +
      "</div>"
  );

  // Above the fold, three facts and no more: where, what kind, when. They are
  // what a reader scans; everything else lives in the spoiler at the end.
  const tags: string[] = [];
  if (str(fm.url)) {
    tags.push(`<span class="tag tag-page"><code>${esc(str(fm.url))}</code></span>`);
  }
  if (str(fm.category)) {
    tags.push(`<span class="tag">${esc(str(fm.category))}</span>`);
  }
  if (str(fm.created_at)) {
    tags.push(`<span class="tag tag-dim">${esc(formatDate(str(fm.created_at)))}</span>`);
  }
  if (tags.length > 0) {
    out.push(`<div class="tags">${tags.join("")}</div>`);
  }

  const fix = fixes.get(id);
  if (fix) {
    const status = fix.status.replace(/_/g, " ");
    out.push(
      `<div class="fix fix-${esc(fix.status)}"><span class="badge badge-fix-${esc(fix.status)}">${esc(status)}</span>` +
        (fix.note ? ` ${esc(fix.note)}` : "") +
        (fix.commit
          ? ` <span class="dim">·</span> <code>${esc(fix.commit)}</code>`
          : "") +
        "</div>"
    );
  }

  // The first line became the heading only when it *is* the fallback heading;
  // with an author title the whole comment stays, quoted in full.
  const authored =
    titles.has(`${str(bundle.session.session_id)}/${issue.file}`) ||
    titles.has(issue.file) ||
    str(fm.title) !== "";
  const body = authored
    ? issue.body
    : issue.body.split("\n").slice(1).join("\n");
  const { rest, lines: trail } = takeSection(body, "Actions");
  // What the reporter wrote is quoted; the machine-written sections that follow
  // it (`## Errors`, `## Console`) are not — they are data, and putting them
  // inside the quote would attribute them to the person.
  const split = rest.search(/(^|\n)## /);
  const said = split === -1 ? rest : rest.slice(0, split);
  const machine = split === -1 ? "" : rest.slice(split);
  if (said.trim()) {
    out.push(`<div class="quote">${renderBody(said)}</div>`);
  }
  if (machine.trim()) {
    out.push(renderBody(machine));
  }

  // Screenshots: `screenshots` when present, else the single `screenshot`.
  const shots = list(fm.screenshots).map(str).filter(Boolean);
  if (shots.length === 0 && str(fm.screenshot)) {
    shots.push(str(fm.screenshot));
  }
  const figures: string[] = [];
  for (const [i, name] of shots.entries()) {
    const image = await embedImage(bundle.dir, name, options);
    if (!image) {
      warnings.push(`issue ${id}: screenshot not found: ${name}`);
      continue;
    }
    figures.push(
      figure(image.uri, captionFor(name, i, shots.length), `${id}-${name}`, name)
    );
  }
  if (fm.screenshot_failed === true) {
    out.push(
      `<p class="nb">No screenshot: the capture failed${
        str(fm.screenshot_error) ? ` (${esc(str(fm.screenshot_error))})` : ""
      }.</p>`
    );
  }

  // Recordings are represented by the first frame of each clip. Embedding the
  // full frame sequence would multiply the file size for little added proof.
  const framesDir = str(fm.frames_dir);
  if (framesDir) {
    const clips = list(fm.clips).map(record);
    const entries =
      clips.length > 0
        ? clips.map((c) => ({ id: str(c.id), frames: Number(c.frames) || 0 }))
        : [{ id: "", frames: Number(fm.frames_count) || 0 }];
    for (const clip of entries) {
      const first = await firstFrame(bundle.dir, framesDir, clip.id);
      if (!first) {
        continue;
      }
      const image = await embedImage(bundle.dir, first, options);
      if (image) {
        figures.push(
          figure(
            image.uri,
            `Recording${clip.id ? ` ${clip.id.replace(/-/g, " ")}` : ""}, frame 1 of ${clip.frames}`,
            `${id}-${first}`,
            first
          )
        );
      }
    }
  }

  if (figures.length > 0) {
    out.push(`<div class="shots">${figures.join("")}</div>`);
  }

  // Attachments are listed, never inlined: they are arbitrary files, and the
  // report is a document, not a container.
  const attachments = list(fm.attachments).map(record);
  if (attachments.length > 0) {
    const rows = await Promise.all(
      attachments.map(async (a) => {
        const name = str(a.file);
        const size = Number(a.size) || (await fileSize(bundle.dir, name)) || 0;
        return `<li><code>${esc(str(a.original_name) || name)}</code> <span class="dim">${esc(
          str(a.mime)
        )}, ${formatBytes(size)} — <code>${esc(name)}</code> in the session folder</span></li>`;
      })
    );
    out.push(`<p class="nb">Attachments</p><ul class="attachments">${rows.join("")}</ul>`);
  }

  // Everything a reader wants only when they doubt the text: the full
  // frontmatter, the session's context, and the action trail.
  const rows = metaRows(bundle, fm)
    .map(([label, value, code]) => {
      const cell = code ? `<code>${esc(value)}</code>` : esc(value);
      return `<div class="row"><dt>${esc(label)}</dt><dd>${cell}</dd></div>`;
    })
    .join("");
  const summary =
    trail.length > 0
      ? `Details and action trail (${trail.length} step${trail.length === 1 ? "" : "s"})`
      : "Details";
  out.push(
    '<details class="details">',
    `<summary><span class="chev"></span>${esc(summary)}</summary>`,
    '<div class="details-body">',
    `<dl class="meta-table">${rows}</dl>`,
    trail.length > 0
      ? `<p class="trail-title">Action trail</p>${renderTrail(trail)}`
      : "",
    "</div>",
    "</details>"
  );

  out.push("</section>");
  return out.join("\n");
}

/** Locate the first frame file of a clip, tolerating either layout. */
async function firstFrame(
  dir: string,
  framesDir: string,
  clipId: string
): Promise<string | null> {
  const folder = clipId ? join(framesDir, clipId) : framesDir;
  try {
    const files = (await readdir(join(dir, folder)))
      .filter((f) => f.toLowerCase().endsWith(".png"))
      .sort((a, b) => a.localeCompare(b, "en"));
    return files.length > 0 ? join(folder, files[0]) : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Document                                                            */
/* ------------------------------------------------------------------ */

/** One issue with the session it came from, so a merged file keeps provenance. */
interface Entry {
  bundle: SessionBundle;
  issue: ParsedIssue;
  /** Sort key: when the report was written, never when it was delivered. */
  at: string;
}

/**
 * Order reports by when they were written.
 *
 * Not by filename, and not by delivery time: a session captured on the 18th can
 * be delivered on the 24th (the outbox re-sends on the next load), and sorting
 * by arrival puts the story out of order in a file that reads as an article.
 */
function entriesOf(bundles: SessionBundle[]): Entry[] {
  const entries: Entry[] = [];
  for (const bundle of bundles) {
    for (const issue of bundle.issues) {
      entries.push({
        bundle,
        issue,
        at:
          str(issue.frontmatter.created_at) ||
          `${str(bundle.session.created_at)}#${issue.file}`,
      });
    }
  }
  return entries.sort((a, b) => a.at.localeCompare(b.at, "en"));
}

async function buildOnce(
  bundles: SessionBundle[],
  titles: Map<string, string>,
  options: EmbedOptions
): Promise<{ html: string; warnings: string[] }> {
  const warnings: string[] = [];
  const single = bundles[0];
  const many = bundles.length > 1;
  const entries = entriesOf(bundles);

  const counts = { pass: 0, fail: 0, skip: 0, "not-tested": 0 };
  let checklistItems = 0;
  for (const bundle of bundles) {
    for (const item of list(record(bundle.session.checklist).items).map(record)) {
      counts[verdictOf(item.verdict)]++;
      checklistItems++;
    }
  }

  const checklist = record(single.session.checklist);
  const reporter = record(single.session.reporter);
  const title = many
    ? `${str(single.session.project) || "Feedback"} — feedback report`
    : str(checklist.title) || str(single.session.project) || "Session report";

  // ---- Header -----------------------------------------------------
  // A title, one sentence saying what the reader is holding, and a dim line of
  // provenance. The facts that used to sit in a label grid are the same facts;
  // a sentence is simply what a person reads first without being taught how.
  const urls = [
    ...new Set(bundles.map((b) => str(b.session.base_url)).filter(Boolean)),
  ];
  const on = urls.length > 0 ? ` on ${urls.join(", ")}` : "";
  const plural = (n: number, word: string) =>
    `${n} ${word}${n === 1 ? "" : "s"}`;

  let lede: string;
  /** Provenance parts; `code` renders the value as an identifier. */
  let source: { text: string; code?: boolean }[];
  if (many) {
    const dates = entries.map((e) => e.at).filter(Boolean);
    lede = `${plural(entries.length, "report")} from ${plural(bundles.length, "session")}${on}.`;
    const first = dates.length > 0 ? formatDate(dates[0]) : "";
    const last =
      dates.length > 0 ? formatDate(dates[dates.length - 1]) : "";
    source = first
      ? [{ text: first === last ? first : `${first} – ${last}` }]
      : [];
  } else {
    const what = [
      checklistItems > 0 ? plural(checklistItems, "check") : "",
      entries.length > 0 ? plural(entries.length, "report") : "",
    ].filter(Boolean);
    lede = `${what.join(" and ") || "Session"}${on}.`;
    const kind = str(reporter.kind);
    source = [
      str(single.session.created_at)
        ? formatDate(str(single.session.created_at))
        : "",
      str(reporter.name)
        ? `${str(reporter.name)}${kind ? ` (${kind})` : ""}`
        : "",
      str(checklist.intent),
    ]
      .filter(Boolean)
      .map((text) => ({ text }));
  }

  const head: string[] = ['<header class="page">'];
  head.push(`<h1>${esc(title)}</h1>`);
  head.push(`<p class="lede">${esc(lede)}</p>`);
  if (!many && str(single.session.session_id)) {
    source.push({ text: str(single.session.session_id), code: true });
  }
  if (source.length > 0) {
    head.push(
      `<p class="source">${source
        .map(({ text, code }) =>
          code ? `<code>${esc(text)}</code>` : esc(text)
        )
        .join(" · ")}</p>`
    );
  }
  head.push("</header>");

  // ---- Summary ----------------------------------------------------
  const summary: string[] = ['<section class="summary">'];
  if (checklistItems > 0) {
    const tiles: string[] = [
      `<div class="tile tile-pass"><span class="n">${counts.pass}</span><span class="l">pass</span></div>`,
      `<div class="tile tile-fail"><span class="n">${counts.fail}</span><span class="l">fail</span></div>`,
    ];
    if (counts.skip > 0) {
      tiles.push(
        `<div class="tile tile-skip"><span class="n">${counts.skip}</span><span class="l">skipped</span></div>`
      );
    }
    tiles.push(
      `<div class="tile tile-none"><span class="n">${counts["not-tested"]}</span><span class="l">not tested</span></div>`
    );
    summary.push(`<div class="tiles">${tiles.join("")}</div>`);
  }

  const allFixes = new Map<string, FixInfo>();
  for (const bundle of bundles) {
    for (const [id, fix] of fixesByIssue(bundle)) {
      allFixes.set(`${str(bundle.session.session_id)}/${id}`, fix);
    }
  }
  // How many verdicts carry their own proof. A reader scanning the top of a
  // regression report wants to know the green count is evidenced, not asserted.
  let evidenced = 0;
  for (const bundle of bundles) {
    for (const item of list(record(bundle.session.checklist).items).map(record)) {
      const evidence = record(item.evidence);
      if (list(evidence.screenshots).length > 0) {
        evidenced++;
      }
    }
  }

  // "Report" throughout: the section is Reports, the merged header counts
  // reports, and one document should not call the same thing two names.
  const notes: string[] = [
    `${entries.length} report${entries.length === 1 ? "" : "s"} filed`,
  ];
  if (evidenced > 0) {
    notes.push(`${evidenced} of ${checklistItems} checks proved with a screenshot`);
  }
  if (allFixes.size > 0) {
    const fixed = [...allFixes.values()].filter(
      (f) => f.status === "fixed"
    ).length;
    notes.push(`${fixed} of ${allFixes.size} resolved`);
  }
  summary.push(`<p class="summary-line">${esc(notes.join(" · "))}</p>`);
  summary.push("</section>");

  // ---- Body -------------------------------------------------------
  const checklistHtml: string[] = [];
  for (const bundle of bundles) {
    const html = await renderChecklist(bundle, options, warnings);
    if (!html) {
      continue;
    }
    if (checklistHtml.length === 0) {
      checklistHtml.push(
        '<section class="checklist">',
        '<h2 class="section-title">Checklist</h2>'
      );
    }
    if (many) {
      checklistHtml.push(
        `<p class="session-mark">Session <code>${esc(str(bundle.session.session_id))}</code></p>`
      );
    }
    checklistHtml.push(html);
  }
  if (checklistHtml.length > 0) {
    checklistHtml.push("</section>");
  }

  const issueHtml: string[] = [];
  if (entries.length > 0) {
    issueHtml.push(
      '<section class="issues">',
      '<h2 class="section-title">Reports</h2>'
    );
    for (const entry of entries) {
      const fixes = fixesByIssue(entry.bundle);
      issueHtml.push(
        await renderIssue(entry.bundle, entry.issue, fixes, options, warnings, titles)
      );
    }
    issueHtml.push("</section>");
  } else if (checklistItems > 0) {
    issueHtml.push(
      '<section class="issues"><h2 class="section-title">Reports</h2>' +
        '<p class="nb">None filed.</p></section>'
    );
  }

  const version = str(single.session.format_version) || "1.0";

  const html = [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(title)} — sluglist report</title>`,
    `<style>${REPORT_CSS}</style>`,
    "</head>",
    "<body>",
    '<main class="doc">',
    head.join("\n"),
    summary.join("\n"),
    checklistHtml.join("\n"),
    issueHtml.join("\n"),
    '<footer class="page-foot">',
    `<p>Artifact format ${esc(version)} · generated by <b>sluglist</b></p>`,
    "</footer>",
    "</main>",
    '<div class="lightbox" id="lightbox" hidden>',
    '<button type="button" class="lb-close" id="lb-close" aria-label="Close">×</button>',
    '<button type="button" class="lb-nav lb-nav-prev" id="lb-prev" aria-label="Previous">‹</button>',
    '<button type="button" class="lb-nav lb-nav-next" id="lb-next" aria-label="Next">›</button>',
    '<div class="lb-stage"><img id="lb-img" alt=""></div>',
    '<div class="lb-bar"><span id="lb-caption"></span>' +
      '<span class="lb-file" id="lb-file"></span>' +
      '<span class="lb-count" id="lb-count"></span></div>',
    "</div>",
    `<script>${REPORT_JS}</script>`,
    "</body>",
    "</html>",
    "",
  ].join("\n");

  return { html, warnings };
}

/**
 * Build the report. When the first pass exceeds {@link SIZE_LIMIT}, it is
 * rebuilt once with harsher image settings and the caller is warned — a large
 * report that arrives beats a perfect one that bounces off a mail server.
 */
export async function buildReport(
  input: SessionBundle | SessionBundle[],
  options: BuildReportOptions = {}
): Promise<BuildReportResult> {
  const bundles = Array.isArray(input) ? input : [input];
  if (bundles.length === 0) {
    throw new Error("[sluglist] buildReport: no sessions to render");
  }
  const titles = options.titles ?? new Map<string, string>();
  let { html, warnings } = await buildOnce(bundles, titles, DEFAULT_EMBED);
  let degraded = false;

  if (Buffer.byteLength(html) > SIZE_LIMIT) {
    const first = Buffer.byteLength(html);
    ({ html, warnings } = await buildOnce(bundles, titles, AGGRESSIVE_EMBED));
    degraded = true;
    warnings.push(
      `report exceeded ${formatBytes(SIZE_LIMIT)} (${formatBytes(first)}); ` +
        `rebuilt at ${AGGRESSIVE_EMBED.maxWidth}px / q${AGGRESSIVE_EMBED.quality} → ${formatBytes(
          Buffer.byteLength(html)
        )}`
    );
  }

  return {
    html,
    bytes: Buffer.byteLength(html),
    warnings,
    degraded,
  };
}
