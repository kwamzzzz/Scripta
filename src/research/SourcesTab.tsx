/**
 * Sources — the research library for this matter.
 *
 * Every authority the research relies on, what it is, whether it can still be
 * relied on, and which questions it carries. A lawyer can add a source they
 * found themselves, correct one Scripta got wrong, and mark a provision
 * repealed so it stops carrying a conclusion. Documents filed against the
 * matter live here too.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, Upload } from "lucide-react";
import { Button } from "@/components/primitives";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import { Modal } from "@/wireframe/screens";
import type { ResearchState } from "@/wireframe/research-store";
import type { StoredRecords } from "@/lib/research-rows";
import type { ResearchAuthority } from "@/lib/research.functions";
import {
  DOCUMENT_KINDS,
  deleteResearchDocument,
  humanBytes,
  listResearchDocuments,
  researchDocumentUrl,
  uploadResearchDocument,
  type ResearchDocument,
  type ResearchDocumentKind,
} from "./documents";
import { addAuthority, removeAuthority, updateAuthority } from "./merge";
import {
  isDoubtful,
  questionsUsingAuthority,
  SOURCE_KINDS,
  STATUS_LABEL,
  STATUSES,
  TIER_LABEL,
  TIERS,
  WEIGHT_LABEL,
  WEIGHTS,
} from "./model";
import { Card, Chip, Empty, Field, SourceBadges } from "./ui";

type Draft = Omit<ResearchAuthority, "n">;

const blank = (): Draft => ({
  cite: "",
  kind: "STATUTE",
  source: "",
  date: "",
  held: "",
  sections: [],
  tier: "primary",
  status: "current",
  weight: "",
  addedBy: "lawyer",
  url: "",
  note: "",
  issueNos: "",
});

export default function SourcesTab({
  state,
  records,
  onState,
  researchId,
  workspaceId,
  selected,
  onSelect,
}: {
  state: ResearchState;
  records: StoredRecords;
  onState: (next: ResearchState) => void;
  researchId: string;
  workspaceId: string | null;
  selected: number | null;
  onSelect: (n: number | null) => void;
}) {
  const [adding, setAdding] = useState(false);
  const { confirmDelete, confirmDialog } = useConfirmDelete();
  const authorities = useMemo(
    () => [...(state.answer?.authorities ?? [])].sort((a, b) => a.n - b.n),
    [state.answer],
  );
  const current = authorities.find((a) => a.n === selected) ?? null;
  const doubtful = authorities.filter(isDoubtful).length;

  const setAnswer = (answer: ResearchState["answer"]) => onState({ ...state, answer });

  return (
    <div className="rs-body is-flush">
      <div className="rs-source-split">
        <div
          style={{
            minWidth: 0,
            overflow: "auto",
            padding: "20px 24px 40px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <Card
            title="Authorities"
            right={
              <>
                {doubtful > 0 && (
                  <Chip tone="practice" mono>
                    {doubtful} need checking
                  </Chip>
                )}
                <span className="rs-eyebrow">{authorities.length} on the record</span>
                <Button variant="primary" onClick={() => setAdding(true)}>
                  Add a source
                </Button>
              </>
            }
            tight
          >
            {!authorities.length ? (
              <Empty
                title="No sources yet"
                body="Research a question and the authorities it relies on land here, or add one you already have."
                action={
                  <Button variant="primary" onClick={() => setAdding(true)}>
                    Add a source
                  </Button>
                }
              />
            ) : (
              <table className="rs-table">
                <thead>
                  <tr>
                    <th style={{ width: 34 }}>#</th>
                    <th>Source</th>
                    <th style={{ width: 150 }}>Type</th>
                    <th style={{ width: 190 }}>Standing</th>
                    <th style={{ width: 130 }}>Used in</th>
                    <th style={{ width: 60 }} />
                  </tr>
                </thead>
                <tbody>
                  {authorities.map((authority) => {
                    const used = questionsUsingAuthority(state, authority.n);
                    return (
                      <tr
                        key={authority.n}
                        className={`is-clickable${selected === authority.n ? " is-selected" : ""}`}
                        onClick={() => onSelect(authority.n)}
                      >
                        <td
                          style={{
                            fontFamily: "'Geist', sans-serif",
                            fontSize: 11,
                            color: "#6b6b6b",
                          }}
                        >
                          {authority.n}
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{authority.cite}</div>
                          <div className="rs-note">
                            {[authority.source, authority.date].filter(Boolean).join(" · ")}
                          </div>
                        </td>
                        <td style={{ fontSize: 11.5, color: "#545454" }}>{authority.kind}</td>
                        <td>
                          <SourceBadges authority={authority} />
                        </td>
                        <td style={{ fontSize: 11.5, color: used.length ? "#333" : "#9a9a9a" }}>
                          {used.length ? used.join(", ") : "Not cited"}
                        </td>
                        <td className="is-actions">
                          <button
                            type="button"
                            className="rs-link is-quiet is-danger"
                            aria-label={`Delete source ${authority.n}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              void (async () => {
                                if (
                                  !(await confirmDelete({
                                    what: `“${authority.cite}”`,
                                    consequence:
                                      "Citations to it are removed from the findings too.",
                                    archivable: false,
                                  }))
                                )
                                  return;
                                setAnswer(removeAuthority(state.answer, authority.n));
                                if (selected === authority.n) onSelect(null);
                              })();
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>

          <DocumentsCard researchId={researchId} workspaceId={workspaceId} />
        </div>

        <aside className="rs-source-panel" aria-label="Source details">
          {current ? (
            <SourceDetail
              authority={current}
              usedIn={questionsUsingAuthority(state, current.n)}
              questions={records.issueCards.map((q) => ({ no: q.no, short: q.short || q.q }))}
              onChange={(patch) => setAnswer(updateAuthority(state.answer, current.n, patch))}
              onClose={() => onSelect(null)}
            />
          ) : (
            <p className="rs-note">
              Choose a source to read what it says, record what it is good for, and see which
              questions it carries.
            </p>
          )}
        </aside>
      </div>

      {adding && (
        <AddSource
          onClose={() => setAdding(false)}
          onAdd={(draft) => {
            setAnswer(addAuthority(state.answer, draft));
            setAdding(false);
          }}
        />
      )}
      {confirmDialog}
    </div>
  );
}

/* ------------------------------------------------------------- detail --- */

function SourceDetail({
  authority,
  usedIn,
  questions,
  onChange,
  onClose,
}: {
  authority: ResearchAuthority;
  usedIn: string[];
  questions: { no: string; short: string }[];
  onChange: (patch: Partial<ResearchAuthority>) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.35 }}>{authority.cite}</div>
          <div className="rs-note">
            {[authority.source, authority.date].filter(Boolean).join(" · ")}
          </div>
        </div>
        <button type="button" className="rs-link is-quiet" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <SourceBadges authority={authority} />

      {authority.addedBy === "ai" && (
        <p className="rs-note">
          Scripta proposed this source and summarised it. Check the citation against the source
          before it carries a conclusion.
        </p>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        <Field label="Standing">
          <select
            className="rs-select"
            value={authority.status ?? ""}
            onChange={(e) => onChange({ status: e.target.value })}
          >
            <option value="">Not recorded</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Tier">
            <select
              className="rs-select"
              value={authority.tier ?? ""}
              onChange={(e) => onChange({ tier: e.target.value })}
            >
              <option value="">Not recorded</option>
              {TIERS.map((t) => (
                <option key={t} value={t}>
                  {TIER_LABEL[t]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Weight">
            <select
              className="rs-select"
              value={authority.weight ?? ""}
              onChange={(e) => onChange({ weight: e.target.value })}
            >
              <option value="">Not recorded</option>
              {WEIGHTS.map((w) => (
                <option key={w} value={w}>
                  {WEIGHT_LABEL[w]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Link">
          <input
            className="rs-input"
            placeholder="https://…"
            value={authority.url ?? ""}
            onChange={(e) => onChange({ url: e.target.value })}
          />
        </Field>
        {authority.url && (
          <a className="rs-link" href={authority.url} target="_blank" rel="noreferrer">
            Open the source →
          </a>
        )}
      </div>

      {authority.held && (
        <div className="rs-part">
          <span className="rs-eyebrow">Relevant proposition</span>
          <div className="rs-part-body">{authority.held}</div>
        </div>
      )}

      {!!authority.sections.length && (
        <div className="rs-part">
          <span className="rs-eyebrow">Reading · AI summary, verify against the source</span>
          {authority.sections.map((section, index) => (
            <div key={index} style={{ marginTop: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{section.title}</div>
              {section.paragraphs.map((paragraph, k) => (
                <div className="rs-passage" key={k}>
                  {paragraph}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <Field label="Your note" hint="What this source is good for, and what it does not reach.">
        <textarea
          className="rs-textarea"
          style={{ minHeight: 80 }}
          value={authority.note ?? ""}
          onChange={(e) => onChange({ note: e.target.value })}
        />
      </Field>

      <div className="rs-part">
        <span className="rs-eyebrow">Used in</span>
        {usedIn.length ? (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {usedIn.map((no) => {
              const question = questions.find((q) => q.no === no);
              return (
                <Chip key={no} tone="law" {...(question?.short ? { title: question.short } : {})}>
                  {no}
                </Chip>
              );
            })}
          </div>
        ) : (
          <p className="rs-note" style={{ margin: 0 }}>
            Nothing cites this source yet.
          </p>
        )}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- add --- */

function AddSource({ onClose, onAdd }: { onClose: () => void; onAdd: (draft: Draft) => void }) {
  const [draft, setDraft] = useState<Draft>(blank());
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  return (
    <Modal open onClose={onClose} label="Add a source">
      <form
        className="rs-card"
        style={{
          width: 520,
          maxWidth: "calc(100vw - 40px)",
          boxShadow: "0 22px 56px rgba(0,0,0,.18)",
        }}
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.cite.trim()) onAdd({ ...draft, cite: draft.cite.trim() });
        }}
      >
        <header className="rs-card-head">
          <h2>Add a source</h2>
        </header>
        <div className="rs-card-body">
          <p className="rs-note" style={{ marginTop: -4 }}>
            A source you found yourself. It is marked as yours, so Scripta does not ask you to
            verify your own citation.
          </p>
          <Field label="Citation">
            <input
              className="rs-input"
              autoFocus
              required
              placeholder="Labour Act 2003 (Act 651), s 63"
              value={draft.cite}
              onChange={(e) => set({ cite: e.target.value })}
            />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Type">
              <select
                className="rs-select"
                value={draft.kind}
                onChange={(e) => set({ kind: e.target.value })}
              >
                {SOURCE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Standing">
              <select
                className="rs-select"
                value={draft.status}
                onChange={(e) => set({ status: e.target.value })}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tier">
              <select
                className="rs-select"
                value={draft.tier}
                onChange={(e) => set({ tier: e.target.value })}
              >
                {TIERS.map((t) => (
                  <option key={t} value={t}>
                    {TIER_LABEL[t]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Weight">
              <select
                className="rs-select"
                value={draft.weight}
                onChange={(e) => set({ weight: e.target.value })}
              >
                <option value="">Not recorded</option>
                {WEIGHTS.map((w) => (
                  <option key={w} value={w}>
                    {WEIGHT_LABEL[w]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: 10 }}>
            <Field label="Court, legislature or publication">
              <input
                className="rs-input"
                placeholder="Supreme Court of Ghana"
                value={draft.source}
                onChange={(e) => set({ source: e.target.value })}
              />
            </Field>
            <Field label="Date">
              <input
                className="rs-input"
                placeholder="2019 · In force"
                value={draft.date}
                onChange={(e) => set({ date: e.target.value })}
              />
            </Field>
          </div>
          <Field label="What it holds or provides">
            <textarea
              className="rs-textarea"
              style={{ minHeight: 70 }}
              value={draft.held}
              onChange={(e) => set({ held: e.target.value })}
            />
          </Field>
          <Field label="Link">
            <input
              className="rs-input"
              placeholder="https://…"
              value={draft.url}
              onChange={(e) => set({ url: e.target.value })}
            />
          </Field>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={!draft.cite.trim()}>
              Add source
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

/* ----------------------------------------------------------- documents --- */

function DocumentsCard({
  researchId,
  workspaceId,
}: {
  researchId: string;
  workspaceId: string | null;
}) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<ResearchDocumentKind>("evidence");
  const [over, setOver] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const { confirmDelete, confirmDialog } = useConfirmDelete();

  const documents = useQuery({
    queryKey: ["research-documents", researchId],
    queryFn: () => listResearchDocuments(researchId),
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["research-documents", researchId] });

  const upload = useMutation({
    mutationFn: (file: File) =>
      uploadResearchDocument({ researchId, workspaceId: workspaceId!, file, kind }),
    onSuccess: async () => {
      await refresh();
      setProblem(null);
      if (fileRef.current) fileRef.current.value = "";
    },
    onError: (error) => setProblem((error as Error).message),
  });
  const remove = useMutation({
    mutationFn: (document: ResearchDocument) => deleteResearchDocument(document),
    onSuccess: refresh,
    onError: (error) => setProblem((error as Error).message),
  });

  const take = (file: File | undefined) => {
    if (!file || !workspaceId) return;
    upload.mutate(file);
  };

  return (
    <Card
      title="Documents"
      right={
        <select
          className="rs-select"
          style={{ width: 170 }}
          aria-label="What the next document is"
          value={kind}
          onChange={(e) => setKind(e.target.value as ResearchDocumentKind)}
        >
          {DOCUMENT_KINDS.map((k) => (
            <option key={k.key} value={k.key}>
              {k.label}
            </option>
          ))}
        </select>
      }
    >
      <p className="rs-note" style={{ marginTop: -4 }}>
        The instructing email, the contract under advice, a judgment you downloaded. Filed against
        this research matter and kept with it.
      </p>
      <button
        type="button"
        disabled={!workspaceId || upload.isPending}
        onClick={() => fileRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          take(event.dataTransfer.files?.[0]);
        }}
        style={{
          border: `1px dashed ${over ? "#0b57d0" : "#d8d8d8"}`,
          background: over ? "#eef4fd" : "#fcfcfc",
          borderRadius: 9,
          padding: "16px 18px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          cursor: upload.isPending ? "default" : "pointer",
          font: "inherit",
          textAlign: "left",
          color: "#232323",
        }}
      >
        <Upload size={17} color="#6f6f6f" />
        <span style={{ display: "grid", gap: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>
            {upload.isPending ? "Uploading…" : "Drop a document here, or click to choose one"}
          </span>
          <span className="rs-note">
            Filed as {DOCUMENT_KINDS.find((k) => k.key === kind)?.label.toLowerCase()}. Up to 25 MB.
          </span>
        </span>
      </button>
      <input ref={fileRef} type="file" hidden onChange={(e) => take(e.target.files?.[0])} />
      {problem && (
        <p className="rs-problem" role="alert">
          {problem}
        </p>
      )}
      {documents.isLoading && <p className="rs-note">Loading documents…</p>}
      {!documents.isLoading && !documents.data?.length && (
        <p className="rs-note">Nothing filed yet.</p>
      )}
      {!!documents.data?.length && (
        <table className="rs-table">
          <thead>
            <tr>
              <th>Document</th>
              <th style={{ width: 130 }}>Filed as</th>
              <th style={{ width: 100 }}>Size</th>
              <th style={{ width: 130 }} />
            </tr>
          </thead>
          <tbody>
            {documents.data.map((document) => (
              <tr key={document.id}>
                <td style={{ fontWeight: 600 }}>{document.name}</td>
                <td style={{ fontSize: 11.5, color: "#545454" }}>
                  {DOCUMENT_KINDS.find((k) => k.key === document.kind)?.label ?? document.kind}
                </td>
                <td style={{ fontSize: 11.5, color: "#6f6f6f" }}>{humanBytes(document.bytes)}</td>
                <td className="is-actions">
                  <OpenDocument document={document} />{" "}
                  <button
                    type="button"
                    className="rs-link is-quiet is-danger"
                    onClick={() => {
                      void (async () => {
                        if (
                          await confirmDelete({
                            what: `“${document.name}”`,
                            archivable: false,
                          })
                        )
                          remove.mutate(document);
                      })();
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {confirmDialog}
    </Card>
  );
}

function OpenDocument({ document: row }: { document: ResearchDocument }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void researchDocumentUrl(row).then((value) => {
      if (!cancelled) setUrl(value);
    });
    return () => {
      cancelled = true;
    };
  }, [row]);
  return url ? (
    <a className="rs-link" href={url} target="_blank" rel="noreferrer">
      Open
    </a>
  ) : (
    <span className="rs-note">Opening…</span>
  );
}
