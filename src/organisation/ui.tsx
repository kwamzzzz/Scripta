/**
 * The small set of pieces every organisation screen is built from, so the ten
 * areas read as one workspace: a page head, ruled panels, a segmented switch,
 * form fields with visible labels, a dialog that says what a change is and
 * when it took effect, and pickers over the organisation's own records.
 */
import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/primitives";
import StatusPill, { type StatusTone } from "@/components/StatusPill";
import { Modal } from "@/wireframe/screens";
import { loadOrganisation, organisationKey } from "./db";
import {
  currentRoles,
  entityLabel,
  liveEntities,
  livePeople,
  type ChangeContext,
  type Organisation,
} from "./model";
import "@/components/organise.css";
import "./organisation.css";

export function useOrganisation(workspaceId: string | null, clientId: string) {
  return useQuery({
    queryKey: organisationKey(clientId),
    enabled: !!workspaceId,
    retry: false,
    queryFn: () => loadOrganisation(workspaceId!, clientId),
  });
}

/**
 * Run a write, report a refusal in words, and reload the organisation. Returns
 * whether it succeeded so a dialog knows to close.
 */
export function useOrgWrite(clientId: string) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (work: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      await work();
      await qc.invalidateQueries({ queryKey: organisationKey(clientId) });
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That change was not saved.");
      await qc.invalidateQueries({ queryKey: organisationKey(clientId) });
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { run, error, setError, busy };
}

/* ------------------------------------------------------------------ layout */

export function OrgPage({
  title,
  subtitle,
  actions,
  children,
  aside,
  wide,
  className,
}: {
  className?: string | undefined;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  /** A right-hand panel: the selected record, a Q&A, an export sheet. */
  aside?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`og-page${aside ? " has-aside" : ""}${className ? ` ${className}` : ""}`}>
      <div className="og-page-main">
        <header className="og-page-head">
          <div className="og-page-title">
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {actions && <div className="og-page-actions">{actions}</div>}
        </header>
        <div className={`og-page-body${wide ? " is-wide" : ""}`}>{children}</div>
      </div>
      {aside && <aside className="og-aside">{aside}</aside>}
    </div>
  );
}

export function Panel({
  title,
  right,
  hint,
  children,
  tone,
  className,
}: {
  title?: ReactNode;
  right?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  tone?: "warning" | "danger" | "note";
  className?: string;
}) {
  return (
    <section className={`og-panel${tone ? ` is-${tone}` : ""}${className ? ` ${className}` : ""}`}>
      {(title || right) && (
        <header className="og-panel-head">
          {title && <h3>{title}</h3>}
          {right && <div className="og-panel-right">{right}</div>}
        </header>
      )}
      {hint && <p className="og-panel-hint">{hint}</p>}
      <div className="og-panel-body">{children}</div>
    </section>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="og-eyebrow">{children}</div>;
}

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
    <div className="og-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={o.id === value}
          className={o.id === value ? "is-on" : undefined}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Pill({ tone, children }: { tone: StatusTone; children: string }) {
  return <StatusPill label={children} tone={tone} />;
}

export function Facts({ rows }: { rows: [string, ReactNode][] }) {
  const shown = rows.filter(([, v]) => v !== "" && v !== null && v !== undefined);
  if (!shown.length) return null;
  return (
    <dl className="og-facts">
      {shown.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="og-empty">
      <strong>{title}</strong>
      {body && <p>{body}</p>}
      {action && <div className="og-empty-action">{action}</div>}
    </div>
  );
}

export function LinkButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button type="button" className="org-link" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p className="org-error" role="alert">
      {error}
    </p>
  ) : null;
}

/* ------------------------------------------------------------------ fields */

export function Field({
  label,
  hint,
  children,
  wide,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`org-field${wide ? " og-wide" : ""}`}>
      <span className="org-label">{label}</span>
      {children}
      {hint && <span className="og-hint">{hint}</span>}
    </label>
  );
}

export function FieldRow({ children }: { children: ReactNode }) {
  return <div className="og-row">{children}</div>;
}

export function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "date" | "number" | "email";
  autoFocus?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function TextArea({
  value,
  onChange,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      rows={rows}
      onChange={(e) => onChange(e.target.value)}
      className="og-textarea"
    />
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  empty,
}: {
  value: T | "";
  onChange: (v: T | "") => void;
  options: { value: T; label: string }[];
  /** Label for the blank choice; omit to require a value. */
  empty?: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T | "")}>
      {empty !== undefined && <option value="">{empty}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

const OTHER = "__other__";

/**
 * A dropdown that never boxes the user in. Its last choice swaps the list for
 * a text box, with a link back to the list. `custom` is null while a listed
 * choice is in use, and holds the typed text otherwise; the caller decides
 * what the text becomes on save (a label, a new record). `extra` sits under
 * the text box, for anything the typed value still needs.
 */
export function SelectOrOther<T extends string>({
  value,
  onChange,
  options,
  empty,
  custom,
  onCustomChange,
  otherLabel = "Other…",
  placeholder,
  extra,
}: {
  value: T | "";
  onChange: (v: T | "") => void;
  options: { value: T; label: string }[];
  empty?: string;
  custom: string | null;
  onCustomChange: (text: string | null) => void;
  otherLabel?: string;
  placeholder?: string;
  extra?: ReactNode;
}) {
  if (custom !== null)
    return (
      <>
        <div className="og-other">
          <input
            value={custom}
            placeholder={placeholder}
            autoFocus
            onChange={(e) => onCustomChange(e.target.value)}
          />
          {extra}
        </div>
        <span className="og-hint">
          <LinkButton onClick={() => onCustomChange(null)}>Choose from the list</LinkButton>
        </span>
      </>
    );
  return (
    <select
      value={value}
      onChange={(e) => {
        if (e.target.value === OTHER) onCustomChange("");
        else onChange(e.target.value as T | "");
      }}
    >
      {empty !== undefined && <option value="">{empty}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
      <option value={OTHER}>{otherLabel}</option>
    </select>
  );
}

export function EntitySelect({
  org,
  value,
  onChange,
  empty = "No entity",
  includeProposed,
  custom,
  onCustomChange,
}: {
  org: Organisation;
  value: string | null;
  onChange: (id: string | null) => void;
  empty?: string;
  includeProposed?: boolean;
  /** Pass both to offer an entity not recorded yet, named in a text box. */
  custom?: string | null;
  onCustomChange?: (name: string | null) => void;
}) {
  const rows = (
    includeProposed ? org.entities.filter((e) => !e.archivedAt) : liveEntities(org)
  ).map((e) => ({
    value: e.id,
    label: `${entityLabel(e)}${e.proposedChangeId ? " (proposed)" : ""}`,
  }));
  if (onCustomChange)
    return (
      <SelectOrOther
        value={value ?? ""}
        onChange={(v) => onChange(v || null)}
        options={rows}
        empty={empty}
        custom={custom ?? null}
        onCustomChange={onCustomChange}
        otherLabel="An entity not recorded yet…"
        placeholder="Entity name"
      />
    );
  return (
    <Select
      value={value ?? ""}
      onChange={(v) => onChange(v || null)}
      options={rows}
      empty={empty}
    />
  );
}

export function PersonSelect({
  org,
  value,
  onChange,
  empty = "Nobody",
}: {
  org: Organisation;
  value: string | null;
  onChange: (id: string | null) => void;
  empty?: string;
}) {
  const rows = livePeople(org).map((p) => ({ value: p.id, label: p.fullName }));
  return (
    <Select
      value={value ?? ""}
      onChange={(v) => onChange(v || null)}
      options={rows}
      empty={empty}
    />
  );
}

export function RoleSelect({
  org,
  value,
  onChange,
  empty = "No role",
  exclude,
}: {
  org: Organisation;
  value: string | null;
  onChange: (id: string | null) => void;
  empty?: string;
  exclude?: (roleId: string) => boolean;
}) {
  const people = new Map(org.people.map((p) => [p.id, p.fullName]));
  const rows = currentRoles(org)
    .filter((r) => !exclude?.(r.id))
    .map((r) => ({
      value: r.id,
      label: `${r.title}${r.holderPersonId ? ` — ${people.get(r.holderPersonId) ?? ""}` : " — vacant"}`,
    }));
  return (
    <Select
      value={value ?? ""}
      onChange={(v) => onChange(v || null)}
      options={rows}
      empty={empty}
    />
  );
}

/**
 * When a change took effect and what records it. Organisational facts change
 * on a date and usually because of a document, and a history that only knows
 * when someone typed it cannot answer "who was the director in March?".
 */
export function ChangeFields({
  value,
  onChange,
  prompt = "Record when this took effect",
}: {
  value: ChangeContext;
  onChange: (v: ChangeContext) => void;
  prompt?: string;
}) {
  return (
    <fieldset className="og-change">
      <legend>{prompt}</legend>
      <FieldRow>
        <Field label="Effective date">
          <TextInput
            type="date"
            value={value.on ?? ""}
            onChange={(on) => onChange({ ...value, on: on || null })}
          />
        </Field>
        <Field label="Reference" hint="A board minute, filing or letter">
          <TextInput
            value={value.ref ?? ""}
            onChange={(ref) => onChange({ ...value, ref })}
            placeholder="e.g. BM-2026-07"
          />
        </Field>
      </FieldRow>
    </fieldset>
  );
}

export function OrgDialog({
  open,
  title,
  blurb,
  onClose,
  onSubmit,
  submitLabel,
  busy,
  error,
  children,
  extra,
  width,
}: {
  open: boolean;
  title: string;
  blurb?: ReactNode;
  onClose: () => void;
  onSubmit: () => void | Promise<void>;
  submitLabel: string;
  busy?: boolean;
  error?: string | null;
  children: ReactNode;
  /** Actions on the left of the footer: Delete, End role. */
  extra?: ReactNode;
  width?: number;
}) {
  return (
    <Modal open={open} onClose={onClose} label={title}>
      <form
        className="org-dialog og-dialog"
        style={width ? { width: `min(${width}px, 100%)` } : undefined}
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) void onSubmit();
        }}
      >
        <h2>{title}</h2>
        {blurb && <p className="org-hint">{blurb}</p>}
        {children}
        <ErrorLine error={error ?? null} />
        <div className="org-actions og-dialog-actions">
          <div className="og-dialog-extra">{extra}</div>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={!!busy}>
            {busy ? "Saving…" : submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** A short count phrase: "1 entity", "3 entities". */
export const count = (n: number, one: string, many?: string) =>
  `${n} ${n === 1 ? one : (many ?? `${one}s`)}`;
