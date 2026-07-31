# Production checklist

You are about to show sluglist to real customers rather than to your own QA. This page is the
short list of decisions that are **yours, not the library's** — sluglist deliberately has no
opinion about where your data lives, how long you keep it, or what your privacy policy says.

Work through it once before you ship, and keep it with your deployment docs.

---

## 1. Turn on the production preset

```ts
import { createFeedbackWidget, mountFeedbackWidget } from "sluglist";
import { HttpConnector } from "./HttpConnector";

const widget = createFeedbackWidget({
  project: "acme",
  preset: "production",
  connectors: [new HttpConnector("/api/feedback", () => session.feedbackToken)],
});
const ui = mountFeedbackWidget(widget);
```

`preset: "production"` turns on, all at once:

| Setting | Effect |
| --- | --- |
| `privacy.maskInputs` | every `input` / `textarea` / `select` is redacted before a screenshot renders |
| `privacy.screenshotConsent` | an "Attach screenshot" checkbox appears in the report form |
| `privacy.scrubText` | emails, long digit runs and hex/base64 tokens are stripped from the text surfaces of every artifact |
| `errors.captureWarnings: false` | `console.warn` is never recorded (forced — see below) |
| `dismiss.enabled` | the reporter gets a ✕ to hide the widget |

Any option you pass explicitly wins over the preset — **except** `errors.captureWarnings`, which
production forces to `false`. `console.warn` is the noisiest text channel in a real app
(deprecation notices that quote props, validation warnings that quote user input) and a widget
facing real customers should not be collecting it. Asking for it anyway logs a warning; if you
genuinely need it, drop the preset and set the options individually.

## 2. Gate the widget on your environment

The widget ships in your bundle. Decide at build time whether it is even constructed:

```ts
if (process.env.NEXT_PUBLIC_FEEDBACK === "on") {
  mountFeedbackWidget(createFeedbackWidget({ /* … */ }));
}
```

`enabled: false` also works at runtime, but environment gating is stronger: it keeps the code out
of the paths you never intend to run it on.

## 3. Generate and store the delivery token

The example endpoint (`examples/feedback-route.ts`) rejects any request without a matching bearer
token, and refuses to start (503) if the server has no token configured.

```bash
# generate
openssl rand -base64 32

# store — server side only, never NEXT_PUBLIC_/VITE_ prefixed
SLUGLIST_FEEDBACK_TOKEN=<the value>
```

The client-side token your `HttpConnector` sends is **not** this value. It is whatever your app
already uses to prove a session (a signed session token, a short-lived per-user token your backend
mints). Your route should validate the caller the way it validates any other authenticated request;
the bearer token above is the belt-and-braces check for a route that would otherwise be an open
write to your storage.

Rotate it like any other secret. Nothing in an artifact depends on it.

## 4. Decide retention

**This is your decision and sluglist will not make it for you.** The library writes artifacts and
forgets them; nothing expires on its own.

Pick a number of days, write it down, and implement it where your artifacts live:

- **S3 / R2** — a lifecycle rule on the `feedback/` prefix
- **Vercel Blob** — a scheduled job that lists and deletes by age
- **Supabase Storage** — a cron function over the bucket

Ninety days is a common starting point for support material. Whatever you choose, say it in your
privacy policy (§6) and make sure someone owns the job that enforces it.

## 5. Lock down storage access

Artifacts contain screenshots of your customers' screens. Treat the bucket accordingly:

- **Not public.** If your storage defaults to public read (Vercel Blob's `access: "public"` does),
  put the artifacts behind an authenticated route of your own instead.
- **Least privilege.** The endpoint's credential needs `PutObject` on one prefix. Not list, not
  delete, not the whole bucket.
- **Named readers.** Decide who on your team can open a report, and use your existing access
  control to enforce it. "Whoever has the URL" is not an answer.
- **Log reads** if your storage can, so you can answer "who looked at this" later.

## 6. Add a line to your privacy policy

sluglist cannot write your privacy policy, and a consent banner is your call, not the widget's.
Here is a starting sentence to adapt with your counsel:

> This site includes an embedded feedback tool. When you choose to send a report, it may include a
> screenshot of the page you are on, the text of any errors your browser recorded, a short trail of
> the actions you took immediately beforehand, and technical metadata (browser, operating system,
> screen size, time zone, language). Reports are delivered to storage we control and are retained
> for _N_ days. We do not send them to any third party.

Two things to keep accurate if you edit it:

- **"storage we control"** is only true if you followed §5. If you point a connector at someone
  else's service, say so.
- **"_N_ days"** must match what you actually implemented in §4.

## 7. Check what is still visible

Masking and scrubbing are mitigations, not guarantees. Before you ship, open your own app with the
production preset and file one test report against your most sensitive screen. Then read the
artifact.

- Anything sensitive that is **not** an `input` / `textarea` / `select` is not masked by default.
  Add it: `privacy: { maskSelectors: [".customer-name", ".invoice-total"] }`, or mark the element
  `data-private` in your markup, which is always masked regardless of settings.
- The text scrub catches emails, 6+ digit runs and hex/base64 tokens. It does **not** catch names,
  postal addresses, dates of birth or free-form prose. The full list of what it misses is in
  `RUN_EVIDENCE.md`.
- The reporter's own comment is never scrubbed — it is the bug report. If a customer types their
  card number into it, it lands in the artifact verbatim.

## 8. Give people a way back

The ✕ hides the widget for `dismiss.days` (default 7). Some customers will click it and then need
to report something. Wire the rescue path:

```ts
const ui = mountFeedbackWidget(widget);

document
  .querySelector("#footer-report-a-problem")
  ?.addEventListener("click", () => ui.show());
```

`ui.show()` clears the dismissal and brings the launcher straight back. A "Report a problem" link
in your footer costs nothing and means the ✕ is never a one-way door.

## 9. Keep the consent checkbox

The production preset shows an "Attach screenshot" checkbox, checked by default. Unchecking it
sends the report with no screenshot at all — text only. Leave it on. It is the cheapest honest
signal you can give someone that a picture of their screen is about to be uploaded, and the
opt-out costs you a screenshot on the reports where the customer had a reason to withhold it.

---

## Pre-flight

- [ ] `preset: "production"` is set
- [ ] Widget construction is gated on an environment variable
- [ ] `SLUGLIST_FEEDBACK_TOKEN` generated and stored server-side only
- [ ] Endpoint deployed with auth, size, mime and rate limits (start from `examples/feedback-route.ts`)
- [ ] Retention period chosen, written down, and enforced by a real job
- [ ] Artifact storage is not publicly readable; write credential is least-privilege
- [ ] Privacy policy updated with the retention number you actually implemented
- [ ] One test report filed against your most sensitive screen, and the artifact read end to end
- [ ] Sensitive non-input elements marked `data-private` or listed in `maskSelectors`
- [ ] A "Report a problem" link in the footer calls `ui.show()`
