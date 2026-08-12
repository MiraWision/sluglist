import { readFile, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { encodeJpeg } from "./jpeg";
import { decodePng, flatten, resizeToWidth } from "./png";

/**
 * Turns session image files into `data:` URIs for the report. Everything the
 * report shows must live inside the single HTML file, so each image is decoded,
 * downscaled and re-encoded before being inlined.
 *
 * Robustness rule: an image that cannot be processed is embedded as-is rather
 * than dropped. A larger report is a nuisance; a report with a missing proof is
 * a broken one.
 */

/** Default budget: full-width figures render at ~720 CSS px, 2× for retina. */
export const DEFAULT_MAX_WIDTH = 1200;
export const DEFAULT_QUALITY = 70;

/** Above this, the report is rebuilt with harsher settings (spec: 25MB). */
export const SIZE_LIMIT = 25 * 1024 * 1024;

export interface EmbedOptions {
  maxWidth: number;
  quality: number;
}

export const DEFAULT_EMBED: EmbedOptions = {
  maxWidth: DEFAULT_MAX_WIDTH,
  quality: DEFAULT_QUALITY,
};

/** Harsher pass used when the first build blows the size limit. */
export const AGGRESSIVE_EMBED: EmbedOptions = { maxWidth: 800, quality: 50 };

export interface EmbeddedImage {
  /** `data:` URI ready for a `src` attribute. */
  uri: string;
  /** Bytes of the encoded image (before base64 expansion). */
  bytes: number;
  /** Pixel size after downscaling, when known. */
  width?: number;
  height?: number;
  /** True when the original bytes were inlined unchanged. */
  verbatim: boolean;
}

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
};

function dataUri(mime: string, bytes: Buffer): string {
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

/**
 * Read one image from the session folder and return it as a data URI,
 * recompressed when it is a PNG we can decode. Returns null when the file is
 * missing — a report never fails because a referenced file was deleted.
 */
export async function embedImage(
  dir: string,
  name: string,
  options: EmbedOptions = DEFAULT_EMBED
): Promise<EmbeddedImage | null> {
  const path = join(dir, name);
  let source: Buffer;
  try {
    source = await readFile(path);
  } catch {
    return null;
  }

  const ext = extname(name).toLowerCase();
  if (ext === ".png") {
    try {
      const decoded = decodePng(source);
      const prepared = flatten(resizeToWidth(decoded, options.maxWidth));
      const jpeg = encodeJpeg(prepared, options.quality);
      // A tiny PNG (an icon, a flat-colour capture) can beat JPEG; keep
      // whichever is actually smaller.
      if (jpeg.length < source.length) {
        return {
          uri: dataUri("image/jpeg", jpeg),
          bytes: jpeg.length,
          width: prepared.width,
          height: prepared.height,
          verbatim: false,
        };
      }
      return {
        uri: dataUri("image/png", source),
        bytes: source.length,
        width: decoded.width,
        height: decoded.height,
        verbatim: true,
      };
    } catch {
      // Interlaced, 1/2/4-bit, or otherwise outside the decoder's range.
      return {
        uri: dataUri("image/png", source),
        bytes: source.length,
        verbatim: true,
      };
    }
  }

  const mime = MIME_BY_EXT[ext];
  if (!mime) {
    return null;
  }
  return { uri: dataUri(mime, source), bytes: source.length, verbatim: true };
}

/** Size of a file in bytes, or null when it is unreadable. */
export async function fileSize(
  dir: string,
  name: string
): Promise<number | null> {
  try {
    return (await stat(join(dir, name))).size;
  } catch {
    return null;
  }
}

/** Human-readable byte count, e.g. "1.4 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
