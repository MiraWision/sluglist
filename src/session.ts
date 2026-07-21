import { isoTimestamp } from "./metadata";
import type { SessionMeta, SessionState } from "./types";

/**
 * Minimal storage interface so the session manager works both in the browser
 * (sessionStorage) and in tests (in-memory fake).
 */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

export function createMemoryStorage(): KeyValueStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

const SHORT_ID_LENGTH = 4;
const SHORT_ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function generateShortId(): string {
  const bytes = new Uint8Array(SHORT_ID_LENGTH);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let id = "";
  for (const b of bytes) {
    id += SHORT_ID_ALPHABET[b % SHORT_ID_ALPHABET.length];
  }
  return id;
}

export function generateSessionId(now: Date = new Date()): string {
  const day = isoTimestamp(now).slice(0, 10);
  return `session-${day}-${generateShortId()}`;
}

export interface SessionManagerOptions {
  project: string;
  storage?: KeyValueStorage;
}

/**
 * Owns the per-tab session: creates it lazily on the first issue, persists it
 * in sessionStorage so a page navigation within the same tab keeps the session,
 * and numbers issues monotonically.
 */
export class SessionManager {
  private readonly storageKey: string;
  private readonly storage: KeyValueStorage;

  constructor(options: SessionManagerOptions) {
    this.storageKey = `feedback-widget:${options.project}:session`;
    this.storage =
      options.storage ??
      (typeof sessionStorage === "undefined"
        ? createMemoryStorage()
        : sessionStorage);
  }

  read(): SessionState | null {
    const raw = this.storage.getItem(this.storageKey);
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as SessionState;
      if (!(parsed.session_id && Array.isArray(parsed.issues))) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  /** Return the current session, creating one from `meta` if none exists. */
  ensure(
    meta: () => Omit<SessionMeta, "session_id" | "created_at">
  ): SessionState {
    const existing = this.read();
    if (existing) {
      return existing;
    }
    const now = new Date();
    const state: SessionState = {
      ...meta(),
      session_id: generateSessionId(now),
      created_at: isoTimestamp(now),
      issues: [],
    };
    this.write(state);
    return state;
  }

  write(state: SessionState): void {
    this.storage.setItem(this.storageKey, JSON.stringify(state));
  }

  /** Next zero-padded issue number, e.g. "01", "02", ... "10". */
  nextIssueId(state: SessionState): string {
    return String(state.issues.length + 1).padStart(2, "0");
  }

  reset(): void {
    this.storage.removeItem(this.storageKey);
  }
}
