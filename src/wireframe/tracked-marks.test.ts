/**
 * The tracking plugin, driven by real ProseMirror transactions.
 *
 * This file exists because of the rule Phase 4's acceptance left behind:
 * A FIXTURE MUST NOT BE MORE CORRECT THAN THE PRODUCT. Three of the four
 * defects that phase shipped with were invisible to suites that were correctly
 * asserting rules the application was not using — the suite wrote comments with
 * an `author_id` the product never set.
 *
 * So nothing here hand-writes a marked-up document. Every case builds a real
 * `EditorState` from the real schema, applies the transactions the editor
 * itself produces — `insertText`, `delete`, `replaceWith` — and asserts on what
 * comes out. If the plugin stops marking what a lawyer types, these fail.
 */
import { describe, expect, it, vi } from "vitest";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { history, redo, undo } from "@tiptap/pm/history";
import type { ClauseDoc, DocNode } from "./clause-doc";
import { changesIn, ifAccepted, operative } from "./tracked-change";
import { docToText } from "./clause-doc";
import { Highlight, HIGHLIGHT } from "./highlight-mark";
import {
  CommentRef,
  Deletion,
  Insertion,
  trackingPlugin,
  type TrackingContext,
} from "./tracked-marks";

const ME = "6df711b6-27b0-4aaf-8129-ef39700de7bb";
const THEM = "176d2a8c-10f1-429b-82f2-dde207c99a68";

const extensions = [StarterKit, Insertion, Deletion, CommentRef, Highlight];
const schema = getSchema(extensions);

const context = (over: Partial<TrackingContext> = {}): TrackingContext => ({
  authorId: ME,
  setId: "sitting-1",
  enabled: true,
  ...over,
});

/** A state holding one paragraph, with the plugin live. */
function stateWith(text: string, ctx: TrackingContext = context()) {
  return EditorState.create({
    schema,
    doc: schema.node("doc", null, [
      schema.node("paragraph", null, text ? [schema.text(text)] : []),
    ]),
    plugins: [trackingPlugin(() => ctx)],
  });
}

const asClauseDoc = (state: EditorState): ClauseDoc => state.doc.toJSON() as ClauseDoc;

/** Type at a position, the way the editor does. */
function type(state: EditorState, at: number, text: string) {
  return state.apply(state.tr.insertText(text, at));
}

/** Delete a range, the way the editor does. */
function remove(state: EditorState, from: number, to: number) {
  return state.apply(state.tr.delete(from, to));
}

/**
 * Backspace, as the key produces it: the caret is somewhere, and the
 * characters before it go. `by` is how many, so ⌥⌫ over a word is one press.
 */
function backspace(state: EditorState, at: number, by = 1) {
  const placed = state.apply(state.tr.setSelection(TextSelection.create(state.doc, at)));
  return placed.apply(placed.tr.delete(at - by, at));
}

/** The forward Delete key: the caret stays, the characters after it go. */
function forwardDelete(state: EditorState, at: number, by = 1) {
  const placed = state.apply(state.tr.setSelection(TextSelection.create(state.doc, at)));
  return placed.apply(placed.tr.delete(at, at + by));
}

describe("typing proposes rather than overwrites", () => {
  it("marks what was typed, with the author and the sitting", () => {
    const after = type(stateWith("The cap is 24 months."), 12, "about ");
    const changes = changesIn(asClauseDoc(after));
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "insertion", authorId: ME, setId: "sitting-1" });
    expect(changes[0]!.text).toBe("about ");
  });

  it("gives every change an id, so it can be settled alone", () => {
    let state = type(stateWith("A B"), 2, "X");
    state = type(state, 6, "Y");
    const ids = changesIn(asClauseDoc(state)).map((c) => c.changeId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(2);
  });

  /* The assertion that matters most for a lawyer: what you type is NOT yet the
     contract. */
  it("does not become operative wording", () => {
    const after = type(stateWith("The cap is 24 months."), 12, "about ");
    expect(docToText(operative(asClauseDoc(after)))).toBe("The cap is 24 months.");
    expect(docToText(ifAccepted(asClauseDoc(after)))).toBe("The cap is about 24 months.");
  });

  it("leaves a colleague's insertion attributed to them", () => {
    const mine = type(stateWith("Base "), 6, "mine ");
    const asThem = EditorState.create({
      schema,
      doc: mine.doc,
      plugins: [trackingPlugin(() => context({ authorId: THEM, setId: "sitting-2" }))],
    });
    const after = type(asThem, asThem.doc.content.size, "theirs");
    const changes = changesIn(asClauseDoc(after));
    expect(changes).toHaveLength(2);
    expect(new Set(changes.map((c) => c.authorId))).toEqual(new Set([ME, THEM]));
  });
});

describe("deleting proposes rather than destroys", () => {
  /* The half that matters: a deletion that removed its own evidence could never
     be rejected afterwards. */
  it("puts a colleague's wording back and strikes it through", () => {
    const base = EditorState.create({
      schema,
      doc: schema.node("doc", null, [
        schema.node("paragraph", null, [schema.text("Keep this and drop that.")]),
      ]),
      plugins: [trackingPlugin(() => context())],
    });
    const after = remove(base, 15, 25); // " drop that"
    const changes = changesIn(asClauseDoc(after));
    expect(changes).toHaveLength(1);
    expect(changes[0]!.kind).toBe("deletion");
    // The words are still in the document.
    expect(docToText(asClauseDoc(after))).toContain("drop that");
  });

  it("keeps the struck wording operative until the deletion is accepted", () => {
    const base = stateWith("Keep this and drop that.");
    const after = remove(base, 15, 25);
    expect(docToText(operative(asClauseDoc(after)))).toContain("drop that");
    expect(docToText(ifAccepted(asClauseDoc(after)))).not.toContain("drop that");
  });

  /* Taking back your own unaccepted wording is not a proposal about anything,
     and leaving it struck through would fill a clause with a record of
     somebody's typing. */
  it("simply removes the author's own unaccepted insertion", () => {
    let state = type(stateWith("Base "), 6, "typo ");
    expect(changesIn(asClauseDoc(state))).toHaveLength(1);
    // Positions found rather than computed: the text begins at 1, and guessing
    // the arithmetic got this wrong once in a way that looked like a plugin bug.
    const from = state.doc.textContent.indexOf("typo") + 1;
    state = remove(state, from, from + "typo ".length);
    expect(changesIn(asClauseDoc(state))).toHaveLength(0);
    expect(docToText(asClauseDoc(state)).trim()).toBe("Base");
  });

  /* Deleting only PART of your own insertion leaves the rest proposed, which is
     right — you have taken back some of your wording, not all of it. */
  it("leaves the remainder proposed when only part of it goes", () => {
    let state = type(stateWith("Base "), 6, "typo ");
    const from = state.doc.textContent.indexOf("typo") + 1;
    state = remove(state, from + 1, from + 4);
    const changes = changesIn(asClauseDoc(state));
    expect(changes).toHaveLength(1);
    expect(changes[0]!.kind).toBe("insertion");
    expect(changes[0]!.authorId).toBe(ME);
  });
});

describe("replacing a selection", () => {
  /* What typing over a selection actually produces: a deletion and an insertion
     in one transaction. It is the commonest edit a lawyer makes and the one a
     command-based implementation would be most likely to miss. */
  it("produces both a deletion and an insertion", () => {
    const base = stateWith("The cap is 24 months.");
    const tr = base.tr.replaceWith(12, 14, schema.text("12"));
    const after = base.apply(tr);
    const changes = changesIn(asClauseDoc(after));
    expect(changes.map((c) => c.kind).sort()).toEqual(["deletion", "insertion"]);
  });

  it("reads correctly in both directions", () => {
    const base = stateWith("The cap is 24 months.");
    const after = base.apply(base.tr.replaceWith(12, 14, schema.text("12")));
    expect(docToText(operative(asClauseDoc(after)))).toBe("The cap is 24 months.");
    expect(docToText(ifAccepted(asClauseDoc(after)))).toBe("The cap is 12 months.");
  });
});

describe("tracking can be off, and then nothing is proposed", () => {
  /* For a Viewer, and while replaying a migration or a restore — never as a
     mode a lawyer can leave switched off by accident. */
  it("edits plainly when disabled", () => {
    const after = type(stateWith("Base ", context({ enabled: false })), 6, "plain");
    expect(changesIn(asClauseDoc(after))).toEqual([]);
    expect(docToText(asClauseDoc(after))).toBe("Base plain");
  });
});

describe("the plugin does not chase its own tail", () => {
  it("settles after one pass", () => {
    const after = type(stateWith("Base "), 6, "more");
    // Applying an empty transaction must not add further marks.
    const again = after.apply(after.tr.setSelection(TextSelection.create(after.doc, 1)));
    expect(changesIn(asClauseDoc(again))).toHaveLength(1);
  });

  it("leaves an untouched document alone", () => {
    const base = stateWith("Nothing happens here.");
    const after = base.apply(base.tr.setSelection(TextSelection.create(base.doc, 2)));
    expect(changesIn(asClauseDoc(after))).toEqual([]);
    expect(docToText(asClauseDoc(after))).toBe("Nothing happens here.");
  });
});

/**
 * Typing is one change, not one change per keystroke.
 *
 * ---------------------------------------------------------------------------
 * FOUND IN THE PHASE 5 BROWSER ACCEPTANCE, NOT HERE
 * ---------------------------------------------------------------------------
 *
 * Every other case in this file inserts its text in ONE transaction, because
 * that is the convenient way to write a test. It is not what typing is. A
 * lawyer typing a proviso produces one transaction per character, and both
 * change marks are `inclusive: false`, so each new character arrived unmarked
 * and the plugin minted a fresh change for it.
 *
 * The browser test typed a single clause proviso and the audit row read
 * "80 proposed, 0 settled".
 *
 * This is the same lesson as A FIXTURE MORE CORRECT THAN THE PRODUCT, one turn
 * further on: the fixture was not wrong about the rule, it was wrong about the
 * SHAPE OF THE INPUT. So these cases type the way a keyboard does.
 */
describe("a run of typing is one change", () => {
  /** One transaction per character, which is what a keyboard produces. */
  function keyboard(state: EditorState, at: number, text: string) {
    let next = state;
    let pos = at;
    for (const character of text) {
      next = next.apply(next.tr.insertText(character, pos));
      pos += character.length;
    }
    return next;
  }

  /* ---------------------------------------------------------------------
     A CHANGE HAS ONE TIMESTAMP, AND THAT IS WHAT KEEPS THE DOCUMENT SMALL
     ---------------------------------------------------------------------

     ProseMirror merges adjacent text nodes only when their marks are
     IDENTICAL. `at` used to be stamped per keystroke, so no two characters
     ever matched and a typed run became one text node per character, each
     carrying a full attrs object. The change model was right — one changeId,
     one sitting — and the document was enormous: a paragraph of typing ran to
     hundreds of kilobytes, crossing the wire on every read, every realtime
     payload and every export.

     Found by inspecting a real save in the browser during the acceptance
     review. Fourteen characters had produced fourteen marked nodes and
     fourteen distinct timestamps. */
  it("stamps a typed run once, so the document does not carry a node per letter", () => {
    /* One character at a time, each its own transaction, WITH THE CLOCK MOVING
       between them. The clock matters: every keystroke in this suite lands
       inside the same millisecond, so a per-keystroke timestamp is identical by
       accident and the nodes merge anyway. A test that passes because the
       machine is fast is not testing anything — this one advances time so it
       fails against the behaviour it exists to catch. */
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-16T09:12:00.000Z"));
    let state = stateWith("Payment within days.");
    const word = "thirty ";
    for (let i = 0; i < word.length; i += 1) {
      vi.advanceTimersByTime(250);
      state = type(state, 16 + i, word[i]!);
    }
    vi.useRealTimers();
    expect(docToText(asClauseDoc(state))).toBe("Payment within thirty days.");

    const marked: { text: string; at: unknown }[] = [];
    const walk = (node: DocNode) => {
      if (typeof node.text === "string") {
        const mark = node.marks?.find((m) => m.type === "insertion");
        if (mark) marked.push({ text: node.text, at: mark.attrs?.["at"] });
      }
      node.content?.forEach(walk);
    };
    asClauseDoc(state).content.forEach(walk);

    expect(new Set(marked.map((run) => run.at)).size).toBe(1);
    // One run of typing is one text node, not one per letter.
    expect(marked).toHaveLength(1);
    expect(changesIn(asClauseDoc(state))).toHaveLength(1);
  });

  it("gives one proposal for one typed phrase", () => {
    const state = keyboard(stateWith("The Seller shall deliver."), 18, "promptly ");
    const changes = changesIn(asClauseDoc(state));
    expect(changes).toHaveLength(1);
    expect(changes[0]!.text).toBe("promptly ");
    expect(changes[0]!.authorId).toBe(ME);
  });

  it("still separates two runs typed in different places", () => {
    let state = keyboard(stateWith("The Seller shall deliver the Shares."), 18, "promptly ");
    // A second run at the very start, nowhere near the first.
    state = keyboard(state, 1, "Subject to clause 4, ");
    const changes = changesIn(asClauseDoc(state));
    expect(changes).toHaveLength(2);
    expect(changes.map((c) => c.text).sort()).toEqual(["Subject to clause 4, ", "promptly "]);
  });

  /* The guard that stops this becoming a way to absorb a colleague's drafting.
     Podrick types against wording Mawusi proposed; it must not join hers. */
  it("never continues another lawyer's change", () => {
    const mine = keyboard(stateWith("The Seller shall deliver."), 18, "promptly ");
    const theirs = EditorState.create({
      schema,
      doc: mine.doc,
      plugins: [trackingPlugin(() => context({ authorId: THEM, setId: "sitting-2" }))],
    });
    const after = keyboard(theirs, 27, "and without delay ");
    const changes = changesIn(asClauseDoc(after));
    expect(changes).toHaveLength(2);
    const byThem = changes.find((c) => c.authorId === THEM);
    expect(byThem?.text).toBe("and without delay ");
    expect(changes.find((c) => c.authorId === ME)?.text).toBe("promptly ");
  });

  /* And the guard that keeps "accept that sitting" meaning one sitting. */
  it("never continues a change from an earlier sitting", () => {
    const monday = keyboard(stateWith("The Seller shall deliver."), 18, "promptly ");
    const tuesday = EditorState.create({
      schema,
      doc: monday.doc,
      plugins: [trackingPlugin(() => context({ setId: "sitting-2" }))],
    });
    const after = keyboard(tuesday, 27, "and fully ");
    const changes = changesIn(asClauseDoc(after));
    expect(changes).toHaveLength(2);
    expect(new Set(changes.map((c) => c.setId))).toEqual(new Set(["sitting-1", "sitting-2"]));
  });

  it("gives one deletion for a held-down backspace", () => {
    let state = stateWith("The Seller shall promptly deliver.");
    // Six characters removed one at a time, from the right, as backspace does.
    for (let i = 0; i < 6; i++) {
      const to = 26 - i;
      state = state.apply(state.tr.delete(to - 1, to));
    }
    const changes = changesIn(asClauseDoc(state));
    expect(changes).toHaveLength(1);
    expect(changes[0]!.kind).toBe("deletion");
  });

  it("leaves the readings correct after a typed run", () => {
    const state = keyboard(stateWith("The Seller shall deliver."), 18, "promptly ");
    const doc = asClauseDoc(state);
    expect(docToText(operative(doc))).toBe("The Seller shall deliver.");
    expect(docToText(ifAccepted(doc))).toBe("The Seller shall promptly deliver.");
  });
});

/* ==========================================================================
   ADVERSARIAL EDITING
   ==========================================================================

   The cases a lawyer reaches by accident rather than by intent: pressing undo,
   bolding a sentence that happens to contain a proposal, pasting wording copied
   from somewhere else. Declared as an untested gap in the clause-workflow
   acceptance review, because every case above drives the editor the way the
   product means it to be driven, and none of them tries to confuse it.

   What must hold: a change is never silently re-attributed, never silently
   split into two, and never left behind as a mark over wording nobody
   proposed. */

describe("formatting laid over a proposal", () => {
  const bold = (state: EditorState, from: number, to: number) =>
    state.apply(state.tr.addMark(from, to, schema.marks["bold"]!.create()));

  it("does not turn one proposal into two, or invent a new one", () => {
    // Propose wording, then bold the whole sentence including it.
    const typed = type(stateWith("Payment within days."), 9, "thirty ");
    const before = changesIn(asClauseDoc(typed));
    expect(before).toHaveLength(1);

    const emboldened = bold(typed, 1, typed.doc.content.size - 1);
    const after = changesIn(asClauseDoc(emboldened));
    expect(after).toHaveLength(1);
    expect(after[0]!.changeId).toBe(before[0]!.changeId);
    expect(after[0]!.authorId).toBe(ME);
    expect(after[0]!.text).toBe(before[0]!.text);
  });

  it("leaves the readings exactly where they were", () => {
    const typed = type(stateWith("Payment within days."), 9, "thirty ");
    const emboldened = bold(typed, 1, typed.doc.content.size - 1);
    expect(docToText(operative(asClauseDoc(emboldened)))).toBe(
      docToText(operative(asClauseDoc(typed))),
    );
    expect(docToText(ifAccepted(asClauseDoc(emboldened)))).toBe(
      docToText(ifAccepted(asClauseDoc(typed))),
    );
  });

  it("does not propose a change when only formatting moved", () => {
    const plain = stateWith("Payment within thirty days.");
    const emboldened = bold(plain, 1, plain.doc.content.size - 1);
    // Bolding is not a proposal. An AddMarkStep must stay invisible to tracking.
    expect(changesIn(asClauseDoc(emboldened))).toEqual([]);
  });
});

describe("wording pasted from somewhere else", () => {
  /** A paste of a run that already carries another lawyer's insertion mark. */
  const pasteForeign = (state: EditorState, at: number, text: string) => {
    const foreign = schema.text(text, [
      schema.marks["insertion"]!.create({
        changeId: "theirs-1",
        setId: "their-sitting",
        authorId: THEM,
        at: "2026-09-16T09:00:00.000Z",
      }),
    ]);
    return state.apply(state.tr.replaceWith(at, at, foreign));
  };

  it("does not quietly adopt the pasted wording as the pasting lawyer's own", () => {
    const pasted = pasteForeign(stateWith("Payment within days."), 9, "thirty ");
    const changes = changesIn(asClauseDoc(pasted));
    const theirs = changes.find((change) => change.changeId === "theirs-1");
    expect(theirs).toBeDefined();
    expect(theirs!.authorId).toBe(THEM);
  });

  /* The safety here is SERVER-SIDE and deliberately so. `save_clause_doc`
     refuses a document carrying a change id that is new to the clause and
     attributed to somebody else — "A change can only be made in your own
     name." The client does not strip the mark, so this asserts the shape the
     server will then reject, rather than pretending the client prevented it. */
  it("leaves the pasted change attributed to its author, for the server to refuse", () => {
    const pasted = pasteForeign(stateWith("Payment within days."), 9, "thirty ");
    const authors = new Set(changesIn(asClauseDoc(pasted)).map((change) => change.authorId));
    expect(authors.has(THEM)).toBe(true);
    expect(authors.has(ME)).toBe(false);
  });
});

describe("undo and redo", () => {
  const historic = (text: string, ctx: TrackingContext = context()) =>
    EditorState.create({
      schema,
      doc: schema.node("doc", null, [schema.node("paragraph", null, [schema.text(text)])]),
      plugins: [history(), trackingPlugin(() => ctx)],
    });

  const run = (state: EditorState, command: typeof undo) => {
    let next = state;
    command(state, (tr) => {
      next = state.apply(tr);
    });
    return next;
  };

  it("takes back a proposal completely, leaving no mark over wording nobody proposed", () => {
    const typed = type(historic("Payment within days."), 9, "thirty ");
    expect(changesIn(asClauseDoc(typed))).toHaveLength(1);

    const undone = run(typed, undo);
    expect(docToText(asClauseDoc(undone))).toBe("Payment within days.");
    // The mark must go with the wording. A change over text nobody typed is
    // the worst outcome here: it is attributed, and it is not theirs.
    expect(changesIn(asClauseDoc(undone))).toEqual([]);
  });

  it("does not leave a proposal behind when a tracked deletion is undone", () => {
    const struck = remove(historic("Payment within thirty days."), 16, 23);
    expect(changesIn(asClauseDoc(struck))).toHaveLength(1);

    const undone = run(struck, undo);
    /* The marked-up reading is asserted FIRST and on purpose. The original
       defect duplicated the word — "thirty thirty" — and both derived readings
       hid it, because operative() drops the insertion and ifAccepted() drops
       the deletion, so each showed it once. Only the reading that is actually
       sent to the counterparty was wrong. */
    expect(docToText(asClauseDoc(undone))).toBe("Payment within thirty days.");
    expect(docToText(operative(asClauseDoc(undone)))).toBe("Payment within thirty days.");
    expect(docToText(ifAccepted(asClauseDoc(undone)))).toBe("Payment within thirty days.");
    expect(changesIn(asClauseDoc(undone))).toEqual([]);
  });

  it("redoes the strike as one act, not as a fresh proposal", () => {
    const struck = remove(historic("Payment within thirty days."), 16, 23);
    const changeId = changesIn(asClauseDoc(struck))[0]!.changeId;
    const again = run(run(struck, undo), redo);
    const changes = changesIn(asClauseDoc(again));
    expect(docToText(asClauseDoc(again))).toBe("Payment within thirty days.");
    expect(changes).toHaveLength(1);
    expect(changes[0]!.kind).toBe("deletion");
    // The same proposal came back, rather than a second one being invented.
    expect(changes[0]!.changeId).toBe(changeId);
  });
});

describe("the highlighter", () => {
  /**
   * Running a marker pen over words is not a proposal about them. The comment
   * anchor relies on the same property of an AddMarkStep, and this is the
   * assertion that keeps it true for the highlight as the plugin changes.
   */
  it("proposes nothing: a highlight is not a tracked change", () => {
    const state = stateWith("Payment within thirty days.");
    const marked = state.apply(state.tr.addMark(9, 15, schema.marks[HIGHLIGHT]!.create()));
    expect(changesIn(asClauseDoc(marked))).toEqual([]);
    expect(docToText(asClauseDoc(marked))).toBe("Payment within thirty days.");
    // And it survives into both readings, because it is formatting.
    expect(docToText(operative(asClauseDoc(marked)))).toBe("Payment within thirty days.");
    const para = asClauseDoc(marked).content?.[0]?.content ?? [];
    expect(para.some((n) => n.marks?.some((m) => m.type === HIGHLIGHT))).toBe(true);
  });
});

describe("holding Backspace strikes a word", () => {
  /**
   * The bug a lawyer hit on every edit: "the user has to clear one word at a
   * time, so deleting a word means he has to delete one letter and use the
   * arrow key to go to the next".
   *
   * The plugin answers a deletion by putting the text back, and the caret was
   * mapped to the far side of what it had just restored — onto the struck
   * letter, which the next press struck again.
   */
  const CLAUSE = "Payment within thirty days.";
  // "Payment within thirty days." — the caret just after "thirty".
  const AFTER_THIRTY = 1 + "Payment within thirty".length;

  it("leaves the caret before the struck letter, so the next press moves on", () => {
    const once = backspace(stateWith(CLAUSE), AFTER_THIRTY);
    // The letter is back, struck, and the document still reads the same.
    expect(docToText(asClauseDoc(once))).toBe(CLAUSE);
    expect(once.selection.from).toBe(AFTER_THIRTY - 1);

    // A second press, without touching an arrow key, strikes the letter before.
    // One press, one letter struck: the accepted reading has lost the "y".
    expect(docToText(ifAccepted(asClauseDoc(once)))).toBe("Payment within thirt days.");

    // A second press, without touching an arrow key, strikes the letter before.
    const twice = backspace(once, once.selection.from);
    expect(docToText(ifAccepted(asClauseDoc(twice)))).toBe("Payment within thir days.");
    expect(twice.selection.from).toBe(AFTER_THIRTY - 2);

    const thrice = backspace(twice, twice.selection.from);
    expect(docToText(ifAccepted(asClauseDoc(thrice)))).toBe("Payment within thi days.");
  });

  it("counts the whole run as one deletion, not one per letter", () => {
    let state = stateWith(CLAUSE);
    let at = AFTER_THIRTY;
    for (let i = 0; i < 6; i++) {
      state = backspace(state, at);
      at = state.selection.from;
    }
    const changes = changesIn(asClauseDoc(state));
    expect(changes).toHaveLength(1);
    expect(changes[0]!.kind).toBe("deletion");
    // Six presses, one word gone from the accepted reading.
    expect(docToText(ifAccepted(asClauseDoc(state)))).toBe("Payment within  days.");
    expect(docToText(asClauseDoc(state))).toBe(CLAUSE);
  });

  it("strikes a whole word in one press, the way ⌥⌫ deletes one", () => {
    const state = backspace(stateWith(CLAUSE), AFTER_THIRTY, 6);
    expect(changesIn(asClauseDoc(state))).toHaveLength(1);
    expect(docToText(ifAccepted(asClauseDoc(state)))).toBe("Payment within  days.");
    expect(state.selection.from).toBe(AFTER_THIRTY - 6);
  });

  it("sends the caret the other way for the forward Delete key", () => {
    const at = 1 + "Payment ".length;
    const state = forwardDelete(stateWith(CLAUSE), at);
    // Past the letter it just restored, so the next press takes the next one.
    expect(state.selection.from).toBe(at + 1);
    const again = forwardDelete(state, state.selection.from);
    expect(docToText(ifAccepted(asClauseDoc(again)))).toBe("Payment thin thirty days.");
  });

  it("still takes back the author's own unaccepted typing outright", () => {
    const typed = type(stateWith("Base "), 6, "typo");
    // The last text position, not the document's size: the closing token of
    // the paragraph is not somewhere a caret can sit.
    const at = typed.doc.content.size - 1;
    const after = backspace(typed, at);
    // Nothing struck: it was never the counterparty's wording.
    expect(docToText(asClauseDoc(after))).toBe("Base typ");
  });
});
