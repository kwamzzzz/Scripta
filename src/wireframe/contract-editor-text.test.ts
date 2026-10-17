import { describe, expect, it } from "vitest";
import { rebuildAmendment } from "@/lib/parsing/word-diff";
import { isClauseEdited } from "./contract-editor-text";

describe("the text a reviewer edits", () => {
  it("is the amendment side, with deletions dropped and insertions kept", () => {
    const segs = [
      { t: "The Supplier shall ", k: "n" as const },
      { t: "use reasonable endeavours ", k: "d" as const },
      { t: "procure ", k: "i" as const },
      { t: "the insurance.", k: "n" as const },
    ];
    expect(rebuildAmendment(segs)).toBe("The Supplier shall procure the insurance.");
  });
});

describe("isClauseEdited", () => {
  it("is false when nothing was typed", () => {
    expect(isClauseEdited("Notice must be in writing.", "Notice must be in writing.")).toBe(false);
  });

  it("is false for whitespace the diff engine would normalise away", () => {
    expect(isClauseEdited("Notice must be in writing.", "  Notice must  be in\nwriting. ")).toBe(
      false,
    );
  });

  it("is true for a real wording change", () => {
    expect(
      isClauseEdited("Notice must be in writing.", "Notice must be in writing and signed."),
    ).toBe(true);
  });

  it("is true when the clause is emptied", () => {
    expect(isClauseEdited("Notice must be in writing.", "")).toBe(true);
  });
});
