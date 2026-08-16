# sluglist — project conventions

Answers the sluglist skills read before they do anything. Written once per project, committed, and
edited by hand as the project changes.

**Why this file exists:** the bundled skills (`sluglist-checklist`, `sluglist-qa`, `sluglist-fix`,
`sluglist-loop`) ship with sensible defaults, and it is tempting to edit them to fit your project.
Don't — an edited skill is never overwritten by `npx sluglist init`, so it stops receiving upstream
improvements. Put project specifics **here** instead and the skills stay upgradeable.

Every heading below is optional. A section you leave as-is (or delete) means "use the skill's
default". Keep it short — this is read by an agent at the start of every run.

---

## Base branch

The branch a `branch`-intent checklist diffs against (`git diff <base>...HEAD`).

*Skill default:* `main`, then `master` if `main` is absent.

```
main
```

<!-- Example: a repo that merges into a long-lived staging branch
preview
-->

## Running the app for QA

How the QA agent gets a build in front of itself. Give the command, the URL it comes up on, and
anything about warm-up (a first compile that takes 40s, a seed step, a worker that must be up too).

*Skill default:* ask the user; never silently test a build it did not start.

```
npm run dev
http://localhost:3000
```

<!-- Example
pnpm dev          # Next.js, first page compile takes ~30s — wait for "Ready" before the first check
http://localhost:3000
Requires a local database: `make db-up` once per machine.
-->

## Signing in

Where the test account comes from. **Reference credentials, never write them here** — this file is
committed. Name the env vars, the seed script, or the password manager entry that holds them.

*Skill default:* ask the user.

```
Env vars: QA_TEST_EMAIL / QA_TEST_PASSWORD (see .env.example)
Sign-in page: /login
```

<!-- Never:
email: qa@example.com
password: hunter2
-->

## Hard limits — never complete these

Actions QA must not carry through, even when a checklist item seems to ask for it. The agent stops
at the last safe step, records **not tested** with the reason, and moves on.

Uncomment what applies and add your own:

<!--
- Never complete a live payment. Fill the card form, stop before Pay.
- Never send email to a real address. Use the catch-all inbox only.
- Never submit to an external/partner API from QA (orders, filings, webhooks).
- Never delete production or shared-staging data.
- Never accept terms or grant OAuth consent on behalf of the account owner.
-->

## Evidence-mode defaults

Whether a `pass` carries a screenshot + observed-fact note (`all`) or only fails carry evidence
(`fails`). Per checklist intent; an explicit request from the user always wins.

*Defaults:* the `sluglist-loop` heuristic — acceptance and hand-off runs (`branch`, `scenario`,
`re-test`) → `all`; long sweeps (`smoke`, `regression`) → `fails`. `sluglist-qa` invoked on its own
defaults to `fails`.

```
branch: all
re-test: all
scenario: all
smoke: fails
regression: fails
```

## Loop limits

How far `sluglist-loop` may go on its own when it is asked to fix and re-test until green.

*Skill defaults:* at most **3 QA rounds** (the first pass plus two fix→re-test rounds); the loop
**asks** before its first fix pass; fixes are left uncommitted. `sluglist status` decides between
rounds — the loop stops early on `stalled` or `blocked` whatever this section says.

```
max rounds: 3
fix without asking: no
commits: leave the changes uncommitted, one summary at the end
```

<!-- Example: a repo where the QA loop runs unattended on a feature branch
max rounds: 4
fix without asking: yes, on a branch that is not `main`
commits: one commit per fixed issue, message "fix(qa): <item id> — <what changed>"
-->

## Environment quirks

Free text. Anything that makes a run look broken when it is not: a slow first paint, a flaky
third-party embed, a feature behind a flag, a route that 404s until a seed runs, a locale that
changes the copy the checklist quotes.

```
(none yet)
```
