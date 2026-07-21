/** All user-facing widget texts, overridable via the UI config. */
export interface FeedbackWidgetStrings {
  addScreenshot: string;
  annotateArrow: string;
  annotateBox: string;
  annotateDone: string;
  annotateText: string;
  annotateUndo: string;
  buttonLabel: string;
  cancel: string;
  capturing: string;
  categoryBug: string;
  categoryDesign: string;
  categoryIdea: string;
  commentPlaceholder: string;
  deliveryFailed: string;
  dialogTitle: string;
  elementHint: string;
  menuArea: string;
  menuElement: string;
  menuFullpage: string;
  menuNoScreenshot: string;
  noScreenshot: string;
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
  buttonLabel: "Feedback",
  cancel: "Cancel",
  capturing: "Capturing...",
  categoryBug: "Bug",
  categoryDesign: "Design",
  categoryIdea: "Idea",
  commentPlaceholder: "Describe the problem...",
  deliveryFailed: "Issue {id}: upload failed",
  dialogTitle: "New issue",
  elementHint: "Click an element to report it. Esc to cancel.",
  menuArea: "Select area",
  menuElement: "Select element",
  menuFullpage: "Full page screenshot",
  menuNoScreenshot: "Comment without screenshot",
  noScreenshot: "No screenshot for this issue",
  retry: "Retry",
  saved: "Issue {id} saved",
  sending: "Sending issue {id}...",
  send: "Send",
};

export function formatString(template: string, id: string): string {
  return template.replace("{id}", id);
}
