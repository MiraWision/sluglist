import { describe, expect, it } from "vitest";
import { resolvePrivacy } from "../src/preset";
import { MemoryConnector } from "../src/connectors/memory";
import { createMemoryStorage } from "../src/session";
import { createFeedbackWidget } from "../src/widget";

const base = { project: "acme", connectors: [] };

describe("resolvePrivacy", () => {
  it("dev with no privacy → undefined (clean artifacts)", () => {
    expect(resolvePrivacy({ ...base })).toBeUndefined();
    expect(resolvePrivacy({ ...base, preset: "dev" })).toBeUndefined();
  });

  it("beta enables maskInputs + screenshotConsent by default", () => {
    expect(resolvePrivacy({ ...base, preset: "beta" })).toEqual({
      maskInputs: true,
      screenshotConsent: true,
    });
  });

  it("explicit privacy overrides the preset (maskInputs:false wins)", () => {
    expect(
      resolvePrivacy({ ...base, preset: "beta", privacy: { maskInputs: false } })
    ).toEqual({ maskInputs: false, screenshotConsent: true });
  });

  it("dev with explicit privacy is respected", () => {
    expect(
      resolvePrivacy({ ...base, privacy: { maskSelectors: [".pii"] } })
    ).toEqual({ maskSelectors: [".pii"] });
  });
});

describe("createFeedbackWidget exposes the resolved preset privacy", () => {
  const opts = { storage: createMemoryStorage() };

  it("beta → core.config.privacy has masking + consent on", () => {
    const w = createFeedbackWidget(
      { project: "acme", connectors: [new MemoryConnector()], preset: "beta" },
      opts
    );
    expect(w.config.privacy).toEqual({
      maskInputs: true,
      screenshotConsent: true,
    });
    expect(w.config.preset).toBe("beta");
  });

  it("beta + explicit maskInputs:false disables masking, keeps consent", () => {
    const w = createFeedbackWidget(
      {
        project: "acme",
        connectors: [new MemoryConnector()],
        preset: "beta",
        privacy: { maskInputs: false },
      },
      opts
    );
    expect(w.config.privacy).toEqual({
      maskInputs: false,
      screenshotConsent: true,
    });
  });

  it("dev → core.config.privacy stays undefined", () => {
    const w = createFeedbackWidget(
      { project: "acme", connectors: [new MemoryConnector()] },
      opts
    );
    expect(w.config.privacy).toBeUndefined();
  });
});
