/**
 * The two pictures the product needs: what the contract is, and what the loop
 * does with it.
 *
 * Both are HTML and CSS rather than a drawn SVG — the labels wrap, the type
 * scales with the reader's settings, the colours come from the same tokens as
 * the rest of the site, and a phone gets a stacked layout instead of a shrunk
 * one. The only SVG is the arrow glyph, which is a shape and nothing else.
 */

function Arrow({ label }: { label: string }) {
  return (
    <div
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center gap-1.5 py-2 md:flex-col md:py-0"
    >
      <svg
        className="rotate-90 text-[var(--color-brand)] md:rotate-0"
        fill="none"
        height="14"
        viewBox="0 0 24 14"
        width="24"
      >
        <path
          d="M1 7h20m0 0-5.5-5.5M21 7l-5.5 5.5"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.6"
        />
      </svg>
      <span className="font-mono text-[10px] text-[var(--color-muted)] uppercase tracking-wider">
        {label}
      </span>
    </div>
  );
}

function Role({
  kind,
  people,
}: {
  kind: "Human" | "Agent";
  people: string[];
}) {
  return (
    <div>
      <span
        className={`inline-block rounded-full border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider ${
          kind === "Agent" ? "tint-brand" : "tint-gap"
        }`}
      >
        {kind}
      </span>
      <ul className="mt-2 space-y-1 text-[13.5px] text-[var(--color-ink-2)] leading-relaxed">
        {people.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </div>
  );
}

function Side({
  title,
  verb,
  roles,
}: {
  title: string;
  verb: string;
  roles: { kind: "Human" | "Agent"; people: string[] }[];
}) {
  return (
    <div className="flex-1 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
      <p className="font-semibold text-[15px]">{title}</p>
      <p className="mt-0.5 mb-4 text-[13px] text-[var(--color-muted)]">{verb}</p>
      <div className="space-y-4">
        {roles.map((r) => (
          <Role key={r.kind} kind={r.kind} people={r.people} />
        ))}
      </div>
    </div>
  );
}

const VERDICTS: { label: string; className: string }[] = [
  { label: "pass", className: "tint-pass" },
  { label: "fail", className: "tint-fail" },
  { label: "not tested", className: "tint-gap" },
];

/**
 * One contract, four roles. The point of the picture: whether each side is a
 * person or an agent changes nothing about the files in the middle.
 */
export function ContractDiagram() {
  return (
    <figure className="m-0">
      <div className="flex flex-col md:flex-row md:items-stretch md:gap-2">
        <Side
          roles={[
            {
              kind: "Human",
              people: [
                "A client signing off a release",
                "A PM or tester walking a checklist",
                "A customer hitting a bug in production",
                "You, on your own laptop",
              ],
            },
            {
              kind: "Agent",
              people: ["A QA agent driving a real browser"],
            },
          ]}
          title="Whoever finds it"
          verb="reports"
        />

        <Arrow label="writes" />

        <div className="flex-1 rounded-xl border panel-brand p-5">
          <p className="font-semibold text-[15px]">The artifact contract</p>
          <p className="mt-0.5 mb-4 text-[13px] text-[var(--color-muted)]">
            a folder of plain files
          </p>
          <pre className="overflow-x-auto font-mono text-[12px] text-[var(--color-ink-2)] leading-relaxed">
            {`session-2026-08-16-a1b2/
  session.yaml
  01-save-does-nothing.md
  01-save-does-nothing.png
  fixes.yaml`}
          </pre>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {VERDICTS.map((v) => (
              <span
                className={`rounded-full border px-2 py-0.5 font-mono text-[11px] ${v.className}`}
                key={v.label}
              >
                {v.label}
              </span>
            ))}
          </div>
          <p className="mt-3 text-[12.5px] text-[var(--color-muted)] leading-relaxed">
            Versioned, additive-only, documented field by field.
          </p>
        </div>

        <Arrow label="reads" />

        <Side
          roles={[
            {
              kind: "Human",
              people: [
                "A developer opening the report",
                "Anyone the single-file HTML gets forwarded to",
              ],
            },
            {
              kind: "Agent",
              people: [
                "A fix agent that localizes and patches",
                "Any script that can read files",
              ],
            },
          ]}
          title="Whoever fixes it"
          verb="resolves"
        />
      </div>

      <figcaption className="mt-3 text-center text-[13px] text-[var(--color-muted)] leading-relaxed">
        Both ends can be a person or an agent, in any combination — the files in
        the middle do not change. That is the whole standard:{" "}
        <span className="text-[var(--color-ink-2)]">
          the report is the interface
        </span>
        , not a dashboard, an inbox or an API.
      </figcaption>
    </figure>
  );
}

interface Step {
  n: string;
  title: string;
  body: string;
  /** Rendered under the step as a mono line — the artifact it produces. */
  out?: string;
  branches?: { label: string; className: string; then: string }[];
}

const LOOP_STEPS: Step[] = [
  {
    n: "1",
    title: "Checklist",
    body: "A branch diff, your routes, or a written brief becomes a list of client-voice checks.",
    out: ".sluglist/checklists/release-2026-08.json",
  },
  {
    n: "2",
    title: "QA run",
    body: "Each item is walked in a real browser. No fail without a screenshot, no pass without performing the check, honest “not tested” instead of a guess.",
    out: "session.yaml · NN-issue.md · NN-issue.png",
  },
  {
    n: "3",
    title: "Report",
    body: "One self-contained HTML file: verdicts, the fact observed behind each one, every screenshot inlined.",
    out: "report.html",
  },
  {
    n: "4",
    title: "Status",
    body: "The decision point, read from the artifacts rather than from an agent’s memory of what it just did.",
    out: "npx sluglist status --json",
    branches: [
      { label: "green", className: "tint-pass", then: "done — hand over the report" },
      { label: "stalled / blocked", className: "tint-gap", then: "stop — a human takes it" },
      { label: "continue", className: "tint-fail", then: "another round ↓" },
    ],
  },
  {
    n: "5",
    title: "Fix",
    body: "The failing issues are localized and patched, each one recorded as fixed, wontfix or needs_info.",
    out: "fixes.yaml",
  },
  {
    n: "6",
    title: "Re-test",
    body: "A checklist of only the fixed items, ids preserved, provenance back to the round it answers — then back to step 2.",
    out: "checklist.retest.json  →  round 2",
  },
];

/** The cycle, including the part that decides whether to go round again. */
export function LoopDiagram() {
  return (
    <figure className="m-0">
      <ol className="m-0 list-none space-y-2 p-0">
        {LOOP_STEPS.map((step) => (
          <li
            className="relative rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4 pl-14"
            key={step.n}
          >
            <span
              className={`absolute top-4 left-4 inline-flex h-7 w-7 items-center justify-center rounded-full font-mono text-[13px] ${
                step.branches
                  ? "bg-[var(--color-brand)] text-[var(--color-brand-ink)]"
                  : "bg-[var(--color-accent)] text-[var(--color-canvas)]"
              }`}
            >
              {step.n}
            </span>
            <p className="font-semibold text-[15px]">{step.title}</p>
            <p className="mt-1 text-[14px] text-[var(--color-ink-2)] leading-relaxed">
              {step.body}
            </p>
            {step.out ? (
              <p className="mt-2 overflow-x-auto font-mono text-[12px] text-[var(--color-muted)]">
                {step.out}
              </p>
            ) : null}
            {step.branches ? (
              <ul className="mt-3 space-y-1.5">
                {step.branches.map((b) => (
                  <li className="flex flex-wrap items-center gap-2" key={b.label}>
                    <span
                      className={`rounded-full border px-2 py-0.5 font-mono text-[11px] ${b.className}`}
                    >
                      {b.label}
                    </span>
                    <span className="text-[13px] text-[var(--color-ink-2)]">
                      {b.then}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>
      <figcaption className="mt-3 text-[13px] text-[var(--color-muted)] leading-relaxed">
        Steps 4 → 6 repeat until the status verdict says otherwise. The ceiling
        is three QA rounds by default, and the loop may never make a run green
        by editing a check or writing it off — green is a fact about the app.
      </figcaption>
    </figure>
  );
}

interface CycleStep {
  label: string;
  note: string;
}

/** Four steps and a decision — the shortest honest telling of the cycle. */
const CYCLE: CycleStep[] = [
  { label: "Build", note: "your change" },
  { label: "Checklist", note: "what done means" },
  { label: "Test", note: "in a real browser" },
  { label: "Feedback", note: "verdicts + evidence" },
];

function Chevron({ tone = "line" }: { tone?: "line" | "pass" }) {
  return (
    <svg
      aria-hidden="true"
      className={
        tone === "pass"
          ? "shrink-0 text-[var(--color-pass)]"
          : "shrink-0 text-[var(--color-muted)]"
      }
      fill="none"
      height="12"
      viewBox="0 0 18 12"
      width="18"
    >
      <path
        d="M1 6h14m0 0-4-4m4 4-4 4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function Node({
  label,
  note,
  variant,
}: {
  label: string;
  note?: string;
  variant: "step" | "decision" | "done";
}) {
  const skin =
    variant === "decision"
      ? "tint-brand"
      : variant === "done"
        ? "tint-pass"
        : "border-[var(--color-line)] bg-[var(--color-surface)]";
  return (
    <div className={`rounded-lg border px-3 py-2 text-center ${skin}`}>
      <p
        className={`font-semibold text-[13px] leading-tight ${
          variant === "step" ? "text-[var(--color-ink)]" : ""
        }`}
      >
        {label}
      </p>
      {note ? (
        <p className="mt-0.5 text-[11px] text-[var(--color-muted)] leading-tight">
          {note}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The cycle as a strip: forward along the top, a dashed return underneath, and
 * one straight exit.
 *
 * Deliberately not a ring — a ring reads as "spins forever" and hides the fact
 * that the loop ends. And deliberately not five colours: the steps are neutral,
 * so the only coloured things are the two outcomes (amber going back, green
 * going out), which is what a reader needs to spot in one glance. The same
 * pass/fail palette as every verdict elsewhere on the site.
 */
export function CycleStrip() {
  return (
    <figure className="m-0">
      {/* Wide: one row. The return is absolutely positioned inside the cyclic
          part only, so its two ends land under the first and last node of the
          cycle rather than under the exit. */}
      <div className="hidden items-start justify-center gap-2 lg:flex">
        <div className="relative flex items-center gap-2 pb-9">
          {CYCLE.map((step, i) => (
            <div className="flex items-center gap-2" key={step.label}>
              {i > 0 ? <Chevron /> : null}
              <Node label={step.label} note={step.note} variant="step" />
            </div>
          ))}
          <Chevron />
          <Node
            label="sluglist status"
            note="another round?"
            variant="decision"
          />

          {/* Down from the decision, back to Build — dashed, so it reads as
              "again" rather than as a second forward edge. */}
          <div className="cycle-return" />
          <span className="cycle-return-label">still failing</span>
        </div>
        <div className="flex items-center gap-2">
          <Chevron tone="pass" />
          <Node label="Resolved" note="report handed over" variant="done" />
        </div>
      </div>

      {/* Narrow: the same six nodes, wrapped, with the return stated in words —
          an absolutely-positioned bracket cannot survive a wrap. */}
      <div className="lg:hidden">
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-2">
          {CYCLE.map((step, i) => (
            <div className="flex items-center gap-2" key={step.label}>
              {i > 0 ? <Chevron /> : null}
              <Node label={step.label} variant="step" />
            </div>
          ))}
          <Chevron />
          <Node label="status" variant="decision" />
          <Chevron tone="pass" />
          <Node label="Resolved" variant="done" />
        </div>
        <p className="mt-3 text-center text-[12px] text-[var(--color-gap)]">
          ↺ still failing → back to Build
        </p>
      </div>
    </figure>
  );
}
