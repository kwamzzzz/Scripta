/**
 * Everything outstanding on this document, and who proposed it.
 *
 * ---------------------------------------------------------------------------
 * A READING, NOT A QUEUE
 * ---------------------------------------------------------------------------
 *
 * The question this answers is the one a lawyer asks at six o'clock: what is
 * still open on this contract, and whose is it. So it lists, groups two ways,
 * and settles. It does not track. Nothing here has a status, an owner, a date
 * or a stage, because a change has two ends — outstanding, or settled — and a
 * third state would make this the workflow product it was asked not to be.
 *
 * Accepting is offered per change and per SITTING — one lawyer's work in one
 * session on one clause. There is deliberately no "accept everything": a button
 * that settles four hundred clauses of somebody else's drafting in one click is
 * the kind of button that ends up in a negligence claim.
 */
import { useMemo, useState } from "react";
import { Check, Undo2, X } from "lucide-react";
import { Button } from "@/components/primitives";
import { useAuth } from "@/lib/auth";
import { displayName, useMatterTeam, useProfileNames } from "@/lib/matter-team";
import { useReviewActions } from "@/lib/review";
import { UNATTRIBUTED, UNATTRIBUTED_LABEL } from "@/wireframe/segments-to-marks";
import {
  group,
  sittings,
  useMatterChanges,
  useMatterStanding,
  type Grouping,
  type MatterChange,
} from "@/lib/matter-changes";
import { settleControls } from "@/lib/settle-controls";
import { useClauseActions } from "@/lib/tracked-clause";
import { C, mono, radius } from "@/lib/tokens";

/* Settling calls through the clause's own actions, so the Changes pane and the
   clause rail use one save path and one set of server checks. */
function Settle({
  change,
  maySettle,
  mine,
  alone,
  onProblem,
}: {
  change: MatterChange;
  maySettle: boolean;
  mine: boolean;
  /** The caller is the only person on the matter. */
  alone: boolean;
  onProblem: (message: string | null) => void;
}) {
  const actions = useClauseActions(change.clauseId);
  const busy = actions.accept.isPending || actions.reject.isPending || actions.withdraw.isPending;
  const offer = settleControls({ mine, maySettle, alone });
  if (offer === "none") return null;

  const run = (promise: Promise<unknown>, fallback: string) => {
    onProblem(null);
    void promise.catch((cause: unknown) =>
      onProblem(cause instanceof Error ? cause.message : fallback),
    );
  };

  /* ---------------------------------------------------------------------
     `mine` IS ASKED FIRST, ALWAYS
     ---------------------------------------------------------------------

     `can_settle_change()` answers true for your own change, and rightly —
     taking back your own proposal decides nothing and needs nobody's
     permission. But that makes `maySettle` true for your own wording, and
     this pane drew Accept and Reject on it.

     That is not cosmetic. `save_clause_doc` cannot tell accepting from
     withdrawing (both remove the mark; accepting keeps the text), so the
     button worked: an Editor could make their own drafting operative from
     the Changes pane, with no second pair of eyes. The clause rail was
     fixed for this; the pane was not, because the edit silently failed to
     apply and no test covered it.

     Found in the independent clause-workflow acceptance review. */
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {offer === "settle" ? (
        <>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              run(
                actions.accept.mutateAsync({ doc: change.doc, changeId: change.changeId }),
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
              run(
                actions.reject.mutateAsync({ doc: change.doc, changeId: change.changeId }),
                "That change could not be rejected.",
              )
            }
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <X size={13} /> Reject
            </span>
          </Button>
        </>
      ) : (
        <Button
          variant="quiet"
          disabled={busy}
          onClick={() =>
            run(
              actions.withdraw.mutateAsync({ doc: change.doc, changeId: change.changeId }),
              "That proposal could not be withdrawn.",
            )
          }
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Undo2 size={13} /> Withdraw
          </span>
        </Button>
      )}
    </div>
  );
}

/**
 * One lawyer's work, in one session, on one clause — settled as the single act
 * it was. Offered only where there is more than one change in it, because
 * "accept all" over a single change is just "accept" with a worse name.
 */
function SittingActions({
  clauseId,
  clauseLabel,
  setId,
  doc,
  count,
  maySettle,
  mine,
  matterId,
  onProblem,
}: {
  clauseId: string;
  clauseLabel: string;
  setId: string;
  doc: MatterChange["doc"];
  count: number;
  maySettle: boolean;
  /** The sitting is the caller's own work. */
  mine: boolean;
  matterId: string | null | undefined;
  onProblem: (message: string | null) => void;
}) {
  const { user } = useAuth();
  const actions = useClauseActions(clauseId);
  const review = useReviewActions("clause", clauseId);
  const team = useMatterTeam(matterId);
  const [asking, setAsking] = useState(false);
  const alone = team.data?.length === 1 && team.data[0]?.userId === user?.id;
  const busy = actions.acceptAll.isPending || actions.rejectAll.isPending;
  if (!maySettle && !mine) return null;

  const run = (promise: Promise<unknown>, fallback: string) => {
    onProblem(null);
    void promise.catch((cause: unknown) =>
      onProblem(cause instanceof Error ? cause.message : fallback),
    );
  };

  /**
   * Asking for a change set to be looked at.
   *
   * The Phase 4 review, addressed at the clause, and nothing new.
   * `can_settle_change()` already grants settlement to a reviewer while the
   * review is live — so asking a colleague to look at your wording is exactly
   * and only giving them the standing to accept or reject it. A separate
   * change-set object would be a second place for that right to live.
   */
  const colleagues = (team.data ?? []).filter((member) => member.userId !== user?.id);

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
        <span style={{ color: C.faint, fontSize: 11.5 }}>{count} changes made in one sitting</span>

        {/* Your own sitting is withdrawn, never accepted. Same rule as a single
            change: can_settle_change says yes to your own work because taking
            it back decides nothing, and that must not become a button that
            makes your own drafting operative. */}
        {mine && !(alone && maySettle) ? (
          <Button
            variant="quiet"
            disabled={busy}
            onClick={() =>
              run(
                actions.rejectAll.mutateAsync({ doc, setId }),
                "Those changes could not be withdrawn.",
              )
            }
          >
            Withdraw the sitting
          </Button>
        ) : (
          maySettle && (
            <>
              <Button
                variant="quiet"
                disabled={busy}
                onClick={() =>
                  run(
                    actions.acceptAll.mutateAsync({ doc, setId }),
                    "Those changes could not be accepted.",
                  )
                }
              >
                Accept the sitting
              </Button>
              <Button
                variant="quiet"
                disabled={busy}
                onClick={() =>
                  run(
                    actions.rejectAll.mutateAsync({ doc, setId }),
                    "Those changes could not be rejected.",
                  )
                }
              >
                Reject it
              </Button>
            </>
          )
        )}

        {mine && colleagues.length > 0 && !asking && (
          <Button variant="quiet" onClick={() => setAsking(true)}>
            Ask someone to look at these
          </Button>
        )}
      </div>

      {asking && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {colleagues.map((member) => (
            <Button
              key={member.userId}
              variant="secondary"
              disabled={review.request.isPending}
              onClick={() => {
                setAsking(false);
                run(
                  review.request.mutateAsync({
                    reviewer: member.userId,
                    title: `Review ${clauseLabel}`,
                    reason: `${count} changes proposed in one sitting.`,
                  }),
                  "That review could not be requested.",
                );
              }}
            >
              {member.name}
            </Button>
          ))}
          <Button variant="quiet" onClick={() => setAsking(false)}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

export default function ChangesPane({
  matterId,
  onOpenClause,
}: {
  matterId: string | null | undefined;
  onOpenClause?: (clauseId: string) => void;
}) {
  const { user } = useAuth();
  const names = useProfileNames();
  const changes = useMatterChanges(matterId);
  const [by, setBy] = useState<Grouping>("person");
  const [only, setOnly] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const all = useMemo(() => changes.data ?? [], [changes.data]);
  const team = useMatterTeam(matterId);
  const alone = team.data?.length === 1 && team.data[0]?.userId === user?.id;
  const standing = useMatterStanding(
    matterId,
    all.map((change) => change.authorId),
  );

  const who = (authorId: string) => {
    if (authorId === UNATTRIBUTED) return UNATTRIBUTED_LABEL;
    if (authorId === user?.id) return "You";
    const person = names.data?.get(authorId);
    return person ? displayName({ name: person.name, email: person.email }) : "Somebody";
  };

  const people = useMemo(() => [...new Set(all.map((c) => c.authorId))], [all]);
  const shown = only ? all.filter((change) => change.authorId === only) : all;
  const groups = useMemo(() => group(shown, by, who), [shown, by, names.data, user?.id]);

  if (changes.isLoading) {
    return <p style={{ color: C.muted, fontSize: 13 }}>Reading the document…</p>;
  }

  if (all.length === 0) {
    return (
      <section aria-label="Changes" style={{ display: "grid", gap: 9 }}>
        <p style={{ margin: 0, color: C.muted, fontSize: 12.5, lineHeight: 1.55 }}>
          Nothing is outstanding on this document. Every reading of it says the same thing.
        </p>
      </section>
    );
  }

  const chip = (active: boolean) =>
    ({
      border: `1px solid ${active ? C.accentEdge : C.border}`,
      borderRadius: radius.pill,
      background: active ? C.accentTint : C.panel,
      color: active ? C.accent : C.secondary,
      cursor: "pointer",
      font: "inherit",
      fontSize: 12,
      padding: "4px 10px",
    }) as const;

  return (
    <section aria-label="Changes" style={{ display: "grid", gap: 11 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ color: C.secondary, font: `500 10px ${mono}`, letterSpacing: ".08em" }}>
          {all.length} OUTSTANDING
        </span>
        <div style={{ flex: 1 }} />
        <button type="button" style={chip(by === "person")} onClick={() => setBy("person")}>
          By person
        </button>
        <button type="button" style={chip(by === "clause")} onClick={() => setBy("clause")}>
          By clause
        </button>
      </div>

      {people.length > 1 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button type="button" style={chip(only === null)} onClick={() => setOnly(null)}>
            Everyone
          </button>
          {people.map((person) => (
            <button
              key={person}
              type="button"
              style={chip(only === person)}
              onClick={() => setOnly(only === person ? null : person)}
            >
              {who(person)}
            </button>
          ))}
        </div>
      )}

      {problem && (
        <p role="alert" style={{ margin: 0, color: C.red, fontSize: 12.5 }}>
          {problem}
        </p>
      )}

      {groups.map((entry) => (
        <div key={entry.key} style={{ display: "grid", gap: 7 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <strong style={{ color: C.text, fontSize: 12.5 }}>{entry.label}</strong>
            <span style={{ color: C.faint, fontSize: 11.5 }}>
              {entry.changes.length} outstanding
              {by === "person" &&
                sittings(entry.changes).length > 1 &&
                ` across ${sittings(entry.changes).length} sittings`}
            </span>
          </div>

          {sittings(entry.changes)
            .filter((sitting) => sitting.count > 1)
            .map((sitting) => {
              const first = entry.changes.find(
                (change) => change.clauseId === sitting.clauseId && change.setId === sitting.setId,
              );
              if (!first) return null;
              return (
                <SittingActions
                  key={sitting.clauseId + sitting.setId}
                  clauseId={sitting.clauseId}
                  clauseLabel={
                    [first.clauseNum, first.clauseTitle].filter(Boolean).join(" · ") ||
                    "this clause"
                  }
                  setId={sitting.setId}
                  doc={first.doc}
                  count={sitting.count}
                  maySettle={standing.data?.maySettle(first.clauseId, first.authorId) ?? false}
                  mine={first.authorId === user?.id}
                  matterId={matterId}
                  onProblem={setProblem}
                />
              );
            })}

          {entry.changes.map((change) => {
            const mine = change.authorId === user?.id;
            const maySettle = standing.data?.maySettle(change.clauseId, change.authorId) ?? false;
            return (
              <article
                key={change.clauseId + change.changeId}
                style={{
                  border: `1px solid ${C.cardRule}`,
                  borderLeft: `3px solid ${change.kind === "insertion" ? C.green : C.red}`,
                  borderRadius: radius.md,
                  background: C.panel,
                  padding: "9px 11px",
                  display: "grid",
                  gap: 6,
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  {onOpenClause ? (
                    <button
                      type="button"
                      onClick={() => onOpenClause(change.clauseId)}
                      style={{
                        border: 0,
                        background: "transparent",
                        color: C.accent,
                        cursor: "pointer",
                        font: "inherit",
                        fontSize: 12.5,
                        fontWeight: 600,
                        padding: 0,
                      }}
                    >
                      {by === "clause" ? who(change.authorId) : (change.clauseNum ?? "Clause")}
                    </button>
                  ) : (
                    <span style={{ color: C.text, fontSize: 12.5, fontWeight: 600 }}>
                      {by === "clause" ? who(change.authorId) : (change.clauseNum ?? "Clause")}
                    </span>
                  )}
                  <span
                    style={{
                      color: change.kind === "insertion" ? C.green : C.red,
                      font: `500 10px ${mono}`,
                    }}
                  >
                    {change.kind === "insertion" ? "INSERTED" : "DELETED"}
                  </span>
                </div>
                <p
                  style={{
                    margin: 0,
                    color: C.body,
                    fontSize: 13,
                    textDecoration: change.kind === "deletion" ? "line-through" : "underline",
                  }}
                >
                  {change.text.trim().slice(0, 200)}
                </p>
                <Settle
                  change={change}
                  maySettle={maySettle}
                  mine={mine}
                  alone={alone}
                  onProblem={setProblem}
                />
              </article>
            );
          })}
        </div>
      ))}
    </section>
  );
}
