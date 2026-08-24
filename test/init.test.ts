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
import { formatInit, initProject, type StepResult } from "../src/cli/init";

/**
 * `sluglist init` is the one-command scaffold, so the properties that matter are
 * idempotency (a second run changes nothing) and the two "never overwrite"
 * rules: an edited skill survives, and `.sluglist/PROJECT.md` survives even
 * `--force` because it holds the user's own answers.
 */

let dir: string;
let root: string;
let source: string;
let templates: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "sluglist-init-"));
  root = join(dir, "project");
  mkdirSync(root, { recursive: true });

  // Miniature bundled folders, so these tests don't depend on the real skill
  // texts or template copy (both change often).
  source = join(dir, "bundled-skills");
  mkdirSync(join(source, "skill-a"), { recursive: true });
  writeFileSync(join(source, "skill-a", "SKILL.md"), "# A\nbundled\n");

  templates = join(dir, "bundled-templates");
  mkdirSync(templates, { recursive: true });
  writeFileSync(join(templates, "PROJECT.md"), "# conventions\n\n## Base branch\n");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function run(overrides: Record<string, unknown> = {}) {
  return initProject({ root, source, templates, ...overrides });
}

function step(steps: StepResult[], label: string): StepResult {
  const found = steps.find((s) => s.label === label);
  if (!found) {
    throw new Error(`no step labelled ${label}`);
  }
  return found;
}

function read(...parts: string[]): string {
  return readFileSync(join(root, ...parts), "utf8");
}

describe("initProject — fresh project", () => {
  it("creates the folder, the ignore rules, PROJECT.md and the skills", async () => {
    const result = await run();

    expect(step(result.steps, "checklists folder").outcome).toBe("created");
    expect(step(result.steps, ".gitignore rules").outcome).toBe("created");
    expect(step(result.steps, "PROJECT.md").outcome).toBe("created");
    expect(result.skills.map((s) => s.outcome)).toEqual(["installed"]);

    expect(read(".gitignore")).toBe(
      "# sluglist QA sessions stay local; checklists and conventions are committed\n" +
        ".sluglist/*\n" +
        "!.sluglist/checklists/\n" +
        "!.sluglist/PROJECT.md\n"
    );
    expect(read(".sluglist", "PROJECT.md")).toContain("## Base branch");
    expect(read(".claude", "skills", "skill-a", "SKILL.md")).toContain("bundled");
  });

  it("says nothing about agent instructions when the repo has none", async () => {
    const result = await run();
    expect(result.steps.some((s) => s.label === "CLAUDE.md")).toBe(false);
    expect(result.steps.some((s) => s.label === "agent instructions")).toBe(false);
  });

  it("reports a --agents-md request it cannot honour", async () => {
    const result = await run({ agentsMd: true });
    const only = step(result.steps, "agent instructions");
    expect(only.outcome).toBe("skipped");
    expect(only.detail).toContain("CLAUDE.md or AGENTS.md");
  });
});

describe("initProject — re-running", () => {
  it("changes nothing and reports everything as already present", async () => {
    await run();
    const before = {
      gitignore: read(".gitignore"),
      project: read(".sluglist", "PROJECT.md"),
      skill: read(".claude", "skills", "skill-a", "SKILL.md"),
    };

    const result = await run();

    expect(step(result.steps, "checklists folder").outcome).toBe("present");
    expect(step(result.steps, ".gitignore rules").outcome).toBe("present");
    expect(step(result.steps, "PROJECT.md").outcome).toBe("present");
    expect(result.skills.map((s) => s.outcome)).toEqual(["up-to-date"]);

    expect(read(".gitignore")).toBe(before.gitignore);
    expect(read(".sluglist", "PROJECT.md")).toBe(before.project);
    expect(read(".claude", "skills", "skill-a", "SKILL.md")).toBe(before.skill);
  });

  it("does not duplicate the ignore rules when only the comment was removed", async () => {
    writeFileSync(
      join(root, ".gitignore"),
      "node_modules/\n.sluglist/*\n!.sluglist/checklists/\n"
    );
    const result = await run();
    expect(step(result.steps, ".gitignore rules").outcome).toBe("present");
    expect(read(".gitignore")).toBe(
      "node_modules/\n.sluglist/*\n!.sluglist/checklists/\n"
    );
  });
});

describe("initProject — existing files", () => {
  it("appends to an existing .gitignore without rewriting it", async () => {
    writeFileSync(join(root, ".gitignore"), "node_modules/\ndist/\n");
    await run();
    const text = read(".gitignore");
    expect(text.startsWith("node_modules/\ndist/\n")).toBe(true);
    expect(text).toContain("\n!.sluglist/checklists/\n!.sluglist/PROJECT.md\n");
  });

  it("separates the block when the file has no trailing newline", async () => {
    writeFileSync(join(root, ".gitignore"), "dist/");
    await run();
    expect(read(".gitignore")).toBe(
      "dist/\n\n# sluglist QA sessions stay local; checklists and conventions are committed\n" +
        ".sluglist/*\n!.sluglist/checklists/\n!.sluglist/PROJECT.md\n"
    );
  });

  it("never overwrites PROJECT.md, even with --force", async () => {
    await run();
    const path = join(root, ".sluglist", "PROJECT.md");
    writeFileSync(path, "# my answers\nbase: preview\n");

    const result = await run({ force: true });

    expect(step(result.steps, "PROJECT.md").outcome).toBe("present");
    expect(readFileSync(path, "utf8")).toBe("# my answers\nbase: preview\n");
  });

  it("upgrades pristine skills while keeping an edited one and PROJECT.md", async () => {
    await run();
    const edited = join(root, ".claude", "skills", "skill-a", "SKILL.md");
    writeFileSync(edited, "# A\nmy own notes\n");
    writeFileSync(join(root, ".sluglist", "PROJECT.md"), "# mine\n");
    // A second bundled skill appears in a later package version.
    mkdirSync(join(source, "skill-b"), { recursive: true });
    writeFileSync(join(source, "skill-b", "SKILL.md"), "# B\nbundled\n");

    const result = await run();

    expect(result.skills.find((s) => s.name === "skill-a")?.outcome).toBe(
      "modified"
    );
    expect(result.skills.find((s) => s.name === "skill-b")?.outcome).toBe(
      "installed"
    );
    expect(readFileSync(edited, "utf8")).toBe("# A\nmy own notes\n");
    expect(read(".sluglist", "PROJECT.md")).toBe("# mine\n");
  });
});

describe("initProject — agent instructions", () => {
  it("appends the section to CLAUDE.md and AGENTS.md with --agents-md", async () => {
    writeFileSync(join(root, "CLAUDE.md"), "# Project\n\nSome rules.\n");
    writeFileSync(join(root, "AGENTS.md"), "# Agents\n");

    const result = await run({ agentsMd: true });

    expect(step(result.steps, "CLAUDE.md").outcome).toBe("created");
    expect(step(result.steps, "AGENTS.md").outcome).toBe("created");
    const claude = read("CLAUDE.md");
    expect(claude.startsWith("# Project\n\nSome rules.\n")).toBe(true);
    expect(claude).toContain("## QA loop (sluglist)");
    expect(claude).toContain(".sluglist/checklists/<name>.json");
    expect(claude).toContain(".sluglist/PROJECT.md");
    expect(read("AGENTS.md")).toContain("## QA loop (sluglist)");
  });

  it("is idempotent — a second --agents-md run appends nothing", async () => {
    writeFileSync(join(root, "CLAUDE.md"), "# Project\n");
    await run({ agentsMd: true });
    const once = read("CLAUDE.md");

    const result = await run({ agentsMd: true });

    expect(step(result.steps, "CLAUDE.md").outcome).toBe("present");
    expect(read("CLAUDE.md")).toBe(once);
  });

  it("reports the section as present without the flag once it is there", async () => {
    writeFileSync(join(root, "CLAUDE.md"), "# Project\n");
    await run({ agentsMd: true });

    // No nudge to add something the file already has.
    const result = await run();

    const only = step(result.steps, "CLAUDE.md");
    expect(only.outcome).toBe("present");
    expect(only.detail).toBeUndefined();
  });

  it("touches nothing without the flag, but points the flag out", async () => {
    writeFileSync(join(root, "CLAUDE.md"), "# Project\n");
    const result = await run();

    const only = step(result.steps, "CLAUDE.md");
    expect(only.outcome).toBe("skipped");
    expect(only.detail).toContain("--agents-md");
    expect(read("CLAUDE.md")).toBe("# Project\n");
  });
});

describe("formatInit", () => {
  it("lists each step relative to the project root", async () => {
    const result = await run();
    const { lines } = formatInit(result);

    expect(lines[0]).toBe(result.root);
    const text = lines.join("\n");
    expect(text).toContain("+ .sluglist/checklists");
    expect(text).toContain("+ .gitignore");
    expect(text).toContain("+ .sluglist/PROJECT.md (fill it in)");
  });

  it("marks a second run as already present", async () => {
    await run();
    const { lines } = formatInit(await run());
    const text = lines.join("\n");
    expect(text).toContain("✓ .sluglist/checklists (already present)");
    expect(text).toContain("✓ .gitignore (already present)");
    expect(text).toContain("✓ .sluglist/PROJECT.md (yours, left alone)");
  });
});
