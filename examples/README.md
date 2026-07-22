# snaglist examples

Copy-and-adapt reference code. These are **not** part of the published package (the `files` field
ships only `dist`); they show how to deliver feedback safely in production.

- **`HttpConnector.ts`** — a client `FeedbackConnector` that POSTs each artifact as JSON to your own
  endpoint. The browser never holds storage credentials.
- **`feedback-route.ts`** — a ~50-line Next.js App Router route handler (`app/api/feedback/route.ts`)
  that validates the payload, rate-limits per IP, and writes to your storage server-side.

## The one rule

**Never put storage write-keys in the browser or a client connector.** A `FeedbackConnector` runs on
the user's page; anything it holds is public. Keep credentials server-side, behind an endpoint like
`feedback-route.ts`, and let the endpoint do the write. Rate-limiting and auth are the endpoint's
job — snaglist core does neither by design.

Wire them together:

```ts
import { createFeedbackWidget, mountFeedbackWidget } from "snaglist";
import { HttpConnector } from "./HttpConnector";

const widget = createFeedbackWidget({
  project: "acme",
  preset: "beta",
  connectors: [new HttpConnector("/api/feedback", () => currentUser.token)],
});
mountFeedbackWidget(widget);
```
