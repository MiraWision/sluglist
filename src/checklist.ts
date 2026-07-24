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
  /** Optional one-line hint shown under the item. */
  hint?: string;
  /** Optional page where the item is verified; the UI shows an "open" link. */
  url?: string;
}

export interface ChecklistSection {
  title: string;
  items: ChecklistItem[];
}

export interface Checklist {
  id: string;
  title: string;
  sections: ChecklistSection[];
}

/** A validated item: flattened, carrying its section title. */
export interface ChecklistDefItem {
  id: string;
  section: string;
  title: string;
  hint?: string;
  url?: string;
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
  sections: ChecklistDefSection[];
}

export type Verdict = "pass" | "fail" | "skip";

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
}

/** The session-level checklist block: definition identity + per-item verdicts. */
export interface ChecklistState {
  id: string;
  title: string;
  items: ChecklistVerdictItem[];
}

// Limits (invalid input is dropped with a warning, never throws — a bad
// checklist must not block plain capture).
const MAX_SECTIONS = 20;
const MAX_ITEMS = 50;
const MAX_TITLE = 120;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const MAX_ID = 80;

const VERDICTS = new Set<Verdict>(["pass", "fail", "skip"]);

export function isVerdict(value: unknown): value is Verdict {
  return typeof value === "string" && VERDICTS.has(value as Verdict);
}

function clipTitle(value: string): string {
  return value.length > MAX_TITLE ? value.slice(0, MAX_TITLE) : value;
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
  return { id, title, sections };
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
