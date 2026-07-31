import { describe, expect, it } from "vitest";
import { scrub, scrubMaybe } from "../src/scrub";

/**
 * The negative cases below are the important half of this suite: a scrub that
 * redacts dates, counts, versions, viewports or stack-trace line numbers turns
 * an artifact into noise. Every "not touched" case here is a value that really
 * appears in sluglist artifacts.
 */

describe("scrub — emails", () => {
  it("redacts a plain address", () => {
    expect(scrub("contact anna.smirnova@acme-corp.co.uk now")).toBe(
      "contact [email] now"
    );
  });

  it("redacts an address inside an error message", () => {
    expect(
      scrub("TypeError: cannot read user jane+test@example.com from cache")
    ).toBe("TypeError: cannot read user [email] from cache");
  });

  it("redacts several addresses in one string", () => {
    expect(scrub("a@b.com, c@d.org")).toBe("[email], [email]");
  });

  it("leaves a bare @mention alone", () => {
    expect(scrub("ping @anna about the layout")).toBe(
      "ping @anna about the layout"
    );
  });
});

describe("scrub — digit runs", () => {
  it("redacts a card number written with spaces", () => {
    expect(scrub("card 4111 1111 1111 1111 declined")).toBe(
      "card [digits] declined"
    );
  });

  it("redacts a card number written with hyphens", () => {
    expect(scrub("4111-1111-1111-1111")).toBe("[digits]");
  });

  it("redacts a phone number", () => {
    expect(scrub("call +1 555 010 4477 for support")).toBe(
      "call +[digits] for support"
    );
  });

  it("redacts a hyphenated phone number", () => {
    expect(scrub("555-010-4477")).toBe("[digits]");
  });

  it("redacts a bare account number", () => {
    expect(scrub("account 8829174 overdrawn")).toBe("account [digits] overdrawn");
  });

  // --- negative: values that must survive ---

  it("leaves short numbers alone", () => {
    expect(scrub("42 items, 3 of 10 done, page 7")).toBe(
      "42 items, 3 of 10 done, page 7"
    );
  });

  it("leaves an ISO date alone", () => {
    expect(scrub("released 2026-07-31")).toBe("released 2026-07-31");
  });

  it("leaves a day-first date alone", () => {
    expect(scrub("31-07-2026")).toBe("31-07-2026");
  });

  it("leaves an ISO timestamp alone", () => {
    expect(scrub("2026-07-31T09:04:38Z")).toBe("2026-07-31T09:04:38Z");
  });

  it("leaves a viewport string alone", () => {
    expect(scrub("viewport 1512x982 dpr 2")).toBe("viewport 1512x982 dpr 2");
  });

  it("leaves a version number alone", () => {
    expect(scrub("Windows 10.0.19045 build")).toBe("Windows 10.0.19045 build");
  });

  it("leaves an IPv4 address alone", () => {
    expect(scrub("host 192.168.100.201")).toBe("host 192.168.100.201");
  });

  it("leaves stack-trace line:column numbers alone", () => {
    expect(scrub("at render (app.js:1284:17)")).toBe(
      "at render (app.js:1284:17)"
    );
  });

  it("leaves a price alone", () => {
    expect(scrub("total $1299.00")).toBe("total $1299.00");
  });
});

describe("scrub — tokens", () => {
  it("redacts a JWT", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    expect(scrub(`Authorization failed for ${jwt}`)).toBe(
      "Authorization failed for [token]"
    );
  });

  it("redacts a JWT sitting in a request path, keeping the readable segments", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI0MiJ9.TJVA95OrM7E2cBab30RMHrHDcEfxjoYZgeFONFh7HgQ";
    expect(scrub(`GET /api/session/${jwt}/refresh → 401 (12ms)`)).toBe(
      "GET /api/session/[token]/refresh → 401 (12ms)"
    );
  });

  it("redacts a hex digest", () => {
    expect(scrub("etag 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b")).toBe(
      "etag [token]"
    );
  });

  it("redacts a UUID", () => {
    expect(scrub("/assessments/9f2c3a71-4b5c-6d7e-8f90-1a2b3c4d5e6f")).toBe(
      "/assessments/[token]"
    );
  });

  it("redacts a base64url api key but keeps the surrounding path", () => {
    // `=` is part of the base64 alphabet (padding), so an adjacent `k=` is
    // absorbed into the mark. Harmless: the path itself survives, which is what
    // makes the network line readable.
    expect(
      scrub("POST /v2/upload?k=aGVsbG8gd29ybGQgdGhpcyBpcyBhIGtleTEyMw")
    ).toBe("POST /v2/upload?[token]");
  });

  // --- negative: identifiers that must survive ---

  it("leaves a long kebab-case path alone", () => {
    expect(scrub("/dashboard-analytics-overview-2026")).toBe(
      "/dashboard-analytics-overview-2026"
    );
  });

  it("leaves a long hyphenated slug alone", () => {
    expect(scrub("01-the-summary-header-overlaps-the-score")).toBe(
      "01-the-summary-header-overlaps-the-score"
    );
  });

  it("leaves a long ordinary word alone", () => {
    expect(scrub("antidisestablishmentarianism")).toBe(
      "antidisestablishmentarianism"
    );
  });

  it("leaves a long camelCase identifier without digits alone", () => {
    expect(scrub("handleSubmitAndValidateForm")).toBe(
      "handleSubmitAndValidateForm"
    );
  });

  it("leaves a readable CSS selector alone", () => {
    expect(scrub('[data-testid="checkout-submit-button"] > span')).toBe(
      '[data-testid="checkout-submit-button"] > span'
    );
  });
});

describe("scrub — combined and edge cases", () => {
  it("handles a string with all three kinds at once", () => {
    expect(
      scrub("user bob@corp.io card 4111 1111 1111 1111 key 9f86d081884c7d659a2feaa0c55ad015")
    ).toBe("user [email] card [digits] key [token]");
  });

  it("is idempotent", () => {
    const once = scrub("mail me at a@b.com or 555-010-4477");
    expect(scrub(once)).toBe(once);
  });

  it("leaves an empty string alone", () => {
    expect(scrub("")).toBe("");
  });

  it("leaves ordinary prose alone", () => {
    const prose =
      "The Save button spins forever after clicking it twice in a row.";
    expect(scrub(prose)).toBe(prose);
  });
});

describe("scrubMaybe", () => {
  it("passes null and undefined through unchanged", () => {
    expect(scrubMaybe(null)).toBeNull();
    expect(scrubMaybe(undefined)).toBeUndefined();
  });

  it("scrubs a string", () => {
    expect(scrubMaybe("a@b.com")).toBe("[email]");
  });
});
