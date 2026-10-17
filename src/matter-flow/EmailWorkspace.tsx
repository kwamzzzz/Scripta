/**
 * An email deliverable, opened: the draft on top, the replies below.
 *
 * The draft is a compose window with only the fields that matter — to, subject,
 * body — and no way to send. Scripta settles the wording; the firm's own mail
 * client sends it.
 *
 * Threads underneath are a reference log, not an inbox. A reply is pasted in as
 * it was received, with whatever came attached to it, so the correspondence has
 * a home beside the deliverable it belongs to and can be found again by keyword
 * here and in Outlook.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Mail, Paperclip } from "lucide-react";
import { Button } from "@/components/primitives";
import { Modal } from "@/wireframe/screens";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import { downloadFile, putFile } from "@/lib/files";
import { useApp } from "@/store/app";
import { MAX_ATTACHMENT_BYTES, fmtBytes } from "@/lib/correspondence";
import {
  emailDraftFor,
  threadWhen,
  threadsFor,
  uid,
  type DerivedDeliverable,
  type MatterFlowRecord,
  type ThreadAttachment,
  type ThreadEntry,
} from "./model";
import type { MatterFlowStore } from "./store";
import { Eyebrow, FLOW, LinkAction, TypeChip, fmtWhen } from "./ui";
import "./matter-flow.css";

/* --------------------------------------------------------------- draft */

function Compose({
  deliverable,
  record,
  store,
}: {
  deliverable: DerivedDeliverable;
  record: MatterFlowRecord;
  store: MatterFlowStore;
}) {
  const draft = emailDraftFor(record, deliverable.id);
  const [to, setTo] = useState(draft?.to ?? "");
  const [subject, setSubject] = useState(draft?.subject ?? deliverable.name);
  const [body, setBody] = useState(draft?.body ?? "");
  const [saved, setSaved] = useState(!!draft);
  const save = useRef(store.saveEmailDraft);
  save.current = store.saveEmailDraft;

  // Typing is not a save; a pause is. The draft follows the writer without a
  // button, and without writing on every keystroke.
  useEffect(() => {
    if (
      to === (draft?.to ?? "") &&
      subject === (draft?.subject ?? "") &&
      body === (draft?.body ?? "")
    )
      return;
    setSaved(false);
    const timer = window.setTimeout(() => {
      save.current(deliverable.id, { to, subject, body });
      setSaved(true);
    }, 600);
    return () => window.clearTimeout(timer);
    // The stored draft is the baseline, not a trigger: reacting to it would
    // save again the moment a save lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, subject, body, deliverable.id]);

  return (
    <section className="mf-compose" aria-label="Email draft">
      <header className="mf-compose-head">
        <Mail size={13} strokeWidth={2} />
        <span style={{ fontWeight: 600 }}>Draft</span>
        <span style={{ color: FLOW.muted, fontSize: 11.5 }}>
          Scripta does not send. Copy this into the mail client when it is ready.
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ color: saved ? FLOW.muted : FLOW.orange, fontSize: 11.5 }}>
          {saved ? "Saved" : "Saving…"}
        </span>
      </header>
      <label className="mf-compose-row">
        <span>To</span>
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="name@firm.com"
          autoComplete="off"
        />
      </label>
      <label className="mf-compose-row">
        <span>Subject</span>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} />
      </label>
      <textarea
        className="mf-compose-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        aria-label="Body"
        placeholder="Write the email."
      />
    </section>
  );
}

/* -------------------------------------------------------------- thread */

type ThreadInput = { author: string; receivedAt: string; text: string; files: File[] };

function ThreadDialog({
  open,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  initial?: ThreadEntry | undefined;
  onClose: () => void;
  onSave: (input: ThreadInput) => void;
}) {
  const [author, setAuthor] = useState(initial?.author ?? "");
  const [receivedAt, setReceivedAt] = useState(initial?.receivedAt ?? "");
  const [text, setText] = useState(initial?.text ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const editing = !!initial;

  const choose = (chosen: FileList | null) => {
    const list = [...(chosen ?? [])];
    const tooBig = list.find((f) => f.size > MAX_ATTACHMENT_BYTES);
    setProblem(tooBig ? `${tooBig.name} is larger than 25 MB.` : null);
    setFiles(list.filter((f) => f.size <= MAX_ATTACHMENT_BYTES));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!author.trim() || !text.trim()) return;
    onSave({ author, receivedAt, text, files });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} label={editing ? "Edit reply" : "Log a reply"}>
      <form className="mf-dialog" onSubmit={submit} style={{ width: 560 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>
          {editing ? "Edit reply" : "Log a reply"}
        </div>
        <div style={{ color: FLOW.grey, fontSize: 12.5, lineHeight: 1.5 }}>
          Paste the reply as it was received. Its wording is kept exactly as given.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: 10 }}>
          <label className="mf-field">
            From
            <input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Kofi Mensah, WAGAS"
              autoFocus
              required
            />
          </label>
          <label className="mf-field">
            Received (optional)
            <input
              type="datetime-local"
              value={receivedAt}
              onChange={(e) => setReceivedAt(e.target.value)}
            />
          </label>
        </div>
        <label className="mf-field">
          Reply
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            style={{ minHeight: 150 }}
            placeholder="Paste the reply here."
            required
          />
        </label>
        {!editing && (
          <label className="mf-field">
            Anything that came with it (optional)
            <input type="file" multiple onChange={(e) => choose(e.target.files)} />
          </label>
        )}
        {files.length > 0 && (
          <div style={{ color: FLOW.grey, fontSize: 11.5 }}>
            {files.map((f) => f.name).join(" · ")}
          </div>
        )}
        {problem && <div className="mf-preset-error">{problem}</div>}
        {editing && (
          <div style={{ color: FLOW.muted, fontSize: 11.5 }}>
            Attachments are added and removed on the reply itself.
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <div style={{ flex: 1 }} />
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={!author.trim() || !text.trim()}>
            {editing ? "Save reply" : "Log reply"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: ThreadAttachment;
  onRemove: () => void;
}) {
  return (
    <span className="mf-thread-file">
      <Paperclip size={10} strokeWidth={2} />
      <button
        type="button"
        onClick={() => void downloadFile(attachment.fileRef, attachment.name)}
        title={`Download ${attachment.name}`}
      >
        {attachment.name}
      </button>
      <span style={{ color: FLOW.muted }}>{fmtBytes(attachment.bytes)}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Delete ${attachment.name}`}
        title="Delete"
        style={{ color: FLOW.muted }}
      >
        ×
      </button>
    </span>
  );
}

function ThreadCard({
  entry,
  index,
  onEdit,
  onRemove,
  onAttach,
  onRemoveAttachment,
}: {
  entry: ThreadEntry;
  index: number;
  onEdit: () => void;
  onRemove: () => void;
  onAttach: (files: FileList | null) => void;
  onRemoveAttachment: (attachmentId: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <article className="mf-thread">
      <header className="mf-thread-head">
        <Eyebrow>REPLY {index + 1}</Eyebrow>
        <span style={{ fontWeight: 600 }}>{entry.author}</span>
        {entry.receivedAt ? (
          <TypeChip>{fmtWhen(entry.receivedAt)}</TypeChip>
        ) : (
          <TypeChip>Logged {fmtWhen(entry.createdAt)}</TypeChip>
        )}
        <div style={{ flex: 1 }} />
        <LinkAction onClick={() => input.current?.click()} style={{ color: FLOW.muted }}>
          Attach
        </LinkAction>
        <LinkAction onClick={onEdit} style={{ color: FLOW.muted }}>
          Edit
        </LinkAction>
        <LinkAction onClick={onRemove} style={{ color: FLOW.red }}>
          Delete
        </LinkAction>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            onAttach(e.target.files);
            e.target.value = "";
          }}
        />
      </header>
      <div className="mf-thread-text">{entry.text}</div>
      {entry.attachments.length > 0 && (
        <div className="mf-thread-files">
          {entry.attachments.map((a) => (
            <AttachmentChip key={a.id} attachment={a} onRemove={() => onRemoveAttachment(a.id)} />
          ))}
        </div>
      )}
    </article>
  );
}

/* ----------------------------------------------------------- workspace */

export default function EmailWorkspace({
  deliverable,
  record,
  store,
  onBack,
}: {
  deliverable: DerivedDeliverable;
  record: MatterFlowRecord;
  store: MatterFlowStore;
  onBack: () => void;
}) {
  const [dialog, setDialog] = useState<{ entry: ThreadEntry | null } | null>(null);
  const { confirmDelete, confirmDialog } = useConfirmDelete();
  const { workspaceId } = useApp();
  // An email on a flow belongs to the flow's matter, so its attachments are
  // filed there rather than kept in whichever browser sent them.
  const fileHome = { workspaceId: workspaceId ?? "", matterId: record.matterId };

  const removeEntry = async (entry: ThreadEntry) => {
    const attached = entry.attachments.length;
    if (
      await confirmDelete({
        what: `the reply from ${entry.author}`,
        archivable: false,
        ...(attached
          ? {
              consequence: `${attached} attached file${attached === 1 ? "" : "s"} ${attached === 1 ? "goes" : "go"} too.`,
            }
          : {}),
      })
    )
      store.removeThreadEntry(entry.id);
  };
  const entries = threadsFor(record, deliverable.id);

  const storeFiles = async (threadId: string, files: FileList | File[] | null) => {
    for (const file of [...(files ?? [])]) {
      if (file.size > MAX_ATTACHMENT_BYTES) continue;
      const id = uid("att");
      const fileRef = await putFile(id, file, file.name, fileHome);
      store.addThreadAttachment(threadId, {
        id,
        name: file.name,
        fileRef,
        bytes: file.size,
        mime: file.type || "application/octet-stream",
      });
    }
  };

  const saveEntry = (input: ThreadInput, existing: ThreadEntry | null) => {
    if (existing) {
      store.updateThreadEntry(existing.id, {
        author: input.author,
        text: input.text,
        receivedAt: input.receivedAt,
      });
      return;
    }
    const id = store.addThreadEntry(deliverable.id, {
      author: input.author,
      text: input.text,
      ...(input.receivedAt ? { receivedAt: input.receivedAt } : {}),
    });
    if (input.files.length) void storeFiles(id, input.files);
  };

  const last = entries.at(-1);

  return (
    <div className="mf-body">
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <LinkAction onClick={onBack} style={{ color: FLOW.muted }}>
            ‹ Back to the checklist
          </LinkAction>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: "4px 0 0", lineHeight: 1.3 }}>
            {deliverable.name}
          </h1>
          <div style={{ color: FLOW.muted, fontSize: 12, marginTop: 2 }}>
            Email · drafted here, sent from your mail client
          </div>
        </div>
        <div style={{ flex: "none", textAlign: "right" }}>
          <Eyebrow color="#6b6b6b">
            {entries.length === 0
              ? "NO REPLIES LOGGED"
              : `${entries.length} REPL${entries.length === 1 ? "Y" : "IES"}`}
          </Eyebrow>
          {last && (
            <div style={{ color: FLOW.muted, fontSize: 11.5, marginTop: 4 }}>
              Latest {fmtWhen(threadWhen(last))}
            </div>
          )}
        </div>
      </div>

      <Compose deliverable={deliverable} record={record} store={store} />

      <section aria-label="Threads" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Threads</span>
          <Eyebrow color="#6b6b6b">REPLIES RECEIVED, KEPT AS SENT</Eyebrow>
          <div style={{ flex: 1 }} />
          <Button onClick={() => setDialog({ entry: null })}>Log a reply</Button>
        </div>

        {entries.length === 0 ? (
          <div className="mf-thread-empty">
            No replies logged yet. Paste one in when it arrives, with anything that came with it —
            it stays against this deliverable and its words stay searchable.
          </div>
        ) : (
          entries.map((entry, i) => (
            <ThreadCard
              key={entry.id}
              entry={entry}
              index={i}
              onEdit={() => setDialog({ entry })}
              onRemove={() => void removeEntry(entry)}
              onAttach={(files) => void storeFiles(entry.id, files)}
              onRemoveAttachment={(attachmentId) =>
                store.removeThreadAttachment(entry.id, attachmentId)
              }
            />
          ))
        )}
      </section>

      {confirmDialog}
      {dialog && (
        <ThreadDialog
          key={dialog.entry?.id ?? "new"}
          open
          {...(dialog.entry ? { initial: dialog.entry } : {})}
          onClose={() => setDialog(null)}
          onSave={(input) => saveEntry(input, dialog.entry)}
        />
      )}
    </div>
  );
}
