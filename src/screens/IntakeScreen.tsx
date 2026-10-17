import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { scriptaTheme } from "@/lib/tokens";
import "./intake-screen.css";
import AppShell, { Crumbs } from "@/components/AppShell";
import { Button } from "@/components/primitives";
import { useApp } from "@/store/app";
import { useAuth } from "@/lib/auth";
import { useBoard, usePersisted } from "@/lib/use-board";
import { MATTER_TYPES } from "@/lib/home-data";
import ClientPicker from "@/components/ClientPicker";
import { NO_CLIENT } from "@/components/client-choice";
import { resolveClient } from "@/lib/organise";
import { ACCEPT_ATTR, extOf, fileTypeError } from "@/lib/parsing/mime";
import { diffDocuments, extractClauses, parseDocument } from "@/lib/documents.functions";
import {
  commitTranscript,
  parseTranscript,
  type SpeakerMapping,
  type SpeakerRole,
} from "@/lib/transcripts.functions";
import { ROLES } from "@/lib/transcript-import";
import {
  EMPTY_DETAILS,
  INTAKE_ROLES,
  cleanName,
  draftKey,
  inferDate,
  inferRole,
  inferVersion,
  roleToKind,
  soloContractKey,
  type IntakeDetails,
  type IntakeRole,
} from "@/lib/intake";

type Row = {
  key: string;
  file: File;
  name: string;
  role: IntakeRole;
  version: string;
  date: string;
  status: "queued" | "uploading" | "parsing" | "done" | "failed";
  error?: string | undefined;
  documentId?: string | undefined;
};

const GENERIC = /^speaker\s*\d+$/i;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="scripta-form-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function IntakeScreen() {
  const navigate = useNavigate();
  const { workspaceId } = useApp();
  const { user, profile } = useAuth();
  const { board } = useBoard();
  const qc = useQueryClient();
  const parseDoc = useServerFn(parseDocument);
  const parseTr = useServerFn(parseTranscript);
  const commitTr = useServerFn(commitTranscript);
  const diff = useServerFn(diffDocuments);
  const extract = useServerFn(extractClauses);
  const fileRef = useRef<HTMLInputElement>(null);
  const speakerImportPending = useRef(false);

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const pageRef = useRef<HTMLElement>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(step);
  useEffect(() => {
    if (previousStep.current === step) return;
    previousStep.current = step;
    if (pageRef.current) pageRef.current.scrollTop = 0;
    stepHeadingRef.current?.focus({ preventScroll: true });
  }, [step]);
  const [details, setDetails] = usePersisted<IntakeDetails>(draftKey(workspaceId), EMPTY_DETAILS);
  const [rows, setRows] = useState<Row[]>([]);
  const [dragging, setDragging] = useState(false);
  const [pair, setPair] = useState<{ original: string; amendment: string }>({
    original: "",
    amendment: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [matterId, setMatterId] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [importingSpeakers, setImportingSpeakers] = useState(false);
  const [speakerError, setSpeakerError] = useState<string | null>(null);
  const [speakerDraft, setSpeakerDraft] = useState<{
    documentId: string;
    title: string;
    date: string;
    speakers: {
      key: string;
      name: string | null;
      sample: string;
      count: number;
    }[];
    mapping: SpeakerMapping;
  } | null>(null);

  const patch = (p: Partial<IntakeDetails>) => setDetails({ ...details, ...p });

  const addFiles = (files: FileList | File[] | null) => {
    if (!files) return;
    const next: Row[] = [];
    for (const f of Array.from(files)) {
      const bad = fileTypeError(f);
      if (bad) {
        setError(bad);
        continue;
      }
      next.push({
        key: `${f.name}-${f.size}-${Math.random().toString(36).slice(2, 7)}`,
        file: f,
        name: cleanName(f.name),
        role: inferRole(f.name),
        version: inferVersion(f.name),
        date: inferDate(f.name),
        status: "queued",
      });
    }
    setRows((r) => [...r, ...next]);
  };

  const setRow = (key: string, p: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));

  const guessedPair = useMemo(() => {
    const o = rows.find((r) => r.role === "Original / baseline");
    const a = rows.find((r) => r.role === "Amendment / proposed");
    return {
      original: pair.original || o?.key || "",
      amendment: pair.amendment || a?.key || "",
    };
  }, [rows, pair]);

  const hasTranscript = rows.some((r) => r.role === "Transcript");

  /* ---------- processing ---------- */

  const run = async () => {
    if (!workspaceId) return;
    setStep(4);
    setError(null);
    try {
      const clientId = await resolveClient(
        workspaceId,
        details.clientId
          ? { kind: "existing", id: details.clientId, name: details.client }
          : details.client.trim()
            ? { kind: "new", name: details.client.trim() }
            : NO_CLIENT,
      );
      // The id is chosen here: a matter cannot be read back in the statement
      // that creates it, because its Lead is seeded only after the row exists.
      const matter = { id: crypto.randomUUID() };
      const { error: mErr } = await supabase.from("matters").insert({
        id: matter.id,
        workspace_id: workspaceId,
        name: details.name.trim() || "Untitled matter",
        client_id: clientId,
        client: details.client || null,
        counterparty: details.counterparty || null,
        stage: "Intake",
        matter_type: details.matterType,
        governing_law: details.governingLaw || null,
        reference: details.reference || null,
        target_date: details.targetDate || null,
        owner_id: user?.id ?? null,
        playbook_id: details.playbookId || null,
        created_by: user?.id ?? null,
        is_sample: false,
      });
      if (mErr) throw new Error(mErr.message);
      setMatterId(matter.id);

      const actor = profile?.full_name ?? profile?.email ?? "Unknown";
      await supabase.from("audit_events").insert({
        matter_id: matter.id,
        actor_id: user?.id ?? null,
        actor_name: actor,
        event_type: "matter.created",
        entity_type: "matter",
        entity_id: matter.id,
        summary: `Matter created — ${details.name || "Untitled matter"}`,
        metadata: { run_analysis: details.runAnalysis, files: rows.length },
      });

      const ids: Record<string, string> = {};
      for (const r of rows) {
        setRow(r.key, { status: "uploading", error: undefined });
        try {
          const path = `${workspaceId}/${matter.id}/${crypto.randomUUID()}${extOf(r.file.name)}`;
          const up = await supabase.storage.from("matter-documents").upload(path, r.file, {
            contentType: r.file.type || "application/octet-stream",
          });
          if (up.error) throw new Error(up.error.message);

          const { data: doc, error: dErr } = await supabase
            .from("documents")
            .insert({
              matter_id: matter.id,
              name: r.name,
              kind: roleToKind(r.role),
              version_label: r.version || null,
              doc_date: r.date || null,
              storage_path: path,
              mime_type: r.file.type || null,
              byte_size: r.file.size,
              uploaded_by: user?.id ?? null,
              parse_status: "pending",
            })
            .select("id")
            .single();
          if (dErr || !doc) throw new Error(dErr?.message ?? "Could not record the document");
          ids[r.key] = doc.id;
          setRow(r.key, { status: "parsing", documentId: doc.id });

          await supabase.from("audit_events").insert({
            matter_id: matter.id,
            actor_id: user?.id ?? null,
            actor_name: actor,
            event_type: "document.uploaded",
            entity_type: "document",
            entity_id: doc.id,
            summary: `${r.name} uploaded (${r.role})`,
          });

          if (r.role === "Transcript") {
            const res = await parseTr({ data: { documentId: doc.id } });
            if (!res.ok) throw new Error(res.error);
            const mapping: SpeakerMapping = {};
            for (const s of res.speakers) {
              const known = res.known[s.key];
              const suggested = s.name && !GENERIC.test(s.name) ? s.name : "";
              mapping[s.key] = {
                name: known?.name ?? suggested,
                role: known?.role ?? "Other",
              };
            }
            setSpeakerDraft({
              documentId: doc.id,
              title: r.name,
              date: r.date,
              speakers: res.speakers,
              mapping,
            });
          } else {
            const res = await parseDoc({ data: { documentId: doc.id } });
            if (!res.ok) throw new Error(res.error);
          }
          setRow(r.key, { status: "done" });
        } catch (e) {
          // A failed file never blocks the rest of the set.
          setRow(r.key, {
            status: "failed",
            error: e instanceof Error ? e.message : "Failed",
          });
        }
      }

      const oId = ids[guessedPair.original];
      const aId = ids[guessedPair.amendment];
      const plural = (n: number) => `${n} clause${n === 1 ? "" : "s"}`;
      if (oId && aId) {
        try {
          const res = await diff({
            data: { matterId: matter.id, originalId: oId, amendmentId: aId },
          });
          setSummary(`${plural(res.clauseCount)} · changes detected`);
        } catch (e) {
          setSummary(
            e instanceof Error ? `Review not generated — ${e.message}` : "Review not generated",
          );
        }
      } else {
        // One contract with nothing to compare it against is the ordinary
        // case, not a broken one. Split it into clauses here so the review
        // opens on the document instead of an empty screen.
        const soloKey = soloContractKey(rows, Object.keys(ids));
        const soloId = soloKey ? ids[soloKey] : undefined;
        if (soloId) {
          try {
            const res = await extract({
              data: { matterId: matter.id, documentId: soloId },
            });
            setSummary(`${plural(res.clauseCount)} · ready to review`);
          } catch (e) {
            setSummary(
              e instanceof Error ? `Review not prepared — ${e.message}` : "Review not prepared",
            );
          }
        }
      }

      try {
        window.localStorage.removeItem(draftKey(workspaceId));
      } catch {
        /* ignore */
      }
      await qc.invalidateQueries();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Intake failed");
    }
  };

  const commitSpeakers = async () => {
    if (!speakerDraft || !matterId) return;
    const mapping: SpeakerMapping = {};
    for (const s of speakerDraft.speakers) {
      const m = speakerDraft.mapping[s.key] ?? {
        name: "",
        role: "Other" as SpeakerRole,
      };
      mapping[s.key] = { name: m.name.trim() || s.name || s.key, role: m.role };
    }
    await commitTr({
      data: {
        documentId: speakerDraft.documentId,
        matterId,
        meetingTitle: speakerDraft.title,
        meetingDate: speakerDraft.date,
        mapping,
      },
    });
    setSpeakerDraft(null);
    await qc.invalidateQueries();
  };

  const importSpeakers = async () => {
    if (speakerImportPending.current || !speakerDraft || !matterId) return;
    speakerImportPending.current = true;
    setImportingSpeakers(true);
    setSpeakerError(null);
    try {
      await commitSpeakers();
    } catch (e) {
      setSpeakerError(e instanceof Error ? e.message : "Could not import the transcript");
    } finally {
      speakerImportPending.current = false;
      setImportingSpeakers(false);
    }
  };

  /* ---------- render ---------- */

  const steps = ["Matter details", "Documents", "Review setup", "Processing"];

  return (
    <AppShell
      section="matters"
      back={{ label: "Contract Review", href: "/matters" }}
      trackLabel="New matter"
      scroll={false}
      breadcrumb={
        <Crumbs items={[{ label: "Contract Review", to: "/matters" }, { label: "New matter" }]} />
      }
      assistant={{
        key: "intake",
        label: "New matter",
        screen: "New matter intake",
        intro: "Ask what to upload, or how the review will be set up from these documents.",
      }}
    >
      <section
        ref={pageRef}
        className="scripta-page scripta-intake"
        style={scriptaTheme}
        aria-labelledby="intake-page-title"
      >
        <div className="scripta-intake-content">
          <header className="scripta-page-heading">
            <div>
              <h1 className="scripta-page-title" id="intake-page-title">
                New matter
              </h1>
              <p className="scripta-page-description">
                Add the matter details and documents, then choose how to prepare the review.
              </p>
            </div>
          </header>

          <ol className="scripta-intake-steps" aria-label="Matter intake progress">
            {steps.map((label, index) => (
              <li key={label} aria-current={step === index + 1 ? "step" : undefined}>
                <span className="scripta-intake-step-number" aria-hidden="true">
                  {index + 1}.
                </span>
                <span>{label}</span>
              </li>
            ))}
          </ol>

          {error && (
            <div className="scripta-intake-error" role="alert">
              <span aria-hidden="true">!</span>
              <span>{error}</span>
            </div>
          )}

          {step === 1 && (
            <div>
              <section className="scripta-intake-section" aria-labelledby="intake-details-title">
                <div className="scripta-intake-section-heading">
                  <h2
                    ref={stepHeadingRef}
                    tabIndex={-1}
                    className="scripta-section-title"
                    id="intake-details-title"
                  >
                    Matter details
                  </h2>
                  <p className="scripta-intake-note">
                    A matter name is required. You can add the remaining details later.
                  </p>
                </div>
                <div className="scripta-intake-grid">
                  <Field label="Matter name (required)">
                    <input
                      value={details.name}
                      onChange={(e) => patch({ name: e.target.value })}
                      aria-required="true"
                    />
                  </Field>
                  <Field label="Your reference">
                    <input
                      value={details.reference}
                      placeholder="Left blank, Scripta gives it one"
                      onChange={(e) => patch({ reference: e.target.value })}
                    />
                  </Field>
                  <ClientPicker
                    value={
                      details.clientId
                        ? { kind: "existing", id: details.clientId, name: details.client }
                        : details.client
                          ? { kind: "new", name: details.client }
                          : NO_CLIENT
                    }
                    onChange={(choice) =>
                      setDetails({
                        ...details,
                        client: choice.kind === "none" ? "" : choice.name,
                        clientId: choice.kind === "existing" ? choice.id : undefined,
                      })
                    }
                  />
                  <Field label="Counterparty">
                    <input
                      value={details.counterparty}
                      onChange={(e) => patch({ counterparty: e.target.value })}
                    />
                  </Field>
                </div>
              </section>
              <section className="scripta-intake-section" aria-labelledby="intake-context-title">
                <h2 className="scripta-section-title" id="intake-context-title">
                  Scope and timing
                </h2>
                <div className="scripta-intake-grid">
                  <Field label="Matter type">
                    <select
                      value={details.matterType}
                      onChange={(e) => patch({ matterType: e.target.value })}
                    >
                      {MATTER_TYPES.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Governing law">
                    <input
                      value={details.governingLaw}
                      onChange={(e) => patch({ governingLaw: e.target.value })}
                    />
                  </Field>
                  <Field label="Target date">
                    <input
                      type="date"
                      value={details.targetDate}
                      onChange={(e) => patch({ targetDate: e.target.value })}
                    />
                  </Field>
                  <Field label="Governing playbook">
                    <select
                      value={details.playbookId}
                      onChange={(e) => patch({ playbookId: e.target.value })}
                    >
                      <option value="">None for now</option>
                      {board.playbooks.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} {p.version}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </section>
              <footer className="scripta-intake-footer">
                <div className="scripta-page-actions">
                  <Button
                    variant="primary"
                    onClick={() => setStep(2)}
                    disabled={!details.name.trim()}
                  >
                    Continue
                  </Button>
                  <Button onClick={() => void navigate({ to: "/matters" })}>Cancel</Button>
                </div>
                <p className="scripta-intake-note">
                  Matter details are saved as a draft on this device.
                </p>
              </footer>
            </div>
          )}

          {step === 2 && (
            <section aria-labelledby="intake-documents-title">
              <div className="scripta-intake-section-heading">
                <h2
                  ref={stepHeadingRef}
                  tabIndex={-1}
                  className="scripta-section-title"
                  id="intake-documents-title"
                >
                  Documents
                </h2>
                <p className="scripta-intake-note">
                  Add any documents you already have, and check the inferred role, version and date.
                  A matter does not need one: work often starts precisely because the document does
                  not exist yet, and anything you upload later arrives here.
                </p>
              </div>
              <div
                className={`scripta-intake-upload${dragging ? " is-dragging" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  addFiles(e.dataTransfer.files);
                }}
              >
                <div>
                  <strong>Drop documents here</strong>
                  <p className="scripta-intake-note" id="intake-file-types">
                    DOCX, PDF, TXT, MD, VTT or SRT
                  </p>
                </div>
                <Button onClick={() => fileRef.current?.click()}>Browse files</Button>
              </div>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept={ACCEPT_ATTR}
                aria-label="Add matter documents"
                aria-describedby="intake-file-types"
                hidden
                onChange={(e) => {
                  // FileList is live: copy before clearing the input.
                  const f = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  addFiles(f);
                }}
              />
              {rows.length > 0 && (
                <section className="scripta-intake-files" aria-labelledby="intake-file-list-title">
                  <h3 className="scripta-section-title" id="intake-file-list-title">
                    {rows.length} document{rows.length === 1 ? "" : "s"} selected
                  </h3>
                  {rows.map((r) => (
                    <div className="scripta-intake-file" key={r.key}>
                      <Field label="Document name">
                        <input
                          value={r.name}
                          onChange={(e) => setRow(r.key, { name: e.target.value })}
                          aria-label={`Document name for ${r.file.name}`}
                        />
                        <small>{r.file.name}</small>
                      </Field>
                      <Field label="Role (inferred)">
                        <select
                          value={r.role}
                          onChange={(e) =>
                            setRow(r.key, {
                              role: e.target.value as IntakeRole,
                            })
                          }
                          aria-label={`Role for ${r.file.name}`}
                        >
                          {INTAKE_ROLES.map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Version">
                        <input
                          value={r.version}
                          onChange={(e) => setRow(r.key, { version: e.target.value })}
                          aria-label={`Version for ${r.file.name}`}
                        />
                      </Field>
                      <Field label="Date">
                        <input
                          type="date"
                          value={r.date}
                          onChange={(e) => setRow(r.key, { date: e.target.value })}
                          aria-label={`Date for ${r.file.name}`}
                        />
                      </Field>
                      <div className="scripta-intake-file-remove">
                        <Button
                          variant="quiet"
                          title={`Remove ${r.file.name}`}
                          onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                  <p className="scripta-intake-note scripta-intake-file-guidance">
                    Role, version and date are inferred from filenames. Files are uploaded when you
                    create the matter.
                  </p>
                </section>
              )}
              <footer className="scripta-intake-footer">
                <div className="scripta-page-actions">
                  {/* Documents are an input to the work, or its output. They were
                      never a condition of the work existing, and requiring one
                      meant a matter could not be opened until something had been
                      drafted somewhere else first. */}
                  <Button variant="primary" onClick={() => setStep(3)}>
                    {rows.length ? "Continue" : "Continue without documents"}
                  </Button>
                  <Button onClick={() => setStep(1)}>Back</Button>
                </div>
              </footer>
            </section>
          )}

          {step === 3 && (
            <section aria-labelledby="intake-review-title">
              <div className="scripta-intake-section-heading">
                <h2
                  ref={stepHeadingRef}
                  tabIndex={-1}
                  className="scripta-section-title"
                  id="intake-review-title"
                >
                  Review setup
                </h2>
                <p className="scripta-intake-note">
                  Confirm what is being opened. Documents can be added at any time.
                </p>
              </div>
              <dl className="scripta-intake-summary">
                <div>
                  <dt>Matter</dt>
                  <dd>{details.name}</dd>
                </div>
                {details.client && (
                  <div>
                    <dt>Client</dt>
                    <dd>{details.client}</dd>
                  </div>
                )}
                <div>
                  <dt>Documents</dt>
                  <dd>{rows.length}</dd>
                </div>
              </dl>
              <section className="scripta-intake-section" aria-labelledby="intake-comparison-title">
                <h3 className="scripta-section-title" id="intake-comparison-title">
                  Document comparison
                </h3>
                <div className="scripta-intake-grid">
                  <Field label="Original document">
                    <select
                      value={guessedPair.original}
                      onChange={(e) => setPair({ ...guessedPair, original: e.target.value })}
                    >
                      <option value="">No comparison</option>
                      {rows.map((r) => (
                        <option key={r.key} value={r.key}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Amendment / proposed document">
                    <select
                      value={guessedPair.amendment}
                      onChange={(e) => setPair({ ...guessedPair, amendment: e.target.value })}
                    >
                      <option value="">No comparison</option>
                      {rows.map((r) => (
                        <option key={r.key} value={r.key}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <p className="scripta-intake-note scripta-intake-file-guidance">
                  A single contract can be prepared for review without a comparison.
                </p>
              </section>
              <section className="scripta-intake-section" aria-labelledby="intake-analysis-title">
                <h3 className="scripta-section-title" id="intake-analysis-title">
                  Analysis
                </h3>
                <label className="scripta-intake-checkbox">
                  <input
                    type="checkbox"
                    checked={details.runAnalysis}
                    onChange={(e) => patch({ runAnalysis: e.target.checked })}
                  />
                  <span>
                    Run AI analysis once parsing completes
                    <small>Analysis is always labelled as AI-proposed.</small>
                  </span>
                </label>
              </section>
              {hasTranscript && (
                <section
                  className="scripta-intake-section"
                  aria-labelledby="intake-transcript-title"
                >
                  <h3 className="scripta-section-title" id="intake-transcript-title">
                    Transcript speakers
                  </h3>
                  <p className="scripta-intake-note">
                    After parsing, you can confirm speaker names and roles before importing the
                    transcript.
                  </p>
                </section>
              )}
              <footer className="scripta-intake-footer">
                <div className="scripta-page-actions">
                  <Button variant="primary" onClick={() => void run()}>
                    Create matter
                  </Button>
                  <Button onClick={() => setStep(2)}>Back</Button>
                </div>
              </footer>
            </section>
          )}

          {step === 4 && (
            <>
              <section aria-labelledby="intake-processing-title">
                <div className="scripta-intake-section-heading">
                  <h2
                    ref={stepHeadingRef}
                    tabIndex={-1}
                    className="scripta-section-title"
                    id="intake-processing-title"
                  >
                    Processing documents
                  </h2>
                  <p className="scripta-intake-note">{details.name}</p>
                </div>
                <ul
                  className="scripta-intake-processing"
                  aria-label="Document processing progress"
                  aria-live="polite"
                >
                  {rows.map((r) => (
                    <li key={r.key}>
                      <div className="scripta-intake-processing-name">
                        {r.name}
                        <small>{r.role}</small>
                      </div>
                      <span className={`scripta-intake-file-status is-${r.status}`}>
                        {r.status === "done" ? (
                          <>
                            <span aria-hidden="true">✓ </span>Parsed
                          </>
                        ) : r.status === "failed" ? (
                          <>
                            <span aria-hidden="true">! </span>Failed
                          </>
                        ) : r.status === "queued" ? (
                          "Queued"
                        ) : r.status === "uploading" ? (
                          "Uploading…"
                        ) : (
                          "Parsing…"
                        )}
                      </span>
                      {r.error && (
                        <span className="scripta-intake-processing-error">{r.error}</span>
                      )}
                    </li>
                  ))}
                </ul>
                {summary && (
                  <p className="scripta-intake-note scripta-intake-result" role="status">
                    {summary}
                  </p>
                )}
                <footer className="scripta-intake-footer">
                  <div className="scripta-page-actions">
                    {matterId && (
                      <Button
                        variant="primary"
                        onClick={() =>
                          void navigate({
                            to: "/matters/$matterId",
                            params: { matterId },
                            search: {
                              screen: summary ? "review" : "contract",
                              clause: undefined,
                              res: undefined,
                              rule: undefined,
                            },
                          })
                        }
                      >
                        {summary ? "Open review" : "Open matter"}
                      </Button>
                    )}
                    <Button onClick={() => void navigate({ to: "/matters" })}>All matters</Button>
                  </div>
                </footer>
              </section>

              {speakerDraft && (
                <section
                  className="scripta-intake-section scripta-intake-speakers"
                  aria-labelledby="intake-speakers-title"
                >
                  <div className="scripta-intake-section-heading">
                    <h2 className="scripta-section-title" id="intake-speakers-title">
                      Confirm transcript speakers
                    </h2>
                    <p className="scripta-intake-note">
                      {speakerDraft.title} · Review the detected speakers and sample utterances
                      before importing.
                    </p>
                  </div>
                  {speakerDraft.speakers.map((s) => {
                    const m = speakerDraft.mapping[s.key] ?? {
                      name: "",
                      role: "Other" as SpeakerRole,
                    };
                    return (
                      <div className="scripta-intake-speaker" key={s.key}>
                        <div className="scripta-intake-speaker-source">
                          <h3>{s.name ?? s.key}</h3>
                          <blockquote>{s.sample}</blockquote>
                        </div>
                        <Field label="Speaker name">
                          <input
                            value={m.name}
                            disabled={importingSpeakers}
                            aria-label={`Speaker name for ${s.name ?? s.key}`}
                            onChange={(e) =>
                              setSpeakerDraft((d) =>
                                d
                                  ? {
                                      ...d,
                                      mapping: {
                                        ...d.mapping,
                                        [s.key]: { ...m, name: e.target.value },
                                      },
                                    }
                                  : d,
                              )
                            }
                          />
                        </Field>
                        <Field label="Speaker role">
                          <select
                            value={m.role}
                            disabled={importingSpeakers}
                            aria-label={`Speaker role for ${s.name ?? s.key}`}
                            onChange={(e) =>
                              setSpeakerDraft((d) =>
                                d
                                  ? {
                                      ...d,
                                      mapping: {
                                        ...d.mapping,
                                        [s.key]: {
                                          ...m,
                                          role: e.target.value as SpeakerRole,
                                        },
                                      },
                                    }
                                  : d,
                              )
                            }
                          >
                            {ROLES.map((r) => (
                              <option key={r}>{r}</option>
                            ))}
                          </select>
                        </Field>
                      </div>
                    );
                  })}
                  {speakerError && (
                    <div className="scripta-intake-error" role="alert">
                      <span aria-hidden="true">!</span>
                      <span>{speakerError}</span>
                    </div>
                  )}
                  <footer className="scripta-intake-footer" aria-busy={importingSpeakers}>
                    <div className="scripta-page-actions">
                      <Button
                        variant="primary"
                        onClick={() => void importSpeakers()}
                        disabled={importingSpeakers}
                      >
                        Import transcript
                      </Button>
                      <Button onClick={() => setSpeakerDraft(null)} disabled={importingSpeakers}>
                        Skip for now
                      </Button>
                    </div>
                    {importingSpeakers && (
                      <p className="scripta-intake-note" role="status">
                        Importing transcript…
                      </p>
                    )}
                  </footer>
                </section>
              )}
            </>
          )}
        </div>
      </section>
    </AppShell>
  );
}
