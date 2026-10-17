import { useMemo, useState, type CSSProperties } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, MessageSquareText, RotateCcw, Trash2 } from "lucide-react";
import { Button, SectionLabel } from "@/components/primitives";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import Thread from "@/components/Thread";
import {
  addMatterNote,
  deleteMatterNote,
  setMatterNoteResolved,
} from "@/lib/matter-notes.functions";
import { useNotes, type Note } from "@/lib/use-notes";
import { C, mono, radius } from "@/lib/tokens";
import { useApp } from "@/store/app";

type Filter = "open" | "all" | "resolved";

const textArea: CSSProperties = {
  width: "100%",
  minHeight: 96,
  boxSizing: "border-box",
  resize: "vertical",
  border: `1px solid ${C.border}`,
  borderRadius: radius.md,
  background: C.panel,
  color: C.text,
  font: "inherit",
  fontSize: 13,
  lineHeight: 1.6,
  padding: "10px 12px",
};

const when = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Date unavailable" : date.toLocaleString();
};

export default function MatterNotes() {
  const { matterId, matter, workspaceId, D, set } = useApp();
  const queryClient = useQueryClient();
  const add = useServerFn(addMatterNote);
  const setResolved = useServerFn(setMatterNoteResolved);
  const remove = useServerFn(deleteMatterNote);
  const clauseIds = useMemo(() => D.clauses.map((clause) => clause.id), [D.clauses]);
  const clauseLabels = useMemo(
    () =>
      new Map(
        D.clauses.map((clause) => [
          clause.id,
          `Clause ${clause.num}${clause.title ? ` · ${clause.title}` : ""}`,
        ]),
      ),
    [D.clauses],
  );
  const query = useNotes(matterId, clauseIds);
  const [filter, setFilter] = useState<Filter>("open");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const { confirmDelete, confirmDialog } = useConfirmDelete();

  /* Clause notes only. The matter's own discussion moved to <Thread> below —
     there is one comment box per conversation, and this screen used to own a
     second one writing to the same rows. What is left here is the thing Thread
     cannot do, because it belongs to one entity and this spans every clause on
     the file. */
  const notes = useMemo(
    () => (query.data ?? []).filter((note) => note.kind === "note" && note.entity_kind === "clause"),
    [query.data],
  );
  const visible = notes.filter((note) =>
    filter === "all" ? true : filter === "resolved" ? note.resolved : !note.resolved,
  );
  const openCount = notes.filter((note) => !note.resolved).length;
  const resolvedCount = notes.length - openCount;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["notes"] });
  const fail = (cause: unknown, fallback: string) =>
    setProblem(cause instanceof Error ? `${fallback}: ${cause.message}` : fallback);

  const submit = async () => {
    const body = text.trim();
    if (!matterId || !body || busy) return;
    setBusy("new");
    setProblem(null);
    try {
      await add({ data: { matterId, body } });
      setText("");
      await refresh();
    } catch (cause) {
      fail(cause, "The note could not be saved");
    } finally {
      setBusy(null);
    }
  };

  const changeStatus = async (note: Note) => {
    if (!matterId || busy) return;
    setBusy(note.id);
    setProblem(null);
    try {
      await setResolved({ data: { matterId, noteId: note.id, resolved: !note.resolved } });
      await refresh();
    } catch (cause) {
      fail(cause, `The note could not be ${note.resolved ? "reopened" : "resolved"}`);
    } finally {
      setBusy(null);
    }
  };

  const deleteNote = async (note: Note) => {
    if (!matterId || busy) return;
    if (!(await confirmDelete({ what: "this note", archivable: false }))) return;
    setBusy(note.id);
    setProblem(null);
    try {
      await remove({ data: { matterId, noteId: note.id } });
      await refresh();
    } catch (cause) {
      fail(cause, "The note could not be deleted");
    } finally {
      setBusy(null);
    }
  };

  if (!matterId)
    return (
      <main style={{ flex: 1, padding: 24, color: C.muted }}>Open a matter to read its notes.</main>
    );

  return (
    <main style={{ flex: 1, minWidth: 0, overflow: "auto", background: C.canvas, padding: 24 }}>
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        <header style={{ display: "flex", alignItems: "flex-start", gap: 18 }}>
          <div>
            <SectionLabel>Matter record</SectionLabel>
            <h1 style={{ color: C.text, fontSize: 20, lineHeight: 1.3, margin: "5px 0 4px" }}>
              Notes
            </h1>
            <p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.55, margin: 0 }}>
              Notes on {matter?.name ?? "this matter"}, including notes kept against individual
              clauses. They stay off the document and are never sent as redraft instructions.
            </p>
          </div>
          <div style={{ flex: 1 }} />
          <div
            aria-label="Note counts"
            style={{ display: "flex", gap: 18, color: C.muted, font: `500 11px ${mono}` }}
          >
            <span>{openCount} OPEN</span>
            <span>{resolvedCount} RESOLVED</span>
          </div>
        </header>

        {/* The matter's own thread: replies, resolve, and an edit that says it
            was edited — the same component as the task panel and the clause
            rail, so "who may speak here" has one answer in the product. */}
        <div style={{ marginTop: 18, borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
          <Thread
            kind="matter"
            entityId={matterId}
            workspaceId={workspaceId}
            title="Matter discussion"
            blurb="Questions, decisions and points to revisit on the file as a whole."
          />
        </div>

        {(problem || query.error) && (
          <p
            role="alert"
            style={{
              margin: "14px 0 0",
              border: "1px solid #E8CCC7",
              borderRadius: radius.md,
              background: "#F7ECEA",
              color: C.red,
              padding: "9px 12px",
              fontSize: 12.5,
              lineHeight: 1.5,
            }}
          >
            {problem ??
              (query.error instanceof Error ? query.error.message : "The notes could not be read.")}
          </p>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 18 }}>
          {(["open", "all", "resolved"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              style={{
                border: `1px solid ${filter === value ? C.accentEdge : C.border}`,
                borderRadius: radius.pill,
                background: filter === value ? C.accentTint : C.panel,
                color: filter === value ? C.accent : C.secondary,
                cursor: "pointer",
                font: "inherit",
                fontSize: 12,
                padding: "5px 11px",
                textTransform: "capitalize",
              }}
            >
              {value}
            </button>
          ))}
          <span style={{ color: C.faint, fontSize: 11.5, marginLeft: 4 }}>
            Clause notes are added from the selected clause in Contract Editor.
          </span>
        </div>

        <section
          aria-label="Matter and clause notes"
          style={{ display: "grid", gap: 9, marginTop: 11 }}
        >
          {query.isLoading ? (
            <p style={{ color: C.muted, fontSize: 13 }}>Reading notes…</p>
          ) : visible.length ? (
            visible.map((note) => {
              const clauseLabel =
                note.entity_kind === "clause" ? clauseLabels.get(note.entity_id) : null;
              const pending = busy === note.id;
              return (
                <article
                  key={note.id}
                  style={{
                    border: `1px solid ${C.cardRule}`,
                    borderLeft: `3px solid ${note.resolved ? C.border : C.warm}`,
                    borderRadius: radius.lg,
                    background: C.panel,
                    padding: "12px 14px 11px",
                    opacity: pending ? 0.65 : 1,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <MessageSquareText size={14} color={note.resolved ? C.muted : C.warm} />
                    {clauseLabel ? (
                      <button
                        type="button"
                        onClick={() => set({ screen: "review", selClause: note.entity_id })}
                        style={{
                          border: 0,
                          background: "transparent",
                          color: C.accent,
                          cursor: "pointer",
                          font: "inherit",
                          fontSize: 12,
                          fontWeight: 600,
                          padding: 0,
                        }}
                      >
                        {clauseLabel}
                      </button>
                    ) : (
                      <span style={{ color: C.secondary, fontSize: 12, fontWeight: 600 }}>
                        Matter note
                      </span>
                    )}
                    <div style={{ flex: 1 }} />
                    {note.resolved && (
                      <span style={{ color: C.green, font: `500 10px ${mono}` }}>RESOLVED</span>
                    )}
                  </div>
                  <p
                    style={{
                      color: note.resolved ? C.secondary : C.text,
                      fontSize: 13.5,
                      lineHeight: 1.62,
                      margin: "9px 0 11px",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {note.body}
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <time dateTime={note.created_at} style={{ color: C.faint, fontSize: 11.5 }}>
                      {when(note.created_at)}
                    </time>
                    <div style={{ flex: 1 }} />
                    <Button
                      variant="quiet"
                      disabled={!!busy}
                      onClick={() => void changeStatus(note)}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        {note.resolved ? <RotateCcw size={13} /> : <CheckCircle2 size={13} />}
                        {note.resolved ? "Reopen" : "Resolve"}
                      </span>
                    </Button>
                    <Button
                      variant="danger"
                      disabled={!!busy}
                      onClick={() => void deleteNote(note)}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <Trash2 size={13} />
                        Delete
                      </span>
                    </Button>
                  </div>
                </article>
              );
            })
          ) : (
            <div
              style={{
                border: `1px dashed ${C.border}`,
                borderRadius: radius.lg,
                color: C.muted,
                fontSize: 13,
                lineHeight: 1.6,
                padding: "28px 20px",
                textAlign: "center",
              }}
            >
              {filter === "open"
                ? "No open notes. Add a matter note above, or add a clause note from Contract Editor."
                : filter === "resolved"
                  ? "No resolved notes yet."
                  : "No notes have been recorded on this matter yet."}
            </div>
          )}
        </section>
      </div>
      {confirmDialog}
    </main>
  );
}
