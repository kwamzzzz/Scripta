/**
 * The editing surface, and the read-only view of a formatted document.
 *
 * Two places in Scripta let a lawyer write a document: a clause in the contract
 * editor, and a section of a research memo. They want different tools — a clause
 * has tables and defined terms, a memo has alignment and a font — but the same
 * surface underneath, so it lives here and each caller brings its own extension
 * set. Neither owns its toolbar: the toolbar commands whichever editor is open,
 * and says so by going quiet when none is.
 */
import { Fragment, type CSSProperties, type ReactNode } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import type { Extensions, JSONContent } from "@tiptap/core";
import { asDoc, textToDoc, type ClauseDoc, type DocNode } from "./clause-doc";
import { TERM } from "./editor-extensions";
import { DELETION, INSERTION } from "./tracked-change";
import { HIGHLIGHT } from "./highlight-mark";
import {
  lensDots,
  lensOf,
  lensSlice,
  usePunctuationLens,
  type Lens,
} from "@/components/PunctuationLens";
import type { Block, BlockKind } from "@/lib/punctuation";
import "./tracked.css";

/**
 * One document, open for editing.
 *
 * The editor reports itself to the screen so a toolbar outside it can drive it,
 * and hands back its document on every keystroke. The draft is held by the
 * caller rather than in here, so a background refresh cannot throw away words
 * that have not been saved.
 */
export function RichTextEditor({
  doc,
  text,
  extensions,
  onChange,
  onEditor,
  label,
  className,
  placeholder,
  autofocus,
  onCancel,
  onSave,
}: {
  doc: ClauseDoc | null;
  text: string;
  extensions: Extensions;
  onChange: (doc: ClauseDoc) => void;
  onEditor: (editor: Editor | null) => void;
  label: string;
  className: string;
  placeholder?: string;
  autofocus?: boolean;
  /** Escape discards, where the caller has something to discard to. */
  onCancel?: () => void;
  /** ⌘↵ saves, where saving is an explicit act rather than continuous. */
  onSave?: () => void;
}) {
  const editor = useEditor({
    extensions,
    // The screens are server-rendered; the editor may only build once mounted.
    immediatelyRender: false,
    // Our document type states its optional fields exactly, which the editor's
    // looser JSONContent does not; the shapes are otherwise identical.
    content: (doc ?? textToDoc(text)) as JSONContent,
    ...(autofocus ? { autofocus: "end" as const } : {}),
    editorProps: {
      attributes: {
        class: className,
        "aria-label": label,
        role: "textbox",
        ...(placeholder ? { "data-placeholder": placeholder } : {}),
      },
      handleKeyDown: (_view, event) => {
        if (onCancel && event.key === "Escape") {
          onCancel();
          return true;
        }
        if (onSave && event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          onSave();
          return true;
        }
        return false;
      },
    },
    // A screen with one editor, opened deliberately, claims the toolbar as soon
    // as it exists. A screen with many — the memo has one per section — must
    // wait to be written in, or the toolbar would command an arbitrary one.
    onCreate: ({ editor: made }) => {
      if (autofocus) onEditor(made);
    },
    onFocus: ({ editor: focused }) => onEditor(focused),
    onUpdate: ({ editor: changed }) => onChange(changed.getJSON() as ClauseDoc),
    onDestroy: () => onEditor(null),
  });
  return <EditorContent editor={editor} />;
}

/* ------------------------------------------------------------------ */
/* Reading a formatted document                                        */
/* ------------------------------------------------------------------ */

/** The inline styling a run carries: a chosen face, a chosen size. */
function styleOf(node: DocNode): CSSProperties | undefined {
  const style = (node.marks ?? []).find((mark) => mark.type === "textStyle")?.attrs;
  if (!style) return undefined;
  const out: CSSProperties = {};
  if (style["fontFamily"]) out.fontFamily = String(style["fontFamily"]);
  if (style["fontSize"]) out.fontSize = String(style["fontSize"]);
  return Object.keys(out).length ? out : undefined;
}

/** Under the punctuation lens: the block's scan, and where this run starts in it. */
type LensAt = { lens: Lens; from: number; last: boolean };

/** Wrap a run of text in whatever marks it carries. */
function marked(node: DocNode, key: number, boldQuotedTerms: boolean, at?: LensAt): ReactNode {
  const text = node.text ?? "";
  // A piece of the run, starting `offset` into it: drawn with its marks when the lens is on.
  const words = (piece: string, offset: number, lastPiece: boolean): ReactNode =>
    at ? lensSlice(at.lens, piece, at.from + offset, at.last && lastPiece) : piece;
  // In a contract, a term in quotation marks is a defined term and reads as
  // bold even where nobody formatted it. In a memo, quotation marks mean a
  // quotation, so the same treatment would be wrong.
  const plain =
    boldQuotedTerms && !node.marks?.length ? (
      <>
        {(() => {
          const parts = text.split(TERM);
          let offset = 0;
          return parts.map((part, i) => {
            const drawn = words(part, offset, i === parts.length - 1);
            offset += part.length;
            return part.startsWith("“") && part.endsWith("”") ? (
              <b key={i}>{drawn}</b>
            ) : (
              <Fragment key={i}>{drawn}</Fragment>
            );
          });
        })()}
      </>
    ) : (
      words(text, 0, true)
    );
  let out: ReactNode = plain;
  for (const mark of node.marks ?? []) {
    if (mark.type === "bold") out = <b>{out}</b>;
    else if (mark.type === "italic") out = <i>{out}</i>;
    else if (mark.type === "underline") out = <u>{out}</u>;
    else if (mark.type === "strike") out = <s>{out}</s>;
    else if (mark.type === INSERTION) out = <ins className="tc-ins">{out}</ins>;
    else if (mark.type === DELETION) out = <del className="tc-del">{out}</del>;
    else if (mark.type === HIGHLIGHT) out = <mark className="tc-hl">{out}</mark>;
    else if (mark.type === "link")
      out = (
        <a href={String(mark.attrs?.["href"] ?? "")} target="_blank" rel="noreferrer">
          {out}
        </a>
      );
  }
  const style = styleOf(node);
  if (style) out = <span style={style}>{out}</span>;
  return <Fragment key={key}>{out}</Fragment>;
}

/** How a block is aligned, when anything set it. */
function alignOf(node: DocNode): CSSProperties | undefined {
  const align = node.attrs?.["textAlign"];
  return align ? { textAlign: String(align) as CSSProperties["textAlign"] } : undefined;
}

/** The words of a block's inline content, as the lens reads them: a line break is a newline. */
const inlineText = (nodes: DocNode[] | undefined): string =>
  (nodes ?? []).map((node) => (node.type === "hardBreak" ? "\n" : (node.text ?? ""))).join("");

/** How the lens reads a block, from what it sits in. */
type Within = "body" | "item" | "cell";
const kindOf = (node: DocNode, within: Within): BlockKind =>
  node.type === "heading"
    ? "heading"
    : within === "item"
      ? "item"
      : within === "cell"
        ? "cell"
        : "prose";

/** Every block of text in a document, for counting what the lens will show. */
export function docBlocks(doc: unknown): Block[] {
  const parsed = asDoc(doc);
  const out: Block[] = [];
  const walk = (node: DocNode, within: Within) => {
    if (node.type === "paragraph" || node.type === "heading") {
      out.push({ text: inlineText(node.content), kind: kindOf(node, within) });
      return;
    }
    const inner: Within =
      node.type === "listItem"
        ? "item"
        : node.type === "tableCell" || node.type === "tableHeader"
          ? "cell"
          : within;
    for (const child of node.content ?? []) walk(child, inner);
  };
  for (const node of parsed?.content ?? []) walk(node, "body");
  return out;
}

/** A walker over the document, so a formatted document can be read without an editor. */
function makeBlock(boldQuotedTerms: boolean, lens: boolean) {
  const inline = (nodes: DocNode[] | undefined, kind: BlockKind): ReactNode => {
    if (!lens)
      return (nodes ?? []).map((node, i) =>
        node.type === "hardBreak" ? <br key={i} /> : marked(node, i, boldQuotedTerms),
      );
    const text = inlineText(nodes);
    const scan = lensOf(text, kind);
    const list = nodes ?? [];
    let from = 0;
    const drawn = list.map((node, i) => {
      const last = i === list.length - 1;
      if (node.type === "hardBreak") {
        const dots = lensDots(scan, from);
        from += 1;
        return (
          <Fragment key={i}>
            {dots}
            <br />
            {last ? lensDots(scan, from) : null}
          </Fragment>
        );
      }
      const out = marked(node, i, boldQuotedTerms, { lens: scan, from, last });
      from += (node.text ?? "").length;
      return out;
    });
    // An empty block can still be missing nothing; one with no runs has no place to draw.
    return list.length ? drawn : null;
  };
  const block = (node: DocNode, key: number, within: Within = "body"): ReactNode => {
    const style = alignOf(node);
    const children = (inner: Within) =>
      (node.content ?? []).map((child, i) => block(child, i, inner));
    switch (node.type) {
      case "paragraph":
        return (
          <p key={key} style={style}>
            {inline(node.content, kindOf(node, within))}
          </p>
        );
      case "heading": {
        const level = Number(node.attrs?.["level"] ?? 2);
        const Tag = (level === 1 ? "h3" : level === 2 ? "h4" : "h5") as "h3" | "h4" | "h5";
        return (
          <Tag key={key} style={style}>
            {inline(node.content, "heading")}
          </Tag>
        );
      }
      case "bulletList":
        return <ul key={key}>{children(within)}</ul>;
      case "orderedList":
        return <ol key={key}>{children(within)}</ol>;
      case "listItem":
        return <li key={key}>{children("item")}</li>;
      case "blockquote":
        return <blockquote key={key}>{children(within)}</blockquote>;
      case "table":
        return (
          <table key={key} className="ce-doc-table">
            <tbody>{children(within)}</tbody>
          </table>
        );
      case "tableRow":
        return <tr key={key}>{children(within)}</tr>;
      case "tableHeader":
        return <th key={key}>{children("cell")}</th>;
      case "tableCell":
        return <td key={key}>{children("cell")}</td>;
      default:
        return node.content ? <Fragment key={key}>{children(within)}</Fragment> : null;
    }
  };
  return block;
}

const clauseBlock = makeBlock(true, false);
const proseBlock = makeBlock(false, false);
const clauseLensBlock = makeBlock(true, true);
const proseLensBlock = makeBlock(false, true);

/** A formatted document, as it reads when nobody is editing it. */
export function RichTextView({
  doc,
  boldQuotedTerms = false,
}: {
  doc: unknown;
  boldQuotedTerms?: boolean;
}) {
  const lens = usePunctuationLens();
  const parsed = asDoc(doc);
  if (!parsed) return null;
  const block = lens
    ? boldQuotedTerms
      ? clauseLensBlock
      : proseLensBlock
    : boldQuotedTerms
      ? clauseBlock
      : proseBlock;
  return <>{parsed.content.map((node, i) => block(node, i))}</>;
}
