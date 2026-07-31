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
created_at: 2026-07-31T07:47:28Z
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
        at /Users/yelysei/Documents/dev/libs/sluglist/test/e2e-production.test.ts:122:16
        at file:///Users/yelysei/Documents/dev/libs/sluglist/node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
        at new Promise (<anonymous>)
        at runWithTimeout (file:///Users/yelysei/Documents/dev/libs/sluglist/node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
        at runHook (file:///Users/yelys…[truncated]
- [0s before report] network: GET /api/session/[token]/refresh → 404 (8ms)

## Actions
- [0s before report] click [data-testid="[email]"] ("Notify [email] at +1 …")
- [0s before report] navigate / → /account/orders/[token]
