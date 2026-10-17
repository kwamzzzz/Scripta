/**
 * How the firm chose to draw a chart: where boxes were placed, their colours
 * and extra lines of text, what a line says and how it is drawn, the containers
 * that group boxes, free notes, and the legend.
 *
 * The records stay the facts. A design never adds a shareholding or a
 * reporting line; it only draws the ones the records hold, and adds notes and
 * containers that are plainly drawing. Every operation here is pure, so the
 * screen, the undo history and the tests all apply the same change.
 *
 * Kept for the whole firm in `org_chart_designs`, one document per client per
 * chart.
 */
import type { Point } from "./layout";
import { DEFAULT_STYLE, type ChartStyle } from "./style";

export type ChartKind = "reporting" | "ownership";
export type Direction = "down" | "right";
export type CardWidth = "standard" | "wide";

export type NodeFormat = {
  /** Card fill, as #RRGGBB. The text colour follows it. */
  fill?: string;
  /** Card edge colour, as #RRGGBB. */
  edge?: string;
  border?: "solid" | "dashed";
  /** A small line above the name: "ULTIMATE BENEFICIAL OWNER". */
  eyebrow?: string;
  /** Replaces the line under the name the records give (jurisdiction, holder). */
  subtitle?: string;
  /** An italic line at the foot of the card: "(Advisory business)". */
  note?: string;
  /** A tag on the card's corner: "NEW". */
  tag?: string;
  /** A size of the box's own, in chart units; unset, it takes the chart's card size. */
  w?: number;
  h?: number;
};

export const BOX_LIMITS = { minW: 80, maxW: 640, minH: 36, maxH: 420 };

export type EdgeFormat = {
  /** Shown instead of the share the records give: "DK + partners". */
  label?: string;
  line?: "solid" | "dashed";
  arrow?: "on" | "off";
  colour?: string;
};

export type ContainerColour = "green" | "pink" | "blue" | "amber" | "grey" | "lavender";

export type Container = {
  id: string;
  label: string;
  colour: ContainerColour;
  members: string[];
};

export type ChartNote = { id: string; text: string; x: number; y: number };

export type Legend = {
  show: boolean;
  /** Labels the lawyer typed, by legend key ("fill:#C8373B", "line:dashed"). */
  labels: Record<string, string>;
  /** Legend keys the lawyer took out. */
  hidden: string[];
};

export type ChartDesign = {
  style: ChartStyle;
  direction: Direction;
  width: CardWidth;
  /** Boxes placed by hand, by view ("current:down"), as positions on the chart. */
  positions: Record<string, Record<string, Point>>;
  nodes: Record<string, NodeFormat>;
  edges: Record<string, EdgeFormat>;
  containers: Container[];
  notes: ChartNote[];
  legend: Legend;
};

export const EMPTY_DESIGN: ChartDesign = {
  style: DEFAULT_STYLE,
  direction: "down",
  width: "standard",
  positions: {},
  nodes: {},
  edges: {},
  containers: [],
  notes: [],
  legend: { show: false, labels: {}, hidden: [] },
};

/** The palette the reference decks use, plus Scripta's own tints. */
export const FILLS: { hex: string; name: string }[] = [
  { hex: "#C8373B", name: "Red" },
  { hex: "#16384F", name: "Navy" },
  { hex: "#2B5C84", name: "Blue" },
  { hex: "#3A9AB0", name: "Teal" },
  { hex: "#D2601A", name: "Orange" },
  { hex: "#8C6420", name: "Bronze" },
  { hex: "#9A4A1E", name: "Rust" },
  { hex: "#8E9194", name: "Grey" },
  { hex: "#111111", name: "Black" },
  { hex: "#FFFFFF", name: "White" },
  { hex: "#E6EBF2", name: "Soft blue" },
  { hex: "#EAF2EA", name: "Soft green" },
  { hex: "#FBECEA", name: "Soft pink" },
  { hex: "#FBF3E4", name: "Soft amber" },
];

export const LINE_COLOURS: { hex: string; name: string }[] = [
  { hex: "#1C2B6B", name: "Navy" },
  { hex: "#5F6B72", name: "Slate" },
  { hex: "#247A78", name: "Teal" },
  { hex: "#B4483A", name: "Red" },
  { hex: "#111111", name: "Black" },
];

export const CONTAINER_COLOURS: Record<
  ContainerColour,
  { name: string; fill: string; stroke: string; label: string }
> = {
  green: { name: "Green", fill: "#EEF5EC", stroke: "#CFE3CB", label: "#3F7D4A" },
  pink: { name: "Pink", fill: "#FBEDEA", stroke: "#F0D2CC", label: "#A2463B" },
  blue: { name: "Blue", fill: "#EAF0F7", stroke: "#CCDAEA", label: "#2B5C84" },
  amber: { name: "Amber", fill: "#FBF3E4", stroke: "#EEDDB8", label: "#946A1E" },
  grey: { name: "Grey", fill: "#F1F2F0", stroke: "#DADDD8", label: "#5B6468" },
  lavender: { name: "Lavender", fill: "#F0EDF7", stroke: "#DAD3EA", label: "#5E4F8C" },
};

const HEX = /^#[0-9A-Fa-f]{6}$/;
const clean = (s: unknown, max = 120) => (typeof s === "string" ? s.slice(0, max) : undefined);
const hex = (s: unknown) => (typeof s === "string" && HEX.test(s) ? s.toUpperCase() : undefined);
const finite = (p: unknown): p is Point =>
  !!p &&
  typeof p === "object" &&
  Number.isFinite((p as Point).x) &&
  Number.isFinite((p as Point).y);

/** A change to a format: a field set to `undefined` or "" is cleared. */
export type Patch<T> = { [K in keyof T]?: T[K] | undefined };

/** Drops empty values, so a cleared field leaves nothing behind. */
const compact = <T>(o: Patch<T>): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== "")) as T;

/** Reads a stored design, keeping only what is well formed. */
export function readDesign(raw: unknown): ChartDesign {
  const d: any = raw && typeof raw === "object" ? raw : {};
  const style = { ...DEFAULT_STYLE, ...(d.style && typeof d.style === "object" ? d.style : {}) };
  const positions: ChartDesign["positions"] = {};
  for (const [view, byNode] of Object.entries(d.positions ?? {})) {
    if (!byNode || typeof byNode !== "object") continue;
    const kept = Object.entries(byNode as Record<string, unknown>).filter(([, p]) => finite(p));
    if (kept.length)
      positions[view] = Object.fromEntries(
        kept.map(([id, p]) => [
          id,
          { x: Math.round((p as Point).x), y: Math.round((p as Point).y) },
        ]),
      );
  }
  const nodes: ChartDesign["nodes"] = {};
  for (const [id, f] of Object.entries(d.nodes ?? {})) {
    const v: any = f ?? {};
    const format = compact<NodeFormat>({
      fill: hex(v.fill),
      edge: hex(v.edge),
      border: v.border === "dashed" || v.border === "solid" ? v.border : undefined,
      eyebrow: clean(v.eyebrow, 60),
      subtitle: clean(v.subtitle, 80),
      note: clean(v.note, 80),
      tag: clean(v.tag, 12),
      w: Number.isFinite(v.w)
        ? Math.round(Math.min(BOX_LIMITS.maxW, Math.max(BOX_LIMITS.minW, v.w)))
        : undefined,
      h: Number.isFinite(v.h)
        ? Math.round(Math.min(BOX_LIMITS.maxH, Math.max(BOX_LIMITS.minH, v.h)))
        : undefined,
    });
    if (Object.keys(format).length) nodes[id] = format;
  }
  const edges: ChartDesign["edges"] = {};
  for (const [id, f] of Object.entries(d.edges ?? {})) {
    const v: any = f ?? {};
    const format = compact<EdgeFormat>({
      label: clean(v.label, 40),
      line: v.line === "dashed" || v.line === "solid" ? v.line : undefined,
      arrow: v.arrow === "on" || v.arrow === "off" ? v.arrow : undefined,
      colour: hex(v.colour),
    });
    if (Object.keys(format).length) edges[id] = format;
  }
  const containers: Container[] = Array.isArray(d.containers)
    ? d.containers
        .filter((c: any) => c && typeof c.id === "string")
        .map((c: any) => ({
          id: c.id,
          label: clean(c.label, 60) ?? "",
          colour: c.colour in CONTAINER_COLOURS ? c.colour : "grey",
          members: Array.isArray(c.members)
            ? c.members.filter((m: unknown): m is string => typeof m === "string")
            : [],
        }))
    : [];
  const notes: ChartNote[] = Array.isArray(d.notes)
    ? d.notes
        .filter((n: any) => n && typeof n.id === "string" && finite(n))
        .map((n: any) => ({ id: n.id, text: clean(n.text, 280) ?? "", x: n.x, y: n.y }))
    : [];
  const legend = d.legend && typeof d.legend === "object" ? d.legend : {};
  return {
    style,
    direction: d.direction === "right" ? "right" : "down",
    width: d.width === "wide" ? "wide" : "standard",
    positions,
    nodes,
    edges,
    containers,
    notes,
    legend: {
      show: !!legend.show,
      labels: Object.fromEntries(
        Object.entries(legend.labels ?? {}).filter(([, v]) => typeof v === "string"),
      ) as Record<string, string>,
      hidden: Array.isArray(legend.hidden)
        ? legend.hidden.filter((k: unknown): k is string => typeof k === "string")
        : [],
    },
  };
}

/** Where hand placements for one view of the chart are kept. */
export const viewKey = (view: string, direction: Direction) => `${view}:${direction}`;

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2)}`;

/* ------------------------------------------------------------ operations */

export type DesignOp = (d: ChartDesign) => ChartDesign;

export const setStyle =
  (patch: Partial<ChartStyle>): DesignOp =>
  (d) => ({ ...d, style: { ...d.style, ...patch } });

export const setDirection =
  (direction: Direction): DesignOp =>
  (d) => ({ ...d, direction });

export const setWidth =
  (width: CardWidth): DesignOp =>
  (d) => ({ ...d, width });

/** Places boxes by hand in one view. `null` returns a box to where the chart puts it. */
export const placeNodes =
  (view: string, placed: Record<string, Point | null>): DesignOp =>
  (d) => {
    const current = { ...(d.positions[view] ?? {}) };
    for (const [id, p] of Object.entries(placed)) {
      if (p) current[id] = { x: Math.round(p.x), y: Math.round(p.y) };
      else delete current[id];
    }
    const positions = { ...d.positions };
    if (Object.keys(current).length) positions[view] = current;
    else delete positions[view];
    return { ...d, positions };
  };

/** Forgets every hand placement in one view: the chart as computed. */
export const snapBack =
  (view: string): DesignOp =>
  (d) => {
    const positions = { ...d.positions };
    delete positions[view];
    return { ...d, positions };
  };

export const formatNodes =
  (ids: string[], patch: Patch<NodeFormat>): DesignOp =>
  (d) => {
    const nodes = { ...d.nodes };
    for (const id of ids) {
      const next = compact<NodeFormat>({ ...nodes[id], ...patch });
      if (Object.keys(next).length) nodes[id] = next;
      else delete nodes[id];
    }
    return { ...d, nodes };
  };

export const formatEdges =
  (ids: string[], patch: Patch<EdgeFormat>): DesignOp =>
  (d) => {
    const edges = { ...d.edges };
    for (const id of ids) {
      const next = compact<EdgeFormat>({ ...edges[id], ...patch });
      if (Object.keys(next).length) edges[id] = next;
      else delete edges[id];
    }
    return { ...d, edges };
  };

/** A box belongs to one container at most: grouping it takes it out of any other. */
export const groupNodes = (
  members: string[],
  label = "Group",
  colour: ContainerColour = "green",
  id = newId(),
): { op: DesignOp; id: string } => ({
  id,
  op: (d) => ({
    ...d,
    containers: [
      ...d.containers
        .map((c) => ({ ...c, members: c.members.filter((m) => !members.includes(m)) }))
        .filter((c) => c.members.length),
      { id, label, colour, members: [...new Set(members)] },
    ],
  }),
});

export const updateContainer =
  (id: string, patch: Partial<Pick<Container, "label" | "colour">>): DesignOp =>
  (d) => ({
    ...d,
    containers: d.containers.map((c) => (c.id === id ? { ...c, ...patch } : c)),
  });

/** The container goes; its boxes stay where they are. */
export const removeContainer =
  (id: string): DesignOp =>
  (d) => ({ ...d, containers: d.containers.filter((c) => c.id !== id) });

/** Moves boxes into a container, or out of every container with `null`. */
export const setMembership =
  (ids: string[], containerId: string | null): DesignOp =>
  (d) => ({
    ...d,
    containers: d.containers
      .map((c) => ({
        ...c,
        members:
          c.id === containerId
            ? [...new Set([...c.members, ...ids])]
            : c.members.filter((m) => !ids.includes(m)),
      }))
      .filter((c) => c.members.length || c.id === containerId),
  });

export const addNote = (text: string, at: Point, id = newId()): { op: DesignOp; id: string } => ({
  id,
  op: (d) => ({
    ...d,
    notes: [...d.notes, { id, text, x: Math.round(at.x), y: Math.round(at.y) }],
  }),
});

export const updateNote =
  (id: string, patch: Partial<Omit<ChartNote, "id">>): DesignOp =>
  (d) => ({
    ...d,
    notes: d.notes.map((n) =>
      n.id === id
        ? {
            ...n,
            ...patch,
            ...(patch.x !== undefined ? { x: Math.round(patch.x) } : {}),
            ...(patch.y !== undefined ? { y: Math.round(patch.y) } : {}),
          }
        : n,
    ),
  });

export const removeNote =
  (id: string): DesignOp =>
  (d) => ({ ...d, notes: d.notes.filter((n) => n.id !== id) });

export const setLegend =
  (patch: Partial<Legend>): DesignOp =>
  (d) => ({ ...d, legend: { ...d.legend, ...patch } });

export const setLegendLabel =
  (key: string, label: string): DesignOp =>
  (d) => {
    const labels = { ...d.legend.labels };
    if (label.trim()) labels[key] = label;
    else delete labels[key];
    return { ...d, legend: { ...d.legend, labels } };
  };

export const toggleLegendItem =
  (key: string, shown: boolean): DesignOp =>
  (d) => ({
    ...d,
    legend: {
      ...d.legend,
      hidden: shown
        ? d.legend.hidden.filter((k) => k !== key)
        : [...new Set([...d.legend.hidden, key])],
    },
  });

/**
 * A box whose identity changes with its name (someone outside the group is
 * drawn by name) keeps its colours, place and container under the new name.
 */
export const renameNode =
  (from: string, to: string): DesignOp =>
  (d) => {
    if (from === to) return d;
    const move = <T>(rec: Record<string, T>) => {
      if (!(from in rec)) return rec;
      const next = { ...rec, [to]: rec[from]! };
      delete next[from];
      return next;
    };
    return {
      ...d,
      nodes: move(d.nodes),
      positions: Object.fromEntries(Object.entries(d.positions).map(([v, p]) => [v, move(p)])),
      containers: d.containers.map((c) => ({
        ...c,
        members: c.members.map((m) => (m === from ? to : m)),
      })),
    };
  };
