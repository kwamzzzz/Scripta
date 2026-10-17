/**
 * Where you stand, what has moved, and what to do about it.
 *
 * The score is first because it is what a person came to see, and it is
 * immediately followed by the four counts it is made of, so that it can never
 * be a mood: every point on the ring traces to something you can check. Under
 * it is the only chart that answers the question a status cannot — am I
 * moving — and under that, the ranked list of what would move it furthest.
 *
 * Number, working, movement, action. A dashboard that opens with charts and
 * buries the action is one people admire once.
 */
import { useMemo } from "react";
import {
  LEVELS,
  LEVEL_LABEL,
  ROLE_KIND_LABEL,
  STATUS_LABEL,
  fmtDate,
  readRole,
  roleSummary,
  type ProgressionStatus,
} from "@/lib/career/model";
import {
  COMPONENT_LABEL,
  COMPONENT_MEANING,
  areaAdvice,
  areaMix,
  movementSummary,
  readiness,
  trajectory,
  whatWouldMove,
} from "@/lib/career/score";
import { Bars, Donut, LevelBar, Ring, Trajectory } from "./charts";
import type { ViewProps } from "./shared";

const BUCKETS: {
  id: ProgressionStatus;
  tab: "strengths" | "development" | "gaps" | "requirements";
}[] = [
  { id: "strong", tab: "strengths" },
  { id: "evidenced", tab: "requirements" },
  { id: "developing", tab: "development" },
  { id: "none", tab: "gaps" },
];

export default function OverviewView({ role, reading, record, go }: ViewProps) {
  const score = useMemo(
    () => (reading ? readiness(reading.criteria, reading.assessments, reading.claimed) : null),
    [reading],
  );

  /* Replayed from the dates already on the record, so it cannot drift out of
     step with the thing it describes. */
  const points = useMemo(
    () =>
      reading
        ? trajectory(
            reading.criteria,
            record.claims,
            record.evidence,
            (criteria, claimed) => readRole(criteria, claimed).assessments,
          )
        : [],
    [reading, record],
  );

  const levers = useMemo(
    () =>
      reading
        ? whatWouldMove(reading.criteria, reading.assessments, reading.claimed).slice(0, 5)
        : [],
    [reading],
  );

  const mix = useMemo(() => areaMix(record.evidence), [record.evidence]);

  /* Every role read the same way, so "which am I closest to" has an answer. */
  const roles = useMemo(
    () =>
      record.roles
        .filter((r) => !r.archivedAt)
        .map((r) => {
          const criteria = record.criteria
            .filter((c) => c.roleId === r.id)
            .sort((a, b) => a.sortOrder - b.sortOrder);
          const byId = new Map(record.evidence.map((e) => [e.id, e]));
          const claimed = new Map(
            criteria.map((c) => [
              c.id,
              record.claims
                .filter((x) => x.criterionId === c.id)
                .map((x) => byId.get(x.evidenceId))
                .filter((e): e is NonNullable<typeof e> => !!e),
            ]),
          );
          const assessments = readRole(criteria, claimed).assessments;
          return {
            id: r.id,
            label: r.title,
            value: readiness(criteria, assessments, claimed).score,
            detail: `${criteria.length} requirement${criteria.length === 1 ? "" : "s"}`,
          };
        })
        .sort((a, b) => b.value - a.value),
    [record],
  );

  if (!role || !reading || !score) return null;
  const total = reading.assessments.length;
  const live = record.evidence.filter((e) => !e.archivedAt);
  const levelCounts = live.reduce<Record<string, number>>(
    (acc, e) => ({ ...acc, [e.level]: (acc[e.level] ?? 0) + 1 }),
    {},
  );
  const weakest = [...score.components].sort((a, b) => a.value - b.value)[0]!;

  return (
    <div className="cr-dash">
      <section className="cr-card cr-span">
        <div className="cr-card-head">
          <h2>{role.title}</h2>
          <span className="cr-muted">
            {[
              ROLE_KIND_LABEL[role.kind],
              role.organisation,
              role.targetOn ? `by ${fmtDate(role.targetOn)}` : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>

        {total === 0 ? (
          <p className="cr-muted">
            This role has no requirements yet. Add them, or start from a published framework, on the
            Roles tab.
          </p>
        ) : (
          <div className="cr-headline">
            <Ring value={score.score} caption="Readiness" />
            <div className="cr-headline-body">
              <p className="cr-summary">{score.summary}</p>
              {/* The working, always beside the number. */}
              <Bars
                rows={score.components.map((c) => ({
                  label: COMPONENT_LABEL[c.key],
                  value: c.value,
                  detail: c.detail,
                }))}
              />
              <p className="cr-muted">{COMPONENT_MEANING[weakest.key]}</p>
            </div>
          </div>
        )}
      </section>

      {total > 0 && (
        <>
          <section className="cr-card">
            <h2>Are you moving?</h2>
            <p className="cr-muted">
              Replayed month by month from when each piece of evidence was claimed.
            </p>
            {points.length > 1 ? (
              <>
                <Trajectory points={points} />
                <p className="cr-summary">{movementSummary(points)}</p>
              </>
            ) : (
              <p className="cr-muted">Nothing claimed yet, so there is no line to draw.</p>
            )}
          </section>

          <section className="cr-card">
            <h2>What would move it most</h2>
            <p className="cr-muted">
              Each one priced by asking what the score would be if it were carried.
            </p>
            {levers.length ? (
              <ol className="cr-levers">
                {levers.map((l) => (
                  <li key={l.criterion.id}>
                    <span className="cr-lever-gain">+{l.gain}</span>
                    <span className="cr-lever-text">
                      {l.criterion.text}
                      <span className="cr-muted">
                        {STATUS_LABEL[l.status]} → {STATUS_LABEL[l.to]}
                        {!l.criterion.essential ? " · desirable, so worth no points" : ""}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="cr-muted">Every requirement is as far as it goes.</p>
            )}
            <div className="cr-actions cr-actions-left">
              <button type="button" onClick={() => go("next")}>
                What to seek next
              </button>
            </div>
          </section>

          <section className="cr-card">
            <h2>Where it stands</h2>
            <div className="cr-buckets">
              {BUCKETS.map(({ id, tab }) => (
                <button
                  key={id}
                  type="button"
                  className={`cr-bucket is-${id}`}
                  onClick={() => go(tab)}
                >
                  <strong>{reading.byStatus[id].length}</strong>
                  <span>{STATUS_LABEL[id]}</span>
                </button>
              ))}
            </div>
            <p className="cr-muted">{roleSummary(reading)}</p>
          </section>

          <section className="cr-card">
            <h2>Where your experience sits</h2>
            {live.length ? (
              <>
                <Donut
                  slices={mix.map((m) => ({ label: m.area, value: m.count }))}
                  centre={`${live.length}`}
                />
                <p className="cr-muted">{areaAdvice(mix)}</p>
                <h3 className="cr-sub">How far in the work went</h3>
                <LevelBar
                  counts={levelCounts}
                  order={LEVELS}
                  labels={LEVEL_LABEL as unknown as Record<string, string>}
                />
              </>
            ) : (
              <p className="cr-muted">
                Nothing in the portfolio yet. The practice area is set on each piece of evidence.
              </p>
            )}
          </section>

          {roles.length > 1 && (
            <section className="cr-card cr-span">
              <h2>Which role are you closest to?</h2>
              <p className="cr-muted">
                The same evidence, read against each role you keep. Open one to work on it.
              </p>
              <Bars rows={roles} onPick={(id) => go("overview", id)} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
