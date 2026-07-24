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
  categoryBug: string;
  categoryDesign: string;
  categoryIdea: string;
  checklistButton: string;
  checklistDone: string;
  checklistFail: string;
  checklistOpen: string;
  checklistPass: string;
  checklistSkip: string;
  commentPlaceholder: string;
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
  recordingHint: string;
  recordingLimit: string;
  recordingRemove: string;
  recordingSnap: string;
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
  categoryBug: "Bug",
  categoryDesign: "Design",
  categoryIdea: "Idea",
  checklistButton: "Checklist",
  checklistDone: "Done",
  checklistFail: "Report",
  checklistOpen: "Open",
  checklistPass: "Pass",
  checklistSkip: "Skip",
  commentPlaceholder: "Describe the problem...",
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
  recordingHint: "Frames auto-capture on clicks & navigation",
  recordingLimit: "Frame limit reached ({id})",
  recordingRemove: "Remove recording",
  recordingSnap: "+ Frame",
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
