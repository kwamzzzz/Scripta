import { describe, expect, it } from "vitest";
import { isDefinition, isPartOf, referencesIn, sectionOf, splitClause } from "./subclauses";

// The wording is taken from real contracts in the workspace, because the whole
// job is reading what a drafter actually writes.
const DEFINITIONS = `In this Agreement, unless the context otherwise requires, the following terms shall have the meanings ascribed to them below:

"Agreement" means this Trading Management Agreement, together with any schedules, annexures, and amendments executed in accordance with its terms;

"Applicable Law" means all applicable statutes, enactments, orders, rules, regulations, directives, guidelines, and standards enforced by any competent authority in the Republic of Ghana;

"Business Day" means any day, other than a Saturday, Sunday, or statutory public holiday, on which commercial banks are open for general business in {{city, Ghana}};`;

const NUMBERED = `3.1 The Trading Account shall be established and maintained with {{name of broker}} in the name of {{name of account holder}}.

3.2 All cash, securities, financial instruments, and other assets forming part of the Trading Account shall at all times be held on a strictly segregated basis.

3.3 Neither Party shall create, grant, incur, assume, or permit to subsist any mortgage, charge, pledge, lien, or hypothecation over the Trading Account.`;

describe("recognising a definition however the drafter phrases it", () => {
  // All four are the same act of defining a term. The fourth was missed until
  // a framework agreement turned up using it throughout, and every definition
  // written that way was merged into the one above it.
  it.each([
    ['"Approval" means the date on which the Services are accepted;', true],
    ['"PO" shall mean a written purchase order issued by Osool;', true],
    ['"Change" has the meaning given in Clause 4.2.', true],
    ['"Purchase Agreement" shall have the meaning given in clause 2.1;', true],
    ['"Osool" shall indemnify the Vendor against all claims;', false],
    ['The "Parties" agree as follows:', false],
  ])("%s", (text, expected) => {
    expect(isDefinition(text)).toBe(expected);
  });
});

describe("splitting a clause into its parts", () => {
  it("makes each definition its own part, named by the term it defines", () => {
    const { parts } = splitClause("1", DEFINITIONS);
    expect(parts.map((p) => [p.num, p.title])).toEqual([
      ["1.1", "“Agreement”"],
      ["1.2", "“Applicable Law”"],
      ["1.3", "“Business Day”"],
    ]);
  });

  it("keeps the lead-in on the clause, not on the first definition", () => {
    const { lead, parts } = splitClause("1", DEFINITIONS);
    expect(lead).toBe(
      "In this Agreement, unless the context otherwise requires, the following terms shall have the meanings ascribed to them below:",
    );
    expect(parts[0]!.text).toMatch(/^"Agreement" means/);
  });

  it("uses the drafter's own numbering where the text carries it", () => {
    const { parts } = splitClause("3", NUMBERED);
    expect(parts.map((p) => p.num)).toEqual(["3.1", "3.2", "3.3"]);
  });

  it("titles a numbered sub-clause from its opening words, never ending on a connective", () => {
    const { parts } = splitClause("3", NUMBERED);
    expect(parts[1]!.title).toBe("All cash, securities, financial instruments…");
  });

  it("reads curly quotes as well as straight ones, because Word writes both", () => {
    const { parts } = splitClause(
      "1",
      `“the Act” means the Labour Act, 1987 (Act 651);\n\n“Working Day” means Monday to Friday;`,
    );
    expect(parts.map((p) => p.title)).toEqual(["“the Act”", "“Working Day”"]);
  });

  it("recognises a definition that points elsewhere instead of defining", () => {
    const { parts } = splitClause(
      "1",
      `"Confidential Information" has the meaning ascribed to it in clause 13;\n\n"Term" means the period during which this Agreement remains in force;`,
    );
    expect(parts.map((p) => p.title)).toEqual(["“Confidential Information”", "“Term”"]);
  });

  it("keeps a proviso with the sub-clause it belongs to", () => {
    const { parts } = splitClause(
      "4",
      `4.1 The Manager shall act with reasonable care.\n\nProvided that nothing in this clause limits the Manager's liability for fraud.\n\n4.2 The Owner shall fund the account.`,
    );
    expect(parts).toHaveLength(2);
    expect(parts[0]!.text).toContain("Provided that");
  });

  it("splits lettered parts too", () => {
    const { parts } = splitClause(
      "7",
      `(a) the Manager's fees;\n\n(b) the Owner's expenses;\n\n(c) any tax payable.`,
    );
    expect(parts.map((p) => p.num)).toEqual(["7.1", "7.2", "7.3"]);
  });

  it("leaves a single-paragraph clause whole rather than wrapping it in one part", () => {
    const one = "The Employer shall pay the Employee a gross salary of [ ] Ghana Cedis per month.";
    const { lead, parts } = splitClause("5", one);
    expect(parts).toEqual([]);
    expect(lead).toBe(one);
  });

  it("leaves a clause with only one part whole, for the same reason", () => {
    const { parts } = splitClause("2", `2.1 The Owner shall contribute the Capital Contribution.`);
    expect(parts).toEqual([]);
  });

  it("says nothing about an empty clause", () => {
    expect(splitClause("9", "   ")).toEqual({ lead: "", parts: [] });
  });
});

describe("which section a part belongs to", () => {
  it("reads the parent off the number, however deep", () => {
    expect(sectionOf("1.1")).toBe("1");
    expect(sectionOf("12.3.4")).toBe("12");
    expect(sectionOf("5.")).toBe("5");
  });

  it("knows a part from a clause of its own", () => {
    expect(isPartOf("1.1", "1")).toBe(true);
    expect(isPartOf("1.10", "1")).toBe(true);
    expect(isPartOf("11.1", "1")).toBe(false);
    expect(isPartOf("1", "1")).toBe(false);
  });
});

describe("what each part is, structurally", () => {
  it("knows a definition from an operative provision", () => {
    const { parts } = splitClause(
      "1",
      `"Business Day" means any weekday;\n\n"Term" means the period of this Agreement;`,
    );
    expect(parts.map((p) => p.kind)).toEqual(["definition", "definition"]);

    const ops = splitClause(
      "3",
      `3.1 The Manager shall act with care.\n\n3.2 The Owner shall fund the account.`,
    );
    expect(ops.parts.map((p) => p.kind)).toEqual(["provision", "provision"]);
  });

  it("calls a numbered definition a definition, not a provision", () => {
    const { parts } = splitClause(
      "1",
      `1.1 "Affiliate" means any entity under common control;\n\n1.2 The headings are for convenience only.`,
    );
    expect(parts.map((p) => p.kind)).toEqual(["definition", "provision"]);
  });
});

describe("cross-references, recorded but not followed", () => {
  it("keeps what a provision points at, and what kind of thing it is", () => {
    expect(referencesIn('"Confidential Information" has the meaning given in clause 13;')).toEqual([
      { type: "clause", target: "13" },
    ]);
  });

  it("tells a clause from a schedule, which a bare number cannot", () => {
    // The reason the type is stored: "2" alone cannot say which document the
    // reader has to open.
    expect(referencesIn("Subject to clause 2 and Schedule 2, the cap applies.")).toEqual([
      { type: "clause", target: "2" },
      { type: "schedule", target: "2" },
    ]);
  });

  it("reads the plural and the longer spellings as the same thing", () => {
    expect(referencesIn("see clauses 4 and Annexure 1 and Appendix 3")).toEqual([
      { type: "clause", target: "4" },
      { type: "annex", target: "1" },
      { type: "appendix", target: "3" },
    ]);
  });

  it("records a lettered target as written", () => {
    expect(referencesIn("except as provided in clause 8.3(b)")).toEqual([
      { type: "clause", target: "8.3(b)" },
    ]);
  });

  it("says nothing where nothing is referenced", () => {
    expect(referencesIn("The Employer shall pay the Employee monthly.")).toEqual([]);
  });

  it("does not repeat the same reference twice", () => {
    expect(referencesIn("as set out in clause 7 and further in clause 7")).toEqual([
      { type: "clause", target: "7" },
    ]);
  });

  it("carries the references onto the part that made them", () => {
    const { parts } = splitClause(
      "1",
      `"Confidential Information" has the meaning given in clause 13;\n\n"Fees" means the fees payable under clause 7 (Fees and Expenses);`,
    );
    expect(parts[0]!.refs).toEqual([{ type: "clause", target: "13" }]);
    expect(parts[1]!.refs).toEqual([{ type: "clause", target: "7" }]);
  });
});

describe("a clause that numbers its own sub-clauses and lists inside them", () => {
  /**
   * The shape a drafted contract actually arrives in: numbered sub-clauses,
   * each with a lettered list beneath it. The list belongs to the sub-clause
   * above it, not beside it.
   */
  const body = [
    "2.1 Initial and Additional Contributions:",
    "(a) The Client shall transfer an initial capital contribution.",
    "(b) The Client may make additional capital contributions.",
    "",
    "2.2 Currency Conversion Procedures and Notifications:",
    "(a) The Manager shall procure conversion into the base currency.",
    "(b) The Manager shall provide written notice setting out:",
    "(i) the gross amount received and converted;",
    "(ii) the exchange rate applied to the transaction;",
    "",
    "2.3 Ownership Retention:",
    "(a) The Client shall retain sole legal and beneficial ownership.",
  ].join("\n");

  const split = splitClause("2", body);

  it("finds the three sub-clauses the drafter wrote, not twelve", () => {
    expect(split.parts).toHaveLength(3);
    expect(split.parts.map((p) => p.num)).toEqual(["2.1", "2.2", "2.3"]);
  });

  it("keeps each lettered list with the sub-clause it belongs to", () => {
    expect(split.parts[0]!.text).toContain("(a) The Client shall transfer");
    expect(split.parts[0]!.text).toContain("(b) The Client may make");
    expect(split.parts[1]!.text).toContain("(i) the gross amount");
    expect(split.parts[2]!.text).toContain("(a) The Client shall retain");
  });

  it("titles each part from its own heading", () => {
    expect(split.parts[0]!.title).toContain("Initial and Additional");
    expect(split.parts[2]!.title).toContain("Ownership Retention");
  });
});

describe("a clause whose whole structure is a lettered list", () => {
  const split = splitClause(
    "7",
    ["(a) The first thing.", "(b) The second thing.", "(c) The third."].join("\n"),
  );

  it("still splits, because here the letters are the structure", () => {
    expect(split.parts).toHaveLength(3);
    expect(split.parts.map((p) => p.num)).toEqual(["7.1", "7.2", "7.3"]);
  });
});

describe("positional numbering never lands on a number the drafter used", () => {
  /** A definition list that already contains an explicitly numbered part. */
  const split = splitClause(
    "3",
    ['"Alpha" means the first.', "3.2 A numbered provision.", '"Beta" means the second.'].join(
      "\n",
    ),
  );

  it("skips past the taken number instead of duplicating it", () => {
    const nums = split.parts.map((p) => p.num);
    expect(new Set(nums).size).toBe(nums.length);
    expect(nums).toContain("3.2");
  });
});
