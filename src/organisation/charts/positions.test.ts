import { describe, expect, it } from "vitest";
import { layoutTree, NODE_W } from "./layout";
import { applyPositions, MARGIN } from "./positions";

const chart = () =>
  layoutTree(
    {
      nodes: [
        { id: "ceo", kind: "role", title: "CEO", subtitle: "", tone: "leadership", parentId: null },
        { id: "cfo", kind: "role", title: "CFO", subtitle: "", tone: "head", parentId: "ceo" },
        { id: "coo", kind: "role", title: "COO", subtitle: "", tone: "head", parentId: "ceo" },
      ],
      lines: [{ id: "fn", from: "cfo", to: "coo", label: "Budget" }],
    },
    { connector: "squared" },
  );

const node = (layout: ReturnType<typeof chart>, id: string) =>
  layout.nodes.find((n) => n.id === id)!;
const edge = (layout: ReturnType<typeof chart>, id: string) =>
  layout.edges.find((e) => e.id === id)!;

describe("cards placed by hand", () => {
  it("leaves the chart alone when nothing is placed, only cards that have gone, or cards where they already are", () => {
    const base = chart();
    const cfo = node(base, "cfo");
    expect(applyPositions(base, {}, "squared")).toBe(base);
    expect(applyPositions(base, { gone: { x: 40, y: 40 } }, "squared")).toBe(base);
    expect(applyPositions(base, { cfo: { x: cfo.x, y: cfo.y } }, "squared")).toBe(base);
  });

  it("puts the card exactly where it was dropped and draws its lines again from the middle of its edges", () => {
    const base = chart();
    const target = { x: node(base, "coo").x + 120, y: node(base, "coo").y + 60 };
    const moved = applyPositions(base, { coo: target }, "squared");
    const coo = node(moved, "coo");
    expect({ x: coo.x, y: coo.y }).toEqual(target);

    const line = edge(moved, "tree-coo");
    const ceo = node(moved, "ceo");
    expect(line.points[0]).toEqual({ x: ceo.x + ceo.w / 2, y: ceo.y + ceo.h });
    expect(line.points.at(-1)).toEqual({ x: coo.x + coo.w / 2, y: coo.y });
    line.points.slice(1).forEach((p, i) => {
      const q = line.points[i]!;
      expect(p.x === q.x || p.y === q.y).toBe(true);
    });
    // Its sibling's line is drawn again too, and both turn on the same run
    // across under the CEO, so the fork stays even.
    const run = (id: string) =>
      edge(moved, id).points.filter((p, i, all) => i > 0 && all[i - 1]!.y === p.y)[0]?.y;
    expect(run("tree-cfo")).toBeDefined();
    expect(run("tree-cfo")).toBe(run("tree-coo"));
    expect(edge(moved, "fn").labelAt).toBeUndefined();
  });

  it("stays put however the rest of the chart is laid out afterwards", () => {
    const base = chart();
    const spot = { x: 700, y: 300 };
    const wider = layoutTree({
      nodes: [
        { id: "ceo", kind: "role", title: "CEO", subtitle: "", tone: "leadership", parentId: null },
        { id: "cfo", kind: "role", title: "CFO", subtitle: "", tone: "head", parentId: "ceo" },
        { id: "coo", kind: "role", title: "COO", subtitle: "", tone: "head", parentId: "ceo" },
        { id: "cto", kind: "role", title: "CTO", subtitle: "", tone: "head", parentId: "ceo" },
      ],
    });
    expect(node(applyPositions(base, { coo: spot }, "squared"), "coo").x).toBe(700);
    expect(node(applyPositions(wider, { coo: spot }, "squared"), "coo").x).toBe(700);
  });

  it("keeps a card on the page and grows the page to fit it", () => {
    const base = chart();
    const moved = applyPositions(
      base,
      { ceo: { x: -5000, y: -5000 }, coo: { x: 1100, y: 500 } },
      "straight",
    );
    expect(node(moved, "ceo").x).toBe(MARGIN);
    expect(node(moved, "ceo").y).toBe(MARGIN);
    expect(moved.width).toBeGreaterThanOrEqual(node(moved, "coo").x + NODE_W);
    expect(edge(moved, "tree-coo").points).toHaveLength(2);
  });

  it("read left to right, draws every line from the right edge into the left", () => {
    const base = chart();
    const moved = applyPositions(base, { coo: { x: 600, y: 200 } }, "squared", "right");
    const line = edge(moved, "tree-coo");
    const ceo = node(moved, "ceo");
    const coo = node(moved, "coo");
    expect(line.points[0]).toEqual({ x: ceo.x + ceo.w, y: ceo.y + ceo.h / 2 });
    expect(line.points.at(-1)).toEqual({ x: coo.x, y: coo.y + coo.h / 2 });
  });
});
