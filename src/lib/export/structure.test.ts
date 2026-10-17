import { describe, expect, it } from "vitest";
import type { ExportClause } from "./docx";
import {
  clauseLevel,
  isInsertedNumber,
  headingCase,
  headingText,
  isBodyOpening,
  isCounted,
  isUnnamedSubclause,
  namedLabel,
  tocEntries,
  tocTitle,
} from "./structure";

const clause = (num: string, title: string, body = "Body."): ExportClause => ({
  num,
  title,
  segs: [{ t: body, k: "n" }],
});

describe("clauseLevel", () => {
  it("reads the depth from the number", () => {
    expect(clauseLevel("1.")).toBe(0);
    expect(clauseLevel("1.2")).toBe(1);
    expect(clauseLevel("1.2.3")).toBe(2);
    expect(clauseLevel("1.2.3.4")).toBe(2);
    expect(clauseLevel("")).toBe(0);
  });
});

describe("isBodyOpening", () => {
  it("knows a title that is only the body's first words", () => {
    expect(isBodyOpening("The Employee shall…", "The Employee shall serve")).toBe(true);
    expect(isBodyOpening("Duties", "The Employee shall serve")).toBe(false);
  });
});

describe("tocTitle", () => {
  it("lists a heading set in capitals in sentence case", () => {
    expect(tocTitle("DEFINITIONS AND INTERPRETATION")).toBe("Definitions and interpretation");
  });

  it("leaves a heading in the author's own case alone", () => {
    expect(tocTitle("Bad Leaver Call Option")).toBe("Bad Leaver Call Option");
    expect(tocTitle("iPhone supply")).toBe("iPhone supply");
  });
});

describe("tocEntries", () => {
  const clauses = [
    clause("1", "DEFINITIONS AND INTERPRETATION", ""),
    clause("1.1", "Definitions"),
    clause("1.1.1", "Too deep"),
    clause("1.2", ""),
    clause("2", "INCENTIVE CALL OPTION", ""),
    clause("2.1", "Grant"),
    clause("", "Performance"),
    clause("2.2", "The Option shall…", "The Option shall vest over four years."),
  ];

  /* A sub-clause is listed whether or not it was given a heading: a table
     showing only "1. DEFINITIONS" hides 1.1 to 1.3, which are the provisions
     a reader is looking for. One with no heading is listed by its opening
     words. Nothing below the sub-clause is listed. */
  it("lists every section and every sub-clause, and nothing deeper", () => {
    expect(tocEntries(clauses).map((e) => `${e.level}|${e.label}|${e.title}`)).toEqual([
      "0|1.|Definitions and interpretation",
      "1|1.1|Definitions",
      "1|1.2|Body.",
      "0|2.|Incentive call option",
      "1|2.1|Grant",
      "1||Performance",
      "1|2.2|The Option shall…",
    ]);
  });

  it("remembers where each heading is, so an exporter can bookmark it", () => {
    const entries = tocEntries(clauses);
    expect(entries.map((e) => e.index)).toEqual([0, 1, 3, 4, 5, 6, 7]);
    expect(entries[0]!.anchor).toBe("_Toc000001");
    expect(new Set(entries.map((e) => e.anchor)).size).toBe(entries.length);
  });

  it("lists an unheaded sub-clause by its opening words, at most nine of them", () => {
    const long = clause(
      "3.1",
      "",
      "The Supplier shall maintain insurance with a reputable insurer at all times.",
    );
    const entry = tocEntries([clause("3", "INSURANCE", ""), long])[1]!;
    expect(entry.title).toBe("The Supplier shall maintain insurance with a reputable insurer…");
  });
});

describe("isUnnamedSubclause", () => {
  it("is a numbered sub-clause with no heading, or one that is only its own first words", () => {
    expect(isUnnamedSubclause({ num: "2.1", title: "" }, "The Option vests.")).toBe(true);
    expect(
      isUnnamedSubclause(
        { num: "2.1", title: "The Option vests…" },
        "The Option vests over four years.",
      ),
    ).toBe(true);
    expect(isUnnamedSubclause({ num: "2.1", title: "Vesting" }, "The Option vests.")).toBe(false);
  });

  it("does not count a definition as an unnamed sub-clause", () => {
    expect(isUnnamedSubclause({ num: "1.1", title: "" }, "“the Act” means the Labour Act.")).toBe(
      false,
    );
    expect(
      isUnnamedSubclause({ num: "1.1", title: "“the Act”" }, "“the Act” means the Labour Act."),
    ).toBe(false);
  });

  it("leaves sections and deeper clauses alone", () => {
    expect(isUnnamedSubclause({ num: "2", title: "" }, "text")).toBe(false);
    expect(isUnnamedSubclause({ num: "2.1.1", title: "" }, "text")).toBe(false);
    expect(isUnnamedSubclause({ num: "", title: "" }, "text")).toBe(false);
    expect(isUnnamedSubclause({ num: null, title: "" }, "text")).toBe(false);
  });
});

describe("headingCase", () => {
  it("heads a sub-clause the way the firm does", () => {
    expect(headingCase("treatment on bad leaver event")).toBe("Treatment on Bad Leaver Event");
    expect(headingCase("top up purchase price.")).toBe("Top Up Purchase Price");
    expect(headingCase("  grant ")).toBe("Grant");
  });
});

describe("schedules and the execution block are named, not counted", () => {
  const cl = (num: string, title: string, t = "") =>
    ({ num, title, segs: [{ t, k: "n" as const }] }) as ExportClause;
  const doc = [
    cl("13", "GENERAL"),
    cl("13.1", "Notices shall be sent…", "Notices shall be sent by email."),
    cl("Execution", "Execution", "Signed by the Parties."),
    cl("Schedule 1", "Scope of Services"),
    cl("Schedule 1.A", "Part A – Website"),
    cl("Schedule 1.A.1", "Premium redesign…", "Premium redesign of the website."),
    cl("Schedule 2", "Fees and Payment"),
  ];

  /* What is inside a schedule is the schedule's own structure: the table
     names the schedule, not its parts or its paragraphs. */
  it("lists them by name, with no clause number, and nothing inside them", () => {
    expect(tocEntries(doc).map((e) => [e.label, e.title])).toEqual([
      ["13.", "General"],
      ["13.1", "Notices shall be sent…"],
      ["", "Execution"],
      ["", "Schedule 1 – Scope of Services"],
      ["", "Schedule 2 – Fees and Payment"],
    ]);
  });

  it("numbers a schedule's paragraphs within it", () => {
    expect(isCounted("13.1")).toBe(true);
    expect(isCounted("Schedule 1.A")).toBe(false);
    expect(namedLabel("Schedule 1.A.1")).toBe("1.");
    expect(namedLabel("Schedule 2.3")).toBe("3.");
    expect(namedLabel("Schedule 1")).toBe("");
    expect(namedLabel("Execution")).toBe("");
    expect(headingText({ num: "Schedule 1.B", title: "Brand Collateral" })).toBe(
      "Part B – Brand Collateral",
    );
  });

  it("never lists a cut-off title as a heading, even when the wording has moved on", () => {
    const stale = cl(
      "11.2",
      "On termination: (a) subject to clause…",
      "On termination: (a) the Service Provider keeps all advance payments.",
    );
    const entries = tocEntries([cl("11", "TERMINATION"), stale]);
    // Listed as the sub-clause it is, by its opening words — never as a heading.
    expect(entries.map((e) => [e.label, e.title])).toEqual([
      ["11.", "Termination"],
      ["11.2", "On termination: (a) subject to clause…"],
    ]);
  });
});

describe("a schedule's name", () => {
  it("is set the way the firm heads one, whatever case the parser left", () => {
    expect(headingText({ num: "Schedule 1", title: "Scope Of Services" })).toBe(
      "Schedule 1 – Scope of Services",
    );
    expect(headingText({ num: "Schedule 2", title: "FEES AND PAYMENT" })).toBe(
      "Schedule 2 – Fees and Payment",
    );
  });
});

describe("a clause inserted into a numbered run", () => {
  /**
   * 5.2A is a clause of the contract and is read as one: same level, listed in
   * the table, headed by its own title. What it must never be is counted by
   * Word's list engine, because the clause after it is still 5.3 and every
   * cross-reference in the document says so.
   */
  it("sits at its siblings' level and is listed with them", () => {
    const clauses = [
      clause("5", "FEES AND PAYMENT", ""),
      clause("5.1", "The Website fee"),
      clause("5.1A", "Currency of payment"),
      clause("5.2", "Invoices"),
      clause("5A", "COMMISSIONING"),
    ];
    expect(tocEntries(clauses).map((e) => `${e.level}|${e.label}|${e.title}`)).toEqual([
      "0|5.|Fees and payment",
      "1|5.1|The Website fee",
      "1|5.1A|Currency of payment",
      "1|5.2|Invoices",
      "0|5A.|Commissioning",
    ]);
    expect(clauseLevel("5.1A")).toBe(1);
    expect(clauseLevel("5A")).toBe(0);
  });

  it("is headed by its title, not by its number and title", () => {
    expect(headingText({ num: "5.1A", title: "Currency of payment" })).toBe("Currency of payment");
  });

  it("prints its own number the way the numbering would have", () => {
    // "5A." at the top level, "5.1A" beneath it — matching %1. and %1.%2.
    expect(namedLabel("5A")).toBe("5A.");
    expect(namedLabel("5.1A")).toBe("5.1A");
    // A counted clause still prints nothing of its own: Word counts it.
    expect(namedLabel("5.1")).toBe("");
  });

  it("is not mistaken for a schedule or a part of one", () => {
    expect(isInsertedNumber("5.1A")).toBe(true);
    expect(isInsertedNumber("Schedule 1")).toBe(false);
    expect(isInsertedNumber("Schedule 1.A")).toBe(false);
    expect(isCounted("5.1A")).toBe(false);
  });
});
