/**
 * What a task carries.
 *
 * Correspondence could already hold a file, but only on a message, so the only
 * way to put a document on a task was to pretend it had arrived in an email.
 * Most of what a lawyer attaches is not correspondence at all: it is the draft
 * being worked on, the ID that goes with the filing, the portal the thing is
 * submitted through. Those belong on the task.
 *
 * Three kinds, told apart because they behave differently rather than to be
 * thorough. A file is uploaded and its bytes go to the matter's folder in the
 * bucket. A document Scripta already holds is pointed at — copying it would
 * give the firm two versions of the same agreement and no way to say which is
 * current. A link is an address, for the things that are never coming into
 * Scripta.
 *
 * The section is not drawn until there is something in it or somebody reaches
 * for the buttons; an empty filing tray on every task would be noise.
 */
import { useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Link2, Paperclip } from "lucide-react";
import { Button } from "@/components/primitives";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import { Modal } from "@/wireframe/screens";
import { supabase } from "@/integrations/supabase/client";
import { downloadFile, putFile, type FileHome } from "@/lib/files";
import { useApp } from "@/store/app";
import { useAuth } from "@/lib/auth";
import {
  LINK_MIME,
  MAX_ATTACHMENT_BYTES,
  fmtBytes,
  type Attachment,
  type ThreadAttachment,
} from "@/lib/correspondence";
import type { Task } from "@/lib/tasks/model";
import type { TaskPatch } from "@/lib/tasks/data";

const uid = () => globalThis.crypto?.randomUUID?.() ?? String(Math.random());

/** A link needs a scheme to be openable; a pasted address usually has none. */
const withScheme = (url: string) => (/^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`);

/* ------------------------------------------------------------------ chip */

/**
 * One attachment, as a chip.
 *
 * Shared with Correspondence, which draws the same chip for the files that
 * came in on a reply — a file on a task and a file on a message look the same
 * because they are the same thing kept in a different place.
 */
export function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: ThreadAttachment | Attachment;
  onRemove: () => void;
}) {
  const kind = "kind" in attachment ? attachment.kind : "file";
  const url = "url" in attachment ? attachment.url : undefined;
  const Icon = kind === "link" ? Link2 : kind === "document" ? FileText : Paperclip;
  return (
    <span className="task-attachment">
      <Icon size={10} strokeWidth={2} aria-hidden="true" />
      {kind === "link" && url ? (
        <a href={url} target="_blank" rel="noreferrer" title={url}>
          {attachment.name}
        </a>
      ) : (
        <button
          type="button"
          onClick={() => void downloadFile(attachment.fileRef, attachment.name)}
          title={`Download ${attachment.name}`}
        >
          {attachment.name}
        </button>
      )}
      <span>{kind === "link" ? "Link" : fmtBytes(attachment.bytes)}</span>
      <button type="button" onClick={onRemove} aria-label={`Remove ${attachment.name}`}>
        ×
      </button>
    </span>
  );
}

/* ---------------------------------------------------------------- upload */

/**
 * Bytes to the bucket, metadata back to the caller.
 *
 * Used by the task's own attachments and by the email draft's, because where a
 * file is written must not depend on which button was pressed.
 */
export async function uploadAttachments(
  files: FileList | File[] | null,
  home: FileHome,
): Promise<{ added: Attachment[]; problem: string | null }> {
  const list = [...(files ?? [])];
  const tooBig = list.filter((f) => f.size > MAX_ATTACHMENT_BYTES);
  const added: Attachment[] = [];
  try {
    for (const file of list) {
      if (file.size > MAX_ATTACHMENT_BYTES) continue;
      const id = uid();
      const fileRef = await putFile(id, file, file.name, home);
      added.push({
        id,
        name: file.name,
        kind: "file",
        fileRef,
        bytes: file.size,
        mime: file.type || "application/octet-stream",
        addedAt: new Date().toISOString(),
      });
    }
  } catch (error) {
    return {
      added,
      problem: error instanceof Error ? error.message : "The file could not be saved.",
    };
  }
  return {
    added,
    problem: tooBig.length ? `${tooBig.map((f) => f.name).join(", ")} is larger than 25 MB.` : null,
  };
}

/* ------------------------------------------------------------------ hook */

/**
 * Attaching, wherever it is done from.
 *
 * The buttons in this section and a file dropped anywhere on the panel are the
 * same operation, so it lives in one place both can reach rather than being
 * written twice and drifting.
 */
export function useTaskAttachments(task: Task, onPatch: (patch: TaskPatch) => void) {
  const { workspaceId } = useApp();
  const { user } = useAuth();
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A task filed to a matter puts its files with that matter; one filed to
  // nothing is personal, and its files go where the bucket policy can never
  // mistake them for a matter's.
  const home = {
    workspaceId: workspaceId ?? "",
    matterId: task.matterId ?? null,
    userId: user?.id ?? null,
  };

  const add = (added: Attachment[]) => {
    if (added.length) onPatch({ attachments: [...task.attachments, ...added] });
  };

  /** Upload, then keep only the metadata on the task. */
  const attachFiles = async (files: FileList | File[] | null) => {
    if (![...(files ?? [])].length) return;
    setBusy(true);
    const { added, problem: trouble } = await uploadAttachments(files, home);
    setProblem(trouble);
    add(added);
    setBusy(false);
  };

  /** A document Scripta already holds: pointed at, never copied. */
  const attachDocuments = (docs: PickedDoc[]) => {
    setProblem(null);
    add(
      docs.map((d) => ({
        id: uid(),
        name: d.name,
        kind: "document" as const,
        fileRef: d.storagePath ?? "",
        documentId: d.id,
        bytes: d.bytes ?? 0,
        mime: d.mime ?? "application/octet-stream",
        addedAt: new Date().toISOString(),
      })),
    );
  };

  const attachLink = (name: string, url: string) => {
    setProblem(null);
    add([
      {
        id: uid(),
        name: name.trim() || url,
        kind: "link",
        fileRef: "",
        url: withScheme(url.trim()),
        bytes: 0,
        mime: LINK_MIME,
        addedAt: new Date().toISOString(),
      },
    ]);
  };

  const remove = (id: string) =>
    onPatch({ attachments: task.attachments.filter((a) => a.id !== id) });

  return { attachFiles, attachDocuments, attachLink, remove, problem, busy };
}

/* ---------------------------------------------------------- document pick */

export type PickedDoc = {
  id: string;
  name: string;
  storagePath: string | null;
  bytes: number | null;
  mime: string | null;
  version: string;
};

function useMatterDocuments(matterId: string | null) {
  return useQuery({
    queryKey: ["task-attach-documents", matterId],
    enabled: !!matterId,
    queryFn: async (): Promise<PickedDoc[]> => {
      const { data, error } = await supabase
        .from("documents")
        .select("id, name, storage_path, byte_size, mime_type, version_label, updated_at")
        .eq("matter_id", matterId!)
        .is("deleted_at", null)
        .is("archived_at", null)
        .order("updated_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map((d) => ({
        id: d.id,
        name: d.name,
        storagePath: d.storage_path,
        bytes: d.byte_size,
        mime: d.mime_type,
        version: d.version_label ?? "",
      }));
    },
  });
}

function DocumentPicker({
  matterId,
  matterName,
  taken,
  onClose,
  onPick,
}: {
  matterId: string;
  matterName: string;
  taken: Set<string>;
  onClose: () => void;
  onPick: (docs: PickedDoc[]) => void;
}) {
  const docs = useMatterDocuments(matterId);
  const [term, setTerm] = useState("");
  const [chosen, setChosen] = useState<Record<string, boolean>>({});

  const rows = useMemo(() => {
    const all = docs.data ?? [];
    const q = term.trim().toLowerCase();
    return q ? all.filter((d) => d.name.toLowerCase().includes(q)) : all;
  }, [docs.data, term]);

  const picked = (docs.data ?? []).filter((d) => chosen[d.id]);

  return (
    <Modal open onClose={onClose} label="Attach a document">
      <div className="task-reply-dialog task-doc-picker">
        <h2>Attach from {matterName || "this matter"}</h2>
        <p>
          The task points at the document. Nothing is copied, so the attachment stays the current
          version rather than becoming a second one.
        </p>
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search documents"
          aria-label="Search documents"
          autoFocus
        />
        <div className="task-doc-list">
          {docs.isLoading && <p>Reading the matter…</p>}
          {docs.isError && <p role="alert">{(docs.error as Error).message}</p>}
          {!docs.isLoading && !rows.length && (
            <p>{term ? "Nothing by that name." : "This matter has no documents yet."}</p>
          )}
          {rows.map((d) => {
            const already = taken.has(d.id);
            return (
              <label key={d.id} className={already ? "is-taken" : ""}>
                <input
                  type="checkbox"
                  checked={!!chosen[d.id]}
                  disabled={already}
                  onChange={(e) => setChosen((c) => ({ ...c, [d.id]: e.target.checked }))}
                />
                <span>{d.name}</span>
                <span className="task-doc-note">
                  {already ? "Already attached" : d.version || (d.bytes ? fmtBytes(d.bytes) : "")}
                </span>
              </label>
            );
          })}
        </div>
        <div className="task-reply-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!picked.length}
            onClick={() => {
              onPick(picked);
              onClose();
            }}
          >
            {picked.length > 1 ? `Attach ${picked.length} documents` : "Attach document"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------- link dialog */

function LinkDialog({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (name: string, url: string) => void;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    onSave(name, url);
    onClose();
  };

  return (
    <Modal open onClose={onClose} label="Add a link">
      <form className="task-reply-dialog" onSubmit={submit}>
        <h2>Add a link</h2>
        <p>For what lives somewhere else: a filing portal, a shared drive, a registry entry.</p>
        <label>
          Address
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="registry.gov.gh/filings/12345"
            autoFocus
            required
          />
        </label>
        <label>
          What it is (optional)
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Registrar's filing receipt"
          />
        </label>
        <div className="task-reply-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={!url.trim()}>
            Add link
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* ----------------------------------------------------------------- section */

export default function Attachments({
  task,
  attach,
}: {
  task: Task;
  attach: ReturnType<typeof useTaskAttachments>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [picking, setPicking] = useState(false);
  const [linking, setLinking] = useState(false);
  const { confirmDelete, confirmDialog } = useConfirmDelete();

  const total = task.attachments.reduce((sum, a) => sum + a.bytes, 0);
  const taken = new Set(task.attachments.map((a) => a.documentId).filter(Boolean) as string[]);

  const removeOne = async (id: string, name: string, kind: Attachment["kind"]) => {
    if (
      await confirmDelete({
        what: name,
        archivable: false,
        consequence:
          kind === "document"
            ? "The document stays in the matter; only the link from this task goes."
            : kind === "link"
              ? "The address goes from this task. Nothing else changes."
              : "The uploaded file goes from this task.",
      })
    )
      attach.remove(id);
  };

  return (
    <section className="task-attachments">
      <h3>
        Attachments
        {task.attachments.length > 0 && (
          <span className="task-detail-count">
            {task.attachments.length} {task.attachments.length === 1 ? "item" : "items"}
            {total > 0 ? ` · ${fmtBytes(total)}` : ""}
          </span>
        )}
      </h3>

      {task.attachments.length > 0 && (
        <div className="task-attachment-list">
          {task.attachments.map((a) => (
            <AttachmentChip
              key={a.id}
              attachment={a}
              onRemove={() => void removeOne(a.id, a.name, a.kind)}
            />
          ))}
        </div>
      )}

      {attach.problem && (
        <p className="task-reply-problem" role="alert">
          {attach.problem}
        </p>
      )}

      <div className="task-correspondence-actions">
        <button type="button" disabled={attach.busy} onClick={() => input.current?.click()}>
          {attach.busy ? "Attaching…" : "Attach files"}
        </button>
        {task.matterId && (
          <button type="button" onClick={() => setPicking(true)}>
            From this matter
          </button>
        )}
        <button type="button" onClick={() => setLinking(true)}>
          Add a link
        </button>
      </div>
      <p className="task-attachment-hint">Or drop them anywhere on this panel.</p>

      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          void attach.attachFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {confirmDialog}
      {picking && task.matterId && (
        <DocumentPicker
          matterId={task.matterId}
          matterName={task.matterName}
          taken={taken}
          onClose={() => setPicking(false)}
          onPick={attach.attachDocuments}
        />
      )}
      {linking && <LinkDialog onClose={() => setLinking(false)} onSave={attach.attachLink} />}
    </section>
  );
}
