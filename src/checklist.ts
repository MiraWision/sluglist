/**
 * Checklist mode: structured UAT acceptance. A developer pre-seeds a list of
 * items ("what shipped and what to verify"); the client walks them and records a
 * verdict per item (pass / fail / skip). On fail the normal issue flow opens and
 * the item is linked to that issue.
 *
 * This module owns the *definition* (config → validated `ChecklistDef`) and the
 * *state* (verdicts, persisted in the session and rendered into session.yaml).
 * It is intentionally pure so it is unit-testable in isolation, mirroring
 * `reporter.ts`. The verdict lifecycle stops at the session: no reopening, no
 * cross-session sync, no server-side status — every session runs the list fresh.
 */

/** Config shape: a checklist grouped into sections (as authored by the dev). */
export interface ChecklistItem {
  id: string;
  title: string;
  /** Optional one-line hint shown under the item (human navigation step). */
  hint?: string;
  /**
   * Optional STATIC page where the item is verified; the UI shows an "open"
   * link that navigates there. Never a dynamic path (an id/uuid in the route) —
   * use {@link ChecklistItem.url_match} for those. `url` and `url_match` may
   * coexist (url → the list page, url_match → the detail page).
   */
  url?: string;
  /**
   * Optional wildcard path pattern for DYNAMIC pages, e.g. `/assessments/*`.
   * NOT used for navigation — only to highlight the item as "you're here" when
   * the current path matches. Must contain a `*`; non-wildcard values are
   * dropped with a warning (a static path belongs in {@link ChecklistItem.url}).
   */
  url_match?: string;
}

export interface ChecklistSection {
  title: string;
  items: ChecklistItem[];
}

export interface Checklist {
  id: string;
  title: string;
  /** Optional 1–2 sentence instruction shown in the panel header. */
  description?: string;
  /**
   * Provenance (additive): the id of the checklist this one re-tests. Set by
   * the generator's re-test mode (the derived id is `<orig>-retest-N`); absent
   * on a first-pass checklist. Carried through validation for readers; the
   * widget itself ignores it.
   */
  retest_of?: string;
  /**
   * Provenance (additive, format 1.6): why this checklist exists — `branch`
   * (generated from a diff), `re-test` (a previous run's failures), `smoke` (a
   * broad pass over the app), `scenario` (a focused list from a written brief).
   * Free-form so future intents need no format change; readers must tolerate a
   * value they do not know. Advisory only — the widget never acts on it.
   */
  intent?: string;
  sections: ChecklistSection[];
}

/** A validated item: flattened, carrying its section title. */
export interface ChecklistDefItem {
  id: string;
  section: string;
  title: string;
  hint?: string;
  url?: string;
  /** Validated wildcard pattern (contains `*`); highlight-only, never navigated. */
  url_match?: string;
}

/** A validated section (order + items preserved) for UI grouping. */
export interface ChecklistDefSection {
  title: string;
  items: ChecklistDefItem[];
}

/** The normalized checklist definition the UI renders and the core seeds from. */
export interface ChecklistDef {
  id: string;
  title: string;
  /** Optional 1–2 sentence instruction shown in the panel header. */
  description?: string;
  /** Provenance: id of the checklist this one re-tests (see {@link Checklist}). */
  retest_of?: string;
  /** Provenance: why this checklist exists (see {@link Checklist.intent}). */
  intent?: string;
  sections: ChecklistDefSection[];
}

export type Verdict = "pass" | "fail" | "skip";

/** Max length of an evidence note (one line of observed fact). */
export const MAX_EVIDENCE_NOTE = 500;

/**
 * Optional proof attached to a verdict (format 1.6). Symmetry with `fail`: a
 * `pass` may carry the screenshot(s) taken at the moment of the check plus a
 * one-line note stating the *observed fact* — so a reader can verify the
 * verdict instead of trusting the reporter's word.
 *
 * A screenshot proves "the screen looked like this", never "the action
 * worked": for checks whose result is invisible on screen (a download, a
 * submission, a background job) the note carries the observation — the
 * downloaded file's name and size, the toast text, the changed counter.
 * See the anti-theatre rule in the sluglist-qa skill.
 */
export interface ChecklistEvidence {
  /** Evidence file names, in order; each sits next to session.yaml. */
  screenshots: string[];
  /** One line of observed fact; clipped to {@link MAX_EVIDENCE_NOTE}. */
  note?: string;
}

/**
 * A checklist item's verdict as persisted in the session and written to
 * session.yaml. `verdict`/`issue`/`ts` are null until the client acts.
 */
export interface ChecklistVerdictItem {
  id: string;
  section: string;
  title: string;
  verdict: Verdict | null;
  /** Issue id (e.g. "03") when a fail opened an issue; null otherwise. */
  issue: string | null;
  /** ISO timestamp when the verdict was set; null when unset. */
  ts: string | null;
  /**
   * Additive (format 1.6): proof for this verdict. Absent when the reporter
   * recorded a bare verdict — the pre-1.6 behaviour, and still the default for
   * `fail` (whose evidence is the linked issue) and for unverified items.
   */
  evidence?: ChecklistEvidence;
}

/** The session-level checklist block: definition identity + per-item verdicts. */
export interface ChecklistState {
  id: string;
  title: string;
  /**
   * Additive (format 1.6): the definition's {@link Checklist.intent}, carried
   * into the session so a reader of session.yaml alone knows what kind of run
   * this was. Absent when the checklist declares no intent.
   */
  intent?: string;
  items: ChecklistVerdictItem[];
}

// Limits (invalid input is dropped with a warning, never throws — a bad
// checklist must not block plain capture).
const MAX_SECTIONS = 20;
const MAX_ITEMS = 50;
const MAX_TITLE = 120;
const MAX_DESCRIPTION = 280;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const MAX_ID = 80;
const MAX_INTENT = 40;

const VERDICTS = new Set<Verdict>(["pass", "fail", "skip"]);

export function isVerdict(value: unknown): value is Verdict {
  return typeof value === "string" && VERDICTS.has(value as Verdict);
}

function clipTitle(value: string): string {
  return value.length > MAX_TITLE ? value.slice(0, MAX_TITLE) : value;
}

function clip(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

/**
 * A url_match is a wildcard PATH pattern: it must be a path (starts with `/`)
 * and must contain a `*` — a value with no wildcard is a static path and
 * belongs in `url` instead, so it is rejected here (dropped with a warning).
 */
function isValidUrlMatch(value: string): boolean {
  return value.startsWith("/") && value.includes("*");
}

/**
 * Match a path against a validated url_match pattern. `*` matches one non-empty
 * path segment (`[^/]+`); a trailing `/*` therefore matches any single child
 * segment (e.g. `/assessments/*` matches `/assessments/abc-123`, not
 * `/assessments` nor `/assessments/abc/edit`). Path only — query/hash are
 * ignored by the caller. Pure, so it is unit-testable.
 */
export function matchUrlPattern(pattern: string, path: string): boolean {
  const clean = (s: string): string =>
    s.length > 1 && s.endsWith("/") ? s.slice(0, -1) : s;
  const escaped = clean(pattern)
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, "[^/]+");
  return new RegExp(`^${escaped}$`).test(clean(path));
}

function warn(message: string): void {
  console.warn(`[sluglist] checklist: ${message}`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validate raw checklist config (inline object or fetched JSON) into a
 * `ChecklistDef`. Enforces: string id/title, ≤ 20 sections, ≤ 50 items total,
 * titles clipped to 120 chars, unique item ids (dupes dropped). Returns null
 * when the input is structurally invalid or nothing usable survives — the caller
 * then simply does not show the checklist button.
 */
export function normalizeChecklist(raw: unknown): ChecklistDef | null {
  if (!isPlainObject(raw)) {
    warn("expected an object with id, title, sections");
    return null;
  }
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!(id && ID_PATTERN.test(id) && id.length <= MAX_ID)) {
    warn(`invalid checklist id ${JSON.stringify(raw.id)}`);
    return null;
  }
  const title =
    typeof raw.title === "string" && raw.title.trim()
      ? clipTitle(raw.title.trim())
      : id;
  const description =
    typeof raw.description === "string" && raw.description.trim()
      ? clip(raw.description.trim(), MAX_DESCRIPTION)
      : undefined;
  if (!Array.isArray(raw.sections)) {
    warn("`sections` must be an array");
    return null;
  }

  const seenIds = new Set<string>();
  const sections: ChecklistDefSection[] = [];
  let itemCount = 0;

  for (const rawSection of raw.sections) {
    if (sections.length >= MAX_SECTIONS) {
      warn(`over the ${MAX_SECTIONS}-section limit — extra sections dropped`);
      break;
    }
    if (!isPlainObject(rawSection) || !Array.isArray(rawSection.items)) {
      warn("skipping a section without an `items` array");
      continue;
    }
    const sectionTitle =
      typeof rawSection.title === "string" && rawSection.title.trim()
        ? clipTitle(rawSection.title.trim())
        : "";
    const items: ChecklistDefItem[] = [];
    for (const rawItem of rawSection.items) {
      if (itemCount >= MAX_ITEMS) {
        warn(`over the ${MAX_ITEMS}-item limit — extra items dropped`);
        break;
      }
      if (!isPlainObject(rawItem)) {
        continue;
      }
      const itemId = typeof rawItem.id === "string" ? rawItem.id.trim() : "";
      if (!(itemId && ID_PATTERN.test(itemId) && itemId.length <= MAX_ID)) {
        warn(`dropping item with invalid id ${JSON.stringify(rawItem.id)}`);
        continue;
      }
      if (seenIds.has(itemId)) {
        warn(`dropping duplicate item id "${itemId}"`);
        continue;
      }
      const itemTitle =
        typeof rawItem.title === "string" && rawItem.title.trim()
          ? clipTitle(rawItem.title.trim())
          : "";
      if (!itemTitle) {
        warn(`dropping item "${itemId}" — missing title`);
        continue;
      }
      seenIds.add(itemId);
      itemCount++;
      const item: ChecklistDefItem = {
        id: itemId,
        section: sectionTitle,
        title: itemTitle,
      };
      if (typeof rawItem.hint === "string" && rawItem.hint.trim()) {
        item.hint = clipTitle(rawItem.hint.trim());
      }
      if (typeof rawItem.url === "string" && rawItem.url.trim()) {
        item.url = rawItem.url.trim();
      }
      if (typeof rawItem.url_match === "string" && rawItem.url_match.trim()) {
        const pattern = rawItem.url_match.trim();
        if (isValidUrlMatch(pattern)) {
          item.url_match = pattern;
        } else {
          warn(
            `dropping url_match ${JSON.stringify(rawItem.url_match)} on "${itemId}" — expected a wildcard path like "/x/*"`
          );
        }
      }
      items.push(item);
    }
    if (items.length > 0) {
      sections.push({ title: sectionTitle, items });
    }
    if (itemCount >= MAX_ITEMS) {
      break;
    }
  }

  if (itemCount === 0) {
    warn("no valid items — checklist ignored");
    return null;
  }
  // Additive provenance: preserved when it is a valid id, so re-test readers
  // can trace the chain; the widget itself never acts on it.
  const retestOf =
    typeof raw.retest_of === "string" &&
    raw.retest_of.trim() &&
    ID_PATTERN.test(raw.retest_of.trim()) &&
    raw.retest_of.trim().length <= MAX_ID
      ? raw.retest_of.trim()
      : undefined;
  // Additive provenance (1.6): free-form so a future intent needs no format
  // change; only shape is enforced (a short slug), never the vocabulary.
  const intent =
    typeof raw.intent === "string" &&
    raw.intent.trim() &&
    ID_PATTERN.test(raw.intent.trim()) &&
    raw.intent.trim().length <= MAX_INTENT
      ? raw.intent.trim()
      : undefined;
  if (raw.intent !== undefined && intent === undefined) {
    warn(`dropping invalid intent ${JSON.stringify(raw.intent)}`);
  }
  return {
    id,
    title,
    ...(description ? { description } : {}),
    ...(retestOf ? { retest_of: retestOf } : {}),
    ...(intent ? { intent } : {}),
    sections,
  };
}

/** Flatten a definition's items in order. */
export function checklistItems(def: ChecklistDef): ChecklistDefItem[] {
  return def.sections.flatMap((s) => s.items);
}

/**
 * Seed a fresh `ChecklistState` from a definition — every item null (not yet
 * verified). This is the initial coverage map written to session.yaml.
 */
export function seedChecklistState(def: ChecklistDef): ChecklistState {
  return {
    id: def.id,
    title: def.title,
    ...(def.intent ? { intent: def.intent } : {}),
    items: checklistItems(def).map((item) => ({
      id: item.id,
      section: item.section,
      title: item.title,
      verdict: null,
      issue: null,
      ts: null,
    })),
  };
}

/** Count of items with a recorded verdict, and the total. */
export function checklistProgress(state: ChecklistState): {
  done: number;
  total: number;
} {
  const done = state.items.filter((i) => i.verdict !== null).length;
  return { done, total: state.items.length };
}
