# RUN_EVIDENCE — production readiness (preset, scrub, dismiss, self-isolation, endpoint)

Date: 2026-07-31. **Additive-only**; the `FeedbackConnector` contract is unchanged; the `dev` preset
behaves exactly as before. Artifact format `1.2 → 1.3` (minor, additive: the `scrubbed` issue field).
**310 tests pass** (was 182 at the start of this iteration — 128 added), type-check clean, build clean.

Scope was deliberately narrow. Out of scope and *not* attempted: OCR / automatic PII detection on
screenshots, consent banners and cookie mechanics (the client's privacy-policy territory), artifact
encryption (the client's storage is their perimeter), and any new UI features.

External artifacts of the dirty-data run live under
[`evidence/production-e2e/`](evidence/production-e2e/), produced by
[`test/e2e-production.test.ts`](test/e2e-production.test.ts).

---

## Phase 0 — Pre-flight audit

### 0.1 Preset mechanism

| Surface | State | Decision |
|---|---|---|
| [`src/preset.ts`](src/preset.ts) | **REAL but privacy-only** — 25 lines, one function `resolvePrivacy`; `beta` → `{maskInputs, screenshotConsent}`, `dev` → `undefined` | Extended, not replaced. Added `resolveErrors` and `resolveDismiss` alongside it so each preset concern is one small pure function. |
| `preset` read outside preset.ts | [`widget.ts`](src/widget.ts) (stores resolved privacy on `core.config`), [`ui/mount.ts`](src/ui/mount.ts) (button relabel) | Both updated for `production`. The relabel now keys off a `realUserPreset` predicate rather than a literal `=== "beta"`. |
| Type | `FeedbackWidgetPreset = "dev" \| "beta"` | Additive union member `"production"`. |

### 0.2 Text surfaces — where arbitrary page text lands

| Surface | Source | User content? | Scrubbed now |
|---|---|---|---|
| `element_text` | `innerText` of the clicked element | **yes** | ✅ |
| `## Errors` message / stack | `console.error` args, `ErrorEvent.message`, rejection reason, stacks | **yes** | ✅ |
| `## Errors` network lines | `METHOD /path → status (Nms)`; `pathOf()` drops the query, keeps path segments | **yes** — tokens and ids in paths | ✅ |
| `## Actions` `elementText` | `textContent` of the clicked element, ≤ 40 chars | **yes** | ✅ *(added — not in the brief)* |
| `## Actions` `selector` | `generateSelector()` — testid / id / aria / path | **yes** — ids embed emails and tokens | ✅ *(added)* |
| `## Actions` `from` / `to` | `pathname + hash` | **yes** | ✅ *(added)* |
| `url` frontmatter + `issues[].url` | [`metadata.ts`](src/metadata.ts) — `pathname + location.search` | **yes — the query string was kept verbatim** | ✅ *(added)* |
| `selector` / `dom_path` frontmatter | element metadata | **yes** | ✅ *(added)* |
| body `comment`, `.md` filename slug | the reporter's own typing | yes, but deliberate | ❌ by design |
| `context` / `custom` / `reporter` | set by the developer | deliberate | ❌ by design |
| `session.yaml` head | origin, UA, viewport, tz, languages | no free text | n/a |
| checklist titles / descriptions | developer-authored config | no | ❌ by design |

**Two surfaces added beyond the brief's list.** The brief named `element_text`, `## Errors` and
network paths. Without `## Actions` and `url` the acceptance grep cannot be clean: clicking the
button that contains an email puts that email straight into the action trail, and `location.search`
is copied verbatim into `url`. Both are the same class of leak and are now covered.

### 0.3 Host-environment touch points

Inventory as found (before), and what each one does now (after).

| Point | Location | Guarded before | Restored original before | Now |
|---|---|---|---|---|
| `console.error` (+ `warn`) assignment | [`errors.ts`](src/errors.ts) | ❌ | ✅ | guarded; original called outside the guard; restore is identity-checked |
| `window` `error` / `unhandledrejection` | `errors.ts` | ❌ | ✅ | `guard.wrap` |
| `globalThis.fetch` | `errors.ts` | ❌ — a throw killed the host request | ✅ | metadata computed inside the guard, `originalFetch.call` **unconditional** |
| `XMLHttpRequest.prototype.open` / `send` | `errors.ts` | ❌ | ✅ | same shape; `loadend` listener wrapped |
| `document` click / submit / input (capture, passive) | [`actions.ts`](src/actions.ts) | ❌ | ✅ | `guard.wrap` |
| `history.pushState` / `replaceState` | `actions.ts` | ❌ | ✅ | original called unconditionally between two guarded regions |
| `window` popstate / hashchange | `actions.ts` | ❌ | ✅ | `guard.wrap` |
| `window` `beforeunload` | [`widget.ts`](src/widget.ts) | ❌ | ❌ **never removed** | `guard.wrap` + removed on trip |
| `document` keydown | [`ui/mount.ts`](src/ui/mount.ts) | ❌ | ✅ (unmount) | `guardUi` + removed on trip |
| `document` pointerdown | `ui/mount.ts` | ❌ | ❌ **never removed** | `guardUi` + removed on trip |
| `window.requestAnimationFrame` swap | [`screenshot.ts`](src/screenshot.ts) | ✅ (`finally`) | ✅ | unchanged — already correct |
| live-DOM style mutation (mask / reveal) | [`mask.ts`](src/mask.ts), `screenshot.ts` | partial | ✅ | unchanged — already correct |
| action-trail subscribers | `actions.ts` | ❌ | n/a | `guard.run` per subscriber |

No `MutationObserver` / `ResizeObserver` / `IntersectionObserver` anywhere. **Zero guards existed
before this iteration** — a throw in any wrapper propagated straight into host code, and two
listeners were never removed at all.

### 0.4 Outgoing network calls from the core

| Call | Location | Verdict |
|---|---|---|
| `fetch(checklistUrl)` | `widget.ts` | allowed — the host supplied the URL |
| `fetch(this.endpoint)` | [`connectors/local.ts`](src/connectors/local.ts) | allowed — it *is* a connector |
| `import("html-to-image")` | `screenshot.ts` | lazy chunk from the host's own bundle / CDN |
| html-to-image internals | `dataurl.js`, `embed-webfonts.js`, `util.js` | **fetches the page's OWN images and webfont CSS** to inline them into the PNG |

No beacons, no WebSocket, no EventSource, no analytics, nothing addressed at sluglist
infrastructure — **there is no sluglist infrastructure**. So: **no phone-home, and nothing to
remove** (Phase 5.1 was a no-op by inspection).

But the literal sentence *"no network requests except your connectors"* is not true at capture time,
because a DOM-to-PNG renderer must re-fetch the assets it is inlining. Rather than mask that behind a
flag, the README states the claim **and** both exceptions, and the guard test is scoped to the core
flow. This did **not** trigger the STOP condition: the traffic is inherent to rendering a screenshot
and goes only to URLs the host page already references.

### 0.5 Example endpoint, as found

| Control | Before | After |
|---|---|---|
| Authentication | **none** — `HttpConnector` sent a bearer token the route never read | 401, constant-time compare; 503 if the server has no token configured |
| Body size | 20 MB of base64 (~15 MB decoded) | 10 MB decoded, checked on `content-length`, on base64 length, and after decode |
| Mime allowlist | present, but returned 400 | 415, separate from payload errors |
| Path validation | present, single segment only | kept, plus the nested `frames/clip-NN/NN.png` layout; `..` and absolute paths rejected |
| Per-IP rate limit | present (20/min) | kept, moved into the handler closure |
| Per-session file cap | **none** | 409 after 200 artifacts |

---

## Phase 1 — `preset: "production"` + PII scrub

New module [`src/scrub.ts`](src/scrub.ts) — a pure string transform, no dependencies, no DOM.

| Rule | Replacement | Shape |
|---|---|---|
| Email | `[email]` | standard address grammar |
| JWT | `[token]` | three base64url segments joined by dots |
| Opaque secret | `[token]` | 24+ chars of `[A-Za-z0-9+=_-]`, must contain a digit **and** one chunk ≥ 12 chars when split on `-`/`_` |
| Digit run | `[digits]` | 6+ digits, spaces and hyphens allowed inside, calendar dates excluded |

The chunk rule is what keeps `/dashboard-analytics-overview-2026` and
`01-the-summary-header-overlaps-the-score` intact while still catching UUIDs and hex digests. `.` and
`/` are not separators in the digit rule, which is what keeps `10.0.19045`, `192.168.100.201` and
`app.js:1284:17` readable.

Applied at the artifact assembly point in `widget.ts` — `artifacts.ts` stays a pure formatter.

Config: `privacy.scrubText`, available with or without the preset. Frontmatter: additive
`scrubbed: true|false`, emitted **only** when `scrubText` was set explicitly (directly or by the
preset), so `dev` and default-`beta` artifacts are byte-identical to before.

Preset resolution: `production` = `beta` + `scrubText: true` + `captureWarnings: false` +
`dismiss.enabled: true`. Explicit options override everything **except** `errors.captureWarnings`,
which `production` forces off and logs a warning about — the single deliberate exception, documented
in `resolveErrors`.

**Tests:** [`test/scrub.test.ts`](test/scrub.test.ts) — 34 cases, of which **17 are negative** (dates,
ISO timestamps, viewport strings, version numbers, IPv4, stack-trace line:column, prices, short
counts, long kebab paths, long ordinary words, camelCase identifiers, readable selectors).
[`test/production-preset.test.ts`](test/production-preset.test.ts) — 15 cases including the dev and
beta regressions.

---

## Phase 2 — Dismiss

New module [`src/dismiss.ts`](src/dismiss.ts). `localStorage` key `sluglist:<project>:dismissed`,
value `{"dismissed_at":"<ISO>"}`. Every storage access is wrapped — Safari private mode and blocked
third-party storage both throw, and a widget that cannot remember a dismissal must still work.
Corrupt or unparseable entries **fail open** (not dismissed): keeping the feedback path reachable is
the safer default for a support tool.

UI: `.fab-wrap` now owns the fixed position and `.fab` is relative inside it, so the ✕ can be
anchored to the launcher's corner. It sits on the **pinned** edge — the one that does not move when
the button expands on hover — and the issue-count badge moves to the opposite (also pinned) corner,
so neither jumps.

`MountedFeedbackWidget` gains `show()`, `dismiss()` and `isDismissed()` (additive).

**Verified live in Chrome** on [`evidence/production-harness.html`](evidence/production-harness.html):

| Step | Result |
|---|---|
| initial | `{dismissed: false, stored: null, hostDisplay: ""}` |
| click ✕ | `{dismissed: true, stored: {"dismissed_at":"2026-07-31T07:36:18.641Z"}, hostDisplay: "none"}` |
| press `Shift+F` while dismissed | menu stays `display: none` — the shortcut is inert |
| reload | `{dismissed: true, …, hostDisplay: "none"}` |
| backdate `dismissed_at` by 8 days | `isDismissed("acme", 7)` → `false` (at 3 days → `true`) |
| footer link → `ui.show()` | `{dismissed: false, stored: null, hostDisplay: ""}` |

Measured geometry of the ✕ under the production preset: `20×20`, `display: flex`,
`aria-label: "Hide feedback button"`, top-right at `(top 899, right 17)` against a launcher at
`(top 906, right 24)` — a 7 px overhang on the pinned corner; badge moved to `bottom: -4px`. Button
label reads `"Report a problem"`.

**Tests:** [`test/dismiss.test.ts`](test/dismiss.test.ts) — 20 cases (jsdom) covering storage
semantics, the `days: 0` forever case, per-project scoping, corrupt entries, and the full mounted
lifecycle including "dev preset renders no visible ✕" and "a stored dismissal is ignored while
dismiss is disabled".

---

## Phase 3 — Self-isolation

New module [`src/guard.ts`](src/guard.ts). Two rules:

1. **A throw inside widget code never escapes into host code.** Every wrapper is written so the call
   to the original sits *outside* the guarded region. `guard.run(site, work, fallback)` for value
   computation, `guard.wrap(site, listener, onError?)` for listeners.
2. **Repeated internal failures are terminal.** At 5 failures the breaker trips: teardowns restore
   the wrapped globals, remove every listener, cancel any recording and take the shadow host out of
   the DOM; one `console.warn` is emitted.

Failures log with `console.debug`, not `console.error` — a quietly failing widget should not also be
shouting, and `console.error` is itself wrapped, which would be circular.

`restoreIfOurs()` handles the STOP condition the brief anticipated: if another library wrapped on top
of us, the original is **not** written back (that would silently uninstall them). Our wrapper stays in
the chain, a `stopped` flag makes it a transparent passthrough, and the situation is logged.

**Host errors are data, not widget failures.** A page error arriving at the capture listener and
being recorded successfully is the system working. The counter only moves when widget code throws —
proven by a dedicated test that fires a `console.error`, an `ErrorEvent` and an `unhandledrejection`,
then asserts `snapshot().length === 3` and `guard.failures === 0`.

**Tests:** [`test/guard.test.ts`](test/guard.test.ts) — 17 cases.

| Acceptance criterion | Test |
|---|---|
| 5 injected failures → widget off, globals back by **reference identity** | `after five internal failures every global is back to the original` — `toBe` on `console.error`, `globalThis.fetch`, `history.pushState`, `history.replaceState`, `XMLHttpRequest.prototype.open`, `.send` |
| host page keeps working after the trip | `the host page keeps working after the widget switched itself off` — a host click handler still fires, `history.pushState` still navigates |
| broken fetch wrapper still issues the request | `fetch: the host request is still issued` — a throwing clock breaks the metadata step; `originalFetch` is still called once and returns 200 |
| host rejection still rejects | `fetch: a rejection from the host still rejects` |
| broken console wrapper still logs | `console.error: the host's log still happens` |
| broken history wrapper still navigates | `history.pushState: the host navigation still happens` |
| host errors do not trip the breaker | `recording a page error does not touch the failure counter` |
| render failure closes the panel, no stuck overlay | `a throwing UI handler closes the panel instead of leaving it stuck` |
| UI removed from the host DOM on trip | `removes the mounted UI from the host DOM` |
| foreign wrapper not clobbered | `leaves a foreign wrapper alone instead of clobbering it` |

---

## Phase 4 — Endpoint hardening + production checklist

[`examples/feedback-route.ts`](examples/feedback-route.ts) rewritten as `createFeedbackHandler(deps)`
(testable) with `export const POST` still the Next.js drop-in. The storage stub now **throws** with a
clear message instead of being a `declare`d ghost.

**Tests:** [`test/feedback-route.test.ts`](test/feedback-route.test.ts) — 27 cases.

| Status | Covered by |
|---|---|
| `401` | no header, wrong token, and a token that is a **prefix** of the real one |
| `503` | server has no `SLUGLIST_FEEDBACK_TOKEN` — fails closed, never open |
| `413` | oversize decoded body, and an oversize declared `content-length` |
| `415` | `application/javascript`, `text/html`, `application/octet-stream`, `image/svg+xml` |
| `429` | 25 requests past a 20/min window, plus proof the limit is per IP |
| `409` | session file cap, plus proof the cap is per session not global |
| `400` | `../../etc/passwd`, `/absolute/path.md`, `.hidden.md`, `a/b/c/d/too-deep.md`, traversal in `sessionId`, malformed JSON, missing fields |
| `200` | all three allowed mimes, and the nested `frames/clip-01/02.png` layout |

[`docs/production-checklist.md`](docs/production-checklist.md) — nine sections for the client: preset,
env gating, token generation and storage, retention (explicitly *their* decision, with the reminder
that nothing expires on its own), storage access control, a privacy-policy paragraph to adapt, a
"check what is still visible" pass, the `show()` rescue path, and why to keep the consent checkbox.
Ends with a ten-item pre-flight list. Linked from the README Production section and from
[`examples/README.md`](examples/README.md).

---

## Phase 5 — No-phone-home guard

Phase 5.1 was a no-op: the Phase 0.4 audit found nothing to remove.

[`test/no-phone-home.test.ts`](test/no-phone-home.test.ts) traps **every** outbound channel —
`fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `Image.src`, `navigator.sendBeacon` — and
drives a full session against `MemoryConnector`: init with identity + custom + inline checklist,
`setContext`, an element issue with a screenshot, a recording with two clips, three verdict
operations, a redelivery, and unmount.

```
✓ a full session with a memory connector makes zero network calls
✓ the guard actually catches a stray call (negative check)
✓ the only fetch a widget ever makes is the checklist URL the host configured
```

The negative check is the point: it runs the same flow, asserts zero, then deliberately calls all
four channels and asserts they are all reported. Without it, "zero calls" could equally mean "the
trap is broken". The third test proves the one permitted fetch goes to exactly the URL the host
passed in.

README line added, with both documented exceptions stated rather than hidden.

---

## Phase 6 — End-to-end on dirty data

[`test/e2e-production.test.ts`](test/e2e-production.test.ts) drives the production preset over a page
with PII in visible text, in an element id, in the query string, in console output, in an exception
message and stack, in a failed request path, and in an SPA navigation target — using the **real**
capture modules, not stubs. Artifacts are written to
[`evidence/production-e2e/`](evidence/production-e2e/).

### Grep output (run over the written artifacts, outside the test)

```
=== files ===
session-2026-07-31-qwey/session.yaml
session-2026-07-31-qwey/01-the-notify-button-does-nothing-on-the.png
session-2026-07-31-qwey/01-the-notify-button-does-nothing-on-the.md

=== grep for original PII values ===
anna.smirnova@acme-corp.io                         0 match(es)
+1 555 010 4477                                    0 match(es)
4111 1111 1111 1111                                0 match(es)
eyJhbGciOiJIUzI1NiJ9                               0 match(es)
sk-live-9f86d081884c7d659a2feaa0c55ad015           0 match(es)

=== scrub marks present ===
   2 [digits]
   7 [email]
   6 [token]
```

The test asserts the same thing programmatically, walking every file byte-wise (`the whole evidence
tree greps clean`), so the guarantee is enforced in CI and not just by a one-off shell command.

### What the artifact looks like afterwards

```
url: "/account/settings?email=[email]&[token]"
selector: "[data-testid=\"[email]\"]"
element_text: "Notify [email] at +[digits]"
dom_path: "main > button"
masked: true
scrubbed: true

## Errors
- [0s before report] console: Payment declined for card [digits]
- [0s before report] exception: Session refresh failed for [token]
- [0s before report] network: GET /api/session/[token]/refresh → 404 (5ms)

## Actions
- [0s before report] click [data-testid="[email]"] ("Notify [email] at +1 …")
- [0s before report] navigate / → /account/orders/[token]
```

Readability survived: `/api/session/`, `/refresh`, `/account/orders/`, `main > button` and the
stack-trace line numbers are all intact. Developer-supplied fields (`reporter`, `custom`, `context`)
and the reporter's comment are untouched, as designed.

### Visual verification

[`evidence/production-consent.png`](evidence/production-consent.png) — the issue panel under the
production preset: the "Attach screenshot" consent checkbox, checked by default, above Cancel / Send.

The dismiss ✕ was verified with a live browser screenshot and by DOM measurement (the table in
Phase 2), **not** committed as a PNG. Honest reason: the DOM-to-PNG renderer excludes the widget's own
UI by design, and forcing it to include itself renders the launcher in its collapsed default state
without the hover-revealed ✕ — a committed image would have been misleading. Reproduce it in one
step: open [`evidence/production-harness.html`](evidence/production-harness.html) and hover the
launcher.

---

## Limitations — what the scrub does **not** catch

An honest list. None of these are bugs; they are the boundary of a pattern-based redactor, and §7 of
the production checklist tells the client to go and look for them.

1. **Names.** "Anna Smirnova" is not a pattern. Nothing catches it.
2. **Postal addresses.** Street names, cities, postcodes under 6 digits — all pass through.
3. **Free-form prose containing personal facts.** A sentence about someone's health, employment or
   family survives intact.
4. **The reporter's own comment.** Never scrubbed, by design — it is the bug report. A customer who
   types their card number into the description box puts it in the artifact verbatim. The `.md`
   filename slug is derived from the comment and inherits the same exposure.
5. **Developer-supplied values.** `context`, `custom`, `identity` and checklist titles are never
   scrubbed. If you put a customer's email in `identity.email`, it is in every issue — deliberately.
6. **Short numbers.** Under 6 digits is left alone, so a 4-digit PIN, a house number or a 5-digit ZIP
   survives. Raising the threshold would start eating dates and counts.
7. **Parenthesised phone formats.** Separators are space and hyphen only, so `+1 (555) 123-4567`
   scrubs to `+1 (555) [digits]` — the area code leaks. `555-123-4567` and `+1 555 123 4567` are
   caught whole.
8. **Short tokens.** A secret under 24 characters, or one with no digit, or one whose longest
   `-`/`_`-delimited chunk is under 12 characters, is not recognised. Loosening any of those three
   conditions starts eating readable kebab-case paths.
9. **Standard base64 containing `/`.** `/` is excluded from the token alphabet so URL paths are
   examined segment by segment rather than swallowed whole. A padded base64 blob split by a `/` may
   therefore evade the 24-character minimum.
10. **Truncation happens before scrubbing.** The action trail cuts a click label to 40 characters
    first, so a long value can be left as a fragment that no longer matches any pattern — visible in
    the E2E artifact as `"Notify [email] at +1 …"`. The fragment is not PII, but it is not nothing.
11. **Screenshots.** The scrub is text-only. Pixels are handled by `maskInputs` / `maskSelectors` /
    `data-private`; anything outside those selectors renders as-is. OCR was explicitly out of scope.
12. **Adjacent characters absorbed into a mark.** `=` is part of the base64 alphabet, so
    `?token=<secret>` becomes `?[token]`, losing the parameter name. Safe, slightly lossy.

## Other limitations

- **`console.warn` in production.** Forced off. A caller who genuinely needs warnings must drop the
  preset and configure `errors` directly. This is the one place a preset overrules an explicit option.
- **Foreign wrappers.** If another library wraps `console.error` / `fetch` / `history` on top of
  sluglist, the breaker leaves the chain intact in passthrough mode rather than restoring. Those
  wrappers stay installed for the life of the page; they simply stop capturing.
- **Dismissal is per browser, per project.** It lives in `localStorage`, so it does not follow a user
  across devices, and clearing site data brings the widget back.
- **In-process endpoint state.** The example endpoint's rate-limit and session-count maps do not
  survive across serverless workers. Called out in both the example and the checklist.

---

## Verify

```bash
export PATH="$HOME/.nvm/versions/node/v20.19.2/bin:$PATH"   # repo needs Node 20+ (system default is 16)
npm run type-check     # clean
npm test               # 310 passed (24 files)
npm run build          # esm + cjs + iife + dts, clean

# the acceptance grep, run outside the test
grep -rlF 'anna.smirnova@acme-corp.io' evidence/production-e2e | wc -l   # → 0
```
