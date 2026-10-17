/**
 * What the clause editor is allowed to do.
 *
 * Kept apart from the editor component so the configuration can be imported by
 * anything that has to understand a clause document — the exporters especially —
 * without pulling a React component in with it.
 */
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import { Placeholder } from "@tiptap/extensions";
import { FontFamily, FontSize, TextStyle } from "@tiptap/extension-text-style";
import { Highlight } from "./highlight-mark";

/** A defined term in quotation marks reads as bold in a contract. */
export const TERM = /(“[^”]{1,60}”)/g;

/**
 * The marks and blocks a contract actually uses. Headings stop at three levels
 * because a clause is already a heading; code blocks and horizontal rules are
 * off because neither belongs in an agreement.
 */
export const CLAUSE_EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    codeBlock: false,
    horizontalRule: false,
    link: { openOnClick: false, autolink: false },
  }),
  TableKit.configure({ table: { resizable: false } }),
  // A marker pen over words that need attention, which leaves in the file as
  // Word's own highlight.
  Highlight,
];

/**
 * What the memo composer is allowed to do.
 *
 * A memo is prose a lawyer signs their name to, so it gets the tools its ribbon
 * draws: headings, a face and a size, bold/italic/underline, alignment and
 * numbering. It gets no tables — the memo paper is a single column of argument,
 * and a schedule belongs in the report, not the memo — and no defined-term
 * bolding, because in a memo quotation marks mean a quotation.
 */
export const MEMO_EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    codeBlock: false,
    horizontalRule: false,
    link: { openOnClick: false, autolink: false },
  }),
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  TextStyle,
  FontFamily,
  FontSize,
  // Each part of the memo says what belongs in it while it is empty.
  Placeholder.configure({
    placeholder: ({ editor: e }) => e.view.dom.getAttribute("data-placeholder") ?? "",
  }),
];

/**
 * The faces a memo may be set in. The ribbon draws one dropdown for this, as a
 * word processor does, so a face and its size are chosen together rather than
 * as two separate controls the drawing does not have.
 */
export const MEMO_FACES = [
  {
    label: "Century Schoolbook 12",
    family: "'Century Schoolbook','New Century Schoolbook',Georgia,serif",
    size: "12pt",
  },
  { label: "Georgia 11", family: "Georgia,'Times New Roman',serif", size: "11pt" },
  { label: "Times New Roman 12", family: "'Times New Roman',Times,serif", size: "12pt" },
  { label: "Arial 11", family: "Arial,Helvetica,sans-serif", size: "11pt" },
];

/** How the alignment tool steps, in the order a writer expects. */
export const ALIGNMENTS = ["left", "center", "right", "justify"];
