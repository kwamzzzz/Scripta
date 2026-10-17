import { describe, expect, it } from "vitest";
import { acceptedDraftRows } from "./contract-accept";
import type { ClauseDraftOutcome } from "./contract-draft";
import type { ContractPlan } from "./contract-plan";

const plan: ContractPlan = {
  agreementType: "Services agreement",
  governingLaw: "Ghana",
  clauses: [
    { num: "1", title: "DEFINITIONS AND INTERPRETATION", purpose: "Define terms." },
    { num: "2", title: "SERVICES", purpose: "State the services." },
  ],
};

type SuccessfulOutcome = Extract<ClauseDraftOutcome, { ok: true }>;

const complete: SuccessfulOutcome[] = [
  { num: "1", title: "DEFINITIONS AND INTERPRETATION", ok: true, text: "Definitions text." },
  { num: "2", title: "SERVICES", ok: true, text: "Services text." },
];

describe("acceptedDraftRows", () => {
  it("assembles a complete run as ordinary, ordered text", () => {
    const rows = acceptedDraftRows(plan, complete);
    expect(rows.map((row) => [row.num, row.title, row.ordinal])).toEqual([
      ["1", "DEFINITIONS AND INTERPRETATION", 1],
      ["2", "SERVICES", 2],
    ]);
    expect(rows.flatMap((row) => row.segments).map((segment) => segment.kind)).toEqual(["n", "n"]);
  });

  it("refuses a failed clause", () => {
    expect(() =>
      acceptedDraftRows(plan, [
        complete[0]!,
        { num: "2", title: "SERVICES", ok: false, reason: "Timed out" },
      ]),
    ).toThrow("Retry every failed clause");
  });

  it("refuses a missing outcome", () => {
    expect(() => acceptedDraftRows(plan, [complete[0]!])).toThrow(
      "completed wording does not match every clause",
    );
  });

  it("refuses an extra or duplicate clause number", () => {
    expect(() => acceptedDraftRows(plan, [complete[0]!, complete[0]!])).toThrow(
      "drafted more than once",
    );
  });

  it("refuses wording attached to a renamed plan clause", () => {
    expect(() =>
      acceptedDraftRows(plan, [complete[0]!, { ...complete[1]!, title: "FEES" }]),
    ).toThrow("no longer matches the approved plan title");
  });

  it("refuses an invalid plan even when outcomes look complete", () => {
    expect(() =>
      acceptedDraftRows(
        { ...plan, clauses: [{ ...plan.clauses[0]!, title: "" }, plan.clauses[1]!] },
        complete,
      ),
    ).toThrow("Clause 1 needs a title");
  });

  it("refuses empty wording before persistence", () => {
    expect(() => acceptedDraftRows(plan, [complete[0]!, { ...complete[1]!, text: "   " }])).toThrow(
      "Every accepted clause must contain wording",
    );
  });
});

describe("a clause that is really several", () => {
  it("accepts a contract whose clauses split into parts", () => {
    const rows = acceptedDraftRows(
      {
        agreementType: "Services",
        governingLaw: "Ghana",
        clauses: [{ num: "1", title: "Definitions", purpose: "Defined terms" }],
      },
      [
        {
          ok: true,
          num: "1",
          title: "Definitions",
          text: `In this Agreement:\n\n"Agreement" means this agreement;\n\n"Business Day" means any weekday;`,
        },
      ],
    );
    // The section, then one row per definition — not one row holding all three.
    expect(rows.map((r) => r.num)).toEqual(["1", "1.1", "1.2"]);
    expect(rows.map((r) => r.title)).toEqual(["Definitions", "“Agreement”", "“Business Day”"]);
    expect(rows[0]!.segments[0]!.text).toBe("In this Agreement:");
  });
});
