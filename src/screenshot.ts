import type { Options } from "html-to-image/lib/types";

/**
 * Screenshot capture built on DOM-to-canvas rendering (html-to-image).
 * All functions return PNG Blobs. Rendering fidelity limits (WebGL, some
 * cross-origin content) are documented in the project's RUN_EVIDENCE.
 *
 * html-to-image is loaded lazily on the first capture so it is not part of the
 * widget's initial bundle (it is only needed once someone reports an issue).
 *
 * Every failure mode — a throw inside the renderer, a render that never
 * settles, and a render that settles on an empty canvas — surfaces as one
 * {@link CaptureFailedError}. The UI treats all three the same way: the issue is
 * never blocked, it is simply sent without that screenshot.
 */

let htiPromise: Promise<typeof import("html-to-image")> | null = null;

function loadHtmlToImage(): Promise<typeof import("html-to-image")> {
  htiPromise ??= import("html-to-image");
  return htiPromise;
}

async function toCanvas(
  node: HTMLElement,
  options: Options
): Promise<HTMLCanvasElement> {
  const hti = await loadHtmlToImage();
  return hti.toCanvas(node, options);
}

export interface AreaRect {
  height: number;
  width: number;
  /** Viewport coordinates, CSS pixels. */
  x: number;
  y: number;
}

/** Why a capture produced no usable image. */
export type CaptureFailureReason =
  /** The renderer threw (missing font, tainted canvas, cross-origin image, …). */
  | "render"
  /** The render did not settle within the timeout. */
  | "timeout"
  /** The render settled, but the result is a blank / single-colour canvas. */
  | "blank"
  /** The browser refused a 2d context or the canvas could not be encoded. */
  | "encode";

/**
 * A capture that produced no usable image. Carries a machine-readable
 * {@link CaptureFailedError.reason} so the UI can decide what to say and the
 * artifact can record `screenshot_error`.
 */
export class CaptureFailedError extends Error {
  readonly reason: CaptureFailureReason;

  constructor(reason: CaptureFailureReason, message: string) {
    super(message);
    this.name = "CaptureFailedError";
    this.reason = reason;
  }
}

/**
 * How long a single capture may take before it is treated as failed.
 *
 * 8s is a deliberate compromise (see RUN_EVIDENCE, Phase 1): a render that has
 * not settled by then is far more often a real hang — a webfont that never
 * resolves, a cross-origin image that never loads — than a slow success. Very
 * long pages at high DPR can legitimately exceed it, which is why
 * {@link CaptureOptions.timeoutMs} exists and why the fallback is "send the
 * issue without the screenshot", never "lose the issue".
 */
export const DEFAULT_CAPTURE_TIMEOUT_MS = 8_000;

/** Share of identically-coloured pixels above which a render is called blank. */
export const BLANK_RATIO_THRESHOLD = 0.98;

export interface CaptureOptions {
  /** Override {@link DEFAULT_CAPTURE_TIMEOUT_MS}. */
  timeoutMs?: number;
  /**
   * Run the blank-canvas heuristic on the result. Default true for full-page
   * captures, false for element/area crops — a single-colour crop of a solid
   * banner is a legitimate screenshot, a single-colour render of a whole
   * document is not.
   */
  detectBlank?: boolean;
}

/** Elements the capture should skip (the widget's own UI). */
const EXCLUDE_ATTRIBUTE = "data-feedback-widget";

function shouldInclude(node: HTMLElement): boolean {
  return !(
    node instanceof HTMLElement && node.hasAttribute?.(EXCLUDE_ATTRIBUTE)
  );
}

function pixelRatio(): number {
  return Math.min(window.devicePixelRatio || 1, 2);
}

/**
 * Scroll-reveal libraries (framer-motion and friends) park elements at an
 * inline `opacity: 0` plus a small translate until they enter the viewport.
 * The clone has no running animations, so those elements would render as
 * blank or shifted regions. Temporarily reveal them for the duration of the
 * capture and restore the exact inline values afterwards.
 */
function revealAnimationHiddenElements(): () => void {
  const touched: {
    element: HTMLElement;
    filter: string;
    opacity: string;
    transform: string;
  }[] = [];
  for (const element of document.querySelectorAll<HTMLElement>(
    '[style*="opacity"], [style*="blur"]'
  )) {
    const parkedInvisible = Number.parseFloat(element.style.opacity) === 0;
    const parkedBlurred = element.style.filter.includes("blur");
    if (!(parkedInvisible || parkedBlurred)) {
      continue;
    }
    touched.push({
      element,
      opacity: element.style.opacity,
      transform: element.style.transform,
      filter: element.style.filter,
    });
    if (parkedInvisible) {
      element.style.opacity = "1";
      if (element.style.transform) {
        element.style.transform = "none";
      }
    }
    if (parkedBlurred) {
      element.style.filter = "none";
    }
  }
  return () => {
    for (const t of touched) {
      t.element.style.opacity = t.opacity;
      t.element.style.transform = t.transform;
      t.element.style.filter = t.filter;
    }
  };
}

/**
 * html-to-image's createImage waits on requestAnimationFrame after decoding,
 * and Chrome never fires rAF in hidden tabs, so a capture started while the
 * tab is in the background hangs forever. During a capture we route rAF
 * through setTimeout, and we cap the whole capture with a timeout so the UI
 * can always fall back to "no screenshot".
 */
async function withCaptureGuards<T>(
  work: () => Promise<T>,
  timeoutMs: number
): Promise<T> {
  const originalRaf = window.requestAnimationFrame;
  const originalCancel = window.cancelAnimationFrame;
  window.requestAnimationFrame = (cb: FrameRequestCallback) =>
    window.setTimeout(() => cb(performance.now()), 16) as unknown as number;
  window.cancelAnimationFrame = (id: number) => window.clearTimeout(id);
  const restoreHidden = revealAnimationHiddenElements();
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      // Any throw from the renderer becomes a "render" failure, so callers only
      // ever have to handle CaptureFailedError.
      work().catch((error: unknown) => {
        throw error instanceof CaptureFailedError
          ? error
          : new CaptureFailedError("render", describeRenderError(error));
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new CaptureFailedError(
                "timeout",
                `screenshot render timed out after ${timeoutMs}ms`
              )
            ),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
    restoreHidden();
    window.requestAnimationFrame = originalRaf;
    window.cancelAnimationFrame = originalCancel;
  }
}

/**
 * Turn whatever the renderer rejected with into a sentence worth putting in an
 * artifact. html-to-image rejects with a DOM `Event` when a cloned element
 * fails to load, and `String(event)` is the useless `[object Event]`; naming
 * the element and its source is what makes the failure diagnosable a week later
 * from the issue file alone. Exported for tests.
 */
export function describeRenderError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof Event !== "undefined" && error instanceof Event) {
    const target = error.target;
    if (target instanceof HTMLImageElement) {
      return `failed to load image ${target.src || "(no src)"}`;
    }
    const tag =
      target instanceof HTMLElement ? target.tagName.toLowerCase() : "resource";
    return `${error.type} while loading ${tag}`;
  }
  if (typeof error === "string") {
    return error;
  }
  return "screenshot render failed";
}

export interface ColorStats {
  /** Share of the most common pixel colour, 0..1. */
  dominant: number;
  /** How many distinct colours the sample contains. */
  distinct: number;
}

/**
 * Colour statistics of an RGBA buffer. Exported for tests.
 *
 * Dominance alone is not enough to call a render failed: a real screenshot of a
 * sparse light page (a short form on white, a mostly-empty dashboard) is easily
 * 99% one colour, and treating that as a failure would throw away a perfectly
 * good screenshot — which is worse than the failure it is trying to catch. The
 * count of distinct colours separates the two cleanly: a failed render has one
 * or two, while any real page has hundreds, because downscaling blends every
 * glyph edge and border into its own shade.
 */
export function colorStats(pixels: Uint8ClampedArray): ColorStats {
  const total = Math.floor(pixels.length / 4);
  if (total === 0) {
    return { dominant: 1, distinct: 0 };
  }
  const counts = new Map<number, number>();
  let best = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    // Pack RGBA into one number (>>> 0 keeps it unsigned).
    const key =
      ((pixels[i] << 24) | (pixels[i + 1] << 16) | (pixels[i + 2] << 8) |
        pixels[i + 3]) >>> 0;
    const next = (counts.get(key) ?? 0) + 1;
    counts.set(key, next);
    if (next > best) {
      best = next;
    }
  }
  return { dominant: best / total, distinct: counts.size };
}

/** Share of the most common pixel colour, 0..1. Kept for callers that only need it. */
export function dominantColorRatio(pixels: Uint8ClampedArray): number {
  return colorStats(pixels).dominant;
}

/** Sample size (per side) used by the blank-canvas heuristic. */
const BLANK_SAMPLE = 128;

/**
 * Distinct colours a render may contain and still be called blank. A failed
 * render is one flat fill (1), sometimes with a stray border or a fringe of
 * antialiasing (a handful).
 */
export const BLANK_MAX_DISTINCT_COLORS = 4;

/**
 * True when the canvas is a single flat colour — both overwhelmingly one colour
 * AND made of almost no distinct colours. Sampled through a downscale so the
 * check costs the same on a 20 000px-tall page as on a thumbnail.
 *
 * A canvas we cannot read (no 2d context, tainted by cross-origin pixels) is
 * never reported blank: an unreadable canvas is not evidence of a failed render.
 */
function looksBlank(canvas: HTMLCanvasElement): boolean {
  try {
    const w = Math.max(1, Math.min(BLANK_SAMPLE, canvas.width));
    const h = Math.max(1, Math.min(BLANK_SAMPLE, canvas.height));
    const sample = document.createElement("canvas");
    sample.width = w;
    sample.height = h;
    const ctx = sample.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      return false;
    }
    ctx.drawImage(canvas, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    const stats = colorStats(data);
    return (
      stats.dominant > BLANK_RATIO_THRESHOLD &&
      stats.distinct <= BLANK_MAX_DISTINCT_COLORS
    );
  } catch {
    return false;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(
          new CaptureFailedError("encode", "canvas produced no PNG blob")
        );
      }
    }, "image/png");
  });
}

/**
 * A 1x1 fully transparent PNG, used in place of any image the renderer could
 * not inline. See {@link renderDocument} for why that matters.
 */
const TRANSPARENT_PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

/** Render the whole document (full scroll height) to a canvas. */
async function renderDocument(ratio: number): Promise<HTMLCanvasElement> {
  const target = document.documentElement;
  return toCanvas(target, {
    filter: shouldInclude,
    pixelRatio: ratio,
    backgroundColor: resolveBackground(),
    width: target.scrollWidth,
    height: target.scrollHeight,
    // One image the renderer cannot inline must not cost the whole screenshot.
    // By default html-to-image rejects the entire render when a cloned <img>
    // fires `error` — and it fires for every cross-origin image served without
    // an `access-control-allow-origin` header, which describes a large share of
    // real pages (CDN avatars, third-party badges, ad pixels). Measured in
    // Chromium 148 and WebKit: a single such image failed all three capture
    // modes before this. Now the image comes out blank and everything else on
    // the page is still captured — a screenshot with one gap beats no
    // screenshot at all.
    imagePlaceholder: TRANSPARENT_PIXEL,
    onImageErrorHandler: () => undefined,
  });
}

/** Render the whole document (full scroll height) to a PNG Blob. */
export function captureFullPage(options: CaptureOptions = {}): Promise<Blob> {
  return withCaptureGuards(
    async () => {
      // Full-page captures use 1x: at DPR 2 a long page produces 8-10MB PNGs,
      // which are slow to render and can exceed delivery body limits.
      const canvas = await renderDocument(1);
      if (options.detectBlank !== false && looksBlank(canvas)) {
        throw new CaptureFailedError(
          "blank",
          "screenshot render produced a blank image"
        );
      }
      return canvasToBlob(canvas);
    },
    options.timeoutMs ?? DEFAULT_CAPTURE_TIMEOUT_MS
  );
}

/**
 * Render a single element to a PNG Blob by cropping its bounding box out of a
 * full-document render. This keeps the element's real visual background
 * (gradients, images, whatever sits behind it) instead of an isolated render
 * on a flat colour, which loses non-solid backgrounds and can look black on a
 * dark page.
 */
export function captureElement(
  element: HTMLElement,
  options: CaptureOptions = {}
): Promise<Blob> {
  return withCaptureGuards(() => {
    const r = element.getBoundingClientRect();
    return cropFromDocument(
      {
        x: r.left + window.scrollX,
        y: r.top + window.scrollY,
        width: r.width,
        height: r.height,
      },
      options
    );
  }, options.timeoutMs ?? DEFAULT_CAPTURE_TIMEOUT_MS);
}

/**
 * Render the document and crop to a viewport-relative rectangle (area mode).
 * The crop accounts for the current scroll offset.
 */
export function captureArea(
  rect: AreaRect,
  options: CaptureOptions = {}
): Promise<Blob> {
  return withCaptureGuards(
    () =>
      cropFromDocument(
        {
          x: rect.x + window.scrollX,
          y: rect.y + window.scrollY,
          width: rect.width,
          height: rect.height,
        },
        options
      ),
    options.timeoutMs ?? DEFAULT_CAPTURE_TIMEOUT_MS
  );
}

/** Render the whole document once and crop to a document-relative rect. */
async function cropFromDocument(
  docRect: AreaRect,
  options: CaptureOptions
): Promise<Blob> {
  const ratio = pixelRatio();
  const canvas = await renderDocument(ratio);

  const crop = document.createElement("canvas");
  crop.width = Math.max(1, Math.round(docRect.width * ratio));
  crop.height = Math.max(1, Math.round(docRect.height * ratio));
  const ctx = crop.getContext("2d");
  if (!ctx) {
    throw new CaptureFailedError("encode", "2d context unavailable");
  }
  ctx.drawImage(
    canvas,
    Math.round(docRect.x * ratio),
    Math.round(docRect.y * ratio),
    crop.width,
    crop.height,
    0,
    0,
    crop.width,
    crop.height
  );
  // Off by default for crops: a solid-colour element or a dragged area over an
  // empty region is a legitimate screenshot, not a failed render.
  if (options.detectBlank === true && looksBlank(crop)) {
    throw new CaptureFailedError(
      "blank",
      "screenshot render produced a blank image"
    );
  }

  return canvasToBlob(crop);
}

function isTransparent(color: string): boolean {
  return !color || color === "rgba(0, 0, 0, 0)" || color === "transparent";
}

/** Nearest non-transparent ancestor background, falling back to white. */
function effectiveBackground(start: Element | null): string {
  let current = start;
  while (current) {
    const bg = getComputedStyle(current).backgroundColor;
    if (!isTransparent(bg)) {
      return bg;
    }
    current = current.parentElement;
  }
  return "#ffffff";
}

function resolveBackground(): string {
  return effectiveBackground(document.body);
}
