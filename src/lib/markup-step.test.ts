/**
 * Reading a step of the mark-up off the two versions either side of it.
 *
 * The assertion the whole history turns on: A SETTLED CHANGE IS STILL
 * READABLE. Accepting an insertion leaves ordinary words behind and rejecting
 * one leaves nothing, so by the time a lawyer asks what happened there is no
 * mark to consult — only the words, which is what these cases check.
 */
import { describe, expect, it } from "vitest";
import type { ClauseDoc } from "@/wireframe/clause-doc";
import { DELETION, INSERTION } from "@/wireframe/tracked-change";
import { HIGHLIGHT } from "@/wireframe/highlight-mark";
import { describeStep, intoSittings, phrasesWithMark } from "./markup-step";

const ME = "6df711b6-27b0-4aaf-8129-ef39700de7bb";

const stamp = (changeId: string) => ({
  changeId,
  setId: "sitting-1",
  authorId: ME,
  at: "2026-09-22T09:00:00.000Z",
});

/** A one-paragraph clause from runs of [text, markType?]. */
const doc = (...runs: [string, string?][]): ClauseDoc => ({
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: runs.map(([text, mark]) => ({
        type: "text",
        text,
        ...(mark ? { marks: [{ type: mark, attrs: stamp(`c-${mark}-${text.length}`) }] } : {}),
      })),
    },
  ],
});

describe("a proposal", () => {
  it("reads as the words it would add, with its author", () => {
    const before = doc(["Payment is due in 30 days."]);
    const after = doc(["Payment is due in "], ["14", INSERTION], [" days."]);
    const step = describeStep(before, after);
    expect(step.proposed).toHaveLength(1);
    expect(step.proposed[0]).toMatchObject({ kind: INSERTION, text: "14", authorId: ME });
    expect(step.settled).toEqual([]);
    expect(step.wording.some((s) => s.k === "i" && s.t.includes("14"))).toBe(true);
    expect(step.nothing).toBe(false);
  });
});

describe("a settled change, after the mark has gone", () => {
  /**
   * The case this file exists for. The newer version has no mark at all; the
   * only evidence of what happened is whether the words stayed.
   */
  it("knows an accepted insertion by the words it left behind", () => {
    const before = doc(["Payment is due in "], ["14", INSERTION], [" days."]);
    const after = doc(["Payment is due in 14 days."]);
    const step = describeStep(before, after);
    expect(step.settled).toEqual([
      { changeId: "c-insertion-2", kind: "insertion", text: "14", authorId: ME, fate: "accepted" },
    ]);
    expect(step.proposed).toEqual([]);
  });

  it("knows a rejected insertion by their absence", () => {
    const before = doc(["Payment is due in "], ["14", INSERTION], [" days."]);
    const after = doc(["Payment is due in  days."]);
    expect(describeStep(before, after).settled[0]).toMatchObject({
      kind: "insertion",
      fate: "rejected",
    });
  });

  it("reads a deletion the other way round: gone means accepted", () => {
    const before = doc(["Payment is due "], ["immediately", DELETION], ["."]);
    const acceptedOut = doc(["Payment is due ."]);
    expect(describeStep(before, acceptedOut).settled[0]).toMatchObject({
      kind: "deletion",
      text: "immediately",
      fate: "accepted",
    });

    const refused = doc(["Payment is due immediately."]);
    expect(describeStep(before, refused).settled[0]).toMatchObject({
      kind: "deletion",
      fate: "rejected",
    });
  });
});

describe("the highlighter", () => {
  it("says which words were marked, and which were unmarked", () => {
    const plain = doc(["The fee is USD 1,350."]);
    const marked = doc(["The fee is "], ["USD 1,350", HIGHLIGHT], ["."]);
    const on = describeStep(plain, marked);
    expect(on.highlighted).toEqual(["USD 1,350"]);
    expect(on.unhighlighted).toEqual([]);
    // Nothing about the wording moved, which is the point of a highlight.
    expect(on.wording).toEqual([]);
    expect(on.nothing).toBe(false);

    const off = describeStep(marked, plain);
    expect(off.unhighlighted).toEqual(["USD 1,350"]);
    expect(off.highlighted).toEqual([]);
  });

  it("reads each highlighted phrase separately", () => {
    const d = doc(
      ["Pay "],
      ["on time", HIGHLIGHT],
      [" and in "],
      ["cleared funds", HIGHLIGHT],
      ["."],
    );
    expect(phrasesWithMark(d, HIGHLIGHT)).toEqual(["on time", "cleared funds"]);
  });
});

describe("the first version of a clause", () => {
  /**
   * There is nothing to diff against, and a whole clause painted green would
   * tell a lawyer they wrote wording they only read.
   */
  it("is shown as what it said, not as a diff against nothing", () => {
    const step = describeStep(null, doc(["Payment is due in 30 days."]));
    expect(step.first).toBe(true);
    expect(step.text).toBe("Payment is due in 30 days.");
    expect(step.wording).toEqual([]);
    expect(step.settled).toEqual([]);
    // Still worth showing: it is where the record begins.
    expect(step.nothing).toBe(false);
  });
});

describe("a save that changed nothing", () => {
  it("says so, so the history does not fill with empty steps", () => {
    const same = doc(["Payment is due in 30 days."]);
    expect(describeStep(same, same).nothing).toBe(true);
  });
});

describe("sittings", () => {
  const step = (at: string, authorId: string | null) => ({ at, authorId });

  it("groups a run of work by one person into one sitting", () => {
    const steps = [
      step("2026-09-22T09:00:00.000Z", ME),
      step("2026-09-22T09:04:00.000Z", ME),
      step("2026-09-22T09:31:00.000Z", ME),
    ];
    expect(intoSittings(steps)).toHaveLength(1);
  });

  it("starts a new one after a long silence, or another lawyer", () => {
    const steps = [
      step("2026-09-22T09:00:00.000Z", ME),
      // Two hours later: a different sitting at the same document.
      step("2026-09-22T11:05:00.000Z", ME),
      step("2026-09-22T11:10:00.000Z", "another-lawyer"),
    ];
    expect(intoSittings(steps).map((s) => s.length)).toEqual([1, 1, 1]);
  });
});
