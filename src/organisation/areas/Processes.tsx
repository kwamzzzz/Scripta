/**
 * Processes: how the client works.
 *
 * A process is the client's own procedure — a new supply contract, instructing
 * external counsel, the monthly compliance close — written down as ordered
 * steps, each owned by a role rather than a person so a leaver does not break
 * it. It can be read from the client's SOP, checked against the authority
 * matrix, and published as a flow preset, so the next run opens as a flow with
 * these steps as its phases.
 */
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/primitives";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import { parseDocument } from "@/lib/documents.functions";
import type { AreaProps } from "../area";
import { deleteRecord, insertRecord, linkDocument, setRecordArchived, updateRecord } from "../db";
import type { Organisation, Process, ProcessStep } from "../model";
import {
  Empty,
  ErrorLine,
  Field,
  FieldRow,
  OrgDialog,
  OrgPage,
  Panel,
  Pill,
  RoleSelect,
  Select,
  TextArea,
  TextInput,
  count,
  useOrgWrite,
} from "../ui";
import ProcessDialog from "../dialogs/ProcessDialog";
import UploadDocumentDialog from "../dialogs/UploadDocumentDialog";
import DocumentReader from "../components/DocumentReader";
import { readProcess, type ProcessDraft } from "../read-process.functions";
import {
  matchOwnerRole,
  needsAuthority,
  publishChecklist,
  rulesForStep,
} from "../processes/preset";
import { publishProcess, runProcess } from "../processes/run";
import "../documents.css";

const stepsOf = (org: Organisation, processId: string) =>
  org.steps.filter((s) => s.processId === processId).sort((a, b) => a.position - b.position);

const roleTitle = (org: Organisation, id: string | null) =>
  (id && org.roles.find((r) => r.id === id)?.title) || "";

export default function Processes(props: AreaProps) {
  const { org, item, mode } = props;
  if (mode === "import") return <ImportProcess {...props} />;
  const selected = item ? org.processes.find((p) => p.id === item) : null;
  if (selected) return <ProcessDetail {...props} process={selected} />;
  return <ProcessList {...props} />;
}

/* -------------------------------------------------------------------- list */

function StepChips({
  org,
  steps,
  limit = 6,
}: {
  org: Organisation;
  steps: ProcessStep[];
  limit?: number;
}) {
  if (!steps.length) return <span className="og-row-meta">No steps yet</span>;
  return (
    <ol className="pr-chips">
      {steps.slice(0, limit).map((s, i) => (
        <li
          key={s.id}
          className={s.ownerRoleId ? undefined : "is-unowned"}
          title={roleTitle(org, s.ownerRoleId) || "Owner not stated"}
        >
          {i + 1} · {s.title}
        </li>
      ))}
      {steps.length > limit && <li className="is-more">+ {steps.length - limit} more</li>}
    </ol>
  );
}

function ProcessList({ org, client, go }: AreaProps) {
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const live = org.processes.filter((p) => !p.archivedAt);
  const archived = org.processes.filter((p) => p.archivedAt);
  const shown = showArchived ? org.processes : live;

  return (
    <OrgPage
      title="Processes"
      subtitle={
        live.length
          ? `How ${client.name} works · ${count(live.length, "process", "processes")}`
          : `How ${client.name} works`
      }
      actions={
        <>
          <Button onClick={() => go({ mode: "import", item: null })}>Import from a document</Button>
          <Button variant="primary" onClick={() => setCreating(true)}>
            New process
          </Button>
        </>
      }
    >
      {shown.length === 0 ? (
        <Empty
          title="No processes recorded"
          body="Record the client's internal procedures — approving a contract, instructing counsel, the monthly compliance close — as steps owned by roles. A published process runs as a flow."
          action={
            <>
              <Button variant="primary" onClick={() => setCreating(true)}>
                New process
              </Button>
              <Button onClick={() => go({ mode: "import", item: null })}>
                Read one from an SOP
              </Button>
            </>
          }
        />
      ) : (
        <div className="pr-cards">
          {shown.map((p) => {
            const steps = stepsOf(org, p.id);
            const source = org.documents.find((d) => d.id === p.sourceDocumentId);
            return (
              <button
                key={p.id}
                type="button"
                className="pr-card"
                onClick={() => go({ item: p.id, mode: null })}
              >
                <span className="pr-card-head">
                  <strong>{p.name}</strong>
                  <span className="og-eyebrow">{count(steps.length, "step")}</span>
                </span>
                <StepChips org={org} steps={steps} />
                <span className="og-row-meta">
                  {[
                    roleTitle(org, p.ownerRoleId)
                      ? `Owner: ${roleTitle(org, p.ownerRoleId)}`
                      : "No owner named",
                    p.cadence,
                    source ? `From ${source.name}` : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <span className="pr-card-state">
                  {p.archivedAt ? (
                    <Pill tone="retired">Archived</Pill>
                  ) : p.status === "published" ? (
                    <Pill tone="good">Published</Pill>
                  ) : (
                    <Pill tone="neutral">Draft</Pill>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {archived.length > 0 && (
        <p className="og-hint">
          <button type="button" className="org-link" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? "Hide archived" : `Show archived (${archived.length})`}
          </button>
        </p>
      )}
      {creating && (
        <ProcessDialog
          org={org}
          process={null}
          open
          onClose={() => setCreating(false)}
          onSaved={(id) => go({ item: id })}
        />
      )}
    </OrgPage>
  );
}

/* ------------------------------------------------------------------ detail */

function ProcessDetail({ org, client, go, process }: AreaProps & { process: Process }) {
  const navigate = useNavigate();
  const steps = stepsOf(org, process.id);
  const write = useOrgWrite(org.clientId);
  const { confirmDelete, confirmDialog } = useConfirmDelete();
  const [editing, setEditing] = useState(false);
  const [step, setStep] = useState<ProcessStep | "new" | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const unowned = steps.filter((s) => !s.ownerRoleId).length;
  const checklist = publishChecklist(org, process.sourceDocumentId, steps);
  const authoritySteps = steps
    .map((s) => ({ step: s, rules: rulesForStep(org, s) }))
    .filter((x) => needsAuthority(x.step));

  /** Rewrite positions to the new order; only rows whose position changed are written. */
  const move = (index: number, by: -1 | 1) => {
    const next = [...steps];
    const target = index + by;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    void write.run(async () => {
      for (const [i, s] of next.entries())
        if (s.position !== i) await updateRecord("org_process_steps", s.id, { position: i });
    });
  };

  const publish = async () => {
    setDone(null);
    const ok = await write.run(() => publishProcess(org, client.name, process, steps));
    if (ok)
      setDone(
        process.status === "published"
          ? "Republished. Flows already running are unchanged."
          : "Published to the preset library.",
      );
  };

  const run = async () => {
    setDone(null);
    let flowId = "";
    const ok = await write.run(async () => {
      flowId = await runProcess(org, process);
    });
    if (ok && flowId) void navigate({ to: "/flows/$flowId", params: { flowId } });
  };

  const remove = async () => {
    const confirmed = await confirmDelete({
      what: `“${process.name}”`,
      binned: false,
      ...(steps.length ? { consequence: `Its ${count(steps.length, "step")} go with it.` } : {}),
    });
    if (!confirmed) return;
    const ok = await write.run(() => deleteRecord("org_processes", process.id));
    if (ok) go({ item: null });
  };

  return (
    <OrgPage
      title={process.name}
      subtitle={[
        process.status === "published" ? "Published" : "Draft",
        count(steps.length, "step"),
        steps.length
          ? unowned
            ? `${count(unowned, "step")} with no owner`
            : "every step owned"
          : "",
        process.cadence,
      ]
        .filter(Boolean)
        .join(" · ")}
      actions={
        <>
          <Button variant="quiet" onClick={() => go({ item: null })}>
            All processes
          </Button>
          {process.sourceDocumentId && (
            <Button onClick={() => setReading(process.sourceDocumentId)}>View source</Button>
          )}
          <Button onClick={() => setEditing(true)}>Edit</Button>
          {process.status === "published" && process.presetId && !process.archivedAt && (
            <Button onClick={() => void run()} disabled={write.busy}>
              Run as a flow
            </Button>
          )}
          {!process.archivedAt && (
            <Button
              variant="primary"
              onClick={() => void publish()}
              disabled={write.busy || steps.length === 0}
            >
              {process.status === "published" ? "Republish" : "Publish as process"}
            </Button>
          )}
        </>
      }
    >
      <ErrorLine error={write.error} />
      {done && (
        <p className="og-hint" role="status">
          {done}
        </p>
      )}
      {process.summary && <p className="pr-summary">{process.summary}</p>}

      {steps.length > 0 && (
        <div className="pr-strip">
          <StepChips org={org} steps={steps} limit={8} />
        </div>
      )}

      <div className="pr-detail">
        <Panel
          title="Steps"
          right={
            <button type="button" className="org-link" onClick={() => setStep("new")}>
              Add step
            </button>
          }
        >
          {steps.length === 0 ? (
            <Empty
              title="No steps yet"
              body="Add the steps in the order they happen, or read them from the client's written procedure."
              action={
                <>
                  <Button onClick={() => setStep("new")}>Add step</Button>
                  <Button variant="quiet" onClick={() => go({ mode: "import", item: null })}>
                    Import from a document
                  </Button>
                </>
              }
            />
          ) : (
            <ol className="pr-steps">
              {steps.map((s, i) => {
                const rules = authoritySteps.find((x) => x.step.id === s.id)?.rules ?? null;
                const unownedStep = !s.ownerRoleId;
                return (
                  <li key={s.id} className={unownedStep ? "is-flagged" : undefined}>
                    <div className="pr-step-head">
                      <strong>
                        {i + 1} · {s.title}
                      </strong>
                      <span className={unownedStep ? "pr-owner is-missing" : "pr-owner"}>
                        {unownedStep ? "Owner not stated" : roleTitle(org, s.ownerRoleId)}
                        {s.durationDays ? ` · ${count(s.durationDays, "day")}` : ""}
                      </span>
                    </div>
                    {s.detail && <p className="pr-step-detail">{s.detail}</p>}
                    {rules && (
                      <div className="pr-authority">
                        {rules.length ? (
                          rules.map((r) => (
                            <span key={r.rule.id}>Authority matrix: {r.summary}</span>
                          ))
                        ) : (
                          <span>This step approves or signs; no authority rule names it.</span>
                        )}
                        <button
                          type="button"
                          className="org-link"
                          onClick={() => go({ area: "authority", item: null, mode: null })}
                        >
                          Use the authority matrix
                        </button>
                      </div>
                    )}
                    <div className="pr-step-foot">
                      {(s.sourceSection || s.sourcePage) && (
                        <button
                          type="button"
                          className="org-link"
                          disabled={!process.sourceDocumentId}
                          onClick={() => setReading(process.sourceDocumentId)}
                        >
                          From{" "}
                          {[s.sourceSection, s.sourcePage ? `page ${s.sourcePage}` : ""]
                            .filter(Boolean)
                            .join(", ")}
                        </button>
                      )}
                      <span className="pr-step-actions">
                        <button type="button" className="org-link" onClick={() => setStep(s)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="org-link"
                          disabled={i === 0 || write.busy}
                          onClick={() => move(i, -1)}
                          aria-label={`Move ${s.title} up`}
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          className="org-link"
                          disabled={i === steps.length - 1 || write.busy}
                          onClick={() => move(i, 1)}
                          aria-label={`Move ${s.title} down`}
                        >
                          Down
                        </button>
                        <button
                          type="button"
                          className="org-link"
                          onClick={() =>
                            void confirmDelete({
                              what: `step “${s.title}”`,
                              binned: false,
                              archivable: false,
                            }).then(
                              (yes) =>
                                yes && write.run(() => deleteRecord("org_process_steps", s.id)),
                            )
                          }
                        >
                          Delete
                        </button>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Panel>

        <Panel title="Before publishing">
          <ul className="pr-checklist">
            {checklist.map((c) => (
              <li key={c.key} className={c.done ? "is-done" : undefined}>
                <span className="pr-check" role="img" aria-label={c.done ? "Done" : "Not done"}>
                  {c.done ? "✓" : ""}
                </span>
                <span>
                  <strong>{c.title}</strong>
                  <span className="og-row-meta">{c.detail}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="og-hint">
            Conflicts with the authority matrix are shown on the step rather than resolved for you.
          </p>
          <div className="pr-archive">
            {process.archivedAt ? (
              <button
                type="button"
                className="org-link"
                onClick={() =>
                  void write.run(() => setRecordArchived("org_processes", process.id, false))
                }
              >
                Restore
              </button>
            ) : (
              <button
                type="button"
                className="org-link"
                onClick={() =>
                  void write.run(() => setRecordArchived("org_processes", process.id, true))
                }
              >
                Archive
              </button>
            )}
            <button type="button" className="org-link" onClick={() => void remove()}>
              Delete
            </button>
          </div>
        </Panel>
      </div>

      {editing && (
        <ProcessDialog org={org} process={process} open onClose={() => setEditing(false)} />
      )}
      {step && (
        <StepDialog
          org={org}
          processId={process.id}
          step={step === "new" ? null : step}
          nextPosition={steps.length ? Math.max(...steps.map((s) => s.position)) + 1 : 0}
          onClose={() => setStep(null)}
        />
      )}
      <DocumentReader documentId={reading} onClose={() => setReading(null)} />
      {confirmDialog}
    </OrgPage>
  );
}

function StepDialog({
  org,
  processId,
  step,
  nextPosition,
  onClose,
}: {
  org: Organisation;
  processId: string;
  step: ProcessStep | null;
  nextPosition: number;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(step?.title ?? "");
  const [detail, setDetail] = useState(step?.detail ?? "");
  const [ownerRoleId, setOwnerRoleId] = useState<string | null>(step?.ownerRoleId ?? null);
  const [days, setDays] = useState(step?.durationDays ? String(step.durationDays) : "");
  const [section, setSection] = useState(step?.sourceSection ?? "");
  const [page, setPage] = useState(step?.sourcePage ? String(step.sourcePage) : "");
  const write = useOrgWrite(org.clientId);

  const submit = async () => {
    if (!title.trim()) {
      write.setError("A step needs a name.");
      return;
    }
    const n = (v: string) => {
      const x = Number.parseInt(v, 10);
      return Number.isFinite(x) && x >= 0 ? x : null;
    };
    const row = {
      title: title.trim(),
      detail: detail.trim(),
      owner_role_id: ownerRoleId,
      duration_days: n(days),
      source_section: section.trim(),
      source_page: n(page) || null,
    };
    const ok = await write.run(() =>
      step
        ? updateRecord("org_process_steps", step.id, row)
        : insertRecord(org, "org_process_steps", {
            ...row,
            process_id: processId,
            position: nextPosition,
          }),
    );
    if (ok) onClose();
  };

  return (
    <OrgDialog
      open
      title={step ? "Edit step" : "Add step"}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={step ? "Save" : "Add step"}
      busy={write.busy}
      error={write.error}
    >
      <Field label="Step">
        <TextInput value={title} onChange={setTitle} autoFocus placeholder="e.g. Supplier KYC" />
      </Field>
      <Field label="What it requires">
        <TextArea value={detail} onChange={setDetail} />
      </Field>
      <FieldRow>
        <Field label="Owner" hint="A role, so the step survives a leaver">
          <RoleSelect
            org={org}
            value={ownerRoleId}
            onChange={setOwnerRoleId}
            empty="Owner not stated"
          />
        </Field>
        <Field label="Working days">
          <TextInput type="number" value={days} onChange={setDays} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Source section">
          <TextInput value={section} onChange={setSection} placeholder="§3.1" />
        </Field>
        <Field label="Page">
          <TextInput type="number" value={page} onChange={setPage} />
        </Field>
      </FieldRow>
    </OrgDialog>
  );
}

/* ------------------------------------------------------------------ import */

type Proposed = ProcessDraft["steps"][number] & { include: boolean; ownerRoleId: string | null };

function ImportProcess({ org, go }: AreaProps) {
  const parse = useServerFn(parseDocument);
  const read = useServerFn(readProcess);
  const write = useOrgWrite(org.clientId);
  const [documentId, setDocumentId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [reading, setReading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [proposed, setProposed] = useState<Proposed[] | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);

  const doc = org.documents.find((d) => d.id === documentId);

  const readIt = async () => {
    if (!documentId) return;
    setReading(true);
    setProblem(null);
    setProposed(null);
    try {
      if (doc && doc.parseStatus !== "parsed") {
        const parsed = await parse({ data: { documentId } });
        if (!parsed.ok) throw new Error(parsed.error);
      }
      const out = await read({ data: { documentId } });
      if (!out.ok) throw new Error(out.error);
      setName(out.draft.name);
      setSummary(out.draft.summary);
      setTruncated(!!out.truncated);
      setProposed(
        out.draft.steps.map((s) => ({
          ...s,
          include: true,
          ownerRoleId: matchOwnerRole(org, s.ownerHint)?.id ?? null,
        })),
      );
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : "The document could not be read.");
    } finally {
      setReading(false);
    }
  };

  const patch = (index: number, change: Partial<Proposed>) =>
    setProposed((rows) => rows?.map((r, i) => (i === index ? { ...r, ...change } : r)) ?? null);

  const save = async () => {
    if (!proposed) return;
    if (!name.trim()) {
      write.setError("The process needs a name.");
      return;
    }
    let id = "";
    const kept = proposed.filter((s) => s.include);
    const ok = await write.run(async () => {
      id = await insertRecord(org, "org_processes", {
        name: name.trim(),
        summary: summary.trim(),
        status: "draft",
        source_document_id: documentId,
      });
      await linkDocument(org, documentId, "process", id);
      for (const [position, s] of kept.entries())
        await insertRecord(org, "org_process_steps", {
          process_id: id,
          position,
          title: s.title,
          detail: s.detail,
          owner_role_id: s.ownerRoleId,
          duration_days: s.durationDays,
          source_section: s.section,
          source_page: s.page,
        });
    });
    if (ok) go({ mode: null, item: id });
  };

  const unowned = proposed?.filter((s) => s.include && !s.ownerRoleId).length ?? 0;

  return (
    <OrgPage
      title="Read a process from a document"
      subtitle="The document stays as it is. The process is built beside it, and each step keeps the section it came from."
      actions={
        <Button variant="quiet" onClick={() => go({ mode: null })}>
          Cancel
        </Button>
      }
    >
      <Panel title="1 · The document">
        <div className="pr-import-source">
          <Field label="A document the client holds">
            <Select
              value={documentId}
              onChange={(v) => {
                setDocumentId(v);
                setProposed(null);
                setProblem(null);
              }}
              empty={org.documents.length ? "Choose a document…" : "No documents on file yet"}
              options={org.documents.map((d) => ({ value: d.id, label: d.name }))}
            />
          </Field>
          <Button onClick={() => setUploading(true)}>Upload one</Button>
          <Button variant="primary" onClick={() => void readIt()} disabled={!documentId || reading}>
            {reading ? "Reading…" : "Read the procedure"}
          </Button>
        </div>
        {doc && (
          <p className="og-hint">
            <button type="button" className="org-link" onClick={() => setViewing(doc.id)}>
              Open {doc.name}
            </button>
          </p>
        )}
        {reading && (
          <p className="og-hint" role="status">
            Scripta is reading the document and setting out its steps. Nothing is saved until you
            do.
          </p>
        )}
        <ErrorLine error={problem} />
      </Panel>

      {proposed && (
        <>
          <Panel
            title="2 · What Scripta read"
            right={`${count(proposed.length, "step")} found${unowned ? ` · ${unowned} with no owner` : ""}`}
          >
            {truncated && (
              <p className="og-hint">The document is long; only its first part was read.</p>
            )}
            <FieldRow>
              <Field label="Process name">
                <TextInput value={name} onChange={setName} />
              </Field>
              <Field label="What it is for">
                <TextInput value={summary} onChange={setSummary} />
              </Field>
            </FieldRow>
            {proposed.length === 0 ? (
              <Empty
                title="No steps were found"
                body="The document may not set out a procedure. Choose another, or create the process by hand."
              />
            ) : (
              <ol className="pr-review">
                {proposed.map((s, i) => (
                  <li
                    key={i}
                    className={
                      s.include ? (s.ownerRoleId ? undefined : "is-flagged") : "is-skipped"
                    }
                  >
                    <label className="og-check">
                      <input
                        type="checkbox"
                        checked={s.include}
                        onChange={(e) => patch(i, { include: e.target.checked })}
                      />
                      <strong>
                        {i + 1} · {s.title}
                      </strong>
                    </label>
                    {s.detail && <p className="pr-step-detail">{s.detail}</p>}
                    <div className="pr-review-fields">
                      <Field
                        label="Owner"
                        hint={
                          s.ownerHint
                            ? `The document says: ${s.ownerHint}`
                            : "The document does not say who"
                        }
                      >
                        <RoleSelect
                          org={org}
                          value={s.ownerRoleId}
                          onChange={(ownerRoleId) => patch(i, { ownerRoleId })}
                          empty="Owner not stated"
                        />
                      </Field>
                      <span className="og-row-meta">
                        {[
                          s.durationDays ? count(s.durationDays, "day") : "",
                          s.section,
                          s.page ? `page ${s.page}` : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
          <div className="pr-import-save">
            <ErrorLine error={write.error} />
            <Button
              variant="primary"
              onClick={() => void save()}
              disabled={write.busy || !proposed.some((s) => s.include)}
            >
              {write.busy ? "Saving…" : "Save as a draft process"}
            </Button>
          </div>
        </>
      )}

      {uploading && (
        <UploadDocumentDialog
          org={org}
          open
          onClose={() => setUploading(false)}
          defaultCategory="policy"
          onUploaded={(id) => setDocumentId(id)}
        />
      )}
      <DocumentReader documentId={viewing} onClose={() => setViewing(null)} />
    </OrgPage>
  );
}
