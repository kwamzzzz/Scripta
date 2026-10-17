/**
 * What to go and do next.
 *
 * Ordered by what would move furthest: the essential requirements with nothing
 * against them, then the ones a single piece of work would carry, then the
 * refinements. Each line says the next step from where the evidence actually
 * stands — "ask to run one without supervision" rather than "gain more
 * experience in this area", which is advice nobody needed.
 */
import {
  STATUS_LABEL,
  nextExperience,
  type Assessment,
  type Criterion,
  type ProgressionStatus,
} from "@/lib/career/model";
import type { ViewProps } from "./shared";

/* Empty first: you cannot refine what you have never done. */
const URGENCY: Record<ProgressionStatus, number> = {
  none: 0,
  developing: 1,
  evidenced: 2,
  strong: 3,
};

export default function NextView({ role, reading, go }: ViewProps) {
  if (!role || !reading) return null;

  const rows: { criterion: Criterion; a: Assessment }[] = reading.assessments
    .map((a) => ({ a, criterion: reading.criteria.find((c) => c.id === a.criterionId)! }))
    .filter(({ a }) => a.status !== "strong")
    .sort(
      (x, y) =>
        URGENCY[x.a.status] - URGENCY[y.a.status] ||
        Number(y.criterion.essential) - Number(x.criterion.essential),
    );

  return (
    <div className="cr-list">
      <header className="cr-view-head">
        <h2>Next experience</h2>
        <p className="cr-muted">
          The work worth seeking, hardest gaps first. Nothing here is a task Scripta will chase you
          about — it is what to ask for when the next piece of work is being handed out.
        </p>
      </header>

      {!rows.length && (
        <p className="cr-muted">
          Every requirement in this role is strongly evidenced. What would add to it now is
          supervising somebody else through this work, or a more complex instance of it.
        </p>
      )}

      <ol className="cr-next-list">
        {rows.map(({ criterion, a }) => (
          <li key={criterion.id} className={`is-${a.status}`}>
            <div className="cr-next-req">
              <span className="cr-req-text">{criterion.text}</span>
              <span className={`cr-status is-${a.status}`}>{STATUS_LABEL[a.status]}</span>
            </div>
            <p>{nextExperience(criterion, a)}</p>
            {a.gap && <p className="cr-muted">{a.gap}</p>}
          </li>
        ))}
      </ol>

      {rows.length > 0 && (
        <div className="cr-actions cr-actions-left">
          <button type="button" onClick={() => go("evidence")}>
            Record something you have done
          </button>
          <button type="button" onClick={() => go("requirements")}>
            Back to the requirements
          </button>
        </div>
      )}
    </div>
  );
}
