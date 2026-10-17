/**
 * One licence form, used by the intake screen's manual path and by editing an
 * existing licence, so both write the same record in the same shape.
 */
import type { Organisation, Prerequisite } from "../model";
import { pid, type LicenceDraft } from "./draft";
import {
  EntitySelect,
  Field,
  FieldRow,
  PersonSelect,
  RoleSelect,
  Select,
  TextArea,
  TextInput,
} from "../ui";

export function LicenceFields({
  org,
  draft,
  onChange,
  withType,
}: {
  org: Organisation;
  draft: LicenceDraft;
  onChange: (next: LicenceDraft) => void;
  withType?: boolean;
}) {
  const set = <K extends keyof LicenceDraft>(k: K, v: LicenceDraft[K]) =>
    onChange({ ...draft, [k]: v });
  const type = org.licenceTypes.find((t) => t.key === draft.typeKey);
  return (
    <>
      {withType && (
        <Field label="Type">
          <Select
            value={draft.typeKey}
            onChange={(v) => set("typeKey", v || "other")}
            options={org.licenceTypes.map((t) => ({ value: t.key, label: t.label }))}
          />
        </Field>
      )}
      <Field label="Licence name">
        <TextInput
          value={draft.name}
          onChange={(v) => set("name", v)}
          placeholder="Minerals Commission buyer licence"
        />
      </Field>
      <FieldRow>
        <Field label="Authority">
          <TextInput value={draft.authority} onChange={(v) => set("authority", v)} />
        </Field>
        <Field label="Country">
          <TextInput value={draft.country} onChange={(v) => set("country", v)} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Licence number">
          <TextInput
            value={draft.reference}
            onChange={(v) => set("reference", v)}
            placeholder="Not known"
          />
        </Field>
        <Field label="Holder entity">
          <EntitySelect
            org={org}
            value={draft.entityId}
            onChange={(v) => set("entityId", v)}
            empty="Not recorded"
          />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Issued">
          <TextInput type="date" value={draft.issuedOn} onChange={(v) => set("issuedOn", v)} />
        </Field>
        {!draft.issuedOn && (
          <Field label="Or roughly" hint="Approximate is fine, e.g. Nov 2024">
            <TextInput value={draft.issuedNote} onChange={(v) => set("issuedNote", v)} />
          </Field>
        )}
      </FieldRow>
      <FieldRow>
        {(type?.hasExpiry ?? true) && (
          <Field label="Expires">
            <TextInput type="date" value={draft.expiresOn} onChange={(v) => set("expiresOn", v)} />
          </Field>
        )}
        <Field label="Renewal lead time" hint="Days before expiry the renewal starts">
          <TextInput
            type="number"
            value={draft.renewalLeadDays}
            onChange={(v) => set("renewalLeadDays", v)}
          />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Owner at the client">
          <Select
            value={draft.ownerMode}
            onChange={(v) => set("ownerMode", (v || "role") as "role" | "person")}
            options={[
              { value: "role", label: "A role" },
              { value: "person", label: "A person" },
            ]}
          />
        </Field>
        <Field label={draft.ownerMode === "role" ? "Role" : "Person"}>
          {draft.ownerMode === "role" ? (
            <RoleSelect
              org={org}
              value={draft.ownerRoleId}
              onChange={(v) => set("ownerRoleId", v)}
              empty="No owner"
            />
          ) : (
            <PersonSelect
              org={org}
              value={draft.ownerPersonId}
              onChange={(v) => set("ownerPersonId", v)}
              empty="No owner"
            />
          )}
        </Field>
      </FieldRow>
      <PrerequisiteEditor value={draft.prerequisites} onChange={(v) => set("prerequisites", v)} />
      {(type?.hasExpiry ?? true) === false && (
        <Field label="Recurring duty" hint="e.g. Monthly return, 15th">
          <TextInput value={draft.recurringNote} onChange={(v) => set("recurringNote", v)} />
        </Field>
      )}
      <Field label="Conditions">
        <TextArea rows={2} value={draft.conditions} onChange={(v) => set("conditions", v)} />
      </Field>
      <Field label="Where the original is kept">
        <TextInput
          value={draft.originalLocation}
          onChange={(v) => set("originalLocation", v)}
          placeholder="Accra office safe — folder L2"
        />
      </Field>
    </>
  );
}

export function PrerequisiteEditor({
  value,
  onChange,
}: {
  value: Prerequisite[];
  onChange: (next: Prerequisite[]) => void;
}) {
  return (
    <fieldset className="og-change rg-prereq">
      <legend>Renewal prerequisites</legend>
      {value.length === 0 && <p className="og-muted rg-note">None recorded.</p>}
      {value.map((p, i) => (
        <div key={p.id} className="rg-prereq-row">
          <input
            type="checkbox"
            aria-label={`${p.label || "Prerequisite"} in hand`}
            checked={p.done}
            onChange={(e) =>
              onChange(value.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)))
            }
          />
          <input
            value={p.label}
            aria-label="Prerequisite"
            onChange={(e) =>
              onChange(value.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
            }
          />
          <button
            type="button"
            className="org-link"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="org-link"
        onClick={() => onChange([...value, { id: pid(), label: "", done: false }])}
      >
        Add a prerequisite
      </button>
    </fieldset>
  );
}
