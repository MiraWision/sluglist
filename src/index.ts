export {
  attachmentFile,
  buildFixesYaml,
  buildIssueMarkdown,
  buildSessionYaml,
  FORMAT_VERSION,
  fixesYamlFile,
} from "./artifacts";
export { PermanentDeliveryError } from "./deliver";
export { DownloadConnector } from "./connectors/download";
export { HttpConnector } from "./connectors/http";
export type { HttpConnectorOptions } from "./connectors/http";
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
export {
  checklistItems,
  checklistProgress,
  isVerdict,
  normalizeChecklist,
  seedChecklistState,
} from "./checklist";
export type {
  Checklist,
  ChecklistDef,
  ChecklistDefItem,
  ChecklistDefSection,
  ChecklistItem,
  ChecklistSection,
  ChecklistState,
  ChecklistVerdictItem,
  Verdict,
} from "./checklist";
export {
  clearDismissed,
  dismissKey,
  isDismissed,
  readDismiss,
  setDismissed,
} from "./dismiss";
export type { DismissRecord } from "./dismiss";
export {
  createGuard,
  DEFAULT_FAILURE_THRESHOLD,
  NOOP_GUARD,
  restoreIfOurs,
} from "./guard";
export type { GuardOptions, WidgetGuard } from "./guard";
export { applyMask } from "./mask";
export type { MaskResult } from "./mask";
export {
  DEFAULT_DISMISS_DAYS,
  resolveDismiss,
  resolveErrors,
  resolvePrivacy,
} from "./preset";
export {
  DIGITS_MARK,
  EMAIL_MARK,
  scrub,
  scrubMaybe,
  TOKEN_MARK,
} from "./scrub";
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
export type {
  AreaRect,
  CaptureFailureReason,
  CaptureOptions,
  ColorStats,
} from "./screenshot";
export {
  BLANK_MAX_DISTINCT_COLORS,
  BLANK_RATIO_THRESHOLD,
  CaptureFailedError,
  captureArea,
  captureElement,
  captureFullPage,
  DEFAULT_CAPTURE_TIMEOUT_MS,
  colorStats,
  describeRenderError,
  dominantColorRatio,
} from "./screenshot";
export {
  attachmentPath,
  checkAttachment,
  ATTACHMENT_MIME_TYPES,
  DEFAULT_MAX_FILE_SIZE,
  DEFAULT_MAX_FILES,
  extensionOf,
  formatBytes,
  isImageAttachment,
  resolveAttachments,
  TEXT_ATTACHMENT_EXTENSIONS,
} from "./attachments";
export type { AttachmentCheck, AttachmentPolicy } from "./attachments";
export {
  collectValues,
  EMAIL_PATTERN,
  MAX_FORM_FIELDS,
  MAX_FORM_VALUE_LENGTH,
  normalizeForm,
  validateValue,
} from "./form";
export type { FormValue, ResolvedFormField } from "./form";
export { de, en, es, labels, ru, uk } from "./labels";
export type { LabelLocale } from "./labels";
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
  AttachmentInput,
  AttachmentMeta,
  CaptureIssueInput,
  CaptureMode,
  CaptureResult,
  DeliveryFailure,
  DeliveryReport,
  FeedbackActionsConfig,
  FeedbackAttachmentsConfig,
  FeedbackCaptureConfig,
  FeedbackConnector,
  FeedbackCustom,
  FeedbackDismissConfig,
  FeedbackErrorConfig,
  FeedbackIdentity,
  FeedbackPrivacy,
  FeedbackRecordingConfig,
  FeedbackWidgetConfig,
  FeedbackWidgetPreset,
  FixesState,
  FixRecord,
  FixStatus,
  FormField,
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
export type {
  FeedbackWidgetStrings,
  PluralCategory,
  PluralForm,
} from "./ui/strings";
export {
  defaultPluralForm,
  DEFAULT_STRINGS,
  interpolate,
  plural,
  slavicPluralForm,
} from "./ui/strings";
export type {
  CreateFeedbackWidgetOptions,
  FeedbackWidgetCore,
} from "./widget";
export { createFeedbackWidget, defaultProjectSlug } from "./widget";
