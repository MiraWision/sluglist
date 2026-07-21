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

export interface FeedbackWidgetConfig {
  connectors: FeedbackConnector[];
  /** Default true. The host project decides based on its environment. */
  enabled?: boolean;
  /** Project slug, written into session.yaml. */
  project: string;
}

export type CaptureMode = "element" | "fullpage" | "area";

export interface CaptureIssueInput {
  /** Optional triage category, e.g. "bug" | "design" | "idea". */
  category?: string;
  comment: string;
  /** Recent console errors to append as a "## Console errors" section. */
  consoleErrors?: string[];
  mode: CaptureMode;
  /** PNG screenshot, optional (an issue may have none). */
  screenshot?: Blob | null;
  /** Additional PNG screenshots for the same issue (additive to `screenshot`). */
  screenshots?: Blob[];
  /** CSS selector for element mode; null for fullpage / area. */
  selector?: string | null;
}

export interface IssueIndexEntry {
  /** Optional triage category; emitted only when set. */
  category?: string;
  created_at: string;
  /** Markdown file name, e.g. "01-broken-header.md". */
  file: string;
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
