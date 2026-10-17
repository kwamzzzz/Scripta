/**
 * Handover: write the note you send when you hand work to someone else, the
 * way you would write the email itself, and let Scripta do the tedious parts.
 *
 * On the left, your handovers. On the right, one of them as an email: To, Cc,
 * Subject, a body with headings, lists and ruled tables, and the files that go
 * with it. "Insert tasks" puts chosen tasks into the note's tasks table.
 *
 * Scripta sends nothing. "Open in email" hands your mail client an unsent
 * message with everything in place; "Copy" puts the formatted note on the
 * clipboard; "Word" exports it, on the firm's letterhead if you choose one.
 * Everything saves as you type, and only you can see your handovers.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import type { JSONContent } from "@tiptap/core";
import {
  Bold,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Paperclip,
  Table as TableIcon,
  Underline,
  X,
} from "lucide-react";
import { Button } from "@/components/primitives";
import ActionMenu from "@/components/ActionMenu";
import ActionError, { attempt } from "@/components/ActionError";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import { Modal } from "@/wireframe/screens";
import { useAuth } from "@/lib/auth";
import { downloadFile, loadFileBytes, putFile } from "@/lib/files";
import { MAX_ATTACHMENT_BYTES, fmtBytes } from "@/lib/correspondence";
import { downloadBytes, DOCX_MIME } from "@/lib/export/download";
import { listLetterheads } from "@/lib/letterheads";
import { exportHandover } from "@/lib/handover-export.functions";
import { listTasks } from "@/lib/tasks/data";
import { STATUS_LABEL, type Task } from "@/lib/tasks/model";
import { usePersisted } from "@/lib/use-board";
import {
  addTaskRows,
  buildEml,
  createHandover,
  deleteHandover,
  emailHtml,
  handoversKey,
  listHandovers,
  saveHandover,
  setHandoverArchived,
  setHandoverSent,
  type Handover,
  type HandoverAttachment,
  type HandoverPatch,
} from "@/lib/handover";
import type { ClauseDoc } from "@/wireframe/clause-doc";
import "./handover.css";

type Shelf = "drafts" | "sent" | "archived";

const EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    codeBlock: false,
    link: { openOnClick: false, autolink: true },
  }),
  TableKit.configure({ table: { resizable: false } }),
  Placeholder.configure({ placeholder: "Write the handover…" }),
];

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const shortDate = (iso: string | null) =>
  iso
    ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
    : "";

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "handover";

const decode = (base64: string) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

export default function HandoverDesk({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const key = handoversKey(workspaceId);
  const list = useQuery({
    queryKey: key,
    retry: false,
    queryFn: () => listHandovers(workspaceId),
  });
  const [openId, setOpenId] = usePersisted<string | null>("px.handover.open", null);
  const [shelf, setShelf] = useState<Shelf>("drafts");
  const [error, setError] = useState<string | null>(null);

  const all = list.data ?? [];
  const onShelf = (h: Handover): Shelf =>
    h.archivedAt ? "archived" : h.status === "sent" ? "sent" : "drafts";
  const shown = all.filter((h) => onShelf(h) === shelf);
  const open = all.find((h) => h.id === openId) ?? null;

  const create = useMutation({
    mutationFn: () => createHandover(workspaceId, "Handover"),
    onSuccess: async (id) => {
      await qc.invalidateQueries({ queryKey: key });
      setShelf("drafts");
      setOpenId(id);
    },
    onError: (e) => setError((e as Error).message),
  });

  return (
    <div className="ho">
      <aside className="ho-rail">
        <Button variant="primary" onClick={() => create.mutate()} disabled={create.isPending}>
          {create.isPending ? "Starting…" : "New handover"}
        </Button>
        <div className="ho-shelves" role="group" aria-label="Show handovers">
          {(["drafts", "sent", "archived"] as Shelf[]).map((s) => (
            <button key={s} type="button" aria-pressed={shelf === s} onClick={() => setShelf(s)}>
              {s === "drafts" ? "Drafts" : s === "sent" ? "Sent" : "Archived"}
              <span>{all.filter((h) => onShelf(h) === s).length}</span>
            </button>
          ))}
        </div>
        {list.isError && <p className="org-error">{(list.error as Error).message}</p>}
        <ul className="ho-list">
          {shown.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                aria-current={h.id === openId ? "true" : undefined}
                onClick={() => setOpenId(h.id)}
              >
                <strong>{h.subject.trim() || "Untitled handover"}</strong>
                <span>{h.to.trim() || "No recipients yet"}</span>
                <span>
                  {h.status === "sent" && h.sentAt ? `Sent ${when(h.sentAt)}` : when(h.updatedAt)}
                  {h.attachments.length ? ` · ${h.attachments.length} attached` : ""}
                </span>
              </button>
            </li>
          ))}
          {list.isSuccess && shown.length === 0 && (
            <li className="ho-none">
              {shelf === "drafts"
                ? "No drafts."
                : shelf === "sent"
                  ? "Nothing sent."
                  : "Nothing archived."}
            </li>
          )}
        </ul>
      </aside>
      <section className="ho-main">
        <ActionError error={error} onDismiss={() => setError(null)} />
        {open ? (
          <Composer
            key={open.id}
            workspaceId={workspaceId}
            handover={open}
            onChanged={() => qc.invalidateQueries({ queryKey: key })}
            onGone={() => setOpenId(null)}
            onError={setError}
          />
        ) : (
          <div className="ho-empty">
            <strong>Write a handover</strong>
            <p>
              Set out the matters, tasks, dates and contacts someone needs to pick your work up,
              attach the documents, then open it in your email to send.
            </p>
            <Button variant="primary" onClick={() => create.mutate()} disabled={create.isPending}>
              New handover
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------ composer */

function Composer({
  workspaceId,
  handover,
  onChanged,
  onGone,
  onError,
}: {
  workspaceId: string;
  handover: Handover;
  onChanged: () => void;
  onGone: () => void;
  onError: (message: string | null) => void;
}) {
  const { user, profile } = useAuth();
  const { confirmDelete, confirmDialog } = useConfirmDelete();
  const [to, setTo] = useState(handover.to);
  const [cc, setCc] = useState(handover.cc);
  const [showCc, setShowCc] = useState(!!handover.cc);
  const [subject, setSubject] = useState(handover.subject);
  const [attachments, setAttachments] = useState(handover.attachments);
  const [saving, setSaving] = useState<"idle" | "pending" | "saved">("idle");
  const [busy, setBusy] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const pending = useRef<HandoverPatch>({});
  const timer = useRef<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const sent = handover.status === "sent";

  const flush = async () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    const patch = pending.current;
    pending.current = {};
    if (!Object.keys(patch).length) return;
    const ok = await attempt(
      "The handover could not be saved",
      () => saveHandover(handover.id, patch),
      onError,
    );
    setSaving(ok ? "saved" : "idle");
    if (ok) onChanged();
  };
  // Typing is not a save; a pause is.
  const queue = (patch: HandoverPatch) => {
    pending.current = { ...pending.current, ...patch };
    setSaving("pending");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), 700);
  };
  // Leaving the handover saves what was typed last.
  useEffect(
    () => () => {
      void flush();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const editor = useEditor({
    extensions: EXTENSIONS,
    immediatelyRender: false,
    content: (handover.body ?? { type: "doc", content: [{ type: "paragraph" }] }) as JSONContent,
    editorProps: { attributes: { class: "ho-body", "aria-label": "Handover" } },
    onUpdate: ({ editor: e }) => queue({ body: e.getJSON() as ClauseDoc }),
  });

  const saveAttachments = (next: HandoverAttachment[]) => {
    setAttachments(next);
    queue({ attachments: next });
  };

  const attach = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy("attach");
    const added: HandoverAttachment[] = [];
    try {
      for (const file of Array.from(files)) {
        if (file.size > MAX_ATTACHMENT_BYTES) {
          onError(`${file.name} is over ${fmtBytes(MAX_ATTACHMENT_BYTES)} and was not attached.`);
          continue;
        }
        const id = crypto.randomUUID();
        const fileRef = await putFile(id, file, file.name, {
          workspaceId,
          userId: user?.id ?? null,
        });
        added.push({
          id,
          name: file.name,
          fileRef,
          bytes: file.size,
          mime: file.type || "application/octet-stream",
        });
      }
    } catch (e) {
      onError((e as Error).message);
    } finally {
      if (added.length) saveAttachments([...attachments, ...added]);
      setBusy(null);
    }
  };

  const openInEmail = async () => {
    if (!editor) return;
    setBusy("email");
    await flush();
    await attempt(
      "The email could not be prepared",
      async () => {
        const files = await Promise.all(
          attachments.map(async (a) => ({
            name: a.name,
            mime: a.mime,
            bytes: new Uint8Array(await loadFileBytes(a.fileRef)),
          })),
        );
        const eml = buildEml({
          to,
          cc,
          subject,
          html: emailHtml(editor.getHTML()),
          plain: editor.getText({ blockSeparator: "\n\n" }),
          attachments: files,
        });
        downloadBytes(new TextEncoder().encode(eml), `${slug(subject)}.eml`, "message/rfc822");
      },
      onError,
    );
    setBusy(null);
  };

  const copy = async () => {
    if (!editor) return;
    const ok = await attempt(
      "The handover could not be copied",
      () =>
        navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([emailHtml(editor.getHTML())], { type: "text/html" }),
            "text/plain": new Blob([editor.getText({ blockSeparator: "\n\n" })], {
              type: "text/plain",
            }),
          }),
        ]),
      onError,
    );
    if (ok) {
      setBusy("copied");
      window.setTimeout(() => setBusy((b) => (b === "copied" ? null : b)), 1800);
    }
  };

  const exportWord = async (letterheadId: string | null) => {
    setBusy("word");
    await flush();
    await attempt(
      "The Word document could not be made",
      async () => {
        const result = await exportHandover({
          data: { workspaceId, handoverId: handover.id, letterheadId },
        });
        downloadBytes(decode(result.base64), result.filename, result.mime || DOCX_MIME);
      },
      onError,
    );
    setBusy(null);
  };

  const markSent = async (on: boolean) => {
    await flush();
    const ok = await attempt(
      on ? "The handover could not be marked as sent" : "The handover could not be reopened",
      () => setHandoverSent(handover.id, on),
      onError,
    );
    if (ok) onChanged();
  };

  const archive = async (on: boolean) => {
    await flush();
    const ok = await attempt(
      on ? "The handover could not be archived" : "The handover could not be restored",
      () => setHandoverArchived(handover.id, on),
      onError,
    );
    if (ok) onChanged();
  };

  const remove = async () => {
    const yes = await confirmDelete({
      what: `the handover “${subject.trim() || "Untitled handover"}”`,
      binned: false,
      ...(attachments.length
        ? { consequence: "Its attachments are removed from it; copies you sent are unaffected." }
        : {}),
    });
    if (!yes) return;
    pending.current = {};
    const ok = await attempt(
      "The handover could not be deleted",
      () => deleteHandover(handover.id),
      onError,
    );
    if (ok) {
      onGone();
      onChanged();
    }
  };

  const from = profile?.full_name
    ? `${profile.full_name}${profile.email ? ` <${profile.email}>` : ""}`
    : (profile?.email ?? "You");

  return (
    <div className="ho-mail">
      <header className="ho-actions">
        <span className={`ho-state${sent ? " is-sent" : ""}`}>
          {sent && handover.sentAt
            ? `Sent ${when(handover.sentAt)}`
            : saving === "pending"
              ? "Saving…"
              : saving === "saved"
                ? "Saved"
                : "Draft"}
        </span>
        <span className="ho-spacer" />
        <Button variant="primary" onClick={() => void openInEmail()} disabled={busy === "email"}>
          {busy === "email" ? "Preparing…" : "Open in email"}
        </Button>
        <Button onClick={() => void copy()}>{busy === "copied" ? "Copied" : "Copy"}</Button>
        <WordMenu workspaceId={workspaceId} busy={busy === "word"} onExport={exportWord} />
        <ActionMenu
          label="handover"
          actions={[
            sent
              ? { label: "Back to draft", onClick: () => void markSent(false) }
              : { label: "Mark as sent", onClick: () => void markSent(true) },
            handover.archivedAt
              ? { label: "Restore", onClick: () => void archive(false) }
              : { label: "Archive", onClick: () => void archive(true) },
            { label: "Delete", danger: true, onClick: () => void remove() },
          ]}
        />
      </header>

      <div className="ho-fields">
        <label>
          <span>From</span>
          <input value={from} readOnly tabIndex={-1} />
        </label>
        <label>
          <span>To</span>
          <input
            value={to}
            placeholder="Who is picking the work up"
            onChange={(e) => {
              setTo(e.target.value);
              queue({ to: e.target.value });
            }}
          />
          {!showCc && (
            <button type="button" className="ho-link" onClick={() => setShowCc(true)}>
              Cc
            </button>
          )}
        </label>
        {showCc && (
          <label>
            <span>Cc</span>
            <input
              value={cc}
              autoFocus={!cc}
              onChange={(e) => {
                setCc(e.target.value);
                queue({ cc: e.target.value });
              }}
            />
          </label>
        )}
        <label>
          <span>Subject</span>
          <input
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);
              queue({ subject: e.target.value });
            }}
          />
        </label>
      </div>

      <Toolbar
        editor={editor}
        onInsertTasks={() => setPicking(true)}
        onAttach={() => fileInput.current?.click()}
      />
      <EditorContent editor={editor} className="ho-editor" />

      <div
        className="ho-files"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void attach(e.dataTransfer.files);
        }}
      >
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            void attach(e.target.files);
            e.target.value = "";
          }}
        />
        {attachments.map((a) => (
          <span key={a.id} className="ho-file">
            <button type="button" onClick={() => void downloadFile(a.fileRef, a.name)}>
              <Paperclip size={13} aria-hidden="true" />
              {a.name}
              <em>{fmtBytes(a.bytes)}</em>
            </button>
            <button
              type="button"
              aria-label={`Remove ${a.name}`}
              onClick={() => saveAttachments(attachments.filter((x) => x.id !== a.id))}
            >
              <X size={13} aria-hidden="true" />
            </button>
          </span>
        ))}
        <button type="button" className="ho-drop" onClick={() => fileInput.current?.click()}>
          {busy === "attach" ? "Attaching…" : "Attach files, or drop them here"}
        </button>
      </div>

      {picking && editor && (
        <TaskPicker
          workspaceId={workspaceId}
          onClose={() => setPicking(false)}
          onPick={(tasks) => {
            const rows = tasks.map((t) => [
              t.title,
              [t.clientName, t.matterName].filter(Boolean).join(" / "),
              STATUS_LABEL[t.status],
              shortDate(t.dueDate),
              "",
            ]);
            editor.commands.setContent(
              addTaskRows(editor.getJSON() as ClauseDoc, rows) as JSONContent,
              { emitUpdate: true },
            );
            setPicking(false);
          }}
        />
      )}
      {confirmDialog}
    </div>
  );
}

/* ------------------------------------------------------------- toolbar */

function Tool({
  label,
  on,
  disabled,
  onClick,
  children,
}: {
  label: string;
  on?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={on}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Toolbar({
  editor,
  onInsertTasks,
  onAttach,
}: {
  editor: Editor | null;
  onInsertTasks: () => void;
  onAttach: () => void;
}) {
  // Re-render as the selection moves, so buttons show what the cursor is in.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const bump = () => tick((n) => n + 1);
    editor.on("selectionUpdate", bump);
    editor.on("transaction", bump);
    return () => {
      editor.off("selectionUpdate", bump);
      editor.off("transaction", bump);
    };
  }, [editor]);
  if (!editor) return <div className="ho-toolbar" />;
  const c = () => editor.chain().focus();
  const inTable = editor.isActive("table");
  return (
    <div className="ho-toolbar" role="toolbar" aria-label="Formatting">
      <Tool label="Bold" on={editor.isActive("bold")} onClick={() => c().toggleBold().run()}>
        <Bold size={15} />
      </Tool>
      <Tool label="Italic" on={editor.isActive("italic")} onClick={() => c().toggleItalic().run()}>
        <Italic size={15} />
      </Tool>
      <Tool
        label="Underline"
        on={editor.isActive("underline")}
        onClick={() => c().toggleUnderline().run()}
      >
        <Underline size={15} />
      </Tool>
      <span className="ho-sep" />
      <Tool
        label="Heading"
        on={editor.isActive("heading", { level: 2 })}
        onClick={() => c().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 size={15} />
      </Tool>
      <Tool
        label="Bulleted list"
        on={editor.isActive("bulletList")}
        onClick={() => c().toggleBulletList().run()}
      >
        <List size={15} />
      </Tool>
      <Tool
        label="Numbered list"
        on={editor.isActive("orderedList")}
        onClick={() => c().toggleOrderedList().run()}
      >
        <ListOrdered size={15} />
      </Tool>
      <span className="ho-sep" />
      <Tool
        label="Insert table"
        onClick={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
      >
        <TableIcon size={15} />
      </Tool>
      {inTable && (
        <span className="ho-table-tools">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => c().addRowAfter().run()}
          >
            + Row
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => c().addColumnAfter().run()}
          >
            + Column
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => c().deleteRow().run()}
          >
            − Row
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => c().deleteColumn().run()}
          >
            − Column
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => c().deleteTable().run()}
          >
            Remove table
          </button>
        </span>
      )}
      <span className="ho-spacer" />
      <button type="button" className="ho-tool-text" onClick={onInsertTasks}>
        Insert tasks…
      </button>
      <button type="button" className="ho-tool-text" onClick={onAttach}>
        <Paperclip size={14} aria-hidden="true" /> Attach
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------- word */

function WordMenu({
  workspaceId,
  busy,
  onExport,
}: {
  workspaceId: string;
  busy: boolean;
  onExport: (letterheadId: string | null) => void;
}) {
  const letterheads = useQuery({
    queryKey: ["letterheads", workspaceId],
    queryFn: () => listLetterheads(workspaceId),
  });
  const papers = letterheads.data ?? [];
  return (
    <ActionMenu
      label="Word export"
      trigger={
        <button type="button" className="ho-word" disabled={busy}>
          {busy ? "Exporting…" : "Word ▾"}
        </button>
      }
      actions={[
        ...papers
          .slice()
          .sort((a, b) => Number(b.isDefault) - Number(a.isDefault))
          .map((p) => ({
            label: `On ${p.name}${p.isDefault ? " (default)" : ""}`,
            onClick: () => onExport(p.id),
          })),
        { label: "Plain, no letterhead", onClick: () => onExport(null) },
      ]}
    />
  );
}

/* --------------------------------------------------------- task picker */

function TaskPicker({
  workspaceId,
  onPick,
  onClose,
}: {
  workspaceId: string;
  onPick: (tasks: Task[]) => void;
  onClose: () => void;
}) {
  const tasks = useQuery({
    queryKey: ["tasks", workspaceId],
    retry: false,
    queryFn: () => listTasks(workspaceId),
  });
  const [term, setTerm] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [showDone, setShowDone] = useState(false);
  const rows = useMemo(() => {
    const words = term.trim().toLowerCase();
    return (tasks.data ?? [])
      .filter((t) => showDone || t.status !== "Done")
      .filter(
        (t) => !words || `${t.title} ${t.clientName} ${t.matterName}`.toLowerCase().includes(words),
      );
  }, [tasks.data, term, showDone]);
  const all = rows.length > 0 && rows.every((t) => chosen.includes(t.id));
  return (
    <Modal open onClose={onClose} label="Insert tasks">
      <div className="ho-picker">
        <h2>Insert tasks</h2>
        <p>
          Chosen tasks go into the note’s tasks table, with their client or matter, status and due
          date.
        </p>
        <div className="ho-picker-bar">
          <input
            type="search"
            value={term}
            placeholder="Search tasks, clients or matters"
            aria-label="Search tasks"
            autoFocus
            onChange={(e) => setTerm(e.target.value)}
          />
          <label>
            <input
              type="checkbox"
              checked={showDone}
              onChange={(e) => setShowDone(e.target.checked)}
            />
            Include completed
          </label>
        </div>
        <label className="ho-picker-all">
          <input
            type="checkbox"
            checked={all}
            onChange={() =>
              setChosen(
                all
                  ? chosen.filter((id) => !rows.some((t) => t.id === id))
                  : [...new Set([...chosen, ...rows.map((t) => t.id)])],
              )
            }
          />
          Select all shown
        </label>
        <ul className="ho-picker-list">
          {rows.map((t) => (
            <li key={t.id}>
              <label>
                <input
                  type="checkbox"
                  checked={chosen.includes(t.id)}
                  onChange={() =>
                    setChosen((c) =>
                      c.includes(t.id) ? c.filter((x) => x !== t.id) : [...c, t.id],
                    )
                  }
                />
                <span>
                  <strong>{t.title}</strong>
                  <em>
                    {[
                      t.clientName || t.matterName,
                      STATUS_LABEL[t.status],
                      t.dueDate ? `Due ${shortDate(t.dueDate)}` : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </em>
                </span>
              </label>
            </li>
          ))}
          {tasks.isSuccess && rows.length === 0 && <li className="ho-none">No tasks match.</li>}
        </ul>
        <footer>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!chosen.length}
            onClick={() => onPick((tasks.data ?? []).filter((t) => chosen.includes(t.id)))}
          >
            {chosen.length
              ? `Insert ${chosen.length} task${chosen.length === 1 ? "" : "s"}`
              : "Insert"}
          </Button>
        </footer>
      </div>
    </Modal>
  );
}
