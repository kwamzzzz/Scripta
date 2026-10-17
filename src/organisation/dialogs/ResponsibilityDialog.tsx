import { useState } from "react";
import { Button } from "@/components/primitives";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import { deleteRecord, insertRecord, updateRecord } from "../db";
import type { ChangeContext, Organisation, Responsibility } from "../model";
import {
  ChangeFields,
  Field,
  FieldRow,
  OrgDialog,
  RoleSelect,
  TextArea,
  TextInput,
  useOrgWrite,
} from "../ui";

/**
 * Who owns a function at the client, and who stands in. Held by roles, so a
 * change of finance manager does not leave "tax filings" owned by a leaver.
 */
export default function ResponsibilityDialog({
  org,
  responsibility,
  open,
  onClose,
  defaults,
}: {
  org: Organisation;
  responsibility: Responsibility | null;
  open: boolean;
  onClose: () => void;
  defaults?: { roleId?: string | null };
}) {
  const [area, setArea] = useState(responsibility?.area ?? "");
  const [detail, setDetail] = useState(responsibility?.detail ?? "");
  const [roleId, setRoleId] = useState<string | null>(
    responsibility?.roleId ?? defaults?.roleId ?? null,
  );
  const [deputyRoleId, setDeputyRoleId] = useState<string | null>(
    responsibility?.deputyRoleId ?? null,
  );
  const [change, setChange] = useState<ChangeContext>({});
  const write = useOrgWrite(org.clientId);
  const { confirmDelete, confirmDialog } = useConfirmDelete();

  const save = async () => {
    if (!area.trim()) return write.setError("Name the responsibility.");
    if (!roleId) return write.setError("Choose the role that owns it.");
    if (deputyRoleId === roleId) return write.setError("The deputy must be a different role.");
    const row = {
      area: area.trim(),
      detail: detail.trim(),
      role_id: roleId,
      deputy_role_id: deputyRoleId,
    };
    const done = await write.run(() =>
      responsibility
        ? updateRecord("org_responsibilities", responsibility.id, row, change)
        : insertRecord(
            org,
            "org_responsibilities",
            { ...row, position: org.responsibilities.length },
            change,
          ),
    );
    if (done) onClose();
  };

  const remove = async () => {
    if (!responsibility) return;
    if (
      !(await confirmDelete({ what: `“${responsibility.area}”`, binned: false, archivable: false }))
    )
      return;
    if (await write.run(() => deleteRecord("org_responsibilities", responsibility.id))) onClose();
  };

  return (
    <>
      <OrgDialog
        open={open}
        title={responsibility ? "Edit responsibility" : "Add a responsibility"}
        blurb="A responsibility with no deputy is flagged, so the gap is found before an absence rather than during one."
        onClose={onClose}
        onSubmit={save}
        submitLabel={responsibility ? "Save" : "Add responsibility"}
        busy={write.busy}
        error={write.error}
        extra={
          responsibility && (
            <Button variant="danger" onClick={() => void remove()}>
              Delete
            </Button>
          )
        }
      >
        <Field
          label="Responsibility"
          hint="e.g. Tax filings, Company secretarial, Regulator liaison"
        >
          <TextInput value={area} onChange={setArea} autoFocus />
        </Field>
        <Field label="What it covers">
          <TextArea value={detail} onChange={setDetail} rows={2} />
        </Field>
        <FieldRow>
          <Field label="Owned by">
            <RoleSelect org={org} value={roleId} onChange={setRoleId} empty="Choose a role" />
          </Field>
          <Field label="Deputy">
            <RoleSelect
              org={org}
              value={deputyRoleId}
              onChange={setDeputyRoleId}
              empty="No deputy"
              exclude={(id) => id === roleId}
            />
          </Field>
        </FieldRow>
        <ChangeFields value={change} onChange={setChange} />
      </OrgDialog>
      {confirmDialog}
    </>
  );
}
