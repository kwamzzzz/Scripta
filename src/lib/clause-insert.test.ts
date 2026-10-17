/**
 * The rules an inserted clause has to obey, and the one that matters most:
 * NOTHING ELSE IN THE DOCUMENT MOVES.
 */
import { describe, expect, it } from "vitest";
import { docToText } from "@/wireframe/clause-doc";
import { changesIn, ifAccepted, operative } from "@/wireframe/tracked-change";
import {
  countsInList,
  insertionDoc,
  isInsertedNumber,
  rootOf,
  suggestClauseNumber,
} from "./clause-insert";

const STAMP = {
  changeId: "c-1",
  setId: "sitting-1",
  authorId: "6df711b6-27b0-4aaf-8129-ef39700de7bb",
  at: "2026-09-22T10:00:00.000Z",
};

describe("the number offered for an inserted clause", () => {
  it("adds a letter to the clause above, so every other number stays true", () => {
    expect(suggestClauseNumber("5.2")).toBe("5.2A");
    expect(suggestClauseNumber("5")).toBe("5A");
    expect(suggestClauseNumber("7.1.3")).toBe("7.1.3A");
  });

  it("takes the next free letter rather than claiming a number twice", () => {
    expect(suggestClauseNumber("5.2", ["5.1", "5.2", "5.2A", "5.3"])).toBe("5.2B");
    expect(suggestClauseNumber("5.2A", ["5.2A"])).toBe("5.2B");
    // Inserting after 5.2B goes to 5.2C: the letter is read off the clause
    // above, not counted from the start again.
    expect(suggestClauseNumber("5.2B", ["5.2A", "5.2B"])).toBe("5.2C");
  });

  it("is not fooled by case, since a lawyer may type either", () => {
    expect(suggestClauseNumber("5.2", ["5.2a"])).toBe("5.2B");
  });

  it("suffixes a named clause the same way", () => {
    expect(rootOf("Schedule 1")).toBe("Schedule 1");
    expect(suggestClauseNumber("Schedule 1")).toBe("Schedule 1A");
  });

  it("offers nothing to go on when the clause above has no number", () => {
    // The Preamble, the Title, an execution block: the field comes up empty
    // and the lawyer says what it should be.
    expect(suggestClauseNumber("")).toBe("");
    expect(suggestClauseNumber("   ")).toBe("");
  });
});

describe("what the exporters do with such a number", () => {
  it("recognises an insertion, and only an insertion", () => {
    expect(isInsertedNumber("5.2A")).toBe(true);
    expect(isInsertedNumber("5A")).toBe(true);
    expect(isInsertedNumber("7.1.3B")).toBe(true);
    expect(isInsertedNumber("5.2")).toBe(false);
    expect(isInsertedNumber("Schedule 1")).toBe(false);
    expect(isInsertedNumber("Part A")).toBe(false);
  });

  /**
   * The load-bearing assertion. 5.2 and 5.3 are counted by Word's list engine
   * and must keep counting; 5.2A prints its own number and is not counted, so
   * the clause after it is still 5.3 in the exported file.
   */
  it("keeps the inserted clause out of Word's count", () => {
    expect(countsInList("5.2")).toBe(true);
    expect(countsInList("5.3")).toBe(true);
    expect(countsInList("5.2A")).toBe(false);
  });
});

describe("the wording goes in as a proposal", () => {
  it("marks every word as inserted, with the author and the sitting", () => {
    const doc = insertionDoc("The Supplier shall maintain insurance.", STAMP);
    const changes = changesIn(doc);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "insertion", authorId: STAMP.authorId });
    // Not yet part of the contract; part of it if accepted.
    expect(docToText(operative(doc))).toBe("");
    expect(docToText(ifAccepted(doc))).toBe("The Supplier shall maintain insurance.");
  });

  it("keeps paragraphs as paragraphs and typed line breaks as breaks", () => {
    const doc = insertionDoc("First paragraph.\n\nSecond one:\n(a) a sub-paragraph.", STAMP);
    expect(doc.content).toHaveLength(2);
    expect(docToText(ifAccepted(doc))).toBe("First paragraph.\nSecond one:\n(a) a sub-paragraph.");
  });

  it("makes an empty clause a clause with nothing in it, not a broken one", () => {
    const doc = insertionDoc("", STAMP);
    expect(doc.content).toEqual([{ type: "paragraph" }]);
    expect(changesIn(doc)).toEqual([]);
  });
});
