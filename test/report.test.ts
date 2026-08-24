import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildFixesYaml, buildSessionYaml } from "../src/artifacts";
import { normalizeChecklist, seedChecklistState } from "../src/checklist";
import { readSession } from "../src/node/read";
import {
  buildReport,
  esc,
  formatDate,
  renderBody,
  takeSection,
  truncate,
} from "../src/cli/report";

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
  /** Session id, so a test can write two sessions side by side. */
  id?: string;
} = {}): string {
  const sessionId = options.id ?? "session-2026-08-11-aaaa";
  const session = join(dir, sessionId);
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
        "",
        "## Actions",
        "- [22s before report] navigate /dashboard → /reports",
        "- [4s before report] click button#print (\"Print\")",
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
      session_id: sessionId,
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

  it("carries print styles and the image viewer", async () => {
    const { html } = await report({ withEvidence: true });
    expect(html).toContain("@media print");
    // A plain overlay, not <dialog>: the top layer is invisible in some of the
    // preview panes this file gets opened in.
    expect(html).toContain('<div class="lightbox" id="lightbox"');
    expect(html).not.toContain("showModal");
    expect(html).toContain("lb-prev");
    // Spoilers have to open on paper, or the trail silently disappears.
    expect(html).toContain("beforeprint");
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
    expect(html).toContain("1 report filed");
  });

  it("renders a checklist session with no issues", async () => {
    const { html } = await report({ withIssue: false });
    expect(html).toContain("None filed.");
    expect(html).toContain("0 reports filed");
  });

  it("states the artifact format version in the footer", async () => {
    const { html } = await report();
    expect(html).toContain("Artifact format 1.8");
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

describe("buildReport — the article shape", () => {
  it("folds the metadata and the action trail into a spoiler", async () => {
    const { html } = await report({});

    // Above the fold, three tags and no metadata table.
    expect(html).toContain('<div class="tags">');
    expect(html).toContain('<details class="details">');
    expect(html).toContain("Details and action trail");
    // The trail is evidence, so it is folded, never dropped.
    expect(html).toContain('class="trail"');
    expect(html).toContain('class="meta-table"');
    // …and the fields that used to be a flat line are inside the table,
    // labelled the way a client reads rather than the way YAML is keyed.
    expect(html).toContain("<dt>Page</dt>");
    expect(html).toContain("<dt>Checklist item</dt>");
    expect(html).not.toContain("<dt>url</dt>");
    // Session context travels with each report, so a merged file keeps it.
    expect(html).toContain("<dt>Session</dt>");
    // An empty field is dropped rather than printed as a blank row.
    expect(html).not.toContain("<dt>Selector</dt>");
  });

  it("counts checks proved with a screenshot in the summary", async () => {
    const { html } = await report({ withEvidence: true });
    expect(html).toMatch(/\d+ of \d+ checks proved with a screenshot/);
  });
});

describe("takeSection", () => {
  it("pulls one section out and leaves the rest untouched", () => {
    const body = [
      "The save button does nothing.",
      "",
      "## Errors",
      "- console: PATCH 500",
      "",
      "## Actions",
      "- [12s before report] click #save",
      "- [2s before report] submit form",
    ].join("\n");

    const { rest, lines } = takeSection(body, "Actions");

    expect(lines).toHaveLength(2);
    expect(rest).toContain("## Errors");
    expect(rest).not.toContain("## Actions");
    expect(rest).toContain("The save button does nothing.");
  });

  it("is a no-op when the section is absent", () => {
    const { rest, lines } = takeSection("Just a comment.", "Actions");
    expect(lines).toEqual([]);
    expect(rest).toBe("Just a comment.");
  });
});

describe("buildReport — several sessions", () => {
  it("merges them into one article, ordered by when each was written", async () => {
    // Two sessions whose ids sort one way and whose reports sort the other:
    // an August 18th report delivered on the 24th must still come first.
    const late = writeSession({ id: "session-2026-08-11-late" });
    const early = writeSession({ id: "session-2026-08-01-early" });
    writeFileSync(
      join(early, "01-export-button-missing.md"),
      readFileSync(join(early, "01-export-button-missing.md"), "utf8").replace(
        "created_at: 2026-08-11T10:00:00Z",
        "created_at: 2026-08-01T09:00:00Z"
      )
    );

    const { html } = await buildReport([
      await readSession(late),
      await readSession(early),
    ]);

    expect(html).toContain("2 reports from 2 sessions");
    expect(html).toContain("1 August 2026, 09:00 UTC – 11 August 2026, 10:00 UTC");
    // Both reports are present, and the one written first comes first —
    // "1 August" is a substring of "11 August", so compare the tag markup.
    const early01 = html.indexOf(">1 August 2026, 09:00 UTC<");
    const late11 = html.indexOf(">11 August 2026, 10:00 UTC<");
    expect(early01).toBeGreaterThan(-1);
    expect(late11).toBeGreaterThan(-1);
    expect(early01).toBeLessThan(late11);
  });

  it("still renders a single session the way it always did", async () => {
    const { html } = await report({});
    // The single-session header says what the file holds and where it came
    // from — the same facts the merged one states about many.
    expect(html).toContain("3 checks and 1 report on http://localhost:5000.");
    expect(html).toContain("<code>session-2026-08-11-aaaa</code>");
    expect(html).not.toContain("from 1 sessions");
  });
});

describe("buildReport — author titles", () => {
  it("prefers a titles entry and keeps the comment verbatim", async () => {
    const dir = writeSession({});
    const bundle = await readSession(dir);
    const titles = new Map([
      [
        "session-2026-08-11-aaaa/01-export-button-missing.md",
        "The Reports toolbar has no export",
      ],
    ]);

    const { html } = await buildReport([bundle], { titles });

    expect(html).toContain("The Reports toolbar has no export");
    // The heading never swallows the reporter's own words.
    expect(html).toContain(
      "Expected an Export button on /reports; the toolbar only has Print."
    );
  });

  it("falls back to the first sentence without one", async () => {
    const { html } = await report({});
    expect(html).toContain("Expected an Export button on /reports");
  });
});
