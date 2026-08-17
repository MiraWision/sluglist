/**
 * A one-signal bus between the hero's button and the demo widget.
 *
 * They cannot call each other directly: the widget is mounted inside `Demo`,
 * which is loaded lazily (`ssr: false`) when its section approaches the
 * viewport, while the button lives in the hero and may be clicked before that
 * happens. So a click that arrives early is remembered and replayed the moment
 * the widget mounts — the reporter gets an open capture menu either way.
 */

let pending = false;
const listeners = new Set<() => void>();

/** Ask the demo widget to open its capture menu. */
export function requestDemoOpen(): void {
  if (listeners.size === 0) {
    pending = true;
    return;
  }
  for (const listener of listeners) {
    listener();
  }
}

/** Subscribe; a request that arrived before this call fires immediately. */
export function onDemoOpen(listener: () => void): () => void {
  listeners.add(listener);
  if (pending) {
    pending = false;
    listener();
  }
  return () => {
    listeners.delete(listener);
  };
}
