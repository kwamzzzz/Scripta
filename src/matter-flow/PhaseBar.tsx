/**
 * The orange horizontal stepper: the scope of services expressed as phases.
 * Shared by the checklist, repository, timeline and action screens so they
 * stay in sync; clicking a phase switches the body, the arrows step through.
 */
import { useEffect, useState } from "react";
import { Check, Plus } from "lucide-react";
import type { DerivedFlow, DerivedPhase } from "./model";
import { Eyebrow, FLOW, PHASE_STATE_LABEL } from "./ui";

export default function PhaseBar({
  flow,
  selectedId,
  onSelect,
  onAdd,
  onRename,
}: {
  flow: DerivedFlow;
  selectedId: string;
  onSelect: (phaseId: string) => void;
  /** Adds a scope-of-services item at the end of the bar. */
  onAdd?: (() => void) | undefined;
  /** Renames the group of phases. Absent where the bar is read-only. */
  onRename?: ((title: string) => void) | undefined;
}) {
  const index = Math.max(
    0,
    flow.phases.findIndex((p) => p.id === selectedId),
  );
  const step = (delta: number) => {
    const next = flow.phases[index + delta];
    if (next) onSelect(next.id);
  };
  return (
    <div className="mf-phasebar">
      <div
        style={{
          flex: "none",
          background: FLOW.orange,
          color: "#fff",
          padding: "9px 14px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 2,
          minWidth: 190,
        }}
      >
        <PhasesTitle title={flow.phasesTitle} {...(onRename ? { onRename } : {})} />
        <div style={{ fontSize: 10.5, opacity: 0.92, whiteSpace: "nowrap" }}>
          Active for {flow.activeForDays} day{flow.activeForDays === 1 ? "" : "s"} ·{" "}
          {flow.closedCount} of {flow.phases.length} phases closed
        </div>
      </div>
      <button
        type="button"
        className="mf-phasebar-arrow"
        style={{ borderRight: "1px solid #e2e2e2" }}
        aria-label="Previous phase"
        disabled={index === 0}
        onClick={() => step(-1)}
      >
        ‹
      </button>
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          padding: "8px 18px",
          minWidth: 0,
        }}
      >
        {flow.phases.map((phase) => (
          <PhaseStep
            key={phase.id}
            phase={phase}
            selected={phase.id === selectedId}
            onClick={() => onSelect(phase.id)}
          />
        ))}
        {onAdd && (
          <button
            type="button"
            className="mf-phase mf-phase-add"
            onClick={onAdd}
            title="Add a phase (scope-of-services item)"
            style={{ flex: "none", width: 72 }}
          >
            <div className="mf-phase-node">
              <span className="mf-phase-marker is-new">
                <Plus size={10} strokeWidth={2.5} />
              </span>
            </div>
            <div className="mf-phase-name" style={{ color: FLOW.muted }}>
              Add phase
            </div>
            <Eyebrow color="#b5b5b5">NEW</Eyebrow>
          </button>
        )}
      </div>
      <button
        type="button"
        className="mf-phasebar-arrow"
        style={{ borderLeft: "1px solid #e2e2e2" }}
        aria-label="Next phase"
        disabled={index >= flow.phases.length - 1}
        onClick={() => step(1)}
      >
        ›
      </button>
    </div>
  );
}

function PhaseStep({
  phase,
  selected,
  onClick,
}: {
  phase: DerivedPhase;
  selected: boolean;
  onClick: () => void;
}) {
  // The marker says where the phase stands. Whether it is the one being looked
  // at is said separately, by .is-selected on the step — a phase can be
  // complete and selected at once, and each has to read on its own.
  const marker = (
    <span className={`mf-phase-marker is-${phase.state}`}>
      {phase.state === "done" && <Check size={10} strokeWidth={3} />}
    </span>
  );
  const caption =
    phase.state === "active"
      ? `ACTIVE · ${phase.completeCount} OF ${phase.deliverables.length}`
      : PHASE_STATE_LABEL[phase.state];
  return (
    <button
      type="button"
      className={`mf-phase${selected ? " is-selected" : ""}`}
      aria-pressed={selected}
      aria-label={`${phase.name}, ${caption.toLowerCase()}${selected ? ", selected" : ""}`}
      onClick={onClick}
    >
      <div className="mf-phase-node">{marker}</div>
      <div className="mf-phase-name" title={phase.name}>
        {phase.name}
      </div>
      <Eyebrow color={phase.state === "active" ? FLOW.orange : "#6b6b6b"}>{caption}</Eyebrow>
    </button>
  );
}

/**
 * The heading over the phases, which is the matter's word rather than
 * Scripta's: "Scope of Services" is right for a mandate sold as one and wrong
 * for ongoing work, where there are phases and no scope of services.
 *
 * It reads as a heading until you click it, like the task title and the matter
 * fields — correcting a word in passing, not opening a form. Saved on blur and
 * on Enter; Escape puts back what was there.
 */
function PhasesTitle({ title, onRename }: { title: string; onRename?: (title: string) => void }) {
  const [draft, setDraft] = useState(title);
  useEffect(() => setDraft(title), [title]);

  if (!onRename)
    return <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>{title}</div>;

  const commit = () => {
    if (draft.trim() !== title) onRename(draft);
  };
  return (
    <input
      className="mf-phases-title"
      value={draft}
      aria-label="What this matter calls its phases"
      title="Rename the phases of this matter"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          setDraft(title);
          e.currentTarget.blur();
        }
      }}
    />
  );
}
