/**
 * A shareholding: who holds what share of which entity, from when.
 *
 * A holding in force today, one that exists only in the planned structure,
 * and one that a planned change will remove are the same record with a
 * different scenario, so the current chart stays factual while the plan sits
 * beside it.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/primitives";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import { deleteRecord, insertRecord, updateRecord } from "../db";
import {
  entityLabel,
  holderLabel,
  type ChangeContext,
  type Holding,
  type Organisation,
} from "../model";
import {
  ChangeFields,
  EntitySelect,
  Field,
  FieldRow,
  OrgDialog,
  PersonSelect,
  Segmented,
  Select,
  TextInput,
  useOrgWrite,
} from "../ui";

type HolderKind = "entity" | "person" | "outside";

export default function HoldingDialog({
  org,
  holding,
  open,
  onClose,
  onSaved,
  defaults,
}: {
  org: Organisation;
  holding: Holding | null;
  open: boolean;
  onClose: () => void;
  onSaved?: (id: string) => void;
  defaults?: {
    subsidiaryEntityId?: string;
    ownerEntityId?: string;
    proposedChangeId?: string | null;
  };
}) {
  const write = useOrgWrite(org.clientId);
  const { confirmDelete, confirmDialog } = useConfirmDelete();
  const [holderKind, setHolderKind] = useState<HolderKind>("entity");
  const [ownerEntity, setOwnerEntity] = useState<string | null>(null);
  const [ownerPerson, setOwnerPerson] = useState<string | null>(null);
  const [ownerName, setOwnerName] = useState("");
  const [subsidiary, setSubsidiary] = useState<string | null>(null);
  const [percent, setPercent] = useState("");
  const [instrument, setInstrument] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [scenario, setScenario] = useState("current");
  const [change, setChange] = useState<ChangeContext>({});

  useEffect(() => {
    if (!open) return;
    write.setError(null);
    setHolderKind(
      holding
        ? holding.ownerEntityId
          ? "entity"
          : holding.ownerPersonId
            ? "person"
            : "outside"
        : "entity",
    );
    setOwnerEntity(holding?.ownerEntityId ?? defaults?.ownerEntityId ?? null);
    setOwnerPerson(holding?.ownerPersonId ?? null);
    setOwnerName(holding?.ownerName ?? "");
    setSubsidiary(holding?.subsidiaryEntityId ?? defaults?.subsidiaryEntityId ?? null);
    setPercent(
      holding?.percent !== null && holding?.percent !== undefined ? String(holding.percent) : "",
    );
    setInstrument(holding?.instrument ?? "");
    setFrom(holding?.effectiveFrom ?? "");
    setTo(holding?.effectiveTo ?? "");
    setScenario(
      holding?.proposedChangeId
        ? `proposed:${holding.proposedChangeId}`
        : holding?.removedByChangeId
          ? `removed:${holding.removedByChangeId}`
          : defaults?.proposedChangeId
            ? `proposed:${defaults.proposedChangeId}`
            : "current",
    );
    setChange({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, holding?.id]);

  const planned = org.changes.filter(
    (c) =>
      c.status === "planned" ||
      c.id === holding?.proposedChangeId ||
      c.id === holding?.removedByChangeId,
  );
  const scenarios = [
    { value: "current", label: "In force" },
    ...planned.map((c) => ({ value: `proposed:${c.id}`, label: `Proposed by: ${c.title}` })),
    ...planned.map((c) => ({
      value: `removed:${c.id}`,
      label: `In force, removed by: ${c.title}`,
    })),
  ];

  const save = async () => {
    const pct = percent.trim() ? Number(percent.replace("%", "")) : null;
    if (!subsidiary) return write.setError("Choose the entity whose shares are held.");
    if (holderKind === "entity" && !ownerEntity)
      return write.setError("Choose the holding entity.");
    if (holderKind === "entity" && ownerEntity === subsidiary)
      return write.setError("An entity cannot hold its own shares here.");
    if (holderKind === "person" && !ownerPerson)
      return write.setError("Choose the person who holds the shares.");
    if (holderKind === "outside" && !ownerName.trim()) return write.setError("Name the holder.");
    if (pct !== null && (!Number.isFinite(pct) || pct <= 0 || pct > 100))
      return write.setError("A share is more than 0% and no more than 100%.");
    if (from && to && to < from) return write.setError("A holding cannot end before it starts.");
    const [mode, changeId] = scenario.split(":");
    const row = {
      owner_entity_id: holderKind === "entity" ? ownerEntity : null,
      owner_person_id: holderKind === "person" ? ownerPerson : null,
      owner_name: holderKind === "outside" ? ownerName.trim() : null,
      subsidiary_entity_id: subsidiary,
      percent: pct,
      instrument: instrument.trim(),
      effective_from: from || null,
      effective_to: to || null,
      proposed_change_id: mode === "proposed" ? changeId! : null,
      removed_by_change_id: mode === "removed" ? changeId! : null,
    };
    let id = holding?.id ?? "";
    const ok = await write.run(async () => {
      if (holding) await updateRecord("org_holdings", holding.id, row, change);
      else id = await insertRecord(org, "org_holdings", row, change);
    });
    if (ok) {
      onSaved?.(id);
      onClose();
    }
  };

  const remove = async () => {
    if (!holding) return;
    const sub = org.entities.find((e) => e.id === holding.subsidiaryEntityId);
    const confirmed = await confirmDelete({
      what: `${holderLabel(org, holding)}’s holding in ${entityLabel(sub)}`,
      binned: false,
      archivable: false,
      consequence:
        "A holding that has ended is better recorded with an end date, so the structure can still be read as it was.",
    });
    if (!confirmed) return;
    const ok = await write.run(() => deleteRecord("org_holdings", holding.id));
    if (ok) onClose();
  };

  return (
    <>
      <OrgDialog
        open={open}
        title={holding ? "Edit holding" : "Add a holding"}
        blurb="Ownership, not reporting: who holds the shares of an entity in the group."
        onClose={onClose}
        onSubmit={save}
        submitLabel={holding ? "Save holding" : "Add holding"}
        busy={write.busy}
        error={write.error}
        width={600}
        extra={
          holding ? (
            <Button variant="danger" onClick={() => void remove()} disabled={write.busy}>
              Delete
            </Button>
          ) : undefined
        }
      >
        <Field label="Held by">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Segmented<HolderKind>
              label="Kind of holder"
              value={holderKind}
              onChange={setHolderKind}
              options={[
                { id: "entity", label: "An entity in the group" },
                { id: "person", label: "A person" },
                { id: "outside", label: "Someone outside" },
              ]}
            />
            {holderKind === "entity" ? (
              <EntitySelect
                org={org}
                value={ownerEntity}
                onChange={setOwnerEntity}
                empty="Choose an entity"
                includeProposed
              />
            ) : holderKind === "person" ? (
              <PersonSelect
                org={org}
                value={ownerPerson}
                onChange={setOwnerPerson}
                empty="Choose a person"
              />
            ) : (
              <TextInput
                value={ownerName}
                onChange={setOwnerName}
                placeholder="e.g. Minority partner"
              />
            )}
          </div>
        </Field>
        <FieldRow>
          <Field label="Shares in">
            <EntitySelect
              org={org}
              value={subsidiary}
              onChange={setSubsidiary}
              empty="Choose an entity"
              includeProposed
            />
          </Field>
          <Field label="Share" hint="Percent of the issued shares">
            <TextInput value={percent} onChange={setPercent} placeholder="e.g. 51" />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Instrument">
            <TextInput
              value={instrument}
              onChange={setInstrument}
              placeholder="e.g. ordinary shares"
            />
          </Field>
          <Field label="Scenario">
            <Select
              value={scenario}
              onChange={(v) => setScenario(v || "current")}
              options={scenarios}
            />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Held from">
            <TextInput type="date" value={from} onChange={setFrom} />
          </Field>
          <Field label="Held until" hint="Leave blank while it is held">
            <TextInput type="date" value={to} onChange={setTo} />
          </Field>
        </FieldRow>
        <ChangeFields value={change} onChange={setChange} prompt="What records this holding" />
      </OrgDialog>
      {confirmDialog}
    </>
  );
}
