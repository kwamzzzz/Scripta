/**
 * Grouping the outstanding changes on a document.
 *
 * The two questions a lawyer actually asks — "what has Podrick proposed" and
 * "what is still open on clause 7" — and the one thing that must not blur: a
 * SITTING is one person's work in one session on ONE CLAUSE. If sittings ever
 * span clauses, "Accept the sitting" becomes a bulk operation over a contract,
 * which is the button this pane exists not to have.
 */
import { describe, expect, it } from "vitest";
import { group, sittings, type MatterChange } from "./matter-changes";

const doc = { type: "doc" as const, content: [] };

const change = (
  over: Partial<MatterChange> & Pick<MatterChange, "changeId" | "authorId" | "clauseId">,
): MatterChange => ({
  kind: "insertion",
  setId: "sitting-1",
  at: "2026-09-16T09:00:00.000Z",
  text: "some wording",
  clauseNum: "1.1",
  clauseTitle: "Definitions",
  doc,
  ...over,
});

const NAMES: Record<string, string> = { podrick: "Podrick Robogo", mawusi: "Mawusi Kwame" };
const nameOf = (id: string) => NAMES[id] ?? "Somebody";

describe("grouping changes", () => {
  const changes = [
    change({ changeId: "a", authorId: "podrick", clauseId: "c1" }),
    change({
      changeId: "b",
      authorId: "podrick",
      clauseId: "c2",
      clauseNum: "2.1",
      clauseTitle: "Term",
    }),
    change({ changeId: "c", authorId: "mawusi", clauseId: "c1" }),
  ];

  it("gathers a person's proposals across the document", () => {
    const groups = group(changes, "person", nameOf);
    expect(groups.map((entry) => entry.label)).toEqual(["Podrick Robogo", "Mawusi Kwame"]);
    expect(groups[0]!.changes).toHaveLength(2);
  });

  it("gathers a clause's proposals across people", () => {
    const groups = group(changes, "clause", nameOf);
    expect(groups.map((entry) => entry.label)).toEqual(["1.1 · Definitions", "2.1 · Term"]);
    expect(groups[0]!.changes.map((c) => c.authorId)).toEqual(["podrick", "mawusi"]);
  });

  it("names a clause that has neither number nor title rather than showing a blank", () => {
    const groups = group(
      [
        change({
          changeId: "a",
          authorId: "podrick",
          clauseId: "c9",
          clauseNum: null,
          clauseTitle: null,
        }),
      ],
      "clause",
      nameOf,
    );
    expect(groups[0]!.label).toBe("Untitled clause");
  });

  it("keeps the order the document gave it", () => {
    const groups = group(changes, "person", nameOf);
    expect(groups[0]!.key).toBe("podrick");
  });
});

describe("sittings", () => {
  it("counts one person's session on one clause as a single act", () => {
    const found = sittings([
      change({ changeId: "a", authorId: "podrick", clauseId: "c1", setId: "s1" }),
      change({ changeId: "b", authorId: "podrick", clauseId: "c1", setId: "s1" }),
    ]);
    expect(found).toEqual([{ clauseId: "c1", setId: "s1", count: 2 }]);
  });

  /* THE ASSERTION THIS BLOCK EXISTS FOR. One editing session can touch several
     clauses and will carry one set id through all of them. Accepting "the
     sitting" must still mean one clause, because save_clause_doc writes one
     clause and because a lawyer clicking it is looking at one clause. */
  it("never lets one sitting span two clauses", () => {
    const found = sittings([
      change({ changeId: "a", authorId: "podrick", clauseId: "c1", setId: "s1" }),
      change({ changeId: "b", authorId: "podrick", clauseId: "c2", setId: "s1" }),
    ]);
    expect(found).toHaveLength(2);
    expect(found.map((entry) => entry.clauseId)).toEqual(["c1", "c2"]);
  });

  it("ignores a change with no sitting — a migrated one has none", () => {
    expect(
      sittings([change({ changeId: "a", authorId: "migrated", clauseId: "c1", setId: "" })]),
    ).toEqual([]);
  });
});
