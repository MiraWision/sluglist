import { describe, expect, it } from "vitest";
import { slugFromComment } from "../src/slug";

describe("slugFromComment", () => {
  it("transliterates Cyrillic and joins words with hyphens", () => {
    expect(
      slugFromComment(
        "Логотип съезжает вниз при узком экране, перекрывает меню."
      )
    ).toBe("logotip-sezzhaet-vniz-pri-uzkom-ekrane");
  });

  it("keeps Latin comments lowercase and alphanumeric", () => {
    expect(slugFromComment("Header logo is BROKEN on mobile!")).toBe(
      "header-logo-is-broken-on-mobile"
    );
  });

  it("never exceeds 40 characters and cuts at a word boundary", () => {
    const slug = slugFromComment(
      "This is a very long comment that keeps going and going beyond any limit"
    );
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug).toBe("this-is-a-very-long-comment-that-keeps");
  });

  it("hard-truncates a single overlong word", () => {
    const slug = slugFromComment("a".repeat(80));
    expect(slug).toBe("a".repeat(40));
  });

  it("falls back to 'issue' for empty or symbol-only comments", () => {
    expect(slugFromComment("")).toBe("issue");
    expect(slugFromComment("!!! ***")).toBe("issue");
  });
});
