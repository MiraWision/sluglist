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

> [!CAUTION]
> Never ship storage write-keys to the browser. A connector that holds a bucket credential puts it in
> your bundle for anyone to read — put a thin endpoint of your own in front and keep the key
> server-side.

## The connector that ships

```ts
import { HttpConnector } from "sluglist";

createFeedbackWidget({
  connectors: [new HttpConnector("/api/feedback", () => session.token)],
});
```

It posts one JSON body per artifact — `{ format, sessionId, path, mime, base64 }` — reads the token
at delivery time (so a refreshed one is picked up), and treats a 4xx as **permanent**: no retries, no
retry button, and the widget says *rejected* rather than *failed*. `408` and `429` stay retryable,
because those are timing rather than shape.

## Validate with the library's own rules

The artifact layout is a contract between the widget and your route, so import it instead of
re-deriving it. `sluglist/contract` is a DOM-free subpath meant for a route handler:

```ts
import { validateArtifactUpload, base64ByteLength } from "sluglist/contract";

const rejection = validateArtifactUpload(
  { sessionId, path, mime, byteLength: base64ByteLength(base64) },
  { maxBytes: 4 * 1024 * 1024 }
);
if (rejection) {
  return new Response(rejection.reason, { status: rejection.status });
}
```

The same module backs `LocalConnector`, the `sluglist dev` sidecar and the endpoint example, so they
cannot drift apart. It also exports `isArtifactPath`, `classifyArtifactPath`, `ARTIFACT_MIME_TYPES`,
`ATTACHMENT_MIME_TYPES`, `DELIVERY_MIME_TYPES` and `FORMAT_VERSION`.

> [!WARNING]
> Most artifacts are a single filename, but a record-mode frame nests two levels:
> `03-checkout-bug-frames/clip-01/02.png`. A hand-written validator that allows no slash rejects
> every recording, and the reporter sees only *upload failed*. That is the single most common
> integration bug, and the reason this module exists.

> [!CAUTION]
> **A serverless body limit is smaller than the default file size.** `DEFAULT_MAX_FILE_SIZE` is
> 10 MB and base64 adds a third, so a 10 MB attachment is ~13.3 MB of JSON — while a Vercel function
> rejects bodies over ~4.5 MB before your code runs. `HttpConnector` refuses to send past
> `maxBodyBytes` (4 MB default) with a message naming the file; for larger attachments upload
> straight to storage with a signed URL, or lower `attachments.maxFileSize`.

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
