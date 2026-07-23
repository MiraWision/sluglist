import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { buildIssueMarkdown, buildSessionYaml } from "../src/artifacts";
import type { SessionState } from "../src/types";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const fixture = (name: string) => readFileSync(join(fixturesDir, name), "utf8");

const state: SessionState = {
  project: "trugenix",
  session_id: "session-2026-07-20-a1b2",
  created_at: "2026-07-20T14:03:22Z",
  base_url: "https://dev.trugenix.example",
  browser: "Chrome 138",
  os: "macOS",
  viewport: "1512x982",
  device_pixel_ratio: 2,
  issues: [
    {
      id: "01",
      file: "01-broken-header.md",
      screenshot: "01-broken-header.png",
      url: "/dashboard/animals",
      selector: "header > nav .logo",
      created_at: "2026-07-20T14:05:10Z",
    },
    {
      id: "02",
      file: "02-logotip-sezzhaet-vniz-pri-uzkom-ekrane.md",
      screenshot: null,
      url: "/dashboard/animals",
      selector: null,
      created_at: "2026-07-20T14:07:45Z",
    },
  ],
};

describe("buildSessionYaml", () => {
  it("matches the contract fixture byte for byte", () => {
    expect(buildSessionYaml(state)).toBe(fixture("session.yaml"));
  });

  it("produces valid YAML that round-trips to the same data", () => {
    const parsed = parse(buildSessionYaml(state));
    expect(parsed).toEqual({
      format_version: "1.0",
      project: "trugenix",
      session_id: "session-2026-07-20-a1b2",
      created_at: "2026-07-20T14:03:22Z",
      base_url: "https://dev.trugenix.example",
      browser: "Chrome 138",
      os: "macOS",
      viewport: "1512x982",
      device_pixel_ratio: 2,
      issues: [
        {
          id: "01",
          file: "01-broken-header.md",
          screenshot: "01-broken-header.png",
          url: "/dashboard/animals",
          selector: "header > nav .logo",
          created_at: "2026-07-20T14:05:10Z",
        },
        {
          id: "02",
          file: "02-logotip-sezzhaet-vniz-pri-uzkom-ekrane.md",
          screenshot: null,
          url: "/dashboard/animals",
          selector: null,
          created_at: "2026-07-20T14:07:45Z",
        },
      ],
    });
  });

  it("serializes an empty session with an empty issues list", () => {
    const empty = { ...state, issues: [] };
    const parsed = parse(buildSessionYaml(empty));
    expect(parsed.issues).toEqual([]);
  });
});

describe("buildIssueMarkdown", () => {
  it("matches the element-mode fixture byte for byte", () => {
    const md = buildIssueMarkdown({
      id: "01",
      url: "/dashboard/animals",
      selector: "header > nav .logo",
      mode: "element",
      viewport: "1512x982",
      screenshot: "01-broken-header.png",
      createdAt: "2026-07-20T14:05:10Z",
      comment: "Логотип съезжает вниз при узком экране, перекрывает меню.",
    });
    expect(md).toBe(fixture("01-broken-header.md"));
  });

  it("renders a ## Errors section with source + relative age", () => {
    const at = 100_000; // issue time (ms)
    const md = buildIssueMarkdown({
      id: "02",
      url: "/dashboard/animals",
      selector: null,
      mode: "fullpage",
      viewport: "1512x982",
      screenshot: null,
      createdAt: "2026-07-20T14:07:45Z",
      comment: "Page flickers on load.",
      errorsAt: at,
      errorsCount: 2,
      errors: [
        {
          ts: at - 120_000, // 2m before
          source: "console",
          message: "Failed to load resource: /api/animals 500",
        },
        {
          ts: at - 3000, // 3s before
          source: "exception",
          message: "TypeError: Cannot read properties of undefined (reading 'id')",
          stack: "    at AnimalCard (main.js:1:48213)",
        },
      ],
    });
    // frontmatter has errors_count
    const fm = md.split("---\n")[1];
    expect(fm).toContain("errors_count: 2");
    // body section
    expect(md).toContain("## Errors");
    expect(md).toContain(
      "- [2m before report] console: Failed to load resource: /api/animals 500"
    );
    expect(md).toContain(
      "- [3s before report] exception: TypeError: Cannot read properties of undefined (reading 'id')"
    );
    expect(md).toContain("        at AnimalCard (main.js:1:48213)");
  });

  it("emits errors_count only when defined; no section when empty", () => {
    const withCount = buildIssueMarkdown({
      id: "0e",
      url: "/x",
      selector: null,
      mode: "fullpage",
      viewport: "800x600",
      screenshot: null,
      createdAt: "2026-07-22T10:00:00Z",
      comment: "No errors captured",
      errors: [],
      errorsCount: 0,
    });
    expect(withCount.split("---\n")[1]).toContain("errors_count: 0");
    expect(withCount).not.toContain("## Errors");

    const withoutCapture = buildIssueMarkdown({
      id: "0f",
      url: "/x",
      selector: null,
      mode: "fullpage",
      viewport: "800x600",
      screenshot: null,
      createdAt: "2026-07-22T10:00:00Z",
      comment: "Capture disabled",
    });
    expect("errors_count" in parse(withoutCapture.split("---\n")[1])).toBe(false);
  });

  it("emits an additive screenshots list only for multi-screenshot issues", () => {
    const md = buildIssueMarkdown({
      id: "04",
      url: "/dashboard",
      selector: null,
      mode: "area",
      viewport: "1512x982",
      screenshot: "04-multi.png",
      screenshots: ["04-multi.png", "04-multi-2.png"],
      createdAt: "2026-07-21T10:00:00Z",
      comment: "Two shots",
    });
    const parsed = parse(md.split("---\n")[1]);
    expect(parsed.screenshot).toBe("04-multi.png");
    expect(parsed.screenshots).toEqual(["04-multi.png", "04-multi-2.png"]);

    const yaml = buildSessionYaml({
      ...state,
      issues: [
        {
          ...state.issues[0],
          screenshots: ["01-broken-header.png", "01-broken-header-2.png"],
        },
      ],
    });
    const parsedYaml = parse(yaml);
    expect(parsedYaml.issues[0].screenshot).toBe("01-broken-header.png");
    expect(parsedYaml.issues[0].screenshots).toEqual([
      "01-broken-header.png",
      "01-broken-header-2.png",
    ]);
  });

  it("emits optional session metadata only when present", () => {
    const bare = parse(buildSessionYaml(state));
    expect(bare.timezone).toBeUndefined();
    expect(bare.language).toBeUndefined();

    const enriched = parse(
      buildSessionYaml({
        ...state,
        screen: "2560x1440",
        language: "de-DE",
        languages: ["de-DE", "en"],
        timezone: "Europe/Berlin",
        color_scheme: "dark",
        reduced_motion: false,
      })
    );
    expect(enriched.screen).toBe("2560x1440");
    expect(enriched.language).toBe("de-DE");
    expect(enriched.languages).toEqual(["de-DE", "en"]);
    expect(enriched.timezone).toBe("Europe/Berlin");
    expect(enriched.color_scheme).toBe("dark");
    expect(enriched.reduced_motion).toBe(false);
  });

  it("emits smart-selector metadata in frontmatter for element mode", () => {
    const md = buildIssueMarkdown({
      id: "07",
      url: "/checkout",
      selector: 'button[aria-label="Save"]',
      selectorStrategy: "aria",
      selectorUnique: true,
      mode: "element",
      elementText: "Сохранить",
      domPath: "body > div > main > form > div > button",
      screen: "checkout",
      viewport: "1512x982",
      screenshot: "07-x.png",
      createdAt: "2026-07-21T10:00:00Z",
      comment: "The save button is off",
    });
    const fm = parse(md.split("---\n")[1]);
    expect(fm.selector).toBe('button[aria-label="Save"]');
    expect(fm.selector_strategy).toBe("aria");
    expect(fm.selector_unique).toBe(true);
    expect(fm.element_text).toBe("Сохранить");
    expect(fm.dom_path).toBe("body > div > main > form > div > button");
    expect(fm.screen).toBe("checkout");
  });

  it("emits the metadata fields as null for non-element modes", () => {
    const md = buildIssueMarkdown({
      id: "08",
      url: "/x",
      selector: null,
      selectorStrategy: null,
      selectorUnique: null,
      mode: "fullpage",
      elementText: null,
      domPath: null,
      screen: null,
      viewport: "800x600",
      screenshot: null,
      createdAt: "2026-07-21T10:00:00Z",
      comment: "Whole page",
    });
    const fm = parse(md.split("---\n")[1]);
    expect(fm.selector).toBeNull();
    expect(fm.selector_strategy).toBeNull();
    expect(fm.element_text).toBeNull();
    expect(fm.dom_path).toBeNull();
    expect(fm.screen).toBeNull();
  });

  it("emits an issue category only when set", () => {
    const withCategory = parse(
      buildIssueMarkdown({
        id: "05",
        url: "/dashboard",
        selector: null,
        mode: "fullpage",
        category: "design",
        viewport: "1512x982",
        screenshot: null,
        createdAt: "2026-07-21T10:00:00Z",
        comment: "Spacing looks off",
      }).split("---\n")[1]
    );
    expect(withCategory.category).toBe("design");

    const withoutCategory = parse(
      buildIssueMarkdown({
        id: "06",
        url: "/dashboard",
        selector: null,
        mode: "fullpage",
        viewport: "1512x982",
        screenshot: null,
        createdAt: "2026-07-21T10:00:00Z",
        comment: "No category",
      }).split("---\n")[1]
    );
    expect(withoutCategory.category).toBeUndefined();
  });

  it("emits reporter + custom blocks when provided (and valid YAML)", () => {
    const md = buildIssueMarkdown({
      id: "09",
      url: "/app",
      selector: null,
      mode: "fullpage",
      viewport: "1512x982",
      screenshot: null,
      createdAt: "2026-07-22T10:00:00Z",
      comment: "Beta report",
      reporter: { user_id: "u_18293", email: "user@example.com", name: "Anna K." },
      custom: { plan: "pro", app_version: "2.4.1", seats: 5 },
    });
    const fm = parse(md.split("---\n")[1]);
    expect(fm.reporter).toEqual({
      user_id: "u_18293",
      email: "user@example.com",
      name: "Anna K.",
    });
    expect(fm.custom).toEqual({ plan: "pro", app_version: "2.4.1", seats: 5 });
  });

  it("emits reporter/custom as null when configured but empty", () => {
    const fm = parse(
      buildIssueMarkdown({
        id: "10",
        url: "/app",
        selector: null,
        mode: "fullpage",
        viewport: "1512x982",
        screenshot: null,
        createdAt: "2026-07-22T10:00:00Z",
        comment: "Beta report, no identity",
        reporter: null,
        custom: null,
      }).split("---\n")[1]
    );
    expect(fm.reporter).toBeNull();
    expect(fm.custom).toBeNull();
  });

  it("omits reporter/custom entirely when not provided (back-compat)", () => {
    const fm = parse(
      buildIssueMarkdown({
        id: "11",
        url: "/app",
        selector: null,
        mode: "fullpage",
        viewport: "1512x982",
        screenshot: null,
        createdAt: "2026-07-22T10:00:00Z",
        comment: "Legacy",
      }).split("---\n")[1]
    );
    expect("reporter" in fm).toBe(false);
    expect("custom" in fm).toBe(false);
  });

  it("emits the masked flag only when defined", () => {
    const withMasked = parse(
      buildIssueMarkdown({
        id: "12",
        url: "/app",
        selector: null,
        mode: "fullpage",
        viewport: "1512x982",
        screenshot: "12-x.png",
        masked: true,
        createdAt: "2026-07-22T10:00:00Z",
        comment: "Masked shot",
      }).split("---\n")[1]
    );
    expect(withMasked.masked).toBe(true);

    const withoutMasked = parse(
      buildIssueMarkdown({
        id: "13",
        url: "/app",
        selector: null,
        mode: "fullpage",
        viewport: "1512x982",
        screenshot: "13-x.png",
        createdAt: "2026-07-22T10:00:00Z",
        comment: "No privacy config",
      }).split("---\n")[1]
    );
    expect("masked" in withoutMasked).toBe(false);
  });

  it("emits record-mode frontmatter + frame-tagged Actions", () => {
    const at = 100_000;
    const md = buildIssueMarkdown({
      id: "03",
      url: "/checkout",
      selector: null,
      mode: "fullpage",
      viewport: "1512x982",
      screenshot: "03-checkout-bug.png",
      recording: true,
      framesCount: 3,
      framesDir: "03-checkout-bug-frames",
      actionsAt: at,
      actionsCount: 2,
      actions: [
        { ts: at - 24_000, kind: "click", selector: 'a[href="/checkout"]', frame: 2 },
        { ts: at - 18_000, kind: "submit", selector: "form#payment", frame: 3 },
      ],
      createdAt: "2026-07-22T10:00:00Z",
      comment: "Checkout breaks after re-navigation",
    });
    const fm = parse(md.split("---\n")[1]);
    expect(fm.recording).toBe(true);
    expect(fm.frames_count).toBe(3);
    expect(fm.frames_dir).toBe("03-checkout-bug-frames");
    expect(md).toContain('- [24s before report] click a[href="/checkout"] — frame 02');
    expect(md).toContain("- [18s before report] submit form#payment — frame 03");
  });

  it("emits `frames` in the session index only when set", () => {
    const withFrames = parse(
      buildSessionYaml({
        ...state,
        issues: [{ ...state.issues[0], frames: 4 }],
      })
    );
    expect(withFrames.issues[0].frames).toBe(4);
    expect("frames" in parse(buildSessionYaml(state)).issues[0]).toBe(false);
  });

  it("emits session-level reporter only when present", () => {
    const bare = parse(buildSessionYaml(state));
    expect("reporter" in bare).toBe(false);

    const withReporter = parse(
      buildSessionYaml({
        ...state,
        reporter: { user_id: "u_1", name: "Anna K." },
      })
    );
    expect(withReporter.reporter).toEqual({ user_id: "u_1", name: "Anna K." });

    const emptyReporter = parse(
      buildSessionYaml({ ...state, reporter: null })
    );
    expect(emptyReporter.reporter).toBeNull();
  });

  it("frontmatter parses as YAML with expected fields", () => {
    const md = buildIssueMarkdown({
      id: "03",
      url: "/orders?tab=open",
      selector: 'button[data-testid="submit"]',
      mode: "area",
      viewport: "800x600",
      screenshot: "03-issue.png",
      createdAt: "2026-07-20T15:00:00Z",
      comment: "Test",
    });
    const frontmatter = md.split("---\n")[1];
    const parsed = parse(frontmatter);
    expect(parsed).toEqual({
      id: "03",
      url: "/orders?tab=open",
      selector: 'button[data-testid="submit"]',
      mode: "area",
      viewport: "800x600",
      screenshot: "03-issue.png",
      created_at: "2026-07-20T15:00:00Z",
    });
  });
});

describe("format version + agent-context fields", () => {
  it("writes format_version as the first line of session.yaml", () => {
    const yaml = buildSessionYaml(state);
    expect(yaml.startsWith('format_version: "1.0"\n')).toBe(true);
    expect(parse(yaml).format_version).toBe("1.0");
  });

  it("emits component (element mode) and a context block additively", () => {
    const md = buildIssueMarkdown({
      id: "01",
      url: "/dashboard/animals",
      selector: 'button[aria-label="Save"]',
      mode: "element",
      viewport: "1512x982",
      screenshot: null,
      createdAt: "2026-07-20T14:05:10Z",
      comment: "Save does nothing.",
      component: "AnimalCard",
      context: { tenant_id: "acme", dark_mode: true },
    });
    const fm = parse(md.split("---\n")[1]);
    expect(fm.component).toBe("AnimalCard");
    expect(fm.context).toEqual({ tenant_id: "acme", dark_mode: true });
  });

  it("emits component: null / context: null when configured but empty", () => {
    const md = buildIssueMarkdown({
      id: "01",
      url: "/x",
      selector: null,
      mode: "fullpage",
      viewport: "1x1",
      screenshot: null,
      createdAt: "t",
      comment: "c",
      component: null,
      context: null,
    });
    expect(md).toContain("component: null");
    expect(md).toContain("context: null");
  });

  it("omits component and context entirely when not provided (back-compat)", () => {
    const md = buildIssueMarkdown({
      id: "01",
      url: "/x",
      selector: null,
      mode: "fullpage",
      viewport: "1x1",
      screenshot: null,
      createdAt: "t",
      comment: "c",
    });
    expect(md).not.toContain("component:");
    expect(md).not.toContain("context:");
  });

  it("renders a network failure line in ## Errors", () => {
    const at = 100_000;
    const md = buildIssueMarkdown({
      id: "03",
      url: "/x",
      selector: null,
      mode: "fullpage",
      viewport: "1x1",
      screenshot: null,
      createdAt: "t",
      comment: "c",
      errorsAt: at,
      errorsCount: 1,
      errors: [
        {
          ts: at - 4000,
          source: "network",
          message: "POST /api/animals → 500 (240ms)",
        },
      ],
    });
    expect(md).toContain(
      "- [4s before report] network: POST /api/animals → 500 (240ms)"
    );
  });
});
