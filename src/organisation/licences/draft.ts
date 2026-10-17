/** A licence being written: its draft shape and how it becomes a row. */
import {
  missingLicenceFields,
  type FieldSources,
  type Licence,
  type LicenceType,
  type Prerequisite,
} from "../model";

export type LicenceDraft = {
  typeKey: string;
  name: string;
  authority: string;
  country: string;
  reference: string;
  entityId: string | null;
  issuedOn: string;
  issuedNote: string;
  expiresOn: string;
  renewalLeadDays: string;
  ownerMode: "role" | "person";
  ownerRoleId: string | null;
  ownerPersonId: string | null;
  prerequisites: Prerequisite[];
  conditions: string;
  recurringNote: string;
  originalLocation: string;
  verified: boolean;
  fieldSources: FieldSources;
};

export const pid = () => crypto.randomUUID();

export const draftFromLicence = (l: Licence): LicenceDraft => ({
  typeKey: l.typeKey,
  name: l.name,
  authority: l.authority,
  country: l.country,
  reference: l.reference,
  entityId: l.entityId,
  issuedOn: l.issuedOn ?? "",
  issuedNote: l.issuedNote,
  expiresOn: l.expiresOn ?? "",
  renewalLeadDays: String(l.renewalLeadDays),
  ownerMode: l.ownerPersonId ? "person" : "role",
  ownerRoleId: l.ownerRoleId,
  ownerPersonId: l.ownerPersonId,
  prerequisites: l.prerequisites,
  conditions: l.conditions,
  recurringNote: l.recurringNote,
  originalLocation: l.originalLocation,
  verified: l.verified,
  fieldSources: l.fieldSources,
});

export const draftForType = (type: LicenceType | undefined): LicenceDraft => ({
  typeKey: type?.key ?? "other",
  name: type && type.key !== "other" ? type.label.replace(/\s+—.*$/, "") : "",
  authority: "",
  country: type?.jurisdiction ?? "",
  reference: "",
  entityId: null,
  issuedOn: "",
  issuedNote: "",
  expiresOn: "",
  renewalLeadDays: String(type?.defaultLeadDays ?? 60),
  ownerMode: "role",
  ownerRoleId: null,
  ownerPersonId: null,
  prerequisites: (type?.typicalPrerequisites ?? []).map((label) => ({
    id: pid(),
    label,
    done: false,
  })),
  conditions: "",
  recurringNote: "",
  originalLocation: "",
  verified: false,
  fieldSources: {},
});

export const rowFromDraft = (d: LicenceDraft) => ({
  type_key: d.typeKey,
  name: d.name.trim(),
  authority: d.authority.trim(),
  country: d.country.trim(),
  reference: d.reference.trim(),
  entity_id: d.entityId,
  issued_on: d.issuedOn || null,
  issued_note: d.issuedOn ? "" : d.issuedNote.trim(),
  expires_on: d.expiresOn || null,
  renewal_lead_days: Math.max(0, Math.min(730, Number(d.renewalLeadDays) || 0)),
  owner_role_id: d.ownerMode === "role" ? d.ownerRoleId : null,
  owner_person_id: d.ownerMode === "person" ? d.ownerPersonId : null,
  prerequisites: d.prerequisites.filter((p) => p.label.trim()),
  conditions: d.conditions,
  recurring_note: d.recurringNote.trim(),
  original_location: d.originalLocation.trim(),
  verified: d.verified,
  field_sources: d.fieldSources,
});

/** The gaps a draft would be saved with, by the type's field template. */
export const draftGaps = (d: LicenceDraft, types: LicenceType[]) =>
  missingLicenceFields(
    {
      id: "",
      entityId: d.entityId,
      typeKey: d.typeKey,
      name: d.name,
      authority: d.authority,
      country: d.country,
      reference: d.reference,
      issuedOn: d.issuedOn || null,
      issuedNote: d.issuedNote,
      expiresOn: d.expiresOn || null,
      renewalLeadDays: Number(d.renewalLeadDays) || 0,
      ownerRoleId: d.ownerRoleId,
      ownerPersonId: d.ownerPersonId,
      prerequisites: d.prerequisites,
      renewalState: "none",
      renewalLodgedOn: null,
      conditions: d.conditions,
      recurringNote: d.recurringNote,
      originalLocation: d.originalLocation,
      verified: d.verified,
      fieldSources: d.fieldSources,
      archivedAt: null,
    },
    types,
  );
