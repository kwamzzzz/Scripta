import { describe, expect, it } from "vitest";
import { CATEGORIES, byCategory, issueTypeFor, suggestedIssues } from "./issues";

describe("issueTypeFor", () => {
  it("recognises what a lawyer actually types", () => {
    expect(issueTypeFor("SaaS Agreement")).toBe("services");
    expect(issueTypeFor("Master Services Agreement")).toBe("services");
    expect(issueTypeFor("Mutual NDA")).toBe("nda");
    expect(issueTypeFor("Gold offtake agreement")).toBe("supply");
    expect(issueTypeFor("Facility agreement")).toBe("loan");
    expect(issueTypeFor("Contract of employment")).toBe("employment");
  });

  it("admits when it does not know the type", () => {
    expect(issueTypeFor("Concession deed")).toBeNull();
    expect(issueTypeFor("")).toBeNull();
  });
});

describe("suggestedIssues", () => {
  it("raises the issues that agreement actually has", () => {
    const topics = suggestedIssues("SaaS agreement").map((i) => i.topic);
    expect(topics).toContain("Limitation of liability");
    expect(topics).toContain("Service levels and remedies");
    expect(topics).toContain("Data protection");
  });

  it("gives a different agreement different issues", () => {
    const saas = suggestedIssues("SaaS agreement").map((i) => i.topic);
    const lease = suggestedIssues("Lease of premises").map((i) => i.topic);
    expect(lease).toContain("Rent and review");
    expect(lease).not.toContain("Service levels and remedies");
    expect(saas).not.toEqual(lease);
  });

  it("still starts a playbook for an agreement it does not know", () => {
    const topics = suggestedIssues("Concession deed").map((i) => i.topic);
    expect(topics).toContain("Limitation of liability");
    expect(topics.length).toBeGreaterThan(4);
  });

  it("adds the issues every agreement has, without repeating one", () => {
    const topics = suggestedIssues("NDA").map((i) => i.topic);
    expect(topics).toContain("Governing law and jurisdiction");
    // The NDA list has its own confidentiality issues, so the common one is
    // not added on top.
    expect(topics.filter((t) => t === "Confidentiality")).toHaveLength(1);
  });

  it("files every issue under a category the overview knows", () => {
    for (const type of ["services", "supply", "nda", "employment", "lease", "unknown"])
      for (const issue of suggestedIssues(type))
        expect(CATEGORIES).toContain(issue.category);
  });

  it("says why each issue matters, so a position starts with a reason", () => {
    for (const issue of suggestedIssues("services")) expect(issue.why.length).toBeGreaterThan(20);
  });
});

describe("byCategory", () => {
  it("groups in the order a lawyer reads them, not alphabetically", () => {
    const groups = byCategory([
      { category: "Boilerplate", ordinal: 1 },
      { category: "Commercial", ordinal: 2 },
      { category: "Risk allocation", ordinal: 3 },
    ]);
    expect(groups.map((g) => g.category)).toEqual([
      "Commercial",
      "Risk allocation",
      "Boilerplate",
    ]);
  });

  it("keeps the lawyer's own order inside a category", () => {
    const groups = byCategory([
      { category: "Commercial", ordinal: 3 },
      { category: "Commercial", ordinal: 1 },
      { category: "Commercial", ordinal: 2 },
    ]);
    expect(groups[0]!.rows.map((r) => r.ordinal)).toEqual([1, 2, 3]);
  });

  it("does not lose a position that belongs to no category", () => {
    const groups = byCategory([{ category: null, ordinal: 1 }, { category: "Commercial", ordinal: 2 }]);
    expect(groups.map((g) => g.category)).toEqual(["Commercial", "Uncategorised"]);
  });
});
