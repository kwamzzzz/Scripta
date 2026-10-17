/**
 * Overview: the control centre for the review.
 *
 * Everything a reviewer needs to know before they open the document, and
 * nothing that only looks like analytics. What the contract is, whose side we
 * are on, what its own terms say, how far the review has got, and the work that
 * hangs off it.
 */
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Check, FileText, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/primitives";
import { C } from "@/lib/tokens";
import type { Clause, Matter } from "@/data/legal";
import MandateCard from "./MandateCard";
import PrepareReview, { type Carried } from "./PrepareReview";
import MatterTeamCard from "@/components/MatterTeamCard";
import { useApp } from "@/store/app";
import { SCHEMA_CHOICES, schemaByKey, schemaFor } from "./schemas";
import { Card, Chip, Empty, Eyebrow, Meter, SeverityChip, Stat, Term } from "./ui";
import { fmtWhen, plural } from "./format";
import type { Review } from "./use-review";
import PlaybookLink from "@/components/PlaybookLink";
import TimeRecord from "@/review/TimeRecord";

export default function OverviewTab({
  review,
  matter,
  clauses,
  onOpenClause,
  onGoIssues,
  onRunReview,
  running,
  onPrepared,
  carried,
  onGoDocuments,
}: {
  review: Review;
  matter: Matter;
  clauses: Clause[];
  onOpenClause: (clauseId: string) => void;
  onGoIssues: () => void;
  onRunReview: () => void;
  running: { done: number; of: number } | null;
  /**
   * The clause register was just built from a document on the matter. Given
   * what a re-read kept, or null when there was nothing there to keep — the
   * caller shows the register in that case, and shows this receipt in the
   * other, because after a re-read what a lawyer needs to know is what
   * survived it.
   */
  onPrepared: (carried: Carried | null) => void;
  /** What the last re-read kept, once it has finished. */
  carried: Carried | null;
  onGoDocuments: () => void;
}) {
  const navigate = useNavigate();
  /**
   * Reading the document again, after the clause register already exists.
   *
   * `PrepareReview` used to appear only when a matter had no clauses at all,
   * so once a review was prepared the document could never be re-read. That
   * mattered the moment the parser improved: a contract whose cover page had
   * been taken for clause 1 — pushing every clause number out by one and
   * breaking its cross-references — stayed wrong for good, and the only way
   * out was to delete the matter and start again.
   *
   * It is offered rather than done. Re-reading rebuilds the register from
   * scratch, which discards what the review has since recorded against each
   * clause, so it is not something to do to a lawyer's work unasked.
   */
  const [rereading, setRereading] = useState(false);
  const { workspaceId } = useApp();
  const { progress, mandate } = review;
  const reviewed = mandate.reviewedAt !== null;

  // The schema the key terms are read against. Guessed from the matter type and
  // the document's own name, and overridable, because a matter filed as "Other"
  // is very often something we can recognise from the paper.
  const guessed = schemaFor(
    review.matter.matterType || matter.name,
    matter.docs.map((d) => d.name).join(" "),
  );
  // Terms already extracted tell us which schema they were read against, which
  // beats guessing again; otherwise fall back to the guess.
  const storedKey =
    SCHEMA_CHOICES.find((s) =>
      review.keyTerms.length > 0
        ? schemaByKey(s.key).fields.some((f) => f.key === review.keyTerms[0]!.termKey)
        : false,
    )?.key ?? guessed.key;
  const [schemaKey, setSchemaKey] = useState(storedKey);
  const schema = schemaByKey(schemaKey);
  const termValue = (key: string) => review.keyTerms.find((t) => t.termKey === key);
  const gaps = schema.fields.filter((f) => !termValue(f.key)?.value).length;

  const work = useQuery({
    queryKey: ["matter-review-work", matter.name, review.matter.id],
    enabled: !!review.matter.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("research_matters")
        .select("id, title, kind, updated_at, source_clause_id, source_issue_id")
        .eq("matter_id", review.matter.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      // The generated Supabase types predate the columns this migration added,
      // so the row shape is named here rather than inferred from a stale Row.
      return (data ?? []) as unknown as {
        id: string;
        title: string;
        kind: string;
        updated_at: string;
        source_clause_id: string | null;
        source_issue_id: string | null;
      }[];
    },
  });

  const clauseName = (id: string | null) => {
    const c = clauses.find((x) => x.id === id);
    return c ? `${c.num} ${c.title}`.trim() : "";
  };

  return (
    <div className="rv">
      {/* Read top to bottom: where the review stands, what needs a decision,
          what the contract says, then the file's administration. The brief
          and the people sit beside it. */}
      <div className="rv-cols">
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <Card
            title="Review status"
            right={
              <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                {progress.clauses > 0 && !rereading && (
                  <Button
                    variant="quiet"
                    title="Rebuild the clause register from the document — use it when the document was read wrongly"
                    onClick={() => setRereading(true)}
                  >
                    Read the document again
                  </Button>
                )}
                <Button
                  variant={reviewed ? "secondary" : "primary"}
                  disabled={!!running || clauses.length === 0 || !mandate.reviewFor.trim()}
                  title={
                    !mandate.reviewFor.trim()
                      ? "Say who we act for first"
                      : "Read every clause and raise what needs a decision"
                  }
                  onClick={onRunReview}
                >
                  {running
                    ? `Reading ${running.done} of ${running.of}…`
                    : reviewed
                      ? "Review again"
                      : "Run the review"}
                </Button>
              </span>
            }
          >
            {running && (
              <div className="rv-busy">
                <span className="rv-spin" />
                Reading clause {running.done + 1} of {running.of}. Each one is saved as it finishes,
                so you can leave this tab.
              </div>
            )}
            {carried && (
              <div className="rv-carried" role="status">
                <strong>Read again.</strong>{" "}
                {`${carried.kept} clause${carried.kept === 1 ? "" : "s"} read word for word as before, so what the review recorded against ${
                  carried.kept === 1 ? "it" : "them"
                } was kept`}
                {carried.assessmentsCarried > 0
                  ? `, including ${carried.assessmentsCarried} assessment${
                      carried.assessmentsCarried === 1 ? "" : "s"
                    }.`
                  : "."}
                {carried.renumbered > 0 &&
                  ` ${carried.renumbered} of them ${
                    carried.renumbered === 1 ? "is" : "are"
                  } numbered differently now.`}
                {carried.toRead > 0
                  ? ` ${carried.toRead} clause${carried.toRead === 1 ? "" : "s"} ${
                      carried.toRead === 1 ? "is" : "are"
                    } new or reworded and still need${carried.toRead === 1 ? "s" : ""} reading.`
                  : " Nothing else needs reading."}
                {carried.drafted > 0 &&
                  ` The ${
                    carried.drafted === 1 ? "clause" : `${carried.drafted} clauses`
                  } you drafted here ${
                    carried.drafted === 1
                      ? "is not in the document and was"
                      : "are not in the document and were"
                  } put back in place.`}
              </div>
            )}
            {review.runReview.error && (
              <div style={{ fontSize: 12, color: C.red, lineHeight: 1.55 }}>
                {(review.runReview.error as Error).message}
              </div>
            )}
            <Meter
              fraction={progress.fraction}
              label={`${progress.reviewed} of ${progress.clauses} clauses assessed`}
              tone={progress.fraction === 1 ? C.green : C.accent}
            />
            <div className="rv-stats">
              <Stat n={progress.open} label="Open issues" tone="high" onClick={onGoIssues} />
              <Stat n={progress.critical} label="Critical" tone="critical" onClick={onGoIssues} />
              <Stat n={progress.resolved} label="Resolved" tone="ok" onClick={onGoIssues} />
              <Stat n={progress.dismissed} label="Dismissed" tone="quiet" onClick={onGoIssues} />
            </div>
            {progress.clauses === 0 || rereading ? (
              review.matter.id ? (
                <>
                  {rereading && (
                    <p
                      style={{
                        fontSize: 12.5,
                        color: C.muted,
                        lineHeight: 1.65,
                        margin: "0 0 10px",
                      }}
                    >
                      Reading the document again rebuilds the clause register from it. Every clause
                      whose wording is unchanged keeps what the review recorded against it, even
                      where its number changes, so only genuinely new wording needs reading again.
                      Use it when the document was read wrongly — a cover page taken for clause 1,
                      numbering out by one.
                    </p>
                  )}
                  <PrepareReview
                    matterId={review.matter.id}
                    docs={matter.docs}
                    onPrepared={(kept) => {
                      const reread = rereading;
                      setRereading(false);
                      onPrepared(reread ? (kept ?? null) : null);
                    }}
                    onUpload={onGoDocuments}
                  />
                  {rereading && (
                    <div style={{ marginTop: 8 }}>
                      <Button variant="quiet" onClick={() => setRereading(false)}>
                        Cancel
                      </Button>
                    </div>
                  )}
                </>
              ) : null
            ) : progress.reviewed === 0 ? (
              <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.65 }}>
                Nothing has been read yet. A review reads every clause, says what each one does to
                the party we act for, and raises only the ones that need a decision.
              </div>
            ) : progress.pendingAmendments > 0 ? (
              <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.65 }}>
                {plural(progress.pendingAmendments, "amendment")} proposed and not yet decided.
              </div>
            ) : null}
            {!mandate.reviewFor.trim() && clauses.length > 0 && (
              <div
                style={{
                  display: "flex",
                  gap: 9,
                  alignItems: "flex-start",
                  padding: "11px 13px",
                  border: `1px solid ${C.accentEdge}`,
                  background: C.accentTint,
                  borderRadius: 8,
                  fontSize: 12.5,
                  lineHeight: 1.6,
                  color: C.body,
                }}
              >
                <AlertTriangle
                  size={14}
                  strokeWidth={1.8}
                  color={C.accent}
                  style={{ flex: "none", marginTop: 2 }}
                />
                <span>
                  The review cannot run until you say who we act for. An uncapped indemnity is a
                  problem for the party giving it and a protection for the party taking it, and
                  Scripta has no way to tell which you are.
                </span>
              </div>
            )}
            {reviewed && progress.reviewed < progress.clauses && (
              <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
                <Chip tone="medium">Partly read</Chip> The document was marked reviewed on{" "}
                {fmtWhen(mandate.reviewedAt)}, but{" "}
                {plural(progress.clauses - progress.reviewed, "clause")}{" "}
                {progress.clauses - progress.reviewed === 1 ? "has" : "have"} no assessment. Clauses
                added since then have not been read.
              </div>
            )}
          </Card>

          {review.open.length > 0 && (
            <Card
              title="Needs a decision"
              right={
                <button type="button" className="rv-issue-clause" onClick={onGoIssues}>
                  All {progress.open} →
                </button>
              }
              style={{ paddingBottom: 0 }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 0,
                  margin: "-12px -14px -14px",
                }}
              >
                {review.open.slice(0, 5).map((issue) => (
                  <div key={issue.id} className="rv-issue" style={{ gap: 5 }}>
                    <div className="rv-issue-head">
                      <span className="rv-issue-ref">#{String(issue.ref).padStart(2, "0")}</span>
                      <SeverityChip severity={issue.severity} />
                      <h3 className="rv-issue-title" style={{ fontSize: 12.5 }}>
                        {issue.title}
                      </h3>
                    </div>
                    {issue.clauseId && (
                      <button
                        type="button"
                        className="rv-issue-clause"
                        onClick={() => onOpenClause(issue.clauseId!)}
                      >
                        {clauseName(issue.clauseId)}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card
            title={`Key terms — ${schema.label.toLowerCase()}`}
            hint={
              review.keyTerms.length
                ? "Read against the schema for its type. A blank value means the document does not deal with it."
                : undefined
            }
            right={
              <div className="rv-row">
                <select
                  className="rv-input"
                  style={{ width: "auto", fontSize: 11.5, padding: "4px 26px 4px 8px" }}
                  value={schemaKey}
                  aria-label="Contract type for key terms"
                  onChange={(e) => setSchemaKey(e.target.value)}
                >
                  {SCHEMA_CHOICES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <Button
                  disabled={review.runKeyTerms.isPending || clauses.length === 0}
                  title="Read the document and fill these in"
                  onClick={() =>
                    review.runKeyTerms.mutate({ matterId: review.matter.id, schemaKey })
                  }
                >
                  {review.runKeyTerms.isPending
                    ? "Reading…"
                    : review.keyTerms.length
                      ? "Extract again"
                      : "Extract terms"}
                </Button>
              </div>
            }
          >
            {review.runKeyTerms.error && (
              <div style={{ fontSize: 12, color: C.red, lineHeight: 1.55 }}>
                {(review.runKeyTerms.error as Error).message}
              </div>
            )}
            {review.keyTerms.length === 0 ? (
              <p className="rv-quiet">
                {clauses.length === 0
                  ? "Upload and parse the contract first. There are no clauses to read."
                  : `Not extracted yet. Scripta reads the ${schema.fields.length} terms a ${schema.label.toLowerCase()} contract turns on.`}
              </p>
            ) : (
              <>
                <div className="rv-terms">
                  {schema.fields.map((f) => {
                    const t = termValue(f.key);
                    return (
                      <Term
                        key={f.key}
                        label={f.label}
                        value={t?.value ?? ""}
                        hint={f.hint}
                        placeholder="Not in the document"
                        {...(t?.clauseId
                          ? { onClick: () => onOpenClause(t.clauseId as string) }
                          : {})}
                      />
                    );
                  })}
                </div>
                {gaps > 0 && (
                  <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.6 }}>
                    {plural(gaps, "term")} could not be found. That is a finding in itself where the
                    contract ought to deal with them.
                  </div>
                )}
              </>
            )}
          </Card>

          <Card title="Contract">
            <div className="rv-terms">
              <Term label="Matter" value={matter.name} />
              <Term label="Our client" value={matter.client} />
              <Term label="Counterparty" value={matter.counterparty} />
              <Term label="Type" value={review.matter.matterType} />
              <Term label="Governing law" value={review.matter.governingLaw} />
              <Term label="Stage" value={matter.stage} />
              <Term label="Clauses" value={clauses.length ? String(clauses.length) : ""} />
            </div>
            <PlaybookLink matterId={review.matter.id} workspaceId={workspaceId} />
            <Eyebrow>DOCUMENTS</Eyebrow>
            {matter.docs.length === 0 ? (
              <Empty title="No documents">Nothing has been uploaded to this matter yet.</Empty>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {matter.docs.map((d) => (
                  <div key={d.id} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                    <FileText
                      size={13}
                      strokeWidth={1.6}
                      color={C.faint}
                      style={{ flex: "none", marginTop: 2 }}
                    />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.45 }}>
                        {d.name}
                      </div>
                      <Eyebrow>
                        {[d.kind, d.ver, d.date].filter(Boolean).join(" · ").toUpperCase()}
                      </Eyebrow>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <MandateCard
            mandate={mandate}
            parties={[matter.client, matter.counterparty].filter(Boolean)}
            saving={review.saveMandate.isPending}
            onSave={(next) => review.saveMandate.mutate({ matterId: review.matter.id, ...next })}
          />

          {/* Who is on the file, under the state of the work on it. Placed second
              rather than first so the review's own primary action keeps the top
              of the column. */}
          {workspaceId && <MatterTeamCard matterId={review.matter.id} workspaceId={workspaceId} />}

          {review.matterInstructions.length > 0 && (
            <Card
              title="Standing instructions"
              hint="Decisions already taken. Scripta reads these on every clause, so a second review does not repeat advice you have rejected."
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {review.matterInstructions.map((i) => (
                  <div
                    key={i.id}
                    style={{
                      fontSize: 12.5,
                      lineHeight: 1.6,
                      color: C.body,
                      display: "flex",
                      gap: 7,
                    }}
                  >
                    <Check
                      size={13}
                      strokeWidth={2}
                      color={C.green}
                      style={{ flex: "none", marginTop: 3 }}
                    />
                    <span>{i.body}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card title="Research on this matter">
            {(work.data ?? []).length === 0 ? (
              <p className="rv-quiet">
                None yet. An issue sent to research from the clause panel comes back here.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(work.data ?? []).map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() =>
                      void navigate({
                        to: "/research/$researchId",
                        params: { researchId: r.id },
                      })
                    }
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "baseline",
                      border: 0,
                      background: "none",
                      padding: 0,
                      textAlign: "left",
                      cursor: "pointer",
                      font: "inherit",
                    }}
                  >
                    <Search
                      size={13}
                      strokeWidth={1.6}
                      color={C.faint}
                      style={{ flex: "none", marginTop: 2 }}
                    />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 12.5, color: C.accent, lineHeight: 1.45 }}>
                        {r.title}
                      </div>
                      <Eyebrow>
                        {[
                          r.kind,
                          r.source_clause_id ? clauseName(r.source_clause_id) : "",
                          fmtWhen(r.updated_at),
                        ]
                          .filter(Boolean)
                          .join(" · ")
                          .toUpperCase()}
                      </Eyebrow>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>

          {/* What has been written up against the file. The clock in the header
              measures; this is what was said about it. */}
          <TimeRecord matterId={review.matter.id || null} />
        </div>
      </div>
    </div>
  );
}
