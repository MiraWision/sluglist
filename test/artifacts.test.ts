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

  it("appends console errors as a section and matches the fixture", () => {
    const md = buildIssueMarkdown({
      id: "02",
      url: "/dashboard/animals",
      selector: null,
      mode: "fullpage",
      viewport: "1512x982",
      screenshot: null,
      createdAt: "2026-07-20T14:07:45Z",
      comment: "Страница мигает при загрузке.",
      consoleErrors: [
        "TypeError: Cannot read properties of undefined (reading 'map')\n    at AnimalList (animal-list.tsx:42:18)",
        "Failed to load resource: the server responded with a status of 404 (Not Found)",
      ],
    });
    expect(md).toBe(fixture("02-with-console-errors.md"));
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
