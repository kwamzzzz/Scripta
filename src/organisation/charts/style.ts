/**
 * How a chart's lines and boxes are drawn, chosen by the lawyer.
 *
 * The choices come from the firm's own structure decks in the Template Bank:
 * squared arms that leave a card from the middle of its bottom edge and enter
 * the middle of the next card's top; a second shareholder that comes in at the
 * side of the card it holds (the 51% line into MEA FZCO) or joins the first
 * holder's arm just above it (the 25% / 75% target slide); navy lines, with or
 * without arrowheads; square white cards with a navy edge, or tinted ones.
 *
 * Every line meets a card at the middle of an edge, whatever is chosen. That
 * is not an option: a line that lands somewhere along an edge reads as though
 * it belongs to whatever sits beside it.
 */
import { TONE_COLOURS } from "./build";
import type { ChartNode, EdgeStyle } from "./layout";

export type ChartStyle = {
  /** Squared arms, or one straight line from card to card. */
  connector: "squared" | "straight";
  /** Where a second holder's line enters a card that already has one from above. */
  secondHolder: "side" | "joined";
  arrows: boolean;
  weight: "fine" | "regular" | "bold";
  colour: "navy" | "grey";
  corners: "square" | "rounded";
  /** Tinted cards by kind and jurisdiction, or white cards with a navy edge. */
  boxes: "tinted" | "outlined";
};

export const DEFAULT_STYLE: ChartStyle = {
  connector: "squared",
  secondHolder: "side",
  arrows: false,
  weight: "regular",
  colour: "navy",
  corners: "square",
  boxes: "tinted",
};

/** Screen pixels; the files scale from these. */
export const LINE_WIDTH: Record<ChartStyle["weight"], number> = {
  fine: 0.9,
  regular: 1.4,
  bold: 2.2,
};

/** Line colours as the decks draw them: navy #1C2B6B, or the lighter slate of the first deck. */
export const LINE_COLOUR: Record<ChartStyle["colour"], string> = {
  navy: "#1C2B6B",
  grey: "#9AA4B0",
};

/** New or re-routed ownership, dashed, in the decks' lighter navy. */
export const ADDED_COLOUR = "#7F8CB5";
export const REMOVED_COLOUR = "#B4483A";
export const FUNCTIONAL_COLOUR = "#247A78";

export const OUTLINED_BOX = { fill: "#FFFFFF", stroke: "#1C2B6B", ink: "#1C2B6B" };

export const CORNER_RADIUS: Record<ChartStyle["corners"], number> = { square: 0, rounded: 6 };

/**
 * The style this browser chose before chart designs were kept for the firm.
 * Read once, to carry it over; `null` when nothing was chosen.
 */
export function legacyStyle(clientId: string, kind: "reporting" | "ownership"): ChartStyle | null {
  try {
    const raw = window.localStorage.getItem(`px.org.chart-style.${clientId}.${kind}`);
    if (!raw) return null;
    return { ...DEFAULT_STYLE, ...(JSON.parse(raw) as Partial<ChartStyle>) };
  } catch {
    return null;
  }
}

/** Text that reads on a fill: white on dark cards, navy on light ones. */
export const inkFor = (fill: string) => {
  const n = parseInt(fill.replace("#", ""), 16);
  if (!Number.isFinite(n)) return "#123247";
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return luminance > 0.36 ? "#123247" : "#FFFFFF";
};

/** A card edge a shade darker than its fill, so a coloured card keeps a crisp edge. */
export const edgeFor = (fill: string) => {
  const n = parseInt(fill.replace("#", ""), 16);
  if (!Number.isFinite(n)) return "#8E999C";
  const shade = (v: number) => Math.max(0, Math.round(v * 0.82));
  const r = shade((n >> 16) & 255);
  const g = shade((n >> 8) & 255);
  const b = shade(n & 255);
  return `#${[r, g, b]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
};

/** The colour of a line in a style. Functional, added and removed lines keep their meaning. */
export const edgeColour = (style: ChartStyle, edge: EdgeStyle) =>
  edge === "dotted"
    ? FUNCTIONAL_COLOUR
    : edge === "added"
      ? ADDED_COLOUR
      : edge === "removed"
        ? REMOVED_COLOUR
        : LINE_COLOUR[style.colour];

/** Fill, edge and ink for a card in a style; a state (added, flagged) still shows. */
export const nodeColours = (style: ChartStyle, n: Pick<ChartNode, "tone" | "state" | "kind">) => {
  const tinted = TONE_COLOURS[n.tone];
  const base =
    style.boxes === "outlined" && n.kind !== "group"
      ? n.tone === "vacant" || n.tone === "proposed"
        ? { fill: "#FFFFFF", stroke: ADDED_COLOUR, ink: "#1C2B6B" }
        : OUTLINED_BOX
      : tinted;
  if (n.state === "added") return { ...base, stroke: ADDED_COLOUR };
  if (n.state === "removed") return { ...base, stroke: REMOVED_COLOUR };
  if (n.state === "flagged") return { ...base, stroke: "#C9822B" };
  return base;
};

export const routeOf = (style: ChartStyle) => ({
  connector: style.connector,
  secondHolder: style.secondHolder,
});
