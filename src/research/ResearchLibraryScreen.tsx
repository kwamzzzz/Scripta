/**
 * Research — the landing page. Every research matter in the workspace, with
 * where each one has got to, and New research up front.
 */
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import AppShell, { Crumbs, TopChip } from "@/components/AppShell";
import Library, { type LibColumn, type LibView } from "@/components/Library";
import LibraryCard from "@/components/LibraryCard";
import StatusPill from "@/components/StatusPill";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import { archiveLabel, archiveVerb, setArchived } from "@/lib/archive";
import { binCountdown, moveToBin, restoreFromBin } from "@/lib/trash";
import { Button, SectionLabel } from "@/components/primitives";
import { relTime } from "@/lib/home-data";
import { RESEARCH_LIST_KEY, useDeleteResearch, useResearchMatters } from "@/lib/research-data";
import type { ResearchSummary } from "@/lib/research-data";
import { useApp } from "@/store/app";
import { C } from "@/lib/tokens";
import "./research.css";

/** A report is still being worked on, or it has been locked and issued. */
const RESEARCH_STATES = ["Open", "Locked"];

export default function ResearchLibraryScreen() {
  const navigate = useNavigate();
  const { matters, loading, error, importNotice } = useResearchMatters();
  const removeResearch = useDeleteResearch();
  const [removeError, setRemoveError] = useState<string | null>(null);
  const { confirmDelete, confirmDialog } = useConfirmDelete();
  const queryClient = useQueryClient();
  const { workspaceId } = useApp();

  /** Out of the active workspace, and back again. Reversible, so it does not ask. */
  const archive = async (rows: ResearchSummary[], archived: boolean) => {
    if (!rows.length) return;
    setRemoveError(null);
    try {
      await setArchived(
        "research_matters",
        rows.map((r) => r.id),
        archived,
      );
      await queryClient.invalidateQueries({ queryKey: RESEARCH_LIST_KEY(workspaceId) });
    } catch (error) {
      setRemoveError(
        `That research matter could not be ${archiveVerb(archived)}. ${error instanceof Error ? error.message : ""}`.trim(),
      );
    }
  };
  const notice = importNotice ?? error ?? removeError;

  const open = (id: string) =>
    void navigate({
      to: "/research/$researchId",
      params: { researchId: id },
      search: { tab: "brief" },
    });
  const start = () => void navigate({ to: "/research/new" });

  /** Deleting takes the facts, questions, sources and document with it, so the confirmation says so. */
  const remove = async (rows: ResearchSummary[]) => {
    if (!rows.length) return;
    const what = rows.length === 1 ? `“${rows[0]!.title}”` : `${rows.length} research matters`;
    const it = rows.length === 1 ? "it" : "them";
    if (
      !(await confirmDelete({
        what,
        count: rows.length,
        consequence: `Every fact, question, source and draft in ${it} goes too.`,
      }))
    )
      return;
    setRemoveError(null);
    try {
      await moveToBin(
        "research_matters",
        rows.map((row) => row.id),
      );
      await queryClient.invalidateQueries({ queryKey: RESEARCH_LIST_KEY(workspaceId) });
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : "That matter could not be deleted.");
    }
  };

  /** Out of Recently Deleted, back to wherever it was — archived ones included. */
  const restore = async (rows: ResearchSummary[]) => {
    if (!rows.length) return;
    setRemoveError(null);
    try {
      await restoreFromBin(
        "research_matters",
        rows.map((row) => row.id),
      );
      await queryClient.invalidateQueries({ queryKey: RESEARCH_LIST_KEY(workspaceId) });
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : "That matter could not be restored.");
    }
  };

  /**
   * Before the fifteen days are up. `removeResearch` rather than
   * `deleteForever` because it is the server function that records the audit
   * event saying the research matter and its records went.
   */
  const removeForGood = async (rows: ResearchSummary[]) => {
    if (!rows.length) return;
    const what = rows.length === 1 ? `“${rows[0]!.title}”` : `${rows.length} research matters`;
    const it = rows.length === 1 ? "it" : "them";
    if (
      !(await confirmDelete({
        what,
        count: rows.length,
        consequence: `Every fact, question, source and draft in ${it} goes too.`,
        binned: false,
      }))
    )
      return;
    setRemoveError(null);
    try {
      for (const row of rows) await removeResearch(row.id);
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : "That matter could not be deleted.");
    }
  };

  const columns: LibColumn<ResearchSummary>[] = [
    {
      key: "title",
      label: "Research matter",
      render: (r) => (
        <div style={{ minWidth: 0 }}>
          <span style={{ fontWeight: 600, color: C.text }}>{r.title}</span>
          {r.deletedAt && (
            <div style={{ color: C.muted, fontSize: 11.5 }}>{binCountdown(r.deletedAt)}</div>
          )}
        </div>
      ),
      value: (r) => r.title.toLowerCase(),
    },
    {
      key: "matter",
      label: "Linked matter",
      width: 150,
      render: (r) => (r.matterId ? "Linked" : <span style={{ color: C.faint }}>Not linked</span>),
      value: (r) => (r.matterId ? "Linked" : ""),
    },
    {
      key: "report",
      label: "Document",
      width: 130,
      // Locked means the report was issued; open means it is still being worked on.
      render: (r) => (
        <StatusPill
          label={r.reportLocked ? "LOCKED" : "OPEN"}
          tone={r.reportLocked ? "good" : "progress"}
        />
      ),
      value: (r) => (r.reportLocked ? "Locked" : "Open"),
    },
    {
      key: "updated",
      label: "Updated",
      width: 120,
      value: (r) => r.updatedAt,
      render: (r) => <span style={{ color: C.muted }}>{relTime(r.updatedAt)}</span>,
    },
  ];

  // Archived research shows only under Archived, as on Matters.
  // A deleted research matter leaves every view, Archived included: it is in
  // the bin, not merely put aside.
  const live = (r: ResearchSummary) => !r.archivedAt && !r.deletedAt;
  const views: LibView<ResearchSummary>[] = [
    { key: "All", label: "All", filter: live },
    { key: "Open", label: "Open", filter: (r) => live(r) && !r.reportLocked },
    { key: "Locked", label: "Locked", filter: (r) => live(r) && r.reportLocked },
    { key: "Linked", label: "Linked to a matter", filter: (r) => live(r) && !!r.matterId },
    { key: "Archived", label: "Archived", filter: (r) => !!r.archivedAt && !r.deletedAt },
    { key: "Deleted", label: "Recently Deleted", filter: (r) => !!r.deletedAt },
  ];

  return (
    <AppShell
      section="research"
      breadcrumb={<Crumbs items={[{ label: "Research" }]} />}
      scroll={false}
      assistant={{
        key: "research",
        screen: "Research",
        intro: "Ask what a research matter concluded, or start a new one.",
      }}
    >
      {notice && (
        <div role="alert" style={{ padding: "10px 20px 0" }}>
          <p className="rs-problem">{notice}</p>
        </div>
      )}
      <Library
        storageKey="research"
        title="Research"
        description="Each matter runs brief, research, analysis, draft and sources. Start one, or open a matter to keep going."
        rows={matters}
        columns={columns}
        views={views}
        searchText={(r) => [r.title, r.reportLocked ? "locked" : "open"].join(" ")}
        searchPlaceholder="Search research"
        onOpen={(r) => open(r.id)}
        board={{
          columns: RESEARCH_STATES,
          column: (r) => (r.reportLocked ? "Locked" : "Open"),
          card: (r) => <LibraryCard compact title={r.title} onOpen={() => open(r.id)} />,
        }}
        cards={(r) => (
          <LibraryCard
            title={r.title}
            onOpen={() => open(r.id)}
            state={r.reportLocked ? "Locked" : "Open"}
          />
        )}
        primary={{ label: "New research", onClick: start }}
        actions={(r) =>
          r.deletedAt
            ? [
                { label: "Restore", onClick: () => void restore([r]) },
                { label: "Delete for good", danger: true, onClick: () => void removeForGood([r]) },
              ]
            : [
                { label: "Open", onClick: () => open(r.id) },
                {
                  label: archiveLabel(!!r.archivedAt),
                  onClick: () => void archive([r], !r.archivedAt),
                },
                { label: "Delete", danger: true, onClick: () => void remove([r]) },
              ]
        }
        bulk={(view) =>
          view === "Deleted"
            ? [
                { label: "Restore", onClick: (rows) => void restore(rows) },
                {
                  label: "Delete for good",
                  danger: true,
                  onClick: (rows) => void removeForGood(rows),
                },
              ]
            : [
                { label: "Archive", onClick: (rows) => void archive(rows, true) },
                { label: "Restore", onClick: (rows) => void archive(rows, false) },
                { label: "Delete", danger: true, onClick: (rows) => void remove(rows) },
              ]
        }
        detail={(r) => (
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 14, paddingRight: 28 }}>{r.title}</div>
            <TopChip onClick={() => open(r.id)}>Open research</TopChip>
            <div>
              <SectionLabel style={{ marginBottom: 6 }}>Details</SectionLabel>
              {(
                [
                  ["Document", r.reportLocked ? "Locked" : "Open"],
                  ["Linked matter", r.matterId ? "Yes" : "Not linked"],
                  ["Updated", new Date(r.updatedAt).toLocaleString()],
                ] as [string, string][]
              ).map(([k, v]) => (
                <div key={k} style={{ display: "flex", gap: 14, padding: "3px 0", fontSize: 13 }}>
                  <span style={{ width: 110, color: C.muted, flex: "none" }}>{k}</span>
                  <span style={{ color: C.body }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        empty={
          loading
            ? "Loading research matters…"
            : "No research matters yet — start one from New research."
        }
      />
      {!loading && !matters.length && (
        <div style={{ padding: "0 24px 24px" }}>
          <div className="rs-empty">
            <b>Start with the instruction</b>
            <p>
              Write what you were asked to advise on and the facts behind it. Scripta frames the
              questions, proposes where to look, and shows you both before any research begins.
            </p>
            <Button variant="primary" onClick={start}>
              New research
            </Button>
          </div>
        </div>
      )}
      {confirmDialog}
    </AppShell>
  );
}
