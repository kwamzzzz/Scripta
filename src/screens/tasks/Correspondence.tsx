/**
 * A task's correspondence: the email being settled, and the replies that came
 * back.
 *
 * The same two ideas Flow proved on email deliverables, on a task. There is no
 * send, here or anywhere — Scripta settles the wording and the firm's own mail
 * client sends it — and a reply is pasted in exactly as received, so what was
 * actually said is on the task rather than in one person's inbox.
 *
 * It sits inside the detail panel, which is narrow, so the compose fields stack
 * rather than sitting in a two-column header the way Flow's wide workspace can
 * afford. The section is not drawn at all until there is something in it: a
 * task that never involved an email should not carry an empty mailbox.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Mail, Paperclip } from "lucide-react";
import { Button } from "@/components/primitives";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import { Modal } from "@/wireframe/screens";
import { putFile, type FileHome } from "@/lib/files";
import { useApp } from "@/store/app";
import { useAuth } from "@/lib/auth";
import {
  MAX_ATTACHMENT_BYTES,
  searchableText,
  sortThreads,
  threadWhen,
  type Attachment,
  type EmailDraft,
  type ThreadAttachment,
  type ThreadEntry,
} from "@/lib/correspondence";
import { AttachmentChip, uploadAttachments } from "./Attachments";
import type { Task } from "@/lib/tasks/model";
import type { TaskPatch } from "@/lib/tasks/data";

const uid = () => globalThis.crypto?.randomUUID?.() ?? String(Math.random());

const fmtWhen = (iso: string) => {
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

/* --------------------------------------------------------------- draft */

function Compose({
  task,
  fileHome,
  onPatch,
  onDiscard,
  onSent,
}: {
  task: Task;
  fileHome: FileHome;
  onPatch: (patch: TaskPatch) => void;
  onDiscard: () => void;
  /** The draft leaves for the mail client and joins the thread behind it. */
  onSent: (message: { subject: string; body: string; attachments: Attachment[] }) => void;
}) {
  const draft = task.emailDraft;
  const [to, setTo] = useState(draft?.to ?? "");
  const [subject, setSubject] = useState(draft?.subject ?? task.title);
  const [body, setBody] = useState(draft?.body ?? "");
  const [saved, setSaved] = useState(!!draft);
  // What goes out with it. An attachment is not typing, so it is written the
  // moment it is added rather than waiting for the pause the words wait for.
  const [attachments, setAttachments] = useState<Attachment[]>(draft?.attachments ?? []);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const files = useRef<HTMLInputElement>(null);
  const save = useRef(onPatch);
  save.current = onPatch;
  // The words as last typed, so an attachment saved now does not overwrite
  // them with what was stored before the current keystrokes.
  const words = useRef({ to, subject, body });
  words.current = { to, subject, body };

  const writeDraft = (next: Attachment[]) => {
    setAttachments(next);
    save.current({
      emailDraft: { ...words.current, attachments: next, updatedAt: new Date().toISOString() },
    });
  };

  const attachFiles = async (chosen: FileList | null) => {
    if (![...(chosen ?? [])].length) return;
    setBusy(true);
    const { added, problem: trouble } = await uploadAttachments(chosen, fileHome);
    setProblem(trouble);
    if (added.length) writeDraft([...attachments, ...added]);
    setBusy(false);
  };

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
      save.current({
        emailDraft: { to, subject, body, attachments, updatedAt: new Date().toISOString() },
      });
      setSaved(true);
    }, 600);
    return () => window.clearTimeout(timer);
    // The stored draft is the baseline, not a trigger: reacting to it would
    // save again the moment a save lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, subject, body, task.id]);

  return (
    <div className="task-compose">
      <div className="task-compose-head">
        <Mail size={13} strokeWidth={2} aria-hidden="true" />
        <strong>Draft</strong>
        <span className="task-compose-state">{saved ? "Saved" : "Saving…"}</span>
      </div>
      <label className="task-compose-row">
        <span>To</span>
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="name@firm.com"
          autoComplete="off"
        />
      </label>
      <label className="task-compose-row">
        <span>Subject</span>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} />
      </label>
      <textarea
        className="task-compose-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        aria-label="Body"
        placeholder="Write the email."
      />
      {attachments.length > 0 && (
        <div className="task-reply-attachments">
          {attachments.map((a) => (
            <AttachmentChip
              key={a.id}
              attachment={a}
              onRemove={() => writeDraft(attachments.filter((x) => x.id !== a.id))}
            />
          ))}
        </div>
      )}
      {problem && (
        <p className="task-reply-problem" role="alert">
          {problem}
        </p>
      )}
      <div className="task-compose-attach">
        <button type="button" disabled={busy} onClick={() => files.current?.click()}>
          <Paperclip size={12} strokeWidth={2} aria-hidden="true" />
          {busy ? "Attaching…" : "Attach files"}
        </button>
        <input
          ref={files}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            void attachFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      <p className="task-compose-note">
        Scripta does not send. Copy this into your mail client, then mark it sent so it joins the
        thread and the box is clear for the next one. What is attached here goes with it, by hand.
        <button type="button" onClick={onDiscard}>
          Discard draft
        </button>
      </p>
      <div className="task-compose-send">
        <Button
          variant="primary"
          disabled={!body.trim()}
          onClick={() => onSent({ subject, body, attachments })}
        >
          Mark as sent
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- replies */

type ReplyInput = {
  author: string;
  receivedAt: string;
  text: string;
  mine: boolean;
  files: File[];
};

function ReplyDialog({
  open,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  initial?: ThreadEntry | undefined;
  onClose: () => void;
  onSave: (input: ReplyInput) => void;
}) {
  const [author, setAuthor] = useState(initial?.author ?? "");
  const [receivedAt, setReceivedAt] = useState(initial?.receivedAt ?? "");
  const [text, setText] = useState(initial?.text ?? "");
  const [mine, setMine] = useState(initial?.mine ?? false);
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
    if (!text.trim() || (!mine && !author.trim())) return;
    onSave({ author, receivedAt, text, mine, files });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} label={editing ? "Edit reply" : "Log a reply"}>
      <form className="task-reply-dialog" onSubmit={submit}>
        <h2>{editing ? "Edit message" : "Log a message"}</h2>
        <p>Paste it as it was written. The wording is kept exactly as given.</p>
        {/* Which way the message went. A thread is both sides of it, so the
            dialog has to be able to record your own sent email as readily as
            the answer to it. */}
        <div className="task-reply-side" role="group" aria-label="Direction">
          <button type="button" aria-pressed={!mine} onClick={() => setMine(false)}>
            They wrote
          </button>
          <button type="button" aria-pressed={mine} onClick={() => setMine(true)}>
            I wrote
          </button>
        </div>
        {!mine && (
          <label>
            From
            <input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Kofi Mensah, WAGAS"
              autoFocus
              required
            />
          </label>
        )}
        <label>
          {mine ? "Sent (optional)" : "Received (optional)"}
          <input
            type="datetime-local"
            value={receivedAt}
            onChange={(e) => setReceivedAt(e.target.value)}
          />
        </label>
        <label>
          {mine ? "What you wrote" : "Reply"}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste the reply here."
            required
          />
        </label>
        {!editing && (
          <label>
            Anything that came with it (optional)
            <input type="file" multiple onChange={(e) => choose(e.target.files)} />
          </label>
        )}
        {files.length > 0 && (
          <p className="task-reply-files">{files.map((f) => f.name).join(" · ")}</p>
        )}
        {problem && (
          <p className="task-reply-problem" role="alert">
            {problem}
          </p>
        )}
        {editing && <p>Attachments are added and removed on the reply itself.</p>}
        <div className="task-reply-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            type="submit"
            disabled={!text.trim() || (!mine && !author.trim())}
          >
            {editing ? "Save message" : "Log message"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ReplyCard({
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
    <article className={`task-reply${entry.mine ? " is-mine" : ""}`}>
      <header>
        <strong>{entry.mine ? "You" : entry.author}</strong>
        <span className="task-reply-when">
          {entry.receivedAt ? fmtWhen(entry.receivedAt) : `Logged ${fmtWhen(entry.createdAt)}`}
        </span>
        <span className="task-reply-index">{entry.mine ? "Sent" : "Received"}</span>
      </header>
      {entry.subject && <div className="task-reply-subject">{entry.subject}</div>}
      <div className="task-reply-text">{entry.text}</div>
      {entry.attachments.length > 0 && (
        <div className="task-reply-attachments">
          {entry.attachments.map((a) => (
            <AttachmentChip key={a.id} attachment={a} onRemove={() => onRemoveAttachment(a.id)} />
          ))}
        </div>
      )}
      <footer>
        <button type="button" onClick={() => input.current?.click()}>
          Attach
        </button>
        <button type="button" onClick={onEdit}>
          Edit
        </button>
        <button type="button" className="is-danger" onClick={onRemove}>
          Delete
        </button>
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
      </footer>
    </article>
  );
}

/* --------------------------------------------------------------- section */

export default function Correspondence({
  task,
  onPatch,
}: {
  task: Task;
  onPatch: (patch: TaskPatch) => void;
}) {
  const [dialog, setDialog] = useState<{ entry: ThreadEntry | null } | null>(null);
  const [drafting, setDrafting] = useState(false);
  const { confirmDelete, confirmDialog } = useConfirmDelete();
  const { workspaceId } = useApp();
  const { user } = useAuth();
  // A task filed to a matter puts its attachments with that matter. A task
  // filed to nothing is personal, and its files go somewhere that can never be
  // mistaken for a matter when the bucket policy tightens.
  const fileHome = {
    workspaceId: workspaceId ?? "",
    matterId: task.matterId ?? null,
    userId: user?.id ?? null,
  };

  const entries = sortThreads(task.threads);
  const showDraft = drafting || !!task.emailDraft;
  const write = (threads: ThreadEntry[]) => onPatch({ threads });

  /** Files go to the matter's folder in the bucket; only their metadata is written on the task. */
  const storeFiles = async (entryId: string, files: FileList | File[] | null) => {
    const added: ThreadAttachment[] = [];
    for (const file of [...(files ?? [])]) {
      if (file.size > MAX_ATTACHMENT_BYTES) continue;
      const id = uid();
      const fileRef = await putFile(id, file, file.name, fileHome);
      added.push({
        id,
        name: file.name,
        fileRef,
        bytes: file.size,
        mime: file.type || "application/octet-stream",
      });
    }
    if (!added.length) return;
    write(
      task.threads.map((t) =>
        t.id === entryId ? { ...t, attachments: [...t.attachments, ...added] } : t,
      ),
    );
  };

  const saveEntry = async (input: ReplyInput, existing: ThreadEntry | null) => {
    // The folded copy is rebuilt whenever the words change, so a search never
    // reaches wording that is no longer there.
    if (existing) {
      write(
        task.threads.map((t) =>
          t.id === existing.id
            ? {
                ...t,
                author: input.mine ? "You" : input.author,
                mine: input.mine,
                text: input.text,
                searchText: searchableText(input.text),
                ...(input.receivedAt ? { receivedAt: input.receivedAt } : {}),
              }
            : t,
        ),
      );
      return;
    }
    const id = uid();
    const attachments: ThreadAttachment[] = [];
    for (const file of input.files) {
      if (file.size > MAX_ATTACHMENT_BYTES) continue;
      const attachmentId = uid();
      const fileRef = await putFile(attachmentId, file, file.name, fileHome);
      attachments.push({
        id: attachmentId,
        name: file.name,
        fileRef,
        bytes: file.size,
        mime: file.type || "application/octet-stream",
      });
    }
    write([
      ...task.threads,
      {
        id,
        author: input.mine ? "You" : input.author,
        ...(input.mine ? { mine: true } : {}),
        text: input.text,
        searchText: searchableText(input.text),
        ...(input.receivedAt ? { receivedAt: input.receivedAt } : {}),
        attachments,
        createdAt: new Date().toISOString(),
      },
    ]);
  };

  /**
   * The draft has gone out. It becomes your message in the thread, in order,
   * and the compose box empties for the next one — which is what makes a back
   * and forth possible rather than one email and a pile of replies.
   */
  const markSent = ({
    subject,
    body,
    attachments,
  }: {
    subject: string;
    body: string;
    attachments: Attachment[];
  }) => {
    if (!body.trim()) return;
    onPatch({
      emailDraft: null,
      threads: [
        ...task.threads,
        {
          id: uid(),
          author: "You",
          mine: true,
          ...(subject.trim() ? { subject: subject.trim() } : {}),
          text: body,
          searchText: searchableText(`${subject} ${body}`),
          // What was attached to the draft went out with it, so it travels
          // onto the message rather than being dropped at the moment of send.
          attachments,
          createdAt: new Date().toISOString(),
        },
      ],
    });
    setDrafting(false);
  };

  const removeEntry = async (entry: ThreadEntry) => {
    const attached = entry.attachments.length;
    if (
      await confirmDelete({
        what: entry.mine ? "the message you sent" : `the reply from ${entry.author}`,
        archivable: false,
        ...(attached
          ? {
              consequence: `${attached} attached file${attached === 1 ? "" : "s"} ${attached === 1 ? "goes" : "go"} too.`,
            }
          : {}),
      })
    )
      write(task.threads.filter((t) => t.id !== entry.id));
  };

  const discardDraft = async () => {
    if (
      await confirmDelete({
        what: "this email draft",
        archivable: false,
        consequence: "The wording written so far goes with it. Logged replies stay.",
      })
    ) {
      onPatch({ emailDraft: null });
      setDrafting(false);
    }
  };

  const last = entries.at(-1);

  return (
    <section className="task-correspondence">
      <h3>
        Correspondence
        {entries.length > 0 && (
          <span className="task-detail-count">
            {entries.length} {entries.length === 1 ? "message" : "messages"}
            {last ? ` · latest ${fmtWhen(threadWhen(last))}` : ""}
          </span>
        )}
      </h3>

      {showDraft ? (
        <Compose
          task={task}
          fileHome={fileHome}
          onPatch={onPatch}
          onDiscard={() => void discardDraft()}
          onSent={markSent}
        />
      ) : null}

      {entries.map((entry, i) => (
        <ReplyCard
          key={entry.id}
          entry={entry}
          index={i}
          onEdit={() => setDialog({ entry })}
          onRemove={() => void removeEntry(entry)}
          onAttach={(files) => void storeFiles(entry.id, files)}
          onRemoveAttachment={(attachmentId) =>
            write(
              task.threads.map((t) =>
                t.id === entry.id
                  ? { ...t, attachments: t.attachments.filter((a) => a.id !== attachmentId) }
                  : t,
              ),
            )
          }
        />
      ))}

      <div className="task-correspondence-actions">
        {!showDraft && (
          <button type="button" onClick={() => setDrafting(true)}>
            Draft an email
          </button>
        )}
        <button type="button" onClick={() => setDialog({ entry: null })}>
          Log a message
        </button>
      </div>

      {confirmDialog}
      {dialog && (
        <ReplyDialog
          key={dialog.entry?.id ?? "new"}
          open
          {...(dialog.entry ? { initial: dialog.entry } : {})}
          onClose={() => setDialog(null)}
          onSave={(input) => void saveEntry(input, dialog.entry)}
        />
      )}
    </section>
  );
}
