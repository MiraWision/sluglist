The bundled skills ship with sensible defaults — base branch `main`, ask before running the app,
evidence only on failures. Every real project disagrees with some of them, and the obvious move is to
edit the skill. Don't: `npx sluglist init` **never overwrites a skill you have edited**, so an edited
skill stops receiving upstream improvements. That is the right safety rule and the wrong place to put
project knowledge.

So project specifics go in one committed file that every skill reads first:

```
.sluglist/PROJECT.md
```

`npx sluglist init` writes the template; you fill it in and commit it. It is **never overwritten** —
not on re-runs, not with `--force` — because it holds your answers, not ours.

## What goes in it

| Section | Answers | Skill default if you leave it |
|---|---|---|
| **Base branch** | the branch a `branch`-intent checklist diffs against | `main`, then `master` |
| **Running the app for QA** | the command, the URL, warm-up quirks | ask the user; never test a build it didn't start |
| **Signing in** | where the test account comes from | ask the user |
| **Hard limits** | actions QA must never complete | none — but see below |
| **Evidence-mode defaults** | `all` or `fails`, per intent | acceptance → `all`, long sweeps → `fails` |
| **Loop limits** | how far the until-green loop may go on its own | 3 QA rounds, asks before the first fix pass, leaves changes uncommitted |
| **Environment quirks** | free text: the slow first paint, the flaky embed, the flagged feature | none |

## Credentials are referenced, never stored

> [!CAUTION]
> `PROJECT.md` is committed. Never write a password, token or API key into it.

The file is committed, so it names **where** the credentials live — an env var, a seed script, a
password-manager entry — and never the values:

```
Env vars: QA_TEST_EMAIL / QA_TEST_PASSWORD (see .env.example)
Sign-in page: /login
```

## Hard limits are enforced, not advisory

The limits section is the one that changes agent behaviour most sharply. Listed actions are never
completed, whatever a checklist item appears to ask for — the agent goes to the last safe step,
records the item as **not tested** with the reason, and moves on:

```
- Never complete a live payment. Fill the card form, stop before Pay.
- Never send email to a real address. Use the catch-all inbox only.
- Never submit to an external/partner API from QA (orders, filings, webhooks).
```

A "not tested — stopped before Pay per PROJECT.md hard limits" is a correct outcome. A pass on a live
charge is not.

## Loop limits bound the autonomous run

When the loop is asked to fix and re-test until green, this section is what says how far it may go
without checking back:

```
max rounds: 3
fix without asking: no
commits: leave the changes uncommitted, one summary at the end
```

`npx sluglist status` still decides *between* rounds — the loop stops on `stalled` or `blocked`
whatever the ceiling says, because an item that has already survived a fix pass belongs to a human.
See [Agents & CLI](/docs/agents/).

## When it is missing

The skills fall back to their own defaults and say so once, then carry on — a missing file never
blocks a run. Ask for `npx sluglist init` and the answers move into the repo, where the next person
(or the next agent) inherits them.

See also: [Agents & CLI](/docs/agents/) for the loop the skills run, and
[Checklist mode](/docs/checklist/) for what the base branch feeds.
