// @vitest-environment jsdom
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { Buffer } from "node:buffer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createActionCapture } from "../src/actions";
import { createErrorCapture } from "../src/errors";
import { MemoryConnector } from "../src/connectors/memory";
import { createMemoryStorage } from "../src/session";
import type { ArtifactFile } from "../src/types";
import { createFeedbackWidget } from "../src/widget";

/**
 * Phase 6 end-to-end: drive a full production-preset session over a page whose
 * button labels, console output, request paths and query string are all dirty,
 * using the REAL capture modules (not stubs), and write the artifacts to
 * `evidence/production-e2e/` so they can be inspected outside the test.
 *
 * The assertion that matters is the last one: grep every byte of every artifact
 * for each original PII value and expect zero matches.
 */

const evidenceDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "evidence",
  "production-e2e"
);

// --- the dirty page ----------------------------------------------------------
const EMAIL = "anna.smirnova@acme-corp.io";
const PHONE = "+1 555 010 4477";
const CARD = "4111 1111 1111 1111";
const JWT =
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI0MiJ9.TJVA95OrM7E2cBab30RMHrHDcEfxjoYZgeFONFh7HgQ";
const API_KEY = "sk-live-9f86d081884c7d659a2feaa0c55ad015";

/** Every original value that must not survive into an artifact. */
const DIRTY: [string, string][] = [
  ["email", EMAIL],
  ["phone", PHONE],
  ["card", CARD],
  ["jwt", JWT],
  ["api key", API_KEY],
];

const testEnvironment = () => ({
  baseUrl: "https://app.acme.example",
  url: `/account/settings?email=${EMAIL}&token=${API_KEY}`,
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

/** A four-byte PNG stand-in: jsdom cannot render, but the layout is real. */
function png(): Blob {
  return new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });
}

let written: string[] = [];

describe("Phase 6 — production preset end-to-end on dirty data", () => {
  beforeAll(async () => {
    rmSync(evidenceDir, { recursive: true, force: true });
    mkdirSync(evidenceDir, { recursive: true });

    // A page with PII in visible text and in an element id.
    document.body.innerHTML = `
      <main>
        <h1>Account settings</h1>
        <button id="notify" data-testid="notify-${EMAIL}">
          Notify ${EMAIL} at ${PHONE}
        </button>
        <a id="orders" href="/account/orders">Orders</a>
      </main>
    `;

    // A fetch that 404s on a path carrying a token — the real wrapper records it.
    const notFound = () =>
      Promise.resolve(new Response("nope", { status: 404 }));
    globalThis.fetch = notFound as unknown as typeof fetch;

    // Real capture modules, exactly as a browser would install them.
    const errorCapture = createErrorCapture({});
    const actionCapture = createActionCapture({});

    const memory = new MemoryConnector();
    const core = createFeedbackWidget(
      {
        project: "acme",
        connectors: [memory],
        preset: "production",
        identity: { email: "qa@acme.example", name: "QA" },
        custom: { build: "2026.07.31" },
      },
      {
        storage: createMemoryStorage(),
        environment: testEnvironment,
        errorCapture,
        actionCapture,
      }
    );
    core.setContext({ tenant: "acme-eu" });

    // --- what the reporter does before filing -------------------------------
    // 1. clicks the button whose label contains an email and a phone
    (document.querySelector("#notify") as HTMLElement).click();
    // 2. the app logs an error quoting a card number
    console.error(`Payment declined for card ${CARD}`);
    // 3. an uncaught exception quoting a token
    window.dispatchEvent(
      new ErrorEvent("error", {
        message: `Session refresh failed for ${JWT}`,
        error: new Error(`token ${JWT} rejected`),
      })
    );
    // 4. a request to a path with a token in it, which 404s
    await fetch(`/api/session/${JWT}/refresh`);
    // 5. an SPA navigation to a path carrying an api key
    history.pushState({}, "", `/account/orders/${API_KEY}`);

    const result = await core.captureIssue({
      comment: "The notify button does nothing on the settings page",
      mode: "element",
      selector: `[data-testid="notify-${EMAIL}"]`,
      elementText: `Notify ${EMAIL} at ${PHONE}`,
      domPath: "main > button",
      screenshot: png(),
      masked: true,
    });
    await result?.delivered;

    errorCapture.uninstall();
    actionCapture.uninstall();

    // --- write the artifacts out for inspection ----------------------------
    const sessionId = result?.sessionId as string;
    const sessionDir = join(evidenceDir, sessionId);
    mkdirSync(sessionDir, { recursive: true });
    for (const file of memory.getFiles(sessionId) as ArtifactFile[]) {
      const target = join(sessionDir, file.path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, Buffer.from(await file.blob.arrayBuffer()));
      written.push(target);
    }
  });

  afterAll(() => {
    document.body.innerHTML = "";
  });

  it("wrote a complete session to evidence/production-e2e/", () => {
    const names = written.map((p) => relative(evidenceDir, p));
    expect(names.some((n) => n.endsWith("session.yaml"))).toBe(true);
    expect(names.some((n) => n.endsWith(".md"))).toBe(true);
    expect(names.some((n) => n.endsWith(".png"))).toBe(true);
  });

  it.each(DIRTY)("no artifact contains the original %s", (_label, value) => {
    const hits = written.filter((path) =>
      readFileSync(path, "utf8").includes(value)
    );
    expect(hits).toEqual([]);
  });

  it("captured all four error sources and scrubbed each one", () => {
    const md = written.find((p) => p.endsWith(".md")) as string;
    const body = readFileSync(md, "utf8");
    expect(body).toContain("## Errors");
    expect(body).toContain("console: Payment declined for card [digits]");
    expect(body).toContain("exception: Session refresh failed for [token]");
    expect(body).toContain("network: GET /api/session/[token]/refresh → 404");
  });

  it("captured the action trail and scrubbed the click label and nav path", () => {
    const md = written.find((p) => p.endsWith(".md")) as string;
    const body = readFileSync(md, "utf8");
    expect(body).toContain("## Actions");
    expect(body).toContain('click [data-testid="[email]"]');
    // The action trail truncates a click label to 40 chars BEFORE the scrub
    // runs, so a long value can be left as a harmless fragment — here the
    // phone survives only as "+1 …". See the limitations list in RUN_EVIDENCE.
    expect(body).toContain('("Notify [email] at +1 …")');
    expect(body).toContain("navigate / → /account/orders/[token]");
  });

  it("scrubbed the query string out of the issue url", () => {
    const md = written.find((p) => p.endsWith(".md")) as string;
    // `token=` is absorbed into the mark: `=` is part of the base64 alphabet.
    expect(readFileSync(md, "utf8")).toContain(
      'url: "/account/settings?email=[email]&[token]"'
    );
  });

  it("marks the issue scrubbed and masked, and keeps developer-supplied fields", () => {
    const md = written.find((p) => p.endsWith(".md")) as string;
    const body = readFileSync(md, "utf8");
    expect(body).toContain("scrubbed: true");
    expect(body).toContain("masked: true");
    // Values the host set deliberately are untouched.
    expect(body).toContain('email: "qa@acme.example"');
    expect(body).toContain("build: 2026.07.31");
    expect(body).toContain("tenant: acme-eu");
    // And so is the reporter's own comment.
    expect(body).toContain("The notify button does nothing on the settings page");
  });

  it("leaves the artifacts readable — paths and structure survive", () => {
    const md = written.find((p) => p.endsWith(".md")) as string;
    const body = readFileSync(md, "utf8");
    expect(body).toContain("/api/session/");
    expect(body).toContain("/refresh");
    expect(body).toContain("/account/orders/");
    expect(body).toContain('dom_path: "main > button"');
  });

  it("the whole evidence tree greps clean", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = join(dir, entry.name);
        return entry.isDirectory() ? walk(full) : [full];
      });
    const all = walk(evidenceDir);
    expect(all.length).toBeGreaterThan(0);
    for (const file of all) {
      const content = readFileSync(file, "latin1");
      for (const [label, value] of DIRTY) {
        expect(
          content.includes(value),
          `${relative(evidenceDir, file)} leaked the ${label}`
        ).toBe(false);
      }
    }
  });
});
