import { useState } from "react";
import { Button } from "@/components/primitives";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import { deleteRecord, insertRecord, setRecordArchived, updateRecord } from "../db";
import type { Organisation, Person } from "../model";
import { Field, FieldRow, OrgDialog, TextArea, TextInput, useOrgWrite } from "../ui";

/**
 * Someone at the client whose position matters to the firm: a director, the
 * finance manager, the company secretary. A name is enough; roles, offices and
 * authority are recorded where they live and read back onto the person.
 */
export default function PersonDialog({
  org,
  person,
  open,
  onClose,
  onSaved,
  defaults,
}: {
  org: Organisation;
  person: Person | null;
  open: boolean;
  onClose: () => void;
  onSaved?: (id: string) => void;
  defaults?: { fullName?: string };
}) {
  const [fullName, setFullName] = useState(person?.fullName ?? defaults?.fullName ?? "");
  const [email, setEmail] = useState(person?.email ?? "");
  const [phone, setPhone] = useState(person?.phone ?? "");
  const [location, setLocation] = useState(person?.location ?? "");
  const [notes, setNotes] = useState(person?.notes ?? "");
  const write = useOrgWrite(org.clientId);
  const { confirmDelete, confirmDialog } = useConfirmDelete();

  const save = async () => {
    if (!fullName.trim()) {
      write.setError("A person needs a name.");
      return;
    }
    const row = {
      full_name: fullName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      location: location.trim(),
      notes: notes.trim(),
    };
    let id = person?.id ?? "";
    const done = await write.run(async () => {
      if (person) await updateRecord("org_people", person.id, row);
      else id = await insertRecord(org, "org_people", row);
    });
    if (done) {
      onSaved?.(id);
      onClose();
    }
  };

  const remove = async () => {
    if (!person) return;
    const roles = org.roles.filter((r) => r.holderPersonId === person.id).length;
    const ok = await confirmDelete({
      what: `“${person.fullName}”`,
      binned: false,
      ...(roles
        ? {
            consequence: `The ${roles === 1 ? "role they hold becomes" : `${roles} roles they hold become`} vacant.`,
          }
        : {}),
    });
    if (!ok) return;
    const done = await write.run(() => deleteRecord("org_people", person.id));
    if (done) onClose();
  };

  return (
    <>
      <OrgDialog
        open={open}
        title={person ? `Edit ${person.fullName}` : "Add a person"}
        blurb="Roles, appointments and authority are recorded on the organogram, the entity and the authority matrix, and read back onto the person."
        onClose={onClose}
        onSubmit={save}
        submitLabel={person ? "Save" : "Add person"}
        busy={write.busy}
        error={write.error}
        extra={
          person && (
            <>
              <Button
                variant="quiet"
                onClick={() =>
                  void write
                    .run(() => setRecordArchived("org_people", person.id, !person.archivedAt))
                    .then((ok) => ok && onClose())
                }
              >
                {person.archivedAt ? "Restore" : "Archive"}
              </Button>
              <Button variant="danger" onClick={() => void remove()}>
                Delete
              </Button>
            </>
          )
        }
      >
        <Field label="Full name">
          <TextInput value={fullName} onChange={setFullName} autoFocus />
        </Field>
        <FieldRow>
          <Field label="Email">
            <TextInput type="email" value={email} onChange={setEmail} />
          </Field>
          <Field label="Phone">
            <TextInput value={phone} onChange={setPhone} />
          </Field>
        </FieldRow>
        <Field label="Location" hint="Where they are based">
          <TextInput value={location} onChange={setLocation} />
        </Field>
        <Field label="Notes">
          <TextArea value={notes} onChange={setNotes} />
        </Field>
      </OrgDialog>
      {confirmDialog}
    </>
  );
}
