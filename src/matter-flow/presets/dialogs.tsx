/**
 * The forms a preset needs. They mirror the matter's own phase and deliverable
 * dialogs, with two differences: dates are working-day offsets from the matter
 * start rather than fixed dates, and an owner is a role rather than a person.
 */
import { useState } from "react";
import { Button } from "@/components/primitives";
import { Dialog } from "../dialogs";
import { ACTION_TYPE_LABEL, DOCUMENT_TYPE_LABEL } from "../editor-routes";
import { FLOW, fmtDay } from "../ui";
import type { ActionType, DeliverableKind, DocumentType } from "../model";
import { addWorkingDays, type PresetDeliverable, type PresetPhase } from "./model";

/** What a working-day offset lands on for a matter starting today. */
export function OffsetHint({ start, offset }: { start: string; offset: number }) {
  return (
    <span style={{ color: FLOW.muted, fontSize: 11.5 }}>
      {offset === 0 ? "the start day" : fmtDay(addWorkingDays(start, offset))} if the matter starts
      today
    </span>
  );
}

const linesToList = (value: string) =>
  value
    .split("\n")
    .map((s) => s.replace(/^\s*(\d+[.)]|[-•])\s*/, "").trim())
    .filter(Boolean);

/* --------------------------------------------------------------- phase */

export type PresetPhaseInput = Omit<PresetPhase, "id" | "order">;

export function PresetPhaseDialog({
  open,
  initial,
  today,
  onClose,
  onSave,
  onDelete,
  onMove,
}: {
  open: boolean;
  initial?: PresetPhase | undefined;
  today: string;
  onClose: () => void;
  onSave: (input: PresetPhaseInput) => void;
  onDelete?: (() => void) | undefined;
  onMove?: { earlier?: (() => void) | undefined; later?: (() => void) | undefined } | undefined;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [steps, setSteps] = useState((initial?.steps ?? []).join("\n"));
  const [note, setNote] = useState(initial?.note ?? "");
  const [dueOffset, setDueOffset] = useState(String(initial?.dueOffset ?? 10));
  const editing = !!initial;
  const offset = Math.max(0, Number(dueOffset) || 0);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? "Edit phase" : "Add phase"}
      label={editing ? "Edit preset phase" : "Add preset phase"}
      submitLabel={editing ? "Save" : "Add phase"}
      canSubmit={name.trim().length > 0}
      danger={editing && onDelete ? { label: "Delete phase", onClick: onDelete } : undefined}
      onSubmit={() => {
        onSave({
          name: name.trim(),
          description: description.trim(),
          steps: linesToList(steps),
          note: note.trim(),
          dueOffset: offset,
        });
        onClose();
      }}
    >
      <div style={{ color: FLOW.grey, fontSize: 12.5, lineHeight: 1.5 }}>
        A phase is one scope-of-services item this kind of work always has.
      </div>
      <label className="mf-field">
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
      </label>
      <label className="mf-field">
        What this phase does
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label className="mf-field">
        Steps (one per line)
        <textarea
          value={steps}
          onChange={(e) => setSteps(e.target.value)}
          style={{ minHeight: 74 }}
        />
      </label>
      <label className="mf-field">
        Guidance
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What whoever picks this up needs to know before starting."
        />
      </label>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label className="mf-field" style={{ width: 230 }}>
          Due, working days from the matter start
          <input
            type="number"
            min={0}
            value={dueOffset}
            onChange={(e) => setDueOffset(e.target.value)}
            required
          />
        </label>
        <div style={{ paddingBottom: 8 }}>
          <OffsetHint start={today} offset={offset} />
        </div>
      </div>
      {editing && onMove && (onMove.earlier || onMove.later) && (
        <div style={{ display: "flex", gap: 6 }}>
          <Button onClick={() => onMove.earlier?.()} disabled={!onMove.earlier}>
            ‹ Move earlier
          </Button>
          <Button onClick={() => onMove.later?.()} disabled={!onMove.later}>
            Move later ›
          </Button>
        </div>
      )}
    </Dialog>
  );
}

/* --------------------------------------------------------- deliverable */

export type PresetDeliverableInput = Omit<PresetDeliverable, "id" | "phaseId">;

export function PresetDeliverableDialog({
  open,
  initial,
  defaultKind,
  today,
  phaseDueOffset,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  initial?: PresetDeliverable | undefined;
  defaultKind: DeliverableKind;
  today: string;
  phaseDueOffset: number;
  onClose: () => void;
  onSave: (input: PresetDeliverableInput) => void;
  onDelete?: (() => void) | undefined;
}) {
  const [kind, setKind] = useState<DeliverableKind>(initial?.kind ?? defaultKind);
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<string>(
    initial?.type ?? (defaultKind === "document" ? "memo" : "email"),
  );
  const [description, setDescription] = useState(initial?.description ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [ownerRole, setOwnerRole] = useState(initial?.ownerRole ?? "");
  const [startOffset, setStartOffset] = useState(String(initial?.startOffset ?? 0));
  const [dueOffset, setDueOffset] = useState(String(initial?.dueOffset ?? phaseDueOffset));
  const [mandatory, setMandatory] = useState(initial?.mandatory ?? true);
  const [expected, setExpected] = useState((initial?.expected ?? []).join("\n"));
  const types: Record<string, string> =
    kind === "document" ? DOCUMENT_TYPE_LABEL : ACTION_TYPE_LABEL;
  const editing = !!initial;
  const start = Math.max(0, Number(startOffset) || 0);
  const due = Math.max(0, Number(dueOffset) || 0);
  const switchKind = (next: DeliverableKind) => {
    setKind(next);
    if (!(type in (next === "document" ? DOCUMENT_TYPE_LABEL : ACTION_TYPE_LABEL)))
      setType(next === "document" ? "memo" : "email");
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={
        editing
          ? `Edit ${kind === "document" ? "deliverable" : "action"}`
          : kind === "document"
            ? "Add deliverable"
            : "Add action"
      }
      label={editing ? "Edit preset deliverable" : "Add preset deliverable"}
      submitLabel={editing ? "Save" : "Add"}
      canSubmit={name.trim().length > 0 && start <= due}
      danger={editing && onDelete ? { label: "Delete", onClick: onDelete } : undefined}
      onSubmit={() => {
        onSave({
          kind,
          name: name.trim(),
          type: type as DocumentType | ActionType,
          description: description.trim(),
          note: note.trim(),
          ownerRole: ownerRole.trim(),
          startOffset: start,
          dueOffset: due,
          mandatory,
          expected: linesToList(expected),
        });
        onClose();
      }}
    >
      <div role="radiogroup" aria-label="Kind" style={{ display: "flex", gap: 6 }}>
        {(["document", "action"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            className={`mf-filter-chip${kind === k ? " is-on" : ""}`}
            onClick={() => switchKind(k)}
          >
            {k === "document" ? "Document to produce" : "Action to take"}
          </button>
        ))}
      </div>
      <label className="mf-field">
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
      </label>
      <label className="mf-field">
        Type
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {Object.entries(types).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="mf-field">
        {kind === "document" ? "Purpose" : "Detail"}
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label className="mf-field">
        Guidance
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What to watch out for, or why this one is mandatory."
        />
      </label>
      {kind === "document" && (
        <label className="mf-field">
          Uploads this expects (one per line)
          <textarea
            value={expected}
            onChange={(e) => setExpected(e.target.value)}
            placeholder={"Assay certificate\nExport permit"}
          />
        </label>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <label className="mf-field">
          Owner role
          <input
            value={ownerRole}
            onChange={(e) => setOwnerRole(e.target.value)}
            maxLength={12}
            placeholder="Lead"
          />
        </label>
        <label className="mf-field">
          Starts (day)
          <input
            type="number"
            min={0}
            value={startOffset}
            onChange={(e) => setStartOffset(e.target.value)}
            required
          />
        </label>
        <label className="mf-field">
          Due (day)
          <input
            type="number"
            min={0}
            value={dueOffset}
            onChange={(e) => setDueOffset(e.target.value)}
            required
          />
        </label>
      </div>
      <div>
        <OffsetHint start={today} offset={due} />
        {start > due && (
          <div style={{ color: FLOW.red, fontSize: 11.5, marginTop: 4 }}>
            It cannot be due before it starts.
          </div>
        )}
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
        <input
          type="checkbox"
          checked={mandatory}
          onChange={(e) => setMandatory(e.target.checked)}
        />
        Mandatory — the phase cannot close until this is done
      </label>
    </Dialog>
  );
}

/* -------------------------------------------------------------- party */

export function PartyDialog({
  open,
  initial,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  initial?: { role: string; note: string } | undefined;
  onClose: () => void;
  onSave: (input: { role: string; note: string }) => void;
  onDelete?: (() => void) | undefined;
}) {
  const [role, setRole] = useState(initial?.role ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={initial ? "Edit role" : "Add role"}
      label={initial ? "Edit party role" : "Add party role"}
      submitLabel={initial ? "Save" : "Add role"}
      canSubmit={role.trim().length > 0}
      danger={initial && onDelete ? { label: "Delete role", onClick: onDelete } : undefined}
      onSubmit={() => {
        onSave({ role: role.trim(), note: note.trim() });
        onClose();
      }}
    >
      <div style={{ color: FLOW.grey, fontSize: 12.5, lineHeight: 1.5 }}>
        The cast this kind of matter needs. Names are filled in on the matter itself.
      </div>
      <label className="mf-field">
        Role
        <input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          autoFocus
          required
          placeholder="Escrow agent"
        />
      </label>
      <label className="mf-field">
        Note
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Who normally fills this role, or what to check about them."
        />
      </label>
    </Dialog>
  );
}
