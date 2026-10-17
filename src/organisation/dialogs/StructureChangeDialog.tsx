/**
 * A named step towards the target structure: "Insert a holding company",
 * "Acquire the remaining 49%". Proposed entities and holdings hang off it.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/primitives";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import { deleteRecord, insertRecord, updateRecord } from "../db";
import type { ChangeContext, Organisation, StructureChange } from "../model";
import { ChangeFields, Field, OrgDialog, Select, TextArea, TextInput, useOrgWrite } from "../ui";
import { completeStructureChange } from "../charts/structure-change";

type Status = StructureChange["status"];

export default function StructureChangeDialog({
  org,
  change,
  open,
  onClose,
  onSaved,
}: {
  org: Organisation;
  change: StructureChange | null;
  open: boolean;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const write = useOrgWrite(org.clientId);
  const { confirmDelete, confirmDialog } = useConfirmDelete();
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [status, setStatus] = useState<Status>("planned");
  const [context, setContext] = useState<ChangeContext>({});

  useEffect(() => {
    if (!open) return;
    write.setError(null);
    setTitle(change?.title ?? "");
    setDetail(change?.detail ?? "");
    setStatus(change?.status ?? "planned");
    setContext({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, change?.id]);

  const save = async () => {
    if (!title.trim()) return write.setError("Name the change.");
    let id = change?.id ?? "";
    const row = { title: title.trim(), detail: detail.trim(), status };
    const completing = status === "done" && change?.status !== "done";
    const ok = await write.run(async () => {
      if (change)
        await updateRecord("org_structure_changes", change.id, {
          ...row,
          status: completing ? change.status : status,
        });
      else
        id = await insertRecord(org, "org_structure_changes", {
          ...row,
          status: completing ? "planned" : status,
          position: org.changes.length,
        });
      if (completing) {
        const saved = {
          id,
          title: row.title,
          detail: row.detail,
          status: "planned" as const,
          position: 0,
        };
        await completeStructureChange(org, change ?? saved, context);
      }
    });
    if (ok) {
      onSaved?.(id);
      onClose();
    }
  };

  const remove = async () => {
    if (!change) return;
    const holdings = org.holdings.filter((h) => h.proposedChangeId === change.id).length;
    const confirmed = await confirmDelete({
      what: `the planned change “${change.title}”`,
      binned: false,
      archivable: false,
      consequence: holdings
        ? `Its ${holdings} proposed holding${holdings === 1 ? " goes" : "s go"} with it. Mark it dropped instead to keep the record.`
        : "Mark it dropped instead to keep the record.",
    });
    if (!confirmed) return;
    const ok = await write.run(() => deleteRecord("org_structure_changes", change.id));
    if (ok) onClose();
  };

  return (
    <>
      <OrgDialog
        open={open}
        title={change ? "Edit planned change" : "Plan a change to the structure"}
        blurb="The target structure is a set of named changes. The current chart stays as it is until they happen."
        onClose={onClose}
        onSubmit={save}
        submitLabel={change ? "Save change" : "Add change"}
        busy={write.busy}
        error={write.error}
        extra={
          change ? (
            <Button variant="danger" onClick={() => void remove()} disabled={write.busy}>
              Delete
            </Button>
          ) : undefined
        }
      >
        <Field label="Change">
          <TextInput
            value={title}
            onChange={setTitle}
            autoFocus
            placeholder="e.g. Insert a holding company"
          />
        </Field>
        <Field label="What it involves">
          <TextArea value={detail} onChange={setDetail} rows={3} />
        </Field>
        <Field label="Status">
          <Select<Status>
            value={status}
            onChange={(v) => setStatus((v || "planned") as Status)}
            options={[
              { value: "planned", label: "Planned" },
              { value: "done", label: "Done" },
              { value: "dropped", label: "Dropped" },
            ]}
          />
        </Field>
        {status === "done" && change?.status !== "done" && (
          <ChangeFields
            value={context}
            onChange={setContext}
            prompt="Marking it done moves its proposed holdings into the current structure from this date"
          />
        )}
      </OrgDialog>
      {confirmDialog}
    </>
  );
}
