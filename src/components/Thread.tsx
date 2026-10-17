/**
 * The discussion on one piece of work.
 *
 * The same component on a clause, a task, a deliverable, a flow phase, a
 * research finding, a document and the matter itself. Seven surfaces, one
 * conversation, one set of controls — because seven comment boxes is how a
 * product acquires seven different ideas about who may speak.
 *
 * ---------------------------------------------------------------------------
 * NOTHING IS DRAWN THAT WOULD BE REFUSED
 * ---------------------------------------------------------------------------
 *
 * A Viewer sees the discussion and no comment box, no reply, no resolve, no
 * edit. An Editor sees Resolve on a thread they raised and on work they are
 * responsible for, and not on a Reviewer's objection about somebody else's
 * draft. Every one of those decisions is `mayComment`, `mayResolve`, `mayEdit`
 * or `mayDelete` from `@/lib/thread`, which are transcriptions of the database
 * rules rather than second opinions about them.
 *
 * The person is never told what they are missing. A control that is not
 * available is absent, not disabled with an explanation — a disabled Resolve
 * with a tooltip about responsibility is a worse answer to "can I close this"
 * than no Resolve at all, and it invites an argument with a rule the screen
 * cannot change.
 *
 * ---------------------------------------------------------------------------
 * AN EDIT IS AN ALTERATION OF THE RECORD
 * ---------------------------------------------------------------------------
 *
 * A comment is not a draft. Editing one says Edited, with the time, and the
 * audit trail keeps what it said before — written by the database trigger, not
 * by this component, so it cannot be skipped by a screen that forgets. What is
 * deliberately NOT here: a version history, a diff, or any way to read the
 * previous text back in the interface. That is the third prohibition in section
 * 13 of the plan. A comment's own history is answerable from the audit trail;
 * a document's history is Phase 5's model and this must not grow a bad half of
 * it.
 */
import { useRef, useState, type CSSProperties } from "react";
import { CheckCircle2, CornerDownRight, MessageSquareText, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/primitives";
import ReviewControl from "@/components/ReviewControl";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import { useAuth } from "@/lib/auth";
import { displayName, useMatterTeam, useProfileNames } from "@/lib/matter-team";
import {
  activeMention,
  insertMention,
  matchCandidates,
  segmentBody,
  survivingMentions,
  type MentionCandidate,
} from "@/lib/mentions";
import {
  editedLabel,
  mayDelete,
  mayEdit,
  mayResolve,
  useThread,
  useThreadActions,
  useThreadContext,
  NO_ACCESS,
  type Comment,
  type ThreadContext,
  type ThreadKind,
} from "@/lib/thread";
import { C, mono, radius } from "@/lib/tokens";

const textArea: CSSProperties = {
  width: "100%",
  minHeight: 72,
  boxSizing: "border-box",
  resize: "vertical",
  border: `1px solid ${C.border}`,
  borderRadius: radius.md,
  background: C.panel,
  color: C.text,
  font: "inherit",
  fontSize: 13,
  lineHeight: 1.6,
  padding: "9px 11px",
};

const when = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Date unavailable" : date.toLocaleString();
};

/**
 * A box that writes when you press it, and clears when it succeeds.
 *
 * `@` offers the MATTER TEAM and nobody else. Phase 3 established that firm
 * membership grants access to zero matters, so a firm-wide picker would be the
 * one control here able to pull somebody toward a file they cannot open — being
 * told "you were mentioned in Atlas" is itself something about Atlas. The
 * database refuses a non-member at write time regardless; this is so the
 * interface never offers a name that would be refused.
 */
function Composer({
  label,
  placeholder,
  busy,
  team,
  onSend,
}: {
  label: string;
  placeholder: string;
  busy: boolean;
  team: MentionCandidate[];
  onSend: (body: string, mentions: string[]) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [caret, setCaret] = useState(0);
  /* Everybody chosen from the picker while writing. Not everybody whose name
     appears — survivingMentions decides that at send time, so deleting a name
     before pressing Post unmentions them. */
  const [picked, setPicked] = useState<MentionCandidate[]>([]);
  const box = useRef<HTMLTextAreaElement | null>(null);

  const active = team.length ? activeMention(text, caret) : null;
  const candidates = active ? matchCandidates(active.query, team) : [];

  const choose = (person: MentionCandidate) => {
    if (!active) return;
    const next = insertMention(text, active, caret, person.name);
    setText(next.text);
    setCaret(next.caret);
    setPicked((current) => [...current, person]);
    requestAnimationFrame(() => {
      box.current?.focus();
      box.current?.setSelectionRange(next.caret, next.caret);
    });
  };

  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    await onSend(body, survivingMentions(body, picked));
    setText("");
    setPicked([]);
  };

  return (
    <div style={{ display: "grid", gap: 7, position: "relative" }}>
      <label style={{ display: "block" }}>
        <span
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            overflow: "hidden",
            clip: "rect(0 0 0 0)",
          }}
        >
          {label}
        </span>
        <textarea
          ref={box}
          aria-label={label}
          value={text}
          placeholder={placeholder}
          disabled={busy}
          onChange={(event) => {
            setText(event.target.value);
            setCaret(event.target.selectionStart ?? event.target.value.length);
          }}
          onKeyUp={(event) => setCaret(event.currentTarget.selectionStart ?? 0)}
          onClick={(event) => setCaret(event.currentTarget.selectionStart ?? 0)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void send();
            if (event.key === "Escape" && candidates.length) {
              event.preventDefault();
              setCaret(-1);
            }
          }}
          style={textArea}
        />
      </label>

      {candidates.length > 0 && (
        <ul
          aria-label="Mention a colleague on this matter"
          style={{
            listStyle: "none",
            margin: 0,
            padding: 4,
            border: `1px solid ${C.border}`,
            borderRadius: radius.md,
            background: C.panel,
            display: "grid",
            gap: 2,
            boxShadow: "0 6px 18px rgba(0,0,0,.08)",
          }}
        >
          {candidates.map((person) => (
            <li key={person.userId}>
              <button
                type="button"
                onClick={() => choose(person)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  border: 0,
                  background: "transparent",
                  color: C.text,
                  cursor: "pointer",
                  font: "inherit",
                  fontSize: 12.5,
                  padding: "6px 8px",
                  borderRadius: radius.md,
                }}
              >
                {person.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ color: C.faint, font: `500 10px ${mono}` }}>⌘+ENTER</span>
        {team.length > 0 && (
          <span style={{ color: C.faint, fontSize: 11.5 }}>
            @ to mention someone on this matter
          </span>
        )}
        <div style={{ flex: 1 }} />
        <Button variant="primary" disabled={!text.trim() || busy} onClick={() => void send()}>
          {busy ? "Saving…" : "Post"}
        </Button>
      </div>
    </div>
  );
}

function CommentBody({
  comment,
  context,
  userId,
  names,
  onEdit,
  busy,
  anchor,
}: {
  comment: Comment;
  context: ThreadContext;
  userId: string | null | undefined;
  names: Map<string, { name: string; email: string }> | undefined;
  onEdit: (body: string) => Promise<void>;
  busy: boolean;
  anchor?: string | null;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const who = comment.authorId ? names?.get(comment.authorId) : undefined;
  const edited = editedLabel(comment);

  if (draft !== null) {
    return (
      <div style={{ display: "grid", gap: 7 }}>
        <textarea
          aria-label="Edit comment"
          value={draft}
          disabled={busy}
          onChange={(event) => setDraft(event.target.value)}
          style={textArea}
        />
        <div style={{ display: "flex", gap: 7 }}>
          <Button
            variant="primary"
            disabled={!draft.trim() || busy}
            onClick={() => {
              const body = draft.trim();
              if (!body) return;
              void onEdit(body).then(() => setDraft(null));
            }}
          >
            Save
          </Button>
          <Button variant="quiet" disabled={busy} onClick={() => setDraft(null)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ color: C.text, fontSize: 12.5, fontWeight: 600 }}>
          {who ? displayName({ name: who.name, email: who.email }) : "Unknown"}
        </span>
        <time dateTime={comment.createdAt} style={{ color: C.faint, fontSize: 11.5 }}>
          {when(comment.createdAt)}
        </time>
        {/* The marker, not the previous text. */}
        {edited && (
          <span style={{ color: C.faint, font: `500 10px ${mono}` }}>{edited.toUpperCase()}</span>
        )}
        {comment.kind === "instruction" && (
          <span style={{ color: C.warm, font: `500 10px ${mono}` }}>INSTRUCTION</span>
        )}
      </div>
      {/* The words this note is about, quoted back. A thread whose anchor has
          been deleted and the deletion accepted shows no quotation and is not
          hidden: a note somebody wrote does not stop existing when the sentence
          it was about does. */}
      {anchor && (
        <blockquote
          style={{
            margin: "6px 0 0",
            borderLeft: `2px solid ${C.accentEdge}`,
            paddingLeft: 8,
            color: C.secondary,
            fontSize: 12.5,
            lineHeight: 1.5,
          }}
        >
          “{anchor.trim().slice(0, 180)}
          {anchor.trim().length > 180 ? "…" : ""}”
        </blockquote>
      )}
      {/* Mentions are drawn from the ids the row RECORDS, not from scanning the
          text for an @. A name typed by hand and never picked stays plain text,
          because nobody was told about it, and the interface should not claim
          otherwise. */}
      <p
        style={{
          color: comment.resolved ? C.secondary : C.text,
          fontSize: 13.5,
          lineHeight: 1.62,
          margin: "7px 0 0",
          whiteSpace: "pre-wrap",
        }}
      >
        {segmentBody(
          comment.body,
          comment.mentions
            .map((id) => names?.get(id))
            .filter(Boolean)
            .map((person) => displayName({ name: person!.name, email: person!.email })),
        ).map((segment, index) =>
          segment.mentioned ? (
            <span
              key={index}
              style={{
                color: C.accent,
                background: C.accentTint,
                borderRadius: radius.sm,
                padding: "1px 4px",
                fontWeight: 500,
              }}
            >
              {segment.text}
            </span>
          ) : (
            <span key={index}>{segment.text}</span>
          ),
        )}
      </p>
      {mayEdit(comment, context, userId) && (
        <button
          type="button"
          onClick={() => setDraft(comment.body)}
          style={{
            border: 0,
            background: "transparent",
            color: C.accent,
            cursor: "pointer",
            font: "inherit",
            fontSize: 12,
            padding: "6px 0 0",
          }}
        >
          Edit
        </button>
      )}
    </>
  );
}

export default function Thread({
  kind,
  entityId,
  workspaceId,
  title = "Discussion",
  blurb,
  reviewLabel,
  anchorFor,
}: {
  kind: ThreadKind;
  entityId: string;
  workspaceId: string | null | undefined;
  title?: string;
  blurb?: string;
  /* The words a thread is anchored to, where the surface has a document to
     look in. A clause does; a matter does not, and passes nothing. */
  anchorFor?: ((commentId: string) => string | null) | undefined;
  /* What the reviewer's task will be called if somebody asks for a review here.
     Absent means this surface does not offer review — a matter as a whole is
     not a thing one person checks for another. */
  reviewLabel?: string;
}) {
  const { user } = useAuth();
  const contextQuery = useThreadContext(kind, entityId);
  const context0 = contextQuery.data ?? NO_ACCESS;
  const threadQuery = useThread(kind, entityId);
  const names = useProfileNames();
  /* The mention picker offers the matter team and nobody else. A thread with no
     matter — firm knowledge, or unfiled private work — has no team, so it gets
     no picker, and validate_comment_mentions() refuses a mention there anyway. */
  const team = useMatterTeam(context0.matterId);
  const candidates: MentionCandidate[] = (team.data ?? []).map((m) => ({
    userId: m.userId,
    name: m.name,
  }));
  const actions = useThreadActions(kind, entityId, workspaceId);
  const { confirmDelete, confirmDialog } = useConfirmDelete();
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const context = context0;
  const items = threadQuery.data ?? [];
  const busy =
    actions.post.isPending ||
    actions.reply.isPending ||
    actions.edit.isPending ||
    actions.setResolved.isPending ||
    actions.remove.isPending;

  /* The database is the judge. When it refuses, say what it said rather than
     what the screen assumed — a refusal here means the interface and the rules
     have drifted, and a generic message would hide exactly that. */
  const attempt = async (run: Promise<unknown>, fallback: string) => {
    setProblem(null);
    try {
      await run;
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : fallback);
    }
  };

  const openCount = items.filter((item) => !item.comment.resolved).length;

  return (
    <section aria-label={title} style={{ display: "grid", gap: 11 }}>
      <header style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
        <MessageSquareText size={14} color={C.warm} />
        <h3 style={{ color: C.text, fontSize: 13.5, fontWeight: 600, margin: 0 }}>{title}</h3>
        <span style={{ color: C.faint, font: `500 10px ${mono}` }}>
          {openCount} OPEN
          {items.length !== openCount ? ` · ${items.length - openCount} RESOLVED` : ""}
        </span>
      </header>
      {blurb && (
        <p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.55, margin: 0 }}>{blurb}</p>
      )}

      {/* Review sits above the discussion: the state of the thing comes before
          the conversation about it. It is the same object, so it is the same
          card. */}
      {reviewLabel && <ReviewControl kind={kind} entityId={entityId} label={reviewLabel} />}

      {problem && (
        <p
          role="alert"
          style={{
            margin: 0,
            border: "1px solid #E8CCC7",
            borderRadius: radius.md,
            background: "#F7ECEA",
            color: C.red,
            padding: "8px 11px",
            fontSize: 12.5,
            lineHeight: 1.5,
          }}
        >
          {problem}
        </p>
      )}

      {threadQuery.isLoading ? (
        <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>Reading the discussion…</p>
      ) : items.length ? (
        <div style={{ display: "grid", gap: 9 }}>
          {items.map(({ comment, replies }) => (
            <article
              key={comment.id}
              style={{
                border: `1px solid ${C.cardRule}`,
                borderLeft: `3px solid ${comment.resolved ? C.border : C.warm}`,
                borderRadius: radius.lg,
                background: C.panel,
                padding: "11px 13px",
                opacity: busy ? 0.7 : 1,
              }}
            >
              <CommentBody
                comment={comment}
                context={context}
                userId={user?.id}
                names={names.data}
                busy={busy}
                anchor={anchorFor?.(comment.id) ?? null}
                onEdit={(body) =>
                  attempt(
                    actions.edit.mutateAsync({ id: comment.id, body }),
                    "The edit was refused.",
                  )
                }
              />

              {replies.length > 0 && (
                <div
                  style={{
                    display: "grid",
                    gap: 9,
                    marginTop: 11,
                    paddingLeft: 13,
                    borderLeft: `1px solid ${C.rowRule}`,
                  }}
                >
                  {replies.map((reply) => (
                    <div key={reply.id}>
                      <CommentBody
                        comment={reply}
                        context={context}
                        userId={user?.id}
                        names={names.data}
                        busy={busy}
                        onEdit={(body) =>
                          attempt(
                            actions.edit.mutateAsync({ id: reply.id, body }),
                            "The edit was refused.",
                          )
                        }
                      />
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 9 }}>
                {comment.resolved && (
                  <span style={{ color: C.green, font: `500 10px ${mono}` }}>RESOLVED</span>
                )}
                <div style={{ flex: 1 }} />
                {context.mayComment && (
                  <Button
                    variant="quiet"
                    disabled={busy}
                    onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <CornerDownRight size={13} />
                      Reply
                    </span>
                  </Button>
                )}
                {/* Resolution is earned. Absent, not disabled, where it is not. */}
                {mayResolve(comment, context, user?.id) && (
                  <Button
                    variant="quiet"
                    disabled={busy}
                    onClick={() =>
                      void attempt(
                        actions.setResolved.mutateAsync({
                          id: comment.id,
                          resolved: !comment.resolved,
                        }),
                        "The change was refused.",
                      )
                    }
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      {comment.resolved ? <RotateCcw size={13} /> : <CheckCircle2 size={13} />}
                      {comment.resolved ? "Reopen" : "Resolve"}
                    </span>
                  </Button>
                )}
                {mayDelete(comment, context, user?.id) && (
                  <Button
                    variant="danger"
                    disabled={busy}
                    onClick={() =>
                      void (async () => {
                        if (!(await confirmDelete({ what: "this comment", archivable: false })))
                          return;
                        await attempt(
                          actions.remove.mutateAsync(comment.id),
                          "The comment could not be deleted.",
                        );
                      })()
                    }
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <Trash2 size={13} />
                      Delete
                    </span>
                  </Button>
                )}
              </div>

              {replyTo === comment.id && context.mayComment && (
                <div
                  style={{ marginTop: 9, paddingLeft: 13, borderLeft: `1px solid ${C.rowRule}` }}
                >
                  <Composer
                    label="Write a reply"
                    placeholder="Reply…"
                    busy={busy}
                    team={candidates}
                    onSend={async (body, mentions) => {
                      await attempt(
                        actions.reply.mutateAsync({ parentId: comment.id, body, mentions }),
                        "The reply was refused.",
                      );
                      setReplyTo(null);
                    }}
                  />
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>
          {context.mayComment
            ? "Nothing has been raised here yet."
            : "Nothing has been raised here yet. You are following this matter rather than working on it."}
        </p>
      )}

      {/* The comment box itself: present for a Lead, an Editor and a Reviewer,
          absent for a Viewer and for anybody the matter no longer includes. */}
      {context.mayComment && (
        <Composer
          label="Write a comment"
          placeholder="Raise a point, ask a question, record a decision…"
          busy={busy}
          team={candidates}
          onSend={(body, mentions) =>
            attempt(actions.post.mutateAsync({ body, mentions }), "The comment was refused.")
          }
        />
      )}

      {confirmDialog}
    </section>
  );
}
