/**
 * Fix-agent step (sluglist-fix skill): adopt the QA session, record what was
 * done to each issue in fixes.yaml. The code fix itself is applied to app.mjs
 * separately (BUG=0 switches to the corrected build), exactly as a real fix
 * agent would commit a change and then record it here.
 *
 * Usage: node fix-run.mjs <session-dir-root> <session-id> <commit>
 */
import { createSession, LocalConnector } from "sluglist/node";

const [dir, sessionId, commit] = process.argv.slice(2);

const session = await createSession({
  connectors: [new LocalConnector({ dir })],
  sessionId,
  reporter: { name: "fix-agent", kind: "agent" },
});

await session.reportFix({
  issue: "01",
  status: "fixed",
  commit,
  note: "Save handler looked up element id 'tost'; corrected to 'toast' so the confirmation shows",
  checklistItem: "settings-save-confirms",
});

console.log(`fixes.yaml written for ${sessionId}`);
