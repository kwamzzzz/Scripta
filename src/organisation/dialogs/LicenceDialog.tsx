/** Edit a licence or registration already on the register. */
import { useState } from "react";
import { Button } from "@/components/primitives";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import { deleteRecord, setRecordArchived, updateRecord } from "../db";
import type { ChangeContext, Licence, Organisation } from "../model";
import { ChangeFields, OrgDialog, useOrgWrite } from "../ui";
import { LicenceFields } from "../licences/form";
import { draftFromLicence, draftGaps, rowFromDraft } from "../licences/draft";

export default function LicenceDialog({
  org,
  licence,
  open,
  onClose,
}: {
  org: Organisation;
  licence: Licence;
  open: boolean;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => draftFromLicence(licence));
  const [change, setChange] = useState<ChangeContext>({});
  const write = useOrgWrite(org.clientId);
  const { confirmDelete, confirmDialog } = useConfirmDelete();
  const gaps = draftGaps(draft, org.licenceTypes);

  const save = async () => {
    if (!draft.name.trim()) return write.setError("Name the licence.");
    if (
      await write.run(() => updateRecord("org_licences", licence.id, rowFromDraft(draft), change))
    )
      onClose();
  };

  return (
    <OrgDialog
      open={open}
      width={640}
      title={`Edit ${licence.name}`}
      onClose={onClose}
      onSubmit={save}
      submitLabel="Save"
      busy={write.busy}
      error={write.error}
      extra={
        <>
          <Button
            variant="quiet"
            onClick={async () => {
              if (
                await write.run(() =>
                  setRecordArchived("org_licences", licence.id, !licence.archivedAt),
                )
              )
                onClose();
            }}
          >
            {licence.archivedAt ? "Restore" : "Archive"}
          </Button>
          <Button
            variant="quiet"
            onClick={async () => {
              const yes = await confirmDelete({
                what: `“${licence.name}”`,
                consequence:
                  "Archive it instead once it is surrendered or replaced, so its history stays.",
                binned: false,
              });
              if (yes && (await write.run(() => deleteRecord("org_licences", licence.id))))
                onClose();
            }}
          >
            Delete
          </Button>
        </>
      }
    >
      {confirmDialog}
      <LicenceFields org={org} draft={draft} onChange={setDraft} withType />
      <label className="og-check">
        <input
          type="checkbox"
          checked={draft.verified}
          onChange={(e) => setDraft({ ...draft, verified: e.target.checked })}
        />
        Verified against the licence itself
      </label>
      {gaps.length > 0 && (
        <p className="og-muted rg-note">
          Gaps: {gaps.map((g) => g.label.toLowerCase()).join(", ")}.
        </p>
      )}
      <ChangeFields value={change} onChange={setChange} />
    </OrgDialog>
  );
}
