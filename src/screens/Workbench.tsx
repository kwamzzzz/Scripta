/**
 * The mandate: Overview · Review · Issues · Redline · Final.
 *
 * The five tabs used to be Contract Editor, Contract Summary, Playbook Check,
 * Final Document and Notes, which described the app's internals rather than the
 * work. A review is a decision-making process: you settle what you are
 * reviewing and for whom (Overview), you read it (Review), you decide the points
 * it raises (Issues), you mark it up (Redline), and you finalise it (Final).
 *
 * Playbook Check is gone as a tab. A playbook deviation is a fact about a
 * clause, so it belongs on the clause, where the Scripta panel now carries it
 * along with the rest of the reading. Notes are gone too: they were free text
 * with a resolved flag, and they are now issues, which have a severity, a
 * clause, a recommendation and a recorded decision.
 */
import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useApp, type Screen } from "@/store/app";
import AppShell, { Crumbs } from "@/components/AppShell";
import GeminiUsage from "@/components/GeminiUsage";
import TimeSpent from "@/components/TimeSpent";
import FeedbackChip from "@/components/FeedbackChip";
import { TabRow } from "@/wireframe/screens";
import * as F1b from "@/wireframe/frames/F1b";
import ContractEditor from "@/wireframe/ContractEditor";
import RedraftSession, { type RedraftSessionState } from "@/wireframe/RedraftSession";
import { usePersisted } from "@/lib/use-board";
import { TranscriptImportProvider } from "@/lib/transcript-import";
import MatterNotes from "@/components/MatterNotes";
import { addClauseInstruction } from "@/lib/review.functions";
import { WF } from "@/wireframe/data";
import OverviewTab from "@/review/OverviewTab";
import type { Carried } from "@/review/PrepareReview";
import {
  FileActivity,
  FileDocuments,
  FileFlows,
  FileOverview,
  FileTasks,
} from "@/matter-file/FileScreens";
import IssuesTab from "@/review/IssuesTab";
import RedlineTab from "@/review/RedlineTab";
import FinalTab from "@/review/FinalTab";
import DeviationsTab from "@/review/DeviationsTab";
import ClauseBrief from "@/review/ClauseBrief";
import HistoryTab from "@/review/HistoryTab";
import { ClauseMarksProvider } from "@/review/severity";
import type { ClauseMark } from "@/review/clause-marks";
import { useReview } from "@/review/use-review";
import { useReviewRun } from "@/review/use-run";
import MatterUnavailable from "@/screens/MatterUnavailable";
import MatterFlowScreen from "@/matter-flow/MatterFlowScreen";
import {
  FlowOpenerProvider,
  NO_HOSTED_FLOW,
  flowSearchOf,
  hostedPatch,
  type HostFrame,
  type HostedFlowSearch,
} from "@/lib/host-frame";
import "@/review/review.css";

/**
 * A matter is a file, and Contract Review is one tool used on it. So the tab
 * row has two modes. On the file: Overview, Flows, Tasks, Documents, Activity,
 * and the way into Contract Review. Inside Contract Review: its own tabs, with
 * the way back to the file first.
 */
const FILE_SCREENS: Screen[] = ["matter", "flows", "tasks", "documents", "activity"];

const FILE_TABS: { id: Screen; label: string }[] = [
  { id: "matter", label: "Overview" },
  { id: "flows", label: "Flows" },
  { id: "tasks", label: "Tasks" },
  { id: "documents", label: "Documents" },
  { id: "activity", label: "Activity" },
  { id: "contract", label: "Contract Review" },
];

const REVIEW_TABS: { id: Screen; label: string }[] = [
  { id: "matter", label: "← File" },
  { id: "contract", label: "Summary" },
  { id: "review", label: "Review" },
  { id: "issues", label: "Issues" },
  { id: "redline", label: "Redline" },
  { id: "deviations", label: "Deviations" },
  { id: "history", label: "History" },
  { id: "final", label: "Final" },
];

const TAB_LABEL: Record<Screen, string> = {
  matter: "Overview",
  flows: "Flows",
  tasks: "Tasks",
  documents: "Documents",
  activity: "Activity",
  contract: "Contract Review summary",
  review: "Review",
  issues: "Issues",
  redline: "Redline",
  deviations: "Deviations",
  history: "Mark-up history",
  final: "Final",
  transcript: "Transcript",
  playbook: "Playbook",
  messages: "Redraft session",
  notes: "Notes",
};

const INTRO: Record<Screen, string> = {
  matter: "Ask where this matter stands, what is outstanding, or what to do next.",
  flows: "Ask what a flow is waiting on, or what has to happen before a phase can close.",
  tasks: "Ask what is overdue on this matter, or what to pick up first.",
  documents: "Ask what a document is, or which version is the current one.",
  activity: "Ask what changed on this matter recently, and who did it.",
  contract: "Ask about the mandate, the key terms, or what is still outstanding.",
  review: "Ask about the selected clause — what it does, where it deviates and what to watch.",
  issues: "Ask which issues matter most, or how to word a decision.",
  redline: "Ask what an amendment changes, or how a counterparty is likely to read it.",
  deviations:
    "Ask what a tracked change does, or how to justify a deviation to the buyer.",
  history: "Ask what changed on this document, when, and what it said before.",
  final: "Ask what changed between the two readings, or what a clause now says.",
  playbook: "Ask how the playbook positions bear on this draft.",
  messages: "Research thread — kept separate from the redraft session.",
  transcript: "Ask what was agreed on this call and where it was said.",
  notes: "Ask about anything recorded against this matter or one of its clauses.",
};

export default function Workbench({
  frame,
  hostedFlow,
}: {
  /** What this matter is open inside (its client); absent when it stands alone. */
  frame?: HostFrame;
  /** The flow open inside this matter, kept in the address by whoever owns it. */
  hostedFlow?: {
    search: HostedFlowSearch;
    setSearch: (patch: Partial<HostedFlowSearch>) => void;
  };
} = {}) {
  const {
    screen,
    set,
    loading,
    matterUnavailable,
    matter,
    selClause,
    D,
    matterId,
    workspaceId,
    actionError,
    setActionError,
  } = useApp();
  const qc = useQueryClient();
  // Chrome lands before the document: the breadcrumb takes the name from
  // whatever list already cached it, and shows a bar until then.
  const cachedName = (() => {
    if (matter?.name) return matter.name;
    for (const [, data] of qc.getQueriesData<{ matters?: { id: string; name: string }[] }>({
      queryKey: ["board"],
    })) {
      const hit = data?.matters?.find((m) => m.id === matterId);
      if (hit) return hit.name;
    }
    for (const [, data] of qc.getQueriesData<{ id: string; name: string }[]>({
      queryKey: ["matters"],
    })) {
      const hit = Array.isArray(data) ? data.find((m) => m.id === matterId) : undefined;
      if (hit) return hit.name;
    }
    return null;
  })();

  const review = useReview(matterId, D.clauses);
  const refresh = useCallback(() => review.refreshAll(), [review]);
  const run = useReviewRun(refresh);

  // The redraft session is its own state, apart from the document, kept for the
  // tab session so Back to editor and return does not lose the thread.
  const [session, setSession] = usePersisted<RedraftSessionState | null>(
    `px.redraft.${matter?.id ?? "none"}`,
    null,
  );

  const marks = useMemo(() => {
    const map = new Map<string, ClauseMark>();
    for (const [id, entry] of review.byClause)
      map.set(id, {
        severity: entry.severity,
        reviewed: entry.reviewed,
        open: entry.openCount,
      });
    return map;
  }, [review.byClause]);

  const goClause = (clauseId: string) => set({ screen: "review", selClause: clauseId });
  const goRedline = (clauseId: string) => set({ screen: "redline", selClause: clauseId });
  const runWhole = () => {
    if (!matterId) return;
    void run.run(
      matterId,
      D.clauses.map((c) => c.id),
    );
  };

  /**
   * What the last re-read of the document kept. Held here rather than on the
   * Summary tab so it survives a move between tabs: the receipt outlives the
   * screen that asked for the re-read.
   */
  const [carried, setCarried] = useState<Carried | null>(null);

  const [instructionError, setInstructionError] = useState<string | null>(null);
  const saveInstruction = (clauseId: string, body: string) => {
    void addClauseInstruction({ data: { clauseId, body } })
      .then(() => {
        setInstructionError(null);
        review.refresh();
        void qc.invalidateQueries({ queryKey: ["notes"] });
      })
      .catch((e: unknown) =>
        setInstructionError(e instanceof Error ? e.message : "The instruction was not saved."),
      );
  };

  // Asked for by id, settled, and nothing came back. Rendering the workbench
  // around an empty matter would show a shell with no name in it, which looks
  // like a fault; saying so plainly is both kinder and less revealing.
  if (matterUnavailable) return <MatterUnavailable />;

  const onFile = FILE_SCREENS.includes(screen);
  const matterCrumbs = frame?.crumbs ?? [{ label: "Matters", to: "/matters" }];
  const openFlow = (flowId: string) => {
    set({ screen: "flows" });
    hostedFlow?.setSearch({ ...NO_HOSTED_FLOW, flow: flowId });
  };
  const leaveFlow = (next: Screen) => {
    hostedFlow?.setSearch(NO_HOSTED_FLOW);
    set({ screen: next });
  };

  // A flow of this matter opens here, inside the matter, not on its own screen.
  const openFlowId = screen === "flows" ? hostedFlow?.search.flow : undefined;
  if (openFlowId && matterId)
    return (
      <MatterFlowScreen
        key={openFlowId}
        flowKey={{ flowId: openFlowId }}
        search={flowSearchOf(hostedFlow!.search)}
        setSearch={(patch) => hostedFlow!.setSearch(hostedPatch(patch))}
        frame={{
          section: frame?.section ?? "matters",
          back: { label: cachedName ?? "Matter", href: `/matters/${matterId}` },
          crumbs: [
            ...matterCrumbs,
            { label: cachedName ?? "Matter", onClick: () => leaveFlow("flows") },
          ],
          // Inside a client, the client's tabs are the frame; on its own, the matter's.
          tabs: frame?.tabs ?? (
            <TabRow tabs={FILE_TABS} active={"flows" as Screen} onChange={(id) => leaveFlow(id)} />
          ),
        }}
      />
    );

  const body =
    matterId && screen === "matter" ? (
      <FileOverview
        matterId={matterId}
        workspaceId={workspaceId}
        matter={D.matter}
        clauses={D.clauses}
        openIssues={review.open.length}
        onGo={(next) => set({ screen: next })}
      />
    ) : matterId && screen === "flows" ? (
      <FileFlows matterId={matterId} />
    ) : matterId && screen === "tasks" ? (
      <FileTasks matterId={matterId} />
    ) : matterId && screen === "documents" ? (
      <FileDocuments
        matterId={matterId}
        matter={D.matter}
        onOpenReview={() => set({ screen: D.clauses.length ? "review" : "contract" })}
      />
    ) : matterId && screen === "activity" ? (
      <FileActivity matter={D.matter} />
    ) : loading ? (
      <F1b.default d={WF} />
    ) : screen === "contract" ? (
      <OverviewTab
        review={review}
        matter={D.matter}
        clauses={D.clauses}
        onOpenClause={goClause}
        onGoIssues={() => set({ screen: "issues" })}
        onRunReview={runWhole}
        running={run.state}
        onPrepared={(kept) => {
          review.refreshAll();
          /* A re-read stays put, so the receipt for it is read where the
             button was. A first reading has nothing to report and everything
             to show, so it opens the register. */
          if (kept) setCarried(kept);
          else set({ screen: "review" });
        }}
        carried={carried}
        onGoDocuments={() => set({ screen: "documents" })}
      />
    ) : screen === "history" ? (
      <HistoryTab matterId={matterId ?? null} clauses={D.clauses} />
    ) : screen === "issues" ? (
      <IssuesTab
        review={review}
        matterId={matterId ?? null}
        clauses={D.clauses}
        onOpenClause={goClause}
        onOpenRedline={goRedline}
      />
    ) : screen === "redline" ? (
      <RedlineTab
        review={review}
        clauses={D.clauses}
        selectedClauseId={selClause}
        onOpenClause={goClause}
      />
    ) : screen === "deviations" ? (
      <DeviationsTab />
    ) : screen === "final" ? (
      matterId ? (
        <FinalTab
          review={review}
          matterId={matterId}
          matterName={D.matter.name}
          clauses={D.clauses}
          onGoIssues={() => set({ screen: "issues" })}
          onGoRedline={() => set({ screen: "redline" })}
          onGoOverview={() => set({ screen: "contract" })}
        />
      ) : null
    ) : screen === "notes" ? (
      // Reachable by an old link. Notes are issues now, and the register is the
      // Issues tab; this stays so nothing anybody wrote is stranded.
      <MatterNotes />
    ) : screen === "messages" ? (
      session && session.turns !== undefined && matter && session.matterId === matter.id ? (
        <RedraftSession
          key={session.instructions.map((i) => i.anchor + i.summary).join("|")}
          session={session}
          onChange={setSession}
          onBack={() => set({ screen: "review" })}
          onOpenRedline={() => {
            setSession(null);
            set({ screen: "redline" });
          }}
        />
      ) : (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 30,
          }}
        >
          <div
            style={{
              maxWidth: 420,
              border: "1px solid #dedede",
              borderRadius: 8,
              background: "#fff",
              padding: "14px 16px",
              color: "#545454",
              lineHeight: 1.55,
              fontSize: 12.5,
            }}
          >
            No redraft session is open. In the Review tab, add instructions on the clauses you want
            changed, then press Redraft with Scripta.
            <div style={{ marginTop: 10 }}>
              <button
                type="button"
                onClick={() => set({ screen: "review" })}
                style={{
                  border: "1px solid #d4d4d4",
                  borderRadius: 6,
                  padding: "6px 13px",
                  fontSize: 12,
                  color: "#545454",
                  background: "transparent",
                  cursor: "pointer",
                }}
              >
                Back to the editor
              </button>
            </div>
          </div>
        </div>
      )
    ) : (
      <ContractEditor
        key={matter?.id ?? "empty"}
        onRedraft={(chosen) => {
          if (!matter) return;
          setSession({ matterId: matter.id, instructions: chosen, turns: [] });
          set({ screen: "messages" });
        }}
      />
    );

  const right =
    screen === "messages" ? (
      <span
        style={{
          font: "500 10px 'Geist',sans-serif",
          color: "#6f6f6f",
          letterSpacing: ".06em",
        }}
      >
        REDRAFT SESSION · {session?.instructions.length ?? 0} INSTRUCTIONS
      </span>
    ) : screen === "review" ? (
      <button
        type="button"
        disabled={!!run.state || D.clauses.length === 0 || !review.mandate.reviewFor.trim()}
        title={
          review.mandate.reviewFor.trim()
            ? "Read every clause and raise what needs a decision"
            : "Say who we act for on the Summary tab first"
        }
        onClick={runWhole}
        style={{
          border: "1px solid #d4d4d4",
          background: "#fff",
          color: "#242424",
          borderRadius: 6,
          padding: "6px 14px",
          fontSize: 12,
          cursor: run.state ? "default" : "pointer",
          opacity: run.state || !review.mandate.reviewFor.trim() ? 0.55 : 1,
          fontFamily: "inherit",
        }}
      >
        {run.state
          ? `Reading ${run.state.done} of ${run.state.of}…`
          : review.mandate.reviewedAt
            ? "Review again"
            : "Run the review"}
      </button>
    ) : screen === "final" || onFile ? null : (
      <button
        type="button"
        onClick={() => set({ screen: "final" })}
        title="Run the pre-flight and export the document"
        style={{
          border: "1px solid #b7d8c0",
          background: "#fff",
          color: "#137333",
          borderRadius: 6,
          padding: "6px 14px",
          fontSize: 12,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        Finalise
      </button>
    );

  const current = D.clauses.find((c) => c.id === selClause) ?? null;
  const banner = actionError ?? instructionError ?? run.error ?? review.error;

  return (
    <FlowOpenerProvider value={hostedFlow ? openFlow : null}>
      <TranscriptImportProvider>
        <ClauseMarksProvider marks={marks}>
          <AppShell
            section={frame?.section ?? "matters"}
            scroll={false}
            back={frame?.back ?? { label: "Matters", href: "/matters" }}
            trackLabel={cachedName ?? "Matter"}
            hostTabs={frame?.tabs}
            topbar={
              <>
                <Crumbs
                  items={[
                    // The link has always gone to Matters; it is labelled as the place it goes.
                    ...matterCrumbs,
                    {
                      label: cachedName ?? (
                        <span
                          style={{
                            width: 160,
                            height: 12,
                            borderRadius: 3,
                            background: "#e8e8e8",
                            display: "inline-block",
                          }}
                        />
                      ),
                    },
                  ]}
                />
                <div style={{ flex: 1 }} />
                {/* Time on this file, started and stopped by hand. The same
                    pill serves any tool that wants to be timed — it takes a
                    subject and nothing else. */}
                {matter && (
                  <TimeSpent
                    subject={{ kind: "matter", id: matter.id, label: cachedName ?? matter.name }}
                  />
                )}
                <FeedbackChip screen={cachedName ?? "Matter"} />
                <GeminiUsage />
              </>
            }
            tabs={
              <TabRow
                tabs={onFile ? FILE_TABS : REVIEW_TABS}
                active={
                  screen === "transcript" || screen === "playbook" || screen === "messages"
                    ? "review"
                    : screen === "notes"
                      ? "issues"
                      : screen
                }
                onChange={(id) => set({ screen: id })}
                right={right}
              />
            }
            assistant={
              matter
                ? {
                    key: `matter.${matter.id}`,
                    label: screen === "messages" ? "Research thread — kept separate" : matter.name,
                    matterId: matter.id,
                    // The clause stays in scope on Redline too: the panel is
                    // reading the clause you are marking up, not the last one you
                    // happened to click in the editor.
                    clauseId:
                      screen === "review" || screen === "redline" ? selClause || null : null,
                    screen: TAB_LABEL[screen] ?? "Matter",
                    intro: INTRO[screen],
                    ...(screen === "review" || screen === "redline"
                      ? {
                          brief: (
                            <ClauseBrief
                              clause={current}
                              entry={current ? review.byClause.get(current.id) : undefined}
                              review={review}
                              onAddInstruction={saveInstruction}
                              onGoRedline={goRedline}
                              onGoIssues={() => set({ screen: "issues" })}
                            />
                          ),
                          suggestions: [
                            "Explain the selected clause and any mandatory-law constraints.",
                          ],
                        }
                      : {}),
                  }
                : undefined
            }
          >
            {/* A clause status, a classification or an instruction the database
              refused, and any failure from the review run. Shown here because
              every write path lands on this screen, and a refusal the lawyer
              never sees is the reason these used to look saved when they were
              not. */}
            {banner && (
              <div
                role="alert"
                style={{
                  flex: "none",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "9px 18px",
                  background: "#F7ECEA",
                  borderBottom: "1px solid #E8CCC7",
                  color: "#c5221f",
                  fontSize: 12.5,
                  lineHeight: 1.5,
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>{banner}</span>
                <button
                  type="button"
                  onClick={() => {
                    setActionError(null);
                    setInstructionError(null);
                    run.clearError();
                  }}
                  aria-label="Dismiss"
                  style={{
                    flex: "none",
                    border: 0,
                    background: "transparent",
                    color: "inherit",
                    cursor: "pointer",
                    font: "inherit",
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>
            )}
            {body}
          </AppShell>
        </ClauseMarksProvider>
      </TranscriptImportProvider>
    </FlowOpenerProvider>
  );
}
