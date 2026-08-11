import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse as realParse } from "yaml";
import { buildFixesYaml, buildSessionYaml } from "../src/artifacts";
import { normalizeChecklist, seedChecklistState } from "../src/checklist";
import { parseIssueMarkdown, parseYaml } from "../src/node/read";

/**
 * The reader is hand-rolled, so its correctness is established by DIFFERENTIAL
 * testing: for every artifact this package can produce, `parseYaml` must return
 * exactly what a real YAML implementation returns. If the two ever disagree,
 * the reader is wrong — not the reference.
 */

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walk(path, out);
    } else if (name.endsWith(".yaml") || name.endsWith(".yml")) {
      out.push(path);
    }
  }
  return out;
}

/**
 * One committed artifact contains `viewport: 0x0` (the mobile graceful-mode
 * degenerate case), which the serializer emits BARE. A spec-compliant YAML
 * parser reads `0x0` as hexadecimal zero, so the reference returns the number
 * 0 where the writer meant the string "0x0". Our reader deliberately does not
 * implement hex/octal — every artifact value that could take those forms is a
 * viewport-like string — so it returns "0x0". The divergence is asserted
 * explicitly below rather than hidden, and the underlying serializer gap is
 * recorded in RUN_EVIDENCE.md.
 */
const KNOWN_AMBIGUOUS = "session-2026-07-22-qov7";

describe("parseYaml — differential vs the reference parser", () => {
  const artifacts = [...walk("evidence"), ...walk("test/fixtures")];
  const comparable = artifacts.filter((p) => !p.includes(KNOWN_AMBIGUOUS));

  it("finds committed artifacts to check against", () => {
    expect(comparable.length).toBeGreaterThan(5);
  });

  for (const path of comparable) {
    it(`matches the reference on ${path}`, () => {
      const source = readFileSync(path, "utf8");
      expect(parseYaml(source)).toEqual(realParse(source));
    });
  }

  it("documents the one divergence: bare 0x0 is a string here, hex 0 in YAML", () => {
    expect(parseYaml("viewport: 0x0")).toEqual({ viewport: "0x0" });
    expect(realParse("viewport: 0x0")).toEqual({ viewport: 0 });
    // Everything else in that artifact still agrees.
    const source = readFileSync(
      "evidence/record-e2e/.sluglist/session-2026-07-22-qov7/session.yaml",
      "utf8"
    );
    const mine = parseYaml(source) as Record<string, unknown>;
    const reference = realParse(source) as Record<string, unknown>;
    expect({ ...mine, viewport: null }).toEqual({
      ...reference,
      viewport: null,
    });
  });
});

describe("parseYaml — round-trip against the serializer", () => {
  const checklist = normalizeChecklist({
    id: "release-1",
    title: "Release checks",
    intent: "smoke",
    sections: [
      {
        title: "Reports",
        items: [
          { id: "export-downloads-xlsx", title: "Export downloads an xlsx" },
          { id: "header-visible", title: "Header: visible?" },
          { id: "untested", title: "Ambiguous item" },
        ],
      },
    ],
  });

  it("normalizes the sample checklist", () => {
    expect(checklist).not.toBeNull();
  });

  function sample(): string {
    if (!checklist) {
      throw new Error("checklist did not normalize");
    }
    const state = seedChecklistState(checklist);
    state.items[0].verdict = "fail";
    state.items[0].issue = "01";
    state.items[0].ts = "2026-08-11T10:00:00Z";
    state.items[0].evidence = {
      screenshots: ["ev-export-downloads-xlsx-01.png"],
      note: 'Toolbar had only "Print" — no Export control, 0 files downloaded',
    };
    state.items[1].verdict = "pass";
    state.items[1].ts = "2026-08-11T10:01:00Z";
    state.items[1].evidence = {
      screenshots: ["ev-header-visible-01.png", "ev-header-visible-02.png"],
      note: "Counter went 4 → 5",
    };
    return buildSessionYaml({
      project: "demo",
      session_id: "session-2026-08-11-aaaa",
      created_at: "2026-08-11T10:00:00Z",
      base_url: "http://localhost:5000",
      browser: "Node 22.0.0",
      os: "macOS",
      viewport: "1280x800",
      device_pixel_ratio: 2,
      language: "en-GB",
      languages: ["en-GB", "uk"],
      reporter: { name: "qa-agent", kind: "agent" },
      checklist: state,
      issues: [
        {
          id: "01",
          file: "01-export-button-missing.md",
          screenshot: "01-export-button-missing.png",
          screenshots: [
            "01-export-button-missing.png",
            "01-export-button-missing-2.png",
          ],
          category: "bug",
          url: "/reports?tab=export",
          selector: "#toolbar > button.primary",
          created_at: "2026-08-11T10:00:00Z",
        },
      ],
    });
  }

  it("matches the reference parser on a full 1.6 session", () => {
    const yaml = sample();
    expect(parseYaml(yaml)).toEqual(realParse(yaml));
  });

  it("preserves the evidence block through a round trip", () => {
    const parsed = parseYaml(sample()) as Record<string, never>;
    const items = (parsed.checklist as unknown as { items: Record<string, never>[] })
      .items;
    expect(items[1].evidence).toEqual({
      screenshots: ["ev-header-visible-01.png", "ev-header-visible-02.png"],
      note: "Counter went 4 → 5",
    });
    expect(items[0].evidence).toEqual({
      screenshots: ["ev-export-downloads-xlsx-01.png"],
      note: 'Toolbar had only "Print" — no Export control, 0 files downloaded',
    });
    expect(items[2].evidence).toBeUndefined();
    expect(items[2].verdict).toBeNull();
  });

  it("matches the reference on an empty-issue session", () => {
    const yaml = buildSessionYaml({
      project: "demo",
      session_id: "session-2026-08-11-bbbb",
      created_at: "2026-08-11T10:00:00Z",
      base_url: "",
      browser: "Node 22.0.0",
      os: "Linux",
      viewport: "",
      device_pixel_ratio: 1,
      issues: [],
    });
    expect(parseYaml(yaml)).toEqual(realParse(yaml));
  });

  it("matches the reference on fixes.yaml", () => {
    const yaml = buildFixesYaml({
      fixed_by: { name: "fix-agent", kind: "agent" },
      items: [
        {
          issue: "01",
          status: "fixed",
          commit: "4be0b62",
          note: "Export button restored: the handler bound to a stale id",
          checklist_item: "export-downloads-xlsx",
          ts: "2026-08-11T11:00:00Z",
        },
        {
          issue: "02",
          status: "wontfix",
          note: "Works as designed — the counter is deliberately delayed",
          ts: "2026-08-11T11:05:00Z",
        },
      ],
    });
    expect(parseYaml(yaml)).toEqual(realParse(yaml));
  });

  it("matches the reference on an empty fixes.yaml", () => {
    const yaml = buildFixesYaml({ items: [] });
    expect(parseYaml(yaml)).toEqual(realParse(yaml));
  });
});

describe("parseScalar edge cases", () => {
  it("reads the scalar forms the serializer emits", () => {
    const yaml = [
      "bare: hello world",
      'quoted: "has: colon"',
      "num: 2",
      "float: 1.5",
      "yes: true",
      "no: false",
      "nothing: null",
      "empty_list: []",
    ].join("\n");
    expect(parseYaml(yaml)).toEqual(realParse(yaml));
  });

  it("does not split a value containing a colon", () => {
    const yaml = 'title: "Header: visible?"';
    expect(parseYaml(yaml)).toEqual({ title: "Header: visible?" });
  });

  it("returns null for an empty document", () => {
    expect(parseYaml("")).toBeNull();
    expect(parseYaml("\n\n")).toBeNull();
  });
});

describe("parseIssueMarkdown", () => {
  const source = [
    "---",
    // Quoted exactly as the serializer emits it: bare `01` would read back as
    // the number 1 in any YAML parser.
    'id: "01"',
    "url: /reports",
    "selector: null",
    "mode: fullpage",
    "checklist_item: export-downloads-xlsx",
    "viewport: 1280x800",
    "screenshot: 01-export-button-missing.png",
    "created_at: 2026-08-11T10:00:00Z",
    "reporter:",
    "  name: qa-agent",
    "  kind: agent",
    "attachments:",
    "  - file: 01-x-att-01.txt",
    "    mime: text/plain",
    "    size: 12",
    "    original_name: log.txt",
    "---",
    "",
    "Expected an Export button; the toolbar only has Print.",
    "",
    "## Errors",
    "- [2s before report] console: boom",
  ].join("\n");

  it("splits frontmatter from body", () => {
    const issue = parseIssueMarkdown(source, "01-export-button-missing.md");
    expect(issue.frontmatter.id).toBe("01");
    expect(issue.frontmatter.selector).toBeNull();
    expect(issue.frontmatter.reporter).toEqual({
      name: "qa-agent",
      kind: "agent",
    });
    expect(issue.frontmatter.attachments).toEqual([
      {
        file: "01-x-att-01.txt",
        mime: "text/plain",
        size: 12,
        original_name: "log.txt",
      },
    ]);
    expect(issue.body).toContain("Expected an Export button");
    expect(issue.body).toContain("## Errors");
    expect(issue.file).toBe("01-export-button-missing.md");
  });

  it("agrees with the reference parser on the frontmatter", () => {
    const block = /^---\n([\s\S]*?)\n---\n?/.exec(source)?.[1] ?? "";
    expect(parseYaml(block)).toEqual(realParse(block));
  });

  it("treats a file without frontmatter as all body", () => {
    const issue = parseIssueMarkdown("Just a note.\n", "x.md");
    expect(issue.frontmatter).toEqual({});
    expect(issue.body).toBe("Just a note.");
  });
});
