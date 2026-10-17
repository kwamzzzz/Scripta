import { describe, expect, it } from "vitest";
import { asRaised, changedSpan, groupCorrections, repeats, restates, type Raised } from "./dedupe";
import type { DraftFinding } from "./model";

const draft = (p: Partial<DraftFinding>): DraftFinding => ({
  pass: "mechanics",
  category: "error",
  severity: "minor",
  action: "correction",
  title: "T",
  body: "",
  evidence: [],
  fingerprint: "f",
  source: "ai",
  ...p,
});

const rule: Raised = {
  title: "Repeated word: ‘The the’",
  category: "error",
  source: "rule",
  chapterKeys: ["c2"],
  quotes: [{ nodeKey: "n16", text: "The the" }],
};

describe("repeats", () => {
  it("catches the same words in the same paragraph, whichever quote is longer", () => {
    const ai = draft({
      original: "The the delays in processing applications",
      evidence: [{ nodeKey: "n16", quote: "The the delays in processing applications" }],
    });
    expect(repeats(ai, [rule])).toBe(true);
  });
  it("does not treat the same words in another paragraph as a repeat", () => {
    const ai = draft({ original: "The the", evidence: [{ nodeKey: "n40", quote: "The the" }] });
    expect(repeats(ai, [rule])).toBe(false);
  });
  it("does not match on trivially short overlaps", () => {
    const ai = draft({ original: "a", evidence: [{ nodeKey: "n16", quote: "a" }] });
    expect(repeats(ai, [rule])).toBe(false);
  });
  it("reads a draft from the same call through asRaised", () => {
    const first = draft({
      original: "A important",
      evidence: [{ nodeKey: "n34", quote: "A important" }],
    });
    const second = draft({
      original: "A important step",
      evidence: [{ nodeKey: "n34", quote: "A important step" }],
    });
    expect(repeats(second, asRaised([first]))).toBe(true);
  });
});

describe("restates", () => {
  const raised: Raised[] = [
    {
      title: "Discrepancy in fieldwork date",
      category: "consistency",
      source: "ai",
      chapterKeys: ["c3", "c5"],
      quotes: [],
    },
  ];
  it("drops a reworded title about the same chapters", () => {
    expect(restates("Discrepancy in fieldwork dates", ["c3", "c5"], raised)).toBe(true);
  });
  it("keeps a different problem about the same chapters", () => {
    expect(restates("Conclusion contradicts the findings on finance", ["c5"], raised)).toBe(false);
  });
  it("keeps the same words about unrelated chapters", () => {
    expect(restates("Discrepancy in fieldwork date", ["c8", "c9"], raised)).toBe(false);
  });
});

describe("groupCorrections", () => {
  const cap = (n: string, original: string, replacement: string) =>
    draft({
      title: "Capitalisation",
      body: "Capitalise the name.",
      original,
      replacement,
      evidence: [{ nodeKey: n, quote: original }],
    });
  it("finds the words a correction changes", () => {
    expect(changedSpan("The cocoa board accelerated", "The Cocoa Board accelerated")).toEqual({
      from: "cocoa board",
      to: "Cocoa Board",
    });
    expect(changedSpan("support there findings in", "support their findings in")).toEqual({
      from: "there",
      to: "their",
    });
  });
  it("merges the same correction in many places into one finding with every place", () => {
    const out = groupCorrections(
      [
        cap("n1", "The cocoa board accelerated", "The Cocoa Board accelerated"),
        cap("n2", "the cocoa board delayed the flow", "the Cocoa Board delayed the flow"),
        cap("n3", "The cocoa board shaped trust", "The Cocoa Board shaped trust"),
        draft({
          title: "Wrong word",
          original: "there findings",
          replacement: "their findings",
          evidence: [{ nodeKey: "n9" }],
        }),
      ],
      "c11",
    );
    expect(out).toHaveLength(2);
    const grouped = out.find((d) => d.evidence.length === 3)!;
    expect(grouped.original).toBe("cocoa board");
    expect(grouped.replacement).toBe("Cocoa Board");
    expect(grouped.body).toContain("3 places");
    expect(out.find((d) => d.title === "Wrong word")).toBeTruthy();
  });
  it("leaves rule findings and single corrections alone", () => {
    const rule = { ...cap("n1", "a b", "a c"), source: "rule" as const };
    expect(groupCorrections([rule], "c1")).toEqual([rule]);
  });
});
