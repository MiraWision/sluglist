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
 * using the REAL capture modules (not stubs).
 *
 * The assertion that matters: grep every byte of every artifact for each
 * original PII value and expect zero matches.
 *
 * ## Why this does not write files by default
 *
 * Artifacts carry a random session id and a wall-clock `created_at`, so writing
 * them on every run rewrote the committed `evidence/production-e2e/` folder
 * under a new name each time and left `git status` dirty after any `npm test` —
 * which is how a "clean" tree once nearly got `git reset --hard`-ed.
 *
 * Making them byte-stable is not honestly achievable: a captured stack trace
 * contains absolute paths from whichever machine ran the test. So instead the
 * assertions run against in-memory artifacts (every run, in CI, no I/O), and
 * refreshing the committed evidence is a deliberate act:
 *
 *     WRITE_EVIDENCE=1 npx vitest run test/e2e-production.test.ts
 *
 * The committed folder is additionally grepped read-only on every run, so the
 * evidence in the repo cannot rot into containing PII unnoticed.
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

/** Set WRITE_EVIDENCE=1 to refresh the committed artifacts. */
const WRITE_EVIDENCE = process.env.WRITE_EVIDENCE === "1";

/** Every artifact of the run as UTF-8 text, keyed by path — for text assertions. */
let artifacts: Map<string, string>;
/**
 * The same artifacts concatenated as latin1, for the byte-level grep. latin1 is
 * a byte-preserving round trip, so PNG payloads are searchable too — but it
 * mangles multi-byte UTF-8 (`→`, `…`), which is why text assertions use the
 * UTF-8 map above and only the ASCII-valued PII grep uses this.
 */
let allBytes: string;

describe("Phase 6 — production preset end-to-end on dirty data", () => {
  beforeAll(async () => {
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
    // 3. an uncaught exception quoting a token. The stack is written by hand:
    //    a real one would carry this machine's absolute paths and vitest
    //    internals into the committed evidence, which is both noise and mildly
    //    leaky. This looks like what a bundled app actually throws.
    const boom = new Error(`token ${JWT} rejected`);
    boom.stack = [
      `Error: token ${JWT} rejected`,
      "    at refreshSession (/assets/session-9c4b.js:184:23)",
      "    at async onSettingsMount (/assets/account-2f7a.js:96:5)",
    ].join("\n");
    window.dispatchEvent(
      new ErrorEvent("error", {
        message: `Session refresh failed for ${JWT}`,
        error: boom,
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

    // --- collect the artifacts in memory: the subject of every assertion ----
    const sessionId = result?.sessionId as string;
    const files = memory.getFiles(sessionId) as ArtifactFile[];
    artifacts = new Map();
    const bytes: string[] = [];
    for (const file of files) {
      const buf = Buffer.from(await file.blob.arrayBuffer());
      artifacts.set(file.path, buf.toString("utf8"));
      bytes.push(buf.toString("latin1"));
    }
    allBytes = bytes.join("\n");

    // --- refresh the committed evidence, only when explicitly asked --------
    if (WRITE_EVIDENCE) {
      rmSync(evidenceDir, { recursive: true, force: true });
      const sessionDir = join(evidenceDir, sessionId);
      for (const file of files) {
        const target = join(sessionDir, file.path);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, Buffer.from(await file.blob.arrayBuffer()));
      }
    }
  });

  afterAll(() => {
    document.body.innerHTML = "";
  });

  /** The one issue markdown of the session. */
  function issueMarkdown(): string {
    const entry = [...artifacts].find(([path]) => path.endsWith(".md"));
    expect(entry, "the session should contain an issue markdown").toBeDefined();
    return (entry as [string, string])[1];
  }

  it("produces a complete session", () => {
    const names = [...artifacts.keys()];
    expect(names.some((n) => n.endsWith("session.yaml"))).toBe(true);
    expect(names.some((n) => n.endsWith(".md"))).toBe(true);
    expect(names.some((n) => n.endsWith(".png"))).toBe(true);
  });

  it.each(DIRTY)("no artifact contains the original %s", (_label, value) => {
    const leaked = [...artifacts]
      .filter(([, text]) => text.includes(value))
      .map(([path]) => path);
    expect(leaked).toEqual([]);
  });

  it("captured all four error sources and scrubbed each one", () => {
    const body = issueMarkdown();
    expect(body).toContain("## Errors");
    expect(body).toContain("console: Payment declined for card [digits]");
    expect(body).toContain("exception: Session refresh failed for [token]");
    expect(body).toContain("network: GET /api/session/[token]/refresh → 404");
  });

  it("captured the action trail and scrubbed the click label and nav path", () => {
    const body = issueMarkdown();
    expect(body).toContain("## Actions");
    expect(body).toContain('click [data-testid="[email]"]');
    // The action trail truncates a click label to 40 chars BEFORE the scrub
    // runs, so a long value can be left as a harmless fragment — here the
    // phone survives only as "+1 …". See the limitations list in RUN_EVIDENCE.
    expect(body).toContain('("Notify [email] at +1 …")');
    expect(body).toContain("navigate / → /account/orders/[token]");
  });

  it("scrubbed the query string out of the issue url", () => {
    // `token=` is absorbed into the mark: `=` is part of the base64 alphabet.
    expect(issueMarkdown()).toContain(
      'url: "/account/settings?email=[email]&[token]"'
    );
  });

  it("marks the issue scrubbed and masked, and keeps developer-supplied fields", () => {
    const body = issueMarkdown();
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
    const body = issueMarkdown();
    expect(body).toContain("/api/session/");
    expect(body).toContain("/refresh");
    expect(body).toContain("/account/orders/");
    expect(body).toContain('dom_path: "main > button"');
  });

  it("the whole session greps clean, byte for byte", () => {
    // Every artifact concatenated, PNG bytes included — the acceptance check.
    expect(allBytes.length).toBeGreaterThan(0);
    for (const [label, value] of DIRTY) {
      expect(allBytes.includes(value), `the session leaked the ${label}`).toBe(
        false
      );
    }
  });

  it("the committed evidence on disk also greps clean", () => {
    // Read-only guard over what is actually in the repo: the files in
    // evidence/production-e2e/ are a snapshot from a WRITE_EVIDENCE=1 run, and
    // this makes sure that snapshot can never quietly contain PII.
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = join(dir, entry.name);
        return entry.isDirectory() ? walk(full) : [full];
      });
    const all = walk(evidenceDir);
    expect(all.length, "evidence/production-e2e/ should not be empty").toBeGreaterThan(0);
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

  it("the committed evidence carries no absolute paths from a developer machine", () => {
    const md = readdirSync(evidenceDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .flatMap((dir) =>
        readdirSync(join(evidenceDir, dir.name))
          .filter((f) => f.endsWith(".md"))
          .map((f) => readFileSync(join(evidenceDir, dir.name, f), "utf8"))
      );
    expect(md.length).toBeGreaterThan(0);
    for (const body of md) {
      expect(body).not.toContain("/Users/");
      expect(body).not.toContain("node_modules");
    }
  });
});
