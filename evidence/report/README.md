# The report harness

Everything here produces a **real** sluglist report from a **real** browser run — no fixtures, no
hand-written YAML. When the report renderer changes, this is what proves the change on something a
reader would actually open.

| File | What it is |
| --- | --- |
| `app.mjs` | A small demo app ("Reportly") with four pages, one of which is deliberately broken. `BUG=0` starts the fixed build. |
| `cdp.mjs` | A ~200-line Chrome DevTools Protocol driver — navigate, click, type, screenshot. Drives the Chrome already installed on the host, so nothing is downloaded. |
| `smoke-checklist.json` | The checklist the run walks: six client-voice items. |
| `qa-run.mjs` | The QA pass. Walks the checklist, captures evidence for every item it can test, files an issue for the one that fails, records the action trail, writes the session through `sluglist/node`. |
| `fix-run.mjs` | The fix pass. Writes `fixes.yaml` against a session. |
| `sample/` | The committed sample session — see below. |

## The sample session

`sample/` is a two-round cycle, kept in the repo so there is always something current to open,
screenshot and link:

- **`sample/pass-1/session-2026-08-24-niqf`** — the broken build. 4 pass (with evidence), 1 fail, 1 honestly **not
  tested** *with the reason recorded on the item* (format 1.9); one issue with an author `title`, a
  seven-step action trail, and `fixes.yaml` recording the fix at commit `4be0b62`.
- **`sample/pass-2/session-2026-08-24-2foq`** — the same checklist against the fixed build. Everything passes,
  every pass carries a screenshot.
- **`sample/titles.json`** — the issue heading, for `--titles`.

It exercises every feature of the current report on purpose: evidence on **passing** items, a reason
on the item nobody could test, an author title, the details/action-trail spoiler, the merged
multi-session view, and — via the `/archive` page — a genuine full-page capture (1280×5997) that only
becomes readable in the lightbox.

### Regenerate it

```bash
npm run build
cd evidence/report
rm -rf sample && node app.mjs &                       # the broken build, port 5099
node qa-run.mjs smoke-checklist.json sample/pass-1 /tmp/dl
node fix-run.mjs sample/pass-1 <session-id> 4be0b62
kill %1 && BUG=0 node app.mjs &                       # the fixed build
node qa-run.mjs smoke-checklist.json sample/pass-2 /tmp/dl
kill %1
```

Session ids carry the date, so a regenerated sample gets new ones — update `sample/titles.json` and
the paths below to match.

### Render it

```bash
node dist/cli.js report evidence/report/sample/pass-1/session-2026-08-24-niqf \
  --titles evidence/report/sample/titles.json \
  -o evidence/report/sample/report-single.html
```

```bash
node dist/cli.js report evidence/report/sample/pass-1/session-2026-08-24-niqf evidence/report/sample/pass-2/session-2026-08-24-2foq \
  --titles evidence/report/sample/titles.json \
  -o evidence/report/sample/report-merged.html
```

Both HTML files are gitignored — they are 0.6 MB and 1.1 MB of embedded evidence, and the two commands
above rebuild them in a second.

## Screenshots, and where each one belongs

Three images in this repo show the report to someone who has not run it. They are taken by hand, from
`sample/report-single.html` opened in a browser at a **1280×800** window, and they should be retaken
whenever the report's layout changes. The report is light whatever the browser's theme is, so the
shots do not depend on the machine they are taken on.

| Path | What to capture | Where it shows up |
| --- | --- | --- |
| `evidence/report/shot-desktop.png` | The top of the report: title, meta rows, the pass/fail/not-tested cards, the summary line, and the first two or three checklist items with their evidence thumbnails. Viewport shot, not full page. | README.md, at 640px wide |
| `evidence/report/shot-lightbox.png` | The archive evidence (check 04) open in the lightbox — the tall capture scrolled to the top, close button, the caption bar naming `ev-archive-lists-everything-01.png`. This is the shot that shows a full-page capture is actually readable. | Reference for the docs; not embedded today |
| `docs/public/report-example.jpg` | The same framing as `shot-desktop.png`, exported as JPEG. | The home page's report panel |

`docs/public/example-report.html` is not a screenshot — it is a copy of `sample/report-single.html`,
linked from the site as the live example. Refresh it with:

```bash
cp evidence/report/sample/report-single.html docs/public/example-report.html
```
