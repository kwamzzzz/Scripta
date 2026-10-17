/**
 * What the Scripta panel shows about the clause the lawyer is looking at.
 *
 * The panel used to wait to be asked. On a review screen it should already be
 * reading the clause: what it does, what it means for the party we act for, what
 * we would do about it, what that rests on, and the three things worth doing
 * next. The chat stays underneath for the question this does not answer.
 */
import { useState } from "react";
import { BookOpen, Gavel, Scale } from "lucide-react";
import { Button } from "@/components/primitives";
import { C } from "@/lib/tokens";
import { tagByKey } from "@/lib/clause-tags";
import type { Clause } from "@/data/legal";
import { severityMeta, type ClauseReview } from "./model";
import { Chip, Empty, Eyebrow, Field, Growing, KindChip, SeverityChip, StatusChip } from "./ui";
import { clauseTopic, plural } from "./format";
import { PersonPicker } from "@/components/Person";
import { useMatterTeam } from "@/lib/matter-team";
import { useSetClauseReviewer } from "@/lib/clause-reviewer";
import type { Review } from "./use-review";
import { useSavePrecedent } from "@/components/SavePrecedent";

/** The clause as it now reads: insertions in, deletions out. */
const clauseText = (clause: Clause) =>
  clause.segs
    .filter((s) => s.k !== "d")
    .map((s) => s.t)
    .join("")
    .trim();

export default function ClauseBrief({
  clause,
  entry,
  review,
  onAddInstruction,
  onGoRedline,
  onGoIssues,
}: {
  clause: Clause | null;
  entry: ClauseReview | undefined;
  review: Review;
  /** Clause instructions live in the comments table, which the editor owns. */
  onAddInstruction: (clauseId: string, body: string) => void;
  onGoRedline: (clauseId: string) => void;
  onGoIssues: () => void;
}) {
  const team = useMatterTeam(review.matter.id);
  const setReviewer = useSetClauseReviewer(review.matter.id);
  const [instruction, setInstruction] = useState("");
  const [raising, setRaising] = useState(false);
  const [title, setTitle] = useState("");
  const precedent = useSavePrecedent();

  if (!clause)
    return (
      <div className="rv-brief">
        <div className="rv-brief-section">
          <Empty title="No clause selected">
            Pick a clause in the navigator and its reading appears here.
          </Empty>
        </div>
      </div>
    );

  const assessment = entry?.assessments[0] ?? null;
  const open = (entry?.issues ?? []).filter((i) => i.status === "open");
  const decided = (entry?.issues ?? []).filter((i) => i.status !== "open");
  const pending = (entry?.amendments ?? []).filter((a) => a.status === "proposed");
  const tag = clause.classification ? tagByKey(clause.classification) : null;

  return (
    <div className="rv-brief">
      <div className="rv-brief-head">
        <div className="rv-brief-clause">{`${clause.num} ${clause.title}`.trim()}</div>
        <div className="rv-row">
          {assessment ? (
            <>
              <SeverityChip severity={assessment.severity} />
              <KindChip kind={assessment.kind} />
            </>
          ) : (
            <Chip tone="quiet">Not yet assessed</Chip>
          )}
          {tag && (
            <Chip tone="quiet" title={tag.meaning}>
              {tag.label}
            </Chip>
          )}
          {clause.change !== "Baseline" && <Chip tone="info">{clause.change}</Chip>}
        </div>
      </div>

      {/* Who is answerable for this clause. A clause belongs to a matter, so
          the only people who can be are the ones on that matter's team. */}
      <div className="rv-brief-section rv-brief-reviewer">
        <label htmlFor="clause-reviewer">Reviewer</label>
        <PersonPicker
          id="clause-reviewer"
          value={clause.assigneeId ?? null}
          team={team.data ?? []}
          unassignedLabel="Nobody yet"
          onChange={(userId) => setReviewer.mutate({ clauseId: clause.id, userId })}
        />
      </div>

      {!assessment ? (
        <div className="rv-brief-section">
          <Empty title="Scripta has not read this clause">
            {review.mandate.reviewFor
              ? "Run the review from the Summary tab and every clause is read in one pass, or use the button below for this one."
              : "Say who we act for on the Summary tab first. Whether a clause is a risk or a protection depends on which side of it the client is."}
          </Empty>
          {review.mandate.reviewFor && (
            <Button
              disabled={review.runReview.isPending}
              onClick={() =>
                review.runReview.mutate({
                  matterId: review.matter.id,
                  clauseIds: [clause.id],
                })
              }
            >
              {review.runReview.isPending ? "Reading…" : "Read this clause"}
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="rv-brief-section">
            <Eyebrow>WHAT IT DOES</Eyebrow>
            <p>{assessment.summary}</p>
          </div>

          {assessment.clientImpact && (
            <div className="rv-brief-section">
              <Eyebrow color={C.accent}>
                FOR {(review.mandate.reviewFor || "OUR CLIENT").toUpperCase()}
              </Eyebrow>
              <p>{assessment.clientImpact}</p>
            </div>
          )}

          {assessment.recommendation && (
            <div className="rv-brief-section">
              <Eyebrow>RECOMMENDATION</Eyebrow>
              <p>{assessment.recommendation}</p>
            </div>
          )}

          {assessment.verdict && (
            <div className="rv-brief-section">
              <Eyebrow>AGAINST THE PLAYBOOK</Eyebrow>
              <div className="rv-row">
                <Chip tone={assessment.verdict === "Consistent" ? "ok" : "medium"}>
                  {assessment.verdict}
                </Chip>
              </div>
              {assessment.detail && <p>{assessment.detail}</p>}
            </div>
          )}

          {assessment.authorities.length > 0 && (
            <div className="rv-brief-section">
              <Eyebrow>AUTHORITY</Eyebrow>
              <div className="rv-brief-auth">
                {assessment.authorities.map((a, i) => (
                  <div key={`${a.cite}-${i}`} className="rv-brief-auth-row">
                    <span style={{ flex: "none", marginTop: 2 }}>
                      {a.kind === "case" ? (
                        <Gavel size={12} strokeWidth={1.7} color={C.faint} />
                      ) : a.kind === "commentary" ? (
                        <BookOpen size={12} strokeWidth={1.7} color={C.faint} />
                      ) : (
                        <Scale size={12} strokeWidth={1.7} color={C.faint} />
                      )}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      {a.cite}
                      {a.status !== "current" && a.status !== "unknown" && (
                        <>
                          {" "}
                          <Chip tone={a.status === "repealed" ? "high" : "medium"}>{a.status}</Chip>
                        </>
                      )}
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.55 }}>
                Check each citation before it goes in a document. Scripta was told not to invent
                one, which is not the same as it never having done so.
              </div>
            </div>
          )}
        </>
      )}

      <div className="rv-brief-actions">
        <Button
          disabled={review.propose.isPending}
          title="Draft replacement wording for this clause"
          onClick={() =>
            review.propose.mutate(
              { matterId: review.matter.id, clauseId: clause.id, issueId: open[0]?.id ?? null },
              { onSuccess: () => onGoRedline(clause.id) },
            )
          }
        >
          {review.propose.isPending ? "Drafting…" : "Propose amendment"}
        </Button>
        <Button
          disabled={review.research.isPending}
          title="Open a research matter on this clause, linked back to it"
          onClick={() =>
            review.research.mutate({
              matterId: review.matter.id,
              clauseId: clause.id,
              issueId: open[0]?.id ?? null,
            })
          }
        >
          {review.research.isPending ? "Opening…" : "Research this issue"}
        </Button>
        <Button onClick={() => setRaising((r) => !r)}>
          {raising ? "Cancel" : "Add to issues"}
        </Button>
      </div>

      {raising && (
        <div className="rv-brief-section">
          <Field label="The issue" hint="It joins the register with a number, at medium severity.">
            <Growing
              value={title}
              rows={2}
              onChange={setTitle}
              placeholder="e.g. No cure period before termination for breach"
            />
          </Field>
          <Button
            variant="primary"
            disabled={!title.trim() || review.addIssue.isPending}
            onClick={() =>
              review.addIssue.mutate(
                {
                  matterId: review.matter.id,
                  clauseId: clause.id,
                  title,
                  severity: "medium",
                  kind: assessment?.kind === "standard" ? "legal" : (assessment?.kind ?? "legal"),
                },
                {
                  onSuccess: () => {
                    setTitle("");
                    setRaising(false);
                  },
                },
              )
            }
          >
            {review.addIssue.isPending ? "Saving…" : "Raise it"}
          </Button>
        </div>
      )}

      {open.length > 0 && (
        <div className="rv-brief-section" style={{ gap: 0, padding: "12px 0 0" }}>
          <div style={{ padding: "0 16px 8px" }}>
            <Eyebrow>{plural(open.length, "OPEN ISSUE").toUpperCase()} ON THIS CLAUSE</Eyebrow>
          </div>
          {open.map((issue) => (
            <div key={issue.id} className="rv-brief-issue">
              <div className="rv-row">
                <span className="rv-issue-ref">#{String(issue.ref).padStart(2, "0")}</span>
                <SeverityChip severity={issue.severity} />
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.4, color: C.text }}>
                {issue.title}
              </div>
              {issue.detail && (
                <div style={{ fontSize: 12, lineHeight: 1.6, color: C.body }}>{issue.detail}</div>
              )}
              <button type="button" className="rv-issue-clause" onClick={onGoIssues}>
                Decide it in the register →
              </button>
            </div>
          ))}
        </div>
      )}

      {pending.length > 0 && (
        <div className="rv-brief-section">
          <Eyebrow color={C.amber}>
            {plural(pending.length, "AMENDMENT").toUpperCase()} PROPOSED
          </Eyebrow>
          <p style={{ fontSize: 12 }}>
            Wording is waiting on your decision. It is not in the document until you accept it.
          </p>
          <Button onClick={() => onGoRedline(clause.id)}>See the redline</Button>
        </div>
      )}

      {decided.length > 0 && (
        <div className="rv-brief-section">
          <Eyebrow>ALREADY DECIDED</Eyebrow>
          {decided.map((issue) => (
            <div key={issue.id} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <div className="rv-row">
                <StatusChip status={issue.status} />
                <span style={{ fontSize: 12, color: C.body }}>{issue.title}</span>
              </div>
              {issue.decisionNote && (
                <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.55 }}>
                  {issue.decisionNote}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="rv-brief-section">
        <Eyebrow>INSTRUCT SCRIPTA ON THIS CLAUSE</Eyebrow>
        <p style={{ fontSize: 11.5, color: C.muted }}>
          A clause instruction is a decision, and it persists. Reviewing again will not raise a
          point you have told Scripta to leave alone.
        </p>
        {(entry?.instructions ?? []).map((i) => (
          <div
            key={i.id}
            style={{
              fontSize: 12,
              lineHeight: 1.6,
              color: C.body,
              borderLeft: `2px solid ${C.green}`,
              paddingLeft: 9,
            }}
          >
            {i.body}
          </div>
        ))}
        <Growing
          value={instruction}
          rows={2}
          onChange={setInstruction}
          placeholder="e.g. We have accepted this cap. Do not raise it again."
        />
        <Button
          disabled={!instruction.trim()}
          onClick={() => {
            onAddInstruction(clause.id, instruction);
            setInstruction("");
          }}
        >
          Save the instruction
        </Button>
      </div>

      <div className="rv-brief-section">
        <Eyebrow>KEEP THIS WORDING</Eyebrow>
        <p style={{ fontSize: 11.5, color: C.muted }}>
          The clause as it now reads, kept with the matter, the side we acted for and why it is
          worth reaching for again.
        </p>
        <Button
          onClick={() =>
            precedent.save({
              title: `${clause.title || clause.num}`.trim(),
              body: clauseText(clause),
              kind: "clause",
              sourceKind: "review",
              clauseType: clauseTopic(clause.title),
              agreementType: review.matter.matterType,
              jurisdiction: review.matter.governingLaw,
              ourRole: review.mandate.reviewRole,
              counterpartyType: review.matter.counterparty,
              sourceNote: `From ${review.matter.name || "a contract review"}`,
              matterId: review.matter.id || null,
              clauseId: clause.id,
            })
          }
        >
          Save as precedent
        </Button>
      </div>

      {assessment && (
        <div className="rv-brief-section" style={{ borderBottom: 0 }}>
          <Eyebrow>
            {assessment.source === "ai" ? "READ BY SCRIPTA" : "EDITED BY A REVIEWER"}
          </Eyebrow>
          <p style={{ fontSize: 11.5, color: C.muted }}>
            Rated {severityMeta(assessment.severity).label.toLowerCase()} for{" "}
            {review.mandate.reviewFor || "our client"}:{" "}
            {severityMeta(assessment.severity).meaning.charAt(0).toLowerCase()}
            {severityMeta(assessment.severity).meaning.slice(1)}
          </p>
        </div>
      )}
      {precedent.dialog}
    </div>
  );
}
