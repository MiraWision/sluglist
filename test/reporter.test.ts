import { afterEach, describe, expect, it, vi } from "vitest";
import {
  normalizeContext,
  normalizeCustom,
  normalizeIdentity,
  toSnakeCase,
} from "../src/reporter";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("normalizeIdentity", () => {
  it("returns undefined when identity is not configured", () => {
    expect(normalizeIdentity(undefined)).toBeUndefined();
  });

  it("returns null when configured but empty", () => {
    expect(normalizeIdentity({})).toBeNull();
    expect(normalizeIdentity({ userId: "  ", name: "" })).toBeNull();
  });

  it("maps to snake_case keys and trims", () => {
    expect(
      normalizeIdentity({
        userId: "  u_18293 ",
        email: "user@example.com",
        name: "Anna K.",
      })
    ).toEqual({ user_id: "u_18293", email: "user@example.com", name: "Anna K." });
  });

  it("omits fields that are not provided", () => {
    expect(normalizeIdentity({ email: "a@b.co" })).toEqual({ email: "a@b.co" });
  });

  it("clips values to 200 chars", () => {
    const long = "x".repeat(300);
    const r = normalizeIdentity({ name: long });
    expect(r?.name).toHaveLength(200);
  });
});

describe("toSnakeCase", () => {
  it("normalizes camelCase, kebab and spaces", () => {
    expect(toSnakeCase("appVersion")).toBe("app_version");
    expect(toSnakeCase("app-version")).toBe("app_version");
    expect(toSnakeCase("App Version")).toBe("app_version");
    expect(toSnakeCase("plan")).toBe("plan");
    expect(toSnakeCase("HTTPStatus")).toBe("httpstatus");
  });
});

describe("normalizeCustom", () => {
  it("returns undefined when not configured", () => {
    expect(normalizeCustom(undefined)).toBeUndefined();
  });

  it("keeps primitives and normalizes keys", () => {
    expect(
      normalizeCustom({ plan: "pro", appVersion: "2.4.1", seats: 5, trial: true })
    ).toEqual({ plan: "pro", app_version: "2.4.1", seats: 5, trial: true });
  });

  it("drops a nested object value with a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const out = normalizeCustom({
      plan: "pro",
      // @ts-expect-error — testing runtime rejection of a non-primitive
      meta: { nested: true },
    });
    expect(out).toEqual({ plan: "pro" });
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain("meta");
  });

  it("drops arrays, null and non-finite numbers with a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const out = normalizeCustom({
      ok: "yes",
      // @ts-expect-error — testing runtime rejection
      arr: [1, 2],
      // @ts-expect-error — testing runtime rejection
      empty: null,
      nan: Number.NaN,
    });
    expect(out).toEqual({ ok: "yes" });
    expect(warn).toHaveBeenCalledTimes(3);
  });

  it("caps at 20 keys, dropping the rest with a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const input: Record<string, string> = {};
    for (let i = 0; i < 25; i++) {
      input[`k${i}`] = `v${i}`;
    }
    const out = normalizeCustom(input);
    expect(Object.keys(out ?? {})).toHaveLength(20);
    expect(warn).toHaveBeenCalledTimes(5);
  });

  it("clips string values to 200 chars", () => {
    const out = normalizeCustom({ note: "y".repeat(300) });
    expect((out?.note as string).length).toBe(200);
  });

  it("returns null when nothing valid survives", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    // @ts-expect-error — testing runtime rejection
    expect(normalizeCustom({ bad: { a: 1 } })).toBeNull();
  });
});

describe("normalizeContext", () => {
  it("merges across calls: updates existing keys, adds new, snake_cases", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const first = normalizeContext({ tenantId: "acme", buildVersion: "2.4.1" });
    expect(first).toEqual({ tenant_id: "acme", build_version: "2.4.1" });
    const second = normalizeContext({ tenantId: "beta", darkMode: true }, first);
    expect(second).toEqual({
      tenant_id: "beta",
      build_version: "2.4.1",
      dark_mode: true,
    });
  });

  it("drops non-primitive / non-finite values with a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const out = normalizeContext({
      ok: 1,
      nested: { x: 1 },
      nan: Number.NaN,
    });
    expect(out).toEqual({ ok: 1 });
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("returns null when empty or nothing valid survives", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(normalizeContext({})).toBeNull();
    expect(normalizeContext({ "***": "x" })).toBeNull();
  });

  it("caps at 20 keys across the merged result", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const big: Record<string, number> = {};
    for (let i = 0; i < 25; i++) {
      big[`k${i}`] = i;
    }
    expect(Object.keys(normalizeContext(big) ?? {})).toHaveLength(20);
  });

  it("clips string values to 200 chars", () => {
    const out = normalizeContext({ note: "x".repeat(250) });
    expect((out?.note as string).length).toBe(200);
  });
});
