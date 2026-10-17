/**
 * Something the client must do on a date: a return, a meeting, a register
 * review. A recurring obligation is one record; its dated occurrences are
 * generated from it, so a monthly VAT return appears in every month without
 * twelve rows to keep in step.
 */
import { useState } from "react";
import { Button } from "@/components/primitives";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import { deleteRecord, insertRecord, setRecordArchived, updateRecord } from "../db";
import {
  RECURRENCE_LABEL,
  type ChangeContext,
  type Obligation,
  type ObligationKind,
  type Organisation,
  type Recurrence,
} from "../model";
import { OBLIGATION_KIND_LABEL } from "../registers/labels";
import {
  ChangeFields,
  EntitySelect,
  Field,
  FieldRow,
  OrgDialog,
  PersonSelect,
  RoleSelect,
  Select,
  TextArea,
  TextInput,
  useOrgWrite,
} from "../ui";

export default function ObligationDialog({
  org,
  obligation,
  open,
  onClose,
  onSaved,
  defaults,
}: {
  org: Organisation;
  obligation: Obligation | null;
  open: boolean;
  onClose: () => void;
  onSaved?: (id: string) => void;
  defaults?: { entityId?: string | null; licenceId?: string | null };
}) {
  const o = obligation;
  const [title, setTitle] = useState(o?.title ?? "");
  const [kind, setKind] = useState<ObligationKind>(o?.kind ?? "filing");
  const [entityId, setEntityId] = useState<string | null>(
    o?.entityId ?? defaults?.entityId ?? null,
  );
  const [licenceId, setLicenceId] = useState<string | null>(
    o?.licenceId ?? defaults?.licenceId ?? null,
  );
  const [recurrence, setRecurrence] = useState<Recurrence>(o?.recurrence ?? "none");
  const [dueOn, setDueOn] = useState(o?.dueOn ?? "");
  const [endsOn, setEndsOn] = useState(o?.endsOn ?? "");
  const [ownerMode, setOwnerMode] = useState<"role" | "person">(
    o?.ownerPersonId ? "person" : "role",
  );
  const [ownerRoleId, setOwnerRoleId] = useState<string | null>(o?.ownerRoleId ?? null);
  const [ownerPersonId, setOwnerPersonId] = useState<string | null>(o?.ownerPersonId ?? null);
  const [penalty, setPenalty] = useState(o?.penaltyNote ?? "");
  const [detail, setDetail] = useState(o?.detail ?? "");
  const [change, setChange] = useState<ChangeContext>({});
  const write = useOrgWrite(org.clientId);
  const { confirmDelete, confirmDialog } = useConfirmDelete();

  const save = async () => {
    if (!title.trim()) return write.setError("Name the obligation.");
    if (!dueOn)
      return write.setError(
        recurrence === "none" ? "Give the due date." : "Give the first due date.",
      );
    const row = {
      title: title.trim(),
      kind,
      entity_id: entityId,
      licence_id: licenceId,
      recurrence,
      due_on: dueOn,
      ends_on: recurrence === "none" ? null : endsOn || null,
      owner_role_id: ownerMode === "role" ? ownerRoleId : null,
      owner_person_id: ownerMode === "person" ? ownerPersonId : null,
      penalty_note: penalty.trim(),
      detail,
    };
    let id = o?.id ?? "";
    const ok = await write.run(async () => {
      if (o) await updateRecord("org_obligations", o.id, row, change);
      else id = await insertRecord(org, "org_obligations", row, change);
    });
    if (ok) {
      onSaved?.(id);
      onClose();
    }
  };

  const licences = org.licences
    .filter((l) => !l.archivedAt && (!entityId || !l.entityId || l.entityId === entityId))
    .map((l) => ({ value: l.id, label: l.name }));

  return (
    <OrgDialog
      open={open}
      width={600}
      title={o ? `Edit ${o.title}` : "Add an obligation"}
      onClose={onClose}
      onSubmit={save}
      submitLabel={o ? "Save" : "Add obligation"}
      busy={write.busy}
      error={write.error}
      extra={
        o && (
          <>
            <Button
              variant="quiet"
              onClick={async () => {
                if (
                  await write.run(() => setRecordArchived("org_obligations", o.id, !o.archivedAt))
                )
                  onClose();
              }}
            >
              {o.archivedAt ? "Restore" : "Archive"}
            </Button>
            <Button
              variant="quiet"
              onClick={async () => {
                const yes = await confirmDelete({
                  what: `“${o.title}”`,
                  consequence:
                    "Its recorded occurrences go with it. Archive it to stop new ones and keep the history.",
                  binned: false,
                });
                if (yes && (await write.run(() => deleteRecord("org_obligations", o.id))))
                  onClose();
              }}
            >
              Delete
            </Button>
          </>
        )
      }
    >
      {confirmDialog}
      <Field label="Obligation">
        <TextInput value={title} onChange={setTitle} placeholder="Annual return" autoFocus={!o} />
      </Field>
      <FieldRow>
        <Field label="Kind">
          <Select
            value={kind}
            onChange={(v) => setKind((v || "filing") as ObligationKind)}
            options={(Object.keys(OBLIGATION_KIND_LABEL) as ObligationKind[]).map((k) => ({
              value: k,
              label: OBLIGATION_KIND_LABEL[k],
            }))}
          />
        </Field>
        <Field label="Entity">
          <EntitySelect org={org} value={entityId} onChange={setEntityId} empty="The whole group" />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Repeats">
          <Select
            value={recurrence}
            onChange={(v) => setRecurrence((v || "none") as Recurrence)}
            options={(Object.keys(RECURRENCE_LABEL) as Recurrence[]).map((k) => ({
              value: k,
              label: RECURRENCE_LABEL[k],
            }))}
          />
        </Field>
        <Field
          label={recurrence === "none" ? "Due" : "First due"}
          hint={recurrence === "none" ? undefined : "Later dates keep this day of the month"}
        >
          <TextInput type="date" value={dueOn} onChange={setDueOn} />
        </Field>
        {recurrence !== "none" && (
          <Field label="Ends" hint="Blank: continues">
            <TextInput type="date" value={endsOn} onChange={setEndsOn} />
          </Field>
        )}
      </FieldRow>
      <FieldRow>
        <Field label="Owner at the client">
          <Select
            value={ownerMode}
            onChange={(v) => setOwnerMode((v || "role") as "role" | "person")}
            options={[
              { value: "role", label: "A role" },
              { value: "person", label: "A person" },
            ]}
          />
        </Field>
        <Field
          label={ownerMode === "role" ? "Role" : "Person"}
          hint={ownerMode === "role" ? "Roles outlast the people in them" : undefined}
        >
          {ownerMode === "role" ? (
            <RoleSelect org={org} value={ownerRoleId} onChange={setOwnerRoleId} empty="No owner" />
          ) : (
            <PersonSelect
              org={org}
              value={ownerPersonId}
              onChange={setOwnerPersonId}
              empty="No owner"
            />
          )}
        </Field>
      </FieldRow>
      {licences.length > 0 && (
        <Field label="Licence it concerns">
          <Select
            value={licenceId ?? ""}
            onChange={(v) => setLicenceId(v || null)}
            options={licences}
            empty="None"
          />
        </Field>
      )}
      <Field label="Penalty for lateness" hint="e.g. GHS 50 per month">
        <TextInput value={penalty} onChange={setPenalty} />
      </Field>
      <Field label="Notes">
        <TextArea rows={2} value={detail} onChange={setDetail} />
      </Field>
      <ChangeFields value={change} onChange={setChange} />
    </OrgDialog>
  );
}
