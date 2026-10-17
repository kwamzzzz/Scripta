/**
 * Issues: what needs a decision.
 *
 * This is the register the old app did not have. A note was a line of text with
 * a resolved flag; an issue is an object with a severity, a kind, the clause it
 * sits on, a recommendation, and a decision recorded in the reviewer's own
 * words. Dismissing one keeps it, because "we considered this and decided it did
 * not matter" is part of the file.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";
import { Button } from "@/components/primitives";
import { C } from "@/lib/tokens";
import type { Clause } from "@/data/legal";
import { ISSUE_KINDS, SEVERITY, sortIssues, type Issue, type IssueStatus } from "./model";
import {
  Card,
  Chip,
  Empty,
  Eyebrow,
  Field,
  Growing,
  KindChip,
  SeverityChip,
  StatusChip,
} from "./ui";
import { fmtWhen, plural } from "./format";
import type { Review } from "./use-review";
import { draftEdits, type DraftedEdit } from "./edits.functions";
import { crossCheckIssue, type CrossCheck } from "./cross-check.functions";
import EditsReview from "./EditsReview";

type Filter = "open" | "all" | "decided";

export default function IssuesTab({
  review,
  matterId,
  clauses,
  onOpenClause,
  onOpenRedline,
}: {
  review: Review;
  matterId: string | null;
  clauses: Clause[];
  onOpenClause: (clauseId: string) => void;
  onOpenRedline: (clauseId: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("open");
  const [severities, setSeverities] = useState<string[]>([]);
  const [kinds, setKinds] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [checked, setChecked] = useState<string | null>(null);

  const clauseName = (id: string | null) => {
    const c = clauses.find((x) => x.id === id);
    return c ? `${c.num} ${c.title}`.trim() : "";
  };

  const pool =
    filter === "open"
      ? review.open
      : filter === "decided"
        ? review.decided
        : sortIssues(review.issues, review.order);
  const shown = pool.filter(
    (i) =>
      (severities.length === 0 || severities.includes(i.severity)) &&
      (kinds.length === 0 || kinds.includes(i.kind)),
  );

  const toggle = (list: string[], set: (v: string[]) => void, key: string) =>
    set(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);

  return (
    <div className="rv">
      <Card
        title="Issue register"
        hint="Every issue carries a severity, the clause it sits on and what we would do about it. Nothing here is deleted: an issue you dismiss stays on the record as one you considered."
        right={
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            {checked && <span style={{ fontSize: 12, color: C.muted }}>{checked}</span>}
            <Button
              disabled={review.checkSchedules.isPending || !matterId}
              title="Read the agreement and its schedules together, and raise where they do not agree"
              onClick={() =>
                matterId &&
                review.checkSchedules.mutate(
                  { matterId },
                  {
                    onSuccess: (r) => {
                      const out = r as { findings: number; modelError: string | null };
                      setChecked(
                        `${plural(out.findings, "conformity finding")}${out.modelError ? ` · the comparison with the schedules did not run: ${out.modelError}` : ""}`,
                      );
                    },
                    onError: (e) =>
                      setChecked(e instanceof Error ? e.message : "The check did not run"),
                  },
                )
              }
            >
              {review.checkSchedules.isPending ? "Checking…" : "Check against schedules"}
            </Button>
            <Button variant={adding ? "secondary" : "primary"} onClick={() => setAdding((a) => !a)}>
              {adding ? (
                "Cancel"
              ) : (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <Plus size={12} strokeWidth={2.2} /> Raise an issue
                </span>
              )}
            </Button>
          </span>
        }
      >
        {adding && <NewIssue review={review} clauses={clauses} onDone={() => setAdding(false)} />}
        <div className="rv-filters">
          {(
            [
              ["open", `Open (${review.open.length})`],
              ["decided", `Decided (${review.decided.length})`],
              ["all", `All (${review.issues.length})`],
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
          <span style={{ width: 10 }} />
          {SEVERITY.map((s) => (
            <button
              key={s.key}
              type="button"
              title={s.meaning}
              className={`rv-pill${severities.includes(s.key) ? " is-on" : ""}`}
              aria-pressed={severities.includes(s.key)}
              onClick={() => toggle(severities, setSeverities, s.key)}
            >
              {s.label}
            </button>
          ))}
          <span style={{ width: 10 }} />
          {ISSUE_KINDS.filter((k) => k.key !== "standard").map((k) => (
            <button
              key={k.key}
              type="button"
              title={k.meaning}
              className={`rv-pill${kinds.includes(k.key) ? " is-on" : ""}`}
              aria-pressed={kinds.includes(k.key)}
              onClick={() => toggle(kinds, setKinds, k.key)}
            >
              {k.label}
            </button>
          ))}
        </div>
      </Card>

      {shown.length === 0 ? (
        <Card>
          <Empty
            title={
              review.issues.length === 0
                ? review.progress.reviewed === 0
                  ? "Nothing has been reviewed yet"
                  : "No issues were raised"
                : "Nothing matches those filters"
            }
          >
            {review.issues.length === 0
              ? review.progress.reviewed === 0
                ? "Run the review from the Summary tab. Scripta reads every clause and raises only the ones that need a decision."
                : `All ${review.progress.reviewed} clauses were read and none of them raised anything. That is a result, not an empty screen.`
              : "Clear a filter, or widen it."}
          </Empty>
        </Card>
      ) : (
        <Card style={{ padding: 0 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {shown.map((issue) => (
              <IssueRow
                key={issue.id}
                issue={issue}
                clauseLabel={clauseName(issue.clauseId)}
                amendments={review.amendments.filter((a) => a.issueId === issue.id)}
                review={review}
                onOpenClause={onOpenClause}
                onOpenRedline={onOpenRedline}
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function IssueRow({
  issue,
  clauseLabel,
  amendments,
  review,
  onOpenClause,
  onOpenRedline,
}: {
  issue: Issue;
  clauseLabel: string;
  amendments: Review["amendments"];
  review: Review;
  onOpenClause: (clauseId: string) => void;
  onOpenRedline: (clauseId: string) => void;
}) {
  /**
   * Whether this issue was written against a register that has since been
   * rebuilt.
   *
   * Reading the document again rebuilds every clause from scratch, and a
   * better reading can change every number in it — a cover page that used to
   * be taken for clause 1 put them all out by one. A finding raised before
   * that says things like "handover is under clause 7.4, but 7.4 governs
   * retainers": true of the reading it was written against, and nonsense
   * against this one. The analysis was not wrong about the contract, it was
   * wrong about which clause is which, and nothing on the card let a reader
   * tell those two apart.
   */
  /**
   * Raised against an earlier reading of this clause.
   *
   * The clause's own date, falling back to the register's: a re-read keeps the
   * date of every clause whose wording and number both survive, so this now
   * flags the findings whose clause actually moved rather than every finding
   * on the matter.
   */
  const builtAt = issue.clauseBuiltAt ?? review.registerBuiltAt;
  const staleReading = !!builtAt && !!issue.createdAt && issue.createdAt < builtAt;

  const [deciding, setDeciding] = useState<IssueStatus | null>(null);
  const [note, setNote] = useState("");
  const draft = useServerFn(draftEdits);
  const check = useServerFn(crossCheckIssue);
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState<CrossCheck | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);

  /** Read the finding back against the contract as it is numbered now. */
  const runCrossCheck = async () => {
    setChecking(true);
    setCheckError(null);
    try {
      setChecked(await check({ data: { matterId: issue.matterId, issueId: issue.id } }));
    } catch (cause) {
      setCheckError(
        cause instanceof Error ? cause.message : "The finding could not be cross-checked.",
      );
    } finally {
      setChecking(false);
    }
  };
  const [fixing, setFixing] = useState(false);
  const [fixError, setFixError] = useState<string | null>(null);
  const [fix, setFix] = useState<{ edits: DraftedEdit[]; note: string } | null>(null);
  const startFix = async () => {
    setFixing(true);
    setFixError(null);
    try {
      setFix(await draft({ data: { matterId: issue.matterId, issueId: issue.id } }));
    } catch (cause) {
      setFixError(cause instanceof Error ? cause.message : "Scripta could not draft the edits.");
    } finally {
      setFixing(false);
    }
  };
  const decided = issue.status !== "open";
  const accepted = amendments.some((a) => a.status === "accepted");

  const commit = (status: IssueStatus) => {
    review.decide.mutate({
      matterId: issue.matterId,
      issueId: issue.id,
      status,
      note,
    });
    setDeciding(null);
    setNote("");
  };

  return (
    <div className={`rv-issue${decided ? " is-decided" : ""}`}>
      <div className="rv-issue-head">
        <span className="rv-issue-ref">#{String(issue.ref).padStart(2, "0")}</span>
        <SeverityChip severity={issue.severity} />
        <KindChip kind={issue.kind} />
        {decided && <StatusChip status={issue.status} />}
        {issue.source === "human" && <Chip tone="quiet">Raised by you</Chip>}
        {accepted && <Chip tone="ok">Amended</Chip>}
        <h3 className="rv-issue-title">{issue.title}</h3>
      </div>

      {issue.clauseId && (
        <button
          type="button"
          className="rv-issue-clause"
          onClick={() => onOpenClause(issue.clauseId!)}
        >
          {clauseLabel || "Open the clause"} →
        </button>
      )}

      {staleReading && (
        <div
          className="rv-issue-body"
          style={{
            background: "#FDF6E3",
            border: "1px solid #E0C987",
            borderRadius: 4,
            padding: "7px 9px",
            color: "#6B5415",
          }}
        >
          Raised against an earlier reading of this clause. The clause numbers in it may not be the
          numbers in the register now — read it against the clause, not the number. Cross-check
          reads it back against the contract as it stands now.
        </div>
      )}
      {issue.detail && <div className="rv-issue-body">{issue.detail}</div>}
      {checkError && (
        <div className="rv-issue-body" style={{ color: "#B3261E" }}>{checkError}</div>
      )}
      {checked && (
        <div
          className="rv-issue-rec"
          style={{
            background:
              checked.verdict === "does_not_stand"
                ? "#FDECEA"
                : checked.verdict === "cannot_tell"
                  ? "#FDF6E3"
                  : "#EAF2EF",
            border: `1px solid ${
              checked.verdict === "does_not_stand"
                ? "#E6A8A2"
                : checked.verdict === "cannot_tell"
                  ? "#E0C987"
                  : "#A8CFC9"
            }`,
            borderRadius: 4,
            padding: "8px 10px",
          }}
        >
          <Eyebrow
            color={
              checked.verdict === "does_not_stand"
                ? "#B3261E"
                : checked.verdict === "cannot_tell"
                  ? "#6B5415"
                  : C.green
            }
          >
            {checked.verdict === "stands"
              ? "CROSS-CHECKED · THE FINDING STANDS"
              : checked.verdict === "does_not_stand"
                ? "CROSS-CHECKED · THE FINDING DOES NOT STAND"
                : "CROSS-CHECKED · CANNOT BE SETTLED FROM THE WORDING"}
          </Eyebrow>
          <div style={{ marginTop: 4 }}>{checked.explanation}</div>
          {checked.checked.length > 0 && (
            <ul style={{ margin: "8px 0 0", paddingLeft: 16 }}>
              {checked.checked.map((c, i) => (
                <li key={i} style={{ marginBottom: 3 }}>
                  <b>{c.ref}</b> — {c.says}
                </li>
              ))}
            </ul>
          )}
          <div style={{ marginTop: 6, fontSize: 11, opacity: 0.75 }}>
            Read against the register as it stands. Check the wording yourself before relying on it.
          </div>
        </div>
      )}
      {issue.recommendation && (
        <div className="rv-issue-rec">
          <Eyebrow color={C.accent}>RECOMMENDED</Eyebrow>
          <div style={{ marginTop: 3 }}>{issue.recommendation}</div>
        </div>
      )}

      {decided && (
        <div className="rv-issue-decision">
          {issue.status === "resolved" ? "Resolved" : "Dismissed"}
          {issue.decidedAt ? ` on ${fmtWhen(issue.decidedAt)}` : ""}
          {issue.decisionNote ? ` — ${issue.decisionNote}` : ". No reason was recorded."}
        </div>
      )}

      {amendments.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {amendments.map((a) => (
            <div key={a.id} style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.6 }}>
              <Chip
                tone={a.status === "accepted" ? "ok" : a.status === "rejected" ? "quiet" : "info"}
              >
                {a.status === "accepted"
                  ? "Amendment accepted"
                  : a.status === "rejected"
                    ? "Amendment rejected"
                    : "Amendment proposed"}
              </Chip>{" "}
              {a.rationale}
            </div>
          ))}
        </div>
      )}

      {fixError && <p className="rv-edits-problem">{fixError}</p>}
      {fix && (
        <EditsReview
          matterId={issue.matterId}
          issueId={issue.id}
          edits={fix.edits}
          note={fix.note}
          onDiscard={() => setFix(null)}
          onOpenRedline={() =>
            onOpenRedline(fix.edits.find((e) => e.clauseId)?.clauseId ?? issue.clauseId ?? "")
          }
        />
      )}

      {deciding ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <Field
            label={deciding === "resolved" ? "How was it resolved?" : "Why are you dismissing it?"}
            hint="This is the decision, and it goes on the record. Scripta reads it, so a later review does not raise the point again."
          >
            <Growing
              value={note}
              rows={2}
              onChange={setNote}
              placeholder={
                deciding === "resolved"
                  ? "e.g. Cap agreed at 12 months' fees in the counterparty's mark-up of 11 September."
                  : "e.g. Commercially accepted by the client; the volume commitment is worth the exposure."
              }
            />
          </Field>
          <div className="rv-issue-actions">
            <Button variant="primary" onClick={() => commit(deciding)}>
              {deciding === "resolved" ? "Resolve" : "Dismiss"}
            </Button>
            <Button variant="quiet" onClick={() => setDeciding(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="rv-issue-actions">
          {decided ? (
            <Button
              variant="quiet"
              disabled={review.decide.isPending}
              onClick={() =>
                review.decide.mutate({
                  matterId: issue.matterId,
                  issueId: issue.id,
                  status: "open",
                })
              }
            >
              Reopen
            </Button>
          ) : (
            <>
              <Button onClick={() => setDeciding("resolved")}>Resolve</Button>
              <Button variant="quiet" onClick={() => setDeciding("dismissed")}>
                Dismiss
              </Button>
              <Button
                variant="primary"
                disabled={fixing || !!fix}
                title="Scripta finds the exact words that need to change, wherever they are in the contract, and shows you the edits before anything is put in"
                onClick={() => void startFix()}
              >
                {fixing ? "Finding the words…" : "Fix with Scripta"}
              </Button>
              <Button
                disabled={checking}
                title="Read this finding back against the contract: the clause it names, the schedules, and every clause it cross-refers to — and say whether it stands"
                onClick={() => void runCrossCheck()}
              >
                {checking ? "Checking…" : checked ? "Check again" : "Cross-check"}
              </Button>
              <Button
                variant="quiet"
                disabled={review.research.isPending}
                title="Open a research matter on this point, linked back to the clause"
                onClick={() =>
                  review.research.mutate({
                    matterId: issue.matterId,
                    issueId: issue.id,
                    clauseId: issue.clauseId,
                  })
                }
              >
                {review.research.isPending ? "Opening…" : "Research this"}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function NewIssue({
  review,
  clauses,
  onDone,
}: {
  review: Review;
  clauses: Clause[];
  onDone: () => void;
}) {
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [kind, setKind] = useState("legal");
  const [clauseId, setClauseId] = useState("");

  return (
    <form
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: "12px 13px",
        border: `1px solid ${C.cardRule}`,
        borderRadius: 7,
        background: C.canvas,
      }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        review.addIssue.mutate(
          {
            matterId: review.matter.id,
            clauseId: clauseId || null,
            title,
            detail,
            recommendation,
            kind,
            severity,
          },
          { onSuccess: onDone },
        );
      }}
    >
      <Field label="The issue" hint="A short noun phrase naming the problem, not a sentence.">
        <input
          className="rv-input"
          value={title}
          autoFocus
          placeholder="e.g. Indemnity is uncapped and survives termination"
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>
      <div className="rv-grid2">
        <Field label="Severity">
          <select
            className="rv-input"
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
          >
            {SEVERITY.map((s) => (
              <option key={s.key} value={s.key} title={s.meaning}>
                {s.label} — {s.meaning}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Kind">
          <select className="rv-input" value={kind} onChange={(e) => setKind(e.target.value)}>
            {ISSUE_KINDS.filter((k) => k.key !== "standard").map((k) => (
              <option key={k.key} value={k.key} title={k.meaning}>
                {k.label} — {k.meaning}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Clause" hint="Leave blank for an issue about the contract as a whole.">
        <select className="rv-input" value={clauseId} onChange={(e) => setClauseId(e.target.value)}>
          <option value="">The contract as a whole</option>
          {clauses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.num} {c.title}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Detail">
        <Growing
          value={detail}
          rows={2}
          onChange={setDetail}
          placeholder="What the problem is, and what it exposes the client to."
        />
      </Field>
      <Field label="Recommendation">
        <Growing
          value={recommendation}
          rows={2}
          onChange={setRecommendation}
          placeholder="What to do about it."
        />
      </Field>
      <div className="rv-issue-actions">
        <Button
          type="submit"
          variant="primary"
          disabled={!title.trim() || review.addIssue.isPending}
        >
          {review.addIssue.isPending ? "Saving…" : "Raise it"}
        </Button>
        <span style={{ fontSize: 11.5, color: C.muted }}>
          {plural(review.issues.length + 1, "issue")} on this matter once saved.
        </span>
      </div>
    </form>
  );
}
