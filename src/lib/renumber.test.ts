import { describe, expect, it } from "vitest";
import { cascade, remapRefs, renumberPlan, sequentialNumbers, staleCitations } from "./renumber";

const c = (num: string) => ({ id: num, num });

// The Services Agreement as uploaded: no clause 1, and 2.3 missing.
const doc = [
  c("2"),
  c("2.1"),
  c("2.2"),
  c("2.4"),
  c("3"),
  c("3.1"),
  c("Execution"),
  c("Schedule 1"),
  c("Schedule 1.A"),
  c("Schedule 1.A.1"),
  c("Schedule 1.A.2"),
  c("Schedule 1.A.4"),
  c("Schedule 2"),
];

describe("renumbering in order", () => {
  it("closes every gap, and parts follow their clause", () => {
    const next = sequentialNumbers(doc);
    expect(doc.map((x) => next.get(x.id))).toEqual([
      "1",
      "1.1",
      "1.2",
      "1.3",
      "2",
      "2.1",
      "Execution",
      "Schedule 1",
      "Schedule 1.A",
      "Schedule 1.A.1",
      "Schedule 1.A.2",
      "Schedule 1.A.3",
      "Schedule 2",
    ]);
  });
  it("lists only what changes", () => {
    const plan = renumberPlan(doc);
    expect(plan).toContainEqual({ id: "2.4", from: "2.4", to: "1.3" });
    expect(plan.find((p) => p.id === "Schedule 2")).toBeUndefined();
    expect(renumberPlan([c("1"), c("1.1"), c("2")])).toEqual([]);
  });
});

describe("a lawyer's own edits", () => {
  it("takes a clause's parts with it", () => {
    const changes = cascade(doc, [{ id: "2", to: "1" }]);
    expect(changes).toEqual([
      { id: "2", from: "2", to: "1" },
      { id: "2.1", from: "2.1", to: "1.1" },
      { id: "2.2", from: "2.2", to: "1.2" },
      { id: "2.4", from: "2.4", to: "1.4" },
    ]);
  });
  it("lets a part's own edit win over its parent's", () => {
    const changes = cascade(doc, [
      { id: "2", to: "1" },
      { id: "2.4", to: "1.3" },
    ]);
    expect(changes.find((x) => x.id === "2.4")!.to).toBe("1.3");
  });
  it("refuses two clauses with one number", () => {
    expect(() => cascade(doc, [{ id: "3", to: "2" }])).toThrow(/both be numbered 2/);
    expect(() => cascade(doc, [{ id: "3", to: " " }])).toThrow(/blank/);
  });
});

describe("references between clauses", () => {
  it("follow the clause they point at, and report the wording left behind", () => {
    const renamed = new Map([
      ["2.4", "1.3"],
      ["8.3", "7.3"],
    ]);
    const { refs, moved } = remapRefs(
      [
        { type: "clause", target: "2.4" },
        { type: "clause", target: "8.3(b)" },
        { type: "schedule", target: "1" },
        { type: "clause", target: "9" },
      ],
      renamed,
    );
    expect(refs.map((r) => r.target)).toEqual(["1.3", "7.3(b)", "1", "9"]);
    expect(moved).toEqual([
      { cites: "2.4", now: "1.3" },
      { cites: "8.3(b)", now: "7.3(b)" },
    ]);
  });
});

describe("wording that cites an old number", () => {
  const cited = (text: string) =>
    [...text.matchAll(/clause\s+(\d+(?:\.\d+)*(?:\([a-z]\))?)/gi)].map((m) => ({
      type: "clause" as const,
      target: m[1]!,
    }));
  it("is found from the wording, against the document's number", () => {
    const stale = staleCitations(
      [
        { id: "a", num: "1.3", documentNum: "2.4", text: "Start date." },
        { id: "b", num: "4", documentNum: "5", text: "Subject to clause 2.4 and clause 3." },
        { id: "c", num: "3", documentNum: null, text: "" },
      ],
      cited,
    );
    expect(stale).toEqual([{ clauseId: "b", clauseNum: "4", cites: "2.4", now: "1.3" }]);
  });
  it("clears once the wording is corrected", () => {
    expect(
      staleCitations(
        [
          { id: "a", num: "1.3", documentNum: "2.4", text: "" },
          { id: "b", num: "4", documentNum: "5", text: "Subject to clause 1.3." },
        ],
        cited,
      ),
    ).toEqual([]);
  });
});
