/**
 * Putting boxes in line by hand: snapping while a box is dragged, aligning and
 * spacing a selection, and straightening a line.
 *
 * A line between two boxes runs straight only when the boxes are exactly in
 * line, and a fork looks even only when the boxes under it are evenly spaced
 * and its holder sits over their middle. Dragging by eye rarely gets there, so
 * these do it exactly. All are pure and return positions for the design.
 */
import type { Direction } from "./design";
import type { Point } from "./layout";

export type Box = { id: string; x: number; y: number; w: number; h: number };

export type Guide = { axis: "x" | "y"; at: number; from: number; to: number };

const cx = (b: Box) => b.x + b.w / 2;
const cy = (b: Box) => b.y + b.h / 2;

/** The box that holds several boxes, as one. */
export const bounds = (boxes: Box[]): Box => {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return {
    id: "",
    x,
    y,
    w: Math.max(...boxes.map((b) => b.x + b.w)) - x,
    h: Math.max(...boxes.map((b) => b.y + b.h)) - y,
  };
};

/* ------------------------------------------------------------------ snap */

/** How close, in screen pixels, an edge or centre has to come before it snaps. */
export const SNAP = 12;
/** Where nothing lines up, a box still lands on this grid, so gaps come out equal. */
export const GRID = 8;

/**
 * Where a dragged selection should really go: in line with another box's
 * left, centre or right (and top, middle or bottom) when it comes close, and
 * on the grid otherwise. Boxes joined to the selection by a line win a near
 * tie, because lining up with them is what straightens the line.
 */
export function snapMove(
  moving: Box,
  others: Box[],
  connected: Set<string>,
  threshold = SNAP,
): { dx: number; dy: number; guides: Guide[] } {
  const pick = (axis: "x" | "y") => {
    const mine =
      axis === "x"
        ? [moving.x, cx(moving), moving.x + moving.w]
        : [moving.y, cy(moving), moving.y + moving.h];
    let best: { delta: number; score: number; at: number; other: Box } | null = null;
    for (const o of others) {
      const theirs = axis === "x" ? [o.x, cx(o), o.x + o.w] : [o.y, cy(o), o.y + o.h];
      theirs.forEach((at, i) => {
        // Edge to the same edge, centre to centre: a left edge meeting a
        // right edge is two boxes touching, not two boxes in line.
        const delta = at - mine[i]!;
        const score = Math.abs(delta) - (connected.has(o.id) ? 2.5 : 0) - (i === 1 ? 0.5 : 0);
        if (Math.abs(delta) <= threshold && (!best || score < best.score))
          best = { delta, score, at, other: o };
      });
    }
    return best as { delta: number; score: number; at: number; other: Box } | null;
  };
  const sx = pick("x");
  const sy = pick("y");
  const dx = sx ? sx.delta : Math.round(moving.x / GRID) * GRID - moving.x;
  const dy = sy ? sy.delta : Math.round(moving.y / GRID) * GRID - moving.y;
  const guides: Guide[] = [];
  if (sx)
    guides.push({
      axis: "x",
      at: sx.at,
      from: Math.min(moving.y + dy, sx.other.y) - 8,
      to: Math.max(moving.y + dy + moving.h, sx.other.y + sx.other.h) + 8,
    });
  if (sy)
    guides.push({
      axis: "y",
      at: sy.at,
      from: Math.min(moving.x + dx, sy.other.x) - 8,
      to: Math.max(moving.x + dx + moving.w, sy.other.x + sy.other.w) + 8,
    });
  return { dx, dy, guides };
}

/* ----------------------------------------------------------------- align */

export type Alignment = "left" | "centre" | "right" | "top" | "middle" | "bottom";

/** Lines a selection up along one edge, or its centres, as PowerPoint's Align does. */
export function align(boxes: Box[], how: Alignment): Record<string, Point> {
  const all = bounds(boxes);
  const out: Record<string, Point> = {};
  for (const b of boxes) {
    const x =
      how === "left"
        ? all.x
        : how === "centre"
          ? all.x + all.w / 2 - b.w / 2
          : how === "right"
            ? all.x + all.w - b.w
            : b.x;
    const y =
      how === "top"
        ? all.y
        : how === "middle"
          ? all.y + all.h / 2 - b.h / 2
          : how === "bottom"
            ? all.y + all.h - b.h
            : b.y;
    out[b.id] = { x: Math.round(x), y: Math.round(y) };
  }
  return out;
}

/**
 * Spaces a selection evenly between its first and last box: across, the
 * centres step equally from left to right; down, from top to bottom. The two
 * outer boxes stay where they are.
 */
export function distribute(boxes: Box[], axis: "across" | "down"): Record<string, Point> {
  const sorted = [...boxes].sort((a, b) => (axis === "across" ? cx(a) - cx(b) : cy(a) - cy(b)));
  const out: Record<string, Point> = {};
  if (sorted.length < 3) return out;
  const first = axis === "across" ? cx(sorted[0]!) : cy(sorted[0]!);
  const last = axis === "across" ? cx(sorted.at(-1)!) : cy(sorted.at(-1)!);
  const step = (last - first) / (sorted.length - 1);
  sorted.forEach((b, i) => {
    const centre = first + step * i;
    out[b.id] =
      axis === "across"
        ? { x: Math.round(centre - b.w / 2), y: b.y }
        : { x: b.x, y: Math.round(centre - b.h / 2) };
  });
  return out;
}

/* -------------------------------------------------------------- straighten */

/**
 * Moves one box so the line from another runs straight: directly under it on
 * a chart read top down, level with it on a chart read left to right.
 */
export function inLineWith(fixed: Box, moving: Box, direction: Direction): Point {
  return direction === "right"
    ? { x: moving.x, y: Math.round(cy(fixed) - moving.h / 2) }
    : { x: Math.round(cx(fixed) - moving.w / 2), y: moving.y };
}

/**
 * Puts a box over the middle of the boxes it leads to (or beside their middle,
 * read left to right), so the fork under it is even.
 */
export function centredOver(parent: Box, children: Box[], direction: Direction): Point {
  const span = bounds(children);
  return direction === "right"
    ? { x: parent.x, y: Math.round(span.y + span.h / 2 - parent.h / 2) }
    : { x: Math.round(span.x + span.w / 2 - parent.w / 2), y: parent.y };
}
