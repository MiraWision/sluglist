import { readFile } from "node:fs/promises";
import {
  attachmentFile,
  fixesYamlFile,
  issueMarkdownFile,
  screenshotFile,
  sessionYamlFile,
} from "../artifacts";
import { attachmentPath, extensionOf } from "../attachments";
import {
  type Checklist,
  type ChecklistDef,
  type ChecklistState,
  MAX_EVIDENCE_NOTE,
  normalizeChecklist,
  seedChecklistState,
  type Verdict,
} from "../checklist";
import { deliver } from "../deliver";
import { isoTimestamp } from "../metadata";
import { normalizeCustom, normalizeIdentity } from "../reporter";
import { scrub, scrubMaybe } from "../scrub";
import { createMemoryStorage, SessionManager } from "../session";
import { slugFromComment } from "../slug";
import type {
  ArtifactFile,
  AttachmentMeta,
  CaptureMode,
  DeliveryReport,
  FeedbackConnector,
  FeedbackCustom,
  FeedbackIdentity,
  FixesState,
  FixRecord,
  FixStatus,
  IssueIndexEntry,
  SessionMeta,
  SessionState,
} from "../types";

/**
 * Headless writer: the widget's artifact semantics for a Node process (a QA or
 * fix agent driving a browser itself). Same builders, same put-per-issue /
 * put-per-verdict delivery, same format_version — the artifacts are
 * indistinguishable from widget output except for `reporter.kind`.
 *
 * Documented simplification vs the browser path: there is NO offline outbox
 * (IndexedDB) in Node — a delivery that exhausts its retries is reported in the
 * returned {@link DeliveryReport} and not persisted for a later retry. An agent
 * inspects `report.ok` and re-runs; a browser reporter cannot, hence the outbox
 * there.
 */

/** Binary payload accepted anywhere the browser path takes a Blob. */
export type BinaryInput = Blob | Uint8Array | ArrayBuffer;

export interface NodeAttachmentInput {
  data: BinaryInput;
  /** Original file name, e.g. "console-export.txt" (extension is reused). */
  name: string;
  mime: string;
}

export interface ReportIssueMeta {
  /** Page path the issue was observed on, e.g. "/reports?tab=export". */
  url?: string;
  /** CSS selector of the offending element, when known. */
  selector?: string;
  /** Viewport the agent's browser ran at, e.g. "1280x800". */
  viewport?: string;
  /** Capture mode recorded in frontmatter. Default "fullpage". */
  mode?: CaptureMode;
}

export interface ReportIssueInput {
  comment: string;
  /**
   * Heading for this report (format 1.8). Five to eight words describing what
   * was seen, not what to do about it. It never replaces the comment: the
   * report shows the original text verbatim underneath, so a title that drifts
   * from what the reporter meant can be checked against the source.
   */
  title?: string;
  /** PNG screenshot bytes (the agent captures its own browser). */
  screenshot?: BinaryInput | null;
  /** Additional screenshots for the same issue. */
  screenshots?: BinaryInput[];
  /** Triage category, e.g. "bug" | "design" | "idea". */
  category?: string;
  /** Checklist item this issue is fail-evidence for. */
  checklistItem?: string | null;
  meta?: ReportIssueMeta;
  attachments?: NodeAttachmentInput[];
  /** Free-form answers, written as the issue's `form` block (never scrubbed). */
  form?: Record<string, string | number | boolean>;
}

export interface ReportedIssue {
  /** Zero-padded issue id within the session, e.g. "01". */
  id: string;
  /** Markdown file name, e.g. "01-export-button-missing.md". */
  file: string;
  /** First screenshot file name, or null. */
  screenshot: string | null;
  sessionId: string;
  files: ArtifactFile[];
  /** Per-connector delivery outcome (same retry rules as the widget). */
  report: DeliveryReport;
}

/**
 * Proof attached to a verdict (format 1.6). Valid for any verdict: on `pass` it
 * is the whole point (a verifiable pass rather than a self-report); on `fail`
 * it is supplementary to the linked issue, which remains the primary evidence.
 *
 * A screenshot proves "the screen looked like this", not "the action worked" —
 * for a check whose result is invisible on screen, `note` must carry the
 * observed fact (downloaded file name and size, toast text, changed counter).
 */
export interface VerdictEvidenceInput {
  /** PNG bytes, or a path to an image file to read and attach. */
  screenshots?: (BinaryInput | string)[];
  /** One line of observed fact; clipped to 500 chars. */
  note?: string;
}

export interface ReportFixInput {
  /** Issue id being resolved, e.g. "01". */
  issue: string;
  status: FixStatus;
  /** Commit hash of the fix. */
  commit?: string;
  /** One-line note on what was done (or what info is missing). */
  note?: string;
  /**
   * Checklist item the issue was linked to. When omitted, looked up from this
   * session's own verdict links (adopted sessions have none to look in).
   */
  checklistItem?: string;
}

export interface CreateSessionOptions {
  connectors: FeedbackConnector[];
  /**
   * Project slug (storage folder name). Default "app" — same fallback the
   * widget uses when it cannot derive one.
   */
  project?: string;
  /**
   * Acceptance checklist: an inline object, an http(s) URL (GET → JSON), or a
   * local file path. Invalid/unreachable input warns and is skipped, exactly
   * like the widget — writing issues must never be blocked by it.
   */
  checklist?: Checklist | string;
  /** Who this writer reports as; `kind: "agent"` for automated reporters. */
  reporter?: FeedbackIdentity;
  /** Flat project fields attached to every issue (same rules as the widget). */
  custom?: FeedbackCustom;
  /** Origin of the app under test, recorded as session `base_url`. */
  baseUrl?: string;
  /** Session-level viewport, e.g. "1280x800". Issues may override per-report. */
  viewport?: string;
  /** Run the PII scrub over page-derived text (url, selector). Default false. */
  scrub?: boolean;
  /**
   * Attach to an EXISTING session folder instead of creating one. Connectors
   * are put-only, so the writer cannot read that session's state back — an
   * adopted session supports {@link WriterSession.reportFix} only.
   */
  sessionId?: string;
}

export interface WriterSession {
  /** The session folder id, e.g. "session-2026-08-09-x1x1". */
  readonly sessionId: string;
  /** Capture one issue: screenshots + attachments + md + session.yaml upsert. */
  reportIssue(input: ReportIssueInput): Promise<ReportedIssue>;
  /**
   * Record a checklist verdict and upsert session.yaml (put-per-verdict). A
   * `fail` should carry its evidencing issue id.
   */
  setVerdict(
    itemId: string,
    verdict: Verdict,
    opts?: { issue?: string | null; evidence?: VerdictEvidenceInput }
  ): Promise<DeliveryReport>;
  /** Upsert one resolution record into fixes.yaml (put-per-fix). */
  reportFix(input: ReportFixInput): Promise<DeliveryReport>;
  /** Current session state (null before the first write of a fresh session). */
  getSession(): SessionState | null;
  /** The validated checklist, or null when none is configured. */
  getChecklist(): ChecklistDef | null;
  /** Fix records written so far through this writer. */
  getFixes(): FixRecord[];
}

function toBlob(data: BinaryInput | Uint8Array, type: string): Blob {
  if (data instanceof Blob) {
    return data;
  }
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  // Copy into a fresh buffer so a Buffer view's byteOffset cannot leak
  // neighbouring pool bytes into the Blob.
  return new Blob([bytes.slice()], { type });
}

function nodeOs(): string {
  switch (process.platform) {
    case "darwin":
      return "macOS";
    case "win32":
      return "Windows";
    case "linux":
      return "Linux";
    default:
      return process.platform;
  }
}

/** Load a checklist from an http(s) URL or a local file path. */
async function loadChecklist(source: string): Promise<ChecklistDef | null> {
  try {
    let raw: unknown;
    if (/^https?:\/\//.test(source)) {
      const res = await fetch(source, {
        headers: { accept: "application/json" },
      });
      if (!res.ok) {
        console.warn(
          `[sluglist] checklist: GET ${source} → ${res.status}; checklist skipped`
        );
        return null;
      }
      raw = await res.json();
    } else {
      raw = JSON.parse(await readFile(source, "utf8"));
    }
    return normalizeChecklist(raw);
  } catch (error) {
    console.warn(
      `[sluglist] checklist: could not load ${source} (${String(error)}); checklist skipped`
    );
    return null;
  }
}

export async function createSession(
  options: CreateSessionOptions
): Promise<WriterSession> {
  if (!Array.isArray(options.connectors) || options.connectors.length === 0) {
    throw new Error("[sluglist] createSession: at least one connector required");
  }
  const project = options.project ?? "app";
  const adoptedId = options.sessionId;
  const reporter = normalizeIdentity(options.reporter);
  const custom = normalizeCustom(options.custom);
  const scrubbing = options.scrub === true;
  const scrubbedFlag = options.scrub === undefined ? undefined : options.scrub;
  const text = (value: string): string => (scrubbing ? scrub(value) : value);

  let checklistDef: ChecklistDef | null = null;
  if (typeof options.checklist === "string") {
    checklistDef = await loadChecklist(options.checklist);
  } else if (options.checklist !== undefined) {
    checklistDef = normalizeChecklist(options.checklist);
  }

  const sessions = new SessionManager({
    project,
    storage: createMemoryStorage(),
  });

  function makeMeta(): Omit<SessionMeta, "session_id" | "created_at"> {
    return {
      project,
      base_url: options.baseUrl ?? "",
      browser: `Node ${process.versions.node}`,
      os: nodeOs(),
      viewport: options.viewport ?? "",
      device_pixel_ratio: 1,
      ...(reporter !== undefined ? { reporter } : {}),
    };
  }

  function ensureSession(): SessionState {
    const state = sessions.ensure(makeMeta);
    if (checklistDef && state.checklist?.id !== checklistDef.id) {
      state.checklist = seedChecklistState(checklistDef);
      sessions.write(state);
    }
    return state;
  }

  // Deliveries are chained so batches never interleave (a slow session.yaml
  // put must not overwrite a newer one) — same rule as the widget.
  let deliveryQueue: Promise<unknown> = Promise.resolve();
  function enqueue(
    sessionId: string,
    files: ArtifactFile[]
  ): Promise<DeliveryReport> {
    const delivered = deliveryQueue.then(() =>
      deliver(options.connectors, sessionId, files)
    );
    deliveryQueue = delivered;
    return delivered;
  }

  const fixes: FixRecord[] = [];
  function fixesState(): FixesState {
    return {
      ...(reporter !== undefined ? { fixed_by: reporter } : {}),
      items: fixes,
    };
  }

  function assertOwned(method: string): void {
    if (adoptedId) {
      throw new Error(
        `[sluglist] ${method} is unavailable on an adopted session: connectors are put-only, so the writer cannot read ${adoptedId}'s existing session.yaml and would overwrite it. Adopted sessions support reportFix only.`
      );
    }
  }

  return {
    get sessionId() {
      return adoptedId ?? ensureSession().session_id;
    },
    getSession: () => sessions.read(),
    getChecklist: () => checklistDef,
    getFixes: () => [...fixes],

    async reportIssue(input) {
      assertOwned("reportIssue");
      const comment = input.comment?.trim();
      if (!comment) {
        throw new Error("[sluglist] reportIssue: comment is required");
      }
      const state = ensureSession();
      const id = sessions.nextIssueId(state);
      const slug = slugFromComment(comment);
      const mdPath = `${id}-${slug}.md`;
      const mode = input.meta?.mode ?? "fullpage";
      const issueUrl = text(input.meta?.url ?? "");
      const selector = input.meta?.selector ?? null;
      const scrubbedSelector = scrubbing ? scrubMaybe(selector) : selector;
      const viewport = input.meta?.viewport ?? options.viewport ?? "";

      const shots: Blob[] = [];
      if (input.screenshot) {
        shots.push(toBlob(input.screenshot, "image/png"));
      }
      for (const extra of input.screenshots ?? []) {
        shots.push(toBlob(extra, "image/png"));
      }
      const pngPaths = shots.map((_, i) =>
        i === 0 ? `${id}-${slug}.png` : `${id}-${slug}-${i + 1}.png`
      );

      const attachmentInputs = input.attachments ?? [];
      const attachmentsMeta: AttachmentMeta[] = [];
      const attachmentBlobs: Blob[] = [];
      attachmentInputs.forEach((file, i) => {
        const blob = toBlob(file.data, file.mime);
        attachmentBlobs.push(blob);
        attachmentsMeta.push({
          file: attachmentPath(id, slug, i, extensionOf(file.name) || "bin"),
          mime: file.mime,
          size: blob.size,
          original_name: file.name,
        });
      });

      const createdAt = isoTimestamp(new Date());
      const entry: IssueIndexEntry = {
        id,
        file: mdPath,
        screenshot: pngPaths[0] ?? null,
        ...(pngPaths.length > 1 ? { screenshots: pngPaths } : {}),
        ...(input.category ? { category: input.category } : {}),
        url: issueUrl,
        selector: scrubbedSelector,
        created_at: createdAt,
      };
      state.issues.push(entry);
      sessions.write(state);

      const files: ArtifactFile[] = shots.map((shot, i) =>
        screenshotFile(pngPaths[i], shot)
      );
      attachmentBlobs.forEach((blob, i) => {
        files.push(attachmentFile(attachmentsMeta[i].file, blob, attachmentsMeta[i].mime));
      });
      files.push(
        issueMarkdownFile(mdPath, {
          id,
          url: issueUrl,
          selector: scrubbedSelector,
          mode,
          viewport,
          screenshot: pngPaths[0] ?? null,
          ...(pngPaths.length > 1 ? { screenshots: pngPaths } : {}),
          ...(input.category ? { category: input.category } : {}),
          ...(input.title ? { title: input.title } : {}),
          ...(input.checklistItem !== undefined
            ? { checklistItem: input.checklistItem }
            : {}),
          ...(scrubbedFlag !== undefined ? { scrubbed: scrubbedFlag } : {}),
          ...(input.form !== undefined ? { form: input.form } : {}),
          ...(attachmentsMeta.length > 0
            ? { attachments: attachmentsMeta }
            : {}),
          ...(reporter !== undefined ? { reporter } : {}),
          ...(custom !== undefined ? { custom } : {}),
          createdAt,
          comment,
        })
      );
      // session.yaml is upserted with every issue, last in the batch so the
      // index never references a missing file.
      files.push(sessionYamlFile(state));

      const report = await enqueue(state.session_id, files);
      return {
        id,
        file: mdPath,
        screenshot: pngPaths[0] ?? null,
        sessionId: state.session_id,
        files,
        report,
      };
    },

    async setVerdict(itemId, verdict, opts = {}) {
      assertOwned("setVerdict");
      if (!checklistDef) {
        throw new Error(
          "[sluglist] setVerdict called with no checklist configured"
        );
      }
      const state = ensureSession();
      const item = state.checklist?.items.find((i) => i.id === itemId);
      if (!item) {
        throw new Error(`[sluglist] unknown checklist item "${itemId}"`);
      }
      item.verdict = verdict;
      // A fail carries its evidencing issue; pass/skip drop any prior link —
      // same rule as the widget.
      item.issue = verdict === "fail" ? (opts.issue ?? item.issue) : null;
      item.ts = isoTimestamp(new Date());

      // Additive (format 1.6): optional proof for this verdict. Files land
      // next to session.yaml as `ev-<itemId>-NN.png`, following the same
      // numbering discipline as issue screenshots.
      const files: ArtifactFile[] = [];
      const evidence = opts.evidence;
      if (evidence && (evidence.screenshots?.length || evidence.note)) {
        const shots: Blob[] = [];
        for (const shot of evidence.screenshots ?? []) {
          shots.push(
            typeof shot === "string"
              ? toBlob(await readFile(shot), "image/png")
              : toBlob(shot, "image/png")
          );
        }
        const paths = shots.map(
          (_, i) => `ev-${itemId}-${String(i + 1).padStart(2, "0")}.png`
        );
        for (const [i, shot] of shots.entries()) {
          files.push(screenshotFile(paths[i], shot));
        }
        const note = evidence.note?.trim();
        item.evidence = {
          screenshots: paths,
          // The note is page-derived text, so it follows the session's scrub
          // setting like every other observed string.
          ...(note
            ? { note: text(note).slice(0, MAX_EVIDENCE_NOTE) }
            : {}),
        };
      }
      sessions.write(state);
      // session.yaml last, so the index never references a missing file.
      files.push(sessionYamlFile(state));
      return enqueue(state.session_id, files);
    },

    async reportFix(input) {
      if (!input.issue || typeof input.issue !== "string") {
        throw new Error("[sluglist] reportFix: issue id is required");
      }
      const checklistItem =
        input.checklistItem ??
        sessions
          .read()
          ?.checklist?.items.find((i) => i.issue === input.issue)?.id;
      const record: FixRecord = {
        issue: input.issue,
        status: input.status,
        ...(input.commit !== undefined ? { commit: input.commit } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
        ...(checklistItem !== undefined ? { checklist_item: checklistItem } : {}),
        ts: isoTimestamp(new Date()),
      };
      // Upsert by issue id: re-reporting the same issue replaces its record.
      const existing = fixes.findIndex((f) => f.issue === input.issue);
      if (existing >= 0) {
        fixes[existing] = record;
      } else {
        fixes.push(record);
      }
      const sessionId = adoptedId ?? ensureSession().session_id;
      return enqueue(sessionId, [fixesYamlFile(fixesState())]);
    },
  };
}
