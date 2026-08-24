import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { initSkills, type SkillResult } from "./init-skills";

/**
 * `sluglist init` — scaffold a project for the QA loop in one command.
 *
 * `init-skills` installs the skills; every real integration then needs the same
 * four things around them, written by hand each time: the committed-checklists
 * folder, a `.gitignore` block that keeps sessions local, a `PROJECT.md` holding
 * the project's own conventions, and a pointer from the repo's agent
 * instructions. This command does all of it, idempotently.
 *
 * Two rules shape the behaviour, both inherited from `init-skills`:
 *
 * - **Nothing the user wrote is overwritten.** Skills follow their existing
 *   semantics (identical → refreshed, different → kept unless `--force`), and
 *   `.sluglist/PROJECT.md` is stronger still: it holds the user's answers, not
 *   our file, so `--force` does not touch it either.
 * - **Re-running is safe** and reports what was created versus already present.
 */

export type StepOutcome =
  /** We wrote something that was not there. */
  | "created"
  /** Already there in the shape we want — nothing written. */
  | "present"
  /** Deliberately not done; `detail` says why. */
  | "skipped";

export interface StepResult {
  /** What this step is, for the CLI's output. */
  label: string;
  /** Path the step concerns, absolute. */
  path: string;
  outcome: StepOutcome;
  /** One clause of explanation, shown after the path. */
  detail?: string;
}

export interface InitResult {
  /** Project root everything was resolved against, absolute. */
  root: string;
  /** The non-skill steps, in the order they ran. */
  steps: StepResult[];
  /** Result of the skills step (same shape `init-skills` reports). */
  skills: SkillResult[];
  /** Absolute skills folder, for `formatResults`. */
  skillsDir: string;
}

export interface InitOptions {
  /** Project root. Default the current working directory. */
  root?: string;
  /** Passed through to the skills step. Never affects `PROJECT.md`. */
  force?: boolean;
  /** Append the "QA loop (sluglist)" section to CLAUDE.md / AGENTS.md. */
  agentsMd?: boolean;
  /** Bundled skills folder (tests override it). */
  source?: string;
  /** Bundled templates folder (tests override it). */
  templates?: string;
}

/** The artifact folder's name. Not configurable — the skills hard-code it. */
const ARTIFACT_DIR = ".sluglist";

/**
 * Sessions are local noise; the checklists are the spec and `PROJECT.md` is the
 * project's conventions, so both of those are re-included. (`.sluglist/*`
 * excludes the folder's *contents*, not the folder, which is what makes the two
 * negations work at all.)
 */
const GITIGNORE_BLOCK = `# sluglist QA sessions stay local; checklists and conventions are committed
${ARTIFACT_DIR}/*
!${ARTIFACT_DIR}/checklists/
!${ARTIFACT_DIR}/PROJECT.md`;

/**
 * The line whose presence means the block is already installed. Matched on the
 * pattern rather than the comment so a user who kept the rules and dropped the
 * comment (or wrote the rules themselves) is not given a duplicate.
 */
const GITIGNORE_MARKER = `${ARTIFACT_DIR}/*`;

/** Heading that marks the agent-instructions section as already appended. */
const AGENTS_MARKER = "## QA loop (sluglist)";

const AGENTS_SECTION = `${AGENTS_MARKER}

Acceptance QA runs through the bundled sluglist skills: generate a checklist, walk it in a browser
with evidence, fix what failed, re-test. Start with the \`sluglist-loop\` skill — it picks the intent
and sequences the stages.

- Checklists are the committed spec: \`${ARTIFACT_DIR}/checklists/<name>.json\`.
- QA sessions are local and gitignored: \`${ARTIFACT_DIR}/session-*/\`.
- \`npx sluglist report\` renders a finished session as one self-contained HTML file.
- \`npx sluglist status\` says where the loop stands — what still fails, and whether another
  fix→re-test round is worth running.
- Read \`${ARTIFACT_DIR}/PROJECT.md\` for this project's conventions — base branch, how to run and
  sign in, hard limits, evidence mode. Its answers override the skills' defaults.`;

/** Files that count as repo-level agent instructions, in the order we report. */
const AGENTS_FILES = ["CLAUDE.md", "AGENTS.md"];

/**
 * Locate the package's bundled `templates/` folder. Probed the same way as the
 * skills folder, so running from source behaves like the shipped binary.
 */
async function findTemplates(): Promise<string> {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, "../templates"), // dist/cli.js       → <pkg>/templates
    resolve(here, "../../templates"), // src/cli/index.ts → <pkg>/templates
  ];
  for (const candidate of candidates) {
    try {
      const entries = await readdir(candidate, { withFileTypes: true });
      if (entries.some((e) => e.isFile())) {
        return candidate;
      }
    } catch {
      // Not this one.
    }
  }
  throw new Error(
    "could not locate the bundled templates folder inside the sluglist package"
  );
}

async function exists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

/** `.sluglist/checklists/` — the committed-checklists convention. */
async function stepChecklists(root: string): Promise<StepResult> {
  const path = join(root, ARTIFACT_DIR, "checklists");
  const already = await readdir(path).then(
    () => true,
    () => false
  );
  if (already) {
    return { label: "checklists folder", path, outcome: "present" };
  }
  await mkdir(path, { recursive: true });
  return { label: "checklists folder", path, outcome: "created" };
}

/**
 * Append the ignore block. A missing `.gitignore` is created; an existing one is
 * appended to, never rewritten — it is the user's file and may hold anything.
 */
async function stepGitignore(root: string): Promise<StepResult> {
  const path = join(root, ".gitignore");
  const label = ".gitignore rules";
  let current: string | null = null;
  try {
    current = await readFile(path, "utf8");
  } catch {
    // Absent — created below.
  }

  if (current === null) {
    await writeFile(path, `${GITIGNORE_BLOCK}\n`, "utf8");
    return { label, path, outcome: "created" };
  }
  if (current.split(/\r?\n/).some((line) => line.trim() === GITIGNORE_MARKER)) {
    return { label, path, outcome: "present" };
  }
  const separator = current.endsWith("\n\n")
    ? ""
    : current.endsWith("\n")
      ? "\n"
      : "\n\n";
  await writeFile(path, `${current}${separator}${GITIGNORE_BLOCK}\n`, "utf8");
  return { label, path, outcome: "created" };
}

/**
 * `.sluglist/PROJECT.md` from the bundled template.
 *
 * Never overwritten — not even with `--force`. The file holds the user's answers
 * about their own project; replacing it with the blank template would destroy
 * exactly the information the skills depend on.
 */
async function stepProjectMd(
  root: string,
  templates: string
): Promise<StepResult> {
  const path = join(root, ARTIFACT_DIR, "PROJECT.md");
  const label = "PROJECT.md";
  if (await exists(path)) {
    return { label, path, outcome: "present", detail: "yours, left alone" };
  }
  const template = await readFile(join(templates, "PROJECT.md"), "utf8");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, template, "utf8");
  return { label, path, outcome: "created", detail: "fill it in" };
}

/**
 * Append the QA-loop section to whichever agent-instruction files the repo has.
 *
 * Gated behind `--agents-md`: the CLI never prompts, and appending to a file as
 * personal as CLAUDE.md should be asked for rather than assumed.
 */
async function stepAgentsMd(
  root: string,
  requested: boolean
): Promise<StepResult[]> {
  const found: string[] = [];
  for (const name of AGENTS_FILES) {
    if (await exists(join(root, name))) {
      found.push(name);
    }
  }

  if (found.length === 0) {
    return requested
      ? [
          {
            label: "agent instructions",
            path: root,
            outcome: "skipped",
            detail: `no ${AGENTS_FILES.join(" or ")} at the project root`,
          },
        ]
      : [];
  }
  const results: StepResult[] = [];
  for (const name of found) {
    const path = join(root, name);
    const current = await readFile(path, "utf8");
    // Report the section as present whether or not the flag was given: nudging
    // someone to add something they already have is noise.
    if (current.includes(AGENTS_MARKER)) {
      results.push({ label: name, path, outcome: "present" });
      continue;
    }
    if (!requested) {
      results.push({
        label: name,
        path,
        outcome: "skipped",
        detail: "re-run with --agents-md to add the QA loop section",
      });
      continue;
    }
    const separator = current.endsWith("\n\n")
      ? ""
      : current.endsWith("\n")
        ? "\n"
        : "\n\n";
    await writeFile(path, `${current}${separator}${AGENTS_SECTION}\n`, "utf8");
    results.push({ label: name, path, outcome: "created", detail: "section appended" });
  }
  return results;
}

/**
 * Scaffold the project. Every step is independent and idempotent; the caller
 * prints the result with {@link formatInit}.
 */
export async function initProject(
  options: InitOptions = {}
): Promise<InitResult> {
  const root = resolve(options.root ?? ".");
  const templates = options.templates ?? (await findTemplates());
  const skillsDir = join(root, ".claude", "skills");

  const steps: StepResult[] = [
    await stepChecklists(root),
    await stepGitignore(root),
    await stepProjectMd(root, templates),
  ];

  const skills = await initSkills({
    dir: skillsDir,
    force: options.force,
    source: options.source,
  });

  steps.push(...(await stepAgentsMd(root, options.agentsMd === true)));

  return { root, steps, skills, skillsDir };
}

const MARK: Record<StepOutcome, string> = {
  created: "+",
  present: "✓",
  skipped: "·",
};

/**
 * Human-readable lines for the non-skill steps. The skills step keeps its own
 * formatter (`formatResults`) so its output is identical under `init` and
 * `init-skills`.
 */
export function formatInit(result: InitResult): { lines: string[] } {
  const lines = [result.root];
  for (const step of result.steps) {
    const path = relative(result.root, step.path) || ".";
    const suffix =
      step.detail !== undefined
        ? ` (${step.detail})`
        : step.outcome === "present"
          ? " (already present)"
          : "";
    lines.push(`  ${MARK[step.outcome]} ${path}${suffix}`);
  }
  return { lines };
}
