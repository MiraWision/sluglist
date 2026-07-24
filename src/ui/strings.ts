/** All user-facing widget texts, overridable via the UI config. */
export interface FeedbackWidgetStrings {
  addScreenshot: string;
  annotateArrow: string;
  annotateBox: string;
  annotateDone: string;
  annotateText: string;
  annotateUndo: string;
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
  elementHint: string;
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
  send: string;
  sending: string;
}

export const DEFAULT_STRINGS: FeedbackWidgetStrings = {
  addScreenshot: "+ Add screenshot",
  annotateArrow: "Arrow",
  annotateBox: "Box",
  annotateDone: "Done",
  annotateText: "Text",
  annotateUndo: "Undo",
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
  dialogTitle: "New issue",
  elementHint: "Click an element to report it. Esc to cancel.",
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

/** Pick the singular or plural template by count, then interpolate `{n}`. */
export function plural(
  one: string,
  many: string,
  n: number
): string {
  return interpolate(n === 1 ? one : many, { n });
}
