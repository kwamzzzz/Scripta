/**
 * A process the client follows: its name, what it is for, who owns it, how
 * often it runs, and the document it is written in. The steps are edited on
 * the process itself, where they can be seen in order.
 */
import { useState } from "react";
import { insertRecord, linkDocument, updateRecord } from "../db";
import type { Organisation, Process } from "../model";
import {
  Field,
  FieldRow,
  OrgDialog,
  RoleSelect,
  Select,
  TextArea,
  TextInput,
  useOrgWrite,
} from "../ui";

export default function ProcessDialog({
  org,
  process,
  open,
  onClose,
  onSaved,
}: {
  org: Organisation;
  process: Process | null;
  open: boolean;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const [name, setName] = useState(process?.name ?? "");
  const [summary, setSummary] = useState(process?.summary ?? "");
  const [ownerRoleId, setOwnerRoleId] = useState<string | null>(process?.ownerRoleId ?? null);
  const [cadence, setCadence] = useState(process?.cadence ?? "");
  const [sourceId, setSourceId] = useState<string>(process?.sourceDocumentId ?? "");
  const write = useOrgWrite(org.clientId);

  const submit = async () => {
    if (!name.trim()) {
      write.setError("A process needs a name.");
      return;
    }
    const row = {
      name: name.trim(),
      summary: summary.trim(),
      owner_role_id: ownerRoleId,
      cadence: cadence.trim(),
      source_document_id: sourceId || null,
    };
    let id = process?.id ?? "";
    const ok = await write.run(async () => {
      if (process) await updateRecord("org_processes", process.id, row);
      else id = await insertRecord(org, "org_processes", { ...row, status: "draft" });
      // The source is also evidence, so the document shelf shows what it backs.
      if (sourceId && sourceId !== process?.sourceDocumentId)
        await linkDocument(org, sourceId, "process", id);
    });
    if (ok) {
      onSaved?.(id);
      onClose();
    }
  };

  return (
    <OrgDialog
      open={open}
      title={process ? "Edit process" : "New process"}
      blurb={
        process ? undefined : "A procedure the client follows. Add its steps once it is created."
      }
      onClose={onClose}
      onSubmit={submit}
      submitLabel={process ? "Save" : "Create process"}
      busy={write.busy}
      error={write.error}
    >
      <Field label="Name">
        <TextInput
          value={name}
          onChange={setName}
          autoFocus
          placeholder="e.g. New supply contract"
        />
      </Field>
      <Field label="What it is for">
        <TextArea value={summary} onChange={setSummary} rows={2} />
      </Field>
      <FieldRow>
        <Field label="Owner">
          <RoleSelect
            org={org}
            value={ownerRoleId}
            onChange={setOwnerRoleId}
            empty="No owner named"
          />
        </Field>
        <Field label="Runs" hint="e.g. On the 10th monthly, Per contract">
          <TextInput value={cadence} onChange={setCadence} />
        </Field>
      </FieldRow>
      <Field label="Written in" hint="The document the procedure comes from">
        <Select
          value={sourceId}
          onChange={setSourceId}
          empty="No source document"
          options={org.documents.map((d) => ({ value: d.id, label: d.name }))}
        />
      </Field>
    </OrgDialog>
  );
}
