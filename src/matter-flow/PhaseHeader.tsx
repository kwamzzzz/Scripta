/** Phase title, description, deadline progress and "n of m complete". */
import type { DerivedPhase } from "./model";
import { Eyebrow, FLOW, LinkAction, fmtDay } from "./ui";

export default function PhaseHeader({
  phase,
  summary,
  onEdit,
}: {
  phase: DerivedPhase;
  summary: string;
  onEdit?: (() => void) | undefined;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0, lineHeight: 1.3 }}>
            {phase.name}
          </h1>
          {onEdit && (
            <LinkAction onClick={onEdit} style={{ color: FLOW.muted }} title="Edit this phase">
              Edit phase
            </LinkAction>
          )}
        </div>
        {phase.description && (
          <div
            style={{
              color: FLOW.grey,
              fontSize: 12.5,
              lineHeight: 1.55,
              marginTop: 4,
              maxWidth: 720,
            }}
          >
            {phase.description}
          </div>
        )}
        {phase.note && (
          <div className="mf-preset-note" style={{ marginTop: 7, maxWidth: 720 }}>
            {phase.note}
          </div>
        )}
      </div>
      <div
        style={{
          flex: "none",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 6,
        }}
      >
        <Eyebrow color="#6b6b6b">PHASE DEADLINE · {fmtDay(phase.deadline, true)}</Eyebrow>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(phase.progress * 100)}
          aria-label={`${phase.name} progress`}
          style={{
            width: 200,
            height: 6,
            borderRadius: 999,
            background: "#eeeeee",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${Math.round(phase.progress * 100)}%`,
              height: "100%",
              background: FLOW.orange,
              borderRadius: 999,
            }}
          />
        </div>
        <div style={{ color: FLOW.grey, fontSize: 11.5 }}>{summary}</div>
      </div>
    </div>
  );
}
