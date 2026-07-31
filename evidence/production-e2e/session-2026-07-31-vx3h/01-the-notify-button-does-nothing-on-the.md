---
id: "01"
url: "/account/settings?email=[email]&[token]"
selector: "[data-testid=\"[email]\"]"
mode: element
element_text: "Notify [email] at +[digits]"
dom_path: "main > button"
viewport: 1512x982
screenshot: 01-the-notify-button-does-nothing-on-the.png
masked: true
scrubbed: true
errors_count: 3
actions_count: 2
created_at: 2026-07-31T16:26:42Z
reporter:
  email: "qa@acme.example"
  name: QA
custom:
  build: 2026.07.31
context:
  tenant: acme-eu
---

The notify button does nothing on the settings page

## Errors
- [0s before report] console: Payment declined for card [digits]
- [0s before report] exception: Session refresh failed for [token]
    Error: token [token] rejected
        at refreshSession (/assets/session-9c4b.js:184:23)
        at async onSettingsMount (/assets/account-2f7a.js:96:5)
- [0s before report] network: GET /api/session/[token]/refresh → 404 (3ms)

## Actions
- [0s before report] click [data-testid="[email]"] ("Notify [email] at +1 …")
- [0s before report] navigate / → /account/orders/[token]
