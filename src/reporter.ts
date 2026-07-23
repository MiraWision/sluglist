import type { FeedbackCustom, FeedbackIdentity, ReporterMeta } from "./types";
import type { YamlScalar } from "./yaml";

/**
 * Init-time normalization for the optional `identity` and `custom` config.
 * Kept separate from the widget so it is unit-testable in isolation. Both run
 * once at createFeedbackWidget(); the results are frozen for the session.
 */

const MAX_CUSTOM_KEYS = 20;
const MAX_VALUE_LENGTH = 200;

function clip(value: string): string {
  return value.length > MAX_VALUE_LENGTH ? value.slice(0, MAX_VALUE_LENGTH) : value;
}

/**
 * Config identity → serialized reporter block. Returns:
 *  - `undefined` when identity is not configured at all (field omitted, back-compat),
 *  - `null` when configured but empty (emitted as `reporter: null`),
 *  - an object with only the provided snake_case fields otherwise.
 */
export function normalizeIdentity(
  identity: FeedbackIdentity | undefined
): ReporterMeta | null | undefined {
  if (identity === undefined) {
    return undefined;
  }
  const reporter: ReporterMeta = {};
  if (typeof identity.userId === "string" && identity.userId.trim()) {
    reporter.user_id = clip(identity.userId.trim());
  }
  if (typeof identity.email === "string" && identity.email.trim()) {
    reporter.email = clip(identity.email.trim());
  }
  if (typeof identity.name === "string" && identity.name.trim()) {
    reporter.name = clip(identity.name.trim());
  }
  return Object.keys(reporter).length > 0 ? reporter : null;
}

/** camelCase / kebab / spaced → snake_case; strips other punctuation. */
export function toSnakeCase(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .replace(/[^A-Za-z0-9_]/g, "")
    .toLowerCase()
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Config custom → validated flat map. Non-primitive values are dropped with a
 * warning; keys become snake_case; capped at 20 keys; string values clipped to
 * 200 chars. Returns `undefined` when not configured, `null` when nothing valid
 * survives, else the cleaned map.
 */
export function normalizeCustom(
  custom: FeedbackCustom | undefined
): Record<string, YamlScalar> | null | undefined {
  if (custom === undefined) {
    return undefined;
  }
  const out: Record<string, YamlScalar> = {};
  let count = 0;
  for (const [rawKey, value] of Object.entries(custom)) {
    const type = typeof value;
    if (!(type === "string" || type === "number" || type === "boolean")) {
      console.warn(
        `[sluglist] custom: dropping "${rawKey}" — only string, number or boolean allowed (got ${type})`
      );
      continue;
    }
    if (typeof value === "number" && !Number.isFinite(value)) {
      console.warn(
        `[sluglist] custom: dropping "${rawKey}" — non-finite number`
      );
      continue;
    }
    const key = toSnakeCase(rawKey);
    if (!key) {
      console.warn(
        `[sluglist] custom: dropping "${rawKey}" — empty key after normalization`
      );
      continue;
    }
    if (count >= MAX_CUSTOM_KEYS) {
      console.warn(
        `[sluglist] custom: dropping "${rawKey}" — over the ${MAX_CUSTOM_KEYS}-key limit`
      );
      continue;
    }
    out[key] = typeof value === "string" ? clip(value) : value;
    count++;
  }
  return count > 0 ? out : null;
}

/**
 * Runtime host context (`sluglist.setContext`) → validated flat map, merged onto
 * the previous context. Same rules as `custom` (snake_case keys, primitives only,
 * ≤ 20 keys, values clipped to 200 chars), but callable repeatedly: later calls
 * update existing keys and add new ones. Unlike `custom` (static at init),
 * context can change during the session. Returns the merged map, or null when it
 * is empty (emitted as `context: null`).
 */
export function normalizeContext(
  incoming: Record<string, unknown>,
  prev: Record<string, YamlScalar> | null = null
): Record<string, YamlScalar> | null {
  const out: Record<string, YamlScalar> = { ...(prev ?? {}) };
  for (const [rawKey, value] of Object.entries(incoming ?? {})) {
    const type = typeof value;
    if (!(type === "string" || type === "number" || type === "boolean")) {
      console.warn(
        `[sluglist] context: dropping "${rawKey}" — only string, number or boolean allowed (got ${type})`
      );
      continue;
    }
    if (type === "number" && !Number.isFinite(value as number)) {
      console.warn(`[sluglist] context: dropping "${rawKey}" — non-finite number`);
      continue;
    }
    const key = toSnakeCase(rawKey);
    if (!key) {
      console.warn(
        `[sluglist] context: dropping "${rawKey}" — empty key after normalization`
      );
      continue;
    }
    if (!(key in out) && Object.keys(out).length >= MAX_CUSTOM_KEYS) {
      console.warn(
        `[sluglist] context: dropping "${rawKey}" — over the ${MAX_CUSTOM_KEYS}-key limit`
      );
      continue;
    }
    out[key] = typeof value === "string" ? clip(value as string) : (value as YamlScalar);
  }
  return Object.keys(out).length > 0 ? out : null;
}
