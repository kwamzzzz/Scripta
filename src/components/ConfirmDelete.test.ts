import { describe, expect, it } from "vitest";
import { deleteQuestion } from "./ConfirmDelete";

describe("deleteQuestion", () => {
  it("names what is going in the title", () => {
    expect(deleteQuestion({ what: "“Vendor Agreement v3”" }).title).toBe(
      "Delete “Vendor Agreement v3”?",
    );
  });

  it("says what actually happens: the bin, and how long it holds", () => {
    expect(deleteQuestion({ what: "“One”" }).body).toContain(
      "It goes to Recently Deleted and is removed for good after 15 days.",
    );
    expect(deleteQuestion({ what: "3 playbooks", count: 3 }).body).toContain(
      "They go to Recently Deleted and are removed for good after 15 days.",
    );
  });

  it("keeps 'cannot be undone' only where it is still true", () => {
    const part = deleteQuestion({ what: "“Clause 4”", binned: false, archivable: false }).body;
    expect(part).toBe("This cannot be undone.");
    expect(part).not.toContain("Recently Deleted");
  });

  it("never promises a grace period it does not give", () => {
    expect(deleteQuestion({ what: "“One”", binned: false }).body).not.toContain("15 days");
  });

  it("offers archiving as the lasting alternative, and agrees with the count", () => {
    expect(deleteQuestion({ what: "“One”" }).body).toContain(
      "Archive it instead to keep it for good.",
    );
    expect(deleteQuestion({ what: "3 playbooks", count: 3 }).body).toContain(
      "Archive them instead to keep them for good.",
    );
  });

  it("stays silent about archiving where there is no archive", () => {
    const body = deleteQuestion({ what: "this reply", archivable: false }).body;
    expect(body).not.toContain("Archive");
    expect(body).toBe("It goes to Recently Deleted and is removed for good after 15 days.");
  });

  it("says what else goes, before saying what happens to it", () => {
    const body = deleteQuestion({
      what: "“Gold offtake”",
      consequence: "Every fact, question, source and draft in it goes too.",
    }).body;
    expect(body.indexOf("goes too")).toBeLessThan(body.indexOf("Recently Deleted"));
  });
});
