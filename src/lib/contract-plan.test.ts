import { describe, expect, it } from "vitest";
import {
  deleteClause,
  insertClause,
  planProblems,
  renameClause,
  renumberPlan,
  reorderClause,
  type ContractPlan,
} from "./contract-plan";

const plan = (): ContractPlan => ({
  agreementType: "Services agreement",
  governingLaw: "Ghana",
  clauses: [
    { num: "4", title: "DEFINITIONS AND INTERPRETATION", purpose: "Define terms." },
    { num: "8", title: "SERVICES", purpose: "Set the service obligations." },
    { num: "12", title: "TERM", purpose: "State duration and renewal." },
  ],
});

describe("renumberPlan", () => {
  it("numbers clauses sequentially in their current order", () => {
    expect(renumberPlan(plan()).clauses.map((clause) => clause.num)).toEqual(["1", "2", "3"]);
  });

  it("handles an empty plan", () => {
    expect(renumberPlan({ ...plan(), clauses: [] }).clauses).toEqual([]);
  });

  it("continues past nine without changing clause content", () => {
    const clauses = Array.from({ length: 12 }, (_, index) => ({
      num: `old-${index}`,
      title: `CLAUSE ${index + 1}`,
      purpose: `Purpose ${index + 1}`,
    }));
    const result = renumberPlan({ ...plan(), clauses });

    expect(result.clauses[9]).toEqual({ num: "10", title: "CLAUSE 10", purpose: "Purpose 10" });
    expect(result.clauses[11]?.num).toBe("12");
  });

  it("does not mutate the input plan or its clauses", () => {
    const input = plan();
    const before = structuredClone(input);
    const result = renumberPlan(input);

    expect(input).toEqual(before);
    expect(result).not.toBe(input);
    expect(result.clauses[0]).not.toBe(input.clauses[0]);
  });
});

describe("reorderClause", () => {
  it("moves the first clause to the end and renumbers", () => {
    const result = reorderClause(plan(), 0, 2);

    expect(result.clauses.map((clause) => [clause.num, clause.title])).toEqual([
      ["1", "SERVICES"],
      ["2", "TERM"],
      ["3", "DEFINITIONS AND INTERPRETATION"],
    ]);
  });

  it("moves the last clause to the beginning", () => {
    expect(reorderClause(plan(), 2, 0).clauses.map((clause) => clause.title)).toEqual([
      "TERM",
      "DEFINITIONS AND INTERPRETATION",
      "SERVICES",
    ]);
  });

  it("renumbers even when the clause stays in the same position", () => {
    expect(reorderClause(plan(), 1, 1).clauses.map((clause) => clause.num)).toEqual([
      "1",
      "2",
      "3",
    ]);
  });

  it("preserves the original plan", () => {
    const input = plan();
    const before = structuredClone(input);
    reorderClause(input, 0, 2);
    expect(input).toEqual(before);
  });

  it.each([
    [-1, 0, "Source index"],
    [3, 0, "Source index"],
    [0, -1, "Destination index"],
    [0, 3, "Destination index"],
    [0.5, 1, "Source index"],
  ])("rejects invalid positions (%s to %s)", (from, to, label) => {
    expect(() => reorderClause(plan(), from, to)).toThrow(
      `${label} must identify an existing clause.`,
    );
  });
});

describe("renameClause", () => {
  it("trims and changes only the selected title", () => {
    const input = plan();
    const result = renameClause(input, 1, "  PAYMENT  ");

    expect(result.clauses[1]).toEqual({
      num: "8",
      title: "PAYMENT",
      purpose: "Set the service obligations.",
    });
    expect(result.clauses[0]).toBe(input.clauses[0]);
    expect(input.clauses[1]?.title).toBe("SERVICES");
  });

  it("allows a blank edit so validation can identify it", () => {
    const result = renameClause(plan(), 2, "   ");
    expect(result.clauses[2]?.title).toBe("");
    expect(planProblems(result)).toContain("Clause 12 needs a title.");
  });

  it("rejects a missing clause", () => {
    expect(() => renameClause(plan(), 3, "PAYMENT")).toThrow(
      "Clause index must identify an existing clause.",
    );
  });
});

describe("deleteClause", () => {
  it("deletes from the middle and closes the numbering gap", () => {
    const result = deleteClause(plan(), 1);

    expect(result.clauses).toEqual([
      { num: "1", title: "DEFINITIONS AND INTERPRETATION", purpose: "Define terms." },
      { num: "2", title: "TERM", purpose: "State duration and renewal." },
    ]);
  });

  it("can delete the first or last clause", () => {
    expect(deleteClause(plan(), 0).clauses.map((clause) => clause.title)).toEqual([
      "SERVICES",
      "TERM",
    ]);
    expect(deleteClause(plan(), 2).clauses.map((clause) => clause.title)).toEqual([
      "DEFINITIONS AND INTERPRETATION",
      "SERVICES",
    ]);
  });

  it("can leave an empty plan, which validation then refuses", () => {
    const result = deleteClause({ ...plan(), clauses: [plan().clauses[0]!] }, 0);
    expect(result.clauses).toEqual([]);
    expect(planProblems(result)).toEqual(["A contract plan must contain at least one clause."]);
  });

  it("preserves plan metadata and does not mutate its input", () => {
    const input = plan();
    const before = structuredClone(input);
    const result = deleteClause(input, 1);

    expect(result.agreementType).toBe(input.agreementType);
    expect(result.governingLaw).toBe(input.governingLaw);
    expect(input).toEqual(before);
  });

  it("rejects an invalid index", () => {
    expect(() => deleteClause(plan(), -1)).toThrow(
      "Clause index must identify an existing clause.",
    );
  });
});

describe("insertClause", () => {
  const inserted = { title: "  PAYMENT  ", purpose: "Set payment dates\n and consequences." };

  it("inserts at the beginning and renumbers every clause", () => {
    const result = insertClause(plan(), 0, inserted);
    expect(result.clauses[0]).toEqual({
      num: "1",
      title: "PAYMENT",
      purpose: "Set payment dates and consequences.",
    });
    expect(result.clauses.map((clause) => clause.num)).toEqual(["1", "2", "3", "4"]);
  });

  it("inserts between clauses", () => {
    const result = insertClause(plan(), 2, inserted);
    expect(result.clauses.map((clause) => clause.title)).toEqual([
      "DEFINITIONS AND INTERPRETATION",
      "SERVICES",
      "PAYMENT",
      "TERM",
    ]);
    expect(result.clauses.map((clause) => clause.num)).toEqual(["1", "2", "3", "4"]);
  });

  it("accepts the end position and an empty plan", () => {
    expect(insertClause(plan(), 3, inserted).clauses[3]?.num).toBe("4");
    expect(insertClause({ ...plan(), clauses: [] }, 0, inserted).clauses).toEqual([
      { num: "1", title: "PAYMENT", purpose: "Set payment dates and consequences." },
    ]);
  });

  it("does not mutate the original plan", () => {
    const input = plan();
    const before = structuredClone(input);
    insertClause(input, 1, inserted);
    expect(input).toEqual(before);
  });

  it.each([-1, 4, 1.5])("rejects invalid insertion index %s", (index) => {
    expect(() => insertClause(plan(), index, inserted)).toThrow(
      "Insert index must be between the first position and the end of the plan.",
    );
  });
});

describe("planProblems", () => {
  it("accepts a structurally valid plan", () => {
    expect(planProblems(renumberPlan(plan()))).toEqual([]);
  });

  it("reports a missing clause list", () => {
    expect(planProblems({ ...plan(), clauses: [] })).toEqual([
      "A contract plan must contain at least one clause.",
    ]);
  });

  it("reports every empty title with an actionable location", () => {
    const input: ContractPlan = {
      ...plan(),
      clauses: [
        { num: "1", title: " ", purpose: "First." },
        { num: "", title: "\n", purpose: "Second." },
      ],
    };
    expect(planProblems(input)).toEqual([
      "Clause 1 needs a title.",
      "The clause at position 2 needs a title.",
    ]);
  });

  it("reports each duplicated number once, including whitespace-equivalent numbers", () => {
    const input: ContractPlan = {
      ...plan(),
      clauses: [
        { num: "4", title: "ONE", purpose: "One." },
        { num: " 4 ", title: "TWO", purpose: "Two." },
        { num: "7", title: "THREE", purpose: "Three." },
        { num: "7", title: "FOUR", purpose: "Four." },
        { num: "7", title: "FIVE", purpose: "Five." },
      ],
    };
    expect(planProblems(input)).toEqual([
      "Clause number 4 is used more than once.",
      "Clause number 7 is used more than once.",
    ]);
  });

  it("reports duplicate empty numbers without pretending they have a label", () => {
    const input: ContractPlan = {
      ...plan(),
      clauses: [
        { num: "", title: "ONE", purpose: "One." },
        { num: " ", title: "TWO", purpose: "Two." },
      ],
    };
    expect(planProblems(input)).toEqual(["More than one clause has an empty number."]);
  });

  it("collects title and numbering problems without mutating the plan", () => {
    const input: ContractPlan = {
      ...plan(),
      clauses: [
        { num: "2", title: "", purpose: "One." },
        { num: "2", title: "TWO", purpose: "Two." },
      ],
    };
    const before = structuredClone(input);
    expect(planProblems(input)).toEqual([
      "Clause 2 needs a title.",
      "Clause number 2 is used more than once.",
    ]);
    expect(input).toEqual(before);
  });
});
