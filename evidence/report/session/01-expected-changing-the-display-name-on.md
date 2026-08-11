---
id: "01"
url: /settings
selector: "#save"
mode: fullpage
category: bug
checklist_item: settings-save-confirms
viewport: 1280x800
screenshot: 01-expected-changing-the-display-name-on.png
created_at: 2026-08-11T14:43:57Z
reporter:
  name: qa-agent
  kind: agent
---

Expected: changing the display name on Settings and clicking Save shows a "Settings saved" confirmation.
Observed: nothing appears — the confirmation stays hidden and no error is shown, so the user cannot tell whether the change was kept.
Steps: open /settings, edit Display name, click Save.
