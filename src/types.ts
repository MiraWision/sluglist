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
  name?: string;
  userId?: string;
}

/** Flat, primitive-only project fields attached to every issue. */
export type FeedbackCustom = Record<string, string | number | boolean>;

/** Usage preset. "beta" enables privacy defaults + the beta button label. */
export type FeedbackWidgetPreset = "dev" | "beta";

/** Page-error capture controls. */
export interface FeedbackErrorConfig {
  /** Capture console.error / uncaught errors / rejections. Default true. */
  capture?: boolean;
  /** Ring buffer size. Default 20. */
  bufferSize?: number;
  /** Also capture console.warn. Default false. */
  captureWarnings?: boolean;
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
}

/**
 * Serialized reporter block as it appears in artifacts (snake_case keys).
 * Only provided sub-fields are present; a configured-but-empty identity is null.
 */
export interface ReporterMeta {
  email?: string;
  name?: string;
  user_id?: string;
}

export interface FeedbackWidgetConfig {
  connectors: FeedbackConnector[];
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
   * Usage preset. Default "dev". "beta" turns on privacy defaults
   * (maskInputs + screenshotConsent) and the "Report a problem" button label
   * for real users on a production beta. Any explicit option overrides it.
   */
  preset?: FeedbackWidgetPreset;
  /** Screenshot privacy: PII masking and screenshot consent. */
  privacy?: FeedbackPrivacy;
  /** Project slug, written into session.yaml. */
  project: string;
  /**
   * Global shortcut that toggles the widget, e.g. "Shift+Alt+F" (modifiers +
   * one letter/digit; the key is matched by physical `event.code`, so it is
   * layout-independent). `false` disables it. Default "Shift+Alt+F". Ignored
   * while focus is in an input/textarea/contenteditable outside the widget.
   */
  shortcut?: string | false;
}

export type CaptureMode = "element" | "fullpage" | "area";

export interface CaptureIssueInput {
  /** Optional triage category, e.g. "bug" | "design" | "idea". */
  category?: string;
  comment: string;
  /** Full tag path with no classes (element mode). */
  domPath?: string | null;
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
  /** Physical screen resolution, e.g. "2560x1440". */
  screen?: string;
  session_id: string;
  /** IANA timezone, e.g. "Europe/Berlin". */
  timezone?: string;
  /** e.g. "1512x982" */
  viewport: string;
}

export interface SessionState extends SessionMeta {
  issues: IssueIndexEntry[];
}

export interface DeliveryFailure {
  connectorId: string;
  error: string;
  path: string;
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
