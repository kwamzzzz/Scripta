import { describe, expect, it } from "vitest";
import { checkCitations, emptyResearch, type ResearchState } from "./research-store";

/** A memo of one section citing the given authority numbers, over the given bank. */
const stateWith = (
  authorities: { n: number; cite: string; kind: string }[],
  cites: number[],
): ResearchState => {
  const base = emptyResearch("Interest");
  return {
    ...base,
    answer: {
      shortAnswer: "",
      findings: [],
      authorities: authorities.map((a) => ({
        ...a,
        source: "",
        date: "",
        held: "",
        sections: [],
      })),
    },
    memo: {
      ...base.memo,
      sections: [{ id: "s1", no: "1", title: "Analysis", body: "Text.", cites }],
    },
  };
};

describe("checkCitations — unverified authorities in the memo", () => {
  it("flags a cited authority Scripta could not verify", () => {
    const issues = checkCitations(
      stateWith([{ n: 1, cite: "Doe v Roe", kind: "UNVERIFIED" }], [1]),
    );
    expect(issues.some((i) => i.includes("Doe v Roe") && i.includes("could not verify"))).toBe(
      true,
    );
  });

  it("says nothing about a statute", () => {
    const issues = checkCitations(
      stateWith([{ n: 1, cite: "Act 651, s.14", kind: "STATUTE" }], [1]),
    );
    expect(issues.some((i) => i.includes("could not verify"))).toBe(false);
  });

  it("treats a kind it does not recognise as unverified", () => {
    const issues = checkCitations(
      stateWith([{ n: 1, cite: "Chitty on Contracts", kind: "TREATISE" }], [1]),
    );
    expect(issues.some((i) => i.includes("Chitty"))).toBe(true);
  });

  it("reports an authority once however many sections lean on it", () => {
    const base = stateWith([{ n: 1, cite: "Doe v Roe", kind: "UNVERIFIED" }], [1]);
    const state: ResearchState = {
      ...base,
      memo: {
        ...base.memo,
        sections: [
          { id: "s1", no: "1", title: "A", body: "Text.", cites: [1] },
          { id: "s2", no: "2", title: "B", body: "More.", cites: [1] },
        ],
      },
    };
    expect(checkCitations(state).filter((i) => i.includes("could not verify"))).toHaveLength(1);
  });

  it("does not flag an unverified authority the memo never cites", () => {
    // It is still in the answer, where the badge marks it. The checker is
    // about what the memo carries out of the building.
    const issues = checkCitations(stateWith([{ n: 1, cite: "Doe v Roe", kind: "UNVERIFIED" }], []));
    expect(issues.some((i) => i.includes("could not verify"))).toBe(false);
  });
});
