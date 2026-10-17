/**
 * The portfolio: what you can actually prove you have done.
 *
 * This is the store the whole feature rests on, and it belongs to the person
 * rather than to any role. A transaction proves something about drafting, and
 * about handling a client, and about working to a deadline — in an application
 * to one firm and a promotion case in another. So it is written once and
 * claimed many times, and each piece says how many requirements and roles it
 * is already carrying.
 *
 * The form asks the questions a supervisor would ask, in their order: what was
 * it, how far in were you, how hard, how often, when, and what is there to
 * show for it. The last one is the one that separates evidence from an
 * assertion, so it is never optional-looking.
 */
import { useEffect, useState } from "react";
import { searchWork, type WorkObject } from "@/lib/career/data";
import {
  COMPLEXITY_LABEL,
  EVIDENCE_KINDS,
  EVIDENCE_KIND_LABEL,
  LEVELS,
  LEVEL_LABEL,
  LEVEL_MEANING,
  REPETITION_LABEL,
  RECENCY_LABEL,
  corroborationOf,
  evidenceReach,
  recencyOf,
  type Complexity,
  type Evidence,
  type EvidenceKind,
  type EvidenceLevel,
  type Repetition,
} from "@/lib/career/model";
import { useApp } from "@/store/app";
import { Meter } from "./charts";
import { say, type ViewProps } from "./shared";

/**
 * How much one piece of evidence is worth, on the same four readings the
 * score uses: how far in, how often, how recent, and whether anybody but the
 * author can vouch for it. Shown as a thin bar so a portfolio can be scanned
 * for the weak pieces rather than read end to end.
 */
function strengthOf(e: Evidence): number {
  const level = { exposure: 0.15, assisted: 0.35, performed: 0.6, independent: 0.85, led: 1 }[
    e.level
  ];
  const repeat = { once: 0.7, several: 0.9, routine: 1 }[e.repetition];
  const recent = { current: 1, recent: 0.7, undated: 0.5, historic: 0.35 }[recencyOf(e)];
  const proof = corroborationOf(e) === "supported" ? 1 : 0.4;
  return Math.round(level * repeat * recent * proof * 100);
}

export default function EvidenceView(props: ViewProps) {
  const { record, actions, onProblem } = props;
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const live = record.evidence.filter((e) => !e.archivedAt);

  return (
    <div className="cr-list">
      <div className="cr-actions cr-actions-left">
        <button type="button" className="cr-primary" onClick={() => setAdding(true)}>
          Add evidence
        </button>
        <span className="cr-muted">
          {live.length} {live.length === 1 ? "piece" : "pieces"}, reusable across every role you
          keep.
        </span>
      </div>

      {adding && (
        <EvidenceForm
          onCancel={() => setAdding(false)}
          onSave={async (input) => {
            try {
              const id = await actions.addEvidence.mutateAsync(input);
              setAdding(false);
              setOpenId(id as string);
            } catch (e) {
              onProblem(say(e));
            }
          }}
        />
      )}

      {!live.length && !adding && (
        <p className="cr-muted">
          Nothing yet. A matter you worked on, a document you drafted, research you did, a
          responsibility you took, a course you finished, something somebody said about your work.
        </p>
      )}

      {live.map((e) => (
        <EvidenceCard
          key={e.id}
          {...props}
          evidence={e}
          open={openId === e.id}
          onToggle={() => setOpenId(openId === e.id ? null : e.id)}
        />
      ))}
    </div>
  );
}

function EvidenceCard({
  evidence,
  open,
  onToggle,
  record,
  actions,
  onProblem,
}: ViewProps & { evidence: Evidence; open: boolean; onToggle: () => void }) {
  const reach = evidenceReach(evidence.id, record.claims, record.criteria);
  const corroboration = corroborationOf(evidence);
  const roleNames = reach.roleIds
    .map((id) => record.roles.find((r) => r.id === id)?.title)
    .filter(Boolean);

  return (
    <article className={`cr-ev${open ? " is-open" : ""}`}>
      <button type="button" className="cr-ev-head" onClick={onToggle} aria-expanded={open}>
        <span className="cr-ev-title">
          <strong>{evidence.title}</strong>
          <span className="cr-muted">{EVIDENCE_KIND_LABEL[evidence.kind]}</span>
        </span>
        <span className={`cr-level is-${evidence.level}`}>{LEVEL_LABEL[evidence.level]}</span>
        <span className={`cr-corr is-${corroboration}`}>
          {corroboration === "supported" ? "Corroborated" : "Statement only"}
        </span>
        {evidence.area && <span className="cr-chip">{evidence.area}</span>}
        <Meter
          value={strengthOf(evidence)}
          title={`Strength of this piece: ${strengthOf(evidence)} out of 100`}
        />
        <span className="cr-muted">
          {reach.criterionIds.length
            ? `Carries ${reach.criterionIds.length} requirement${reach.criterionIds.length === 1 ? "" : "s"}${roleNames.length > 1 ? ` across ${roleNames.length} roles` : ""}`
            : "Not claimed yet"}
        </span>
      </button>

      {open && (
        <div className="cr-ev-body">
          <dl className="cr-facts">
            <div>
              <dt>How far in</dt>
              <dd>
                {LEVEL_LABEL[evidence.level]} — {LEVEL_MEANING[evidence.level]}
              </dd>
            </div>
            <div>
              <dt>How often</dt>
              <dd>{REPETITION_LABEL[evidence.repetition]}</dd>
            </div>
            <div>
              <dt>Complexity</dt>
              <dd>{COMPLEXITY_LABEL[evidence.complexity]}</dd>
            </div>
            <div>
              <dt>When</dt>
              <dd>
                {[evidence.happenedOn, evidence.throughTo].filter(Boolean).join(" → ") || "Undated"}
                {" · "}
                {RECENCY_LABEL[recencyOf(evidence)]}
              </dd>
            </div>
          </dl>

          {evidence.statement && <p className="cr-statement">{evidence.statement}</p>}
          {evidence.outcome && (
            <p className="cr-statement">
              <strong>Outcome: </strong>
              {evidence.outcome}
            </p>
          )}

          <WorkLinks evidence={evidence} actions={actions} onProblem={onProblem} />

          {corroboration === "claimed" && (
            <p className="cr-warn">
              Nothing is attached to this but your own account, so it can support a requirement as
              context but will not carry one on its own. Link the work it refers to, attach the
              document, or name somebody who saw it.
            </p>
          )}

          {reach.criterionIds.length > 0 && (
            <div>
              <h4>Claimed against</h4>
              <ul className="cr-ev-list">
                {reach.criterionIds.map((id) => {
                  const c = record.criteria.find((x) => x.id === id);
                  const r = record.roles.find((x) => x.id === c?.roleId);
                  return (
                    <li key={id}>
                      <strong>{c?.text}</strong>
                      <span className="cr-muted">{r?.title}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="cr-actions cr-actions-left">
            <button
              type="button"
              className="cr-danger"
              onClick={() =>
                void actions.removeEvidence.mutateAsync(evidence.id).catch((e) => onProblem(say(e)))
              }
            >
              Delete this evidence
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

/**
 * What in Scripta this evidence points at.
 *
 * A reference, never a copy. The matter stays a matter, under its own access
 * rules; what is kept here is which one it was and what it was called, so the
 * evidence still reads if the work is later archived or handed on.
 */
function WorkLinks({
  evidence,
  actions,
  onProblem,
}: {
  evidence: Evidence;
  actions: ViewProps["actions"];
  onProblem: ViewProps["onProblem"];
}) {
  const { workspaceId } = useApp();
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<WorkObject[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!workspaceId || term.trim().length < 2) {
      setHits([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void searchWork(workspaceId, term)
        .then((r) => !cancelled && setHits(r))
        .catch(() => !cancelled && setHits([]))
        .finally(() => !cancelled && setSearching(false));
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [term, workspaceId]);

  return (
    <div className="cr-links">
      <h4>The work behind it</h4>
      {evidence.links.length > 0 && (
        <div className="cr-claimed">
          {evidence.links.map((l) => (
            <span key={l.id} className="cr-chip">
              <em>{l.kind}</em> {l.label}
              <button
                type="button"
                aria-label={`Unlink ${l.label}`}
                onClick={() =>
                  void actions.unlinkWork.mutateAsync(l.id).catch((e) => onProblem(say(e)))
                }
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Find a matter, document, task, deliverable, research, meeting or precedent"
        aria-label="Search your work in Scripta"
      />
      {searching && <p className="cr-muted">Searching…</p>}
      {hits.length > 0 && (
        <div className="cr-pick">
          {hits.map((h) => (
            <button
              key={`${h.kind}:${h.id}`}
              type="button"
              onClick={() =>
                void actions.linkWork
                  .mutateAsync({
                    evidenceId: evidence.id,
                    kind: h.kind,
                    refId: h.id,
                    label: h.label,
                  })
                  .then(() => setTerm(""))
                  .catch((e) => onProblem(say(e)))
              }
            >
              <strong>{h.label}</strong>
              <span>
                {h.kind} · {h.meta}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EvidenceForm({
  onCancel,
  onSave,
}: {
  onCancel: () => void;
  onSave: (input: {
    title: string;
    kind: EvidenceKind;
    area: string;
    statement: string;
    outcome: string;
    level: EvidenceLevel;
    repetition: Repetition;
    complexity: Complexity;
    happenedOn: string | null;
    throughTo: string | null;
    corroboratedBy: string;
  }) => void;
}) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<EvidenceKind>("work");
  const [area, setArea] = useState("");
  const [statement, setStatement] = useState("");
  const [outcome, setOutcome] = useState("");
  const [level, setLevel] = useState<EvidenceLevel>("performed");
  const [repetition, setRepetition] = useState<Repetition>("once");
  const [complexity, setComplexity] = useState<Complexity>("standard");
  const [happenedOn, setHappenedOn] = useState("");
  const [throughTo, setThroughTo] = useState("");
  const [corroboratedBy, setCorroboratedBy] = useState("");

  return (
    <form
      className="cr-form cr-card"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        onSave({
          title: title.trim(),
          kind,
          area: area.trim(),
          statement: statement.trim(),
          outcome: outcome.trim(),
          level,
          repetition,
          complexity,
          happenedOn: happenedOn || null,
          throughTo: throughTo || null,
          corroboratedBy: corroboratedBy.trim(),
        });
      }}
    >
      <label>
        What it was
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Project Bugatti — UAE entity structuring"
          autoFocus
          required
        />
      </label>
      <div className="cr-row cr-row-3">
        <label>
          Kind
          <select value={kind} onChange={(e) => setKind(e.target.value as EvidenceKind)}>
            {EVIDENCE_KINDS.map((k) => (
              <option key={k} value={k}>
                {EVIDENCE_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Practice area
          <input
            value={area}
            onChange={(e) => setArea(e.target.value)}
            placeholder="Corporate · Disputes · Data protection"
            list="cr-areas"
          />
        </label>
        <label>
          How far in were you
          <select value={level} onChange={(e) => setLevel(e.target.value as EvidenceLevel)}>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {LEVEL_LABEL[l]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="cr-muted cr-hint">{LEVEL_MEANING[level]}</p>
      <div className="cr-row">
        <label>
          How often
          <select value={repetition} onChange={(e) => setRepetition(e.target.value as Repetition)}>
            {(Object.keys(REPETITION_LABEL) as Repetition[]).map((r) => (
              <option key={r} value={r}>
                {REPETITION_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Complexity
          <select value={complexity} onChange={(e) => setComplexity(e.target.value as Complexity)}>
            {(Object.keys(COMPLEXITY_LABEL) as Complexity[]).map((c) => (
              <option key={c} value={c}>
                {COMPLEXITY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="cr-row">
        <label>
          When
          <input type="date" value={happenedOn} onChange={(e) => setHappenedOn(e.target.value)} />
        </label>
        <label>
          Until (if it ran on)
          <input type="date" value={throughTo} onChange={(e) => setThroughTo(e.target.value)} />
        </label>
      </div>
      <label>
        What you did, your part in it, and how hard it was
        <textarea
          rows={4}
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
          placeholder="Drafted the SPA and the disclosure letter, ran the signing checklist, dealt with the buyer's counsel on warranties…"
        />
      </label>
      <label>
        What came of it
        <textarea
          rows={2}
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
          placeholder="Signed on 14 March; the warranty position held."
        />
      </label>
      <label>
        Who saw it (optional)
        <input
          value={corroboratedBy}
          onChange={(e) => setCorroboratedBy(e.target.value)}
          placeholder="The partner who supervised it"
        />
      </label>
      <p className="cr-muted cr-hint">
        You can link the matter, document or deliverable itself once it is saved. Evidence with
        nothing behind it is kept as context rather than proof.
      </p>
      <div className="cr-actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="cr-primary" disabled={!title.trim()}>
          Add to portfolio
        </button>
      </div>
    </form>
  );
}
