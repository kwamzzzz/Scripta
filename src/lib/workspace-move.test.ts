/**
 * The sentence a person reads before moving a matter.
 *
 * Small, but it is the only thing between "Move" and a file changing firms,
 * and a wrong count there is worse than no count at all.
 */
import { describe, expect, it } from "vitest";
import { carries, type MovePreview } from "./workspace-move";

const preview = (over: Partial<MovePreview> = {}): MovePreview => ({
  fromName: "Forex Project",
  toName: "Mawusi",
  flows: 0,
  tasks: 0,
  notes: 0,
  reviews: 0,
  documents: 0,
  capped: [],
  released: [],
  ...over,
});

describe("what a move carries", () => {
  it("says so plainly when there is nothing else", () => {
    expect(carries(preview())).toBe("Nothing else is filed under it yet.");
  });

  it("names a single thing without a list", () => {
    expect(carries(preview({ documents: 1 }))).toBe("It carries 1 document with it.");
  });

  it("uses the plural when it should", () => {
    expect(carries(preview({ tasks: 4 }))).toBe("It carries 4 tasks with it.");
  });

  it("reads as a sentence with two", () => {
    expect(carries(preview({ documents: 2, tasks: 1 }))).toBe(
      "It carries 2 documents and 1 task with it.",
    );
  });

  it("and with several", () => {
    expect(carries(preview({ documents: 3, flows: 1, tasks: 2, notes: 9 }))).toBe(
      "It carries 3 documents, 1 flow, 2 tasks and 9 notes with it.",
    );
  });

  /* Counting something that is not there would tell a lawyer their file
     contains work it does not. */
  it("never counts what is not there", () => {
    expect(carries(preview({ notes: 2 }))).toBe("It carries 2 notes with it.");
  });
});
