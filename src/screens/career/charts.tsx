/**
 * The charts, drawn by hand in SVG.
 *
 * No library: there are five shapes here, they are all small, and a charting
 * dependency would bring its own type scale, its own colours and its own idea
 * of a tooltip into a portal that already has all three.
 *
 * THE RULES THEY FOLLOW, which are not this file's invention:
 *  · Colour does one job per chart. A ranked share of a whole gets categorical
 *    hues in a fixed order; an ordered thing — exposure through to led — gets
 *    one hue stepped light to dark, never a rainbow, because the order is the
 *    information.
 *  · The categorical hues are a validated set: every adjacent pair clears the
 *    colour-blind separation floor. Three of them sit under 3:1 against white,
 *    so every slice carries a visible label and a legend with its number —
 *    identity is never colour alone.
 *  · One axis, thin marks, recessive grid, and a label on the points that
 *    matter rather than on all of them.
 */
import { useId, useState } from "react";

/* The validated categorical set, in fixed order. A ninth series is never a new
   hue: it folds into "Other". */
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
export const OTHER = "#8a9390";

/* One hue, light to dark, for things that are ordered rather than merely
   different. Five steps for the five rungs of the ladder. */
export const RAMP = ["#dbe7f8", "#a9c7ee", "#74a4e2", "#2a78d6", "#1a4f8f"];

const INK = "#123247";
const MUTED = "#626c70";
const RULE = "#e4e6e0";

/* --------------------------------------------------------------- the ring */

/**
 * One number, as a ring.
 *
 * A single value with no comparison needs no axis and no legend: the number is
 * written in the middle at a size that says it is the headline, and the arc is
 * there to be read at a glance from across a desk.
 */
export function Ring({
  value,
  caption,
  size = 132,
}: {
  value: number;
  caption: string;
  size?: number;
}) {
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const filled = (Math.max(0, Math.min(100, value)) / 100) * c;
  return (
    <div className="cr-ring" style={{ width: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${value} out of 100. ${caption}`}
      >
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={RULE} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={INK}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c - filled}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={size / 3.2}
          fontWeight={600}
          fill={INK}
        >
          {value}
        </text>
      </svg>
      <span>{caption}</span>
    </div>
  );
}

/* ---------------------------------------------------------------- the bars */

/**
 * A row of named quantities on the same 0–100 scale.
 *
 * Used for the four parts of the score and for comparing roles. One hue,
 * because these are the same measure at different values rather than different
 * things; the name and the number are always written out, so the bar is a
 * comparison aid and never the only way to read it.
 */
export function Bars({
  rows,
  onPick,
}: {
  rows: { label: string; value: number; detail?: string; id?: string }[];
  onPick?: (id: string) => void;
}) {
  return (
    <ul className="cr-bars">
      {rows.map((r) => {
        const body = (
          <>
            <span className="cr-bar-label">{r.label}</span>
            <span className="cr-bar-track" aria-hidden>
              <span className="cr-bar-fill" style={{ width: `${Math.max(2, r.value)}%` }} />
            </span>
            <span className="cr-bar-value">{r.value}</span>
            {r.detail && <span className="cr-bar-detail">{r.detail}</span>}
          </>
        );
        return (
          <li key={r.label}>
            {onPick && r.id ? (
              <button type="button" onClick={() => onPick(r.id!)}>
                {body}
              </button>
            ) : (
              <div>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* ---------------------------------------------------------- the trajectory */

/**
 * Twelve months of one number.
 *
 * A line with a soft fill under it, one series, so no legend — the title says
 * what it is. The hover gives the month and the value, because a chart in a
 * browser that cannot be interrogated is a picture of data rather than data.
 */
export function Trajectory({
  points,
  height = 132,
}: {
  points: { label: string; score: number; carried: number; month: string }[];
  height?: number;
}) {
  const [at, setAt] = useState<number | null>(null);
  const gradient = useId();
  if (points.length < 2) return null;

  const w = 100;
  const pad = 6;
  const top = Math.max(100, ...points.map((p) => p.score));
  const x = (i: number) => (i / (points.length - 1)) * w;
  const y = (v: number) => pad + (1 - v / top) * (100 - pad * 2);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.score)}`).join(" ");
  const area = `${line} L${w},100 L0,100 Z`;
  const now = points[at ?? points.length - 1]!;

  return (
    <figure className="cr-chart">
      <svg
        viewBox={`0 0 ${w} 100`}
        preserveAspectRatio="none"
        height={height}
        role="img"
        aria-label={`Readiness over ${points.length} months, now ${points.at(-1)!.score} out of 100`}
        onMouseLeave={() => setAt(null)}
      >
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={INK} stopOpacity="0.16" />
            <stop offset="100%" stopColor={INK} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 50, 100].map((v) => (
          <line key={v} x1="0" x2={w} y1={y(v)} y2={y(v)} stroke={RULE} strokeWidth="0.4" />
        ))}
        <path d={area} fill={`url(#${gradient})`} />
        <path
          d={line}
          fill="none"
          stroke={INK}
          strokeWidth="0.9"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
        {/* The last point is the one that matters, so it is the one drawn. */}
        <circle cx={x(points.length - 1)} cy={y(points.at(-1)!.score)} r="1.6" fill={INK} />
        {at !== null && (
          <line x1={x(at)} x2={x(at)} y1="0" y2="100" stroke={INK} strokeWidth="0.4" />
        )}
        {points.map((p, i) => (
          <rect
            key={p.month}
            x={x(i) - w / points.length / 2}
            y="0"
            width={w / points.length}
            height="100"
            fill="transparent"
            onMouseEnter={() => setAt(i)}
          />
        ))}
      </svg>
      <figcaption>
        <span className="cr-chart-months">
          {points[0]!.label} → {points.at(-1)!.label}
        </span>
        <span>
          <strong>{now.score}</strong> in {now.label} · {now.carried} carried
        </span>
      </figcaption>
    </figure>
  );
}

/* --------------------------------------------------------------- the donut */

/**
 * Share of a whole, as a ring with a hole.
 *
 * Capped at five named slices and an "Other": past that a reader is matching
 * colours to a legend rather than reading, and the sixth hue would be a hue
 * invented to fill a gap. Every slice is labelled in the legend with its own
 * number, which is also what discharges the contrast rule for the lighter
 * hues.
 */
export function Donut({
  slices,
  size = 132,
  centre,
}: {
  slices: { label: string; value: number }[];
  size?: number;
  centre?: string;
}) {
  const total = slices.reduce((n, s) => n + s.value, 0);
  if (!total) return null;
  const top = slices.slice(0, 5);
  const rest = slices.slice(5);
  const rows = rest.length
    ? [...top, { label: "Other", value: rest.reduce((n, s) => n + s.value, 0) }]
    : top;

  const stroke = 16;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="cr-donut">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={rows.map((s) => `${s.label} ${s.value}`).join(", ")}
      >
        {rows.map((s, i) => {
          const len = (s.value / total) * c;
          const dash = `${Math.max(0, len - 2)} ${c - Math.max(0, len - 2)}`;
          const el = (
            <circle
              key={s.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={i < 5 ? SERIES[i] : OTHER}
              strokeWidth={stroke}
              strokeDasharray={dash}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            >
              <title>{`${s.label}: ${s.value}`}</title>
            </circle>
          );
          offset += len;
          return el;
        })}
        {centre && (
          <text
            x="50%"
            y="50%"
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="13"
            fontWeight={600}
            fill={INK}
          >
            {centre}
          </text>
        )}
      </svg>
      <ul className="cr-legend">
        {rows.map((s, i) => (
          <li key={s.label}>
            <span className="cr-swatch" style={{ background: i < 5 ? SERIES[i] : OTHER }} />
            <span className="cr-legend-label">{s.label}</span>
            <span className="cr-legend-value">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------------------------------------------------- the level bar */

/**
 * One bar, split by how far in the work went.
 *
 * Ordered, so it is one hue stepped light to dark rather than five colours:
 * the darkness is the seniority, which means the shape can be read without the
 * legend and the legend is there to confirm it.
 */
export function LevelBar({
  counts,
  order,
  labels,
}: {
  counts: Record<string, number>;
  order: string[];
  labels: Record<string, string>;
}) {
  const total = order.reduce((n, k) => n + (counts[k] ?? 0), 0);
  if (!total) return null;
  return (
    <div className="cr-levelbar">
      <div className="cr-levelbar-track">
        {order.map((k, i) => {
          const v = counts[k] ?? 0;
          if (!v) return null;
          return (
            <span
              key={k}
              style={{ width: `${(v / total) * 100}%`, background: RAMP[i] }}
              title={`${labels[k]}: ${v}`}
            />
          );
        })}
      </div>
      <ul className="cr-legend is-inline">
        {order.map((k, i) => {
          const v = counts[k] ?? 0;
          if (!v) return null;
          return (
            <li key={k}>
              <span className="cr-swatch" style={{ background: RAMP[i] }} />
              <span className="cr-legend-label">{labels[k]}</span>
              <span className="cr-legend-value">{v}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** A single thin bar, for the strength of one piece of evidence. */
export function Meter({ value, title }: { value: number; title: string }) {
  return (
    <span className="cr-meter" title={title} aria-label={title}>
      <span style={{ width: `${Math.max(4, Math.min(100, value))}%` }} />
    </span>
  );
}

export const CHART_INK = INK;
export const CHART_MUTED = MUTED;
