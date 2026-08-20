/** All user-facing widget texts, overridable via the UI config. */
export interface FeedbackWidgetStrings {
  addScreenshot: string;
  annotateArrow: string;
  annotateBox: string;
  annotateDone: string;
  annotateText: string;
  annotateUndo: string;
  /** Hint shown while dragging out an area. */
  areaHint: string;
  /** "+ Attach file" — opens the file picker. */
  attachFile: string;
  /** Overlay shown while a file is dragged over the panel. */
  attachDrop: string;
  /** Rejected: type not on the whitelist. `{name}` */
  attachRejectedType: string;
  /** Rejected: over the size cap. `{name}` `{size}` `{limit}` */
  attachRejectedSize: string;
  /** Rejected: over the per-issue file count. `{n}` */
  attachRejectedCount: string;
  /** Rejected: zero-length file. `{name}` */
  attachRejectedEmpty: string;
  /** aria-label / tooltip for the per-attachment remove (×) button. */
  attachRemove: string;
  attachScreenshot: string;
  buttonLabel: string;
  cancel: string;
  capturing: string;
  close: string;
  categoryBug: string;
  categoryDesign: string;
  categoryIdea: string;
  checklistButton: string;
  /** @deprecated v2 removed the Done button (close via ✕ / outside / shortcut). */
  checklistDone: string;
  /** @deprecated v2 replaced the ✗ verdict button with the per-item issue button. */
  checklistFail: string;
  checklistOpen: string;
  /** @deprecated v2 removed the standalone pass button (click the row to check). */
  checklistPass: string;
  /** @deprecated v2 no longer generates `skip` from the UI. */
  checklistSkip: string;
  /** Per-item "flag a problem" (slug) button — aria-label + tooltip. */
  checklistItemIssue: string;
  /** Link chip on an item that has a reported issue: "issue {id}". */
  checklistItemIssueLink: string;
  /** Shown on items whose `url_match` matches the current path. */
  checklistHere: string;
  /** Footer line in the completed state. */
  checklistAutosaved: string;
  /** Summary: "{done} of {total} checked". */
  checklistSummaryChecked: string;
  /** Summary in the completed state: "{n} checked" (all of them). */
  checklistSummaryDone: string;
  /** Summary: "{n} issue" (one). */
  checklistSummaryIssueOne: string;
  /** Summary: "{n} issues", 2–4 in Slavic locales. Falls back to …Many. */
  checklistSummaryIssueFew?: string;
  /** Summary: "{n} issues" (many). */
  checklistSummaryIssueMany: string;
  /** Summary: "{n} left" (unchecked remaining). */
  checklistSummaryLeft: string;
  /** Confirm dialog when unchecking an item that already has a reported issue. */
  checklistUncheckIssue: string;
  commentPlaceholder: string;
  /** Comment placeholder when the Bug category is active. */
  placeholderBug: string;
  /** Comment placeholder when the Design category is active. */
  placeholderDesign: string;
  /** Comment placeholder when the Idea category is active. */
  placeholderIdea: string;
  deliveryFailed: string;
  dialogTitle: string;
  /** Dismiss ✕ on the launcher — aria-label + tooltip. */
  dismiss: string;
  elementHint: string;
  /** Empty option of a non-required select. */
  formChoose: string;
  /** Validation: a required field was left empty. */
  formRequired: string;
  /** Validation: `type: "email"` did not look like an address. */
  formInvalidEmail: string;
  /** Heading above the once-per-session block of fields. */
  formSessionTitle: string;
  /** alt text of a captured screenshot thumbnail: "Screenshot {n}". */
  imageAlt: string;
  /** alt text of a recording frame thumbnail: "Frame {n}". */
  frameAlt: string;
  menuArea: string;
  menuElement: string;
  menuFullpage: string;
  menuNoScreenshot: string;
  menuRecord: string;
  noScreenshot: string;
  recording: string;
  recordingCancel: string;
  recordingFrames: string;
  /** Clip deck heading, e.g. "Clip {n}". */
  recordingClip: string;
  /** Frame count, singular: "{n} frame". */
  recordingFrameOne: string;
  /** Frame count, 2–4 in Slavic locales. Falls back to …Many when absent. */
  recordingFrameFew?: string;
  /**
   * Shown instead of {@link FeedbackWidgetStrings.deliveryFailed} when the
   * endpoint refused the artifact — a rejection retrying cannot fix.
   */
  deliveryRejected: string;
  /** Batches waiting in the offline outbox, singular. */
  queuePendingOne: string;
  /** Batches waiting in the offline outbox, plural. */
  queuePendingMany: string;
  /** Batches waiting, "few" form (Slavic bundles). */
  queuePendingFew?: string;
  /** Frame count, plural: "{n} frames". */
  recordingFrameMany: string;
  recordingHint: string;
  recordingLimit: string;
  recordingRemove: string;
  recordingSnap: string;
  /** aria-label / tooltip for the per-screenshot remove (×) button. */
  removeScreenshot: string;
  recordingStop: string;
  reportProblem: string;
  retry: string;
  saved: string;
  /** Toast after a failed render: the issue still goes, without the picture. */
  screenshotFailed: string;
  send: string;
  sending: string;
  /**
   * Which plural form a count takes. Absent = the English/Germanic rule
   * (1 → one, everything else → many). Slavic bundles supply a three-form rule;
   * see {@link slavicPluralForm}.
   */
  pluralForm?: PluralForm;
}

export const DEFAULT_STRINGS: FeedbackWidgetStrings = {
  addScreenshot: "+ Add screenshot",
  annotateArrow: "Arrow",
  annotateBox: "Box",
  annotateDone: "Done",
  annotateText: "Text",
  annotateUndo: "Undo",
  areaHint: "Drag to select an area. Esc to cancel.",
  attachFile: "+ Attach file",
  attachDrop: "Drop files to attach",
  attachRejectedType: "{name}: this file type is not accepted",
  attachRejectedSize: "{name} is {size} — the limit is {limit}",
  attachRejectedCount: "You can attach up to {n} files per issue",
  attachRejectedEmpty: "{name} is empty",
  attachRemove: "Remove file",
  attachScreenshot: "Attach screenshot",
  buttonLabel: "Feedback",
  cancel: "Cancel",
  capturing: "Capturing...",
  close: "Close",
  categoryBug: "Bug",
  categoryDesign: "Design",
  categoryIdea: "Idea",
  checklistButton: "Checklist",
  checklistDone: "Done",
  checklistFail: "Report",
  checklistOpen: "Open",
  checklistPass: "Pass",
  checklistSkip: "Skip",
  checklistItemIssue: "Report an issue",
  checklistItemIssueLink: "issue {id}",
  checklistHere: "You're here",
  checklistAutosaved: "Everything is saved automatically",
  checklistSummaryChecked: "{done} of {total} checked",
  checklistSummaryDone: "{n} checked",
  checklistSummaryIssueOne: "{n} issue",
  checklistSummaryIssueMany: "{n} issues",
  checklistSummaryLeft: "{n} left",
  checklistUncheckIssue:
    "This item has a reported issue ({id}). Unchecking clears your verdict — the issue itself stays saved. Continue?",
  commentPlaceholder: "Describe the problem...",
  placeholderBug: "Describe the problem...",
  placeholderDesign: "What looks off?...",
  placeholderIdea: "Describe your idea...",
  deliveryFailed: "Issue {id}: upload failed",
  deliveryRejected: "Issue {id}: rejected by the endpoint",
  queuePendingOne: "{n} report waiting to send",
  queuePendingMany: "{n} reports waiting to send",
  dialogTitle: "New issue",
  dismiss: "Hide feedback button",
  elementHint: "Click an element to report it. Esc to cancel.",
  formChoose: "Choose…",
  formRequired: "This field is required",
  formInvalidEmail: "Enter a valid email address",
  formSessionTitle: "A few details",
  imageAlt: "Screenshot {n}",
  frameAlt: "Frame {n}",
  menuArea: "Select area",
  menuElement: "Select element",
  menuFullpage: "Full page screenshot",
  menuNoScreenshot: "Comment without screenshot",
  menuRecord: "Record steps",
  noScreenshot: "No screenshot for this issue",
  recording: "Recording · {id} frames",
  recordingCancel: "Cancel",
  recordingFrames: "{id} frames",
  recordingClip: "Clip {n}",
  recordingFrameOne: "{n} frame",
  recordingFrameMany: "{n} frames",
  recordingHint: "Frames auto-capture on clicks & navigation",
  recordingLimit: "Frame limit reached ({id})",
  recordingRemove: "Remove recording",
  recordingSnap: "+ Frame",
  removeScreenshot: "Remove screenshot",
  recordingStop: "Stop & describe",
  reportProblem: "Report a problem",
  retry: "Retry",
  saved: "Issue {id} saved",
  screenshotFailed: "Screenshot failed — sending without it",
  sending: "Sending issue {id}...",
  send: "Send",
};

export function formatString(template: string, id: string): string {
  return template.replace("{id}", id);
}

/**
 * Interpolate every `{key}` in a template from a values map (localization-safe:
 * the translated string decides token order). Numbers are stringified.
 */
export function interpolate(
  template: string,
  values: Record<string, string | number>
): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole
  );
}

/** Which of the three plural slots a count uses. */
export type PluralCategory = "one" | "few" | "many";
export type PluralForm = (n: number) => PluralCategory;

/** English / Germanic / Romance: 1 is singular, everything else is not. */
export const defaultPluralForm: PluralForm = (n) => (n === 1 ? "one" : "many");

/**
 * Russian / Ukrainian: 1, 21, 31 … take the singular; 2–4, 22–24 … take the
 * "few" form; everything else (0, 5–20, 25–30 …) takes the genitive plural.
 * 11–14 are the exception that catches naive implementations.
 */
export const slavicPluralForm: PluralForm = (n) => {
  const abs = Math.abs(Math.trunc(n));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return "one";
  }
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) {
    return "few";
  }
  return "many";
};

/**
 * Pick the singular or plural template by count, then interpolate `{n}`.
 *
 * Two-form call site kept for compatibility. Pass `few` and a `form` rule for
 * languages that need three (`plural(one, many, n, few, slavicPluralForm)`); a
 * bundle that omits `few` falls back to `many`, so an incomplete translation
 * degrades to a wrong ending rather than a missing string.
 */
export function plural(
  one: string,
  many: string,
  n: number,
  few?: string,
  form: PluralForm = defaultPluralForm
): string {
  const category = form(n);
  const template =
    category === "one" ? one : category === "few" ? (few ?? many) : many;
  return interpolate(template, { n });
}
