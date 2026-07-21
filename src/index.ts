export { buildIssueMarkdown, buildSessionYaml } from "./artifacts";
export { DownloadConnector } from "./connectors/download";
export { MemoryConnector } from "./connectors/memory";
export type { BrowserInfo } from "./metadata";
export { parseUserAgent } from "./metadata";
export type { AreaRect } from "./screenshot";
export {
  captureArea,
  captureElement,
  captureFullPage,
} from "./screenshot";
export type { KeyValueStorage } from "./session";
export { createMemoryStorage, SessionManager } from "./session";
export { slugFromComment } from "./slug";
export type {
  ArtifactFile,
  CaptureIssueInput,
  CaptureMode,
  CaptureResult,
  DeliveryFailure,
  DeliveryReport,
  FeedbackConnector,
  FeedbackWidgetConfig,
  IssueIndexEntry,
  SessionMeta,
  SessionState,
} from "./types";
export type { ConsoleErrorBuffer } from "./ui/console-buffer";
export { installConsoleErrorBuffer } from "./ui/console-buffer";
export type {
  FeedbackWidgetUiConfig,
  MountedFeedbackWidget,
} from "./ui/mount";
export { mountFeedbackWidget } from "./ui/mount";
export { computeCssSelector } from "./ui/selector";
export type { FeedbackWidgetStrings } from "./ui/strings";
export type {
  CreateFeedbackWidgetOptions,
  FeedbackWidgetCore,
} from "./widget";
export { createFeedbackWidget } from "./widget";
