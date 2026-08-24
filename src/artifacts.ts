import { type ActionRecord, renderAction } from "./actions";
import type { ChecklistState } from "./checklist";
import { type ErrorRecord, formatErrorAge } from "./errors";
import type {
  ArtifactFile,
  AttachmentMeta,
  CaptureMode,
  FixesState,
  IssueIndexEntry,
  ReporterMeta,
  SessionState,
} from "./types";
import {
  formatScalar,
  type YamlScalar,
  type YamlValue,
  yamlLine,
  yamlListOfMaps,
  yamlMap,
} from "./yaml";

/**
 * Artifact builder. The output structure and frontmatter are a contract
 * consumed by future parsers; any change must be additive only.
 */

/**
 * A one-level nested map: `key:` then indented sub-entries, or `key: null` when
 * the object is null or has no entries. Used for the additive `reporter` and
 * `custom` blocks.
 */
function yamlBlock(
  key: string,
  obj: ReporterMeta | Record<string, YamlScalar> | null,
  indent = ""
): string {
  const entries = obj
    ? Object.entries(obj).filter(([, v]) => v !== undefined)
    : [];
  if (entries.length === 0) {
    return `${indent}${key}: null`;
  }
  const sub = entries
    .map(([k, v]) => `${indent}  ${k}: ${formatScalar(v as YamlScalar)}`)
    .join("\n");
  return `${indent}${key}:\n${sub}`;
}

/**
 * Artifact format version, `MAJOR.MINOR`. MINOR bumps for additive changes (a
 * new optional field/section); MAJOR only for a breaking one. Written as the
 * first line of every session.yaml; parsers treat a missing field as "1.0"
 * (pre-versioning artifacts). See SPEC.md.
 *
 * 1.1 — additive `checklist` block (acceptance checklist verdicts) +
 *       `checklist_item` issue frontmatter.
 * 1.2 — additive `clips` issue frontmatter (per-clip recording breakdown) and
 *       the `<frames_dir>/<clip-id>/NN.png` frame layout it discriminates.
 * 1.3 — additive `scrubbed` issue frontmatter: whether the text surfaces of the
 *       issue were run through the PII scrub (`privacy.scrubText`).
 * 1.4 — additive issue frontmatter: `screenshot_failed` / `screenshot_error`
 *       (the render failed and the issue was sent without it), `form` (reporter
 *       form fields, `scope: "issue"`) and `attachments` (files the reporter
 *       attached), plus the additive `form` block in session.yaml
 *       (`scope: "session"` answers).
 * 1.5 — additive `reporter.kind` ("human" | "agent"; absent ⇒ human) and the
 *       optional per-session `fixes.yaml` file (fix-agent resolution records;
 *       absent for every session that predates it or was never fixed).
 * 1.6 — additive `checklist.items[].evidence` (`screenshots` + `note`: proof
 *       attached to a verdict, so a `pass` can be verified and not merely
 *       trusted) and additive `checklist.intent` (why the checklist exists:
 *       branch / re-test / smoke / scenario). Both absent unless recorded.
 * 1.7 — additive `checklist.retest_of` in session.yaml: the id of the checklist
 *       this run re-tests, carried through from the checklist config so the
 *       rounds of one fix→re-test cycle chain from session.yaml alone (what
 *       `sluglist status` reads). Absent on a first-pass run.
 * 1.8 — additive `title` in an issue's frontmatter: a heading the author wrote,
 *       so the report stops truncating the first sentence. Absent unless
 *       written; never replaces the comment.
 * 1.9 — a checklist item may carry `evidence` while its `verdict` is still
 *       null: the reason it could not be tested. Nothing about the shape is
 *       new — `evidence` and a null verdict both predate it — but a reader
 *       that assumed evidence implied a verdict needs to know, because "not
 *       tested, and here is why" is now a thing an artifact can say.
 */
export const FORMAT_VERSION = "1.9";

/**
 * The `checklist:` block: definition identity + one entry per item with its
 * verdict (null until acted on). Nested under `checklist` so it stays a single
 * additive top-level key.
 */
function yamlChecklist(checklist: ChecklistState): string {
  let head = `checklist:\n${yamlLine("id", checklist.id, "  ")}\n${yamlLine(
    "title",
    checklist.title,
    "  "
  )}`;
  // Additive (format 1.6): why this checklist exists. Emitted only when the
  // definition declared it, so sessions without it stay byte-identical.
  if (checklist.intent !== undefined) {
    head += `\n${yamlLine("intent", checklist.intent, "  ")}`;
  }
  // Additive (format 1.7): the checklist this run re-tests. Emitted only on a
  // re-test run, so first-pass sessions stay byte-identical.
  if (checklist.retest_of !== undefined) {
    head += `\n${yamlLine("retest_of", checklist.retest_of, "  ")}`;
  }
  if (checklist.items.length === 0) {
    return `${head}\n  items: []`;
  }
  // Rendered item-by-item rather than through `yamlListOfMaps` because the
  // additive `evidence` block is nested — the flat helper cannot express it.
  const items = checklist.items
    .map((item) => {
      let block = yamlListOfMaps(
        [
          [
            ["id", item.id],
            ["section", item.section],
            ["title", item.title],
            ["verdict", item.verdict],
            ["issue", item.issue],
            ["ts", item.ts],
          ],
        ],
        "    "
      );
      // Additive (format 1.6): proof for this verdict. Absent for a bare
      // verdict, so pre-1.6 sessions stay byte-identical.
      if (item.evidence) {
        block += "\n      evidence:";
        block +=
          item.evidence.screenshots.length > 0
            ? `\n${yamlLine("screenshots", item.evidence.screenshots, "        ")}`
            : "\n        screenshots: []";
        if (item.evidence.note !== undefined) {
          block += `\n${yamlLine("note", item.evidence.note, "        ")}`;
        }
      }
      return block;
    })
    .join("\n");
  return `${head}\n  items:\n${items}`;
}

export function buildSessionYaml(state: SessionState): string {
  const headEntries: [string, YamlValue][] = [
    // First line: the format version, so parsers can branch before anything else.
    ["format_version", FORMAT_VERSION],
    ["project", state.project],
    ["session_id", state.session_id],
    ["created_at", state.created_at],
    ["base_url", state.base_url],
    ["browser", state.browser],
    ["os", state.os],
    ["viewport", state.viewport],
    ["device_pixel_ratio", state.device_pixel_ratio],
  ];
  // Additive metadata: appended only when collected, so artifacts written
  // without it (and the byte-exact fixtures) stay unchanged.
  if (state.screen !== undefined) {
    headEntries.push(["screen", state.screen]);
  }
  if (state.language !== undefined) {
    headEntries.push(["language", state.language]);
  }
  if (state.languages !== undefined) {
    headEntries.push(["languages", state.languages]);
  }
  if (state.timezone !== undefined) {
    headEntries.push(["timezone", state.timezone]);
  }
  if (state.color_scheme !== undefined) {
    headEntries.push(["color_scheme", state.color_scheme]);
  }
  if (state.reduced_motion !== undefined) {
    headEntries.push(["reduced_motion", state.reduced_motion]);
  }
  let head = yamlMap(headEntries);
  // Additive: session-level reporter, emitted only when identity is configured
  // (null when configured but empty). Sessions without it stay byte-identical.
  if (state.reporter !== undefined) {
    head += `\n${yamlBlock("reporter", state.reporter)}`;
  }
  // Additive (format 1.4): answers to `scope: "session"` form fields, asked once
  // on the first issue. Absent unless such fields are configured and answered.
  if (state.form !== undefined) {
    head += `\n${yamlBlock("form", state.form)}`;
  }
  // Additive (format 1.1): acceptance checklist with per-item verdicts. Present
  // only when a checklist is configured; sessions without one stay byte-identical.
  if (state.checklist !== undefined) {
    head += `\n${yamlChecklist(state.checklist)}`;
  }

  if (state.issues.length === 0) {
    return `${head}\nissues: []\n`;
  }

  const issues = yamlListOfMaps(
    state.issues.map((issue) => issueEntries(issue))
  );
  return `${head}\nissues:\n${issues}\n`;
}

function issueEntries(issue: IssueIndexEntry): [string, YamlValue][] {
  const entries: [string, YamlValue][] = [
    ["id", issue.id],
    ["file", issue.file],
    ["screenshot", issue.screenshot],
  ];
  if (issue.category !== undefined) {
    entries.push(["category", issue.category]);
  }
  // Additive contract field: emitted only for multi-screenshot issues so
  // single-screenshot sessions stay byte-identical to the original format.
  if (issue.screenshots && issue.screenshots.length > 1) {
    entries.push(["screenshots", issue.screenshots]);
  }
  // Only `screen` is added to the session index (for grouping), and only when
  // present, so sessions without it stay byte-identical.
  if (issue.screen) {
    entries.push(["screen", issue.screen]);
  }
  // Additive: record-mode frame count in the index.
  if (issue.frames !== undefined) {
    entries.push(["frames", issue.frames]);
  }
  entries.push(
    ["url", issue.url],
    ["selector", issue.selector],
    ["created_at", issue.created_at]
  );
  return entries;
}

export interface IssueMarkdownInput {
  /** Action trail, snapshotted at issue time. */
  actions?: ActionRecord[];
  /** Issue time (epoch ms) used to compute each action's relative age. */
  actionsAt?: number;
  /** Total actions in the snapshot; emitted as `actions_count` when defined. */
  actionsCount?: number;
  category?: string;
  /** Checklist item this issue is evidence for; emitted as `checklist_item`. */
  checklistItem?: string | null;
  comment: string;
  /**
   * Additive (1.8): a heading for this report, written by whoever files it.
   * The report uses it instead of truncating the first sentence — but never
   * *instead of* the comment, which is always shown verbatim underneath.
   */
  title?: string;
  /** Nearest named React component of the captured element; null when unknown. */
  component?: string | null;
  /** Runtime host context (sluglist.setContext); `context:` block (null empty). */
  context?: Record<string, YamlScalar> | null;
  createdAt: string;
  /** Record mode: emitted as `recording`/`frames_count`/`frames_dir`. */
  recording?: boolean;
  framesCount?: number;
  framesDir?: string;
  /**
   * Record mode: one entry per clip (a Record→Stop cycle), in order — emitted as
   * an additive `clips:` block. Frames live under `<framesDir>/<clip.id>/NN.png`.
   * Present for every recording (a single recording is one `clip-01`); a reader
   * that only knows the flat `frames_count` form still works.
   */
  clips?: { id: string; frames: number }[];
  /** Captured page errors, snapshotted at issue time. */
  errors?: ErrorRecord[];
  /** Issue time (epoch ms) used to compute each error's relative age. */
  errorsAt?: number;
  /** Total errors in the snapshot; emitted as `errors_count` when defined. */
  errorsCount?: number;
  /** Flat project fields; emitted as a `custom:` block (null when empty). */
  custom?: Record<string, YamlScalar> | null;
  domPath?: string | null;
  elementText?: string | null;
  id: string;
  /** Whether masking was applied to the screenshot(s); emitted when defined. */
  masked?: boolean;
  /**
   * A screenshot was attempted and the render failed; the issue was delivered
   * without it. Emitted as `screenshot_failed` (format 1.4).
   */
  screenshotFailed?: boolean;
  /** Renderer message for the failure above; emitted as `screenshot_error`. */
  screenshotError?: string | null;
  /**
   * Reporter form answers with `scope: "issue"`; emitted as a `form:` block
   * (format 1.4). Session-scoped answers live in session.yaml instead.
   */
  form?: Record<string, YamlScalar> | null;
  /**
   * Files the reporter attached to this issue, in order; emitted as an
   * `attachments:` list (format 1.4). Each file sits next to the issue as
   * `<id>-<slug>-att-NN.<ext>`.
   */
  attachments?: AttachmentMeta[];
  /**
   * Whether the text surfaces of this issue were run through the PII scrub;
   * emitted only when `privacy.scrubText` was set explicitly (or by the
   * production preset), so artifacts written without it stay byte-identical.
   */
  scrubbed?: boolean;
  mode: CaptureMode;
  /** Reporter identity mirrored into the issue; `reporter:` block (null empty). */
  reporter?: ReporterMeta | null;
  screen?: string | null;
  screenshot: string | null;
  /** All screenshot file names; emitted only when there is more than one. */
  screenshots?: string[];
  selector: string | null;
  selectorStrategy?: string | null;
  selectorUnique?: boolean | null;
  url: string;
  viewport: string;
}

export function buildIssueMarkdown(input: IssueMarkdownInput): string {
  const lines = [
    yamlLine("id", input.id),
    yamlLine("url", input.url),
    yamlLine("selector", input.selector),
  ];
  // Selector detail and element metadata: emitted whenever provided (the UI
  // passes them for every mode, null for non-element), so unit fixtures that
  // omit them stay byte-identical.
  if (input.selectorStrategy !== undefined) {
    lines.push(yamlLine("selector_strategy", input.selectorStrategy));
  }
  if (input.selectorUnique !== undefined) {
    lines.push(yamlLine("selector_unique", input.selectorUnique));
  }
  lines.push(yamlLine("mode", input.mode));
  if (input.category !== undefined) {
    lines.push(yamlLine("category", input.category));
  }
  // Additive (1.8): emitted only when written, so sessions without it are
  // byte-identical to a 1.7 one.
  if (input.title !== undefined && input.title !== "") {
    lines.push(yamlLine("title", input.title));
  }
  // Additive: the checklist item this issue provides fail-evidence for.
  if (input.checklistItem !== undefined) {
    lines.push(yamlLine("checklist_item", input.checklistItem));
  }
  if (input.elementText !== undefined) {
    lines.push(yamlLine("element_text", input.elementText));
  }
  if (input.domPath !== undefined) {
    lines.push(yamlLine("dom_path", input.domPath));
  }
  // Additive: nearest named React component (element mode); null when unknown.
  if (input.component !== undefined) {
    lines.push(yamlLine("component", input.component));
  }
  if (input.screen !== undefined) {
    lines.push(yamlLine("screen", input.screen));
  }
  lines.push(
    yamlLine("viewport", input.viewport),
    yamlLine("screenshot", input.screenshot)
  );
  if (input.screenshots && input.screenshots.length > 1) {
    lines.push(yamlLine("screenshots", input.screenshots));
  }
  // Additive: emitted only when privacy is configured (masking attempted).
  if (input.masked !== undefined) {
    lines.push(yamlLine("masked", input.masked));
  }
  // Additive (format 1.4): the screenshot render failed and the issue was sent
  // without it. Only ever emitted on the failure path, so successful captures
  // stay byte-identical.
  if (input.screenshotFailed) {
    lines.push(yamlLine("screenshot_failed", true));
    if (input.screenshotError !== undefined) {
      lines.push(yamlLine("screenshot_error", input.screenshotError));
    }
  }
  // Additive (format 1.3): emitted only when scrubText was set explicitly, so
  // dev and default-beta artifacts stay byte-identical.
  if (input.scrubbed !== undefined) {
    lines.push(yamlLine("scrubbed", input.scrubbed));
  }
  // Additive: emitted only when error capture is engaged (0 when off/none).
  if (input.errorsCount !== undefined) {
    lines.push(yamlLine("errors_count", input.errorsCount));
  }
  // Additive: emitted only when the action trail is engaged (0 when off/none).
  if (input.actionsCount !== undefined) {
    lines.push(yamlLine("actions_count", input.actionsCount));
  }
  // Additive: record-mode fields, only for recordings.
  if (input.recording) {
    lines.push(yamlLine("recording", true));
    if (input.framesCount !== undefined) {
      lines.push(yamlLine("frames_count", input.framesCount));
    }
    if (input.framesDir !== undefined) {
      lines.push(yamlLine("frames_dir", input.framesDir));
    }
    // Additive: per-clip breakdown (each Record→Stop is one clip). Frames of
    // clip `id` live under `<frames_dir>/<id>/NN.png`.
    if (input.clips && input.clips.length > 0) {
      const clips = yamlListOfMaps(
        input.clips.map((c) => [
          ["id", c.id],
          ["frames", c.frames],
        ]),
        "  "
      );
      lines.push(`clips:\n${clips}`);
    }
  }
  lines.push(yamlLine("created_at", input.createdAt));
  // Additive reporter / custom blocks: emitted only when provided (identity or
  // custom configured), so fixtures that omit them stay byte-identical.
  if (input.reporter !== undefined) {
    lines.push(yamlBlock("reporter", input.reporter));
  }
  if (input.custom !== undefined) {
    lines.push(yamlBlock("custom", input.custom));
  }
  // Additive: runtime host context (sluglist.setContext); block, null when empty.
  if (input.context !== undefined) {
    lines.push(yamlBlock("context", input.context));
  }
  // Additive (format 1.4): reporter-entered fields with `scope: "issue"`.
  if (input.form !== undefined) {
    lines.push(yamlBlock("form", input.form));
  }
  // Additive (format 1.4): files the reporter attached, one map per file.
  if (input.attachments && input.attachments.length > 0) {
    const attachments = yamlListOfMaps(
      input.attachments.map((a) => [
        ["file", a.file],
        ["mime", a.mime],
        ["size", a.size],
        ["original_name", a.original_name],
      ]),
      "  "
    );
    lines.push(`attachments:\n${attachments}`);
  }
  const frontmatter = lines.join("\n");

  let body = input.comment.trim();

  if (input.errors && input.errors.length > 0) {
    const at = input.errorsAt ?? input.errors.at(-1)?.ts ?? 0;
    const items = input.errors
      .map((err) => {
        const age = formatErrorAge(at - err.ts);
        let line = `- [${age} before report] ${err.source}: ${err.message}`;
        if (err.stack) {
          const indented = err.stack
            .split("\n")
            .map((l) => `    ${l}`)
            .join("\n");
          line += `\n${indented}`;
        }
        return line;
      })
      .join("\n");
    body += `\n\n## Errors\n${items}`;
  }

  // `## Actions` comes after `## Errors` (spec order).
  if (input.actions && input.actions.length > 0) {
    const at = input.actionsAt ?? input.actions.at(-1)?.ts ?? 0;
    const items = input.actions
      .map(
        (action) =>
          `- [${formatErrorAge(at - action.ts)} before report] ${renderAction(action)}`
      )
      .join("\n");
    body += `\n\n## Actions\n${items}`;
  }

  return `---\n${frontmatter}\n---\n\n${body}\n`;
}

/**
 * Build `fixes.yaml` (format 1.5): the machine-readable resolution record a
 * fix agent writes next to session.yaml. One entry per handled issue, upserted
 * by issue id as fixing progresses. A session without the file is valid — it
 * just has not been through a fix pass.
 */
export function buildFixesYaml(state: FixesState): string {
  let head = yamlLine("format_version", FORMAT_VERSION);
  if (state.fixed_by !== undefined) {
    head += `\n${yamlBlock("fixed_by", state.fixed_by)}`;
  }
  if (state.items.length === 0) {
    return `${head}\nitems: []\n`;
  }
  const items = yamlListOfMaps(
    state.items.map((item) => {
      const entries: [string, YamlValue][] = [
        ["issue", item.issue],
        ["status", item.status],
      ];
      if (item.commit !== undefined) {
        entries.push(["commit", item.commit]);
      }
      if (item.note !== undefined) {
        entries.push(["note", item.note]);
      }
      if (item.checklist_item !== undefined) {
        entries.push(["checklist_item", item.checklist_item]);
      }
      entries.push(["ts", item.ts]);
      return entries;
    })
  );
  return `${head}\nitems:\n${items}\n`;
}

export function fixesYamlFile(state: FixesState): ArtifactFile {
  return {
    path: "fixes.yaml",
    blob: new Blob([buildFixesYaml(state)], { type: "text/yaml" }),
    mime: "text/yaml",
  };
}

export function sessionYamlFile(state: SessionState): ArtifactFile {
  return {
    path: "session.yaml",
    blob: new Blob([buildSessionYaml(state)], { type: "text/yaml" }),
    mime: "text/yaml",
  };
}

export function issueMarkdownFile(
  path: string,
  input: IssueMarkdownInput
): ArtifactFile {
  return {
    path,
    blob: new Blob([buildIssueMarkdown(input)], { type: "text/markdown" }),
    mime: "text/markdown",
  };
}

export function screenshotFile(path: string, blob: Blob): ArtifactFile {
  return { path, blob, mime: "image/png" };
}

/**
 * A file the reporter attached. Unlike the three mime types the core produces
 * itself, the mime here comes from the picked file — already validated against
 * the attachment whitelist before it reaches this point.
 */
export function attachmentFile(
  path: string,
  blob: Blob,
  mime: string
): ArtifactFile {
  return { path, blob, mime };
}
