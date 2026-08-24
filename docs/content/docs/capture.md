## Capture modes

- **fullpage** — the whole scrollable document
- **area** — drag a rectangle and crop to it
- **element** — hover to highlight, click to capture a single element (records its CSS selector)
- **comment only** — no screenshot

The menu lists them in that order (plus **Record steps**), most-used first, with `1`–`5` hotkeys
following the position.

Each screenshot can be annotated before sending (arrow, box, text; color; undo), with keyboard
shortcuts (A / B / T, Ctrl/Cmd+Z, Esc, click backdrop to close), and an issue can carry multiple
screenshots.

**When a screenshot fails, the issue still goes.** A render can die on the browser's terms — a
webfont that never resolves, a canvas the browser refuses to encode, a render that hangs. Any of
those (plus a render that comes back blank, and anything slower than 8s) is caught: the reporter
sees a quiet *"Screenshot failed — sending without it"*, keeps everything they typed, and the issue
is delivered comment-only carrying `screenshot_failed: true` and `screenshot_error: "<why>"` in its
frontmatter. In record mode a failed frame is skipped and the recording continues, with the gap
marked in `## Actions`. Nothing about a report is ever lost to a picture that would not render.

```ts
createFeedbackWidget({
  connectors: [/* … */],
  capture: { timeoutMs: 8000, detectBlank: true },  // defaults; both optional
});
```

Raise `timeoutMs` if you capture very long pages at high DPR.

## Action trail & record mode

Some bugs need a sequence, not a single screenshot. sluglist has two layers for that.

**Action trail** (always on) keeps a small ring buffer of recent actions — clicks, SPA navigations,
submits, typing — and attaches them to every issue as a `## Actions` section (plus `actions_count`):

```markdown
## Actions
- [45s before report] navigate /animals → /animals/128
- [12s before report] click button[aria-label="Save"] ("Save")
- [11s before report] type (12 chars) input#email
- [10s before report] submit form[data-testid="animal-form"]
```

**PII rule (independent of any privacy setting):** the trail records the *fact and place* of an
action, never the entered content. `type` logs only a character count; password fields aren't
logged at all by default; navigation paths drop the query string.

**Record mode** turns a sequence into steps-to-reproduce *with images*. Click **Record steps**, do
the thing, then **Stop & describe**. A frame is captured at the start and on each click /
navigation / submit (not typing). Each Record→Stop cycle is one **clip**: its frames go to
`NN-slug-frames/clip-01/01.png …`, and the matching `## Actions` lines are tagged
`— clip N, frame NN`. Frames respect PII masking. Need a state the auto-capture misses (a hover
popover, a transient toast)? Hit **`+ Frame`** in the recording bar — or press **S** — to snap one
manually.

Recordings and screenshots mix in one issue: start a recording from an open draft (via
`+ Add screenshot` → `Record steps`) and it attaches as a **new clip** instead of replacing
anything. Record twice and you get two independent clips — `clip-01/`, `clip-02/` — never one
merged reel.

```ts
createFeedbackWidget({
  project: "my-app",
  connectors: [/* ... */],
  actions: { capture: true, bufferSize: 30, capturePasswords: false }, // defaults
  recording: { enabled: true, maxFrames: 30, frameMinInterval: 650 },  // defaults
});
```

Deliberately **not** built: session replay (rrweb), real video (`getDisplayMedia` /
`MediaRecorder`), or network capture. The output is artifacts for an agent to read, not a replay a
human scrubs.

## Error capture

From the moment the widget initializes, sluglist keeps a small ring buffer of recent page errors
from four sources — `console.error`, uncaught `error` events, `unhandledrejection`, and **failed
network calls** — and attaches a snapshot to each issue as a `## Errors` section (with a relative
timestamp per entry) plus an `errors_count` field in the frontmatter. The original `console.error`
still runs, so nothing is swallowed.

Network capture wraps `fetch` and `XMLHttpRequest` and records **only** requests that finish with a
status ≥ 400 or a network error — method, path (no query), status and duration, never bodies,
headers or query strings:

```
## Errors
- [4s before report] network: POST /api/animals → 500 (240ms)
```

```ts
createFeedbackWidget({
  project: "my-app",
  connectors: [/* ... */],
  errors: {
    capture: true,          // default; set false to disable entirely
    bufferSize: 20,         // default
    captureWarnings: false, // default; true also captures console.warn
    captureNetwork: true,   // default; wrap fetch/XHR for failed-request facts
  },
});
```

> [!WARNING]
> Error messages and stack traces can contain user data — in beta mode they may include PII.
> Production stack traces are usually minified. Treat captured errors as diagnostic hints, not
> ground truth; sluglist stores them verbatim and does not resolve source maps.

## Reporter form fields

Ask the reporter what only they can tell you. Optional — with no `form` the panel is exactly what
it was.

```ts
createFeedbackWidget({
  connectors: [/* … */],
  form: [
    // Asked once, on the first issue of the session → session.yaml
    { id: "email", label: "Your email", type: "email", scope: "session" },
    { id: "environment", label: "Device / browser", type: "text", scope: "session" },
    // Asked on every issue → that issue's frontmatter
    { id: "severity", label: "How bad is it?", type: "select",
      options: ["blocking", "annoying", "cosmetic"], required: true, scope: "issue" },
  ],
});
```

`type` is `text | email | select | checkbox`. `required` blocks sending and highlights the row;
`email` is pattern-checked; values are capped at 500 characters; at most 8 fields (invalid ones are
dropped with a warning, never breaking the widget).

**Form values are never scrubbed**, even under the production preset. A reporter who types their
address into a field labelled *Your email* is telling it to you on purpose; redacting it would make
the field pointless. The scrub stays where it belongs — on text lifted off the page.

## Attachments

Let the reporter attach their own files: the screenshot they took on their phone, a console export,
the spreadsheet that is wrong. Three ways in, all going to the same place:

1. **+ Attach file** next to *+ Add screenshot*.
2. **Drag & drop** onto the open panel.
3. **Paste** (Cmd/Ctrl+V) — the one that matters most in practice, because a client's evidence
   usually arrives in their clipboard from a phone or an email.

Attached **images join the thumbnail row and annotate like any capture** — you can put arrows on
their screenshot. Everything else becomes a tile with its type, name and size, removable with the ✕.

```ts
createFeedbackWidget({
  connectors: [/* … */],
  attachments: {
    enabled: true,            // default true — but FALSE under preset: "production"
    maxFileSize: 10 * 1024 * 1024,
    maxFiles: 5,
    accept: [".log", "image/*"],   // optional: replaces the built-in whitelist
  },
});
```

Accepted by default: images (png, jpeg, webp, gif, heic), video (mp4, webm, mov), pdf, text (txt,
csv, json, md) and office (xlsx, docx). Checked on **both** the extension and the reported mime, so
a renamed binary is refused. **Executables and archives are never accepted** — not even through
`accept`. Over the size or count limit, the reporter gets a message naming the file and the actual
limit; nothing is compressed or transcoded on the client.

Files land next to the issue and are listed in its frontmatter. The reporter's own file name is
never used as a path — it is kept as data:

```yaml
attachments:
  - file: 03-checkout-att-01.png
    mime: image/png
    size: 482112
    original_name: "IMG_4021.png"
```

> [!IMPORTANT]
> **Attachments default to OFF under `preset: "production"`.** Accepting uploads from anonymous
> users is a decision, not a default. Turn it on when you have decided your endpoint can take it —
> and validate server-side regardless (see [Production](/docs/production/)).

## Mobile graceful mode

On a coarse pointer (detected from the pointer, not the user agent — a touch laptop keeps the full
desktop UI) sluglist **subtracts** rather than reimplements:

- The menu offers **full page** and **comment only**. Area mode needs a drag the browser spends on
  scrolling, and element mode is built on hover; both are hidden rather than offered and then
  failing.
- **Record mode is hidden.** Frames captured mid-scroll are unreadable; deferred rather than
  shipped bad.
- Panels go full-width, controls reach 44px, the textarea scrolls itself clear of the keyboard,
  inputs use 16px so iOS does not zoom in and strand the reporter, and the launcher clears the home
  indicator (`safe-area-inset-bottom`).
- Keyboard hints (the shortcut chips) are not shown to a device with no keyboard.

The checklist panel is fully usable on a phone; the per-item report button is always visible there
instead of hover-revealed.

## Known limits

Measured in Chromium 151, Firefox 153 and WebKit 26.5 (the Safari engine) against a page built out
of known DOM-to-canvas failure modes.

**Renders correctly in all three engines:** webfonts, emoji, CSS `filter`, gradients,
`position: fixed`, long full-page captures, cross-origin images served with CORS headers, and the
annotation round-trip.

**Known limits — not fixable from here:**

- **`backdrop-filter` is not rendered** in any engine. The blur is dropped and the element paints
  as if it had none.
- **Cross-origin images served without `access-control-allow-origin` come out blank.** The rest of
  the page still captures.
- **WebGL, `<canvas>` and video content** do not render.
- Elements parked by scroll-reveal animations are temporarily revealed during capture and restored.
