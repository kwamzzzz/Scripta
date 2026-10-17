import { describe, expect, it } from "vitest";
import { keepSource } from "./keep-version";
import type { DerivedDeliverable } from "./model";

const deliverable = (patch: Partial<DerivedDeliverable>) =>
  ({
    id: "d1",
    phaseId: "p1",
    kind: "document",
    name: "Advice memo",
    type: "memo",
    description: "",
    owner: "KA",
    start: "2026-09-01",
    deadline: "2026-09-10",
    mandatory: true,
    ticked: false,
    state: "in_progress",
    versions: [],
    evidence: [],
    threads: [],
    emailDraft: null,
    finalVersion: null,
    ...patch,
  }) as DerivedDeliverable;

describe("keeping a final version as a precedent", () => {
  it("offers it where Scripta wrote the document", () => {
    expect(keepSource(deliverable({ type: "memo", editorRef: "r1" })).ok).toBe(true);
  });

  it("withholds it for a memo with no editor behind it", () => {
    // Nothing to load: the deliverable points at no research matter.
    expect(keepSource(deliverable({ type: "memo" })).ok).toBe(false);
  });

  it("sends a contract's wording back to the review, clause by clause", () => {
    const source = keepSource(deliverable({ type: "contract" }));
    expect(source.ok).toBe(false);
    expect(source.ok === false && source.why).toContain("clause by clause");
  });

  it("sends a resolution back to the corporate editor", () => {
    const source = keepSource(deliverable({ type: "board_resolution" }));
    expect(source.ok === false && source.why).toContain("corporate drafting editor");
  });

  it("never offers it for an action", () => {
    expect(keepSource(deliverable({ kind: "action", type: "meeting" })).ok).toBe(false);
  });

  it("withholds it for a file Scripta has no text for", () => {
    const source = keepSource(deliverable({ type: "diagram" }));
    expect(source.ok === false && source.why).toContain("does not hold the text");
  });
});
