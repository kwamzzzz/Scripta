/**
 * The mark model, proved before anything is built on it.
 *
 * Step 1 of Phase 5 is deliberately cheap to test — no database, no editor, no
 * DOM — because a mistake in the change model is the one mistake that is not
 * additive. Everything after this step assumes these four readings are right.
 *
 * The assertion this file exists for is O1: OPERATIVE NEVER CONTAINS AN
 * UNRESOLVED PROPOSAL. That is the distinction the whole model keeps, and the
 * first draft of the plan got it wrong in prose while getting it right in a
 * table — so it is asserted directly rather than inferred from the others.
 */
import { describe, expect, it } from "vitest";
import { docToText, type ClauseDoc, type DocNode } from "./clause-doc";
import {
  acceptChange,
  acceptSet,
  anchoredThreads,
  authorsIn,
  changesAdded,
  changesIn,
  containsChange,
  hasUnresolved,
  ifAccepted,
  operative,
  rejectChange,
  rejectSet,
  withdrawChange,
  withoutAnchors,
  anchorText,
} from "./tracked-change";

const ME = "6df711b6-27b0-4aaf-8129-ef39700de7bb";
const THEM = "176d2a8c-10f1-429b-82f2-dde207c99a68";
const AT = "2026-09-16T09:12:00.000Z";

/** A text node carrying an insertion mark. */
const ins = (text: string, changeId: string, authorId = ME, setId = "s1"): DocNode => ({
  type: "text",
  text,
  marks: [{ type: "insertion", attrs: { changeId, setId, authorId, at: AT } }],
});

/** A text node carrying a deletion mark. */
const del = (text: string, changeId: string, authorId = ME, setId = "s1"): DocNode => ({
  type: "text",
  text,
  marks: [{ type: "deletion", attrs: { changeId, setId, authorId, at: AT } }],
});

const plain = (text: string): DocNode => ({ type: "text", text });

const para = (...content: DocNode[]): DocNode => ({ type: "paragraph", content });
const doc = (...content: DocNode[]): ClauseDoc => ({ type: "doc", content });

/**
 * The specimen from the plan, as a document. One clause, two authors, an
 * insertion, a deletion, and a replacement (a deletion immediately followed by
 * an insertion, which is what typing over a selection produces).
 */
const specimen = doc(
  para(
    plain('"Confirmation" means the Supplier\'s written acceptance of an Order under clause '),
    del("2.1", "c1", THEM),
    ins("2.3", "c2", THEM),
    plain(", "),
    ins("in the form set out in the Order Form, ", "c3", ME, "s2"),
    plain("which shall be "),
    del("binding on both parties", "c4", ME, "s2"),
    ins("binding on the Supplier", "c5", ME, "s2"),
    plain(" upon issue."),
  ),
);

describe("operative — the wording that stands today", () => {
  /* The assertion this file exists for. */
  it("O1 contains no unresolved proposal, in either direction", () => {
    const text = docToText(operative(specimen));
    // Nothing anyone proposed to insert has become operative.
    expect(text).not.toContain("2.3");
    expect(text).not.toContain("in the form set out in the Order Form");
    expect(text).not.toContain("binding on the Supplier");
    // Everything anyone proposed to delete still operates.
    expect(text).toContain("2.1");
    expect(text).toContain("binding on both parties");
  });

  it("reads as the clause did before anybody marked it up", () => {
    expect(docToText(operative(specimen))).toBe(
      '"Confirmation" means the Supplier\'s written acceptance of an Order under clause 2.1, ' +
        "which shall be binding on both parties upon issue.",
    );
  });

  it("leaves no change marks behind", () => {
    expect(changesIn(operative(specimen))).toEqual([]);
    expect(hasUnresolved(operative(specimen))).toBe(false);
  });
});

describe("ifAccepted — how it would read if every proposal were taken", () => {
  it("is the opposite reading, not a variation on operative", () => {
    const text = docToText(ifAccepted(specimen));
    expect(text).toContain("2.3");
    expect(text).toContain("in the form set out in the Order Form");
    expect(text).toContain("binding on the Supplier");
    expect(text).not.toContain("2.1");
    expect(text).not.toContain("binding on both parties");
  });

  it("reads as the finished clause", () => {
    expect(docToText(ifAccepted(specimen))).toBe(
      '"Confirmation" means the Supplier\'s written acceptance of an Order under clause 2.3, ' +
        "in the form set out in the Order Form, which shall be binding on the Supplier upon issue.",
    );
  });

  /* If these two ever produce the same text while something is outstanding, one
     of them is wrong — and a lawyer would be signing a reading of the clause
     nobody agreed to. */
  it("differs from operative whenever anything is unresolved", () => {
    expect(docToText(operative(specimen))).not.toBe(docToText(ifAccepted(specimen)));
  });

  it("agrees with operative once everything is settled", () => {
    let settled: ClauseDoc = specimen;
    for (const change of changesIn(specimen)) settled = acceptChange(settled, change.changeId);
    expect(docToText(operative(settled))).toBe(docToText(ifAccepted(settled)));
  });
});

describe("accept and reject", () => {
  it("accepting an insertion keeps the text and drops the mark", () => {
    const after = acceptChange(specimen, "c3");
    expect(docToText(after)).toContain("in the form set out in the Order Form");
    expect(containsChange(after, "c3")).toBe(false);
    expect(docToText(operative(after))).toContain("in the form set out in the Order Form");
  });

  it("accepting a deletion removes the text", () => {
    const after = acceptChange(specimen, "c1");
    expect(docToText(after)).not.toContain("2.1");
    expect(containsChange(after, "c1")).toBe(false);
  });

  it("rejecting an insertion removes the text", () => {
    const after = rejectChange(specimen, "c2");
    expect(docToText(after)).not.toContain("2.3");
    expect(containsChange(after, "c2")).toBe(false);
  });

  it("rejecting a deletion keeps the text and drops the mark", () => {
    const after = rejectChange(specimen, "c4");
    expect(docToText(after)).toContain("binding on both parties");
    expect(containsChange(after, "c4")).toBe(false);
    expect(docToText(operative(after))).toContain("binding on both parties");
  });

  it("touches only the change named", () => {
    const after = acceptChange(specimen, "c1");
    expect(
      changesIn(after)
        .map((c) => c.changeId)
        .sort(),
    ).toEqual(["c2", "c3", "c4", "c5"]);
  });

  /* The exit criterion from the plan. Accepting then withdrawing is not an undo
     — the change is gone either way — so the pair that must round-trip is
     "reject an insertion" against a document that never had it. */
  it("accept-then-reject of the same change leaves nothing outstanding", () => {
    const accepted = acceptChange(specimen, "c3");
    expect(() => rejectChange(accepted, "c3")).not.toThrow();
    expect(containsChange(rejectChange(accepted, "c3"), "c3")).toBe(false);
  });

  it("rejecting an insertion returns the clause to exactly its operative wording", () => {
    let refused: ClauseDoc = specimen;
    for (const change of changesIn(specimen)) refused = rejectChange(refused, change.changeId);
    expect(docToText(refused)).toBe(docToText(operative(specimen)));
  });

  it("withdraw is reject under the name used when it is your own", () => {
    expect(docToText(withdrawChange(specimen, "c2"))).toBe(docToText(rejectChange(specimen, "c2")));
  });
});

describe("sets", () => {
  it("accepting a set settles every change in it and nothing else", () => {
    const after = acceptSet(specimen, "s2");
    expect(
      changesIn(after)
        .map((c) => c.changeId)
        .sort(),
    ).toEqual(["c1", "c2"]);
    expect(docToText(after)).toContain("binding on the Supplier");
    expect(docToText(after)).not.toContain("binding on both parties");
  });

  it("rejecting a set refuses every change in it and nothing else", () => {
    const after = rejectSet(specimen, "s2");
    expect(
      changesIn(after)
        .map((c) => c.changeId)
        .sort(),
    ).toEqual(["c1", "c2"]);
    expect(docToText(after)).toContain("binding on both parties");
    expect(docToText(after)).not.toContain("binding on the Supplier");
  });
});

describe("a deletion inside an insertion", () => {
  /* One lawyer inserts wording; another proposes striking part of it. The text
     carries both marks. Neither proposal is resolved, so it is not operative —
     and it is not in the accepted reading either, because accepting both means
     inserting it and then deleting it. */
  const both = doc(
    para(
      plain("The Supplier shall "),
      {
        type: "text",
        text: "promptly ",
        marks: [
          { type: "insertion", attrs: { changeId: "i1", setId: "s1", authorId: ME, at: AT } },
          { type: "deletion", attrs: { changeId: "d1", setId: "s2", authorId: THEM, at: AT } },
        ],
      },
      plain("deliver the Goods."),
    ),
  );

  it("is not operative", () => {
    expect(docToText(operative(both))).toBe("The Supplier shall deliver the Goods.");
  });

  it("is not in the accepted reading either", () => {
    expect(docToText(ifAccepted(both))).toBe("The Supplier shall deliver the Goods.");
  });

  it("is reported as two changes, by two authors", () => {
    const changes = changesIn(both);
    expect(changes).toHaveLength(2);
    expect(changes.map((c) => c.authorId).sort()).toEqual([ME, THEM].sort());
  });

  it("accepting the insertion leaves the deletion outstanding", () => {
    const after = acceptChange(both, "i1");
    expect(changesIn(after).map((c) => c.changeId)).toEqual(["d1"]);
    // Still not operative: the deletion is now the unresolved one.
    expect(docToText(operative(after))).toContain("promptly");
  });

  it("rejecting the deletion leaves the insertion outstanding", () => {
    const after = rejectChange(both, "d1");
    expect(changesIn(after).map((c) => c.changeId)).toEqual(["i1"]);
    expect(docToText(operative(after))).not.toContain("promptly");
    expect(docToText(ifAccepted(after))).toContain("promptly");
  });
});

describe("changesIn", () => {
  it("reports one entry per change, in document order", () => {
    expect(changesIn(specimen).map((c) => c.changeId)).toEqual(["c1", "c2", "c3", "c4", "c5"]);
  });

  it("gathers a change that the editor split across text nodes", () => {
    const split = doc(
      para(
        ins("in the form ", "c9"),
        {
          type: "text",
          text: "set out",
          marks: [
            { type: "insertion", attrs: { changeId: "c9", setId: "s1", authorId: ME, at: AT } },
            { type: "bold" },
          ],
        },
        ins(" in the Order Form", "c9"),
      ),
    );
    const changes = changesIn(split);
    expect(changes).toHaveLength(1);
    expect(changes[0]!.text).toBe("in the form set out in the Order Form");
  });

  it("carries the attribution", () => {
    const change = changesIn(specimen).find((c) => c.changeId === "c1")!;
    expect(change).toMatchObject({ kind: "deletion", authorId: THEM, setId: "s1", at: AT });
  });

  it("finds nothing in a clean clause", () => {
    expect(changesIn(doc(para(plain("Unmarked."))))).toEqual([]);
  });
});

describe("authorship", () => {
  it("names every author in the document", () => {
    expect(authorsIn(specimen).sort()).toEqual([ME, THEM].sort());
  });

  /* What a save is allowed to introduce. Anything new must belong to the person
     saving; anything already there keeps its authorship, so a colleague can
     accept part of your markup without the rest being re-signed in their name. */
  it("reports only the changes a save introduces", () => {
    const before = doc(para(plain("Base "), ins("one", "c1", ME)));
    const after = doc(para(plain("Base "), ins("one", "c1", ME), ins(" two", "c2", THEM)));
    expect(changesAdded(before, after).map((c) => c.changeId)).toEqual(["c2"]);
  });

  it("reports nothing when a save only settles existing changes", () => {
    expect(changesAdded(specimen, acceptChange(specimen, "c1"))).toEqual([]);
  });

  it("reports nothing when nothing moved", () => {
    expect(changesAdded(specimen, specimen)).toEqual([]);
  });
});

describe("structure is preserved", () => {
  /* The paragraph survives with no content. Collapsing it would make operative()
     change the SHAPE of the clause rather than its wording, which is a different
     and worse thing for a reading to do. Asserted structurally rather than
     through the text serializer, whose trailing-newline behaviour is its own
     business. */
  it("keeps a paragraph whose every word was an unaccepted insertion", () => {
    const d = doc(para(plain("Kept.")), para(ins("All proposed.", "c1")));
    const result = operative(d);
    expect(result.content).toHaveLength(2);
    expect(result.content[0]!.content).toHaveLength(1);
    expect(result.content[1]!.type).toBe("paragraph");
    expect(result.content[1]!.content).toEqual([]);
    expect(docToText(result)).toContain("Kept.");
    expect(docToText(result)).not.toContain("All proposed.");
  });

  it("leaves no empty text nodes behind", () => {
    const hasEmptyText = (node: DocNode): boolean =>
      (typeof node.text === "string" && node.text === "") ||
      (node.content?.some(hasEmptyText) ?? false);
    expect(operative(specimen).content.some(hasEmptyText)).toBe(false);
    expect(ifAccepted(specimen).content.some(hasEmptyText)).toBe(false);
  });

  it("keeps formatting marks that are not change marks", () => {
    const bolded = doc(para({ type: "text", text: "Bold.", marks: [{ type: "bold" }] }));
    expect(operative(bolded).content[0]!.content![0]!.marks).toEqual([{ type: "bold" }]);
  });

  it("survives an empty document", () => {
    const empty: ClauseDoc = { type: "doc", content: [] };
    expect(operative(empty)).toEqual(empty);
    expect(ifAccepted(empty)).toEqual(empty);
    expect(changesIn(empty)).toEqual([]);
  });
});

describe("comment anchors", () => {
  const anchored = doc(
    para(
      plain("The cap is "),
      {
        type: "text",
        text: "12 months",
        marks: [{ type: "commentRef", attrs: { threadId: "t1" } }],
      },
      plain(" of fees."),
    ),
  );

  it("are reported", () => {
    expect(anchoredThreads(anchored)).toEqual(["t1"]);
  });

  it("survive the readings, because a thread is not a proposal", () => {
    expect(anchoredThreads(operative(anchored))).toEqual(["t1"]);
    expect(anchoredThreads(ifAccepted(anchored))).toEqual(["t1"]);
  });

  it("are dropped only for export", () => {
    expect(anchoredThreads(withoutAnchors(anchored))).toEqual([]);
    expect(docToText(withoutAnchors(anchored))).toBe("The cap is 12 months of fees.");
  });
});

/**
 * Anchored comments.
 *
 * The anchor is a mark in the document, like everything else in this model, and
 * for the same reason: an offset into text is invalidated by the next edit, and
 * a comment that silently slides onto the wrong sentence is worse than one with
 * no anchor at all.
 */
describe("the words a comment is about", () => {
  const anchored = (threadId: string, text: string): ClauseDoc => ({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "The Seller shall " },
          { type: "text", text, marks: [{ type: "commentRef", attrs: { threadId } }] },
          { type: "text", text: " on completion." },
        ],
      },
    ],
  });

  it("quotes the words back", () => {
    expect(anchorText(anchored("t1", "deliver the Shares"), "t1")).toBe("deliver the Shares");
  });

  /* The case this exists for: a proposal inside the anchored span splits the
     run, and a quotation that stopped at the first node would read "deliver
     the" and mean something else entirely. */
  it("gathers a span that a proposal has split in two", () => {
    const doc: ClauseDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "deliver the ",
              marks: [{ type: "commentRef", attrs: { threadId: "t1" } }],
            },
            {
              type: "text",
              text: "Sale Shares",
              marks: [
                { type: "commentRef", attrs: { threadId: "t1" } },
                {
                  type: "insertion",
                  attrs: { changeId: "c1", setId: "s1", authorId: "p", at: "2026-09-16" },
                },
              ],
            },
          ],
        },
      ],
    };
    expect(anchorText(doc, "t1")).toBe("deliver the Sale Shares");
  });

  it("says nothing rather than something when the anchor has gone", () => {
    expect(anchorText(anchored("t1", "deliver the Shares"), "t2")).toBeNull();
  });

  it("keeps two threads on the same clause apart", () => {
    const doc: ClauseDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "first", marks: [{ type: "commentRef", attrs: { threadId: "a" } }] },
            { type: "text", text: " and " },
            { type: "text", text: "second", marks: [{ type: "commentRef", attrs: { threadId: "b" } }] },
          ],
        },
      ],
    };
    expect(anchorText(doc, "a")).toBe("first");
    expect(anchorText(doc, "b")).toBe("second");
    expect(anchoredThreads(doc)).toEqual(["a", "b"]);
  });
});

/**
 * An anchor when the wording under it is settled.
 *
 * ---------------------------------------------------------------------------
 * THE CASE THE MODEL PROMISES AND NOTHING PROVED
 * ---------------------------------------------------------------------------
 *
 * `anchorText` says a thread can lose its anchor "honestly — the words a
 * comment was about can be deleted and the deletion accepted". That is a claim
 * about what accepting and rejecting do to a MARK THAT IS NOT THEIRS, and it
 * was asserted nowhere: every anchor test above settles nothing.
 *
 * It matters because the two marks sit on the same run. Accepting an insertion
 * drops the insertion mark and keeps the text — if it rebuilt the run instead
 * of dropping one mark, the comment would be silently cut loose from wording
 * that is still on the page, and a lawyer would lose a note without being told.
 * Rejecting removes the text, and then the thread SHOULD be orphaned.
 *
 * Declared as a gap in the clause-workflow acceptance review; closed here.
 */
describe("an anchor when the wording under it is settled", () => {
  /** A run carrying a change mark and a comment anchor at once. */
  const both = (text: string, kind: "insertion" | "deletion", threadId: string): DocNode => ({
    type: "text",
    text,
    marks: [
      { type: kind, attrs: { changeId: "c1", setId: "s1", authorId: ME, at: AT } },
      { type: "commentRef", attrs: { threadId } },
    ],
  });

  const onInsertion = doc(
    para(plain("The cap is "), both("12 months", "insertion", "t1"), plain(" of fees.")),
  );
  const onDeletion = doc(
    para(plain("The cap is "), both("12 months", "deletion", "t1"), plain(" of fees.")),
  );

  it("keeps the thread attached when the insertion it sits on is accepted", () => {
    const settled = acceptChange(onInsertion, "c1");
    expect(docToText(settled)).toBe("The cap is 12 months of fees.");
    expect(anchorText(settled, "t1")).toBe("12 months");
    expect(anchoredThreads(settled)).toEqual(["t1"]);
    // The proposal is gone; only the anchor survives it.
    expect(changesIn(settled)).toEqual([]);
  });

  it("orphans the thread when the insertion it sits on is rejected", () => {
    const settled = rejectChange(onInsertion, "c1");
    expect(docToText(settled)).toBe("The cap is  of fees.");
    // Honestly gone, and said so rather than pointing at the wrong sentence.
    expect(anchorText(settled, "t1")).toBeNull();
    expect(anchoredThreads(settled)).toEqual([]);
  });

  it("orphans the thread when the deletion it sits on is accepted", () => {
    const settled = acceptChange(onDeletion, "c1");
    expect(docToText(settled)).toBe("The cap is  of fees.");
    expect(anchorText(settled, "t1")).toBeNull();
  });

  it("keeps the thread attached when the deletion it sits on is rejected", () => {
    const settled = rejectChange(onDeletion, "c1");
    expect(docToText(settled)).toBe("The cap is 12 months of fees.");
    expect(anchorText(settled, "t1")).toBe("12 months");
    expect(changesIn(settled)).toEqual([]);
  });

  it("keeps the surviving half when a thread spans settled and untouched wording", () => {
    const spanning = doc(
      para(
        plain("The cap is "),
        both("12 months", "deletion", "t1"),
        {
          type: "text",
          text: " of fees",
          marks: [{ type: "commentRef", attrs: { threadId: "t1" } }],
        },
        plain("."),
      ),
    );
    expect(anchorText(spanning, "t1")).toBe("12 months of fees");
    // The deleted half goes; the thread keeps pointing at what is left of it.
    expect(anchorText(acceptChange(spanning, "c1"), "t1")).toBe(" of fees");
    expect(anchorText(rejectChange(spanning, "c1"), "t1")).toBe("12 months of fees");
  });

  it("leaves a thread anchored to untouched wording entirely alone", () => {
    const elsewhere = doc(
      para(
        ins("in the form set out in the Order Form, ", "c1"),
        {
          type: "text",
          text: "which shall be binding",
          marks: [{ type: "commentRef", attrs: { threadId: "t1" } }],
        },
        plain("."),
      ),
    );
    expect(anchorText(acceptChange(elsewhere, "c1"), "t1")).toBe("which shall be binding");
    expect(anchorText(rejectChange(elsewhere, "c1"), "t1")).toBe("which shall be binding");
  });
});
