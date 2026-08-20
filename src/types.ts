import type { Checklist, ChecklistState } from "./checklist";

/**
 * Contract types. These are the public API consumed by connectors and future
 * artifact parsers. Changes must be additive only.
 */

/** A single artifact produced by the core. */
export interface ArtifactFile {
  blob: Blob;
  /** "text/yaml" | "text/markdown" | "image/png" */
  mime: string;
  /** Relative POSIX path inside the session folder, e.g. "01-broken-header.md". */
  path: string;
}

/**
 * Delivery target. All auth, credentials and storage knowledge live inside the
 * connector; the core never learns where artifacts go.
 */
export interface FeedbackConnector {
  /** Stable identifier used in logs and error reporting. */
  id: string;
  put(sessionId: string, file: ArtifactFile): Promise<void>;
}

/** Who is reporting. Optional; fixed at init, recorded once per session. */
export interface FeedbackIdentity {
  email?: string;
  /**
   * Whether the reporter is a person or an automated agent (format 1.5,
   * additive). Written as `reporter.kind`; omitted when not stated, which
   * readers treat as "human" (every pre-1.5 artifact was human-reported).
   */
  kind?: "human" | "agent";
  name?: string;
  userId?: string;
}

/** Flat, primitive-only project fields attached to every issue. */
export type FeedbackCustom = Record<string, string | number | boolean>;

/**
 * Usage preset. "beta" enables privacy defaults + the beta button label;
 * "production" adds text scrubbing, no warning capture and the dismiss control.
 */
export type FeedbackWidgetPreset = "dev" | "beta" | "production";

/** Dismiss control: let the reporter hide the widget for a while. */
export interface FeedbackDismissConfig {
  /**
   * Show the ✕ on the launcher. Default true under the "production" preset,
   * false otherwise.
   */
  enabled?: boolean;
  /**
   * Days before a dismissed widget comes back. Default 7. `0` means it stays
   * hidden until the browser storage is cleared (or `show()` is called).
   */
  days?: number;
}

/** Action-trail capture controls. */
export interface FeedbackActionsConfig {
  /** Capture clicks / navigations / submits / typing. Default true. */
  capture?: boolean;
  /** Ring buffer size. Default 30. */
  bufferSize?: number;
  /** Log the FACT of typing into password fields (never the value). Default false. */
  capturePasswords?: boolean;
}

/** Record mode: frames captured on each significant action. */
export interface FeedbackRecordingConfig {
  /** Show the Record button. Default true. */
  enabled?: boolean;
  /** Max frames captured; after this the trail continues without frames. Default 30. */
  maxFrames?: number;
  /** Minimum ms between frames (throttle). Default 650 (Phase-0 measure × 1.5). */
  frameMinInterval?: number;
}

/**
 * Screenshot-capture controls. Entirely optional: with no `capture` block the
 * widget uses the 8s timeout and the blank-render heuristic, and any failure
 * falls back to sending the issue without a screenshot.
 */
export interface FeedbackCaptureConfig {
  /**
   * Milliseconds a single screenshot render may take before it is treated as
   * failed. Default 8000. Raise it for very long pages at high DPR; the cost of
   * raising it is only that a genuinely hung render is noticed later.
   */
  timeoutMs?: number;
  /**
   * Treat an (almost) single-colour full-page render as a failed capture.
   * Default true. Set false if your app legitimately renders flat full-page
   * colour and you would rather ship that screenshot.
   */
  detectBlank?: boolean;
}

/** Page-error capture controls. */
export interface FeedbackErrorConfig {
  /** Capture console.error / uncaught errors / rejections. Default true. */
  capture?: boolean;
  /** Ring buffer size. Default 20. */
  bufferSize?: number;
  /** Also capture console.warn. Default false. */
  captureWarnings?: boolean;
  /**
   * Record failed network calls (fetch + XHR) that finish with status >= 400 or
   * a network error, as `## Errors` lines. Only method, path (no query), status
   * and duration are recorded — never bodies, headers or query strings.
   * Default true.
   */
  captureNetwork?: boolean;
}

/** Screenshot privacy controls. All optional; off by default (dev). */
export interface FeedbackPrivacy {
  /**
   * Mask `input, textarea, select` values before rendering a screenshot.
   * Default false. Elements with `data-private` are always masked regardless.
   */
  maskInputs?: boolean;
  /** Extra CSS selectors whose matched elements are masked. */
  maskSelectors?: string[];
  /**
   * Show an "Attach screenshot" consent checkbox (default checked) in the issue
   * form. When unchecked the issue is sent without a screenshot. Default false.
   */
  screenshotConsent?: boolean;
  /**
   * Redact PII-shaped substrings (emails, long digit runs, hex/base64 tokens)
   * from the TEXT surfaces of an artifact: `element_text`, `url`, every message
   * and stack in `## Errors` (including network paths), and the selectors and
   * labels in `## Actions`.
   *
   * Never applied to values the host supplies deliberately (`context`,
   * `custom`, `identity`, checklist titles) nor to the reporter's own comment.
   * Default true under the "production" preset, false otherwise.
   */
  scrubText?: boolean;
}

/**
 * One field the reporter fills in themselves. Entirely optional: with no `form`
 * configured the issue panel is exactly what it has always been.
 *
 * The three ways to attach information about the person reporting are
 * deliberately separate: `identity` is what your app already knows (static, set
 * at init), `setContext` is runtime host state, and `form` is what only the
 * reporter can tell you.
 */
export interface FormField {
  /** Stable key; normalized to snake_case in artifacts. */
  id: string;
  /** Visible label. Localize it yourself — it is your copy, not widget chrome. */
  label: string;
  type: "text" | "email" | "select" | "checkbox";
  /** Blocks sending while empty (checkbox: must be checked). */
  required?: boolean;
  /** Options for `type: "select"`. Ignored for other types. */
  options?: string[];
  /**
   * "session" — asked once, on the first issue of the session, and written to
   * session.yaml. "issue" — asked on every issue, written to that issue's
   * frontmatter.
   */
  scope: "session" | "issue";
}

/**
 * Reporter attachments (their own screenshots, logs, exports). Optional; the
 * defaults are usable as-is, and the whole feature is off under the
 * "production" preset unless you turn it on deliberately.
 */
export interface FeedbackAttachmentsConfig {
  /**
   * Show the "+ Attach file" control and accept drops / pastes. Default true,
   * except under the "production" preset where it defaults to FALSE — accepting
   * uploads from anonymous real users is a decision, not a default.
   */
  enabled?: boolean;
  /** Per-file size cap in bytes. Default 10MB. Nothing is compressed client-side. */
  maxFileSize?: number;
  /** Max files per issue. Default 5. */
  maxFiles?: number;
  /**
   * Replaces the built-in whitelist. Entries are extensions (".log") or mime
   * types ("text/plain", "image/*"). Executables and archives are refused even
   * if listed.
   */
  accept?: string[];
}

/** One file on its way into an issue, as the UI hands it to the core. */
export interface AttachmentInput {
  blob: Blob;
  /** The name on the reporter's machine, e.g. "IMG_4021.png". */
  name: string;
  mime: string;
}

/** One attached file as it appears in issue frontmatter. */
export interface AttachmentMeta {
  /** File name next to the issue, e.g. "03-checkout-att-01.png". */
  file: string;
  mime: string;
  size: number;
  /** The name the file had on the reporter's machine. */
  original_name: string;
}

/**
 * Serialized reporter block as it appears in artifacts (snake_case keys).
 * Only provided sub-fields are present; a configured-but-empty identity is null.
 */
export interface ReporterMeta {
  email?: string;
  /** "human" | "agent" (format 1.5, additive). Absent ⇒ human. */
  kind?: string;
  name?: string;
  user_id?: string;
}

/** Resolution of one reported issue, as recorded in `fixes.yaml` (format 1.5). */
export type FixStatus = "fixed" | "wontfix" | "needs_info";

/** One `items[]` entry of `fixes.yaml`. Upserted by issue id. */
export interface FixRecord {
  /** Issue id the record resolves, e.g. "01". */
  issue: string;
  status: FixStatus;
  /** Commit hash of the fix, when one exists. */
  commit?: string;
  /** One-line human note ("Null check added in ExportButton"). */
  note?: string;
  /** Checklist item the fixed issue was evidence for, when it was linked. */
  checklist_item?: string;
  /** ISO timestamp the record was written. */
  ts: string;
}

/** The `fixes.yaml` document: who fixed, plus one record per handled issue. */
export interface FixesState {
  /** Identity of the fixer; same shape and rules as `reporter`. */
  fixed_by?: ReporterMeta | null;
  items: FixRecord[];
}

export interface FeedbackWidgetConfig {
  /** Background action trail (clicks/navigations/submits/typing). Default on. */
  actions?: FeedbackActionsConfig;
  /**
   * Screenshot render limits (timeout, blank detection). Optional — the
   * defaults are the supported configuration; this is an escape hatch for
   * unusually heavy pages.
   */
  capture?: FeedbackCaptureConfig;
  /**
   * Let the reporter attach their own files to an issue (picker, drag & drop,
   * paste). Optional; see {@link FeedbackAttachmentsConfig} for the defaults.
   */
  attachments?: FeedbackAttachmentsConfig;
  /**
   * Fields the reporter fills in. Max 8; invalid entries are dropped with a
   * warning. Omit it and the issue panel is unchanged.
   */
  form?: FormField[];
  /**
   * Optional acceptance checklist. Pass an inline {@link Checklist} object, or a
   * URL string fetched (GET → JSON of the same shape) at init. Renders a second
   * widget button; when absent the widget looks and works exactly as without it.
   * An unreachable/invalid checklist warns and is skipped — capture still works.
   */
  checklist?: Checklist | string;
  connectors: FeedbackConnector[];
  /**
   * Dismiss control (the ✕ on the launcher). Enabled by default only under the
   * "production" preset; `sluglist.show()` always brings a dismissed widget back.
   */
  dismiss?: FeedbackDismissConfig;
  /**
   * Flat project fields (string | number | boolean) attached to every issue's
   * frontmatter as `custom`. Validated at init: keys → snake_case, non-primitive
   * values dropped with a warning, max 20 keys, values truncated to 200 chars.
   */
  custom?: FeedbackCustom;
  /** Default true. The host project decides based on its environment. */
  enabled?: boolean;
  /** Page-error capture (console + uncaught + rejections). Default on. */
  errors?: FeedbackErrorConfig;
  /** Reporter identity, recorded once per session (session.yaml + each issue). */
  identity?: FeedbackIdentity;
  /**
   * Persist undelivered artifacts (IndexedDB) and retry on the next load.
   * Default true; set false to disable the offline outbox.
   */
  offlineQueue?: boolean;
  /**
   * Called once after the boot-time flush of the offline outbox, with what it
   * did. The outbox is invisible otherwise: a batch that failed yesterday is
   * re-sent on the next load with nothing said about it, which is fine until
   * you are the one wondering whether a report ever arrived.
   */
  onQueueFlush?: (report: QueueFlushReport) => void;
  /**
   * Usage preset. Default "dev". "beta" turns on privacy defaults
   * (maskInputs + screenshotConsent) and the "Report a problem" button label
   * for real users on a production beta. "production" is beta plus text
   * scrubbing (`privacy.scrubText`), no `console.warn` capture, and the dismiss
   * control. Any explicit option overrides it, except `errors.captureWarnings`
   * under "production" — see `resolveErrors`.
   */
  preset?: FeedbackWidgetPreset;
  /** Screenshot privacy: PII masking and screenshot consent. */
  privacy?: FeedbackPrivacy;
  /**
   * Project slug, written into session.yaml and used as the storage prefix.
   * Optional: defaults to the page's hostname as a slug (`app.acme.com` →
   * `app-acme-com`), so a widget can be created with nothing but a connector.
   * Naming it explicitly is still better — it is what your artifacts sort under.
   */
  project?: string;
  /** Record mode (frames captured per action). Default enabled. */
  recording?: FeedbackRecordingConfig;
  /**
   * Global shortcut that toggles the widget, e.g. "Shift+F" (modifiers + one
   * letter/digit; the key is matched by physical `event.code`, so it is
   * layout-independent). `false` disables it. Default "Shift+F". Ignored while
   * focus is in an input/textarea/contenteditable outside the widget.
   */
  shortcut?: string | false;
}

export type CaptureMode = "element" | "fullpage" | "area";

export interface CaptureIssueInput {
  /** Optional triage category, e.g. "bug" | "design" | "idea". */
  category?: string;
  /**
   * Checklist item id this issue provides evidence for (a `fail` verdict).
   * Emitted as `checklist_item` in frontmatter; omitted for normal issues.
   */
  checklistItem?: string | null;
  comment: string;
  /** Nearest named React component of the captured element (element mode); null when unknown. */
  component?: string | null;
  /** Full tag path with no classes (element mode). */
  domPath?: string | null;
  /**
   * Record-mode frames, in order (start + per-action). Legacy single-clip form;
   * when {@link CaptureIssueInput.clips} is set it takes precedence. Kept so a
   * caller passing one flat sequence still works (treated as `clip-01`).
   */
  frames?: Blob[];
  /**
   * Record-mode clips: one ordered frame sequence per Record→Stop cycle. Each
   * becomes a `clip-NN/` subfolder. Preferred over {@link CaptureIssueInput.frames}.
   */
  clips?: Blob[][];
  /** Whether this issue is a recording (frames attached). */
  recording?: boolean;
  /**
   * Whether PII masking was applied to this issue's screenshot(s). Emitted as
   * `masked` in frontmatter; omitted when privacy is not configured.
   */
  masked?: boolean;
  /** innerText of the element, trimmed (element mode). */
  elementText?: string | null;
  mode: CaptureMode;
  /** Nearest data-screen | data-page ancestor value (element mode). */
  screen?: string | null;
  /** PNG screenshot, optional (an issue may have none). */
  screenshot?: Blob | null;
  /** Additional PNG screenshots for the same issue (additive to `screenshot`). */
  screenshots?: Blob[];
  /**
   * A screenshot was attempted for this issue and the render failed, so the
   * issue is being sent without it. Emitted as `screenshot_failed: true`.
   */
  screenshotFailed?: boolean;
  /**
   * Why the render failed (renderer message / "timed out" / "blank"). Emitted
   * as `screenshot_error`; scrubbed like every other page-derived text surface.
   */
  screenshotError?: string | null;
  /**
   * Files the reporter attached, in order. Each is written next to the issue as
   * `<id>-<slug>-att-NN.<ext>` and listed in the `attachments` frontmatter.
   */
  attachments?: AttachmentInput[];
  /**
   * Answers to `scope: "issue"` form fields. Written to frontmatter verbatim —
   * never scrubbed, because the reporter typed them for you on purpose.
   */
  form?: Record<string, string | number | boolean>;
  /** CSS selector for element mode; null for fullpage / area. */
  selector?: string | null;
  /** How the selector was derived: "testid" | "id" | "aria" | "path". */
  selectorStrategy?: string | null;
  /** Whether the selector resolved to exactly one element at capture time. */
  selectorUnique?: boolean | null;
}

export interface IssueIndexEntry {
  /** Optional triage category; emitted only when set. */
  category?: string;
  created_at: string;
  /** Record mode: number of frames; emitted only when set. */
  frames?: number;
  /** Markdown file name, e.g. "01-broken-header.md". */
  file: string;
  /** Nearest data-screen | data-page value for grouping; emitted when set. */
  screen?: string | null;
  /** Zero-padded issue number within the session, e.g. "01". */
  id: string;
  /** First PNG file name or null (kept for parser compatibility). */
  screenshot: string | null;
  /**
   * All PNG file names, additive: present only when an issue carries more
   * than one screenshot. `screenshot` always holds the first one.
   */
  screenshots?: string[];
  selector: string | null;
  /** Path relative to base_url, e.g. "/dashboard/animals". */
  url: string;
}

export interface SessionMeta {
  base_url: string;
  browser: string;
  /** "light" | "dark"; optional so older artifacts stay valid. */
  color_scheme?: string;
  created_at: string;
  device_pixel_ratio: number;
  /** Primary UI language, e.g. "en-US". */
  language?: string;
  /** Ordered language preferences. */
  languages?: string[];
  os: string;
  project: string;
  /** Whether the reader prefers reduced motion. */
  reduced_motion?: boolean;
  /**
   * Reporter identity, session-level. Present only when `identity` is configured
   * (null when configured but empty); omitted entirely otherwise (back-compat).
   */
  reporter?: ReporterMeta | null;
  /**
   * Answers to `scope: "session"` form fields, collected on the first issue of
   * the session. Present only when such fields are configured and answered
   * (format 1.4); sessions without a form stay byte-identical.
   */
  form?: Record<string, string | number | boolean>;
  /** Physical screen resolution, e.g. "2560x1440". */
  screen?: string;
  session_id: string;
  /** IANA timezone, e.g. "Europe/Berlin". */
  timezone?: string;
  /** e.g. "1512x982" */
  viewport: string;
}

export interface SessionState extends SessionMeta {
  /**
   * Acceptance checklist with per-item verdicts. Present only when a checklist
   * is configured; rendered as the `checklist` block in session.yaml.
   */
  checklist?: ChecklistState;
  issues: IssueIndexEntry[];
}

/** What the boot-time flush of the offline outbox did. */
export interface QueueFlushReport {
  /** Batches found waiting from a previous load. */
  batches: number;
  /** Batches delivered and cleared. */
  delivered: number;
  /** Batches that failed again and stay queued for the next load. */
  failed: number;
}

export interface DeliveryFailure {
  connectorId: string;
  error: string;
  path: string;
  /**
   * True when the connector reported a rejection retrying cannot fix (a 4xx,
   * a file over the endpoint's limit). Absent means "could not deliver, may
   * work later" — the offline outbox will try again on the next load.
   */
  permanent?: boolean;
}

export interface DeliveryReport {
  failures: DeliveryFailure[];
  ok: boolean;
}

export interface CaptureResult {
  /**
   * Resolves with a per-connector delivery report once background delivery
   * settles (never rejects). Callers are free to ignore it (fire and forget);
   * the UI uses it to show a saved / failed toast with retry.
   */
  delivered: Promise<DeliveryReport>;
  files: ArtifactFile[];
  issueId: string;
  sessionId: string;
}
