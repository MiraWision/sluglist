import { describe, expect, it, vi } from "vitest";
import { MemoryConnector } from "../src/connectors/memory";
import { NOOP_ACTION_CAPTURE, type ActionCapture } from "../src/actions";
import { NOOP_ERROR_CAPTURE, type ErrorCapture } from "../src/errors";
import { createMemoryStorage } from "../src/session";
import type { ArtifactFile, FeedbackWidgetConfig } from "../src/types";
import { createFeedbackWidget } from "../src/widget";

/**
 * The production preset end to end, on deliberately dirty data: a page whose
 * button text, error log, request path and query string all carry PII. The
 * contract is that none of the original values survive into an artifact — and
 * that a dev-preset run of the same input is untouched.
 */

// --- dirty inputs, referenced by both the positive and negative assertions ---
const EMAIL = "anna.smirnova@acme-corp.io";
const PHONE = "+1 555 010 4477";
const CARD = "4111 1111 1111 1111";
const JWT =
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI0MiJ9.TJVA95OrM7E2cBab30RMHrHDcEfxjoYZgeFONFh7HgQ";

const dirtyEnvironment = () => ({
  baseUrl: "https://app.acme.example",
  url: `/account/settings?email=${EMAIL}`,
  viewport: "1512x982",
  screen: "1512x982",
  devicePixelRatio: 2,
  browser: "Chrome 138",
  os: "macOS",
  language: "en-US",
  languages: ["en-US"],
  timezone: "Europe/Berlin",
  colorScheme: "light",
  reducedMotion: false,
});

const dirtyErrors: ErrorCapture = {
  ...NOOP_ERROR_CAPTURE,
  snapshot: () => [
    {
      ts: 1_000,
      source: "console" as const,
      message: `Failed to notify ${EMAIL} at ${PHONE}`,
    },
    {
      ts: 1_500,
      source: "exception" as const,
      message: `Payment declined for card ${CARD}`,
      stack: `Error: declined\n    at charge (billing.js:1284:17) token=${JWT}`,
    },
    {
      ts: 2_000,
      source: "network" as const,
      message: `GET /api/session/${JWT}/refresh → 401 (12ms)`,
    },
  ],
};

const dirtyActions: ActionCapture = {
  ...NOOP_ACTION_CAPTURE,
  snapshot: () => [
    {
      ts: 1_200,
      kind: "click" as const,
      selector: `[data-testid="row-${EMAIL}"]`,
      elementText: `Email ${EMAIL}`,
    },
    {
      ts: 1_800,
      kind: "navigate" as const,
      from: "/account",
      to: `/account/orders/${JWT}`,
    },
    { ts: 1_900, kind: "type" as const, selector: "#phone", chars: 15 },
  ],
};

function widgetWith(config: Partial<FeedbackWidgetConfig>) {
  const memory = new MemoryConnector();
  const core = createFeedbackWidget(
    { project: "acme", connectors: [memory], ...config },
    {
      storage: createMemoryStorage(),
      environment: dirtyEnvironment,
      errorCapture: dirtyErrors,
      actionCapture: dirtyActions,
    }
  );
  return { core, memory };
}

async function captureAndDump(config: Partial<FeedbackWidgetConfig>) {
  const { core, memory } = widgetWith(config);
  const result = await core.captureIssue({
    comment: "Checkout fails on the settings page",
    mode: "element",
    selector: `[data-testid="row-${EMAIL}"]`,
    elementText: `Contact ${EMAIL} or call ${PHONE}`,
    domPath: "div > main > section > button",
  });
  await result?.delivered;
  const sessionId = result?.sessionId as string;
  const texts = await Promise.all(
    memory.getFiles(sessionId).map((f: ArtifactFile) => f.blob.text())
  );
  return { all: texts.join("\n"), core };
}

describe("preset production — privacy resolution", () => {
  const base = { project: "acme", connectors: [] };

  it("turns on masking, consent and text scrubbing", async () => {
    const { resolvePrivacy } = await import("../src/preset");
    expect(resolvePrivacy({ ...base, preset: "production" })).toEqual({
      maskInputs: true,
      screenshotConsent: true,
      scrubText: true,
    });
  });

  it("an explicit privacy option still overrides the preset", async () => {
    const { resolvePrivacy } = await import("../src/preset");
    expect(
      resolvePrivacy({
        ...base,
        preset: "production",
        privacy: { scrubText: false },
      })
    ).toEqual({
      maskInputs: true,
      screenshotConsent: true,
      scrubText: false,
    });
  });

  it("scrubText is available without the preset", async () => {
    const { resolvePrivacy } = await import("../src/preset");
    expect(
      resolvePrivacy({ ...base, privacy: { scrubText: true } })
    ).toEqual({ scrubText: true });
  });
});

describe("preset production — errors and dismiss", () => {
  const base = { project: "acme", connectors: [] };

  it("forces captureWarnings off and says so when asked for it", async () => {
    const { resolveErrors } = await import("../src/preset");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(
      resolveErrors({
        ...base,
        preset: "production",
        errors: { captureWarnings: true, bufferSize: 50 },
      })
    ).toEqual({ captureWarnings: false, bufferSize: 50 });
    expect(warn).toHaveBeenCalledWith(
      "[sluglist] preset production forces errors.captureWarnings: false"
    );
    warn.mockRestore();
  });

  it("leaves error options untouched outside production", async () => {
    const { resolveErrors } = await import("../src/preset");
    expect(
      resolveErrors({ ...base, preset: "beta", errors: { captureWarnings: true } })
    ).toEqual({ captureWarnings: true });
    expect(resolveErrors({ ...base })).toBeUndefined();
  });

  it("enables dismiss in production and nowhere else", async () => {
    const { resolveDismiss } = await import("../src/preset");
    expect(resolveDismiss({ ...base, preset: "production" })).toEqual({
      enabled: true,
      days: 7,
    });
    expect(resolveDismiss({ ...base, preset: "beta" })).toEqual({
      enabled: false,
      days: 7,
    });
    expect(
      resolveDismiss({ ...base, dismiss: { enabled: true, days: 0 } })
    ).toEqual({ enabled: true, days: 0 });
  });
});

describe("production preset — artifacts are scrubbed", () => {
  it("no original PII value survives into any artifact", async () => {
    const { all } = await captureAndDump({ preset: "production" });
    // The grep contract: every dirty input, gone.
    expect(all).not.toContain(EMAIL);
    expect(all).not.toContain(PHONE);
    expect(all).not.toContain(CARD);
    expect(all).not.toContain(JWT);
  });

  it("replaces them with the documented marks", async () => {
    const { all } = await captureAndDump({ preset: "production" });
    expect(all).toContain("[email]");
    expect(all).toContain("[digits]");
    expect(all).toContain("[token]");
  });

  it("scrubs every surface: element_text, url, errors, actions", async () => {
    const { all } = await captureAndDump({ preset: "production" });
    // Frontmatter values are YAML-quoted when they contain `[`, `?` or `>`.
    expect(all).toContain('element_text: "Contact [email] or call +[digits]"');
    expect(all).toContain('url: "/account/settings?email=[email]"');
    expect(all).toContain("console: Failed to notify [email] at +[digits]");
    expect(all).toContain("exception: Payment declined for card [digits]");
    expect(all).toContain("network: GET /api/session/[token]/refresh → 401");
    // `row-anna.smirnova@…` is a valid address local-part, so the whole thing
    // — prefix included — is one email match.
    expect(all).toContain('click [data-testid="[email]"] ("Email [email]")');
    expect(all).toContain("navigate /account → /account/orders/[token]");
  });

  it("keeps the readable parts of paths and stacks intact", async () => {
    const { all } = await captureAndDump({ preset: "production" });
    // The scrub must not eat what makes an artifact useful.
    expect(all).toContain("/api/session/");
    expect(all).toContain("/refresh");
    expect(all).toContain("at charge (billing.js:1284:17)");
    expect(all).toContain('dom_path: "div > main > section > button"');
    // The reporter's own comment is deliberately never scrubbed.
    expect(all).toContain("Checkout fails on the settings page");
  });

  it("marks the issue with scrubbed: true", async () => {
    const { all } = await captureAndDump({ preset: "production" });
    expect(all).toContain("scrubbed: true");
  });
});

describe("dev preset — regression: nothing is scrubbed", () => {
  it("leaves every value verbatim", async () => {
    const { all } = await captureAndDump({});
    expect(all).toContain(EMAIL);
    expect(all).toContain(PHONE);
    expect(all).toContain(CARD);
    expect(all).toContain(JWT);
  });

  it("emits no scrubbed field and no masked field", async () => {
    const { all } = await captureAndDump({});
    expect(all).not.toContain("scrubbed:");
    expect(all).not.toContain("masked:");
  });

  it("beta without an explicit scrubText also stays unscrubbed and unmarked", async () => {
    const { all } = await captureAndDump({ preset: "beta" });
    expect(all).toContain(EMAIL);
    expect(all).not.toContain("scrubbed:");
  });

  it("scrubText: false is recorded explicitly as scrubbed: false", async () => {
    const { all } = await captureAndDump({
      preset: "production",
      privacy: { scrubText: false },
    });
    expect(all).toContain("scrubbed: false");
    expect(all).toContain(EMAIL);
  });
});
