// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  collectElementMetadata,
  componentName,
  domPath,
  generateSelector,
  isHashLike,
  isUtilityClass,
  screenOf,
} from "../src/selector";

function mount(html: string): void {
  document.body.innerHTML = html;
}

// Any utility (Tailwind) or hash-like class must never appear in a selector.
const FORBIDDEN =
  /\.(flex|items-center|gap-2|px-4|py-2|bg-\w|text-\w|rounded|sc-[a-z0-9]+|_\w+_[a-z0-9]{4,})/i;

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("generateSelector strategies", () => {
  it("prefers data-testid / data-test / data-cy", () => {
    mount('<div><button data-testid="save-button" class="flex px-4">Go</button></div>');
    const el = document.querySelector("button") as HTMLElement;
    const r = generateSelector(el);
    expect(r.strategy).toBe("testid");
    expect(r.selector).toBe('[data-testid="save-button"]');
    expect(r.unique).toBe(true);
  });

  it("uses a clean id", () => {
    mount('<main><section id="pricing" class="grid gap-2">x</section></main>');
    const r = generateSelector(document.querySelector("#pricing") as HTMLElement);
    expect(r.strategy).toBe("id");
    expect(r.selector).toBe("#pricing");
  });

  it("skips auto-generated ids (numeric / hash-like / radix)", () => {
    mount('<nav><a id="12345">a</a><a id="a1b2c3d4e5">b</a><a id="radix-:r7:">c</a></nav>');
    for (const id of ["12345", "a1b2c3d4e5"]) {
      const el = document.getElementById(id) as HTMLElement;
      expect(generateSelector(el).strategy).not.toBe("id");
    }
  });

  it("uses aria-label / role with a tag qualifier", () => {
    mount('<header><button aria-label="Close menu" class="p-2">x</button></header>');
    const r = generateSelector(document.querySelector("button") as HTMLElement);
    expect(r.strategy).toBe("aria");
    expect(r.selector).toBe('button[aria-label="Close menu"]');
  });

  it("falls back to a landmark-anchored tag path", () => {
    mount(
      '<div><header><nav><a>Home</a><button class="flex items-center gap-2">Menu</button></nav></header></div>'
    );
    const el = document.querySelectorAll("nav > *")[1] as HTMLElement;
    const r = generateSelector(el);
    expect(r.strategy).toBe("path");
    // Anchored at the nearest landmark (nav), per the spec.
    expect(r.selector).toBe("nav > button");
    expect(FORBIDDEN.test(r.selector)).toBe(false);
  });

  it("Tailwind element without id/testid never emits utility classes", () => {
    mount(
      '<main><section><div class="flex items-center gap-2 px-4 bg-white rounded shadow"><span>Hi</span></div></section></main>'
    );
    const el = document.querySelector("div") as HTMLElement;
    const r = generateSelector(el);
    expect(r.strategy).toBe("path");
    expect(FORBIDDEN.test(r.selector)).toBe(false);
    expect(r.selector.includes(".")).toBe(false);
  });

  it("CSS Modules / styled-components element never emits hash classes", () => {
    mount(
      '<form><div class="_card_x8f2k sc-bdVaJa"><input class="_input_9a8b7" /></div></form>'
    );
    const el = document.querySelector("input") as HTMLElement;
    const r = generateSelector(el);
    expect(FORBIDDEN.test(r.selector)).toBe(false);
    expect(r.selector.includes(".")).toBe(false);
  });

  it("adds nth-child only when the tag is ambiguous among siblings", () => {
    mount("<main><ul><li>a</li><li>b</li><li>c</li></ul></main>");
    const el = document.querySelectorAll("li")[1] as HTMLElement;
    const r = generateSelector(el);
    expect(r.selector).toBe("main > ul > li:nth-child(2)");
  });
});

describe("class filters", () => {
  it("flags Tailwind utility classes", () => {
    for (const c of [
      "flex",
      "items-center",
      "gap-2",
      "px-4",
      "py-2",
      "bg-white",
      "text-lg",
      "rounded",
      "border",
      "shadow",
      "md:flex",
      "hover:bg-black",
      "w-full",
      "z-10",
      "absolute",
    ]) {
      expect(isUtilityClass(c)).toBe(true);
    }
  });

  it("does not flag semantic classes as utilities", () => {
    for (const c of ["logo", "card", "site-header", "nav-link", "hero"]) {
      expect(isUtilityClass(c)).toBe(false);
    }
  });

  it("flags hash-like classes (CSS Modules, styled-components)", () => {
    for (const c of ["_btn_x8f2k", "sc-bdVaJa", "_input_9a8b7", "css-1a2b3c4"]) {
      expect(isHashLike(c)).toBe(true);
    }
  });

  it("does not flag semantic classes as hash-like", () => {
    for (const c of ["logo", "card", "site-header", "nav-link", "primary"]) {
      expect(isHashLike(c)).toBe(false);
    }
  });
});

describe("element metadata", () => {
  it("collects text, dom path, screen", () => {
    mount(
      '<div data-screen="checkout"><main><form><div><button aria-label="Save">  Сохранить  </button></div></form></main></div>'
    );
    const el = document.querySelector("button") as HTMLElement;
    const meta = collectElementMetadata(el);
    expect(meta.selector).toBe('button[aria-label="Save"]');
    expect(meta.selectorStrategy).toBe("aria");
    expect(meta.domPath).toBe("body > div > main > form > div > button");
    expect(meta.screen).toBe("checkout");
    // jsdom has no layout so innerText is empty; textContent is the fallback.
    expect(meta.elementText).toBe("Сохранить");
  });

  it("returns null screen when no data-screen / data-page ancestor", () => {
    mount("<main><button>Hi</button></main>");
    expect(screenOf(document.querySelector("button") as HTMLElement)).toBeNull();
  });

  it("caps element_text at 80 chars and nulls empty text", () => {
    mount(`<main><p>${"a".repeat(200)}</p><span></span></main>`);
    const p = collectElementMetadata(document.querySelector("p") as HTMLElement);
    expect(p.elementText?.length).toBe(80);
    const span = collectElementMetadata(
      document.querySelector("span") as HTMLElement
    );
    expect(span.elementText).toBeNull();
  });

  it("computes a full dom path", () => {
    mount("<main><section><article><p>x</p></article></section></main>");
    expect(domPath(document.querySelector("p") as HTMLElement)).toBe(
      "body > main > section > article > p"
    );
  });
});

describe("componentName (React fiber, best-effort)", () => {
  const KEY = "__reactFiber$abc123";
  function setFiber(el: Element, fiber: unknown): void {
    (el as unknown as Record<string, unknown>)[KEY] = fiber;
  }

  it("returns null when there is no React fiber", () => {
    document.body.innerHTML = '<button id="b">Save</button>';
    expect(componentName(document.getElementById("b") as Element)).toBeNull();
  });

  it("returns the nearest named component, skipping host fibers", () => {
    document.body.innerHTML = '<button id="b">Save</button>';
    const btn = document.getElementById("b") as Element;
    function AnimalCard() {
      return null;
    }
    const cardFiber = { type: AnimalCard, return: null };
    const hostFiber = { type: "button", return: cardFiber };
    setFiber(btn, hostFiber);
    expect(componentName(btn)).toBe("AnimalCard");
  });

  it("reads displayName on memo/forwardRef-style wrappers", () => {
    document.body.innerHTML = '<button id="b">x</button>';
    const btn = document.getElementById("b") as Element;
    setFiber(btn, { type: { displayName: "FancyButton" }, return: null });
    expect(componentName(btn)).toBe("FancyButton");
  });

  it("skips anonymous / minified-looking names", () => {
    document.body.innerHTML = '<button id="b">x</button>';
    const btn = document.getElementById("b") as Element;
    // single lowercase letter (minified) → not a usable name
    setFiber(btn, { type: function a() {}, return: { type: "div", return: null } });
    expect(componentName(btn)).toBeNull();
  });
});
