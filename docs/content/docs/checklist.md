Feedback normally fills a session **from the bottom** — the client freely creates issues. A
**checklist** fills it **from the top**: the developer pre-seeds a list of "what shipped and what
to verify", and the client walks it with one natural motion — **click a row to check it off; click
the slug button on a row to flag a problem** (that opens the normal issue flow, linked back to the
item).

The panel is an accordion of sections that self-navigates: finish a section and it collapses,
opening the next one. A summary line (`5 of 12 checked · 2 issues · 7 left`) replaces a bare
counter, and the circle's badge counts what's left, turning to ✓ when everything is checked. The
result is a **coverage map** in `session.yaml`: what's confirmed, what was flagged (with links to
the issues), and what was never checked.

It's entirely opt-in: a second circle appears above the feedback button **only** when a checklist
is configured. Without one, the widget looks and works exactly as before.

```ts
const widget = createFeedbackWidget({
  project: "acme",
  connectors: [/* ... */],
  checklist: {
    id: "export-release-2026-07",
    title: "Export + notifications release",
    description: "Walk each item and check it off. Flag anything that looks wrong.",
    sections: [
      {
        title: "Export",
        items: [
          { id: "export-button", title: "On Reports, the Export button downloads a CSV", url: "/reports" },
          { id: "csv-columns", title: "The CSV has all the expected columns", hint: "Open it in a spreadsheet" },
          // Dynamic route: no fabricated id — a human hint + a wildcard match.
          { id: "assessment-header", title: "Opening any assessment shows the new header",
            hint: "Open the dashboard and pick any assessment", url: "/dashboard", url_match: "/assessments/*" },
        ],
      },
      { title: "Notifications", items: [{ id: "email-sent", title: "An email arrives after an export" }] },
    ],
  },
});
```

## Smart links

`url` must be a **static** route — it renders as an "Open ↗" chip that navigates there. For a
**dynamic** route (an id/uuid in the path) don't guess an id: give a human `hint` and a wildcard
`url_match` (`"/assessments/*"`). It never navigates — it just lights the item up with a "You're
here" tag when the tester is on a matching page. The two can coexist (a list `url` + a detail
`url_match`).

Pass a **URL string** instead of an object to fetch the checklist at init (`GET` → JSON of the same
shape) — handy when a skill generates it: `checklist: "/checklist.json"`. An unreachable or invalid
checklist warns and is skipped; capture still works.

## Verdicts: the coverage map

Verdicts land in `session.yaml` (put-per-verdict, upserted on every click):

```yaml
checklist:
  id: export-release-2026-07
  title: "Export + notifications release"
  items:
    - id: export-button
      section: "Export"
      title: "On Reports, the Export button downloads a CSV"
      verdict: pass
      issue: null
      ts: 2026-07-24T14:05:10Z
    - id: csv-columns
      section: "Export"
      title: "The CSV has all the expected columns"
      verdict: fail
      issue: "03"          # the issue that documents the failure
      ts: 2026-07-24T14:06:00Z
    - id: email-sent
      section: "Notifications"
      title: "An email arrives after an export"
      verdict: null        # not checked
      issue: null
      ts: null
```

## Generate a checklist from a branch

The package ships a `sluglist-checklist` skill: point Claude Code at a branch and it builds a
client-facing checklist from the diff (user-visible pages/components/text only — refactors, tests
and config are excluded), grouped by feature and phrased for a non-developer, written to
`public/checklist.json`. Ask it to *"generate a checklist from this branch"*.

## Scope — the checklist is a session input, verdicts are its output

The checklist enters a session and the verdicts leave with it. There is **no lifecycle beyond the
session**: items are never reopened, verdicts never sync between sessions, nothing is stored as a
"done on the server", and issues are never blocked on completing the checklist. Every session runs
the checklist from scratch. This is deliberate — it keeps sluglist a capture tool, not a workflow
tracker.

See also: [the client-acceptance workflow](/for/client-acceptance/) end to end.
