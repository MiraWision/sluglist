/**
 * The delivery contract — what a `put` may carry, importable by the endpoint
 * that receives it.
 *
 * A connector posts artifacts to infrastructure you own, so the rules for what
 * a valid artifact looks like live on **both** sides of the wire. Until this
 * module existed, the receiving side had to re-derive them from the docs, and
 * the place people got wrong was always the same one: the path of a record-mode
 * frame is nested (`01-slug-frames/clip-01/02.png`), a hand-written validator
 * usually allows no slash at all, and the result is a 400 that reads only as
 * "upload failed".
 *
 * This module is the single source for those rules. It is imported by the
 * `LocalConnector`, by the `sluglist dev` sidecar, by `HttpConnector`, and by
 * the shipped endpoint example — so a change to the layout cannot leave one of
 * them behind. Import it in a route handler with:
 *
 * ```ts
 * import { validateArtifactUpload } from "sluglist/contract";
 * ```
 *
 * **No DOM, no Node, no dependencies** — it is data and pure functions, so it
 * loads in a serverless function, an edge runtime or a browser alike.
 */

import { FORMAT_VERSION } from "./artifacts";
import { ATTACHMENT_MIME_TYPES, DEFAULT_MAX_FILE_SIZE } from "./attachments";

export { ATTACHMENT_MIME_TYPES, DEFAULT_MAX_FILE_SIZE, FORMAT_VERSION };

/**
 * The three mime types the core writes itself: `session.yaml` / `fixes.yaml`,
 * the issue markdown, and every PNG (screenshot, evidence, record frame).
 */
export const ARTIFACT_MIME_TYPES: ReadonlySet<string> = new Set([
  "text/yaml",
  "text/markdown",
  "image/png",
]);

/**
 * Everything a delivery endpoint may legitimately receive: the core three plus
 * whatever a reporter is allowed to attach. Narrow it yourself if you do not
 * enable attachments — a narrower endpoint is a better endpoint.
 */
export const DELIVERY_MIME_TYPES: ReadonlySet<string> = new Set([
  ...ARTIFACT_MIME_TYPES,
  ...ATTACHMENT_MIME_TYPES,
]);

/**
 * How deep an artifact path can nest. Three, because of record mode:
 * `<frames_dir>/<clip-id>/NN.png`. Everything else is a single segment.
 */
export const ARTIFACT_PATH_MAX_SEGMENTS = 3;

/** One path segment: no dot-leading names, no slashes, no traversal. */
const SEGMENT = "[A-Za-z0-9][A-Za-z0-9._-]{0,120}";
const ARTIFACT_PATH = new RegExp(
  `^${SEGMENT}(?:/${SEGMENT}){0,${ARTIFACT_PATH_MAX_SEGMENTS - 1}}$`
);
const SESSION_ID = /^session-[a-z0-9-]{1,64}$/i;

/** Whether `id` is a session id sluglist produces (`session-YYYY-MM-DD-xxxx`). */
export function isSessionId(id: string): boolean {
  return SESSION_ID.test(id);
}

/**
 * Whether `path` is structurally a valid artifact path inside a session folder:
 * relative, POSIX, at most {@link ARTIFACT_PATH_MAX_SEGMENTS} segments, no `..`,
 * no leading dot, no absolute paths.
 *
 * **This is the security check** — use it, and only it, to decide whether a
 * path may be written. It is deliberately structural rather than a whitelist of
 * known filenames: the format grows additively, and an endpoint that only
 * accepts today's names would start rejecting tomorrow's artifacts after a
 * routine package upgrade. For "what kind of file is this", see
 * {@link classifyArtifactPath} — but never gate writes on it.
 */
export function isArtifactPath(path: string): boolean {
  return ARTIFACT_PATH.test(path);
}

/** What a structurally valid path appears to be. */
export type ArtifactKind =
  /** `session.yaml` — the session index. */
  | "session"
  /** `fixes.yaml` — a fix pass's resolution records. */
  | "fixes"
  /** `NN-slug.md` — one issue. */
  | "issue"
  /** `NN-slug.png` — the issue's screenshot. */
  | "screenshot"
  /** `ev-<item-id>-NN.png` — proof attached to a checklist verdict. */
  | "evidence"
  /** `NN-slug-att-NN.ext` — a file the reporter attached. */
  | "attachment"
  /** `NN-slug-frames/clip-NN/NN.png` — one record-mode frame. */
  | "frame"
  /** Valid shape, unrecognised name — a newer artifact, most likely. */
  | "unknown";

/**
 * Best-effort classification, for logging, metrics and per-kind size limits.
 * Returns null only when the path is not structurally valid.
 *
 * An unrecognised-but-valid path is `"unknown"`, never an error: a future
 * additive artifact must not fail on an endpoint written today.
 */
export function classifyArtifactPath(path: string): ArtifactKind | null {
  if (!isArtifactPath(path)) {
    return null;
  }
  if (path.includes("/")) {
    return /-frames\/[^/]+\/\d+\.png$/.test(path) ? "frame" : "unknown";
  }
  if (path === "session.yaml") {
    return "session";
  }
  if (path === "fixes.yaml") {
    return "fixes";
  }
  if (/^\d+-.*-att-\d+\.[A-Za-z0-9]+$/.test(path)) {
    return "attachment";
  }
  if (/^ev-.*-\d+\.png$/.test(path)) {
    return "evidence";
  }
  if (/^\d+-.*\.md$/.test(path)) {
    return "issue";
  }
  if (/^\d+-.*\.png$/.test(path)) {
    return "screenshot";
  }
  return "unknown";
}

/**
 * The JSON body `HttpConnector` posts. Declared here so the endpoint can type
 * its own parsing against the same shape the client sends.
 */
export interface ArtifactPayload {
  /** Artifact format version the client wrote, e.g. `"1.7"`. */
  format: string;
  sessionId: string;
  /** Path inside the session folder; may nest (see {@link isArtifactPath}). */
  path: string;
  mime: string;
  /** The file's bytes, base64-encoded. */
  base64: string;
}

/** Why an upload was refused, with the HTTP status that fits the reason. */
export interface UploadRejection {
  /** 400 malformed · 413 too large · 415 wrong media type. */
  status: 400 | 413 | 415;
  /** One line, safe to return in the response body and to log. */
  reason: string;
}

export interface ValidateUploadOptions {
  /** Cap for core artifacts. Default {@link DEFAULT_MAX_FILE_SIZE} (10 MB). */
  maxBytes?: number;
  /** Cap for reporter attachments. Defaults to `maxBytes`. */
  maxAttachmentBytes?: number;
  /** Mimes to accept. Default {@link DELIVERY_MIME_TYPES}. */
  allowedMimeTypes?: ReadonlySet<string>;
  /** Refuse reporter attachments outright. Default false. */
  rejectAttachments?: boolean;
}

/**
 * Validate one upload the way a delivery endpoint needs to: shape, path safety,
 * media type and size, in that order. Returns `null` when the upload is
 * acceptable, or the rejection to answer with.
 *
 * It deliberately does **not** cover auth, rate limiting or per-session quotas —
 * those depend on your infrastructure, and sluglist has no opinion about them.
 */
export function validateArtifactUpload(
  input: {
    sessionId: unknown;
    path: unknown;
    mime: unknown;
    /** Decoded size in bytes. Compute it before decoding when you can. */
    byteLength: number;
  },
  options: ValidateUploadOptions = {}
): UploadRejection | null {
  const { sessionId, path, mime, byteLength } = input;
  if (
    typeof sessionId !== "string" ||
    typeof path !== "string" ||
    typeof mime !== "string"
  ) {
    return { status: 400, reason: "sessionId, path and mime are required" };
  }
  if (!isSessionId(sessionId)) {
    return { status: 400, reason: `invalid sessionId: ${sessionId}` };
  }
  const kind = classifyArtifactPath(path);
  if (kind === null) {
    return {
      status: 400,
      reason: `invalid artifact path: ${path} (relative, at most ${ARTIFACT_PATH_MAX_SEGMENTS} segments)`,
    };
  }
  if (kind === "attachment" && options.rejectAttachments) {
    return { status: 415, reason: "attachments are not accepted" };
  }
  const allowed = options.allowedMimeTypes ?? DELIVERY_MIME_TYPES;
  if (!allowed.has(mime)) {
    return { status: 415, reason: `unsupported media type: ${mime}` };
  }
  // A core artifact must not arrive under an attachment's mime: without this,
  // "image/png" would let any file through under an artifact-shaped name.
  if (kind !== "attachment" && kind !== "unknown" && !ARTIFACT_MIME_TYPES.has(mime)) {
    return { status: 415, reason: `${kind} artifacts are never ${mime}` };
  }
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_FILE_SIZE;
  const limit =
    kind === "attachment" ? (options.maxAttachmentBytes ?? maxBytes) : maxBytes;
  if (byteLength > limit) {
    return {
      status: 413,
      reason: `${path} is ${byteLength} bytes, over the ${limit}-byte limit`,
    };
  }
  return null;
}

/** Decoded byte length of a base64 string, without decoding it. */
export function base64ByteLength(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}
