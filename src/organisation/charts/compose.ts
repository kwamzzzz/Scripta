/**
 * A chart ready to draw: the laid-out records with the firm's design applied.
 *
 * The screen, the SVG, the PDF and the PowerPoint file all draw a composition
 * and nothing else, so every colour, container, note and legend entry a lawyer
 * sees is in the file they send. Colours and text positions are settled here,
 * once, rather than in each drawing.
 */
import {
  fitText,
  labelPoint,
  NODE_H,
  NODE_W,
  textWidth,
  turnSideways,
  type ChartEdge,
  type ChartLayout,
  type ChartNode,
  type Point,
  type RouteOptions,
} from "./layout";
import { applyPositions } from "./positions";
import {
  CORNER_RADIUS,
  LINE_WIDTH,
  OUTLINED_BOX,
  edgeColour,
  edgeFor,
  inkFor,
  nodeColours,
  routeOf,
} from "./style";
import {
  CONTAINER_COLOURS,
  EMPTY_DESIGN,
  FILLS,
  viewKey,
  type ChartDesign,
  type ChartKind,
} from "./design";

export type TextLine = {
  /** What the line is on the card; a long name can take several title lines. */
  role: "eyebrow" | "title" | "subtitle" | "note";
  text: string;
  /** Baseline, from the top of the card. */
  y: number;
  size: number;
  bold: boolean;
  italic: boolean;
  caps: boolean;
  colour: string;
};

export type ComposedNode = ChartNode & {
  fill: string;
  stroke: string;
  ink: string;
  radius: number;
  lines: TextLine[];
  tag: string | null;
};

export type ComposedEdge = ChartEdge & {
  colour: string;
  width: number;
  dash: "none" | "dotted" | "dashed";
  arrow: boolean;
  text: string;
  textAt: Point;
  textColour: string;
};

export type ComposedContainer = {
  id: string;
  label: string;
  /** The boxes it holds that are drawn in this view. */
  members: string[];
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  stroke: string;
  labelFill: string;
};

export type ComposedNote = {
  id: string;
  lines: string[];
  x: number;
  y: number;
  w: number;
  h: number;
};

export type LegendItem = {
  key: string;
  label: string;
  shape: "box" | "line" | "area";
  fill?: string;
  stroke?: string;
  dash?: "none" | "dotted" | "dashed";
};

export type ComposedLegend = { x: number; y: number; w: number; h: number; items: LegendItem[] };

export type Composition = {
  nodes: ComposedNode[];
  edges: ComposedEdge[];
  containers: ComposedContainer[];
  notes: ComposedNote[];
  legend: ComposedLegend | null;
  width: number;
  height: number;
};

const SUB_INK = "#4D585C";
export const TAG_FILL = "#1C2B6B";
const CONTAINER_PAD = 14;
const CONTAINER_LABEL = 26;
const NOTE_WIDTH = 240;

/* ---------------------------------------------------------------- sizes */

const LINE_HEIGHT = { eyebrow: 12, title: 15, subtitle: 13, note: 13 } as const;

/** One size for every card in a chart, tall enough for the text any card carries. */
export function cardSize(design: ChartDesign, ids: string[]): { nodeW: number; nodeH: number } {
  const formats = ids.map((id) => design.nodes[id]).filter(Boolean);
  const eyebrow = formats.some((f) => f!.eyebrow);
  const note = formats.some((f) => f!.note);
  return {
    nodeW: design.width === "wide" ? 224 : NODE_W,
    nodeH: NODE_H + (eyebrow ? LINE_HEIGHT.eyebrow : 0) + (note ? LINE_HEIGHT.note : 0),
  };
}

/**
 * Lays a chart out as the design asks: card size, direction, and cards placed
 * by hand. `build` draws the records at a given size and routing; `turnable`
 * is false for views that are not a hierarchy (roles by function).
 */
export function arrange(
  build: (route: RouteOptions) => ChartLayout,
  design: ChartDesign,
  view: string,
  turnable = true,
): ChartLayout {
  const route = routeOf(design.style);
  const first = build(route);
  const size = cardSize(
    design,
    first.nodes.map((n) => n.id),
  );
  const built = build({ ...route, ...size });
  // A line's own label is placed as its share would be, so it gets the room it needs.
  const sized = {
    ...built,
    edges: built.edges.map((e) => {
      const label = design.edges[e.id]?.label;
      return label ? { ...e, label } : e;
    }),
  };
  const direction = turnable ? design.direction : "down";
  const turned = direction === "right" ? turnSideways(sized, route) : sized;
  return applyPositions(
    turned,
    design.positions[viewKey(view, direction)] ?? {},
    route.connector,
    direction,
    sizesOf(design),
  );
}

/** Boxes given a size of their own. */
export const sizesOf = (design: ChartDesign) =>
  Object.fromEntries(
    Object.entries(design.nodes)
      .filter(([, f]) => f.w || f.h)
      .map(([id, f]) => [id, { w: f.w, h: f.h }]),
  ) as Record<string, { w?: number | undefined; h?: number | undefined }>;

/* -------------------------------------------------------------- compose */

const wrap = (text: string, width: number, size: number) => {
  const lines: string[] = [];
  for (const paragraph of text.split(/\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && textWidth(next, size) > width) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
};

/** Text wrapped at word boundaries to at most `max` lines, the last cut with an ellipsis. */
const wrapTo = (text: string, width: number, size: number, bold: boolean, max: number) => {
  if (max <= 1 || textWidth(text, size, bold) <= width) return [fitText(text, width, size, bold)];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  let i = 0;
  for (; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i]!;
    if (line && textWidth(next, size, bold) > width) {
      lines.push(line);
      line = words[i]!;
      if (lines.length === max - 1) break;
    } else line = next;
  }
  const rest = [line, ...words.slice(i + 1)].filter(Boolean).join(" ");
  lines.push(fitText(rest, width, size, bold));
  return lines;
};

const nameOf = (hex: string) => FILLS.find((f) => f.hex === hex)?.name ?? "Colour";

export function compose(
  layout: ChartLayout,
  design: ChartDesign = EMPTY_DESIGN,
  kind: ChartKind = "reporting",
): Composition {
  const style = design.style;
  const radius = CORNER_RADIUS[style.corners];

  const nodes: ComposedNode[] = layout.nodes.map((n) => {
    const f = design.nodes[n.id] ?? {};
    const base = nodeColours(style, n);
    const custom = n.kind !== "group" && !!f.fill;
    const fill = custom ? f.fill! : base.fill;
    const ink = custom ? inkFor(fill) : base.ink;
    // A state (added, removed, flagged) keeps its edge whatever the fill.
    const stateEdge = n.state === "added" || n.state === "removed" || n.state === "flagged";
    const stroke = stateEdge
      ? base.stroke
      : (f.edge ??
        (custom ? (fill === "#FFFFFF" ? OUTLINED_BOX.stroke : edgeFor(fill)) : base.stroke));
    const dashed = f.border ? f.border === "dashed" : n.dashed;
    const subInk = custom
      ? ink === "#FFFFFF"
        ? "#E4EAEE"
        : SUB_INK
      : n.tone === "vacant"
        ? "#85601D"
        : SUB_INK;
    const subtitle = f.subtitle ?? n.subtitle;
    const inner = n.w - 16;
    const rows: { key: keyof typeof LINE_HEIGHT; line: Omit<TextLine, "y" | "role"> }[] = [];
    if (f.eyebrow)
      rows.push({
        key: "eyebrow",
        line: {
          text: fitText(f.eyebrow.toUpperCase(), inner, 8.5, true),
          size: 8.5,
          bold: true,
          italic: false,
          caps: true,
          colour: ink,
        },
      });
    // A box made taller than the chart's cards has room to wrap a long name
    // instead of cutting it short.
    const others =
      (f.eyebrow ? LINE_HEIGHT.eyebrow : 0) +
      (subtitle ? LINE_HEIGHT.subtitle : 0) +
      (f.note ? LINE_HEIGHT.note : 0);
    // Only a box the lawyer sized themselves wraps; the chart's own cards keep
    // one line, so charts already drawn look as they did.
    const titleRoom = f.h ? Math.max(1, Math.floor((n.h - 12 - others) / LINE_HEIGHT.title)) : 1;
    for (const text of wrapTo(n.title, inner, 12, true, titleRoom))
      rows.push({
        key: "title",
        line: { text, size: 12, bold: true, italic: false, caps: false, colour: ink },
      });
    if (subtitle)
      rows.push({
        key: "subtitle",
        line: {
          text: fitText(subtitle, inner, 10.5),
          size: 10.5,
          bold: false,
          italic: false,
          caps: false,
          colour: subInk,
        },
      });
    if (f.note)
      rows.push({
        key: "note",
        line: {
          text: fitText(f.note, inner, 10),
          size: 10,
          bold: false,
          italic: true,
          caps: false,
          colour: subInk,
        },
      });
    const total = rows.reduce((sum, r) => sum + LINE_HEIGHT[r.key], 0);
    let cursor = (n.h - total) / 2;
    const lines: TextLine[] = rows.map((r) => {
      const h = LINE_HEIGHT[r.key];
      const line = { ...r.line, role: r.key, y: Math.round((cursor + h * 0.78) * 10) / 10 };
      cursor += h;
      return line;
    });
    return {
      ...n,
      dashed,
      fill,
      stroke,
      ink,
      radius,
      lines,
      tag: f.tag ? f.tag.toUpperCase() : null,
    };
  });

  const width = LINE_WIDTH[style.weight];
  const edges: ComposedEdge[] = layout.edges.map((e) => {
    const f = design.edges[e.id] ?? {};
    const meaningful = e.style !== "solid";
    const colour = meaningful
      ? edgeColour(style, e.style)
      : (f.colour ?? edgeColour(style, "solid"));
    const dash: ComposedEdge["dash"] =
      e.style === "dotted"
        ? "dotted"
        : e.style === "added" || (e.style === "solid" && f.line === "dashed")
          ? "dashed"
          : "none";
    const arrow = f.arrow ? f.arrow === "on" : style.arrows && e.style !== "dotted";
    const text = f.label ?? e.label;
    const textColour =
      e.style === "removed"
        ? edgeColour(style, "removed")
        : f.colour
          ? f.colour
          : style.boxes === "outlined"
            ? "#1C2B6B"
            : SUB_INK;
    return { ...e, colour, width, dash, arrow, text, textAt: labelPoint(e), textColour };
  });

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const containers: ComposedContainer[] = design.containers.flatMap((c) => {
    const members = c.members.map((id) => byId.get(id)).filter((n): n is ComposedNode => !!n);
    if (!members.length) return [];
    const tagRoom = members.some((m) => m.tag) ? 8 : 0;
    const x0 = Math.min(...members.map((m) => m.x)) - CONTAINER_PAD;
    const y0 = Math.min(...members.map((m) => m.y)) - CONTAINER_PAD - tagRoom;
    const x1 = Math.max(...members.map((m) => m.x + m.w)) + CONTAINER_PAD;
    const y1 = Math.max(...members.map((m) => m.y + m.h)) + CONTAINER_PAD + CONTAINER_LABEL;
    const colours = CONTAINER_COLOURS[c.colour];
    return [
      {
        id: c.id,
        label: c.label,
        members: members.map((m) => m.id),
        x: Math.max(2, x0),
        y: Math.max(2, y0),
        w: x1 - Math.max(2, x0),
        h: y1 - Math.max(2, y0),
        fill: colours.fill,
        stroke: colours.stroke,
        labelFill: colours.label,
      },
    ];
  });

  const notes: ComposedNote[] = design.notes.map((n) => {
    const lines = wrap(n.text || " ", NOTE_WIDTH - 12, 11);
    const w = Math.min(NOTE_WIDTH, Math.max(40, ...lines.map((l) => textWidth(l, 11))) + 12);
    return { id: n.id, lines, x: n.x, y: n.y, w: Math.round(w), h: lines.length * 15 + 8 };
  });

  const right = Math.max(
    layout.width,
    ...nodes.map((n) => n.x + n.w + 24),
    ...containers.map((c) => c.x + c.w + 16),
    ...notes.map((n) => n.x + n.w + 16),
  );
  const bottom = Math.max(
    layout.height,
    ...nodes.map((n) => n.y + n.h + 24),
    ...containers.map((c) => c.y + c.h + 16),
    ...notes.map((n) => n.y + n.h + 16),
  );

  let legend: ComposedLegend | null = null;
  if (design.legend.show) {
    const items = legendItems(nodes, edges, design, kind);
    if (items.length) {
      const w = 22 + 26 + Math.max(60, ...items.map((i) => textWidth(i.label, 10.5))) + 16;
      const h = 30 + items.length * 18 + 6;
      // Below the zoom controls that sit over the chart's top-right corner.
      legend = { x: right + 8, y: 48, w: Math.round(w), h, items };
    }
  }

  return {
    nodes,
    edges,
    containers,
    notes,
    legend,
    width: Math.round(legend ? Math.max(right, legend.x + legend.w + 16) : right),
    height: Math.round(legend ? Math.max(bottom, legend.y + legend.h + 16) : bottom),
  };
}

/** What a legend can explain, from what is actually drawn. */
export function legendItems(
  nodes: ComposedNode[],
  edges: ComposedEdge[],
  design: ChartDesign,
  kind: ChartKind,
  includeHidden = false,
): LegendItem[] {
  const items: LegendItem[] = [];
  const label = (key: string, fallback: string) => design.legend.labels[key] ?? fallback;
  const fills = [
    ...new Set(nodes.map((n) => design.nodes[n.id]?.fill).filter((f): f is string => !!f)),
  ];
  for (const fill of fills)
    items.push({
      key: `fill:${fill}`,
      label: label(`fill:${fill}`, nameOf(fill)),
      shape: "box",
      fill,
      stroke: fill === "#FFFFFF" ? OUTLINED_BOX.stroke : edgeFor(fill),
    });
  if (nodes.some((n) => n.dashed && n.kind !== "group"))
    items.push({
      key: "box:dashed",
      label: label("box:dashed", "Proposed"),
      shape: "box",
      fill: "#FFFFFF",
      stroke: "#8E999C",
      dash: "dashed",
    });
  const present = new Set(nodes.map((n) => n.id));
  for (const c of design.containers)
    if (c.members.some((m) => present.has(m)))
      items.push({
        key: `container:${c.id}`,
        label: label(`container:${c.id}`, c.label || "Group"),
        shape: "area",
        fill: CONTAINER_COLOURS[c.colour].fill,
        stroke: CONTAINER_COLOURS[c.colour].stroke,
      });
  const solid = edges.find((e) => e.style === "solid" && e.dash === "none");
  if (solid)
    items.push({
      key: "line:solid",
      label: label("line:solid", kind === "ownership" ? "Ownership" : "Reports to"),
      shape: "line",
      stroke: solid.colour,
      dash: "none",
    });
  const dashed = edges.find((e) => e.dash === "dashed");
  if (dashed)
    items.push({
      key: "line:dashed",
      label: label("line:dashed", "New or re-routed"),
      shape: "line",
      stroke: dashed.colour,
      dash: "dashed",
    });
  const dotted = edges.find((e) => e.dash === "dotted");
  if (dotted)
    items.push({
      key: "line:dotted",
      label: label("line:dotted", "Functional line"),
      shape: "line",
      stroke: dotted.colour,
      dash: "dotted",
    });
  const removed = edges.find((e) => e.style === "removed");
  if (removed)
    items.push({
      key: "line:removed",
      label: label("line:removed", "Removed"),
      shape: "line",
      stroke: removed.colour,
      dash: "none",
    });
  return includeHidden ? items : items.filter((i) => !design.legend.hidden.includes(i.key));
}

/** A recorded chart drawn with no design of its own, as the studio and tests draw it. */
export const plain = (layout: ChartLayout, style = EMPTY_DESIGN.style) =>
  compose(layout, { ...EMPTY_DESIGN, style });
