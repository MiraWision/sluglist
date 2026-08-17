import type { IconName } from "@/components/Icons";

export interface DocPage {
  slug: string;
  title: string;
  /** Meta description (70–160 chars). */
  description: string;
  /** Short label for indexes and prev/next navigation. */
  label: string;
  /** Marker for the docs index and the home page's "in the box" grid. */
  icon: IconName;
}

export const DOC_PAGES: DocPage[] = [
  {
    slug: "quick-start",
    icon: "bolt",
    title: "Quick start",
    label: "Quick start",
    description:
      "Install the sluglist feedback widget and mount it with one line of config: a connector, and nothing else. ESM, CJS or a script tag from a CDN.",
  },
  {
    slug: "capture",
    icon: "crosshair",
    title: "Capture modes, annotation & attachments",
    label: "Capture",
    description:
      "Full page, area, element and record-steps capture; annotation with arrow, box and text; error capture, the action trail, reporter form fields and attachments.",
  },
  {
    slug: "connectors",
    icon: "plug",
    title: "Connectors: deliver feedback anywhere",
    label: "Connectors",
    description:
      "A connector is the only place that knows about storage. Recipes for an API route, Vercel Blob, S3/R2 and Supabase Storage — with no write-keys in the browser.",
  },
  {
    slug: "checklist",
    icon: "checklist",
    title: "Checklist mode: structured acceptance",
    label: "Checklist mode",
    description:
      "Pre-seed an acceptance checklist the client walks and checks off. Verdicts land in session.yaml as a coverage map — and an agent can generate the list from a branch diff.",
  },
  {
    slug: "production",
    icon: "shield",
    title: "Production & beta: presets, privacy, PII scrubbing",
    label: "Production",
    description:
      "The beta and production presets: input masking, screenshot consent, PII text scrubbing, dismiss, localization, and the checklist to walk before real users see the widget.",
  },
  {
    slug: "agents",
    icon: "terminal",
    title: "Agents & CLI: the local feedback loop",
    label: "Agents & CLI",
    description:
      "Run npx sluglist dev, click feedback on your own app, and let an agent fix it — plus the four bundled skills, sluglist status, and the loop that runs until green.",
  },
  {
    slug: "project-conventions",
    icon: "settings-doc",
    title: "Project conventions: .sluglist/PROJECT.md",
    label: "Project conventions",
    description:
      "One committed file holds your base branch, how to run and sign in, the hard limits QA must never complete, and evidence defaults — so the bundled skills stay upgradeable.",
  },
  {
    slug: "artifacts",
    icon: "folder",
    title: "Artifact format (contract)",
    label: "Artifact format",
    description:
      "Every session is a folder: session.yaml plus one markdown file per issue with YAML frontmatter. A stable, additively-versioned contract for downstream parsers and agents.",
  },
];

export function getDocPage(slug: string): DocPage | undefined {
  return DOC_PAGES.find((d) => d.slug === slug);
}
