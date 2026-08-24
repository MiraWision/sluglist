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

/**
 * The cycle as a block diagram: boxes are what happens, **edges are what gets
 * handed over**. That split is the point — a checklist is not a step, it is the
 * thing Build gives Test; feedback is not a step, it is what Test gives back.
 *
 * Deliberately not a ring: a circle reads as "spins forever" and hides the exit,
 * while a chain with a return edge shows the repetition *and* the way out. And
 * deliberately not one colour per box — colour codes state here, so the only
 * tinted things are the two outcomes (amber going back, green going out), the
 * same palette every verdict uses elsewhere on the site.
 */

function Box({
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
        className={`whitespace-nowrap font-semibold text-[13px] leading-tight ${
          variant === "step" ? "text-[var(--color-ink)]" : ""
        }`}
      >
        {label}
      </p>
      {note ? (
        <p className="whitespace-nowrap text-[11px] text-[var(--color-muted)] leading-tight">
          {note}
        </p>
      ) : null}
    </div>
  );
}

/** A labelled edge: what travels between two boxes. */
function Edge({
  label,
  tone = "line",
  vertical = false,
}: {
  label: string;
  tone?: "line" | "pass";
  vertical?: boolean;
}) {
  const colour =
    tone === "pass" ? "text-[var(--color-pass)]" : "text-[var(--color-brand)]";
  return (
    <div
      className={
        vertical
          ? "flex items-center gap-2 py-1 pl-4"
          : "flex flex-col items-center gap-0.5 px-1"
      }
    >
      {vertical ? null : (
        <span
          className={`font-mono text-[10.5px] tracking-wide ${
            tone === "pass" ? colour : "text-[var(--color-ink-2)]"
          }`}
        >
          {label}
        </span>
      )}
      <svg
        aria-hidden="true"
        className={colour}
        fill="none"
        height={vertical ? 26 : 10}
        viewBox={vertical ? "0 0 10 26" : "0 0 84 10"}
        width={vertical ? 10 : 84}
      >
        <path
          d={vertical ? "M5 1v24m0 0-3.5-3.5M5 25l3.5-3.5" : "M0 5h82m0 0-4-4m4 4-4 4"}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.4"
        />
      </svg>
      {vertical ? (
        <span
          className={`font-mono text-[11px] tracking-wide ${
            tone === "pass" ? colour : "text-[var(--color-ink-2)]"
          }`}
        >
          {label}
        </span>
      ) : null}
    </div>
  );
}

/**
 * `wide` is the horizontal row and `narrow` the vertical chain. They are picked
 * by the caller rather than by a media query inside, because the two shapes want
 * different homes on the page: the row is short enough to sit above the
 * headline, the column is not.
 */
export function CycleStrip({ layout }: { layout: "wide" | "narrow" }) {
  if (layout === "narrow") {
    return (
      <figure className="m-0 flex flex-col items-start">
        <Box label="Build" note="your change" variant="step" />
        <Edge label="checklist" vertical />
        <Box label="Test" note="in a real browser" variant="step" />
        <Edge label="feedback" vertical />
        <Box label="sluglist status" note="another round?" variant="decision" />
        <Edge label="green" tone="pass" vertical />
        <Box label="Resolved" note="report handed over" variant="done" />
        <p className="mt-3 font-mono text-[11px] text-[var(--color-gap)]">
          ↺ still failing → back to Build
        </p>
      </figure>
    );
  }
  return (
    <figure className="m-0">
      <div className="flex items-start justify-center">
        <div className="relative flex items-center pb-8">
          <Box label="Build" note="your change" variant="step" />
          <Edge label="checklist" />
          <Box label="Test" note="in a real browser" variant="step" />
          <Edge label="feedback" />
          <Box
            label="sluglist status"
            note="another round?"
            variant="decision"
          />

          {/* Down from the decision, back to Build — dashed, so it reads as
              "again" rather than as a second forward edge. */}
          <div className="cycle-return" />
          <span className="cycle-return-label">still failing</span>
        </div>
        <div className="flex items-center pt-1">
          <Edge label="green" tone="pass" />
          <Box label="Resolved" note="report handed over" variant="done" />
        </div>
      </div>

    </figure>
  );
}
