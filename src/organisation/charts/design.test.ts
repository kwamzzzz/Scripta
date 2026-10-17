import { describe, expect, it } from "vitest";
import { layoutLayered, layoutTree, turnSideways } from "./layout";
import {
  EMPTY_DESIGN,
  formatEdges,
  formatNodes,
  groupNodes,
  placeNodes,
  readDesign,
  removeContainer,
  renameNode,
  setLegend,
  setMembership,
  snapBack,
  toggleLegendItem,
  viewKey,
  type ChartDesign,
} from "./design";
import { arrange, cardSize, compose, legendItems } from "./compose";
import { inkFor } from "./style";
import { chartPptx } from "./export";
import { parsePptx } from "./import";

const tree = () =>
  layoutTree({
    nodes: [
      {
        id: "ubo",
        kind: "person",
        title: "Dominik Kleemann",
        subtitle: "Dubai",
        tone: "holder",
        parentId: null,
      },
      {
        id: "llc",
        kind: "entity",
        title: "Nexis Africa LLC",
        subtitle: "UAE",
        tone: "home",
        parentId: "ubo",
      },
      {
        id: "gh",
        kind: "entity",
        title: "Nexis Africa (Ghana)",
        subtitle: "Ghana",
        tone: "foreign",
        parentId: "ubo",
      },
    ],
  });

const apply = (...ops: ((d: ChartDesign) => ChartDesign)[]) =>
  ops.reduce((d, op) => op(d), EMPTY_DESIGN);

describe("a chart's design", () => {
  it("reads back only what is well formed", () => {
    const d = readDesign({
      direction: "sideways",
      nodes: { a: { fill: "#c8373b", border: "wavy", tag: "new" }, b: { fill: "red" } },
      edges: { e: { line: "dashed", colour: "nope" } },
      containers: [{ id: "c", label: "Dubai", colour: "puce", members: ["a", 3] }],
      notes: [{ id: "n", text: "DK + partners", x: 10, y: "x" }],
      positions: { "current:down": { a: { x: 10.4, y: 20.6 }, b: { x: "no" } } },
    });
    expect(d.direction).toBe("down");
    expect(d.nodes).toEqual({ a: { fill: "#C8373B", tag: "new" } });
    expect(d.edges).toEqual({ e: { line: "dashed" } });
    expect(d.containers).toEqual([{ id: "c", label: "Dubai", colour: "grey", members: ["a"] }]);
    expect(d.notes).toEqual([]);
    expect(d.positions).toEqual({ "current:down": { a: { x: 10, y: 21 } } });
  });

  it("clears a format field set to nothing, and forgets a box with no format left", () => {
    const d = apply(
      formatNodes(["a"], { fill: "#C8373B", tag: "NEW" }),
      formatNodes(["a"], { tag: "" }),
    );
    expect(d.nodes).toEqual({ a: { fill: "#C8373B" } });
    expect(
      apply(formatNodes(["a"], { fill: "#C8373B" }), formatNodes(["a"], { fill: undefined })).nodes,
    ).toEqual({});
    expect(apply(formatEdges(["e"], { label: "DK + partners" })).edges).toEqual({
      e: { label: "DK + partners" },
    });
  });

  it("keeps a box in one container at most, and drops a container left empty", () => {
    const dubai = groupNodes(["llc", "mea"], "Dubai entities", "green", "dubai");
    const ghana = groupNodes(["gh", "mea"], "Ghana entities", "pink", "ghana");
    let d = apply(dubai.op, ghana.op);
    expect(d.containers.find((c) => c.id === "dubai")!.members).toEqual(["llc"]);
    expect(d.containers.find((c) => c.id === "ghana")!.members).toEqual(["gh", "mea"]);
    d = setMembership(["llc"], null)(d);
    expect(d.containers.map((c) => c.id)).toEqual(["ghana"]);
    expect(removeContainer("ghana")(d).containers).toEqual([]);
  });

  it("places and snaps back by view", () => {
    const key = viewKey("current", "down");
    let d = apply(placeNodes(key, { a: { x: 10, y: 20 }, b: { x: 30, y: 40 } }));
    d = placeNodes(key, { b: null })(d);
    expect(d.positions).toEqual({ [key]: { a: { x: 10, y: 20 } } });
    expect(snapBack(key)(d).positions).toEqual({});
  });

  it("keeps a renamed box's colours, place and container", () => {
    const key = viewKey("current", "down");
    const d = renameNode(
      "o:Minority",
      "o:Minority partner",
    )(
      apply(
        formatNodes(["o:Minority"], { fill: "#8E9194" }),
        placeNodes(key, { "o:Minority": { x: 1, y: 2 } }),
        groupNodes(["o:Minority"], "Outside", "grey", "g").op,
      ),
    );
    expect(d.nodes["o:Minority partner"]).toEqual({ fill: "#8E9194" });
    expect(d.positions[key]).toEqual({ "o:Minority partner": { x: 1, y: 2 } });
    expect(d.containers[0]!.members).toEqual(["o:Minority partner"]);
  });
});

describe("drawing a design", () => {
  it("writes white on dark cards and navy on light ones", () => {
    expect(inkFor("#16384F")).toBe("#FFFFFF");
    expect(inkFor("#C8373B")).toBe("#FFFFFF");
    expect(inkFor("#E6EBF2")).toBe("#123247");
    expect(inkFor("#FFFFFF")).toBe("#123247");
  });

  it("makes every card tall enough for the extra lines any card carries", () => {
    const d = apply(
      formatNodes(["ubo"], { eyebrow: "Ultimate beneficial owner" }),
      formatNodes(["gh"], { note: "(Advisory business)" }),
    );
    const size = cardSize(d, ["ubo", "llc", "gh"]);
    expect(size.nodeH).toBe(52 + 12 + 13);
    expect(cardSize(d, ["llc"]).nodeH).toBe(52);
    const layout = arrange(
      (route) =>
        layoutTree(
          { nodes: tree().nodes.map((n, i) => ({ ...n, parentId: i ? "ubo" : null })) },
          route,
        ),
      d,
      "reporting",
    );
    expect(new Set(layout.nodes.map((n) => n.h))).toEqual(new Set([77]));
  });

  it("stacks eyebrow, name, subtitle and note inside the card, in that order", () => {
    const d = apply(
      formatNodes(["ubo"], {
        eyebrow: "Ultimate beneficial owner",
        note: "Dubai, UAE",
        fill: "#16384F",
        tag: "ubo",
      }),
    );
    const c = compose(tree(), d, "ownership");
    const ubo = c.nodes.find((n) => n.id === "ubo")!;
    expect(ubo.lines.map((l) => l.text)).toEqual([
      "ULTIMATE BENEFICIAL OWNER",
      "Dominik Kleemann",
      "Dubai",
      "Dubai, UAE",
    ]);
    const ys = ubo.lines.map((l) => l.y);
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
    expect(ubo.ink).toBe("#FFFFFF");
    expect(ubo.tag).toBe("UBO");
  });

  it("draws a container around its boxes with room for its label, and grows the page to fit", () => {
    const d = apply(groupNodes(["llc", "gh"], "Dubai entities", "green", "g").op);
    const c = compose(tree(), d, "ownership");
    const box = c.containers[0]!;
    for (const id of ["llc", "gh"]) {
      const n = c.nodes.find((x) => x.id === id)!;
      expect(box.x).toBeLessThan(n.x);
      expect(box.x + box.w).toBeGreaterThan(n.x + n.w);
      expect(box.y + box.h).toBeGreaterThan(n.y + n.h + 20);
    }
    expect(c.height).toBeGreaterThanOrEqual(box.y + box.h);
  });

  it("builds the legend from what is drawn, with the lawyer's own labels", () => {
    const layout = layoutLayered({
      nodes: [
        { id: "a", kind: "entity", title: "A", subtitle: "", tone: "home" },
        { id: "b", kind: "entity", title: "B", subtitle: "", tone: "home" },
        { id: "c", kind: "entity", title: "C", subtitle: "", tone: "home" },
      ],
      edges: [
        { id: "ab", from: "a", to: "b", label: "100%" },
        { id: "ac", from: "a", to: "c", label: "25%" },
      ],
    });
    let d = apply(
      formatNodes(["b"], { fill: "#EAF2EA" }),
      formatEdges(["ac"], { line: "dashed" }),
      setLegend({
        show: true,
        labels: { "fill:#EAF2EA": "Dubai entities", "line:dashed": "New ownership" },
      }),
    );
    const c = compose(layout, d, "ownership");
    expect(c.legend!.items.map((i) => i.label)).toEqual([
      "Dubai entities",
      "Ownership",
      "New ownership",
    ]);
    d = toggleLegendItem("line:solid", false)(d);
    expect(legendItems(c.nodes, c.edges, d, "ownership").map((i) => i.key)).toEqual([
      "fill:#EAF2EA",
      "line:dashed",
    ]);
    expect(c.edges.find((e) => e.id === "ac")!.dash).toBe("dashed");
  });

  it("shows a line's own label in place of the share, and keeps the meaning of a removed line", () => {
    const layout = layoutLayered({
      nodes: [
        { id: "a", kind: "entity", title: "A", subtitle: "", tone: "home" },
        { id: "b", kind: "entity", title: "B", subtitle: "", tone: "home" },
      ],
      edges: [{ id: "ab", from: "a", to: "b", label: "51%", style: "removed" }],
    });
    const c = compose(
      layout,
      apply(formatEdges(["ab"], { label: "DK + partners", colour: "#247A78", line: "dashed" })),
      "ownership",
    );
    const e = c.edges[0]!;
    expect(e.text).toBe("DK + partners");
    expect(e.colour).toBe("#B4483A");
    expect(e.dash).toBe("none");
  });

  it("turns a chart to read left to right, one column per rank", () => {
    const turned = turnSideways(tree());
    const at = (id: string) => turned.nodes.find((n) => n.id === id)!;
    expect(at("llc").x).toBeGreaterThan(at("ubo").x + at("ubo").w);
    expect(at("llc").x).toBe(at("gh").x);
    expect(Math.abs(at("llc").y - at("gh").y)).toBeGreaterThanOrEqual(at("llc").h);
    const line = turned.edges.find((e) => e.to === "gh")!;
    expect(line.points[0]).toEqual({
      x: at("ubo").x + at("ubo").w,
      y: at("ubo").y + at("ubo").h / 2,
    });
    expect(line.points.at(-1)).toEqual({ x: at("gh").x, y: at("gh").y + at("gh").h / 2 });
  });

  it("sends containers, tags, notes and the legend to PowerPoint as drawing an import leaves out", async () => {
    const layout = layoutLayered({
      nodes: [
        { id: "a", kind: "entity", title: "Rimac Group", subtitle: "", tone: "home" },
        { id: "b", kind: "entity", title: "Bugatti Rimac", subtitle: "", tone: "home" },
      ],
      edges: [{ id: "ab", from: "a", to: "b", label: "55%" }],
    });
    const d = apply(
      formatNodes(["a"], { fill: "#D2601A", eyebrow: "Holding company", tag: "new" }),
      formatEdges(["ab"], { line: "dashed" }),
      groupNodes(["b"], "Operating companies", "pink", "g").op,
      setLegend({ show: true }),
    );
    const bytes = chartPptx(
      compose(layout, d, "ownership"),
      { title: "Test", footer: "As at" },
      "A4",
    );
    const job = await parsePptx(bytes, "ownership", "test.pptx");
    expect(job.nodes.map((n) => n.title).sort()).toEqual(["Bugatti Rimac", "Rimac Group"]);
    expect(job.edges.filter((e) => !e.inferred)).toHaveLength(1);
    expect(job.unresolved).toEqual([]);
  });

  it("read left to right, splits a box's lines on one trunk", () => {
    const layout = layoutLayered({
      nodes: [
        { id: "g", kind: "entity", title: "Rimac Group", subtitle: "", tone: "home" },
        { id: "t", kind: "entity", title: "Rimac Technologies", subtitle: "", tone: "home" },
        { id: "b", kind: "entity", title: "Bugatti Rimac", subtitle: "", tone: "home" },
        { id: "p", kind: "entity", title: "Porsche", subtitle: "", tone: "home" },
      ],
      edges: [
        { id: "gt", from: "g", to: "t", label: "100%" },
        { id: "gb", from: "g", to: "b", label: "55%" },
        { id: "pb", from: "p", to: "b", label: "45%" },
      ],
    });
    const turned = turnSideways(layout);
    // Every turn either line makes is on the same upright.
    const turns = ["gt", "gb"].flatMap((id) =>
      turned.edges
        .find((e) => e.id === id)!
        .points.slice(1, -1)
        .map((p) => p.x),
    );
    expect(turns.length).toBeGreaterThan(0);
    expect(new Set(turns).size).toBe(1);
  });

  it("read left to right, brings every holder of a box down one upright even when one of them also splits", () => {
    const e = (id: string, title: string) => ({
      id,
      kind: "entity" as const,
      title,
      subtitle: "",
      tone: "home" as const,
    });
    const layout = layoutLayered({
      nodes: [
        e("h", "Hyundai"),
        e("m", "Mate Rimac"),
        e("o", "Other Investors"),
        e("p", "Porsche"),
        e("g", "Rimac Group"),
        e("t", "Rimac Technologies"),
        e("b", "Bugatti Rimac"),
      ],
      edges: [
        { id: "hg", from: "h", to: "g", label: "12%" },
        { id: "mg", from: "m", to: "g", label: "37%" },
        { id: "og", from: "o", to: "g", label: "27%" },
        { id: "pg", from: "p", to: "g", label: "24%" },
        { id: "gt", from: "g", to: "t", label: "100%" },
        { id: "gb", from: "g", to: "b", label: "55%" },
        { id: "pb", from: "p", to: "b", label: "45%" },
      ],
    });
    const turned = turnSideways(layout);
    const uprights = (ids: string[]) =>
      new Set(
        ids.flatMap((id) =>
          turned.edges
            .find((x) => x.id === id)!
            .points.slice(1, -1)
            .map((pt) => pt.x),
        ),
      );
    // Into Rimac Group: one upright for all four holders, Porsche included.
    expect(uprights(["hg", "mg", "og", "pg"]).size).toBeLessThanOrEqual(1);
    // Out of Rimac Group: one upright for both its companies, even though Porsche joins one of them.
    expect(uprights(["gt", "gb"]).size).toBeLessThanOrEqual(1);
    expect(uprights(["gb", "pb"]).size).toBeLessThanOrEqual(1);
    // No two shares sit on top of each other.
    const labels = turned.edges.map(
      (x) => `${Math.round(x.labelAt!.x)},${Math.round(x.labelAt!.y)}`,
    );
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("centres the drawing on the page, both ways, between the title and the foot", async () => {
    const layout = layoutLayered({
      nodes: [
        { id: "a", kind: "entity", title: "Holding", subtitle: "", tone: "home" },
        { id: "b", kind: "entity", title: "Operating", subtitle: "", tone: "home" },
      ],
      edges: [{ id: "ab", from: "a", to: "b", label: "" }],
    });
    const bytes = chartPptx(
      compose(layout, EMPTY_DESIGN, "ownership"),
      { title: "T", footer: "F" },
      "A4",
    );
    const JSZip = (await import("jszip")).default;
    const slide = await (
      await JSZip.loadAsync(bytes)
    )
      .file("ppt/slides/slide1.xml")!
      .async("string");
    const cards = [
      ...slide.matchAll(
        /<p:sp><p:nvSpPr><p:cNvPr id="\d+" name="(Holding|Operating)"\/>[\s\S]*?<a:off x="(\d+)" y="(\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/g,
      ),
    ].map((m) => ({ x: +m[2]!, y: +m[3]!, w: +m[4]!, h: +m[5]! }));
    expect(cards).toHaveLength(2);
    const [sw, sh] = [10692000, 7560000];
    const margin = 457200;
    const left = Math.min(...cards.map((c) => c.x)) - margin;
    const right = sw - margin - Math.max(...cards.map((c) => c.x + c.w));
    const top = Math.min(...cards.map((c) => c.y)) - (margin + 520000);
    const bottom = sh - margin - 320000 - Math.max(...cards.map((c) => c.y + c.h));
    expect(Math.abs(left - right)).toBeLessThan(20000);
    expect(Math.abs(top - bottom)).toBeLessThan(20000);
  });

  it("gives a box a size of its own, growing about its middle, and reads it back within limits", () => {
    const layout = tree();
    const before = layout.nodes.find((n) => n.id === "llc")!;
    const d = apply(formatNodes(["llc"], { w: 300, h: 120 }));
    const drawn = arrange(() => layout, d, "reporting").nodes.find((n) => n.id === "llc")!;
    expect([drawn.w, drawn.h]).toEqual([300, 120]);
    expect(drawn.x + drawn.w / 2).toBeCloseTo(before.x + before.w / 2, 5);
    expect(drawn.y).toBe(before.y);
    expect(readDesign({ nodes: { a: { w: 5, h: 9000 } } }).nodes["a"]).toEqual({ w: 80, h: 420 });
  });

  it("wraps a long name on a tall box instead of cutting it short, and keeps it whole in PowerPoint", async () => {
    const title = "Nexis Africa Middle East and Africa Holdings Free Zone Company";
    const layout = layoutLayered({
      nodes: [{ id: "a", kind: "entity", title, subtitle: "", tone: "home" }],
      edges: [],
    });
    const short = compose(layout, EMPTY_DESIGN, "ownership").nodes[0]!;
    expect(short.lines.filter((l) => l.role === "title")).toHaveLength(1);
    expect(short.lines[0]!.text.endsWith("…")).toBe(true);
    const d = apply(formatNodes(["a"], { h: 110 }));
    const tall = compose(
      arrange(() => layout, d, "current"),
      d,
      "ownership",
    ).nodes[0]!;
    const titleLines = tall.lines.filter((l) => l.role === "title").map((l) => l.text);
    expect(titleLines.length).toBeGreaterThan(1);
    expect(titleLines.join(" ")).toBe(title);
    const bytes = chartPptx(
      compose(
        arrange(() => layout, d, "current"),
        d,
        "ownership",
      ),
      { title: "T", footer: "F" },
      "A4",
    );
    const job = await parsePptx(bytes, "ownership", "wrapped.pptx");
    expect(job.nodes.map((n) => n.title)).toEqual([title]);
  });
});
