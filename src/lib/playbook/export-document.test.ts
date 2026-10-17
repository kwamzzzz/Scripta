import { describe, expect, it } from "vitest";
import {
  isWritten,
  playbookDocument,
  playbookFilename,
  playbookHeading,
  rulePara,
  type ExportPlaybook,
  type ExportRule,
} from "./export-document";

const rule = (over: Partial<ExportRule> = {}): ExportRule => ({
  topic: "Limitation of liability",
  category: "Risk allocation",
  preferred: null,
  acceptable: null,
  fallback: null,
  redflag: null,
  escalate: null,
  approved_clause_text: null,
  negotiation_guidance: null,
  commercial_rationale: null,
  legal_rationale: null,
  approval_threshold: null,
  risk_level: null,
  ...over,
});

const book: ExportPlaybook = {
  name: "Logistics services — supplier side",
  version_label: "v1",
  status: "Draft",
  jurisdiction: "Ghana",
  agreement_type: "Freight forwarding",
  our_role: "Supplier",
  description: "Standard supplier-side positions.",
  last_reviewed_at: "2026-09-16",
};

const textOf = (paras: { runs: { t: string }[] }[]) => paras.map((p) => p.runs[0]!.t).join("\n");

describe("a position on the page", () => {
  it("prints the labels the editor uses, so the page and the screen agree", () => {
    const out = textOf(
      rulePara(
        rule({
          preferred: "Capped at 12 months of charges.",
          redflag: "Any total exclusion of liability.",
          approved_clause_text: "The total liability of each party shall not exceed…",
        }),
      ),
    );
    expect(out).toContain("Preferred");
    expect(out).toContain("Capped at 12 months of charges.");
    expect(out).toContain("Unacceptable");
    expect(out).toContain("Any total exclusion of liability.");
    expect(out).toContain("Approved wording");
  });

  it("leaves out a heading for a field nobody filled in", () => {
    const out = textOf(rulePara(rule({ preferred: "Capped at 12 months." })));
    expect(out).not.toContain("Fallback");
    expect(out).not.toContain("Escalate if");
  });

  /* A blank heading on a printed page reads as "the firm has no view", which is
     a different thing from "nobody has written it down". */
  it("says an unwritten position is unwritten rather than printing a blank", () => {
    const out = textOf(rulePara(rule()));
    expect(out).toContain("No position recorded yet");
    expect(isWritten(rule())).toBe(false);
    expect(isWritten(rule({ preferred: "Something." }))).toBe(true);
  });

  it("does not count whitespace as a position", () => {
    expect(isWritten(rule({ preferred: "   \n  " }))).toBe(false);
  });

  it("keeps the model wording as its own quoted block, ready to lift", () => {
    const paras = rulePara(rule({ approved_clause_text: "Subject to clause 10.3, …" }));
    const quoted = paras.find((p) => p.quote);
    expect(quoted?.runs[0]!.t).toBe("Subject to clause 10.3, …");
  });

  it("keeps a multi-paragraph position as several paragraphs", () => {
    const paras = rulePara(rule({ preferred: "First point.\n\nSecond point." }));
    const bodies = paras.filter((p) => !p.heading).map((p) => p.runs[0]!.t);
    expect(bodies).toContain("First point.");
    expect(bodies).toContain("Second point.");
  });
});

describe("what the front of the document says", () => {
  it("states how current the playbook is", () => {
    expect(textOf(playbookHeading(book, 3, 3))).toContain("Last reviewed 2026-09-16");
    expect(textOf(playbookHeading({ ...book, last_reviewed_at: null }, 3, 3))).toContain(
      "never been marked as reviewed",
    );
  });

  /* Handed to somebody on a call, a page headed with the playbook's name and
     holding one position otherwise reads as the whole of the firm's view. */
  it("admits on its face when it is only an extract", () => {
    expect(textOf(playbookHeading(book, 1, 18))).toContain(
      "1 of 18 positions — this is an extract, not the whole playbook.",
    );
    expect(textOf(playbookHeading(book, 18, 18))).toContain("18 positions.");
  });
});

describe("the document as a whole", () => {
  const rules = [
    rule({ topic: "Fees and payment terms", category: "Commercial", preferred: "30 days." }),
    rule({ topic: "Interest on late payment", category: "Commercial", preferred: "3% over base." }),
    rule({ topic: "Limitation of liability", category: "Risk allocation", preferred: "12 months." }),
  ];

  const headingsOf = (doc: { clauses: { paras?: { runs: { t: string }[]; heading?: number }[] }[] }) =>
    doc.clauses
      .flatMap((c) => c.paras ?? [])
      .filter((p) => p.heading === 2)
      .map((p) => p.runs[0]!.t);

  it("heads each group once, not once per position", () => {
    expect(headingsOf(playbookDocument(book, rules))).toEqual(["COMMERCIAL", "RISK ALLOCATION"]);
  });

  /* The defect this exists to catch: positions are ordered by the lawyer, not
     by category, so walking them in order and printing a heading whenever the
     category changed gave COMMERCIAL, OPERATIONAL, RISK ALLOCATION, IP AND
     DATA, OPERATIONAL, BOILERPLATE, COMMERCIAL — the same heading three times
     and a document that jumped between subjects. Found by exporting a real
     18-position playbook and reading it. */
  it("gathers a category that is scattered through the ordering", () => {
    const scattered = [
      rule({ topic: "Scope", category: "Commercial", ordinal: 1, preferred: "a" }),
      rule({ topic: "Audit rights", category: "Operational", ordinal: 2, preferred: "b" }),
      rule({ topic: "Liability", category: "Risk allocation", ordinal: 3, preferred: "c" }),
      rule({ topic: "Subcontracting", category: "Operational", ordinal: 4, preferred: "d" }),
      rule({ topic: "Interest", category: "Commercial", ordinal: 5, preferred: "e" }),
    ];
    const doc = playbookDocument(book, scattered);
    expect(headingsOf(doc)).toEqual(["COMMERCIAL", "RISK ALLOCATION", "OPERATIONAL"]);
    // ...and the positions follow their heading rather than the raw ordering.
    expect(doc.clauses.slice(1).map((c) => c.title)).toEqual([
      "Scope",
      "Interest",
      "Liability",
      "Audit rights",
      "Subcontracting",
    ]);
  });

  it("numbers the positions as they are printed, not as they were stored", () => {
    const scattered = [
      rule({ topic: "Audit rights", category: "Operational", ordinal: 1, preferred: "b" }),
      rule({ topic: "Scope", category: "Commercial", ordinal: 2, preferred: "a" }),
    ];
    const doc = playbookDocument(book, scattered);
    expect(doc.clauses.slice(1).map((c) => `${c.num} ${c.title}`)).toEqual([
      "1 Scope",
      "2 Audit rights",
    ]);
  });

  it("numbers the positions, so they can be named on a call", () => {
    const doc = playbookDocument(book, rules);
    expect(doc.clauses.slice(1).map((c) => `${c.num} ${c.title}`)).toEqual([
      "1 Fees and payment terms",
      "2 Interest on late payment",
      "3 Limitation of liability",
    ]);
  });

  it("titles a single-position extract by that position", () => {
    const doc = playbookDocument(book, rules, [rules[2]!]);
    expect(doc.title).toBe("Limitation of liability — Logistics services — supplier side");
    expect(doc.clauses).toHaveLength(2);
  });

  it("names the file so it can be found again in a folder of forty", () => {
    expect(playbookFilename(book, undefined, 3, "docx")).toBe(
      "Logistics-services-supplier-side.docx",
    );
    expect(playbookFilename(book, [rules[2]!], 3, "pdf")).toBe(
      "Logistics-services-supplier-side-Limitation-of-liability.pdf",
    );
  });
});
