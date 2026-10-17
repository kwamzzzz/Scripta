import { describe, expect, it } from "vitest";
import {
  numberingGaps,
  structuralFindings,
  tableTotals,
  type ConformityClause,
} from "./conformity";

const c = (
  num: string,
  text: string,
  refs: ConformityClause["refs"] = [],
  title = num,
): ConformityClause => ({
  id: num,
  num,
  title,
  refs,
  text,
});

/** The schedule checks alone; numbering has its own tests below. */
const scheduleFindings = (list: ConformityClause[]) =>
  structuralFindings(list).filter((f) => f.check !== "numbering");

describe("structural conformity", () => {
  it("flags a schedule the agreement relies on but does not attach", () => {
    const f = scheduleFindings([
      c("3", "Pay the Fees in Schedule 1.", [{ type: "schedule", target: "1" }]),
      c("7", "Meet the service levels in Schedule 3.", [{ type: "schedule", target: "3" }]),
      c("Schedule 1", "| Fee | 10 |", [], "Fees"),
    ]);
    expect(f.map((x) => [x.check, x.clauseId])).toEqual([["missing", "7"]]);
    expect(f[0]!.title).toBe("Schedule 3 is relied on but not attached");
  });

  it("flags a schedule nothing refers to, more gently when schedules are incorporated generally", () => {
    const alone = scheduleFindings([c("1", "Terms."), c("Annex A", "Text.", [], "Deliverables")]);
    expect(alone).toMatchObject([
      { check: "unreferenced", clauseId: "Annex A", severity: "medium" },
    ]);
    const general = scheduleFindings([
      c("1", "The Schedules form part of this Agreement."),
      c("Schedule 2", "Text.", [], "Job Description"),
    ]);
    expect(general[0]!.severity).toBe("low");
  });

  it("matches annex references case-insensitively and ignores a schedule citing itself", () => {
    const f = scheduleFindings([
      c("2", "Deliver the items in Annex a.", [{ type: "annex", target: "a" }]),
      c("Annex A", "See Annex A paragraph 2.", [{ type: "annex", target: "A" }]),
    ]);
    expect(f).toEqual([]);
  });
});

describe("table totals", () => {
  const table = (rows: string[]) => rows.join("\n");
  it("finds a total that is not the sum of its rows", () => {
    const f = tableTotals(
      c(
        "Schedule 1",
        table([
          "| Item | Fee (USD) |",
          "| Onboarding | 25,000 |",
          "| Support | USD 4,500.00 |",
          "| Total | 31,000 |",
        ]),
      ),
    );
    expect(f).toHaveLength(1);
    expect(f[0]!.detail).toContain("totals 29,500");
  });
  it("accepts a correct total, and leaves rates and percentages alone", () => {
    expect(
      tableTotals(
        c("S", table(["| Item | Fee |", "| A | 1,000 |", "| B | 500 |", "| Total | 1,500 |"])),
      ),
    ).toEqual([]);
    expect(
      tableTotals(
        c(
          "S",
          table(["| Item | Rate |", "| A | 180 per hour |", "| B | 10% |", "| Total | 999 |"]),
        ),
      ),
    ).toEqual([]);
  });
});

describe("numbering gaps", () => {
  it("finds the clause the agreement skipped, and the paragraph a Part skipped", () => {
    const f = numberingGaps([
      c("2", ""),
      c("2.1", ""),
      c("2.2", ""),
      c("2.4", ""),
      c("3", ""),
      c("Schedule 1.A.1", ""),
      c("Schedule 1.A.2", ""),
      c("Schedule 1.A.4", ""),
      c("Execution", ""),
    ]);
    expect(f.map((x) => x.title)).toEqual([
      "Numbering skips clause 1",
      "Numbering skips 2.3",
      "Numbering skips Schedule 1.A.3",
    ]);
    expect(f[1]!.clauseId).toBe("2.4");
  });
  it("says nothing of a contract numbered in order", () => {
    expect(numberingGaps([c("1", ""), c("1.1", ""), c("2", "")])).toEqual([]);
  });
});
