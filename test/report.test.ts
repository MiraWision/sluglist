import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildFixesYaml, buildSessionYaml } from "../src/artifacts";
import { normalizeChecklist, seedChecklistState } from "../src/checklist";
import { readSession } from "../src/node/read";
import { buildReport, esc, formatDate, renderBody, truncate } from "../src/cli/report";

/**
 * The report is the artifact a client actually receives, so these tests police
 * the two promises made about it: it is SELF-CONTAINED (nothing is fetched when
 * it is opened) and it is COMPLETE (every verdict, note, issue and fix status
 * in the session appears in the document).
 */

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "sluglist-report-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const REAL_PNG = readFileSync("evidence/capture-matrix/chromium-element.png");

function writeSession(options: {
  withChecklist?: boolean;
  withEvidence?: boolean;
  withFixes?: boolean;
  withIssue?: boolean;
  intent?: string;
} = {}): string {
  const session = join(dir, "session-2026-08-11-aaaa");
  mkdirSync(session, { recursive: true });

  let checklistState;
  if (options.withChecklist !== false) {
    const def = normalizeChecklist({
      id: "release-1",
      title: "Release checks",
      ...(options.intent ? { intent: options.intent } : {}),
      sections: [
        {
          title: "Reports",
          items: [
            { id: "export-downloads-xlsx", title: "Export downloads an xlsx" },
            { id: "header-visible", title: "Header is visible" },
            { id: "untested-item", title: "Ambiguous item" },
          ],
        },
      ],
    });
    if (!def) {
      throw new Error("checklist did not normalize");
    }
    checklistState = seedChecklistState(def);
    checklistState.items[0].verdict = "fail";
    checklistState.items[0].issue = "01";
    checklistState.items[0].ts = "2026-08-11T10:00:00Z";
    checklistState.items[1].verdict = "pass";
    checklistState.items[1].ts = "2026-08-11T10:01:00Z";
    if (options.withEvidence) {
      writeFileSync(join(session, "ev-header-visible-01.png"), REAL_PNG);
      checklistState.items[1].evidence = {
        screenshots: ["ev-header-visible-01.png"],
        note: "Header rendered on /dashboard; counter went 4 to 5",
      };
    }
  }

  const issues = [];
  if (options.withIssue !== false) {
    writeFileSync(join(session, "01-export-button-missing.png"), REAL_PNG);
    writeFileSync(
      join(session, "01-export-button-missing.md"),
      [
        "---",
        'id: "01"',
        "url: /reports",
        "selector: null",
        "mode: fullpage",
        "category: bug",
        "checklist_item: export-downloads-xlsx",
        "viewport: 1280x800",
        "screenshot: 01-export-button-missing.png",
        "created_at: 2026-08-11T10:00:00Z",
        "---",
        "",
        "Expected an Export button on /reports; the toolbar only has Print.",
        "",
        "Steps: open /reports and look at the toolbar.",
        "",
        "## Errors",
        "- [2s before report] console: TypeError in toolbar.js",
      ].join("\n")
    );
    issues.push({
      id: "01",
      file: "01-export-button-missing.md",
      screenshot: "01-export-button-missing.png",
      category: "bug",
      url: "/reports",
      selector: null,
      created_at: "2026-08-11T10:00:00Z",
    });
  }

  writeFileSync(
    join(session, "session.yaml"),
    buildSessionYaml({
      project: "demo",
      session_id: "session-2026-08-11-aaaa",
      created_at: "2026-08-11T10:00:00Z",
      base_url: "http://localhost:5000",
      browser: "Node 22.0.0",
      os: "macOS",
      viewport: "1280x800",
      device_pixel_ratio: 1,
      reporter: { name: "qa-agent", kind: "agent" },
      ...(checklistState ? { checklist: checklistState } : {}),
      issues,
    })
  );

  if (options.withFixes) {
    writeFileSync(
      join(session, "fixes.yaml"),
      buildFixesYaml({
        fixed_by: { name: "fix-agent", kind: "agent" },
        items: [
          {
            issue: "01",
            status: "fixed",
            commit: "4be0b62",
            note: "Export button restored in the Reports toolbar",
            checklist_item: "export-downloads-xlsx",
            ts: "2026-08-11T11:00:00Z",
          },
        ],
      })
    );
  }

  return session;
}

async function report(options: Parameters<typeof writeSession>[0] = {}) {
  const bundle = await readSession(writeSession(options));
  return await buildReport(bundle);
}

describe("buildReport — self-containment", () => {
  it("references nothing outside the file", async () => {
    const { html } = await report({ withEvidence: true, withFixes: true });
    // No stylesheet/script/iframe/font that would trigger a request.
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/<iframe\b/i);
    expect(html).not.toMatch(/@import/i);
    expect(html).not.toMatch(/<script[^>]+src=/i);
    // Every src is a data: URI.
    for (const [, value] of html.matchAll(/\ssrc="([^"]*)"/g)) {
      expect(value === "" || value.startsWith("data:")).toBe(true);
    }
    // Every href is an in-document anchor.
    for (const [, value] of html.matchAll(/\shref="([^"]*)"/g)) {
      expect(value.startsWith("#")).toBe(true);
    }
  });

  it("inlines images as data URIs", async () => {
    const { html } = await report({ withEvidence: true });
    const sources = [...html.matchAll(/\ssrc="(data:[^;]+);base64,/g)].map(
      (m) => m[1]
    );
    expect(sources.length).toBeGreaterThanOrEqual(2);
    for (const mime of sources) {
      expect(["data:image/jpeg", "data:image/png"]).toContain(mime);
    }
  });

  it("is a complete HTML document", async () => {
    const { html } = await report();
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<html lang="en">');
    expect(html.trimEnd().endsWith("</html>")).toBe(true);
  });

  it("carries print styles and a lightbox dialog", async () => {
    const { html } = await report({ withEvidence: true });
    expect(html).toContain("@media print");
    expect(html).toContain('<dialog id="lightbox">');
    expect(html).toContain("showModal");
  });
});

describe("buildReport — content", () => {
  it("shows the header facts", async () => {
    const { html } = await report({ intent: "smoke" });
    expect(html).toContain("Release checks");
    expect(html).toContain("11 August 2026");
    expect(html).toContain("http://localhost:5000");
    expect(html).toContain("qa-agent");
    expect(html).toContain("smoke");
    expect(html).toContain("session-2026-08-11-aaaa");
  });

  it("counts verdicts, treating a null verdict as not tested", async () => {
    const { html } = await report();
    const tile = (label: string): string => {
      const match = new RegExp(
        `<span class="n">(\\d+)</span><span class="l">${label}</span>`
      ).exec(html);
      return match?.[1] ?? "";
    };
    expect(tile("pass")).toBe("1");
    expect(tile("fail")).toBe("1");
    expect(tile("not tested")).toBe("1");
  });

  it("renders evidence notes and thumbnails for a pass", async () => {
    const { html } = await report({ withEvidence: true });
    expect(html).toContain("Observed");
    expect(html).toContain("Header rendered on /dashboard; counter went 4 to 5");
    expect(html).toContain("ev-header-visible-01.png");
  });

  it("links a failed item to its issue", async () => {
    const { html } = await report();
    expect(html).toContain('href="#issue-01"');
    expect(html).toContain('id="issue-01"');
  });

  it("shows fix status from fixes.yaml on the issue", async () => {
    const { html } = await report({ withFixes: true });
    expect(html).toContain("badge-fix-fixed");
    expect(html).toContain("Export button restored in the Reports toolbar");
    expect(html).toContain("4be0b62");
    expect(html).toContain("1 of 1 resolved");
  });

  it("omits fix markup when there is no fixes.yaml", async () => {
    const { html } = await report();
    // The class definitions always live in the inlined CSS; what must be
    // absent is any USE of them in the document body.
    expect(html).not.toContain('class="badge badge-fix-');
    expect(html).not.toContain('class="fix fix-');
    expect(html).not.toContain("resolved");
  });

  it("renders the issue body, including the Errors section", async () => {
    const { html } = await report();
    expect(html).toContain("Steps: open /reports and look at the toolbar.");
    expect(html).toContain("<h4>Errors</h4>");
    expect(html).toContain("TypeError in toolbar.js");
  });

  it("renders a session with issues but no checklist", async () => {
    const { html } = await report({ withChecklist: false });
    expect(html).not.toContain('class="checklist"');
    expect(html).toContain('id="issue-01"');
    expect(html).toContain("1 issue filed");
  });

  it("renders a checklist session with no issues", async () => {
    const { html } = await report({ withIssue: false });
    expect(html).toContain("None filed.");
    expect(html).toContain("0 issues filed");
  });

  it("states the artifact format version in the footer", async () => {
    const { html } = await report();
    expect(html).toContain("Artifact format 1.7");
    expect(html).toContain("generated by <b>sluglist</b>");
  });

  it("warns about a referenced image that is missing", async () => {
    const session = writeSession({ withEvidence: true });
    rmSync(join(session, "ev-header-visible-01.png"));
    const result = await buildReport(await readSession(session));
    expect(result.warnings.join(" ")).toContain("ev-header-visible-01.png");
    // The note survives even though its screenshot is gone.
    expect(result.html).toContain("counter went 4 to 5");
  });

  it("stays well inside the size budget for a typical session", async () => {
    const { bytes, degraded } = await report({
      withEvidence: true,
      withFixes: true,
    });
    expect(degraded).toBe(false);
    expect(bytes).toBeLessThan(8 * 1024 * 1024);
  });
});

describe("escaping", () => {
  it("escapes HTML metacharacters", () => {
    expect(esc('<script>alert("x")</script>')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"
    );
  });

  it("escapes a hostile checklist title rather than injecting it", async () => {
    const session = join(dir, "session-2026-08-11-bbbb");
    mkdirSync(session, { recursive: true });
    const def = normalizeChecklist({
      id: "x1",
      title: '</h1><img src=x onerror=alert(1)>',
      sections: [{ title: "S", items: [{ id: "a", title: "<b>bold</b>" }] }],
    });
    if (!def) {
      throw new Error("checklist did not normalize");
    }
    writeFileSync(
      join(session, "session.yaml"),
      buildSessionYaml({
        project: "demo",
        session_id: "session-2026-08-11-bbbb",
        created_at: "2026-08-11T10:00:00Z",
        base_url: "",
        browser: "Node",
        os: "macOS",
        viewport: "",
        device_pixel_ratio: 1,
        checklist: seedChecklistState(def),
        issues: [],
      })
    );
    const { html } = await buildReport(await readSession(session));
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<b>bold</b>");
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt;");
  });
});

describe("formatting helpers", () => {
  it("formats an ISO timestamp in UTC", () => {
    expect(formatDate("2026-08-11T16:29:29Z")).toBe("11 August 2026, 16:29 UTC");
  });

  it("passes through an unparseable date", () => {
    expect(formatDate("not a date")).toBe("not a date");
  });

  it("truncates on a word boundary with an ellipsis", () => {
    expect(truncate("short", 20)).toBe("short");
    const out = truncate(
      "Expected an Export button on the reports toolbar but there was none",
      40
    );
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(41);
    // Never cuts mid-word.
    expect(out.slice(0, -1).trimEnd().split(" ").at(-1)).not.toBe("tool");
  });

  it("renders headings, lists and paragraphs", () => {
    const html = renderBody("First line.\n\n## Errors\n- one\n- two");
    expect(html).toContain("<p>First line.</p>");
    expect(html).toContain("<h4>Errors</h4>");
    expect(html).toContain("<li>one</li>");
  });

  it("returns nothing for an empty body", () => {
    expect(renderBody("   ")).toBe("");
  });
});
