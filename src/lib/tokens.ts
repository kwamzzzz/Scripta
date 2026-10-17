import type { Change, ClauseStatus, Risk, Verdict } from "@/data/legal";
import type { CSSProperties } from "react";

/** Scripta Enterprise (v2): a warm canvas, near-white surfaces, one solid navy
 *  for actions and low-saturation status tints. The same values are declared as
 *  CSS variables in styles.css (:root) so stylesheets and inline styles agree. */
export const C = {
  // Surfaces
  appBg: "#F5F4F1",
  panel: "#FDFCFA",
  canvas: "#FDFCFA",
  pageOuter: "#F5F4F1",
  sunken: "#F1EFEB",

  // Rules — three weights so structure can be expressed without boxes
  border: "#D6D2CA",
  cardRule: "#E6E3DD",
  rowRule: "#EDEAE5",

  // Ink
  text: "#23221F",
  body: "#23221F",
  secondary: "#5C5953",
  muted: "#6F6B64",
  faint: "#8A857D",

  // Solid navy: the one colour that means "act here".
  accent: "#243660",
  accentHover: "#1C2B4E",
  accentTint: "#EAEDF4",
  accentEdge: "#C9D0E0",
  rowSel: "#EAEDF4",

  // Sources and knowledge: a quieter navy, never a second hue competing with actions.
  warm: "#2A3D6B",
  warmSoft: "#3B4F7E",
  warmTint: "#E9ECF4",
  warmEdge: "#C9D0E0",

  // Semantic, low saturation
  green: "#2E5A3B",
  amber: "#6A4D14",
  red: "#7B2F25",

  // AI-proposed context: a muted slate violet, distinct from edits by you.
  violet: "#4F4A7A",
  violetTint: "#EFEEF5",
  violetEdge: "#D7D5E6",
} as const;

/** v2: one face. Metadata (references, dates, counts) is set in Geist like the
 *  rest of the interface; the name `mono` is kept for its many callers. */
export const mono = "'Geist', ui-sans-serif, system-ui, sans-serif";
export const serif = "'Century Schoolbook', Georgia, serif";
export const sans = "'Geist', ui-sans-serif, system-ui, sans-serif";

/** Figures, clause numbers, dates and counts must not jitter between values. */
export const tabular = { fontVariantNumeric: "tabular-nums" } as const;

export const type = {
  micro: 11, // uppercase section labels
  meta: 12, // metadata, counts, timestamps
  small: 13, // secondary interface text
  base: 14, // interface default
  reading: 16, // long-form clause and transcript reading
  title: 19,
  display: 24,
} as const;

/** Two densities: comfortable for reading, compact for scanning long registers. */
export const density = {
  comfortable: { row: 44, pad: 16, gap: 14, line: 1.65 },
  compact: { row: 36, pad: 12, gap: 10, line: 1.55 },
} as const;
export type Density = keyof typeof density;

export const radius = { sm: 6, md: 8, lg: 12, xl: 16, pill: 999 } as const;

/** Almost flat: borders carry structure, shadow is kept for things that float. */
export const elevation = {
  none: "none",
  hairline: "0 1px 2px rgba(35,34,31,0.05)",
  raised: "0 1px 2px rgba(35,34,31,0.06), 0 8px 24px rgba(35,34,31,0.10)",
  overlay: "0 2px 4px rgba(35,34,31,0.06), 0 24px 56px rgba(35,34,31,0.18)",
} as const;

/** One curve, short durations. Motion confirms a change; it never performs. */
export const motion = {
  fast: "120ms",
  base: "160ms",
  slow: "220ms",
  ease: "cubic-bezier(0.2, 0, 0, 1)",
} as const;
export const transition = (props: string, d: string = motion.base) =>
  props
    .split(",")
    .map((p) => `${p.trim()} ${d} ${motion.ease}`)
    .join(", ");

/** Scripta's entry experience establishes the next iteration of the product
 * identity. Opt in with scriptaTheme + .scripta-ui while screens are reviewed;
 * existing workbench tokens retain their current appearance. */
export const identity = {
  paper: "#FDFCFA",
  ink: "#23221F",
  inkHover: "#1C2B4E",
  /** Historically "teal"; in v2 the accent is the navy that marks actions. */
  teal: "#243660",
  tealTint: "#EAEDF4",
  muted: "#6F6B64",
  border: "#D6D2CA",
  inputEdge: "#C9C4BB",
  placeholder: "#A09C95",
  rule: "#E6E3DD",
  /** The row you have chosen. */
  selected: "#EAEDF4",
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, section: 48 } as const;

/** A CSS bridge to the same canonical tokens used by React primitives. */
export const scriptaTheme = {
  "--scripta-selected": identity.selected,
  "--scripta-paper": identity.paper,
  "--scripta-surface": C.panel,
  "--scripta-ink": identity.ink,
  "--scripta-ink-hover": identity.inkHover,
  "--scripta-teal": identity.teal,
  "--scripta-teal-tint": identity.tealTint,
  "--scripta-muted": identity.muted,
  "--scripta-border": identity.border,
  "--scripta-input-edge": identity.inputEdge,
  "--scripta-placeholder": identity.placeholder,
  "--scripta-rule": identity.rule,
  "--scripta-error": C.red,
  "--scripta-success": C.green,
  "--scripta-font-ui": sans,
  /* v2 headings are set in the interface face; documents keep --scripta-serif. */
  "--scripta-font-display": sans,
  "--scripta-font-mono": mono,
  "--scripta-radius": `${radius.md}px`,
  "--scripta-space-sm": `${space.sm}px`,
  "--scripta-space-lg": `${space.lg}px`,
  "--scripta-space-xl": `${space.xl}px`,
  "--scripta-transition": `${motion.base} ${motion.ease}`,
} as CSSProperties;

/* ------------------------------------------------------------------ */
/* Review taxonomy                                                     */
/* ------------------------------------------------------------------ */

/**
 * The six states a reviewed clause can be in. Kept as one table so a badge, a
 * filter chip and a left border can never disagree about what "deviation" means.
 */
export type ReviewState = "aligned" | "review" | "high-risk" | "missing" | "deviation" | "approval";

export const reviewStates: Record<
  ReviewState,
  { label: string; fg: string; bg: string; edge: string; dot: string }
> = {
  aligned: { label: "Aligned", fg: C.green, bg: "#E7EFE8", edge: "#CFDDD2", dot: "#5E8A6B" },
  review: { label: "Review required", fg: C.amber, bg: "#F6EEDC", edge: "#E6D8B8", dot: "#A98A4A" },
  "high-risk": { label: "High risk", fg: C.red, bg: "#F5E6E2", edge: "#E6CFC9", dot: "#9E5A4F" },
  missing: { label: "Missing clause", fg: C.red, bg: "#F5E6E2", edge: "#E6CFC9", dot: "#9E5A4F" },
  deviation: { label: "Deviation", fg: C.amber, bg: "#F6EEDC", edge: "#E6D8B8", dot: "#A98A4A" },
  approval: {
    label: "Approval required",
    fg: C.violet,
    bg: C.violetTint,
    edge: C.violetEdge,
    dot: C.violet,
  },
};

/** Provenance of a piece of text — the app must never blur these together. */
export type Provenance = "source" | "ai" | "user" | "approved" | "draft";

export const provenance: Record<Provenance, { label: string; fg: string; bg: string }> = {
  source: { label: "From document", fg: C.secondary, bg: C.sunken },
  ai: { label: "AI-proposed", fg: C.violet, bg: C.violetTint },
  user: { label: "Edited by you", fg: C.accent, bg: C.accentTint },
  approved: { label: "Approved", fg: C.green, bg: "#E7EFE8" },
  draft: { label: "Draft", fg: C.muted, bg: C.sunken },
};

/* ------------------------------------------------------------------ */
/* Existing maps — values refreshed, keys unchanged                    */
/* ------------------------------------------------------------------ */

export const statusColors: Record<ClauseStatus, [string, string]> = {
  Accepted: ["#E7EFE8", C.green],
  Escalated: ["#F5E6E2", C.red],
  Open: ["#F6EEDC", C.amber],
  "For discussion": ["#F6EEDC", C.amber],
  Draft: [C.accentTint, C.accent],
};

export const riskColors: Record<Risk, string> = {
  Low: "#A7BCAB",
  Medium: "#BF9B57",
  High: "#9E5A4F",
};

export const changeColors: Record<Change, string> = {
  Modified: C.amber,
  Added: C.green,
  Deleted: C.red,
  /** A single contract reviewed on its own — nothing was compared. */
  Baseline: C.muted,
};

export const verdictColors: Record<Verdict, string> = {
  Consistent: C.green,
  Fallback: C.amber,
  "Red flag": C.red,
  Escalate: C.red,
};

export const verdictCardBg = (v: Verdict) =>
  v === "Consistent" ? "#F1F5F1" : v === "Fallback" ? "#FAF5EA" : "#F9F0ED";

export const verdictCardBorder = (v: Verdict) =>
  v === "Consistent" ? "#CFDDD2" : v === "Fallback" ? "#E6D8B8" : "#E6CFC9";

export const verdictPillBg: Record<Verdict, string> = {
  Consistent: "#E7EFE8",
  Fallback: "#F6EEDC",
  "Red flag": "#F5E6E2",
  Escalate: "#F5E6E2",
};

export const readMark: Record<ClauseStatus, string> = {
  Accepted: "REVIEWED",
  Escalated: "ESCALATED",
  Open: "OPEN",
  "For discussion": "FOR DISCUSSION",
  Draft: "DRAFT",
};
