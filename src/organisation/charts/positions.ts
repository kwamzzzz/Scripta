/**
 * Cards placed by hand.
 *
 * The layout is still computed from the records; a lawyer who wants a card
 * somewhere else drags it, and the card stays exactly where it was dropped,
 * however the rest of the chart is laid out afterwards. Placements are part of
 * the chart's design, kept for the firm (see `design.ts`). Snap back forgets
 * them and the computed chart returns.
 */
import {
  bounds,
  reroute,
  routeSideways,
  type ChartEdge,
  type ChartLayout,
  type ChartNode,
  type Point,
  type RouteOptions,
} from "./layout";
import type { Direction } from "./design";

export type Moves = Record<string, Point>;
/** Boxes the lawyer made a size of their own. */
export type Sizes = Record<string, { w?: number | undefined; h?: number | undefined }>;

/** A placed card stops this far inside the top and left of the chart. */
export const MARGIN = 16;

/**
 * The layout with placed cards where they were dropped, resized cards at their
 * own size, and their lines drawn again. A card given a size but never moved
 * grows about the middle of the edge its line comes into, so that line stays
 * where it was.
 */
export function applyPositions(
  layout: ChartLayout,
  placed: Moves,
  connector: RouteOptions["connector"],
  direction: Direction = "down",
  sizes: Sizes = {},
): ChartLayout {
  const moved = new Set(
    layout.nodes
      .filter((n) => {
        const p = placed[n.id];
        const z = sizes[n.id];
        const shifted =
          !!p && (Math.round(n.x) !== Math.round(p.x) || Math.round(n.y) !== Math.round(p.y));
        const resized =
          !!z &&
          ((z.w !== undefined && Math.round(n.w) !== Math.round(z.w)) ||
            (z.h !== undefined && Math.round(n.h) !== Math.round(z.h)));
        return shifted || resized;
      })
      .map((n) => n.id),
  );
  if (!moved.size) return layout;
  const nodes = layout.nodes.map((n) => {
    if (!moved.has(n.id)) return n;
    const p = placed[n.id];
    const z = { w: sizes[n.id]?.w ?? n.w, h: sizes[n.id]?.h ?? n.h };
    const x = p ? p.x : direction === "right" ? n.x : n.x - (z.w - n.w) / 2;
    const y = p ? p.y : direction === "right" ? n.y - (z.h - n.h) / 2 : n.y;
    return { ...n, x: Math.max(MARGIN, x), y: Math.max(MARGIN, y), w: z.w, h: z.h };
  });
  const size = bounds(nodes);
  const grown = {
    width: Math.max(layout.width, size.width),
    height: Math.max(layout.height, size.height),
  };
  // Read left to right, every line is drawn from where the cards now are.
  if (direction === "right")
    return { nodes, edges: routeSideways(nodes, layout.edges, connector), ...grown };
  const at = new Map(nodes.map((n) => [n.id, n]));
  const centre = (n: ChartNode) => n.x + n.w / 2;
  const edges = [...layout.edges];
  // A moved box redraws every line from the box above it too, so the fork
  // there stays even.
  const parents = new Set(
    edges.filter((e) => moved.has(e.from) || moved.has(e.to)).map((e) => e.from),
  );
  const bus = new Map<string, number>();
  for (const e of edges) {
    const from = at.get(e.from);
    const to = at.get(e.to);
    if (!from || !to || e.style === "dotted" || to.y <= from.y + from.h) continue;
    const bottom = from.y + from.h;
    const turn = bottom + Math.max(16, Math.round((to.y - bottom) / 2));
    bus.set(e.from, Math.min(bus.get(e.from) ?? Infinity, turn));
  }
  const redraw = edges
    .map((e, i) => ({ e, i, from: at.get(e.from), to: at.get(e.to) }))
    .filter((r) => (parents.has(r.e.from) || moved.has(r.e.to)) && r.from && r.to)
    // The holder most nearly above a card takes its top; the others come in at the side.
    .sort(
      (a, b) =>
        Math.abs(centre(a.from!) - centre(a.to!)) - Math.abs(centre(b.from!) - centre(b.to!)),
    );
  for (const { e, i, from, to } of redraw) {
    const top = { x: centre(to!), y: to!.y };
    const taken = edges.some((o, j) => {
      if (j === i || o.to !== e.to || o.style === "dotted") return false;
      const last = o.points[o.points.length - 1];
      return !!last && Math.abs(last.x - top.x) < 0.5 && Math.abs(last.y - top.y) < 0.5;
    });
    const entry =
      !taken || e.style === "dotted" || to!.y <= from!.y + from!.h
        ? "top"
        : centre(from!) < centre(to!)
          ? "left"
          : "right";
    const points = reroute(from!, to!, e.style, connector, entry, bus.get(e.from));
    const drawn: ChartEdge = { ...e, points };
    // The router's label spot was for the old line.
    delete drawn.labelAt;
    if (entry !== "top" && points.length > 2) {
      const turn = points[points.length - 2]!;
      drawn.labelAt = { x: turn.x + 6, y: turn.y - 6 };
    }
    edges[i] = drawn;
  }
  return { nodes, edges, ...grown };
}

/**
 * Cards this browser moved before placements were kept for the firm, as
 * offsets from where the chart put them. Read once, to carry them over.
 */
export function legacyOffsets(
  clientId: string,
  kind: "reporting" | "ownership",
  view: string,
): Moves {
  try {
    const raw = window.localStorage.getItem(`px.org.chart-positions.${clientId}.${kind}.${view}`);
    if (!raw) return {};
    const saved = JSON.parse(raw) as unknown;
    if (!saved || typeof saved !== "object") return {};
    return Object.fromEntries(
      Object.entries(saved as Record<string, unknown>).filter((entry): entry is [string, Point] => {
        const p = entry[1] as Partial<Point> | null;
        return !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
      }),
    );
  } catch {
    return {};
  }
}
