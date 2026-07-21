import type {
  ArtifactFile,
  CaptureMode,
  IssueIndexEntry,
  SessionState,
} from "./types";
import { type YamlValue, yamlLine, yamlListOfMaps, yamlMap } from "./yaml";

/**
 * Artifact builder. The output structure and frontmatter are a contract
 * consumed by future parsers; any change must be additive only.
 */

export function buildSessionYaml(state: SessionState): string {
  const headEntries: [string, YamlValue][] = [
    ["project", state.project],
    ["session_id", state.session_id],
    ["created_at", state.created_at],
    ["base_url", state.base_url],
    ["browser", state.browser],
    ["os", state.os],
    ["viewport", state.viewport],
    ["device_pixel_ratio", state.device_pixel_ratio],
  ];
  // Additive metadata: appended only when collected, so artifacts written
  // without it (and the byte-exact fixtures) stay unchanged.
  if (state.screen !== undefined) {
    headEntries.push(["screen", state.screen]);
  }
  if (state.language !== undefined) {
    headEntries.push(["language", state.language]);
  }
  if (state.languages !== undefined) {
    headEntries.push(["languages", state.languages]);
  }
  if (state.timezone !== undefined) {
    headEntries.push(["timezone", state.timezone]);
  }
  if (state.color_scheme !== undefined) {
    headEntries.push(["color_scheme", state.color_scheme]);
  }
  if (state.reduced_motion !== undefined) {
    headEntries.push(["reduced_motion", state.reduced_motion]);
  }
  const head = yamlMap(headEntries);

  if (state.issues.length === 0) {
    return `${head}\nissues: []\n`;
  }

  const issues = yamlListOfMaps(
    state.issues.map((issue) => issueEntries(issue))
  );
  return `${head}\nissues:\n${issues}\n`;
}

function issueEntries(issue: IssueIndexEntry): [string, YamlValue][] {
  const entries: [string, YamlValue][] = [
    ["id", issue.id],
    ["file", issue.file],
    ["screenshot", issue.screenshot],
  ];
  if (issue.category !== undefined) {
    entries.push(["category", issue.category]);
  }
  // Additive contract field: emitted only for multi-screenshot issues so
  // single-screenshot sessions stay byte-identical to the original format.
  if (issue.screenshots && issue.screenshots.length > 1) {
    entries.push(["screenshots", issue.screenshots]);
  }
  entries.push(
    ["url", issue.url],
    ["selector", issue.selector],
    ["created_at", issue.created_at]
  );
  return entries;
}

export interface IssueMarkdownInput {
  category?: string;
  comment: string;
  consoleErrors?: string[];
  createdAt: string;
  id: string;
  mode: CaptureMode;
  screenshot: string | null;
  /** All screenshot file names; emitted only when there is more than one. */
  screenshots?: string[];
  selector: string | null;
  url: string;
  viewport: string;
}

export function buildIssueMarkdown(input: IssueMarkdownInput): string {
  const lines = [
    yamlLine("id", input.id),
    yamlLine("url", input.url),
    yamlLine("selector", input.selector),
    yamlLine("mode", input.mode),
  ];
  if (input.category !== undefined) {
    lines.push(yamlLine("category", input.category));
  }
  lines.push(
    yamlLine("viewport", input.viewport),
    yamlLine("screenshot", input.screenshot)
  );
  if (input.screenshots && input.screenshots.length > 1) {
    lines.push(yamlLine("screenshots", input.screenshots));
  }
  lines.push(yamlLine("created_at", input.createdAt));
  const frontmatter = lines.join("\n");

  let body = input.comment.trim();

  if (input.consoleErrors && input.consoleErrors.length > 0) {
    const errors = input.consoleErrors
      .map((err) => `\`\`\`\n${err.trim()}\n\`\`\``)
      .join("\n\n");
    body += `\n\n## Console errors\n\n${errors}`;
  }

  return `---\n${frontmatter}\n---\n\n${body}\n`;
}

export function sessionYamlFile(state: SessionState): ArtifactFile {
  return {
    path: "session.yaml",
    blob: new Blob([buildSessionYaml(state)], { type: "text/yaml" }),
    mime: "text/yaml",
  };
}

export function issueMarkdownFile(
  path: string,
  input: IssueMarkdownInput
): ArtifactFile {
  return {
    path,
    blob: new Blob([buildIssueMarkdown(input)], { type: "text/markdown" }),
    mime: "text/markdown",
  };
}

export function screenshotFile(path: string, blob: Blob): ArtifactFile {
  return { path, blob, mime: "image/png" };
}
