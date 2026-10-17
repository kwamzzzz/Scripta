import { describe, expect, it } from "vitest";
import { buildResearchReport, reportFilename, reportIssues } from "./research-report";
import type { StoredIssue } from "@/lib/research-rows";

const issue = (over: Partial<StoredIssue> = {}): StoredIssue => ({
  no: "ISSUE 1",
  short: "Termination on notice",
  q: "May the employer terminate during probation without notice?",
  juris: "Ghana",
  pri: "High",
  state: "Open",
  answer: "No. Section 17 requires notice.",
  pos: "Clear",
  risk: "Low",
  auth: "Act 651, s.17",
  assignee: "Kwame",
  inReport: false,
  done: false,
  rule: "",
  application: "",
  counterpoint: "",
  conclusion: "",
  confidence: "",
  researchStatus: "",
  reasoning: "",
  ...over,
});

const base = {
  title: "Probation notice",
  version: "v0.9",
  approvedAt: "",
  issues: [] as StoredIssue[],
  facts: [],
  assumptions: [],
  risks: [],
  included: [] as string[],
};

describe("reportIssues", () => {
  it("uses the lawyer's insert-into-report choice when they have made one", () => {
    const chosen = issue({ short: "Chosen", inReport: true });
    const other = issue({ short: "Not chosen" });
    expect(reportIssues([chosen, other]).map((i) => i.short)).toEqual(["Chosen"]);
  });

  it("falls back to every answered issue rather than exporting nothing", () => {
    const answered = issue({ short: "Answered" });
    const blank = issue({ short: "Blank", answer: "   " });
    expect(reportIssues([answered, blank]).map((i) => i.short)).toEqual(["Answered"]);
  });
});

describe("buildResearchReport", () => {
  it("numbers issues from their own labels", () => {
    const doc = buildResearchReport({ ...base, issues: [issue({ no: "ISSUE 3" })] });
    expect(doc.clauses[0]!.num).toBe("3");
    expect(doc.clauses[0]!.title).toBe("Termination on notice");
  });

  it("says an issue is unanswered rather than printing an empty body", () => {
    const doc = buildResearchReport({ ...base, issues: [issue({ answer: "", inReport: true })] });
    expect(doc.clauses[0]!.segs[0]!.t).toContain("No answer has been recorded");
  });

  it("leaves out a section the lawyer recorded nothing in", () => {
    const doc = buildResearchReport({ ...base, issues: [issue()] });
    expect(doc.clauses.map((c) => c.title)).not.toContain("Risks and actions");
    expect(doc.clauses.map((c) => c.title)).not.toContain("Facts");
  });

  it("records a fact with no source as not recorded, not as sourced", () => {
    const doc = buildResearchReport({
      ...base,
      issues: [issue()],
      facts: [{ id: "F-01", fact: "Start date", src: "", cls: "Missing", issue: "1", conf: "Low" }],
    });
    const facts = doc.clauses.find((c) => c.title === "Facts")!;
    expect(facts.segs[0]!.t).toContain("Source: not recorded");
  });

  it("says so when an assumption has no stated consequence", () => {
    const doc = buildResearchReport({
      ...base,
      issues: [issue()],
      assumptions: [{ a: "Contract is Ghanaian", why: "", risk: "—", state: "Open" }],
    });
    const a = doc.clauses.find((c) => c.title === "Assumptions")!;
    expect(a.segs[0]!.t).toContain("If wrong: not recorded");
  });

  it("marks an unapproved report as a draft in the subtitle", () => {
    const doc = buildResearchReport({ ...base, issues: [issue()] });
    expect(doc.subtitle).toContain("Draft");
    // No citation style is claimed, because none is applied.
    expect(doc.subtitle).not.toContain("OSCOLA");
  });

  it("stamps the approval when there is one", () => {
    const doc = buildResearchReport({
      ...base,
      approvedAt: "9 Sept",
      version: "v1.0",
      issues: [issue()],
    });
    expect(doc.subtitle).toContain("Approved 9 Sept · v1.0");
  });
});

describe("reportFilename", () => {
  it("makes a title safe for a download folder", () => {
    expect(reportFilename("Probation / notice?", "docx")).toBe("Probation-notice.docx");
  });

  it("falls back rather than producing a bare extension", () => {
    expect(reportFilename("???", "pdf")).toBe("research-report.pdf");
  });
});
