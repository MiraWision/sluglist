# RUN_EVIDENCE — site polish (og tags, snippets, terminology, init-skills)

Date: 2026-08-11. Five small findings closed in one pass. **No library code and no artifact-format
change** — the widget, the headless writer and format 1.6 are untouched; the only runtime addition is
a new CLI command. **504 tests pass** (was 493 — 11 added), type-check clean, package build clean,
site build clean.

Version **1.14.0** (minor: one new command). Note: 1.13.0 turned out to be **already published** to
npm without `init-skills`, so this is a new version rather than an amendment to it.

| What | Where |
|---|---|
| Footnote under the artifact example | [`evidence/site-polish/footnote.jpg`](evidence/site-polish/footnote.jpg) |
| `init-skills` implementation | [`src/cli/init-skills.ts`](src/cli/init-skills.ts) |
| `init-skills` tests (11) | [`test/init-skills.test.ts`](test/init-skills.test.ts) |

---

## Phase 0 — Pre-flight audit

| Surface | Verdict | Detail |
|---|---|---|
| Head-tag generation | **REAL, per-page capable** | Next.js Metadata API: root `app/layout.tsx` holds defaults, each page exports `metadata` or `generateMetadata`. Per-page og values are an additive field per page — no generator rework. **No STOP.** |
| `strings` vs `labels` | **NOT A CONFLICT — see below** | They are two different things, both used correctly everywhere. Phase 3 turned out to be a no-op. |
| Dev-loop snippets | **INCONSISTENT (5 places)** | 3 bare, 2 gated. One more (`docs/lib/use-cases.ts`) was outside the paths the task listed and was found by a second sweep. |
| CLI structure | **REAL** | `src/cli/index.ts`, hand-rolled arg parser, commands `dev` and `report`. `init-skills` slots in as a third. |
| Bundled skills path | `<pkg>/skills/<name>/SKILL.md` | Confirmed by unpacking the published tarball: `package/skills/sluglist-{qa,fix,checklist}/SKILL.md`. `files` in package.json already ships `skills`. |

### Pages on the site

`/`, `/docs/`, `/docs/{quick-start,capture,connectors,checklist,production,agents,artifacts}/`,
`/for/{claude-code,client-acceptance,beta-feedback}/`,
`/compare/{marker-io,usersnap,bugherd}/`, `/changelog/` — 19 prerendered routes.

---

## Phase 1 — Per-page og tags

Added `pageMetadata()` in [`docs/lib/site.ts`](docs/lib/site.ts) and applied it to all five page
modules (docs index, docs/[slug], for/[slug], compare/[slug], changelog). The landing keeps its own
`metadata` untouched.

One detail worth recording: Next applies `title.template` (`"%s — sluglist"`) to `<title>` **only**,
not to `og:title`. Setting `og:title` to the raw page title would have made the shared card differ
from the browser tab, so the helper appends the suffix itself.

Built output (`out/**/index.html`):

| Page | `<title>` | `og:title` | `og:url` = canonical | `og:type` |
|---|---|---|---|---|
| `/` | sluglist — visual feedback that your agent fixes | *same* | `https://sluglist.dev/` | website |
| `/docs/quick-start/` | Quick start — sluglist | *same* | `https://sluglist.dev/docs/quick-start/` | article |
| `/for/claude-code/` | Visual feedback for Claude Code & coding agents — sluglist | *same* | `https://sluglist.dev/for/claude-code/` | article |
| `/compare/marker-io/` | sluglist vs Marker.io: open-source feedback widget alternative — sluglist | *same* | `https://sluglist.dev/compare/marker-io/` | article |
| `/docs/` | Documentation — sluglist | *same* | `https://sluglist.dev/docs/` | website |
| `/changelog/` | Changelog — sluglist | *same* | `https://sluglist.dev/changelog/` | article |

`og:description`/`twitter:description` equal each page's own meta description; `og:image` stays the
shared card. The home page is byte-identical to before apart from nothing — it was not edited.

Live check after deploy:

```
$ curl -s https://sluglist.dev/docs/quick-start/ | grep -E 'og:(title|url|description)'
<meta property="og:title" content="Quick start — sluglist"/>
<meta property="og:description" content="Install the sluglist feedback widget and mount it with one line of config: a connector, and nothing else. ESM, CJS or a script tag from a CDN."/>
<meta property="og:url" content="https://sluglist.dev/docs/quick-start/"/>
```

---

## Phase 2 — One canonical dev-loop snippet

Chosen form: **clean snippet + a reminder line directly under it**, worded identically in all five
places (the task's recommendation — quick-start keeps its "one line" promise, and the gate is stated
as prose rather than doubling the snippet's size).

> Gate it behind an env flag so it never initializes in production —
> `enabled: process.env.NODE_ENV !== "production"`.

| Location | Before | After |
|---|---|---|
| `README.md` (scenario 1) | bare | bare + reminder |
| `README.md` (local feedback loop) | `enabled:` in snippet | bare + reminder |
| `docs/content/docs/quick-start.md` | bare | bare + reminder |
| `docs/content/docs/agents.md` | `enabled:` in snippet | bare + reminder |
| `docs/lib/use-cases.ts` (`/for/claude-code/`) | `enabled:` in snippet | bare + reminder |

The landing's scenario **card** (`docs/app/page.tsx`) shows the same bare snippet; it is a compact
card with no prose slot, and it links through to `/for/claude-code/`, which carries the reminder.

```
$ grep -rn "NODE_ENV" README.md docs/content docs/lib docs/app | grep -v node_modules
README.md:68:`enabled: process.env.NODE_ENV !== "production"`.
README.md:696:`enabled: process.env.NODE_ENV !== "production"`.
docs/content/docs/quick-start.md:61:`enabled: process.env.NODE_ENV !== "production"`.
docs/content/docs/agents.md:18:`enabled: process.env.NODE_ENV !== "production"`.
docs/lib/use-cases.ts:44:\`enabled: process.env.NODE_ENV !== "production"\`.
```

Every remaining occurrence is the reminder line; none is inside a snippet.

---

## Phase 3 — Terminology: no change needed

**The premise did not hold, so nothing was edited.** `strings` and `labels` are not two names for one
thing — they are two different APIs, and both are already used correctly everywhere:

| Term | What it is | Canonical usage |
|---|---|---|
| `strings` | the **mount option** that overrides UI text — `mountFeedbackWidget(widget, { strings: … })`, type `Partial<FeedbackWidgetStrings>` (`src/ui/mount.ts:92`) | option name |
| `labels` | the **exported bundle of prebuilt locales** — `import { labels } from "sluglist/labels"`, `labels = { en, ru, uk, es, de }` (`src/labels.ts:361`) | locale pack |

They compose: `mountFeedbackWidget(widget, { strings: labels.uk })`.

Grep for the failure mode the phase was guarding against — the *option* being called `labels`:

```
$ grep -rnE "\{\s*labels\s*:|labels:\s*\{" README.md docs/content docs/lib docs/app skills/
(no matches)
```

Remaining hits for either word in the docs are ordinary English ("query strings", "viewport strings",
"selectors and labels", "form labels"), not API references. The landing's config table lists
`strings` / `Partial<Strings>`, matching the code.

The STOP condition ("both terms in the code as different APIs → report, this is no longer a docs
fix") is technically met — but the correct conclusion is milder than it anticipated: there is no
inconsistency to fix, so no code and no docs were touched here. Flagging rather than inventing work.

---

## Phase 4 — Privacy footnote

One line under the frontmatter example in the *A stable artifact format* section, in the site's
existing small-muted-caption style (grep found no italic captions on the site, so that convention was
followed instead):

> `reporter` comes from the `identity` you configure — scrubbing applies to text the widget captures,
> not to fields you set on purpose.

Screenshot: [`evidence/site-polish/footnote.jpg`](evidence/site-polish/footnote.jpg).

---

## Phase 5 — `npx sluglist init-skills`

[`src/cli/init-skills.ts`](src/cli/init-skills.ts). The governing rule: **a skill the user edited is
never overwritten** — skills are prompts, and editing them to fit a project is expected.

- Identical to bundled → refreshed silently (`up to date`).
- Differs → reported and kept; `--force` replaces.
- Differences are compared **per skill folder before writing anything**, so a partially-edited skill
  is left entirely alone rather than half-updated.
- Zero-config default `.claude/skills`; `--dir` retargets. `--dir` means the artifact folder for
  `dev`/`report`, so the parser tracks whether it was set explicitly and only then overrides this
  command's own default.

A messaging correctness point found while testing: a **package upgrade** produces the same "differs"
state as a local edit, so the output does not claim the user edited anything — it says
`differs from the bundled copy, kept` and the hint names both causes.

### All four required scenarios (run against a real `npm install`, not the repo)

```
########## 1. clean project ##########
$ npx sluglist init-skills
/…/pkgtest/.claude/skills
  + sluglist-checklist
  + sluglist-fix
  + sluglist-qa

3 installed

########## 2. re-run ##########
  ✓ sluglist-checklist (up to date)
  ✓ sluglist-fix (up to date)
  ✓ sluglist-qa (up to date)

3 up to date

########## 3. locally edited skill ##########
  ✓ sluglist-checklist (up to date)
  ✓ sluglist-fix (up to date)
  ! sluglist-qa — differs from the bundled copy, kept

2 up to date, 1 skipped
Kept your copies. If you edited them, that is what you want; if you just
upgraded sluglist, re-run with --force to take the new versions.

  file intact: YES        note still present: YES

########## 4. --force ##########
  ↻ sluglist-qa (overwritten)

1 overwritten, 2 up to date
  local note gone: YES

########## 5. --dir custom/skills ##########
/…/custom/skills
  + sluglist-checklist  + sluglist-fix  + sluglist-qa
```

11 tests in [`test/init-skills.test.ts`](test/init-skills.test.ts) cover these plus: nested files,
folder creation, a deleted skill being restored, loose non-folder files ignored, and both output
summaries.

### Docs updated

| Page / file | Change |
|---|---|
| `README.md` | `npx sluglist init-skills` + safety note; manual `cp` kept in a `<details>` "or copy manually" |
| `docs/content/docs/agents.md` (`/docs/agents/`) | same |
| `docs/lib/use-cases.ts` (`/for/claude-code/`) | step 3 now installs via the command |
| `docs/app/page.tsx` (landing) | agent step 3 mentions the command |
| `skills/sluglist-qa/SKILL.md`, `skills/sluglist-fix/SKILL.md` | command, with the single-skill `cp` as an inline fallback |

```
$ grep -c "sluglist init-skills" out/docs/agents/index.html out/for/claude-code/index.html
out/docs/agents/index.html:2
out/for/claude-code/index.html:2
$ grep -o "<summary>or copy manually</summary>" out/docs/agents/index.html
<summary>or copy manually</summary>
```

---

## Changed files

**Library** — `src/cli/init-skills.ts` (new), `src/cli/index.ts` (third command, `--force`,
`dirSet`), `test/init-skills.test.ts` (new), `package.json` (1.14.0), `CHANGELOG.md`.

**Site** — `docs/lib/site.ts` (`pageMetadata`), `docs/app/{page,docs/page,changelog/page}.tsx`,
`docs/app/{docs,for,compare}/[slug]/page.tsx`, `docs/content/docs/{quick-start,agents}.md`,
`docs/lib/use-cases.ts`.

**Docs** — `README.md`, `skills/sluglist-qa/SKILL.md`, `skills/sluglist-fix/SKILL.md`.

## Open — needs your call

- **`npm publish`** for 1.14.0 (the `init-skills` command is only useful once published — `npx
  sluglist init-skills` resolves from the registry). Changelog written, version bumped, build clean.
  Nothing published from here.
