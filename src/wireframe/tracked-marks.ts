/**
 * The tracked-change marks, as the editor understands them.
 *
 * `tracked-change.ts` is the model and depends on no editor. This file is the
 * other half: the three Tiptap marks that put that model into ProseMirror, and
 * the plugin that makes ordinary typing produce them.
 *
 * ---------------------------------------------------------------------------
 * EVERYTHING IS TRACKED. THERE IS NO SUGGESTION MODE
 * ---------------------------------------------------------------------------
 *
 * Word has a button people forget to press, and the cost of forgetting is a
 * silent overwrite of the counterparty's wording — which is the failure this
 * whole phase exists to remove. So there is no toggle. Typing in a clause
 * proposes; it does not overwrite. Text becomes operative when somebody with
 * the standing to do it accepts the proposal, and never before.
 *
 * ---------------------------------------------------------------------------
 * WHY A PLUGIN AND NOT A COMMAND
 * ---------------------------------------------------------------------------
 *
 * `appendTransaction` sees every transaction after it has been applied,
 * including the ones the user did not think of as editing: paste, drag, an
 * autocorrect, a replacement typed over a selection. Handling this in commands
 * would mean catching each of those separately and missing the next one
 * somebody adds. The plugin is the only place that sees them all.
 *
 * Undo and redo are the exception, and are skipped — see the pass itself.
 */
import { Mark, mergeAttributes, type Editor } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection, type Transaction } from "@tiptap/pm/state";
import type { EditorState } from "@tiptap/pm/state";
import { DELETION, INSERTION, COMMENT_REF } from "./tracked-change";

/** Who is typing, and which sitting their changes belong to. */
export type TrackingContext = {
  authorId: string;
  /** One per editing session, so "accept all of these" is one act. */
  setId: string;
  /** Off for a Viewer, and while replaying a migration or a restore. */
  enabled: boolean;
};

const attrs = {
  changeId: { default: null as string | null },
  setId: { default: null as string | null },
  authorId: { default: null as string | null },
  at: { default: null as string | null },
};

const parseAttrs = (element: HTMLElement) => ({
  changeId: element.getAttribute("data-change-id"),
  setId: element.getAttribute("data-set-id"),
  authorId: element.getAttribute("data-author-id"),
  at: element.getAttribute("data-at"),
});

const renderAttrs = (mark: { attrs: Record<string, unknown> }) => ({
  "data-change-id": String(mark.attrs["changeId"] ?? ""),
  "data-set-id": String(mark.attrs["setId"] ?? ""),
  "data-author-id": String(mark.attrs["authorId"] ?? ""),
  "data-at": String(mark.attrs["at"] ?? ""),
});

/**
 * Proposed wording. Rendered as `<ins>` because that is what it is, and because
 * a screen reader should say "inserted" rather than describe an underline.
 */
export const Insertion = Mark.create({
  name: INSERTION,
  inclusive: false,
  addAttributes: () => attrs,
  parseHTML: () => [{ tag: "ins[data-change-id]", getAttrs: parseAttrs as never }],
  renderHTML: ({ HTMLAttributes, mark }) => [
    "ins",
    mergeAttributes(HTMLAttributes, renderAttrs(mark), { class: "tc-ins" }),
    0,
  ],
});

/**
 * Wording proposed for removal. The text STAYS in the document — it is still
 * operative until the deletion is accepted — and the readings decide whether to
 * show it.
 */
export const Deletion = Mark.create({
  name: DELETION,
  inclusive: false,
  addAttributes: () => attrs,
  parseHTML: () => [{ tag: "del[data-change-id]", getAttrs: parseAttrs as never }],
  renderHTML: ({ HTMLAttributes, mark }) => [
    "del",
    mergeAttributes(HTMLAttributes, renderAttrs(mark), { class: "tc-del" }),
    0,
  ],
});

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    scriptaCommentAnchor: {
      /** Anchor a thread to a range of words. */
      setCommentAnchor: (threadId: string, from: number, to: number) => ReturnType;
    };
  }
}

/**
 * A Phase 4 comment thread, anchored to this run of words.
 *
 * An anchor is a MARK, like everything else in this model, for the reason the
 * whole phase turns on: an offset into text is invalidated by the next edit,
 * and a note that silently slides onto the wrong sentence is worse than a note
 * with no anchor at all.
 *
 * Adding one is invisible to the tracking plugin, which is not an accident.
 * An AddMarkStep produces an empty step map, so the insertion pass finds no
 * range, and inverts to a RemoveMarkStep with no slice, so the deletion pass
 * skips it. Commenting on a colleague's wording therefore does not propose a
 * change to it.
 */
export const CommentRef = Mark.create({
  name: COMMENT_REF,
  inclusive: false,
  addAttributes: () => ({ threadId: { default: null as string | null } }),
  addCommands() {
    return {
      setCommentAnchor:
        (threadId: string, from: number, to: number) =>
        ({ chain }) =>
          chain()
            .setTextSelection({ from, to })
            .setMark(COMMENT_REF, { threadId })
            .setTextSelection(to)
            .run(),
    };
  },
  parseHTML: () => [{ tag: "span[data-thread-id]" }],
  renderHTML: ({ HTMLAttributes, mark }) => [
    "span",
    mergeAttributes(HTMLAttributes, {
      "data-thread-id": String(mark.attrs["threadId"] ?? ""),
      class: "tc-anchor",
    }),
    0,
  ],
});

export const trackingKey = new PluginKey("scripta-tracking");

/** A change id that is readable in an audit row and unique enough to trust. */
const newChangeId = () => `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

/**
 * The change a newly touched run belongs to, if it is continuing one.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS: 80 PROPOSED, 0 SETTLED
 * ---------------------------------------------------------------------------
 *
 * Both change marks are `inclusive: false`, which is right — a colleague typing
 * at the end of your proposal must not silently join it, and text typed after
 * an accepted run must not inherit a mark. But it means a character you type at
 * the end of YOUR OWN proposal does not inherit its mark either, and the
 * plugin, seeing unmarked new text, mints a fresh change for it.
 *
 * One keystroke is one transaction, so typing one phrase produced one change
 * per character. The Phase 5 browser acceptance typed a single clause
 * proviso and the audit row read "80 proposed, 0 settled": the Changes pane
 * would have listed eighty entries for one edit, and accepting that wording
 * would have been eighty decisions.
 *
 * So a run that touches this author's own change, in this same sitting,
 * continues it rather than starting another. Both guards are load-bearing.
 * Without `authorId` a lawyer typing against a colleague's wording would
 * absorb it into their own; without `setId` today's typing would join a
 * proposal made last week, and "accept that sitting" would settle both.
 */
const continuing = (
  doc: EditorState["doc"],
  from: number,
  to: number,
  markName: string,
  ctx: TrackingContext,
): { changeId: string; at: string | null } | null => {
  const mine = (node: { marks: readonly { type: { name: string }; attrs: Record<string, unknown> }[] } | null | undefined) =>
    node?.marks.find(
      (mark) =>
        mark.type.name === markName &&
        mark.attrs["authorId"] === ctx.authorId &&
        mark.attrs["setId"] === ctx.setId,
    ) ?? null;

  /* The change's OWN timestamp comes back with its id, and the run being added
     takes it rather than stamping the moment of this keystroke.

     That is what the timestamp means — Phase 5 records when a proposal was
     made, not when each character of it was typed — and it has a second effect
     that matters more than it sounds. ProseMirror merges adjacent text nodes
     only when their marks are IDENTICAL. With a fresh `at` per keystroke no two
     characters ever matched, so a typed run became one text node per character,
     each carrying a full attrs object. One change, fourteen nodes for fourteen
     letters, and a paragraph of typing is a document several hundred kilobytes
     long that crosses the wire on every read, every realtime payload and every
     export. Found by inspecting a real save in the acceptance review. */
  const before = mine(doc.resolve(from).nodeBefore as never);
  if (before)
    return {
      changeId: before.attrs["changeId"] as string,
      at: (before.attrs["at"] as string | null) ?? null,
    };
  const after = mine(doc.resolve(to).nodeAfter as never);
  if (after)
    return {
      changeId: after.attrs["changeId"] as string,
      at: (after.attrs["at"] as string | null) ?? null,
    };
  return null;
};

/**
 * Turn ordinary editing into proposals.
 *
 * Insertions are marked as they are typed. Deletions are the interesting half:
 * the deleted text is PUT BACK and marked, rather than being allowed to leave
 * the document, because a deletion that removes its own evidence cannot be
 * rejected afterwards.
 *
 * Text the same author inserted and then deleted in the same sitting is the one
 * case where the text really does go: taking back your own unaccepted wording
 * is not a proposal about anything, and leaving it struck through would fill a
 * clause with a record of somebody's typing.
 */
export function trackingPlugin(context: () => TrackingContext) {
  return new Plugin({
    key: trackingKey,
    appendTransaction(
      transactions: readonly Transaction[],
      oldState: EditorState,
      newState: EditorState,
    ) {
      const ctx = context();
      if (!ctx.enabled) return null;
      if (!transactions.some((tr) => tr.docChanged)) return null;
      // Our own repairs must not be re-examined, or a deletion would be put
      // back forever.
      if (transactions.some((tr) => tr.getMeta(trackingKey))) return null;

      /* -----------------------------------------------------------------
         UNDO IS NOT A PROPOSAL
         -----------------------------------------------------------------

         Undo returns the document to a state it was already in. Treating it
         as an edit was actively harmful, because this plugin answers a
         deletion by PUTTING THE TEXT BACK and marking it struck — so undoing
         a tracked deletion re-inserted the words, the pass saw an insertion,
         and the document ended up carrying BOTH a deletion and an insertion
         of the same wording, each attributed to the lawyer, each needing
         somebody with settling rights to clear.

         The readings papered over it — drop the insertion or drop the
         deletion and the text reads the same either way — so the only
         visible symptom was two proposals in the Changes pane that nobody
         made and nobody could explain. Undo is a reflex, so every one of
         them left a pair behind.

         Found by the adversarial-editing pass in the clause-workflow
         acceptance review. The docstring at the top of this file used to
         list undo among the transactions worth tracking; it is the one that
         must not be. */
      if (transactions.some((tr) => tr.getMeta("history$"))) return null;

      const tr = newState.tr;
      let touched = false;
      /**
       * Where to leave the caret after putting struck text back.
       *
       * ---------------------------------------------------------------------
       * WHY: BACKSPACE COULD ONLY EVER DELETE ONE LETTER
       * ---------------------------------------------------------------------
       *
       * A deletion is answered by re-inserting the text and striking it, and
       * ProseMirror maps a caret sitting exactly at an insertion point to the
       * FAR side of it. So Backspace put the letter back and left the caret
       * after it — where the next Backspace deleted the same struck letter,
       * which was put back again. The clock never moved: to strike a word a
       * lawyer had to press Backspace, then arrow left past the struck
       * letter, then Backspace again, letter by letter.
       *
       * The fix is to place the caret on the side the key was travelling
       * towards: before the restored run for Backspace, after it for forward
       * Delete. Then holding Backspace strikes a word the way it deletes one
       * anywhere else, and ⌥⌫ strikes the whole word in a single change.
       */
      const was = oldState.selection;
      let caret: number | null = null;
      let restores = 0;
      const at = new Date().toISOString();
      const stamp = { setId: ctx.setId, authorId: ctx.authorId, at };

      // (1) Mark what was inserted.
      for (const transaction of transactions) {
        for (const step of transaction.steps) {
          const map = step.getMap();
          map.forEach((_fromA, _toA, fromB, toB) => {
            if (toB <= fromB) return;
            const from = tr.mapping.map(fromB);
            const to = tr.mapping.map(toB);
            if (to <= from) return;
            newState.doc.nodesBetween(from, to, (node, pos) => {
              if (!node.isText) return;
              const start = Math.max(from, pos);
              const end = Math.min(to, pos + node.nodeSize);
              if (end <= start) return;
              // Already carrying somebody's insertion — leave it theirs.
              if (node.marks.some((mark) => mark.type.name === INSERTION)) return;
              const carried = continuing(newState.doc, start, end, INSERTION, ctx);
              tr.addMark(
                start,
                end,
                newState.schema.marks[INSERTION]!.create({
                  ...stamp,
                  changeId: carried?.changeId ?? newChangeId(),
                  at: carried?.at ?? at,
                }),
              );
              touched = true;
            });
          });
        }
      }

      // (2) Put back what was deleted, and mark it — unless it was the author's
      //     own unaccepted wording, which simply goes.
      for (const transaction of transactions) {
        for (let i = transaction.steps.length - 1; i >= 0; i--) {
          const step = transaction.steps[i]!;
          const inverted = step.invert(transaction.docs[i]!);
          const slice = (inverted as unknown as { slice?: { content: { size: number } } }).slice;
          if (!slice?.content.size) continue;
          const at_ = (inverted as unknown as { from: number }).from;
          const fragment = (inverted as unknown as { slice: { content: never } }).slice.content;

          let keep = false;
          (fragment as unknown as { descendants: (f: (n: never) => void) => void }).descendants(
            ((node: {
              isText?: boolean;
              marks?: { type: { name: string }; attrs: Record<string, unknown> }[];
            }) => {
              if (!node.isText) return;
              const mine = node.marks?.find(
                (mark) => mark.type.name === INSERTION && mark.attrs["authorId"] === ctx.authorId,
              );
              if (!mine) keep = true;
            }) as never,
          );
          if (!keep) continue;

          const pos = tr.mapping.map(at_);
          const size = (fragment as unknown as { size: number }).size;
          tr.insert(pos, fragment as never);
          // Backspace held down is one deletion, not one per character, for the
          // same reason typing is one insertion.
          const carried = continuing(newState.doc, pos, pos, DELETION, ctx);
          tr.addMark(
            pos,
            pos + size,
            newState.schema.marks[DELETION]!.create({
              ...stamp,
              changeId: carried?.changeId ?? newChangeId(),
              at: carried?.at ?? at,
            }),
          );
          // Text somebody else had proposed and this author is now striking
          // keeps both marks, which the readings already handle.
          touched = true;

          /* Which key did this. With an empty selection, the caret was at one
             end of what went: at the far end for Backspace, at the near end
             for Delete. `at_` is that near end, in the document the step left
             behind, which is the space `was` is measured against too for a
             single-step edit. More than one restore in a batch means this was
             not a keypress at all — a paste over a selection, a drag — and the
             caret is left where the editor put it. */
          restores += 1;
          if (was.empty && restores === 1)
            caret = was.from === at_ + size ? pos : was.from === at_ ? pos + size : null;
        }
      }

      if (!touched) return null;
      if (caret !== null && restores === 1)
        tr.setSelection(TextSelection.create(tr.doc, Math.min(Math.max(caret, 0), tr.doc.content.size)));
      tr.setMeta(trackingKey, true);
      /* -------------------------------------------------------------------
         THE REPAIR BELONGS TO THE EDIT THAT CAUSED IT
         -------------------------------------------------------------------

         This used to set `addToHistory: false`, which kept the repair out of
         the undo stack entirely. That is wrong for a plugin that answers a
         DELETION BY PUTTING THE TEXT BACK: history then remembered only the
         lawyer's delete, and undoing it re-inserted wording the repair had
         already restored — so "Payment within thirty days." became "Payment
         within thirty thirty days.", with the duplicate carrying a phantom
         insertion and the original still struck through.

         Both readings hid it. `operative()` drops the insertion and
         `ifAccepted()` drops the deletion, so each showed the word once and
         looked right, while the MARKED-UP reading — the one that is actually
         sent to the counterparty — carried it twice.

         ProseMirror rolls an appended transaction into the history event of
         the transaction that provoked it, so leaving this alone is what makes
         undo atomic: the lawyer's edit and this repair are one act, and one
         press of undo takes back both. Found by the adversarial-editing pass
         in the clause-workflow acceptance review. */
      return tr;
    },
  });
}

/** The three marks plus the plugin, ready to hand to `useEditor`. */
export const trackedChangeExtensions = (context: () => TrackingContext) => [
  Insertion,
  Deletion,
  CommentRef,
  Mark.create({
    name: "scriptaTracking",
    addProseMirrorPlugins: () => [trackingPlugin(context)],
  }),
];

/** Where the caret is, for the Changes pane to follow the cursor. */
export function changeAtCursor(editor: Editor): string | null {
  const { from } = editor.state.selection;
  const marks = editor.state.doc.resolve(from).marks();
  const change = marks.find((mark) => mark.type.name === INSERTION || mark.type.name === DELETION);
  return (change?.attrs["changeId"] as string | undefined) ?? null;
}
