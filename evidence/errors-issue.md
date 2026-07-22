---
id: "01"
url: /evidence/errors-harness.html
selector: null
mode: fullpage
viewport: 488x513
screenshot: null
errors_count: 3
created_at: 2026-07-22T14:05:09Z
---

Something broke on this page

## Errors
- [0s before report] console: Failed to load resource: /api/animals 500
- [0s before report] exception: Uncaught TypeError: Cannot read properties of undefined (reading 'id')
    TypeError: Cannot read properties of undefined (reading 'id')
        at http://localhost:5175/evidence/errors-harness.html:43:36
- [0s before report] rejection: Unhandled rejection: network down
    Error: network down
        at http://localhost:5175/evidence/errors-harness.html:45:26
        at new Promise (<anonymous>)
        at window.trigger (http://localhost:5175/evidence/errors-harness.html:35:9)
