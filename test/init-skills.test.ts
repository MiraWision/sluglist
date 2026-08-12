import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatResults, initSkills } from "../src/cli/init-skills";

/**
 * `init-skills` replaces a documented `cp -r` line, so the property that
 * matters most is the one `cp` got wrong: **a skill the user has edited is
 * never silently overwritten.** Most of these tests are about that.
 */

let dir: string;
let source: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "sluglist-skills-"));
  // A miniature bundled-skills folder, so the tests do not depend on the real
  // skill texts (which change often).
  source = join(dir, "bundled");
  mkdirSync(join(source, "skill-a"), { recursive: true });
  mkdirSync(join(source, "skill-b", "nested"), { recursive: true });
  writeFileSync(join(source, "skill-a", "SKILL.md"), "# A\nbundled\n");
  writeFileSync(join(source, "skill-b", "SKILL.md"), "# B\nbundled\n");
  writeFileSync(join(source, "skill-b", "nested", "extra.md"), "extra\n");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function target(): string {
  return join(dir, "project", ".claude", "skills");
}

describe("initSkills", () => {
  it("installs every bundled skill into a clean project", async () => {
    const results = await initSkills({ dir: target(), source });

    expect(results.map((r) => r.name)).toEqual(["skill-a", "skill-b"]);
    expect(results.every((r) => r.outcome === "installed")).toBe(true);
    expect(readFileSync(join(target(), "skill-a", "SKILL.md"), "utf8")).toBe(
      "# A\nbundled\n"
    );
    // Nested files come along.
    expect(
      readFileSync(join(target(), "skill-b", "nested", "extra.md"), "utf8")
    ).toBe("extra\n");
  });

  it("creates the target folder when it does not exist", async () => {
    const nested = join(dir, "deep", "a", "b", "skills");
    await initSkills({ dir: nested, source });
    expect(readFileSync(join(nested, "skill-a", "SKILL.md"), "utf8")).toContain(
      "bundled"
    );
  });

  it("reports up-to-date on a second run and writes nothing", async () => {
    await initSkills({ dir: target(), source });
    const results = await initSkills({ dir: target(), source });
    expect(results.every((r) => r.outcome === "up-to-date")).toBe(true);
  });

  it("never overwrites a skill the user edited", async () => {
    await initSkills({ dir: target(), source });
    const edited = join(target(), "skill-a", "SKILL.md");
    writeFileSync(edited, "# A\nmy own notes\n");

    const results = await initSkills({ dir: target(), source });

    expect(results.find((r) => r.name === "skill-a")?.outcome).toBe("modified");
    expect(readFileSync(edited, "utf8")).toBe("# A\nmy own notes\n");
    // The untouched skill is still reported as fine.
    expect(results.find((r) => r.name === "skill-b")?.outcome).toBe("up-to-date");
  });

  it("--force replaces an edited skill", async () => {
    await initSkills({ dir: target(), source });
    const edited = join(target(), "skill-a", "SKILL.md");
    writeFileSync(edited, "# A\nmy own notes\n");

    const results = await initSkills({ dir: target(), source, force: true });

    expect(results.find((r) => r.name === "skill-a")?.outcome).toBe(
      "overwritten"
    );
    expect(readFileSync(edited, "utf8")).toBe("# A\nbundled\n");
  });

  it("leaves a partially-edited skill entirely alone", async () => {
    await initSkills({ dir: target(), source });
    // Edit one file of a two-file skill and delete the other: the skill must
    // not be half-restored, which would mix bundled and local content.
    writeFileSync(join(target(), "skill-b", "SKILL.md"), "# B\nlocal\n");
    rmSync(join(target(), "skill-b", "nested", "extra.md"));

    const results = await initSkills({ dir: target(), source });

    expect(results.find((r) => r.name === "skill-b")?.outcome).toBe("modified");
    expect(readFileSync(join(target(), "skill-b", "SKILL.md"), "utf8")).toBe(
      "# B\nlocal\n"
    );
    expect(() =>
      readFileSync(join(target(), "skill-b", "nested", "extra.md"))
    ).toThrow();
  });

  it("restores a skill whose files were deleted", async () => {
    await initSkills({ dir: target(), source });
    rmSync(join(target(), "skill-a"), { recursive: true });

    const results = await initSkills({ dir: target(), source });

    expect(results.find((r) => r.name === "skill-a")?.outcome).toBe("installed");
    expect(readFileSync(join(target(), "skill-a", "SKILL.md"), "utf8")).toBe(
      "# A\nbundled\n"
    );
  });

  it("updates a stale but unedited skill", async () => {
    await initSkills({ dir: target(), source });
    // A new package version ships different text; the user never touched it.
    writeFileSync(join(source, "skill-a", "SKILL.md"), "# A\nbundled v2\n");

    const results = await initSkills({ dir: target(), source });

    // It differs from what is on disk, so without --force it is treated as
    // "possibly yours" and kept — the safe default when we cannot tell an
    // upstream change from a local one.
    expect(results.find((r) => r.name === "skill-a")?.outcome).toBe("modified");
    expect(
      (await initSkills({ dir: target(), source, force: true })).find(
        (r) => r.name === "skill-a"
      )?.outcome
    ).toBe("overwritten");
  });

  it("ignores loose files next to the skill folders", async () => {
    writeFileSync(join(source, "README.md"), "not a skill\n");
    const results = await initSkills({ dir: target(), source });
    expect(results.map((r) => r.name)).toEqual(["skill-a", "skill-b"]);
  });
});

describe("formatResults", () => {
  it("summarizes a fresh install", () => {
    const { lines, warned } = formatResults(
      [
        { name: "skill-a", path: "x", outcome: "installed" },
        { name: "skill-b", path: "x", outcome: "installed" },
      ],
      "/p/.claude/skills"
    );
    expect(warned).toBe(false);
    expect(lines[0]).toBe("/p/.claude/skills");
    expect(lines.join("\n")).toContain("+ skill-a");
    expect(lines.join("\n")).toContain("2 installed");
  });

  it("warns and explains --force when something was skipped", () => {
    const { lines, warned } = formatResults(
      [
        { name: "skill-a", path: "x", outcome: "modified" },
        { name: "skill-b", path: "x", outcome: "up-to-date" },
      ],
      "/p/.claude/skills"
    );
    expect(warned).toBe(true);
    const text = lines.join("\n");
    expect(text).toContain("differs from the bundled copy, kept");
    // The hint must cover both causes of a difference, not just a local edit.
    expect(text).toContain("upgraded sluglist");
    expect(text).toContain("--force");
    expect(text).toContain("1 up to date, 1 skipped");
  });
});
