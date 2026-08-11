import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * `sluglist init-skills` — copy the bundled Claude Code skills into a project's
 * `.claude/skills/`.
 *
 * This replaces the `mkdir -p … && cp -r node_modules/sluglist/skills/…` line
 * the docs used to ask people to run, which was the roughest step of the whole
 * flow: it hard-coded a path into `node_modules`, had to be repeated per skill,
 * and silently clobbered local edits.
 *
 * The rule that shapes the behaviour: **a file the user has edited is never
 * overwritten.** Skills are prompts, and editing them to fit a project is the
 * expected thing to do — so an unchanged file is refreshed silently, a modified
 * one is reported and left alone, and `--force` is the explicit way to say
 * "take the bundled version anyway".
 */

export type SkillOutcome =
  | "installed"
  | "up-to-date"
  | "modified"
  | "overwritten";

export interface SkillResult {
  /** Skill folder name, e.g. "sluglist-qa". */
  name: string;
  /** Path written (or that would have been written), relative to cwd. */
  path: string;
  outcome: SkillOutcome;
}

export interface InitSkillsOptions {
  /** Target skills folder. Default ".claude/skills". */
  dir?: string;
  /** Overwrite files the user has modified. Default false. */
  force?: boolean;
  /** Where the bundled skills live. Defaults to the package's own `skills/`. */
  source?: string;
}

/**
 * Locate the package's bundled `skills/` folder.
 *
 * The CLI is bundled to `dist/cli.js`, so `skills/` is one level up from the
 * built file. Running from source (`src/cli/`) it is two levels up. Both are
 * probed rather than assumed so `tsx src/cli/index.ts` behaves like the shipped
 * binary.
 */
async function findBundledSkills(): Promise<string> {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, "../skills"), // dist/cli.js  → <pkg>/skills
    resolve(here, "../../skills"), // src/cli/index.ts → <pkg>/skills
  ];
  for (const candidate of candidates) {
    try {
      const entries = await readdir(candidate, { withFileTypes: true });
      if (entries.some((e) => e.isDirectory())) {
        return candidate;
      }
    } catch {
      // Not this one.
    }
  }
  throw new Error(
    "could not locate the bundled skills folder inside the sluglist package"
  );
}

function digest(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Every file inside a skill folder, relative to it (one level of nesting). */
async function skillFiles(dir: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const rel = prefix ? join(prefix, entry.name) : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await skillFiles(join(dir, entry.name), rel)));
    } else if (entry.isFile()) {
      files.push(rel);
    }
  }
  return files;
}

/**
 * Install the bundled skills. Returns one result per skill; the caller prints
 * them. A skill counts as `modified` when ANY of its files differs from the
 * bundled copy — the folder is the unit a user thinks in.
 */
export async function initSkills(
  options: InitSkillsOptions = {}
): Promise<SkillResult[]> {
  const source = options.source ?? (await findBundledSkills());
  const targetRoot = resolve(options.dir ?? join(".claude", "skills"));

  const skills = (await readdir(source, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, "en"));

  const results: SkillResult[] = [];

  for (const name of skills) {
    const from = join(source, name);
    const to = join(targetRoot, name);
    const files = await skillFiles(from);

    // Compare before writing anything, so a partially-modified skill is left
    // entirely untouched rather than half-updated.
    let existing = 0;
    let differs = false;
    for (const file of files) {
      try {
        const current = await readFile(join(to, file), "utf8");
        existing++;
        if (digest(current) !== digest(await readFile(join(from, file), "utf8"))) {
          differs = true;
        }
      } catch {
        // Missing file — it will simply be written.
      }
    }

    const isNew = existing === 0;
    if (differs && !options.force) {
      results.push({ name, path: to, outcome: "modified" });
      continue;
    }
    if (!(isNew || differs)) {
      results.push({ name, path: to, outcome: "up-to-date" });
      continue;
    }

    for (const file of files) {
      const destination = join(to, file);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, await readFile(join(from, file)));
    }
    results.push({
      name,
      path: to,
      outcome: isNew ? "installed" : "overwritten",
    });
  }

  return results;
}

/** Human-readable lines for the CLI, plus whether anything needs attention. */
export function formatResults(
  results: SkillResult[],
  targetDir: string
): { lines: string[]; warned: boolean } {
  const lines: string[] = [];
  let warned = false;

  for (const result of results) {
    switch (result.outcome) {
      case "installed":
        lines.push(`  + ${result.name}`);
        break;
      case "overwritten":
        lines.push(`  ↻ ${result.name} (overwritten)`);
        break;
      case "up-to-date":
        lines.push(`  ✓ ${result.name} (up to date)`);
        break;
      case "modified":
        warned = true;
        // Deliberately not "edited locally": a package upgrade produces the
        // same difference, and claiming the user edited it would be false.
        lines.push(`  ! ${result.name} — differs from the bundled copy, kept`);
        break;
      default:
        break;
    }
  }

  const installed = results.filter((r) => r.outcome === "installed").length;
  const overwritten = results.filter((r) => r.outcome === "overwritten").length;
  const summary: string[] = [];
  if (installed > 0) {
    summary.push(`${installed} installed`);
  }
  if (overwritten > 0) {
    summary.push(`${overwritten} overwritten`);
  }
  const fresh = results.filter((r) => r.outcome === "up-to-date").length;
  if (fresh > 0) {
    summary.push(`${fresh} up to date`);
  }
  const modified = results.filter((r) => r.outcome === "modified").length;
  if (modified > 0) {
    summary.push(`${modified} skipped`);
  }

  lines.unshift(`${targetDir}`);
  lines.push("", summary.join(", "));
  if (warned) {
    lines.push(
      "Kept your copies. If you edited them, that is what you want; if you just",
      "upgraded sluglist, re-run with --force to take the new versions."
    );
  }
  return { lines, warned };
}
