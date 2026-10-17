/**
 * The research workstation.
 *
 * One matter that becomes more complete as the lawyer works, rather than a set
 * of screens that each hold a piece of it. Five tabs, in the order the work
 * goes — Brief, Research, Analysis, Draft, Sources — and none of them locked,
 * because lawyers do not work in a straight line. A realisation on the Draft
 * tab sends you back to Research, and the analysis and the document follow.
 *
 * What the strip under the tabs is for: at any moment the lawyer should be
 * able to see where they are, what Scripta has done, and what still needs
 * their attention.
 */
import { useEffect, useMemo, useState } from "react";
import { History, X } from "lucide-react";
import AppShell, { Crumbs, TopChip } from "@/components/AppShell";
import { TabRow } from "@/wireframe/screens";
import { useApp } from "@/store/app";
import Thread from "@/components/Thread";
import {
  resolveResearch,
  useRenameResearch,
  useResearchActivity,
  useResearchMatters,
  useResearchRecordsDraft,
  useResearchRow,
  useResearchStateDraft,
} from "@/lib/research-data";
import { withRecordDefaults } from "@/wireframe/research-matter";
import { emptyResearch } from "@/wireframe/research-store";
import BriefTab from "./BriefTab";
import ResearchTab from "./ResearchTab";
import AnalysisTab from "./AnalysisTab";
import DraftTab from "./DraftTab";
import SourcesTab from "./SourcesTab";
import { findingsFor, hasAnalysis, localReview, openCount, progressOf } from "./model";
import { Chip } from "./ui";
import "./research.css";

export type ResearchTabKey = "brief" | "research" | "analysis" | "draft" | "sources";

export const RESEARCH_TABS: { id: ResearchTabKey; label: string }[] = [
  { id: "brief", label: "Brief" },
  { id: "research", label: "Research" },
  { id: "analysis", label: "Analysis" },
  { id: "draft", label: "Draft" },
  { id: "sources", label: "Sources" },
];

/** What Scripta should offer to do, by where the lawyer is standing. */
const ASSISTANT: Record<ResearchTabKey, { intro: string; suggestions: string[] }> = {
  brief: {
    intro:
      "Ask about the scope of this research — what the instructions cover, and what they leave out.",
    suggestions: ["What question am I missing?", "Is anything in the instructions out of scope?"],
  },
  research: {
    intro: "Ask about what the research found, or what it has not reached yet.",
    suggestions: ["Which question is weakest on authority?", "What have we not looked at?"],
  },
  analysis: {
    intro: "Ask me to challenge the reasoning, or to say where it is thin.",
    suggestions: [
      "Which conclusion would I struggle to defend?",
      "What would the other side argue?",
    ],
  },
  draft: {
    intro: "Ask about the document: its structure, its tone, or whether it answers what was asked.",
    suggestions: ["Does this answer the instructions?", "Where is this overstated?"],
  },
  sources: {
    intro: "Ask about a source — what it holds, and how far it reaches.",
    suggestions: ["Which of these sources is doing the most work?", "What is doubtful here?"],
  },
};

export default function ResearchWorkstation({
  researchId: routeId,
  tab,
  onTab,
}: {
  researchId: string;
  tab: ResearchTabKey;
  onTab: (tab: ResearchTabKey) => void;
}) {
  const { workspaceId } = useApp();
  const { matters } = useResearchMatters();
  const resolved = resolveResearch(matters, routeId);
  // The matter this research is filed to, and nothing else. The app store's
  // matter falls back to the workspace's first one on a route that names no
  // matter, which grounded every model call in a file the research had
  // nothing to do with.
  const matterId = resolved?.matterId ?? null;
  const researchId = resolved?.id ?? routeId;
  const row = useResearchRow(researchId);
  const rename = useRenameResearch();

  const loadedState = row.data?.state;
  const loadedRecords = useMemo(
    () => (row.data ? withRecordDefaults(row.data.records) : undefined),
    [row.data],
  );
  const stateDraft = useResearchStateDraft(researchId, loadedState);
  const recordsDraft = useResearchRecordsDraft(researchId, loadedRecords);

  const state = stateDraft.value ?? loadedState ?? emptyResearch(row.data?.title ?? "");
  const records = recordsDraft.value ?? loadedRecords ?? withRecordDefaults(undefined);
  const title = row.data?.title ?? resolved?.title ?? "Research";

  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  /** The factual record as one block, which is what every model call is given. */
  const factsText = useMemo(
    () =>
      records.factRows
        .filter((f) => f.fact.trim())
        .map((f) => `${f.fact}${f.cls ? ` [${f.cls}]` : ""}${f.src ? ` (source: ${f.src})` : ""}`)
        .join("\n"),
    [records.factRows],
  );

  const progress = useMemo(() => progressOf(state, records), [state, records]);
  const open = useMemo(() => openCount(localReview(state, records)), [state, records]);

  const openSource = (n: number) => {
    stateDraft.set({ ...state, selectedAuthority: n });
    onTab("sources");
  };

  // A question deleted on the Brief tab must not leave the Sources panel
  // pointing at a source nothing cites.
  useEffect(() => {
    if (
      state.selectedAuthority !== null &&
      !(state.answer?.authorities ?? []).some((a) => a.n === state.selectedAuthority)
    )
      stateDraft.set({ ...state, selectedAuthority: null });
    // Only the selection matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.selectedAuthority, state.answer?.authorities.length]);

  const saving = stateDraft.saving || recordsDraft.saving;
  const saveError = stateDraft.error ?? recordsDraft.error;

  const body = !row.data ? (
    <div className="rs-body">
      <p className="rs-note" role="status">
        {row.isError ? "This research matter could not be opened." : "Opening the research…"}
      </p>
    </div>
  ) : tab === "brief" ? (
    <BriefTab
      state={state}
      records={records}
      onState={stateDraft.set}
      onRecords={recordsDraft.set}
      matterId={matterId ?? null}
      factsText={factsText}
      footer={
        /* The research note is the durable row, so the discussion hangs here
           rather than on an individual finding. Findings are destroyed and
           recreated on every save, which would orphan a thread on one and
           turn it author-only in silence — docs/research-finding-identity.md
           records that, and what it would take to do properly. It sits at the
           foot of the brief, in the page, as a matter's discussion sits on its
           Overview: not pinned under every tab. */
        <div className="rs-part">
          <Thread
            kind="research"
            entityId={researchId}
            workspaceId={workspaceId}
            title="Discussion"
            blurb="Questions and decisions about this research, kept with it."
            reviewLabel={`Review research: ${title}`}
          />
        </div>
      }
    />
  ) : tab === "research" ? (
    <ResearchTab
      state={state}
      records={records}
      onState={stateDraft.set}
      onRecords={recordsDraft.set}
      matterId={matterId ?? null}
      researchId={researchId}
      factsText={factsText}
      onOpenSource={openSource}
      onTab={onTab}
    />
  ) : tab === "analysis" ? (
    <AnalysisTab
      state={state}
      records={records}
      onRecords={recordsDraft.set}
      factsText={factsText}
      onOpenSource={openSource}
      onTab={onTab}
    />
  ) : tab === "draft" ? (
    <DraftTab
      state={state}
      records={records}
      onState={stateDraft.set}
      onRecords={recordsDraft.set}
      researchId={researchId}
      matterId={matterId ?? null}
      factsText={factsText}
      onOpenSource={openSource}
      onTab={onTab}
    />
  ) : (
    <SourcesTab
      state={state}
      records={records}
      onState={stateDraft.set}
      researchId={researchId}
      workspaceId={workspaceId ?? null}
      selected={state.selectedAuthority}
      onSelect={(n) => stateDraft.set({ ...state, selectedAuthority: n })}
    />
  );

  return (
    <AppShell
      section="research"
      scroll={false}
      back={{ label: "Research", href: "/research" }}
      trackLabel={title}
      topbar={
        <>
          <Crumbs items={[{ label: "Research", to: "/research" }, { label: title }]} />
          {saving && <span className="rs-note">Saving…</span>}
          {saveError && (
            <span className="rs-note" style={{ color: "#c5221f" }} title={saveError}>
              Not saved
            </span>
          )}
          <div style={{ flex: 1 }} />
          <TopChip onClick={() => setShowHistory(true)}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <History size={12} />
              History
            </span>
          </TopChip>
        </>
      }
      tabs={
        <TabRow<ResearchTabKey>
          tabs={RESEARCH_TABS}
          active={tab}
          onChange={onTab}
          right={
            open > 0 ? (
              <Chip tone="practice" mono>
                {open} need{open === 1 ? "s" : ""} attention
              </Chip>
            ) : progress.readyToDraft ? (
              <Chip tone="ok" mono>
                On track
              </Chip>
            ) : null
          }
        />
      }
      assistant={{
        key: `research.${researchId}`,
        label: title,
        matterId: matterId ?? null,
        screen: `Research — ${RESEARCH_TABS.find((t) => t.id === tab)?.label ?? "Brief"}`,
        intro: ASSISTANT[tab].intro,
        suggestions: ASSISTANT[tab].suggestions,
      }}
    >
      <div className="rs-screen">
        <div className="rs-meta">
          {titleDraft !== null ? (
            <input
              className="rs-input"
              style={{ width: 320 }}
              autoFocus
              value={titleDraft}
              aria-label="Research title"
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => {
                const next = titleDraft.trim();
                if (next && next !== title) void rename(researchId, next);
                setTitleDraft(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") setTitleDraft(null);
              }}
            />
          ) : (
            <button
              type="button"
              className="rs-link"
              style={{ fontSize: 13, fontWeight: 600, color: "#232323" }}
              title="Rename this research"
              onClick={() => setTitleDraft(title)}
            >
              {title}
            </button>
          )}
          <span>
            {[state.jurisdiction, state.areaOfLaw, state.outputKind || "Research memorandum"]
              .filter(Boolean)
              .join(" · ")}
          </span>
          {state.lawAsAt && <span>Law as at {state.lawAsAt}</span>}
          <div className="rs-spacer" />
          <Step
            label={`${progress.facts} fact${progress.facts === 1 ? "" : "s"}`}
            done={progress.facts > 0}
          />
          <Step
            label={`${progress.questions} question${progress.questions === 1 ? "" : "s"}`}
            done={progress.questions > 0}
          />
          <Step
            label={`${progress.researched} researched`}
            done={progress.questions > 0 && progress.researched === progress.questions}
            part={progress.researched > 0}
          />
          <Step
            label={`${progress.analysed} analysed`}
            done={progress.questions > 0 && progress.analysed === progress.questions}
            part={progress.analysed > 0}
          />
          <Step
            label={`${progress.sources} source${progress.sources === 1 ? "" : "s"}`}
            done={progress.sources > 0}
          />
          {progress.doubtful > 0 && (
            <Chip tone="practice" mono>
              {progress.doubtful} to check
            </Chip>
          )}
        </div>
        {body}

      </div>

      {showHistory && (
        <HistoryDrawer researchId={researchId} onClose={() => setShowHistory(false)} />
      )}
    </AppShell>
  );
}

function Step({ label, done, part }: { label: string; done: boolean; part?: boolean }) {
  return (
    <span className="rs-meta-step">
      <span className={`rs-meta-dot${done ? " is-done" : part ? " is-part" : ""}`} />
      {label}
    </span>
  );
}

/**
 * What has been done to this matter. Not a tab of its own — it is a record, not
 * a place to work — but it has to be reachable, because a research file that
 * cannot say when its conclusion was reached is worth less.
 */
function HistoryDrawer({ researchId, onClose }: { researchId: string; onClose: () => void }) {
  const activity = useResearchActivity(researchId);
  return (
    <div
      className="rs-history"
      role="dialog"
      aria-label="History"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="rs-history-panel">
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 16px",
            borderBottom: "1px solid #e8e8e8",
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>History</div>
            <div className="rs-note">What has been recorded against this research matter.</div>
          </div>
          <button
            type="button"
            className="rs-link is-quiet"
            onClick={onClose}
            aria-label="Close history"
          >
            <X size={15} />
          </button>
        </header>
        <div className="rs-history-list">
          {activity.isLoading && <p className="rs-note">Reading the history…</p>}
          {activity.isError && <p className="rs-problem">The history could not be loaded.</p>}
          {activity.data?.length === 0 && (
            <p className="rs-note">Nothing has been recorded against this matter yet.</p>
          )}
          {(activity.data ?? []).map((event) => (
            <div className="rs-history-row" key={event.id}>
              <span className="rs-eyebrow">{event.event_type.replace(/^research\./, "")}</span>
              <span>{event.summary}</span>
              <span className="rs-note">
                {event.actor_name ?? "Unknown"} · {new Date(event.created_at).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export { findingsFor, hasAnalysis };
