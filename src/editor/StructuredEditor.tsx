/**
 * The structured document editor: the contract editor's way of working, for
 * every other document Scripta lets a lawyer write.
 *
 * Three columns, both gutters resizable: a table of contents; the toolbar and
 * the paper with one node per part; and a context panel that is one of Notes,
 * Instructions, the Redraft session, or a panel the screen brings. A part is
 * read until it is opened for editing (Edit, or double-click), then saved or
 * discarded as one act; one part is open at a time. Instructions and notes are
 * kept off the document; Scripta's proposals land on the part they change and
 * are accepted or rejected whole; each saved edit can be undone one step; and
 * See changes shows every part whose words differ from the text last accepted.
 *
 * The component is controlled: the screen owns the parts and the editing
 * record and decides where they are saved.
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { Editor as TiptapEditor } from "@tiptap/react";
import type { Extensions } from "@tiptap/core";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileText,
  Folder,
  FolderOpen,
  Italic,
  Link2,
  List,
  MessageSquare,
  Pencil,
  Plus,
  Redo2,
  Table2,
  Underline,
  Undo2,
  X,
} from "lucide-react";
import GeminiMark from "@/components/GeminiMark";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import ResizableSplitPane from "@/components/ResizableSplitPane";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RichTextEditor, RichTextView, docBlocks } from "@/wireframe/rich-text";
import { PunctuationButton, usePunctuationLens } from "@/components/PunctuationLens";
import { ReadButton, ReaderBar, useReadingId, useReadSource } from "@/components/DocReader";
import { EditorTool } from "@/wireframe/editor-tool";
import { ALIGNMENTS } from "@/wireframe/editor-extensions";
import { docToText, textToDoc, type ClauseDoc } from "@/wireframe/clause-doc";
import {
  InstructionComposer,
  InstructionSelector,
  type Instruction,
} from "@/wireframe/InstructionModals";
import InstructionsPanel from "@/wireframe/InstructionsPanel";
import PartNotesPanel from "./PartNotesPanel";
import { wordDiff } from "@/lib/parsing/word-diff";
import RedraftPanel from "./RedraftPanel";
import {
  changedPartIds,
  partChanged,
  partText,
  uid,
  type EditorMeta,
  type EditorPart,
} from "./model";
import "@/wireframe/contract-editor.css";
import "./structured-editor.css";

export type EditorFeatures = {
  tables?: boolean;
  align?: boolean;
  headings?: boolean;
  lists?: boolean;
};

export type EditorPanel = { id: string; title: string; icon: ReactNode; node: ReactNode };

export type StructuredEditorProps = {
  /** "board resolution", "letter", "memorandum", "clause draft" — for copy and for Scripta. */
  kind: string;
  title: string;
  matterId?: string | null | undefined;
  parts: EditorPart[];
  meta: EditorMeta;
  onChange: (next: { parts: EditorPart[]; meta: EditorMeta }) => void;
  extensions: Extensions;
  features?: EditorFeatures | undefined;
  boldQuotedTerms?: boolean | undefined;
  /** Class on the read view and the editing surface (memo paper vs clause). */
  bodyClassName?: string | undefined;
  storagePrefix: string;
  /** Above the first part: a cover, a title block, particulars. */
  front?: ReactNode;
  /** Below the last part: footnotes, a signature block. */
  footer?: ReactNode;
  /** Extra tools on the toolbar's right (export, citations). */
  toolbarExtras?: ReactNode;
  /** Extra context panels the screen brings, with a toolbar button each. */
  panels?: EditorPanel[] | undefined;
  defaultPanel?: string | undefined;
  /** The save state, shown on the toolbar. */
  status?: { text: string; error?: boolean } | null | undefined;
  onActiveEditor?: ((editor: TiptapEditor | null) => void) | undefined;
  onAddPart?: ((after: EditorPart | null) => void) | undefined;
  onRemovePart?: ((part: EditorPart) => void) | undefined;
  onMovePart?: ((part: EditorPart, delta: -1 | 1) => void) | undefined;
  /** Keep this part as a precedent. Absent where that makes no sense. */
  onKeepPart?: ((part: EditorPart) => void) | undefined;
  /** What a part is called: "section", "part", "clause". */
  partLabel?: string | undefined;
  tocLabel?: string | undefined;
  editableTitles?: boolean | undefined;
  emptyHint?: string | undefined;
  /**
   * A settled document. Its words and its structure are held as they are until
   * the lawyer lifts the lock; everything remains readable, exportable and
   * open to Scripta's review.
   */
  locked?: boolean | undefined;
  /**
   * What Scripta can do for a particular section. Each action writes an
   * instruction against that section and opens the redraft session, so the
   * help is aimed at the section rather than at the document in general.
   */
  partActions?: ((part: EditorPart) => { label: string; instruction: string }[]) | undefined;
  /** Told which part is selected, for tools that act on it (citations). */
  onSelect?: ((part: EditorPart | null) => void) | undefined;
  /** Rendered under a part's body: citation marks, a signature line. */
  partFooter?: ((part: EditorPart) => ReactNode) | undefined;
  /** A single-clause draft has no use for a table of contents. */
  showToc?: boolean | undefined;
  /** Put the screen's extra tools on a second toolbar row rather than the contract row. */
  extrasRow?: boolean | undefined;
  /** Which parts may be moved or deleted; the rest keep their place. */
  canReorder?: ((part: EditorPart) => boolean) | undefined;
};

type Editing = {
  partId: string;
  doc: ClauseDoc;
  dirty: boolean;
};

type Notice = { msg: string; undo?: () => void };

const nowIso = () => new Date().toISOString();

/** Word-level redline of a part against its accepted text. */
function Redline({ before, after }: { before: string; after: string }) {
  const segs = useMemo(() => wordDiff(before, after), [before, after]);
  return (
    <p>
      {segs.map((s, i) =>
        s.k === "d" ? (
          <span className="ce-delete" key={i}>
            {s.t}
          </span>
        ) : s.k === "i" ? (
          <span className="ce-insert" key={i}>
            {s.t}
          </span>
        ) : (
          <Fragment key={i}>{s.t}</Fragment>
        ),
      )}
    </p>
  );
}

export default function StructuredEditor({
  kind,
  title,
  matterId,
  parts,
  meta,
  onChange,
  extensions,
  features = {},
  boldQuotedTerms = false,
  bodyClassName,
  storagePrefix,
  front,
  footer,
  toolbarExtras,
  panels = [],
  defaultPanel,
  status,
  onActiveEditor,
  onAddPart,
  onRemovePart,
  onMovePart,
  onKeepPart,
  partLabel = "part",
  tocLabel = "TABLE OF CONTENTS",
  editableTitles = true,
  emptyHint,
  onSelect,
  locked = false,
  partActions,
  partFooter,
  showToc = true,
  extrasRow = false,
  canReorder,
}: StructuredEditorProps) {
  const [selected, setSelected] = useState<string | null>(parts[0]?.id ?? null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [editor, setEditor] = useState<TiptapEditor | null>(null);
  const [panel, setPanel] = useState<string | null>(defaultPanel ?? null);
  const [changesOnly, setChangesOnly] = useState(false);
  const [openNodes, setOpenNodes] = useState<Record<string, boolean>>({});
  const [selector, setSelector] = useState(false);
  const [deselected, setDeselected] = useState<Record<string, boolean>>({});
  const [session, setSession] = useState<Instruction[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const { confirmDelete, confirmDialog } = useConfirmDelete();
  const paper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selected && !parts.some((p) => p.id === selected)) setSelected(parts[0]?.id ?? null);
    if (!selected && parts[0]) setSelected(parts[0].id);
  }, [parts, selected]);

  useEffect(() => {
    onActiveEditor?.(editor);
  }, [editor, onActiveEditor]);
  useEffect(() => {
    onSelect?.(selected ? (parts.find((p) => p.id === selected) ?? null) : null);
    // Only the identity of the selection matters to the screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const byId = useMemo(() => new Map(parts.map((p) => [p.id, p])), [parts]);
  const current = selected ? (byId.get(selected) ?? null) : null;
  const children = useMemo(() => {
    const map = new Map<string | null, EditorPart[]>();
    for (const p of parts) {
      const key = p.parentId && byId.has(p.parentId) ? p.parentId : null;
      map.set(key, [...(map.get(key) ?? []), p]);
    }
    return map;
  }, [parts, byId]);
  const roots = children.get(null) ?? [];
  const changed = useMemo(() => changedPartIds(parts, meta), [parts, meta]);

  const label = (p: EditorPart) =>
    [p.num, p.title].filter(Boolean).join(" ") || `Untitled ${partLabel}`;
  // Read aloud goes part by part, in the order the document shows them.
  useReadSource(() => {
    const out: { id: string; label: string; text: string }[] = [];
    const walk = (p: EditorPart) => {
      const text = docBlocks(p.doc)
        .map((b) => b.text)
        .join(" ");
      const name = [p.num, p.title].filter(Boolean).join(" ");
      if (text) out.push({ id: p.id, label: name, text });
      else if (name) out.push({ id: p.id, label: "", text: `${name}.` });
      (children.get(p.id) ?? []).forEach(walk);
    };
    roots.forEach(walk);
    return out;
  });
  const anchorOf = (p: EditorPart) =>
    p.num
      ? `${partLabel.toUpperCase()} ${p.num}`
      : p.title.toUpperCase() || partLabel.toUpperCase();

  const commit = useCallback(
    (nextParts: EditorPart[], nextMeta: EditorMeta) =>
      onChange({ parts: nextParts, meta: nextMeta }),
    [onChange],
  );
  const patchMeta = (fn: (m: EditorMeta) => EditorMeta) => commit(parts, fn(meta));

  /* ------------------------------------------------------------ editing */

  const begin = (part: EditorPart) => {
    if (locked) {
      setNotice({ msg: "This document is final. Unlock it to edit." });
      return;
    }
    if (editing && editing.partId !== part.id && editing.dirty) {
      setProblem(`Save or discard the ${partLabel} you are editing before opening another.`);
      return;
    }
    setProblem(null);
    setSelected(part.id);
    setEditing({ partId: part.id, doc: part.doc, dirty: false });
  };

  const change = (doc: ClauseDoc) =>
    setEditing((e) => {
      if (!e) return e;
      const part = byId.get(e.partId);
      const dirty = !part || JSON.stringify(doc) !== JSON.stringify(part.doc);
      return { ...e, doc, dirty };
    });

  const replaceDoc = (
    part: EditorPart,
    doc: ClauseDoc,
    m: EditorMeta,
  ): [EditorPart[], EditorMeta] => {
    const before = partText(part);
    return [
      parts.map((p) => (p.id === part.id ? { ...p, doc } : p)),
      {
        ...m,
        history: { ...m.history, [part.id]: part.doc },
        baselines:
          m.baselines[part.id] === undefined ? { ...m.baselines, [part.id]: before } : m.baselines,
      },
    ];
  };

  const save = () => {
    if (!editing) return;
    const part = byId.get(editing.partId);
    if (!part) return setEditing(null);
    if (editing.dirty) {
      const [nextParts, nextMeta] = replaceDoc(part, editing.doc, meta);
      commit(nextParts, nextMeta);
    }
    setEditing(null);
    setEditor(null);
  };

  const cancel = () => {
    setEditing(null);
    setEditor(null);
  };

  const undo = () => {
    if (!current || editing) return;
    const previous = meta.history[current.id];
    if (!previous) return;
    const history = { ...meta.history };
    delete history[current.id];
    commit(
      parts.map((p) => (p.id === current.id ? { ...p, doc: previous } : p)),
      { ...meta, history },
    );
    setNotice({ msg: `Restored the text ${label(current)} had before your last edit.` });
  };

  const acceptChanges = (part: EditorPart) =>
    patchMeta((m) => ({ ...m, baselines: { ...m.baselines, [part.id]: partText(part) } }));

  /* -------------------------------------------------------- suggestions */

  const decideSuggestion = (part: EditorPart, accept: boolean) => {
    const suggestion = meta.suggestions[part.id];
    if (!suggestion) return;
    const suggestions = { ...meta.suggestions };
    delete suggestions[part.id];
    if (!accept) {
      commit(parts, { ...meta, suggestions });
      setNotice({
        msg: `Rejected the proposal on ${label(part)}.`,
        undo: () =>
          patchMeta((m) => ({ ...m, suggestions: { ...m.suggestions, [part.id]: suggestion } })),
      });
      return;
    }
    const [nextParts, nextMeta] = replaceDoc(part, textToDoc(suggestion.text), {
      ...meta,
      suggestions,
    });
    commit(nextParts, nextMeta);
    setNotice({
      msg: `Applied the proposal to ${label(part)} — undo restores the previous wording.`,
    });
  };

  /* ------------------------------------------------------- instructions */

  const instructionRows: Instruction[] = useMemo(
    () =>
      meta.instructions
        .filter((i) => byId.has(i.partId))
        .map((i) => {
          const part = byId.get(i.partId)!;
          return {
            id: i.id,
            title: part.title || label(part),
            summary: i.text,
            anchor: anchorOf(part),
            clauseId: part.id,
            scope: part.parentId ? ("clause" as const) : ("section" as const),
            on: !deselected[i.id],
          };
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [meta.instructions, byId, deselected],
  );
  const onPartAction = (part: EditorPart, text: string) => {
    addInstruction(part, text);
    setSession([
      {
        title: part.title || label(part),
        summary: text,
        anchor: anchorOf(part),
        clauseId: part.id,
        on: true,
      },
    ]);
    setPanel("redraft");
  };

  const addInstruction = (part: EditorPart, text: string) =>
    patchMeta((m) => ({
      ...m,
      instructions: [
        ...m.instructions,
        { id: uid("ins"), partId: part.id, text, createdAt: nowIso() },
      ],
    }));
  const updateInstruction = (row: Instruction, text: string) =>
    patchMeta((m) => ({
      ...m,
      instructions: m.instructions.map((i) => (i.id === row.id ? { ...i, text } : i)),
    }));
  const removeInstruction = (row: Instruction) =>
    patchMeta((m) => ({ ...m, instructions: m.instructions.filter((i) => i.id !== row.id) }));

  /* -------------------------------------------------------------- notes */

  const notes = current ? meta.notes.filter((n) => n.partId === current.id) : [];
  const addNote = (body: string) => {
    if (!current) return;
    patchMeta((m) => ({
      ...m,
      notes: [...m.notes, { id: uid("note"), partId: current.id, body, created_at: nowIso() }],
    }));
  };
  const removeNote = (id: string) =>
    patchMeta((m) => ({ ...m, notes: m.notes.filter((n) => n.id !== id) }));
  /**
   * A note is what someone thought, kept on the matter for whoever reads it
   * later. Nothing else holds it, and there is nothing to undo, so it asks.
   */
  const askRemoveNote = async (id: string) => {
    if (!(await confirmDelete({ what: "this note", archivable: false, binned: false }))) return;
    removeNote(id);
  };

  /* -------------------------------------------------------------- titles */

  const rename = (part: EditorPart, next: string) =>
    commit(
      parts.map((p) => (p.id === part.id ? { ...p, title: next } : p)),
      meta,
    );

  /* ------------------------------------------------------------- toolbar */

  const togglePanel = (id: string) => setPanel((p) => (p === id ? null : id));
  const startRedraft = () => {
    if (instructionRows.length) return setSelector(true);
    if (!current) return;
    paper.current
      ?.querySelector<HTMLButtonElement>(`[data-part="${current.id}"] .ce-instruction-button`)
      ?.click();
  };

  useEffect(() => {
    if (!selected) return;
    const node = paper.current?.querySelector<HTMLElement>(`[data-part="${selected}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const anyOpen = roots.some((p) => (children.get(p.id) ?? []).length && (openNodes[p.id] ?? true));
  const shownRoots = changesOnly
    ? roots.filter(
        (p) => changed.has(p.id) || (children.get(p.id) ?? []).some((c) => changed.has(c.id)),
      )
    : roots;

  const canUndo = !!current && !!meta.history[current.id] && !editing;
  const contextPanel: ReactNode =
    panel === "notes" ? (
      <PartNotesPanel
        clauseLabel={current ? label(current) : null}
        notes={notes.map((n) => ({ id: n.id, body: n.body, created_at: n.created_at }))}
        loading={false}
        busy={false}
        onAdd={addNote}
        onRemove={(id: string) => void askRemoveNote(id)}
        onClose={() => setPanel(null)}
      />
    ) : panel === "instructions" ? (
      <InstructionsPanel
        instructions={instructionRows}
        onUpdate={updateInstruction}
        onRemove={removeInstruction}
        onGoTo={(i) => i.clauseId && setSelected(i.clauseId)}
        onRedraft={() => setSelector(true)}
        onClose={() => setPanel(null)}
      />
    ) : panel === "redraft" && session ? (
      <RedraftPanel
        kind={kind}
        title={title}
        matterId={matterId ?? null}
        parts={parts}
        instructions={session}
        onProposals={(proposals) =>
          patchMeta((m) => ({
            ...m,
            suggestions: {
              ...m.suggestions,
              ...Object.fromEntries(
                proposals.map((p) => [
                  p.partId,
                  { text: p.text, rationale: p.rationale, at: nowIso() },
                ]),
              ),
            },
          }))
        }
        onClose={() => {
          setPanel(null);
          setSession(null);
        }}
      />
    ) : (
      (panels.find((p) => p.id === panel)?.node ?? null)
    );

  const tocAside = showToc ? (
    <aside className="ce-toc">
      <header>
        <span>{tocLabel}</span>
        <button
          type="button"
          onClick={() => setOpenNodes(Object.fromEntries(roots.map((p) => [p.id, !anyOpen])))}
        >
          {anyOpen ? "Collapse all" : "Expand all"}
        </button>
      </header>
      <nav>
        {roots.map((p) => (
          <TocRow
            key={p.id}
            part={p}
            depth={0}
            childrenOf={children}
            openNodes={openNodes}
            toggle={(id) => setOpenNodes((s) => ({ ...s, [id]: !(s[id] ?? true) }))}
            choose={setSelected}
            selected={selected}
            changed={changed}
            label={label}
          />
        ))}
        {onAddPart && (
          <button type="button" className="se-toc-add" onClick={() => onAddPart(null)}>
            + Add {partLabel}
          </button>
        )}
      </nav>
    </aside>
  ) : undefined;

  return (
    <div className="ce-editor">
      <ResizableSplitPane
        className="ce-editor-row"
        storageKey={`${storagePrefix}.toc.width`}

        side="start"
        defaultSize={260}
        minSize={190}
        maxSize={420}
        minPrimarySize={520}
        compactAt={720}
        compactMode="hidden"
        label="Resize table of contents"
        secondary={tocAside}
        primary={
          <ResizableSplitPane
            storageKey={`${storagePrefix}.context.width`}
            defaultSize={360}
            minSize={280}
            maxSize={600}
            minPrimarySize={480}
            compactAt={720}
            label="Resize context panel"
            primary={
              <main className="ce-document-column">
                <ReaderBar />
                <Toolbar
                  parts={parts}
                  editor={editor}
                  features={features}
                  canUndo={canUndo}
                  onUndo={undo}
                  notesOpen={panel === "notes"}
                  onNotes={() => togglePanel("notes")}
                  instructionsOpen={panel === "instructions"}
                  instructionCount={instructionRows.length}
                  onInstructions={() => togglePanel("instructions")}
                  changeCount={changed.size}
                  changesOnly={changesOnly}
                  onChanges={() => setChangesOnly((v) => !v)}
                  onRedraft={startRedraft}
                  panels={panels}
                  activePanel={panel}
                  onPanel={togglePanel}
                  extras={extrasRow ? null : toolbarExtras}
                  status={status ?? null}
                  partLabel={partLabel}
                />
                {extrasRow && toolbarExtras && (
                  <div className="ce-toolbar se-toolbar-extras" aria-label="Document tools">
                    {toolbarExtras}
                  </div>
                )}
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
                          const fn = notice.undo!;
                          setNotice(null);
                          fn();
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
                  {front}
                  {changesOnly && (
                    <p className="ce-changes-banner">
                      Showing only the {changed.size} {partLabel}
                      {changed.size === 1 ? "" : "s"} that carry a change or a proposal.
                    </p>
                  )}
                  {shownRoots.map((p) => (
                    <PartNode
                      {...(partActions ? { partActions, onPartAction } : {})}
                      key={p.id}
                      part={p}
                      depth={0}
                      childrenOf={children}
                      openNodes={openNodes}
                      setOpen={(id, open) => setOpenNodes((s) => ({ ...s, [id]: open }))}
                      selected={selected}
                      choose={setSelected}
                      editing={editing}
                      onBegin={begin}
                      onChange={change}
                      onEditor={setEditor}
                      onSave={save}
                      onCancel={cancel}
                      extensions={extensions}
                      bodyClassName={bodyClassName ?? ""}
                      boldQuotedTerms={boldQuotedTerms}
                      meta={meta}
                      changesOnly={changesOnly}
                      changed={changed}
                      onAcceptChanges={acceptChanges}
                      onDecide={decideSuggestion}
                      instructions={meta.instructions}
                      onAddInstruction={addInstruction}
                      onRemoveInstruction={(id) =>
                        patchMeta((m) => ({
                          ...m,
                          instructions: m.instructions.filter((i) => i.id !== id),
                        }))
                      }
                      onRename={editableTitles ? rename : null}
                      onAddPart={onAddPart}
                      onRemovePart={onRemovePart}
                      onMovePart={onMovePart}
                      onKeepPart={onKeepPart}
                      canReorder={canReorder}
                      partLabel={partLabel}
                      label={label}
                      anchorOf={anchorOf}
                      partFooter={partFooter}
                    />
                  ))}
                  {!parts.length && (
                    <div className="ce-empty">
                      {emptyHint ?? `Nothing to edit yet. Add the first ${partLabel}.`}
                      {onAddPart && (
                        <div style={{ marginTop: 10 }}>
                          <button
                            type="button"
                            className="ce-toolbar-action"
                            onClick={() => onAddPart(null)}
                          >
                            <Plus /> Add {partLabel}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  {!!parts.length && changesOnly && !shownRoots.length && (
                    <div className="ce-empty">
                      No {partLabel} carries a change yet — nothing differs from the accepted text
                      and no proposal is outstanding.
                    </div>
                  )}
                  {footer}
                </div>
              </main>
            }
            secondary={contextPanel}
          />
        }
      />
      <Dialog.Root open={selector} onOpenChange={setSelector}>
        <Dialog.Portal>
          <Dialog.Overlay className="ce-modal-overlay" />
          <Dialog.Content className="ce-modal" aria-describedby={undefined}>
            <Dialog.Title className="sr-only">Select instructions to include</Dialog.Title>
            <InstructionSelector
              instructions={instructionRows}
              toggle={(index) => {
                const id = instructionRows[index]?.id;
                if (id) setDeselected((s) => ({ ...s, [id]: !s[id] }));
              }}
              remove={(index) => {
                const row = instructionRows[index];
                if (row) removeInstruction(row);
              }}
              onStart={(chosen) => {
                setSelector(false);
                setSession(chosen);
                setPanel("redraft");
              }}
              onClose={() => setSelector(false)}
            />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {confirmDialog}
    </div>
  );
}

/* ------------------------------------------------------------ toolbar */

function Toolbar({
  editor,
  features,
  canUndo,
  onUndo,
  notesOpen,
  onNotes,
  instructionsOpen,
  instructionCount,
  onInstructions,
  changeCount,
  changesOnly,
  onChanges,
  onRedraft,
  panels,
  activePanel,
  onPanel,
  extras,
  status,
  partLabel,
  parts,
}: {
  /** Every part, for the punctuation lens's counts. */
  parts: EditorPart[];
  editor: TiptapEditor | null;
  features: EditorFeatures;
  canUndo: boolean;
  onUndo: () => void;
  notesOpen: boolean;
  onNotes: () => void;
  instructionsOpen: boolean;
  instructionCount: number;
  onInstructions: () => void;
  changeCount: number;
  changesOnly: boolean;
  onChanges: () => void;
  onRedraft: () => void;
  panels: EditorPanel[];
  activePanel: string | null;
  onPanel: (id: string) => void;
  extras: ReactNode;
  status: { text: string; error?: boolean } | null;
  partLabel: string;
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [, bump] = useState(0);
  // The toolbar shows the marks under the caret, so it redraws when the caret moves.
  useEffect(() => {
    if (!editor) return;
    const tick = () => bump((n) => n + 1);
    editor.on("transaction", tick);
    return () => {
      editor.off("transaction", tick);
    };
  }, [editor]);
  const idle = `Open a ${partLabel} to edit it before formatting — double-click its text`;
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
  const alignNow =
    ALIGNMENTS.find((a) => on("paragraph", { textAlign: a }) || on("heading", { textAlign: a })) ??
    "left";
  const alignNext = ALIGNMENTS[(ALIGNMENTS.indexOf(alignNow) + 1) % ALIGNMENTS.length]!;
  const AlignIcon =
    alignNow === "center"
      ? AlignCenter
      : alignNow === "right"
        ? AlignRight
        : alignNow === "justify"
          ? AlignJustify
          : AlignLeft;
  return (
    <div className="ce-toolbar" aria-label="Editing tools">
      <EditorTool
        title={
          canUndo
            ? `Undo the last saved edit to this ${partLabel}`
            : `Nothing to undo — undo restores the text a ${partLabel} had before you saved an edit to it`
        }
        disabled={!canUndo}
        onClick={onUndo}
      >
        <Undo2 />
      </EditorTool>
      <EditorTool
        title={`Redo is not available: one step of history is kept per ${partLabel}, and undo consumes it`}
        disabled
      >
        <Redo2 />
      </EditorTool>
      <i />
      <EditorTool
        title={editor ? "Bold" : idle}
        disabled={!editor}
        active={on("bold")}
        onClick={run((c) => c.toggleBold().run())}
      >
        <Bold />
      </EditorTool>
      <EditorTool
        title={editor ? "Italic" : idle}
        disabled={!editor}
        active={on("italic")}
        onClick={run((c) => c.toggleItalic().run())}
      >
        <Italic />
      </EditorTool>
      <EditorTool
        title={editor ? "Underline" : idle}
        disabled={!editor}
        active={on("underline")}
        onClick={run((c) => c.toggleUnderline().run())}
      >
        <Underline />
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
      {features.headings !== false && (
        <EditorTool
          title={editor ? "Heading, or back to body text" : idle}
          disabled={!editor}
          active={on("heading", { level: 3 })}
          onClick={run((c) => c.toggleHeading({ level: 3 }).run())}
        >
          <span className="ce-text-tool">T</span>
        </EditorTool>
      )}
      {features.lists !== false && (
        <EditorTool
          title={editor ? "Lettered list, for sub-paragraphs" : idle}
          disabled={!editor}
          active={on("bulletList") || on("orderedList")}
          onClick={run((c) => c.toggleOrderedList().run())}
        >
          <List />
        </EditorTool>
      )}
      {features.align && (
        <EditorTool
          title={editor ? `Align ${alignNext}` : idle}
          disabled={!editor}
          active={alignNow !== "left"}
          onClick={run((c) => c.setTextAlign(alignNext).run())}
        >
          <AlignIcon />
        </EditorTool>
      )}
      {features.tables && (
        <EditorTool
          title={editor ? "Insert a table" : idle}
          disabled={!editor}
          active={on("table")}
          onClick={run((c) => c.insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run())}
        >
          <Table2 />
        </EditorTool>
      )}
      <EditorTool
        title={`Notes on the selected ${partLabel} — kept off the document`}
        active={notesOpen}
        onClick={onNotes}
      >
        <MessageSquare />
      </EditorTool>
      {panels.map((p) => (
        <EditorTool
          key={p.id}
          title={p.title}
          active={activePanel === p.id}
          onClick={() => onPanel(p.id)}
        >
          {p.icon}
        </EditorTool>
      ))}
      <span className="ce-toolbar-space" />
      {status && (
        <span className={`se-status${status.error ? " is-error" : ""}`}>{status.text}</span>
      )}
      {extras}
      <PunctuationButton
        className="ce-toolbar-action"
        blocks={() => parts.flatMap((part) => docBlocks(part.doc))}
      />
      <button
        className={`ce-toolbar-action${instructionsOpen ? " is-active" : ""}`}
        type="button"
        onClick={onInstructions}
        title="Your instructions, kept off the document"
      >
        <ClipboardList />
        Instructions{instructionCount > 0 && <b>{instructionCount}</b>}
      </button>
      <button
        className={`ce-toolbar-action${changesOnly ? " is-active" : ""}`}
        type="button"
        onClick={onChanges}
        disabled={!changeCount && !changesOnly}
        title={
          changeCount
            ? `Show only the ${partLabel}s whose words changed since they were accepted, or that carry a proposal`
            : "Nothing has changed yet — no edit is outstanding and no proposal is waiting"
        }
      >
        <List />
        {changesOnly ? `All ${partLabel}s` : "See changes"}
        {changeCount > 0 && <b>{changeCount}</b>}
      </button>
      <button className="ce-redraft" type="button" onClick={onRedraft}>
        <GeminiMark size={16} />
        Redraft with Scripta{instructionCount > 0 && <b>{instructionCount}</b>}
      </button>
      {linkOpen && (
        <div className="ce-link-bar">
          <input
            autoFocus
            value={linkUrl}
            placeholder="https://… or leave empty to remove the link"
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyLink();
              if (e.key === "Escape") setLinkOpen(false);
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

/* ---------------------------------------------------------------- toc */

function TocRow({
  part,
  depth,
  childrenOf,
  openNodes,
  toggle,
  choose,
  selected,
  changed,
  label,
}: {
  part: EditorPart;
  depth: number;
  childrenOf: Map<string | null, EditorPart[]>;
  openNodes: Record<string, boolean>;
  toggle: (id: string) => void;
  choose: (id: string) => void;
  selected: string | null;
  changed: Set<string>;
  label: (p: EditorPart) => string;
}) {
  const kids = childrenOf.get(part.id) ?? [];
  const hasChildren = kids.length > 0;
  const open = openNodes[part.id] ?? true;
  return (
    <Fragment>
      <button
        type="button"
        className={`ce-toc-row depth-${Math.min(depth, 2)}${selected === part.id ? " is-selected" : ""}${hasChildren ? " is-parent" : ""}`}
        onClick={() => choose(part.id)}
        title={label(part)}
      >
        {depth > 0 && <em className="ce-toc-line" aria-hidden />}
        <span
          className="ce-toc-caret"
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) toggle(part.id);
          }}
        >
          {hasChildren ? (open ? "▾" : "▸") : ""}
        </span>
        {hasChildren ? (
          open ? (
            <FolderOpen className="ce-toc-icon is-folder" />
          ) : (
            <Folder className="ce-toc-icon is-folder" />
          )
        ) : (
          <FileText className="ce-toc-icon" />
        )}
        <i>{part.num}</i>
        <b>{part.title || "Untitled"}</b>
        {changed.has(part.id) && (
          <span className="ce-toc-change" title="Carries a change" aria-hidden />
        )}
      </button>
      {hasChildren &&
        open &&
        kids.map((c) => (
          <TocRow
            key={c.id}
            part={c}
            depth={depth + 1}
            childrenOf={childrenOf}
            openNodes={openNodes}
            toggle={toggle}
            choose={choose}
            selected={selected}
            changed={changed}
            label={label}
          />
        ))}
    </Fragment>
  );
}

/* --------------------------------------------------------------- node */

function PartNode({
  part,
  depth,
  childrenOf,
  openNodes,
  setOpen,
  selected,
  choose,
  editing,
  onBegin,
  onChange,
  onEditor,
  onSave,
  onCancel,
  extensions,
  bodyClassName,
  boldQuotedTerms,
  meta,
  changesOnly,
  changed,
  onAcceptChanges,
  onDecide,
  instructions,
  onAddInstruction,
  onRemoveInstruction,
  onRename,
  onAddPart,
  onRemovePart,
  onMovePart,
  onKeepPart,
  canReorder,
  partLabel,
  label,
  anchorOf,
  partFooter,
  partActions,
  onPartAction,
}: {
  partActions?: ((part: EditorPart) => { label: string; instruction: string }[]) | undefined;
  onPartAction?: ((part: EditorPart, instruction: string) => void) | undefined;
  part: EditorPart;
  depth: number;
  childrenOf: Map<string | null, EditorPart[]>;
  openNodes: Record<string, boolean>;
  setOpen: (id: string, open: boolean) => void;
  selected: string | null;
  choose: (id: string) => void;
  editing: Editing | null;
  onBegin: (part: EditorPart) => void;
  onChange: (doc: ClauseDoc) => void;
  onEditor: (editor: TiptapEditor | null) => void;
  onSave: () => void;
  onCancel: () => void;
  extensions: Extensions;
  bodyClassName: string;
  boldQuotedTerms: boolean;
  meta: EditorMeta;
  changesOnly: boolean;
  changed: Set<string>;
  onAcceptChanges: (part: EditorPart) => void;
  onDecide: (part: EditorPart, accept: boolean) => void;
  instructions: EditorMeta["instructions"];
  onAddInstruction: (part: EditorPart, text: string) => void;
  onRemoveInstruction: (id: string) => void;
  onRename: ((part: EditorPart, title: string) => void) | null;
  onAddPart: ((after: EditorPart | null) => void) | undefined;
  onRemovePart: ((part: EditorPart) => void) | undefined;
  onMovePart: ((part: EditorPart, delta: -1 | 1) => void) | undefined;
  onKeepPart: ((part: EditorPart) => void) | undefined;
  canReorder: ((part: EditorPart) => boolean) | undefined;
  partLabel: string;
  label: (p: EditorPart) => string;
  anchorOf: (p: EditorPart) => string;
  partFooter: ((part: EditorPart) => ReactNode) | undefined;
}) {
  const kids = childrenOf.get(part.id) ?? [];
  // Under the punctuation lens every part is open: a dot in a closed one would go unseen.
  const lensOn = usePunctuationLens();
  // The part being read aloud is open, and so is every part around it.
  const readingId = useReadingId();
  const holds = (p: EditorPart): boolean =>
    p.id === readingId || (childrenOf.get(p.id) ?? []).some(holds);
  const open = lensOn || (!!readingId && holds(part)) || (openNodes[part.id] ?? true);
  const isSelected = selected === part.id;
  const isEditing = editing?.partId === part.id;
  const text = partText(part);
  const suggestion = meta.suggestions[part.id];
  const own = instructions.filter((i) => i.partId === part.id);
  const rows: Instruction[] = own.map((i) => ({
    id: i.id,
    title: part.title,
    summary: i.text,
    anchor: anchorOf(part),
    clauseId: part.id,
    on: true,
  }));
  const [popover, setPopover] = useState(false);
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const baseline = meta.baselines[part.id];
  const showRedline = changesOnly && partChanged(part, meta) && baseline !== undefined;
  const shownKids = changesOnly ? kids.filter((k) => changed.has(k.id)) : kids;
  return (
    <section
      className={`ce-node depth-${Math.min(depth, 2)}${isSelected ? " is-selected" : ""}`}
      data-part={part.id}
      data-read-id={part.id}
    >
      <header
        className="ce-node-header"
        onClick={() => {
          choose(part.id);
          if (kids.length) setOpen(part.id, !open);
        }}
      >
        <button
          className="ce-node-chevron"
          type="button"
          aria-label={`${open ? "Collapse" : "Expand"} ${label(part)}`}
        >
          {open ? <ChevronDown /> : <ChevronRight />}
        </button>
        {part.num && <span className="ce-node-number">{part.num}</span>}
        {titleDraft !== null && onRename ? (
          <input
            className="se-title-input"
            autoFocus
            value={titleDraft}
            aria-label={`${partLabel} heading`}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => {
              onRename(part, titleDraft.trim());
              setTitleDraft(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setTitleDraft(null);
            }}
          />
        ) : (
          <strong
            onDoubleClick={(e) => {
              if (!onRename) return;
              e.stopPropagation();
              setTitleDraft(part.title);
            }}
            title={onRename ? "Double-click to rename" : undefined}
          >
            {part.title || `Untitled ${partLabel}`}
          </strong>
        )}
        <ReadButton id={part.id} what={label(part)} />
        {depth === 0 && kids.length > 0 && (
          <span className="ce-node-meta">
            {kids.length} SUB-{partLabel.toUpperCase()}S{!open ? " · COLLAPSED" : ""}
          </span>
        )}
        <span className="ce-node-space" />
        {changed.has(part.id) && !suggestion && <span className="se-changed-chip">CHANGED</span>}
        {isSelected && !isEditing && (
          <button
            className="ce-edit-button"
            type="button"
            title={`Edit ${label(part)} — saved as one change you can undo`}
            onClick={(e) => {
              e.stopPropagation();
              onBegin(part);
            }}
          >
            <Pencil />
            Edit
          </button>
        )}
        <Popover open={popover} onOpenChange={setPopover}>
          <PopoverTrigger asChild>
            <button
              className={`ce-instruction-button${own.length ? " has-instructions" : ""}`}
              type="button"
              aria-label={`Instructions for ${label(part)}`}
              onClick={(e) => e.stopPropagation()}
            >
              <Plus />
              {own.length > 0 && <b>{own.length}</b>}
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="right"
            align="start"
            sideOffset={8}
            className="ce-instruction-popover"
            onClick={(e) => e.stopPropagation()}
          >
            <InstructionComposer
              clauseLabel={label(part)}
              instructions={rows}
              onAdd={(t) => onAddInstruction(part, t)}
              onRemove={(row) => row.id && onRemoveInstruction(row.id)}
              onClose={() => setPopover(false)}
            />
            <div className="ce-instruction-scope">
              {own.length} instruction{own.length === 1 ? "" : "s"} held on {label(part)} · redraft
              starts from the toolbar
            </div>
          </PopoverContent>
        </Popover>
      </header>
      {open && (
        <div className="ce-node-content">
          {part.hint && isSelected && <div className="se-hint">{part.hint}</div>}
          {isSelected && partActions && onPartAction && (
            <div className="se-part-actions" role="group" aria-label="What Scripta can do here">
              {partActions(part).map((action) => (
                <button
                  key={action.label}
                  type="button"
                  className="se-part-action"
                  onClick={(event) => {
                    event.stopPropagation();
                    onPartAction(part, action.instruction);
                  }}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
          {isEditing && editing ? (
            <div className="ce-node-edit" onClick={(e) => e.stopPropagation()}>
              <RichTextEditor
                doc={editing.doc}
                text={text}
                extensions={extensions}
                className={`ce-edit-area${bodyClassName ? ` ${bodyClassName}` : ""}`}
                label={`Text of ${label(part)}`}
                autofocus
                {...(part.placeholder ? { placeholder: part.placeholder } : {})}
                onChange={onChange}
                onEditor={onEditor}
                onCancel={onCancel}
                onSave={onSave}
              />
              <div className="ce-edit-bar">
                <button
                  className="ce-edit-save"
                  type="button"
                  disabled={!editing.dirty}
                  onClick={onSave}
                >
                  Save
                </button>
                <button className="ce-edit-cancel" type="button" onClick={onCancel}>
                  {editing.dirty ? "Discard changes" : "Cancel"}
                </button>
                <span className={`ce-edit-state${editing.dirty ? " is-dirty" : ""}`}>
                  {editing.dirty ? "Unsaved changes" : "No changes yet"}
                </span>
                <span className="ce-edit-hint">⌘↵ to save · Esc to discard</span>
              </div>
            </div>
          ) : (
            <div
              className={`ce-node-body${bodyClassName ? ` ${bodyClassName}` : ""}`}
              onClick={() => choose(part.id)}
              onDoubleClick={() => onBegin(part)}
            >
              {showRedline ? (
                <Redline before={baseline} after={text} />
              ) : text ? (
                <RichTextView doc={part.doc} boldQuotedTerms={boldQuotedTerms} />
              ) : (
                <p className="se-empty-part">
                  {part.placeholder ??
                    `Nothing written in this ${partLabel} yet — double-click to write.`}
                </p>
              )}
            </div>
          )}
          {showRedline && !isEditing && (
            <button
              type="button"
              className="se-accept-changes"
              onClick={() => onAcceptChanges(part)}
            >
              Accept changes — this becomes the text further edits are compared with
            </button>
          )}
          {suggestion && !isEditing && (
            <div className="ce-suggestion" onClick={(e) => e.stopPropagation()}>
              <header>
                <GeminiMark size={14} />
                <strong>Suggested wording</strong>
                <span>AI-PROPOSED · VERIFY BEFORE RELIANCE</span>
              </header>
              <p style={{ whiteSpace: "pre-wrap" }}>{suggestion.text}</p>
              {suggestion.rationale && (
                <p style={{ color: "#6f6f6f", fontSize: 12 }}>{suggestion.rationale}</p>
              )}
              <div className="ce-suggestion-bar">
                <button
                  className="ce-suggestion-accept"
                  type="button"
                  onClick={() => onDecide(part, true)}
                >
                  <Check />
                  Accept
                </button>
                <button
                  className="ce-suggestion-reject"
                  type="button"
                  onClick={() => onDecide(part, false)}
                >
                  <X />
                  Reject
                </button>
                <span className="ce-suggestion-note">
                  Whole {partLabel} only — to take part of it, Accept and then edit.
                </span>
              </div>
            </div>
          )}
          {isSelected && !isEditing && (onAddPart || onRemovePart || onMovePart || onKeepPart) && (
            <div className="se-part-actions" onClick={(e) => e.stopPropagation()}>
              {onAddPart && (
                <button type="button" onClick={() => onAddPart(part)}>
                  + Add {partLabel} below
                </button>
              )}
              {onMovePart && (!canReorder || canReorder(part)) && (
                <>
                  <button type="button" onClick={() => onMovePart(part, -1)}>
                    Move up
                  </button>
                  <button type="button" onClick={() => onMovePart(part, 1)}>
                    Move down
                  </button>
                </>
              )}
              {onKeepPart && (
                <button type="button" onClick={() => onKeepPart(part)}>
                  Save as precedent
                </button>
              )}
              {onRemovePart && (!canReorder || canReorder(part)) && (
                <button type="button" className="is-danger" onClick={() => onRemovePart(part)}>
                  Delete {partLabel}
                </button>
              )}
            </div>
          )}
          {shownKids.length > 0 && (
            <div className="ce-node-children">
              {shownKids.map((c) => (
                <PartNode
                  key={c.id}
                  part={c}
                  depth={depth + 1}
                  childrenOf={childrenOf}
                  openNodes={openNodes}
                  setOpen={setOpen}
                  selected={selected}
                  choose={choose}
                  editing={editing}
                  onBegin={onBegin}
                  onChange={onChange}
                  onEditor={onEditor}
                  onSave={onSave}
                  onCancel={onCancel}
                  extensions={extensions}
                  bodyClassName={bodyClassName}
                  boldQuotedTerms={boldQuotedTerms}
                  meta={meta}
                  changesOnly={changesOnly}
                  changed={changed}
                  onAcceptChanges={onAcceptChanges}
                  onDecide={onDecide}
                  instructions={instructions}
                  onAddInstruction={onAddInstruction}
                  onRemoveInstruction={onRemoveInstruction}
                  onRename={onRename}
                  onAddPart={onAddPart}
                  onRemovePart={onRemovePart}
                  onKeepPart={onKeepPart}
                  onMovePart={onMovePart}
                  canReorder={canReorder}
                  partLabel={partLabel}
                  label={label}
                  anchorOf={anchorOf}
                  partFooter={partFooter}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
