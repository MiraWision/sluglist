---
id: "01"
url: /settings
selector: "#save"
mode: fullpage
category: bug
title: Saving settings confirms nothing on screen
checklist_item: settings-save-confirms
viewport: 1280x800
screenshot: 01-expected-changing-the-display-name-on.png
created_at: 2026-08-24T10:30:19Z
reporter:
  name: qa-agent
  kind: agent
---

Expected: changing the display name on Settings and clicking Save shows a "Settings saved" confirmation.
Observed: nothing appears — the confirmation stays hidden and no error is shown, so the user cannot tell whether the change was kept.
Steps: open /settings, edit Display name, click Save.

## Actions
- [7s before report] navigate → /dashboard
- [6s before report] navigate /dashboard → /reports
- [5s before report] click button#export ("Export CSV")
- [4s before report] navigate /reports → /archive
- [2s before report] navigate /archive → /settings
- [1s before report] type (13 chars) input#name
- [1s before report] click button#save ("Save")
