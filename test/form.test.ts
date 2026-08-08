// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryConnector } from "../src/connectors/memory";
import {
  collectValues,
  MAX_FORM_FIELDS,
  MAX_FORM_VALUE_LENGTH,
  normalizeForm,
  validateValue,
} from "../src/form";
import { NOOP_ACTION_CAPTURE } from "../src/actions";
import { NOOP_ERROR_CAPTURE } from "../src/errors";
import { createMemoryStorage } from "../src/session";
import type { ArtifactFile, FormField } from "../src/types";
import { createFeedbackWidget } from "../src/widget";
import { mountFeedbackWidget, type MountedFeedbackWidget } from "../src/ui/mount";

const environment = () => ({
  baseUrl: "https://app.example",
  url: "/checkout",
  viewport: "1512x982",
  screen: "1512x982",
  devicePixelRatio: 2,
  browser: "Chrome 140",
  os: "macOS",
  language: "en-US",
  languages: ["en-US"],
  timezone: "Europe/Berlin",
  colorScheme: "light",
  reducedMotion: false,
});

const FIELDS: FormField[] = [
  { id: "email", label: "Your email", type: "email", scope: "session" },
  {
    id: "environment",
    label: "Device",
    type: "text",
    scope: "session",
  },
  {
    id: "severity",
    label: "How bad is it?",
    type: "select",
    options: ["blocking", "annoying", "cosmetic"],
    required: true,
    scope: "issue",
  },
];

describe("form config validation", () => {
  it("keeps valid fields and snake_cases the key", () => {
    const fields = normalizeForm(FIELDS);
    expect(fields.map((f) => f.key)).toEqual([
      "email",
      "environment",
      "severity",
    ]);
  });

  it("returns an empty list when no form is configured", () => {
    expect(normalizeForm(undefined)).toEqual([]);
  });

  it("drops invalid fields with a warning and keeps the rest", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fields = normalizeForm([
      { id: "ok", label: "Fine", type: "text", scope: "issue" },
      { id: "", label: "No id", type: "text", scope: "issue" },
      { id: "nolabel", label: "  ", type: "text", scope: "issue" },
      { id: "badtype", label: "x", type: "range" as never, scope: "issue" },
      { id: "badscope", label: "x", type: "text", scope: "global" as never },
      { id: "emptyselect", label: "x", type: "select", scope: "issue" },
      { id: "ok", label: "Duplicate", type: "text", scope: "issue" },
    ]);
    expect(fields.map((f) => f.key)).toEqual(["ok"]);
    expect(warn).toHaveBeenCalledTimes(6);
    warn.mockRestore();
  });

  it("caps the list at 8 fields", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const many: FormField[] = Array.from({ length: 12 }, (_, i) => ({
      id: `f${i}`,
      label: `Field ${i}`,
      type: "text" as const,
      scope: "issue" as const,
    }));
    expect(normalizeForm(many)).toHaveLength(MAX_FORM_FIELDS);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("value validation", () => {
  const [email, , severity] = normalizeForm(FIELDS);

  it("required blocks an empty value", () => {
    expect(validateValue(severity, undefined)).toBe("required");
    expect(validateValue(severity, "blocking")).toBeNull();
  });

  it("optional fields accept nothing at all", () => {
    expect(validateValue(email, undefined)).toBeNull();
    expect(validateValue(email, "")).toBeNull();
  });

  it("email must look like an address", () => {
    expect(validateValue(email, "not-an-email")).toBe("email");
    expect(validateValue(email, "anna@client.com")).toBeNull();
  });

  it("a required checkbox must be checked", () => {
    const [box] = normalizeForm([
      { id: "consent", label: "Ok", type: "checkbox", required: true, scope: "issue" },
    ]);
    expect(validateValue(box, false)).toBe("required");
    expect(validateValue(box, true)).toBeNull();
  });
});

describe("value collection", () => {
  it("clips values to 500 characters", () => {
    const fields = normalizeForm([
      { id: "notes", label: "Notes", type: "text", scope: "issue" },
    ]);
    const values = collectValues(
      fields,
      new Map([["notes", "x".repeat(900)]])
    );
    expect((values?.notes as string).length).toBe(MAX_FORM_VALUE_LENGTH);
  });

  it("omits untouched optional fields rather than writing empty strings", () => {
    const fields = normalizeForm(FIELDS);
    expect(collectValues(fields, new Map([["email", "  "]]))).toBeUndefined();
  });
});

describe("session vs issue scope in artifacts", () => {
  let memory: MemoryConnector;

  function core() {
    return createFeedbackWidget(
      {
        project: "acme",
        connectors: [memory],
        offlineQueue: false,
        form: FIELDS,
      },
      {
        environment,
        storage: createMemoryStorage(),
        actionCapture: NOOP_ACTION_CAPTURE,
        errorCapture: NOOP_ERROR_CAPTURE,
      }
    );
  }

  beforeEach(() => {
    memory = new MemoryConnector();
  });

  it("session answers land in session.yaml, issue answers in frontmatter", async () => {
    const widget = core();
    expect(widget.needsSessionForm()).toBe(true);
    widget.setSessionForm({
      email: "anna@client.com",
      environment: "iPhone Safari",
    });
    const first = await widget.captureIssue({
      comment: "Checkout is broken",
      mode: "fullpage",
      screenshots: [],
      selector: null,
      form: { severity: "blocking" },
    });
    await first?.delivered;
    const session = await (
      memory.getFile(first?.sessionId ?? "", "session.yaml") as ArtifactFile
    ).blob.text();
    expect(session).toContain('form:\n  email: "anna@client.com"');
    expect(session).toContain("  environment: iPhone Safari");
    // The per-issue answer must NOT leak into the session block.
    expect(session).not.toContain("severity");

    const md = await (
      memory.getFile(
        first?.sessionId ?? "",
        "01-checkout-is-broken.md"
      ) as ArtifactFile
    ).blob.text();
    expect(md).toContain("form:\n  severity: blocking");
  });

  it("the session block is asked once — not again on the second issue", async () => {
    const widget = core();
    widget.setSessionForm({ email: "anna@client.com" });
    expect(widget.needsSessionForm()).toBe(false);
    await widget.captureIssue({
      comment: "First",
      mode: "fullpage",
      screenshots: [],
      selector: null,
    });
    expect(widget.needsSessionForm()).toBe(false);
  });

  it("form values are not scrubbed, even under the production preset", async () => {
    const widget = createFeedbackWidget(
      {
        project: "acme",
        connectors: [memory],
        offlineQueue: false,
        preset: "production",
        form: FIELDS,
      },
      {
        environment,
        storage: createMemoryStorage(),
        actionCapture: NOOP_ACTION_CAPTURE,
        errorCapture: NOOP_ERROR_CAPTURE,
      }
    );
    const result = await widget.captureIssue({
      comment: "Call me back",
      mode: "fullpage",
      screenshots: [],
      selector: null,
      form: { email: "anna@client.com" },
    });
    await result?.delivered;
    const md = await (
      memory.getFile(result?.sessionId ?? "", "01-call-me-back.md") as ArtifactFile
    ).blob.text();
    // The reporter typed it into a field labelled "Your email" on purpose.
    expect(md).toContain("anna@client.com");
  });
});

describe("mounted panel", () => {
  let ui: MountedFeedbackWidget | null = null;

  afterEach(() => {
    ui?.unmount();
    ui = null;
    document.body.innerHTML = "";
  });

  function mount(form?: FormField[]) {
    const widget = createFeedbackWidget(
      {
        project: "acme",
        connectors: [new MemoryConnector()],
        offlineQueue: false,
        ...(form ? { form } : {}),
      },
      {
        environment,
        storage: createMemoryStorage(),
        actionCapture: NOOP_ACTION_CAPTURE,
        errorCapture: NOOP_ERROR_CAPTURE,
      }
    );
    ui = mountFeedbackWidget(widget);
    const host = document.querySelector("[data-feedback-widget]");
    return (host as HTMLElement).shadowRoot as ShadowRoot;
  }

  function openCommentOnly(shadow: ShadowRoot): void {
    (shadow.querySelector(".fab") as HTMLButtonElement).click();
    const items = [...shadow.querySelectorAll(".menu button")];
    (items.at(-1) as HTMLButtonElement).click(); // comment-only
  }

  it("renders no form containers when `form` is not configured", () => {
    const shadow = mount();
    openCommentOnly(shadow);
    const blocks = shadow.querySelectorAll(".form-block");
    for (const block of blocks) {
      expect((block as HTMLElement).style.display).toBe("none");
    }
    expect(shadow.querySelectorAll(".form-row")).toHaveLength(0);
  });

  it("asks session + issue fields on the first issue", () => {
    const shadow = mount(FIELDS);
    openCommentOnly(shadow);
    const sessionRows = shadow.querySelectorAll(".form-session .form-row");
    const issueRows = shadow.querySelectorAll(".form-issue .form-row");
    expect(sessionRows).toHaveLength(2);
    expect(issueRows).toHaveLength(1);
  });

  it("required blocks the send and highlights the row", async () => {
    const shadow = mount([
      {
        id: "account",
        label: "Account id",
        type: "text",
        required: true,
        scope: "issue",
      },
    ]);
    openCommentOnly(shadow);
    const comment = shadow.querySelector("textarea") as HTMLTextAreaElement;
    comment.value = "Something is off";
    (shadow.querySelector(".send") as HTMLButtonElement).click();
    await Promise.resolve();
    expect(
      shadow.querySelector('.form-row[data-field="account"]')?.classList
    ).toContain("invalid");
    expect(
      (shadow.querySelector(".form-error") as HTMLElement).style.display
    ).toBe("block");
    // The panel is still open — nothing was sent.
    expect((shadow.querySelector(".panel") as HTMLElement).style.display).toBe(
      "flex"
    );
  });
});
