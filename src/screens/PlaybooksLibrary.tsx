import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/primitives";
import AppShell, { Crumbs } from "@/components/AppShell";
import { SectionPanel } from "@/components/SectionPanel";
import { viewGroups } from "@/components/section-views";
import { usePersisted } from "@/lib/use-board";
import Library, { type LibColumn } from "@/components/Library";
import LibraryCard from "@/components/LibraryCard";
import StatusPill from "@/components/StatusPill";
import { useBoard } from "@/lib/use-board";
import { relTime, type BoardPlaybook } from "@/lib/home-data";
import LoadError from "@/components/LoadError";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import { archiveLabel, archiveVerb, setArchived } from "@/lib/archive";
import { binCountdown, deleteForever, moveToBin, restoreFromBin } from "@/lib/trash";
import "./playbook-screen.css";

/** What went wrong, in the words the row's error line already used. */
const errorText = (error: unknown) => (error instanceof Error ? error.message : "");

/** A playbook is in force or it is being written. Nothing else is a state. */
const PLAYBOOK_STAGES = ["Active", "Draft"];

/** The same pill the table row shows, so a card does not say it differently. */
const playbookPill = (status: string) => (
  <StatusPill label={status} tone={status === "Active" ? "good" : "neutral"} />
);

export default function PlaybooksLibrary() {
  const { board, loading, error: boardError, refetch } = useBoard({ binned: true });
  const qc = useQueryClient();

  const navigate = useNavigate();
  // A playbook belongs to the workspace, not to a matter — open its own editor.
  const go = (p: BoardPlaybook, rule?: string) =>
    void navigate({
      to: "/playbooks/$playbookId",
      params: { playbookId: p.id },
      search: rule ? { rule } : {},
    });

  const [removeError, setRemoveError] = useState<string | null>(null);
  const { confirmDelete, confirmDialog } = useConfirmDelete();

  /** Out of the active workspace, and back again. Reversible, so it does not ask. */
  const archive = async (rows: BoardPlaybook[], archived: boolean) => {
    if (!rows.length) return;
    setRemoveError(null);
    try {
      await setArchived(
        "playbooks",
        rows.map((r) => r.id),
        archived,
      );
      await qc.invalidateQueries();
    } catch (error) {
      const what = rows.length === 1 ? `"${rows[0]!.name}"` : `${rows.length} playbooks`;
      setRemoveError(
        `${what} could not be ${archiveVerb(archived)}. ${error instanceof Error ? error.message : ""}`.trim(),
      );
    }
  };
  /** Deleting a playbook takes every position in it, so the confirmation says
   *  so and names the playbook rather than asking a bare "are you sure". */
  const remove = async (rows: BoardPlaybook[]) => {
    if (!rows.length) return;
    const one = rows.length === 1;
    const what = one ? `"${rows[0]!.name}"` : `${rows.length} playbooks`;
    const positions = rows.reduce((n, r) => n + r.positions, 0);
    const carried = positions
      ? `${positions} position${positions === 1 ? "" : "s"} in ${one ? "it" : "them"} ${positions === 1 ? "goes" : "go"} too.`
      : undefined;
    if (
      !(await confirmDelete({
        what,
        count: rows.length,
        ...(carried ? { consequence: carried } : {}),
      }))
    )
      return;
    setRemoveError(null);
    // A refused delete used to leave the list unchanged and say nothing, which
    // reads as "nothing was selected" rather than "that did not work".
    try {
      await moveToBin(
        "playbooks",
        rows.map((r) => r.id),
      );
    } catch (error) {
      setRemoveError(`${what} could not be deleted. ${errorText(error)}`);
      return;
    }
    await qc.invalidateQueries();
  };

  /** Out of Recently Deleted, back to wherever it was — archived ones included. */
  const restore = async (rows: BoardPlaybook[]) => {
    if (!rows.length) return;
    const what = rows.length === 1 ? `"${rows[0]!.name}"` : `${rows.length} playbooks`;
    setRemoveError(null);
    try {
      await restoreFromBin(
        "playbooks",
        rows.map((r) => r.id),
      );
    } catch (error) {
      setRemoveError(`${what} could not be restored. ${errorText(error)}`);
      return;
    }
    await qc.invalidateQueries();
  };

  /** Before the fifteen days are up. Now the positions really do go. */
  const removeForGood = async (rows: BoardPlaybook[]) => {
    if (!rows.length) return;
    const one = rows.length === 1;
    const what = one ? `"${rows[0]!.name}"` : `${rows.length} playbooks`;
    const positions = rows.reduce((n, r) => n + r.positions, 0);
    const carried = positions
      ? `${positions} position${positions === 1 ? "" : "s"} in ${one ? "it" : "them"} ${positions === 1 ? "goes" : "go"} too.`
      : undefined;
    if (
      !(await confirmDelete({
        what,
        count: rows.length,
        ...(carried ? { consequence: carried } : {}),
        binned: false,
      }))
    )
      return;
    setRemoveError(null);
    try {
      await deleteForever(
        "playbooks",
        rows.map((r) => r.id),
      );
    } catch (error) {
      setRemoveError(`${what} could not be deleted. ${errorText(error)}`);
      return;
    }
    await qc.invalidateQueries();
  };

  const columns: LibColumn<BoardPlaybook>[] = [
    {
      key: "name",
      label: "Name",
      value: (p) => p.name.toLowerCase(),
      render: (p) => (
        <div>
          <span style={{ fontWeight: 500 }}>{p.name}</span>
          {p.deletedAt && <div className="playbook-meta">{binCountdown(p.deletedAt)}</div>}
        </div>
      ),
    },
    {
      key: "version",
      label: "Version",
      width: 90,
      value: (p) => p.version,
      render: (p) => <span>{p.version}</span>,
    },
    {
      key: "status",
      label: "Status",
      width: 100,
      value: (p) => p.status,
      // In force, or still being written. Nothing else is a playbook state.
      render: (p) => (
        <StatusPill label={p.status} tone={p.status === "Active" ? "good" : "neutral"} />
      ),
    },
    {
      key: "positions",
      label: "Positions",
      width: 100,
      value: (p) => p.positions,
      render: (p) => <span>{p.positions}</span>,
    },
    {
      key: "matters",
      label: "Matters using it",
      width: 140,
      value: (p) => p.matters,
      render: (p) => <span>{p.matters}</span>,
    },
    {
      key: "owner",
      label: "Owner",
      width: 150,
      value: (p) => p.ownerName,
      render: (p) => p.ownerName,
    },
    {
      key: "updated",
      label: "Updated",
      width: 120,
      value: (p) => p.updatedAt,
      render: (p) => <span className="playbook-meta">{relTime(p.updatedAt)}</span>,
    },
  ];

  const views = [
    // A deleted playbook leaves both views: it is in the bin, not merely put
    // aside.
    { key: "All", label: "All", filter: (p: (typeof board.playbooks)[number]) => !p.archivedAt && !p.deletedAt },
    {
      key: "Archived",
      label: "Archived",
      filter: (p: (typeof board.playbooks)[number]) => !!p.archivedAt && !p.deletedAt,
    },
    {
      key: "Deleted",
      label: "Recently Deleted",
      filter: (p: (typeof board.playbooks)[number]) => !!p.deletedAt,
    },
  ];
  const [view, setView] = usePersisted("px.lib.playbooks.view", "All");

  return (
    <AppShell
      section="playbooks"
      breadcrumb={<Crumbs items={[{ label: "Playbooks" }]} />}
      panel={
        <SectionPanel
          title="Playbooks"
          meta={`${board.playbooks.filter((p) => !p.archivedAt && !p.deletedAt).length} live`}
          groups={viewGroups(views, board.playbooks)}
          activeId={view}
          onSelect={setView}
        />
      }
      scroll={false}
    >
      <section className="playbook-library-page" aria-label="Playbooks">
        <LoadError what="playbooks" error={boardError} onRetry={() => void refetch()} />
        {removeError && (
          <div role="alert" className="scripta-feedback is-error playbook-error">
            {removeError}
          </div>
        )}
        <Library
          storageKey="playbooks"
          title="Playbooks"
          description="Your workspace's negotiating positions and approved language."
          primary={{
            label: "New playbook",
            onClick: () => void navigate({ to: "/playbooks/new" }),
          }}
          rows={board.playbooks}
          columns={columns}
          searchText={(p) => [p.name, p.version, p.status, p.ownerName].join(" ")}
          searchPlaceholder="Search playbooks"
          rowLabel={(p) => p.name}
          onOpen={(p) => go(p)}
          board={{
            columns: PLAYBOOK_STAGES,
            column: (p) => (p.status === "Active" ? "Active" : "Draft"),
            card: (p) => (
              <LibraryCard
                compact
                title={p.name}
                onOpen={() => go(p)}
                state={playbookPill(p.status)}
              />
            ),
          }}
          cards={(p) => (
            <LibraryCard
              title={p.name}
              onOpen={() => go(p)}
              subtitle={p.ownerName || undefined}
              state={playbookPill(p.status)}
              facts={[
                `${p.positions} position${p.positions === 1 ? "" : "s"}`,
                p.matters ? `${p.matters} matter${p.matters === 1 ? "" : "s"}` : "",
                p.version,
              ]}
              footer={`Updated ${relTime(p.updatedAt)}`}
            />
          )}
          views={views}
          view={view}
          onViewChange={setView}
          actions={(p) =>
            p.deletedAt
              ? [
                  { label: "Restore", onClick: () => void restore([p]) },
                  {
                    label: "Delete for good",
                    danger: true,
                    onClick: () => void removeForGood([p]),
                  },
                ]
              : [
                  { label: "Open", onClick: () => go(p) },
                  {
                    label: archiveLabel(!!p.archivedAt),
                    onClick: () => void archive([p], !p.archivedAt),
                  },
                  { label: "Delete", danger: true, onClick: () => void remove([p]) },
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
          detail={(p) => (
            <div className="playbook-table-detail">
              <h2>{p.name}</h2>
              <div className="playbook-meta">
                {[p.version, p.status].filter(Boolean).join(" · ")}
              </div>
              <Button variant="primary" onClick={() => go(p)}>
                Open playbook
              </Button>
              <dl>
                {(
                  [
                    ["Positions", String(p.positions)],
                    ["Matters using it", String(p.matters)],
                    ["Owner", p.ownerName],
                    ["Updated", relTime(p.updatedAt)],
                  ] as [string, string][]
                )
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
              </dl>
            </div>
          )}
          empty={
            loading ? (
              <p role="status">Loading playbooks…</p>
            ) : (
              <div className="playbook-empty">
                <h2>Keep your negotiating positions together</h2>
                <p>
                  A playbook records preferred positions, fallback wording and unacceptable terms
                  for contract review and drafting. Create your first playbook to start.
                </p>
                <Button variant="primary" onClick={() => void navigate({ to: "/playbooks/new" })}>
                  New playbook
                </Button>
              </div>
            )
          }
        />
      </section>
      {confirmDialog}
    </AppShell>
  );
}
