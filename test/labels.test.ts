// @vitest-environment jsdom
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { NOOP_ACTION_CAPTURE } from "../src/actions";
import { NOOP_ERROR_CAPTURE } from "../src/errors";
import { MemoryConnector } from "../src/connectors/memory";
import { labels } from "../src/labels";
import { createMemoryStorage } from "../src/session";
import {
  DEFAULT_STRINGS,
  defaultPluralForm,
  type FeedbackWidgetStrings,
  plural,
  slavicPluralForm,
} from "../src/ui/strings";
import { createFeedbackWidget } from "../src/widget";
import { mountFeedbackWidget, type MountedFeedbackWidget } from "../src/ui/mount";

const environment = () => ({
  baseUrl: "https://app.example",
  url: "/checkout",
  viewport: "1512x982",
  screen: "1512x982",
  devicePixelRatio: 2,
  browser: "Chrome 140",
  os: "macOS",
  language: "uk-UA",
  languages: ["uk-UA"],
  timezone: "Europe/Kyiv",
  colorScheme: "light",
  reducedMotion: false,
});

describe("bundles", () => {
  it("ships en, ru, uk, es and de", () => {
    expect(Object.keys(labels).sort()).toEqual(["de", "en", "es", "ru", "uk"]);
  });

  it("every bundle covers every required key", () => {
    const required = Object.keys(DEFAULT_STRINGS) as (keyof FeedbackWidgetStrings)[];
    for (const [name, bundle] of Object.entries(labels)) {
      for (const key of required) {
        expect(
          bundle[key],
          `${name}.${String(key)} is missing`
        ).toBeDefined();
      }
    }
  });

  it("translates rather than copying English (spot check)", () => {
    for (const bundle of [labels.ru, labels.uk, labels.es, labels.de]) {
      expect(bundle.send).not.toBe(DEFAULT_STRINGS.send);
      expect(bundle.cancel).not.toBe(DEFAULT_STRINGS.cancel);
      expect(bundle.menuFullpage).not.toBe(DEFAULT_STRINGS.menuFullpage);
    }
  });

  it("partial override on top of a bundle works", () => {
    const custom = { ...labels.uk, send: "Полетіли" };
    expect(custom.send).toBe("Полетіли");
    expect(custom.cancel).toBe(labels.uk.cancel);
  });
});

describe("plural forms", () => {
  it("English: 1 vs everything else", () => {
    expect(defaultPluralForm(1)).toBe("one");
    expect(defaultPluralForm(2)).toBe("many");
    expect(defaultPluralForm(0)).toBe("many");
  });

  it("Slavic: 1 / 2-4 / 5+ with the 11-14 exception", () => {
    const cases: [number, string][] = [
      [1, "one"],
      [2, "few"],
      [4, "few"],
      [5, "many"],
      [11, "many"],
      [12, "many"],
      [14, "many"],
      [21, "one"],
      [22, "few"],
      [25, "many"],
      [101, "one"],
      [111, "many"],
      [0, "many"],
    ];
    for (const [n, expected] of cases) {
      expect(slavicPluralForm(n), `n=${n}`).toBe(expected);
    }
  });

  it("renders 1 / 2 / 5 кадров correctly in Russian", () => {
    const render = (n: number) =>
      plural(
        labels.ru.recordingFrameOne,
        labels.ru.recordingFrameMany,
        n,
        labels.ru.recordingFrameFew,
        labels.ru.pluralForm
      );
    expect(render(1)).toBe("1 кадр");
    expect(render(2)).toBe("2 кадра");
    expect(render(5)).toBe("5 кадров");
    expect(render(21)).toBe("21 кадр");
  });

  it("renders 1 / 2 / 5 кадрів correctly in Ukrainian", () => {
    const render = (n: number) =>
      plural(
        labels.uk.recordingFrameOne,
        labels.uk.recordingFrameMany,
        n,
        labels.uk.recordingFrameFew,
        labels.uk.pluralForm
      );
    expect(render(1)).toBe("1 кадр");
    expect(render(3)).toBe("3 кадри");
    expect(render(5)).toBe("5 кадрів");
  });

  it("a bundle without a few form falls back to many rather than breaking", () => {
    expect(plural("{n} frame", "{n} frames", 3)).toBe("3 frames");
  });
});

describe("the widget in Ukrainian", () => {
  let ui: MountedFeedbackWidget | null = null;

  afterEach(() => {
    ui?.unmount();
    ui = null;
    document.body.innerHTML = "";
  });

  it("renders the whole capture flow with the uk bundle", () => {
    const widget = createFeedbackWidget(
      {
        project: "acme",
        connectors: [new MemoryConnector()],
        offlineQueue: false,
      },
      {
        environment,
        storage: createMemoryStorage(),
        actionCapture: NOOP_ACTION_CAPTURE,
        errorCapture: NOOP_ERROR_CAPTURE,
      }
    );
    ui = mountFeedbackWidget(widget, { strings: labels.uk });
    const shadow = (
      document.querySelector("[data-feedback-widget]") as HTMLElement
    ).shadowRoot as ShadowRoot;
    expect((shadow.querySelector(".fab-label") as HTMLElement).textContent).toBe(
      labels.uk.buttonLabel
    );
    (shadow.querySelector(".fab") as HTMLButtonElement).click();
    const menu = [...shadow.querySelectorAll(".menu button span")].map(
      (s) => s.textContent
    );
    expect(menu).toContain(labels.uk.menuFullpage);
    const items = [...shadow.querySelectorAll(".menu button")];
    (items.at(-1) as HTMLButtonElement).click();
    expect((shadow.querySelector("textarea") as HTMLTextAreaElement).placeholder).toBe(
      labels.uk.commentPlaceholder
    );
    expect((shadow.querySelector(".send") as HTMLElement).textContent).toBe(
      labels.uk.send
    );
    expect((shadow.querySelector(".attach-file") as HTMLElement).textContent).toBe(
      labels.uk.attachFile
    );
  });
});

/**
 * The registry check: every user-facing string has to come from the labels
 * module, or a locale bundle silently leaves English on screen. This greps the
 * UI sources for literal English assigned to a visible property.
 */
describe("no hardcoded UI strings", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        return sources(full);
      }
      return full.endsWith(".ts") ? [full] : [];
    });
  }

  it("assigns no English literal to textContent / placeholder / title / alt / aria-label", () => {
    // Every assignment to a visible property, with the literal captured.
    // A literal is either a quoted string or a backtick template (which may
    // contain quotes inside its `${}` expressions, so it needs its own arm).
    const literal = String.raw`(?:"[^"\n]*"|'[^'\n]*'|\x60(?:[^\x60\\]|\\.)*\x60)`;
    const pattern = new RegExp(
      `(?:textContent|placeholder|\\.title|\\.alt)\\s*=\\s*(${literal})` +
        `|setAttribute\\(\\s*["'](?:aria-label|title)["']\\s*,\\s*(${literal})`,
      "g"
    );
    const offenders: string[] = [];
    /**
     * A literal is only a hardcode if English survives after the interpolated
     * expressions are removed: `` `${strings.open} ↗` `` is composed from the
     * registry, `"Drag to select an area"` is not.
     */
    const hasEnglish = (literal: string): boolean =>
      /[A-Za-z]{2,}/.test(literal.replace(/\$\{[^}]*\}/g, ""));
    for (const file of sources(root)) {
      // strings.ts and labels.ts ARE the label registry.
      if (file.endsWith("ui/strings.ts") || file.endsWith("labels.ts")) {
        continue;
      }
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(pattern)) {
        const literal = match[1] ?? match[2] ?? "";
        if (hasEnglish(literal)) {
          offenders.push(`${file.replace(root, "src")}: ${match[0].trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
