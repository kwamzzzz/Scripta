import { useEffect, useRef, useState } from "react";
import NewContract from "@/components/NewContract";
import { useSearch } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { C, mono } from "@/lib/tokens";
import AppShell, { Crumbs } from "@/components/AppShell";
import { Button } from "@/components/primitives";
import Library, { type LibColumn, type LibView } from "@/components/Library";
import LibraryEmpty from "@/components/LibraryEmpty";
import LibraryCard from "@/components/LibraryCard";
import DocumentDetail from "@/components/DocumentDetail";
import { useOpenMatter } from "@/components/MatterCard";
import { useAuth } from "@/lib/auth";
import { useBoard } from "@/lib/use-board";
import { useDocumentUpload } from "@/lib/use-upload";
import { parseDocument } from "@/lib/documents.functions";
import {
  deleteDocuments,
  fetchArchivedDocs,
  fetchBinnedDocs,
  searchDocumentText,
  setArchived,
  signedUrl,
} from "@/lib/documents-library";
import { binCountdown, moveToBin, restoreFromBin } from "@/lib/trash";
import { ACCEPT_ATTR } from "@/lib/parsing/mime";
import { inferRole, inferVersion, roleToKind } from "@/lib/intake";
import { fileSize, longDate, relTime, type BoardDoc } from "@/lib/home-data";
import LoadError from "@/components/LoadError";
import ActionError, { attempt } from "@/components/ActionError";
import { useConfirmDelete } from "@/components/ConfirmDelete";

import "@/components/documents-screen.css";

const KIND_LABEL: Record<BoardDoc["kind"], string> = {
  contract: "Contract",
  amendment: "Amendment",
  transcript: "Transcript",
  playbook: "Playbook",
  letter: "Letter",
  resolution: "Resolution",
  minutes: "Minutes",
  proposal: "Proposal",
  research: "Research",
  reference: "Reference",
};

export function ParseStatus({ d }: { d: BoardDoc }) {
  if (d.parseStatus === "parsed") return <span style={{ color: C.green }}>Parsed</span>;
  if (d.parseStatus === "failed")
    return (
      <span style={{ color: C.red }} title={d.parseError ?? "Parse failed"}>
        Parse failed
      </span>
    );
  if (d.parseStatus === "parsing") return <span style={{ color: C.muted }}>Parsing…</span>;
  return <span style={{ color: C.muted }}>Pending</span>;
}

export default function DocumentsLibrary() {
  const { board, error: boardError, refetch } = useBoard();
  const qc = useQueryClient();
  const open = useOpenMatter();
  const { user, profile } = useAuth();
  const reparse = useServerFn(parseDocument);
  const { upload: uploadParam } = useSearch({ from: "/documents" });
  const [uploadOpen, setUploadOpen] = useState(Boolean(uploadParam));
  const [contentTerm, setContentTerm] = useState("");
  const [contentHits, setContentHits] = useState<{ term: string; ids: Set<string> } | null>(null);
  const [contentBusy, setContentBusy] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const [archived, setArchivedRows] = useState<BoardDoc[]>([]);
  const [binned, setBinnedRows] = useState<BoardDoc[]>([]);
  // Archived and binned rows are read outside the board, so an action that
  // moves a row between those two lists has to say when to read them again.
  const [reload, setReload] = useState(0);

  const actor = { id: user?.id ?? null, name: profile?.full_name ?? profile?.email ?? "Unknown" };
  const matterIds = board.matters.map((m) => m.id);
  const matterKey = matterIds.join(",");

  useEffect(() => {
    let live = true;
    void fetchArchivedDocs(matterIds).then((rows) => {
      if (!live) return;
      setArchivedRows(
        rows.map((d) => ({
          id: d.id,
          matterId: d.matter_id as string,
          name: d.name,
          kind: d.kind,
          ver: d.version_label ?? "",
          date: d.doc_date,
          parseStatus: d.parse_status,
          parseError: d.parse_error,
          storagePath: d.storage_path,
          bytes: d.byte_size,
          uploadedBy: "",
          createdAt: d.created_at,
          updatedAt: d.updated_at,
          archivedAt: "archived",
          deletedAt: null,
        })),
      );
    });
    // The board hides deleted documents, and so does the archived list, so
    // Recently Deleted is read on its own — archived or not, it is in the bin.
    void fetchBinnedDocs(matterIds).then((rows) => {
      if (!live) return;
      setBinnedRows(
        rows.map((d) => ({
          id: d.id,
          matterId: d.matter_id as string,
          name: d.name,
          kind: d.kind,
          ver: d.version_label ?? "",
          date: d.doc_date,
          parseStatus: d.parse_status,
          parseError: d.parse_error,
          storagePath: d.storage_path,
          bytes: d.byte_size,
          uploadedBy: "",
          createdAt: d.created_at,
          updatedAt: d.updated_at,
          archivedAt: d.archived_at,
          deletedAt: d.deleted_at,
        })),
      );
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matterKey, board.docs.length, reload]);

  const matterName = (id: string) => board.matters.find((m) => m.id === id)?.name ?? "";

  const rows = [...board.docs, ...archived, ...binned];
  const visible = contentHits ? rows.filter((d) => contentHits.ids.has(d.id)) : rows;

  const runContentSearch = async () => {
    const term = contentTerm.trim();
    if (!term) {
      setContentHits(null);
      setContentError(null);
      return;
    }
    setContentBusy(true);
    setContentError(null);
    try {
      const ids = await searchDocumentText(matterIds, term);
      setContentHits({ term, ids });
      if (ids.size === 0) setContentError(`No document text matches “${term}”.`);
    } catch (e) {
      setContentError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setContentBusy(false);
    }
  };

  const download = async (d: BoardDoc) => {
    if (!d.storagePath) return;
    try {
      window.open(await signedUrl(d.storagePath, d.name), "_blank", "noopener");
    } catch {
      /* surfaced in the detail panel */
    }
  };

  // Delete, archive and re-parse were launched with a bare `void` and no
  // catch. A failure became an unhandled rejection and the row stayed exactly
  // as it was, which reads as "nothing was selected" rather than "that did not
  // work" — after an action the lawyer deliberately chose.
  const [actionError, setActionError] = useState<string | null>(null);
  const { confirmDelete, confirmDialog } = useConfirmDelete();

  const remove = async (rowsToDelete: BoardDoc[]) => {
    if (!rowsToDelete.length) return;
    const what =
      rowsToDelete.length === 1 ? `"${rowsToDelete[0]!.name}"` : `${rowsToDelete.length} documents`;
    if (
      !(await confirmDelete({
        what,
        count: rowsToDelete.length,
        consequence: "Every stored version goes too.",
      }))
    )
      return;
    setActionError(null);
    const done = await attempt(
      `${what} could not be deleted`,
      () =>
        moveToBin(
          "documents",
          rowsToDelete.map((r) => r.id),
        ),
      setActionError,
    );
    if (!done) return;
    setReload((n) => n + 1);
    await qc.invalidateQueries();
    await refetch();
  };

  /** Out of Recently Deleted. A document archived before it went stays archived. */
  const restore = async (rowsToRestore: BoardDoc[]) => {
    if (!rowsToRestore.length) return;
    const what =
      rowsToRestore.length === 1
        ? `"${rowsToRestore[0]!.name}"`
        : `${rowsToRestore.length} documents`;
    setActionError(null);
    const done = await attempt(
      `${what} could not be restored`,
      () =>
        restoreFromBin(
          "documents",
          rowsToRestore.map((r) => r.id),
        ),
      setActionError,
    );
    if (!done) return;
    setReload((n) => n + 1);
    await qc.invalidateQueries();
    await refetch();
  };

  /**
   * Before the fifteen days are up. `deleteDocuments` rather than
   * `deleteForever` because the stored file and every earlier version of it
   * live in storage, which no row delete reaches — and it is what records the
   * audit event that says the document went.
   */
  const removeForGood = async (rowsToDelete: BoardDoc[]) => {
    if (!rowsToDelete.length) return;
    const what =
      rowsToDelete.length === 1 ? `"${rowsToDelete[0]!.name}"` : `${rowsToDelete.length} documents`;
    if (
      !(await confirmDelete({
        what,
        count: rowsToDelete.length,
        consequence: "Every stored version goes too.",
        binned: false,
      }))
    )
      return;
    setActionError(null);
    const done = await attempt(
      `${what} could not be deleted`,
      () => deleteDocuments(rowsToDelete, actor),
      setActionError,
    );
    if (!done) return;
    setReload((n) => n + 1);
    await qc.invalidateQueries();
    await refetch();
  };

  const archiveRows = async (rowsToArchive: BoardDoc[], next: boolean) => {
    const word = next ? "archived" : "restored";
    setActionError(null);
    for (const r of rowsToArchive) {
      const done = await attempt(
        `"${r.name}" could not be ${word}`,
        () => setArchived(r, next, actor),
        setActionError,
      );
      if (!done) break;
    }
    await qc.invalidateQueries();
    await refetch();
  };

  const runParse = async (rowsToParse: BoardDoc[]) => {
    setActionError(null);
    for (const r of rowsToParse) {
      const done = await attempt(
        `"${r.name}" could not be read again`,
        () => reparse({ data: { documentId: r.id } }),
        setActionError,
      );
      if (!done) break;
    }
    await qc.invalidateQueries();
  };

  const columns: LibColumn<BoardDoc>[] = [
    {
      key: "name",
      label: "Name",
      value: (d) => d.name.toLowerCase(),
      render: (d) => (
        <span style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 600, color: C.text }}>{d.name}</span>
          {d.deletedAt && (
            <span style={{ fontSize: 11.5, color: C.muted }}>{binCountdown(d.deletedAt)}</span>
          )}
        </span>
      ),
    },
    {
      key: "kind",
      label: "Kind",
      width: 110,
      value: (d) => d.kind,
      render: (d) => KIND_LABEL[d.kind],
    },
    {
      key: "ver",
      label: "Version",
      width: 90,
      value: (d) => d.ver,
      render: (d) => <span style={{ fontFamily: mono }}>{d.ver}</span>,
    },
    {
      key: "matter",
      label: "Matter",
      width: 220,
      value: (d) => matterName(d.matterId),
      render: (d) => matterName(d.matterId),
    },
    {
      key: "status",
      label: "Parse status",
      width: 110,
      value: (d) => d.parseStatus,
      render: (d) => <ParseStatus d={d} />,
    },
    {
      key: "size",
      label: "Size",
      width: 80,
      value: (d) => d.bytes ?? 0,
      render: (d) => <span style={{ fontFamily: mono }}>{fileSize(d.bytes)}</span>,
    },
    {
      key: "by",
      label: "Uploaded by",
      width: 130,
      value: (d) => d.uploadedBy,
      render: (d) => d.uploadedBy,
    },
    {
      key: "date",
      label: "Document date",
      width: 120,
      defaultOff: true,
      value: (d) => d.date ?? "",
      render: (d) => <span style={{ fontFamily: mono }}>{longDate(d.date)}</span>,
    },
    {
      key: "modified",
      label: "Modified",
      width: 120,
      value: (d) => d.updatedAt,
      render: (d) => <span style={{ color: C.muted }}>{relTime(d.updatedAt)}</span>,
    },
  ];

  // A deleted document leaves every view, Archived included: it is in the bin,
  // not merely put aside.
  const live = (d: BoardDoc) => !d.archivedAt && !d.deletedAt;
  const views: LibView<BoardDoc>[] = [
    { key: "All", label: "All", filter: live },
    { key: "contract", label: "Contracts", filter: (d) => live(d) && d.kind === "contract" },
    { key: "amendment", label: "Amendments", filter: (d) => live(d) && d.kind === "amendment" },
    { key: "transcript", label: "Transcripts", filter: (d) => live(d) && d.kind === "transcript" },
    { key: "playbook", label: "Playbooks", filter: (d) => live(d) && d.kind === "playbook" },
    {
      key: "failed",
      label: "Needs attention",
      filter: (d) => live(d) && d.parseStatus === "failed",
    },
    { key: "archived", label: "Archived", filter: (d) => !!d.archivedAt && !d.deletedAt },
    { key: "Deleted", label: "Recently Deleted", filter: (d) => !!d.deletedAt },
  ];

  return (
    <AppShell
      section="review"
      trackLabel="Documents"
      breadcrumb={<Crumbs items={[{ label: "Documents" }]} />}
      actions={<NewContract />}
      scroll={false}
    >
      <LoadError what="documents" error={boardError} onRetry={() => void refetch()} />
      <ActionError error={actionError} onDismiss={() => setActionError(null)} />
      <Library
        storageKey="review"
        title="Documents"
        description="Find files, manage versions and maintain document records."
        rowLabel={(d) => d.name}
        beforeToolbar={
          <div className="scripta-document-tools">
            {uploadOpen && (
              <UploadPanel
                onDone={() => {
                  setUploadOpen(false);
                  void refetch();
                }}
              />
            )}
            <details className="scripta-document-text-search">
              <summary>
                Search inside document text
                {contentHits && (
                  <span>
                    Text filter active · {contentHits.ids.size}{" "}
                    {contentHits.ids.size === 1 ? "match" : "matches"}
                  </span>
                )}
              </summary>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!contentBusy) void runContentSearch();
                }}
              >
                <label className="scripta-form-field">
                  <span>Words in the extracted text</span>
                  <input
                    value={contentTerm}
                    onChange={(e) => setContentTerm(e.target.value)}
                    placeholder="Search document contents"
                  />
                </label>
                <button
                  type="submit"
                  className="wf-button wf-button-outline"
                  disabled={contentBusy}
                >
                  {contentBusy ? "Searching…" : "Search text"}
                </button>
                {contentHits && (
                  <Button
                    variant="quiet"
                    onClick={() => {
                      setContentHits(null);
                      setContentTerm("");
                      setContentError(null);
                    }}
                  >
                    Clear text filter
                  </Button>
                )}
                {contentError && (
                  <div className="scripta-document-feedback is-error" role="alert">
                    {contentError}
                  </div>
                )}
              </form>
            </details>
          </div>
        }
        rows={visible}
        columns={columns}
        views={views}
        searchText={(d) => [d.name, d.ver, matterName(d.matterId), d.uploadedBy].join(" ")}
        searchPlaceholder="Search documents"
        onOpen={(d) => void open(d.matterId)}
        board={{
          columns: Object.values(KIND_LABEL),
          column: (d) => KIND_LABEL[d.kind],
          card: (d) => <LibraryCard compact title={d.name} onOpen={() => void open(d.matterId)} />,
        }}
        cards={(d) => (
          <LibraryCard
            title={d.name}
            onOpen={() => void open(d.matterId)}
            subtitle={matterName(d.matterId) || "No matter"}
            state={KIND_LABEL[d.kind]}
            facts={[d.ver, d.uploadedBy]}
          />
        )}
        primary={{
          label: uploadOpen ? "Close upload" : "Upload",
          onClick: () => setUploadOpen((o) => !o),
        }}
        actions={(d) =>
          d.deletedAt
            ? [
                { label: "Restore", onClick: () => void restore([d]) },
                { label: "Delete for good", danger: true, onClick: () => void removeForGood([d]) },
              ]
            : [
                { label: "Open matter", onClick: () => void open(d.matterId) },
                { label: "Download", onClick: () => void download(d) },
                { label: "Re-parse", onClick: () => void runParse([d]) },
                {
                  label: d.archivedAt ? "Restore" : "Archive",
                  onClick: () => void archiveRows([d], !d.archivedAt),
                },
                { label: "Delete", danger: true, onClick: () => void remove([d]) },
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
                { label: "Re-parse", onClick: (r) => void runParse(r) },
                { label: "Archive", onClick: (r) => void archiveRows(r, true) },
                { label: "Delete", danger: true, onClick: (r) => void remove(r) },
              ]
        }
        detail={(d) => (
          <DocumentDetail
            doc={d}
            onOpenMatter={() => void open(d.matterId)}
            onChanged={() => void refetch()}
          />
        )}
        empty={
          <LibraryEmpty title="No documents yet">
            Every contract, amendment, transcript and playbook uploaded to any matter is listed
            here, whichever matter it belongs to. Open a matter and upload one, and it appears.
          </LibraryEmpty>
        }
      />
      {confirmDialog}
    </AppShell>
  );
}

/** Lightweight path: drop files straight into an existing matter, no intake. */
function UploadPanel({ onDone }: { onDone: () => void }) {
  const { board } = useBoard();
  // The board loads async, so seeding useState from board.matters[0] captures "".
  // Keep the explicit pick in state and fall back to the first matter once loaded.
  const [picked, setPicked] = useState("");
  const matterId = picked || board.matters[0]?.id || "";
  const { upload, busy, error } = useDocumentUpload(matterId || null);
  const ref = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");

  const handle = async (files: File[]) => {
    if (!files.length || !matterId) return;
    for (const f of files) {
      const role = inferRole(f.name);
      setNote(`Uploading ${f.name}…`);
      // Guessed from the name, so the reading step may correct it.
      await upload(f, roleToKind(role), inferVersion(f.name), true);
    }
    setNote("");
    onDone();
  };

  return (
    <section className="scripta-document-upload" aria-labelledby="document-upload-title">
      <h2 id="document-upload-title">Upload documents</h2>
      <div className="scripta-document-upload-controls">
        <label className="scripta-form-field">
          <span>Matter</span>
          <select value={matterId} onChange={(e) => setPicked(e.target.value)}>
            {board.matters.length === 0 && <option value="">No matters yet</option>}
            {board.matters.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <input
          ref={ref}
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          hidden
          onChange={(e) => {
            // Copy before clearing: FileList is live, and resetting the input
            // value empties it — handle() would otherwise see zero files.
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            void handle(files);
          }}
        />
        <Button onClick={() => ref.current?.click()} disabled={busy || !matterId}>
          {busy ? "Uploading…" : "Choose files"}
        </Button>
      </div>
      <p className="scripta-document-note">
        Document types are identified from file names. Use New matter for the full intake.
      </p>
      {note && (
        <div className="scripta-document-feedback" role="status">
          {note}
        </div>
      )}
      {error && (
        <div className="scripta-document-feedback is-error" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}
