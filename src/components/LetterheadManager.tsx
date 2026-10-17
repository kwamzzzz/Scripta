/**
 * The firm's paper. Drop a letterhead and it is uploaded at once under its
 * file name; rename it, make it the default, or delete it afterwards. Lives in
 * Settings → Workspace and beside the corporate drafting editor, the same
 * component in both places.
 */
import { useRef, useState, type DragEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Upload } from "lucide-react";
import { Button } from "@/components/primitives";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import {
  deleteLetterhead,
  LETTERHEAD_ACCEPT,
  letterheadFileProblem,
  listLetterheads,
  renameLetterhead,
  setDefaultLetterhead,
  uploadLetterhead,
  type Letterhead,
  type LetterheadUsage,
} from "@/lib/letterheads";
import { C, mono, radius } from "@/lib/tokens";

function usageMessage(name: string, usedBy: LetterheadUsage[]) {
  const documents = usedBy
    .map((item) => `${item.kind === "resolution" ? "Board resolution" : "Letter"} “${item.title}”`)
    .join(", ");
  return `“${name}” cannot be deleted because it is used by ${documents}. Choose another paper or No letterhead on ${usedBy.length === 1 ? "that document" : "those documents"}, then try again.`;
}

const nameFromFile = (file: File) =>
  file.name
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .trim();

export default function LetterheadManager({
  workspaceId,
  onClose,
  compact = false,
}: {
  workspaceId: string;
  onClose?: (() => void) | undefined;
  /** Inside another screen's header: tighter, with a Close control. */
  compact?: boolean | undefined;
}) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const letterheads = useQuery({
    queryKey: ["letterheads", workspaceId],
    queryFn: () => listLetterheads(workspaceId),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["letterheads", workspaceId] });

  const upload = useMutation({
    mutationFn: (file: File) =>
      uploadLetterhead(workspaceId, file, nameFromFile(file) || "Letterhead"),
    onSuccess: async (created) => {
      await refresh();
      setMessage({
        text: `“${created.name}” uploaded${created.isDefault ? " and set as the default" : ""}. Rename it below if you like.`,
      });
      if (fileRef.current) fileRef.current.value = "";
    },
    onError: (error) => setMessage({ text: (error as Error).message, error: true }),
  });
  const rename = useMutation({
    mutationFn: ({ id, value }: { id: string; value: string }) => renameLetterhead(id, value),
    onSuccess: async () => {
      await refresh();
      setRenaming(null);
      setMessage({ text: "Letterhead renamed." });
    },
    onError: (error) => setMessage({ text: (error as Error).message, error: true }),
  });
  const makeDefault = useMutation({
    mutationFn: setDefaultLetterhead,
    onSuccess: async () => {
      await refresh();
      setMessage({ text: "Default letterhead updated. New documents will use it." });
    },
    onError: (error) => setMessage({ text: (error as Error).message, error: true }),
  });
  const remove = useMutation({
    mutationFn: (letterhead: Letterhead) => deleteLetterhead(letterhead.id),
    onSuccess: async (result, letterhead) => {
      if (!result.deleted) {
        setMessage({ text: usageMessage(letterhead.name, result.usedBy), error: true });
        return;
      }
      await refresh();
      setMessage({ text: result.cleanupWarning ?? "Letterhead deleted." });
    },
    onError: (error) => setMessage({ text: (error as Error).message, error: true }),
  });

  const { confirmDelete, confirmDialog } = useConfirmDelete();
  /**
   * A letterhead in use cannot be deleted at all, so the question is about the
   * paper itself: the record and the files behind it — first page, continuation
   * page and the file that was uploaded — are removed from storage.
   */
  const askRemove = async (paper: Letterhead) => {
    if (
      !(await confirmDelete({
        what: `“${paper.name}”`,
        consequence: paper.isDefault
          ? "The uploaded file goes with it, and new documents would have no default paper until you choose one."
          : "The uploaded file goes with it.",
        archivable: false,
        binned: false,
      }))
    )
      return;
    remove.mutate(paper);
  };

  const take = (file: File | undefined) => {
    if (!file) return;
    const problem = letterheadFileProblem(file);
    if (problem) {
      setMessage({ text: problem, error: true });
      return;
    }
    setMessage(null);
    upload.mutate(file);
  };
  const drop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    take(event.dataTransfer.files?.[0]);
  };

  return (
    <section
      aria-label="Letterheads"
      style={{
        display: "grid",
        gap: 12,
        ...(compact
          ? {
              flex: "none",
              borderBottom: `1px solid ${C.border}`,
              background: C.panel,
              padding: "12px 16px",
            }
          : {}),
      }}
    >
      {compact && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ImagePlus size={15} color={C.accent} />
          <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>Letterheads</span>
          <span style={{ color: C.muted, fontSize: 11.5 }}>
            The firm's paper. Choose one per document; the default goes on new documents.
          </span>
          <div style={{ flex: 1 }} />
          {onClose && <Button onClick={onClose}>Close</Button>}
        </div>
      )}
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
        disabled={upload.isPending}
        aria-label="Upload a letterhead"
        style={{
          border: `1px dashed ${over ? C.accent : C.border}`,
          background: over ? C.accentTint : C.canvas,
          borderRadius: radius.lg,
          padding: compact ? "12px 16px" : "20px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          cursor: upload.isPending ? "default" : "pointer",
          font: "inherit",
          color: C.text,
          textAlign: "left",
        }}
      >
        <Upload size={18} color={C.muted} />
        <span style={{ display: "grid", gap: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>
            {upload.isPending
              ? "Uploading…"
              : "Drop your letterhead here, or click to choose a file"}
          </span>
          <span style={{ fontSize: 11.5, color: C.muted }}>
            A Word template, a PDF, or a PNG or JPEG image, up to 10 MB. It is uploaded at once
            under its file name.
          </span>
        </span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept={LETTERHEAD_ACCEPT}
        hidden
        onChange={(event) => take(event.target.files?.[0])}
      />
      {message && (
        <div
          role={message.error ? "alert" : "status"}
          style={{ fontSize: 12.5, color: message.error ? C.red : C.secondary, lineHeight: 1.5 }}
        >
          {message.text}
        </div>
      )}
      <div style={{ display: "grid", gap: 6 }}>
        {(letterheads.data ?? []).map((paper) => (
          <div
            key={paper.id}
            style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, minWidth: 0 }}
          >
            {renaming === paper.id ? (
              <>
                <input
                  value={renameValue}
                  autoFocus
                  onChange={(event) => setRenameValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") rename.mutate({ id: paper.id, value: renameValue });
                    if (event.key === "Escape") setRenaming(null);
                  }}
                  style={{
                    border: `1px solid ${C.border}`,
                    borderRadius: radius.md,
                    padding: "6px 10px",
                    font: "inherit",
                    width: 280,
                  }}
                />
                <Button
                  variant="primary"
                  onClick={() => rename.mutate({ id: paper.id, value: renameValue })}
                >
                  Save
                </Button>
                <Button onClick={() => setRenaming(null)}>Cancel</Button>
              </>
            ) : (
              <>
                <span
                  style={{
                    fontWeight: 600,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {paper.name}
                </span>
                {paper.isDefault && (
                  <span style={{ color: C.muted, fontFamily: mono, fontSize: 10 }}>DEFAULT</span>
                )}
                <div style={{ flex: 1 }} />
                <Button
                  onClick={() => {
                    setRenaming(paper.id);
                    setRenameValue(paper.name);
                  }}
                >
                  Rename
                </Button>
                {!paper.isDefault && (
                  <Button onClick={() => makeDefault.mutate(paper.id)}>Make default</Button>
                )}
                <Button variant="danger" onClick={() => void askRemove(paper)}>
                  Delete
                </Button>
              </>
            )}
          </div>
        ))}
        {letterheads.isLoading && (
          <span style={{ color: C.muted, fontSize: 12.5 }}>Loading letterheads…</span>
        )}
        {!letterheads.isLoading && !letterheads.data?.length && (
          <span style={{ color: C.muted, fontSize: 12.5 }}>
            No letterheads yet. The first one you upload becomes the default.
          </span>
        )}
      </div>
      {confirmDialog}
    </section>
  );
}
