// Fix-agent step (sluglist-fix skill): record resolutions in fixes.yaml via
// the writer API, adopted onto the existing QA session folder.
import { createSession, LocalConnector } from "sluglist/node";

const [sessionId, c1, c2] = process.argv.slice(2);
const session = await createSession({
  connectors: [new LocalConnector({ dir: ".sluglist" })],
  sessionId,
  reporter: { name: "fix-agent", kind: "agent" },
});
await session.reportFix({
  issue: "01", status: "fixed", commit: c1,
  note: "Export CSV button restored in the Reports toolbar; existing #export click handler now binds",
  checklistItem: "export-button-visible",
});
await session.reportFix({
  issue: "02", status: "fixed", commit: c2,
  note: "Toast lookup used the wrong element id (tost); corrected to toast",
  checklistItem: "settings-save-confirms",
});
console.log("fixes recorded for", sessionId);
