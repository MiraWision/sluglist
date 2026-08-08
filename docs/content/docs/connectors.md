A connector is the only place that knows about storage, auth and credentials. The widget core
produces artifacts and hands them over; delivery is fully yours.

```ts
interface ArtifactFile {
  path: string; // POSIX path inside the session folder, e.g. "01-broken-header.png"
  blob: Blob;
  mime: string; // "text/yaml" | "text/markdown" | "image/png"
}

interface FeedbackConnector {
  id: string; // used in logs and error reporting
  put(sessionId: string, file: ArtifactFile): Promise<void>;
}
```

Built in: `MemoryConnector` (accumulates in memory, for tests), `DownloadConnector` (zips a whole
session via JSZip) and `LocalConnector` (POSTs to the [`sluglist dev` sidecar](/docs/agents/)).
Real targets (blob storage, an API route, a tracker) are your own connector. `connectors` is an
array, so one issue can fan out to several destinations at once; a failing connector never blocks
the others or the UI, and delivery retries with backoff.

## The recommended shape: a thin API route

Because the browser should never hold storage credentials, the recommended shape is a **thin API
route** on your side that takes the artifact and writes it server-side. The connector just posts to
it.

**Client connector (generic API route):**

```ts
class ApiRouteConnector implements FeedbackConnector {
  id = "api-route";
  constructor(private endpoint: string, private token: string) {}
  async put(sessionId: string, file: ArtifactFile) {
    const base64 = btoa(
      String.fromCharCode(...new Uint8Array(await file.blob.arrayBuffer()))
    );
    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "x-feedback-token": this.token },
      body: JSON.stringify({ sessionId, path: file.path, mime: file.mime, base64 }),
    });
    if (!res.ok) throw new Error(`upload failed: ${res.status}`);
  }
}
```

## Server route — Vercel Blob

`POST /api/feedback`:

```ts
import { put } from "@vercel/blob";

export async function POST(req: Request) {
  if (req.headers.get("x-feedback-token") !== process.env.FEEDBACK_TOKEN)
    return new Response("Unauthorized", { status: 401 });
  const { sessionId, path, mime, base64 } = await req.json();
  const bytes = Buffer.from(base64, "base64");
  const { url } = await put(`feedback/${sessionId}/${path}`, bytes, {
    access: "public",
    contentType: mime,
    addRandomSuffix: false,
  });
  return Response.json({ ok: true, url });
}
```

## Server route — S3 / R2

Same client connector:

```ts
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
const s3 = new S3Client({ region: process.env.AWS_REGION });

export async function POST(req: Request) {
  const { sessionId, path, mime, base64 } = await req.json();
  await s3.send(new PutObjectCommand({
    Bucket: process.env.FEEDBACK_BUCKET,
    Key: `feedback/${sessionId}/${path}`,
    Body: Buffer.from(base64, "base64"),
    ContentType: mime,
  }));
  return Response.json({ ok: true });
}
```

## Supabase Storage

Client-direct, with an insert-only RLS policy on the bucket:

```ts
import { createClient } from "@supabase/supabase-js";

class SupabaseConnector implements FeedbackConnector {
  id = "supabase";
  private sb = createClient(URL, ANON_KEY);
  async put(sessionId: string, file: ArtifactFile) {
    const { error } = await this.sb.storage
      .from("feedback")
      .upload(`${sessionId}/${file.path}`, file.blob, {
        contentType: file.mime,
        upsert: true, // session.yaml is re-written each issue
      });
    if (error) throw error;
  }
}
```

## Piping into a tracker

The artifacts are [a stable, documented format](/docs/artifacts/) — one markdown file per issue
with YAML frontmatter. A connector (or a small job behind your endpoint) can turn each issue into a
GitHub issue, a Linear ticket, or a Slack message: parse the frontmatter, attach the screenshot,
link the session folder. Delivery stays a detail of *your* connector; the widget never learns where
feedback ends up.

## Delivery guarantees

- **Fan-out:** every configured connector receives every file; one failing connector never blocks
  the others.
- **Retries:** failed deliveries retry with backoff, off the UI thread.
- **Offline outbox:** undelivered issues are persisted to IndexedDB and retried on the next page
  load — a closed tab does not lose feedback. Disable with `offlineQueue: false`.
- **No phone-home:** the widget makes no network requests except to your configured connectors —
  enforced by an automated test that drives a full session with every outbound channel trapped.
