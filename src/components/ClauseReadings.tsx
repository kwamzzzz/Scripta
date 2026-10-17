/**
 * The four readings of a clause, and the changes outstanding in it.
 *
 * ---------------------------------------------------------------------------
 * THE LABELS ARE THE FEATURE
 * ---------------------------------------------------------------------------
 *
 * A lawyer has to be able to tell, without thinking about it, which of these
 * they are looking at:
 *
 *   what the counterparty sent
 *   what has been proposed
 *   WHAT THE CONTRACT SAYS TODAY
 *   what it would say if everything outstanding were accepted
 *
 * The third and fourth are the dangerous pair. An earlier draft called the
 * third "Current", which reads as settled and quietly implied that unresolved
 * proposals had already become operative. "Operative" and "If accepted" cannot
 * be confused for one another, and "If accepted" is phrased as the hypothetical
 * it is.
 *
 * So the switcher does not merely label the readings — it says what each one
 * means, and it says plainly when the two differ.
 */
import { useState } from "react";
import { Check, PencilLine, Undo2, X } from "lucide-react";
import { Button } from "@/components/primitives";
import { useAuth } from "@/lib/auth";
import { displayName, useMatterTeam, useProfileNames } from "@/lib/matter-team";
import { UNATTRIBUTED, UNATTRIBUTED_LABEL } from "@/wireframe/segments-to-marks";
import {
  READING_LABEL,
  READING_MEANING,
  render,
  useClauseActions,
  useClauseContext,
  useTrackedClause,
  type Reading,
} from "@/lib/tracked-clause";
import { docToText } from "@/wireframe/clause-doc";
import ClausePresence from "@/components/ClausePresence";
import TrackedClauseEditor from "@/components/TrackedClauseEditor";
import { settleControls } from "@/lib/settle-controls";
import { useHoldClause } from "@/lib/clause-lease";
import { C, mono, radius } from "@/lib/tokens";

const READINGS: Reading[] = ["received", "markedUp", "operative", "ifAccepted"];

const when = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? ""
    : date.toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
};

export default function ClauseReadings({
  clauseId,
  clauseLabel,
  workspaceId,
}: {
  clauseId: string;
  clauseLabel?: string | undefined;
  workspaceId: string | null | undefined;
}) {
  const { user } = useAuth();
  const clause = useTrackedClause(clauseId);
  const names = useProfileNames();
  const [reading, setReading] = useState<Reading>("markedUp");
  const [problem, setProblem] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const data = clause.data;
  const changes = data?.changes ?? [];
  const context = useClauseContext(
    clauseId,
    changes.map((c) => c.authorId),
  );
  const actions = useClauseActions(clauseId);
  const team = useMatterTeam(context.data?.matterId);
  const alone = team.data?.length === 1 && team.data[0]?.userId === user?.id;

  /* Take the clause while this rail is open, so a colleague opening it finds it
     occupied rather than finding out by losing a save. The lease grants nothing
     — every control below is still drawn from `clause_context()`, and the
     server still judges every write on its own terms. */
  const { holding, retake } = useHoldClause(clauseId, context.data?.mayEdit === true);
  const occupied = holding.state === "occupied";
  /* Marking up needs the clause AND the right. Losing the lease mid-sentence
     stops the tracking without closing the editor, so nothing typed is lost;
     the save is what will be refused, and it says so. */
  const mayMarkUp = context.data?.mayEdit === true && !occupied;

  const busy =
    actions.accept.isPending ||
    actions.reject.isPending ||
    actions.withdraw.isPending ||
    actions.acceptAll.isPending;

  const who = (authorId: string) => {
    if (authorId === UNATTRIBUTED) return UNATTRIBUTED_LABEL;
    const person = names.data?.get(authorId);
    return person ? displayName({ name: person.name, email: person.email }) : "Somebody";
  };

  const attempt = async (run: Promise<unknown>, fallback: string) => {
    setProblem(null);
    try {
      await run;
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : fallback);
    }
  };

  if (clause.isLoading) return <p style={{ color: C.muted, fontSize: 13 }}>Reading the clause…</p>;
  if (!data?.doc) return null;

  const shown = render(data, reading);
  const differs =
    docToText(render(data, "operative") ?? { type: "doc", content: [] }) !==
    docToText(render(data, "ifAccepted") ?? { type: "doc", content: [] });

  return (
    <section aria-label="Readings" style={{ display: "grid", gap: 11 }}>
      <ClausePresence
        clauseId={clauseId}
        holding={holding}
        mayBreak={context.data?.mayBreak === true}
        onRetake={retake}
      />

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {READINGS.map((value) => {
          const active = reading === value;
          const missing = value === "received" && !data.baseline;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              disabled={missing}
              title={READING_MEANING[value]}
              onClick={() => setReading(value)}
              style={{
                border: `1px solid ${active ? C.accentEdge : C.border}`,
                borderRadius: radius.pill,
                background: active ? C.accentTint : C.panel,
                color: missing ? C.faint : active ? C.accent : C.secondary,
                cursor: missing ? "default" : "pointer",
                font: "inherit",
                fontSize: 12,
                padding: "5px 11px",
              }}
            >
              {READING_LABEL[value]}
            </button>
          );
        })}
      </div>

      <p style={{ margin: 0, color: C.muted, fontSize: 12.5, lineHeight: 1.55 }}>
        {READING_MEANING[reading]}
      </p>

      {/* The sentence that stops somebody signing the wrong reading. */}
      {differs && (reading === "operative" || reading === "ifAccepted") && (
        <p
          style={{
            margin: 0,
            borderLeft: `2px solid ${C.amber}`,
            paddingLeft: 9,
            color: C.body,
            fontSize: 12.5,
            lineHeight: 1.55,
          }}
        >
          {reading === "operative"
            ? `${changes.length} proposal${changes.length === 1 ? "" : "s"} outstanding. This is not what the document would say if they were accepted.`
            : "This is a preview. None of it is operative until the proposals are accepted."}
        </p>
      )}

      <div
        style={{
          border: `1px solid ${C.cardRule}`,
          borderRadius: radius.lg,
          background: C.panel,
          padding: "13px 15px",
          color: C.text,
          fontSize: 13.5,
          lineHeight: 1.7,
          whiteSpace: editing ? "normal" : "pre-wrap",
        }}
      >
        {editing && data.doc ? (
          <TrackedClauseEditor
            clauseId={clauseId}
            doc={data.doc}
            mayEdit={mayMarkUp}
            workspaceId={workspaceId}
            onDone={() => setEditing(false)}
          />
        ) : shown ? (
          docToText(shown)
        ) : (
          "Nothing recorded for this reading."
        )}
      </div>

      {/* Marking up happens on the marked-up reading and nowhere else. Editing
          "Operative" would mean typing into a document that has had proposals
          removed from it, and saving that would settle them silently. */}
      {!editing && mayMarkUp && reading === "markedUp" && (
        <div>
          <Button variant="secondary" onClick={() => setEditing(true)}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <PencilLine size={13} /> Mark up this clause
            </span>
          </Button>
        </div>
      )}

      {problem && (
        <p role="alert" style={{ margin: 0, color: C.red, fontSize: 12.5 }}>
          {problem}
        </p>
      )}

      {changes.length > 0 && (
        <div style={{ display: "grid", gap: 7 }}>
          <span style={{ color: C.secondary, font: `500 10px ${mono}`, letterSpacing: ".08em" }}>
            {changes.length} OUTSTANDING
          </span>
          {changes.map((change) => {
            const mine = change.authorId === user?.id;
            const maySettle = context.data?.maySettle(change.authorId) ?? false;
            return (
              <article
                key={change.changeId}
                style={{
                  border: `1px solid ${C.cardRule}`,
                  borderLeft: `3px solid ${change.kind === "insertion" ? C.green : C.red}`,
                  borderRadius: radius.md,
                  background: C.panel,
                  padding: "9px 11px",
                  display: "grid",
                  gap: 6,
                  opacity: busy ? 0.7 : 1,
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ color: C.text, fontSize: 12.5, fontWeight: 600 }}>
                    {who(change.authorId)}
                  </span>
                  <span
                    style={{
                      color: change.kind === "insertion" ? C.green : C.red,
                      font: `500 10px ${mono}`,
                    }}
                  >
                    {change.kind === "insertion" ? "INSERTED" : "DELETED"}
                  </span>
                  <span style={{ color: C.faint, fontSize: 11.5 }}>{when(change.at)}</span>
                </div>
                <p
                  style={{
                    margin: 0,
                    color: C.body,
                    fontSize: 13,
                    textDecoration: change.kind === "deletion" ? "line-through" : "underline",
                  }}
                >
                  {change.text.trim().slice(0, 160)}
                </p>
                {/* ---------------------------------------------------------
                    YOUR OWN WORDING IS WITHDRAWN, NEVER ACCEPTED
                    ---------------------------------------------------------

                    `can_settle_change` answers true for your own change, and it
                    is right to — taking back your own proposal decides nothing
                    and needs nobody's permission. But that made `maySettle`
                    true for your own wording, and this rail then drew Accept
                    and Reject on it.

                    So the editor promised "your wording is marked as proposed
                    until somebody accepts it" and, two inches below, offered
                    the author the button to accept it themselves.

                    Found in the Phase 5 browser acceptance. `mine` is asked
                    FIRST now, so the two rights can never be confused: your own
                    proposal offers Withdraw and nothing else. */}
                {occupied && (maySettle || mine) && (
                  <span style={{ color: C.faint, fontSize: 11.5 }}>
                    Waiting for {holding.byName} to come out.
                  </span>
                )}
                {!occupied && settleControls({ mine, maySettle, alone }) === "withdraw" && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <Button
                      variant="quiet"
                      disabled={busy}
                      onClick={() =>
                        void attempt(
                          actions.withdraw.mutateAsync({
                            doc: data.doc!,
                            changeId: change.changeId,
                          }),
                          "That proposal could not be withdrawn.",
                        )
                      }
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <Undo2 size={13} /> Withdraw
                      </span>
                    </Button>
                    <span style={{ color: C.faint, fontSize: 11.5, alignSelf: "center" }}>
                      Yours. Somebody else accepts it.
                    </span>
                  </div>
                )}
                {!occupied && settleControls({ mine, maySettle, alone }) === "settle" && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void attempt(
                          actions.accept.mutateAsync({
                            doc: data.doc!,
                            changeId: change.changeId,
                          }),
                          "That change could not be accepted.",
                        )
                      }
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <Check size={13} /> Accept
                      </span>
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void attempt(
                          actions.reject.mutateAsync({
                            doc: data.doc!,
                            changeId: change.changeId,
                          }),
                          "That change could not be rejected.",
                        )
                      }
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <X size={13} /> Reject
                      </span>
                    </Button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {changes.length === 0 && (
        <p style={{ margin: 0, color: C.muted, fontSize: 12.5 }}>
          Nothing outstanding{clauseLabel ? ` on ${clauseLabel}` : ""}. Operative and If accepted
          read the same.
        </p>
      )}
    </section>
  );
}
