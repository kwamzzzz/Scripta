/**
 * Manuscripts: every thesis, dissertation, book and report under Book Review.
 *
 * The same Library as Clients, Matters and the firm's Library, so search,
 * views, table, cards and grouping behave as they do everywhere else.
 */
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import AppShell, { Crumbs } from "@/components/AppShell";
import { SectionPanel } from "@/components/SectionPanel";
import { viewGroups } from "@/components/section-views";
import { usePersisted } from "@/lib/use-board";
import Library, { type LibColumn, type LibGroup, type LibView } from "@/components/Library";
import { Button } from "@/components/primitives";
import ActionError, { attempt } from "@/components/ActionError";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import { useApp } from "@/store/app";
import { useAuth } from "@/lib/auth";
import { relTime } from "@/lib/home-data";
import { useClients } from "@/components/client-choice";
import {
  deleteManuscript,
  listManuscripts,
  manuscriptsKey,
  setManuscriptArchived,
  type ManuscriptListItem,
} from "./db";
import { MANUSCRIPT_KINDS } from "./model";
import NewManuscriptDialog from "./NewManuscriptDialog";
import "./manuscripts.css";

const kindLabel = (k: string) => MANUSCRIPT_KINDS.find((x) => x.key === k)?.label ?? "Manuscript";
const words = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k words` : `${n} words`);

export default function ManuscriptsScreen() {
  const { workspaceId, matters } = useApp();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const clients = useClients();
  const key = manuscriptsKey(workspaceId);
  const list = useQuery({
    queryKey: key,
    enabled: !!workspaceId && !!user,
    retry: false,
    queryFn: () => listManuscripts(workspaceId!, user!.id),
  });
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirmDelete, confirmDialog } = useConfirmDelete();
  const rows = list.data ?? [];
  const clientName = (id: string | null) =>
    (id && clients.data?.find((c) => c.id === id)?.name) || "";
  const matterName = (id: string | null) => (id && matters.find((m) => m.id === id)?.name) || "";
  const act = async (failure: string, work: () => Promise<unknown>) => {
    const ok = await attempt(failure, work, setError);
    if (ok) await qc.invalidateQueries({ queryKey: key });
  };
  const open = (m: ManuscriptListItem) =>
    void navigate({ to: "/manuscripts/$manuscriptId", params: { manuscriptId: m.id } });
  const remove = async (items: ManuscriptListItem[]) => {
    const yes = await confirmDelete({
      what: items.length === 1 ? `“${items[0]!.title}”` : `${items.length} manuscripts`,
      count: items.length,
      binned: false,
      consequence: "Every version, chapter reading and finding goes with it.",
    });
    if (!yes) return;
    await act("The manuscript could not be deleted", async () => {
      for (const m of items) await deleteManuscript(m);
    });
  };

  const live = (m: ManuscriptListItem) => !m.archivedAt;
  const views: LibView<ManuscriptListItem>[] = [
    { key: "All", label: "All", filter: live },
    { key: "Mine", label: "Mine", filter: (m) => live(m) && m.mine },
    { key: "Open", label: "With open findings", filter: (m) => live(m) && m.openFindings > 0 },
    { key: "Archived", label: "Archived", filter: (m) => !!m.archivedAt },
  ];
  const [view, setView] = usePersisted("px.lib.manuscripts.view", "All");

  const groups: LibGroup<ManuscriptListItem>[] = [
    { key: "kind", label: "Kind", value: (m) => kindLabel(m.kind), none: "Other" },
    { key: "client", label: "Client", value: (m) => clientName(m.clientId), none: "No client" },
    { key: "author", label: "Added by", value: (m) => m.authorName, none: "Someone" },
  ];

  const progress = (m: ManuscriptListItem) =>
    m.chapters ? `${m.chaptersReviewed} of ${m.chapters} chapters reviewed` : "No chapters found";

  const columns: LibColumn<ManuscriptListItem>[] = [
    {
      key: "title",
      label: "Manuscript",
      width: 320,
      value: (m) => m.title.toLowerCase(),
      render: (m) => (
        <span className="ms-cell-title">
          <strong>
            {m.private && <Lock size={11} aria-label="Private to you" />} {m.title}
          </strong>
          <em>{[kindLabel(m.kind), m.author].filter(Boolean).join(" · ")}</em>
        </span>
      ),
    },
    {
      key: "size",
      label: "Length",
      width: 110,
      value: (m) => m.wordCount,
      render: (m) => <span className="ms-muted">{words(m.wordCount)}</span>,
    },
    {
      key: "progress",
      label: "Review",
      width: 190,
      value: (m) => (m.chapters ? m.chaptersReviewed / m.chapters : 0),
      render: (m) => <span className="ms-muted">{progress(m)}</span>,
    },
    {
      key: "open",
      label: "Open findings",
      width: 140,
      value: (m) => m.openFindings,
      render: (m) =>
        m.openFindings ? (
          <span>
            {m.openFindings}
            {m.materialOpen > 0 && <span className="ms-muted"> · {m.materialOpen} material</span>}
          </span>
        ) : (
          <span className="ms-muted">None</span>
        ),
    },
    {
      key: "filed",
      label: "Filed to",
      width: 180,
      value: (m) => clientName(m.clientId) || matterName(m.matterId),
      render: (m) =>
        clientName(m.clientId) || matterName(m.matterId) || <span className="ms-muted">—</span>,
    },
    {
      key: "updated",
      label: "Updated",
      width: 110,
      value: (m) => m.updatedAt,
      render: (m) => <span className="ms-muted">{relTime(m.updatedAt)}</span>,
    },
  ];

  return (
    <AppShell
      section="manuscripts"
      panel={
        <SectionPanel
          title="Manuscripts"
          meta={`${rows.filter(live).length} under review`}
          groups={viewGroups(views, rows)}
          activeId={view}
          onSelect={setView}
        />
      }
      breadcrumb={<Crumbs items={[{ label: "Manuscripts" }]} />}
      scroll={false}
      assistant={{
        key: "manuscripts",
        screen: "Manuscripts",
        intro: "Ask about a manuscript under review, or open one to work inside it.",
      }}
    >
      <ActionError error={error} onDismiss={() => setError(null)} />
      {list.isError && (
        <p role="alert" className="ms-error">
          {(list.error as Error).message}
        </p>
      )}
      <Library
        storageKey="manuscripts"
        view={view}
        onViewChange={setView}
        defaultMode="table"
        title="Manuscripts"
        description="Theses, dissertations, books and reports under Book Review: read chapter by chapter, checked as a whole."
        primary={{ label: "New manuscript", onClick: () => setAdding(true) }}
        rows={rows}
        columns={columns}
        views={views}
        groups={groups}
        searchText={(m) =>
          [
            m.title,
            m.author,
            kindLabel(m.kind),
            clientName(m.clientId),
            matterName(m.matterId),
          ].join(" ")
        }
        searchPlaceholder="Search manuscripts"
        rowLabel={(m) => m.title}
        onOpen={open}
        actions={(m) => [
          { label: "Open", onClick: () => open(m) },
          m.archivedAt
            ? {
                label: "Restore",
                onClick: () =>
                  void act("The manuscript could not be restored", () =>
                    setManuscriptArchived(m.id, false),
                  ),
              }
            : {
                label: "Archive",
                onClick: () =>
                  void act("The manuscript could not be archived", () =>
                    setManuscriptArchived(m.id, true),
                  ),
              },
          ...(m.mine ? [{ label: "Delete", danger: true, onClick: () => void remove([m]) }] : []),
        ]}
        cards={(m) => (
          <button type="button" className="ms-card" onClick={() => open(m)}>
            <span className="ms-card-kind">{kindLabel(m.kind)}</span>
            <strong>{m.title}</strong>
            {m.author && <span className="ms-muted">{m.author}</span>}
            <span className="ms-muted">
              {words(m.wordCount)} · {progress(m)}
            </span>
            <span>{m.openFindings ? `${m.openFindings} open findings` : "No open findings"}</span>
          </button>
        )}
        detail={(m) => (
          <div className="ms-detail">
            <h3>{m.title}</h3>
            <p className="ms-muted">
              {[kindLabel(m.kind), m.author, words(m.wordCount)].filter(Boolean).join(" · ")}
            </p>
            <p>{progress(m)}</p>
            <p>
              {m.openFindings
                ? `${m.openFindings} open findings, ${m.materialOpen} of them material or critical.`
                : "No open findings."}
            </p>
            {(clientName(m.clientId) || matterName(m.matterId)) && (
              <p className="ms-muted">
                Filed to{" "}
                {[clientName(m.clientId), matterName(m.matterId)].filter(Boolean).join(" · ")}
              </p>
            )}
            <Button variant="secondary" onClick={() => open(m)}>
              Open manuscript
            </Button>
          </div>
        )}
        empty={
          list.isLoading ? (
            <p role="status">Loading manuscripts…</p>
          ) : (
            <div className="ms-empty">
              <h2>No manuscripts yet</h2>
              <p>
                Add a thesis, dissertation, book or long report as a Word document or PDF. Scripta
                reads it into chapters and reviews each one against the whole.
              </p>
              <Button variant="primary" onClick={() => setAdding(true)}>
                Add the first manuscript
              </Button>
            </div>
          )
        }
      />
      {adding && <NewManuscriptDialog open onClose={() => setAdding(false)} />}
      {confirmDialog}
    </AppShell>
  );
}
