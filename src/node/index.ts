/**
 * `sluglist/node` — the headless writer for agents and scripts. Node-only
 * subpath: it may import node builtins and must never be pulled into the
 * browser bundle. It re-exports only DOM-free pieces of the core.
 */
export {
  buildFixesYaml,
  buildIssueMarkdown,
  buildSessionYaml,
  FORMAT_VERSION,
  fixesYamlFile,
} from "../artifacts";
export {
  checklistItems,
  checklistProgress,
  isVerdict,
  normalizeChecklist,
  seedChecklistState,
} from "../checklist";
export type {
  Checklist,
  ChecklistDef,
  ChecklistItem,
  ChecklistSection,
  ChecklistState,
  Verdict,
} from "../checklist";
export { MemoryConnector } from "../connectors/memory";
export { LocalConnector, resolveArtifactTarget } from "./local";
export type { LocalConnectorOptions } from "./local";
export { createSession } from "./writer";
export type {
  BinaryInput,
  CreateSessionOptions,
  NodeAttachmentInput,
  ReportedIssue,
  ReportFixInput,
  ReportIssueInput,
  ReportIssueMeta,
  WriterSession,
} from "./writer";
export type {
  ArtifactFile,
  DeliveryFailure,
  DeliveryReport,
  FeedbackConnector,
  FeedbackIdentity,
  FixesState,
  FixRecord,
  FixStatus,
  ReporterMeta,
  SessionState,
} from "../types";
