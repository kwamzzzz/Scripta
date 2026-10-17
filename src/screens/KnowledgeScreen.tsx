/**
 * Precedents — the drafting this firm has actually used.
 *
 * Not a clause bank somebody sat down and filled in. Every row here was kept
 * from a real piece of work: a clause that survived a negotiation, a section of
 * a resolution that was signed, a memo that went out. So the table leads with
 * what a lawyer reaching for wording needs to judge it — how far it got, which
 * side we were on, and what it came from — and the ⋯ menu, views, columns and
 * archive behave exactly as they do on Matters and Templates.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import AppShell, { Crumbs } from "@/components/AppShell";
import { SectionPanel } from "@/components/SectionPanel";
import { viewGroups } from "@/components/section-views";
import { usePersisted } from "@/lib/use-board";
import Library, { type LibColumn, type LibView } from "@/components/Library";
import KnowledgeStatus from "@/components/KnowledgeStatus";
import { stateOf } from "@/lib/knowledge";
import { useAuth } from "@/lib/auth";
import LibraryCard from "@/components/LibraryCard";
import StatusPill, { type StatusTone } from "@/components/StatusPill";
import { Button } from "@/components/primitives";
import { useApp } from "@/store/app";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import { archiveLabel, archiveVerb, setArchived } from "@/lib/archive";
import { binCountdown, deleteForever, moveToBin, restoreFromBin } from "@/lib/trash";
import { relTime } from "@/lib/home-data";
import { C } from "@/lib/tokens";
import {
  KIND_LABEL,
  STATUS_LABEL,
  listPrecedents,
  type Precedent,
  type PrecedentStatus,
} from "@/lib/precedents";
import "./knowledge-screen.css";

/** Where it was kept from, in the words of the screen it was kept on. */
const SOURCE_LABEL: Record<string, string> = {
  review: "Contract review",
  corporate: "Corporate drafting",
  drafting: "Clause drafting",
  flow: "Flow",
  manual: "Added by hand",
};

/**
 * How far the drafting got, as a meaning rather than a colour. Superseded is
 * not merely "not approved" — it is wording that was live and has been
 * replaced, which is the one thing a lawyer reusing it must not miss.
 */
const STATUS_TONE: Record<PrecedentStatus, StatusTone> = {
  draft: "neutral",
  negotiated: "progress",
  approved: "good",
  executed: "good",
  superseded: "retired",
};

/** How far the drafting got. Executed wording is worth more than drafted. */
const PRECEDENT_STAGES = ["Draft", "Negotiated", "Approved", "Executed", "Superseded"];

export default function KnowledgeScreen() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { workspaceId } = useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);

  const precedents = useQuery({
    queryKey: ["precedents", workspaceId],
    enabled: !!workspaceId,
    retry: false,
    queryFn: () => listPrecedents(workspaceId!),
  });

  const open = (id: string) =>
    void navigate({ to: "/knowledge/$precedentId", params: { precedentId: id } });

  const copy = async (p: Precedent) => {
    try {
      await navigator.clipboard.writeText(p.body);
      setNotice(`“${p.title}” copied.`);
    } catch {
      setNotice("Could not copy. Open the record and copy the wording from there.");
    }
  };

  const { confirmDelete, confirmDialog } = useConfirmDelete();

  /** Out of the active workspace, and back again. Reversible, so it does not ask. */
  const archive = async (rows: Precedent[], archived: boolean) => {
    if (!rows.length) return;
    try {
      await setArchived(
        "precedents",
        rows.map((r) => r.id),
        archived,
      );
      await queryClient.invalidateQueries({ queryKey: ["precedents", workspaceId] });
    } catch (error) {
      setNotice(
        `That precedent could not be ${archiveVerb(archived)}. ${(error as Error).message}`,
      );
    }
  };

  const remove = useMutation({
    mutationFn: (rows: Precedent[]) =>
      moveToBin(
        "precedents",
        rows.map((row) => row.id),
      ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["precedents", workspaceId] }),
    onError: (error) => setNotice((error as Error).message),
  });

  const confirmRemove = async (rows: Precedent[]) => {
    if (!rows.length) return;
    const what = rows.length === 1 ? `“${rows[0]!.title}”` : `${rows.length} precedents`;
    if (
      await confirmDelete({
        what,
        count: rows.length,
        consequence: "The wording goes with it.",
      })
    )
      remove.mutate(rows);
  };

  /** Out of Recently Deleted, back to wherever it was — archived ones included. */
  const restore = async (rows: Precedent[]) => {
    if (!rows.length) return;
    setNotice(null);
    try {
      await restoreFromBin(
        "precedents",
        rows.map((r) => r.id),
      );
      await queryClient.invalidateQueries({ queryKey: ["precedents", workspaceId] });
    } catch (error) {
      setNotice(`That precedent could not be restored. ${(error as Error).message}`);
    }
  };

  /** Before the fifteen days are up. There is no bin left to promise. */
  const removeForGood = async (rows: Precedent[]) => {
    if (!rows.length) return;
    const what = rows.length === 1 ? `“${rows[0]!.title}”` : `${rows.length} precedents`;
    if (
      !(await confirmDelete({
        what,
        count: rows.length,
        consequence: "The wording goes with it.",
        binned: false,
      }))
    )
      return;
    setNotice(null);
    try {
      await deleteForever(
        "precedents",
        rows.map((r) => r.id),
      );
      await queryClient.invalidateQueries({ queryKey: ["precedents", workspaceId] });
    } catch (error) {
      setNotice((error as Error).message);
    }
  };

  const columns: LibColumn<Precedent>[] = [
    {
      key: "title",
      label: "Precedent",
      render: (p) => (
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 600, color: C.text }}>{p.title}</span>
            {/* Firm-wide is the ordinary case and gets no mark. Private, shared
                and approved are the facts worth seeing without opening it. */}
            <KnowledgeStatus
              facts={{
                visibility: p.visibility,
                approvedAt: p.approvedAt,
                contentChangedAt: p.contentChangedAt,
              }}
            />
          </div>
          {p.deletedAt && (
            <div style={{ color: C.muted, fontSize: 11.5 }}>{binCountdown(p.deletedAt)}</div>
          )}
          {p.whyUseful && (
            <div
              style={{
                color: C.muted,
                fontSize: 11.5,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {p.whyUseful}
            </div>
          )}
        </div>
      ),
      value: (p) => p.title.toLowerCase(),
    },
    {
      key: "status",
      label: "Status",
      width: 120,
      render: (p) => <StatusPill label={STATUS_LABEL[p.status]} tone={STATUS_TONE[p.status]} />,
      value: (p) => p.status,
    },
    {
      key: "kind",
      label: "Keeps",
      width: 110,
      render: (p) => KIND_LABEL[p.kind],
      value: (p) => p.kind,
    },
    {
      key: "clauseType",
      label: "Clause or topic",
      width: 190,
      render: (p) => p.clauseType || <span style={{ color: C.faint }}>—</span>,
      value: (p) => p.clauseType,
    },
    {
      key: "ourRole",
      label: "We acted for",
      width: 150,
      render: (p) => p.ourRole || <span style={{ color: C.faint }}>—</span>,
      value: (p) => p.ourRole,
    },
    {
      key: "agreementType",
      label: "Agreement",
      width: 170,
      render: (p) => p.agreementType || <span style={{ color: C.faint }}>—</span>,
      value: (p) => p.agreementType,
    },
    {
      key: "jurisdiction",
      label: "Jurisdiction",
      width: 140,
      render: (p) => p.jurisdiction || <span style={{ color: C.faint }}>—</span>,
      value: (p) => p.jurisdiction,
    },
    {
      key: "source",
      label: "Kept from",
      width: 150,
      render: (p) => (
        <span style={{ color: C.muted }}>
          {(p.sourceKind && SOURCE_LABEL[p.sourceKind]) || p.sourceNote || "—"}
        </span>
      ),
      value: (p) => p.sourceKind ?? "",
      defaultOff: true,
    },
    {
      key: "sector",
      label: "Sector",
      width: 140,
      render: (p) => p.sector || <span style={{ color: C.faint }}>—</span>,
      value: (p) => p.sector,
      defaultOff: true,
    },
    {
      key: "updated",
      label: "Updated",
      width: 120,
      render: (p) => <span style={{ color: C.muted }}>{relTime(p.updatedAt)}</span>,
      value: (p) => p.updatedAt,
    },
  ];

  // Archived is a lifecycle state, not a status, so it shows only under Archived.
  // A deleted precedent leaves every view, Archived included: it is in the
  // bin, not merely put aside.
  const live = (p: Precedent) => !p.archivedAt && !p.deletedAt;
  const views: LibView<Precedent>[] = [
    { key: "All", label: "All", filter: live },
    /* The four a lawyer actually sorts by. Deliberately not a taxonomy
       project: mine, lent to me, the firm's, and the firm's position. */
    {
      key: "Mine",
      label: "My knowledge",
      filter: (p) => live(p) && (p.ownerId === userId || p.createdBy === userId),
    },
    {
      key: "SharedWithMe",
      label: "Shared with me",
      filter: (p) =>
        live(p) && p.visibility === "shared" && p.ownerId !== userId && p.createdBy !== userId,
    },
    { key: "Firm", label: "Firm knowledge", filter: (p) => live(p) && p.visibility === "firm" },
    {
      key: "ApprovedKnowledge",
      label: "Approved",
      filter: (p) =>
        live(p) &&
        stateOf({
          visibility: p.visibility,
          approvedAt: p.approvedAt,
          contentChangedAt: p.contentChangedAt,
        }) === "approved",
    },
    {
      key: "Signed",
      label: "Signed or approved",
      filter: (p) => live(p) && (p.status === "executed" || p.status === "approved"),
    },
    { key: "Negotiated", label: "Negotiated", filter: (p) => live(p) && p.status === "negotiated" },
    { key: "Clauses", label: "Clauses", filter: (p) => live(p) && p.kind === "clause" },
    { key: "Documents", label: "Whole documents", filter: (p) => live(p) && p.kind === "document" },
    {
      key: "Superseded",
      label: "Superseded",
      filter: (p) => live(p) && p.status === "superseded",
    },
    { key: "Archived", label: "Archived", filter: (p) => !!p.archivedAt && !p.deletedAt },
    { key: "Deleted", label: "Recently Deleted", filter: (p) => !!p.deletedAt },
  ];
  const [view, setView] = usePersisted("px.lib.precedents.view", "All");

  return (
    <AppShell
      section="knowledge"
      panel={
        <SectionPanel
          title="Precedents"
          meta={`${(precedents.data ?? []).filter((p) => !p.archivedAt && !p.deletedAt).length} live`}
          groups={viewGroups(views, precedents.data ?? [])}
          activeId={view}
          onSelect={setView}
        />
      }
      breadcrumb={<Crumbs items={[{ label: "Precedents" }]} />}
      scroll={false}
      assistant={{
        key: "precedents",
        screen: "Precedents",
        intro: "Ask which of your precedents is closest to the clause you are drafting.",
      }}
    >
      {(notice || precedents.isError) && (
        <div role="alert" style={{ padding: "8px 20px", color: C.red, fontSize: 12.5 }}>
          {notice ?? (precedents.error as Error).message}
        </div>
      )}
      <Library
        storageKey="precedents"
        view={view}
        onViewChange={setView}
        title="Precedents"
        description="Drafting this firm has used, kept from the work it came from. Each one records how far it got and which side we were on."
        rows={precedents.data ?? []}
        columns={columns}
        views={views}
        searchText={(p) =>
          [p.title, p.body, p.clauseType, p.agreementType, p.jurisdiction, p.ourRole, p.whyUseful]
            .filter(Boolean)
            .join(" ")
        }
        searchPlaceholder="Search wording, clause or matter"
        onOpen={(p) => open(p.id)}
        board={{
          columns: PRECEDENT_STAGES,
          column: (p) => STATUS_LABEL[p.status],
          card: (p) => (
            <LibraryCard
              compact
              title={p.title}
              onOpen={() => open(p.id)}
              state={KIND_LABEL[p.kind]}
            />
          ),
        }}
        cards={(p) => (
          <LibraryCard
            title={p.title}
            onOpen={() => open(p.id)}
            subtitle={[p.clauseType, p.agreementType].filter(Boolean).join(" · ") || undefined}
            state={STATUS_LABEL[p.status]}
            facts={[KIND_LABEL[p.kind], p.jurisdiction || "", p.ourRole || ""]}
          />
        )}
        actions={(p) =>
          p.deletedAt
            ? [
                { label: "Restore", onClick: () => void restore([p]) },
                { label: "Delete for good", danger: true, onClick: () => void removeForGood([p]) },
              ]
            : [
                { label: "Open the record", onClick: () => open(p.id) },
                { label: "Copy the wording", onClick: () => void copy(p) },
                {
                  label: archiveLabel(!!p.archivedAt),
                  onClick: () => void archive([p], !p.archivedAt),
                },
                { label: "Delete", danger: true, onClick: () => void confirmRemove([p]) },
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
                { label: "Delete", danger: true, onClick: (rows) => void confirmRemove(rows) },
              ]
        }
        detail={(p) => (
          <PrecedentSummary p={p} onOpen={() => open(p.id)} onUse={() => void copy(p)} />
        )}
        empty={precedents.isLoading ? <p role="status">Loading precedents…</p> : <FirstTime />}
      />
      {confirmDialog}
    </AppShell>
  );
}

/**
 * The first thing a lawyer sees on an empty library.
 *
 * The old screen said "No precedents yet" and offered a blank form, which asks
 * someone to invent a precedent — the one thing a precedent cannot be. This
 * says where they actually come from.
 */
function FirstTime() {
  return (
    <div className="knowledge-first">
      <h2>Your precedents build themselves</h2>
      <p>
        A precedent is drafting that has been used, so Scripta keeps it from the work rather than
        asking you to write a library. Whenever you finish something worth reaching for again, the
        screen you are on offers to keep it:
      </p>
      <ul>
        <li>
          <strong>Contract review</strong> — a clause as it now reads, or an amendment that was
          accepted.
        </li>
        <li>
          <strong>Corporate drafting</strong> — a section of a resolution or letter, once it is
          written.
        </li>
        <li>
          <strong>Flow</strong> — the final version attached to a deliverable.
        </li>
      </ul>
      <p>
        Each one keeps the matter it came from, the side we acted for, and how far it got, so a
        later draft can tell signed wording from a first attempt.
      </p>
    </div>
  );
}

function PrecedentSummary({
  p,
  onOpen,
  onUse,
}: {
  p: Precedent;
  onOpen: () => void;
  onUse: () => void;
}) {
  const facts: [string, string][] = [
    ["Status", STATUS_LABEL[p.status]],
    ["Keeps", KIND_LABEL[p.kind]],
    ["Clause or topic", p.clauseType],
    ["We acted for", p.ourRole],
    ["Counterparty", p.counterpartyType],
    ["Agreement", p.agreementType],
    ["Jurisdiction", p.jurisdiction],
    ["Sector", p.sector],
    ["Kept from", (p.sourceKind && SOURCE_LABEL[p.sourceKind]) || p.sourceNote],
  ];
  return (
    <div className="knowledge-summary">
      <h2>{p.title}</h2>
      {p.whyUseful && <p className="knowledge-why">{p.whyUseful}</p>}
      {p.supersededBy && (
        <p className="knowledge-superseded">
          Later drafting has replaced this. It is kept because the file shows it was used.
        </p>
      )}
      <dl>
        {facts
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
      </dl>
      <div className="knowledge-clause">{p.body || "No wording recorded."}</div>
      <div className="knowledge-summary-actions">
        <Button variant="primary" onClick={onUse}>
          Use in a draft
        </Button>
        <Button onClick={onOpen}>Open the record</Button>
      </div>
    </div>
  );
}
