/**
 * Flow — the section's landing page: every flow this person can open, and
 * every matter that has none yet. It is a collection of comparable items, so it
 * is the shared Library, the same as Contract Review: board, search and the
 * actions menu all behave the way they do everywhere else.
 *
 * A flow may be filed to a matter, organised under a client, or stand on its
 * own, and each card says which. For a filed flow, Archive and Delete act on
 * the matter, as they always have: the flow is how that matter is run, and
 * putting it aside means putting the matter aside. A flow filed to no matter
 * is a thing of its own, so it is archived and deleted as itself.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApp } from "@/store/app";
import AppShell, { Crumbs } from "@/components/AppShell";
import Library, { type LibColumn, type LibView } from "@/components/Library";
import ActionError, { attempt } from "@/components/ActionError";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import { Button } from "@/components/primitives";
import ActionMenu, { type MenuAction } from "@/components/ActionMenu";
import { OwnerTag } from "@/components/Person";
import { archiveVerb, setArchived as setRowsArchived } from "@/lib/archive";
import { setMatterArchived } from "@/lib/matter-edit";
import { deleteMatters } from "@/lib/delete-matters";
import { binCountdown, deleteForever, moveToBin, restoreFromBin } from "@/lib/trash";
import { C, mono } from "@/lib/tokens";
import NewFlowDialog from "./NewFlowDialog";
import FileFlowDialog from "./FileFlowDialog";
import { useClients } from "@/components/client-choice";
import { allDeliverables, deriveFlow, type DerivedFlow, type MatterFlowRecord } from "./model";
import { useToday } from "./store";
import { loadWorkspaceFlows, type FlowHead } from "./flow-db";
import { FLOW, TintChip, fmtDay, plural } from "./ui";
import "./matter-flow.css";

/** Where a row's flow is filed, which decides what Archive and Delete act on. */
type Filing = "matter" | "client" | "standalone" | "no-flow";

const FILING_LABEL: Record<Filing, string> = {
  matter: "Matter flow",
  client: "Client flow",
  standalone: "Standalone flow",
  "no-flow": "No flow yet",
};

type Row = {
  /** The flow's id, or `matter:<id>` for a matter with no flow yet. */
  id: string;
  name: string;
  filing: Filing;
  head: FlowHead | null;
  matterId: string | null;
  matterName: string;
  client: string | null;
  flow: DerivedFlow | null;
  sample: boolean;
  /** Put aside, and binned. Both belong to the matter, not to its flow. */
  archivedAt: string | null;
  deletedAt: string | null;
  /** The board groups by this, and the status chip says it. */
  standing: string;
  activePhase: string;
  /** Which phase of how many, for the card's one line of progress. */
  phaseNumber: number;
  phaseCount: number;
  nextDeadline: string | null;
  nextName: string;
  /** Who owes the next thing. The nearest Flow has to a responsible lawyer. */
  nextOwner: string;
  nextOwnerId: string | null;
  overdue: number;
  waiting: number;
  complete: number;
  total: number;
};

/**
 * The columns of the board, in the order a day is read: what has not begun,
 * what is moving, what is stuck on somebody else, what has slipped, what is
 * done.
 *
 * Overdue stays its own column rather than folding into Active. It is not a
 * worse kind of active — it is the one thing a board exists to surface, and a
 * board that hides it is a list with gaps in it.
 */
const STANDINGS = ["Not started", "Active", "Waiting", "Overdue", "Complete"];

export default function MatterFlowIndex() {
  const { matters, loading, workspaceId } = useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const today = useToday();
  const [notice] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [organising, setOrganising] = useState<Row | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const { confirmDelete, confirmDialog } = useConfirmDelete();

  const named = (rows: Row[]) =>
    rows.length === 1 ? `“${rows[0]!.name}”` : `${rows.length} matters`;
  /** Every screen reads matters from the same query, so all of them are stale. */
  const refresh = () => queryClient.invalidateQueries();

  /** Rows whose flow is filed to no matter act on the flow; the rest, on their matter. */
  const split = (rows: Row[]) => ({
    flows: rows.filter((r) => r.head && !r.matterId).map((r) => r.head!.flowId),
    matters: [...new Set(rows.filter((r) => r.matterId).map((r) => r.matterId!))],
  });

  const setArchived = async (rows: Row[], archived: boolean) => {
    if (!rows.length) return;
    setActionError(null);
    const { flows: flowIds } = split(rows);
    if (flowIds.length) {
      const done = await attempt(
        `${named(rows)} could not be ${archiveVerb(archived)}`,
        () => setRowsArchived("matter_flows", flowIds, archived),
        setActionError,
      );
      if (!done) return void (await refresh());
    }
    for (const row of rows.filter((r) => r.matterId)) {
      const done = await attempt(
        `“${row.name}” could not be ${archiveVerb(archived)}`,
        () => setMatterArchived(row.matterId!, archived),
        setActionError,
      );
      if (!done) break;
    }
    await refresh();
  };

  const remove = async (rows: Row[]) => {
    if (!rows.length) return;
    const it = rows.length === 1 ? "it" : "them";
    if (
      !(await confirmDelete({
        what: named(rows),
        count: rows.length,
        consequence: rows.every((r) => r.head && !r.matterId)
          ? `Everything in ${it} goes too.`
          : `The matter goes with ${it}, and so does everything else in ${it}.`,
      }))
    )
      return;
    setActionError(null);
    const { flows: flowIds, matters: matterIds } = split(rows);
    const done = await attempt(
      `${named(rows)} could not be deleted`,
      async () => {
        await moveToBin("matter_flows", flowIds);
        await moveToBin("matters", matterIds);
      },
      setActionError,
    );
    if (done) await refresh();
  };

  /** Out of Recently Deleted, back to wherever it was — archived ones included. */
  const restore = async (rows: Row[]) => {
    if (!rows.length) return;
    setActionError(null);
    const { flows: flowIds, matters: matterIds } = split(rows);
    const done = await attempt(
      `${named(rows)} could not be restored`,
      async () => {
        await restoreFromBin("matter_flows", flowIds);
        await restoreFromBin("matters", matterIds);
      },
      setActionError,
    );
    if (done) await refresh();
  };

  /**
   * Before the fifteen days are up. `deleteMatters` rather than `deleteForever`
   * because a matter's uploaded files live in storage, which no cascade reaches.
   */
  const removeForGood = async (rows: Row[]) => {
    if (!rows.length) return;
    const it = rows.length === 1 ? "it" : "them";
    if (
      !(await confirmDelete({
        what: named(rows),
        count: rows.length,
        consequence: rows.every((r) => r.head && !r.matterId)
          ? `Everything in ${it} goes too.`
          : `The matter goes with ${it}, and so does everything else in ${it}.`,
        binned: false,
      }))
    )
      return;
    setActionError(null);
    const { flows: flowIds, matters: matterIds } = split(rows);
    const done = await attempt(
      `${named(rows)} could not be deleted`,
      async () => {
        await deleteForever("matter_flows", flowIds);
        await deleteMatters(matterIds);
      },
      setActionError,
    );
    if (done) await refresh();
  };

  /**
   * The flows themselves, from the database.
   *
   * This list used to read localStorage, which was right while flows lived
   * there and wrong from the moment they moved to the database: a flow created
   * in another browser, on another machine, or before this one's cache was
   * cleared read as "No flow yet" — the same as work that was never saved at
   * all. That is not a cosmetic difference. It is the list telling you your
   * afternoon is gone when it is sitting in the database.
   */
  const flows = useQuery({
    queryKey: ["flows", workspaceId],
    enabled: !!workspaceId,
    retry: false,
    queryFn: () => loadWorkspaceFlows(workspaceId!),
  });

  const clients = useClients();
  const clientName = (id: string | null) =>
    id ? (clients.data?.find((c) => c.id === id)?.name ?? null) : null;

  const rows = useMemo<Row[]>(() => {
    const summarise = (record: MatterFlowRecord | null) => {
      const flow = record && record.phases.length > 0 ? deriveFlow(record, today) : null;
      const items = flow ? allDeliverables(flow) : [];
      const overdue = items.filter((d) => d.state === "overdue").length;
      const waiting = items.filter((d) => d.state === "waiting_on").length;
      const next = items
        .filter((d) => !d.complete && d.deadline >= today)
        .sort((a, b) => a.deadline.localeCompare(b.deadline))[0];
      const closed = !!flow && flow.closedCount === flow.phases.length;
      return {
        flow,
        standing: !flow
          ? "Not started"
          : overdue
            ? "Overdue"
            : waiting
              ? "Waiting"
              : closed
                ? "Complete"
                : "Active",
        activePhase: flow?.activePhase?.name ?? "",
        phaseNumber: flow?.activePhase
          ? flow.phases.findIndex((p) => p.id === flow.activePhase!.id) + 1
          : 0,
        phaseCount: flow?.phases.length ?? 0,
        nextDeadline: next?.deadline ?? null,
        nextName: next?.name ?? "",
        // A deliverable with no owner carries an em dash for the detail panel
        // to draw. On a card it reads as a name that failed to load.
        nextOwner: (next?.owner ?? "").replace(/^[—–-]$/, ""),
        nextOwnerId: next?.ownerId ?? null,
        overdue,
        waiting,
        complete: items.filter((d) => d.complete).length,
        total: items.length,
      };
    };

    const byId = new Map(matters.map((m) => [m.id, m]));
    const stored = flows.data ?? [];

    const flowRows: Row[] = stored.map(({ head, record }) => {
      const m = head.matterId ? byId.get(head.matterId) : undefined;
      const filing: Filing = head.matterId ? "matter" : head.clientId ? "client" : "standalone";
      return {
        id: head.flowId,
        name: head.name || m?.name || "Untitled flow",
        filing,
        head,
        matterId: head.matterId,
        matterName: m?.name ?? "",
        client: m ? m.client : clientName(head.clientId),
        sample: false,
        // A filed flow is put aside with its matter; one filed to no matter, as itself.
        archivedAt: m ? m.archived_at : head.archivedAt,
        deletedAt: m ? m.deleted_at : head.deletedAt,
        ...summarise(record),
      };
    });

    // Flow is the home of standalone flows. A client's or a matter's flows live,
    // and open, inside that client or matter.
    return flowRows.filter((r) => r.filing === "standalone");
    // clientName reads clients.data, which is in the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matters, today, flows.data, clients.data]);

  const open = (row: Row) =>
    row.head
      ? void navigate({ to: "/flows/$flowId", params: { flowId: row.head.flowId } })
      : void navigate({ to: "/matters/$matterId/flow", params: { matterId: row.matterId! } });

  const columns: LibColumn<Row>[] = [
    {
      key: "name",
      label: "Flow",
      render: (r) => (
        <span>
          <span style={{ fontWeight: 600, color: C.text }}>{r.name}</span>
          {r.sample && <span style={{ color: C.muted, fontSize: 11 }}> · sample flow</span>}
          {r.deletedAt && (
            <span style={{ display: "block", color: C.muted, fontSize: 11.5 }}>
              {binCountdown(r.deletedAt)}
            </span>
          )}
        </span>
      ),
      value: (r) => r.name.toLowerCase(),
    },
    {
      key: "client",
      label: "Client",
      width: 160,
      render: (r) => <span style={{ color: C.muted }}>{r.client ?? "—"}</span>,
      value: (r) => (r.client ?? "").toLowerCase(),
    },
    {
      key: "phase",
      label: "Active phase",
      width: 180,
      render: (r) => (
        <span style={{ color: r.activePhase ? C.body : C.muted }}>
          {r.activePhase || "No flow yet"}
        </span>
      ),
      value: (r) => r.activePhase.toLowerCase(),
    },
    {
      key: "next",
      label: "Next deadline",
      width: 200,
      render: (r) => (
        <span style={{ color: r.nextDeadline ? C.text : C.muted }}>
          {r.nextDeadline ? `${fmtDay(r.nextDeadline)} · ${r.nextName}` : "—"}
        </span>
      ),
      value: (r) => r.nextDeadline ?? "",
    },
    {
      key: "phases",
      label: "Phases",
      width: 110,
      render: (r) => (
        <span style={{ fontFamily: mono, fontSize: 11.5, color: C.muted }}>
          {r.flow ? `${r.flow.closedCount}/${r.flow.phases.length}` : "—"}
        </span>
      ),
      value: (r) => r.flow?.closedCount ?? -1,
    },
    {
      key: "deliverables",
      label: "Deliverables",
      width: 120,
      render: (r) => (
        <span style={{ fontFamily: mono, fontSize: 11.5, color: C.muted }}>
          {r.flow ? `${r.complete}/${r.total}` : "—"}
        </span>
      ),
      value: (r) => r.complete,
    },
    {
      key: "standing",
      label: "Status",
      width: 140,
      render: (r) => <StandingChip row={r} />,
      value: (r) => r.standing,
    },
  ];

  // Live means neither put aside nor binned. Without this every filter below
  // counted matters that had been archived or deleted in Contract Review, so
  // tidying up there changed nothing here.
  const live = (r: Row) => !r.archivedAt && !r.deletedAt;
  /**
   * Only the places, not the states.
   *
   * Overdue, Waiting and Not started were views here as well as lanes on the
   * board — the same filter offered twice, one of which silently emptied four
   * of the five lanes when you used it. The board is the state filter now.
   * Archived and Recently Deleted stay, because they are somewhere a flow goes,
   * not a state it is in.
   */
  const views: LibView<Row>[] = [
    { key: "All", label: "All", filter: live },
    { key: "Archived", label: "Archived", filter: (r) => !!r.archivedAt && !r.deletedAt },
    { key: "Deleted", label: "Recently Deleted", filter: (r) => !!r.deletedAt },
  ];

  /** The row's menu, the same on the card and in the list. */
  const rowActions = (r: Row, withOpen: boolean): MenuAction[] => {
    if (r.deletedAt)
      return [
        { label: "Restore", onClick: () => void restore([r]) },
        { label: "Delete for good", danger: true, onClick: () => void removeForGood([r]) },
      ];
    return [
      ...(withOpen
        ? [{ label: r.head ? "Open flow" : "Set up flow", onClick: () => open(r) }]
        : []),
      ...(r.matterId
        ? [
            {
              label: "Open matter",
              onClick: () =>
                void navigate({
                  to: "/matters/$matterId",
                  params: { matterId: r.matterId! },
                  search: { screen: "matter" } as never,
                }),
            },
          ]
        : [{ label: "Organise…", onClick: () => setOrganising(r) }]),
      r.archivedAt
        ? { label: "Restore", onClick: () => void setArchived([r], false) }
        : { label: "Archive", onClick: () => void setArchived([r], true) },
      { label: "Delete", danger: true, onClick: () => void remove([r]) },
    ];
  };

  return (
    <AppShell
      section="matter-flow"
      scroll={false}
      breadcrumb={<Crumbs items={[{ label: "Flow" }]} />}
      assistant={{
        key: "matter-flow",
        label: "Flow",
        screen: "Flow",
        suggestions: ["Which matters have an overdue deliverable?", "What closes this week?"],
      }}
    >
      {notice && (
        <div role="alert" style={{ padding: "8px 20px", color: C.red, fontSize: 12.5 }}>
          {notice}
        </div>
      )}
      <ActionError error={actionError} onDismiss={() => setActionError(null)} />
      {flows.isError && (
        <div role="alert" style={{ padding: "8px 20px", color: C.red, fontSize: 12.5 }}>
          These flows could not be read, so every matter below will say it has none.{" "}
          {(flows.error as Error).message}{" "}
          <Button onClick={() => void flows.refetch()}>Try again</Button>
        </div>
      )}
      <Library
        storageKey="flow"
        defaultMode="board"
        // Flow IS the board. Its columns are execution states and its cards
        // carry progress; a table of the same rows is a different product
        // wearing the same data. See the note on `modes`.
        modes={["board"]}
        className="mf-board"
        title="Flow"
        description="Flows that stand on their own. A client's or a matter's flows are kept inside that client or matter."
        beforeToolbar={<FlowSummary rows={rows.filter(live)} today={today} />}
        rows={rows}
        columns={columns}
        views={views}
        searchText={(r) =>
          [
            r.name,
            r.matterName,
            r.client ?? "",
            FILING_LABEL[r.filing],
            r.activePhase,
            r.nextName,
          ].join(" ")
        }
        searchPlaceholder="Search flows"
        rowLabel={(r) => r.name}
        onOpen={open}
        // Matter creation belongs in Matters. What you come here to start is a
        // flow — on a matter, under a client, or on its own.
        primary={{ label: "Create Flow", onClick: () => setCreating(true) }}
        secondary={{
          label: "Presets",
          onClick: () => void navigate({ to: "/matters/flow/presets" }),
        }}
        actions={(r) =>
          rowActions(r, true).map((a) => ({
            label: a.label,
            onClick: () => a.onClick(),
            ...(a.danger ? { danger: true } : {}),
          }))
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
                { label: "Archive", onClick: (rows) => void setArchived(rows, true) },
                { label: "Restore", onClick: (rows) => void setArchived(rows, false) },
                { label: "Delete", danger: true, onClick: (rows) => void remove(rows) },
              ]
        }
        board={{
          columns: STANDINGS,
          column: (r) => r.standing,
          card: (r) => <FlowCard row={r} onOpen={() => open(r)} actions={rowActions(r, false)} />,
        }}
        detail={(r) => <FlowDetail row={r} onOpen={() => open(r)} />}
        empty={
          loading || flows.isLoading ? (
            <p>Loading flows…</p>
          ) : (
            <>
              <h3>No flows yet</h3>
              <p>Create one on its own, under a client, or for a matter.</p>
            </>
          )
        }
      />
      {confirmDialog}
      {creating && <NewFlowDialog open onClose={() => setCreating(false)} />}
      {organising?.head && (
        <FileFlowDialog
          open
          head={organising.head}
          flowName={organising.name}
          clientName={organising.client}
          onClose={() => setOrganising(null)}
          onFiled={async () => {
            await refresh();
          }}
        />
      )}
    </AppShell>
  );
}

/**
 * How the room stands, in one line.
 *
 * Not a row of dashboard tiles. A lawyer walking in wants to know whether
 * anything is on fire and what is due — two facts, read in a glance, in the
 * same weight as the rest of the page.
 */
function FlowSummary({ rows, today }: { rows: Row[]; today: string }) {
  const count = (state: string) => rows.filter((r) => r.standing === state).length;
  const soonest = rows
    .map((r) => r.nextDeadline)
    .filter((d): d is string => !!d)
    .sort()[0];
  const overdue = count("Overdue");

  const parts = [
    `${count("Active")} active`,
    `${count("Not started")} need setup`,
    `${count("Waiting")} waiting`,
  ];

  return (
    <div className="mf-summary">
      <span>{parts.join(" · ")}</span>
      {overdue > 0 && <strong className="is-overdue">{plural(overdue, "overdue")}</strong>}
      {soonest && (
        <span className="mf-summary-next">
          Next deadline {soonest === today ? "today" : fmtDay(soonest)}
        </span>
      )}
    </div>
  );
}

function StandingChip({ row }: { row: Row }) {
  if (!row.flow) return <TintChip tint="grey">Not started</TintChip>;
  if (row.overdue) return <TintChip tint="red">{plural(row.overdue, "overdue")}</TintChip>;
  if (row.waiting) return <TintChip tint="orange">{row.waiting} waiting</TintChip>;
  return (
    <TintChip tint={row.standing === "Complete" ? "green" : "amber"}>
      {row.standing === "Complete" ? "Complete" : "Active"}
    </TintChip>
  );
}

/**
 * A flow on the board.
 *
 * The hierarchy is the design. A lawyer scanning this lane is asking, in this
 * order: which matter, how far along, what is due next. So the matter is the
 * heading, the phase and its bar sit immediately under it as one block, the
 * next obligation gets its own bordered field, and everything else — owner,
 * counts, last touched — is supporting weight at the foot.
 *
 * Nothing here is a badge for its own sake. The lane already says what state
 * the flow is in, so the card does not repeat it in a coloured pill; it carries
 * the two numbers the lane cannot show, which are how far and how soon.
 *
 * Room has been left at the head for collaboration — a responsible lawyer, a
 * reviewer, a small stack of avatars — without drawing controls for people who
 * are not there yet. `owner` is the seam.
 */
function FlowCard({
  row,
  onOpen,
  actions,
}: {
  row: Row;
  onOpen: () => void;
  actions: MenuAction[];
}) {
  const share = row.total ? row.complete / row.total : 0;
  const late = row.standing === "Overdue";

  if (!row.flow)
    return (
      <article className="mf-card is-empty">
        <button type="button" className="mf-card-hit" onClick={onOpen}>
          <span className="sr-only">
            {row.head ? `Open the flow ${row.name}` : `Create a flow for ${row.name}`}
          </span>
        </button>
        <div className="mf-card-head">
          <h3>{row.name}</h3>
          <div className="mf-card-menu">
            <ActionMenu label={row.name} actions={actions} />
          </div>
        </div>
        <FlowContext row={row} />
        <div className="mf-empty-state">
          {row.head ? (
            <>
              <strong>No phases yet</strong>
              <p>Lay out the phases, deliverables and deadlines.</p>
              <span className="mf-empty-cta">Open flow →</span>
            </>
          ) : (
            <>
              <strong>No flow created</strong>
              <p>Structure this matter into phases, deliverables and deadlines.</p>
              <span className="mf-empty-cta">Create flow →</span>
            </>
          )}
        </div>
      </article>
    );

  return (
    <article className={`mf-card${late ? " is-late" : ""}`}>
      <button type="button" className="mf-card-hit" onClick={onOpen}>
        <span className="sr-only">Open the flow for {row.name}</span>
      </button>

      <div className="mf-card-head">
        <h3>{row.name}</h3>
        <div className="mf-card-menu">
          <ActionMenu label={row.name} actions={actions} />
        </div>
      </div>
      <FlowContext row={row} />

      {/* Phase and progress read as one thing: where it is, and how far. */}
      <div className="mf-card-progress">
        <div className="mf-card-phase">
          <span>{row.activePhase}</span>
          {row.phaseCount > 0 && (
            <em>
              Phase {row.phaseNumber} of {row.phaseCount}
            </em>
          )}
        </div>
        <div
          className="mf-card-bar"
          role="img"
          aria-label={`${row.complete} of ${row.total} deliverables complete`}
        >
          <i style={{ width: `${Math.round(share * 100)}%` }} />
        </div>
      </div>

      {row.nextName ? (
        <div className="mf-card-next">
          <span className="mf-card-label">Next</span>
          <strong>{row.nextName}</strong>
          {row.nextDeadline && (
            <em className={late ? "is-late" : undefined}>{fmtDay(row.nextDeadline)}</em>
          )}
        </div>
      ) : (
        <div className="mf-card-next is-quiet">
          <span className="mf-card-label">Next</span>
          <strong>Nothing scheduled</strong>
        </div>
      )}

      <footer className="mf-card-foot">
        <span className="mf-card-count">
          {row.complete}/{row.total} deliverables
        </span>
        {(row.nextOwnerId || row.nextOwner) && (
          <span className="mf-card-owner">
            <OwnerTag ownerId={row.nextOwnerId} legacy={row.nextOwner} />
          </span>
        )}
      </footer>
    </article>
  );
}

/**
 * Where a flow sits, in the card's one line of context: filed to which matter,
 * under which client, or on its own. A matter's flow named after the matter
 * does not repeat it.
 */
function FlowContext({ row }: { row: Row }) {
  const parts = [
    row.filing === "matter" || row.filing === "no-flow" ? null : FILING_LABEL[row.filing],
    row.matterName && row.matterName !== row.name ? row.matterName : null,
    row.client,
  ].filter(Boolean);
  if (!parts.length) return null;
  return <div className="mf-card-client">{parts.join(" · ")}</div>;
}

function FlowDetail({ row, onOpen }: { row: Row; onOpen: () => void }) {
  const facts: [string, string][] = [
    ["Filed", FILING_LABEL[row.filing]],
    ["Matter", row.matterName || "—"],
    ["Client", row.client ?? "—"],
    ["Active phase", row.activePhase || "No flow yet"],
    ["Phases closed", row.flow ? `${row.flow.closedCount} of ${row.flow.phases.length}` : "—"],
    ["Deliverables complete", row.flow ? `${row.complete} of ${row.total}` : "—"],
    ["Overdue", String(row.overdue)],
    ["Waiting on someone", String(row.waiting)],
  ];
  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{row.name}</h2>
      <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt style={{ color: C.muted, fontSize: 11 }}>{k}</dt>
            <dd style={{ margin: 0, fontSize: 12.5 }}>{v}</dd>
          </div>
        ))}
      </dl>
      <Button variant="primary" onClick={onOpen}>
        {row.head ? "Open flow" : "Set up flow"}
      </Button>
    </div>
  );
}
