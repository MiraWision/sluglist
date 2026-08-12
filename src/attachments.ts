import type { FeedbackAttachmentsConfig } from "./types";

/**
 * Attachment policy: what a reporter is allowed to attach to an issue, and how
 * a picked file becomes an artifact name.
 *
 * The whitelist is deliberately short — the things people actually attach to a
 * bug report: a screenshot from their phone, a screen recording, an exported
 * PDF or spreadsheet, a log or a JSON payload. Everything else is refused with
 * a message that says what IS accepted.
 *
 * Executables and archives are never accepted, not even through `accept`. An
 * archive hides its contents from every check downstream (yours and your
 * storage's), and an executable has no business in a feedback artifact. That is
 * a product decision, not a configurable one.
 */

export const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024;
export const DEFAULT_MAX_FILES = 5;
/** Beyond this, `accept` entries are ignored — a whitelist that long is not one. */
const MAX_ACCEPT_ENTRIES = 40;

/** extension → mime types the browser may report for it. */
const WHITELIST: Record<string, string[]> = {
  // images
  png: ["image/png"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  webp: ["image/webp"],
  gif: ["image/gif"],
  heic: ["image/heic", "image/heif"],
  // video
  mp4: ["video/mp4"],
  webm: ["video/webm"],
  mov: ["video/quicktime", "video/mp4"],
  // documents
  pdf: ["application/pdf"],
  // text
  txt: ["text/plain"],
  csv: ["text/csv", "application/csv", "text/plain"],
  json: ["application/json", "text/json", "text/plain"],
  md: ["text/markdown", "text/x-markdown", "text/plain"],
  // office
  xlsx: [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
  docx: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
};

/**
 * Every mime the built-in whitelist may produce, flattened. The `sluglist dev`
 * sidecar accepts exactly these for attachment files (plus the three artifact
 * mimes the core writes itself) — kept here so the two lists cannot drift.
 */
export const ATTACHMENT_MIME_TYPES: ReadonlySet<string> = new Set(
  Object.values(WHITELIST).flat()
);

/**
 * Never accepted, whatever `accept` says. Archives (their contents are opaque
 * to every check downstream) and anything executable or script-like.
 */
const ALWAYS_REFUSED = new Set([
  "zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz", "zst", "iso", "dmg",
  "jar", "war", "apk", "ipa", "cab", "arj", "lzh", "ace",
  "exe", "msi", "com", "scr", "bat", "cmd", "ps1", "psm1", "vbs", "vbe",
  "js", "mjs", "cjs", "jse", "wsf", "wsh", "sh", "bash", "zsh", "fish",
  "app", "pkg", "deb", "rpm", "run", "bin", "elf", "dll", "so", "dylib",
  "py", "rb", "pl", "php", "jsp", "asp", "aspx", "cgi",
  "lnk", "url", "reg", "scf", "hta", "chm",
]);

/** Extensions whose text content the fix-skill reads directly as evidence. */
export const TEXT_ATTACHMENT_EXTENSIONS = ["txt", "csv", "json", "md"];

export interface AttachmentPolicy {
  enabled: boolean;
  maxFileSize: number;
  maxFiles: number;
  /** Extensions accepted, lowercase, no dot. */
  extensions: string[];
  /** `accept` attribute value for the file input. */
  acceptAttribute: string;
}

/** Is this preset one where attachments are off unless asked for? */
function defaultEnabled(preset: string | undefined): boolean {
  return preset !== "production";
}

/**
 * Resolve the effective policy. `attachments` may be omitted entirely — the
 * result is then the documented defaults (on outside production, 10MB, 5 files,
 * built-in whitelist).
 */
export function resolveAttachments(
  config: FeedbackAttachmentsConfig | undefined,
  preset?: string
): AttachmentPolicy {
  const enabled = config?.enabled ?? defaultEnabled(preset);
  const maxFileSize =
    typeof config?.maxFileSize === "number" && config.maxFileSize > 0
      ? config.maxFileSize
      : DEFAULT_MAX_FILE_SIZE;
  const maxFiles =
    typeof config?.maxFiles === "number" && config.maxFiles > 0
      ? Math.floor(config.maxFiles)
      : DEFAULT_MAX_FILES;
  const extensions = resolveExtensions(config?.accept);
  return {
    enabled,
    maxFileSize,
    maxFiles,
    extensions,
    acceptAttribute: extensions.map((e) => `.${e}`).join(","),
  };
}

/**
 * `accept` entries may be extensions (".log", "log") or mime types
 * ("text/plain", "image/*"). Mime entries are expanded back to the extensions
 * we know for them, because the artifact name needs an extension either way.
 * Anything in {@link ALWAYS_REFUSED} is dropped with a warning.
 */
function resolveExtensions(accept: string[] | undefined): string[] {
  if (!(Array.isArray(accept) && accept.length > 0)) {
    return Object.keys(WHITELIST);
  }
  const out = new Set<string>();
  for (const raw of accept.slice(0, MAX_ACCEPT_ENTRIES)) {
    if (typeof raw !== "string" || !raw.trim()) {
      continue;
    }
    const entry = raw.trim().toLowerCase();
    if (entry.includes("/")) {
      const [type] = entry.split("/");
      for (const [ext, mimes] of Object.entries(WHITELIST)) {
        const matches = entry.endsWith("/*")
          ? mimes.some((m) => m.startsWith(`${type}/`))
          : mimes.includes(entry);
        if (matches) {
          out.add(ext);
        }
      }
      continue;
    }
    const ext = entry.replace(/^\./, "");
    if (ALWAYS_REFUSED.has(ext)) {
      console.warn(
        `[sluglist] attachments: ignoring accept entry "${raw}" — executables and archives are never accepted`
      );
      continue;
    }
    if (ext) {
      out.add(ext);
    }
  }
  // An accept list that resolved to nothing usable is a config mistake, not an
  // instruction to accept nothing silently.
  if (out.size === 0) {
    console.warn(
      "[sluglist] attachments: accept matched no usable type; falling back to the default whitelist"
    );
    return Object.keys(WHITELIST);
  }
  return [...out];
}

/** Lowercase extension of a file name, without the dot ("" when there is none). */
export function extensionOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) {
    return "";
  }
  return base.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "");
}

export type RejectionReason =
  | "type"
  | "size"
  | "count"
  | "empty";

export interface AttachmentCheck {
  ok: boolean;
  reason?: RejectionReason;
  /** Normalized extension, present when the type check passed. */
  extension?: string;
}

/**
 * Validate one candidate file against the policy. The type check runs on BOTH
 * the extension and the reported mime: a browser that reports nothing (common
 * for `.md`, `.heic` and files dragged from some apps) passes on the extension
 * alone, but a mime that contradicts the extension is refused.
 */
export function checkAttachment(
  file: { name: string; size: number; type: string },
  policy: AttachmentPolicy,
  alreadyAttached: number
): AttachmentCheck {
  if (alreadyAttached >= policy.maxFiles) {
    return { ok: false, reason: "count" };
  }
  if (file.size <= 0) {
    return { ok: false, reason: "empty" };
  }
  const ext = extensionOf(file.name);
  if (!ext || ALWAYS_REFUSED.has(ext) || !policy.extensions.includes(ext)) {
    return { ok: false, reason: "type" };
  }
  const mime = (file.type ?? "").toLowerCase().split(";")[0].trim();
  const known = WHITELIST[ext];
  if (mime && known && !known.includes(mime)) {
    return { ok: false, reason: "type" };
  }
  if (file.size > policy.maxFileSize) {
    return { ok: false, reason: "size", extension: ext };
  }
  return { ok: true, extension: ext };
}

/**
 * Artifact name for the nth attachment of an issue: `03-checkout-att-01.png`.
 * The reporter's own file name is never used as a path — it is kept in the
 * `original_name` metadata instead, where it cannot become a traversal.
 */
export function attachmentPath(
  issueId: string,
  slug: string,
  index: number,
  extension: string
): string {
  const n = String(index + 1).padStart(2, "0");
  return `${issueId}-${slug}-att-${n}.${extension}`;
}

/** Human size for error messages: "11.4 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** Is this attachment an image (shown as a thumbnail, annotatable)? */
export function isImageAttachment(mime: string, extension: string): boolean {
  return (
    mime.startsWith("image/") ||
    ["png", "jpg", "jpeg", "webp", "gif", "heic"].includes(extension)
  );
}
