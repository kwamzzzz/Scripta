/**
 * Clients — who the firm acts for, and how much work is open for each.
 *
 * The shared Library, as a table: a register reads as rows. The counts beside
 * each client are of the matters, flows and tasks the reader can open, read
 * through those tables' own policies, so the list never tells anybody that
 * work exists which they are not on.
 */
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AppShell, { Crumbs } from "@/components/AppShell";
import { SectionPanel } from "@/components/SectionPanel";
import { viewGroups } from "@/components/section-views";
import { usePersisted } from "@/lib/use-board";
import Library, { type LibColumn, type LibView } from "@/components/Library";
import LibraryEmpty from "@/components/LibraryEmpty";
import ActionError, { attempt } from "@/components/ActionError";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import LoadError from "@/components/LoadError";
import { Button } from "@/components/primitives";
import { useClients } from "@/components/client-choice";
import { archiveVerb } from "@/lib/archive";
import { useAuth } from "@/lib/auth";
import { useWorkspaceRole } from "@/lib/workspace-role";
import { relTime } from "@/lib/home-data";
import { C, mono } from "@/lib/tokens";
import { useApp } from "@/store/app";
import {
  CLIENT_KIND_LABEL,
  loadClientCounts,
  ownsClient,
  setClientArchived,
  setClientDeleted,
  type Client,
  type ClientCounts,
} from "@/lib/clients";
import NewClientDialog from "./NewClientDialog";
import "./clients.css";

type Row = Client & { counts: ClientCounts };

export default function ClientsLibrary() {
  const { workspaceId } = useApp();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const clients = useClients();
  const counts = useQuery({
    queryKey: ["client-counts", workspaceId],
    enabled: !!workspaceId,
    retry: false,
    queryFn: () => loadClientCounts(workspaceId!),
  });
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { confirmDelete, confirmDialog } = useConfirmDelete();
  const { user } = useAuth();
  const { role } = useWorkspaceRole();
  const owns = (c: Client) => ownsClient(c, user?.id, role);

  const open = (id: string) =>
    void navigate({ to: "/clients/$clientId", params: { clientId: id } });
  const zero: ClientCounts = { matters: 0, flows: 0, openTasks: 0 };
  const rows: Row[] = (clients.data ?? []).map((c) => ({
    ...c,
    counts: counts.data?.get(c.id) ?? zero,
  }));

  const setArchived = async (list: Row[], archived: boolean) => {
    setActionError(null);
    for (const row of list) {
      const done = await attempt(
        `“${row.name}” could not be ${archiveVerb(archived)}`,
        () => setClientArchived(row, archived),
        setActionError,
      );
      if (!done) break;
    }
    await qc.invalidateQueries();
  };

  /** Only the client's owner can; anyone else is told whose it is to delete. */
  const remove = async (list: Row[]) => {
    setActionError(null);
    const mine = list.filter(owns);
    if (!mine.length) {
      setActionError(
        list.length === 1
          ? `Only the person who created “${list[0]!.name}” can delete it.`
          : "Only the person who created a client can delete it, and you created none of these.",
      );
      return;
    }
    const yes = await confirmDelete({
      what: mine.length === 1 ? `“${mine[0]!.name}”` : `${mine.length} clients`,
      count: mine.length,
      consequence:
        "Organisation, marketing and documents go with each when it is removed for good. Matters, flows and tasks filed under a client are kept and unfiled.",
    });
    if (!yes) return;
    for (const row of mine) {
      const done = await attempt(
        `“${row.name}” could not be deleted`,
        () => setClientDeleted(row, true),
        setActionError,
      );
      if (!done) break;
    }
    if (mine.length < list.length)
      setActionError(
        `${list.length - mine.length} of them ${list.length - mine.length === 1 ? "was" : "were"} left: only the person who created a client can delete it.`,
      );
    await qc.invalidateQueries();
  };

  const number = (n: number) => (
    <span style={{ fontFamily: mono, color: n ? C.text : C.faint }}>{n}</span>
  );

  const columns: LibColumn<Row>[] = [
    {
      key: "name",
      label: "Client",
      value: (r) => r.name.toLowerCase(),
      render: (r) => <span style={{ fontWeight: 600, color: C.text }}>{r.name}</span>,
    },
    {
      key: "kind",
      label: "Type",
      width: 130,
      value: (r) => r.kind,
      render: (r) => CLIENT_KIND_LABEL[r.kind],
    },
    {
      key: "matters",
      label: "Matters",
      width: 90,
      value: (r) => r.counts.matters,
      render: (r) => number(r.counts.matters),
    },
    {
      key: "flows",
      label: "Flows",
      width: 80,
      value: (r) => r.counts.flows,
      render: (r) => number(r.counts.flows),
    },
    {
      key: "tasks",
      label: "Open tasks",
      width: 100,
      value: (r) => r.counts.openTasks,
      render: (r) => number(r.counts.openTasks),
    },
    {
      key: "reference",
      label: "Reference",
      width: 120,
      defaultOff: true,
      value: (r) => r.reference,
      render: (r) => <span style={{ fontFamily: mono }}>{r.reference}</span>,
    },
    {
      key: "updated",
      label: "Updated",
      width: 120,
      value: (r) => r.updatedAt,
      render: (r) => <span style={{ color: C.muted }}>{relTime(r.updatedAt)}</span>,
    },
  ];

  const views: LibView<Row>[] = [
    { key: "All", label: "All", filter: (r) => !r.archivedAt },
    {
      key: "Active",
      label: "With open work",
      filter: (r) => !r.archivedAt && r.counts.matters + r.counts.flows + r.counts.openTasks > 0,
    },
    { key: "Archived", label: "Archived", filter: (r) => !!r.archivedAt },
  ];
  const [view, setView] = usePersisted("px.lib.clients.view", "All");

  return (
    <AppShell
      section="clients"
      breadcrumb={<Crumbs items={[{ label: "Clients" }]} />}
      scroll={false}
      panel={
        <SectionPanel
          title="Clients"
          meta={`${rows.filter((r) => !r.archivedAt).length} on the books`}
          groups={viewGroups(views, rows)}
          activeId={view}
          onSelect={setView}
          foot={
            <>
              <b>{rows.filter((r) => r.counts.openTasks > 0).length}</b> with open tasks
            </>
          }
        />
      }
    >
      <LoadError what="clients" error={clients.error} onRetry={() => void clients.refetch()} />
      <ActionError error={actionError} onDismiss={() => setActionError(null)} />
      <Library
        storageKey="clients"
        defaultMode="table"
        modes={["table"]}
        title="Clients"
        description="Who the firm acts for. Open a client to see its matters, flows and tasks."
        rows={rows}
        columns={columns}
        views={views}
        view={view}
        onViewChange={setView}
        searchText={(r) => [r.name, r.reference, CLIENT_KIND_LABEL[r.kind]].join(" ")}
        searchPlaceholder="Search clients"
        rowLabel={(r) => r.name}
        onOpen={(r) => open(r.id)}
        primary={{ label: "New client", onClick: () => setCreating(true) }}
        actions={(r) => [
          { label: "Open", onClick: () => open(r.id) },
          r.archivedAt
            ? { label: "Restore", onClick: () => void setArchived([r], false) }
            : { label: "Archive", onClick: () => void setArchived([r], true) },
          ...(owns(r) ? [{ label: "Delete", danger: true, onClick: () => void remove([r]) }] : []),
        ]}
        bulk={(view) =>
          view === "Archived"
            ? [
                { label: "Restore", onClick: (list) => void setArchived(list, false) },
                { label: "Delete", danger: true, onClick: (list) => void remove(list) },
              ]
            : [
                { label: "Archive", onClick: (list) => void setArchived(list, true) },
                { label: "Delete", danger: true, onClick: (list) => void remove(list) },
              ]
        }
        detail={(r) => (
          <div className="cl-detail">
            <header>
              <h2>{r.name}</h2>
              <p>{CLIENT_KIND_LABEL[r.kind]}</p>
            </header>
            <Button variant="primary" onClick={() => open(r.id)}>
              Open client
            </Button>
            <dl>
              <dt>Matters</dt>
              <dd>{r.counts.matters}</dd>
              <dt>Flows</dt>
              <dd>{r.counts.flows}</dd>
              <dt>Open tasks</dt>
              <dd>{r.counts.openTasks}</dd>
              {r.reference && (
                <>
                  <dt>Reference</dt>
                  <dd>{r.reference}</dd>
                </>
              )}
              <dt>Recorded</dt>
              <dd>{relTime(r.createdAt)}</dd>
            </dl>
          </div>
        )}
        empty={
          clients.isPending ? (
            <p>Loading clients…</p>
          ) : (
            <LibraryEmpty
              title="No clients yet"
              action={{ label: "New client", onClick: () => setCreating(true) }}
            >
              A client is the organisation or person the firm acts for. Matters, flows and tasks can
              be filed under one now or later.
            </LibraryEmpty>
          )
        }
      />
      {confirmDialog}
      {creating && (
        <NewClientDialog open onClose={() => setCreating(false)} onCreated={(c) => open(c.id)} />
      )}
    </AppShell>
  );
}
