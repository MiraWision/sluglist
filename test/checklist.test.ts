import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  checklistItems,
  checklistProgress,
  isVerdict,
  matchUrlPattern,
  normalizeChecklist,
  seedChecklistState,
} from "../src/checklist";

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

const valid = {
  id: "feature-export-2026-07",
  title: "Export + notifications release",
  sections: [
    {
      title: "Export",
      items: [
        { id: "export-button-visible", title: "Export button visible on /reports", url: "/reports" },
        { id: "csv-downloads", title: "CSV downloads", hint: "with all columns" },
      ],
    },
    {
      title: "Notifications",
      items: [{ id: "email-sent", title: "Email sent after export" }],
    },
  ],
};

describe("normalizeChecklist", () => {
  it("accepts a well-formed checklist and preserves order + hint/url", () => {
    const def = normalizeChecklist(valid);
    expect(def).not.toBeNull();
    expect(def?.id).toBe("feature-export-2026-07");
    expect(def?.title).toBe("Export + notifications release");
    expect(def?.sections.map((s) => s.title)).toEqual(["Export", "Notifications"]);
    const items = checklistItems(def!);
    expect(items.map((i) => i.id)).toEqual([
      "export-button-visible",
      "csv-downloads",
      "email-sent",
    ]);
    // Each item carries its section title.
    expect(items[2].section).toBe("Notifications");
    expect(items[0].url).toBe("/reports");
    expect(items[1].hint).toBe("with all columns");
  });

  it("drops duplicate item ids (keeps the first)", () => {
    const def = normalizeChecklist({
      id: "c",
      title: "C",
      sections: [
        {
          title: "S",
          items: [
            { id: "dup", title: "First" },
            { id: "dup", title: "Second" },
            { id: "ok", title: "Third" },
          ],
        },
      ],
    });
    const items = checklistItems(def!);
    expect(items.map((i) => i.id)).toEqual(["dup", "ok"]);
    expect(items[0].title).toBe("First");
  });

  it("drops items with missing/invalid id or title", () => {
    const def = normalizeChecklist({
      id: "c",
      title: "C",
      sections: [
        {
          title: "S",
          items: [
            { id: "good", title: "Keep me" },
            { id: "", title: "no id" },
            { id: "bad id", title: "space in id" },
            { id: "no-title" },
          ],
        },
      ],
    });
    expect(checklistItems(def!).map((i) => i.id)).toEqual(["good"]);
  });

  it("enforces the 50-item limit across sections", () => {
    const items = Array.from({ length: 40 }, (_, i) => ({
      id: `a${i}`,
      title: `A ${i}`,
    }));
    const items2 = Array.from({ length: 40 }, (_, i) => ({
      id: `b${i}`,
      title: `B ${i}`,
    }));
    const def = normalizeChecklist({
      id: "c",
      title: "C",
      sections: [
        { title: "One", items },
        { title: "Two", items: items2 },
      ],
    });
    expect(checklistItems(def!).length).toBe(50);
  });

  it("enforces the 20-section limit", () => {
    const sections = Array.from({ length: 25 }, (_, i) => ({
      title: `S${i}`,
      items: [{ id: `i${i}`, title: `Item ${i}` }],
    }));
    const def = normalizeChecklist({ id: "c", title: "C", sections });
    expect(def?.sections.length).toBe(20);
  });

  it("clips titles to 120 chars", () => {
    const long = "x".repeat(200);
    const def = normalizeChecklist({
      id: "c",
      title: "C",
      sections: [{ title: "S", items: [{ id: "i", title: long }] }],
    });
    expect(checklistItems(def!)[0].title.length).toBe(120);
  });

  it("returns null for structurally invalid input", () => {
    expect(normalizeChecklist(null)).toBeNull();
    expect(normalizeChecklist("nope")).toBeNull();
    expect(normalizeChecklist({ id: "c", title: "C" })).toBeNull(); // no sections
    expect(normalizeChecklist({ id: "bad id", title: "C", sections: [] })).toBeNull();
    expect(
      normalizeChecklist({ id: "c", title: "C", sections: [{ title: "S", items: [] }] })
    ).toBeNull(); // no valid items
  });

  it("warns (never throws) on invalid input", () => {
    const spy = vi.spyOn(console, "warn");
    normalizeChecklist({ id: "c", title: "C", sections: "not-an-array" });
    expect(spy).toHaveBeenCalled();
  });

  it("keeps a checklist description (clipped) and drops a blank one", () => {
    const def = normalizeChecklist({
      id: "c",
      title: "C",
      description: "  Walk the release and confirm each item.  ",
      sections: [{ title: "S", items: [{ id: "i", title: "T" }] }],
    });
    expect(def?.description).toBe("Walk the release and confirm each item.");
    const blank = normalizeChecklist({
      id: "c",
      title: "C",
      description: "   ",
      sections: [{ title: "S", items: [{ id: "i", title: "T" }] }],
    });
    expect(blank?.description).toBeUndefined();
  });

  it("keeps a wildcard url_match and drops a non-wildcard one with a warning", () => {
    const warn = vi.spyOn(console, "warn");
    const def = normalizeChecklist({
      id: "c",
      title: "C",
      sections: [
        {
          title: "S",
          items: [
            { id: "list", title: "List", url: "/assessments", url_match: "/assessments/*" },
            { id: "static", title: "Static", url_match: "/assessments" }, // no wildcard → dropped
          ],
        },
      ],
    });
    const items = checklistItems(def!);
    expect(items[0].url).toBe("/assessments");
    expect(items[0].url_match).toBe("/assessments/*");
    expect(items[1].url_match).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("url_match"));
  });
});

describe("matchUrlPattern", () => {
  it("matches a single dynamic segment against a wildcard", () => {
    expect(matchUrlPattern("/assessments/*", "/assessments/abc-123")).toBe(true);
    expect(matchUrlPattern("/assessments/*", "/assessments/9f2c-uuid")).toBe(true);
  });
  it("does not match the list page itself or deeper paths", () => {
    expect(matchUrlPattern("/assessments/*", "/assessments")).toBe(false);
    expect(matchUrlPattern("/assessments/*", "/assessments/abc/edit")).toBe(false);
    expect(matchUrlPattern("/assessments/*", "/animals/abc")).toBe(false);
  });
  it("ignores a trailing slash on either side", () => {
    expect(matchUrlPattern("/x/*", "/x/1/")).toBe(true);
  });
  it("matches a wildcard in the middle of a path", () => {
    expect(matchUrlPattern("/org/*/settings", "/org/acme/settings")).toBe(true);
    expect(matchUrlPattern("/org/*/settings", "/org/acme/billing")).toBe(false);
  });
});

describe("seedChecklistState + progress", () => {
  it("seeds every item as null (the initial coverage map)", () => {
    const state = seedChecklistState(normalizeChecklist(valid)!);
    expect(state.id).toBe("feature-export-2026-07");
    expect(state.items).toHaveLength(3);
    expect(state.items.every((i) => i.verdict === null && i.issue === null && i.ts === null)).toBe(
      true
    );
    expect(checklistProgress(state)).toEqual({ done: 0, total: 3 });
  });

  it("counts recorded verdicts", () => {
    const state = seedChecklistState(normalizeChecklist(valid)!);
    state.items[0].verdict = "pass";
    state.items[1].verdict = "fail";
    expect(checklistProgress(state)).toEqual({ done: 2, total: 3 });
  });
});

describe("isVerdict", () => {
  it("recognizes the three verdicts only", () => {
    expect(isVerdict("pass")).toBe(true);
    expect(isVerdict("fail")).toBe(true);
    expect(isVerdict("skip")).toBe(true);
    expect(isVerdict("maybe")).toBe(false);
    expect(isVerdict(null)).toBe(false);
  });
});
