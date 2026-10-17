import { describe, expect, it } from "vitest";
import { next, priorityOf, ratingOf, RATINGS } from "./risk";

describe("risk rating", () => {
  it("reproduces the drawing's four ratings from likelihood × impact", () => {
    expect(ratingOf("Possible", "Moderate")).toBe("Medium");
    expect(ratingOf("Unlikely", "Low")).toBe("Low");
    expect(ratingOf("Likely", "Severe")).toBe("Critical");
    expect(ratingOf("Possible", "Severe")).toBe("High");
  });
  it("maps ratings to action-plan priorities", () => {
    expect(priorityOf("Critical")).toBe("Immediate");
    expect(priorityOf("High")).toBe("Short term");
    expect(priorityOf("Low")).toBe("Monitor");
  });
  it("cycles through a scale and wraps", () => {
    expect(next(RATINGS, "Critical")).toBe("Low");
    expect(next(RATINGS, "Low")).toBe("Medium");
  });
});
