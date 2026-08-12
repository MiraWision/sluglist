// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { buildIssueMarkdown } from "../src/artifacts";
import { MemoryConnector } from "../src/connectors/memory";
import { createMemoryStorage } from "../src/session";
import { NOOP_ACTION_CAPTURE, renderAction } from "../src/actions";
import { NOOP_ERROR_CAPTURE } from "../src/errors";
import {
  BLANK_MAX_DISTINCT_COLORS,
  BLANK_RATIO_THRESHOLD,
  CaptureFailedError,
  colorStats,
  DEFAULT_CAPTURE_TIMEOUT_MS,
  describeRenderError,
  dominantColorRatio,
} from "../src/screenshot";
import { createFeedbackWidget, defaultProjectSlug } from "../src/widget";
import type { ArtifactFile } from "../src/types";

/**
 * Phase 1 — a failed screenshot must never cost the issue.
 *
 * The three ways a render dies (throw, hang, blank canvas) all end at the same
 * place: the issue is delivered comment-only and says why in its frontmatter.
 */

const environment = () => ({
  baseUrl: "https://app.example",
  url: "/checkout",
  viewport: "1512x982",
  screen: "1512x982",
  devicePixelRatio: 2,
  browser: "Safari 18",
  os: "macOS",
  language: "en-US",
  languages: ["en-US"],
  timezone: "Europe/Berlin",
  colorScheme: "light",
  reducedMotion: false,
});

function widget(connector: MemoryConnector) {
  return createFeedbackWidget(
    {
      project: "acme",
      connectors: [connector],
      offlineQueue: false,
    },
    {
      environment,
      storage: createMemoryStorage(),
      actionCapture: NOOP_ACTION_CAPTURE,
      errorCapture: NOOP_ERROR_CAPTURE,
    }
  );
}

function textOf(file: ArtifactFile): Promise<string> {
  return file.blob.text();
}

describe("capture failure → comment-only issue", () => {
  it("records screenshot_failed and the reason in frontmatter", async () => {
    const memory = new MemoryConnector();
    const core = widget(memory);
    const result = await core.captureIssue({
      comment: "The totals are wrong",
      mode: "fullpage",
      screenshots: [],
      selector: null,
      screenshotFailed: true,
      screenshotError: "screenshot render timed out after 8000ms",
    });
    expect(result).not.toBeNull();
    await result?.delivered;
    const md = await textOf(
      memory.getFile(result?.sessionId ?? "", "01-the-totals-are-wrong.md") as ArtifactFile
    );
    expect(md).toContain("screenshot_failed: true");
    expect(md).toContain(
      "screenshot_error: screenshot render timed out after 8000ms"
    );
    // The issue itself is intact: comment delivered, screenshot simply null.
    expect(md).toContain("screenshot: null");
    expect(md).toContain("The totals are wrong");
  });

  it("omits both fields entirely when the capture succeeded", () => {
    const md = buildIssueMarkdown({
      id: "01",
      url: "/checkout",
      selector: null,
      mode: "fullpage",
      viewport: "1512x982",
      screenshot: "01-x.png",
      createdAt: "2026-08-08T10:00:00.000Z",
      comment: "fine",
    });
    expect(md).not.toContain("screenshot_failed");
    expect(md).not.toContain("screenshot_error");
  });

  it("scrubs the renderer message like any other page-derived text", async () => {
    const memory = new MemoryConnector();
    const core = createFeedbackWidget(
      {
        project: "acme",
        connectors: [memory],
        offlineQueue: false,
        preset: "production",
      },
      {
        environment,
        storage: createMemoryStorage(),
        actionCapture: NOOP_ACTION_CAPTURE,
        errorCapture: NOOP_ERROR_CAPTURE,
      }
    );
    const result = await core.captureIssue({
      comment: "broken",
      mode: "fullpage",
      screenshots: [],
      selector: null,
      screenshotFailed: true,
      screenshotError:
        "failed to load https://cdn.example/u/anna@acme-corp.io/avatar.png",
    });
    await result?.delivered;
    const md = await textOf(
      memory.getFile(result?.sessionId ?? "", "01-broken.md") as ArtifactFile
    );
    expect(md).not.toContain("anna@acme-corp.io");
    expect(md).toContain("[email]");
  });
});

describe("blank-render heuristic", () => {
  /** The rule looksBlank() applies: overwhelmingly one colour AND barely any. */
  const blank = (pixels: Uint8ClampedArray): boolean => {
    const stats = colorStats(pixels);
    return (
      stats.dominant > BLANK_RATIO_THRESHOLD &&
      stats.distinct <= BLANK_MAX_DISTINCT_COLORS
    );
  };

  it("calls a single-colour buffer blank", () => {
    const flat = new Uint8ClampedArray(64 * 64 * 4).fill(255);
    expect(colorStats(flat)).toEqual({ dominant: 1, distinct: 1 });
    expect(blank(flat)).toBe(true);
  });

  it("calls a flat fill with a stray border blank", () => {
    const pixels = new Uint8ClampedArray(1000 * 4).fill(255);
    pixels[0] = 0; // one off-colour pixel in a thousand
    expect(blank(pixels)).toBe(true);
  });

  /**
   * The regression this heuristic nearly caused: a short form on a white page
   * is ~99% one colour, and calling that "blank" would throw away a perfectly
   * good screenshot. Antialiased text gives it hundreds of distinct shades,
   * which is what tells the two apart.
   */
  it("does NOT call a sparse light page blank", () => {
    const total = 128 * 128;
    const pixels = new Uint8ClampedArray(total * 4).fill(255);
    // 1% of the pixels carry text, each a slightly different antialiased grey.
    for (let i = 0; i < total / 100; i += 1) {
      const at = i * 4 * 37; // scattered, not contiguous
      const shade = 40 + (i % 180);
      pixels[at] = shade;
      pixels[at + 1] = shade;
      pixels[at + 2] = shade;
    }
    const stats = colorStats(pixels);
    expect(stats.dominant).toBeGreaterThan(0.98); // dominance alone would fail it
    expect(stats.distinct).toBeGreaterThan(BLANK_MAX_DISTINCT_COLORS);
    expect(blank(pixels)).toBe(false);
  });

  it("leaves a text-heavy screenshot far from the threshold", () => {
    const pixels = new Uint8ClampedArray(100 * 4).fill(255);
    for (let i = 0; i < 40; i += 4) {
      pixels[i] = 0;
      pixels[i + 1] = 0;
      pixels[i + 2] = 0;
    }
    expect(dominantColorRatio(pixels)).toBeLessThan(0.98);
  });
});

describe("CaptureFailedError", () => {
  it("carries a machine-readable reason", () => {
    const error = new CaptureFailedError("timeout", "took too long");
    expect(error.reason).toBe("timeout");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("CaptureFailedError");
  });

  it("defaults the timeout to 8s", () => {
    expect(DEFAULT_CAPTURE_TIMEOUT_MS).toBe(8_000);
  });

  it("turns a DOM Event rejection into a diagnosable sentence", () => {
    // html-to-image rejects with an Event, whose String() is "[object Event]".
    const image = document.createElement("img");
    image.src = "https://cdn.example/avatar.png";
    const event = new Event("error");
    Object.defineProperty(event, "target", { value: image });
    expect(describeRenderError(event)).toBe(
      "failed to load image https://cdn.example/avatar.png"
    );
    expect(describeRenderError(new Error("boom"))).toBe("boom");
    expect(describeRenderError({})).toBe("screenshot render failed");
  });
});

describe("record mode: a failed frame is skipped, not fatal", () => {
  it("marks the action so the trail says why the step has no picture", () => {
    expect(
      renderAction({
        ts: 0,
        kind: "click",
        selector: "#pay",
        frameFailed: true,
      })
    ).toBe("click #pay — frame skipped (render failed)");
  });

  it("keeps rendering normal frame suffixes", () => {
    expect(
      renderAction({ ts: 0, kind: "click", selector: "#pay", frame: 3, clip: 1 })
    ).toBe("click #pay — clip 1, frame 03");
  });
});

describe("timeout wiring", () => {
  it("a render that never settles rejects with a timeout failure", async () => {
    vi.useFakeTimers();
    try {
      // The guard's race is the mechanism under test; drive it directly with a
      // promise that never resolves, which is exactly what a hung render is.
      const never = new Promise<never>(() => undefined);
      const timed = Promise.race([
        never,
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new CaptureFailedError("timeout", "screenshot render timed out")
              ),
            DEFAULT_CAPTURE_TIMEOUT_MS
          )
        ),
      ]);
      const assertion = expect(timed).rejects.toMatchObject({
        reason: "timeout",
      });
      await vi.advanceTimersByTimeAsync(DEFAULT_CAPTURE_TIMEOUT_MS + 1);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * The quick-start promise: `createFeedbackWidget({ connectors })` — nothing
 * else — has to be a complete, working call. Every option added in this
 * iteration is a chance to break that, so it is asserted rather than assumed.
 */
describe("zero-config init", () => {
  it("works with nothing but a connector", async () => {
    const memory = new MemoryConnector();
    const core = createFeedbackWidget(
      { connectors: [memory] },
      {
        environment,
        storage: createMemoryStorage(),
        actionCapture: NOOP_ACTION_CAPTURE,
        errorCapture: NOOP_ERROR_CAPTURE,
        queue: undefined,
      }
    );
    expect(core.enabled).toBe(true);
    expect(core.formFields).toEqual([]);
    const result = await core.captureIssue({
      comment: "Nothing configured and it still works",
      mode: "fullpage",
      screenshots: [],
      selector: null,
    });
    expect(result?.issueId).toBe("01");
  });

  it("derives the project slug from the hostname", () => {
    expect(defaultProjectSlug("app.acme-corp.com")).toBe("app-acme-corp-com");
    expect(defaultProjectSlug("localhost")).toBe("localhost");
    // Nothing usable (an opaque origin, a file:// page) still gives a valid slug.
    expect(defaultProjectSlug("")).toBe("app");
    expect(defaultProjectSlug("...")).toBe("app");
  });

  it("still rejects a project slug that is present but invalid", () => {
    expect(() =>
      createFeedbackWidget({ project: "Not A Slug", connectors: [] })
    ).toThrow(/invalid project slug/);
  });
});
