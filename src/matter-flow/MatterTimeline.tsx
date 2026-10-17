/**
 * Timeline (6c): every deliverable of every phase plotted against its
 * deadline. A fixed 250px label column and a time grid render from the same
 * row array so heights match; bars sit as percentages of the visible range,
 * so zooming is a scale change; phase deadlines are diamonds; today is orange.
 */
import { useMemo } from "react";
import { toDate, isoDate, type DerivedDeliverable, type DerivedFlow } from "./model";
import { Eyebrow, FLOW, STATE_CHIP, fmtDay, monthShort } from "./ui";

type Row =
  | { kind: "phase"; id: string; label: string }
  | { kind: "deliverable"; id: string; label: string; deliverable: DerivedDeliverable }
  | { kind: "milestone"; id: string; label: string; date: string; tag: string };

const PHASE_H = 34;
const ROW_H = 36;

const monthStart = (iso: string) => {
  const d = toDate(iso);
  return new Date(d.getFullYear(), d.getMonth(), 1);
};
const monthAfter = (iso: string) => {
  const d = toDate(iso);
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
};

function stateTag(d: DerivedDeliverable, today: string) {
  switch (d.state) {
    case "complete":
      return d.finalVersion ? `${d.finalVersion.label} final` : `Done ${fmtDay(d.deadline)}`;
    case "overdue": {
      const days = Math.round(
        (toDate(today).getTime() - toDate(d.deadline).getTime()) / 86_400_000,
      );
      return `Overdue ${days} day${days === 1 ? "" : "s"}`;
    }
    case "due_today":
      return "Due today";
    case "waiting_on":
      return d.waitingOn ? `Waiting · by ${fmtDay(d.waitingOn.expectedBy)}` : "Waiting";
    case "in_progress":
      return `Due ${fmtDay(d.deadline)}`;
    default:
      return `${fmtDay(d.start)} – ${fmtDay(d.deadline)}`;
  }
}

export default function MatterTimeline({
  flow,
  today,
  onOpen,
}: {
  flow: DerivedFlow;
  today: string;
  onOpen: (deliverable: DerivedDeliverable) => void;
}) {
  const { rows, months, range } = useMemo(() => {
    const rows: Row[] = [];
    const dates: string[] = [today];
    for (const p of flow.phases) {
      rows.push({ kind: "phase", id: p.id, label: p.name });
      for (const d of p.deliverables) {
        rows.push({ kind: "deliverable", id: d.id, label: d.name, deliverable: d });
        dates.push(d.start, d.deadline);
      }
      rows.push({
        kind: "milestone",
        id: `${p.id}-deadline`,
        label: "Phase deadline",
        date: p.deadline,
        tag: fmtDay(p.deadline),
      });
      dates.push(p.deadline);
    }
    const sorted = [...dates].sort();
    const from = monthStart(sorted[0] ?? today);
    const to = monthAfter(sorted.at(-1) ?? today);
    const months: { label: string; year: number }[] = [];
    const cursor = new Date(from);
    while (cursor < to) {
      months.push({
        label: monthShort(cursor.getMonth()).toUpperCase(),
        year: cursor.getFullYear(),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return { rows, months, range: { from: from.getTime(), to: to.getTime() } };
  }, [flow, today]);

  const pct = (iso: string) =>
    Math.max(
      0,
      Math.min(100, ((toDate(iso).getTime() - range.from) / (range.to - range.from)) * 100),
    );
  const todayPct = pct(today);
  const showToday = toDate(today).getTime() >= range.from && toDate(today).getTime() <= range.to;
  const height = (r: Row) => (r.kind === "deliverable" ? ROW_H : PHASE_H);

  return (
    <div className="mf-timeline" role="table" aria-label="Matter timeline">
      <div className="mf-tl-label">
        <div
          className="mf-tl-row"
          style={{ height: 40, borderBottom: `1px solid ${FLOW.line}`, flex: "none" }}
        >
          <Eyebrow>PHASE · DELIVERABLE</Eyebrow>
        </div>
        {rows.map((r) => (
          <div
            key={r.id}
            className="mf-tl-row"
            title={r.label}
            style={{
              height: height(r),
              flex: "none",
              paddingLeft: r.kind === "phase" ? 14 : 28,
              background: r.kind === "phase" ? "#f6f6f6" : "#fff",
              fontWeight: r.kind === "phase" ? 600 : 400,
              color: r.kind === "phase" ? FLOW.ink : r.kind === "milestone" ? FLOW.muted : "#333",
            }}
          >
            {r.label}
          </div>
        ))}
      </div>
      <div
        style={{ display: "flex", flexDirection: "column", position: "relative", minWidth: 480 }}
      >
        <div
          style={{
            height: 40,
            flex: "none",
            borderBottom: `1px solid ${FLOW.line}`,
            display: "grid",
            gridTemplateColumns: `repeat(${months.length}, 1fr)`,
          }}
        >
          {months.map((m, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "0 10px",
                borderLeft: "1px solid #f0f0f0",
              }}
            >
              <Eyebrow>
                {m.label}
                {i === 0 || m.label === "JAN" ? ` ${m.year}` : ""}
              </Eyebrow>
            </div>
          ))}
        </div>
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 40,
            bottom: 0,
            left: 0,
            right: 0,
            display: "grid",
            gridTemplateColumns: `repeat(${months.length}, 1fr)`,
            pointerEvents: "none",
          }}
        >
          {months.map((_, i) => (
            <div key={i} style={{ borderLeft: "1px solid #f0f0f0" }} />
          ))}
        </div>
        {showToday && (
          <>
            <div
              aria-hidden
              style={{
                position: "absolute",
                top: 40,
                bottom: 0,
                left: `${todayPct}%`,
                width: 2,
                background: FLOW.orange,
                zIndex: 2,
              }}
            />
            <div
              style={{
                position: "absolute",
                top: 44,
                left: `calc(${todayPct}% + 6px)`,
                zIndex: 2,
              }}
            >
              <Eyebrow color={FLOW.orange}>TODAY · {fmtDay(today)}</Eyebrow>
            </div>
          </>
        )}
        {rows.map((r) => (
          <div
            key={r.id}
            style={{
              height: height(r),
              flex: "none",
              borderBottom: "1px solid #f0f0f0",
              position: "relative",
              background: r.kind === "phase" ? "#f6f6f6" : "#fff",
            }}
          >
            {r.kind === "deliverable" && (
              <Bar
                deliverable={r.deliverable}
                left={pct(r.deliverable.start)}
                right={pct(r.deliverable.deadline)}
                tag={stateTag(r.deliverable, today)}
                onOpen={onOpen}
              />
            )}
            {r.kind === "milestone" && (
              <>
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    top: "50%",
                    marginTop: -6,
                    left: `calc(${pct(r.date)}% - 6px)`,
                    width: 12,
                    height: 12,
                    background: FLOW.ink,
                    transform: "rotate(45deg)",
                    borderRadius: 2,
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    marginTop: -7,
                    left: `calc(${pct(r.date)}% + 14px)`,
                    fontSize: 10.5,
                    color: FLOW.grey,
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.tag}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Bar({
  deliverable,
  left,
  right,
  tag,
  onOpen,
}: {
  deliverable: DerivedDeliverable;
  left: number;
  right: number;
  tag: string;
  onOpen: (deliverable: DerivedDeliverable) => void;
}) {
  const c = STATE_CHIP[deliverable.state];
  const planned = deliverable.state === "planned";
  const width = Math.max(right - left, 1.2);
  return (
    <button
      type="button"
      className="mf-tl-bar"
      title={`${deliverable.name} · ${fmtDay(deliverable.start)} – ${fmtDay(deliverable.deadline)}`}
      aria-label={`${deliverable.name}, ${tag}`}
      onClick={() => onOpen(deliverable)}
      style={{
        left: `${left}%`,
        width: `${width}%`,
        background: c.bar,
        borderColor: planned ? "#c6c6c6" : c.bar,
        color: planned ? FLOW.grey : "#fff",
      }}
    >
      {tag}
    </button>
  );
}

export const todayIso = () => isoDate(new Date());
