/**
 * The small pieces the review tabs share: the severity and kind chips, the
 * cards, the fields. Colours come from the app tokens, so this reads as the
 * same application as everything else.
 */
import type { CSSProperties, ReactNode } from "react";
import { C, mono } from "@/lib/tokens";
import { ISSUE_STATUSES, kindMeta, severityMeta } from "./model";
import type { IssueKind, IssueStatus, Severity } from "./model";

const TONE: Record<string, { fg: string; bg: string; edge: string }> = {
  critical: { fg: "#8c1d18", bg: "#fdecea", edge: "#f0bdb7" },
  high: { fg: C.red, bg: "#fdf0ef", edge: "#f1cac6" },
  medium: { fg: C.amber, bg: "#fdf6e3", edge: "#eedfae" },
  low: { fg: C.secondary, bg: "#f4f3f2", edge: C.cardRule },
  ok: { fg: C.green, bg: "#eaf4ed", edge: "#bdd9c5" },
  info: { fg: C.accent, bg: C.accentTint, edge: C.accentEdge },
  quiet: { fg: C.muted, bg: "#f4f3f2", edge: C.cardRule },
};

/** Small caps label in the mono face, as used across the app. */
export function Eyebrow({
  children,
  color = C.faint,
  style,
}: {
  children: ReactNode;
  color?: string | undefined;
  style?: CSSProperties | undefined;
}) {
  return (
    <span
      style={{
        font: `500 9.5px ${mono}`,
        color,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export function Chip({
  tone = "quiet",
  children,
  title,
  style,
}: {
  tone?: keyof typeof TONE | undefined;
  children: ReactNode;
  title?: string | undefined;
  style?: CSSProperties | undefined;
}) {
  const t = TONE[tone] ?? TONE["quiet"]!;
  return (
    <span
      className="rv-chip"
      title={title}
      style={{ color: t.fg, background: t.bg, border: `1px solid ${t.edge}`, ...style }}
    >
      {children}
    </span>
  );
}

/** How much a finding matters. The label carries its meaning on hover. */
export function SeverityChip({ severity }: { severity: Severity }) {
  const meta = severityMeta(severity);
  return (
    <Chip tone={severity} title={meta.meaning}>
      {meta.label}
    </Chip>
  );
}

/** What sort of problem it is: legal, commercial, drafting, playbook. */
export function KindChip({ kind }: { kind: IssueKind }) {
  const meta = kindMeta(kind);
  return (
    <Chip tone={kind === "standard" ? "ok" : "info"} title={meta.meaning}>
      {meta.label}
    </Chip>
  );
}

export function StatusChip({ status }: { status: IssueStatus }) {
  const meta = ISSUE_STATUSES.find((s) => s.key === status);
  return (
    <Chip
      tone={status === "open" ? "quiet" : status === "resolved" ? "ok" : "info"}
      title={meta?.meaning}
    >
      {meta?.label ?? status}
    </Chip>
  );
}

/** The coloured dot the clause navigator wears. Null severity draws nothing. */
export function SeverityDot({
  severity,
  reviewed,
}: {
  severity: Severity | null;
  reviewed: boolean;
}) {
  if (severity) {
    const t = TONE[severity]!;
    return (
      <span
        title={`${severityMeta(severity).label} — open issue on this clause`}
        style={{
          flex: "none",
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: t.fg,
          border: severity === "low" ? `1px solid ${t.edge}` : "0",
        }}
      />
    );
  }
  if (reviewed)
    return (
      <span
        title="Assessed — nothing outstanding"
        style={{
          flex: "none",
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: "transparent",
          border: `1.5px solid ${C.green}`,
        }}
      />
    );
  return (
    <span
      title="Not yet assessed"
      style={{
        flex: "none",
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: "transparent",
        border: `1px dashed ${C.border}`,
      }}
    />
  );
}

export function Card({
  title,
  hint,
  right,
  children,
  style,
  id,
  className,
}: {
  title?: string | undefined;
  hint?: string | undefined;
  right?: ReactNode | undefined;
  children: ReactNode;
  style?: CSSProperties | undefined;
  id?: string | undefined;
  /** How this card behaves in its screen's layout: see `.rv.is-final`. */
  className?: string | undefined;
}) {
  return (
    <section className={`rv-card${className ? ` ${className}` : ""}`} style={style} id={id}>
      {(title || right) && (
        <header className="rv-card-head">
          {title && <h2>{title}</h2>}
          <span style={{ flex: 1 }} />
          {right}
        </header>
      )}
      {hint && <p className="rv-card-hint">{hint}</p>}
      <div className="rv-card-body">{children}</div>
    </section>
  );
}

/** Label above value, the way the summary cards read. */
export function Term({
  label,
  value,
  hint,
  onClick,
  placeholder,
}: {
  label: string;
  value: string;
  hint?: string | undefined;
  onClick?: (() => void) | undefined;
  placeholder?: string | undefined;
}) {
  const empty = !value.trim();
  return (
    <div className="rv-term">
      <Eyebrow>{label}</Eyebrow>
      {empty ? (
        <span className="rv-term-empty" title={hint}>
          {placeholder ?? "Not found in the document"}
        </span>
      ) : onClick ? (
        <button type="button" className="rv-term-link" onClick={onClick} title="Go to the clause">
          {value}
        </button>
      ) : (
        <span className="rv-term-value">{value}</span>
      )}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string | undefined;
  children: ReactNode;
}) {
  return (
    <label className="rv-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

/** A textarea that grows to its content, so nothing is hidden behind a scrollbar. */
export function Growing({
  value,
  onChange,
  placeholder,
  rows = 2,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string | undefined;
  rows?: number | undefined;
  id?: string | undefined;
}) {
  return (
    <textarea
      id={id}
      className="rv-input rv-growing"
      rows={rows}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      ref={(el) => {
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${el.scrollHeight}px`;
      }}
    />
  );
}

export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode | undefined;
  action?: ReactNode | undefined;
}) {
  return (
    <div className="rv-empty">
      <div className="rv-empty-title">{title}</div>
      {children && <div className="rv-empty-note">{children}</div>}
      {action && <div className="rv-empty-action">{action}</div>}
    </div>
  );
}

/** A count worth reading, with the word that says what it counts. */
export function Stat({
  n,
  label,
  tone = "quiet",
  onClick,
}: {
  n: number | string;
  label: string;
  tone?: keyof typeof TONE | undefined;
  onClick?: (() => void) | undefined;
}) {
  const t = TONE[tone] ?? TONE["quiet"]!;
  const inner = (
    <>
      <span style={{ fontSize: 22, fontWeight: 600, color: t.fg, lineHeight: 1.1 }}>{n}</span>
      <Eyebrow style={{ whiteSpace: "normal" }}>{label}</Eyebrow>
    </>
  );
  return onClick ? (
    <button type="button" className="rv-stat is-action" onClick={onClick}>
      {inner}
    </button>
  ) : (
    <div className="rv-stat">{inner}</div>
  );
}

/** A thin bar with the fraction it represents written beside it. */
export function Meter({
  fraction,
  label,
  tone = C.accent,
}: {
  fraction: number;
  label: string;
  tone?: string | undefined;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={label}
        style={{ height: 5, borderRadius: 999, background: C.sunken, overflow: "hidden" }}
      >
        <div style={{ width: `${pct}%`, height: "100%", background: tone, borderRadius: 999 }} />
      </div>
      <span style={{ fontSize: 11.5, color: C.muted }}>{label}</span>
    </div>
  );
}
