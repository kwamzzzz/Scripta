import { describe, expect, it } from "vitest";
import { moveTo } from "./move-to";

describe("moveTo", () => {
  it("moves an item down and up to its final position", () => {
    expect(moveTo(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveTo(["a", "b", "c", "d"], 3, 0)).toEqual(["d", "a", "b", "c"]);
  });

  it("leaves the list alone when nothing moves or the index is out of range", () => {
    const list = ["a", "b"];
    expect(moveTo(list, 1, 1)).toBe(list);
    expect(moveTo(list, 5, 0)).toBe(list);
    expect(moveTo(list, 0, 9)).toEqual(["b", "a"]);
  });
});
