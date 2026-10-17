/**
 * Every requirement, its assessment, and the reasoning behind it.
 *
 * The assessment is never shown as a verdict on its own. Under each one is
 * what it rests on, which evidence carried it, what was read but not counted
 * and why, and what is missing — because a lawyer has to be able to disagree
 * with this, and you cannot disagree with a badge.
 */
import { useState } from "react";
import {
  CRITERION_KIND_LABEL,
  LEVEL_LABEL,
  REPETITION_LABEL,
  RECENCY_LABEL,
  STATUS_LABEL,
  corroborationOf,
  recencyOf,
  type Assessment,
  type Criterion,
  type Evidence,
} from "@/lib/career/model";
import { say, type ViewProps } from "./shared";

export default function RequirementsView(props: ViewProps) {
  const { role, reading } = props;
  const [openId, setOpenId] = useState<string | null>(null);
  if (!role || !reading) return null;

  const bySection = new Map<string, Criterion[]>();
  for (const c of reading.criteria) {
    const key = c.section || "";
    bySection.set(key, [...(bySection.get(key) ?? []), c]);
  }

  return (
    <div className="cr-list">
      {!reading.criteria.length && (
        <p className="cr-muted">This role has no requirements yet. Add them on the Roles tab.</p>
      )}
      {[...bySection.entries()].map(([section, list]) => (
        <section key={section || "all"}>
          {section && <h3 className="cr-section">{section}</h3>}
          {list.map((c) => {
            const a = reading.assessments.find((x) => x.criterionId === c.id)!;
            return (
              <CriterionRow
                key={c.id}
                {...props}
                criterion={c}
                assessment={a}
                claimed={reading.claimed.get(c.id) ?? []}
                open={openId === c.id}
                onToggle={() => setOpenId(openId === c.id ? null : c.id)}
              />
            );
          })}
        </section>
      ))}
    </div>
  );
}

export function CriterionRow({
  criterion,
  assessment,
  claimed,
  open,
  onToggle,
  record,
  actions,
  onProblem,
}: ViewProps & {
  criterion: Criterion;
  assessment: Assessment;
  claimed: Evidence[];
  open: boolean;
  onToggle: () => void;
}) {
  const [picking, setPicking] = useState(false);
  const supporting = assessment.supporting
    .map((id) => claimed.find((e) => e.id === id))
    .filter((e): e is Evidence => !!e);
  const discounted = assessment.discounted
    .map((d) => ({ ...d, evidence: claimed.find((e) => e.id === d.evidenceId) }))
    .filter((d) => d.evidence);
  const spare = record.evidence.filter((e) => !e.archivedAt && !claimed.some((c) => c.id === e.id));

  return (
    <article className={`cr-req is-${assessment.status}${open ? " is-open" : ""}`}>
      <button type="button" className="cr-req-head" onClick={onToggle} aria-expanded={open}>
        <span className={`cr-kind is-${criterion.kind}`}>
          {CRITERION_KIND_LABEL[criterion.kind]}
        </span>
        <span className="cr-req-text">{criterion.text}</span>
        {!criterion.essential && <span className="cr-desirable">Desirable</span>}
        <span className={`cr-status is-${assessment.status}`}>
          {STATUS_LABEL[assessment.status]}
        </span>
      </button>

      {open && (
        <div className="cr-req-body">
          <div className="cr-because">
            <h4>Why it reads this way</h4>
            <ul>
              {assessment.because.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>

          {supporting.length > 0 && (
            <div>
              <h4>What carries it</h4>
              <ul className="cr-ev-list">
                {supporting.map((e) => (
                  <EvidenceLine key={e.id} evidence={e} />
                ))}
              </ul>
            </div>
          )}

          {discounted.length > 0 && (
            <div>
              <h4>Read, but not counted</h4>
              <ul className="cr-ev-list is-discounted">
                {discounted.map((d) => (
                  <li key={d.evidenceId}>
                    <strong>{d.evidence!.title}</strong>
                    <span className="cr-muted">{d.why}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {assessment.gap && (
            <p className="cr-gap">
              <strong>What is missing:</strong> {assessment.gap}
            </p>
          )}

          <div className="cr-actions cr-actions-left">
            <button type="button" onClick={() => setPicking((v) => !v)}>
              {picking ? "Close" : "Claim evidence against this"}
            </button>
            {claimed.length > 0 && (
              <span className="cr-muted">
                {claimed.length} claimed · {supporting.length} corroborated
              </span>
            )}
          </div>

          {picking && (
            <div className="cr-pick">
              {!spare.length && (
                <p className="cr-muted">
                  Everything in your portfolio is already claimed here. Add new evidence on the
                  Evidence tab.
                </p>
              )}
              {spare.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() =>
                    void actions.claim
                      .mutateAsync({ criterionId: criterion.id, evidenceId: e.id })
                      .then(() => setPicking(false))
                      .catch((err) => onProblem(say(err)))
                  }
                >
                  <strong>{e.title}</strong>
                  <span>
                    {LEVEL_LABEL[e.level]} ·{" "}
                    {corroborationOf(e) === "supported" ? "corroborated" : "statement only"}
                  </span>
                </button>
              ))}
            </div>
          )}

          {claimed.length > 0 && (
            <div className="cr-claimed">
              {claimed.map((e) => {
                const claim = record.claims.find(
                  (c) => c.criterionId === criterion.id && c.evidenceId === e.id,
                );
                return (
                  <span key={e.id} className="cr-chip">
                    {e.title}
                    <button
                      type="button"
                      aria-label={`Remove ${e.title} from this requirement`}
                      onClick={() =>
                        claim &&
                        void actions.unclaim
                          .mutateAsync(claim.id)
                          .catch((err) => onProblem(say(err)))
                      }
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function EvidenceLine({ evidence }: { evidence: Evidence }) {
  return (
    <li>
      <strong>{evidence.title}</strong>
      <span className="cr-muted">
        {[
          LEVEL_LABEL[evidence.level],
          REPETITION_LABEL[evidence.repetition],
          RECENCY_LABEL[recencyOf(evidence)],
          evidence.links.length
            ? `${evidence.links.length} linked from Scripta`
            : evidence.fileRef
              ? "file attached"
              : evidence.corroboratedBy
                ? `seen by ${evidence.corroboratedBy}`
                : "",
        ]
          .filter(Boolean)
          .join(" · ")}
      </span>
    </li>
  );
}
