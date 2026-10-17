import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import AppShell, { Crumbs } from "@/components/AppShell";
import { SectionPanel } from "@/components/SectionPanel";
import { viewGroups } from "@/components/section-views";
import { usePersisted } from "@/lib/use-board";
import Library, { type LibColumn, type LibView } from "@/components/Library";
import LibraryCard from "@/components/LibraryCard";
import StatusPill, { type StatusTone } from "@/components/StatusPill";
import { Button } from "@/components/primitives";
import {
  createTemplate,
  listTemplates,
  TEMPLATE_DOC_TYPES,
  type Template,
  type TemplateStatus,
} from "@/lib/templates";
import { relTime } from "@/lib/home-data";
import "./templates-screen.css";
import { useApp } from "@/store/app";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import { archiveLabel, archiveVerb, setArchived } from "@/lib/archive";
import { binCountdown, deleteForever, moveToBin, restoreFromBin } from "@/lib/trash";

/**
 * Templates — the structures a document can be started from.
 *
 * A template is not a precedent and not a playbook. A precedent records what
 * was agreed once; a playbook holds the position to take. A template holds the
 * shape of a document: which sections it has, in what order, and which facts
 * it will ask for.
 *
 * Built on the same Library as Matters, so the table runs the full width of
 * the workspace and carries the same search, views, column control, row
 * actions and bulk selection. A second table that behaved differently would
 * be one more thing to learn for no reason.
 */
/** A template is in use, being written, or kept but no longer offered. */
const TEMPLATE_STAGES = ["Active", "Draft", "Retired"];

/** The same three states as a meaning, so they read as they do elsewhere. */
const STATUS_TONE: Record<TemplateStatus, StatusTone> = {
  Active: "good",
  Draft: "neutral",
  Retired: "retired",
};

export default function TemplatesScreen() {
  const { workspaceId } = useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [docType, setDocType] = useState<string>(TEMPLATE_DOC_TYPES[0]);

  const templates = useQuery({
    queryKey: ["templates", workspaceId],
    enabled: !!workspaceId,
    queryFn: () => listTemplates(workspaceId!),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["templates", workspaceId] });

  const create = useMutation({
    mutationFn: () => createTemplate(workspaceId!, { name, docType }),
    onSuccess: async (id) => {
      await refresh();
      setCreating(false);
      setName("");
      void navigate({
        to: "/templates/$templateId",
        params: { templateId: id },
      });
    },
  });

  /** Deleting takes the sections with it — the cascade is in the schema, so a
   *  template can never leave orphaned drafting behind. It waits fifteen days in
   *  Recently Deleted before that cascade runs. */
  const remove = useMutation({
    mutationFn: (rows: Template[]) =>
      moveToBin(
        "templates",
        rows.map((row) => row.id),
      ),
    onSuccess: () => void refresh(),
  });

  /** Out of Recently Deleted, back to wherever it was — archived ones included. */
  const restore = useMutation({
    mutationFn: (rows: Template[]) =>
      restoreFromBin(
        "templates",
        rows.map((row) => row.id),
      ),
    onSuccess: () => void refresh(),
  });

  /** Before the fifteen days are up. Now the cascade really does run. */
  const removeForGood = useMutation({
    mutationFn: (rows: Template[]) =>
      deleteForever(
        "templates",
        rows.map((row) => row.id),
      ),
    onSuccess: () => void refresh(),
  });

  const { confirmDelete, confirmDialog } = useConfirmDelete();
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const confirmRemove = async (rows: Template[]) => {
    if (!rows.length) return;
    const what = rows.length === 1 ? `"${rows[0]!.name}"` : `${rows.length} templates`;
    if (
      await confirmDelete({
        what,
        count: rows.length,
        consequence:
          rows.length === 1 ? "Every section in it goes too." : "Every section in them goes too.",
      })
    )
      remove.mutate(rows);
  };

  const confirmRemoveForGood = async (rows: Template[]) => {
    if (!rows.length) return;
    const what = rows.length === 1 ? `"${rows[0]!.name}"` : `${rows.length} templates`;
    if (
      await confirmDelete({
        what,
        count: rows.length,
        consequence:
          rows.length === 1 ? "Every section in it goes too." : "Every section in them goes too.",
        binned: false,
      })
    )
      removeForGood.mutate(rows);
  };

  /** Out of the active workspace, and back again. Reversible, so it does not ask. */
  const archive = async (rows: Template[], archived: boolean) => {
    if (!rows.length) return;
    setArchiveError(null);
    try {
      await setArchived(
        "templates",
        rows.map((r) => r.id),
        archived,
      );
      await queryClient.invalidateQueries({ queryKey: ["templates", workspaceId] });
    } catch (error) {
      setArchiveError(
        `That template could not be ${archiveVerb(archived)}. ${error instanceof Error ? error.message : ""}`.trim(),
      );
    }
  };

  const columns: LibColumn<Template>[] = [
    {
      key: "name",
      label: "Template",
      render: (t) => (
        <div>
          <span style={{ fontWeight: 600 }}>{t.name}</span>
          {t.deletedAt && <div className="templates-muted">{binCountdown(t.deletedAt)}</div>}
        </div>
      ),
      value: (t) => t.name,
    },
    {
      key: "docType",
      label: "Document",
      width: 170,
      render: (t) => t.docType,
      value: (t) => t.docType,
    },
    {
      key: "jurisdiction",
      label: "Jurisdiction",
      width: 150,
      render: (t) => t.jurisdiction || <span className="templates-muted">—</span>,
      value: (t) => t.jurisdiction,
    },
    {
      key: "status",
      label: "Status",
      width: 110,
      render: (t) => <StatusPill label={t.status} tone={STATUS_TONE[t.status]} />,
      value: (t) => t.status,
    },
    {
      key: "updated",
      label: "Updated",
      width: 120,
      value: (t) => t.updatedAt,
      render: (t) => <span className="templates-muted">{relTime(t.updatedAt)}</span>,
    },
    {
      key: "description",
      label: "What it is for",
      render: (t) => (
        <span className="templates-muted">
          {t.description || <span className="templates-muted">—</span>}
        </span>
      ),
      value: (t) => t.description,
      defaultOff: true,
    },
  ];

  // Archived is a lifecycle state, not a status: an archived template is out of
  // the way whatever its status says, so it shows only under Archived.
  // A deleted template leaves every view, Archived included: it is in the bin,
  // not merely put aside.
  const live = (t: Template) => !t.archivedAt && !t.deletedAt;
  const openTemplate = (templateId: string) =>
    void navigate({ to: "/templates/$templateId", params: { templateId } });

  const views: LibView<Template>[] = [
    { key: "All", label: "All", filter: live },
    { key: "Active", label: "Active", filter: (t) => live(t) && t.status === "Active" },
    { key: "Draft", label: "Draft", filter: (t) => live(t) && t.status === "Draft" },
    { key: "Retired", label: "Retired", filter: (t) => live(t) && t.status === "Retired" },
    { key: "Archived", label: "Archived", filter: (t) => !!t.archivedAt && !t.deletedAt },
    { key: "Deleted", label: "Recently Deleted", filter: (t) => !!t.deletedAt },
  ];
  const [view, setView] = usePersisted("px.lib.templates.view", "All");

  return (
    <AppShell
      section="templates"
      panel={
        <SectionPanel
          title="Templates"
          meta={`${(templates.data ?? []).filter((t) => !t.archivedAt && !t.deletedAt).length} live`}
          groups={viewGroups(views, templates.data ?? [])}
          activeId={view}
          onSelect={setView}
        />
      }
      breadcrumb={<Crumbs items={[{ label: "Templates" }]} />}
      scroll={false}
    >
      <div className="templates-library-page">
        {creating && (
          <form
            className="template-create"
            aria-labelledby="new-template-title"
            aria-busy={create.isPending}
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) create.mutate();
            }}
          >
            <h2 id="new-template-title">New template</h2>
            <fieldset disabled={create.isPending}>
              <div className="template-create-fields">
                <label className="scripta-form-field">
                  Template name
                  <input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Board resolution — director appointment"
                  />
                </label>
                <label className="scripta-form-field">
                  Document type
                  <select value={docType} onChange={(e) => setDocType(e.target.value)}>
                    {TEMPLATE_DOC_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="scripta-page-actions">
                <Button type="submit" variant="primary" disabled={!name.trim() || create.isPending}>
                  {create.isPending ? "Creating…" : "Create"}
                </Button>
                <Button
                  variant="quiet"
                  onClick={() => {
                    setCreating(false);
                    setName("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </fieldset>
            {create.isError && (
              <p role="alert" className="templates-notice is-error">
                That did not save. {(create.error as Error).message}
              </p>
            )}
          </form>
        )}
        {archiveError && (
          <div role="alert" className="scripta-feedback is-error">
            {archiveError}
          </div>
        )}
        {(remove.isError || removeForGood.isError) && (
          <p role="alert" className="templates-notice templates-library-notice is-error">
            Templates could not be deleted.{" "}
            {((remove.error ?? removeForGood.error) as Error).message}
          </p>
        )}
        {restore.isError && (
          <p role="alert" className="templates-notice templates-library-notice is-error">
            Templates could not be restored. {(restore.error as Error).message}
          </p>
        )}
        {templates.isError && !!templates.data?.length && (
          <p role="alert" className="templates-notice templates-library-notice is-error">
            Templates could not be refreshed. {(templates.error as Error).message}
          </p>
        )}
        <Library
          storageKey="templates"
          view={view}
          onViewChange={setView}
          title="Templates"
          description="Reusable document structures and drafting guidance."
          rows={templates.data ?? []}
          columns={columns}
          views={views}
          searchText={(t) => [t.name, t.docType, t.jurisdiction, t.description].join(" ")}
          searchPlaceholder="Search templates"
          onOpen={(t) => openTemplate(t.id)}
          board={{
            columns: TEMPLATE_STAGES,
            column: (t) => t.status,
            card: (t) => (
              <LibraryCard
                compact
                title={t.name}
                onOpen={() => openTemplate(t.id)}
                state={<StatusPill label={t.status} tone={STATUS_TONE[t.status]} />}
              />
            ),
          }}
          cards={(t) => (
            <LibraryCard
              title={t.name}
              onOpen={() => openTemplate(t.id)}
              subtitle={[t.docType, t.jurisdiction].filter(Boolean).join(" · ") || undefined}
              state={<StatusPill label={t.status} tone={STATUS_TONE[t.status]} />}
              footer={`Updated ${relTime(t.updatedAt)}`}
            />
          )}
          primary={{ label: "New template", onClick: () => setCreating(true) }}
          actions={(t) =>
            t.deletedAt
              ? [
                  { label: "Restore", onClick: () => void restore.mutate([t]) },
                  {
                    label: "Delete for good",
                    danger: true,
                    onClick: () => void confirmRemoveForGood([t]),
                  },
                ]
              : [
                  {
                    label: "Open",
                    onClick: () =>
                      void navigate({
                        to: "/templates/$templateId",
                        params: { templateId: t.id },
                      }),
                  },
                  {
                    label: archiveLabel(!!t.archivedAt),
                    onClick: () => void archive([t], !t.archivedAt),
                  },
                  {
                    label: "Delete",
                    danger: true,
                    onClick: () => void confirmRemove([t]),
                  },
                ]
          }
          bulk={(view) =>
            view === "Deleted"
              ? [
                  { label: "Restore", onClick: (rows) => void restore.mutate(rows) },
                  {
                    label: "Delete for good",
                    danger: true,
                    onClick: (rows) => void removeForGood.mutate(rows),
                  },
                ]
              : [
                  { label: "Archive", onClick: (rows) => void archive(rows, true) },
                  { label: "Restore", onClick: (rows) => void archive(rows, false) },
                  {
                    label: "Delete",
                    danger: true,
                    onClick: (rows) => void confirmRemove(rows),
                  },
                ]
          }
          detail={(t) => <TemplateSummary t={t} />}
          empty={
            templates.isError ? (
              <div role="alert" className="templates-notice is-error">
                <p>Templates could not be loaded. {(templates.error as Error).message}</p>
                <Button onClick={() => void templates.refetch()}>Try again</Button>
              </div>
            ) : !workspaceId ? (
              <p>Select a workspace to view its templates.</p>
            ) : templates.isLoading ? (
              <p role="status">Loading templates…</p>
            ) : (
              <>
                <h2>No templates yet</h2>
                <p>Create a template to define a document’s sections and the facts it needs.</p>
              </>
            )
          }
        />
      </div>
      {confirmDialog}
    </AppShell>
  );
}

function TemplateSummary({ t }: { t: Template }) {
  const rows: [string, string][] = [
    ["Document", t.docType],
    ["Jurisdiction", t.jurisdiction],
    ["Status", t.status],
  ];
  return (
    <div className="template-summary">
      <h2>{t.name}</h2>
      {t.description && <p>{t.description}</p>}
      <dl>
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
      </dl>
    </div>
  );
}
