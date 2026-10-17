import { describe, expect, it } from "vitest";
import { areaOn, isFullService, optionalAreasFor } from "./clients";

describe("a client's optional areas", () => {
  it("always shows the essentials", () => {
    const essentials = { optionalAreas: [] };
    for (const area of [
      "organogram",
      "structure",
      "people",
      "authority",
      "entities",
      "documents",
      "ask",
    ])
      expect(areaOn(essentials, area)).toBe(true);
    for (const area of ["licences", "calendar", "processes", "marketing"])
      expect(areaOn(essentials, area)).toBe(false);
  });

  it("shows an optional area only when it is on", () => {
    const client = { optionalAreas: ["licences" as const] };
    expect(areaOn(client, "licences")).toBe(true);
    expect(areaOn(client, "marketing")).toBe(false);
  });

  it("is full corporate services only when every area the kind can carry is on", () => {
    expect(isFullService("organisation", ["licences", "calendar", "processes", "marketing"])).toBe(
      true,
    );
    expect(isFullService("organisation", ["licences", "calendar", "processes"])).toBe(false);
    expect(isFullService("organisation", [])).toBe(false);
  });

  it("offers a person marketing only", () => {
    expect(optionalAreasFor("individual").map((a) => a.id)).toEqual(["marketing"]);
    expect(isFullService("individual", ["marketing"])).toBe(true);
  });
});
