/**
 * The small forms Flow needs: add or edit a phase, add or edit a
 * deliverable or action, log the evidence that makes an action done, and set
 * or move dates. They use the shared wireframe modal for focus containment.
 */
import { useState, type FormEvent, type ReactNode } from "react";
import { Modal } from "@/wireframe/screens";
import { PersonPicker } from "@/components/Person";
import { useMatterTeam } from "@/lib/matter-team";
import { Button } from "@/components/primitives";
import type {
  ActionType,
  Deliverable,
  DeliverableKind,
  DocumentType,
  Evidence,
  Phase,
} from "./model";
import { ACTION_TYPE_LABEL, DOCUMENT_TYPE_LABEL } from "./editor-routes";
import { FLOW } from "./ui";

export function Dialog({
  open,
  onClose,
  title,
  label,
  children,
  onSubmit,
  submitLabel,
  canSubmit = true,
  danger,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  label: string;
  children: ReactNode;
  onSubmit: () => void;
  submitLabel: string;
  canSubmit?: boolean;
  /** A destructive action offered on the left of the footer (Delete …). */
  danger?: { label: string; onClick: () => void } | undefined;
}) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (canSubmit) onSubmit();
  };
  return (
    <Modal open={open} onClose={onClose} label={label}>
      <form className="mf-dialog" onSubmit={submit}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{title}</div>
        {children}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
          {danger && (
            <Button variant="danger" onClick={danger.onClick}>
              {danger.label}
            </Button>
          )}
          <div style={{ flex: 1 }} />
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={!canSubmit}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* --------------------------------------------------------------- phase */

export type PhaseInput = Omit<Phase, "id" | "matterId" | "order">;

export function PhaseDialog({
  open,
  initial,
  defaultDeadline,
  onClose,
  onSave,
  onDelete,
  onMove,
}: {
  open: boolean;
  /** Editing an existing phase; absent when adding one. */
  initial?: Phase | undefined;
  defaultDeadline: string;
  onClose: () => void;
  onSave: (input: PhaseInput) => void;
  onDelete?: (() => void) | undefined;
  /** Reorder on the bar; absent at the ends. */
  onMove?: { earlier?: (() => void) | undefined; later?: (() => void) | undefined } | undefined;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [deadline, setDeadline] = useState(initial?.deadline ?? defaultDeadline);
  const [steps, setSteps] = useState((initial?.steps ?? []).join("\n"));
  const editing = !!initial;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? "Edit phase" : "Add phase"}
      label={editing ? "Edit phase" : "Add phase"}
      submitLabel={editing ? "Save" : "Add phase"}
      canSubmit={name.trim().length > 0 && !!deadline}
      danger={editing && onDelete ? { label: "Delete phase", onClick: onDelete } : undefined}
      onSubmit={() => {
        onSave({
          name: name.trim(),
          description: description.trim(),
          deadline,
          steps: steps
            .split("\n")
            .map((s) => s.replace(/^\s*(\d+[.)]|[-•])\s*/, "").trim())
            .filter(Boolean),
        });
        onClose();
      }}
    >
      <div style={{ color: FLOW.grey, fontSize: 12.5, lineHeight: 1.5 }}>
        A phase is one scope-of-services item from the proposal or engagement letter.
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
          placeholder={
            "Identifies the transaction parties and their roles.\nDesigns the transaction flow…"
          }
          style={{ minHeight: 84 }}
        />
      </label>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label className="mf-field" style={{ width: 200 }}>
          Phase deadline
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            required
          />
        </label>
        {editing && onMove && (onMove.earlier || onMove.later) && (
          <div style={{ display: "flex", gap: 6, paddingBottom: 1 }}>
            <Button
              onClick={() => onMove.earlier?.()}
              disabled={!onMove.earlier}
              title="Move one step earlier on the bar"
            >
              ‹ Move earlier
            </Button>
            <Button
              onClick={() => onMove.later?.()}
              disabled={!onMove.later}
              title="Move one step later on the bar"
            >
              Move later ›
            </Button>
          </div>
        )}
      </div>
    </Dialog>
  );
}

/* --------------------------------------------------------- deliverable */

export type DeliverableInput = Omit<Deliverable, "id" | "ticked" | "phaseId">;

export function DeliverableDialog({
  open,
  initial,
  defaultKind,
  today,
  phaseDeadline,
  matterId,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  /** Editing an existing deliverable; absent when adding one. */
  initial?: Deliverable | undefined;
  defaultKind: DeliverableKind;
  today: string;
  phaseDeadline: string;
  /** The matter this flow belongs to. Its team is who may own a deliverable. */
  /** Owners are the matter's team; a flow filed to no matter has none to offer. */
  matterId: string | null;
  onClose: () => void;
  onSave: (input: DeliverableInput) => void;
  onDelete?: (() => void) | undefined;
}) {
  const [kind, setKind] = useState<DeliverableKind>(initial?.kind ?? defaultKind);
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<string>(
    initial?.type ?? (defaultKind === "document" ? "memo" : "email"),
  );
  const [description, setDescription] = useState(initial?.description ?? "");
  const [ownerId, setOwnerId] = useState<string | null>(initial?.ownerId ?? null);
  const [start, setStart] = useState(initial?.start ?? today);
  const [deadline, setDeadline] = useState(initial?.deadline ?? phaseDeadline);
  const [mandatory, setMandatory] = useState(initial?.mandatory ?? true);
  const types: Record<string, string> =
    kind === "document" ? DOCUMENT_TYPE_LABEL : ACTION_TYPE_LABEL;
  const editing = !!initial;
  const team = useMatterTeam(matterId);
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
      label={editing ? "Edit deliverable" : "Add deliverable"}
      submitLabel={editing ? "Save" : "Add"}
      canSubmit={name.trim().length > 0 && !!deadline && !!start && start <= deadline}
      danger={editing && onDelete ? { label: "Delete", onClick: onDelete } : undefined}
      onSubmit={() => {
        onSave({
          kind,
          name: name.trim(),
          type: type as DocumentType | ActionType,
          description: description.trim(),
          // The text column keeps whatever was typed before this became a
          // person, so an older deliverable does not lose its only record.
          owner: initial?.owner ?? "",
          ownerId,
          start,
          deadline,
          mandatory,
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
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <label className="mf-field">
          Owner
          <PersonPicker value={ownerId} team={team.data ?? []} onChange={setOwnerId} />
        </label>
        <label className="mf-field">
          Start
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} required />
        </label>
        <label className="mf-field">
          Due
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            required
          />
        </label>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
        <input
          type="checkbox"
          checked={mandatory}
          onChange={(e) => setMandatory(e.target.checked)}
        />
        Mandatory — the phase cannot close without it
      </label>
    </Dialog>
  );
}

/* ---------------------------------------------------------- evidence */

export type NewEvidence = Omit<Evidence, "id" | "deliverableId" | "createdAt"> & { file?: File };

export function EvidenceDialog({
  open,
  deliverableName,
  preset,
  onClose,
  onAdd,
}: {
  open: boolean;
  deliverableName: string;
  /** "call" pre-fills a call note; anything else starts blank. */
  preset?: "call" | undefined;
  onClose: () => void;
  onAdd: (input: NewEvidence) => void;
}) {
  const [name, setName] = useState(preset === "call" ? "Call note" : "");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={preset === "call" ? "Log a call" : "Add evidence"}
      label="Add evidence"
      submitLabel={preset === "call" ? "Log call" : "Add and tick"}
      canSubmit={name.trim().length > 0 || !!file}
      onSubmit={() => {
        const label = name.trim() || file?.name || "Evidence";
        const kind = file
          ? file.type.startsWith("image/")
            ? "image"
            : file.type === "application/pdf"
              ? "PDF"
              : "file"
          : "note";
        onAdd({
          name: label,
          ...(note.trim() ? { note: note.trim() } : {}),
          ...(file ? { file } : {}),
          meta: `${kind} · ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`,
        });
        onClose();
      }}
    >
      <div style={{ color: FLOW.grey, fontSize: 12.5, lineHeight: 1.5 }}>
        What shows that <b>{deliverableName}</b> was done? A receipt, an email thread, a call note
        or a photo of a stamped form.
      </div>
      <label className="mf-field">
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </label>
      <label className="mf-field">
        Note
        <textarea value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <label className="mf-field">
        File (optional)
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
    </Dialog>
  );
}

/* ------------------------------------------------------------- dates */

export function DatesDialog({
  open,
  title,
  start,
  deadline,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  start: string;
  deadline: string;
  onClose: () => void;
  onSave: (start: string, deadline: string) => void;
}) {
  const [from, setFrom] = useState(start);
  const [to, setTo] = useState(deadline);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      label={title}
      submitLabel="Save dates"
      canSubmit={!!from && !!to && from <= to}
      onSubmit={() => {
        onSave(from, to);
        onClose();
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label className="mf-field">
          Start
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} autoFocus />
        </label>
        <label className="mf-field">
          Deadline
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
    </Dialog>
  );
}

export function FollowUpDialog({
  open,
  who,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  who: string;
  initial: string;
  onClose: () => void;
  onSave: (date: string) => void;
}) {
  const [date, setDate] = useState(initial);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Schedule follow-up"
      label="Schedule follow-up"
      submitLabel="Schedule"
      canSubmit={!!date}
      onSubmit={() => {
        onSave(date);
        onClose();
      }}
    >
      <div style={{ color: FLOW.grey, fontSize: 12.5, lineHeight: 1.5 }}>
        When should we chase <b>{who}</b> if nothing has come back?
      </div>
      <label className="mf-field">
        Follow up on
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} autoFocus />
      </label>
    </Dialog>
  );
}
