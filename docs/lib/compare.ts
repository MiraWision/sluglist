export interface CompareRow {
  label: string;
  sluglist: string;
  other: string;
}

export interface ComparePage {
  slug: string;
  /** Competitor display name. */
  name: string;
  metaTitle: string;
  description: string;
  intro: string;
  /** What the competitor is, stated fairly. */
  otherSummary: string;
  rows: CompareRow[];
  /** When the competitor is the better fit — honesty converts. */
  pickOtherWhen: string[];
  pickSluglistWhen: string[];
  faq: { q: string; a: string }[];
}

const COMMON_ROWS = {
  license: (other: string): CompareRow => ({
    label: "License & hosting",
    sluglist:
      "MIT open source. No hosted service, no accounts — artifacts go to storage you own via connectors.",
    other,
  }),
  pricing: (other: string): CompareRow => ({
    label: "Pricing",
    sluglist: "Free. Your only cost is your own storage/endpoint.",
    other,
  }),
  agents: (other: string): CompareRow => ({
    label: "Coding agents",
    sluglist:
      "First-class: artifacts are markdown/YAML files an agent reads; bundled Claude Code skills fix reported issues and generate acceptance checklists from a branch diff.",
    other,
  }),
  privacy: (other: string): CompareRow => ({
    label: "Data flow & privacy",
    sluglist:
      "Zero phone-home (test-enforced). Input masking, PII text scrubbing, screenshot consent under the production preset.",
    other,
  }),
  workflow: (other: string): CompareRow => ({
    label: "Triage workflow",
    sluglist:
      "None by design — one-way capture with a stable artifact format you pipe into your own tracker.",
    other,
  }),
};

export const COMPARE_PAGES: ComparePage[] = [
  {
    slug: "marker-io",
    name: "Marker.io",
    metaTitle: "sluglist vs Marker.io: open-source feedback widget alternative",
    description:
      "Marker.io is a hosted visual feedback service with tracker integrations. sluglist is an MIT widget with self-owned delivery and agent-ready artifacts. An honest comparison.",
    intro:
      "Both put a feedback button on a website and capture annotated screenshots with technical context. The difference is the shape of the product: Marker.io is a hosted service with a triage workflow and native project-management integrations; sluglist is an open-source widget that produces files and hands them to storage you own.",
    otherSummary:
      "Marker.io is a commercial, hosted website-feedback service: reporters annotate a screenshot in the browser, and reports flow into a web dashboard and two-way integrations with trackers such as Jira, Trello, Asana, GitHub or ClickUp. It targets agencies and product teams that want feedback triaged inside their existing PM tool, and is priced as a subscription per team.",
    rows: [
      COMMON_ROWS.license(
        "Proprietary SaaS — reports and screenshots are stored on Marker.io's servers and viewed in their dashboard."
      ),
      COMMON_ROWS.pricing("Subscription, per team/seats, with a free trial."),
      {
        label: "Tracker integrations",
        sluglist:
          "Via your connector: parse the documented artifact format and create issues anywhere (~50 lines for a thin endpoint).",
        other:
          "Native two-way integrations (Jira, Trello, Asana, GitHub, ClickUp and more) with status sync — its core strength.",
      },
      COMMON_ROWS.agents(
        "Reports live in the hosted dashboard/tracker; not designed as local files for an agent loop."
      ),
      COMMON_ROWS.workflow(
        "Built-in: statuses, assignments, comment threads with reporters, and status sync back from the tracker."
      ),
      COMMON_ROWS.privacy(
        "Data is processed and stored by the service; capabilities depend on plan and their policies."
      ),
      {
        label: "Acceptance checklists",
        sluglist:
          "Built in: pre-seed a checklist, get a pass/fail/unchecked coverage map in session.yaml — or generate the list from a branch diff.",
        other: "Not the product's model; feedback is free-form reports.",
      },
    ],
    pickOtherWhen: [
      "You want feedback triaged inside Jira/Asana/ClickUp with two-way status sync, out of the box.",
      "You need reporter-facing replies and status notifications handled for you.",
      "You'd rather pay a subscription than run a ~50-line endpoint.",
    ],
    pickSluglistWhen: [
      "You want an open-source (MIT) widget with no per-seat pricing and no vendor account.",
      "Screenshots and reports must stay on infrastructure you own.",
      "You run a coding-agent loop: feedback as local files that Claude Code reads and fixes.",
      "You want structured acceptance checklists with a coverage map, not just free-form reports.",
    ],
    faq: [
      {
        q: "Is sluglist a drop-in replacement for Marker.io?",
        a: "For capture, yes: annotated screenshots, console errors, environment metadata and a feedback button. It deliberately does not replace Marker.io's hosted dashboard, statuses and two-way tracker sync — you pipe artifacts into your own tracker instead.",
      },
      {
        q: "Can sluglist send reports to Jira or GitHub like Marker.io does?",
        a: "Yes, through a connector you write against the documented artifact format — typically a thin endpoint that creates the issue and attaches the screenshot. It is a small amount of code you own, rather than a built-in toggle.",
      },
      {
        q: "Which is better for client feedback on agency projects?",
        a: "If the agency lives in a PM tool and wants zero code, Marker.io's integrations are the shorter path. If you want the client walking a release checklist on staging with a coverage map, and reports stored on your side, sluglist's checklist mode is built for exactly that.",
      },
    ],
  },
  {
    slug: "usersnap",
    name: "Usersnap",
    metaTitle: "sluglist vs Usersnap: open-source feedback widget alternative",
    description:
      "Usersnap is a hosted feedback platform with surveys and a triage dashboard. sluglist is an MIT widget with self-owned delivery and agent-ready artifacts. An honest comparison.",
    intro:
      "Usersnap is a feedback platform — screenshots plus surveys, NPS/CSAT, feature-request boards and a triage dashboard. sluglist deliberately covers only the capture step, as an open-source widget whose output is clean files delivered to storage you own.",
    otherSummary:
      "Usersnap is a commercial, hosted user-feedback platform: a screen-capture widget (screenshots and screen recordings) combined with survey tooling — NPS, CSAT, feature-request collection — a web dashboard for triage, and integrations with trackers and communication tools. It targets product teams that want a full voice-of-customer program, priced as a subscription.",
    rows: [
      COMMON_ROWS.license(
        "Proprietary SaaS — feedback is stored and triaged on Usersnap's platform."
      ),
      COMMON_ROWS.pricing("Subscription tiers by features and volume, with a free trial."),
      {
        label: "Scope",
        sluglist:
          "Bug/feedback capture only: screenshot, annotation, errors, action trail, checklists. No surveys, ratings or boards — by design.",
        other:
          "Broad: screen capture plus surveys (NPS/CSAT), feature-request boards, and feedback analytics.",
      },
      {
        label: "Screen recording",
        sluglist:
          "Record mode: numbered screenshot frames per click/navigation — steps-to-reproduce an agent can read. No video, deliberately.",
        other: "Video screen recordings for human review.",
      },
      COMMON_ROWS.agents(
        "Feedback lives in the hosted dashboard; not designed as local files for an agent loop."
      ),
      COMMON_ROWS.workflow(
        "Built-in: dashboard triage, assignments, labels, and tracker integrations."
      ),
      COMMON_ROWS.privacy(
        "Data is processed and stored by the platform; capabilities depend on plan and their policies."
      ),
    ],
    pickOtherWhen: [
      "You want surveys, NPS/CSAT and feature-request boards in the same tool as bug reports.",
      "Product managers will triage feedback in a dashboard, not a repo or tracker you script.",
      "You want video recordings a human watches.",
    ],
    pickSluglistWhen: [
      "You need the capture step only, embedded in your app, MIT-licensed and free.",
      "Reports must land on your own storage with PII masked and scrubbed.",
      "Your loop is developer- or agent-driven: files in a folder, fixed by Claude Code.",
      "You want release-acceptance checklists with a coverage map.",
    ],
    faq: [
      {
        q: "Does sluglist do surveys or NPS like Usersnap?",
        a: "No. sluglist is deliberately one-way visual feedback capture. If you need a voice-of-customer program with surveys and boards, a platform like Usersnap fits; sluglist covers the bug-reporting widget with structured, self-hosted output.",
      },
      {
        q: "Does sluglist record the screen?",
        a: "It records steps, not video: a screenshot frame per click, navigation or submit, cross-referenced with the action trail. That output is smaller, privacy-maskable frame by frame, and readable by a coding agent.",
      },
      {
        q: "Can I self-host Usersnap-style feedback with sluglist?",
        a: "Yes — that is the design. The widget delivers artifacts through your connector to your storage (an API route in front of Vercel Blob, S3/R2 or Supabase is ~50 lines), and there is no vendor server involved at all.",
      },
    ],
  },
  {
    slug: "bugherd",
    name: "BugHerd",
    metaTitle: "sluglist vs BugHerd: open-source feedback widget alternative",
    description:
      "BugHerd pins client feedback to page elements and manages it on a kanban board. sluglist is an MIT widget with self-owned delivery and agent-ready artifacts. An honest comparison.",
    intro:
      "BugHerd's signature is sticky-note feedback pinned to page elements, flowing into a hosted kanban board — loved by agencies collecting website feedback from clients. sluglist captures the same kind of element-anchored reports, but outputs them as files with CSS selectors and error context, delivered to storage you own.",
    otherSummary:
      "BugHerd is a commercial, hosted website-feedback tool: clients and testers pin comments to specific page elements (via a widget or browser extension), each pin carrying a screenshot and technical metadata, and everything is managed on BugHerd's kanban board with tracker integrations. It targets agencies and web teams, priced as a subscription.",
    rows: [
      COMMON_ROWS.license(
        "Proprietary SaaS — feedback lives on BugHerd's kanban board and servers."
      ),
      COMMON_ROWS.pricing("Subscription, per plan/members, with a free trial."),
      {
        label: "Element anchoring",
        sluglist:
          "Element mode records a smart CSS selector (data-testid → id → aria → landmark), element text, DOM path and a React component hint — machine-readable localization.",
        other:
          "Pins feedback visually to the element on the page — excellent for humans scanning a page for notes.",
      },
      COMMON_ROWS.agents(
        "Tasks live on the hosted board; not designed as local files for an agent loop."
      ),
      COMMON_ROWS.workflow(
        "Built-in kanban board with columns, assignments and severity, plus tracker integrations."
      ),
      {
        label: "Acceptance checklists",
        sluglist:
          "Built in: the client walks a checklist on staging; verdicts land in session.yaml as a coverage map; flags open linked issues.",
        other: "Not the model; feedback is ad-hoc pinned tasks.",
      },
      COMMON_ROWS.privacy(
        "Data is processed and stored by the service; capabilities depend on plan and their policies."
      ),
    ],
    pickOtherWhen: [
      "Your clients and PMs want a visual kanban board with pins on the page, zero setup on your side.",
      "You want membership, assignments and severity handled in a hosted tool.",
      "Website-design review with many ad-hoc visual notes is the main job.",
    ],
    pickSluglistWhen: [
      "You want element-anchored reports as data (selector + component + errors), not just pins for humans.",
      "Client sign-off should be a structured checklist with a coverage map, not a pile of notes.",
      "Feedback must stay on your infrastructure; the widget must be MIT and free.",
      "A coding agent (Claude Code) is part of your fix loop.",
    ],
    faq: [
      {
        q: "Does sluglist show feedback pinned on the page like BugHerd?",
        a: "No — sluglist has no overlay of past reports. It captures element-anchored reports (selector, DOM path, component hint, screenshot) as files for your tracker or agent. BugHerd is the better fit if stakeholders review feedback visually on the page itself.",
      },
      {
        q: "Can clients use sluglist without accounts, like BugHerd guests?",
        a: "Yes — there are no accounts at all. The widget is on your staging site; identity, if you need it, comes from your app or from a reporter form field.",
      },
      {
        q: "Which handles client acceptance testing better?",
        a: "BugHerd collects ad-hoc feedback well, but sluglist's checklist mode is purpose-built for sign-off: the client walks the list of what shipped, and you get pass/fail/never-checked per item, with flagged issues linked. See the client-acceptance use case.",
      },
    ],
  },
];

export function getComparePage(slug: string): ComparePage | undefined {
  return COMPARE_PAGES.find((c) => c.slug === slug);
}
