/**
 * A small hand-drawn icon set.
 *
 * No icon library: every glyph here is a few path commands, so the whole set
 * costs less than the import statement for a package would, and it stays in the
 * same stroke weight and geometry as the diagrams. Rules for adding one:
 *
 * - 24×24 box, `stroke="currentColor"`, weight 1.6, round caps, **no fill** —
 *   so an icon inherits colour from whatever it sits in and works in both
 *   themes without a second asset.
 * - Decorative by default (`aria-hidden`): the label next to it is the accessible
 *   name. Never put meaning only in the glyph.
 */

export type IconName =
  | "bolt"
  | "crosshair"
  | "plug"
  | "checklist"
  | "shield"
  | "terminal"
  | "settings-doc"
  | "folder"
  | "pen"
  | "alert"
  | "eye-off"
  | "laptop"
  | "team"
  | "globe"
  | "robot"
  | "layers"
  | "report";

/** Path data only — the wrapper below supplies the shared attributes. */
const PATHS: Record<IconName, React.ReactNode> = {
  bolt: <path d="M13 3 5.5 13.5H11l-1 7.5 8-11H12l1-7z" />,
  crosshair: (
    <>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      <circle cx="12" cy="12" r="1.6" />
    </>
  ),
  plug: (
    <>
      <path d="M9 3v5M15 3v5" />
      <path d="M6.5 8h11v3a5.5 5.5 0 0 1-11 0V8z" />
      <path d="M12 16.5V21" />
    </>
  ),
  checklist: (
    <>
      <path d="M4 6.5 6 8.5 9.5 5" />
      <path d="M4 13.5 6 15.5 9.5 12" />
      <path d="M13 7h7M13 14h7M13 20h7" />
    </>
  ),
  shield: <path d="M12 3l7 2.5V11c0 4.5-3 7.8-7 10-4-2.2-7-5.5-7-10V5.5L12 3z" />,
  terminal: (
    <>
      <rect height="15" rx="2.5" width="19" x="2.5" y="4.5" />
      <path d="M6.5 10l2.5 2.5L6.5 15M12 15h5" />
    </>
  ),
  "settings-doc": (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" />
      <path d="M13.5 3.5V8H18" />
      <circle cx="12" cy="15" r="2" />
      <path d="M12 11.5V12M12 18v.5M9.5 15H9M15 15h-.5" />
    </>
  ),
  folder: (
    <>
      <path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h3.2l2 2.5h7.8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-11z" />
      <path d="M7.5 13.5h9" />
    </>
  ),
  pen: (
    <>
      <path d="M4 20l1-4 11-11a2.5 2.5 0 0 1 3.5 3.5L8.5 19.5 4 20z" />
      <path d="M14.5 6.5 17.5 9.5" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4.5 21 19.5H3l9-15z" />
      <path d="M12 10v4M12 16.5v.5" />
    </>
  ),
  "eye-off": (
    <>
      <path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M4 20 20 4" />
    </>
  ),
  laptop: (
    <>
      <rect height="10" rx="1.5" width="15" x="4.5" y="5" />
      <path d="M2.5 18.5h19" />
    </>
  ),
  team: (
    <>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M16 6.2a3 3 0 0 1 0 5.6M17.5 14.9c2 .7 3.2 2.4 3.2 4.6" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.5 2.5 2.5 14 0 17M12 3.5c-2.5 2.5-2.5 14 0 17" />
    </>
  ),
  robot: (
    <>
      <rect height="10" rx="2.5" width="15" x="4.5" y="8" />
      <path d="M12 4.5V8" />
      <circle cx="9" cy="13" r="1.2" />
      <circle cx="15" cy="13" r="1.2" />
      <path d="M2.5 12.5v3M21.5 12.5v3" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3.5 21 8l-9 4.5L3 8l9-4.5z" />
      <path d="M3 12.5 12 17l9-4.5" />
      <path d="M3 16.5 12 21l9-4.5" />
    </>
  ),
  report: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" />
      <path d="M13.5 3.5V8H18" />
      <path d="M8.5 17v-3M12 17v-5M15.5 17v-2" />
    </>
  ),
};

export function Icon({
  name,
  className,
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height="22"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
      viewBox="0 0 24 24"
      width="22"
    >
      {PATHS[name]}
    </svg>
  );
}

/**
 * The icon in its own tinted square — the form used in card grids, where the
 * glyph has to read as a marker rather than as part of the text.
 */
export function IconBadge({ name }: { name: IconName }) {
  return (
    <span className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg border tint-brand">
      <Icon name={name} />
    </span>
  );
}
