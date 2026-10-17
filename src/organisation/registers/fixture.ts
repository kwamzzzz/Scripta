/** A small group for the registers' tests: two companies, a licence, a return. */
import {
  emptyOrganisation,
  type Appointment,
  type Entity,
  type Licence,
  type Obligation,
  type Organisation,
} from "../model";

export const entity = (over: Partial<Entity> & { id: string; name: string }): Entity => ({
  clientId: "c",
  shortName: "",
  entityType: "Private limited",
  jurisdiction: "Ghana",
  registrationNo: "CS1",
  taxNo: "",
  incorporatedOn: "2025-05-06",
  registeredOffice: "Accra",
  activity: "",
  shareCapital: "",
  status: "active",
  proposedChangeId: null,
  notes: "",
  fieldSources: {},
  lastChangeOn: null,
  lastChangeRef: null,
  updatedAt: "",
  archivedAt: null,
  ...over,
});

export const licence = (over: Partial<Licence> & { id: string; name: string }): Licence => ({
  entityId: null,
  typeKey: "other",
  authority: "",
  country: "",
  reference: "",
  issuedOn: null,
  issuedNote: "",
  expiresOn: null,
  renewalLeadDays: 60,
  ownerRoleId: null,
  ownerPersonId: null,
  prerequisites: [],
  renewalState: "none",
  renewalLodgedOn: null,
  conditions: "",
  recurringNote: "",
  originalLocation: "",
  verified: true,
  fieldSources: {},
  archivedAt: null,
  ...over,
});

export const obligation = (
  over: Partial<Obligation> & { id: string; title: string; dueOn: string },
): Obligation => ({
  entityId: null,
  licenceId: null,
  kind: "filing",
  recurrence: "none",
  endsOn: null,
  ownerRoleId: null,
  ownerPersonId: null,
  penaltyNote: "",
  detail: "",
  archivedAt: null,
  ...over,
});

export const appointment = (
  over: Partial<Appointment> & { id: string; personId: string; entityId: string },
): Appointment => ({
  capacity: "director",
  title: "",
  appointedOn: null,
  ceasedOn: null,
  lastChangeRef: null,
  ...over,
});

export function group(): Organisation {
  const org = emptyOrganisation("c", "w");
  org.entities = [
    entity({ id: "gm", name: "Goldenmark Ghana Ltd", shortName: "Goldenmark GH" }),
    entity({
      id: "ngh",
      name: "Nexis Africa (Ghana) Ltd",
      shortName: "Nexis GH",
      registeredOffice: "",
      incorporatedOn: null,
    }),
  ];
  org.people = [
    {
      id: "dk",
      clientId: "c",
      fullName: "Dominik Kleemann",
      email: "",
      phone: "",
      location: "",
      notes: "",
      archivedAt: null,
    },
  ];
  org.holdings = [
    {
      id: "h1",
      ownerEntityId: "ngh",
      ownerPersonId: null,
      ownerName: null,
      subsidiaryEntityId: "gm",
      percent: 100,
      instrument: "Ordinary shares",
      effectiveFrom: null,
      effectiveTo: null,
      proposedChangeId: null,
      removedByChangeId: null,
      lastChangeOn: null,
      lastChangeRef: null,
    },
  ];
  org.appointments = [
    appointment({ id: "a1", personId: "dk", entityId: "gm", appointedOn: "2025-05-06" }),
  ];
  org.licences = [
    licence({ id: "pmmc", name: "PMMC export licence", entityId: "gm", expiresOn: "2026-09-04" }),
  ];
  org.obligations = [
    obligation({
      id: "ar",
      title: "Annual return",
      entityId: "gm",
      dueOn: "2026-06-30",
      penaltyNote: "GHS 50/month",
    }),
    obligation({
      id: "vat",
      title: "VAT return, with commas; and semicolons",
      entityId: "ngh",
      dueOn: "2026-01-15",
      recurrence: "monthly",
    }),
  ];
  return org;
}
