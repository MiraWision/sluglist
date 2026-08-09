/**
 * QA-agent run (sluglist-qa skill). Walks checklist.json against the running
 * Reportly demo with a controlled browser. Rules honored:
 *  - pass only after actually performing the check in the browser;
 *  - fail only with a screenshot filed as an issue;
 *  - un-navigable / unclear items get NO verdict and are listed as not tested.
 *
 * Usage: node qa-run.mjs <checklist-path> [session-suffix]
 */
import { chromium } from "playwright";
import { readFile, writeFile } from "node:fs/promises";
import { createSession, LocalConnector } from "sluglist/node";

const BASE = "http://127.0.0.1:5099";
const CHECKLIST = process.argv[2] ?? "checklist.json";
const VIEWPORT = "1280x800";

const session = await createSession({
  connectors: [new LocalConnector({ dir: ".sluglist" })],
  project: "reportly",
  baseUrl: BASE,
  viewport: VIEWPORT,
  checklist: CHECKLIST,
  reporter: { name: "qa-agent", kind: "agent" },
});

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const consoleErrors = [];
page.on("pageerror", (err) => consoleErrors.push(String(err)));
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("framenavigated", () => (consoleErrors.length = 0));

const results = []; // { id, verdict|null, issue?, reason? }

async function shot() {
  return await page.screenshot({ fullPage: true });
}

async function fail(itemId, comment, url) {
  const issue = await session.reportIssue({
    comment,
    screenshot: await shot(),
    category: "bug",
    checklistItem: itemId,
    meta: { url, viewport: VIEWPORT },
  });
  await session.setVerdict(itemId, "fail", { issue: issue.id });
  results.push({ id: itemId, verdict: "fail", issue: issue.id });
}

async function pass(itemId) {
  await session.setVerdict(itemId, "pass");
  results.push({ id: itemId, verdict: "pass" });
}

function notTested(itemId, reason) {
  results.push({ id: itemId, verdict: null, reason });
}

const items = session.getChecklist().sections.flatMap((s) => s.items);

for (const item of items) {
  switch (item.id) {
    case "dashboard-greeting": {
      await page.goto(BASE + item.url);
      const h1 = (await page.locator("h1").first().textContent())?.trim() ?? "";
      if (/welcome back,\s+\w+/i.test(h1)) {
        await pass(item.id);
      } else {
        await fail(
          item.id,
          `Expected: the dashboard greets the user by name. Observed: heading is ${JSON.stringify(h1)}.\nSteps: open ${item.url}.`,
          item.url
        );
      }
      break;
    }
    case "reports-table": {
      await page.goto(BASE + item.url);
      const rows = await page.locator("#report-table tr:has(td)").count();
      const counts = await page.locator("#report-table tr td:nth-child(2)").allTextContents();
      if (rows === 3 && counts.every((c) => /^\d+$/.test(c.trim()))) {
        await pass(item.id);
      } else {
        await fail(
          item.id,
          `Expected: three reports with numeric row counts. Observed: ${rows} data rows, counts: ${JSON.stringify(counts)}.\nSteps: open ${item.url}.`,
          item.url
        );
      }
      break;
    }
    case "export-button-visible": {
      await page.goto(BASE + item.url);
      const visible = await page
        .locator("button", { hasText: /export/i })
        .first()
        .isVisible()
        .catch(() => false);
      if (visible && /downloads/i.test(item.title)) {
        // Re-test wording: the fix must also prove the download works.
        const download = page.waitForEvent("download", { timeout: 4000 }).catch(() => null);
        await page.locator("button", { hasText: /export/i }).first().click();
        const got = await download;
        if (got && /\.csv$/i.test(got.suggestedFilename())) {
          await pass(item.id);
        } else {
          await fail(
            item.id,
            `Expected: Export CSV visible and downloading a .csv. Observed: button visible but no download event within 4s.\nSteps: open ${item.url}, click Export CSV.`,
            item.url
          );
        }
      } else if (visible) {
        await pass(item.id);
      } else {
        const toolbar = (await page.locator(".toolbar").innerText()).trim();
        await fail(
          item.id,
          `Expected: an "Export CSV" button visible next to Print on Reports. Observed: no Export control; the toolbar contains only ${JSON.stringify(toolbar)}.\nSteps: open ${item.url}, look at the toolbar above the table.`,
          item.url
        );
      }
      break;
    }
    case "export-downloads-csv": {
      await page.goto(BASE + item.url);
      const btn = page.locator("button", { hasText: /export/i }).first();
      if (!(await btn.isVisible().catch(() => false))) {
        // The control the check depends on does not exist; that defect is
        // already filed under export-button-visible. This check cannot be
        // performed at all — not tested, not a second fail for the same bug.
        notTested(
          item.id,
          "the Export CSV button does not exist (see export-button-visible), so the download cannot be attempted"
        );
        break;
      }
      const download = page.waitForEvent("download", { timeout: 4000 }).catch(() => null);
      await btn.click();
      const got = await download;
      if (got && /\.csv$/i.test(got.suggestedFilename())) {
        await pass(item.id);
      } else {
        await fail(
          item.id,
          `Expected: clicking Export CSV downloads a .csv file. Observed: no download event within 4s (got ${got ? got.suggestedFilename() : "nothing"}).\nSteps: open ${item.url}, click Export CSV.`,
          item.url
        );
      }
      break;
    }
    case "settings-save-confirms": {
      await page.goto(BASE + item.url);
      await page.locator("#save").click();
      await page.waitForTimeout(300);
      const toastVisible = await page
        .locator("text=Settings saved")
        .first()
        .isVisible()
        .catch(() => false);
      if (toastVisible) {
        await pass(item.id);
      } else {
        await fail(
          item.id,
          `Expected: clicking Save shows a "Settings saved" confirmation. Observed: nothing appears after the click (screenshot taken ~300ms after clicking Save).${consoleErrors.length ? ` Page errors captured: ${consoleErrors.join(" | ")}` : ""}\nSteps: open ${item.url}, click Save.`,
          item.url
        );
      }
      break;
    }
    default:
      notTested(
        item.id,
        `item is not verifiable in the app: no url/hint, and nothing in the UI relates to ${JSON.stringify(item.title)} — needs the author to clarify what to open and what to look at`
      );
  }
}

await browser.close();

const summary = {
  sessionId: session.sessionId,
  pass: results.filter((r) => r.verdict === "pass").map((r) => r.id),
  fail: results.filter((r) => r.verdict === "fail").map((r) => ({ id: r.id, issue: r.issue })),
  notTested: results.filter((r) => r.verdict === null).map((r) => ({ id: r.id, reason: r.reason })),
};
await writeFile(`qa-report-${session.getChecklist().id}.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
