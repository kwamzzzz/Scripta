import { describe, expect, it } from "vitest";
import {
  addMonths,
  canReportTo,
  dueDates,
  emptyOrganisation,
  entityStanding,
  holdingsIn,
  licenceStatus,
  matchRule,
  missingLicenceFields,
  occurrencesBetween,
  organogramFlags,
  overdueOccurrences,
  ownedThrough,
  reportingChain,
  resolveParty,
  structureDiff,
  structureFlags,
  type Entity,
  type Holding,
  type Licence,
  type Obligation,
  type Organisation,
  type Role,
} from "./model";

const entity = (id: string, name: string, extra: Partial<Entity> = {}): Entity => ({
  id,
  clientId: "c",
  name,
  shortName: "",
  entityType: "Private limited",
  jurisdiction: "Ghana",
  registrationNo: "",
  taxNo: "",
  incorporatedOn: null,
  registeredOffice: "",
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
  ...extra,
});

const holding = (id: string, extra: Partial<Holding>): Holding => ({
  id,
  ownerEntityId: null,
  ownerPersonId: null,
  ownerName: null,
  subsidiaryEntityId: "",
  percent: null,
  instrument: "",
  effectiveFrom: null,
  effectiveTo: null,
  proposedChangeId: null,
  removedByChangeId: null,
  lastChangeOn: null,
  lastChangeRef: null,
  ...extra,
});

const role = (id: string, title: string, extra: Partial<Role> = {}): Role => ({
  id,
  title,
  functionName: "",
  kind: "role",
  kindLabel: "",
  entityId: null,
  parentRoleId: null,
  holderPersonId: null,
  acting: false,
  coverRoleId: null,
  coverNote: "",
  position: 0,
  effectiveFrom: null,
  effectiveTo: null,
  lastChangeOn: null,
  lastChangeRef: null,
  updatedAt: "",
  ...extra,
});

const licence = (extra: Partial<Licence>): Licence => ({
  id: "l1",
  entityId: "gm",
  typeKey: "sector_minerals_export",
  name: "Export licence",
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
  verified: false,
  fieldSources: {},
  archivedAt: null,
  ...extra,
});

const obligation = (extra: Partial<Obligation>): Obligation => ({
  id: "o1",
  entityId: "gm",
  licenceId: null,
  title: "VAT return",
  kind: "return",
  recurrence: "monthly",
  dueOn: "2026-01-15",
  endsOn: null,
  ownerRoleId: null,
  ownerPersonId: null,
  penaltyNote: "",
  detail: "",
  archivedAt: null,
  ...extra,
});

/** A group like the Column 7 example: a UBO, a holding company, two operating companies. */
function group(): Organisation {
  const org = emptyOrganisation("c", "w");
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
    {
      id: "ka",
      clientId: "c",
      fullName: "Kojo Amankwah",
      email: "",
      phone: "",
      location: "",
      notes: "",
      archivedAt: null,
    },
  ];
  org.entities = [
    entity("llc", "Nexis Africa LLC", { jurisdiction: "UAE" }),
    entity("gh", "Nexis Africa (Ghana) Ltd"),
    entity("gm", "Goldenmark Ghana Ltd"),
    entity("new", "Mining Services Ltd", { proposedChangeId: "ch1" }),
  ];
  org.changes = [
    { id: "ch1", title: "New operating company", detail: "", status: "planned", position: 0 },
  ];
  org.holdings = [
    holding("h1", { ownerPersonId: "dk", subsidiaryEntityId: "llc", percent: 100 }),
    holding("h2", { ownerPersonId: "dk", subsidiaryEntityId: "gh", percent: 100 }),
    holding("h3", {
      ownerEntityId: "gh",
      subsidiaryEntityId: "gm",
      percent: 60,
      removedByChangeId: "ch1",
    }),
    holding("h4", { ownerName: "Minority partner", subsidiaryEntityId: "gm", percent: 40 }),
    holding("h5", {
      ownerEntityId: "gh",
      subsidiaryEntityId: "new",
      percent: 100,
      proposedChangeId: "ch1",
    }),
  ];
  org.roles = [
    role("ceo", "Chief Executive", { kind: "leadership", holderPersonId: "dk", coverRoleId: "cm" }),
    role("cm", "Country Manager", {
      kind: "leadership",
      parentRoleId: "ceo",
      holderPersonId: "ka",
    }),
    role("legal", "Legal", { kind: "head", parentRoleId: "cm" }),
    role("logistics", "Logistics", { parentRoleId: "cm", holderPersonId: "ka" }),
  ];
  org.appointments = [
    {
      id: "a1",
      personId: "dk",
      entityId: "gm",
      capacity: "director",
      title: "",
      appointedOn: "2025-05-06",
      ceasedOn: null,
      lastChangeRef: null,
    },
    {
      id: "a2",
      personId: "ka",
      entityId: "gm",
      capacity: "director",
      title: "",
      appointedOn: "2025-05-06",
      ceasedOn: null,
      lastChangeRef: null,
    },
    {
      id: "a3",
      personId: "ka",
      entityId: "gh",
      capacity: "director",
      title: "",
      appointedOn: "2022-01-01",
      ceasedOn: "2024-01-01",
      lastChangeRef: null,
    },
  ];
  org.instruments = [
    {
      id: "doa",
      title: "Delegation of Authority v3",
      approvedOn: "2026-09-02",
      approvedBy: "Board",
      scopeNote: "",
      reviewDueOn: null,
      reference: "BM-2026-07",
      documentId: null,
      supersededOn: null,
    },
  ];
  org.rules = [
    {
      id: "r1",
      instrumentId: "doa",
      matterType: "Supply contract",
      entityId: null,
      minAmount: null,
      maxAmount: 250000,
      currency: "GHS",
      basis: "recorded",
      note: "",
      position: 0,
      effectiveFrom: null,
      effectiveTo: null,
    },
    {
      id: "r2",
      instrumentId: "doa",
      matterType: "Supply contract",
      entityId: null,
      minAmount: 250000,
      maxAmount: null,
      currency: "GHS",
      basis: "recorded",
      note: "",
      position: 1,
      effectiveFrom: null,
      effectiveTo: null,
    },
    {
      id: "r3",
      instrumentId: null,
      matterType: "Supply contract",
      entityId: "gm",
      minAmount: 250000,
      maxAmount: null,
      currency: "GHS",
      basis: "inferred",
      note: "",
      position: 2,
      effectiveFrom: null,
      effectiveTo: null,
    },
  ];
  org.parties = [
    {
      id: "p1",
      ruleId: "r1",
      step: "approve",
      roleId: "cm",
      capacity: null,
      body: null,
      count: 1,
      position: 0,
    },
    {
      id: "p2",
      ruleId: "r2",
      step: "sign",
      roleId: "ceo",
      capacity: null,
      body: null,
      count: 1,
      position: 0,
    },
    {
      id: "p3",
      ruleId: "r2",
      step: "sign",
      roleId: null,
      capacity: "director",
      body: null,
      count: 1,
      position: 1,
    },
    {
      id: "p4",
      ruleId: "r1",
      step: "sign",
      roleId: "legal",
      capacity: null,
      body: null,
      count: 1,
      position: 0,
    },
  ];
  return org;
}

describe("dates", () => {
  it("holds a monthly date to the end of a short month", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-01-31", 2, 31)).toBe("2026-03-31");
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
  });

  it("generates recurring due dates in a window, not once", () => {
    expect(dueDates(obligation({}), "2026-10-01", "2026-12-31")).toEqual([
      "2026-10-15",
      "2026-11-15",
      "2026-12-15",
    ]);
    expect(
      dueDates(
        obligation({ recurrence: "annual", dueOn: "2025-06-30" }),
        "2026-01-01",
        "2027-12-31",
      ),
    ).toEqual(["2026-06-30", "2027-06-30"]);
    expect(
      dueDates(obligation({ recurrence: "none", dueOn: "2026-03-01" }), "2026-04-01", "2026-12-31"),
    ).toEqual([]);
    expect(dueDates(obligation({ endsOn: "2026-11-01" }), "2026-10-01", "2026-12-31")).toEqual([
      "2026-10-15",
    ]);
  });
});

describe("obligations", () => {
  it("counts an unrecorded past occurrence as overdue and a recorded one as done", () => {
    const org = group();
    org.obligations = [
      obligation({ recurrence: "annual", dueOn: "2026-06-30", title: "Annual return" }),
    ];
    expect(overdueOccurrences(org, "2026-09-16").map((x) => x.dueOn)).toEqual(["2026-06-30"]);
    org.occurrences = [
      {
        id: "x",
        obligationId: "o1",
        dueOn: "2026-06-30",
        state: "done",
        completedOn: "2026-07-01",
        note: "",
      },
    ];
    expect(overdueOccurrences(org, "2026-09-16")).toEqual([]);
  });

  it("marks what falls within a fortnight as due soon", () => {
    const org = group();
    org.obligations = [obligation({})];
    const states = occurrencesBetween(org, "2026-09-16", "2026-11-30", "2026-09-16").map(
      (x) => x.state,
    );
    expect(states).toEqual(["upcoming", "upcoming"]);
    const soon = occurrencesBetween(org, "2026-10-01", "2026-10-31", "2026-10-05");
    expect(soon[0]?.state).toBe("due_soon");
  });
});

describe("licences", () => {
  it("derives its state from its dates", () => {
    expect(licenceStatus(licence({ expiresOn: null }), "2026-09-16").state).toBe("no_expiry");
    expect(licenceStatus(licence({ expiresOn: "2027-06-01" }), "2026-09-16").state).toBe("live");
    const due = licenceStatus(licence({ expiresOn: "2026-10-17" }), "2026-09-16");
    expect(due).toMatchObject({ state: "renewal_due", daysLeft: 31 });
    expect(due.windowUsed).toBeCloseTo(1 - 31 / 60);
    expect(licenceStatus(licence({ expiresOn: "2026-09-04" }), "2026-09-16")).toMatchObject({
      state: "expired",
      label: "Expired 12 days ago",
    });
    expect(
      licenceStatus(licence({ expiresOn: "2026-09-04", renewalState: "lodged" }), "2026-09-16")
        .state,
    ).toBe("lapsed_lodged");
  });

  it("lists the fields its type expects and it lacks", () => {
    const types = [
      {
        id: "t",
        key: "sector_minerals_export",
        label: "",
        jurisdiction: "",
        fields: [
          { key: "authority", label: "Authority", type: "text" as const, required: true },
          { key: "reference", label: "Licence number", type: "text" as const, required: true },
          { key: "entity", label: "Holder", type: "entity" as const, required: true },
          { key: "expires_on", label: "Expires", type: "date" as const, required: true },
          { key: "conditions", label: "Conditions", type: "text" as const, required: false },
        ],
        defaultLeadDays: 60,
        typicalPrerequisites: [],
        hasExpiry: true,
        position: 0,
      },
    ];
    const gaps = missingLicenceFields(
      licence({ authority: "Minerals Commission", expiresOn: "2026-11-13" }),
      types,
    );
    expect(gaps.map((f) => f.label)).toEqual(["Licence number"]);
  });
});

describe("entity standing", () => {
  it("comes from obligations and licences, never typed", () => {
    const org = group();
    expect(entityStanding(org, "gm", "2026-09-16").label).toBe("In good standing");
    org.licences = [licence({ expiresOn: "2026-10-17" })];
    expect(entityStanding(org, "gm", "2026-09-16").tone).toBe("warning");
    org.obligations = [
      obligation({ recurrence: "annual", dueOn: "2026-06-30", title: "Annual return 2025" }),
    ];
    const s = entityStanding(org, "gm", "2026-09-16");
    expect(s).toMatchObject({ tone: "danger", label: "Filing overdue" });
    expect(s.reasons[0]).toContain("Annual return 2025");
    expect(entityStanding(org, "gh", "2026-09-16").tone).toBe("good");
  });
});

describe("group structure", () => {
  it("keeps the target apart from today's structure", () => {
    const org = group();
    expect(holdingsIn(org, "current").map((h) => h.id)).toEqual(["h1", "h2", "h3", "h4"]);
    expect(holdingsIn(org, "target").map((h) => h.id)).toEqual(["h1", "h2", "h4", "h5"]);
    const diff = structureDiff(org);
    expect(diff.added.map((h) => h.id)).toEqual(["h5"]);
    expect(diff.removed.map((h) => h.id)).toEqual(["h3"]);
    expect(diff.addedEntities.map((e) => e.id)).toEqual(["new"]);
  });

  it("multiplies effective ownership down the chain and survives a cycle", () => {
    const org = group();
    org.holdings.push(
      holding("loop", { ownerEntityId: "gm", subsidiaryEntityId: "gh", percent: 10 }),
    );
    const owned = ownedThrough(org, "gh");
    expect(owned.find((x) => x.entityId === "gm")?.effective).toBe(60);
  });

  it("flags shareholdings that do not add up", () => {
    const org = group();
    expect(structureFlags(org)).toEqual([]);
    org.holdings[3]!.percent = 30;
    expect(structureFlags(org).map((f) => f.text)).toEqual([
      "Recorded shareholdings in Goldenmark Ghana Ltd add to 90%.",
    ]);
  });
});

describe("organogram", () => {
  it("walks the reporting chain and refuses a loop", () => {
    const org = group();
    expect(reportingChain(org, "logistics").map((r) => r.id)).toEqual(["cm", "ceo"]);
    expect(canReportTo(org, "cm", "logistics")).toBe(false);
    expect(canReportTo(org, "legal", "ceo")).toBe(true);
    expect(canReportTo(org, "legal", "legal")).toBe(false);
  });

  it("derives its gaps from the tree", () => {
    const org = group();
    org.responsibilities = [
      {
        id: "x1",
        area: "Company secretarial",
        detail: "",
        roleId: "legal",
        deputyRoleId: null,
        position: 0,
      },
      { id: "x2", area: "Contracts", detail: "", roleId: "legal", deputyRoleId: null, position: 1 },
    ];
    org.lines = [{ id: "ln", roleId: "logistics", toRoleId: "legal", note: "" }];
    const kinds = organogramFlags(org).map((f) => `${f.kind}:${f.roleId}`);
    expect(kinds).toContain("vacant:legal");
    expect(kinds).toContain("sole:legal");
    expect(kinds).toContain("two_lines:logistics");
    expect(kinds).toContain("no_cover:cm");
    expect(kinds).not.toContain("no_cover:ceo");
  });
});

describe("authority", () => {
  it("picks the rule by band, most specific first", () => {
    const org = group();
    expect(
      matchRule(org, { matterType: "supply contract", amount: 100000, entityId: "gh" })?.id,
    ).toBe("r1");
    expect(
      matchRule(org, { matterType: "Supply contract", amount: 250000, entityId: "gh" })?.id,
    ).toBe("r1");
    expect(
      matchRule(org, { matterType: "Supply contract", amount: 400000, entityId: "gh" })?.id,
    ).toBe("r2");
    // An entity-specific rule beats the group rule, even an inferred one.
    expect(
      matchRule(org, { matterType: "Supply contract", amount: 400000, entityId: "gm" })?.id,
    ).toBe("r3");
    expect(
      matchRule(org, { matterType: "Employment offer", amount: null, entityId: null }),
    ).toBeNull();
  });

  it("stops applying a rule once its instrument is superseded", () => {
    const org = group();
    org.instruments[0]!.supersededOn = "2026-09-10";
    expect(
      matchRule(org, {
        matterType: "Supply contract",
        amount: 100000,
        entityId: "gh",
        on: "2026-09-16",
      }),
    ).toBeNull();
    expect(
      matchRule(org, {
        matterType: "Supply contract",
        amount: 100000,
        entityId: "gh",
        on: "2026-09-05",
      })?.id,
    ).toBe("r1");
  });

  it("names who can act today, and says where nobody can", () => {
    const org = group();
    const [ceo, director] = org.parties.filter((p) => p.ruleId === "r2");
    expect(resolveParty(org, ceo!, "gm")).toMatchObject({
      label: "Chief Executive",
      people: ["Dominik Kleemann"],
      gap: null,
    });
    expect(resolveParty(org, director!, "gm").people).toEqual([
      "Dominik Kleemann",
      "Kojo Amankwah",
    ]);
    // Kojo ceased as a director of Nexis Ghana: nobody is recorded today.
    expect(resolveParty(org, director!, "gh", "2026-09-16").gap).toBe(
      "0 of 1 director recorded for this entity",
    );
    const legal = org.parties.find((p) => p.id === "p4")!;
    expect(resolveParty(org, legal, "gh").gap).toBe("Legal is vacant");
  });
});
