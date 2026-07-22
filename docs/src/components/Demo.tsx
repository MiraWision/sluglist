import { useEffect, useMemo, useState } from "react";
import {
  type ArtifactFile,
  createFeedbackWidget,
  type FeedbackConnector,
  mountFeedbackWidget,
} from "snaglist";

interface DemoArtifact {
  path: string;
  mime: string;
  text?: string;
  url?: string;
}

/**
 * A connector that surfaces produced artifacts to the page so visitors can see
 * exactly what snaglist generates when they capture feedback on this site.
 */
function createDemoConnector(
  onFiles: (files: DemoArtifact[]) => void
): FeedbackConnector {
  const bySession = new Map<string, Map<string, DemoArtifact>>();
  return {
    id: "demo",
    async put(sessionId: string, file: ArtifactFile) {
      let files = bySession.get(sessionId);
      if (!files) {
        files = new Map();
        bySession.set(sessionId, files);
      }
      const artifact: DemoArtifact =
        file.mime === "image/png"
          ? { path: file.path, mime: file.mime, url: URL.createObjectURL(file.blob) }
          : { path: file.path, mime: file.mime, text: await file.blob.text() };
      files.set(file.path, artifact);
      onFiles([...files.values()].sort((a, b) => a.path.localeCompare(b.path)));
    },
  };
}

export function Demo() {
  const [artifacts, setArtifacts] = useState<DemoArtifact[]>([]);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const connector = createDemoConnector((files) => {
      setArtifacts(files);
      const yaml = files.find((f) => f.path.endsWith(".yaml"));
      setActive((prev) => prev ?? yaml?.path ?? files[0]?.path ?? null);
    });
    const widget = createFeedbackWidget({
      project: "snaglist-demo",
      connectors: [connector],
      offlineQueue: false,
    });
    const ui = mountFeedbackWidget(widget, {
      hotkey: "alt+shift+f",
      categories: [
        { key: "bug", label: "Bug" },
        { key: "design", label: "Design" },
        { key: "idea", label: "Idea" },
      ],
    });
    return () => ui.unmount();
  }, []);

  const activeArtifact = useMemo(
    () => artifacts.find((a) => a.path === active) ?? null,
    [artifacts, active]
  );

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <ol className="space-y-3 text-[15px] text-[var(--color-ink-2)]">
          {[
            "Click the Feedback button (bottom-right) — or press ⌥⇧F.",
            "Pick a mode: an element, an area, or the full page.",
            "Annotate the screenshot: arrow, box, or text.",
            "Add a comment and send. The artifacts appear here →",
          ].map((step, i) => (
            <li className="flex gap-3" key={step}>
              <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full border border-[var(--color-line)] font-mono text-[12px] text-[var(--color-muted)]">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-[13px] text-[var(--color-muted)]">
          This is the real widget, running on this page with an in-memory
          connector. Nothing leaves your browser.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]">
        {artifacts.length === 0 ? (
          <div className="flex h-full min-h-[260px] items-center justify-center p-8 text-center text-[14px] text-[var(--color-muted)]">
            Your captured artifacts will show up here.
          </div>
        ) : (
          <div>
            <div className="flex flex-wrap gap-1 border-[var(--color-line)] border-b p-2">
              {artifacts.map((a) => (
                <button
                  className={`rounded-md px-2.5 py-1 font-mono text-[11px] transition ${
                    a.path === active
                      ? "bg-[var(--color-accent)] text-[var(--color-canvas)]"
                      : "text-[var(--color-muted)] hover:text-[var(--color-ink)]"
                  }`}
                  key={a.path}
                  onClick={() => setActive(a.path)}
                  type="button"
                >
                  {a.path}
                </button>
              ))}
            </div>
            <div className="max-h-[340px] overflow-auto p-4">
              {activeArtifact?.url ? (
                <img
                  alt={activeArtifact.path}
                  className="w-full rounded-lg border border-[var(--color-line)]"
                  src={activeArtifact.url}
                />
              ) : (
                <pre className="overflow-x-auto text-[12px] leading-relaxed">
                  <code className="font-mono text-[var(--color-ink-2)]">
                    {activeArtifact?.text}
                  </code>
                </pre>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
