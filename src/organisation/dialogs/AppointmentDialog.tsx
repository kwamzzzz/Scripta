/**
 * An office held in an entity: director, secretary, signatory.
 *
 * Ending an appointment is recording the date it ceased, not deleting it —
 * "who was a director when this was signed?" needs the old board as well as
 * the new one. Delete is for a record made in error.
 */
import { useState } from "react";
import { Button } from "@/components/primitives";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import { deleteRecord, insertRecord, updateRecord } from "../db";
import {
  CAPACITY_LABEL,
  personName,
  type Appointment,
  type Capacity,
  type ChangeContext,
  type Organisation,
} from "../model";
import {
  ChangeFields,
  EntitySelect,
  Field,
  FieldRow,
  OrgDialog,
  PersonSelect,
  Select,
  TextInput,
  useOrgWrite,
} from "../ui";

export default function AppointmentDialog({
  org,
  appointment,
  open,
  onClose,
  onSaved,
  defaults,
}: {
  org: Organisation;
  appointment: Appointment | null;
  open: boolean;
  onClose: () => void;
  onSaved?: (id: string) => void;
  defaults?: { entityId?: string; personId?: string };
}) {
  const [personId, setPersonId] = useState<string | null>(
    appointment?.personId ?? defaults?.personId ?? null,
  );
  const [newPerson, setNewPerson] = useState("");
  const [adding, setAdding] = useState(false);
  const [entityId, setEntityId] = useState<string | null>(
    appointment?.entityId ?? defaults?.entityId ?? null,
  );
  const [capacity, setCapacity] = useState<Capacity>(appointment?.capacity ?? "director");
  const [title, setTitle] = useState(appointment?.title ?? "");
  const [appointedOn, setAppointedOn] = useState(appointment?.appointedOn ?? "");
  const [ceasedOn, setCeasedOn] = useState(appointment?.ceasedOn ?? "");
  const [change, setChange] = useState<ChangeContext>({ ref: appointment?.lastChangeRef ?? "" });
  const write = useOrgWrite(org.clientId);
  const { confirmDelete, confirmDialog } = useConfirmDelete();

  const save = async () => {
    if (!entityId) return write.setError("Choose the entity.");
    if (!personId && !(adding && newPerson.trim()))
      return write.setError("Choose or add the person.");
    let id = appointment?.id ?? "";
    const ok = await write.run(async () => {
      let person = personId;
      if (adding && newPerson.trim())
        person = await insertRecord(org, "org_people", { full_name: newPerson.trim() });
      const row = {
        person_id: person,
        entity_id: entityId,
        capacity,
        title: title.trim(),
        appointed_on: appointedOn || null,
        ceased_on: ceasedOn || null,
      };
      // The effective date of an appointment is its own date; the reference is the filing.
      const context = { on: ceasedOn || appointedOn || change.on || null, ref: change.ref ?? null };
      if (appointment) await updateRecord("org_appointments", appointment.id, row, context);
      else id = await insertRecord(org, "org_appointments", row, context);
    });
    if (ok) {
      onSaved?.(id);
      onClose();
    }
  };

  return (
    <OrgDialog
      open={open}
      title={
        appointment
          ? `${CAPACITY_LABEL[appointment.capacity]} — ${personName(org, appointment.personId)}`
          : "Record an appointment"
      }
      blurb="Record when the office began and, when it ends, the date it ceased. Past officers stay on the record."
      onClose={onClose}
      onSubmit={save}
      submitLabel={appointment ? "Save" : "Record appointment"}
      busy={write.busy}
      error={write.error}
      extra={
        appointment && (
          <Button
            variant="quiet"
            onClick={async () => {
              const yes = await confirmDelete({
                what: "this appointment",
                consequence: "Record a ceased date instead if the person has left the office.",
                archivable: false,
                binned: false,
              });
              if (yes && (await write.run(() => deleteRecord("org_appointments", appointment.id))))
                onClose();
            }}
          >
            Delete
          </Button>
        )
      }
    >
      {confirmDialog}
      {adding ? (
        <Field label="New person" hint="Their full name as it appears on filings">
          <TextInput value={newPerson} onChange={setNewPerson} autoFocus />
        </Field>
      ) : (
        <Field label="Person">
          <PersonSelect org={org} value={personId} onChange={setPersonId} empty="Choose a person" />
        </Field>
      )}
      <div>
        <button type="button" className="org-link" onClick={() => setAdding((a) => !a)}>
          {adding ? "Choose someone already recorded" : "Someone not yet recorded"}
        </button>
      </div>
      <FieldRow>
        <Field label="Entity">
          <EntitySelect
            org={org}
            value={entityId}
            onChange={setEntityId}
            empty="Choose an entity"
          />
        </Field>
        <Field label="Office">
          <Select
            value={capacity}
            onChange={(v) => setCapacity((v || "director") as Capacity)}
            options={(Object.keys(CAPACITY_LABEL) as Capacity[]).map((k) => ({
              value: k,
              label: CAPACITY_LABEL[k],
            }))}
          />
        </Field>
      </FieldRow>
      <Field label="Title" hint="Optional, e.g. Executive director">
        <TextInput value={title} onChange={setTitle} />
      </Field>
      <FieldRow>
        <Field label="Appointed">
          <TextInput type="date" value={appointedOn} onChange={setAppointedOn} />
        </Field>
        <Field label="Ceased" hint="Leave blank while in office">
          <TextInput type="date" value={ceasedOn} onChange={setCeasedOn} />
        </Field>
      </FieldRow>
      <ChangeFields value={change} onChange={setChange} prompt="What records it" />
    </OrgDialog>
  );
}
