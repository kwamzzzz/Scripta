import { useState } from "react";
import { Button } from "@/components/primitives";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import { supabase } from "@/integrations/supabase/client";
import { deleteRecord, insertRecord, updateRecord } from "../db";
import { localDay, type ChangeContext, type Instrument, type Organisation } from "../model";
import { ChangeFields, Field, FieldRow, OrgDialog, TextInput, useOrgWrite } from "../ui";

/**
 * The document authority is recorded in. Amending authority is done by
 * recording a new version: the old one is superseded on a date, not
 * overwritten, because "who could sign this in March?" is a real question.
 */
export default function InstrumentDialog({
  org,
  instrument,
  supersedes,
  open,
  onClose,
  onSaved,
}: {
  org: Organisation;
  /** The instrument being edited, or null for a new one. */
  instrument: Instrument | null;
  /** For a new version: the current instrument it replaces. */
  supersedes?: Instrument | null;
  open: boolean;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const base = instrument ?? supersedes ?? null;
  const [title, setTitle] = useState(
    instrument?.title ?? (supersedes ? `${supersedes.title} (amended)` : ""),
  );
  const [approvedOn, setApprovedOn] = useState(
    instrument?.approvedOn ?? (supersedes ? localDay() : ""),
  );
  const [approvedBy, setApprovedBy] = useState(base?.approvedBy ?? "");
  const [scopeNote, setScopeNote] = useState(base?.scopeNote ?? "");
  const [reviewDueOn, setReviewDueOn] = useState(instrument?.reviewDueOn ?? "");
  const [reference, setReference] = useState(instrument?.reference ?? "");
  const [copyRules, setCopyRules] = useState(true);
  const [change, setChange] = useState<ChangeContext>({});
  const write = useOrgWrite(org.clientId);
  const { confirmDelete, confirmDialog } = useConfirmDelete();

  const save = async () => {
    if (!title.trim()) return write.setError("Name the instrument.");
    const row = {
      title: title.trim(),
      approved_on: approvedOn || null,
      approved_by: approvedBy.trim(),
      scope_note: scopeNote.trim(),
      review_due_on: reviewDueOn || null,
      reference: reference.trim(),
    };
    let id = instrument?.id ?? "";
    const done = await write.run(async () => {
      if (instrument) {
        await updateRecord("org_authority_instruments", instrument.id, row, change);
        return;
      }
      id = await insertRecord(org, "org_authority_instruments", row, change);
      if (!supersedes) return;
      const on = approvedOn || localDay();
      await updateRecord(
        "org_authority_instruments",
        supersedes.id,
        { superseded_on: on },
        { on, ref: reference.trim() || null },
      );
      if (!copyRules) return;
      // The new version starts as a copy of the old matrix, which is how an
      // amendment is usually drafted: most rules stand, a few change.
      for (const rule of org.rules.filter((r) => r.instrumentId === supersedes.id)) {
        const ruleId = await insertRecord(org, "org_authority_rules", {
          instrument_id: id,
          matter_type: rule.matterType,
          entity_id: rule.entityId,
          min_amount: rule.minAmount,
          max_amount: rule.maxAmount,
          currency: rule.currency,
          basis: rule.basis,
          note: rule.note,
          position: rule.position,
          effective_from: on,
        });
        const parties = org.parties.filter((p) => p.ruleId === rule.id);
        if (parties.length) {
          const { error } = await supabase.from("org_authority_parties").insert(
            parties.map((p) => ({
              workspace_id: org.workspaceId,
              client_id: org.clientId,
              rule_id: ruleId,
              step: p.step,
              role_id: p.roleId,
              capacity: p.capacity,
              body: p.body,
              count: p.count,
              position: p.position,
            })),
          );
          if (error) throw new Error(error.message);
        }
      }
    });
    if (done) {
      onSaved?.(id);
      onClose();
    }
  };

  const remove = async () => {
    if (!instrument) return;
    const rules = org.rules.filter((r) => r.instrumentId === instrument.id).length;
    const ok = await confirmDelete({
      what: `“${instrument.title}”`,
      binned: false,
      archivable: false,
      ...(rules
        ? {
            consequence: `Its ${rules === 1 ? "rule stays" : `${rules} rules stay`} in the matrix with no instrument recorded behind ${rules === 1 ? "it" : "them"}.`,
          }
        : {}),
    });
    if (ok && (await write.run(() => deleteRecord("org_authority_instruments", instrument.id))))
      onClose();
  };

  return (
    <>
      <OrgDialog
        open={open}
        title={
          instrument
            ? "Edit instrument"
            : supersedes
              ? "Record a new version"
              : "Record the delegation of authority"
        }
        blurb={
          supersedes
            ? `${supersedes.title} is marked superseded from the approval date. It stays on file, with its rules, for questions about earlier dates.`
            : "The policy, articles or resolution the authority matrix is written in."
        }
        onClose={onClose}
        onSubmit={save}
        submitLabel={instrument ? "Save" : supersedes ? "Record new version" : "Record instrument"}
        busy={write.busy}
        error={write.error}
        extra={
          instrument && (
            <Button variant="danger" onClick={() => void remove()}>
              Delete
            </Button>
          )
        }
      >
        <Field label="Title" hint="e.g. Delegation of Authority Policy v3">
          <TextInput value={title} onChange={setTitle} autoFocus />
        </Field>
        <FieldRow>
          <Field label="Approved on">
            <TextInput type="date" value={approvedOn} onChange={setApprovedOn} />
          </Field>
          <Field label="Approved by">
            <TextInput
              value={approvedBy}
              onChange={setApprovedBy}
              placeholder="Board of directors"
            />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Applies to">
            <TextInput value={scopeNote} onChange={setScopeNote} placeholder="All Ghana entities" />
          </Field>
          <Field label="Review due">
            <TextInput type="date" value={reviewDueOn} onChange={setReviewDueOn} />
          </Field>
        </FieldRow>
        <Field label="Reference" hint="The board minute or resolution that approved it">
          <TextInput value={reference} onChange={setReference} placeholder="BM-2026-07" />
        </Field>
        {supersedes && (
          <label className="og-check">
            <input
              type="checkbox"
              checked={copyRules}
              onChange={(e) => setCopyRules(e.target.checked)}
            />
            Start from a copy of the current rules and who approves and signs under them
          </label>
        )}
        {instrument && (
          <ChangeFields value={change} onChange={setChange} prompt="Record why this changed" />
        )}
      </OrgDialog>
      {confirmDialog}
    </>
  );
}
