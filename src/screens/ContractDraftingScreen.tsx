import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  Clock3,
  Info,
  LoaderCircle,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
} from "lucide-react";
import AppShell, { Crumbs } from "@/components/AppShell";
import { Button } from "@/components/primitives";
import SaveState from "@/components/SaveState";
import { useUnsavedGuard } from "@/lib/nav";
import {
  contractDraftContent,
  contractDraftFingerprint,
  contractDraftQueryKey,
  contractDraftsQueryKey,
  createContractDraft,
  emptyContractDraft,
  errorMessage,
  getContractDraft,
  markContractDraftAccepted,
  resumableContractOutcomes,
  updateContractDraft,
  type ContractDraft,
  type ContractDraftStage,
} from "@/lib/contract-drafts";
import { acceptFreshContract } from "@/lib/contract-accept.functions";
import { draftContractFromPlan } from "@/lib/contract-draft.functions";
import { summariseRun, type ClauseDraftOutcome } from "@/lib/contract-draft";
import {
  deleteClause,
  insertClause,
  planProblems,
  renameClause,
  reorderClause,
  type ContractPlan,
} from "@/lib/contract-plan";
import { proposeContractPlan } from "@/lib/contract-plan.functions";
import { useApp } from "@/store/app";
import "./contract-drafting-screen.css";

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
  rows = 4,
  hint,
  required = false,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  hint?: string;
  required?: boolean;
  className?: string;
}) {
  const hintId = useId();
  return (
    <label className={`scripta-form-field ${className}`}>
      <span>{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={rows}
          required={required}
          aria-describedby={hint ? hintId : undefined}
        />
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          required={required}
          aria-describedby={hint ? hintId : undefined}
        />
      )}
      {hint && <small id={hintId}>{hint}</small>}
    </label>
  );
}

function Step({
  number,
  title,
  active,
  complete,
}: {
  number: number;
  title: string;
  active: boolean;
  complete: boolean;
}) {
  return (
    <li
      className={`contract-drafting-step${complete ? " is-complete" : ""}`}
      aria-current={active ? "step" : undefined}
    >
      <span className="contract-drafting-step-number" aria-hidden="true">
        {complete ? <Check size={14} /> : number}
      </span>
      <span>{title}</span>
      {complete && <span className="sr-only">(complete)</span>}
    </li>
  );
}

function Notice({ children, danger = false }: { children: ReactNode; danger?: boolean }) {
  const Icon = danger ? AlertCircle : Info;
  return (
    <div
      role={danger ? "alert" : "status"}
      className={`contract-drafting-notice${danger ? " is-error" : ""}`}
    >
      <Icon size={16} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

function PlanTable({
  plan,
  onChange,
}: {
  plan: ContractPlan;
  onChange: (plan: ContractPlan) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");
  const [position, setPosition] = useState(plan.clauses.length);

  const add = () => {
    if (!title.trim()) return;
    onChange(
      insertClause(plan, Math.min(position, plan.clauses.length), {
        title,
        purpose,
      }),
    );
    setAdding(false);
    setTitle("");
    setPurpose("");
    setPosition(plan.clauses.length + 1);
  };

  return (
    <div className="contract-drafting-plan">
      <div className="contract-drafting-plan-header" aria-hidden="true">
        <span>No.</span>
        <span>Clause type</span>
        <span>What it must accomplish</span>
        <span>Actions</span>
      </div>
      {plan.clauses.map((clause, index) => (
        <div key={`${clause.num}-${index}`} className="contract-drafting-plan-row">
          <span className="contract-drafting-clause-number">{clause.num}</span>
          <label className="scripta-form-field">
            <span className="contract-drafting-row-label">Clause type</span>
            <input
              aria-label={`Clause ${clause.num} title`}
              value={clause.title}
              onChange={(event) => onChange(renameClause(plan, index, event.target.value))}
            />
          </label>
          <p className="contract-drafting-purpose">
            <span className="contract-drafting-row-label">What it must accomplish</span>
            {clause.purpose || "No drafting purpose stated."}
          </p>
          <div className="contract-drafting-clause-actions">
            <button
              type="button"
              aria-label={`Move clause ${clause.num} up`}
              title="Move clause up"
              disabled={index === 0}
              onClick={() => onChange(reorderClause(plan, index, index - 1))}
              className="contract-drafting-icon-button"
            >
              <ArrowUp size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={`Move clause ${clause.num} down`}
              title="Move clause down"
              disabled={index === plan.clauses.length - 1}
              onClick={() => onChange(reorderClause(plan, index, index + 1))}
              className="contract-drafting-icon-button"
            >
              <ArrowDown size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={`Delete clause ${clause.num}`}
              title="Delete clause"
              onClick={() => onChange(deleteClause(plan, index))}
              className="contract-drafting-icon-button is-danger"
            >
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      ))}

      {adding ? (
        <form
          className="contract-drafting-add"
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <h2 className="scripta-section-title">Insert a clause</h2>
          <div className="contract-drafting-add-fields">
            <Field
              label="Clause type"
              value={title}
              onChange={setTitle}
              placeholder="Confidentiality"
              required
            />
            <Field
              className="contract-drafting-add-purpose"
              label="Drafting purpose"
              value={purpose}
              onChange={setPurpose}
              placeholder="What this clause must accomplish"
            />
            <label className="scripta-form-field">
              <span>Position</span>
              <select
                value={position}
                onChange={(event) => setPosition(Number(event.target.value))}
              >
                {plan.clauses.map((clause, index) => (
                  <option key={clause.num} value={index}>
                    Before clause {clause.num}
                  </option>
                ))}
                <option value={plan.clauses.length}>At the end</option>
              </select>
            </label>
          </div>
          <div className="scripta-page-actions contract-drafting-actions">
            <Button variant="quiet" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={!title.trim()}>
              Insert clause
            </Button>
          </div>
        </form>
      ) : (
        <div className="contract-drafting-insert">
          <Button
            variant="quiet"
            onClick={() => {
              setPosition(plan.clauses.length);
              setAdding(true);
            }}
          >
            <span className="contract-drafting-action-icon">
              <Plus size={16} aria-hidden="true" />
              Insert a clause
            </span>
          </Button>
        </div>
      )}
    </div>
  );
}

function OutcomeCard({
  clause,
  outcome,
  drafting,
  accepting,
  onRetry,
  onEdit,
}: {
  clause: ContractPlan["clauses"][number];
  outcome: ClauseDraftOutcome | undefined;
  drafting: boolean;
  accepting: boolean;
  onRetry: () => void;
  onEdit: (text: string) => void;
}) {
  const status = drafting ? "Drafting" : outcome?.ok ? "Ready" : outcome ? "Failed" : "Waiting";
  const StatusIcon = drafting ? LoaderCircle : outcome?.ok ? Check : outcome ? AlertCircle : Clock3;
  return (
    <article className="contract-drafting-outcome" aria-busy={drafting || accepting}>
      <div className="contract-drafting-outcome-heading">
        <span className="contract-drafting-clause-number">{clause.num}</span>
        <h2>{clause.title}</h2>
        <span className="contract-drafting-status" data-state={status.toLowerCase()}>
          <StatusIcon size={14} aria-hidden="true" />
          {status}
        </span>
      </div>
      {drafting ? (
        <p className="contract-drafting-outcome-copy">
          Drafting this clause from the approved plan…
        </p>
      ) : outcome?.ok ? (
        <label className="scripta-form-field">
          <span>Clause wording</span>
          <textarea
            aria-label={`Clause ${clause.num} wording`}
            value={outcome.text}
            onChange={(event) => onEdit(event.target.value)}
            rows={Math.min(14, Math.max(5, outcome.text.split("\n").length + 3))}
            disabled={accepting}
          />
        </label>
      ) : outcome ? (
        <div>
          <p className="contract-drafting-failure">{outcome.reason}</p>
          <Button onClick={onRetry} disabled={accepting}>
            <span className="contract-drafting-action-icon">
              <RotateCcw size={14} aria-hidden="true" />
              Retry this clause only
            </span>
          </Button>
        </div>
      ) : (
        <p className="contract-drafting-outcome-copy">Waiting for the drafting run.</p>
      )}
    </article>
  );
}

export default function ContractDraftingScreen({
  draftId,
  matterId,
}: {
  draftId?: string;
  /** Started from a matter: the new draft is filed to it from the outset. */
  matterId?: string | undefined;
}) {
  const { workspaceId } = useApp();
  return (
    <ContractDraftingEditor
      key={`${workspaceId}:${draftId ?? "new"}`}
      draftId={draftId}
      startMatterId={draftId ? undefined : matterId}
    />
  );
}

function ContractDraftingEditor({
  draftId,
  startMatterId,
}: {
  draftId?: string | undefined;
  startMatterId?: string | undefined;
}) {
  const { workspaceId, matters } = useApp();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const propose = useServerFn(proposeContractPlan);
  const draft = useServerFn(draftContractFromPlan);
  const accept = useServerFn(acceptFreshContract);

  const [stage, setStage] = useState<ContractDraftStage>("brief");
  const [matterId, setMatterId] = useState<string | null>(startMatterId ?? null);
  const [matterTitle, setMatterTitle] = useState("");
  const [agreementType, setAgreementType] = useState("");
  const [governingLaw, setGoverningLaw] = useState("");
  const [instructions, setInstructions] = useState("");
  const [plan, setPlan] = useState<ContractPlan | null>(null);
  const [outcomes, setOutcomes] = useState<ClauseDraftOutcome[]>([]);
  const [draftingNums, setDraftingNums] = useState<Set<string>>(new Set());
  const [proposing, setProposing] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [record, setRecord] = useState<ContractDraft | null>(null);
  const [hydrated, setHydrated] = useState(!draftId);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [written, setWritten] = useState(false);
  const initialFingerprint = draftId ? null : contractDraftFingerprint(emptyContractDraft());
  const [savedFingerprint, setSavedFingerprint] = useState(initialFingerprint);
  const savedRef = useRef(initialFingerprint);
  const idRef = useRef(draftId);
  const mounted = useRef(true);
  const inFlight = useRef<Promise<void> | null>(null);
  const acceptedDestination = useRef<string | null>(null);
  const acceptanceRecorded = useRef(false);
  const [pendingAcceptance, setPendingAcceptance] = useState<string | null>(null);
  const opened = useQuery({
    queryKey: contractDraftQueryKey(workspaceId, draftId),
    enabled: !!workspaceId && !!draftId,
    queryFn: () => getContractDraft(draftId!, workspaceId!),
    retry: false,
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!opened.isSuccess || opened.isFetching || !opened.data) return;
    const restored = opened.data;
    if (hydrated) {
      // A lifecycle change from another view must lock this editor, without
      // replacing wording that the lawyer is currently typing.
      setRecord((current) =>
        current &&
        (current.archivedAt !== restored.archivedAt ||
          current.acceptedAt !== restored.acceptedAt ||
          current.acceptedMatterId !== restored.acceptedMatterId)
          ? {
              ...current,
              archivedAt: restored.archivedAt,
              acceptedAt: restored.acceptedAt,
              acceptedMatterId: restored.acceptedMatterId,
              acceptedMatterName: restored.acceptedMatterName,
            }
          : current,
      );
      return;
    }
    setRecord(restored);
    setMatterId(restored.matterId);
    setMatterTitle(restored.title);
    setAgreementType(restored.agreementType);
    setGoverningLaw(restored.governingLaw);
    setInstructions(restored.instructions);
    setStage(restored.stage);
    setPlan(restored.plan);
    setOutcomes(
      restored.acceptedAt || restored.archivedAt
        ? restored.outcomes
        : resumableContractOutcomes(restored),
    );
    savedRef.current = contractDraftFingerprint(restored);
    setSavedFingerprint(savedRef.current);
    setHydrated(true);
  }, [hydrated, opened.data, opened.isSuccess, opened.isFetching]);

  const content = useMemo(
    () =>
      contractDraftContent({
        matterId,
        title: matterTitle,
        agreementType,
        governingLaw,
        instructions,
        stage,
        plan,
        outcomes,
      }),
    [matterId, matterTitle, agreementType, governingLaw, instructions, stage, plan, outcomes],
  );
  const fingerprint = contractDraftFingerprint(content);
  const latest = useRef({ content, fingerprint });
  latest.current = { content, fingerprint };
  const readOnly = !!(record?.acceptedAt || record?.archivedAt);
  const dirty = hydrated && !readOnly && savedFingerprint !== fingerprint;
  const ready = useRef(false);
  ready.current = hydrated && !readOnly && !pendingAcceptance;

  // As in clause Drafting: one serial writer, with a newer edit queued behind
  // the request in flight. The first insert's id is reused by every later save.
  const flushSave = useCallback(async () => {
    if (inFlight.current) return inFlight.current;
    if (!workspaceId) return;
    const operation = (async () => {
      while (ready.current && mounted.current) {
        const next = latest.current;
        if (savedRef.current === next.fingerprint) return;
        setSaving(true);
        setSaveError(null);
        try {
          const saved = idRef.current
            ? await updateContractDraft(idRef.current, workspaceId, next.content)
            : await createContractDraft(workspaceId, next.content);
          if (!mounted.current) return;
          idRef.current = saved.id;
          savedRef.current = next.fingerprint;
          setSavedFingerprint(next.fingerprint);
          setRecord(saved);
          setWritten(true);
          queryClient.setQueryData(contractDraftQueryKey(workspaceId, saved.id), saved);
          void queryClient.invalidateQueries({ queryKey: contractDraftsQueryKey(workspaceId) });
        } catch (cause) {
          if (mounted.current)
            setSaveError(errorMessage(cause, "The contract draft could not be saved."));
          throw cause;
        }
      }
    })();
    inFlight.current = operation;
    try {
      await operation;
    } finally {
      if (inFlight.current === operation) inFlight.current = null;
      if (mounted.current) setSaving(false);
    }
  }, [workspaceId, queryClient]);

  useEffect(() => {
    if (!dirty || pendingAcceptance) return;
    const timer = setTimeout(() => {
      void flushSave().catch(() => undefined);
    }, 1200);
    return () => clearTimeout(timer);
  }, [dirty, fingerprint, flushSave, pendingAcceptance]);

  // Wait for planning/drafting too: moving the fresh route earlier would
  // unmount the screen holding the server request's eventual result.
  useEffect(() => {
    if (
      draftId ||
      !record ||
      dirty ||
      saving ||
      proposing ||
      draftingNums.size ||
      accepting ||
      pendingAcceptance
    )
      return;
    void navigate({
      to: "/matters/contract-drafting/$draftId",
      params: { draftId: record.id },
      replace: true,
    });
  }, [
    draftId,
    record,
    dirty,
    saving,
    proposing,
    draftingNums.size,
    accepting,
    pendingAcceptance,
    navigate,
  ]);
  const unsavedDialog = useUnsavedGuard(
    dirty || !!pendingAcceptance,
    pendingAcceptance
      ? "The contract exists, but its draft's acceptance has not been recorded."
      : "This contract draft has unsaved changes.",
  );

  const problems = plan ? planProblems(plan) : [];
  const summary = useMemo(() => summariseRun(outcomes), [outcomes]);
  const readyToAccept =
    summary.complete && outcomes.every((outcome) => outcome.ok && outcome.text.trim().length > 0);

  const invalidatePlan = () => {
    setPlan(null);
    setOutcomes([]);
    setStage("brief");
  };

  const proposePlan = async () => {
    if (!workspaceId || !agreementType.trim() || !instructions.trim()) return;
    setProposing(true);
    setError(null);
    try {
      const next = await propose({
        data: {
          workspaceId,
          matterId,
          agreementType,
          governingLaw,
          instructions,
        },
      });
      setPlan(next);
      setOutcomes([]);
      setStage("plan");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The clause plan could not be proposed.");
    } finally {
      setProposing(false);
    }
  };

  const changePlan = (next: ContractPlan) => {
    setPlan(next);
    setOutcomes([]);
    setStage("plan");
    setError(null);
  };

  const draftAll = async () => {
    if (!workspaceId || !plan || problems.length) return;
    setStage("draft");
    setDraftingNums(new Set(plan.clauses.map((clause) => clause.num)));
    setOutcomes([]);
    setError(null);
    try {
      const result = await draft({ data: { workspaceId, matterId, plan } });
      setOutcomes(result.outcomes);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The drafting run failed.");
    } finally {
      setDraftingNums(new Set());
    }
  };

  const retry = async (num: string) => {
    if (!workspaceId || !plan) return;
    setDraftingNums((current) => new Set(current).add(num));
    setError(null);
    try {
      const result = await draft({
        data: { workspaceId, matterId, plan, onlyClauseNums: [num] },
      });
      const retried = result.outcomes[0];
      if (!retried) throw new Error(`Clause ${num} returned no outcome.`);
      setOutcomes((current) => current.map((outcome) => (outcome.num === num ? retried : outcome)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Clause ${num} could not be retried.`);
    } finally {
      setDraftingNums((current) => {
        const next = new Set(current);
        next.delete(num);
        return next;
      });
    }
  };

  const editOutcome = (num: string, text: string) =>
    setOutcomes((current) =>
      current.map((outcome) =>
        outcome.num === num && outcome.ok ? { ...outcome, text } : outcome,
      ),
    );

  const finishAcceptance = async (acceptedMatterId: string) => {
    if (!workspaceId || !idRef.current) return;
    const saved = await markContractDraftAccepted(idRef.current, workspaceId, acceptedMatterId);
    acceptanceRecorded.current = true;
    setRecord(saved);
    setPendingAcceptance(null);
    queryClient.setQueryData(contractDraftQueryKey(workspaceId, saved.id), saved);
    await queryClient.invalidateQueries();
    // Publish the clean acceptance state before the shared navigation guard runs.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    if (!mounted.current) return;
    await navigate({
      to: "/matters/$matterId",
      params: { matterId: acceptedMatterId },
      search: { screen: "review" },
    });
  };

  const acceptDraft = async () => {
    if (!workspaceId || !plan || !readyToAccept || !matterTitle.trim()) return;
    setAccepting(true);
    setError(null);
    try {
      // Flush the last wording edit before stamping the accepted snapshot.
      // If stamping fails, retry only that write; never accept a second matter.
      if (!acceptedDestination.current) {
        await flushSave();
        if (!idRef.current) throw new Error("Save the draft before accepting it.");
        const result = await accept({
          data: { workspaceId, matterId, matterTitle, plan, outcomes },
        });
        acceptedDestination.current = result.matterId;
        setPendingAcceptance(result.matterId);
      }
      await finishAcceptance(acceptedDestination.current);
    } catch (cause) {
      setError(
        acceptanceRecorded.current
          ? `The contract was accepted and saved. Open the accepted matter above. ${errorMessage(cause)}`
          : acceptedDestination.current
            ? `The contract was accepted. Its draft history still needs to be recorded. ${errorMessage(cause)}`
            : errorMessage(cause, "The contract could not be accepted."),
      );
    } finally {
      setAccepting(false);
    }
  };

  return (
    <AppShell
      section="contract-drafting"
      scroll={false}
      back={{ label: "Contract Drafting", href: "/matters/contract-drafting" }}
      breadcrumb={
        <Crumbs
          items={[
            { label: "Contract Drafting", to: "/matters/contract-drafting" },
            { label: matterTitle || "New contract" },
          ]}
        />
      }
      hideAssistant
    >
      <div className="scripta-page contract-drafting">
        <div className="contract-drafting-content">
          {!hydrated ? (
            <Notice danger={opened.isError || (opened.isSuccess && !opened.data)}>
              {opened.isError
                ? errorMessage(opened.error, "This contract draft could not be loaded.")
                : opened.isSuccess
                  ? "This contract draft is no longer available in this workspace."
                  : "Loading contract draft…"}
              {opened.isError && <Button onClick={() => void opened.refetch()}>Try again</Button>}
            </Notice>
          ) : (
            <>
              <div className="contract-drafting-note">
                {!readOnly && (
                  <SaveState
                    mode="auto"
                    status={
                      saveError ? "error" : saving || dirty ? "saving" : written ? "saved" : "idle"
                    }
                    error={saveError ?? undefined}
                  />
                )}
                {saveError && (
                  <Button disabled={saving} onClick={() => void flushSave().catch(() => undefined)}>
                    Retry save
                  </Button>
                )}
              </div>
              {record?.acceptedAt && (
                <Notice>
                  This draft was accepted {new Date(record.acceptedAt).toLocaleString()}.
                  {record.acceptedMatterId ? (
                    <Button
                      onClick={() =>
                        void navigate({
                          to: "/matters/$matterId",
                          params: { matterId: record.acceptedMatterId! },
                          search: { screen: "review" },
                        })
                      }
                    >
                      Open accepted matter
                    </Button>
                  ) : (
                    " The accepted matter is no longer available; the saved draft remains here as history."
                  )}
                </Notice>
              )}
              {record?.archivedAt && (
                <Notice>
                  This draft is archived. Restore it from Contract Drafting to continue editing.
                </Notice>
              )}
              {pendingAcceptance && (
                <Notice>
                  The contract has been created. Record its acceptance here before leaving this
                  draft.
                  <Button disabled={accepting} onClick={() => void acceptDraft()}>
                    Retry recording acceptance
                  </Button>
                </Notice>
              )}
              <fieldset
                className="contract-drafting-fieldset"
                disabled={readOnly || !!pendingAcceptance}
              >
                <legend className="sr-only">Contract draft</legend>
                <ol className="contract-drafting-steps" aria-label="Contract drafting progress">
                  <Step
                    number={1}
                    title="Describe"
                    active={stage === "brief"}
                    complete={stage !== "brief"}
                  />
                  <Step
                    number={2}
                    title="Approve the plan"
                    active={stage === "plan"}
                    complete={stage === "draft"}
                  />
                  <Step
                    number={3}
                    title="Review and accept"
                    active={stage === "draft"}
                    complete={false}
                  />
                </ol>

                {error && <Notice danger>{error}</Notice>}

                {stage === "brief" && (
                  <section aria-labelledby="contract-brief-title">
                    <div className="scripta-page-heading">
                      <div>
                        <p className="contract-drafting-context">Contract drafting</p>
                        <h1 id="contract-brief-title" className="scripta-page-title">
                          Describe the contract
                        </h1>
                        <p className="scripta-page-description">
                          Set out the transaction and the terms you need. Unknown facts stay as
                          named placeholders.
                        </p>
                      </div>
                    </div>
                    <p className="contract-drafting-note">
                      <Info size={16} aria-hidden="true" />
                      <span>
                        The AI proposes structure and wording for your review. Nothing is written to
                        a matter until you accept the complete draft.
                      </span>
                    </p>
                    {proposing && (
                      <Notice>
                        Proposing the clause plan… Your brief is held while the request completes.
                      </Notice>
                    )}
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (
                          workspaceId &&
                          matterTitle.trim() &&
                          agreementType.trim() &&
                          instructions.trim() &&
                          !proposing
                        )
                          void proposePlan();
                      }}
                      aria-busy={proposing}
                    >
                      <fieldset className="contract-drafting-fieldset" disabled={proposing}>
                        <legend className="sr-only">Contract brief</legend>
                        <section
                          className="scripta-section contract-drafting-section"
                          aria-labelledby="contract-matter-context-title"
                        >
                          <div>
                            <h2
                              id="contract-matter-context-title"
                              className="scripta-section-title"
                            >
                              Matter context
                            </h2>
                            <p className="contract-drafting-section-copy">
                              Name the contract and, if relevant, use the brief and playbook from an
                              existing matter.
                            </p>
                          </div>
                          <div className="contract-drafting-field-row">
                            <Field
                              label="Contract / matter title"
                              value={matterTitle}
                              onChange={(value) => {
                                setMatterTitle(value);
                                if (plan) invalidatePlan();
                              }}
                              placeholder="Consultancy agreement"
                              hint="Required. Used for the saved matter when no existing matter is selected."
                              required
                            />
                            <label className="scripta-form-field">
                              <span>Use context from</span>
                              <select
                                value={matterId ?? ""}
                                aria-describedby="contract-context-hint"
                                onChange={(event) => {
                                  setMatterId(event.target.value || null);
                                  if (plan) invalidatePlan();
                                }}
                              >
                                <option value="">No existing matter</option>
                                {matters.map((matter) => (
                                  <option key={matter.id} value={matter.id}>
                                    {matter.name}
                                  </option>
                                ))}
                              </select>
                              <small id="contract-context-hint">
                                An existing matter supplies its shared brief and playbook.
                                Acceptance refuses to replace existing clauses.
                              </small>
                            </label>
                          </div>
                        </section>
                        <section
                          className="scripta-section contract-drafting-section"
                          aria-labelledby="contract-instructions-title"
                        >
                          <div>
                            <h2 id="contract-instructions-title" className="scripta-section-title">
                              Drafting brief
                            </h2>
                            <p className="contract-drafting-section-copy">
                              Include the parties, commercial position and terms the agreement must
                              cover.
                            </p>
                          </div>
                          <div className="contract-drafting-fields">
                            <div className="contract-drafting-field-row">
                              <Field
                                label="Agreement type"
                                value={agreementType}
                                onChange={(value) => {
                                  setAgreementType(value);
                                  if (plan) invalidatePlan();
                                }}
                                placeholder="Services agreement"
                                hint="Required."
                                required
                              />
                              <Field
                                label="Governing law"
                                value={governingLaw}
                                onChange={(value) => {
                                  setGoverningLaw(value);
                                  if (plan) invalidatePlan();
                                }}
                                placeholder="Ghana"
                                hint="Optional. Leave blank if undecided; the planner will not choose one."
                              />
                            </div>
                            <Field
                              label="Lawyer's instructions"
                              value={instructions}
                              onChange={(value) => {
                                setInstructions(value);
                                if (plan) invalidatePlan();
                              }}
                              placeholder="Describe the parties by role, the transaction, commercial position and clauses the contract must cover."
                              hint="Required. Identify missing deal facts so they can remain as placeholders."
                              multiline
                              rows={8}
                              required
                            />
                            <div className="scripta-page-actions contract-drafting-actions">
                              <Button
                                variant="primary"
                                type="submit"
                                disabled={
                                  !workspaceId ||
                                  !matterTitle.trim() ||
                                  !agreementType.trim() ||
                                  !instructions.trim() ||
                                  proposing
                                }
                              >
                                <span className="contract-drafting-action-icon">
                                  <Sparkles size={14} aria-hidden="true" />
                                  {proposing ? "Proposing plan…" : "Propose clause plan"}
                                </span>
                              </Button>
                            </div>
                          </div>
                        </section>
                      </fieldset>
                    </form>
                  </section>
                )}

                {stage === "plan" && plan && (
                  <section aria-labelledby="contract-plan-title">
                    <div className="scripta-page-heading contract-drafting-heading">
                      <div>
                        <p className="contract-drafting-context">AI-proposed structure</p>
                        <h1 id="contract-plan-title" className="scripta-page-title">
                          {plan.agreementType}
                        </h1>
                        <p className="scripta-page-description">
                          {plan.governingLaw || "Governing law not supplied"} ·{" "}
                          {plan.clauses.length} clauses
                        </p>
                      </div>
                      <div className="scripta-page-actions">
                        <Button variant="quiet" onClick={() => setStage("brief")}>
                          <span className="contract-drafting-action-icon">
                            <ChevronLeft size={14} aria-hidden="true" />
                            Change the brief
                          </span>
                        </Button>
                        <Button
                          variant="primary"
                          disabled={problems.length > 0}
                          onClick={() => void draftAll()}
                        >
                          <span className="contract-drafting-action-icon">
                            <Sparkles size={14} aria-hidden="true" />
                            Draft every clause
                          </span>
                        </Button>
                      </div>
                    </div>
                    <p className="contract-drafting-note">
                      Review the clause types and purposes. Rename, reorder or insert clauses before
                      drafting.
                    </p>
                    {problems.length > 0 && <Notice danger>{problems.join(" ")}</Notice>}
                    <PlanTable plan={plan} onChange={changePlan} />
                  </section>
                )}

                {stage === "draft" && plan && (
                  <section aria-labelledby="contract-draft-title">
                    <div className="scripta-page-heading contract-drafting-heading">
                      <div>
                        <p className="contract-drafting-context">AI-proposed draft</p>
                        <h1 id="contract-draft-title" className="scripta-page-title">
                          Review every clause
                        </h1>
                        <p className="scripta-page-description" role="status">
                          {draftingNums.size
                            ? `${draftingNums.size} drafting`
                            : `${summary.drafted} drafted`}
                          {summary.failed.length ? ` · ${summary.failed.length} failed` : ""}
                        </p>
                      </div>
                      <div className="scripta-page-actions">
                        <Button
                          variant="quiet"
                          disabled={draftingNums.size > 0 || accepting}
                          onClick={() => {
                            setOutcomes([]);
                            setStage("plan");
                          }}
                        >
                          <span className="contract-drafting-action-icon">
                            <ChevronLeft size={14} aria-hidden="true" />
                            Edit the plan
                          </span>
                        </Button>
                        <Button
                          variant="primary"
                          disabled={
                            !readyToAccept ||
                            !matterTitle.trim() ||
                            accepting ||
                            draftingNums.size > 0
                          }
                          onClick={() => void acceptDraft()}
                        >
                          {accepting ? "Accepting…" : `Accept ${plan.clauses.length} clauses`}
                        </Button>
                      </div>
                    </div>
                    {!draftingNums.size && summary.failed.length > 0 && (
                      <Notice danger>
                        Retry the failed clauses individually. Successful clauses will not be
                        redrafted or billed again.
                      </Notice>
                    )}
                    {!readOnly && !pendingAcceptance && !draftingNums.size && readyToAccept && (
                      <Notice>
                        {accepting
                          ? "Saving the accepted draft to the matter…"
                          : "All clauses have wording. Read and edit them here; Accept is the first action that writes to the matter."}
                      </Notice>
                    )}
                    <div>
                      {plan.clauses.map((clause) => (
                        <OutcomeCard
                          key={clause.num}
                          clause={clause}
                          outcome={outcomes.find((outcome) => outcome.num === clause.num)}
                          drafting={draftingNums.has(clause.num)}
                          accepting={accepting}
                          onRetry={() => void retry(clause.num)}
                          onEdit={(text) => editOutcome(clause.num, text)}
                        />
                      ))}
                    </div>
                  </section>
                )}
              </fieldset>
            </>
          )}
        </div>
      </div>
      {unsavedDialog}
    </AppShell>
  );
}
