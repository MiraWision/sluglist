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

/** One figure: a thumbnail that opens the full image in the lightbox. */
function figure(uri: string, caption: string, id: string): string {
  return [
    '<figure class="shot">',
    `<button type="button" class="shot-open" data-full="${id}" aria-label="Enlarge: ${esc(caption)}">`,
    `<img src="${uri}" alt="${esc(caption)}" loading="lazy">`,
    "</button>",
    caption ? `<figcaption>${esc(caption)}</figcaption>` : "",
    "</figure>",
  ].join("");
}

async function renderEvidence(
  bundle: SessionBundle,
  evidence: Record<string, YamlNode>,
  options: EmbedOptions,
  warnings: string[]
): Promise<string> {
  const shots = list(evidence.screenshots).map(str).filter(Boolean);
  const note = str(evidence.note);
  const parts: string[] = [];
  if (note) {
    parts.push(`<p class="observed"><span class="observed-label">Observed</span> ${esc(note)}</p>`);
  }
  const figures: string[] = [];
  for (const name of shots) {
    const image = await embedImage(bundle.dir, name, options);
    if (!image) {
      warnings.push(`evidence image not found: ${name}`);
      continue;
    }
    figures.push(figure(image.uri, name, name));
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

  const out: string[] = ['<section class="checklist">', "<h2>Checklist</h2>"];
  for (const section of sections) {
    if (section.title) {
      out.push(`<h3>${esc(section.title)}</h3>`);
    }
    out.push('<ol class="items">');
    for (const item of section.items) {
      const verdict = verdictOf(item.verdict);
      const issue = str(item.issue);
      out.push(`<li class="item item-${verdict}">`);
      out.push(
        `<div class="item-head"><span class="badge badge-${verdict}">${VERDICT_LABEL[verdict]}</span>` +
          `<span class="item-title">${esc(str(item.title))}</span></div>`
      );
      if (issue) {
        out.push(
          `<p class="linked">Evidence: <a href="#issue-${esc(issue)}">issue ${esc(issue)}</a></p>`
        );
      }
      const evidence = record(item.evidence);
      if (Object.keys(evidence).length > 0) {
        out.push(await renderEvidence(bundle, evidence, options, warnings));
      }
      out.push("</li>");
    }
    out.push("</ol>");
  }
  out.push("</section>");
  return out.join("\n");
}

async function renderIssue(
  bundle: SessionBundle,
  issue: ParsedIssue,
  fixes: Map<string, FixInfo>,
  options: EmbedOptions,
  warnings: string[]
): Promise<string> {
  const fm = issue.frontmatter;
  const id = str(fm.id) || issue.file.split("-")[0];
  const out: string[] = [`<article class="issue" id="issue-${esc(id)}">`];

  const title = issue.body.split("\n")[0]?.trim() || `Issue ${id}`;
  out.push(
    `<h3><span class="issue-id">${esc(id)}</span> ${esc(truncate(title, 120))}</h3>`
  );

  // Metadata line: only the fields that carry meaning for a reader.
  const meta: string[] = [];
  if (str(fm.url)) {
    meta.push(`<span><b>URL</b> ${esc(str(fm.url))}</span>`);
  }
  if (str(fm.category)) {
    meta.push(`<span><b>Category</b> ${esc(str(fm.category))}</span>`);
  }
  if (str(fm.selector)) {
    meta.push(`<span><b>Selector</b> <code>${esc(str(fm.selector))}</code></span>`);
  }
  if (str(fm.viewport)) {
    meta.push(`<span><b>Viewport</b> ${esc(str(fm.viewport))}</span>`);
  }
  if (str(fm.checklist_item)) {
    meta.push(`<span><b>Checklist item</b> ${esc(str(fm.checklist_item))}</span>`);
  }
  if (str(fm.created_at)) {
    meta.push(`<span><b>Reported</b> ${esc(formatDate(str(fm.created_at)))}</span>`);
  }
  if (meta.length > 0) {
    out.push(`<div class="meta">${meta.join("")}</div>`);
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

  // The body's first line became the heading; keep the rest.
  const rest = issue.body.split("\n").slice(1).join("\n");
  out.push(renderBody(rest));

  // Screenshots: `screenshots` when present, else the single `screenshot`.
  const shots = list(fm.screenshots).map(str).filter(Boolean);
  if (shots.length === 0 && str(fm.screenshot)) {
    shots.push(str(fm.screenshot));
  }
  const figures: string[] = [];
  for (const name of shots) {
    const image = await embedImage(bundle.dir, name, options);
    if (!image) {
      warnings.push(`issue ${id}: screenshot not found: ${name}`);
      continue;
    }
    figures.push(figure(image.uri, name, `${id}-${name}`));
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
            `Recording${clip.id ? ` ${clip.id}` : ""} — first of ${clip.frames} frames (${framesDir}${clip.id ? `/${clip.id}` : ""})`,
            `${id}-${first}`
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

  out.push("</article>");
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

async function buildOnce(
  bundle: SessionBundle,
  options: EmbedOptions
): Promise<{ html: string; warnings: string[] }> {
  const warnings: string[] = [];
  const session = bundle.session;
  const checklist = record(session.checklist);
  const reporter = record(session.reporter);
  const fixes = fixesByIssue(bundle);

  const items = list(checklist.items).map(record);
  const counts = { pass: 0, fail: 0, skip: 0, "not-tested": 0 };
  for (const item of items) {
    counts[verdictOf(item.verdict)]++;
  }

  const title = str(checklist.title) || str(session.project) || "Session report";

  // ---- Header -----------------------------------------------------
  const head: string[] = ['<header class="page-head">'];
  head.push(`<h1>${esc(title)}</h1>`);
  const facts: string[] = [];
  if (str(session.created_at)) {
    facts.push(`<span><b>Date</b> ${esc(formatDate(str(session.created_at)))}</span>`);
  }
  if (str(session.base_url)) {
    facts.push(`<span><b>Application</b> ${esc(str(session.base_url))}</span>`);
  }
  if (str(reporter.name)) {
    const kind = str(reporter.kind);
    facts.push(
      `<span><b>Reporter</b> ${esc(str(reporter.name))}${kind ? ` <span class="dim">(${esc(kind)})</span>` : ""}</span>`
    );
  }
  if (str(checklist.intent)) {
    facts.push(`<span><b>Intent</b> ${esc(str(checklist.intent))}</span>`);
  }
  facts.push(`<span><b>Session</b> <code>${esc(str(session.session_id))}</code></span>`);
  head.push(`<div class="meta">${facts.join("")}</div>`);
  head.push("</header>");

  // ---- Summary ----------------------------------------------------
  const summary: string[] = ['<section class="summary">'];
  if (items.length > 0) {
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

  const notes: string[] = [];
  notes.push(
    `${bundle.issues.length} issue${bundle.issues.length === 1 ? "" : "s"} filed`
  );
  if (fixes.size > 0) {
    const fixed = [...fixes.values()].filter((f) => f.status === "fixed").length;
    notes.push(`${fixed} of ${fixes.size} resolved`);
  }
  summary.push(`<p class="summary-line">${esc(notes.join(" · "))}</p>`);
  summary.push("</section>");

  // ---- Body -------------------------------------------------------
  const checklistHtml = await renderChecklist(bundle, options, warnings);

  const issueHtml: string[] = [];
  if (bundle.issues.length > 0) {
    issueHtml.push('<section class="issues">', "<h2>Issues</h2>");
    for (const issue of bundle.issues) {
      issueHtml.push(await renderIssue(bundle, issue, fixes, options, warnings));
    }
    issueHtml.push("</section>");
  } else if (items.length > 0) {
    issueHtml.push('<section class="issues"><h2>Issues</h2><p class="nb">None filed.</p></section>');
  }

  const version = str(session.format_version) || "1.0";

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
    checklistHtml,
    issueHtml.join("\n"),
    '<footer class="page-foot">',
    `<p>Artifact format ${esc(version)} · generated by <b>sluglist</b></p>`,
    "</footer>",
    "</main>",
    '<dialog id="lightbox"><button type="button" id="lightbox-close" aria-label="Close">×</button><img id="lightbox-img" alt=""></dialog>',
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
  bundle: SessionBundle
): Promise<BuildReportResult> {
  let { html, warnings } = await buildOnce(bundle, DEFAULT_EMBED);
  let degraded = false;

  if (Buffer.byteLength(html) > SIZE_LIMIT) {
    const first = Buffer.byteLength(html);
    ({ html, warnings } = await buildOnce(bundle, AGGRESSIVE_EMBED));
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
