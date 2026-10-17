/**
 * Highlighting, as a lawyer means it: a marker pen over words that need
 * somebody's attention.
 *
 * It is a mark and not a tracked change, which is the whole point. Running a
 * highlighter over the counterparty's wording does not propose anything about
 * it — the words are untouched — so this must not appear in the Changes pane
 * or in the redline. It does not: an AddMarkStep produces an empty step map,
 * so the tracking plugin's insertion pass finds no range, and it inverts to a
 * RemoveMarkStep with no slice, so the deletion pass skips it. The comment
 * anchor relies on the same thing, for the same reason.
 *
 * One colour. A highlighter that opens a palette invites a private code —
 * yellow means check this, green means agreed — that the person opening the
 * file in Word has no key to. What travels is the marking itself, as Word's
 * own highlight, so the counterparty sees exactly what the lawyer saw.
 */
import { Mark, mergeAttributes } from "@tiptap/core";

export const HIGHLIGHT = "highlight";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    scriptaHighlight: {
      /** Highlight the selected words, or take the highlight off them. */
      toggleHighlight: () => ReturnType;
    };
  }
}

export const Highlight = Mark.create({
  name: HIGHLIGHT,
  /**
   * Not inclusive: typing on at the end of a highlighted phrase should not
   * silently extend the marking. A lawyer highlights words they have read,
   * and words typed afterwards have not been read by anyone yet.
   */
  inclusive: false,
  addCommands() {
    return {
      toggleHighlight:
        () =>
        ({ commands }) =>
          commands.toggleMark(HIGHLIGHT),
    };
  },
  addKeyboardShortcuts() {
    // Word's own shortcut for the highlighter, so the hand already knows it.
    return { "Mod-Alt-h": () => this.editor.commands.toggleHighlight() };
  },
  parseHTML: () => [{ tag: "mark" }],
  renderHTML: ({ HTMLAttributes }) => [
    "mark",
    mergeAttributes(HTMLAttributes, { class: "tc-hl" }),
    0,
  ],
});
