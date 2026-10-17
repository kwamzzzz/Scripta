/**
 * Knowledge › Library: the firm's research material in one place.
 *
 * Statutes, regulations, cases, treaties, books, articles, websites, guidance
 * and reports, each with what it is, where it applies, whether it can still be
 * relied on, and a link or a copy to open. Collections run along the top as
 * views; the list groups by type, jurisdiction, topic, collection, status or
 * who added it. It runs on the same Library component as Precedents and
 * Tasks, so search, views, table, cards, grouping and the detail panel behave
 * as they do there.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FileText, Link2, Lock } from "lucide-react";
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
import { fmtBytes } from "@/lib/correspondence";
import {
  SOURCE_KINDS,
  STATUS_NAME,
  WEIGHT_NAME,
  createCollection,
  deleteCollection,
  deleteSource,
  fileSources,
  hostOf,
  kindGroup,
  kindInfo,
  kindName,
  libraryKey,
  loadLibrary,
  renameCollection,
  saveSource,
  setCollectionArchived,
  setSourceArchived,
  sourceSearchText,
  type LibraryCollection,
  type LibrarySource,
} from "@/lib/library";
import SourceDialog from "./SourceDialog";
import CollectionsDialog from "./CollectionsDialog";
import SourcePreview from "./SourcePreview";
import FileViewer from "@/preview/FileViewer";
import "./library.css";

const STATUS_ORDER = ["Current", "Superseded", "Repealed", "Unable to verify"];

export default function LibraryScreen() {
  const { workspaceId } = useApp();
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = libraryKey(workspaceId);
  const library = useQuery({
    queryKey: key,
    enabled: !!workspaceId && !!user,
    retry: false,
    queryFn: () => loadLibrary(workspaceId!, user!.id),
  });
  const [editing, setEditing] = useState<LibrarySource | "new" | null>(null);
  const [managing, setManaging] = useState(false);
  // A source's file, open in Scripta's own viewer rather than a new tab.
  const [viewing, setViewing] = useState<LibrarySource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { confirmDelete, confirmDialog } = useConfirmDelete();

  const sources = useMemo(() => library.data?.sources ?? [], [library.data]);
  const collections = useMemo(() => library.data?.collections ?? [], [library.data]);
  const liveCollections = collections.filter((c) => !c.archivedAt);
  const collectionName = (id: string) => collections.find((c) => c.id === id)?.name ?? "";
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const act = async (failure: string, work: () => Promise<unknown>) => {
    const ok = await attempt(failure, work, setError);
    if (ok) await refresh();
    return ok;
  };

  // What the writer has used before, offered back to them.
  const jurisdictions = useMemo(
    () => [...new Set(sources.map((s) => s.jurisdiction.trim()).filter(Boolean))].sort(),
    [sources],
  );
  const topics = useMemo(() => {
    const count = new Map<string, number>();
    for (const s of sources) for (const t of s.topics) count.set(t, (count.get(t) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [sources]);

  const openSource = async (s: LibrarySource) => {
    if (s.file) {
      setViewing(s);
      return;
    }
    if (s.url) {
      window.open(s.url, "_blank", "noopener");
      return;
    }
    setEditing(s);
  };

  const remove = async (rows: LibrarySource[]) => {
    const yes = await confirmDelete({
      what: rows.length === 1 ? `“${rows[0]!.title}”` : `${rows.length} sources`,
      count: rows.length,
      binned: false,
      consequence: rows.some((r) => r.file) ? "Attached files are deleted with them." : "",
    });
    if (!yes) return;
    await act("The source could not be deleted", async () => {
      for (const r of rows) await deleteSource(r);
    });
  };

  const live = (s: LibrarySource) => !s.archivedAt;
  const views: LibView<LibrarySource>[] = [

    { key: "All", label: "All", filter: live },
    { key: "Mine", label: "Added by me", filter: (s) => live(s) && s.mine },
    ...liveCollections.map((c) => ({
      key: `col:${c.id}`,
      label: c.name,
      filter: (s: LibrarySource) => live(s) && s.collectionIds.includes(c.id),
    })),
    { key: "Archived", label: "Archived", filter: (s) => !!s.archivedAt },
  ];
  const [view, setView] = usePersisted("px.lib.library.view", "All");

  const groups: LibGroup<LibrarySource>[] = [
    {
      key: "kind",
      label: "Type",
      value: kindGroup,
      none: "Other",
      order: SOURCE_KINDS.map((k) => k.plural),
    },
    {
      key: "jurisdiction",
      label: "Jurisdiction",
      value: (s) => s.jurisdiction,
      none: "No jurisdiction",
    },
    { key: "topic", label: "Topic", value: (s) => s.topics, none: "No topic" },
    {
      key: "collection",
      label: "Collection",
      value: (s) => s.collectionIds.map(collectionName).filter(Boolean),
      none: "In no collection",
    },
    {
      key: "status",
      label: "Status",
      value: (s) => (s.status ? STATUS_NAME[s.status] : ""),
      none: "Status not stated",
      order: STATUS_ORDER,
    },
    { key: "author", label: "Added by", value: (s) => s.authorName, none: "Someone" },
  ];

  const columns: LibColumn<LibrarySource>[] = [
    {
      key: "title",
      label: "Source",
      width: 300,
      value: (s) => s.title.toLowerCase(),
      render: (s) => (
        <span className="lib-cell-title">
          <strong>
            {s.private && <Lock size={11} aria-label="Private to you" />} {s.title}
          </strong>
          {(s.citation || s.authors) && (
            <em>{[s.citation, s.authors].filter(Boolean).join(" · ")}</em>
          )}
        </span>
      ),
    },
    {
      key: "kind",
      label: "Type",
      width: 110,
      value: (s) => kindName(s),
      render: (s) => kindName(s),
    },
    {
      key: "jurisdiction",
      label: "Jurisdiction",
      width: 120,
      value: (s) => s.jurisdiction.toLowerCase(),
      render: (s) => s.jurisdiction || <span className="lib-muted">—</span>,
    },
    {
      key: "topics",
      label: "Topics",
      width: 180,
      render: (s) => <Topics topics={s.topics} />,
    },
    {
      key: "status",
      label: "Status",
      width: 140,
      value: (s) => (s.status ? STATUS_ORDER.indexOf(STATUS_NAME[s.status]) : 9),
      render: (s) => <Standing source={s} />,
    },
    {
      key: "open",
      label: "Open",
      width: 140,
      render: (s) => <Reach source={s} onOpen={() => void openSource(s)} />,
    },
    {
      key: "author",
      label: "Added by",
      width: 140,
      value: (s) => s.authorName,
      render: (s) => s.authorName,
      defaultOff: true,
    },
    {
      key: "updated",
      label: "Updated",
      width: 120,
      value: (s) => s.updatedAt,
      render: (s) => <span className="lib-muted">{relTime(s.updatedAt)}</span>,
      defaultOff: true,
    },
  ];

  return (
    <AppShell
      section="library"
      panel={
        <SectionPanel
          title="Library"
          meta={`${sources.length} sources`}
          groups={viewGroups(views, sources)}
          activeId={view}
          onSelect={setView}
        />
      }
      breadcrumb={<Crumbs items={[{ label: "Library" }]} />}
      scroll={false}
      assistant={{
        key: "library",
        screen: "Library",
        intro:
          "Ask what the firm has on a point, or which sources in the Library bear on a question.",
      }}
    >
      <ActionError error={error} onDismiss={() => setError(null)} />
      {library.isError && (
        <p role="alert" className="lib-error">
          {(library.error as Error).message}
        </p>
      )}
      <Library
        storageKey="library"
        view={view}
        onViewChange={setView}
        defaultMode="table"
        className="lib-screen"
        title="Library"
        description="The firm's research material: statutes, regulations, cases, treaties, books, articles, websites and guidance, kept where everyone can find and rely on them."
        primary={{ label: "Add source", onClick: () => setEditing("new") }}
        secondary={{ label: "Collections", onClick: () => setManaging(true) }}
        rows={sources}
        columns={columns}
        views={views}
        groups={groups}
        searchText={(s) => sourceSearchText(s, collections)}
        searchPlaceholder="Search the Library"
        rowLabel={(s) => s.title}
        onOpen={(s) => void openSource(s)}
        actions={(s) => [
          ...(s.url || s.file ? [{ label: "Open", onClick: () => void openSource(s) }] : []),
          { label: "Edit", onClick: () => setEditing(s) },
          s.archivedAt
            ? {
                label: "Restore",
                onClick: () =>
                  void act("The source could not be restored", () =>
                    setSourceArchived(s.id, false),
                  ),
              }
            : {
                label: "Archive",
                onClick: () =>
                  void act("The source could not be archived", () => setSourceArchived(s.id, true)),
              },
          { label: "Delete", danger: true, onClick: () => void remove([s]) },
        ]}
        bulk={(view) => [
          ...liveCollections
            .filter((c) => view !== `col:${c.id}`)
            .map((c) => ({
              label: `Add to ${c.name}`,
              onClick: (rows: LibrarySource[]) =>
                void act("The sources could not be filed", () =>
                  fileSources(workspaceId!, c.id, rows, true),
                ),
            })),
          ...(view.startsWith("col:")
            ? [
                {
                  label: `Remove from ${collectionName(view.slice(4))}`,
                  onClick: (rows: LibrarySource[]) =>
                    void act("The sources could not be taken off the collection", () =>
                      fileSources(workspaceId!, view.slice(4), rows, false),
                    ),
                },
              ]
            : []),
          view === "Archived"
            ? {
                label: "Restore",
                onClick: (rows: LibrarySource[]) =>
                  void act("The sources could not be restored", async () => {
                    for (const r of rows) await setSourceArchived(r.id, false);
                  }),
              }
            : {
                label: "Archive",
                onClick: (rows: LibrarySource[]) =>
                  void act("The sources could not be archived", async () => {
                    for (const r of rows) await setSourceArchived(r.id, true);
                  }),
              },
          { label: "Delete", danger: true, onClick: (rows: LibrarySource[]) => void remove(rows) },
        ]}
        cards={(s) => (
          <SourceCard source={s} collections={collections} onOpen={() => void openSource(s)} />
        )}
        detail={(s) => (
          <SourceDetail
            source={s}
            collections={collections}
            onOpen={() => void openSource(s)}
            onEdit={() => setEditing(s)}
            onToggleCollection={(c, on) =>
              void act("The collection could not be changed", () =>
                fileSources(workspaceId!, c.id, [s], on),
              )
            }
          />
        )}
        empty={
          library.isLoading ? (
            <p role="status">Loading the Library…</p>
          ) : (
            <div className="lib-empty">
              <h2>Start the firm's Library</h2>
              <p>
                Add the statutes, cases, books, articles and links you keep going back to. Give each
                a type, a jurisdiction and a few topics, and put related material into collections
                such as "Ghana tax" or "OHADA".
              </p>
              <Button variant="primary" onClick={() => setEditing("new")}>
                Add the first source
              </Button>
            </div>
          )
        }
      />
      {editing && (
        <SourceDialog
          source={editing === "new" ? null : editing}
          collections={collections}
          jurisdictions={jurisdictions}
          topics={topics}
          defaultCollectionIds={[]}
          onClose={() => setEditing(null)}
          onSave={async (draft, file, removeFile) => {
            await saveSource({
              workspaceId: workspaceId!,
              userId: user!.id,
              existing: editing === "new" ? null : editing,
              draft,
              file,
              removeFile,
            });
            await refresh();
          }}
        />
      )}
      {viewing?.file && (
        <FileViewer
          open
          fileRef={viewing.file.path}
          name={viewing.file.name}
          meta={[kindName(viewing), viewing.citation, viewing.jurisdiction]
            .filter(Boolean)
            .join(" · ")}
          downloadName={viewing.file.name}
          onClose={() => setViewing(null)}
        />
      )}
      {managing && (
        <CollectionsDialog
          collections={collections}
          sources={sources}
          onClose={() => setManaging(false)}
          onCreate={async (name) => {
            await createCollection(workspaceId!, name, collections.length);
            await refresh();
          }}
          onRename={async (c, name) => {
            await renameCollection(c.id, name);
            await refresh();
          }}
          onArchive={async (c, archived) => {
            await setCollectionArchived(c.id, archived);
            await refresh();
          }}
          onDelete={async (c) => {
            await deleteCollection(c.id);
            await refresh();
          }}
        />
      )}
      {confirmDialog}
    </AppShell>
  );
}

/* ------------------------------------------------------------------ parts */

function Topics({ topics, limit = 3 }: { topics: string[]; limit?: number }) {
  if (!topics.length) return <span className="lib-muted">—</span>;
  return (
    <span className="lib-topics">
      {topics.slice(0, limit).map((t) => (
        <span key={t}>{t}</span>
      ))}
      {topics.length > limit && <em>+{topics.length - limit}</em>}
    </span>
  );
}

/** Whether it can be relied on: status and weight, for the kinds they apply to. */
function Standing({ source: s }: { source: LibrarySource }) {
  if (!kindInfo(s.kind).legal || (!s.status && !s.weight))
    return <span className="lib-muted">—</span>;
  return (
    <span className="lib-standing">
      {s.status && <span className={`lib-status is-${s.status}`}>{STATUS_NAME[s.status]}</span>}
      {s.weight && <span className="lib-weight">{WEIGHT_NAME[s.weight]}</span>}
    </span>
  );
}

/** Where the source can be read: its link, its file, or neither. */
function Reach({ source: s, onOpen }: { source: LibrarySource; onOpen: () => void }) {
  if (!s.url && !s.file) return <span className="lib-muted">No link or file</span>;
  return (
    <button
      type="button"
      className="lib-reach"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      title={s.url || s.file?.name}
    >
      {s.url ? <Link2 size={13} aria-hidden /> : <FileText size={13} aria-hidden />}
      <span>{s.url ? hostOf(s.url) : s.file!.name}</span>
    </button>
  );
}

function SourceCard({
  source: s,
  collections,
  onOpen,
}: {
  source: LibrarySource;
  collections: LibraryCollection[];
  onOpen: () => void;
}) {
  const shelves = collections.filter((c) => s.collectionIds.includes(c.id));
  return (
    <article className={`lib-card is-${s.kind}`}>
      <SourcePreview source={s} onPreview={onOpen} />
      <header>
        <span className="lib-kind">{kindName(s)}</span>
        {s.jurisdiction && <span className="lib-muted">{s.jurisdiction}</span>}
        {s.private && <Lock size={12} aria-label="Private to you" />}
      </header>
      <h3>{s.title}</h3>
      {(s.citation || s.authors || s.issued) && (
        <p className="lib-muted">{[s.citation, s.authors, s.issued].filter(Boolean).join(" · ")}</p>
      )}
      {kindInfo(s.kind).legal && (s.status || s.weight) && <Standing source={s} />}
      {s.topics.length > 0 && <Topics topics={s.topics} limit={4} />}
      <footer>
        <Reach source={s} onOpen={onOpen} />
        {shelves.length > 0 && (
          <span className="lib-muted">{shelves.map((c) => c.name).join(", ")}</span>
        )}
      </footer>
    </article>
  );
}

function SourceDetail({
  source: s,
  collections,
  onOpen,
  onEdit,
  onToggleCollection,
}: {
  source: LibrarySource;
  collections: LibraryCollection[];
  onOpen: () => void;
  onEdit: () => void;
  onToggleCollection: (c: LibraryCollection, on: boolean) => void;
}) {
  const info = kindInfo(s.kind);
  const facts: [string, string][] = [
    ["Type", kindName(s)],
    [info.citation.split(", e.g. ")[0]!, s.citation],
    ["Jurisdiction", s.jurisdiction],
    [info.authors, s.authors],
    [info.publisher, s.publisher],
    [info.issued, s.issued],
    ["Status", s.status ? STATUS_NAME[s.status] : ""],
    ["Weight", s.weight ? WEIGHT_NAME[s.weight] : ""],
  ];
  const shown = collections.filter((c) => !c.archivedAt || s.collectionIds.includes(c.id));
  return (
    <div className="scripta-matter-detail lib-detail">
      <header>
        <h2>{s.title}</h2>
        <p>
          {[kindName(s), s.jurisdiction, s.issued].filter(Boolean).join(" · ")}
          {s.private ? " · Private to you" : ""}
          {s.archivedAt ? " · Archived" : ""}
        </p>
      </header>
      <div className="lib-detail-actions">
        {s.file && (
          <Button variant="primary" onClick={onOpen}>
            <FileText size={14} aria-hidden /> Preview {s.file.name}
            <span className="lib-muted"> {fmtBytes(s.file.bytes)}</span>
          </Button>
        )}
        {s.url && (
          <Button
            {...(s.file ? {} : { variant: "primary" as const })}
            onClick={() => window.open(s.url, "_blank", "noopener")}
          >
            <ExternalLink size={14} aria-hidden /> Visit {hostOf(s.url)}
          </Button>
        )}
        <Button onClick={onEdit}>Edit</Button>
      </div>
      <section>
        <dl>
          {facts
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} style={{ display: "contents" }}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
        </dl>
      </section>
      {s.topics.length > 0 && (
        <section>
          <h3>Topics</h3>
          <Topics topics={s.topics} limit={99} />
        </section>
      )}
      {shown.length > 0 && (
        <section>
          <h3>Collections</h3>
          <div className="lib-chips">
            {shown.map((c) => {
              const on = s.collectionIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={on}
                  className={on ? "is-on" : undefined}
                  onClick={() => onToggleCollection(c, !on)}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </section>
      )}
      {s.notes && (
        <section>
          <h3>Notes</h3>
          <p className="lib-notes">{s.notes}</p>
        </section>
      )}
      <p className="lib-muted lib-provenance">
        Added by {s.mine ? "you" : s.authorName} {relTime(s.createdAt)}
        {s.updatedAt !== s.createdAt ? ` · updated ${relTime(s.updatedAt)}` : ""}
      </p>
    </div>
  );
}
