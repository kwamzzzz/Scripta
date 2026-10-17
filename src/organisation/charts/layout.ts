/**
 * Chart geometry, computed from records rather than placed by hand.
 *
 * The screen, the PDF and the PowerPoint file all draw from the same layout, so
 * what a lawyer sends is exactly what they looked at. Node sizes are fixed:
 * a chart that reflows when one title gets longer is a chart nobody can find
 * their way around twice.
 *
 * Two shapes. A reporting line is a tree (each role has one manager; dotted
 * functional lines are drawn over it but do not move anything). Ownership is a
 * directed graph — a joint venture has two parents and a minority partner
 * holds beside a parent — so it is laid out in ranks, never as a tree.
 */

export type NodeKind = "role" | "entity" | "person" | "outside" | "group";

export type NodeTone =
  "leadership" | "head" | "role" | "vacant" | "home" | "foreign" | "holder" | "proposed" | "group";

export type NodeState = "added" | "removed" | "flagged" | "muted" | null;

export type EdgeStyle = "solid" | "dotted" | "added" | "removed";

export type GraphNode = {
  id: string;
  kind: NodeKind;
  title: string;
  subtitle: string;
  tone: NodeTone;
  dashed?: boolean;
  state?: NodeState;
  /** A short marker drawn in the corner: "Acting", "UBO". */
  badge?: string;
};

export type GraphEdge = {
  id: string;
  from: string;
  to: string;
  label?: string;
  style?: EdgeStyle;
};

export type Point = { x: number; y: number };

export type ChartNode = GraphNode & {
  x: number;
  y: number;
  w: number;
  h: number;
  dashed: boolean;
  state: NodeState;
};

export type ChartEdge = {
  id: string;
  from: string;
  to: string;
  points: Point[];
  label: string;
  style: EdgeStyle;
  /** Where the router placed the label, when it knows better than the default. */
  labelAt?: Point;
};

/** How lines are routed. The rest of a chart's look is drawing, not layout. */
export type RouteOptions = {
  connector?: "squared" | "straight";
  secondHolder?: "side" | "joined";
  /** Card size. Every card in a chart is the same size, so rows and columns line up. */
  nodeW?: number;
  nodeH?: number;
};

export type ChartLayout = {
  nodes: ChartNode[];
  edges: ChartEdge[];
  width: number;
  height: number;
};

export const NODE_W = 176;
export const NODE_H = 52;
const GAP_X = 20;
const GAP_Y = 48;
const PAD = 24;

const place = (n: GraphNode, x: number, y: number, w = NODE_W, h = NODE_H): ChartNode => ({
  ...n,
  x,
  y,
  w,
  h,
  dashed: !!n.dashed,
  state: n.state ?? null,
});

/** Down from the bottom of one box and into the top of another, squared off. */
export const elbow = (from: ChartNode, to: ChartNode, bus?: number): Point[] => {
  const x1 = from.x + from.w / 2;
  const y1 = from.y + from.h;
  const x2 = to.x + to.w / 2;
  const y2 = to.y;
  if (y2 <= y1) {
    // Drawn upwards or sideways (a line to a peer): straight, side to side.
    const left = from.x < to.x;
    return [
      { x: left ? from.x + from.w : from.x, y: from.y + from.h / 2 },
      { x: left ? to.x : to.x + to.w, y: to.y + to.h / 2 },
    ];
  }
  // A box's lines to the boxes under it share one run across, so the fork is even.
  const mid = bus !== undefined && bus > y1 && bus < y2 ? bus : y1 + (y2 - y1) / 2;
  return x1 === x2
    ? [
        { x: x1, y: y1 },
        { x: x2, y: y2 },
      ]
    : [
        { x: x1, y: y1 },
        { x: x1, y: mid },
        { x: x2, y: mid },
        { x: x2, y: y2 },
      ];
};

/** One line from the middle of the bottom edge to the middle of the top edge. */
const straight = (from: ChartNode, to: ChartNode): Point[] =>
  to.y > from.y + from.h
    ? [
        { x: from.x + from.w / 2, y: from.y + from.h },
        { x: to.x + to.w / 2, y: to.y },
      ]
    : direct(from, to);

/**
 * A dotted functional line, squared like every other line: side to side when
 * the cards share a row, straight up or down when one is over the other, and
 * otherwise out of the middle of a side and one turn into the middle of the
 * other card's top or bottom.
 */
const direct = (from: ChartNode, to: ChartNode): Point[] => {
  const fc = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
  const tc = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
  const dx = tc.x - fc.x;
  const dy = tc.y - fc.y;
  const sameRow = Math.abs(dy) < Math.max(from.h, to.h) / 2;
  if (sameRow)
    return [
      { x: dx > 0 ? from.x + from.w : from.x, y: fc.y },
      { x: dx > 0 ? to.x : to.x + to.w, y: fc.y },
    ];
  if (Math.abs(dx) < 0.5)
    return [
      { x: fc.x, y: dy > 0 ? from.y + from.h : from.y },
      { x: tc.x, y: dy > 0 ? to.y : to.y + to.h },
    ];
  return [
    { x: dx > 0 ? from.x + from.w : from.x, y: fc.y },
    { x: tc.x, y: fc.y },
    { x: tc.x, y: dy > 0 ? to.y : to.y + to.h },
  ];
};

/**
 * A line drawn again after one of its cards was moved by hand: the same
 * midpoints and squared arms, without the router's shared buses. A line into
 * a card whose top is already taken comes in at the middle of the side its
 * holder is on, as the router's side entries do.
 */
export const reroute = (
  from: ChartNode,
  to: ChartNode,
  style: EdgeStyle,
  connector: RouteOptions["connector"],
  entry: "top" | "left" | "right" = "top",
  bus?: number,
): Point[] => {
  if (style === "dotted" || to.y <= from.y + from.h) return direct(from, to);
  if (entry === "top") return connector === "straight" ? straight(from, to) : elbow(from, to, bus);
  const start = { x: from.x + from.w / 2, y: from.y + from.h };
  const end = { x: entry === "left" ? to.x : to.x + to.w, y: to.y + to.h / 2 };
  if (connector === "straight") return [start, end];
  // Clear of the card: down, across and in.
  if (entry === "left" ? start.x < end.x : start.x > end.x)
    return [start, { x: start.x, y: end.y }, end];
  // Above it: across to a lane beside the card first.
  const lane = entry === "left" ? end.x - 16 : end.x + 16;
  const mid = start.y + (to.y - start.y) / 2;
  return [start, { x: start.x, y: mid }, { x: lane, y: mid }, { x: lane, y: end.y }, end];
};

export const bounds = (nodes: ChartNode[]) => ({
  width: Math.max(0, ...nodes.map((n) => n.x + n.w)) + PAD,
  height: Math.max(0, ...nodes.map((n) => n.y + n.h)) + PAD,
});

/* ------------------------------------------------------------------- tree */

export type TreeInput = {
  nodes: (GraphNode & { parentId: string | null; order?: number })[];
  /** Extra lines drawn over the tree without shaping it. */
  lines?: GraphEdge[];
};

/**
 * A tidy tree: each subtree is as wide as its children need, a parent sits
 * centred over its children, and separate trees stand side by side. A parent
 * that is missing (ended, filtered out) or a loop in the data makes a root
 * rather than an error.
 */
export function layoutTree(input: TreeInput, options: RouteOptions = {}): ChartLayout {
  const W = options.nodeW ?? NODE_W;
  const H = options.nodeH ?? NODE_H;
  const byId = new Map(input.nodes.map((n) => [n.id, n]));
  const sortKey = (a: TreeInput["nodes"][number], b: TreeInput["nodes"][number]) =>
    (a.order ?? 0) - (b.order ?? 0) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id);

  // A node whose parent chain loops back to itself is cut loose at the loop.
  const effectiveParent = new Map<string, string | null>();
  for (const n of input.nodes) {
    let parent = n.parentId && byId.has(n.parentId) ? n.parentId : null;
    const seen = new Set([n.id]);
    let cursor = parent;
    while (cursor) {
      if (seen.has(cursor)) {
        parent = null;
        break;
      }
      seen.add(cursor);
      const next = byId.get(cursor)?.parentId ?? null;
      cursor = next && byId.has(next) ? next : null;
    }
    effectiveParent.set(n.id, parent);
  }

  const children = new Map<string | null, TreeInput["nodes"]>();
  for (const n of input.nodes) {
    const p = effectiveParent.get(n.id) ?? null;
    const list = children.get(p) ?? [];
    list.push(n);
    children.set(p, list);
  }
  for (const list of children.values()) list.sort(sortKey);

  const widthOf = new Map<string, number>();
  const measure = (id: string): number => {
    const kids = children.get(id) ?? [];
    const w = kids.length
      ? Math.max(W, kids.reduce((sum, k) => sum + measure(k.id), 0) + GAP_X * (kids.length - 1))
      : W;
    widthOf.set(id, w);
    return w;
  };

  const placed: ChartNode[] = [];
  /** Places a subtree in [left, left + width) and returns its root's centre. */
  const put = (id: string, left: number, depth: number): number => {
    const node = byId.get(id)!;
    const w = widthOf.get(id)!;
    const y = PAD + depth * (H + GAP_Y);
    const kids = children.get(id) ?? [];
    let centre = left + w / 2;
    if (kids.length) {
      const used = kids.reduce((sum, k) => sum + widthOf.get(k.id)!, 0) + GAP_X * (kids.length - 1);
      let cursor = left + (w - used) / 2;
      const centres: number[] = [];
      for (const k of kids) {
        centres.push(put(k.id, cursor, depth + 1));
        cursor += widthOf.get(k.id)! + GAP_X;
      }
      // Over the first and last report, not over the space their subtrees take.
      centre = (centres[0]! + centres[centres.length - 1]!) / 2;
    }
    placed.push(place(node, centre - W / 2, y, W, H));
    return centre;
  };

  let left = PAD;
  for (const root of children.get(null) ?? []) {
    measure(root.id);
    put(root.id, left, 0);
    left += widthOf.get(root.id)! + GAP_X * 2;
  }

  const at = new Map(placed.map((n) => [n.id, n]));
  const edges: ChartEdge[] = [];
  for (const n of placed) {
    const parent = effectiveParent.get(n.id);
    if (!parent) continue;
    edges.push({
      id: `tree-${n.id}`,
      from: parent,
      to: n.id,
      points:
        options.connector === "straight" ? straight(at.get(parent)!, n) : elbow(at.get(parent)!, n),
      label: "",
      style: "solid",
    });
  }
  for (const line of input.lines ?? []) {
    const from = at.get(line.from);
    const to = at.get(line.to);
    if (!from || !to) continue;
    const points = direct(from, to);
    const label = line.label ?? "";
    // The note sits above the line's longest level stretch, clear of the cards.
    const level = points
      .slice(1)
      .map((p, i) => [points[i]!, p] as const)
      .filter(([a, b]) => a.y === b.y)
      .sort((m, n) => Math.abs(n[1].x - n[0].x) - Math.abs(m[1].x - m[0].x))[0];
    const edge: ChartEdge = {
      id: line.id,
      from: line.from,
      to: line.to,
      points,
      label,
      style: line.style ?? "dotted",
    };
    if (label) {
      // Measured generously: the screen sets notes in a monospaced face.
      const tw = textWidth(label, 9) * 1.3;
      const upright = points
        .slice(1)
        .map((p, i) => [points[i]!, p] as const)
        .find(([a, b]) => a.x === b.x);
      if (level && Math.abs(level[1].x - level[0].x) >= tw + 12) {
        const [a, b] = level;
        edge.labelAt = { x: Math.min(a.x, b.x) + (Math.abs(b.x - a.x) - tw) / 2, y: a.y - 5 };
      } else if (upright) {
        const [a, b] = upright;
        edge.labelAt = { x: a.x + 6, y: (a.y + b.y) / 2 + 3 };
      }
    }
    edges.push(edge);
  }
  return { nodes: placed, edges, ...bounds(placed) };
}

/* ---------------------------------------------------------------- columns */

/**
 * The same roles grouped by function: one column per function, its head
 * first. Reporting lines are not drawn; that is what the tree view is for.
 */
export function layoutColumns(
  groups: { id: string; title: string; nodes: GraphNode[] }[],
  options: RouteOptions = {},
): ChartLayout {
  const W = options.nodeW ?? NODE_W;
  const H = options.nodeH ?? NODE_H;
  const placed: ChartNode[] = [];
  groups.forEach((g, col) => {
    const x = PAD + col * (W + GAP_X * 2);
    placed.push(
      place(
        {
          id: `group-${g.id}`,
          kind: "group",
          title: g.title,
          subtitle: `${g.nodes.length} role${g.nodes.length === 1 ? "" : "s"}`,
          tone: "group",
        },
        x,
        PAD,
        W,
        40,
      ),
    );
    g.nodes.forEach((n, row) => placed.push(place(n, x, PAD + 40 + 16 + row * (H + 12), W, H)));
  });
  return { nodes: placed, edges: [], ...bounds(placed) };
}

/* ----------------------------------------------------------------- layered */

/**
 * Ownership in ranks. A holder sits above everything it holds, at the rank of
 * its longest chain from the top, so an entity held both directly and through
 * a subsidiary sits below both. Loops (cross-holdings) are broken where they
 * are met and still drawn.
 */
export function layoutLayered(
  input: { nodes: GraphNode[]; edges: GraphEdge[] },
  options: RouteOptions = {},
): ChartLayout {
  const W = options.nodeW ?? NODE_W;
  const H = options.nodeH ?? NODE_H;
  const ids = new Set(input.nodes.map((n) => n.id));
  const edges = input.edges.filter((e) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to);
  const out = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const e of edges) {
    out.set(e.from, [...(out.get(e.from) ?? []), e.to]);
    incoming.set(e.to, [...(incoming.get(e.to) ?? []), e.from]);
  }

  // Drop the edges that close a loop, found by depth-first search in a stable order.
  const byName = [...input.nodes].sort(
    (a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id),
  );
  const state = new Map<string, 1 | 2>();
  const back = new Set<string>();
  const visit = (id: string) => {
    state.set(id, 1);
    for (const to of out.get(id) ?? []) {
      if (state.get(to) === 1) back.add(`${id}>${to}`);
      else if (!state.has(to)) visit(to);
    }
    state.set(id, 2);
  };
  const roots = byName.filter((n) => !(incoming.get(n.id) ?? []).length);
  for (const n of [...roots, ...byName]) if (!state.has(n.id)) visit(n.id);
  const forward = edges.filter((e) => !back.has(`${e.from}>${e.to}`));

  // Longest path from the top.
  const rank = new Map<string, number>();
  const parentsOf = (id: string) => forward.filter((e) => e.to === id).map((e) => e.from);
  const childrenOf = (id: string) => forward.filter((e) => e.from === id).map((e) => e.to);
  const rankOf = (id: string, trail = new Set<string>()): number => {
    const known = rank.get(id);
    if (known !== undefined) return known;
    if (trail.has(id)) return 0;
    trail.add(id);
    const parents = parentsOf(id);
    const r = parents.length ? Math.max(...parents.map((p) => rankOf(p, trail) + 1)) : 0;
    rank.set(id, r);
    return r;
  };
  for (const n of input.nodes) rankOf(n.id);
  // A shareholder with nothing above it sits just over what it holds. Left at
  // the top, a person holding 30% of a grandchild company would need a line
  // three ranks long, and a long line is where a chart starts to lie.
  for (const n of byName) {
    if (parentsOf(n.id).length) continue;
    const kids = childrenOf(n.id);
    if (kids.length) rank.set(n.id, Math.max(0, Math.min(...kids.map((k) => rank.get(k)!)) - 1));
  }

  // A holding that spans ranks passes through a slot of its own in each rank
  // between, so it can never run behind another box.
  type Slot = { id: string; node: GraphNode | null; w: number };
  const layers: Slot[][] = [];
  for (const n of byName) (layers[rank.get(n.id)!] ??= []).push({ id: n.id, node: n, w: W + 14 });
  const chains = new Map<string, string[]>();
  for (const e of forward) {
    const r1 = rank.get(e.from)!;
    const r2 = rank.get(e.to)!;
    const path = [e.from];
    for (let r = r1 + 1; r < r2; r++) {
      const id = `pass:${e.id}:${r}`;
      (layers[r] ??= []).push({ id, node: null, w: 24 });
      path.push(id);
    }
    path.push(e.to);
    chains.set(e.id, path);
  }
  for (let r = 0; r < layers.length; r++) layers[r] ??= [];
  const up = new Map<string, string[]>();
  const down = new Map<string, string[]>();
  for (const path of chains.values())
    for (let i = 1; i < path.length; i++) {
      down.set(path[i - 1]!, [...(down.get(path[i - 1]!) ?? []), path[i]!]);
      up.set(path[i]!, [...(up.get(path[i]!) ?? []), path[i - 1]!]);
    }

  // Order each rank by where its neighbours sit, sweeping down and up.
  const index = new Map<string, number>();
  layers.forEach((layer) => layer.forEach((s, i) => index.set(s.id, i)));
  const sweep = (r: number, neighbours: Map<string, string[]>) => {
    const layer = layers[r]!;
    const centre = (s: Slot) => {
      const ns = neighbours.get(s.id) ?? [];
      return ns.length
        ? ns.reduce((sum, p) => sum + index.get(p)!, 0) / ns.length
        : index.get(s.id)!;
    };
    const title = (s: Slot) => s.node?.title ?? s.id;
    layers[r] = [...layer].sort(
      (a, b) => centre(a) - centre(b) || title(a).localeCompare(title(b)),
    );
    layers[r]!.forEach((s, i) => index.set(s.id, i));
  };
  for (let pass = 0; pass < 4; pass++) {
    for (let r = 1; r < layers.length; r++) sweep(r, up);
    for (let r = layers.length - 2; r >= 0; r--) sweep(r, down);
  }

  // Each rank as a row. A line should run straight wherever it can, so a card
  // sits directly in line with a card it is joined to by a line of its own: a
  // holder over its one holding, a company under a holder that holds nothing
  // else. A holder with several holdings sits over the middle of them. Where
  // two such pulls disagree, the spacing wins and one line takes a bend.
  // Wide enough for a side entry's channel on either side of a box.
  const gap = GAP_X + 28;
  const x = new Map<string, number>();
  const rowWidth = (layer: Slot[]) =>
    layer.reduce((sum, s) => sum + s.w, 0) + Math.max(0, layer.length - 1) * gap;
  const widest = Math.max(0, ...layers.map(rowWidth));
  layers.forEach((layer) => {
    let cursor = PAD + (widest - rowWidth(layer)) / 2;
    for (const s of layer) {
      x.set(s.id, cursor);
      cursor += s.w + gap;
    }
  });
  const centreOf = (id: string, w: number) => x.get(id)! + w / 2;
  const slotW = new Map(layers.flat().map((s) => [s.id, s.w]));
  const c = (id: string) => centreOf(id, slotW.get(id)!);
  const joinMode = options.secondHolder === "joined";
  const wantedCentre = (s: Slot): number => {
    const ups = up.get(s.id) ?? [];
    const downs = down.get(s.id) ?? [];
    const between = (ids: string[]) => {
      const xs = ids.map(c);
      return (Math.min(...xs) + Math.max(...xs)) / 2;
    };
    // A card that holds several companies sits over the middle of them, so the
    // top of a group stands over the group rather than over one branch of it.
    if (downs.length > 1) return between(downs);
    // Where shareholders join above a card, the card sits between them and the
    // lines meet over its middle. Where one comes in at the side, the card sits
    // under the other so that line runs straight.
    if (joinMode && ups.length > 1) return between(ups);
    const soleUp = ups.find((u) => (down.get(u) ?? []).length === 1);
    if (soleUp) return c(soleUp);
    if (downs.length === 1) return c(downs[0]!);
    if (ups.length) return ups.reduce((sum, u) => sum + c(u), 0) / ups.length;
    return c(s.id);
  };
  const order = (from: number, to: number) =>
    from <= to
      ? Array.from({ length: to - from + 1 }, (_, i) => from + i)
      : Array.from({ length: from - to + 1 }, (_, i) => from - i);
  // Nothing recorded yet means no ranks, and `order(0, -1)` is not empty.
  for (let pass = 0; pass < 8 && layers.length; pass++) {
    for (const r of pass % 2 === 0 ? order(0, layers.length - 1) : order(layers.length - 1, 0)) {
      const layer = layers[r]!;
      const wanted = layer.map((s) => wantedCentre(s) - s.w / 2);
      // Left to right, then right to left, keeping the gaps.
      let min = PAD;
      layer.forEach((s, i) => {
        const at = Math.max(min, wanted[i]!);
        x.set(s.id, at);
        min = at + s.w + gap;
      });
      for (let i = layer.length - 2; i >= 0; i--) {
        const s = layer[i]!;
        const next = layer[i + 1]!;
        x.set(s.id, Math.min(x.get(s.id)!, x.get(next.id)! - gap - s.w));
      }
      const shift = PAD - Math.min(PAD, ...layer.map((s) => x.get(s.id)!));
      if (shift > 0) layer.forEach((s) => x.set(s.id, x.get(s.id)! + shift));
    }
  }
  // Snap each pair joined by a line of its own into one column where the row
  // has room: the company under its holder, or failing that the holder over it.
  const rowOf = new Map<string, Slot[]>();
  for (const layer of layers) for (const s of layer) rowOf.set(s.id, layer);
  const fits = (id: string, left: number) => {
    const row = rowOf.get(id)!;
    const i = row.findIndex((s) => s.id === id);
    const w = slotW.get(id)!;
    const prev = row[i - 1];
    const next = row[i + 1];
    return (
      left >= PAD &&
      (!prev || x.get(prev.id)! + prev.w + gap <= left + 0.5) &&
      (!next || left + w + gap <= x.get(next.id)! + 0.5)
    );
  };
  for (let round = 0; round < 3; round++)
    for (const [parent, kids] of down) {
      if (kids.length !== 1) continue;
      const child = kids[0]!;
      if ((up.get(child) ?? []).find((u) => (down.get(u) ?? []).length === 1) !== parent) continue;
      if (joinMode && (up.get(child) ?? []).length > 1) continue;
      const pc = c(parent);
      const cc = c(child);
      if (Math.abs(pc - cc) < 0.5) continue;
      // A card with several holdings of its own stays over them; its single
      // shareholder moves over it instead.
      const childLeads = (down.get(child) ?? []).length > 1;
      if (!childLeads && fits(child, pc - slotW.get(child)! / 2))
        x.set(child, pc - slotW.get(child)! / 2);
      else if (fits(parent, cc - slotW.get(parent)! / 2))
        x.set(parent, cc - slotW.get(parent)! / 2);
    }
  // Pulling boxes towards each other can leave the whole chart standing off to
  // one side; bring it back to the margin.
  const leftmost = Math.min(...layers.flat().map((s) => x.get(s.id)!));
  if (Number.isFinite(leftmost) && leftmost > PAD)
    for (const s of layers.flat()) x.set(s.id, x.get(s.id)! - (leftmost - PAD));

  // ---- Routing. Every line meets a box at the middle of an edge.
  type Hop = { edge: string; from: string; to: string; r: number };
  const hops: Hop[] = [];
  for (const [edgeId, path] of chains)
    for (let i = 1; i < path.length; i++)
      hops.push({ edge: edgeId, from: path[i - 1]!, to: path[i]!, r: rank.get(path[0]!)! + i - 1 });
  const edgeById = new Map(edges.map((e) => [e.id, e]));

  // One arm per holder per gap: its lines share the drop from the holder's
  // bottom edge and the run across, as the firm's decks draw them.
  const busesIn = (r: number) => new Set(hops.filter((h) => h.r === r).map((h) => h.from)).size;
  const TRACK = 10;
  const gapHeight = (r: number) => Math.max(GAP_Y + 22, 16 + busesIn(r) * TRACK + 34);
  const rowY: number[] = [];
  let y = PAD;
  for (let r = 0; r < layers.length; r++) {
    rowY[r] = y;
    y += H + gapHeight(r);
  }

  const placed: ChartNode[] = [];
  const passX = new Map<string, number>();
  layers.forEach((layer, r) =>
    layer.forEach((s) => {
      if (s.node) placed.push(place(s.node, x.get(s.id)!, rowY[r]!, s.w, H));
      else passX.set(s.id, x.get(s.id)! + s.w / 2);
    }),
  );
  const at = new Map(placed.map((n) => [n.id, n]));
  const centre = (id: string) => {
    const n = at.get(id);
    return n ? n.x + n.w / 2 : passX.get(id)!;
  };
  const LABEL = 9;
  const labelWidth = (text: string) => textWidth(text, LABEL);

  // Which edge of its box each line enters. The holder nearest above a box
  // comes in at the top; another comes in at the side it arrives from, or
  // joins the first above the box.
  type Entry = { side: "top" | "left" | "right"; joined: boolean };
  const entry = new Map<string, Entry>();
  for (const node of placed) {
    const incoming = hops
      .filter((h) => h.to === node.id)
      .sort(
        (a, b) =>
          Math.abs(centre(a.from) - centre(node.id)) - Math.abs(centre(b.from) - centre(node.id)),
      );
    const used = new Set<string>();
    incoming.forEach((h, i) => {
      if (i === 0) {
        entry.set(h.edge, { side: "top", joined: false });
        return;
      }
      const cx = centre(node.id);
      const side = centre(h.from) < cx ? "left" : "right";
      // Lines join above a card only when they arrive from opposite sides of
      // it, so each share sits on its own arm and both plainly lead into the
      // card. Merging into a line that already comes straight down would leave
      // the share pointing nowhere in particular: that one goes into the side.
      const firstX = centre(incoming[0]!.from);
      const opposite = (firstX - cx) * (centre(h.from) - cx) < 0 && Math.abs(firstX - cx) > 1;
      if ((!joinMode || !opposite) && !used.has(side)) {
        used.add(side);
        entry.set(h.edge, { side, joined: false });
      } else entry.set(h.edge, { side: "top", joined: true });
    });
  }

  /** Whether the line entering a card at the top comes straight down from its holder. */
  const primaryStraight = (id: string) => {
    const card = at.get(id);
    const first = hops.find(
      (h) => h.to === id && entry.get(h.edge)?.side === "top" && !entry.get(h.edge)?.joined,
    );
    return !!card && !!first && Math.abs(centre(first.from) - (card.x + card.w / 2)) < 0.5;
  };

  const SIDE = 22;
  const boxesIn = (r: number) => placed.filter((n) => n.y === rowY[r]);
  const clearAt = (px: number, r: number) =>
    !boxesIn(r).some((n) => px > n.x - 6 && px < n.x + n.w + 6);
  const dropX = (h: Hop): number => {
    const t = at.get(h.to);
    if (!t) return passX.get(h.to)!;
    const e = entry.get(h.edge)!;
    const cx = t.x + t.w / 2;
    const ex = centre(h.from);
    if (e.side === "top" && !e.joined) return cx;
    if (e.side === "top") {
      // When the first holder's line comes straight down into the card, this
      // holder's arm carries across to that line and joins it, as the 49% line
      // does on the current-structure slide.
      if (primaryStraight(t.id)) return cx;
      // A holder that already runs an arm to other companies carries that arm
      // on to the middle of this card and drops once; the other shareholder
      // joins the drop from its side.
      if (hops.some((o) => o.r === h.r && o.from === h.from && o.edge !== h.edge)) return cx;
      // Otherwise down just beside the card it joins, then a short arm into the
      // middle of its top: a long arm at that height would run past other lines.
      return cx + (ex < cx ? -44 : 44);
    }
    // A side entry comes straight down from the holder when nothing is in the
    // way, as the 51% line does in the deck; otherwise down a channel beside the box.
    const edgeX = e.side === "left" ? t.x : t.x + t.w;
    const beyond = e.side === "left" ? ex < edgeX - 16 : ex > edgeX + 16;
    if (beyond && clearAt(ex, h.r + 1)) return ex;
    return e.side === "left" ? t.x - SIDE : t.x + t.w + SIDE;
  };

  // Tracks: each holder's run across gets its own height in the gap, ordered to
  // cut as few of the other holders' drops as possible.
  const trackY = new Map<string, number>();
  for (let r = 0; r < layers.length; r++) {
    const gapHops = hops.filter((h) => h.r === r);
    const buses = [...new Set(gapHops.map((h) => h.from))].map((from) => {
      const drops = gapHops.filter((h) => h.from === from).map(dropX);
      const trunk = centre(from);
      return { from, trunk, drops, lo: Math.min(trunk, ...drops), hi: Math.max(trunk, ...drops) };
    });
    const inside = (v: number, lo: number, hi: number) => v > lo + 0.5 && v < hi - 0.5;
    const crossings = (order: typeof buses) => {
      let n = 0;
      order.forEach((e, i) =>
        order.forEach((f, j) => {
          if (i === j) return;
          if (inside(f.trunk, e.lo, e.hi) && i < j) n++;
          for (const d of f.drops) if (inside(d, e.lo, e.hi) && i > j) n++;
        }),
      );
      return n;
    };
    const order = [...buses].sort((a, b) => a.hi - a.lo - (b.hi - b.lo) || a.trunk - b.trunk);
    for (let improved = true, guard = 0; improved && guard < 60; guard++) {
      improved = false;
      for (let i = 0; i + 1 < order.length; i++) {
        const swapped = [...order];
        [swapped[i], swapped[i + 1]] = [swapped[i + 1]!, swapped[i]!];
        if (crossings(swapped) < crossings(order)) {
          order.splice(0, order.length, ...swapped);
          improved = true;
        }
      }
    }
    const top = (rowY[r] ?? 0) + H + 16;
    order.forEach((b, i) => trackY.set(`${b.from}|${r}`, top + i * TRACK));
  }

  /** Drops repeated points and points in the middle of a straight run. */
  const clean = (pts: Point[]) => {
    const unique = pts.filter((p, i) => i === 0 || p.x !== pts[i - 1]!.x || p.y !== pts[i - 1]!.y);
    return unique.filter((p, i) => {
      const a = unique[i - 1];
      const b = unique[i + 1];
      if (!a || !b) return true;
      return !((a.x === p.x && p.x === b.x) || (a.y === p.y && p.y === b.y));
    });
  };

  // Whether a joining arm can come straight down from the middle of its holder
  // and turn once at the join: nothing else may cross the drop or the arm.
  const straightJoin = (hop: Hop, trunk: number, cx: number, joinY: number) => {
    const r = hop.r;
    const ownTrack = trackY.get(`${hop.from}|${r}`)!;
    const lo = Math.min(trunk, cx);
    const hi = Math.max(trunk, cx);
    for (const other of hops.filter((h) => h.r === r && h.edge !== hop.edge)) {
      const ox = dropX(other);
      const oTrack = trackY.get(`${other.from}|${r}`)!;
      // Another line's drop through the arm.
      if (other.to !== hop.to && ox > lo + 0.5 && ox < hi - 0.5) return false;
      // Another holder's run across the drop, below this holder's own run.
      if (other.from !== hop.from && oTrack > ownTrack && oTrack < joinY) {
        const oLo = Math.min(centre(other.from), ox);
        const oHi = Math.max(centre(other.from), ox);
        if (trunk > oLo + 0.5 && trunk < oHi - 0.5) return false;
      }
    }
    return true;
  };

  const chartEdges: ChartEdge[] = edges.map((e) => {
    const path = chains.get(e.id);
    const from = at.get(e.from)!;
    const to = at.get(e.to)!;
    const base = {
      id: e.id,
      from: e.from,
      to: e.to,
      label: e.label ?? "",
      style: e.style ?? "solid",
    };
    if (!path) return { ...base, points: direct(from, to) };
    const finalHop = hops.find((h) => h.edge === e.id && h.to === e.to)!;
    const ent = entry.get(e.id) ?? { side: "top" as const, joined: false };
    const tw = labelWidth(base.label);

    if (options.connector === "straight") {
      const start = { x: from.x + from.w / 2, y: from.y + from.h };
      const end =
        ent.side === "top"
          ? { x: to.x + to.w / 2, y: to.y }
          : { x: ent.side === "left" ? to.x : to.x + to.w, y: to.y + to.h / 2 };
      const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
      return { ...base, points: [start, end], labelAt: { x: mid.x + 6, y: mid.y - 4 } };
    }

    const points: Point[] = [];
    let labelAt: Point | undefined;
    for (let i = 1; i < path.length; i++) {
      const hop = hops.find((h) => h.edge === e.id && h.from === path[i - 1] && h.to === path[i])!;
      const r = hop.r;
      const trunk = centre(hop.from);
      const startY = at.get(hop.from) ? rowY[r]! + H : rowY[r]!;
      if (!at.get(hop.from)) points.push({ x: trunk, y: rowY[r]! }, { x: trunk, y: rowY[r]! + H });
      else points.push({ x: trunk, y: startY });
      const ty = trackY.get(`${hop.from}|${r}`)!;
      const dx = dropX(hop);
      points.push({ x: trunk, y: ty }, { x: dx, y: ty });
      const nextTop = rowY[r + 1]!;
      if (hop !== finalHop) {
        points.push({ x: dx, y: nextTop });
        continue;
      }
      const cx = to.x + to.w / 2;
      if (ent.side === "top" && !ent.joined) {
        points.push({ x: cx, y: nextTop });
        labelAt = { x: cx + 6, y: nextTop - 7 };
      } else if (ent.side === "top") {
        // High enough that the arm's share sits clear of the label beside the line below it.
        const joinY = nextTop - 24;
        if (dx === cx) {
          // Joined on the holder's own arm: across to the straight line, then down it.
          points.push({ x: cx, y: nextTop });
          labelAt = { x: cx + (trunk < cx ? -tw - 6 : 6), y: ty - 5 };
        } else if (straightJoin(hop, trunk, cx, joinY)) {
          // As the target slide draws the 25% and 75% arms: straight down from
          // the middle of the holder to the join, one turn, into the shared drop.
          points.splice(
            points.length - 2,
            2,
            { x: trunk, y: joinY },
            { x: cx, y: joinY },
            { x: cx, y: nextTop },
          );
          labelAt = {
            x: Math.min(trunk, cx) + Math.max(4, (Math.abs(cx - trunk) - tw) / 2),
            y: joinY - 5,
          };
        } else {
          points.push({ x: dx, y: joinY }, { x: cx, y: joinY }, { x: cx, y: nextTop });
          labelAt = {
            x: Math.min(dx, cx) + Math.max(4, (Math.abs(cx - dx) - tw) / 2),
            y: joinY - 5,
          };
        }
      } else {
        const midY = to.y + to.h / 2;
        const edgeX = ent.side === "left" ? to.x : to.x + to.w;
        points.push({ x: dx, y: midY }, { x: edgeX, y: midY });
        const arm = Math.abs(edgeX - dx);
        labelAt =
          arm >= tw + 12
            ? { x: Math.min(dx, edgeX) + (arm - tw) / 2, y: midY - 6 }
            : // A short arm has no room for the share. It goes beside the line in the
              // open space above the card, on the card's side of the line, clear of
              // the neighbouring card.
              {
                x: ent.side === "right" ? dx - tw * 1.3 - 6 : dx + 6,
                y: (Math.max(ty, nextTop - 40) + nextTop) / 2 + 3,
              };
      }
    }
    const edge: ChartEdge = { ...base, points: clean(points) };
    if (labelAt && edgeById.has(e.id)) edge.labelAt = labelAt;
    return edge;
  });
  return { nodes: placed, edges: chartEdges, ...bounds(placed) };
}

/* --------------------------------------------------------------- sideways */

/** Drops repeated points and points in the middle of a straight run. */
const cleanPath = (pts: Point[]) => {
  const unique = pts.filter((p, i) => i === 0 || p.x !== pts[i - 1]!.x || p.y !== pts[i - 1]!.y);
  return unique.filter((p, i) => {
    const a = unique[i - 1];
    const b = unique[i + 1];
    if (!a || !b) return true;
    return !((a.x === p.x && p.x === b.x) || (a.y === p.y && p.y === b.y));
  });
};

/**
 * Lines for a chart read left to right. A line leaves the middle of a card's
 * right edge and enters the middle of the next card's left edge. Where several
 * holders come into one card their arms meet just before it, so each share sits
 * on its own holder's arm; a card with one holder carries its share on the
 * short run into it. A line between cards in one column, or running back, is
 * drawn side to side as a functional line is.
 */
export function routeSideways(
  nodes: ChartNode[],
  edges: ChartEdge[],
  connector: RouteOptions["connector"] = "squared",
): ChartEdge[] {
  const at = new Map(nodes.map((n) => [n.id, n]));
  const forward = (e: ChartEdge) => {
    const from = at.get(e.from);
    const to = at.get(e.to);
    return !!from && !!to && e.style !== "dotted" && to.x >= from.x + from.w + 16;
  };
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number>();
  /** Where a box's lines turn: halfway to the nearest box it leads to, shared by all its lines. */
  const bus = new Map<string, number>();
  for (const e of edges) {
    if (!forward(e)) continue;
    incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1);
    outgoing.set(e.from, (outgoing.get(e.from) ?? 0) + 1);
    const from = at.get(e.from)!;
    const gap = at.get(e.to)!.x - (from.x + from.w);
    const turn = from.x + from.w + Math.max(20, Math.round(gap / 2));
    bus.set(e.from, Math.min(bus.get(e.from) ?? Infinity, turn));
  }
  /** For a box several holders come into: the one upright they share, and whose it is. */
  const joinAt = new Map<string, { x: number; owner: string | null }>();
  for (const [target, count] of incoming) {
    if (count < 2) continue;
    const to = at.get(target)!;
    const holders = edges.filter((e) => e.to === target && forward(e)).map((e) => e.from);
    const splitting = holders
      .filter((h) => (outgoing.get(h) ?? 0) > 1 && bus.get(h)! < to.x - 12)
      .sort((a, b) => bus.get(b)! - bus.get(a)!);
    const owner = splitting[0] ?? null;
    joinAt.set(target, { x: owner ? bus.get(owner)! : to.x - 28, owner });
  }
  const trunkOf = (e: ChartEdge) => joinAt.get(e.to)?.x ?? bus.get(e.from)!;
  return edges.map((e) => {
    const from = at.get(e.from);
    const to = at.get(e.to);
    if (!from || !to) return e;
    const { labelAt: _dropped, ...rest } = e;
    if (!forward(e)) return { ...rest, points: direct(from, to) };
    const start = { x: from.x + from.w, y: from.y + from.h / 2 };
    const end = { x: to.x, y: to.y + to.h / 2 };
    // Measured generously: the screen sets shares in a monospaced face.
    const tw = textWidth(e.label, 9) * 1.55;
    if (connector === "straight") {
      const t = 0.7;
      return {
        ...rest,
        points: [start, end],
        labelAt: {
          x: start.x + (end.x - start.x) * t - tw / 2,
          y: start.y + (end.y - start.y) * t - 6,
        },
      };
    }
    // Every line into a box comes down one upright, and a box leading to
    // several turns all its lines on one upright. Where the two meet, the box
    // that splits owns the upright and the other holders join it.
    const trunk = trunkOf(e);
    const points = cleanPath([start, { x: trunk, y: start.y }, { x: trunk, y: end.y }, end]);
    // The share sits on the holder's own arm, which is its alone, unless the
    // holder splits several lines from this upright: then the arm is shared
    // and each share goes on its own branch into its box.
    const branch =
      !joinAt.has(e.to) ||
      edges.some((o) => o !== e && o.from === e.from && forward(o) && trunkOf(o) === trunk);
    const labelAt = branch
      ? { x: trunk + 6, y: end.y - 5 }
      : { x: Math.max(start.x + 4, trunk - tw - 6), y: start.y - 5 };
    return { ...rest, points, labelAt };
  });
}

/**
 * The same chart turned to read left to right: each row becomes a column, and
 * the order along a row runs down the column. Cards keep their size.
 */
export function turnSideways(layout: ChartLayout, options: RouteOptions = {}): ChartLayout {
  if (!layout.nodes.length) return layout;
  const rows = [...new Set(layout.nodes.map((n) => n.y))].sort((a, b) => a - b);
  const w = Math.max(...layout.nodes.map((n) => n.w));
  const h = Math.max(...layout.nodes.map((n) => n.h));
  const minX = Math.min(...layout.nodes.map((n) => n.x));
  const COLUMN_GAP = 104;
  const factor = (h + 22) / (w + 34);
  const turned = layout.nodes.map((n) => ({
    ...n,
    x: PAD + rows.indexOf(n.y) * (w + COLUMN_GAP),
    y: PAD + Math.round((n.x - minX) * factor),
  }));
  // Keep the order down each column, and keep cards from touching.
  const byColumn = new Map<number, ChartNode[]>();
  for (const n of turned) byColumn.set(n.x, [...(byColumn.get(n.x) ?? []), n]);
  for (const column of byColumn.values()) {
    column.sort((a, b) => a.y - b.y);
    for (let i = 1; i < column.length; i++) {
      const prev = column[i - 1]!;
      column[i]!.y = Math.max(column[i]!.y, prev.y + prev.h + 18);
    }
  }
  const edges = routeSideways(turned, layout.edges, options.connector);
  return { nodes: turned, edges, ...bounds(turned) };
}

/* ------------------------------------------------------------------ text */

/**
 * Approximate Helvetica advance widths (per 1000 em) for printable ASCII, so
 * the screen, PDF and PowerPoint cut long titles at the same place.
 */
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

export const textWidth = (text: string, size: number, bold = false) => {
  let units = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    units += c >= 32 && c <= 126 ? HELVETICA[c - 32]! : 556;
  }
  return (units / 1000) * size * (bold ? 1.06 : 1);
};

/** Cut to fit with an ellipsis. */
export const fitText = (text: string, maxWidth: number, size: number, bold = false) => {
  if (textWidth(text, size, bold) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && textWidth(`${cut}…`, size, bold) > maxWidth) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
};

/** Where to place an edge label: near the lower end, on the last vertical run. */
export const labelPoint = (edge: ChartEdge): Point => {
  if (edge.labelAt) return edge.labelAt;
  const pts = edge.points;
  const last = pts[pts.length - 1]!;
  const prev = pts[pts.length - 2] ?? last;
  if (prev.x === last.x) return { x: last.x + 6, y: last.y - 8 };
  return { x: (prev.x + last.x) / 2, y: (prev.y + last.y) / 2 - 6 };
};
