import { describe, expect, it } from "vitest";
import { researchPrompt } from "./research.functions";

const base = {
  instructions: "",
  jurisdiction: "Ghana",
  sources: "Statute + case law",
  since: "Since 2010",
  grounding: "",
  question: "Is a probationer entitled to notice?",
};

describe("what a research call actually asks", () => {
  it("leads with the lawyer's instructions when there are any", () => {
    const prompt = researchPrompt({
      ...base,
      instructions: "  Answer for the board. Transfer pricing is out of scope.  ",
    });
    expect(prompt.startsWith("INSTRUCTIONS:\nAnswer for the board.")).toBe(true);
    expect(prompt.indexOf("INSTRUCTIONS:")).toBeLessThan(prompt.indexOf("JURISDICTION:"));
    expect(prompt).toContain("QUESTION: Is a probationer entitled to notice?");
  });

  it("says nothing about instructions when none were written", () => {
    const prompt = researchPrompt(base);
    expect(prompt).not.toContain("INSTRUCTIONS");
    expect(prompt.startsWith("JURISDICTION: Ghana")).toBe(true);
  });

  it("treats whitespace-only instructions as none", () => {
    expect(researchPrompt({ ...base, instructions: "   \n  " })).toEqual(researchPrompt(base));
  });

  it("keeps the matter context between the filters and the question", () => {
    const prompt = researchPrompt({ ...base, instructions: "Board advice", grounding: "Clause 4." });
    expect(prompt.indexOf("MATTER CONTEXT")).toBeGreaterThan(prompt.indexOf("AUTHORITIES SINCE"));
    expect(prompt.indexOf("MATTER CONTEXT")).toBeLessThan(prompt.indexOf("QUESTION:"));
  });
});
