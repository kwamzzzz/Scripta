/**
 * Choosing whose work this is: an existing client, a new one, or none yet.
 *
 * One control wherever a client can be named — a new matter, a new flow, a
 * task, a matter's details — so the three answers read the same everywhere.
 * "None yet" is a real answer, not a missing field: the work can be filed
 * under a client later without being recreated.
 *
 * A new client is only a name until the caller commits it, so cancelling a
 * dialog never leaves a client behind that nobody meant to create.
 */
import { useId, useMemo, useState } from "react";
import type { Client } from "@/lib/clients";
import { NO_CLIENT, useClients, type ClientChoice } from "./client-choice";
import "./organise.css";

const fold = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export default function ClientPicker({
  value,
  onChange,
  label = "Client",
  disabled,
}: {
  value: ClientChoice;
  onChange: (choice: ClientChoice) => void;
  label?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const clients = useClients();
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);

  const live = useMemo(() => (clients.data ?? []).filter((c) => !c.archivedAt), [clients.data]);
  const matches = useMemo(() => {
    const q = fold(term);
    return (q ? live.filter((c) => fold(c.name).includes(q)) : live).slice(0, 8);
  }, [live, term]);
  // Offered only when nothing already carries exactly that name. Near matches
  // are listed above it rather than merged: two similar names can be two
  // different legal persons, and that is the lawyer's call, not Scripta's.
  const exact = live.find((c) => fold(c.name) === fold(term));

  const pick = (choice: ClientChoice) => {
    onChange(choice);
    setTerm("");
    setOpen(false);
  };

  if (value.kind !== "none" && !open)
    return (
      <div className="org-field">
        <span className="org-label">{label}</span>
        <div className="org-picked">
          <span className="org-picked-name">{value.name}</span>
          {value.kind === "new" && <span className="org-picked-note">New client</span>}
          {!disabled && (
            <span className="org-picked-actions">
              <button type="button" onClick={() => setOpen(true)}>
                Change
              </button>
              <button type="button" onClick={() => pick(NO_CLIENT)}>
                Remove
              </button>
            </span>
          )}
        </div>
      </div>
    );

  return (
    <div className="org-field">
      <label className="org-label" htmlFor={id}>
        {label}
      </label>
      <div className="org-combo">
        <input
          id={id}
          value={term}
          disabled={disabled}
          placeholder={
            live.length ? "Search clients, or type a new name" : "Type the client's name"
          }
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              return;
            }
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (exact) pick({ kind: "existing", id: exact.id, name: exact.name });
            else if (term.trim()) pick({ kind: "new", name: term.trim() });
          }}
        />
        {open && (
          <div className="org-options" id={`${id}-list`} role="listbox">
            {matches.map((c: Client) => (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={value.kind === "existing" && value.id === c.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick({ kind: "existing", id: c.id, name: c.name })}
              >
                {c.name}
              </button>
            ))}
            {term.trim() && !exact && (
              <button
                type="button"
                role="option"
                aria-selected={false}
                className="org-option-create"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick({ kind: "new", name: term.trim() })}
              >
                Create client “{term.trim()}”
              </button>
            )}
            <button
              type="button"
              role="option"
              aria-selected={value.kind === "none"}
              className="org-option-none"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(NO_CLIENT)}
            >
              No client yet
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
