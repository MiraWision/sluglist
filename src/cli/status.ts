import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { readSession, type SessionBundle, type YamlNode } from "../node/read";

/**
 * `sluglist status` — where the QA loop stands, read from the artifacts.
 *
 * A fix→re-test cycle is a chain of sessions: the first run produces verdicts,
 * a fix pass answers them in `fixes.yaml`, and the re-test run carries
 * `checklist.retest_of` back to the round it answers. That chain is the only
 * honest source for "are we done yet?" — an agent's memory of what it just did
 * is not, which is exactly why an autonomous loop needs this command.
 *
 * Everything here is derived; nothing is stored. Two consequences worth
 * knowing:
 *
 * - **No new artifact.** Deleting `.sluglist/` loses history, not state.
 * - **Pre-1.7 sessions still chain**, by falling back to the `<id>-retest-N`
 *   naming convention when `retest_of` is absent.
 */

/** The loop's decision, in one word. */
export type LoopVerdict =
  /** Nothing to report — no sessions on disk. */
  | "empty"
  /** No failing items left in the latest round. */
  | "green"
  /** Work remains that a fix pass can act on. */
  | "continue"
  /** Everything left has already survived a fix pass. A human should look. */
  | "stalled"
  /** Everything left is `wontfix` / `needs_info` — the loop cannot act. */
  | "blocked";

/** What the loop can still do about one failing item. */
export type OpenState =
  /** No fix record yet — the next fix pass should take it. */
  | "actionable"
  /** Recorded `fixed`; it needs a re-test round to confirm. */
  | "awaiting-retest"
  /** Recorded `wontfix` or `needs_info` — not the loop's to close. */
  | "blocked";

export interface RoundFixes {
  fixed: number;
  wontfix: number;
  needsInfo: number;
}

export interface Round {
  /** Absolute session folder. */
  dir: string;
  /** Folder name, e.g. `session-2026-08-16-a1b2`. */
  name: string;
  /** `created_at` from session.yaml, for ordering. Null when absent. */
  createdAt: string | null;
  /** Checklist id, or null for a plain feedback session. */
  checklistId: string | null;
  title: string | null;
  intent: string | null;
  /** `checklist.retest_of` (1.7) — the round this one answers. */
  retestOf: string | null;
  counts: {
    pass: number;
    fail: number;
    notTested: number;
    total: number;
  };
  /** Issues filed in this session. */
  issues: number;
  /** Null when no fix pass has run on this session. */
  fixes: RoundFixes | null;
  /** `.done` marker written by a fix pass. */
  done: boolean;
}

export interface OpenItem {
  /** Checklist item id, or `issue <NN>` for a plain feedback session. */
  id: string;
  title: string;
  /** How many rounds of this chain the item failed in. */
  failedRounds: number;
  /** Issue that documents the latest failure, when linked. */
  issue: string | null;
  state: OpenState;
  /** `wontfix` | `needs_info` | `fixed` — the record behind the state. */
  fixStatus: string | null;
  /** The fix record's note, when it has one. */
  note: string | null;
}

export interface Chain {
  /** The first round's checklist id (or session name) — the chain's identity. */
  key: string;
  title: string | null;
  intent: string | null;
  /** Oldest round first. */
  rounds: Round[];
  /** Items failing in the latest round. */
  open: OpenItem[];
  /**
   * Items the latest round never checked, with the tester's reason when one was
   * recorded (format 1.9). A coverage gap is only actionable if you know why it
   * is there — "no surface for it in the app" and "ran out of time" call for
   * different answers from the owner.
   */
  notTested: { id: string; title: string; reason: string | null }[];
  verdict: LoopVerdict;
  /** One line explaining the verdict. */
  reason: string;
}

export interface StatusResult {
  /** Artifact folder that was read, absolute. */
  dir: string;
  /** Chains included in this result, oldest first. */
  chains: Chain[];
  /** Chains left out (only the newest is shown unless `all`). */
  older: number;
  /** The newest chain's verdict — the loop's own state. */
  verdict: LoopVerdict;
  reason: string;
}

export interface StatusOptions {
  /** Artifact folder. Default `.sluglist`. */
  dir?: string;
  /** A session folder: report only the chain that contains it. */
  target?: string;
  /** Include every chain, not just the newest. */
  all?: boolean;
}

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

function str(node: YamlNode | undefined): string | null {
  return typeof node === "string" && node !== "" ? node : null;
}

function rec(node: YamlNode | undefined): Record<string, YamlNode> {
  return node && typeof node === "object" && !Array.isArray(node) ? node : {};
}

function list(node: YamlNode | undefined): Record<string, YamlNode>[] {
  return Array.isArray(node) ? node.map(rec) : [];
}

/** One fix record, keyed by the issue it resolves. */
interface FixRecord {
  status: string;
  note: string | null;
  checklistItem: string | null;
}

function fixRecords(bundle: SessionBundle): Map<string, FixRecord> {
  const out = new Map<string, FixRecord>();
  for (const item of list(bundle.fixes?.items)) {
    const issue = str(item.issue);
    const status = str(item.status);
    if (!issue || !status) {
      continue;
    }
    out.set(issue, {
      status,
      note: str(item.note),
      checklistItem: str(item.checklist_item),
    });
  }
  return out;
}

/** A round plus the per-item detail the chain analysis needs. */
interface RoundData {
  round: Round;
  /** Checklist items in order, with their verdicts. */
  items: {
    id: string;
    title: string;
    verdict: string | null;
    issue: string | null;
    /** Why it could not be tested, when the tester recorded one (format 1.9). */
    reason: string | null;
  }[];
  /** Issues filed in this session, in order — the work items when there is no checklist. */
  issues: { id: string; title: string }[];
  fixes: Map<string, FixRecord>;
}

/** "01-save-does-nothing.md" → "save does nothing" — a label, not a parse. */
function issueLabel(file: string | null, id: string): string {
  if (!file) {
    return `issue ${id}`;
  }
  return file
    .replace(/\.md$/, "")
    .replace(/^\d+-/, "")
    .replace(/-/g, " ");
}

function toRound(bundle: SessionBundle): RoundData {
  const checklist = rec(bundle.session.checklist);
  const items = list(checklist.items).map((item) => ({
    id: str(item.id) ?? "",
    title: str(item.title) ?? "",
    verdict: str(item.verdict),
    issue: str(item.issue),
    reason: str(rec(item.evidence).note),
  }));
  const fixes = fixRecords(bundle);
  const counts = {
    pass: items.filter((i) => i.verdict === "pass").length,
    fail: items.filter((i) => i.verdict === "fail").length,
    // `skip` is legacy (pre-1.2) and means "deliberately not checked", which
    // is the same coverage gap as a null verdict — counted together so the
    // total always adds up.
    notTested: items.filter((i) => i.verdict === null || i.verdict === "skip")
      .length,
    total: items.length,
  };
  const issues = list(bundle.session.issues).map((entry) => {
    const id = str(entry.id) ?? "";
    return { id, title: issueLabel(str(entry.file), id) };
  });
  const round: Round = {
    dir: bundle.dir,
    name: basename(bundle.dir),
    createdAt: str(bundle.session.created_at),
    checklistId: str(checklist.id),
    title: str(checklist.title),
    intent: str(checklist.intent),
    retestOf: str(checklist.retest_of),
    counts,
    issues: Array.isArray(bundle.session.issues)
      ? bundle.session.issues.length
      : 0,
    fixes: bundle.fixes
      ? {
          fixed: [...fixes.values()].filter((f) => f.status === "fixed").length,
          wontfix: [...fixes.values()].filter((f) => f.status === "wontfix")
            .length,
          needsInfo: [...fixes.values()].filter(
            (f) => f.status === "needs_info"
          ).length,
        }
      : null,
    done: bundle.files.includes(".done"),
  };
  return { round, items, issues, fixes };
}

/** Read every readable session under `root`, oldest first. */
async function readRounds(root: string): Promise<RoundData[]> {
  let names: string[];
  try {
    names = (await readdir(root, { withFileTypes: true }))
      .filter((e) => e.isDirectory() && e.name.startsWith("session-"))
      .map((e) => e.name);
  } catch {
    return [];
  }
  const rounds: RoundData[] = [];
  for (const name of names) {
    try {
      rounds.push(toRound(await readSession(join(root, name))));
    } catch {
      // Not a session folder, or one being written right now. A status report
      // must never fail because of a folder it does not understand.
    }
  }
  return rounds.sort((a, b) => {
    const at = a.round.createdAt ?? "";
    const bt = b.round.createdAt ?? "";
    return at === bt
      ? a.round.name.localeCompare(b.round.name, "en")
      : at.localeCompare(bt, "en");
  });
}

/* ------------------------------------------------------------------ */
/* Chaining                                                            */
/* ------------------------------------------------------------------ */

/**
 * The checklist id this one re-tests. `retest_of` is authoritative (1.7); for
 * sessions written before it, the generator's `<id>-retest-N` naming is the
 * fallback — the same convention the re-test mode has always produced.
 */
function parent(data: RoundData): string | null {
  if (data.round.retestOf) {
    return data.round.retestOf;
  }
  const id = data.round.checklistId;
  const match = id ? /^(.*)-retest-\d+$/.exec(id) : null;
  return match ? match[1] : null;
}

/**
 * Group rounds into chains. A chain is one fix→re-test cycle: the first run
 * and every re-test that answers it, transitively. Plain feedback sessions (no
 * checklist) are chains of one — the dev loop is a cycle too, just a shorter
 * one.
 */
function chainKey(data: RoundData, byChecklist: Map<string, RoundData>): string {
  const seen = new Set<string>();
  let current = data;
  for (;;) {
    const id = current.round.checklistId;
    if (!id) {
      return current.round.name;
    }
    if (seen.has(id)) {
      // A cycle in the provenance (hand-edited artifacts). Stop here rather
      // than looping forever.
      return id;
    }
    seen.add(id);
    const up = parent(current);
    const next = up ? byChecklist.get(up) : undefined;
    if (!next) {
      // The chain's root: either the first run, or a re-test whose original
      // session is not on disk (then its own id names the chain).
      return up ?? id;
    }
    current = next;
  }
}

/**
 * Put a chain's rounds in the order they actually ran.
 *
 * Not by timestamp: two rounds of one loop can land in the same second, and
 * the session id's suffix is random, so a clock sort is a coin flip. The
 * provenance links are exact — round N+1 names the checklist of round N — so
 * the chain is walked, and anything not linked (a pre-1.7 artifact whose
 * naming did not match) falls in behind by time.
 */
function orderRounds(rounds: RoundData[]): RoundData[] {
  if (rounds.length < 2) {
    return rounds;
  }
  const byChecklist = new Map<string, RoundData>();
  for (const data of rounds) {
    const id = data.round.checklistId;
    if (id && !byChecklist.has(id)) {
      byChecklist.set(id, data);
    }
  }
  const children = new Map<string, RoundData>();
  const roots: RoundData[] = [];
  for (const data of rounds) {
    const up = parent(data);
    if (up && byChecklist.has(up) && byChecklist.get(up) !== data) {
      if (!children.has(up)) {
        children.set(up, data);
      }
    } else {
      roots.push(data);
    }
  }
  const ordered: RoundData[] = [];
  const seen = new Set<RoundData>();
  for (const root of roots) {
    let current: RoundData | undefined = root;
    while (current && !seen.has(current)) {
      seen.add(current);
      ordered.push(current);
      const id: string | null = current.round.checklistId;
      current = id ? children.get(id) : undefined;
    }
  }
  // Anything the walk did not reach (duplicate links, hand-edited artifacts).
  for (const data of rounds) {
    if (!seen.has(data)) {
      ordered.push(data);
    }
  }
  return ordered;
}

function analyzeChain(input: RoundData[]): Chain {
  const rounds = orderRounds(input);
  const latest = rounds[rounds.length - 1];
  const first = rounds[0];

  // How many rounds each item failed in — the signal that a fix pass ran and
  // the item came back anyway.
  const failedRounds = new Map<string, number>();
  // The last word on each item, across the whole chain rather than the last
  // round alone. A re-test round only re-lists the items that were fixed, so
  // reading the latest round on its own would quietly lose both the coverage
  // gaps of round 1 and any failure the fix pass declined to take.
  const latestByItem = new Map<
    string,
    {
      item: RoundData["items"][number];
      round: RoundData;
    }
  >();
  for (const data of rounds) {
    for (const item of data.items) {
      if (item.verdict === "fail") {
        failedRounds.set(item.id, (failedRounds.get(item.id) ?? 0) + 1);
      }
      latestByItem.set(item.id, { item, round: data });
    }
  }

  const open: OpenItem[] = [];
  for (const { item, round } of latestByItem.values()) {
    if (item.verdict !== "fail") {
      continue;
    }
    const fix = item.issue ? round.fixes.get(item.issue) : undefined;
    const state: OpenState =
      fix === undefined
        ? "actionable"
        : fix.status === "fixed"
          ? "awaiting-retest"
          : "blocked";
    open.push({
      id: item.id,
      title: item.title,
      failedRounds: failedRounds.get(item.id) ?? 1,
      issue: item.issue,
      state,
      fixStatus: fix?.status ?? null,
      note: fix?.note ?? null,
    });
  }

  // A plain feedback session has no checklist: the issues themselves are the
  // work items. One filed by a human in the dev loop is open until a fix pass
  // records it — the same question, one artifact earlier.
  if (latest.items.length === 0) {
    for (const issue of latest.issues) {
      const fix = latest.fixes.get(issue.id);
      if (fix?.status === "fixed") {
        continue;
      }
      open.push({
        id: `issue ${issue.id}`,
        title: issue.title,
        failedRounds: 1,
        issue: issue.id,
        state: fix === undefined ? "actionable" : "blocked",
        fixStatus: fix?.status ?? null,
        note: fix?.note ?? null,
      });
    }
  }

  const pending = open.filter((o) => o.state !== "blocked");
  let verdict: LoopVerdict;
  let reason: string;
  if (open.length === 0) {
    verdict = "green";
    reason =
      rounds.length > 1
        ? `no failing items after round ${rounds.length}`
        : "no failing items";
  } else if (pending.length === 0) {
    verdict = "blocked";
    reason = `every remaining failure is wontfix or needs_info (${open.length})`;
  } else if (pending.every((o) => o.failedRounds >= 2)) {
    verdict = "stalled";
    reason = `${pending.length} item${pending.length === 1 ? "" : "s"} failed in 2 or more rounds — a fix pass has already been tried`;
  } else {
    verdict = "continue";
    const retest = pending.filter((o) => o.state === "awaiting-retest").length;
    reason = retest
      ? `${retest} fixed item${retest === 1 ? "" : "s"} still to re-test`
      : `${pending.length} failing item${pending.length === 1 ? "" : "s"} for the next fix pass`;
  }

  return {
    key: first.round.checklistId ?? first.round.name,
    title: first.round.title,
    intent: first.round.intent,
    rounds: rounds.map((r) => r.round),
    open,
    notTested: [...latestByItem.values()]
      .filter(({ item }) => item.verdict === null || item.verdict === "skip")
      .map(({ item }) => ({
        id: item.id,
        title: item.title,
        reason: item.reason,
      })),
    verdict,
    reason,
  };
}

/** Read the artifact folder and work out where the loop stands. */
export async function readStatus(
  options: StatusOptions = {}
): Promise<StatusResult> {
  const dir = options.dir ?? ".sluglist";
  const rounds = await readRounds(dir);

  const byChecklist = new Map<string, RoundData>();
  for (const data of rounds) {
    const id = data.round.checklistId;
    // First writer wins: two sessions run against the same checklist file are
    // separate rounds, and the earlier one is the chain's anchor.
    if (id && !byChecklist.has(id)) {
      byChecklist.set(id, data);
    }
  }

  const grouped = new Map<string, RoundData[]>();
  for (const data of rounds) {
    const key = chainKey(data, byChecklist);
    const bucket = grouped.get(key);
    if (bucket) {
      bucket.push(data);
    } else {
      grouped.set(key, [data]);
    }
  }

  let chains = [...grouped.values()].map(analyzeChain).sort((a, b) => {
    const last = (c: Chain) => c.rounds[c.rounds.length - 1];
    const at = last(a).createdAt ?? "";
    const bt = last(b).createdAt ?? "";
    return at === bt ? last(a).name.localeCompare(last(b).name, "en") : at.localeCompare(bt, "en");
  });
  if (options.target) {
    const name = basename(options.target);
    const found = chains.find((c) => c.rounds.some((r) => r.name === name));
    chains = found ? [found] : [];
  }

  let older = 0;
  if (!options.all && chains.length > 1) {
    older = chains.length - 1;
    chains = chains.slice(-1);
  }

  const newest = chains[chains.length - 1];
  return {
    dir,
    chains,
    older,
    verdict: newest?.verdict ?? "empty",
    reason: newest?.reason ?? `no sessions in ${dir}`,
  };
}

/* ------------------------------------------------------------------ */
/* Output                                                              */
/* ------------------------------------------------------------------ */

function roundLine(round: Round, index: number): string {
  const counts =
    round.counts.total > 0
      ? `${round.counts.pass} pass · ${round.counts.fail} fail · ${round.counts.notTested} not tested`
      : `${round.issues} issue${round.issues === 1 ? "" : "s"}`;
  const fixes = round.fixes
    ? [
        round.fixes.fixed ? `${round.fixes.fixed} fixed` : "",
        round.fixes.wontfix ? `${round.fixes.wontfix} wontfix` : "",
        round.fixes.needsInfo ? `${round.fixes.needsInfo} needs_info` : "",
      ]
        .filter(Boolean)
        .join(", ") || "no records"
    : "no fix pass yet";
  return `  ${index + 1}  ${round.name}  ${counts}  ·  ${fixes}`;
}

const STATE_LABEL: Record<OpenState, string> = {
  actionable: "for the next fix pass",
  "awaiting-retest": "fixed, not re-tested yet",
  blocked: "blocked",
};

/** Human-readable status report. */
export function formatStatus(result: StatusResult): string[] {
  if (result.chains.length === 0) {
    return [`${result.dir} — no sessions yet`, "", "verdict: empty"];
  }

  const sessions = result.chains.reduce((n, c) => n + c.rounds.length, 0);
  const lines = [
    `${result.dir} — ${result.chains.length} chain${result.chains.length === 1 ? "" : "s"}, ${sessions} session${sessions === 1 ? "" : "s"}`,
  ];

  for (const chain of result.chains) {
    const head = [
      chain.key,
      chain.intent ?? (chain.title ? "checklist" : "feedback"),
      chain.rounds[0].counts.total
        ? `${chain.rounds[0].counts.total} items`
        : null,
    ]
      .filter(Boolean)
      .join(" · ");
    lines.push("", head);
    chain.rounds.forEach((round, i) => lines.push(roundLine(round, i)));

    const blocked = chain.open.filter((o) => o.state === "blocked");
    const pending = chain.open.filter((o) => o.state !== "blocked");
    if (pending.length > 0) {
      lines.push("", `  still failing (${pending.length})`);
      for (const item of pending) {
        const rounds =
          item.failedRounds > 1 ? ` · failed in ${item.failedRounds} rounds` : "";
        const issue = item.issue ? ` · issue ${item.issue}` : "";
        lines.push(`    ${item.id} — ${STATE_LABEL[item.state]}${rounds}${issue}`);
        if (item.title) {
          lines.push(`      "${item.title}"`);
        }
      }
    }
    if (blocked.length > 0) {
      lines.push("", `  blocked (${blocked.length})`);
      for (const item of blocked) {
        const note = item.note ? `: ${item.note}` : "";
        lines.push(`    ${item.id} — ${item.fixStatus}${note}`);
      }
    }
    if (chain.notTested.length > 0) {
      lines.push("", `  not tested (${chain.notTested.length})`);
      for (const item of chain.notTested) {
        lines.push(`    ${item.id}${item.reason ? ` — ${item.reason}` : ""}`);
      }
    }
  }

  if (result.older > 0) {
    lines.push(
      "",
      `${result.older} older chain${result.older === 1 ? "" : "s"} not shown — pass --all`
    );
  }
  lines.push("", `verdict: ${result.verdict} — ${result.reason}`);
  return lines;
}

/**
 * The same result as JSON, for an agent driving the loop. Snake_case, and a
 * shape that only ever grows — the same promise the artifact format makes.
 */
export function statusJson(result: StatusResult): unknown {
  return {
    dir: result.dir,
    verdict: result.verdict,
    reason: result.reason,
    older_chains: result.older,
    chains: result.chains.map((chain) => ({
      key: chain.key,
      title: chain.title,
      intent: chain.intent,
      verdict: chain.verdict,
      reason: chain.reason,
      rounds: chain.rounds.map((round, i) => ({
        round: i + 1,
        session: round.name,
        created_at: round.createdAt,
        checklist: round.checklistId,
        retest_of: round.retestOf,
        pass: round.counts.pass,
        fail: round.counts.fail,
        not_tested: round.counts.notTested,
        items: round.counts.total,
        issues: round.issues,
        fixes: round.fixes
          ? {
              fixed: round.fixes.fixed,
              wontfix: round.fixes.wontfix,
              needs_info: round.fixes.needsInfo,
            }
          : null,
        done: round.done,
      })),
      open: chain.open.map((item) => ({
        id: item.id,
        title: item.title,
        state: item.state,
        failed_rounds: item.failedRounds,
        issue: item.issue,
        fix_status: item.fixStatus,
        note: item.note,
      })),
      not_tested: chain.notTested.map((i) => ({
        id: i.id,
        title: i.title,
        reason: i.reason,
      })),
    })),
  };
}
