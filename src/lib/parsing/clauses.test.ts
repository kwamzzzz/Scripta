import { describe, expect, it } from "vitest";
import { normalizeBlocks, parseHeading, splitClauses } from "./clauses";
import type { Block } from "./blocks";
import fixture from "./__fixtures__/employment-contract.blocks.json";

const BLOCKS = fixture as Block[];

describe("real Word contract: headings glued to body, auto-numbers stripped", () => {
  const { clauses, structureDetected } = splitClauses(BLOCKS);

  it("detects structure", () => {
    expect(structureDetected).toBe(true);
  });

  // The operative clauses; the schedule after the execution block is its own section.
  const top = clauses.filter((c) => /^\d+$/.test(c.num));

  it("reads the schedule after the execution block instead of dropping it", () => {
    const schedule = clauses.find((c) => c.num === "Schedule 2");
    expect(schedule?.title).toBe("Job Description");
  });

  it("finds every operative clause and only those", () => {
    expect(top.map((c) => c.title)).toEqual([
      "DEFINITIONS AND INTERPRETATION",
      "POSITION, DUTIES AND PLACE OF WORK",
      "COMMENCEMENT, DURATION AND PROBATION",
      "HOURS OF WORK",
      "REMUNERATION AND BENEFITS",
      "ANNUAL LEAVE",
      "SICK LEAVE",
      "MATERNITY LEAVE",
      "DATA PROTECTION",
      "CONFIDENTIALITY",
      "INTELLECTUAL PROPERTY",
      "CONDUCT, CONFLICTS AND DISCIPLINE",
      "TERMINATION",
      "RETURN OF PROPERTY",
      "NON-SOLICITATION",
      "GOVERNING LAW AND DISPUTE RESOLUTION",
      "GENERAL",
    ]);
  });

  it("numbers top-level clauses sequentially from 1", () => {
    expect(top.map((c) => c.num)).toEqual(top.map((_, i) => String(i + 1)));
  });

  it("splits a multi-paragraph clause into numbered sub-clauses", () => {
    const subs = clauses.filter((c) => c.num.startsWith("2."));
    expect(subs.map((c) => c.num)).toEqual(["2.1", "2.2"]);
    expect(subs[0]!.body.startsWith("The Employee is employed")).toBe(true);
    // the parent carries the heading; its text lives in the sub-clauses
    expect(clauses.find((c) => c.num === "2")!.body).toBe("");
  });

  it("keeps a single-paragraph clause as one unit", () => {
    const hours = clauses.filter((c) => c.num === "4" || c.num.startsWith("4."));
    expect(hours).toHaveLength(1);
    expect(hours[0]!.body.startsWith("The Employee’s working hours")).toBe(true);
  });

  it("separates the glued body from its heading", () => {
    expect(clauses.find((c) => c.num === "1.1")!.body.startsWith("“the Act” means")).toBe(true);
  });

  it("keeps a clause's paragraphs under its heading", () => {
    const conf = clauses.filter((c) => c.num.startsWith("10."));
    expect(conf.map((c) => c.body).join(" ")).toContain("survives termination");
  });

  it("excludes preamble, execution and schedules", () => {
    const titles = clauses.map((c) => c.title);
    for (const t of ["EMPLOYMENT CONTRACT", "BETWEEN", "EXECUTION", "SCHEDULE 2"])
      expect(titles).not.toContain(t);
  });
});

describe("normalizeBlocks", () => {
  const norm = (text: string) => normalizeBlocks([{ text, page: 1, heading: false }]);

  it("splits a capitals run glued to a Capitalised word", () => {
    expect(norm("HOURS OF WORKThe Employee’s hours").map((b) => b.text)).toEqual([
      "HOURS OF WORK",
      "The Employee’s hours",
    ]);
  });

  it("splits a capitals run glued to an opening quote", () => {
    expect(norm("CONFIDENTIALITY“Confidential Information” means").map((b) => b.text)).toEqual([
      "CONFIDENTIALITY",
      "“Confidential Information” means",
    ]);
  });

  it("leaves a capitals run followed by a space alone", () => {
    expect(norm("THIS EMPLOYMENT CONTRACT (the “Contract”) is made")).toHaveLength(1);
    expect(norm("NOW IT IS HEREBY AGREED as follows:")).toHaveLength(1);
  });

  it("promotes a short all-capitals line to a heading", () => {
    expect(norm("EXECUTION")[0]!.heading).toBe(true);
  });

  it("does not touch ordinary prose", () => {
    const b = norm("The Employee shall perform the duties set out in Schedule 2.");
    expect(b).toHaveLength(1);
    expect(b[0]!.heading).toBe(false);
  });
});

describe("numbered documents keep the existing path", () => {
  it("still splits on explicit clause numbers", () => {
    const blocks: Block[] = [
      { text: "1. Definitions", page: 1, heading: true },
      { text: "Words have meanings.", page: 1, heading: false },
      { text: "2. Term", page: 2, heading: true },
      { text: "Twelve months.", page: 2, heading: false },
    ];
    const r = splitClauses(blocks);
    expect(r.structureDetected).toBe(true);
    expect(r.clauses.map((c) => [c.num, c.title])).toEqual([
      ["1", "Definitions"],
      ["2", "Term"],
    ]);
  });
});

describe("an uploaded contract arrives with the same hierarchy as a drafted one", () => {
  const blocks: Block[] = [
    { text: "1. DEFINITIONS AND INTERPRETATION", heading: true, page: 1 },
    { text: "In this Agreement, unless the context otherwise requires:", heading: false, page: 1 },
    { text: '"Affiliate" means any entity under common control;', heading: false, page: 1 },
    {
      text: '"Confidential Information" has the meaning given in clause 13;',
      heading: false,
      page: 1,
    },
    { text: "8. LIMITATION OF LIABILITY", heading: true, page: 2 },
    {
      text: "8.1 The total aggregate liability of the Supplier arising out of or in connection with this Agreement shall not exceed the total Fees paid in the twelve months preceding the claim.",
      heading: false,
      page: 2,
    },
    {
      text: "8.2 Neither party shall be liable to the other for any indirect, consequential or special loss, loss of profit, loss of goodwill or loss of anticipated savings howsoever arising.",
      heading: false,
      page: 2,
    },
    {
      text: "8.3 The limitation in clause 8.1 shall not apply to the categories of liability set out in Schedule 2, nor to liability which cannot lawfully be limited.",
      heading: false,
      page: 2,
    },
  ];
  const { clauses } = splitClauses(blocks);
  const at = (num: string) => clauses.find((c) => c.num === num);

  it("makes each definition and sub-clause its own provision", () => {
    expect(clauses.map((c) => c.num)).toEqual(["1", "1.1", "1.2", "8", "8.1", "8.2", "8.3"]);
  });

  it("keeps the section, and hangs its parts from it", () => {
    expect(at("1")!.kind).toBe("section");
    expect(at("1")!.parent).toBeUndefined();
    expect(at("1.1")!.parent).toBe("1");
    expect(at("8.3")!.parent).toBe("8");
  });

  it("leaves the lead-in on the section rather than on the first definition", () => {
    expect(at("1")!.body).toBe("In this Agreement, unless the context otherwise requires:");
    expect(at("1.1")!.body).toMatch(/^"Affiliate" means/);
  });

  it("says which parts are definitions and which are operative provisions", () => {
    expect(at("1.1")!.kind).toBe("definition");
    expect(at("1.2")!.kind).toBe("definition");
    expect(at("8.1")!.kind).toBe("provision");
  });

  it("titles a definition by the term, and a provision by its opening words", () => {
    expect(at("1.1")!.title).toBe("“Affiliate”");
    expect(at("8.2")!.title).toBe("Neither party shall be liable…");
  });

  it("keeps the cross-references each provision makes", () => {
    expect(at("1.2")!.refs).toEqual([{ type: "clause", target: "13" }]);
    // The type is kept with the target: "2" alone could not say whether the
    // source wrote clause 2 or Schedule 2.
    expect(at("8.3")!.refs).toEqual([
      { type: "clause", target: "8.1" },
      { type: "schedule", target: "2" },
    ]);
    expect(at("8.1")!.refs).toEqual([]);
  });

  it("numbers the rows in reading order", () => {
    expect(clauses.map((c) => c.ordinal)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe("a short provision is a provision, not a heading", () => {
  // Length used to decide this, and it is the wrong signal: a short operative
  // provision is perfectly ordinary and can be the most important line in the
  // clause. Punctuation decides it now — a heading does not end a sentence.
  const { clauses } = splitClauses([
    { text: "4. TERM", heading: true, page: 1 },
    { text: "4.1 This Agreement starts on the Commencement Date.", heading: false, page: 1 },
    { text: "4.2 It continues for twelve months.", heading: false, page: 1 },
    { text: "5. INSURANCE", heading: true, page: 1 },
    { text: "5.1 The Company shall maintain the Insurance Policies.", heading: false, page: 1 },
    { text: "5.2 The Cap shall not apply to fraud.", heading: false, page: 1 },
  ] as Block[]);
  const at = (num: string) => clauses.find((c) => c.num === num);

  it("keeps every short sub-clause as its own row under its section", () => {
    expect(clauses.map((c) => c.num)).toEqual(["4", "4.1", "4.2", "5", "5.1", "5.2"]);
  });

  it("puts the wording in the body, where a provision's wording belongs", () => {
    // The number is the row's own `num`; the body is the wording alone, so a
    // renumbered clause does not go on printing the old number inside it.
    expect(at("5.1")!.body).toBe("The Company shall maintain the Insurance Policies.");
    expect(at("5.2")!.body).toBe("The Cap shall not apply to fraud.");
  });

  it("still reads a real heading as a heading", () => {
    expect(at("4")!.kind).toBe("section");
    expect(at("4")!.title).toBe("TERM");
    expect(at("5")!.title).toBe("INSURANCE");
  });
});

describe("telling a heading from a provision", () => {
  it("reads a bare label as a heading", () => {
    expect(parseHeading("4.1 Term")).toEqual({ num: "4.1", title: "Term" });
  });

  it("reads a sentence as a provision, however short", () => {
    expect(parseHeading("8.4 The Cap shall not apply to fraud.")).toBeNull();
    expect(parseHeading("4.1 The Company shall maintain the Insurance Policies.")).toBeNull();
  });

  it("never reads a semicolon or comma as a heading", () => {
    expect(parseHeading("1.1 the Fees payable under this Agreement;")).toBeNull();
    expect(parseHeading("2.3 the Manager, the Owner and each Affiliate,")).toBeNull();
  });

  it("allows the few documents that write a short heading with a full stop", () => {
    expect(parseHeading("1. Definitions.")).toEqual({ num: "1", title: "Definitions" });
  });

  it("believes the document when it styled the line as a heading itself", () => {
    // The strongest signal is the source saying so in its own styles.
    expect(parseHeading("4.1 Insurance and indemnity obligations.", true)).toEqual({
      num: "4.1",
      title: "Insurance and indemnity obligations",
    });
  });
});
