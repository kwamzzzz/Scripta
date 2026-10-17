import type { CSSProperties, ReactNode } from "react";
import {
  C,
  identity,
  mono,
  provenance,
  radius,
  reviewStates,
  tabular,
  transition,
  type Provenance,
  type ReviewState,
} from "@/lib/tokens";

/** Section label. The quietest way to title a region without a card. */
export function SectionLabel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        fontSize: 11,
        color: C.muted,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Clause reference — always mono and tabular so numbers align down a column. */
export function ClauseRef({ num, style }: { num: string; style?: CSSProperties }) {
  return (
    <span style={{ fontFamily: mono, fontSize: 12, color: C.muted, ...tabular, ...style }}>
      {num}
    </span>
  );
}

/** Risk / review state. A dot and a word — never a filled block of colour, so a
 *  register with six flagged clauses still reads calm. */
export function ReviewBadge({ state, subtle = false }: { state: ReviewState; subtle?: boolean }) {
  const s = reviewStates[state];
  if (subtle) {
    return (
      <span
        style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, color: s.fg }}
      >
        <span
          style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot, flex: "none" }}
        />
        {s.label}
      </span>
    );
  }
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        fontSize: 12,
        padding: "2px 11px",
        borderRadius: radius.sm,
        background: s.bg,
        color: s.fg,
        border: `1px solid ${s.edge}`,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.dot, flex: "none" }} />
      {s.label}
    </span>
  );
}

/** Where a piece of text came from. Source, AI, user, approved, draft must never
 *  look the same — a lawyer has to know what they are reading. */
export function ProvenanceTag({ kind, label }: { kind: Provenance; label?: string }) {
  const p = provenance[kind];
  return (
    <span
      style={{
        fontSize: 11,
        padding: "1px 8px",
        borderRadius: radius.sm,
        background: p.bg,
        color: p.fg,
        whiteSpace: "nowrap",
      }}
    >
      {label ?? p.label}
    </span>
  );
}

/**
 * Source-of-truth indicator. Whenever a playbook rule drives a recommendation the
 * user must be able to see exactly which playbook, version, owner and approval
 * state was applied — without leaving the clause.
 */
export function SourceOfTruth({
  playbook,
  version,
  owner,
  effective,
  approved,
  onOpen,
}: {
  playbook: string;
  version?: string | null;
  owner?: string | null;
  effective?: string | null;
  approved?: boolean;
  onOpen?: () => void;
}) {
  return (
    <div
      style={{
        border: `1px solid ${C.violetEdge}`,
        background: C.violetTint,
        borderRadius: radius.lg,
        padding: "11px 14px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <SectionLabel style={{ color: C.violet }}>Source of truth</SectionLabel>
        {approved !== undefined && (
          <span style={{ marginLeft: "auto", fontSize: 11, color: approved ? C.green : C.amber }}>
            {approved ? "Approved" : "Unapproved"}
          </span>
        )}
      </div>
      <div style={{ fontSize: 13, fontWeight: 500, marginTop: 4, color: C.text }}>
        {playbook}
        {version ? (
          <span style={{ fontFamily: mono, color: C.muted, fontWeight: 400 }}> {version}</span>
        ) : null}
      </div>
      <div style={{ fontSize: 12, color: C.muted, marginTop: 2, ...tabular }}>
        {[owner ? `owner ${owner}` : null, effective ? `effective ${effective}` : null]
          .filter(Boolean)
          .join(" · ")}
      </div>
      {onOpen && (
        <span
          onClick={onOpen}
          className="px-link"
          style={{
            fontSize: 12,
            color: C.violet,
            cursor: "pointer",
            fontWeight: 500,
            display: "inline-block",
            marginTop: 6,
          }}
        >
          View rule →
        </span>
      )}
    </div>
  );
}

/** Version label, e.g. v3.2 — mono so versions line up in a list. */
export function VersionLabel({ children }: { children: ReactNode }) {
  return (
    <span style={{ fontFamily: mono, fontSize: 12, color: C.muted, ...tabular }}>{children}</span>
  );
}

/**
 * Empty state that starts the workflow. Never a shrug — the spec is explicit that
 * no screen may be a dead end, so every empty state names the next action.
 */
export function EmptyState({
  title,
  body,
  action,
  secondary,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  secondary?: ReactNode;
}) {
  return (
    <div
      className="px-empty-state"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
      }}
    >
      <div className="px-empty-state-content" style={{ maxWidth: 480, textAlign: "center" }}>
        <div
          className="px-empty-state-title"
          style={{ fontSize: 16, fontWeight: 500, color: identity.ink }}
        >
          {title}
        </div>
        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginTop: 6 }}>{body}</div>
        {(action || secondary) && (
          <div
            className="px-empty-state-actions"
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              justifyContent: "center",
              marginTop: 20,
            }}
          >
            {action}
            {secondary}
          </div>
        )}
      </div>
    </div>
  );
}

/** Skeleton sized to the content it replaces, so nothing shifts on load. */
export function Skeleton({
  w = "100%",
  h = 12,
  style,
}: {
  w?: number | string;
  h?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      className="px-skeleton"
      style={{ width: w, height: h, borderRadius: radius.sm, background: C.sunken, ...style }}
    />
  );
}

/** Primary / secondary action. One button style, used everywhere. */
export function Button({
  children,
  onClick,
  variant = "secondary",
  disabled,
  title,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "quiet" | "danger";
  disabled?: boolean;
  title?: string;
  /** Defaults to "button", which is right everywhere except the confirming
   *  button of a form: without type="submit" a form can never be sent, and
   *  pressing Enter in one of its fields does nothing. */
  type?: "button" | "submit";
}) {
  const base: CSSProperties = {
    fontSize: 13,
    fontWeight: 500,
    padding: "7px 15px",
    borderRadius: radius.md,
    cursor: disabled ? "default" : "pointer",
    transition: transition("background, border-color, color", "120ms"),
    whiteSpace: "nowrap",
    opacity: disabled ? 0.5 : 1,
    fontFamily: "inherit",
  };
  const variants: Record<string, CSSProperties> = {
    primary: { background: C.accent, color: C.panel, border: `1px solid ${C.accent}` },
    secondary: { background: C.panel, color: C.text, border: `1px solid ${C.border}` },
    quiet: { background: "transparent", color: C.accent, border: "1px solid transparent" },
    danger: { background: C.panel, color: C.red, border: `1px solid ${C.border}` },
  };
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`px-btn px-btn-${variant}`}
      style={{ ...base, ...variants[variant] }}
    >
      {children}
    </button>
  );
}
