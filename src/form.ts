import { toSnakeCase } from "./reporter";
import type { FormField } from "./types";

/**
 * Reporter form fields: init-time validation of the `form` config and
 * value-level validation of what the reporter typed.
 *
 * Kept deliberately small. This is not a form framework — it is the three or
 * four questions a bug report needs that only the person reporting can answer
 * ("which account?", "how bad is it?", "can we email you back?").
 */

/** Beyond this the panel stops being a feedback form and becomes a survey. */
export const MAX_FORM_FIELDS = 8;
/** Per-value character cap, applied before the value reaches an artifact. */
export const MAX_FORM_VALUE_LENGTH = 500;
/** Options beyond this are dropped from a select. */
const MAX_OPTIONS = 30;

const TYPES = new Set(["text", "email", "select", "checkbox"]);

/**
 * Pragmatic email shape check: something, an @, something with a dot. Not
 * RFC 5322 — a stricter regex rejects addresses that work and helps nobody.
 */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** A config field after validation: `key` is what artifacts are keyed by. */
export interface ResolvedFormField extends FormField {
  /** snake_case `id`, used as the artifact key. */
  key: string;
  options?: string[];
}

/**
 * Validate the `form` config once at init. Invalid entries are dropped with a
 * warning and never block the widget: a typo in one field must not cost you the
 * feedback channel.
 */
export function normalizeForm(
  fields: FormField[] | undefined
): ResolvedFormField[] {
  if (fields === undefined) {
    return [];
  }
  if (!Array.isArray(fields)) {
    console.warn("[sluglist] form: expected an array of fields; ignoring");
    return [];
  }
  const out: ResolvedFormField[] = [];
  const seen = new Set<string>();
  for (const field of fields) {
    const drop = (why: string): void => {
      console.warn(
        `[sluglist] form: dropping field ${JSON.stringify(
          (field as FormField | undefined)?.id ?? field
        )} — ${why}`
      );
    };
    if (!(field && typeof field === "object")) {
      drop("not an object");
      continue;
    }
    if (typeof field.id !== "string" || !toSnakeCase(field.id)) {
      drop("missing or unusable id");
      continue;
    }
    if (typeof field.label !== "string" || !field.label.trim()) {
      drop("missing label");
      continue;
    }
    if (!TYPES.has(field.type)) {
      drop(`unknown type ${JSON.stringify(field.type)}`);
      continue;
    }
    if (field.scope !== "session" && field.scope !== "issue") {
      drop('scope must be "session" or "issue"');
      continue;
    }
    const key = toSnakeCase(field.id);
    if (seen.has(key)) {
      drop("duplicate id");
      continue;
    }
    let options: string[] | undefined;
    if (field.type === "select") {
      options = (Array.isArray(field.options) ? field.options : [])
        .filter((o): o is string => typeof o === "string" && o.trim().length > 0)
        .slice(0, MAX_OPTIONS);
      if (options.length === 0) {
        drop("select with no options");
        continue;
      }
    }
    if (out.length >= MAX_FORM_FIELDS) {
      drop(`over the ${MAX_FORM_FIELDS}-field limit`);
      continue;
    }
    seen.add(key);
    out.push({
      ...field,
      key,
      label: field.label.trim(),
      ...(options ? { options } : {}),
    });
  }
  return out;
}

export type FormValue = string | boolean;

/**
 * Validate one answer. Returns null when it is acceptable, or the reason it is
 * not — the UI turns that into a message and blocks sending.
 */
export function validateValue(
  field: ResolvedFormField,
  value: FormValue | undefined
): "required" | "email" | null {
  if (field.type === "checkbox") {
    return field.required && value !== true ? "required" : null;
  }
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    return field.required ? "required" : null;
  }
  if (field.type === "email" && !EMAIL_PATTERN.test(text)) {
    return "email";
  }
  return null;
}

/**
 * Answers → the flat map written into an artifact. Empty optional answers are
 * omitted entirely rather than written as empty strings, so a `form:` block
 * only ever contains what the reporter actually said.
 *
 * Values are NOT scrubbed. A reporter who types their email into a field
 * labelled "Your email" is telling you their email on purpose; redacting it
 * would make the field pointless. Only page-derived text goes through the scrub.
 */
export function collectValues(
  fields: ResolvedFormField[],
  answers: Map<string, FormValue>
): Record<string, string | number | boolean> | undefined {
  const out: Record<string, string | number | boolean> = {};
  for (const field of fields) {
    const value = answers.get(field.key);
    if (field.type === "checkbox") {
      if (value !== undefined) {
        out[field.key] = value === true;
      }
      continue;
    }
    const text = typeof value === "string" ? value.trim() : "";
    if (text) {
      out[field.key] = text.slice(0, MAX_FORM_VALUE_LENGTH);
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
