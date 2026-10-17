/**
 * Small shared pieces for the Flow screens: the state and type chips,
 * the segmented view control, the eyebrow label and the row checkbox. Colours
 * are the column-6 wireframe palette; buttons come from the shared primitives.
 */
import type { CSSProperties, ReactNode } from "react";
import { Check } from "lucide-react";
import { mono } from "@/lib/tokens";
import type { DeliverableState, PhaseState } from "./model";

export const FLOW = {
  orange: "#e8710a",
  orangeLight: "#fdf1e6",
  orangeText: "#b4560a",
  orangeEdge: "#f5c9a3",
  blue: "#0b57d0",
  green: "#137333",
  greenBar: "#34a853",
  greenLight: "#e6f4ea",
  greenEdge: "#a8d5b5",
  red: "#c5221f",
  redLight: "#fdecea",
  redEdge: "#f3c0bb",
  amber: "#8a5b00",
  amberLight: "#fef7e0",
  amberEdge: "#f5dda3",
  grey: "#545454",
  greyLight: "#f4f4f4",
  greyEdge: "#d4d4d4",
  line: "#e4e4e4",
  rule: "#dedede",
  ink: "#232323",
  muted: "#6f6f6f",
} as const;

export const STATE_CHIP: Record<
  DeliverableState,
  { label: string; fg: string; bg: string; edge: string; box: string; bar: string }
> = {
  complete: {
    label: "Complete",
    fg: FLOW.green,
    bg: FLOW.greenLight,
    edge: FLOW.greenEdge,
    box: FLOW.green,
    bar: FLOW.greenBar,
  },
  overdue: {
    label: "Overdue",
    fg: FLOW.red,
    bg: FLOW.redLight,
    edge: FLOW.redEdge,
    box: FLOW.red,
    bar: FLOW.red,
  },
  due_today: {
    label: "Due today",
    fg: FLOW.red,
    bg: FLOW.redLight,
    edge: FLOW.redEdge,
    box: FLOW.red,
    bar: FLOW.red,
  },
  waiting_on: {
    label: "Waiting",
    fg: FLOW.orangeText,
    bg: FLOW.orangeLight,
    edge: FLOW.orangeEdge,
    box: FLOW.orange,
    bar: FLOW.orange,
  },
  in_progress: {
    label: "In progress",
    fg: FLOW.orangeText,
    bg: FLOW.orangeLight,
    edge: FLOW.orangeEdge,
    box: FLOW.orange,
    bar: FLOW.orange,
  },
  planned: {
    label: "Planned",
    fg: FLOW.grey,
    bg: FLOW.greyLight,
    edge: FLOW.greyEdge,
    box: "#c6c6c6",
    bar: "#fff",
  },
};

export const PHASE_STATE_LABEL: Record<PhaseState, string> = {
  done: "DONE",
  active: "ACTIVE",
  upcoming: "UPCOMING",
};

/** Small caps label in Plex Mono, as drawn everywhere in column 6. */
export function Eyebrow({
  children,
  color = FLOW.muted,
  style,
}: {
  children: ReactNode;
  color?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        font: `500 9px ${mono}`,
        color,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/** Tinted pill naming a deliverable's derived state. */
export function StateChip({
  state,
  label,
  style,
}: {
  state: DeliverableState;
  label?: string;
  style?: CSSProperties;
}) {
  const c = STATE_CHIP[state];
  return (
    <span
      className="mf-chip"
      style={{
        border: `1px solid ${c.edge}`,
        background: c.bg,
        color: c.fg,
        ...style,
      }}
    >
      {label ?? c.label}
    </span>
  );
}

/** Outline pill for a document or action type. */
export function TypeChip({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <span
      className="mf-chip"
      style={{
        border: `1px solid ${FLOW.greyEdge}`,
        color: FLOW.grey,
        background: "#fff",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/** Chip in one of the drawn tints: final (green), draft (amber), overdue (red), quiet (grey). */
export function TintChip({
  tint,
  children,
  style,
}: {
  tint: "green" | "amber" | "red" | "grey" | "orange";
  children: ReactNode;
  style?: CSSProperties;
}) {
  const map = {
    green: { fg: FLOW.green, bg: FLOW.greenLight, edge: FLOW.greenEdge },
    amber: { fg: FLOW.amber, bg: FLOW.amberLight, edge: FLOW.amberEdge },
    red: { fg: FLOW.red, bg: FLOW.redLight, edge: FLOW.redEdge },
    grey: { fg: FLOW.grey, bg: FLOW.greyLight, edge: FLOW.greyEdge },
    orange: { fg: FLOW.orangeText, bg: FLOW.orangeLight, edge: FLOW.orangeEdge },
  }[tint];
  return (
    <span
      className="mf-chip"
      style={{ border: `1px solid ${map.edge}`, background: map.bg, color: map.fg, ...style }}
    >
      {children}
    </span>
  );
}

/** The Checklist · Repository · Timeline control (dark active segment). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div className="mf-segmented" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={o.id === value}
          className={`mf-segment${o.id === value ? " is-active" : ""}`}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Row checkbox coloured by state; the tick itself is the lawyer's, completion is derived. */
export function Tick({
  state,
  ticked,
  onToggle,
  title,
  disabled,
}: {
  state: DeliverableState;
  ticked: boolean;
  onToggle: () => void;
  title: string;
  disabled?: boolean;
}) {
  const c = STATE_CHIP[state];
  const filled = state === "complete";
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={ticked}
      aria-label={title}
      title={title}
      disabled={disabled}
      onClick={onToggle}
      className="mf-tick"
      style={{
        border: `1.5px solid ${c.box}`,
        background: filled ? c.box : "#fff",
        color: "#fff",
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {filled ? (
        <Check size={11} strokeWidth={3} />
      ) : ticked ? (
        <span className="mf-tick-half" />
      ) : null}
    </button>
  );
}

/** Blue text link used for the row's primary action ("Open", "Attach", "Follow up"). */
export function LinkAction({
  children,
  onClick,
  title,
  style,
}: {
  children: ReactNode;
  onClick: () => void;
  title?: string;
  style?: CSSProperties;
}) {
  return (
    <button type="button" className="mf-link" onClick={onClick} title={title} style={style}>
      {children}
    </button>
  );
}

/** White card with the drawn hairline and shadow. */
export function Card({
  children,
  style,
  className,
}: {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <div className={`mf-card${className ? ` ${className}` : ""}`} style={style}>
      {children}
    </div>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sept",
  "Oct",
  "Nov",
  "Dec",
];

/** "12 Sept" from an ISO date. */
export function fmtDay(iso: string, withYear = false) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const month = MONTHS_LONG[(m ?? 1) - 1] ?? "";
  return withYear ? `${d} ${month} ${y}` : `${d} ${month}`;
}

export const monthShort = (index: number) => MONTHS[index] ?? "";

/** "18 Sept 2026, 14:30" for a datetime; the day alone when there is no time. */
export function fmtWhen(value: string) {
  const day = fmtDay(value.slice(0, 10), true);
  const time = /T\d{2}:\d{2}/.exec(value);
  return time ? `${day}, ${time[0].slice(1)}` : day;
}

/** The reader's own calendar day for a timestamp, as an ISO date. */
export const localDay = (timestamp: string) => {
  const when = new Date(timestamp);
  return Number.isNaN(when.getTime())
    ? timestamp.slice(0, 10)
    : `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, "0")}-${String(when.getDate()).padStart(2, "0")}`;
};

/** A count and the noun it counts, agreeing: "1 phase", "3 phases". */
export const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
