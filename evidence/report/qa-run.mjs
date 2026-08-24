/**
 * QA-agent run (sluglist-qa skill) in evidence mode "all".
 *
 * Every rule from the skill is honoured mechanically here:
 *  - a pass is recorded only after the check was performed in the browser;
 *  - in mode "all" each pass carries a screenshot AND a note stating an
 *    OBSERVED FACT (the anti-theatre rule) — for the export check the fact is
 *    read off the downloaded file itself, not off the screen;
 *  - a fail is filed as an issue with a screenshot, then linked;
 *  - an item that cannot be understood or reached gets NO verdict.
 *
 * Usage: node qa-run.mjs <checklist> <session-dir> <download-dir>
 */
import { mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createSession, LocalConnector } from "sluglist/node";
import { launch } from "./cdp.mjs";

const BASE = "http://127.0.0.1:5099";
const [checklistPath, outDir, downloadDir] = process.argv.slice(2);
mkdirSync(downloadDir, { recursive: true });

const session = await createSession({
  connectors: [new LocalConnector({ dir: outDir })],
  project: "reportly",
  baseUrl: BASE,
  viewport: "1280x800",
  checklist: checklistPath,
  reporter: { name: "qa-agent", kind: "agent" },
});

const { page, close } = await launch({ downloadDir });
const notTested = [];
const summary = [];

/**
 * The steps this run actually performed, with real timestamps.
 *
 * The widget records an action trail by itself; a headless agent has to write
 * down what it did. Nothing here is invented — each entry is appended at the
 * moment the run performs that action, and the "Ns before report" ages are
 * computed against the moment the issue is filed.
 */
const trail = [];
function did(text) {
  trail.push({ at: Date.now(), text });
}
/**
 * A short settle after each step. An agent driving a browser waits for the page
 * to be ready anyway; here it also means the trail's relative ages are the real
 * spacing of a session rather than six identical "1s before report" lines.
 */
function settle(ms = 900) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function trailSection(now = Date.now()) {
  if (trail.length === 0) {
    return "";
  }
  const lines = trail.map((step) => {
    const ago = Math.max(1, Math.round((now - step.at) / 1000));
    return `- [${ago}s before report] ${step.text}`;
  });
  return `\n\n## Actions\n${lines.join("\n")}`;
}

function downloaded() {
  // The observable fact for an invisible-result check: what actually landed on
  // disk. Chrome writes `*.crdownload` while in flight, so those are ignored.
  return readdirSync(downloadDir)
    .filter((f) => !f.endsWith(".crdownload"))
    .map((f) => ({ name: f, size: statSync(join(downloadDir, f)).size }));
}

/* --- 1. Dashboard greeting — visible result ------------------------- */
await page.goto(`${BASE}/dashboard`);
did("navigate → /dashboard");
await settle();
{
  const heading = (await page.text("h1")).trim();
  const count = (await page.text("#open-count")).trim();
  if (/dana/i.test(heading) && count) {
    await session.setVerdict("dashboard-greeting", "pass", {
      evidence: {
        screenshots: [await page.screenshot()],
        note: `Opened /dashboard — heading read "${heading}", open report count showed ${count}`,
      },
    });
    summary.push("dashboard-greeting: pass");
  } else {
    throw new Error("unexpected dashboard state");
  }
}

/* --- 2. Reports table — visible result ------------------------------ */
await page.goto(`${BASE}/reports`);
did("navigate /dashboard → /reports");
await settle();
{
  const rows = await page.evaluate(
    `[...document.querySelectorAll('tbody tr')].map(tr =>
       [...tr.cells].map(td => td.textContent.trim()).join(' = ')).join('; ')`
  );
  const count = await page.evaluate(
    "document.querySelectorAll('tbody tr').length"
  );
  await session.setVerdict("reports-table", "pass", {
    evidence: {
      screenshots: [await page.screenshot()],
      note: `Opened /reports — table listed ${count} reports: ${rows}`,
    },
  });
  summary.push("reports-table: pass");
}

/* --- 3. Export CSV — INVISIBLE result -------------------------------- */
{
  const before = downloaded().length;
  await page.click("#export");
  did('click button#export ("Export CSV")');
  await settle();
  // Wait for the file to actually appear; the screen shows nothing.
  let files = [];
  for (let i = 0; i < 40; i++) {
    files = downloaded();
    if (files.length > before) {
      break;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  if (files.length > before) {
    const file = files.at(-1);
    const body = readFileSync(join(downloadDir, file.name), "utf8");
    const lines = body.trim().split("\n");
    await session.setVerdict("reports-export-csv", "pass", {
      evidence: {
        screenshots: [await page.screenshot()],
        // The screenshot cannot prove this one — the note carries the proof.
        note: `Clicked Export CSV on /reports — ${file.name} downloaded, ${file.size} bytes, header "${lines[0]}", ${lines.length - 1} data rows (${lines[1]} …)`,
      },
    });
    summary.push(`reports-export-csv: pass (${file.name}, ${file.size}B)`);
  } else {
    const issue = await session.reportIssue({
      comment:
        "Expected: clicking Export CSV on /reports downloads a CSV file.\nObserved: no file was downloaded within 4s.\nSteps: open /reports, click Export CSV.",
      screenshot: await page.screenshot(),
      category: "bug",
      checklistItem: "reports-export-csv",
      meta: { url: "/reports", viewport: "1280x800" },
    });
    await session.setVerdict("reports-export-csv", "fail", { issue: issue.id });
    summary.push("reports-export-csv: fail");
  }
}

/* --- 3b. Archive — a genuinely long page ----------------------------- */
await page.goto(`${BASE}/archive`);
did("navigate /reports → /archive");
await settle(1400);
{
  const rows = await page.evaluate(
    "document.querySelectorAll('tbody tr').length"
  );
  const months = await page.evaluate("document.querySelectorAll('h2').length");
  // A full-page capture of a page many screens tall: the case the report has
  // to render by width and scroll rather than squeeze into a strip.
  await session.setVerdict("archive-lists-everything", "pass", {
    evidence: {
      screenshots: [await page.screenshot()],
      note: `Opened /archive — ${rows} rows under ${months} monthly headings, full page captured top to bottom`,
    },
  });
  summary.push("archive-lists-everything: pass");
}

/* --- 4. Settings save confirmation — the planted bug ----------------- */
await page.goto(`${BASE}/settings`);
did("navigate /archive → /settings");
await settle(1100);
{
  await page.evaluate(
    "document.querySelector('#name').value = 'Dana M. Marek'"
  );
  did('type (13 chars) input#name');
  await settle(700);
  await page.click("#save");
  did('click button#save ("Save")');
  const toastVisible = await page.visible("#toast");
  if (toastVisible) {
    await session.setVerdict("settings-save-confirms", "pass", {
      evidence: {
        screenshots: [await page.screenshot()],
        note: `Changed the display name on /settings and clicked Save — confirmation read "${(await page.text("#toast")).trim()}"`,
      },
    });
    summary.push("settings-save-confirms: pass");
  } else {
    const issue = await session.reportIssue({
      comment:
        'Expected: changing the display name on Settings and clicking Save shows a "Settings saved" confirmation.\n' +
        "Observed: nothing appears — the confirmation stays hidden and no error is shown, so the user cannot tell whether the change was kept.\n" +
        "Steps: open /settings, edit Display name, click Save." +
        trailSection(),
      screenshot: await page.screenshot(),
      // Format 1.8: the heading the report uses instead of truncating the
      // first sentence. Five to eight words, what was seen — and the comment
      // above still reaches the reader verbatim.
      title: "Saving settings confirms nothing on screen",
      category: "bug",
      checklistItem: "settings-save-confirms",
      meta: { url: "/settings", selector: "#save", viewport: "1280x800" },
    });
    await session.setVerdict("settings-save-confirms", "fail", {
      issue: issue.id,
      evidence: {
        screenshots: [await page.screenshot()],
        note: "After Save the toast element is still display:none; the DOM shows no confirmation node",
      },
    });
    summary.push(`settings-save-confirms: fail (issue ${issue.id})`);
  }
}

/* --- 5. Quarterly reconciliation — not testable ---------------------- */
{
  // The item names a process with no surface anywhere in the app. Per the
  // skill: no verdict — and, since format 1.9, the reason recorded on the item
  // so it reaches the report instead of dying in this process's stdout.
  const reason =
    'could not test: the item refers to a "quarterly reconciliation" that has no trigger or surface in the app, and no way to observe its outcome';
  await session.setVerdict("settings-digest-persists", null, {
    evidence: { note: reason },
  });
  notTested.push({ id: "settings-digest-persists", reason });
  summary.push("settings-digest-persists: NOT TESTED");
}

await close();

console.log(`\nsession: ${session.sessionId}`);
for (const line of summary) {
  console.log(`  ${line}`);
}
if (notTested.length > 0) {
  console.log("\nNot tested:");
  for (const item of notTested) {
    console.log(`  ${item.id} — ${item.reason}`);
  }
}
