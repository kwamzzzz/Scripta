/**
 * Editing a clause so that the wording carries a name.
 *
 * ---------------------------------------------------------------------------
 * THE EDITOR IS WHERE THE PHASE BECOMES REAL
 * ---------------------------------------------------------------------------
 *
 * Everything else in Phase 5 — the mark model, the migration, the four
 * readings, the settlement rights, the leases — exists so that this surface can
 * behave the way a lawyer expects a marked-up contract to behave. Typing
 * proposes; deleting strikes through rather than destroys; every run of text
 * remembers who put it there; and none of it is an offset in a side table that
 * a later edit can silently invalidate.
 *
 * The tracking is done by `trackingPlugin`, in an `appendTransaction`, because
 * that is the only place that sees every way text can change. Intercepting
 * commands would mean catching each of typing, paste, drag, undo, input rules
 * and whatever is added next, and missing one is a change with nobody's name
 * on it.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS SURFACE REFUSES TO DO
 * ---------------------------------------------------------------------------
 *
 * IT DOES NOT SAVE AS YOU TYPE. A contract clause is not a chat message. Saving
 * on a debounce would put a partial sentence into a colleague's live view, and
 * would make the staleness rule fire against the lawyer's own half-finished
 * work. Save is an act: ⌘↵, or the button.
 *
 * IT DOES NOT DISCARD ON A REFUSAL. The whole point of the refusals the
 * database makes — somebody else holds the clause, the clause moved under you —
 * is that the words stay on the screen they were typed on. The draft is held
 * here, above the editor, so a refetch arriving from realtime cannot take it.
 *
 * IT DOES NOT PRETEND TO BE A WORD PROCESSOR. No suggestion mode toggle, no
 * per-author colour picker, no reviewing ribbon. One question — are you marking
 * this up, or reading it — and the answer is the reading you chose.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { MessageSquarePlus, Save, X } from "lucide-react";
import { Button } from "@/components/primitives";
import { useAuth } from "@/lib/auth";
import { RichTextEditor } from "@/wireframe/rich-text";
import { CLAUSE_EXTENSIONS } from "@/wireframe/editor-extensions";
import { trackedChangeExtensions, type TrackingContext } from "@/wireframe/tracked-marks";
import { sameDoc, type ClauseDoc } from "@/wireframe/clause-doc";
import { useClauseActions } from "@/lib/tracked-clause";
import { useAnchorComment } from "@/lib/anchored-comments";
import { C, radius } from "@/lib/tokens";

export default function TrackedClauseEditor({
  clauseId,
  doc,
  /** False while a colleague holds the clause, or for a Reader. */
  mayEdit,
  workspaceId,
  onDone,
}: {
  clauseId: string;
  doc: ClauseDoc;
  mayEdit: boolean;
  workspaceId: string | null | undefined;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const actions = useClauseActions(clauseId);
  const [draft, setDraft] = useState<ClauseDoc>(doc);
  const [problem, setProblem] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [commenting, setCommenting] = useState<string | null>(null);
  const anchor = useAnchorComment(clauseId, workspaceId);

  /* ---------------------------------------------------------------------
     THE SELECTION HAS TO BE SUBSCRIBED TO, NOT READ AT RENDER
     ---------------------------------------------------------------------

     This used to be `editor && !editor.state.selection.empty`, read during
     render, on the reasoning that "a selection with no document change is
     caught on the next render". There is no next render. A selection change
     produces no React state change: `rich-text.tsx` subscribes to onCreate,
     onFocus, onUpdate and onDestroy, and onUpdate fires only when the DOCUMENT
     moves. Tiptap 3 does not re-render on transactions by default.

     So "Note on these words" appeared exactly once — on the first click into
     the clause, because that click also fired onFocus. Select wording after
     that and the control never came, which is the whole entry point to an
     anchored note quietly failing. Found in the browser during the
     clause-workflow acceptance review; the reasoning above is why it was not
     found by reading the code.

     One listener, in the one component that cares, rather than making every
     editor in the product re-render on every transaction. */
  const [selected, setSelected] = useState(false);
  useEffect(() => {
    if (!editor) {
      setSelected(false);
      return;
    }
    const look = () => setSelected(!editor.state.selection.empty);
    look();
    editor.on("transaction", look);
    return () => {
      editor.off("transaction", look);
    };
  }, [editor]);

  /* One set id per sitting. Everything typed in this session is one act, so
     "accept all of Podrick's changes from Tuesday" is a single decision rather
     than forty. Held in a ref so a re-render never starts a new sitting. */
  const sitting = useRef<string>(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `set-${Date.now()}`,
  );

  /* The plugin reads this through a getter rather than a closure, so that
     losing the lease mid-sentence stops the tracking from attributing further
     text without tearing the editor down under the lawyer's hands. */
  const context = useRef<TrackingContext>({
    authorId: user?.id ?? "",
    setId: sitting.current,
    enabled: mayEdit,
  });
  useEffect(() => {
    context.current = { authorId: user?.id ?? "", setId: sitting.current, enabled: mayEdit };
  }, [user?.id, mayEdit]);

  const extensions = useMemo(
    () => [...CLAUSE_EXTENSIONS, ...trackedChangeExtensions(() => context.current)],
    [],
  );

  /* Canonical, not stringified: a document that has been to the database comes
     back with its keys reordered by `jsonb`, and a plain string compare reads
     that as unsaved work forever. See `sameDoc`. */
  const dirty = !sameDoc(draft, doc);

  /**
   * Comment on the selected words.
   *
   * The comment is written first and the mark carries its id, rather than the
   * mark being written first and a comment attached to it afterwards. That
   * order matters: a mark pointing at a comment that was never created is an
   * anchor to nothing, while a comment whose anchor failed to save is still a
   * note on the clause and reads perfectly well without one.
   */
  const comment = (body: string) => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    setProblem(null);
    anchor.mutate(
      {
        body,
        apply: (threadId) => {
          editor.chain().focus().setCommentAnchor(threadId, from, to).run();
          return editor.getJSON() as ClauseDoc;
        },
      },
      {
        onSuccess: () => setCommenting(null),
        onError: (cause) =>
          setProblem(cause instanceof Error ? cause.message : "That note could not be added."),
      },
    );
  };

  const save = () => {
    setProblem(null);
    actions.save.mutate(draft, {
      onSuccess: onDone,
      /* The refusal is shown and the draft is kept. A lawyer who loses a race
         must never also lose the sentence. */
      onError: (cause) =>
        setProblem(cause instanceof Error ? cause.message : "That could not be saved."),
    });
  };

  return (
    <div style={{ display: "grid", gap: 9 }}>
      <RichTextEditor
        doc={draft}
        text=""
        extensions={extensions}
        onChange={setDraft}
        onEditor={setEditor}
        label="Clause wording"
        className="ce-clause-editor ce-tracked"
        autofocus
        onCancel={onDone}
        onSave={save}
      />

      {problem && (
        <p role="alert" style={{ margin: 0, color: C.red, fontSize: 12.5, lineHeight: 1.5 }}>
          {problem}
        </p>
      )}

      {commenting !== null ? (
        <div style={{ display: "grid", gap: 7 }}>
          <textarea
            autoFocus
            aria-label="Note on the selected words"
            placeholder="A question for the client, a reason this wording will not do."
            value={commenting}
            onChange={(event) => setCommenting(event.target.value)}
            style={{
              border: `1px solid ${C.border}`,
              borderRadius: radius.md,
              background: C.panel,
              color: C.text,
              font: "inherit",
              fontSize: 13,
              lineHeight: 1.55,
              minHeight: 64,
              padding: "8px 10px",
              resize: "vertical",
            }}
          />
          <div style={{ display: "flex", gap: 7 }}>
            <Button
              variant="primary"
              disabled={!commenting.trim() || anchor.isPending}
              onClick={() => comment(commenting.trim())}
            >
              Add the note
            </Button>
            <Button variant="quiet" onClick={() => setCommenting(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        selected && (
          <div>
            <Button variant="secondary" onClick={() => setCommenting("")}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <MessageSquarePlus size={13} /> Note on these words
              </span>
            </Button>
          </div>
        )
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
        <Button variant="primary" disabled={!dirty || actions.save.isPending} onClick={save}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Save size={13} /> {actions.save.isPending ? "Saving…" : "Save"}
          </span>
        </Button>
        <Button variant="quiet" onClick={onDone}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <X size={13} /> {dirty ? "Leave without saving" : "Close"}
          </span>
        </Button>
        <span style={{ color: C.faint, fontSize: 11.5 }}>
          Your wording is marked as proposed until somebody accepts it. ⌘↵ saves.
        </span>
      </div>

      <style>{`
        .ce-tracked ins[data-change-id] {
          text-decoration: underline;
          text-decoration-thickness: 1px;
          text-underline-offset: 2px;
          background: ${C.accentTint};
          border-radius: ${typeof radius.md === "number" ? `${radius.md}px` : radius.md};
        }
        .ce-tracked del[data-change-id] { opacity: .65; }
        .ce-tracked [data-comment-id] {
          border-bottom: 2px solid ${C.amber};
        }
      `}</style>
    </div>
  );
}
