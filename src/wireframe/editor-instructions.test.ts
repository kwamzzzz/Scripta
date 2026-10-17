import { describe, expect, it } from "vitest";
import {
  instructionPrompt,
  instructionsFromComments,
  type ClauseCommentRow,
} from "./editor-instructions";

describe("editor instruction handoff", () => {
  it("keeps selected instructions with their own clause anchors and excludes deselected ones", () => {
    const result = instructionPrompt([
      { title: "Interest", anchor: "CLAUSE 3.5", summary: "Increase the rate by 3%", on: true },
      { title: "Term", anchor: "CLAUSE 4", summary: "Extend the term", on: false },
      { title: "Purpose", anchor: "CLAUSE 3.4", summary: "Limit permitted use", on: true },
    ]);
    expect(result).toContain("CLAUSE 3.5 · Interest\nIncrease the rate by 3%");
    expect(result).toContain("CLAUSE 3.4 · Purpose\nLimit permitted use");
    expect(result).not.toContain("Extend the term");
    expect(result).not.toContain("CLAUSE 4");
  });
  it("does not start a proposal with only empty or excluded instructions", () => {
    expect(instructionPrompt([])).toBe("");
    expect(
      instructionPrompt([{ title: "Interest", anchor: "CLAUSE 3.5", summary: "   ", on: true }]),
    ).toBe("");
  });
  it("carries the lawyer's Mandatory law label as context to verify, not a legal conclusion", () => {
    const result = instructionPrompt([
      {
        title: "Interest",
        anchor: "CLAUSE 3.5",
        summary: "Check the rate",
        basis: "Mandatory law",
        on: true,
      },
    ]);
    expect(result).toContain(
      "Lawyer's review label: Mandatory law (verify against the applicable authority).",
    );
    expect(result).toContain("Check the rate");
  });
});

describe("instructions read back from clause comments", () => {
  const clauses = [
    { id: "c-4", num: "4", label: "Liability" },
    { id: "c-4-2", num: "4.2", label: "Cap", basis: "mandatory-law" },
  ];
  const row = (over: Partial<ClauseCommentRow>): ClauseCommentRow => ({
    id: "r1",
    entity_id: "c-4",
    body: "Tighten the indemnity",
    kind: "instruction",
    created_at: "2026-09-01T10:00:00Z",
    ...over,
  });

  it("anchors each instruction on its clause and reads section scope from the number", () => {
    const result = instructionsFromComments(
      [row({}), row({ id: "r2", entity_id: "c-4-2", body: "Cap at 12 months" })],
      clauses,
    );
    expect(result.map((i) => [i.anchor, i.scope, i.summary])).toEqual([
      ["CLAUSE 4", "section", "Tighten the indemnity"],
      ["CLAUSE 4.2", "clause", "Cap at 12 months"],
    ]);
    expect(result[1]!.basis).toBe("mandatory-law");
    expect(result[0]!.basis).toBeUndefined();
  });

  it("leaves notes, empty bodies and orphaned clauses out", () => {
    const result = instructionsFromComments(
      [
        row({ id: "n1", kind: "note", body: "Ask the client about this" }),
        row({ id: "n2", body: "   " }),
        row({ id: "n3", entity_id: "deleted-clause" }),
        row({ id: "keep" }),
      ],
      clauses,
    );
    expect(result.map((i) => i.id)).toEqual(["keep"]);
  });

  it("shows them oldest first, the order they were written in", () => {
    const result = instructionsFromComments(
      [
        row({ id: "later", created_at: "2026-09-02T10:00:00Z", body: "Second" }),
        row({ id: "earlier", created_at: "2026-09-01T10:00:00Z", body: "First" }),
      ],
      clauses,
    );
    expect(result.map((i) => i.summary)).toEqual(["First", "Second"]);
  });
});
