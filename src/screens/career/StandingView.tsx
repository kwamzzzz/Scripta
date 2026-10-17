/**
 * Strengths, development areas and gaps: three readings of the same assessment.
 *
 * They are separate views because they are separate questions asked at
 * separate moments — what do I lead with, what am I part way through, and what
 * have I simply never done. Each one shows the reasoning rather than a list of
 * titles, because "you are strong at this" is only useful with the sentence
 * that follows it.
 */
import {
  LEVEL_LABEL,
  STATUS_LABEL,
  nextExperience,
  type Evidence,
  type ProgressionStatus,
} from "@/lib/career/model";
import type { ViewProps } from "./shared";

const VIEWS = {
  strengths: {
    statuses: ["strong"] as ProgressionStatus[],
    title: "Strengths",
    blurb:
      "Requirements carried by corroborated work at your own judgement or above, done more than once and recently enough to still speak for you.",
    empty:
      "Nothing reaches this yet. A requirement becomes a strength when you have done it independently, more than once, and the work is attached.",
  },
  development: {
    statuses: ["evidenced", "developing"] as ProgressionStatus[],
    title: "Development areas",
    blurb:
      "Part of the way there: evidence exists, but it is thin, supervised, unsupported or old. These are the ones that move with one more piece of work.",
    empty: "Nothing is part-way. Every requirement is either carried or untouched.",
  },
  gaps: {
    statuses: ["none"] as ProgressionStatus[],
    title: "Gaps",
    blurb:
      "Nothing meaningful stands against these yet. A gap is not a failing — it is the list of what to go and get.",
    empty: "Nothing is empty. Every requirement has something against it.",
  },
} as const;

export default function StandingView({
  role,
  reading,
  record,
  go,
  which,
}: ViewProps & { which: keyof typeof VIEWS }) {
  if (!role || !reading) return null;
  const view = VIEWS[which];
  const rows = reading.assessments
    .filter((a) => (view.statuses as readonly ProgressionStatus[]).includes(a.status))
    .map((a) => ({ a, criterion: reading.criteria.find((c) => c.id === a.criterionId)! }))
    .sort((x, y) => Number(y.criterion.essential) - Number(x.criterion.essential));

  return (
    <div className="cr-list">
      <header className="cr-view-head">
        <h2>{view.title}</h2>
        <p className="cr-muted">{view.blurb}</p>
      </header>

      {!rows.length && <p className="cr-muted">{view.empty}</p>}

      {rows.map(({ a, criterion }) => {
        const claimed = reading.claimed.get(criterion.id) ?? [];
        const supporting = a.supporting
          .map((id) => claimed.find((e) => e.id === id))
          .filter((e): e is Evidence => !!e);
        return (
          <article key={criterion.id} className={`cr-req is-${a.status} is-open`}>
            <div className="cr-req-head as-static">
              <span className="cr-req-text">{criterion.text}</span>
              {!criterion.essential && <span className="cr-desirable">Desirable</span>}
              <span className={`cr-status is-${a.status}`}>{STATUS_LABEL[a.status]}</span>
            </div>
            <div className="cr-req-body">
              <ul className="cr-because-list">
                {a.because.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
              {supporting.length > 0 && (
                <p className="cr-muted">
                  Carried by{" "}
                  {supporting
                    .map((e) => `${e.title} (${LEVEL_LABEL[e.level].toLowerCase()})`)
                    .join("; ")}
                  .
                </p>
              )}
              {a.gap && (
                <p className="cr-gap">
                  <strong>What is missing:</strong> {a.gap}
                </p>
              )}
              {which !== "strengths" && (
                <p className="cr-next">
                  <strong>Next:</strong> {nextExperience(criterion, a)}
                </p>
              )}
            </div>
          </article>
        );
      })}

      {rows.length > 0 && which !== "strengths" && (
        <div className="cr-actions cr-actions-left">
          <button type="button" onClick={() => go("evidence")}>
            Add evidence
          </button>
          <span className="cr-muted">
            {record.evidence.filter((e) => !e.archivedAt).length} pieces in your portfolio to claim
            from.
          </span>
        </div>
      )}
    </div>
  );
}
