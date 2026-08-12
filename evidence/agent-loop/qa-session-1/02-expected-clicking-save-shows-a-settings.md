---
id: "02"
url: /settings
selector: null
mode: fullpage
category: bug
checklist_item: settings-save-confirms
viewport: 1280x800
screenshot: 02-expected-clicking-save-shows-a-settings.png
created_at: 2026-08-09T16:29:29Z
reporter:
  name: qa-agent
  kind: agent
---

Expected: clicking Save shows a "Settings saved" confirmation. Observed: nothing appears after the click (screenshot taken ~300ms after clicking Save). Page errors captured: TypeError: Cannot set properties of null (setting 'hidden')
Steps: open /settings, click Save.
