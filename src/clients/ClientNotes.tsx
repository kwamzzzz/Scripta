/**
 * A client's notes, on their own tab so they are easy to find and work with:
 * a partner's instructions, notes from a meeting, anything else worth keeping
 * to hand.
 *
 * Notes are cards in a grid that fills the page. A note is written and edited
 * in place (⌘Enter saves, Escape leaves it), put aside with Archive and brought
 * back with Restore, and deleted only after asking.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/primitives";
import ActionMenu from "@/components/ActionMenu";
import ActionError, { attempt } from "@/components/ActionError";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import {
  NOTE_KINDS,
  addClientNote,
  clientNotesKey,
  deleteClientNote,
  listClientNotes,
  noteKindLabel,
  setClientNoteArchived,
  updateClientNote,
  type ClientNote,
  type NoteDraft,
  type NoteKind,
} from "@/lib/client-notes";
import type { Client } from "@/lib/clients";

type Filter = "all" | NoteKind | "archived";

const today = () => new Date().toISOString().slice(0, 10);

const day = (iso: string | null) =>
  iso
    ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";

const stamp = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function ClientNotes({
  client,
  composing,
  onCompose,
  onComposed,
}: {
  client: Client;
  /** A new note is being written (from the header's New menu, or here). */
  composing: boolean;
  onCompose: () => void;
  onComposed: () => void;
}) {
  const qc = useQueryClient();
  const key = clientNotesKey(client.id);
  const notes = useQuery({
    queryKey: key,
    retry: false,
    queryFn: () => listClientNotes(client.id),
  });
  const [filter, setFilter] = useState<Filter>("all");
  const [term, setTerm] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { confirmDelete, confirmDialog } = useConfirmDelete();

  const all = notes.data ?? [];
  const live = all.filter((n) => !n.archivedAt);
  const count = (f: Filter) =>
    f === "all"
      ? live.length
      : f === "archived"
        ? all.length - live.length
        : live.filter((n) => n.kind === f).length;
  const shown = useMemo(() => {
    const words = term.trim().toLowerCase();
    return all
      .filter((n) =>
        filter === "archived"
          ? !!n.archivedAt
          : !n.archivedAt && (filter === "all" || n.kind === filter),
      )
      .filter((n) => !words || `${n.title} ${n.body}`.toLowerCase().includes(words));
  }, [all, filter, term]);

  const refresh = () => qc.invalidateQueries({ queryKey: key });

  const archive = async (note: ClientNote, archived: boolean) => {
    const ok = await attempt(
      archived ? "The note could not be archived" : "The note could not be restored",
      () => setClientNoteArchived(note.id, archived),
      setError,
    );
    if (ok) await refresh();
  };

  const remove = async (note: ClientNote) => {
    const yes = await confirmDelete({
      what: note.title ? `the note “${note.title}”` : "this note",
      binned: false,
    });
    if (!yes) return;
    const ok = await attempt(
      "The note could not be deleted",
      () => deleteClientNote(note.id),
      setError,
    );
    if (ok) await refresh();
  };

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    ...NOTE_KINDS.map((k) => ({ id: k.id as Filter, label: k.plural })),
    { id: "archived", label: "Archived" },
  ];

  return (
    <div className="cn">
      <ActionError error={error} onDismiss={() => setError(null)} />
      <div className="cn-bar">
        <div className="cn-filters" role="tablist" aria-label="Show notes">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              className={filter === f.id ? "is-on" : undefined}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
              <span>{count(f.id)}</span>
            </button>
          ))}
        </div>
        <input
          className="cn-search"
          type="search"
          value={term}
          placeholder="Search notes"
          aria-label="Search notes"
          onChange={(e) => setTerm(e.target.value)}
        />
        <Button variant="primary" onClick={onCompose}>
          New note
        </Button>
      </div>

      {notes.isError && (
        <p className="org-error" role="alert">
          {(notes.error as Error).message}
        </p>
      )}

      <div className="cn-grid">
        {composing && (
          <NoteEditor
            initial={{
              kind: filter === "meeting" || filter === "instruction" ? filter : "note",
              title: "",
              body: "",
              notedOn: today(),
            }}
            submit="Add note"
            onCancel={onComposed}
            onSave={async (draft) => {
              const ok = await attempt(
                "The note could not be added",
                () => addClientNote(client.workspaceId, client.id, draft),
                setError,
              );
              if (ok) {
                await refresh();
                onComposed();
              }
            }}
          />
        )}
        {shown.map((note) =>
          editing === note.id ? (
            <NoteEditor
              key={note.id}
              initial={{
                kind: note.kind,
                title: note.title,
                body: note.body,
                notedOn: note.notedOn,
              }}
              submit="Save"
              onCancel={() => setEditing(null)}
              onSave={async (draft) => {
                const ok = await attempt(
                  "The note could not be saved",
                  () => updateClientNote(note.id, draft),
                  setError,
                );
                if (ok) {
                  await refresh();
                  setEditing(null);
                }
              }}
            />
          ) : (
            <NoteCard
              key={note.id}
              note={note}
              onEdit={() => setEditing(note.id)}
              onArchive={(archived) => void archive(note, archived)}
              onDelete={() => void remove(note)}
            />
          ),
        )}
      </div>

      {!composing && notes.isSuccess && shown.length === 0 && (
        <div className="cn-empty">
          {all.length === 0 ? (
            <>
              <strong>No notes for {client.name} yet</strong>
              <p>
                Keep a partner’s instructions, what was said in a meeting, or anything you want to
                have to hand before picking the work up.
              </p>
              <Button variant="primary" onClick={onCompose}>
                New note
              </Button>
            </>
          ) : (
            <p>No notes match.</p>
          )}
        </div>
      )}
      {confirmDialog}
    </div>
  );
}

function NoteCard({
  note,
  onEdit,
  onArchive,
  onDelete,
}: {
  note: ClientNote;
  onEdit: () => void;
  onArchive: (archived: boolean) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const long = note.body.split("\n").length > 10 || note.body.length > 700;
  const edited = new Date(note.updatedAt).getTime() - new Date(note.createdAt).getTime() > 60_000;
  return (
    <article
      className={`cn-card is-${note.kind}${note.archivedAt ? " is-archived" : ""}`}
      onDoubleClick={() => !note.archivedAt && onEdit()}
    >
      <header className="cn-card-head">
        <span className={`cn-kind is-${note.kind}`}>{noteKindLabel(note.kind)}</span>
        {note.notedOn && <span className="cn-date">{day(note.notedOn)}</span>}
        <span className="cn-spacer" />
        {!note.archivedAt && (
          <button type="button" className="cn-edit" onClick={onEdit}>
            Edit
          </button>
        )}
        <ActionMenu
          label={note.title || "note"}
          actions={[
            ...(note.archivedAt ? [] : [{ label: "Edit", onClick: onEdit }]),
            note.archivedAt
              ? { label: "Restore", onClick: () => onArchive(false) }
              : { label: "Archive", onClick: () => onArchive(true) },
            { label: "Delete", danger: true, onClick: onDelete },
          ]}
        />
      </header>
      {note.title && <h3 className="cn-title">{note.title}</h3>}
      {note.body && (
        <div className={`cn-body${long && !open ? " is-clamped" : ""}`}>{note.body}</div>
      )}
      {long && (
        <button type="button" className="cn-more" onClick={() => setOpen((v) => !v)}>
          {open ? "Show less" : "Show more"}
        </button>
      )}
      <footer className="cn-foot">
        {note.authorName} · {stamp(note.createdAt)}
        {edited && note.editorName
          ? ` · edited by ${note.editorName} ${stamp(note.updatedAt)}`
          : ""}
        {note.archivedAt ? " · Archived" : ""}
      </footer>
    </article>
  );
}

function NoteEditor({
  initial,
  submit,
  onSave,
  onCancel,
}: {
  initial: NoteDraft;
  submit: string;
  onSave: (draft: NoteDraft) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<NoteDraft>(initial);
  const [busy, setBusy] = useState(false);
  const body = useRef<HTMLTextAreaElement>(null);
  const title = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const field = initial.body ? body.current : title.current;
    field?.focus();
    // Editing picks up where the note ends, not in front of it.
    if (field) field.setSelectionRange(field.value.length, field.value.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // The text box grows with what is written, so a long note is read whole.
  useEffect(() => {
    const el = body.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(140, el.scrollHeight)}px`;
  }, [draft.body]);

  const empty = !draft.title.trim() && !draft.body.trim();
  const save = async () => {
    if (empty || busy) return;
    setBusy(true);
    try {
      await onSave(draft);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="cn-card is-editing"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          void save();
        }
      }}
    >
      <div className="cn-kinds" role="group" aria-label="Kind of note">
        {NOTE_KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            aria-pressed={draft.kind === k.id}
            className={draft.kind === k.id ? "is-on" : undefined}
            onClick={() => setDraft((d) => ({ ...d, kind: k.id }))}
          >
            {k.label}
          </button>
        ))}
      </div>
      <div className="cn-row">
        <input
          ref={title}
          className="cn-input is-title"
          value={draft.title}
          placeholder="Title (optional)"
          aria-label="Title"
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
        />
        <input
          className="cn-input is-date"
          type="date"
          value={draft.notedOn ?? ""}
          aria-label={draft.kind === "meeting" ? "Meeting date" : "Date"}
          title={draft.kind === "meeting" ? "Meeting date" : "Date"}
          onChange={(e) => setDraft((d) => ({ ...d, notedOn: e.target.value || null }))}
        />
      </div>
      <textarea
        ref={body}
        className="cn-input is-body"
        value={draft.body}
        placeholder={
          draft.kind === "instruction"
            ? "What you were asked to do, by whom, and by when"
            : draft.kind === "meeting"
              ? "Who was there, what was discussed, what was agreed"
              : "Write the note"
        }
        aria-label="Note"
        onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
      />
      <div className="cn-editor-foot">
        <span className="cn-hint">⌘Enter to save · Esc to cancel</span>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" type="submit" disabled={empty || busy}>
          {busy ? "Saving…" : submit}
        </Button>
      </div>
    </form>
  );
}
