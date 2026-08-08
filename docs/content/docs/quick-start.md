sluglist is a framework-agnostic, dependency-light widget that lets people leave visual feedback
directly on a running web app: pick an element, grab an area or the full page, annotate the
screenshot, add a comment — and the widget produces a standard set of artifacts and hands them to
pluggable **connectors**. The core knows nothing about where feedback is stored; delivery is fully
encapsulated in the connector you provide.

## Install

```bash
npm install sluglist
```

## One line of config

A connector, and nothing else:

```ts
import { createFeedbackWidget, mountFeedbackWidget, DownloadConnector } from "sluglist";

mountFeedbackWidget(createFeedbackWidget({ connectors: [new DownloadConnector()] }));
```

That is a complete, working widget: launcher, capture modes, annotation, error and action capture,
the offline outbox, a project slug derived from your hostname. Everything else — presets, privacy,
identity, form fields, attachments, checklists, localization — is optional. Add a piece when you
need it; none of them is a setup step.

## Without a build step

Load it from a CDN (deps inlined, exposed as `Sluglist`):

```html
<script src="https://unpkg.com/sluglist"></script>
<script>
  const { createFeedbackWidget, mountFeedbackWidget, DownloadConnector } = Sluglist;
  mountFeedbackWidget(createFeedbackWidget({ connectors: [new DownloadConnector()] }));
</script>
```

Ships as ESM and CJS; `html-to-image` is loaded lazily on the first capture, so it is not part of
your initial bundle. Undelivered issues are persisted to IndexedDB and retried on the next load, so
a failed upload or a closed tab does not lose feedback.

## Three ways sluglist is used

### 1 · Dev loop — you and an agent

Click feedback on your own app, have it land in a folder, let Claude Code fix it.

```ts
import { createFeedbackWidget, mountFeedbackWidget, LocalConnector } from "sluglist";

mountFeedbackWidget(createFeedbackWidget({ connectors: [new LocalConnector()] }));
```

```bash
npx sluglist dev        # sidecar that writes to ./.sluglist
```

See [Agents & CLI](/docs/agents/) for the full loop.

### 2 · Client acceptance — someone signs off a release

Put the build on staging with a **checklist** of what shipped. The client walks it, checks items off
and flags problems; you get a coverage map instead of a chat thread.

```ts
mountFeedbackWidget(
  createFeedbackWidget({
    project: "acme",
    connectors: [new HttpConnector("/api/feedback", () => token)],
    checklist: "/checklist.json",   // or an inline object
  })
);
```

See [Checklist mode](/docs/checklist/).

### 3 · Beta / Production — real users report problems

A "Report a problem" button for people who are not your team: PII masked and scrubbed, a way to
make the widget go away, and delivery through an endpoint you own.

```ts
mountFeedbackWidget(
  createFeedbackWidget({
    project: "acme",
    preset: "production",
    connectors: [new HttpConnector("/api/feedback", () => session.token)],
    identity: { userId: user.id, email: user.email },
  })
);
```

See [Production & privacy](/docs/production/).

## Attach your user

Three ways to know who reported something, and they are not interchangeable — the difference is
*where the value comes from*.

| | Source | When it is captured | Lands in |
| --- | --- | --- | --- |
| `identity` | your app already knows it | fixed at init | `reporter` in session.yaml + every issue |
| `setContext` | live host state (tenant, flags, build) | at capture time | `context` per issue |
| `form` | only the reporter can answer it | typed by them | `form` in session.yaml or per issue |

```ts
const widget = createFeedbackWidget({
  project: "acme",
  connectors: [/* … */],

  // 1. What you know: static, set once.
  identity: { userId: user.id, email: user.email, name: user.name },

  // 3. What only they know: asked in the panel.
  form: [
    { id: "email", label: "Your email", type: "email", scope: "session" },
    { id: "severity", label: "How bad is it?", type: "select",
      options: ["blocking", "annoying", "cosmetic"], required: true, scope: "issue" },
  ],
});

// 2. What changes while they use the app.
widget.setContext({ tenantId: "acme", featureFlags: "new-nav", buildVersion: APP_VERSION });
```

Reach for `identity` when you have the user object, `setContext` when the answer depends on where
they are in the app, and `form` when nobody but the person reporting can tell you.

## Next steps

- [Capture modes, annotation & attachments](/docs/capture/)
- [Connectors: deliver feedback anywhere](/docs/connectors/)
- [Checklist mode](/docs/checklist/)
- [Production & privacy](/docs/production/)
- [Agents & CLI](/docs/agents/)
- [Artifact format](/docs/artifacts/)
