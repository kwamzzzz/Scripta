/**
 * Archive, and Recently Deleted, for the whole workspace.
 *
 * One screen, two destinations, because they are the same question asked about
 * two states: where did the thing I put aside go? Every collection already
 * keeps its own archive and its own bin, and that is the right place to put
 * something and the wrong place to find it — finding it means remembering
 * which collection Scripta filed it under, which is exactly what a person who
 * has lost something does not remember.
 *
 * It is the shared Library, so the search, columns, sorting, selection and row
 * menu behave the way they do everywhere else. The one column it adds is what
 * kind of thing each row is, which is the fact this screen exists to supply.
 */
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AppShell, { Crumbs } from "@/components/AppShell";
import Library, { type LibColumn } from "@/components/Library";
import LibraryEmpty from "@/components/LibraryEmpty";
import ActionError, { attempt } from "@/components/ActionError";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import { Button } from "@/components/primitives";
import { setArchived } from "@/lib/archive";
import { binCountdown, deleteForever, restoreFromBin } from "@/lib/trash";
import { byTable, listPutAside, type PutAsideRow, type PutAsideState } from "@/lib/put-aside";
import { relTime } from "@/lib/home-data";
import { useApp } from "@/store/app";
import { C } from "@/lib/tokens";

const COPY = {
  archived: {
    title: "Archive",
    description:
      "Everything put aside across the workspace. Archiving keeps something for good — it is here until you want it back.",
    empty: "Nothing has been archived yet.",
    emptyBody:
      "Archiving takes something out of its collection without losing it. Whatever you archive, anywhere in Scripta, is listed here.",
  },
  deleted: {
    title: "Recently Deleted",
    description:
      "Everything deleted across the workspace. Each is kept for fifteen days from the day it went, then removed for good.",
    empty: "Nothing is waiting to be removed.",
    emptyBody:
      "Deleting something anywhere in Scripta puts it here for fifteen days. Until then it can be put back.",
  },
} as const;

export default function PutAsideScreen({ state }: { state: PutAsideState }) {
  const { workspaceId } = useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const { confirmDelete, confirmDialog } = useConfirmDelete();
  const copy = COPY[state];

  const rows = useQuery({
    queryKey: ["put-aside", workspaceId, state],
    enabled: !!workspaceId,
    retry: false,
    queryFn: () => listPutAside(workspaceId!, state),
  });

  // Restoring a matter changes Contract Review, Flow and the dashboard too, so
  // nothing is narrowed here: everything that counted it is now wrong.
  const refresh = () => queryClient.invalidateQueries();
  const named = (list: PutAsideRow[]) =>
    list.length === 1 ? `“${list[0]!.title}”` : `${list.length} items`;

  /** Back where it was. Out of the bin, or out of the archive. */
  const restore = async (list: PutAsideRow[]) => {
    if (!list.length) return;
    setActionError(null);
    for (const [table, ids] of byTable(list)) {
      const done = await attempt(
        `${named(list)} could not be restored`,
        () => (state === "deleted" ? restoreFromBin(table, ids) : setArchived(table, ids, false)),
        setActionError,
      );
      if (!done) break;
    }
    await refresh();
  };

  /** Only from the bin, and only before the fifteen days are up. */
  const removeForGood = async (list: PutAsideRow[]) => {
    if (!list.length) return;
    if (
      !(await confirmDelete({
        what: named(list),
        count: list.length,
        consequence: "Everything each one holds goes with it.",
        binned: false,
      }))
    )
      return;
    setActionError(null);
    for (const [table, ids] of byTable(list)) {
      const done = await attempt(
        `${named(list)} could not be deleted`,
        () => deleteForever(table, ids),
        setActionError,
      );
      if (!done) break;
    }
    await refresh();
  };

  const columns: LibColumn<PutAsideRow>[] = [
    {
      key: "title",
      label: "Name",
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
      key: "kind",
      label: "Kind",
      width: 180,
      render: (r) => <span style={{ color: C.muted }}>{r.kind}</span>,
      value: (r) => r.kind,
    },
    {
      key: "when",
      label: state === "deleted" ? "Deleted" : "Archived",
      width: 150,
      render: (r) => (
        <span style={{ color: C.muted }}>{relTime(r.deletedAt ?? r.archivedAt ?? "")}</span>
      ),
      value: (r) => r.deletedAt ?? r.archivedAt ?? "",
    },
  ];

  return (
    <AppShell
      section={state === "deleted" ? "deleted" : "archive"}
      scroll={false}
      breadcrumb={<Crumbs items={[{ label: copy.title }]} />}
      hideAssistant
    >
      <ActionError error={actionError} onDismiss={() => setActionError(null)} />
      {rows.isError && (
        <div role="alert" style={{ padding: "8px 20px", color: C.red, fontSize: 12.5 }}>
          This could not be read, so it may be showing less than is really here.{" "}
          {(rows.error as Error).message}{" "}
          <Button onClick={() => void rows.refetch()}>Try again</Button>
        </div>
      )}
      <Library
        storageKey={`put-aside-${state}`}
        title={copy.title}
        description={copy.description}
        rows={rows.data ?? []}
        columns={columns}
        rowLabel={(r) => r.title}
        searchText={(r) => [r.title, r.kind].join(" ")}
        searchPlaceholder={`Search ${copy.title.toLowerCase()}`}
        onOpen={(r) => void navigate({ to: r.to } as never)}
        actions={(r) => [
          { label: "Restore", onClick: () => void restore([r]) },
          { label: "Go to its collection", onClick: () => void navigate({ to: r.to } as never) },
          ...(state === "deleted"
            ? [
                {
                  label: "Delete for good",
                  danger: true,
                  onClick: () => void removeForGood([r]),
                },
              ]
            : []),
        ]}
        bulk={[
          { label: "Restore", onClick: (list) => void restore(list) },
          ...(state === "deleted"
            ? [
                {
                  label: "Delete for good",
                  danger: true,
                  onClick: (list: PutAsideRow[]) => void removeForGood(list),
                },
              ]
            : []),
        ]}
        detail={(r) => (
          <div className="scripta-matter-detail">
            <header>
              <h2>{r.title}</h2>
              <p>
                {r.kind}
                {r.deletedAt ? ` · ${binCountdown(r.deletedAt)}` : ""}
              </p>
            </header>
            <Button variant="primary" onClick={() => void restore([r])}>
              Restore
            </Button>
            <section>
              <h3>Where it stands</h3>
              <dl>
                <dt>Kind</dt>
                <dd>{r.kind}</dd>
                <dt>{state === "deleted" ? "Deleted" : "Archived"}</dt>
                <dd>{relTime(r.deletedAt ?? r.archivedAt ?? "")}</dd>
                {r.archivedAt && r.deletedAt && (
                  <>
                    <dt>Also archived</dt>
                    <dd>{relTime(r.archivedAt)}</dd>
                  </>
                )}
              </dl>
            </section>
          </div>
        )}
        empty={
          rows.isLoading ? (
            <p role="status">Loading…</p>
          ) : (
            <LibraryEmpty title={copy.empty}>{copy.emptyBody}</LibraryEmpty>
          )
        }
      />
      {confirmDialog}
    </AppShell>
  );
}
