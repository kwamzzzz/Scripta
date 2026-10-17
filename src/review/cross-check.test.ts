import { describe, expect, it } from "vitest";
import { referencedIn, relevantTo } from "./cross-check.functions";

const REGISTER = [
  { num: "7", title: "INTELLECTUAL PROPERTY AND HANDOVER", text: "" },
  { num: "7.4", title: "Website handover…", text: "" },
  { num: "8", title: "WARRANTIES AND SUPPORT", text: "" },
  { num: "8.1", title: "The Service Provider warrants…", text: "" },
  { num: "13", title: "GENERAL", text: "" },
  { num: "Schedule 1", title: "Scope of Services", text: "" },
  { num: "Schedule 1.A", title: "Part A – Website Work", text: "" },
];

describe("what a finding points at", () => {
  it("reads the clause and schedule numbers out of a finding", () => {
    // The wording of the very finding that prompted this.
    const said =
      "Clause 8.4 says: “Website handover includes…”. Schedule 1.A says: “handover under clause 7.4”. " +
      "Schedule 1 Part A (A6) states that handover is under 'clause 7.4'. Under clause 14.2, the main clauses govern.";
    const refs = referencedIn(said);
    expect(refs).toContain("8.4");
    expect(refs).toContain("7.4");
    expect(refs).toContain("14.2");
    expect(refs).toContain("Schedule 1.A");
    expect(refs).toContain("Schedule 1");
  });

  it("gathers the clause, its parent and its sub-clauses", () => {
    expect(relevantTo(REGISTER, ["7.4"]).map((r) => r.num)).toEqual(["7", "7.4"]);
    expect(relevantTo(REGISTER, ["8"]).map((r) => r.num)).toEqual(["8", "8.1"]);
  });

  it("gathers a schedule and its parts", () => {
    expect(relevantTo(REGISTER, ["Schedule 1"]).map((r) => r.num)).toEqual([
      "Schedule 1",
      "Schedule 1.A",
    ]);
  });

  it("finds nothing for a number the contract does not have", () => {
    // 14.2 is exactly the citation that gave the game away: the finding was
    // written against a register numbered one too high, and this contract
    // stops at 13. The checker is told the register, so it can say so.
    expect(relevantTo(REGISTER, ["14.2"])).toEqual([]);
  });

  it("does not treat a paragraph reference as a clause it cannot find", () => {
    expect(referencedIn("see paragraph 3.2 of the Schedule")).toContain("3.2");
  });
});
