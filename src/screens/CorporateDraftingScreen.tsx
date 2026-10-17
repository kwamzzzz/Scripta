/**
 * Corporate Drafting: board resolutions and letters, written the way the
 * contract editor works. The document is parts on paper — recitals and
 * resolutions, or a letter's body and purpose — each formatted, edited one at
 * a time and saved as a change that can be undone; instructions and notes sit
 * off the document; Scripta proposes wording to accept or reject; the
 * particulars (company, date, addresses, signatory) sit above the parts as the
 * front of the document; the preview and downloads open in a side panel.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import LetterheadManager from "@/components/LetterheadManager";
import { BookOpen, Building2, ClipboardCheck, Eye, Plus, Trash2 } from "lucide-react";
import AppShell, { Crumbs } from "@/components/AppShell";
import DocumentPreview from "@/components/DocumentPreview";
import { Button } from "@/components/primitives";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import StructuredEditor from "@/editor/StructuredEditor";
import FinalStage from "@/components/FinalStage";
import { partText, pruneMeta, type EditorMeta, type EditorPart } from "@/editor/model";
import { reviewCorporateDocument } from "@/lib/corporate/review";
import {
  PreflightList,
  blocking,
  preflightSummary,
  type PreflightItem,
} from "@/components/Preflight";
import {
  corporateExportSpec,
  isLocked,
  setCorporateStage,
  STAGE_LABEL,
  CORPORATE_STAGES,
  type CorporateStage,
  createCorporateDocument,
  listCorporateDocuments,
  newCorporatePart,
  renumberCorporateParts,
  updateCorporateDocument,
  type CorporateContentV2,
  type CorporateDocument,
  KIND_LABEL,
  type CorporateDocumentKind,
  type CorporateGroup,
} from "@/lib/corporate-documents";
import { exportCorporateDocument } from "@/lib/corporate-exports.functions";
import { downloadBytes } from "@/lib/export/download";
import { HOUSE_STRUCTURE } from "@/lib/house-style";
import { CLAUSE_EXTENSIONS } from "@/wireframe/editor-extensions";
import { listLetterheads } from "@/lib/letterheads";
import { C, radius } from "@/lib/tokens";
import { moveToBin } from "@/lib/trash";
import { useApp } from "@/store/app";
import { useSavePrecedent } from "@/components/SavePrecedent";

const input: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: `1px solid ${C.border}`,
  borderRadius: radius.md,
  background: C.panel,
  color: C.text,
  font: "inherit",
  fontSize: 13,
  padding: "7px 10px",
};

const labelStyle: CSSProperties = {
  display: "block",
  color: C.text,
  fontSize: 12,
  fontWeight: 600,
  marginBottom: 4,
};

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
  rows = 2,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  hint?: string | undefined;
}) {
  return (
    <label style={{ display: "block", minWidth: 0 }}>
      <span style={labelStyle}>{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={rows}
          style={{ ...input, resize: "vertical", lineHeight: 1.55 }}
        />
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          style={input}
        />
      )}
      {hint && (
        <span
          style={{
            display: "block",
            color: C.muted,
            fontSize: 11.5,
            lineHeight: 1.5,
            marginTop: 4,
          }}
        >
          {hint}
        </span>
      )}
    </label>
  );
}

const note = (kind: CorporateDocumentKind, part: string) =>
  HOUSE_STRUCTURE[kind === "letter" ? "letter" : "resolution"].find((item) => item.part === part)
    ?.note;

/* ------------------------------------------------------ particulars */

/** The front of the document: the facts that furnish it, edited in place above the parts. */
function Particulars({
  kind,
  content,
  onChange,
}: {
  kind: CorporateDocumentKind;
  content: CorporateContentV2;
  onChange: (content: CorporateContentV2) => void;
}) {
  const set = (key: string, value: string) =>
    onChange({ ...content, particulars: { ...content.particulars, [key]: value } });
  const p = content.particulars;
  const directors = content.directors.length ? content.directors : [""];
  return (
    <section className="ce-node depth-0 se-front" data-part="front">
      <header className="ce-node-header" style={{ cursor: "default" }}>
        <strong>
          {kind !== "letter" ? "Company, date and execution" : "Addressing and execution"}
        </strong>
        <span className="ce-node-space" />
        <span className="ce-section-label">Front matter</span>
      </header>
      <div
        className="ce-node-content"
        style={{ padding: "12px 14px 14px", display: "grid", gap: 12 }}
      >
        {kind !== "letter" ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field
                label="Company name"
                value={p["companyName"] ?? ""}
                onChange={(v) => set("companyName", v)}
                placeholder="Company name"
                hint={note("board_written_resolution", "Title")}
              />
              <Field
                label="Resolution date"
                value={p["date"] ?? ""}
                onChange={(v) => set("date", v)}
                placeholder="9th September 2026"
                hint={note("board_written_resolution", "Date")}
              />
            </div>
            <Field
              label="Registered office"
              value={p["registeredOffice"] ?? ""}
              onChange={(v) => set("registeredOffice", v)}
              placeholder="Registered office address"
              multiline
              hint={note("board_written_resolution", "Company")}
            />
            <div>
              <span style={labelStyle}>Directors signing</span>
              <span
                style={{
                  display: "block",
                  color: C.muted,
                  fontSize: 11.5,
                  lineHeight: 1.5,
                  marginBottom: 6,
                }}
              >
                {note("board_written_resolution", "Execution")}
              </span>
              <div style={{ display: "grid", gap: 6 }}>
                {directors.map((name, index) => (
                  <div key={index} style={{ display: "flex", gap: 6 }}>
                    <input
                      value={name}
                      placeholder={`Director ${index + 1}`}
                      style={input}
                      onChange={(e) =>
                        onChange({
                          ...content,
                          directors: directors.map((d, i) => (i === index ? e.target.value : d)),
                        })
                      }
                    />
                    <Button
                      onClick={() =>
                        onChange({
                          ...content,
                          directors:
                            directors.length > 1 ? directors.filter((_, i) => i !== index) : [""],
                        })
                      }
                      title="Remove this director"
                    >
                      ×
                    </Button>
                  </div>
                ))}
                <div>
                  <Button onClick={() => onChange({ ...content, directors: [...directors, ""] })}>
                    + Add director
                  </Button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field
                label="Our reference"
                value={p["reference"] ?? ""}
                onChange={(v) => set("reference", v)}
                placeholder="Optional"
                hint={note("letter", "Reference")}
              />
              <Field
                label="Date"
                value={p["date"] ?? ""}
                onChange={(v) => set("date", v)}
                placeholder="9th September 2026"
                hint={note("letter", "Date")}
              />
              <Field
                label="Sender address"
                value={p["sender"] ?? ""}
                onChange={(v) => set("sender", v)}
                placeholder="Optional — the letterhead may carry it"
                multiline
                rows={3}
                hint={note("letter", "Sender")}
              />
              <Field
                label="Addressee"
                value={p["addressee"] ?? ""}
                onChange={(v) => set("addressee", v)}
                placeholder="Recipient name and address"
                multiline
                rows={3}
                hint={note("letter", "Addressee")}
              />
              <Field
                label="Greeting"
                value={p["salutation"] ?? ""}
                onChange={(v) => set("salutation", v)}
                placeholder="Dear Sir/Madam,"
                hint={note("letter", "Salutation")}
              />
              <Field
                label="Subject"
                value={p["subject"] ?? ""}
                onChange={(v) => set("subject", v)}
                placeholder="Subject"
                hint={note("letter", "Subject")}
              />
              <Field
                label="Closing"
                value={p["closing"] ?? ""}
                onChange={(v) => set("closing", v)}
                placeholder="Yours faithfully,"
                hint={note("letter", "Execution")}
              />
              <Field
                label="Signatory name"
                value={p["signatoryName"] ?? ""}
                onChange={(v) => set("signatoryName", v)}
                placeholder="Name"
              />
              <Field
                label="Signatory title"
                value={p["signatoryTitle"] ?? ""}
                onChange={(v) => set("signatoryTitle", v)}
                placeholder="Title"
              />
              <Field
                label="Signing for"
                value={p["signatoryEntity"] ?? ""}
                onChange={(v) => set("signatoryEntity", v)}
                placeholder="For and on behalf of …"
              />
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- screen */

const snapshot = (document: CorporateDocument) =>
  JSON.stringify({
    t: document.title,
    m: document.matterId,
    l: document.letterheadId,
    c: document.content,
  });

function decode(base64: string) {
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export default function CorporateDraftingScreen({ documentId }: { documentId: string }) {
  const { workspaceId, matters } = useApp();
  // A finished section is drafting worth keeping, so the offer sits on the
  // section itself rather than on a library screen the lawyer has left.
  const precedent = useSavePrecedent();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { confirmDelete, confirmDialog } = useConfirmDelete();
  const selectedId = documentId;
  const openDocument = (id: string) =>
    void navigate({ to: "/matters/corporate-drafting/$documentId", params: { documentId: id } });
  const backToLibrary = () => void navigate({ to: "/matters/corporate-drafting" });
  const [draft, setDraft] = useState<CorporateDocument | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [showPaper, setShowPaper] = useState(false);
  /** The record that a person read the pre-flight before settling the document. */
  const [signedOff, setSignedOff] = useState(false);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const documents = useQuery({
    queryKey: ["corporate-documents", workspaceId],
    enabled: !!workspaceId,
    queryFn: () => listCorporateDocuments(workspaceId!),
  });
  const letterheads = useQuery({
    queryKey: ["letterheads", workspaceId],
    enabled: !!workspaceId,
    queryFn: () => listLetterheads(workspaceId!),
  });

  const current = documents.data?.find((item) => item.id === selectedId) ?? null;
  useEffect(() => {
    if (!current) {
      setDraft(null);
      setSavedSnapshot("");
      return;
    }
    // A fresh row replaces the draft only when the draft is not the one being typed.
    setDraft((value) =>
      value && value.id === current.id && snapshot(value) !== savedSnapshot ? value : current,
    );
    setSavedSnapshot((s) =>
      draft && draft.id === current.id && snapshot(draft) !== s ? s : snapshot(current),
    );
    setScreenError(null);
    setExportError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  const dirty = !!draft && snapshot(draft) !== savedSnapshot;
  const refreshDocuments = () =>
    queryClient.invalidateQueries({ queryKey: ["corporate-documents", workspaceId] });

  const create = useMutation({
    mutationFn: (kind: CorporateDocumentKind) => {
      const defaultPaper = letterheads.data?.find((item) => item.isDefault);
      return createCorporateDocument(workspaceId!, kind, {
        letterheadId: defaultPaper?.id ?? null,
      });
    },
    onSuccess: async (created) => {
      await refreshDocuments();
      openDocument(created.id);
      setScreenError(null);
    },
    onError: (error) => setScreenError((error as Error).message),
  });

  const save = useMutation({
    mutationFn: (value: CorporateDocument) =>
      updateCorporateDocument(value.id, workspaceId!, {
        title: value.title,
        matterId: value.matterId,
        letterheadId: value.letterheadId,
        content: value.content,
      }),
    onSuccess: async (saved, value) => {
      setSavedSnapshot(snapshot({ ...value, ...saved, content: value.content }));
      setSavedAt(new Date());
      await refreshDocuments();
      setScreenError(null);
    },
    onError: (error) => setScreenError(`Not saved — ${(error as Error).message}`),
  });

  // Autosave, as the contract editor's edits reach the database without a Save button.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!draft || !dirty) return;
    if (timer.current) clearTimeout(timer.current);
    const value = draft;
    timer.current = setTimeout(() => save.mutate(value), 1200);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, dirty]);

  const remove = useMutation({
    mutationFn: () => moveToBin("corporate_documents", [draft!.id]),
    onSuccess: async () => {
      setDraft(null);
      await refreshDocuments();
      backToLibrary();
    },
    onError: (error) => setScreenError((error as Error).message),
  });

  /** Asked the way the Corporate Drafting library asks it. */
  const askRemove = async (title: string) => {
    if (await confirmDelete({ what: `“${title}”` })) remove.mutate();
  };

  const download = useMutation({
    mutationFn: ({ format }: { key: string; format: "docx" | "pdf" }) =>
      exportCorporateDocument({
        data: { workspaceId: workspaceId!, documentId: draft!.id, format },
      }),
    onSuccess: (result) => {
      downloadBytes(decode(result.base64), result.filename, result.mime);
      setExportError(null);
    },
    onError: (error) => setExportError((error as Error).message),
  });

  const setContent = useCallback(
    (content: CorporateContentV2) => setDraft((value) => (value ? { ...value, content } : value)),
    [],
  );
  const onEditorChange = useCallback(
    ({ parts, meta }: { parts: EditorPart[]; meta: EditorMeta }) =>
      setDraft((value) => {
        if (!value) return value;
        const typed = renumberCorporateParts(
          parts.map((p) => ({ ...p, group: (p.group as CorporateGroup) ?? "body" })),
        );
        return {
          ...value,
          content: { ...value.content, parts: typed, meta: pruneMeta(meta, typed) },
        };
      }),
    [],
  );
  const addPart = (group: CorporateGroup, after: EditorPart | null) =>
    setDraft((value) => {
      if (!value) return value;
      const parts = [...value.content.parts];
      const created = newCorporatePart(group);
      const index = after ? parts.findIndex((p) => p.id === after.id) + 1 : parts.length;
      parts.splice(index, 0, created);
      return { ...value, content: { ...value.content, parts: renumberCorporateParts(parts) } };
    });
  const movePart = (part: EditorPart, delta: -1 | 1) =>
    setDraft((value) => {
      if (!value) return value;
      const parts = [...value.content.parts];
      const index = parts.findIndex((p) => p.id === part.id);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= parts.length) return value;
      const [moved] = parts.splice(index, 1);
      parts.splice(target, 0, moved!);
      return { ...value, content: { ...value.content, parts: renumberCorporateParts(parts) } };
    });
  const removePart = async (part: EditorPart) => {
    if (
      !(await confirmDelete({
        what: `“${part.title}”`,
        consequence: "Its instructions and notes go with it.",
        archivable: false,
      }))
    )
      return;
    setDraft((value) => {
      if (!value) return value;
      const parts = renumberCorporateParts(value.content.parts.filter((p) => p.id !== part.id));
      return {
        ...value,
        content: { ...value.content, parts, meta: pruneMeta(value.content.meta, parts) },
      };
    });
  };

  const preview = useMemo(() => (draft ? corporateExportSpec(draft) : null), [draft]);
  const findings = useMemo(
    () => (draft ? reviewCorporateDocument(draft.kind, draft.content) : []),
    [draft],
  );
  const blockers = blocking(findings);
  const locked = !!draft && isLocked(draft);

  const moveStage = useMutation({
    mutationFn: async (stage: CorporateStage) => {
      if (!draft || !workspaceId) return stage;
      await setCorporateStage(draft.id, workspaceId, stage);
      return stage;
    },
    onSuccess: (stage) => {
      setDraft((value) => (value ? { ...value, stage } : value));
      setScreenError(null);
      void refreshDocuments();
    },
    onError: (error) => setScreenError((error as Error).message),
  });
  const selectedPaper = letterheads.data?.find((item) => item.id === draft?.letterheadId);
  const kindLabel = (kind: CorporateDocumentKind) => KIND_LABEL[kind];

  const status = screenError
    ? { text: screenError, error: true }
    : save.isPending
      ? { text: "Saving…" }
      : dirty
        ? { text: "Unsaved changes" }
        : savedAt
          ? {
              text: `Saved ${savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
            }
          : null;

  const addMenu = draft ? (
    draft.kind !== "letter" ? (
      <>
        <Button onClick={() => addPart("recital", null)}>+ Recital</Button>
        {draft.kind === "board_minutes" && (
          <Button onClick={() => addPart("consideration", null)}>+ Consideration</Button>
        )}
        <Button onClick={() => addPart("resolution", null)}>+ Resolution</Button>
        <Button onClick={() => addPart("authority", null)}>+ Authority</Button>
      </>
    ) : (
      <>
        <Button onClick={() => addPart("body", null)}>+ Body paragraph</Button>
        <Button onClick={() => addPart("purpose", null)}>+ Purpose</Button>
      </>
    )
  ) : null;

  return (
    <AppShell
      section="corporate-drafting"
      back={{ label: "Corporate Drafting", href: "/matters/corporate-drafting" }}
      breadcrumb={
        <Crumbs
          items={[
            { label: "Corporate Drafting", to: "/matters/corporate-drafting" },
            ...(draft ? [{ label: draft.title }] : []),
          ]}
        />
      }
      scroll={false}
      assistant={{
        key: draft?.matterId ? `matter.${draft.matterId}` : "corporate-drafting",
        matterId: draft?.matterId ?? null,
        screen: "Corporate Drafting",
        label: draft ? `${kindLabel(draft.kind)} — ${draft.title}` : "Corporate Drafting",
        intro:
          "Ask what a resolution must recite, or how a letter should be addressed under the house style.",
      }}
    >
      <div style={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div
          style={{
            flex: "none",
            minHeight: 52,
            display: "flex",
            alignItems: "center",
            gap: 9,
            padding: "8px 16px",
            borderBottom: `1px solid ${C.border}`,
            background: C.panel,
            flexWrap: "wrap",
          }}
        >
          <Building2 size={17} color={C.accent} />
          <div style={{ minWidth: 0 }}>
            <div style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>Corporate Drafting</div>
            <div style={{ color: C.muted, fontSize: 11.5 }}>
              Lawyer-authored resolutions and letters
            </div>
          </div>
          {draft && (
            <>
              <input
                aria-label="Document name"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="What this document is"
                style={{ ...input, width: 260, fontWeight: 600 }}
              />
              <select
                aria-label="Matter"
                value={draft.matterId ?? ""}
                onChange={(e) => setDraft({ ...draft, matterId: e.target.value || null })}
                style={{ ...input, width: 200 }}
              >
                <option value="">Not filed to a matter</option>
                {matters.map((matter) => (
                  <option key={matter.id} value={matter.id}>
                    {matter.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Letterhead"
                value={draft.letterheadId ?? ""}
                onChange={(e) => setDraft({ ...draft, letterheadId: e.target.value || null })}
                style={{ ...input, width: 180 }}
              >
                <option value="">No letterhead</option>
                {(letterheads.data ?? []).map((paper) => (
                  <option key={paper.id} value={paper.id}>
                    {paper.name}
                    {paper.isDefault ? " — default" : ""}
                  </option>
                ))}
              </select>
            </>
          )}
          <div style={{ flex: 1 }} />
          {draft?.stage === "drafting" && addMenu}
          <Button onClick={() => setShowPaper((value) => !value)}>Letterheads</Button>
          <Button
            variant="primary"
            onClick={() =>
              void navigate({
                to: "/matters/corporate-drafting/new",
                search: { kind: undefined },
              })
            }
            disabled={!workspaceId}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Plus size={14} />
              New document
            </span>
          </Button>
          {draft && (
            <Button
              variant="danger"
              disabled={remove.isPending}
              onClick={() => void askRemove(draft.title)}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Trash2 size={13} />
                Delete
              </span>
            </Button>
          )}
        </div>

        {workspaceId && showPaper && (
          <LetterheadManager workspaceId={workspaceId} onClose={() => setShowPaper(false)} />
        )}

        {documents.isError && (
          <div
            role="alert"
            style={{
              flex: "none",
              padding: "8px 16px",
              color: C.red,
              background: "#F7ECEA",
              borderBottom: "1px solid #E8CCC7",
              fontSize: 12.5,
            }}
          >
            Corporate documents could not be loaded. {(documents.error as Error).message}
          </div>
        )}

        {!draft ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 28,
            }}
          >
            <div style={{ maxWidth: 360, textAlign: "center" }}>
              <Building2 size={28} color={C.accent} />
              <h1 style={{ color: C.text, fontSize: 18, margin: "12px 0 7px" }}>
                Start the corporate document
              </h1>
              <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.65, margin: 0 }}>
                Choose a board resolution or letter. Scripta supplies the firm structure and paper;
                the words remain yours.
              </p>
            </div>
          </div>
        ) : (
          <>
            <StageBar
              stage={draft.stage}
              signedOff={signedOff}
              blocking={blockers.length}
              summary={preflightSummary(findings)}
              busy={moveStage.isPending}
              onStage={(stage) => moveStage.mutate(stage)}
              onExport={(format) => {
                if (dirty || save.isPending) {
                  setExportError(
                    "The document is still saving — try again in a moment so the file matches the page.",
                  );
                  return;
                }
                download.mutate({ key: `final-${format}`, format });
              }}
              exporting={download.isPending}
              exportError={exportError}
            />
            {draft.stage !== "drafting" ? (
              <FinalStage
                preflight={findings}
                signOff={{
                  checked: signedOff,
                  onChange: setSignedOff,
                  what: `this ${KIND_LABEL[draft.kind].toLowerCase()}`,
                }}
                document={{
                  title: draft.title,
                  subtitle: [kindLabel(draft.kind), selectedPaper?.name ?? "No letterhead"].join(
                    " · ",
                  ),
                  clauses: preview?.clauses ?? [],
                  unit: "sections",
                }}
                busy={download.isPending ? (download.variables?.key ?? null) : null}
                error={exportError}
                onGoTo={(item) =>
                  item.anchorId &&
                  window.document
                    .getElementById(`part-${item.anchorId}`)
                    ?.scrollIntoView({ block: "center" })
                }
                onDownload={(kind, format) => {
                  if (dirty || save.isPending) {
                    setExportError(
                      "The document is still saving — try again in a moment so the file matches the page.",
                    );
                    return;
                  }
                  download.mutate({ key: `${kind}-${format}`, format });
                }}
              />
            ) : (
              <StructuredEditor
                key={draft.id}
                kind={kindLabel(draft.kind).toLowerCase()}
                title={draft.title}
                matterId={draft.matterId}
                parts={draft.content.parts}
                meta={draft.content.meta}
                onChange={onEditorChange}
                extensions={CLAUSE_EXTENSIONS}
                features={{ tables: true }}
                boldQuotedTerms
                storagePrefix="px.corporate-editor"
                partLabel="part"
                tocLabel={draft.kind === "letter" ? "LETTER" : "SECTION"}
                status={status}
                partActions={(part) =>
                  corporateActions(part as EditorPart & { group: CorporateGroup })
                }
                onKeepPart={(part) =>
                  precedent.save({
                    // "Body" alone says nothing in a library; the document it came
                    // from is what makes the section findable again.
                    title: part.title ? `${draft.title} — ${part.title}` : draft.title,
                    body: partText(part).trim(),
                    kind: "section",
                    sourceKind: "corporate",
                    clauseType: part.title,
                    agreementType: kindLabel(draft.kind),
                    sourceNote: `From ${draft.title}`,
                    matterId: draft.matterId ?? null,
                    documentId: draft.id,
                  })
                }
                front={
                  <Particulars kind={draft.kind} content={draft.content} onChange={setContent} />
                }
                locked={locked}
                onAddPart={(after) =>
                  addPart(
                    (after?.group as CorporateGroup | undefined) ??
                      (draft.kind === "letter" ? "body" : "resolution"),
                    after,
                  )
                }
                onRemovePart={removePart}
                onMovePart={movePart}
                panels={[
                  {
                    id: "review",
                    title: "Review",
                    icon: <ClipboardCheck />,
                    node: <ReviewPanel findings={findings} />,
                  },
                  {
                    id: "guide",
                    title: "Drafting guide",
                    icon: <BookOpen />,
                    node: <DraftingGuide parts={draft.content.parts} kind={draft.kind} />,
                  },
                  {
                    id: "preview",
                    title: "Preview and download",
                    icon: <Eye />,
                    node: preview ? (
                      <DocumentPreview
                        title={draft.title}
                        subtitle={[
                          kindLabel(draft.kind),
                          selectedPaper?.name ?? "No letterhead",
                        ].join(" · ")}
                        clauses={preview.clauses}
                        unit="parts"
                        busy={download.isPending ? (download.variables?.key ?? null) : null}
                        error={exportError}
                        onDownload={(kind, format) => {
                          if (dirty || save.isPending) {
                            setExportError(
                              "The document is still saving — try again in a moment so the file matches the page.",
                            );
                            return;
                          }
                          download.mutate({ key: `${kind}-${format}`, format });
                        }}
                      />
                    ) : null,
                  },
                ]}
                emptyHint={`Nothing written yet. Add a ${draft.kind === "letter" ? "body paragraph" : "recital or resolution"} from the bar above.`}
              />
            )}
          </>
        )}
      </div>
      {precedent.dialog}
      {confirmDialog}
    </AppShell>
  );
}

/**
 * What Scripta needs from the lawyer in each section, and why. The blueprint
 * wrote this guidance onto the parts when it built the document; sections a
 * lawyer adds by hand carry the standing guidance for their group.
 */
function DraftingGuide({
  parts,
  kind,
}: {
  parts: CorporateContentV2["parts"];
  kind: CorporateDocumentKind;
}) {
  const written = parts.filter((part) => partText(part).trim()).length;
  return (
    <div className="cd-guide">
      <p className="cd-guide-intro">
        {KIND_LABEL[kind]} · {written} of {parts.length} sections written. Guidance only: Scripta
        has not reviewed this document.
      </p>
      {parts.map((part) => (
        <section key={part.id} className="cd-guide-part">
          <h4>
            {[part.num, part.title].filter(Boolean).join(" ")}
            {!partText(part).trim() && <span className="cd-guide-empty">empty</span>}
          </h4>
          <p>{part.hint ?? GROUP_GUIDE[part.group]}</p>
        </section>
      ))}
      {parts.length === 0 && (
        <p className="cd-guide-intro">
          Nothing to guide yet. Add a section, or start a document from setup and Scripta will lay
          one out.
        </p>
      )}
    </div>
  );
}

/** Standing guidance for a section added by hand, outside a blueprint. */
const GROUP_GUIDE: Record<CorporateGroup, string> = {
  company: "Identify the company beyond doubt: registered name, number and registered office.",
  attendance: "Who attended, who chaired and who sent apologies. Quorum is judged on this list.",
  recital: "One fact the decision rests on. Never put an operative provision in a recital.",
  consideration:
    "What was discussed and on what material. This is what shows the directors applied their minds.",
  resolution:
    "State precisely what is being approved. One decision per resolution, and name any figure, counterparty or document rather than referring to it loosely.",
  authority:
    "Name the person or office authorised and say exactly what they may do. Authority that does not name its subject matter authorises nothing.",
  execution: "How and when the document takes effect, and a signature block for each signatory.",
  body: "One point per paragraph. Keep the register consistent and define any term you use again.",
  purpose:
    "One or two sentences saying what this letter does: confirms, requests, instructs or gives notice.",
};

/* ------------------------------------------------------------- lifecycle */

/**
 * Where the document has got to and what to do next.
 *
 * The complaint this answers is a real one: a lawyer inside the editor had no
 * way of knowing whether the document was finished. So the stage is stated,
 * and exactly one action is offered as the obvious next thing — check it,
 * settle it, or get it out. Finalising is refused while something must be
 * fixed, and the refusal says what.
 */
function StageBar({
  stage,
  signedOff,
  blocking,
  summary,
  busy,
  onStage,
  onExport,
  exporting,
  exportError,
}: {
  stage: CorporateStage;
  signedOff: boolean;
  blocking: number;
  summary: string;
  busy: boolean;
  onStage: (stage: CorporateStage) => void;
  onExport: (format: "docx" | "pdf") => void;
  exporting: boolean;
  exportError: string | null;
}) {
  const index = CORPORATE_STAGES.indexOf(stage);
  return (
    <div className="cd-stagebar">
      <ol className="cd-stages" aria-label="Document stage">
        <li className="is-done">
          <span className="cd-stage-dot" aria-hidden />
          Setup
        </li>
        {CORPORATE_STAGES.map((value, i) => (
          <li
            key={value}
            className={i < index ? "is-done" : i === index ? "is-now" : ""}
            aria-current={i === index ? "step" : undefined}
          >
            <span className="cd-stage-dot" aria-hidden />
            {STAGE_LABEL[value]}
          </li>
        ))}
      </ol>

      <span className="cd-stage-note">
        {stage === "drafting"
          ? "Write the document, then have Scripta check it."
          : stage === "review"
            ? summary
            : "Settled and locked. Export it, or unlock to keep editing."}
      </span>

      <div className="cd-stage-actions">
        {exportError && <span className="cd-stage-error">{exportError}</span>}
        {stage === "drafting" && (
          <Button variant="primary" disabled={busy} onClick={() => onStage("review")}>
            Review this document
          </Button>
        )}
        {stage === "review" && (
          <>
            <Button disabled={busy} onClick={() => onStage("drafting")}>
              Back to drafting
            </Button>
            <Button
              variant="primary"
              disabled={busy || blocking > 0 || !signedOff}
              title={
                blocking > 0
                  ? `${blocking} thing${blocking === 1 ? "" : "s"} must be fixed first — see the Review panel`
                  : signedOff
                    ? "Settle the document and lock it"
                    : "Tick the sign-off first"
              }
              onClick={() => onStage("final")}
            >
              Finalise
            </Button>
          </>
        )}
        {stage === "final" && (
          <Button disabled={busy} onClick={() => onStage("drafting")}>
            Unlock to edit
          </Button>
        )}
        <Button disabled={exporting} onClick={() => onExport("pdf")}>
          {exporting ? "Preparing…" : "PDF"}
        </Button>
        <Button
          variant={stage === "final" ? "primary" : "secondary"}
          disabled={exporting}
          onClick={() => onExport("docx")}
        >
          {exporting ? "Preparing…" : "Word"}
        </Button>
      </div>
    </div>
  );
}

/**
 * The pre-flight, as Contract Review shows it: every check that ran, the ones
 * that passed included, each jumping to the section it is about.
 */
function ReviewPanel({ findings }: { findings: PreflightItem[] }) {
  return (
    <div className="cd-review">
      <p className="cd-review-intro">
        A drafting and completeness check, not legal approval. Scripta has not approved this
        document.
      </p>
      <PreflightList
        items={findings}
        onGo={(item) =>
          item.anchorId &&
          document.getElementById(`part-${item.anchorId}`)?.scrollIntoView({ block: "center" })
        }
      />
    </div>
  );
}

/* ------------------------------------------------------------- lifecycle */

/**
 * Where the document has got to and what to do next.
 *
 * The complaint this answers is a real one: a lawyer inside the editor had no
 * way of knowing whether the document was finished. So the stage is stated,
 * and exactly one action is offered as the obvious next thing — check it,
 * settle it, or get it out. Finalising is refused while something must be
 * fixed, and the refusal says what.
 */
/**
 * What Scripta can do in the section a lawyer is standing in.
 *
 * The general Redraft button could only rewrite text that already existed,
 * which is no help to someone who does not know what the section should say.
 * These act on the section in hand, and the first of them writes it from
 * nothing.
 */
function corporateActions(part: EditorPart & { group: CorporateGroup }) {
  const empty = !partText(part).trim();
  const common = empty
    ? [
        {
          label: "Draft this section",
          instruction:
            `Draft this ${GROUP_NOUN_SHORT[part.group]} from the facts already in the document. ${part.hint ?? ""}`.trim(),
        },
      ]
    : [
        {
          label: "Improve wording",
          instruction: "Tighten the wording without changing the effect.",
        },
        {
          label: "Identify missing information",
          instruction:
            "Say what this section still needs before it could be signed. Ask rather than invent.",
        },
      ];
  const perGroup: Record<CorporateGroup, { label: string; instruction: string }[]> = {
    company: [],
    attendance: [],
    recital: [
      {
        label: "Check it decides nothing",
        instruction:
          "A recital states a fact. If this one contains an operative provision, move that into a resolution and leave the fact here.",
      },
    ],
    consideration: [],
    resolution: [
      {
        label: "Suggest resolutions",
        instruction:
          "Propose the resolutions this decision needs, one decision per resolution, from the background already in the document.",
      },
      {
        label: "Add missing provisions",
        instruction:
          "Say what a resolution of this kind conventionally also provides for, and propose it.",
      },
    ],
    authority: [
      {
        label: "Review authority language",
        instruction:
          "Check that the authorised person and the scope of the authority are both named, and that the scope names the acts authorised.",
      },
    ],
    execution: [],
    body: [],
    purpose: [],
  };
  return [...common, ...perGroup[part.group]];
}

const GROUP_NOUN_SHORT: Record<CorporateGroup, string> = {
  company: "company details section",
  attendance: "attendance record",
  recital: "recital",
  consideration: "record of what was considered",
  resolution: "resolution",
  authority: "authority",
  execution: "execution section",
  body: "paragraph",
  purpose: "purpose",
};
