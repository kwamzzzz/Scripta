/**
 * Notes on the selected part of a structured document.
 *
 * Deliberately NOT the shared <Thread>, and the reason is worth writing down
 * because the two look identical on screen.
 *
 * A structured document's parts are not rows in `clauses`. They live in the
 * editor's own metadata, they are created and destroyed as the document is
 * restructured, and `current.id` here is a part id that no `comments.entity_id`
 * could ever point at. Wiring this panel to the database thread would have
 * attached every note to an entity that does not exist — `comment_matter()`
 * would return null, the comments policy would fall to its author-only branch,
 * and each note would have become invisible to everybody except the person who
 * wrote it. Silently, and looking exactly like the feature not working.
 *
 * That is the same failure as the three Phase 3 defects, arrived at from the
 * other direction: not a missing branch, but a kind pointed at the wrong table.
 *
 * So these stay local, saved with the document, and the collaborative thread
 * belongs to the contract review workbench where a clause is a real row.
 */
import { useState } from "react";
import { Trash2, X } from "lucide-react";

export type PartNote = { id: string; body: string; created_at: string };

export default function PartNotesPanel({
  clauseLabel,
  notes,
  loading,
  busy,
  onAdd,
  onRemove,
  onClose,
}: {
  clauseLabel: string | null;
  notes: PartNote[];
  loading: boolean;
  busy: boolean;
  onAdd: (body: string) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const submit = () => {
    const body = text.trim();
    if (!body || busy) return;
    onAdd(body);
    setText("");
  };
  return (
    <aside className="ce-instructions-panel ce-notes-panel" aria-label="Notes">
      <header>
        <div>
          <strong>Notes</strong>
          <span>
            {clauseLabel
              ? `${notes.length} on ${clauseLabel} · saved with the document`
              : "Select a part to read or add its notes"}
          </span>
        </div>
        <button type="button" aria-label="Close notes" onClick={onClose}>
          <X />
        </button>
      </header>
      <div className="ce-instructions-list">
        {loading && <p className="ce-instructions-empty">Reading the notes on this part…</p>}
        {!loading && !notes.length && (
          <p className="ce-instructions-empty">
            No notes on this part. A note records what you thought — a question for the client, a
            reason you left wording alone. Nothing here is sent to the redraft.
          </p>
        )}
        {notes.map((note) => (
          <div className="ce-note-row" key={note.id}>
            <p>{note.body}</p>
            <div>
              <span>{new Date(note.created_at).toLocaleString()}</span>
              <button
                type="button"
                aria-label="Delete note"
                title="Delete note"
                disabled={busy}
                onClick={() => onRemove(note.id)}
              >
                <Trash2 />
              </button>
            </div>
          </div>
        ))}
      </div>
      <footer>
        <textarea
          aria-label={clauseLabel ? `Note on ${clauseLabel}` : "Note"}
          placeholder="Write a note on this part…"
          value={text}
          disabled={!clauseLabel || busy}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") submit();
          }}
        />
        <div className="ce-note-actions">
          <span>⌘+ENTER TO SAVE</span>
          <button type="button" disabled={!text.trim() || !clauseLabel || busy} onClick={submit}>
            {busy ? "Saving…" : "Add note"}
          </button>
        </div>
      </footer>
    </aside>
  );
}
