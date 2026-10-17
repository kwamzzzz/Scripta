/**
 * Corporate Drafting's landing page: every resolution and letter in the
 * workspace as a table, with New letter and New resolution up front. Opening
 * a row goes to its editor; the editor's breadcrumb comes back here.
 */
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import AppShell, { Crumbs } from "@/components/AppShell";
import Library, { type LibColumn, type LibView } from "@/components/Library";
import LibraryEmpty from "@/components/LibraryEmpty";
import { Button } from "@/components/primitives";
import {
  createCorporateDocument,
  listCorporateDocuments,
  KIND_LABEL,
  type CorporateDocument,
  type CorporateDocumentKind,
} from "@/lib/corporate-documents";
import { listLetterheads } from "@/lib/letterheads";
import { relTime } from "@/lib/home-data";
import { partText } from "@/editor/model";
import { C, mono } from "@/lib/tokens";
import { useApp } from "@/store/app";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import { archiveLabel, archiveVerb, setArchived } from "@/lib/archive";
import { binCountdown, deleteForever, moveToBin, restoreFromBin } from "@/lib/trash";
import "./corporate-drafting.css";

const kindLabel = (kind: CorporateDocumentKind) => KIND_LABEL[kind];

export default function CorporateDraftingLibrary() {
  const { workspaceId } = useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);

  const documents = useQuery({
    queryKey: ["corporate-documents", workspaceId],
    enabled: !!workspaceId,
    queryFn: () => listCorporateDocuments(workspaceId!),
  });
  const letterheads = useQuery({
    queryKey: ["letterheads", workspaceId],
    enabled: !!workspaceId,
    queryFn: () => listLetterheads(workspaceId!),
  });
  const open = (id: string) =>
    void navigate({ to: "/matters/corporate-drafting/$documentId", params: { documentId: id } });

  const create = useMutation({
    mutationFn: (kind: CorporateDocumentKind) =>
      createCorporateDocument(workspaceId!, kind, {
        letterheadId: letterheads.data?.find((item) => item.isDefault)?.id ?? null,
      }),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ["corporate-documents", workspaceId] });
      open(created.id);
    },
    onError: (error) => setNotice((error as Error).message),
  });
  const { confirmDelete, confirmDialog } = useConfirmDelete();

  /** Out of the active workspace, and back again. Reversible, so it does not ask. */
  const archive = async (rows: CorporateDocument[], archived: boolean) => {
    if (!rows.length) return;
    try {
      await setArchived(
        "corporate_documents",
        rows.map((r) => r.id),
        archived,
      );
      await queryClient.invalidateQueries({ queryKey: ["corporate-documents", workspaceId] });
    } catch (error) {
      setNotice(`That document could not be ${archiveVerb(archived)}. ${(error as Error).message}`);
    }
  };

  const remove = async (rows: CorporateDocument[]) => {
    if (!rows.length || !workspaceId) return;
    const what = rows.length === 1 ? `“${rows[0]!.title}”` : `${rows.length} documents`;
    if (!(await confirmDelete({ what, count: rows.length }))) return;
    try {
      await moveToBin(
        "corporate_documents",
        rows.map((row) => row.id),
      );
      await queryClient.invalidateQueries({ queryKey: ["corporate-documents", workspaceId] });
    } catch (error) {
      setNotice((error as Error).message);
    }
  };

  /** Out of Recently Deleted, back to wherever it was — archived ones included. */
  const restore = async (rows: CorporateDocument[]) => {
    if (!rows.length) return;
    try {
      await restoreFromBin(
        "corporate_documents",
        rows.map((row) => row.id),
      );
      await queryClient.invalidateQueries({ queryKey: ["corporate-documents", workspaceId] });
    } catch (error) {
      setNotice(`That document could not be restored. ${(error as Error).message}`);
    }
  };

  /** Before the fifteen days are up. There is no bin left to promise. */
  const removeForGood = async (rows: CorporateDocument[]) => {
    if (!rows.length) return;
    const what = rows.length === 1 ? `“${rows[0]!.title}”` : `${rows.length} documents`;
    if (!(await confirmDelete({ what, count: rows.length, binned: false }))) return;
    try {
      await deleteForever(
        "corporate_documents",
        rows.map((row) => row.id),
      );
      await queryClient.invalidateQueries({ queryKey: ["corporate-documents", workspaceId] });
    } catch (error) {
      setNotice((error as Error).message);
    }
  };

  const columns: LibColumn<CorporateDocument>[] = [
    {
      key: "title",
      label: "Document",
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
      label: "Type",
      width: 150,
      render: (r) => kindLabel(r.kind),
      value: (r) => r.kind,
    },
    {
      key: "matter",
      label: "Matter",
      width: 220,
      render: (r) => r.matterName || <span style={{ color: C.faint }}>Not filed</span>,
      value: (r) => r.matterName,
    },
    {
      key: "paper",
      label: "Letterhead",
      width: 160,
      render: (r) => r.letterheadName || <span style={{ color: C.faint }}>None</span>,
      value: (r) => r.letterheadName,
      defaultOff: true,
    },
    {
      key: "parts",
      label: "Parts",
      width: 90,
      render: (r) => (
        <span style={{ fontFamily: mono, fontSize: 11.5, color: C.muted }}>
          {r.content.parts.filter((p) => partText(p).trim()).length}/{r.content.parts.length}
        </span>
      ),
      value: (r) => r.content.parts.length,
    },
    {
      key: "updated",
      label: "Updated",
      width: 120,
      value: (r) => r.updatedAt,
      render: (r) => <span style={{ color: C.muted }}>{relTime(r.updatedAt)}</span>,
    },
  ];
  // Archived documents show only under Archived, as on Matters.
  // A deleted document leaves every view, Archived included: it is in the bin,
  // not merely put aside.
  const live = (r: CorporateDocument) => !r.archivedAt && !r.deletedAt;
  const views: LibView<CorporateDocument>[] = [
    { key: "All", label: "All", filter: live },
    {
      key: "Resolutions",
      label: "Resolutions",
      filter: (r) => live(r) && r.kind !== "letter" && r.kind !== "board_minutes",
    },
    { key: "Minutes", label: "Minutes", filter: (r) => live(r) && r.kind === "board_minutes" },
    { key: "Letters", label: "Letters", filter: (r) => live(r) && r.kind === "letter" },
    { key: "Unfiled", label: "Not filed to a matter", filter: (r) => live(r) && !r.matterId },
    { key: "Archived", label: "Archived", filter: (r) => !!r.archivedAt && !r.deletedAt },
    { key: "Deleted", label: "Recently Deleted", filter: (r) => !!r.deletedAt },
  ];

  return (
    <AppShell
      section="corporate-drafting"
      breadcrumb={<Crumbs items={[{ label: "Corporate Drafting" }]} />}
      scroll={false}
      assistant={{
        key: "corporate-drafting",
        screen: "Corporate Drafting",
        intro:
          "Ask what a resolution must recite, or how a letter should be addressed under the house style.",
      }}
    >
      {(notice || documents.isError) && (
        <div role="alert" style={{ padding: "8px 20px", color: C.red, fontSize: 12.5 }}>
          {notice ?? (documents.error as Error).message}
        </div>
      )}
      <Library
        storageKey="corporate-drafting"
        title="Corporate Drafting"
        description="Board resolutions and letters on the firm's paper. Start one, or open a document to keep writing."
        rows={documents.data ?? []}
        columns={columns}
        views={views}
        searchText={(r) => [r.title, kindLabel(r.kind), r.matterName, r.letterheadName].join(" ")}
        searchPlaceholder="Search documents"
        onOpen={(r) => open(r.id)}
        primary={{
          label: "New document",
          onClick: () =>
            void navigate({ to: "/matters/corporate-drafting/new", search: { kind: undefined } }),
        }}
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
        board={{
          columns: ["Resolutions", "Minutes", "Letters"],
          column: (r) =>
            r.kind === "letter"
              ? "Letters"
              : r.kind === "board_minutes"
                ? "Minutes"
                : "Resolutions",
          card: (r) => <CorporateDocumentCard document={r} onOpen={() => open(r.id)} compact />,
        }}
        cards={(r) => <CorporateDocumentCard document={r} onOpen={() => open(r.id)} />}
        detail={(r) => (
          <div className="scripta-matter-detail corporate-library-detail">
            <header>
              <h2>{r.title}</h2>
              <p>Created {relTime(r.createdAt)}</p>
            </header>
            <Button variant="primary" onClick={() => open(r.id)}>
              Open document
            </Button>
            <section>
              <h3>Document details</h3>
              <dl>
                <dt>Type</dt>
                <dd>{kindLabel(r.kind)}</dd>
                <dt>Matter</dt>
                <dd>{r.matterName || "Not filed to a matter"}</dd>
                <dt>Letterhead</dt>
                <dd>{r.letterheadName || "No letterhead"}</dd>
              </dl>
            </section>
            <section>
              <h3>Content preview</h3>
              <ol className="corporate-library-preview">
                {r.content.parts.slice(0, 3).map((p) => (
                  <li key={p.id}>
                    {p.num && <span className="corporate-library-preview-number">{p.num}</span>}
                    <p>
                      {partText(p).trim() || (
                        <span className="corporate-library-placeholder">
                          {p.title} — not written
                        </span>
                      )}
                    </p>
                  </li>
                ))}
              </ol>
              {!r.content.parts.length && (
                <p className="corporate-library-placeholder">No parts yet.</p>
              )}
              {r.content.parts.length > 3 && (
                <p className="corporate-library-preview-note">
                  Showing the first 3 of {r.content.parts.length} parts.
                </p>
              )}
            </section>
          </div>
        )}
        empty={
          documents.isLoading ? (
            <p role="status">Loading documents…</p>
          ) : (
            <LibraryEmpty
              title="No corporate documents yet"
              action={{
                label: "New document",
                onClick: () =>
                  void navigate({
                    to: "/matters/corporate-drafting/new",
                    search: { kind: undefined },
                  }),
              }}
            >
              Board resolutions, minutes and letters, written on the firm's own paper. A document
              does not need a matter — write it now and file it to one later.
            </LibraryEmpty>
          )
        }
      />
      {confirmDialog}
    </AppShell>
  );
}

function CorporateDocumentCard({
  document,
  onOpen,
  compact = false,
}: {
  document: CorporateDocument;
  onOpen: () => void;
  compact?: boolean;
}) {
  const written = document.content.parts.filter((part) => partText(part).trim()).length;
  return (
    <article
      className={`scripta-matter-card corporate-library-card${compact ? " is-compact" : ""}`}
    >
      <header>
        <h3>
          <button type="button" onClick={onOpen}>
            {document.title}
          </button>
        </h3>
      </header>
      <p>{kindLabel(document.kind)}</p>
      <p>{document.matterName || "Not filed to a matter"}</p>
      <p>
        {written}/{document.content.parts.length} parts written
      </p>
      <div className="scripta-matter-card-actions">
        <Button variant="primary" onClick={onOpen}>
          Open document
        </Button>
      </div>
    </article>
  );
}
