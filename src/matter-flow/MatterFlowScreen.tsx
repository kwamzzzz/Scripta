/**
 * Flow — the standalone screen on a mandate (wireframe 6a–6d).
 * The shell (rail, topbar, tab strip, Scripta Dialogue) is the existing
 * AppShell; only what sits between the tab strip and the Scripta panel is new.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import EditableName from "@/components/EditableName";
import { useApp } from "@/store/app";
import Thread from "@/components/Thread";
import AppShell, { Crumbs } from "@/components/AppShell";
import type { HostFrame } from "@/lib/host-frame";
import GeminiUsage from "@/components/GeminiUsage";
import FeedbackChip from "@/components/FeedbackChip";
import { Button } from "@/components/primitives";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import { TabRow } from "@/wireframe/screens";
import type { AssistantAction } from "@/lib/assistant";
import { guessFixture, type FixtureKind } from "./fixtures";
import {
  isEmailDeliverable,
  isoDate,
  uid,
  type DerivedDeliverable,
  type DerivedPhase,
  type Version,
} from "./model";
import { useMatterFlow } from "./store";
import { editorTarget, typeLabel, type EditorTarget } from "./editor-routes";
import { putFile } from "@/lib/files";
import { rememberThumbnail } from "@/lib/thumbnails";
import PhaseBar from "./PhaseBar";
import PhaseHeader from "./PhaseHeader";
import EmailWorkspace from "./EmailWorkspace";
import { DeliverableList, type RowIntent } from "./DeliverableRows";
import DeliverableRepository from "./DeliverableRepository";
import MatterTimeline from "./MatterTimeline";
import WaitingOnCard from "./WaitingOnCard";
import { EvidenceRail, EvidenceView } from "./EvidenceRail";
import {
  DatesDialog,
  DeliverableDialog,
  EvidenceDialog,
  FollowUpDialog,
  PhaseDialog,
} from "./dialogs";
import { Card, Eyebrow, FLOW, LinkAction, plural } from "./ui";
import { keepSource } from "./keep-version";
import { useSavePrecedent } from "@/components/SavePrecedent";
import { ApplyPresetDialog, SavePresetDialog } from "./presets/matter-dialogs";
import { renameFlow, type FlowKey } from "./flow-db";
import FileFlowDialog from "./FileFlowDialog";
import { useClients } from "@/components/client-choice";
import MatterUnavailable from "@/screens/MatterUnavailable";
import "./matter-flow.css";
import "./presets/presets.css";
import "@/components/organise.css";

export type FlowView = "checklist" | "repository" | "timeline";
export const FLOW_VIEWS: FlowView[] = ["checklist", "repository", "timeline"];

export type FlowSearch = {
  view?: FlowView | undefined;
  phase?: string | undefined;
  deliverable?: string | undefined;
  version?: string | undefined;
  fixture?: FixtureKind | undefined;
  /** An email deliverable opened for drafting; its threads sit under the draft. */
  email?: string | undefined;
  /** How a flow that was just created should begin: from a preset, or by asking Scripta. */
  start?: "preset" | "ask" | undefined;
};

const plusDays = (iso: string, days: number) => {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return isoDate(d);
};

export default function MatterFlowScreen({
  flowKey,
  search,
  setSearch,
  frame,
}: {
  flowKey: FlowKey;
  search: FlowSearch;
  setSearch: (patch: Partial<FlowSearch>) => void;
  /** The client or matter this flow is open inside; absent for a standalone flow. */
  frame?: HostFrame;
}) {
  const { matter: routeMatter, workspaceId: currentWorkspaceId } = useApp();
  const navigate = useNavigate();
  const keyMatterId = "matterId" in flowKey ? flowKey.matterId : null;
  // The app store falls back to the workspace's first matter when the route
  // names none, so it is only this flow's matter when the ids agree.
  const guessFrom = keyMatterId && routeMatter?.id === keyMatterId ? routeMatter : null;
  const fixture = search.fixture ?? guessFixture(guessFrom);
  const store = useMatterFlow(flowKey, fixture);
  const { head } = store;
  const queryClient = useQueryClient();
  const matterId = head?.matterId ?? keyMatterId;
  const matter = matterId && routeMatter?.id === matterId ? routeMatter : null;
  const workspaceId = head?.workspaceId ?? currentWorkspaceId;
  const clients = useClients();
  const clientName = head?.clientId
    ? (clients.data?.find((c) => c.id === head.clientId)?.name ?? null)
    : null;
  // A flow filed to a matter keeps its files under the matter, which is what
  // lets Phase 3 gate the bucket on matter membership. A flow filed to no
  // matter keeps them under the flow, and the storage policy asks the flow —
  // so filing it later brings every file along without moving one.
  const fileHome = useMemo(
    () => ({
      workspaceId: workspaceId ?? "",
      matterId,
      flowId: matterId ? null : (store.flowId ?? null),
    }),
    [workspaceId, matterId, store.flowId],
  );
  const { record, flow, today } = store;
  const isAction = record.kind === "action";
  /** A filed flow may carry its own name; one that never had one reads as its matter. */
  const flowName = head?.name || matter?.name || (matterId ? "Matter" : "Untitled flow");
  /** The Organise dialog, opened on the tab the lawyer reached for. */
  const [organising, setOrganising] = useState<"client" | "matter" | null>(null);

  // A flow that was just created may have asked to begin somewhere.
  const [askRequest, setAskRequest] = useState<{ id: string; text: string } | null>(null);
  useEffect(() => {
    if (!search.start || !store.flowId) return;
    if (search.start === "preset") setPresetDialog("apply");
    if (search.start === "ask")
      setAskRequest({
        id: `structure-${store.flowId}`,
        text: `Help me structure "${flowName}" into phases and deliverables. The work is: `,
      });
    setSearch({ start: undefined });
    // Only the arrival matters; the flow's name settling later must not re-ask.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.start, store.flowId]);

  const view: FlowView = search.view ?? "checklist";
  const phase =
    flow.phases.find((p) => p.id === search.phase) ?? flow.activePhase ?? flow.phases[0] ?? null;
  const focusId = search.deliverable ?? null;

  // A final version is drafting that made it all the way out. Keeping it is
  // offered here because this is where the lawyer is when it becomes final.
  const precedent = useSavePrecedent();
  const keepVersion = async (deliverable: DerivedDeliverable, version: Version) => {
    const source = keepSource(deliverable);
    if (!source.ok) return;
    const body = await source.load();
    precedent.save({
      title: deliverable.name,
      body,
      kind: "document",
      sourceKind: "flow",
      agreementType: typeLabel(deliverable),
      counterpartyType: deliverable.counterparty ?? matter?.counterparty ?? "",
      sourceNote: `Final version ${version.label} on ${matter?.name ?? flowName}`,
      ...(matterId ? { matterId } : {}),
      usedAt: version.createdAt,
    });
  };

  // A deliverable that needs doing, put on the task list. Joined, not copied:
  // the task holds the deliverable's id, and asking twice does not make two.
  const [taskNote, setTaskNote] = useState<string | null>(null);
  const raiseTask = useCallback(
    async (d: DerivedDeliverable) => {
      if (!workspaceId) return;
      try {
        const { taskFor } = await import("@/lib/tasks/data");
        const { seedFromDeliverable } = await import("@/lib/tasks/from-flow");
        const { created } = await taskFor(workspaceId, seedFromDeliverable(d, matterId));
        setTaskNote(
          created
            ? `“${d.name}” is on your task list.`
            : `“${d.name}” is already on your task list.`,
        );
      } catch (cause) {
        setTaskNote((cause as Error).message);
      }
    },
    [workspaceId, matterId],
  );

  const [phaseDialog, setPhaseDialog] = useState<{ phase: DerivedPhase | null } | null>(null);
  const [deliverableDialog, setDeliverableDialog] = useState<{
    deliverable: DerivedDeliverable | null;
  } | null>(null);
  const [evidenceFor, setEvidenceFor] = useState<{
    deliverable: DerivedDeliverable;
    preset?: "call";
  } | null>(null);
  const [datesFor, setDatesFor] = useState<DerivedDeliverable | null>(null);
  const [followUpFor, setFollowUpFor] = useState<DerivedDeliverable | null>(null);
  const [presetDialog, setPresetDialog] = useState<"apply" | "save" | null>(null);
  const [presetNotice, setPresetNotice] = useState<string | null>(null);
  const { confirmDelete, confirmDialog } = useConfirmDelete();

  /** What removing these deliverables takes with them, counted off the store. */
  const carried = (items: DerivedDeliverable[]) => {
    const versions = items.reduce((n, d) => n + d.versions.length, 0);
    const evidence = items.reduce((n, d) => n + d.evidence.length, 0);
    const emails = items.filter((d) => d.emailDraft).length;
    const replies = items.reduce((n, d) => n + d.threads.length, 0);
    const parts = [
      versions ? plural(versions, "version") : "",
      evidence ? plural(evidence, "piece of evidence", "pieces of evidence") : "",
      emails ? plural(emails, "email draft") : "",
      replies ? plural(replies, "logged reply", "logged replies") : "",
    ].filter(Boolean);
    return parts.length < 2
      ? (parts[0] ?? "")
      : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
  };

  /**
   * A phase takes everything under it — its deliverables, and with them every
   * version, piece of evidence and email draft logged against them.
   */
  const askRemovePhase = async (target: DerivedPhase) => {
    const items = target.deliverables;
    const withThem = carried(items);
    if (
      !(await confirmDelete({
        what: `“${target.name}”`,
        consequence: items.length
          ? `Everything in it goes too: ${plural(items.length, "deliverable")}${
              withThem ? `, with their ${withThem}` : ""
            }.`
          : "Nothing is owed in it yet.",
        archivable: false,
        binned: false,
      }))
    )
      return;
    const fallback = flow.phases.find((p) => p.id !== target.id);
    store.removePhase(target.id);
    setPhaseDialog(null);
    setSearch({ phase: fallback?.id, deliverable: undefined, version: undefined });
  };

  const askRemoveDeliverable = async (target: DerivedDeliverable) => {
    const withIt = carried([target]);
    if (
      !(await confirmDelete({
        what: `“${target.name}”`,
        ...(withIt ? { consequence: `Its ${withIt} go with it.` } : {}),
        archivable: false,
        binned: false,
      }))
    )
      return;
    store.removeDeliverable(target.id);
    setDeliverableDialog(null);
  };

  const go = useCallback(
    (target: EditorTarget) =>
      void navigate({
        to: target.to as never,
        ...(target.params ? { params: target.params as never } : {}),
        ...(target.search ? { search: target.search as never } : {}),
      }),
    [navigate],
  );

  const onIntent = useCallback(
    (intent: RowIntent) => {
      const d = intent.deliverable;
      switch (intent.type) {
        case "email":
          return setSearch({ view: "checklist", phase: d.phaseId, email: d.id });
        case "open": {
          if (isEmailDeliverable(d))
            return setSearch({ view: "checklist", phase: d.phaseId, email: d.id });
          const target = editorTarget(d, matterId);
          if (target && d.finalVersion) return go(target);
          const version = d.finalVersion ?? d.versions.at(-1) ?? null;
          return setSearch({
            view: "repository",
            phase: d.phaseId,
            deliverable: d.id,
            version: version?.id,
          });
        }
        case "attach":
          return setSearch({ view: "repository", phase: d.phaseId, deliverable: d.id });
        case "evidence":
          if (d.complete)
            return setSearch({ view: "repository", phase: d.phaseId, deliverable: d.id });
          return setEvidenceFor({ deliverable: d });
        case "follow-up":
          return setFollowUpFor(d);
        case "schedule":
          return setDatesFor(d);
        case "task":
          return void raiseTask(d);
      }
    },
    [go, matterId, setSearch, raiseTask],
  );

  const handlers = useMemo(
    () => ({
      onTick: (d: DerivedDeliverable) => store.setTicked(d.id, !d.ticked),
      onIntent,
      onEdit: (d: DerivedDeliverable) => setDeliverableDialog({ deliverable: d }),
    }),
    [store, onIntent],
  );

  const onAssistantAction = useCallback(
    (action: AssistantAction) => {
      const args = action.args ?? {};
      const find = (id: string | undefined) =>
        flow.phases.flatMap((p) => p.deliverables).find((x) => x.id === id);
      switch (action.command) {
        case "open_deliverable": {
          const d = find(args["deliverableId"]);
          if (d) onIntent({ type: "open", deliverable: d });
          return;
        }
        case "open_view":
          if (FLOW_VIEWS.includes(args["view"] as FlowView))
            setSearch({ view: args["view"] as FlowView });
          return;
        case "follow_up": {
          const d = find(args["deliverableId"]);
          if (d) setFollowUpFor(d);
          return;
        }
        default:
          return;
      }
    },
    [flow, onIntent, setSearch],
  );

  /** Store the file, then record the version (with its thumbnail) against the deliverable. */
  const attach = useCallback(
    async (deliverableId: string, file: File, thumb: { src: string; pages?: number } | null) => {
      const versionId = uid("ver");
      const fileRef = await putFile(versionId, file, file.name, fileHome);
      if (thumb) rememberThumbnail(versionId, thumb.src);
      store.attachVersion(deliverableId, {
        id: versionId,
        fileRef,
        createdAt: new Date().toISOString(),
        note: file.name.replace(/\.[^.]+$/, ""),
        ...(thumb ? { thumbnailRef: thumb.src, pages: thumb.pages } : {}),
      });
    },
    [store, fileHome],
  );

  const nextPhase = phase ? flow.phases[flow.phases.findIndex((p) => p.id === phase.id) + 1] : null;
  const closeBlocked =
    !phase || phase.deliverables.length === 0 || phase.mandatoryOutstanding > 0 || !nextPhase;
  const closePhase = phase && (
    <button
      type="button"
      onClick={() => nextPhase && setSearch({ phase: nextPhase.id, deliverable: undefined })}
      disabled={closeBlocked}
      title={
        phase.deliverables.length === 0
          ? "Add the phase's deliverables before closing it"
          : phase.mandatoryOutstanding > 0
            ? `${phase.mandatoryOutstanding} mandatory ${isAction ? "action" : "deliverable"}${phase.mandatoryOutstanding === 1 ? "" : "s"} still outstanding`
            : nextPhase
              ? `Every mandatory ${isAction ? "action" : "deliverable"} is complete — move on to ${nextPhase.name}`
              : "This is the last phase"
      }
      style={{
        border: `1px solid ${FLOW.greenEdge}`,
        background: "#fff",
        color: FLOW.green,
        borderRadius: 6,
        padding: "6px 14px",
        fontSize: 12,
        cursor: closeBlocked ? "default" : "pointer",
        opacity: closeBlocked ? 0.55 : 1,
        font: "inherit",
        whiteSpace: "nowrap",
      }}
    >
      Close phase
    </button>
  );

  const waiting = phase?.deliverables.find((d) => d.state === "waiting_on") ?? null;
  const summary = phase
    ? isAction
      ? [
          `${phase.completeCount} of ${phase.deliverables.length} actions done`,
          waiting
            ? `1 waiting on ${waiting.waitingOn?.who.split(" — ")[0] ?? "a third party"}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : `${phase.completeCount} of ${phase.deliverables.length} deliverables complete`
    : "";

  const openPhaseDialog = (p: DerivedPhase | null) => setPhaseDialog({ phase: p });

  /** The email deliverable whose draft is open, if the URL names one. */
  const emailDeliverable =
    flow.phases
      .flatMap((p) => p.deliverables)
      .find((d) => d.id === search.email && isEmailDeliverable(d)) ?? null;

  const body = emailDeliverable ? (
    <EmailWorkspace
      key={emailDeliverable.id}
      deliverable={emailDeliverable}
      record={record}
      store={store}
      onBack={() => setSearch({ email: undefined })}
    />
  ) : !phase ? (
    <div className="mf-body">
      <Card style={{ maxWidth: 560, padding: "18px 20px", gap: 10 }}>
        <Eyebrow>SCOPE OF SERVICES</Eyebrow>
        <div style={{ fontSize: 15, fontWeight: 600 }}>
          {matterId && !head?.name ? "This matter has no phases yet." : "No phases yet."}
        </div>
        <div style={{ color: FLOW.grey, fontSize: 12.5, lineHeight: 1.55 }}>
          Start from a preset if this is work you have run before — it lays out the phases, what
          each owes and the uploads it expects, dated from the start. Otherwise add one phase per
          scope-of-services item, or describe the work to Scripta and plan it together.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
          <Button variant="primary" onClick={() => setPresetDialog("apply")}>
            Start from a preset
          </Button>
          <Button onClick={() => openPhaseDialog(null)}>Add the first phase</Button>
          <Button
            onClick={() =>
              setAskRequest({
                id: `structure-${store.flowId ?? "new"}-${Date.now()}`,
                text: `Help me structure "${flowName}" into phases and deliverables. The work is: `,
              })
            }
          >
            Ask Scripta
          </Button>
          {matterId && (
            <>
              <Button onClick={() => setSearch({ fixture: "document", phase: undefined })}>
                Load sample document matter
              </Button>
              <Button onClick={() => setSearch({ fixture: "action", phase: undefined })}>
                Load sample action matter
              </Button>
            </>
          )}
        </div>
      </Card>
    </div>
  ) : view === "timeline" ? (
    <div className="mf-body">
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0, lineHeight: 1.3 }}>
            {matterId ? "Whole matter" : "Whole flow"}
          </h1>
          <div style={{ color: FLOW.muted, fontSize: 12, marginTop: 2 }}>
            Timeline · every {isAction ? "action" : "deliverable"} by phase, plotted against its
            deadline
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <Legend />
      </div>
      <MatterTimeline
        flow={flow}
        today={today}
        onOpen={(d) =>
          setSearch({ view: "checklist", phase: d.phaseId, deliverable: d.id, version: undefined })
        }
      />
    </div>
  ) : view === "repository" ? (
    isAction ? (
      <div className="mf-body">
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0, lineHeight: 1.3 }}>
              {phase.name}
            </h1>
            <div style={{ color: FLOW.muted, fontSize: 12, marginTop: 2 }}>
              Evidence · what proves each action in this phase was done
            </div>
          </div>
          <div style={{ flex: 1 }} />
        </div>
        <EvidenceView
          phase={phase}
          highlightId={focusId}
          onAdd={(d) => setEvidenceFor({ deliverable: d })}
        />
      </div>
    ) : (
      <div className="mf-body" style={{ overflow: "hidden" }}>
        <DeliverableRepository
          phase={phase}
          matterId={matterId}
          focusId={focusId}
          selectedVersionId={search.version ?? null}
          onSelectVersion={(id) => setSearch({ version: id ?? undefined })}
          onAttach={({ deliverableId, file }, thumb) => void attach(deliverableId, file, thumb)}
          onSetFinal={store.setFinal}
          onSetTag={store.setVersionTag}
          onKeepVersion={(d, v) => void keepVersion(d, v)}
          onOpenEditor={go}
          onAddEvidence={(d) => setEvidenceFor({ deliverable: d })}
          onOpenEmail={(d) => onIntent({ type: "email", deliverable: d })}
          viewControl={null}
        />
      </div>
    )
  ) : (
    <div className="mf-body">
      <PhaseHeader phase={phase} summary={summary} onEdit={() => openPhaseDialog(phase)} />
      {isAction ? (
        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr 1fr", gap: 12 }}>
          <Card>
            <Eyebrow>WHO WE ARE DEALING WITH</Eyebrow>
            {record.contacts.length === 0 && (
              <div style={{ color: FLOW.muted, fontSize: 12 }}>No contacts logged yet.</div>
            )}
            {record.contacts.map((c) => (
              <div
                key={c.name}
                style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 12.5 }}
              >
                <span
                  style={{
                    flex: "none",
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    background: "#eeeeee",
                    color: FLOW.grey,
                    font: "600 9px Inter, system-ui, sans-serif",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {c.initials}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                  >
                    {c.name}
                  </div>
                  <div style={{ color: FLOW.muted, fontSize: 11, whiteSpace: "nowrap" }}>
                    {c.org}
                  </div>
                </div>
                <div style={{ flex: 1 }} />
                <span style={{ color: FLOW.muted, fontSize: 11, whiteSpace: "nowrap" }}>
                  {c.last}
                </span>
              </div>
            ))}
          </Card>
          <WaitingOnCard
            deliverable={waiting}
            today={today}
            onFollowUp={(d) => setFollowUpFor(d)}
            onLogCall={(d) => setEvidenceFor({ deliverable: d, preset: "call" })}
          />
          <EvidenceRail phase={phase} />
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Card>
            <Eyebrow>WHAT THIS PHASE DOES</Eyebrow>
            {phase.steps.length === 0 && (
              <div style={{ color: FLOW.muted, fontSize: 12 }}>
                No steps recorded for this phase. Edit the phase to paste them from the scope of
                services.
              </div>
            )}
            {phase.steps.map((s, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  fontSize: 12.5,
                  lineHeight: 1.5,
                  color: "#333",
                }}
              >
                <span
                  style={{
                    flex: "none",
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: FLOW.orangeLight,
                    color: FLOW.orangeText,
                    font: "600 10px Inter, system-ui, sans-serif",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginTop: 1,
                  }}
                >
                  {i + 1}
                </span>
                <span>{s}</span>
              </div>
            ))}
          </Card>
          <Card>
            <Eyebrow>PARTIES IN THIS PHASE</Eyebrow>
            {record.parties.length === 0 && (
              <div style={{ color: FLOW.muted, fontSize: 12 }}>
                {matter?.client || matter?.counterparty ? null : "No parties recorded yet."}
              </div>
            )}
            {record.parties.length === 0 && matter?.client && (
              <PartyRow name={matter.client} role="Client" />
            )}
            {record.parties.length === 0 && matter?.counterparty && (
              <PartyRow name={matter.counterparty} role="Counterparty" />
            )}
            {record.parties.map((p) => (
              <PartyRow key={p.name} name={p.name} role={p.role} />
            ))}
          </Card>
        </div>
      )}
      <DeliverableList
        phase={phase}
        kind={record.kind}
        today={today}
        highlightId={focusId}
        controls={null}
        onAdd={() => setDeliverableDialog({ deliverable: null })}
        handlers={handlers}
        onReorder={(ids) => store.reorderDeliverables(phase.id, ids)}
      />
      {/* A phase is a container, so entity_owner() returns null for it and
          resolution falls to the raiser and the Lead. The responsibility inside
          a phase sits on its deliverables, each of which carries its own
          thread. */}
      <div style={{ marginTop: 18, borderTop: `1px solid ${FLOW.line}`, paddingTop: 16 }}>
        <Thread
          kind="flow_phase"
          entityId={phase.id}
          workspaceId={workspaceId}
          title={`Discussion — ${phase.name}`}
          blurb="Questions and decisions about this phase as a whole."
        />
      </div>
    </div>
  );

  if (store.unavailable) return <MatterUnavailable what="flow" />;

  return (
    <AppShell
      section={frame?.section ?? "matter-flow"}
      scroll={false}
      back={frame?.back ?? { label: "Flow", href: "/matters/flow" }}
      trackLabel={`${flowName} · Flow`}
      hostTabs={frame?.tabs}
      topbar={
        <>
          <Crumbs
            items={[
              ...(frame?.crumbs ?? [{ label: "Flow", to: "/matters/flow" }]),
              {
                // The flow's own name, renamed where it is read. A matter's
                // flow with no name of its own shows the matter's until named.
                label: store.flowId ? (
                  <EditableName
                    label="flow"
                    value={flowName}
                    onSave={async (name) => {
                      try {
                        await renameFlow(store.flowId!, name);
                        await store.refreshHead();
                        void queryClient.invalidateQueries({ queryKey: ["matter-file"] });
                        return true;
                      } catch {
                        return false;
                      }
                    }}
                  />
                ) : (
                  flowName
                ),
              },
            ]}
          />
          <div style={{ flex: 1 }} />
          <FeedbackChip screen={`${flowName} · Flow`} />
          <GeminiUsage />
        </>
      }
      tabs={
        <TabRow<FlowView>
          tabs={[
            { id: "checklist", label: isAction ? "Actions" : "Checklist" },
            { id: "repository", label: isAction ? "Evidence" : "Repository" },
            { id: "timeline", label: "Timeline" },
          ]}
          active={view}
          onChange={(v) => setSearch({ view: v, deliverable: undefined, version: undefined })}
          // Presets act on the flow's phases, so they sit with the flow's own
          // controls rather than competing for room in the breadcrumb bar.
          right={
            <span style={{ display: "inline-flex", alignItems: "center", gap: 16 }}>
              {head && !head.matterId && (
                <LinkAction onClick={() => setOrganising("client")} style={{ color: FLOW.muted }}>
                  Organise
                </LinkAction>
              )}
              {flow.phases.length > 0 && (
                <>
                  <LinkAction
                    onClick={() => setPresetDialog("apply")}
                    style={{ color: FLOW.muted }}
                  >
                    Add from preset
                  </LinkAction>
                  <LinkAction onClick={() => setPresetDialog("save")} style={{ color: FLOW.muted }}>
                    Save as preset
                  </LinkAction>
                </>
              )}
              {closePhase}
            </span>
          }
        />
      }
      assistant={{
        key: `flow.${store.flowId ?? matterId ?? "new"}`,
        label: `${flowName} — flow`,
        matterId,
        screen: "Flow",
        ...(askRequest ? { composerRequest: askRequest } : {}),
        intro: isAction
          ? "Ask what is waiting on whom, or have me draft the next follow-up from what is logged."
          : "Ask what is blocking a deliverable, or what has to happen before this phase can close.",
        suggestions: phase
          ? [
              isAction
                ? `What is outstanding in ${phase.name}?`
                : `What is blocking the ${phase.name.toLowerCase()} deliverables?`,
              "What has to happen before this phase can close?",
            ]
          : [
              matterId
                ? "Which phases should this matter have, from the proposal?"
                : "Which phases should this work have?",
            ],
        onAction: onAssistantAction,
      }}
    >
      <div className="mf-screen">
        {head && (
          <FlowFiling
            matterId={head.matterId}
            matterName={matter?.name ?? null}
            matterClient={matter?.client ?? null}
            clientId={head.clientId}
            clientName={clientName}
            onOrganise={() => setOrganising(head.clientId ? "matter" : "client")}
          />
        )}
        {flow.phases.length > 0 && phase && (
          <PhaseBar
            flow={flow}
            selectedId={phase.id}
            onSelect={(id) => setSearch({ phase: id, deliverable: undefined, version: undefined })}
            onAdd={() => openPhaseDialog(null)}
            onRename={(title) => store.setPhasesTitle(title)}
          />
        )}
        {/* A flow that is not being kept must say so. `store.error` has been
            returned since the flow moved server-side and nothing has ever
            rendered it, so a read that failed, a write that was refused and a
            flow saving perfectly all looked exactly the same on screen. */}
        {store.error && (
          <div className="mf-save-error" role="alert">
            <strong>This flow is not being saved.</strong>
            <span>{store.error}</span>
            <LinkAction onClick={() => window.location.reload()} style={{ color: FLOW.red }}>
              Reload
            </LinkAction>
          </div>
        )}
        {!store.error && !store.loading && !store.persisted && (
          <div className="mf-save-error" role="alert">
            <strong>This flow is not being saved.</strong>
            <span>
              It has no record yet, so nothing typed here is being kept. Reload the page; if it says
              this again, the flow could not be created.
            </span>
            <LinkAction onClick={() => window.location.reload()} style={{ color: FLOW.red }}>
              Reload
            </LinkAction>
          </div>
        )}
        {presetNotice && (
          <div className="mf-preset-notice" role="status">
            <span>{presetNotice}</span>
            <LinkAction onClick={() => setPresetNotice(null)} style={{ color: FLOW.grey }}>
              Dismiss
            </LinkAction>
          </div>
        )}
        {body}
      </div>

      {phaseDialog && (
        <PhaseDialog
          key={phaseDialog.phase?.id ?? "new"}
          open
          initial={phaseDialog.phase ?? undefined}
          defaultDeadline={plusDays(phase?.deadline ?? today, 28)}
          onClose={() => setPhaseDialog(null)}
          onSave={(input) => {
            if (phaseDialog.phase) store.updatePhase(phaseDialog.phase.id, input);
            else {
              const id = store.addPhase(input);
              setSearch({ phase: id, deliverable: undefined, version: undefined });
            }
          }}
          onMove={
            phaseDialog.phase
              ? {
                  earlier:
                    flow.phases.findIndex((p) => p.id === phaseDialog.phase!.id) > 0
                      ? () => store.movePhase(phaseDialog.phase!.id, -1)
                      : undefined,
                  later:
                    flow.phases.findIndex((p) => p.id === phaseDialog.phase!.id) <
                    flow.phases.length - 1
                      ? () => store.movePhase(phaseDialog.phase!.id, 1)
                      : undefined,
                }
              : undefined
          }
          onDelete={phaseDialog.phase ? () => void askRemovePhase(phaseDialog.phase!) : undefined}
        />
      )}
      {deliverableDialog && phase && (
        <DeliverableDialog
          key={deliverableDialog.deliverable?.id ?? "new"}
          open
          initial={deliverableDialog.deliverable ?? undefined}
          defaultKind={record.kind}
          today={today}
          matterId={matterId}
          phaseDeadline={phase.deadline}
          onClose={() => setDeliverableDialog(null)}
          onSave={(input) => {
            if (deliverableDialog.deliverable)
              store.updateDeliverable(deliverableDialog.deliverable.id, input);
            else store.addDeliverable({ ...input, phaseId: phase.id });
          }}
          onDelete={
            deliverableDialog.deliverable
              ? () => void askRemoveDeliverable(deliverableDialog.deliverable!)
              : undefined
          }
        />
      )}
      {evidenceFor && (
        <EvidenceDialog
          key={evidenceFor.deliverable.id}
          open
          deliverableName={evidenceFor.deliverable.name}
          preset={evidenceFor.preset}
          onClose={() => setEvidenceFor(null)}
          onAdd={({ file, ...input }) => {
            const id = uid("ev");
            if (!file) {
              store.addEvidence(evidenceFor.deliverable.id, { ...input, id });
              return;
            }
            void putFile(id, file, file.name, fileHome).then((fileRef) =>
              store.addEvidence(evidenceFor.deliverable.id, { ...input, id, fileRef }),
            );
          }}
        />
      )}
      {datesFor && (
        <DatesDialog
          key={datesFor.id}
          open
          title={`Schedule ${datesFor.name}`}
          start={datesFor.start}
          deadline={datesFor.deadline}
          onClose={() => setDatesFor(null)}
          onSave={(start, deadline) => store.redate(datesFor.id, start, deadline)}
        />
      )}
      {presetDialog === "apply" && (
        <ApplyPresetDialog
          open
          today={today}
          hasPhases={flow.phases.length > 0}
          onClose={() => setPresetDialog(null)}
          onApply={(body, options) => {
            store.applyPreset(body, options);
            setPresetNotice(null);
            setSearch({ phase: undefined, deliverable: undefined, version: undefined });
          }}
        />
      )}
      {presetDialog === "save" && (
        <SavePresetDialog
          open
          record={record}
          matterName={flowName}
          onClose={() => setPresetDialog(null)}
          onSaved={(name) => setPresetNotice(`Saved as the preset "${name}".`)}
        />
      )}
      {followUpFor && (
        <FollowUpDialog
          key={followUpFor.id}
          open
          who={followUpFor.waitingOn?.who ?? followUpFor.name}
          initial={
            followUpFor.waitingOn?.followUpAt ??
            followUpFor.waitingOn?.expectedBy ??
            isoDate(new Date())
          }
          onClose={() => setFollowUpFor(null)}
          onSave={(date) => store.scheduleFollowUp(followUpFor.id, date)}
        />
      )}
      {taskNote && (
        <div role="status" className="mf-task-note">
          {taskNote}
          <button type="button" onClick={() => setTaskNote(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
      {organising && head && !head.matterId && (
        <FileFlowDialog
          open
          head={head}
          flowName={flowName}
          clientName={clientName}
          initial={organising}
          onClose={() => setOrganising(null)}
          onFiled={async () => {
            await store.refreshHead();
            // Filed work lives in its client or matter; its own address sends it there.
            if (store.flowId)
              void navigate({
                to: "/flows/$flowId",
                params: { flowId: store.flowId },
                replace: true,
              });
          }}
        />
      )}
      {precedent.dialog}
      {confirmDialog}
    </AppShell>
  );
}

/**
 * Where this flow is filed, in one quiet line: its matter and client, its
 * client alone, or nothing yet — with the way to organise it when it is not in
 * a matter. Who can open it follows from that, so the line says so.
 */
function FlowFiling({
  matterId,
  matterName,
  matterClient,
  clientId,
  clientName,
  onOrganise,
}: {
  matterId: string | null;
  matterName: string | null;
  matterClient: string | null;
  clientId: string | null;
  clientName: string | null;
  onOrganise: () => void;
}) {
  if (matterId)
    return (
      <div className="org-filing mf-filing">
        <span>Matter flow</span>
        <span aria-hidden>·</span>
        <Link to="/matters/$matterId" params={{ matterId }} search={{ screen: "matter" } as never}>
          {matterName ?? "Open the matter"}
        </Link>
        {matterClient && (
          <>
            <span aria-hidden>·</span>
            <span>{matterClient}</span>
          </>
        )}
      </div>
    );
  return (
    <div className="org-filing mf-filing">
      {clientId ? (
        <>
          <span>Client flow</span>
          <span aria-hidden>·</span>
          <Link to={"/clients/$clientId" as never} params={{ clientId } as never}>
            {clientName ?? "Client"}
          </Link>
        </>
      ) : (
        <span>Standalone flow</span>
      )}
      <span aria-hidden>·</span>
      <span>Private to you</span>
      <button type="button" className="org-link" onClick={onOrganise}>
        {clientId ? "File to a matter" : "Organise"}
      </button>
    </div>
  );
}

function PartyRow({ name, role }: { name: string; role: string }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 12.5 }}>
      <span
        style={{ flex: "none", width: 8, height: 8, borderRadius: "50%", background: "#c6c6c6" }}
      />
      <span style={{ minWidth: 0 }}>{name}</span>
      <div style={{ flex: 1 }} />
      <span style={{ color: FLOW.muted, fontSize: 11.5, whiteSpace: "nowrap" }}>{role}</span>
    </div>
  );
}

function Legend() {
  const items = [
    { label: "Complete", color: FLOW.greenBar },
    { label: "In progress", color: FLOW.orange },
    { label: "Overdue", color: FLOW.red },
    { label: "Planned", color: "#fff", border: "1px solid #c6c6c6" },
  ];
  return (
    <div
      style={{ display: "flex", gap: 14, fontSize: 11.5, color: FLOW.grey, alignItems: "center" }}
    >
      {items.map((i) => (
        <span key={i.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 3,
              background: i.color,
              border: i.border ?? "none",
            }}
          />
          {i.label}
        </span>
      ))}
    </div>
  );
}
