export { buildIssueMarkdown, buildSessionYaml } from "./artifacts";
export { DownloadConnector } from "./connectors/download";
export { LocalConnector } from "./connectors/local";
export type { LocalConnectorOptions } from "./connectors/local";
export { MemoryConnector } from "./connectors/memory";
export {
  createActionCapture,
  NOOP_ACTION_CAPTURE,
  renderAction,
} from "./actions";
export type {
  ActionCapture,
  ActionCaptureOptions,
  ActionKind,
  ActionRecord,
} from "./actions";
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
  normalizeContext,
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
  FeedbackActionsConfig,
  FeedbackConnector,
  FeedbackCustom,
  FeedbackErrorConfig,
  FeedbackIdentity,
  FeedbackPrivacy,
  FeedbackRecordingConfig,
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
  componentName,
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
