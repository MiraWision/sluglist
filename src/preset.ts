import type { FeedbackPrivacy, FeedbackWidgetConfig } from "./types";

/**
 * Preset resolution. "beta" supplies privacy defaults (mask inputs + require
 * screenshot consent) for real users on a production beta; any explicit
 * `privacy` option the caller passes overrides the preset. "dev" adds nothing.
 *
 * Returns the effective privacy, or `undefined` when privacy is neither
 * configured nor implied by a preset (so dev artifacts stay clean — no `masked`
 * field). The resolved value is exposed on `core.config.privacy` and read by the
 * UI for masking + the consent checkbox.
 */
export function resolvePrivacy(
  config: FeedbackWidgetConfig
): FeedbackPrivacy | undefined {
  const presetDefaults: FeedbackPrivacy =
    config.preset === "beta"
      ? { maskInputs: true, screenshotConsent: true }
      : {};
  if (config.privacy === undefined && config.preset !== "beta") {
    return undefined;
  }
  // Explicit privacy options win over preset defaults.
  return { ...presetDefaults, ...(config.privacy ?? {}) };
}
