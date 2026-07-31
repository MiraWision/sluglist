import type {
  FeedbackDismissConfig,
  FeedbackErrorConfig,
  FeedbackPrivacy,
  FeedbackWidgetConfig,
} from "./types";

/**
 * Preset resolution. A preset supplies DEFAULTS; any explicit option the caller
 * passes overrides them — with one deliberate exception, documented on
 * {@link resolveErrors}.
 *
 * - "dev"        — adds nothing at all. Its behaviour is frozen: artifacts and
 *                  UI must stay byte-for-byte what they were before presets
 *                  existed, so a dev session is never quietly changed by work
 *                  done for production.
 * - "beta"       — privacy defaults (mask inputs + screenshot consent) and the
 *                  "Report a problem" button label, for real users on a beta.
 * - "production" — beta, plus text scrubbing, no warning capture, and the
 *                  dismiss control. For a widget shown to real customers.
 */

/**
 * Returns the effective privacy, or `undefined` when privacy is neither
 * configured nor implied by a preset (so dev artifacts stay clean — no `masked`
 * field). The resolved value is exposed on `core.config.privacy` and read by
 * the UI for masking + the consent checkbox, and by the core for text scrubbing.
 */
export function resolvePrivacy(
  config: FeedbackWidgetConfig
): FeedbackPrivacy | undefined {
  const presetDefaults: FeedbackPrivacy =
    config.preset === "production"
      ? { maskInputs: true, screenshotConsent: true, scrubText: true }
      : config.preset === "beta"
        ? { maskInputs: true, screenshotConsent: true }
        : {};
  if (
    config.privacy === undefined &&
    config.preset !== "beta" &&
    config.preset !== "production"
  ) {
    return undefined;
  }
  // Explicit privacy options win over preset defaults.
  return { ...presetDefaults, ...(config.privacy ?? {}) };
}

/**
 * Error-capture options after the preset.
 *
 * `production` forces `captureWarnings: false` even against an explicit `true`.
 * This is the one place a preset overrules the caller, and it is intentional:
 * `console.warn` is the noisiest text channel in a real app (deprecation
 * notices that quote props, validation warnings that quote user input), and a
 * widget shipped to real customers should not be hoovering it up. A caller who
 * really wants warnings in production can drop the preset and set the options
 * directly. Asking for them WITH the production preset warns once, rather than
 * failing silently.
 */
export function resolveErrors(
  config: FeedbackWidgetConfig
): FeedbackErrorConfig | undefined {
  if (config.preset !== "production") {
    return config.errors;
  }
  if (config.errors?.captureWarnings === true) {
    console.warn(
      "[sluglist] preset production forces errors.captureWarnings: false"
    );
  }
  return { ...(config.errors ?? {}), captureWarnings: false };
}

/**
 * Dismiss ("hide the widget") settings after the preset. On by default in
 * production — a real customer must be able to get the launcher out of the way
 * — and off everywhere else, so dev and beta look exactly as they did.
 */
export function resolveDismiss(
  config: FeedbackWidgetConfig
): FeedbackDismissConfig {
  const enabledByPreset = config.preset === "production";
  return {
    enabled: config.dismiss?.enabled ?? enabledByPreset,
    days: config.dismiss?.days ?? DEFAULT_DISMISS_DAYS,
  };
}

/** How long a dismissal lasts by default. `0` means "until storage is cleared". */
export const DEFAULT_DISMISS_DAYS = 7;
