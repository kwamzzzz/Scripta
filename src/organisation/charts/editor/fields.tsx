/**
 * The small controls the chart editor is built from: colour swatches, text
 * that is saved when the lawyer leaves the field (so one word is one undo, not
 * one per letter), and the popover form a gesture on the chart opens.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/primitives";

export function Swatches({
  colours,
  value,
  onChange,
  allowDefault = true,
  custom = false,
  label,
}: {
  colours: { hex: string; name: string }[];
  value: string | undefined;
  onChange: (hex: string | undefined) => void;
  allowDefault?: boolean;
  /** Offer any colour, not only the palette. */
  custom?: boolean;
  label: string;
}) {
  return (
    <div className="oe-swatches" role="group" aria-label={label}>
      {allowDefault && (
        <button
          type="button"
          className={`oe-swatch is-default${!value ? " is-on" : ""}`}
          aria-pressed={!value}
          title="Chart default"
          onClick={() => onChange(undefined)}
        >
          <span aria-hidden>∅</span>
        </button>
      )}
      {colours.map((c) => (
        <button
          key={c.hex}
          type="button"
          className={`oe-swatch${value === c.hex ? " is-on" : ""}`}
          aria-pressed={value === c.hex}
          title={c.name}
          aria-label={c.name}
          style={{ background: c.hex }}
          onClick={() => onChange(c.hex)}
        />
      ))}
      {custom && (
        <label className="oe-swatch is-custom" title="Any colour">
          <input
            type="color"
            value={value ?? "#ffffff"}
            aria-label={`${label}: any colour`}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
          />
        </label>
      )}
    </div>
  );
}

/** A text field saved on Enter or when focus leaves it. */
export function CommitInput({
  value,
  onCommit,
  placeholder,
  multiline,
  label,
  autoFocus,
  suffix,
}: {
  value: string;
  onCommit: (next: string) => void;
  placeholder?: string;
  multiline?: boolean;
  label: string;
  autoFocus?: boolean;
  suffix?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  const props = {
    value: draft,
    placeholder,
    "aria-label": label,
    autoFocus,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onBlur: commit,
  };
  return (
    <label className="oe-field">
      <span>{label}</span>
      {multiline ? (
        <textarea rows={3} {...props} />
      ) : (
        <span className="oe-input">
          <input
            {...props}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              } else if (e.key === "Escape") setDraft(value);
            }}
          />
          {suffix && <em>{suffix}</em>}
        </span>
      )}
    </label>
  );
}

export function Choice<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { id: T; label: string }[];
  value: T | undefined;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div className="og-seg oe-seg" role="group" aria-label={label}>
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

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="oe-section">
      <h4>{title}</h4>
      {children}
    </section>
  );
}

/**
 * The form a gesture on the chart opens: a line or two, Enter to add, Escape
 * to leave it.
 */
export function Pop({
  title,
  children,
  submit = "Add",
  onSubmit,
  onCancel,
  extra,
}: {
  title: ReactNode;
  children?: ReactNode;
  submit?: string;
  onSubmit: () => void | Promise<unknown>;
  onCancel: () => void;
  extra?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const first =
      form.current?.querySelector<HTMLElement>("input:not([type=checkbox]), textarea, select") ??
      form.current?.querySelector<HTMLElement>("button");
    first?.focus();
  }, []);
  return (
    <form
      ref={form}
      className="oe-pop"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        try {
          await onSubmit();
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="oe-pop-title">{title}</div>
      {children}
      <div className="oe-pop-actions">
        {extra}
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : submit}
        </Button>
      </div>
    </form>
  );
}

/** A name, with the names already recorded offered as the lawyer types. */
export function NameInput({
  value,
  onChange,
  suggestions,
  placeholder,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
  label: string;
}) {
  const list = `oe-names-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <label className="oe-field">
      <span>{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        list={suggestions.length ? list : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {suggestions.length > 0 && (
        <datalist id={list}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </label>
  );
}

export function ShareInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="oe-field is-share">
      <span>Share</span>
      <span className="oe-input">
        <input
          value={value}
          inputMode="decimal"
          placeholder="e.g. 51"
          onChange={(e) => onChange(e.target.value)}
        />
        <em>%</em>
      </span>
    </label>
  );
}
