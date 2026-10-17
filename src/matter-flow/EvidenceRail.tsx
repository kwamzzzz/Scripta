/**
 * Evidence collected (6d): receipts, email threads, call notes and photos
 * that make an action count as done. Compact rail in the phase header, and
 * the full "Evidence" view grouped per action.
 */
import { Mail, StickyNote } from "lucide-react";
import type { DerivedDeliverable, DerivedPhase, Evidence } from "./model";
import { Card, Eyebrow, FLOW, LinkAction, fmtDay } from "./ui";
import { useFileUrl } from "@/lib/files";

function DocGlyph({ evidence }: { evidence: Evidence }) {
  if (evidence.emailRef)
    return (
      <span
        style={{
          flex: "none",
          width: 26,
          height: 32,
          border: `1px solid ${FLOW.rule}`,
          borderRadius: 3,
          background: "#fbfbfb",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: FLOW.grey,
        }}
      >
        <Mail size={12} strokeWidth={1.8} />
      </span>
    );
  if (!evidence.fileRef && evidence.note)
    return (
      <span
        style={{
          flex: "none",
          width: 26,
          height: 32,
          border: `1px solid ${FLOW.rule}`,
          borderRadius: 3,
          background: "#fbfbfb",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: FLOW.grey,
        }}
      >
        <StickyNote size={12} strokeWidth={1.8} />
      </span>
    );
  return (
    <span
      aria-hidden
      style={{
        flex: "none",
        width: 26,
        height: 32,
        border: `1px solid ${FLOW.rule}`,
        borderRadius: 3,
        background: "#fbfbfb",
        display: "flex",
        flexDirection: "column",
        gap: 3,
        padding: "5px 4px",
      }}
    >
      <span style={{ height: 2, background: "#c6c6c6", borderRadius: 1 }} />
      <span style={{ height: 2, background: FLOW.rule, borderRadius: 1, width: "80%" }} />
      <span style={{ height: 2, background: FLOW.rule, borderRadius: 1, width: "60%" }} />
    </span>
  );
}

function EvidenceItem({ evidence }: { evidence: Evidence }) {
  const meta = evidence.meta ?? fmtDay(evidence.createdAt);
  const href = useFileUrl(evidence.fileRef);
  const body = (
    <>
      <DocGlyph evidence={evidence} />
      <div style={{ minWidth: 0 }}>
        <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {evidence.name}
        </div>
        <div style={{ color: FLOW.muted, fontSize: 11, whiteSpace: "nowrap" }}>{meta}</div>
      </div>
    </>
  );
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      style={{
        display: "flex",
        gap: 9,
        alignItems: "center",
        fontSize: 12,
        color: "inherit",
        textDecoration: "none",
        minWidth: 0,
      }}
    >
      {body}
    </a>
  ) : (
    <div style={{ display: "flex", gap: 9, alignItems: "center", fontSize: 12, minWidth: 0 }}>
      {body}
    </div>
  );
}

/** The compact card in the 6d header row: the latest evidence in this phase. */
export function EvidenceRail({ phase, limit = 4 }: { phase: DerivedPhase; limit?: number }) {
  const items = phase.deliverables
    .flatMap((d) => d.evidence)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
  return (
    <Card>
      <Eyebrow>EVIDENCE COLLECTED</Eyebrow>
      {items.length === 0 ? (
        <div style={{ color: FLOW.muted, fontSize: 12, lineHeight: 1.5 }}>
          Nothing logged yet. Ticking an action asks for its evidence.
        </div>
      ) : (
        items.map((e) => <EvidenceItem key={e.id} evidence={e} />)
      )}
    </Card>
  );
}

/** The full Evidence view: every action in the phase with what proves it. */
export function EvidenceView({
  phase,
  highlightId,
  onAdd,
}: {
  phase: DerivedPhase;
  highlightId?: string | null;
  onAdd: (deliverable: DerivedDeliverable) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, overflow: "auto", flex: 1 }}>
      {phase.deliverables.map((d, i) => (
        <div
          key={d.id}
          style={{ display: "flex", flexDirection: "column", gap: 10 }}
          id={`deliverable-${d.id}`}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Eyebrow
              color={d.id === highlightId ? FLOW.orange : FLOW.muted}
              style={{ whiteSpace: "normal" }}
            >
              ACTION {i + 1} · {d.name}
            </Eyebrow>
            <div style={{ flex: 1, height: 1, background: FLOW.line }} />
            <LinkAction onClick={() => onAdd(d)}>Add evidence</LinkAction>
          </div>
          <EvidenceCards evidence={d.evidence} />
        </div>
      ))}
    </div>
  );
}

/** Evidence as tiles in the repository grid; the empty case names what is missing. */
export function EvidenceCards({ evidence }: { evidence: Evidence[] }) {
  if (evidence.length === 0)
    return (
      <div style={{ color: FLOW.muted, fontSize: 12, paddingLeft: 2 }}>
        No evidence yet — ticking the action asks for it.
      </div>
    );
  return (
    <div className="mf-grid">
      {evidence.map((e) => (
        <Card key={e.id} style={{ padding: "10px 12px" }}>
          <EvidenceItem evidence={e} />
          {e.note && (
            <div style={{ color: FLOW.grey, fontSize: 11.5, lineHeight: 1.5 }}>{e.note}</div>
          )}
        </Card>
      ))}
    </div>
  );
}
