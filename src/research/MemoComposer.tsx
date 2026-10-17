/**
 * The memo composer: the document itself, on the shared structured editor.
 *
 * The ribbon's own tools — citations, footnotes, the citation checker, pinned
 * passages and the exports — sit on a second toolbar row, so the editor's
 * first row stays the one a lawyer already knows from the contract editor.
 */
import { useMemo, useState, type CSSProperties } from "react";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { Quote } from "lucide-react";
import { MEMO_EXTENSIONS } from "@/wireframe/editor-extensions";
import StructuredEditor from "@/editor/StructuredEditor";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import { useLocalMeta } from "@/editor/use-local-meta";
import { pruneMeta, type EditorMeta, type EditorPart } from "@/editor/model";
import { docToText, textToDoc, type ClauseDoc } from "@/wireframe/clause-doc";
import "@/wireframe/memo-editor.css";
import { buildCleanDocx } from "@/lib/export/docx";
import { docToParas } from "@/lib/export/rich-doc";
import { checkCitations, footnotesOf, uid, type ResearchState } from "@/wireframe/research-store";
import { buildCleanPdf } from "@/lib/export/pdf";
import { reportFilename } from "@/lib/export/research-report";
import { downloadBytes, DOCX_MIME, PDF_MIME } from "@/lib/export/download";

const mono = (size = 10, color = "#6f6f6f"): CSSProperties => ({
  font: `500 ${size}px 'Geist',sans-serif`,
  color,
  letterSpacing: ".06em",
});
const SERIF = "'Century Schoolbook','New Century Schoolbook',Georgia,'Times New Roman',serif";

export default function MemoComposer({
  state,
  onChange,
  onOpenAuthority,
  researchId,
  matterId,
}: {
  state: ResearchState;
  onChange: (next: ResearchState) => void;
  onOpenAuthority: (n: number) => void;
  researchId?: string | undefined;
  matterId?: string | null | undefined;
}) {
  const footnotes = useMemo(() => footnotesOf(state), [state]);
  const [issues, setIssues] = useState<string[] | null>(null);
  const [citing, setCiting] = useState(false);
  const [showingNotes, setShowingNotes] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [editor, setEditor] = useState<TiptapEditor | null>(null);
  const { confirmDelete, confirmDialog } = useConfirmDelete();
  // The memo's editing record — instructions, notes, history, accepted text —
  // stays in this browser under the research matter until the tables exist.
  const [meta, setMeta] = useLocalMeta(`px.memo-meta.${researchId ?? "draft"}`);

  const INTRO = "intro";
  const parts = useMemo<EditorPart[]>(
    () => [
      {
        id: INTRO,
        num: "",
        title: "Introduction",
        doc: state.memo.introDoc ?? textToDoc(state.memo.intro),
        placeholder: "Matter, parties and the question in one line.",
      },
      ...state.memo.sections.map((s) => ({
        id: s.id,
        num: s.no,
        title: s.title,
        doc: s.doc ?? textToDoc(s.body),
        placeholder: "Write, or insert findings and pinned passages.",
      })),
    ],
    [state.memo],
  );

  const update = (patch: Partial<ResearchState["memo"]>) =>
    onChange({ ...state, memo: { ...state.memo, ...patch } });
  const updateSection = (id: string, patch: Partial<ResearchState["memo"]["sections"][number]>) =>
    update({ sections: state.memo.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const renumber = (sections: ResearchState["memo"]["sections"]) =>
    sections.map((s, i) => ({ ...s, no: `${i + 1}` }));

  const onEditorChange = ({
    parts: next,
    meta: nextMeta,
  }: {
    parts: EditorPart[];
    meta: EditorMeta;
  }) => {
    const intro = next.find((p) => p.id === INTRO);
    const byId = new Map(state.memo.sections.map((s) => [s.id, s]));
    const sections = renumber(
      next
        .filter((p) => p.id !== INTRO)
        .map((p) => {
          const existing = byId.get(p.id);
          return {
            id: p.id,
            no: p.num,
            title: p.title,
            body: docToText(p.doc),
            cites: existing?.cites ?? [],
            doc: p.doc,
          };
        }),
    );
    update({
      ...(intro ? { intro: docToText(intro.doc), introDoc: intro.doc } : {}),
      sections,
    });
    setMeta(pruneMeta(nextMeta, next));
  };
  const addSection = (after: EditorPart | null) => {
    const created = { id: uid(), no: "", title: "New section", body: "", cites: [] };
    const sections = [...state.memo.sections];
    const index =
      after && after.id !== INTRO
        ? sections.findIndex((s) => s.id === after.id) + 1
        : sections.length;
    sections.splice(index, 0, created);
    update({ sections: renumber(sections) });
  };
  const removeSection = (part: EditorPart) => {
    if (part.id === INTRO) return;
    void (async () => {
      if (
        !(await confirmDelete({
          what: `section ${part.num} “${part.title}”`,
          consequence:
            "Its text goes with it, along with any footnote nothing else cites, and the sections after it are renumbered.",
          archivable: false,
        }))
      )
        return;
      update({ sections: renumber(state.memo.sections.filter((s) => s.id !== part.id)) });
    })();
  };
  const moveSection = (part: EditorPart, delta: -1 | 1) => {
    if (part.id === INTRO) return;
    const sections = [...state.memo.sections];
    const index = sections.findIndex((s) => s.id === part.id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= sections.length) return;
    const [moved] = sections.splice(index, 1);
    sections.splice(target, 0, moved!);
    update({ sections: renumber(sections) });
  };

  const fnNumber = (n: number) => footnotes.find((f) => f.authority === n)?.number ?? "?";
  const activeSection =
    state.memo.sections.find((s) => s.id === active) ?? state.memo.sections[0] ?? null;
  /**
   * Put the pinned passages where the writer is. While a section is open for
   * editing the words go in at the caret and reach the memo through the
   * editor's own change; otherwise they are appended to the selected section.
   */
  const insertPins = () => {
    const target = activeSection;
    if (!target || !state.pins.length) return;
    const quotes = state.pins.map((p) => `“${p.text}”`).join(" ");
    const cites = [...new Set([...target.cites, ...state.pins.map((p) => p.authority)])];
    if (editor) {
      editor.chain().focus().insertContent(quotes).run();
      updateSection(target.id, { cites });
      return;
    }
    const doc = target.doc ?? textToDoc(target.body);
    const next: ClauseDoc = {
      type: "doc",
      content: [...doc.content, { type: "paragraph", content: [{ type: "text", text: quotes }] }],
    };
    updateSection(target.id, { doc: next, body: docToText(next), cites });
  };
  const written = (
    body: string,
    doc: ClauseDoc | null | undefined,
    no: string,
    title: string,
    marker = "",
  ) => {
    const segs = [{ t: `${body}${marker}`, k: "n" as const }];
    if (!doc) return { num: no, title, segs };
    const paras = docToParas(doc);
    if (marker && paras.length) paras[paras.length - 1]!.runs.push({ t: marker, k: "n" as const });
    return { num: no, title, segs, paras };
  };
  const memoDocument = () => ({
    title: state.memo.title || "Memorandum",
    subtitle: `Memorandum · Privileged · ${state.memo.style}`,
    clauses: [
      ...(state.memo.intro ? [written(state.memo.intro, state.memo.introDoc, "", "")] : []),
      ...state.memo.sections.map((s) =>
        written(
          s.body,
          s.doc,
          s.no,
          s.title,
          s.cites.length ? ` [${s.cites.map(fnNumber).join(", ")}]` : "",
        ),
      ),
      {
        num: "",
        title: "Footnotes",
        segs: [{ t: footnotes.map((f) => `${f.number} ${f.text}`).join("\n"), k: "n" as const }],
      },
    ],
  });
  const memoName = () => state.memo.title || "memo";
  const exportDocx = () =>
    downloadBytes(
      buildCleanDocx({
        ...memoDocument(),
        author: "Scripta",
        date: new Date().toISOString(),
        numbering: "literal",
      }),
      reportFilename(memoName(), "docx"),
      DOCX_MIME,
    );
  const exportPdf = () =>
    downloadBytes(buildCleanPdf(memoDocument()), reportFilename(memoName(), "pdf"), PDF_MIME);

  const action: CSSProperties = {
    border: "1px solid #d4d4d4",
    borderRadius: 6,
    padding: "5px 10px",
    fontSize: 11.5,
    color: "#545454",
    background: "#fff",
    cursor: "pointer",
    font: "inherit",
  };

  const toolbarExtras = (
    <>
      <div style={{ position: "relative" }}>
        <button
          className={`ce-toolbar-action${citing ? " is-active" : ""}`}
          type="button"
          onClick={() => setCiting((v) => !v)}
          title={
            activeSection
              ? `Cite an authority in section ${activeSection.no}`
              : "Select a section to cite in"
          }
          disabled={!activeSection}
        >
          <Quote />
          Insert citation
        </button>
        {citing && (
          <div
            style={{
              position: "absolute",
              top: 31,
              left: 0,
              zIndex: 5,
              width: 300,
              border: "1px solid #dedede",
              borderRadius: 8,
              background: "#fff",
              boxShadow: "0 8px 24px rgba(0,0,0,.13)",
              padding: 8,
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            {(state.answer?.authorities ?? []).map((a) => (
              <button
                key={a.n}
                type="button"
                onClick={() => {
                  if (activeSection && !activeSection.cites.includes(a.n))
                    updateSection(activeSection.id, { cites: [...activeSection.cites, a.n] });
                  setCiting(false);
                }}
                style={{
                  textAlign: "left",
                  border: 0,
                  background: "transparent",
                  padding: "6px 8px",
                  borderRadius: 5,
                  fontSize: 12,
                  color: "#333",
                  cursor: "pointer",
                }}
              >
                <span style={mono(9.5, "#6b6b6b")}>[{a.n}] </span>
                {a.cite}
              </button>
            ))}
            {!state.answer?.authorities.length && (
              <div style={{ padding: "6px 8px", fontSize: 12, color: "#6f6f6f" }}>
                No authorities in this research yet.
              </div>
            )}
          </div>
        )}
      </div>
      <div style={{ position: "relative" }}>
        <button
          className={`ce-toolbar-action${showingNotes ? " is-active" : ""}`}
          type="button"
          onClick={() => setShowingNotes((v) => !v)}
          disabled={!footnotes.length}
          title={
            footnotes.length
              ? "The footnotes this memo will print"
              : "No footnotes yet — cite an authority and one appears here"
          }
        >
          Footnotes{footnotes.length > 0 && <b>{footnotes.length}</b>}
        </button>
        {showingNotes && (
          <div
            style={{
              position: "absolute",
              top: 31,
              right: 0,
              zIndex: 5,
              width: 340,
              border: "1px solid #dedede",
              borderRadius: 8,
              background: "#fff",
              boxShadow: "0 8px 24px rgba(0,0,0,.13)",
              padding: "10px 12px",
              fontFamily: SERIF,
              fontSize: 11.5,
              lineHeight: 1.7,
              color: "#545454",
            }}
          >
            {footnotes.map((f) => (
              <div key={f.number} style={{ color: f.missing ? "#c5221f" : undefined }}>
                {f.number} {f.text}
              </div>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        style={action}
        onClick={() => setIssues(checkCitations(state))}
        title="Check every citation against the authorities read"
      >
        Check citations
      </button>
      <button
        type="button"
        style={action}
        onClick={insertPins}
        disabled={!state.pins.length || !activeSection}
        title={
          state.pins.length
            ? "Insert the pinned passages into the selected section"
            : "Pin passages in the authority reader first"
        }
      >
        Insert pinned passages{state.pins.length > 0 ? ` (${state.pins.length})` : ""}
      </button>
      <label
        style={{ ...action, display: "flex", gap: 6, alignItems: "center", position: "relative" }}
      >
        {state.memo.style} <span style={{ color: "#6b6b6b" }}>▾</span>
        <select
          aria-label="Citation style"
          value={state.memo.style}
          onChange={(e) => update({ style: e.target.value as ResearchState["memo"]["style"] })}
          style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
        >
          <option>OSCOLA</option>
          <option>Bluebook</option>
          <option>Firm custom</option>
        </select>
      </label>
      <button type="button" style={action} onClick={exportDocx} title="Download as Word">
        Word
      </button>
      <button type="button" style={action} onClick={exportPdf} title="Download as PDF">
        PDF
      </button>
    </>
  );

  return (
    <div
      data-frame="4c"
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        fontSize: 13,
        color: "#232323",
        background: "#fcfcfc",
      }}
    >
      {issues && (
        <div
          role="status"
          style={{
            flex: "none",
            padding: "8px 18px",
            borderBottom: "1px solid #e8e8e8",
            background: issues.length ? "#fdf1e6" : "#e6f4ea",
            color: issues.length ? "#b4560a" : "#137333",
            fontSize: 12.5,
            lineHeight: 1.5,
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
          }}
        >
          <div style={{ flex: 1 }}>
            {issues.length
              ? issues.map((i, k) => <div key={k}>{i}</div>)
              : "Every citation matches an authority in this research."}
          </div>
          <button
            type="button"
            onClick={() => setIssues(null)}
            style={{ border: 0, background: "none", cursor: "pointer", color: "inherit" }}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}
      <StructuredEditor
        kind="research memorandum"
        title={state.memo.title || "Memorandum"}
        matterId={matterId ?? null}
        parts={parts}
        meta={meta}
        onChange={onEditorChange}
        extensions={MEMO_EXTENSIONS}
        features={{ align: true }}
        bodyClassName="memo-body"
        storagePrefix="px.memo-editor"
        partLabel="section"
        tocLabel="MEMO OUTLINE"
        onActiveEditor={setEditor}
        onSelect={(part) => setActive(part && part.id !== INTRO ? part.id : null)}
        toolbarExtras={toolbarExtras}
        onAddPart={addSection}
        onRemovePart={removeSection}
        onMovePart={moveSection}
        canReorder={(part) => part.id !== INTRO}
        extrasRow
        front={
          <div
            className="ce-node depth-0"
            style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 6 }}
          >
            <div style={mono(9.5, "#6b6b6b")}>MEMORANDUM · PRIVILEGED · {state.memo.style}</div>
            <input
              value={state.memo.title}
              onChange={(e) => update({ title: e.target.value })}
              aria-label="Memo title"
              placeholder="Title"
              style={{
                fontFamily: SERIF,
                fontSize: 19,
                color: "#232323",
                border: 0,
                outline: "none",
                background: "transparent",
                padding: 0,
              }}
            />
          </div>
        }
        partFooter={(part) => {
          const section = state.memo.sections.find((s) => s.id === part.id);
          if (!section?.cites.length) return null;
          return (
            <div
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
                padding: "0 14px 10px",
                fontSize: 11,
                color: "#6f6f6f",
              }}
            >
              <span style={mono(9.5, "#6b6b6b")}>CITES</span>
              {section.cites.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onOpenAuthority(n)}
                  title="Open authority"
                  style={{
                    color: "#333",
                    fontSize: 11,
                    border: "1px solid #dedede",
                    borderRadius: 10,
                    background: "#fff",
                    cursor: "pointer",
                    padding: "0 7px",
                  }}
                >
                  {fnNumber(n)}
                </button>
              ))}
              <button
                type="button"
                onClick={() => updateSection(section.id, { cites: [] })}
                style={{
                  border: 0,
                  background: "none",
                  color: "#6f6f6f",
                  cursor: "pointer",
                  fontSize: 11,
                }}
              >
                clear
              </button>
            </div>
          );
        }}
        footer={
          <div
            className="ce-node depth-0"
            style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 5 }}
          >
            <div style={mono(9.5, "#6b6b6b")}>FOOTNOTES</div>
            <div style={{ fontFamily: SERIF, fontSize: 11, lineHeight: 1.7, color: "#545454" }}>
              {footnotes.length ? (
                footnotes.map((f) => (
                  <div key={f.number} style={{ color: f.missing ? "#c5221f" : undefined }}>
                    {f.number} {f.text}
                  </div>
                ))
              ) : (
                <span style={{ color: "#6b6b6b" }}>
                  Footnotes are generated from the citations in each section.
                </span>
              )}
            </div>
          </div>
        }
      />
      {confirmDialog}
    </div>
  );
}
