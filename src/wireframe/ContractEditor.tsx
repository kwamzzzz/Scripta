import {
  Fragment,
  useEffect,
  useReducer,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CLAUSE_TAGS, tagByKey } from "@/lib/clause-tags";
import { aiProviderKind, classifyClauses, setClauseClassification } from "@/lib/analysis.functions";
import {
  Bold,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  CornerDownRight,
  FileText,
  Folder,
  FolderOpen,
  Italic,
  Link2,
  List,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Redo2,
  Table2,
  Trash2,
  Highlighter,
  Underline,
  Undo2,
  X,
  ListOrdered,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Clause } from "@/data/legal";
import { useClauseMark } from "@/review/clause-marks";
import { fetchLibrary } from "@/lib/drafting-data";
import { rebuildAmendment } from "@/lib/parsing/word-diff";
import { suggestClauseNumber } from "@/lib/clause-insert";
import {
  acceptSuggestion,
  addClauseInstruction,
  deleteClauseComment,
  importClauseInstructions,
  insertClauseAfter,
  rejectSuggestion,
  restorePriorText,
  restoreSuggestion,
  setClausePartsNumbered,
  setMatterLetterhead,
  updateClauseComment,
} from "@/lib/review.functions";
import { usePersisted } from "@/lib/use-board";
import { useNotes } from "@/lib/use-notes";
import { useApp } from "@/store/app";
import { InstructionComposer, InstructionSelector, type Instruction } from "./InstructionModals";
import { PrecedentSuggestion, PrecedentsPanel } from "./PrecedentsPanel";
import TableOfContentsNote from "./TableOfContentsNote";
import NumberingDialog from "./NumberingDialog";
import { supabase } from "@/integrations/supabase/client";
import { readFrontMatterEdits } from "@/lib/export/front-matter";
import InstructionsPanel from "./InstructionsPanel";
import ClauseNotesPanel from "./ClauseNotesPanel";
import ChangesPane from "@/components/ChangesPane";
import {
  countChangedClauses,
  filterChangedClauses,
  hasClauseChange,
} from "./contract-editor-changes";
import { instructionsFromComments, type ClauseCommentRow } from "./editor-instructions";
import { buildClauseTree, type ClauseNode } from "./contract-editor-tree";
import { WF } from "./data";
import GeminiMark from "@/components/GeminiMark";
import ResizableSplitPane from "@/components/ResizableSplitPane";
import "./contract-editor.css";
import type { Editor as TiptapEditor } from "@tiptap/react";
import type { Extensions } from "@tiptap/core";
import { useAuth } from "@/lib/auth";
import { trackedChangeExtensions, type TrackingContext } from "@/wireframe/tracked-marks";
import { sameDoc } from "@/wireframe/clause-doc";
import { useClauseActions, useTrackedClause } from "@/lib/tracked-clause";
import { RichTextEditor, RichTextView, docBlocks } from "./rich-text";
import {
  LensText,
  lensOf,
  lensSlice,
  PunctuationButton,
  usePunctuationLens,
  type Lens,
} from "@/components/PunctuationLens";
import type { Block } from "@/lib/punctuation";
import { ReadButton, ReaderBar, useReadingId, useReadSource } from "@/components/DocReader";
import type { ReadItem } from "@/lib/read-aloud";
import { EditorTool } from "./editor-tool";
import { CLAUSE_EXTENSIONS } from "./editor-extensions";
import { asDoc, docToText, textToDoc, type ClauseDoc } from "./clause-doc";

const TERM = /(“[^”]{1,60}”)/g;
const LIST = /^\(?([ivxlc]+|[a-z]|\d{1,2})[).]\s+/i;
const SMALL = new Set(["and", "of", "the", "in", "for", "to", "a", "an", "on", "or", "by", "with"]);

function titleCase(value: string) {
  if (value !== value.toUpperCase() || !/[A-Z]{3,}/.test(value)) return value;
  return value
    .toLowerCase()
    .split(/(\s+|[-/(])/)
    .map((word, index) =>
      index > 0 && SMALL.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join("");
}

function labelOf(clause: Clause) {
  const quoted = /^[“"']([^”"']+)[”"']/.exec(clause.title);
  if (quoted) return `“${quoted[1]}”`;
  if (clause.title.endsWith("…"))
    return `${clause.title.replace(/\s*…$/, "").split(/\s+/).slice(0, 6).join(" ")}…`;
  return titleCase(clause.title);
}

/** Under the punctuation lens, deleted words are drawn as they are and left out of the reading. */
function Runs({ segs, lens }: { segs: Clause["segs"]; lens?: Lens | undefined }) {
  let from = 0;
  const words = (t: string) => {
    if (!lens) return t;
    // The piece that reaches the end of the reading also draws the dots that sit there.
    const drawn = lensSlice(lens, t, from, from + t.length >= lens.length);
    from += t.length;
    return drawn;
  };
  return (
    <>
      {segs.map((segment, index) => {
        if (segment.k === "d")
          return (
            <span className="ce-delete" key={index}>
              {segment.t}
            </span>
          );
        if (segment.k === "i")
          return (
            <span className="ce-insert" key={index}>
              {words(segment.t)}
            </span>
          );
        if (lens) return <Fragment key={index}>{wordsWithTerms(segment.t, words)}</Fragment>;
        return (
          <Fragment key={index}>
            {segment.t
              .split(TERM)
              .map((part, partIndex) =>
                part.startsWith("“") && part.endsWith("”") ? (
                  <b key={partIndex}>{part}</b>
                ) : (
                  <Fragment key={partIndex}>{part}</Fragment>
                ),
              )}
          </Fragment>
        );
      })}
    </>
  );
}

/** Defined terms in bold, each piece drawn through the lens in turn. */
function wordsWithTerms(text: string, words: (t: string) => ReactNode) {
  const parts = text.split(TERM).filter(Boolean);
  return parts.map((part, partIndex) =>
    part.startsWith("“") && part.endsWith("”") ? (
      <b key={partIndex}>{words(part)}</b>
    ) : (
      <Fragment key={partIndex}>{words(part)}</Fragment>
    ),
  );
}

/** A clause's text as paragraphs of segments, and which of them are list rows. */
function clauseParagraphs(clause: Clause) {
  const paragraphs: Clause["segs"][] = [[]];
  clause.segs.forEach((segment) => {
    segment.t.split(/\n+/).forEach((part, index) => {
      if (index) paragraphs.push([]);
      if (part) paragraphs.at(-1)!.push({ ...segment, t: part });
    });
  });
  return paragraphs
    .filter((parts) => parts.some((part) => part.t.trim()))
    .map((parts) => {
      const match = LIST.exec(parts[0]!.t.trimStart());
      if (!match) return { list: null, parts };
      const first = parts[0]!;
      const rest = first.t.trimStart().slice(match[0].length);
      return { list: match[0].trim(), parts: [{ ...first, t: rest }, ...parts.slice(1)] };
    });
}

/** The words a paragraph reads as, once its deletions are accepted. */
const keptText = (parts: Clause["segs"]) =>
  parts
    .filter((segment) => segment.k !== "d")
    .map((segment) => segment.t)
    .join("");

/** Every block of a clause, as the punctuation lens reads it. */
function clauseBlocks(clause: Clause): Block[] {
  const redlined = clause.segs.some((segment) => segment.k !== "n");
  if (clause.doc && !redlined) return docBlocks(clause.doc);
  return clauseParagraphs(clause).map(({ list, parts }) => ({
    text: keptText(parts),
    kind: list ? "item" : "prose",
  }));
}

/** "Clause 3.3", or the part's own name ("Preamble", "Schedule 1"). */
const clauseName = (clause: Clause) => {
  const num = (clause.num ?? "").trim();
  return /^\d/.test(num) ? `Clause ${num}` : num;
};

/** What read aloud says for each clause, in the order the document shows them. */
function clauseReading(tree: ClauseNode[]): ReadItem[] {
  const out: ReadItem[] = [];
  const walk = (node: ClauseNode) => {
    const name = clauseName(node);
    const title = labelOf(node);
    // A heading worth saying: not the clause's opening words cut short, not its number again.
    const heading = title && !title.endsWith("…") && title !== node.num ? title : "";
    const text = node.segs.some((segment) => segment.t.trim())
      ? clauseBlocks(node)
          .map((b) => b.text)
          .join(" ")
      : "";
    const label = [name, heading].filter(Boolean).join(". ");
    if (text) out.push({ id: node.id, label, name, text });
    else if (label) out.push({ id: node.id, label: "", name, text: `${label}.` });
    node.children.forEach(walk);
  };
  tree.forEach(walk);
  return out;
}

/** Whether a clause, or one inside it, is the one being read. */
const holds = (node: ClauseNode, id: string | null): boolean =>
  !!id && (node.id === id || node.children.some((child) => holds(child, id)));

function ClauseBody({ clause }: { clause: Clause }) {
  const lensOn = usePunctuationLens();
  // A clause that has been formatted reads from its document. While it carries a
  // redline the segments win, because the tracked change is the more important
  // thing to see and only they hold it — until the two are one model.
  const redlined = clause.segs.some((segment) => segment.k !== "n");
  if (clause.doc && !redlined) return <RichTextView doc={clause.doc} boldQuotedTerms />;
  return (
    <>
      {clauseParagraphs(clause).map(({ list, parts }, index) => {
        const lens = lensOn ? lensOf(keptText(parts), list ? "item" : "prose") : undefined;
        if (!list)
          return (
            <p key={index}>
              <Runs segs={parts} lens={lens} />
            </p>
          );
        return (
          <div className="ce-list-row" key={index}>
            <span>{lensOn ? <LensText text={list} kind="cell" /> : list}</span>
            <p>
              <Runs segs={parts} lens={lens} />
            </p>
          </div>
        );
      })}
    </>
  );
}

/** Everything the document tree needs to know about the one clause being edited. */
type ClauseEditing = {
  clauseId: string | null;
  /** The clause being written, as an editor document. */
  doc: ClauseDoc | null;
  /** That document's words — what the diff engine compares. */
  draft: string;
  /** True when the words or the formatting differ from what is saved. */
  dirty: boolean;
  /** The clause editor's extensions, tracking included. */
  extensions: Extensions;
  saving: boolean;
  begin: (clause: Clause) => void;
  change: (doc: ClauseDoc) => void;
  /** The open clause reports its editor here, so the toolbar can command it. */
  setEditor: (editor: TiptapEditor | null) => void;
  save: () => void;
  cancel: () => void;
};

/**
 * Marking a clause up, in place.
 *
 * ---------------------------------------------------------------------------
 * THIS CONTROL SAYS "SAVE AS TRACKED CHANGE" AND NOW MEANS IT
 * ---------------------------------------------------------------------------
 *
 * It used to be a plain editor. Three things were wrong at once and they hid
 * each other:
 *
 *   the editor did not track, so what it produced was a document with no marks
 *   it was seeded from `clause.segs`, the shadow `save_clause_doc` never writes
 *   the save went to `editClauseText`, which wrote that shadow and not the doc
 *
 * The write to `clauses.doc` was refused by a column revoke and the result was
 * discarded, so the lawyer saw a redline that existed in one table only. That
 * refusal was the system working: an untracked document written over this
 * clause would have destroyed every outstanding proposal on it, silently, with
 * no record of whose wording had gone.
 *
 * So it tracks now, and saves the way every other document write in the
 * product does — through `save_clause_doc`, which checks that nothing is
 * introduced in another lawyer's name, that nothing is re-attributed, that
 * anything settled was the caller's to settle, and that the clause has not
 * moved since it was read.
 */
function ClauseEditor({ clause, editing }: { clause: Clause; editing: ClauseEditing }) {
  const { extensions } = editing;
  const dirty = editing.dirty;
  return (
    <div className="ce-node-edit" onClick={(event) => event.stopPropagation()}>
      <RichTextEditor
        doc={editing.doc}
        text={docToText(editing.doc ?? clause.doc ?? textToDoc(rebuildAmendment(clause.segs)))}
        extensions={extensions}
        className="ce-edit-area ce-tracked"
        label={`Text of clause ${clause.num}`}
        autofocus
        onChange={editing.change}
        onEditor={editing.setEditor}
        onCancel={editing.cancel}
        onSave={editing.save}
      />
      <div className="ce-edit-bar">
        <button
          className="ce-edit-save"
          type="button"
          disabled={!dirty || editing.saving}
          onClick={editing.save}
        >
          {editing.saving ? "Saving…" : "Save as tracked change"}
        </button>
        <button
          className="ce-edit-cancel"
          type="button"
          disabled={editing.saving}
          onClick={editing.cancel}
        >
          {dirty ? "Discard changes" : "Cancel"}
        </button>
        <span className={`ce-edit-state${dirty ? " is-dirty" : ""}`}>
          {dirty ? "Unsaved changes" : "No changes yet"}
        </span>
        <span className="ce-edit-hint">⌘↵ to save · Esc to discard</span>
      </div>
    </div>
  );
}

/** Accepting or rejecting the one proposal outstanding on a clause. */
type SuggestionDecision = {
  busyId: string | null;
  accept: (clause: Clause) => void;
  reject: (clause: Clause) => void;
};

/**
 * The AI's proposal for this clause, shown where the clause is. It is decided
 * whole: `clause_segments` records no author against a word, so there is no
 * honest way to accept half a redline. Taking part of a proposal means editing
 * the clause, which is what the Edit control is for.
 */
function ClauseSuggestion({ clause, decide }: { clause: Clause; decide: SuggestionDecision }) {
  const busy = decide.busyId === clause.id;
  return (
    <div className="ce-suggestion" onClick={(event) => event.stopPropagation()}>
      <header>
        <GeminiMark size={14} />
        <strong>Suggested language</strong>
        <span>AI-PROPOSED · VERIFY BEFORE RELIANCE</span>
      </header>
      <p>{clause.suggestedText}</p>
      <div className="ce-suggestion-bar">
        <button
          className="ce-suggestion-accept"
          type="button"
          disabled={busy}
          title={`Apply this wording to clause ${clause.num}; the change is recorded as yours`}
          onClick={() => decide.accept(clause)}
        >
          <Check />
          {busy ? "Working…" : "Accept"}
        </button>
        <button
          className="ce-suggestion-reject"
          type="button"
          disabled={busy}
          title={`Clear this proposal from clause ${clause.num}; the wording is kept on the audit trail`}
          onClick={() => decide.reject(clause)}
        >
          <X />
          Reject
        </button>
        <span className="ce-suggestion-note">
          Whole clause only — to take part of it, Accept and then edit, or edit the clause yourself.
        </span>
      </div>
    </div>
  );
}

type Tag = { label: string; tone: "law" | "practice" | "risk" | "ok" | "context"; reason?: string };
/**
 * The header tag. A research-backed classification from the analysis run
 * comes first; the playbook verdict and the recorded risk are the fallback
 * until the clause has been analysed.
 */
function recordedTag(clause: Clause): Tag | null {
  const bank = tagByKey(clause.classification);
  if (bank)
    return {
      label: bank.label,
      tone: bank.tone,
      reason: clause.classificationReason ?? bank.meaning,
    };
  const analysis = `${clause.analysis} ${clause.diff}`.toLowerCase();
  if (/mandatory law|statutory|must comply|required by law|applicable law/.test(analysis))
    return { label: "Mandatory law", tone: "law" };
  if (clause.pb?.verdict === "Consistent") return { label: "Within playbook", tone: "ok" };
  if (clause.pb) return { label: `Deviates from ${clause.pb.rule || "playbook"}`, tone: "risk" };
  if (clause.risk === "High" || clause.status === "Escalated")
    return { label: "High risk", tone: "risk" };
  if (clause.risk === "Medium" || clause.status === "For discussion")
    return { label: "Good practice", tone: "practice" };
  return null;
}

function EditorToolbar({
  count,
  panelOpen,
  canUndo,
  onUndo,
  onInstructions,
  onRedraft,
  onPrecedents,
  notesOpen,
  onNotes,
  changeCount,
  changesOnly,
  changesPanel,
  onChangesPanel,
  onChanges,
  editor,
  letterhead,
  onLetterhead,
  onNumbering,
  clauses,
}: {
  /** The contract's clauses, for the punctuation lens's counts. */
  clauses: Clause[];
  count: number;
  panelOpen: boolean;
  canUndo: boolean;
  onUndo: () => void;
  onInstructions: () => void;
  onRedraft: () => void;
  onPrecedents: () => void;
  notesOpen: boolean;
  onNotes: () => void;
  changeCount: number;
  changesOnly: boolean;
  changesPanel: boolean;
  onChangesPanel: () => void;
  onChanges: () => void;
  editor: TiptapEditor | null;
  /** Whether this contract is drafted onto the firm's paper. */
  letterhead: boolean;
  onLetterhead: (use: boolean) => void;
  /** Opens Numbering, to put right a contract numbered wrongly. */
  onNumbering: () => void;
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  // The formatting tools act on the clause that is open. With none open there is
  // nothing to format, so they say so rather than doing nothing when pressed.
  const idle = "Open a clause to edit it before formatting — double-click its text";
  const on = (name: string, attrs?: Record<string, unknown>) => !!editor?.isActive(name, attrs);
  const run = (fn: (chain: ReturnType<TiptapEditor["chain"]>) => unknown) => () => {
    if (!editor) return;
    fn(editor.chain().focus());
  };
  const applyLink = () => {
    if (!editor) return;
    const href = linkUrl.trim();
    const chain = editor.chain().focus().extendMarkRange("link");
    if (href) chain.setLink({ href }).run();
    else chain.unsetLink().run();
    setLinkOpen(false);
    setLinkUrl("");
  };
  return (
    <div className="ce-toolbar" aria-label="Contract editing tools">
      <EditorTool
        title={
          canUndo
            ? "Undo the last saved edit to this clause"
            : "Nothing to undo — undo restores the text a clause had before you saved an edit to it in this session"
        }
        disabled={!canUndo}
        onClick={onUndo}
      >
        <Undo2 />
      </EditorTool>
      <EditorTool
        title="Redo is not available: only one step of history is kept per clause, and undo consumes it"
        disabled
      >
        <Redo2 />
      </EditorTool>
      <i />
      <EditorTool
        title={editor ? "Bold" : idle}
        disabled={!editor}
        active={on("bold")}
        onClick={run((chain) => chain.toggleBold().run())}
      >
        <Bold />
      </EditorTool>
      <EditorTool
        title={editor ? "Italic" : idle}
        disabled={!editor}
        active={on("italic")}
        onClick={run((chain) => chain.toggleItalic().run())}
      >
        <Italic />
      </EditorTool>
      <EditorTool
        title={editor ? "Underline" : idle}
        disabled={!editor}
        active={on("underline")}
        onClick={run((chain) => chain.toggleUnderline().run())}
      >
        <Underline />
      </EditorTool>
      <EditorTool
        title={
          editor
            ? "Highlight the selected words, or the whole clause when nothing is selected (⌘⌥H)"
            : idle
        }
        disabled={!editor}
        active={on("highlight")}
        onClick={run((chain) =>
          // Nothing selected means the clause: "highlight this clause" is what
          // a lawyer asks for as often as "highlight these words", and the
          // alternative is making them drag across the whole body first.
          (editor?.state.selection.empty ? chain.selectAll() : chain).toggleHighlight().run(),
        )}
      >
        <Highlighter />
      </EditorTool>
      <EditorTool
        title={editor ? "Link the selected words" : idle}
        disabled={!editor}
        active={on("link") || linkOpen}
        onClick={() => {
          setLinkUrl(String(editor?.getAttributes("link")["href"] ?? ""));
          setLinkOpen((open) => !open);
        }}
      >
        <Link2 />
      </EditorTool>
      <EditorTool
        title={editor ? "Heading, or back to body text" : idle}
        disabled={!editor}
        active={on("heading", { level: 3 })}
        onClick={run((chain) => chain.toggleHeading({ level: 3 }).run())}
      >
        <span className="ce-text-tool">T</span>
      </EditorTool>
      <EditorTool
        title={editor ? "Lettered list, for sub-paragraphs" : idle}
        disabled={!editor}
        active={on("bulletList") || on("orderedList")}
        onClick={run((chain) => chain.toggleOrderedList().run())}
      >
        <List />
      </EditorTool>
      <EditorTool
        title={editor ? "Insert a table" : idle}
        disabled={!editor}
        active={on("table")}
        onClick={run((chain) => chain.insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run())}
      >
        <Table2 />
      </EditorTool>
      <EditorTool
        title="Notes on the selected clause — kept on the matter, never on the document"
        active={notesOpen}
        onClick={onNotes}
      >
        <MessageSquare />
      </EditorTool>
      <span className="ce-toolbar-space" />
      <button
        className={`ce-toolbar-action${panelOpen ? " is-active" : ""}`}
        type="button"
        onClick={onInstructions}
        aria-label="Instructions"
        title="Your instructions, kept off the document"
      >
        <ClipboardList />
        <span className="ce-toolbar-label">Instructions</span>
        {count > 0 && <b>{count}</b>}
      </button>
      {/* The paper this is being drafted onto. Here rather than only on the
          finalising screen: a draft going to the other side's counsel is not
          on the firm's letterhead, and the drafter knows that before the first
          clause, not after the last one. */}
      <button
        className={`ce-toolbar-action${letterhead ? " is-active" : ""}`}
        type="button"
        onClick={() => onLetterhead(!letterhead)}
        title={
          letterhead
            ? "This contract prints on the firm's letterhead. Click to draft it on plain pages."
            : "This contract prints on plain pages. Click to put it on the firm's letterhead."
        }
      >
        <FileText />
        <span className="ce-toolbar-label">{letterhead ? "On letterhead" : "No letterhead"}</span>
      </button>
      <button
        className={`ce-toolbar-action${changesOnly ? " is-active" : ""}`}
        type="button"
        onClick={onChanges}
        disabled={!changeCount && !changesOnly}
        title={
          changeCount
            ? "Show only the clauses that are redlined or carry an outstanding proposal"
            : "Nothing has changed yet — no clause is redlined and no proposal is outstanding"
        }
      >
        <List />
        <span className="ce-toolbar-label">{changesOnly ? "All clauses" : "See changes"}</span>
        {changeCount > 0 && <b>{changeCount}</b>}
      </button>
      {/* "See changes" filters the clause tree. This opens the pane that lists
          the outstanding proposals themselves, with who made each one. */}
      <button
        className={`ce-toolbar-action${changesPanel ? " is-active" : ""}`}
        type="button"
        onClick={onChangesPanel}
        aria-label="Changes pane"
        title="Everything outstanding on this document, and who proposed it"
      >
        <List />
        <span className="ce-toolbar-label">Changes pane</span>
      </button>
      <PunctuationButton
        className="ce-toolbar-action"
        labelClassName="ce-toolbar-label"
        blocks={() => clauses.flatMap(clauseBlocks)}
      />
      <button
        className="ce-toolbar-action"
        type="button"
        onClick={onNumbering}
        title="Renumber the contract where its own numbering is wrong"
      >
        <ListOrdered />
        <span className="ce-toolbar-label">Numbering</span>
      </button>
      <button className="ce-redraft" type="button" onClick={onRedraft}>
        <GeminiMark size={16} />
        Redraft with Scripta{count > 0 && <b>{count}</b>}
      </button>
      <EditorTool title="Open precedents" onClick={onPrecedents}>
        <MoreHorizontal />
      </EditorTool>
      {linkOpen && (
        <div className="ce-link-bar">
          <input
            autoFocus
            value={linkUrl}
            placeholder="https://… or leave empty to remove the link"
            onChange={(event) => setLinkUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") applyLink();
              if (event.key === "Escape") setLinkOpen(false);
            }}
          />
          <button type="button" onClick={applyLink}>
            {linkUrl.trim() ? "Link" : "Remove"}
          </button>
          <button type="button" onClick={() => setLinkOpen(false)}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Insert a clause after this one.
 *
 * The number is offered, not imposed: "5.2A" for a clause after 5.2, because
 * calling it 5.3 would mean renumbering everything below it and every
 * cross-reference in the contract's own prose would then be pointing at the
 * wrong provision. The field is editable for the cases the rule does not fit.
 *
 * The wording goes in as a tracked insertion, which is why the footer says so:
 * a clause that appeared as though it had always been there would be the one
 * edit in this app that arrives unannounced.
 */
function ClauseInsertButton({
  clause,
  taken,
  insert,
}: {
  clause: Clause;
  taken: string[];
  insert: (after: Clause, fields: { num: string; title: string; text: string }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [num, setNum] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const start = (next: boolean) => {
    setOpen(next);
    if (!next) return;
    setNum(suggestClauseNumber(clause.num ?? "", taken));
    setTitle("");
    setText("");
  };

  const submit = () => {
    if (busy) return;
    setBusy(true);
    void insert(clause, { num, title, text }).finally(() => {
      setBusy(false);
      setOpen(false);
    });
  };

  return (
    <Popover open={open} onOpenChange={start}>
      <PopoverTrigger asChild>
        <button
          className="ce-insert-button"
          type="button"
          title={`Insert a new clause after ${clause.num || "this one"} — numbered so nothing else moves`}
          aria-label={`Insert a clause after ${clause.num}`}
          onClick={(event) => event.stopPropagation()}
        >
          <CornerDownRight />
          Insert
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={8}
        className="ce-insert-popover"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <strong>New clause after {clause.num || "this one"}</strong>
        </header>
        <label>
          Number
          <input
            value={num}
            onChange={(event) => setNum(event.target.value)}
            placeholder="e.g. 5.2A"
            autoFocus
          />
        </label>
        <p className="ce-insert-why">
          A letter keeps every other number, and every cross-reference to it, true.
        </p>
        <label>
          Heading <i>optional</i>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Currency of payment"
          />
        </label>
        <label>
          Wording <i>optional</i>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Type the clause, or leave it empty and draft it in place."
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submit();
            }}
          />
        </label>
        <footer>
          <span>Saved as a tracked insertion</span>
          <button type="button" disabled={busy} onClick={submit}>
            {busy ? "Inserting…" : "Insert clause"}
          </button>
        </footer>
      </PopoverContent>
    </Popover>
  );
}

function ClauseInstructionButton({
  clause,
  section,
  instructions,
  add,
  remove,
}: {
  clause: Clause;
  section: boolean;
  instructions: Instruction[];
  add: (text: string) => void;
  remove: (instruction: Instruction) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`ce-instruction-button${instructions.length ? " has-instructions" : ""}`}
          type="button"
          aria-label={`Instructions for clause ${clause.num}`}
          onClick={(event) => event.stopPropagation()}
        >
          <Plus />
          {instructions.length > 0 && <b>{instructions.length}</b>}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={8}
        className="ce-instruction-popover"
        onClick={(event) => event.stopPropagation()}
      >
        <InstructionComposer
          clauseLabel={`${clause.num} ${labelOf(clause)}`}
          instructions={instructions}
          onAdd={add}
          onRemove={remove}
          onClose={() => setOpen(false)}
        />
        <div className="ce-instruction-scope">
          {instructions.length} instruction{instructions.length === 1 ? "" : "s"} held on clause{" "}
          {clause.num}
          {section ? " and every subsection beneath it" : ""} · redraft starts from the toolbar
        </div>
      </PopoverContent>
    </Popover>
  );
}

function DocumentNode({
  node,
  depth,
  defaultRootId,
  openNodes,
  setOpenNodes,
  selected,
  choose,
  instructions,
  reviewLabels,
  setReviewLabels,
  classify,
  classifyWithScripta,
  classifyingIds,
  addInstruction,
  removeInstruction,
  precedents,
  suggestion,
  editing,
  decide,
  setPartsNumbered,
  taken,
  insert,
  showNumber = true,
}: {
  node: ClauseNode;
  depth: number;
  defaultRootId: string | null;
  openNodes: Record<string, boolean>;
  setOpenNodes: Dispatch<SetStateAction<Record<string, boolean>>>;
  selected: string | null;
  choose: (id: string) => void;
  instructions: Instruction[];
  reviewLabels: Record<string, string>;
  setReviewLabels: Dispatch<SetStateAction<Record<string, string>>>;
  classify: (clause: Clause, key: string | null) => void;
  classifyWithScripta: ((clause: Clause) => void) | null;
  classifyingIds: Set<string>;
  addInstruction: (clause: Clause, text: string) => void;
  removeInstruction: (instruction: Instruction) => void;
  precedents: boolean;
  suggestion: { title: string; body: string; approved: boolean } | null;
  editing: ClauseEditing;
  decide: SuggestionDecision;
  setPartsNumbered: (clause: Clause, numbered: boolean) => void;
  /** Every number already in the document, so a new one is not offered twice. */
  taken: string[];
  insert: (after: Clause, fields: { num: string; title: string; text: string }) => Promise<void>;
  /**
   * Whether this row shows its number at all.
   *
   * A definition headed by the term it defines is headed by it here too. The
   * number is still there, still ordering the document and still carrying the
   * tree — Scripta needs it and keeps it — but a drafter who has decided their
   * definitions are not numbered should not have 1.1 in front of them all day
   * and then find it gone from the file.
   */
  showNumber?: boolean;
}) {
  const hasText = node.segs.some((segment) => segment.t.trim());
  const hasChildren = node.children.length > 0;
  // Under the punctuation lens every clause is open: a dot in a closed one would go unseen.
  const lensOn = usePunctuationLens();
  // The clause being read aloud is open, and so is every clause around it.
  const reading = holds(node, useReadingId());
  const open =
    lensOn || reading || (openNodes[node.id] ?? (depth > 0 || node.id === defaultRootId));
  const directInstructions = instructions.filter((instruction) => instruction.clauseId === node.id);
  const selectedNode = selected === node.id;
  const chosenLabel = reviewLabels[node.id];
  const chosen = tagByKey(chosenLabel);
  const tag: Tag | null = chosen
    ? { label: chosen.label, tone: chosen.tone, reason: chosen.meaning }
    : recordedTag(node);
  const toggle = () => {
    choose(node.id);
    if (hasText || hasChildren) setOpenNodes((state) => ({ ...state, [node.id]: !open }));
  };
  return (
    <section
      className={`ce-node depth-${Math.min(depth, 2)}${selectedNode ? " is-selected" : ""}`}
      data-clause={node.id}
      data-read-id={node.id}
    >
      <header className="ce-node-header" onClick={toggle}>
        <button
          className="ce-node-chevron"
          type="button"
          aria-label={`${open ? "Collapse" : "Expand"} clause ${node.num}`}
        >
          {open ? <ChevronDown /> : <ChevronRight />}
        </button>
        {showNumber && <span className="ce-node-number">{node.num}</span>}
        <strong>{labelOf(node)}</strong>
        <ReadButton id={node.id} what={clauseName(node) || labelOf(node)} />
        {depth === 0 && hasChildren && (
          <span className="ce-node-meta">
            {node.children.length} SUBSECTIONS{!open ? " · COLLAPSED" : ""}
          </span>
        )}
        <span className="ce-node-space" />
        {depth === 0 && <span className="ce-section-label">Section-level</span>}
        {/* How this section's parts are printed. Shown on the section you are
            working on, and always once it is set to something other than the
            default, so a document never hides a drafting decision it is
            carrying. Definitions are the case this exists for: many firms
            print each one headed by the term it defines rather than 1.1. */}
        {depth === 0 && hasChildren && (selectedNode || node.partsNumbered === false) && (
          <button
            type="button"
            className={`ce-parts-numbering${node.partsNumbered === false ? " is-plain" : ""}`}
            title={
              node.partsNumbered === false
                ? "Sub-clauses print headed by their titles. Click to number them."
                : "Sub-clauses print with their numbers. Click to print them headed by their titles instead."
            }
            onClick={(event) => {
              event.stopPropagation();
              setPartsNumbered(node, node.partsNumbered === false);
            }}
          >
            {node.partsNumbered === false ? "Unnumbered parts" : "Numbered parts"}
          </button>
        )}
        {(tag || (selectedNode && hasText)) && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                className={`ce-tag ${tag ? `is-${tag.tone}` : "is-unset"}`}
                type="button"
                aria-label={`Review classification for clause ${node.num}`}
                onClick={(event) => event.stopPropagation()}
              >
                {tag?.label ?? "Review basis"}
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="ce-review-popover"
              onClick={(event) => event.stopPropagation()}
            >
              <strong>
                Clause {node.num} · {tag?.label ?? "Review basis"}
              </strong>
              <p>
                {tag?.reason ||
                  node.analysis ||
                  node.pb?.detail ||
                  (classifyingIds.has(node.id)
                    ? "Scripta is reading this clause against the document, the brief and the law…"
                    : classifyWithScripta
                      ? "Not yet classified. Classification runs through the metered Lovable AI gateway on this deployment, so it waits for you."
                      : "Not yet classified. Scripta classifies clauses automatically once the document is open; you can also set it below.")}
              </p>
              {classifyWithScripta && !node.classification && !classifyingIds.has(node.id) && (
                <button
                  type="button"
                  className="ce-classify-now"
                  onClick={() => classifyWithScripta(node)}
                >
                  Classify with Scripta (uses Lovable AI credits)
                </button>
              )}
              {node.classification && node.classificationSource && (
                <small>
                  {node.classificationSource === "human"
                    ? "Set by a reviewer"
                    : "AI-proposed from the analysis run · verify before reliance"}
                </small>
              )}
              <label>
                Classification
                <select
                  value={chosenLabel ?? node.classification ?? ""}
                  onChange={(event) => classify(node, event.target.value || null)}
                >
                  <option value="">Not classified</option>
                  {CLAUSE_TAGS.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {tagByKey(chosenLabel ?? node.classification) && (
                <p className="ce-review-meaning">
                  {tagByKey(chosenLabel ?? node.classification)!.meaning}
                </p>
              )}
            </PopoverContent>
          </Popover>
        )}
        {selectedNode && hasText && editing.clauseId !== node.id && (
          <button
            className="ce-edit-button"
            type="button"
            title={`Edit clause ${node.num} — your wording is saved as a tracked change`}
            onClick={(event) => {
              event.stopPropagation();
              editing.begin(node);
            }}
          >
            <Pencil />
            Edit
          </button>
        )}
        {selectedNode && <ClauseInsertButton clause={node} taken={taken} insert={insert} />}
        <ClauseInstructionButton
          clause={node}
          section={depth === 0}
          instructions={directInstructions}
          add={(text) => addInstruction(node, text)}
          remove={removeInstruction}
        />
      </header>
      {open && (
        <div className="ce-node-content">
          {hasText &&
            (editing.clauseId === node.id ? (
              <ClauseEditor clause={node} editing={editing} />
            ) : (
              <div
                className="ce-node-body"
                onClick={() => choose(node.id)}
                onDoubleClick={() => editing.begin(node)}
              >
                <ClauseBody clause={node} />
              </div>
            ))}
          {node.suggestedText?.trim() && editing.clauseId !== node.id && (
            <ClauseSuggestion clause={node} decide={decide} />
          )}
          {precedents && selectedNode && suggestion && (
            <PrecedentSuggestion
              label={`PRECEDENT SUGGESTION · CLAUSE ${node.num}`}
              text={suggestion.body.slice(0, 400)}
              source={`FROM ${suggestion.title.toUpperCase()} · ${suggestion.approved ? "FIRM APPROVED" : "NEEDS REVIEW"}`}
              onUse={(mode) =>
                addInstruction(
                  node,
                  `${mode === "replace" ? "Replace with" : "Insert below from"} precedent: ${suggestion.title}`,
                )
              }
            />
          )}
          {node.children.length > 0 && (
            <div className="ce-node-children">
              {node.children.map((child) => (
                <DocumentNode
                  key={child.id}
                  node={child}
                  depth={depth + 1}
                  defaultRootId={defaultRootId}
                  openNodes={openNodes}
                  setOpenNodes={setOpenNodes}
                  selected={selected}
                  choose={choose}
                  instructions={instructions}
                  reviewLabels={reviewLabels}
                  setReviewLabels={setReviewLabels}
                  classify={classify}
                  classifyWithScripta={classifyWithScripta}
                  classifyingIds={classifyingIds}
                  addInstruction={addInstruction}
                  removeInstruction={removeInstruction}
                  precedents={precedents}
                  suggestion={suggestion}
                  editing={editing}
                  decide={decide}
                  setPartsNumbered={setPartsNumbered}
                  taken={taken}
                  insert={insert}
                  showNumber={node.partsNumbered !== false}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * The review marker on a navigator row: red where a critical or high issue is
 * open, amber for the rest, a hollow ring where the clause was read and nothing
 * came of it. Nothing at all before the review has run, so an unreviewed
 * document does not look like a clean one.
 */
function SeverityMark({ clauseId }: { clauseId: string }) {
  const mark = useClauseMark(clauseId);
  if (!mark) return null;
  if (!mark.severity)
    return mark.reviewed ? (
      <span
        className="ce-toc-sev is-clear"
        title="Assessed — nothing outstanding"
        aria-label="Assessed, nothing outstanding"
      />
    ) : null;
  return (
    <span
      className={`ce-toc-sev is-${mark.severity}`}
      title={`${mark.open} open ${mark.open === 1 ? "issue" : "issues"} — worst is ${mark.severity}`}
      aria-label={`${mark.open} open issues, worst is ${mark.severity}`}
    />
  );
}

/**
 * A number short enough for the contents column. Inside a schedule the
 * schedule's own row already says "Schedule 1", so its parts read "1.A" and
 * "1.A.1", as clause 2's parts read "2.1"; the full number is the tooltip.
 */
function tocNum(num: string, depth: number): string {
  const m = /^(Schedule|Annex|Appendix|Exhibit|Attachment)\s+(.+)$/.exec(num.trim());
  return m && depth > 0 ? m[2]! : num;
}

function TocNode({
  node,
  depth,
  defaultRootId,
  openNodes,
  toggle,
  choose,
  selected,
  showNumber = true,
}: {
  node: ClauseNode;
  depth: number;
  defaultRootId: string | null;
  openNodes: Record<string, boolean>;
  toggle: (id: string) => void;
  choose: (id: string) => void;
  selected: string | null;
  /** A part of an unnumbered section is listed by its title alone. */
  showNumber?: boolean;
}) {
  const hasChildren = node.children.length > 0;
  // Every top-level section is a folder, whether or not it has sub-clauses yet:
  // a section is a container by nature, and one may gain sub-clauses later.
  const folder = depth === 0 || hasChildren;
  const open = openNodes[node.id] ?? (depth > 0 || node.id === defaultRootId);
  return (
    <Fragment>
      <button
        type="button"
        className={`ce-toc-row depth-${Math.min(depth, 2)}${selected === node.id ? " is-selected" : ""}${folder ? " is-parent" : ""}`}
        onClick={() => choose(node.id)}
      >
        {depth > 0 && <em className="ce-toc-line" aria-hidden />}
        <span
          className="ce-toc-caret"
          onClick={(event) => {
            event.stopPropagation();
            if (hasChildren) toggle(node.id);
          }}
        >
          {hasChildren ? (open ? "▾" : "▸") : ""}
        </span>
        {folder ? (
          open && hasChildren ? (
            <FolderOpen className="ce-toc-icon is-folder" />
          ) : (
            <Folder className="ce-toc-icon is-folder" />
          )
        ) : (
          <FileText className="ce-toc-icon" />
        )}
        {/* "Execution" is its own name; saying it twice says nothing more. */}
        {showNumber && node.num !== labelOf(node) && (
          <i
            title={
              node.documentNum
                ? `${node.num} · numbered ${node.documentNum} in the document`
                : node.num
            }
          >
            {tocNum(node.num, depth)}
          </i>
        )}
        <b>{labelOf(node)}</b>
        {hasClauseChange(node) && (
          <span className="ce-toc-change" title="Carries a change" aria-hidden />
        )}
        <SeverityMark clauseId={node.id} />
      </button>
      {hasChildren &&
        open &&
        node.children.map((child) => (
          <TocNode
            key={child.id}
            node={child}
            depth={depth + 1}
            defaultRootId={defaultRootId}
            openNodes={openNodes}
            toggle={toggle}
            choose={choose}
            selected={selected}
            showNumber={node.partsNumbered !== false}
          />
        ))}
    </Fragment>
  );
}

export default function ContractEditor({
  onRedraft,
}: {
  onRedraft: (instructions: Instruction[]) => void;
}) {
  const { D, selClause, set, workspaceId, matterId, setActionError } = useApp();

  /**
   * What the cover page is built from: the matter's own record, and whatever
   * the lawyer has already corrected on the first page. Read here rather than
   * threaded down from the workbench so the cover is as live as the clauses.
   */
  /**
   * The front matter this document carries, if it carried one.
   *
   * The parser keeps everything above clause 1 as a "Preamble" item rather
   * than dropping it, so a contract that came in from outside already says
   * who is bound, from when and why. That wording governs; the field-by-field
   * form is for a contract being drafted from nothing.
   */
  const documentPreamble = useMemo(() => {
    const front = D.clauses.find((c) => (c.num ?? "").trim().toLowerCase() === "preamble");
    if (!front) return undefined;
    // The operative reading: what the clause says with any struck wording gone.
    const text = front.segs
      .filter((seg) => seg.k !== "d")
      .map((seg) => seg.t)
      .join("")
      .trim();
    return text || undefined;
  }, [D.clauses]);

  const coverFacts = useQuery({
    queryKey: ["cover-page", matterId],
    enabled: !!matterId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("matters")
        .select("matter_type, client, counterparty, target_date, front_matter")
        .eq("id", matterId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const row = (data ?? {}) as Record<string, unknown>;
      return {
        facts: {
          // "Other" is what a matter is called before anybody says what it is,
          // not the name of an instrument; a cover reading OTHER is worse than
          // the neutral word the lawyer can overwrite on the page.
          agreementType:
            (row["matter_type"] as string) && row["matter_type"] !== "Other"
              ? (row["matter_type"] as string)
              : "Agreement",
          client: (row["client"] as string) ?? "",
          counterparty: (row["counterparty"] as string) ?? "",
          date: (row["target_date"] as string) || "",
        },
        edits: readFrontMatterEdits(row["front_matter"]),
      };
    },
  });
  const storageKey = `px.editor.${workspaceId}.${matterId}`;
  // Instructions used to live only in this browser. They are comments on the
  // clause now; whatever an older build left behind is imported once, and is
  // still shown until that import succeeds, so nothing typed is lost.
  const [legacy, setLegacy] = usePersisted<Instruction[]>(`${storageKey}.instructions`, []);
  const [reviewLabels, setReviewLabels] = usePersisted<Record<string, string>>(
    `${storageKey}.labels`,
    {},
  );
  const [openNodes, setOpenNodes] = useState<Record<string, boolean>>({});
  const [selector, setSelector] = useState(false);
  const [precedents, setPrecedents] = useState(false);
  const [instructionsPanel, setInstructionsPanel] = useState(false);
  const paper = useRef<HTMLDivElement>(null);
  const tree = useMemo(() => buildClauseTree(D.clauses), [D.clauses]);
  useReadSource(() => clauseReading(tree));
  const current =
    D.clauses.find((clause) => clause.id === selClause) ??
    D.clauses.find((clause) => clause.segs.some((segment) => segment.t.trim())) ??
    null;
  const defaultRootId =
    tree.find(
      (node) => current && (current.num === node.num || current.num.startsWith(`${node.num}.`)),
    )?.id ??
    tree[0]?.id ??
    null;
  const isDefaultOpen = (id: string) => {
    const clause = D.clauses.find((item) => item.id === id);
    return id === defaultRootId || !!clause?.num.includes(".");
  };
  const library = useQuery({
    queryKey: ["wf-library", workspaceId],
    enabled: !!workspaceId && precedents,
    queryFn: () => fetchLibrary(workspaceId!),
  });
  const matched = (library.data ?? []).filter((item) => item.kind === "precedent" || item.approved);
  const suggestion = matched[0] ?? null;
  const precedentClauses = matched.slice(0, 8).map((item) => ({
    name: item.title,
    from: item.meta || "Precedent",
    note: item.body.slice(0, 80),
    flag: item.approved ? "Firm approved" : "Needs review",
  }));
  const choose = (id: string) => set({ selClause: id });
  const qc = useQueryClient();
  // Older builds stored the label text ("Good practice") here; only bank keys are
  // meaningful now, and a stored key is just an optimistic echo of the database.
  useEffect(() => {
    const legacy = Object.entries(reviewLabels).filter(([, value]) => value && !tagByKey(value));
    if (!legacy.length) return;
    setReviewLabels((state) => {
      const next = { ...state };
      for (const [id] of legacy) delete next[id];
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // AI first: unclassified clauses are classified in the background as soon as
  // the document is open. On the metered Lovable gateway this waits for an
  // explicit click, so credits are never spent without consent.
  const provider = useQuery({
    queryKey: ["ai-provider"],
    queryFn: () => aiProviderKind(),
    staleTime: Infinity,
  });
  const metered = provider.data?.provider === "lovable" || provider.data?.provider === null;
  const classifying = useRef(false);
  const attempted = useRef(new Set<string>());
  const [classifyingIds, setClassifyingIds] = useState<Set<string>>(new Set());
  const runClassification = async (ids: string[]) => {
    if (!matterId || classifying.current || !ids.length) return;
    classifying.current = true;
    setClassifyingIds(new Set(ids));
    try {
      for (let i = 0; i < ids.length; i += 6) {
        const batch = ids.slice(i, i + 6);
        batch.forEach((id) => attempted.current.add(id));
        const res = await classifyClauses({ data: { matterId, clauseIds: batch } });
        await qc.invalidateQueries({ queryKey: ["matter-data", matterId] });
        if (res.failed.length && !res.done.length) break;
      }
    } catch {
      /* the tag stays "Review basis"; the reviewer can classify by hand */
    } finally {
      classifying.current = false;
      setClassifyingIds(new Set());
    }
  };
  const unclassified = D.clauses.filter(
    (clause) =>
      !clause.classification &&
      clause.segs.some((segment) => segment.t.trim()) &&
      !attempted.current.has(clause.id),
  );
  useEffect(() => {
    if (provider.isLoading || metered) return;
    if (unclassified.length) void runClassification(unclassified.map((clause) => clause.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider.data, D.clauses]);
  /**
   * Classify a clause by hand, and take it back if the write is refused.
   *
   * The local label used to be written first and the rejection swallowed, so a
   * classification the server would not accept stayed on screen as the chosen
   * one. Success and failure both clear the local echo now: on success because
   * the saved value has arrived, on failure because there is nothing to echo.
   */
  const forgetLabel = (clauseId: string) =>
    setReviewLabels((state) => {
      const next = { ...state };
      delete next[clauseId];
      return next;
    });
  const classify = (clause: Clause, key: string | null) => {
    setReviewLabels((state) => ({ ...state, [clause.id]: key ?? "" }));
    if (!matterId) return;
    setActionError(null);
    void setClauseClassification({ data: { matterId, clauseId: clause.id, classification: key } })
      .then(() => qc.invalidateQueries({ queryKey: ["matter-data", matterId] }))
      .then(() => forgetLabel(clause.id))
      .catch((cause: unknown) => {
        forgetLabel(clause.id);
        setActionError(
          `Clause ${clause.num ?? ""} could not be classified. ${cause instanceof Error ? cause.message : "The change was not saved."}`
            .replace(/\s+/g, " ")
            .trim(),
        );
      });
  };
  // Editing is one clause at a time: the draft is held here, not in the tree, so
  // collapsing a section or a background refresh never throws the reviewer's
  // words away — and a failed save leaves them exactly where they were typed.
  const [draft, setDraft] = useState<{ clauseId: string; doc: ClauseDoc } | null>(null);
  // The editor of the clause that is open, so the document toolbar can drive it.
  const [activeEditor, setActiveEditor] = useState<TiptapEditor | null>(null);
  // The toolbar lives outside the editor, so it only learns that the caret moved
  // into bold text — or out of it — by listening for the editor's transactions.
  const [, onEditorMoved] = useReducer((tick: number) => tick + 1, 0);
  useEffect(() => {
    if (!activeEditor) return;
    activeEditor.on("transaction", onEditorMoved);
    return () => {
      activeEditor.off("transaction", onEditorMoved);
    };
  }, [activeEditor]);
  const [saving, setSaving] = useState(false);

  /* ---------------------------------------------------------------------
     WHO IS MARKING UP, AND IN WHICH SITTING
     ---------------------------------------------------------------------

     Held in refs and read through a getter, so the tracking plugin always
     sees the current values without the editor being rebuilt underneath the
     lawyer mid-sentence. The same arrangement `TrackedClauseEditor` uses. */
  const { user } = useAuth();
  const sitting = useRef(`s_${Date.now().toString(36)}`);
  const tracking = useRef<TrackingContext>({
    authorId: "",
    setId: sitting.current,
    enabled: false,
  });
  tracking.current = {
    authorId: user?.id ?? "",
    setId: sitting.current,
    /* No author, no tracking. Writing an unattributed change would be worse
       than refusing to track: it would go out in the redline with nobody's
       name against it. */
    enabled: !!user?.id,
  };
  const clauseExtensions = useMemo(
    () => [...CLAUSE_EXTENSIONS, ...trackedChangeExtensions(() => tracking.current)],
    [],
  );
  const [problem, setProblem] = useState<string | null>(null);
  /* Single-level history for the AI-suggestion path only. Marking a clause up
     no longer goes through it: a tracked proposal is taken back by withdrawing
     it, which is a right the lawyer already has and which leaves a record,
     where this quietly rewrote the clause from an audit row. */
  const [undoIds, setUndoIds] = useState<Record<string, string>>({});
  const restoreText = useServerFn(restorePriorText);
  // What the open clause was before it was touched, in both of the forms that
  // can differ: its words, and the document that holds their formatting.
  const openClause = draft ? D.clauses.find((item) => item.id === draft.clauseId) : undefined;

  /* The authoritative clause, read the way every other document surface reads
     it. This also primes the `tracked-clause` cache with the clause's
     `updated_at`, which is what `save_clause_doc` compares against to refuse a
     write over wording somebody changed while this draft was open. Without it
     the guard has nothing to compare and the save is unprotected. */
  const tracked = useTrackedClause(draft?.clauseId);
  const clauseActions = useClauseActions(draft?.clauseId ?? "");

  const savedDoc = tracked.data?.doc
    ? tracked.data.doc
    : openClause
      ? (openClause.doc ?? textToDoc(rebuildAmendment(openClause.segs)))
      : null;
  const draftText = draft ? docToText(draft.doc) : "";
  /* Formatting alone is a change worth saving, so the words are not the whole
     test — and the comparison is canonical, because a document that has been to
     the database comes back with its keys reordered by `jsonb` and a string
     compare would call an untouched clause dirty forever. See `sameDoc`. */
  const draftDirty = !!(draft && openClause && !sameDoc(draft.doc, savedDoc));
  const editing: ClauseEditing = {
    clauseId: draft?.clauseId ?? null,
    doc: draft?.doc ?? null,
    draft: draftText,
    dirty: draftDirty,
    extensions: clauseExtensions,
    saving,
    begin: (clause) => {
      if (draft && draft.clauseId !== clause.id) {
        // Never drop unsaved words on the floor to open another clause.
        if (openClause && draftDirty) {
          choose(openClause.id);
          setProblem(`Save or discard your changes to clause ${openClause.num} first.`);
          return;
        }
      }
      choose(clause.id);
      setProblem(null);
      /* One set id per sitting, so "accept everything Podrick did on Tuesday"
         is one decision rather than forty. */
      sitting.current = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      setDraft({
        clauseId: clause.id,
        doc: clause.doc ?? textToDoc(rebuildAmendment(clause.segs)),
      });
    },
    change: (doc) => setDraft((state) => (state ? { ...state, doc } : state)),
    setEditor: setActiveEditor,
    cancel: () => {
      setDraft(null);
      setProblem(null);
    },
    save: () => {
      if (!draft || saving) return;
      const clause = D.clauses.find((item) => item.id === draft.clauseId);
      if (!clause) return;
      if (!draftDirty) {
        setDraft(null);
        return;
      }
      setSaving(true);
      setProblem(null);
      /* Through `save_clause_doc`, like every other document write. The marks
         are already on the draft — the tracking plugin put them there as the
         lawyer typed — so the server has everything it needs to check that
         nothing is proposed in another name and nothing settled that was not
         this lawyer's to settle. A refusal keeps the draft on screen: losing a
         race must never also mean losing the sentence. */
      void clauseActions.save
        .mutateAsync(draft.doc)
        .then(async () => {
          await qc.invalidateQueries({ queryKey: ["matter-data", matterId] });
          setDraft(null);
        })
        .catch((error: unknown) =>
          setProblem(
            error instanceof Error
              ? `The clause could not be saved: ${error.message}`
              : "The clause could not be saved. Your text is still here — try again.",
          ),
        )
        .finally(() => setSaving(false));
    },
  };
  const undoId = selClause ? undoIds[selClause] : undefined;
  const undoEdit = () => {
    if (!selClause || !undoId || saving) return;
    setSaving(true);
    setProblem(null);
    void restoreText({ data: { clauseId: selClause, auditEventId: undoId } })
      .then(() => qc.invalidateQueries({ queryKey: ["matter-data", matterId] }))
      .then(() =>
        setUndoIds((state) => {
          const next = { ...state };
          delete next[selClause];
          return next;
        }),
      )
      .catch((error: unknown) =>
        setProblem(
          error instanceof Error
            ? `The edit could not be undone: ${error.message}`
            : "The edit could not be undone.",
        ),
      )
      .finally(() => setSaving(false));
  };

  const failed = (error: unknown, fallback: string) =>
    setProblem(error instanceof Error ? `${fallback}: ${error.message}` : `${fallback}.`);

  /* ---------------------------------------------------------------- */
  /* Instructions and notes: both are comments on the clause, both are */
  /* held in the database, and neither is ever put on the document.    */
  /* ---------------------------------------------------------------- */
  const clauseIds = useMemo(() => D.clauses.map((clause) => clause.id), [D.clauses]);
  const comments = useNotes(matterId, clauseIds);
  const refreshComments = () => qc.invalidateQueries({ queryKey: ["notes"] });
  const instructionClauses = useMemo(
    () =>
      D.clauses.map((clause) => {
        const basis = reviewLabels[clause.id] || clause.classification;
        return {
          id: clause.id,
          num: clause.num,
          label: labelOf(clause),
          ...(basis ? { basis } : {}),
        };
      }),
    [D.clauses, reviewLabels],
  );
  const stored = useMemo(
    () => instructionsFromComments((comments.data ?? []) as ClauseCommentRow[], instructionClauses),
    [comments.data, instructionClauses],
  );
  // Which instructions go into a redraft is a choice made in the moment, not a
  // fact about the clause, so the tick lives here rather than in the database.
  const [deselected, setDeselected] = useState<Record<string, boolean>>({});
  const instructions = useMemo(
    () =>
      [...stored, ...legacy.map((item) => ({ ...item, local: true }))].map((item) => ({
        ...item,
        on: !(item.id && deselected[item.id]),
      })),
    [stored, legacy, deselected],
  );

  const writeInstruction = useServerFn(addClauseInstruction);
  const writeInsertClause = useServerFn(insertClauseAfter);
  const amendComment = useServerFn(updateClauseComment);
  const dropComment = useServerFn(deleteClauseComment);
  const importInstructions = useServerFn(importClauseInstructions);
  const writePartsNumbered = useServerFn(setClausePartsNumbered);
  const writeLetterhead = useServerFn(setMatterLetterhead);

  /** The paper this contract is drafted onto, decided once and kept. */
  const setLetterhead = (use: boolean) => {
    if (!matterId) return;
    setProblem(null);
    void writeLetterhead({ data: { matterId, use } })
      .then(() => qc.invalidateQueries({ queryKey: ["matter-data", matterId] }))
      .catch((cause: unknown) =>
        setProblem(cause instanceof Error ? cause.message : "That letterhead change did not save."),
      );
  };

  /** A drafting convention on the section, saved as soon as it is changed. */
  const setPartsNumbered = (clause: Clause, numbered: boolean) => {
    setProblem(null);
    void writePartsNumbered({ data: { clauseId: clause.id, numbered } })
      .then(() => qc.invalidateQueries({ queryKey: ["matter-data", matterId] }))
      .catch((cause: unknown) =>
        setProblem(cause instanceof Error ? cause.message : "That numbering change did not save."),
      );
  };

  /**
   * A new clause, after the one the lawyer is looking at.
   *
   * The register makes room in one statement on the server, so it cannot be
   * left half-shifted; nothing is renumbered. The new clause opens for editing
   * straight away, because an empty clause you have to go and find is worse
   * than no button at all.
   */
  const insertClause = async (
    after: Clause,
    fields: { num: string; title: string; text: string },
  ) => {
    if (!matterId) return;
    setProblem(null);
    try {
      const made = await writeInsertClause({
        data: {
          matterId,
          afterClauseId: after.id,
          num: fields.num,
          title: fields.title,
          text: fields.text,
        },
      });
      await qc.invalidateQueries({ queryKey: ["matter-data", matterId] });
      choose(made.clauseId);
    } catch (cause) {
      failed(cause, "The clause could not be inserted");
    }
  };

  const addInstruction = (clause: Clause, text: string) => {
    const body = text.trim();
    if (!body) return;
    setProblem(null);
    void writeInstruction({ data: { clauseId: clause.id, body } })
      .then(refreshComments)
      .catch((error: unknown) => failed(error, "The instruction could not be saved"));
  };
  const updateInstruction = (instruction: Instruction, summary: string) => {
    if (instruction.local) {
      setLegacy((list) =>
        list.map((item) => (item.id === instruction.id ? { ...item, summary } : item)),
      );
      return;
    }
    if (!instruction.id) return;
    setProblem(null);
    void amendComment({ data: { commentId: instruction.id, body: summary } })
      .then(refreshComments)
      .catch((error: unknown) => failed(error, "The instruction could not be amended"));
  };
  const removeInstruction = (instruction: Instruction) => {
    if (instruction.local) {
      setLegacy((list) => list.filter((item) => item.id !== instruction.id));
      return;
    }
    if (!instruction.id) return;
    setProblem(null);
    void dropComment({ data: { commentId: instruction.id } })
      .then(refreshComments)
      .catch((error: unknown) => failed(error, "The instruction could not be deleted"));
  };

  // One-off move of anything an older build left in this browser.
  const imported = useRef(false);
  useEffect(() => {
    const items = legacy.filter((item) => item.clauseId && item.summary.trim());
    if (!matterId || imported.current || !items.length) return;
    imported.current = true;
    void importInstructions({
      data: {
        matterId,
        items: items.map((item) => ({ clauseId: item.clauseId!, body: item.summary })),
      },
    })
      .then(() => {
        setLegacy((list) => list.filter((item) => !item.clauseId || !item.summary.trim()));
        return refreshComments();
      })
      .catch(() => {
        // Left where they are and still listed, rather than quietly dropped.
        imported.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matterId, legacy.length]);

  const [notesPanel, setNotesPanel] = useState(false);
  const [changesPanel, setChangesPanel] = useState(false);
  const [numberingOpen, setNumberingOpen] = useState(false);
  /* The clause thread reads and writes itself through <Thread>, so the local
     note plumbing that used to feed this panel is gone. `comments` stays: it
     still supplies the instructions, which are the same table told apart by
     `kind`. */

  /* ---------------------------------------------------------------- */
  /* Accepting and rejecting the proposal outstanding on a clause      */
  /* ---------------------------------------------------------------- */
  const acceptSug = useServerFn(acceptSuggestion);
  const rejectSug = useServerFn(rejectSuggestion);
  const restoreSug = useServerFn(restoreSuggestion);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ msg: string; undo: (() => Promise<void>) | null } | null>(
    null,
  );
  const refreshDocument = () => qc.invalidateQueries({ queryKey: ["matter-data", matterId] });
  const decide: SuggestionDecision = {
    busyId: deciding,
    accept: (clause) => {
      const text = clause.suggestedText?.trim();
      if (!text || deciding) return;
      setDeciding(clause.id);
      setProblem(null);
      void acceptSug({ data: { clauseId: clause.id, text } })
        .then(async (result) => {
          // The redline is rebuilt server-side, so the document has to be re-read.
          await refreshDocument();
          if (result.undoId) setUndoIds((state) => ({ ...state, [clause.id]: result.undoId! }));
          setNotice({
            msg: `Suggested language applied to clause ${clause.num}.`,
            undo: result.undoId
              ? async () => {
                  await restoreText({
                    data: { clauseId: clause.id, auditEventId: result.undoId! },
                  });
                  await restoreSug({ data: { clauseId: clause.id, text } });
                  await refreshDocument();
                  setNotice(null);
                }
              : null,
          });
        })
        .catch((error: unknown) => failed(error, "The suggestion could not be applied"))
        .finally(() => setDeciding(null));
    },
    reject: (clause) => {
      const text = clause.suggestedText?.trim();
      if (!text || deciding) return;
      setDeciding(clause.id);
      setProblem(null);
      void rejectSug({ data: { clauseId: clause.id } })
        .then(async () => {
          await refreshDocument();
          setNotice({
            msg: `Proposal on clause ${clause.num} rejected. The wording stays on the audit trail.`,
            undo: async () => {
              await restoreSug({ data: { clauseId: clause.id, text } });
              await refreshDocument();
              setNotice(null);
            },
          });
        })
        .catch((error: unknown) => failed(error, "The suggestion could not be rejected"))
        .finally(() => setDeciding(null));
    },
  };

  // "See changes" narrows the document and its contents tree to the clauses
  // that are redlined or still carry a proposal, keeping the headings above them.
  const [changesOnly, setChangesOnly] = useState(false);
  const changeCount = countChangedClauses(D.clauses);
  const shownTree = useMemo(
    () => (changesOnly ? filterChangedClauses(tree) : tree),
    [changesOnly, tree],
  );
  /**
   * Where the table of contents sits: after the title page, before the
   * preamble — which is where a contract puts it. A document with no title
   * page has nothing for it to follow, so it stays at the top.
   */
  const tocAfterId = useMemo(
    () => shownTree.find((node) => (node.num ?? "").trim().toLowerCase() === "title")?.id ?? null,
    [shownTree],
  );
  const setAll = (open: boolean) =>
    setOpenNodes(Object.fromEntries(D.clauses.map((clause) => [clause.id, open])));
  const anyOpen = tree.some((node) => openNodes[node.id] ?? node.id === defaultRootId);

  useEffect(() => {
    if (!selClause && current) set({ selClause: current.id });
  }, [current, selClause, set]);
  useEffect(() => {
    paper.current
      ?.querySelector<HTMLElement>(`[data-clause="${selClause}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selClause]);

  return (
    <div data-frame="1c" className="ce-editor">
      <ResizableSplitPane
        className="ce-editor-row"
        storageKey="px.contract-editor.toc.width.v2"
        side="start"
        defaultSize={264}
        minSize={190}
        maxSize={420}
        minPrimarySize={520}
        compactAt={720}
        compactMode="hidden"
        label="Resize contract table of contents"
        secondary={
          <aside className="ce-toc">
            <header>
              <span>TABLE OF CONTENTS</span>
              <button type="button" onClick={() => setAll(!anyOpen)}>
                {anyOpen ? "Collapse all" : "Expand all"}
              </button>
            </header>
            <nav>
              {shownTree.map((node) => (
                <TocNode
                  key={node.id}
                  node={node}
                  depth={0}
                  defaultRootId={defaultRootId}
                  openNodes={openNodes}
                  toggle={(id) =>
                    setOpenNodes((state) => ({
                      ...state,
                      [id]: !(state[id] ?? isDefaultOpen(id)),
                    }))
                  }
                  choose={choose}
                  selected={selClause}
                />
              ))}
            </nav>
          </aside>
        }
        primary={
          <ResizableSplitPane
            storageKey="px.contract-editor.context.width"
            defaultSize={340}
            minSize={280}
            maxSize={560}
            minPrimarySize={480}
            compactAt={720}
            label="Resize contract guidance panel"
            primary={
              <main className="ce-document-column">
                {numberingOpen && matterId && (
                  <NumberingDialog
                    matterId={matterId}
                    clauses={D.clauses}
                    onClose={() => setNumberingOpen(false)}
                    onDone={() => {
                      void qc.invalidateQueries({ queryKey: ["matter-data", matterId] });
                      void qc.invalidateQueries({ queryKey: ["contract-review", matterId] });
                    }}
                  />
                )}
                <ReaderBar />
                <EditorToolbar
                  clauses={D.clauses}
                  onNumbering={() => setNumberingOpen(true)}
                  editor={activeEditor}
                  letterhead={D.matter.useLetterhead !== false}
                  onLetterhead={setLetterhead}
                  count={instructions.length}
                  panelOpen={instructionsPanel}
                  canUndo={!!undoId && !draft}
                  onUndo={undoEdit}
                  onInstructions={() => {
                    setInstructionsPanel((value) => !value);
                    setPrecedents(false);
                    setNotesPanel(false);
                    setChangesPanel(false);
                  }}
                  notesOpen={notesPanel}
                  onNotes={() => {
                    setNotesPanel((value) => !value);
                    setInstructionsPanel(false);
                    setPrecedents(false);
                    setChangesPanel(false);
                  }}
                  changeCount={changeCount}
                  changesOnly={changesOnly}
                  onChanges={() => setChangesOnly((value) => !value)}
                  changesPanel={changesPanel}
                  onChangesPanel={() => {
                    setChangesPanel((value) => !value);
                    setNotesPanel(false);
                    setInstructionsPanel(false);
                    setPrecedents(false);
                  }}
                  onRedraft={() => {
                    if (instructions.length) {
                      setSelector(true);
                      return;
                    }
                    if (!current) return;
                    const selectedNode = [
                      ...(paper.current?.querySelectorAll<HTMLElement>("[data-clause]") ?? []),
                    ].find((element) => element.dataset["clause"] === current.id);
                    selectedNode
                      ?.querySelector<HTMLButtonElement>(".ce-instruction-button")
                      ?.click();
                  }}
                  onPrecedents={() => {
                    setPrecedents((value) => !value);
                    setInstructionsPanel(false);
                    setNotesPanel(false);
                  }}
                />
                {problem && (
                  <p className="ce-editor-problem" role="alert">
                    {problem}
                  </p>
                )}
                {notice && (
                  <p className="ce-editor-notice" role="status">
                    {notice.msg}
                    {notice.undo && (
                      <button
                        type="button"
                        onClick={() => {
                          const undo = notice.undo!;
                          setNotice(null);
                          void undo().catch((error: unknown) =>
                            failed(error, "That could not be undone"),
                          );
                        }}
                      >
                        Undo
                      </button>
                    )}
                    <button
                      type="button"
                      className="ce-notice-dismiss"
                      aria-label="Dismiss"
                      onClick={() => setNotice(null)}
                    >
                      ×
                    </button>
                  </p>
                )}
                <div className="ce-document" ref={paper}>
                  {/*
                   * The cover page is NOT drawn here.
                   *
                   * It used to be, on the argument that a lawyer reads a
                   * contract from the top and the first thing they read should
                   * be editable where everything else is. True of the preamble,
                   * which is wording and is reviewed like any other wording —
                   * and it now sits in the clause list as a Preamble item. Not
                   * true of the cover: a blank A4 sheet with a draggable title
                   * and a letterhead behind it is typesetting, and it filled
                   * the top of the review with a page carrying no terms at all.
                   * Where the logo sits is a question for the copy that goes
                   * out, so it is asked in Final. Review stays about the words.
                   */}
                  {matterId && coverFacts.data && !tocAfterId && (
                    <TableOfContentsNote
                      matterId={matterId}
                      clauses={D.clauses}
                      onChanged={refreshDocument}
                    />
                  )}
                  {changesOnly && (
                    <p className="ce-changes-banner">
                      Showing only the {changeCount} clause{changeCount === 1 ? "" : "s"} that carry
                      a change, with the headings above them.
                    </p>
                  )}
                  {shownTree.map((node) => (
                    <Fragment key={node.id}>
                    <DocumentNode
                      node={node}
                      depth={0}
                      defaultRootId={defaultRootId}
                      openNodes={openNodes}
                      setOpenNodes={setOpenNodes}
                      selected={selClause}
                      choose={choose}
                      instructions={instructions}
                      reviewLabels={reviewLabels}
                      setReviewLabels={setReviewLabels}
                      classify={classify}
                      classifyWithScripta={
                        metered ? (clause) => void runClassification([clause.id]) : null
                      }
                      classifyingIds={classifyingIds}
                      addInstruction={addInstruction}
                      removeInstruction={removeInstruction}
                      precedents={precedents}
                      suggestion={suggestion}
                      editing={editing}
                      decide={decide}
                      setPartsNumbered={setPartsNumbered}
                      taken={D.clauses.map((c) => c.num ?? "").filter(Boolean)}
                      insert={insertClause}
                    />
                    {tocAfterId === node.id && matterId && coverFacts.data && (
                      <TableOfContentsNote
                        matterId={matterId}
                        clauses={D.clauses}
                        onChanged={refreshDocument}
                      />
                    )}
                    </Fragment>
                  ))}
                  {!!tree.length && changesOnly && !shownTree.length && (
                    <div className="ce-empty">
                      No clause carries a change yet — nothing is redlined and no proposal is
                      outstanding.
                    </div>
                  )}
                  {!tree.length && (
                    <div className="ce-empty">
                      Nothing to edit yet. Upload and parse a contract to build its clause
                      hierarchy.
                    </div>
                  )}
                </div>
              </main>
            }
            secondary={
              changesPanel ? (
                <aside className="ce-instructions-panel" aria-label="Changes">
                  <header>
                    <div>
                      <strong>Changes</strong>
                      <span>What is outstanding on this document, and whose it is</span>
                    </div>
                    <button
                      type="button"
                      aria-label="Close changes"
                      onClick={() => setChangesPanel(false)}
                    >
                      <X />
                    </button>
                  </header>
                  <div className="ce-instructions-list">
                    <ChangesPane matterId={matterId} onOpenClause={choose} />
                  </div>
                </aside>
              ) : notesPanel ? (
                <ClauseNotesPanel
                  clauseId={current?.id ?? null}
                  clauseLabel={current ? `clause ${current.num} · ${labelOf(current)}` : null}
                  workspaceId={workspaceId}
                  onClose={() => setNotesPanel(false)}
                />
              ) : instructionsPanel ? (
                <InstructionsPanel
                  instructions={instructions}
                  onUpdate={updateInstruction}
                  onRemove={removeInstruction}
                  onGoTo={(instruction) => {
                    if (instruction.clauseId) choose(instruction.clauseId);
                  }}
                  onRedraft={() => setSelector(true)}
                  onClose={() => setInstructionsPanel(false)}
                />
              ) : precedents ? (
                <PrecedentsPanel
                  matchLabel={
                    current
                      ? `Matched to clause ${current.num} · ${labelOf(current)}`
                      : "Matched to selected clause"
                  }
                  clauses={precedentClauses}
                  onClose={() => setPrecedents(false)}
                  onInsert={(precedent) => {
                    if (current)
                      addInstruction(
                        current,
                        `Insert precedent clause: ${precedent.name} (${precedent.from})`,
                      );
                    setPrecedents(false);
                  }}
                />
              ) : null
            }
          />
        }
      />
      <Dialog.Root open={selector} onOpenChange={setSelector}>
        <Dialog.Portal>
          <Dialog.Overlay className="ce-modal-overlay" />
          <Dialog.Content className="ce-modal" aria-describedby={undefined}>
            <Dialog.Title className="sr-only">Select instructions to include</Dialog.Title>
            <InstructionSelector
              instructions={instructions}
              toggle={(index) => {
                const id = instructions[index]?.id;
                if (id) setDeselected((state) => ({ ...state, [id]: !state[id] }));
              }}
              remove={(index) => {
                const item = instructions[index];
                if (item) removeInstruction(item);
              }}
              onStart={(chosen) => {
                setSelector(false);
                onRedraft(chosen);
              }}
              onClose={() => setSelector(false)}
            />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
