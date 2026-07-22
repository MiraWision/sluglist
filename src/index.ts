export { buildIssueMarkdown, buildSessionYaml } from "./artifacts";
export { DownloadConnector } from "./connectors/download";
export { MemoryConnector } from "./connectors/memory";
export { applyMask } from "./mask";
export type { MaskResult } from "./mask";
export { resolvePrivacy } from "./preset";
export {
  formatShortcut,
  matchesShortcut,
  parseShortcut,
} from "./shortcut";
export type { ParsedShortcut } from "./shortcut";
export type { BrowserInfo } from "./metadata";
export { parseUserAgent } from "./metadata";
export { createOfflineQueue } from "./queue";
export type { OfflineQueue, QueuedBatch } from "./queue";
export type { AreaRect } from "./screenshot";
export {
  captureArea,
  captureElement,
  captureFullPage,
} from "./screenshot";
export type { KeyValueStorage } from "./session";
export { createMemoryStorage, SessionManager } from "./session";
export { slugFromComment } from "./slug";
export {
  normalizeCustom,
  normalizeIdentity,
  toSnakeCase,
} from "./reporter";
export type {
  ArtifactFile,
  CaptureIssueInput,
  CaptureMode,
  CaptureResult,
  DeliveryFailure,
  DeliveryReport,
  FeedbackConnector,
  FeedbackCustom,
  FeedbackErrorConfig,
  FeedbackIdentity,
  FeedbackPrivacy,
  FeedbackWidgetConfig,
  FeedbackWidgetPreset,
  IssueIndexEntry,
  ReporterMeta,
  SessionMeta,
  SessionState,
} from "./types";
export {
  createErrorCapture,
  formatErrorAge,
  NOOP_ERROR_CAPTURE,
} from "./errors";
export type {
  ErrorCapture,
  ErrorCaptureOptions,
  ErrorRecord,
  ErrorSource,
} from "./errors";
export type {
  FeedbackWidgetUiConfig,
  IssueCategory,
  MountedFeedbackWidget,
} from "./ui/mount";
export { mountFeedbackWidget } from "./ui/mount";
export {
  collectElementMetadata,
  domPath,
  generateSelector,
  isHashLike,
  isUtilityClass,
  screenOf,
} from "./selector";
export type {
  ElementMetadata,
  SelectorResult,
  SelectorStrategy,
} from "./selector";
export type { FeedbackWidgetStrings } from "./ui/strings";
export type {
  CreateFeedbackWidgetOptions,
  FeedbackWidgetCore,
} from "./widget";
export { createFeedbackWidget } from "./widget";
