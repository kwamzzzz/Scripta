import { describe, expect, it } from "vitest";
import {
  HOUSE_NUMBERING,
  HOUSE_PAGE,
  houseStyleBrief,
  renderPlaceholder,
  toHousePlaceholders,
} from "./house-style";

describe("house numbering", () => {
  it("goes 1. then 1.1 then (a) then (i), never 1.1.1", () => {
    expect(HOUSE_NUMBERING.map((l) => l.text)).toEqual(["%1.", "%1.%2", "(%3)", "(%4)"]);
    expect(HOUSE_NUMBERING.map((l) => l.text)).not.toContain("%1.%2.%3");
  });

  it("changes character below the second level rather than adding decimals", () => {
    expect(HOUSE_NUMBERING[2]!.format).toBe("lowerLetter");
    expect(HOUSE_NUMBERING[3]!.format).toBe("lowerRoman");
  });
});

describe("placeholders", () => {
  it("keeps the firm's bracket and names what is missing inside it", () => {
    expect(renderPlaceholder("Salary")).toBe("[Salary]");
  });

  it("never renders a bracket with nothing in it to read", () => {
    // The drafts leave "[ ]". An empty bracket in a thirty-page contract is a
    // question without a subject, so a nameless gap still gets a space, not "[]".
    expect(renderPlaceholder("  ")).toBe("[ ]");
  });

  it("converts the internal form to the house form", () => {
    expect(toHousePlaceholders("A salary of {{Monthly salary}} paid on {{Pay date}}.")).toBe(
      "A salary of [Monthly salary] paid on [Pay date].",
    );
  });

  it("leaves ordinary braces alone", () => {
    expect(toHousePlaceholders("The set {a, b} is unaffected.")).toBe(
      "The set {a, b} is unaffected.",
    );
  });
});

describe("houseStyleBrief", () => {
  it("tells a contract its numbering rule", () => {
    expect(houseStyleBrief("contract")).toContain("Never 1.1.1");
  });

  it("does not tell a letter about clause numbering it has none of", () => {
    expect(houseStyleBrief("letter")).not.toContain("sub-clauses");
  });

  it("distinguishes a resolution's capital recitals from its lower-case resolutions", () => {
    const brief = houseStyleBrief("resolution");
    expect(brief).toContain("(A), (B), (C)");
    expect(brief).toContain("(a), (b), (c)");
  });

  it("forbids invented facts in every kind", () => {
    for (const kind of ["contract", "resolution", "letter"] as const)
      expect(houseStyleBrief(kind)).toContain("Never invent");
  });
});

describe("the page", () => {
  it("keeps one inch at the sides and foot in every kind", () => {
    for (const kind of ["contract", "resolution", "letter"] as const) {
      expect(HOUSE_PAGE[kind].left).toBe(1440);
      expect(HOUSE_PAGE[kind].right).toBe(1440);
      expect(HOUSE_PAGE[kind].bottom).toBe(1440);
    }
  });

  it("leaves a letter more room at the top than a contract, for the letterhead", () => {
    expect(HOUSE_PAGE.letter.top).toBeGreaterThan(HOUSE_PAGE.contract.top);
  });

  it("puts every document on A4", () => {
    // The contract in the bank was US Letter; Kwame confirmed that was the
    // file, not the house rule.
    for (const kind of ["contract", "resolution", "letter"] as const) {
      expect(HOUSE_PAGE[kind].width).toBeGreaterThan(11800);
      expect(HOUSE_PAGE[kind].width).toBeLessThan(12000);
    }
  });
});
