/**
 * The "Waiting on" card (6d): who we are waiting for, the turnaround clock and
 * the follow-up so nothing sits silently.
 */
import { Button } from "@/components/primitives";
import { workingDaysBetween, type DerivedDeliverable } from "./model";
import { Card, Eyebrow, FLOW, fmtDay } from "./ui";

export default function WaitingOnCard({
  deliverable,
  today,
  onFollowUp,
  onLogCall,
}: {
  deliverable: DerivedDeliverable | null;
  today: string;
  onFollowUp: (deliverable: DerivedDeliverable) => void;
  onLogCall: (deliverable: DerivedDeliverable) => void;
}) {
  if (!deliverable?.waitingOn) {
    return (
      <Card>
        <Eyebrow>WAITING ON</Eyebrow>
        <div style={{ color: FLOW.muted, fontSize: 12, lineHeight: 1.5 }}>
          Nothing is waiting on a third party in this phase.
        </div>
      </Card>
    );
  }
  const w = deliverable.waitingOn;
  const total = w.workingDays ?? Math.max(1, workingDaysBetween(w.since, w.expectedBy));
  const elapsed = workingDaysBetween(w.since, today);
  const day = Math.max(1, Math.min(total, elapsed));
  const late = elapsed > total;
  return (
    <Card style={{ border: `1px solid ${FLOW.orangeEdge}`, background: "#fdf7f1" }}>
      <Eyebrow color={FLOW.orangeText}>WAITING ON</Eyebrow>
      <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35 }}>{w.who}</div>
      {w.note && <div style={{ color: FLOW.grey, fontSize: 12, lineHeight: 1.5 }}>{w.note}</div>}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
        <Eyebrow color={late ? FLOW.red : FLOW.orangeText}>
          {late ? `DAY ${elapsed} · EXPECTED BY ${fmtDay(w.expectedBy)}` : `DAY ${day} OF ${total}`}
        </Eyebrow>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={day}
          aria-label="Turnaround"
          style={{
            flex: 1,
            height: 4,
            borderRadius: 999,
            background: "#f5e3d3",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${Math.round((day / total) * 100)}%`,
              height: "100%",
              background: late ? FLOW.red : FLOW.orange,
            }}
          />
        </div>
      </div>
      {w.followUpAt && (
        <div style={{ color: FLOW.grey, fontSize: 11.5 }}>
          Follow-up scheduled for {fmtDay(w.followUpAt)}.
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button variant="primary" onClick={() => onFollowUp(deliverable)}>
          {w.followUpAt ? "Change follow-up" : `Follow up on day ${total}`}
        </Button>
        <Button onClick={() => onLogCall(deliverable)}>Log a call now</Button>
      </div>
    </Card>
  );
}
