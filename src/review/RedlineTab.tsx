/**
 * Redline: the mark-up, as its own tab rather than something buried in the
 * export screen.
 *
 * Two things belong here and were in two different places. What has already
 * changed in the document, clause by clause, as tracked changes; and what has
 * been proposed and not yet decided. A proposed amendment is not in the
 * document until it is accepted, and a reviewer needs to see that difference.
 */
import { useMemo, useState } from "react";
import { Button } from "@/components/primitives";
import { C } from "@/lib/tokens";
import { wordDiff } from "@/lib/parsing/word-diff";
import type { Clause } from "@/data/legal";
import type { Amendment } from "./model";
import { Card, Chip, Empty, Eyebrow, Field, Growing, SeverityChip, Stat } from "./ui";
import { clauseTopic, fmtWhen, plural } from "./format";
import type { Review } from "./use-review";
import { useSavePrecedent } from "@/components/SavePrecedent";
import { useAuth } from "@/lib/auth";
import { useMatterStanding, type MatterStanding } from "@/lib/matter-changes";
import { useMatterTeam } from "@/lib/matter-team";
import { settleControls } from "@/lib/settle-controls";
import { useClauseActions, useTrackedClause } from "@/lib/tracked-clause";
import { RichTextView, docBlocks } from "@/wireframe/rich-text";
import { PunctuationButton } from "@/components/PunctuationLens";
import { changesIn, type TrackedChange } from "@/wireframe/tracked-change";

type Filter = "proposed" | "changed" | "all";

/** The clause as it reads now, from its segments. */
const currentText = (clause: Clause) =>
  clause.segs
    .filter((s) => s.k !== "d")
    .map((s) => s.t)
    .join("")
    .trim();

/** The clause as it read before the changes on it. */
const priorText = (clause: Clause) =>
  clause.segs
    .filter((s) => s.k !== "i")
    .map((s) => s.t)
    .join("")
    .trim();

export default function RedlineTab({
  review,
  clauses,
  selectedClauseId,
  onOpenClause,
}: {
  review: Review;
  clauses: Clause[];
  selectedClauseId: string;
  onOpenClause: (clauseId: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("proposed");
  const { user } = useAuth();

  const rows = useMemo(() => {
    return clauses
      .map((clause) => {
        const amendments = review.amendments.filter((a) => a.clauseId === clause.id);
        // Tracked changes live in the clause's document; the segments are the
        // older redline, kept for clauses marked up before there was one.
        const tracked = clause.doc ? changesIn(clause.doc) : [];
        const proposed = amendments.filter((a) => a.status === "proposed");
        const changed = tracked.length > 0 || clause.segs.some((s) => s.k !== "n");
        return { clause, amendments, proposed, tracked, changed };
      })
      .filter((r) => r.amendments.length > 0 || r.changed);
  }, [clauses, review.amendments]);

  const authors = rows.flatMap((r) => r.tracked.map((c) => c.authorId));
  const standing = useMatterStanding(review.matter.id || null, authors);
  const team = useMatterTeam(review.matter.id || null);
  const alone = team.data?.length === 1 && team.data[0]?.userId === user?.id;
  const trackedCount = rows.reduce((n, r) => n + r.tracked.length, 0);

  const shown = rows.filter((r) =>
    filter === "proposed"
      ? r.proposed.length > 0 || r.tracked.length > 0
      : filter === "changed"
        ? r.changed
        : true,
  );
  const proposedCount = rows.reduce((n, r) => n + r.proposed.length + r.tracked.length, 0);
  const changedCount = rows.filter((r) => r.changed).length;

  return (
    <div className="rv">
      <Card
        title="Mark-up"
        hint="Insertions and deletions already in the document, and wording proposed but not yet decided. Only accepted wording reaches the export."
      >
        <div className="rv-stats">
          <Stat n={changedCount} label="Clauses changed" tone="info" />
          <Stat
            n={proposedCount}
            label="Awaiting a decision"
            tone={proposedCount ? "medium" : "ok"}
          />
          <Stat
            n={trackedCount}
            label="Tracked changes to accept or reject"
            tone={trackedCount ? "medium" : "ok"}
          />
          <Stat n={review.progress.acceptedAmendments} label="Amendments accepted" tone="ok" />
          <Stat
            n={review.amendments.filter((a) => a.status === "rejected").length}
            label="Rejected"
            tone="quiet"
          />
        </div>
        <div className="rv-filters">
          {(
            [
              ["proposed", `Awaiting a decision (${proposedCount})`],
              ["changed", `Already changed (${changedCount})`],
              ["all", `Everything (${rows.length})`],
            ] as [Filter, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`rv-pill${filter === key ? " is-on" : ""}`}
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </Card>

      {shown.length === 0 ? (
        <Card>
          <Empty
            title={
              rows.length === 0 ? "Nothing has been marked up yet" : "Nothing matches that filter"
            }
          >
            {rows.length === 0
              ? "A mark-up appears here when you accept an amendment, edit a clause, or compare two versions of the document. Proposing an amendment from an issue is the usual way in."
              : "Try Everything."}
          </Empty>
        </Card>
      ) : (
        shown.map(({ clause, amendments, proposed, tracked, changed }) => (
          <Card
            key={clause.id}
            id={`rv-redline-${clause.id}`}
            title={`${clause.num} ${clause.title}`.trim()}
            style={
              clause.id === selectedClauseId
                ? { borderColor: C.accentEdge, background: "#fff" }
                : undefined
            }
            right={
              <div className="rv-row">
                {changed && <Chip tone="info">{clause.change}</Chip>}
                {proposed.length + tracked.length > 0 && (
                  <Chip tone="medium">
                    {plural(proposed.length + tracked.length, "proposal")}
                  </Chip>
                )}
                <button
                  type="button"
                  className="rv-issue-clause"
                  onClick={() => onOpenClause(clause.id)}
                >
                  Open in the editor →
                </button>
              </div>
            }
          >
            {tracked.length > 0 && (
              <TrackedChanges
                clauseId={clause.id}
                changes={tracked}
                standing={standing.data}
                userId={user?.id}
                alone={alone}
              />
            )}
            {changed && tracked.length === 0 && (
              <div>
                <Eyebrow>AS IT STANDS IN THE DOCUMENT</Eyebrow>
                <div className="rv-amend-text rv-diff" style={{ marginTop: 5 }}>
                  {clause.segs.map((s, i) =>
                    s.k === "i" ? (
                      <ins key={i}>{s.t}</ins>
                    ) : s.k === "d" ? (
                      <del key={i}>{s.t}</del>
                    ) : (
                      <span key={i}>{s.t}</span>
                    ),
                  )}
                </div>
                {clause.diff && (
                  <div style={{ fontSize: 11.5, color: C.muted, marginTop: 5, lineHeight: 1.6 }}>
                    {clause.diff}
                  </div>
                )}
              </div>
            )}
            {amendments.map((a) => (
              <AmendmentRow key={a.id} amendment={a} clause={clause} review={review} />
            ))}
            {amendments.length === 0 && tracked.length === 0 && (
              <div className="rv-row">
                <Button
                  variant="quiet"
                  disabled={review.propose.isPending}
                  onClick={() =>
                    review.propose.mutate({
                      matterId: review.matter.id,
                      clauseId: clause.id,
                      issueId: null,
                    })
                  }
                >
                  {review.propose.isPending ? "Drafting…" : "Propose wording"}
                </Button>
              </div>
            )}
          </Card>
        ))
      )}
    </div>
  );
}

/**
 * The clause marked up, and each tracked change on it with its decision.
 *
 * Read from the clause itself, so what is accepted here is what the Final
 * tab's clean copy and the Word export then carry. Who may accept is the
 * server's answer (`can_settle_change`), not this screen's.
 */
function TrackedChanges({
  clauseId,
  changes,
  standing,
  userId,
  alone,
}: {
  clauseId: string;
  changes: TrackedChange[];
  standing: MatterStanding | undefined;
  userId: string | undefined;
  alone: boolean;
}) {
  const tracked = useTrackedClause(clauseId);
  const actions = useClauseActions(clauseId);
  const [problem, setProblem] = useState<string | null>(null);
  const doc = tracked.data?.doc ?? null;
  const busy =
    tracked.isFetching ||
    actions.accept.isPending ||
    actions.reject.isPending ||
    actions.withdraw.isPending ||
    actions.acceptAll.isPending ||
    actions.rejectAll.isPending;
  const offer = (c: TrackedChange) =>
    settleControls({
      mine: c.authorId === userId,
      maySettle: standing?.maySettle(clauseId, c.authorId) ?? false,
      alone,
    });
  const attempt = (run: Promise<unknown>, fallback: string) => {
    setProblem(null);
    void run.catch((cause: unknown) => setProblem(cause instanceof Error ? cause.message : fallback));
  };
  // Every change settleable by this person, in one sitting: one decision.
  const sets = [...new Set(changes.map((c) => c.setId))];
  const wholeSet =
    sets.length === 1 && changes.length > 1 && changes.every((c) => offer(c) === "settle")
      ? sets[0]
      : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="rv-row" style={{ gap: 8, justifyContent: "space-between", flexWrap: "wrap" }}>
        <Eyebrow>MARKED UP · STRUCK WORDS GO, UNDERLINED WORDS COME IN, ONCE ACCEPTED</Eyebrow>
        <span className="rv-row" style={{ gap: 4 }}>
          <PunctuationButton className="pl-toggle" blocks={() => docBlocks(doc)} />
        </span>
      </div>
      <div className="rv-amend-text">
        <RichTextView doc={doc ?? { type: "doc", content: [] }} boldQuotedTerms />
      </div>
      {changes.map((c) => {
        const o = offer(c);
        return (
          <div key={c.changeId} className="rv-row" style={{ gap: 8 }}>
            <Chip tone={c.kind === "insertion" ? "ok" : "high"}>
              {c.kind === "insertion" ? "Inserted" : "Deleted"}
            </Chip>
            <span
              style={{
                fontSize: 12.5,
                textDecoration: c.kind === "deletion" ? "line-through" : "underline",
                color: c.kind === "deletion" ? C.red : C.green,
                maxWidth: 420,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {c.text.trim() || "(a space)"}
            </span>
            <span style={{ flex: 1 }} />
            {doc && o === "settle" && (
              <>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    attempt(
                      actions.accept.mutateAsync({ doc, changeId: c.changeId }),
                      "That change could not be accepted.",
                    )
                  }
                >
                  Accept
                </Button>
                <Button
                  variant="quiet"
                  disabled={busy}
                  onClick={() =>
                    attempt(
                      actions.reject.mutateAsync({ doc, changeId: c.changeId }),
                      "That change could not be rejected.",
                    )
                  }
                >
                  Reject
                </Button>
              </>
            )}
            {doc && o === "withdraw" && (
              <Button
                variant="quiet"
                disabled={busy}
                title="Yours. Somebody else on the matter accepts it."
                onClick={() =>
                  attempt(
                    actions.withdraw.mutateAsync({ doc, changeId: c.changeId }),
                    "That proposal could not be withdrawn.",
                  )
                }
              >
                Withdraw
              </Button>
            )}
          </div>
        );
      })}
      {doc && wholeSet && (
        <div className="rv-issue-actions">
          <Button
            variant="primary"
            disabled={busy}
            onClick={() =>
              attempt(
                actions.acceptAll.mutateAsync({ doc, setId: wholeSet }),
                "Those changes could not be accepted.",
              )
            }
          >
            Accept all {changes.length} on this clause
          </Button>
          <Button
            variant="quiet"
            disabled={busy}
            onClick={() =>
              attempt(
                actions.rejectAll.mutateAsync({ doc, setId: wholeSet }),
                "Those changes could not be rejected.",
              )
            }
          >
            Reject all
          </Button>
        </div>
      )}
      {problem && <p className="rv-edits-problem">{problem}</p>}
    </div>
  );
}

function AmendmentRow({
  amendment,
  clause,
  review,
}: {
  amendment: Amendment;
  clause: Clause;
  review: Review;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(amendment.proposedText);
  const [note, setNote] = useState("");
  const [rejecting, setRejecting] = useState(false);
  // Wording that survived a negotiation is the wording worth keeping, so the
  // offer to keep it appears on the amendment that was accepted, not later.
  const precedent = useSavePrecedent();

  const against = priorText(clause) || currentText(clause);
  const diff = useMemo(
    () => wordDiff(against, editing ? text : amendment.proposedText),
    [against, text, editing, amendment.proposedText],
  );
  const issue = review.issues.find((i) => i.id === amendment.issueId);
  const pending = amendment.status === "proposed";

  return (
    <div className="rv-amend">
      <div className="rv-row">
        <Eyebrow
          color={
            amendment.status === "accepted"
              ? C.green
              : amendment.status === "rejected"
                ? C.muted
                : C.amber
          }
        >
          {amendment.status === "accepted"
            ? `ACCEPTED ${fmtWhen(amendment.decidedAt).toUpperCase()}`
            : amendment.status === "rejected"
              ? `REJECTED ${fmtWhen(amendment.decidedAt).toUpperCase()}`
              : "PROPOSED · NOT IN THE DOCUMENT"}
        </Eyebrow>
        <Chip tone="quiet">
          {amendment.origin === "playbook"
            ? "From the playbook"
            : amendment.origin === "human"
              ? "Your wording"
              : "Drafted by Scripta"}
        </Chip>
        {issue && (
          <>
            <SeverityChip severity={issue.severity} />
            <span style={{ fontSize: 11.5, color: C.muted }}>
              answers #{String(issue.ref).padStart(2, "0")} {issue.title}
            </span>
          </>
        )}
      </div>

      {amendment.rationale && (
        <div style={{ fontSize: 12.5, lineHeight: 1.6, color: C.body }}>{amendment.rationale}</div>
      )}

      {editing ? (
        <Field label="Your wording" hint="Edited wording is accepted as yours, not Scripta's.">
          <Growing value={text} rows={6} onChange={setText} />
        </Field>
      ) : pending ? (
        <>
          <Eyebrow>AGAINST THE CURRENT CLAUSE</Eyebrow>
          <div className="rv-amend-text rv-diff">
            {diff.map((s, i) =>
              s.k === "i" ? (
                <ins key={i}>{s.t}</ins>
              ) : s.k === "d" ? (
                <del key={i}>{s.t}</del>
              ) : (
                <span key={i}>{s.t}</span>
              ),
            )}
          </div>
        </>
      ) : amendment.status === "rejected" ? (
        // The wording that was turned down, kept so the trail shows what was
        // considered. An accepted one needs no repeat: it is the clause above.
        <details>
          <summary style={{ fontSize: 11.5, color: C.muted, cursor: "pointer", lineHeight: 1.6 }}>
            See the wording that was rejected
          </summary>
          <div className="rv-amend-text" style={{ marginTop: 6 }}>
            {amendment.proposedText}
          </div>
        </details>
      ) : null}

      {rejecting && (
        <Field
          label="Why?"
          hint="Recorded on the clause, so a later draft does not propose it again."
        >
          <Growing
            value={note}
            rows={2}
            onChange={setNote}
            placeholder="e.g. Too aggressive for this counterparty at this stage."
          />
        </Field>
      )}

      {pending && (
        <div className="rv-issue-actions">
          {rejecting ? (
            <>
              <Button
                variant="primary"
                onClick={() => {
                  review.decideAmend.mutate({
                    matterId: review.matter.id,
                    amendmentId: amendment.id,
                    status: "rejected",
                    note,
                  });
                  setRejecting(false);
                }}
              >
                Reject it
              </Button>
              <Button variant="quiet" onClick={() => setRejecting(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="primary"
                disabled={review.decideAmend.isPending}
                title="Write this into the clause as a tracked change"
                onClick={() =>
                  review.decideAmend.mutate({
                    matterId: review.matter.id,
                    amendmentId: amendment.id,
                    status: "accepted",
                    ...(editing && text !== amendment.proposedText ? { text } : {}),
                  })
                }
              >
                {review.decideAmend.isPending
                  ? "Applying…"
                  : editing
                    ? "Accept my wording"
                    : "Accept"}
              </Button>
              <Button variant="quiet" onClick={() => setEditing((e) => !e)}>
                {editing ? "See the redline" : "Edit the wording"}
              </Button>
              <Button variant="quiet" onClick={() => setRejecting(true)}>
                Reject
              </Button>
            </>
          )}
        </div>
      )}

      {amendment.status === "accepted" && (
        <div className="rv-issue-actions">
          <Button
            variant="quiet"
            title="Keep this wording in the precedent library, with the matter it came from"
            onClick={() =>
              precedent.save({
                title: `${clause.title || clause.num} — ${review.matter.counterparty || "negotiated wording"}`.trim(),
                body: amendment.proposedText,
                kind: "clause",
                sourceKind: "review",
                clauseType: clauseTopic(clause.title),
                agreementType: review.matter.matterType,
                jurisdiction: review.matter.governingLaw,
                ourRole: review.mandate.reviewRole,
                counterpartyType: review.matter.counterparty,
                whyUseful: amendment.rationale ?? "",
                sourceNote: `Accepted on ${review.matter.name || "this matter"}`,
                matterId: review.matter.id || null,
                clauseId: clause.id,
                usedAt: amendment.decidedAt ?? null,
              })
            }
          >
            Keep as precedent
          </Button>
        </div>
      )}
      {precedent.dialog}
    </div>
  );
}
