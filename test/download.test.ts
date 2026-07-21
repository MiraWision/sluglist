import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { DownloadConnector } from "../src/connectors/download";
import { createMemoryStorage } from "../src/session";
import { createFeedbackWidget } from "../src/widget";

const testEnvironment = () => ({
  screen: "1512x982",
  language: "en-US",
  languages: ["en-US"],
  timezone: "Europe/Berlin",
  colorScheme: "dark",
  reducedMotion: false,
  baseUrl: "https://dev.trugenix.example",
  url: "/dashboard/animals",
  viewport: "1512x982",
  devicePixelRatio: 2,
  browser: "Chrome 138",
  os: "macOS",
});

describe("DownloadConnector", () => {
  it("zips a whole session with correct paths and index", async () => {
    const download = new DownloadConnector();
    const widget = createFeedbackWidget(
      { project: "trugenix", connectors: [download] },
      { storage: createMemoryStorage(), environment: testEnvironment }
    );

    const a = await widget.captureIssue({
      comment: "Первая проблема с шапкой",
      mode: "element",
      selector: "header .logo",
      screenshot: new Blob([new Uint8Array([137, 80, 78, 71])], {
        type: "image/png",
      }),
    });
    const b = await widget.captureIssue({
      comment: "Second issue without screenshot",
      mode: "fullpage",
    });
    await a?.delivered;
    await b?.delivered;

    const sessionId = a?.sessionId as string;
    const zipBlob = await download.buildZipBlob();
    const zip = await JSZip.loadAsync(await zipBlob.arrayBuffer());
    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);

    expect(names.sort()).toEqual(
      [
        `${sessionId}/01-pervaya-problema-s-shapkoi.md`,
        `${sessionId}/01-pervaya-problema-s-shapkoi.png`,
        `${sessionId}/02-second-issue-without-screenshot.md`,
        `${sessionId}/session.yaml`,
      ].sort()
    );

    const yamlText = await zip
      .file(`${sessionId}/session.yaml`)
      ?.async("string");
    const parsed = parse(yamlText as string);
    expect(parsed.issues).toHaveLength(2);
    // Every file referenced by the index exists in the zip.
    for (const issue of parsed.issues) {
      expect(names).toContain(`${sessionId}/${issue.file}`);
      if (issue.screenshot) {
        expect(names).toContain(`${sessionId}/${issue.screenshot}`);
      }
    }
  });
});
