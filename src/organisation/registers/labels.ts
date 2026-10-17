/** Labels and field lists the register screens share. */
import type { EntityStatus, ObligationKind } from "../model";
import type { ReadField } from "../read-fields.functions";

export const OBLIGATION_KIND_LABEL: Record<ObligationKind, string> = {
  filing: "Filing",
  return: "Return",
  meeting: "Meeting",
  register: "Register",
  payment: "Payment",
  renewal: "Renewal",
  other: "Other",
};

/** An entity's editable facts, as the entity dialog holds them. */
export type EntityDraft = {
  name: string;
  shortName: string;
  entityType: string;
  jurisdiction: string;
  registrationNo: string;
  taxNo: string;
  incorporatedOn: string;
  registeredOffice: string;
  activity: string;
  shareCapital: string;
  status: EntityStatus;
  notes: string;
};

/** The facts a filing can give, keyed as the draft holds them. */
export const ENTITY_FIELDS: (ReadField & { key: keyof EntityDraft })[] = [
  { key: "name", label: "Registered name", type: "text" },
  {
    key: "entityType",
    label: "Company type",
    type: "text",
    hint: "e.g. private company limited by shares",
  },
  { key: "jurisdiction", label: "Jurisdiction of incorporation", type: "text" },
  { key: "registrationNo", label: "Registration number", type: "text" },
  { key: "taxNo", label: "Tax identification number", type: "text" },
  { key: "incorporatedOn", label: "Date of incorporation", type: "date" },
  { key: "registeredOffice", label: "Registered office address", type: "text" },
  { key: "activity", label: "Objects or principal activity", type: "text" },
  { key: "shareCapital", label: "Stated or share capital", type: "text" },
];
