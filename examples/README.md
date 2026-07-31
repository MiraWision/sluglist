# sluglist examples

Copy-and-adapt reference code. These are **not** part of the published package (the `files` field
ships only `dist`); they show how to deliver feedback safely in production.

- **`HttpConnector.ts`** — a client `FeedbackConnector` that POSTs each artifact as JSON to your own
  endpoint. The browser never holds storage credentials.
- **`feedback-route.ts`** — a Next.js App Router route handler (`app/api/feedback/route.ts`) that
  authenticates, validates and size-limits the payload, rate-limits per IP, and writes to your
  storage server-side.

## The one rule

**Never put storage write-keys in the browser or a client connector.** A `FeedbackConnector` runs on
the user's page; anything it holds is public. Keep credentials server-side, behind an endpoint like
`feedback-route.ts`, and let the endpoint do the write. Rate-limiting and auth are the endpoint's
job — sluglist core does neither by design.

## What the endpoint rejects

`feedback-route.ts` is written to fail closed. Its behaviour is pinned by
[`test/feedback-route.test.ts`](../test/feedback-route.test.ts):

| Status | When |
| --- | --- |
| `401` | missing or wrong bearer token (compared in constant time) |
| `503` | `SLUGLIST_FEEDBACK_TOKEN` not set on the server — a misconfigured endpoint is never an open one |
| `413` | body over the size limit (default 10 MB decoded; recording frames are the big ones) |
| `415` | any mime type other than `text/yaml`, `text/markdown`, `image/png` |
| `429` | past the per-IP sliding-window rate limit |
| `409` | more than 200 artifacts for a single session id |
| `400` | malformed JSON, missing fields, or a path with traversal / too much nesting |

Generate the token with `openssl rand -base64 32` and keep it server-side — never behind a
`NEXT_PUBLIC_` or `VITE_` prefix. The in-process rate-limit and session-count maps are fine for a
single instance; on serverless, back them with Upstash, Redis or `@vercel/firewall`.

Full deployment walkthrough: [`docs/production-checklist.md`](../docs/production-checklist.md).

Wire them together:

```ts
import { createFeedbackWidget, mountFeedbackWidget } from "sluglist";
import { HttpConnector } from "./HttpConnector";

const widget = createFeedbackWidget({
  project: "acme",
  preset: "production",
  connectors: [new HttpConnector("/api/feedback", () => currentUser.token)],
});
const ui = mountFeedbackWidget(widget);

// The rescue path for anyone who clicked the ✕.
footerReportLink.addEventListener("click", () => ui.show());
```
