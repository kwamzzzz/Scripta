/**
 * Ask someone to review this, and the state of that review, beside the thing
 * itself.
 *
 * Not a queue. A review queue is a second place to look, and a second place to
 * look goes stale — so the state lives on the clause or the task or the
 * document, and the only thing that enters anybody's list is the reviewer's
 * task, because that is work somebody has to do.
 *
 * Every control here is drawn against `i_may_move` and `i_may_withdraw` as the
 * database reports them, never against a role compared in TypeScript. The rule
 * that somebody demoted to Viewer mid-review stops being able to approve is
 * precisely the rule a screen would forget, so the screen is not asked to
 * remember it.
 */
import { useState } from "react";
import { Button } from "@/components/primitives";
import { useAuth } from "@/lib/auth";
import { displayName, useMatterTeam, useProfileNames } from "@/lib/matter-team";
import {
  isSettled,
  REVIEW_LABEL,
  REVIEW_MOVES,
  useReview,
  useReviewActions,
  type ReviewStatus,
} from "@/lib/review";
import { useThreadContext, type ThreadKind } from "@/lib/thread";
import { C, mono, radius } from "@/lib/tokens";

const TONE: Record<ReviewStatus, { fg: string; bg: string }> = {
  "Not required": { fg: C.muted, bg: C.sunken },
  Requested: { fg: C.amber, bg: "#FBF4E6" },
  "In review": { fg: C.accent, bg: C.accentTint },
  "Changes requested": { fg: C.amber, bg: "#FBF4E6" },
  Approved: { fg: C.green, bg: "#E8F3EB" },
  Rejected: { fg: C.red, bg: "#F7ECEA" },
};

export default function ReviewControl({
  kind,
  entityId,
  label,
}: {
  kind: ThreadKind;
  entityId: string;
  /** What the reviewer's task will be called. A task called "Review" is not one. */
  label: string;
}) {
  const { user } = useAuth();
  const contextQuery = useThreadContext(kind, entityId);
  const context = contextQuery.data;
  const review = useReview(kind, entityId);
  const team = useMatterTeam(context?.matterId);
  const names = useProfileNames();
  const actions = useReviewActions(kind, entityId);

  const [asking, setAsking] = useState(false);
  const [reviewer, setReviewer] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [askingReason, setAskingReason] = useState<ReviewStatus | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const current = review.data;
  const busy = actions.request.isPending || actions.move.isPending || actions.withdraw.isPending;

  /* Only people who may write on the matter can be asked, and only people on the
     matter can be asked at all — the same rule as a mention, for the same
     reason: asking somebody to check a file they cannot open tells them about
     the file. The database refuses it either way; this is so the list never
     offers a name that would be refused. */
  const candidates = (team.data ?? []).filter((m) => m.role !== "viewer" && m.userId !== user?.id);

  const attempt = async (run: Promise<unknown>, fallback: string) => {
    setProblem(null);
    try {
      await run;
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : fallback);
    }
  };

  // Nothing to say, and nothing anybody here may do about it.
  if (!context?.mayComment && !current) return null;

  const who = (id: string | null) => {
    const person = id ? names.data?.get(id) : undefined;
    return person ? displayName({ name: person.name, email: person.email }) : "somebody";
  };

  /* Resubmitting belongs to whoever's work is being resubmitted, or the Lead —
     not the reviewer, who would be handing their own request back to
     themselves. `i_may_move` is deliberately coarse (it answers "are you
     involved in this review at all"), so this one transition is narrowed here
     against the same condition the trigger applies. Every other move is left to
     the database's answer. */
  const iAmTheAuthor = !!current && !!user?.id && current.requestedBy === user.id;
  const iLead = context?.myRole === "lead";
  const moves = (current ? REVIEW_MOVES[current.status] : []).filter((move) =>
    current?.status === "Changes requested" && move.to === "Requested"
      ? iAmTheAuthor || iLead
      : true,
  );

  return (
    <section
      aria-label="Review"
      style={{
        border: `1px solid ${C.cardRule}`,
        borderRadius: radius.lg,
        background: C.panel,
        padding: "11px 13px",
        display: "grid",
        gap: 9,
      }}
    >
      <header style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        <span style={{ color: C.secondary, font: `500 10px ${mono}`, letterSpacing: ".08em" }}>
          REVIEW
        </span>
        {current ? (
          <span
            style={{
              color: TONE[current.status].fg,
              background: TONE[current.status].bg,
              borderRadius: radius.pill,
              padding: "2px 9px",
              fontSize: 11.5,
              fontWeight: 600,
            }}
          >
            {REVIEW_LABEL[current.status]}
          </span>
        ) : (
          <span style={{ color: C.muted, fontSize: 12.5 }}>Not been asked for</span>
        )}
        {current && !isSettled(current.status) && (
          <span style={{ color: C.muted, fontSize: 12 }}>
            with {who(current.assignedTo)}
            {current.requestedBy ? `, asked by ${who(current.requestedBy)}` : ""}
          </span>
        )}
        <div style={{ flex: 1 }} />
        {!current && context?.mayComment && !asking && (
          <Button variant="secondary" disabled={busy} onClick={() => setAsking(true)}>
            Ask someone to review this
          </Button>
        )}
      </header>

      {/* The reason travels with the decision, because "changes requested" with
          no reason is a message that wastes a round trip. */}
      {current?.reason && (
        <p
          style={{
            margin: 0,
            color: C.body,
            fontSize: 13,
            lineHeight: 1.55,
            borderLeft: `2px solid ${C.border}`,
            paddingLeft: 9,
          }}
        >
          {current.reason}
        </p>
      )}

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
          }}
        >
          {problem}
        </p>
      )}

      {asking && (
        <div style={{ display: "grid", gap: 7 }}>
          <label style={{ display: "grid", gap: 4, color: C.text, fontSize: 12.5 }}>
            Who should check this?
            <select
              aria-label="Reviewer"
              value={reviewer}
              onChange={(event) => setReviewer(event.target.value)}
              style={{
                border: `1px solid ${C.border}`,
                borderRadius: radius.md,
                padding: "7px 9px",
                font: "inherit",
                fontSize: 13,
                background: C.panel,
                color: C.text,
              }}
            >
              <option value="">Choose a colleague on this matter</option>
              {candidates.map((person) => (
                <option key={person.userId} value={person.userId}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
          {candidates.length === 0 && (
            <p style={{ margin: 0, color: C.muted, fontSize: 12.5 }}>
              Nobody else on this matter can review. Add them to the team first.
            </p>
          )}
          <textarea
            aria-label="What should they look at?"
            placeholder="What should they look at?"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            style={{
              border: `1px solid ${C.border}`,
              borderRadius: radius.md,
              padding: "8px 10px",
              font: "inherit",
              fontSize: 13,
              minHeight: 56,
              resize: "vertical",
              background: C.panel,
              color: C.text,
            }}
          />
          <div style={{ display: "flex", gap: 7 }}>
            <Button
              variant="primary"
              disabled={!reviewer || busy}
              onClick={() =>
                void attempt(
                  actions.request
                    .mutateAsync({ reviewer, title: label, reason: note.trim() || null })
                    .then(() => {
                      setAsking(false);
                      setReviewer("");
                      setNote("");
                    }),
                  "The review could not be requested.",
                )
              }
            >
              Ask for review
            </Button>
            <Button variant="quiet" disabled={busy} onClick={() => setAsking(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* The moves. Drawn only where the database says this person may move it,
          so a reviewer removed from the matter simply has no buttons. */}
      {current && current.iMayMove && moves.length > 0 && askingReason === null && (
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          {moves.map((move) => (
            <Button
              key={move.to}
              variant={move.to === "Approved" ? "primary" : "secondary"}
              disabled={busy}
              onClick={() => {
                // Sending work back without saying why wastes a round trip.
                if (move.to === "Changes requested" || move.to === "Rejected") {
                  setAskingReason(move.to);
                  return;
                }
                void attempt(
                  actions.move.mutateAsync({ id: current.id, status: move.to }),
                  "The review could not be moved.",
                );
              }}
            >
              {move.label}
            </Button>
          ))}
          {current.iMayWithdraw && !isSettled(current.status) && (
            <Button
              variant="quiet"
              disabled={busy}
              onClick={() =>
                void attempt(
                  actions.withdraw.mutateAsync(current.id),
                  "The review could not be withdrawn.",
                )
              }
            >
              Withdraw
            </Button>
          )}
        </div>
      )}

      {current && askingReason !== null && (
        <div style={{ display: "grid", gap: 7 }}>
          <textarea
            aria-label="Why?"
            placeholder={
              askingReason === "Rejected" ? "Why should this not proceed?" : "What needs to change?"
            }
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            style={{
              border: `1px solid ${C.border}`,
              borderRadius: radius.md,
              padding: "8px 10px",
              font: "inherit",
              fontSize: 13,
              minHeight: 56,
              resize: "vertical",
              background: C.panel,
              color: C.text,
            }}
          />
          <div style={{ display: "flex", gap: 7 }}>
            <Button
              variant="primary"
              disabled={!reason.trim() || busy}
              onClick={() =>
                void attempt(
                  actions.move
                    .mutateAsync({
                      id: current.id,
                      status: askingReason,
                      reason: reason.trim(),
                    })
                    .then(() => {
                      setAskingReason(null);
                      setReason("");
                    }),
                  "The review could not be moved.",
                )
              }
            >
              Send back
            </Button>
            <Button variant="quiet" disabled={busy} onClick={() => setAskingReason(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
