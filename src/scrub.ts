/**
 * PII scrub for the artifact TEXT surfaces: element text, error messages and
 * stacks, action-trail selectors/labels, request paths, the issue url.
 *
 * A pure, dependency-free string transform so it can be unit-tested
 * exhaustively — including the negative cases, which matter more than the
 * positive ones: a scrub that eats dates, counts, versions or viewport strings
 * makes artifacts useless for the person reading them.
 *
 * It is pattern-based and deliberately conservative. It is NOT a PII detector:
 * names, addresses and free-form sentences pass through untouched. The gaps are
 * listed in RUN_EVIDENCE.md rather than papered over.
 *
 * Scope: values the DEVELOPER supplies (context, custom, identity, checklist
 * titles) are never scrubbed — those are chosen deliberately and mangling them
 * would break fields the host wired up on purpose. The reporter's own `comment`
 * is likewise left alone: it is the payload of the report.
 */

/** Placeholder written in place of an email address. */
export const EMAIL_MARK = "[email]";
/** Placeholder written in place of a long digit run (card, phone, account). */
export const DIGITS_MARK = "[digits]";
/** Placeholder written in place of a hex/base64-like secret. */
export const TOKEN_MARK = "[token]";

const EMAIL =
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

/**
 * A JWT: three base64url segments joined by dots. Matched before the generic
 * token rule so the whole thing collapses to one mark instead of three.
 */
const JWT = /\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;

/**
 * Candidate secret: a run of base64url/hex characters. `/` and `.` are NOT in
 * the alphabet, so a URL path is examined segment by segment and only the
 * segment that looks like a secret is redacted — the readable parts of the path
 * survive, which is the whole point of logging paths at all.
 */
const TOKEN = /[A-Za-z0-9+=_-]{24,}/g;
const TOKEN_MIN_CHUNK = 12;

/**
 * A digit run that may contain spaces and hyphens, so a card written
 * "4111 1111 1111 1111" or a phone "555-123-4567" is caught as one unit. A dot
 * is deliberately not a separator: that keeps version numbers ("10.0.19045"),
 * IPv4 addresses and decimals from being glued into one long run.
 */
const DIGIT_RUN = /\d(?:[\d \-]*\d)?/g;
const MIN_DIGITS = 6;

/** Calendar dates, which must survive the digit rule. */
const DATE_SHAPES = [
  /^\d{4}-\d{1,2}-\d{1,2}$/, // 2026-07-31
  /^\d{1,2}-\d{1,2}-\d{4}$/, // 31-07-2026
];

function countDigits(value: string): number {
  let n = 0;
  for (const ch of value) {
    if (ch >= "0" && ch <= "9") {
      n++;
    }
  }
  return n;
}

function isDateShaped(value: string): boolean {
  return DATE_SHAPES.some((shape) => shape.test(value));
}

/**
 * Does this run actually look like a secret rather than a long kebab/snake
 * identifier? Real tokens (hex digests, UUIDs, base64url blobs) always contain
 * one dense alphanumeric chunk; "v1-abc-123-def-456-ghi-789" never does. The
 * digit requirement additionally excludes long ordinary words.
 */
function isSecretShaped(run: string): boolean {
  if (!/\d/.test(run)) {
    return false;
  }
  return run
    .split(/[-_]/)
    .some((chunk) => chunk.length >= TOKEN_MIN_CHUNK);
}

/**
 * Redact PII-shaped substrings. Order matters: emails first (they contain both
 * dots and digits), then JWT and token runs (which contain digit sequences),
 * then bare digit runs — otherwise an earlier rule would chew a fragment out of
 * a value a later rule would have matched whole.
 */
export function scrub(value: string): string {
  let out = value.replace(EMAIL, EMAIL_MARK);
  out = out.replace(JWT, TOKEN_MARK);
  out = out.replace(TOKEN, (run) => (isSecretShaped(run) ? TOKEN_MARK : run));
  out = out.replace(DIGIT_RUN, (run) =>
    countDigits(run) >= MIN_DIGITS && !isDateShaped(run) ? DIGITS_MARK : run
  );
  return out;
}

/**
 * Scrub a value that may be absent. `null` / `undefined` pass through unchanged
 * so the caller's "field not present" vs "field is null" distinction — which the
 * artifact format relies on — is preserved.
 */
export function scrubMaybe<T extends string | null | undefined>(value: T): T {
  return (typeof value === "string" ? scrub(value) : value) as T;
}
