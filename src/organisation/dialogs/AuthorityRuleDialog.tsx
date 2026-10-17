import { useState } from "react";
import { Button } from "@/components/primitives";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import { deleteRecord, insertRecord, updateRecord } from "../db";
import {
  BODY_LABEL,
  type AuthorityBody,
  type AuthorityCapacity,
  type AuthorityRule,
  type AuthorityStep,
  type ChangeContext,
  type Organisation,
} from "../model";
import {
  ChangeFields,
  EntitySelect,
  Field,
  FieldRow,
  OrgDialog,
  RoleSelect,
  Select,
  TextInput,
  useOrgWrite,
} from "../ui";

type PartyKind = "role" | "capacity" | "body";

type DraftParty = {
  key: string;
  id: string | null;
  step: AuthorityStep;
  kind: PartyKind;
  roleId: string | null;
  capacity: AuthorityCapacity;
  body: AuthorityBody;
  count: number;
};

const STEPS: { id: AuthorityStep; label: string }[] = [
  { id: "recommend", label: "Recommends" },
  { id: "approve", label: "Approves" },
  { id: "sign", label: "Signs" },
];

const CAPACITIES: { value: AuthorityCapacity; label: string }[] = [
  { value: "director", label: "Director(s) of the contracting entity" },
  { value: "secretary", label: "Company secretary" },
  { value: "signatory", label: "Authorised signatory(ies)" },
];

const BODIES = (Object.keys(BODY_LABEL) as AuthorityBody[]).map((b) => ({
  value: b,
  label: BODY_LABEL[b],
}));

const amount = (v: string): number | null => {
  const n = Number(v.replace(/[,\s]/g, ""));
  return v.trim() === "" || !Number.isFinite(n) ? null : n;
};

/**
 * One row of the delegation of authority: a matter type and a value band, and
 * who recommends, approves and signs within it. Parties are roles, capacities
 * in the contracting entity, or bodies — never named people, so a leaver never
 * orphans a rule.
 */
export default function AuthorityRuleDialog({
  org,
  rule,
  open,
  onClose,
  defaults,
}: {
  org: Organisation;
  rule: AuthorityRule | null;
  open: boolean;
  onClose: () => void;
  defaults?: { instrumentId?: string | null };
}) {
  const current = org.instruments.find((i) => !i.supersededOn) ?? null;
  const [matterType, setMatterType] = useState(rule?.matterType ?? "");
  const [entityId, setEntityId] = useState<string | null>(rule?.entityId ?? null);
  const [min, setMin] = useState(rule?.minAmount?.toString() ?? "");
  const [max, setMax] = useState(rule?.maxAmount?.toString() ?? "");
  const [currency, setCurrency] = useState(rule?.currency ?? org.rules[0]?.currency ?? "");
  const [basis, setBasis] = useState<"recorded" | "inferred">(rule?.basis ?? "recorded");
  const [instrumentId, setInstrumentId] = useState<string | null>(
    rule ? rule.instrumentId : (defaults?.instrumentId ?? current?.id ?? null),
  );
  const [note, setNote] = useState(rule?.note ?? "");
  const [effectiveFrom, setEffectiveFrom] = useState(rule?.effectiveFrom ?? "");
  const [effectiveTo, setEffectiveTo] = useState(rule?.effectiveTo ?? "");
  const [change, setChange] = useState<ChangeContext>({});
  const [parties, setParties] = useState<DraftParty[]>(() =>
    rule
      ? org.parties
          .filter((p) => p.ruleId === rule.id)
          .sort((a, b) => a.position - b.position)
          .map((p) => ({
            key: p.id,
            id: p.id,
            step: p.step,
            kind: p.roleId ? "role" : p.capacity ? "capacity" : "body",
            roleId: p.roleId,
            capacity: p.capacity ?? "director",
            body: p.body ?? "board",
            count: p.count,
          }))
      : [],
  );
  const write = useOrgWrite(org.clientId);
  const { confirmDelete, confirmDialog } = useConfirmDelete();
  const matterTypes = [...new Set(org.rules.map((r) => r.matterType))].sort();

  const addParty = (step: AuthorityStep) =>
    setParties((ps) => [
      ...ps,
      {
        key: crypto.randomUUID(),
        id: null,
        step,
        kind: "role",
        roleId: null,
        capacity: "director",
        body: "board",
        count: 1,
      },
    ]);
  const patch = (key: string, next: Partial<DraftParty>) =>
    setParties((ps) => ps.map((p) => (p.key === key ? { ...p, ...next } : p)));

  const save = async () => {
    if (!matterType.trim()) return write.setError("Name the matter type.");
    const minAmount = amount(min);
    const maxAmount = amount(max);
    if ((min.trim() && minAmount === null) || (max.trim() && maxAmount === null))
      return write.setError("Amounts must be numbers.");
    if (minAmount !== null && maxAmount !== null && maxAmount < minAmount)
      return write.setError("The upper amount is below the lower one.");
    if (parties.some((p) => p.kind === "role" && !p.roleId))
      return write.setError("Choose a role for every party, or remove the empty row.");
    if (basis === "recorded" && !instrumentId && org.instruments.length)
      return write.setError(
        "A recorded rule belongs to an instrument. Choose one, or mark the rule inferred.",
      );
    const row = {
      matter_type: matterType.trim(),
      entity_id: entityId,
      min_amount: minAmount,
      max_amount: maxAmount,
      currency: currency.trim().toUpperCase(),
      basis,
      instrument_id: instrumentId,
      note: note.trim(),
      effective_from: effectiveFrom || null,
      effective_to: effectiveTo || null,
    };
    const done = await write.run(async () => {
      const ruleId = rule
        ? (await updateRecord("org_authority_rules", rule.id, row, change), rule.id)
        : await insertRecord(
            org,
            "org_authority_rules",
            { ...row, position: org.rules.length },
            change,
          );
      const kept = new Set(parties.map((p) => p.id).filter(Boolean));
      for (const old of org.parties.filter((p) => p.ruleId === ruleId && !kept.has(p.id)))
        await deleteRecord("org_authority_parties", old.id);
      for (const [position, p] of parties.entries()) {
        const partyRow = {
          rule_id: ruleId,
          step: p.step,
          role_id: p.kind === "role" ? p.roleId : null,
          capacity: p.kind === "capacity" ? p.capacity : null,
          body: p.kind === "body" ? p.body : null,
          count: p.kind === "role" ? 1 : Math.max(1, p.count),
          position,
        };
        if (p.id) await updateRecord("org_authority_parties", p.id, partyRow);
        else await insertRecord(org, "org_authority_parties", partyRow);
      }
    });
    if (done) onClose();
  };

  const remove = async () => {
    if (!rule) return;
    if (
      !(await confirmDelete({
        what: `the ${rule.matterType} rule`,
        binned: false,
        archivable: false,
      }))
    )
      return;
    if (await write.run(() => deleteRecord("org_authority_rules", rule.id))) onClose();
  };

  return (
    <>
      <OrgDialog
        open={open}
        width={640}
        title={rule ? "Edit authority rule" : "Add an authority rule"}
        blurb="The same matter type can have several rows that differ only by value; the narrowest one that fits answers “who signs?”."
        onClose={onClose}
        onSubmit={save}
        submitLabel={rule ? "Save" : "Add rule"}
        busy={write.busy}
        error={write.error}
        extra={
          rule && (
            <Button variant="danger" onClick={() => void remove()}>
              Delete
            </Button>
          )
        }
      >
        <FieldRow>
          <Field label="Matter type">
            <input
              list="og-matter-types"
              value={matterType}
              onChange={(e) => setMatterType(e.target.value)}
              placeholder="Supply contract"
              autoFocus
            />
            <datalist id="og-matter-types">
              {matterTypes.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </Field>
          <Field label="Applies to">
            <EntitySelect
              org={org}
              value={entityId}
              onChange={setEntityId}
              empty="Every entity covered"
            />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Above (exclusive)" hint="Blank for no lower limit">
            <TextInput value={min} onChange={setMin} placeholder="250000" />
          </Field>
          <Field label="Up to (inclusive)" hint="Blank for no upper limit">
            <TextInput value={max} onChange={setMax} />
          </Field>
          <Field label="Currency">
            <TextInput value={currency} onChange={setCurrency} placeholder="GHS" />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field
            label="Basis"
            hint={
              basis === "inferred"
                ? "Not written in an instrument: shown apart from recorded rules"
                : undefined
            }
          >
            <Select
              value={basis}
              onChange={(v) => setBasis(v === "inferred" ? "inferred" : "recorded")}
              options={[
                { value: "recorded", label: "Recorded in an instrument" },
                { value: "inferred", label: "Inferred (not written down)" },
              ]}
            />
          </Field>
          <Field label="Instrument">
            <Select
              value={instrumentId ?? ""}
              onChange={(v) => setInstrumentId(v || null)}
              options={org.instruments.map((i) => ({
                value: i.id,
                label: `${i.title}${i.supersededOn ? " (superseded)" : ""}`,
              }))}
              empty="None"
            />
          </Field>
        </FieldRow>

        <div className="gv-parties">
          {STEPS.map((step) => (
            <div key={step.id} className="gv-party-step">
              <div className="gv-party-head">
                <span className="org-label">{step.label}</span>
                <button type="button" className="org-link" onClick={() => addParty(step.id)}>
                  Add
                </button>
              </div>
              {parties.filter((p) => p.step === step.id).length === 0 && (
                <p className="og-hint">Nobody recorded.</p>
              )}
              {parties
                .filter((p) => p.step === step.id)
                .map((p) => (
                  <div key={p.key} className="gv-party-row">
                    <select
                      aria-label="Kind of party"
                      value={p.kind}
                      onChange={(e) => patch(p.key, { kind: e.target.value as PartyKind })}
                    >
                      <option value="role">A role</option>
                      <option value="capacity">Officers of the entity</option>
                      <option value="body">A body</option>
                    </select>
                    {p.kind === "role" && (
                      <RoleSelect
                        org={org}
                        value={p.roleId}
                        onChange={(id) => patch(p.key, { roleId: id })}
                        empty="Choose a role"
                      />
                    )}
                    {p.kind === "capacity" && (
                      <>
                        <input
                          aria-label="How many"
                          type="number"
                          min={1}
                          max={20}
                          className="gv-count"
                          value={p.count}
                          onChange={(e) => patch(p.key, { count: Number(e.target.value) || 1 })}
                        />
                        <Select
                          value={p.capacity}
                          onChange={(v) =>
                            patch(p.key, { capacity: (v || "director") as AuthorityCapacity })
                          }
                          options={CAPACITIES}
                        />
                      </>
                    )}
                    {p.kind === "body" && (
                      <Select
                        value={p.body}
                        onChange={(v) => patch(p.key, { body: (v || "board") as AuthorityBody })}
                        options={BODIES}
                      />
                    )}
                    <button
                      type="button"
                      className="org-link"
                      aria-label={`Remove this ${step.label.toLowerCase()} party`}
                      onClick={() => setParties((ps) => ps.filter((x) => x.key !== p.key))}
                    >
                      Remove
                    </button>
                  </div>
                ))}
            </div>
          ))}
        </div>

        <Field label="Note">
          <TextInput
            value={note}
            onChange={setNote}
            placeholder="e.g. Legal reviews before signature"
          />
        </Field>
        <FieldRow>
          <Field label="In force from">
            <TextInput type="date" value={effectiveFrom} onChange={setEffectiveFrom} />
          </Field>
          <Field label="In force until" hint="Blank while it stands">
            <TextInput type="date" value={effectiveTo} onChange={setEffectiveTo} />
          </Field>
        </FieldRow>
        {rule && (
          <ChangeFields value={change} onChange={setChange} prompt="Record why this changed" />
        )}
      </OrgDialog>
      {confirmDialog}
    </>
  );
}
