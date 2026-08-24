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

/**
 * Full-page captures are a different kind of image and need a different budget.
 *
 * A real one measured 1708 × 13758. Downscaled to 1200 wide it is still 9670px
 * tall and weighs ~2.4 MB at q70 — for a picture nobody reads pixel by pixel:
 * it is an overview of a page, not proof of a detail. So anything taller than
 * 2:1 gets a narrower, cheaper pass, and is re-encoded harder if it still lands
 * over the cap.
 */
const TALL_RATIO = 2;
const TALL_MAX_WIDTH = 1100;
const TALL_QUALITY = 60;
const TALL_MAX_BYTES = 900 * 1024;
const TALL_FALLBACK_QUALITY = 40;

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
      const tall = decoded.height > decoded.width * TALL_RATIO;
      const maxWidth = tall
        ? Math.min(options.maxWidth, TALL_MAX_WIDTH)
        : options.maxWidth;
      const quality = tall
        ? Math.min(options.quality, TALL_QUALITY)
        : options.quality;
      const prepared = flatten(resizeToWidth(decoded, maxWidth));
      let jpeg = encodeJpeg(prepared, quality);
      if (tall && jpeg.length > TALL_MAX_BYTES) {
        const harder = encodeJpeg(prepared, TALL_FALLBACK_QUALITY);
        if (harder.length < jpeg.length) {
          jpeg = harder;
        }
      }
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
