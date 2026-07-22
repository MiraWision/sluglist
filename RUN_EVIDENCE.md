# RUN_EVIDENCE — snaglist (rename + beta feedback mode)

External, verifiable artifacts for each phase. Self-report without artifacts = task not done.

---

## Phase 0 — Pre-flight audit

Date: 2026-07-22. Repo: `~/Documents/dev/libs/sluglist` (to be renamed).

### 0.1 npm state

```
$ curl -s -o /dev/null -w "%{http_code}" https://registry.npmjs.org/snaglist
404                     # snaglist is FREE → no STOP
$ npm view sluglist version
1.1.1                   # current published name/version
```

### 0.2 Occurrences of `sluglist` (grep -ri, excluding node_modules/dist/.git)

| File | count | kind |
|---|---|---|
| `package.json` | 7 | name, keywords, unpkg/jsdelivr, homepage, repo url |
| `README.md` | 7 | title, demo link, install, `<script>` unpkg, `Sluglist` global, import |
| `tsup.config.ts` | 3 | IIFE entry key + `globalName: "Sluglist"` + output filename |
| `docs/src/App.tsx` | 5 | landing copy, links |
| `docs/src/components/Demo.tsx` | 3 | demo import + copy |
| `docs/vite.config.ts` | 3 | `base: "/sluglist/"`, alias |
| `docs/index.html` | 1 | `<title>` |
| `docs/package.json` | 2 | name, gh-pages deploy |
| `package-lock.json` | 2 | own name (regenerate after rename) |
| `docs/package-lock.json` | 2 | own name (regenerate after rename) |

Not present in `CHANGELOG.md` (uses generic wording) or `.github/workflows/ci.yml` (generic `npm` commands, no package name). Other external pointers:

- git remote: `git@github.com:MiraWision/sluglist.git` (repo rename → redirects; **GitHub Pages does not redirect** → new URL `mirawision.github.io/snaglist`).
- IIFE global object name: `Sluglist` → `Snaglist`.

### 0.3 Config structure (`src/types.ts` → `FeedbackWidgetConfig`)

Current fields: `connectors`, `enabled?`, `offlineQueue?`, `project`. New optional fields land here additively:
`identity?`, `custom?` (Phase 2), `privacy?` (Phase 3), `preset?` (Phase 4). Artifact builder
(`src/artifacts.ts`) already appends fields only-when-present via `yamlLine`/`yamlMap`, so `reporter`,
`custom`, `masked` are additive. Identity is fixed at init → `reporter` belongs in `session.yaml`
(session-level) and mirrors into each `NN-issue.md` frontmatter.

### 0.4 Screenshot pipeline & masking mechanics (**decision required — see below**)

Render path: `src/screenshot.ts` calls `html-to-image` (`toCanvas`/`toBlob`) on `document.documentElement`
(full document) then crops. Findings about the clone step:

- html-to-image **does** clone internally (`cloneNode`), BUT:
  - it exposes **no `onclone`/clone hook** (`grep onclone` in dist → 0 hits; Options type has only
    `filter`, `style`, `backgroundColor`, `pixelRatio`, …).
  - its clone **reads from the live original**: `getComputedStyle(nativeNode)` for styles and
    `cloneInputValue(nativeNode, clonedNode)` for form values (`clonedNode.setAttribute('value', nativeNode.value)`,
    textarea `innerHTML = nativeNode.value`, select marks the chosen option).
  - a **detached** clone we build ourselves has no computed styles, so we cannot hand html-to-image a
    pre-masked clone.
- The codebase **already** uses transient live-DOM mutate-and-restore during capture:
  `revealAnimationHiddenElements()` in `screenshot.ts` temporarily sets `opacity/filter/transform` on live
  nodes for the render and restores exact inline values in a `finally`.

**Conclusion:** masking cannot be applied to html-to-image's internal clone. Per the task STOP condition,
options for masking without a persistent live-DOM change (all satisfy the acceptance test
`innerHTML before == after`):

- **Option A — transient value masking + guaranteed restore (recommended).** Before render, replace PII
  element content/values with a placeholder (█ sized to text, or a fill block) on the live node; capture;
  restore exact prior state in `finally`. Same proven mechanism as `revealAnimationHiddenElements`. Smallest,
  highest-fidelity. Tradeoff: the live DOM is briefly mutated during the sub-second capture (a page
  `MutationObserver` could observe it); crash-safe via `finally`.
- **Option B — overlay boxes.** Append one fixed-position container of opaque boxes positioned over each PII
  element's rect (rendered on top by html-to-image), capture, remove the container. PII nodes themselves are
  never touched; only a sibling container is added then removed. Tradeoff: box placement must track rects
  exactly; scroll/transforms edge cases.
- **Option C — full manual clone + offscreen render.** Deep-clone the subtree into an isolated container,
  copy computed styles, mask on the clone, render that. Reimplements html-to-image's clone; high effort and
  fidelity risk. Not recommended.

> **STOP (Phase 3):** awaiting the masking-approach decision before implementing PII masking.
> Phases 1 (rename) and 2 (identity/custom) are independent and proceed.

---
<!-- Phase 1+ evidence appended below as work lands. -->
