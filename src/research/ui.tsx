/** The small pieces the research tabs share: cards, fields, chips, badges. */
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { confidenceOf, STATUS_LABEL, STATUS_TONE, TIER_LABEL, WEIGHT_LABEL } from "./model";
import type { ResearchAuthority } from "@/lib/research.functions";

export function Card({
  title,
  hint,
  right,
  children,
  tight,
  style,
}: {
  title?: string;
  hint?: string;
  right?: ReactNode;
  children: ReactNode;
  tight?: boolean;
  style?: CSSProperties;
}) {
  return (
    <section className="rs-card" style={style}>
      {(title || right) && (
        <header className="rs-card-head">
          {title && (
            <div style={{ minWidth: 0 }}>
              <h2>{title}</h2>
            </div>
          )}
          <div className="rs-spacer" />
          {right}
          {hint && <p>{hint}</p>}
        </header>
      )}
      <div className={`rs-card-body${tight ? " is-tight" : ""}`}>{children}</div>
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="rs-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function Select({
  label,
  hint,
  value,
  options,
  onChange,
  allowEmpty,
}: {
  label: string;
  hint?: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  allowEmpty?: string;
}) {
  return (
    <Field label={label} {...(hint ? { hint } : {})}>
      <select className="rs-select" value={value} onChange={(e) => onChange(e.target.value)}>
        {allowEmpty !== undefined && <option value="">{allowEmpty}</option>}
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function Chip({
  tone = "context",
  mono,
  children,
  onClick,
  title,
}: {
  tone?: "ok" | "practice" | "risk" | "law" | "context";
  mono?: boolean;
  children: ReactNode;
  onClick?: () => void;
  title?: string;
}) {
  const className = `rs-chip is-${tone}${mono ? " rs-chip-mono" : ""}`;
  return onClick ? (
    <button type="button" className={className} onClick={onClick} title={title}>
      {children}
    </button>
  ) : (
    <span className={className} title={title}>
      {children}
    </span>
  );
}

/** How far a conclusion is carried, as a legal state rather than a number. */
export function ConfidenceChip({ value, onClick }: { value: string; onClick?: () => void }) {
  const c = confidenceOf(value);
  return (
    <Chip tone={c.tone} title={c.meaning} {...(onClick ? { onClick } : {})}>
      {c.label}
    </Chip>
  );
}

/**
 * What a source is and whether it can still be relied on — the badges a
 * lawyer reads before anything else.
 */
export function SourceBadges({ authority }: { authority: ResearchAuthority }) {
  const tier = authority.tier || "";
  const status = authority.status || (authority.kind === "UNVERIFIED" ? "unverified" : "");
  return (
    <span style={{ display: "inline-flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
      {tier && (
        <Chip mono tone={tier === "primary" ? "law" : "context"}>
          {TIER_LABEL[tier] ?? tier}
        </Chip>
      )}
      {status && (
        <Chip mono tone={STATUS_TONE[status] ?? "context"}>
          {STATUS_LABEL[status] ?? status}
        </Chip>
      )}
      {authority.weight && (
        <Chip mono tone="context">
          {WEIGHT_LABEL[authority.weight] ?? authority.weight}
        </Chip>
      )}
      {authority.addedBy === "lawyer" && (
        <Chip
          mono
          tone="context"
          title="You added this source yourself, so it needs no verification from Scripta."
        >
          Yours
        </Chip>
      )}
    </span>
  );
}

export function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="rs-empty">
      <b>{title}</b>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function Working({ label }: { label: string }) {
  return (
    <span className="rs-working" role="status">
      <span
        aria-hidden
        style={{
          width: 9,
          height: 9,
          borderRadius: "50%",
          border: "2px solid #c9dcf7",
          borderTopColor: "#0b57d0",
          display: "inline-block",
          animation: "rs-spin 800ms linear infinite",
        }}
      />
      {label}
    </span>
  );
}

/**
 * A field that grows to its content.
 *
 * The research plan's lines are citations — "UAE Federal Law No. 5 of 1985
 * concerning the Civil Transactions Law" — and a single-line input shows a
 * lawyer the first forty characters of one. Nothing here is ever truncated:
 * the box takes the height the words need.
 */
export function GrowingField({
  value,
  placeholder,
  label,
  onChange,
}: {
  value: string;
  placeholder: string;
  label: string;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = () => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  };
  // Refit when the value changes from outside — a draft arriving, a line removed.
  useEffect(fit, [value]);
  return (
    <textarea
      ref={ref}
      className="rs-input rs-growing"
      rows={1}
      aria-label={label}
      placeholder={placeholder}
      value={value}
      onInput={fit}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

/** An editable list of lines — the research plan's four parts. */
export function LineList({
  values,
  placeholder,
  onChange,
  addLabel,
  label,
}: {
  values: string[];
  placeholder: string;
  onChange: (values: string[]) => void;
  addLabel: string;
  label: string;
}) {
  return (
    <div className="rs-list">
      {values.map((value, index) => (
        <div className="rs-list-row" key={index}>
          <GrowingField
            value={value}
            placeholder={placeholder}
            label={`${label} ${index + 1}`}
            onChange={(next) => onChange(values.map((v, i) => (i === index ? next : v)))}
          />
          <button
            type="button"
            className="rs-list-remove"
            title="Remove this line"
            aria-label={`Remove ${label.toLowerCase()} ${index + 1}`}
            onClick={() => onChange(values.filter((_, i) => i !== index))}
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <div>
        <button type="button" className="rs-link" onClick={() => onChange([...values, ""])}>
          + {addLabel}
        </button>
      </div>
    </div>
  );
}
