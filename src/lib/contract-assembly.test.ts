import { describe, expect, it } from "vitest";
import {
  assembleConversion,
  assembleFreshContract,
  draftPlaceholders,
  isComparable,
  type ConvertedClause,
} from "./contract-assembly";

describe("assembleFreshContract", () => {
  const drafted = [
    { num: "1", title: "Definitions", text: "In this agreement…" },
    { num: "2", title: "Services", text: "The Consultant shall…" },
  ];

  it("writes ordinary text, so a fresh draft has nothing to compare", () => {
    const rows = assembleFreshContract(drafted);
    expect(rows.flatMap((r) => r.segments).every((s) => s.kind === "n")).toBe(true);
    expect(isComparable(rows)).toBe(false);
  });

  it("numbers clauses in the order they were drafted", () => {
    expect(assembleFreshContract(drafted).map((r) => r.ordinal)).toEqual([1, 2]);
  });

  it("drops a clause the model returned empty rather than printing a bare heading", () => {
    const rows = assembleFreshContract([...drafted, { num: "3", title: "Term", text: "   " }]);
    expect(rows).toHaveLength(2);
  });

  it("does not leave a clause untitled", () => {
    const rows = assembleFreshContract([{ num: "1", title: "  ", text: "Body." }]);
    expect(rows[0]!.title).toBe("Untitled clause");
  });
});

describe("assembleConversion", () => {
  const rewrite: ConvertedClause = {
    num: "3",
    title: "Fees",
    verdict: "rewrite",
    priorText: "The Employee is paid a salary of…",
    text: "The Consultant invoices fees of…",
  };
  const kept: ConvertedClause = {
    num: "1",
    title: "Definitions",
    verdict: "keep",
    priorText: "In this agreement…",
    text: "In this agreement…",
  };
  const removed: ConvertedClause = {
    num: "7",
    title: "Holiday entitlement",
    verdict: "delete",
    priorText: "The Employee is entitled to 25 days…",
    text: "",
  };
  const added: ConvertedClause = {
    num: "9",
    title: "Status and tax",
    verdict: "new",
    text: "The Consultant is an independent contractor…",
  };

  it("strikes the old wording and inserts the new one", () => {
    const [row] = assembleConversion([rewrite]);
    expect(row!.segments).toEqual([
      { ordinal: 1, text: "The Employee is paid a salary of…", kind: "d" },
      { ordinal: 2, text: "The Consultant invoices fees of…", kind: "i" },
    ]);
  });

  it("leaves a kept clause unmarked, so the redline shows only real edits", () => {
    const [row] = assembleConversion([kept]);
    expect(row!.segments).toEqual([{ ordinal: 1, text: "In this agreement…", kind: "n" }]);
  });

  it("strikes a deleted clause and inserts nothing", () => {
    const [row] = assembleConversion([removed]);
    expect(row!.segments.map((s) => s.kind)).toEqual(["d"]);
  });

  it("inserts a genuinely new clause with nothing struck before it", () => {
    const [row] = assembleConversion([added]);
    expect(row!.segments.map((s) => s.kind)).toEqual(["i"]);
  });

  it("produces a document that supports a comparison", () => {
    expect(isComparable(assembleConversion([kept, rewrite, removed, added]))).toBe(true);
  });

  it("is not comparable when the conversion changed nothing", () => {
    expect(isComparable(assembleConversion([kept]))).toBe(false);
  });

  it("drops a delete with no prior wording rather than writing an empty strike", () => {
    expect(assembleConversion([{ ...removed, priorText: "" }])).toHaveLength(0);
  });
});

describe("draftPlaceholders", () => {
  it("lists what the model was not given, per clause", () => {
    const rows = assembleFreshContract([
      { num: "1", title: "Parties", text: "Between {{Client name}} and {{Consultant name}}." },
      { num: "2", title: "Term", text: "Commences on {{Start date}}." },
    ]);
    expect(draftPlaceholders(rows)).toEqual([
      { clause: "1 Parties", fields: ["Client name", "Consultant name"] },
      { clause: "2 Term", fields: ["Start date"] },
    ]);
  });

  it("says nothing about a clause that needs nothing", () => {
    const rows = assembleFreshContract([{ num: "1", title: "Term", text: "One year." }]);
    expect(draftPlaceholders(rows)).toEqual([]);
  });

  it("ignores placeholders inside struck-out wording, which nobody has to fill", () => {
    const rows = assembleConversion([
      {
        num: "3",
        title: "Fees",
        verdict: "rewrite",
        priorText: "Salary of {{Salary}}.",
        text: "Fees of {{Day rate}}.",
      },
    ]);
    expect(draftPlaceholders(rows)).toEqual([{ clause: "3 Fees", fields: ["Day rate"] }]);
  });
});
