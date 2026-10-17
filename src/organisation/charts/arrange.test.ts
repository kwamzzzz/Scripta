import { describe, expect, it } from "vitest";
import { align, centredOver, distribute, inLineWith, snapMove, type Box } from "./arrange";

const box = (id: string, x: number, y: number, w = 176, h = 52): Box => ({ id, x, y, w, h });

describe("snapping a dragged box", () => {
  it("lines a box's centre up with a box it is joined to, so the line runs straight", () => {
    const parent = box("p", 200, 40);
    const moving = box("c", 205, 160);
    const s = snapMove(moving, [parent], new Set(["p"]));
    expect(moving.x + s.dx).toBe(200);
    expect(s.guides).toEqual([expect.objectContaining({ axis: "x", at: 288 })]);
  });

  it("lines up tops with a neighbour on the same row", () => {
    const s = snapMove(box("c", 420, 163), [box("n", 200, 160)], new Set());
    expect(163 + s.dy).toBe(160);
  });

  it("prefers the box it is joined to when two are equally close", () => {
    const joined = box("j", 100, 0);
    const other = box("o", 110, 300);
    const s = snapMove(box("c", 105, 150), [other, joined], new Set(["j"]));
    expect(105 + s.dx).toBe(100);
  });

  it("falls onto the grid when nothing is close", () => {
    const s = snapMove(box("c", 413, 251), [box("far", 0, 0)], new Set());
    expect(413 + s.dx).toBe(416);
    expect(251 + s.dy).toBe(248);
    expect(s.guides).toEqual([]);
  });
});

describe("aligning and spacing a selection", () => {
  const row = [box("a", 10, 100), box("b", 300, 130), box("c", 520, 90)];

  it("aligns tops, middles and centres to the selection", () => {
    expect(Object.values(align(row, "top")).map((p) => p.y)).toEqual([90, 90, 90]);
    const middles = align(row, "middle");
    expect(new Set(Object.values(middles).map((p) => p.y + 26)).size).toBe(1);
    const centres = align(row, "centre");
    expect(new Set(Object.values(centres).map((p) => p.x + 88)).size).toBe(1);
  });

  it("spaces centres evenly and leaves the outer boxes where they are", () => {
    const spaced = distribute([box("a", 0, 0), box("b", 100, 0), box("c", 600, 0)], "across");
    expect(spaced["a"]!.x).toBe(0);
    expect(spaced["c"]!.x).toBe(600);
    expect(spaced["b"]!.x).toBe(300);
    expect(distribute([box("a", 0, 0), box("b", 9, 9)], "down")).toEqual({});
  });
});

describe("straightening", () => {
  it("puts a box directly under, or level with, the box its line comes from", () => {
    expect(inLineWith(box("p", 200, 0), box("c", 350, 140), "down")).toEqual({ x: 200, y: 140 });
    expect(inLineWith(box("p", 0, 60), box("c", 300, 10), "right")).toEqual({ x: 300, y: 60 });
  });

  it("centres a holder over the boxes under it", () => {
    const kids = [box("a", 0, 150), box("b", 400, 150)];
    expect(centredOver(box("p", 50, 0), kids, "down")).toEqual({ x: 200, y: 0 });
    expect(centredOver(box("p", 0, 30), [box("a", 300, 0), box("b", 300, 200)], "right")).toEqual({
      x: 0,
      y: 100,
    });
  });
});
