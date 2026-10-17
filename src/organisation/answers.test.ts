import { describe, expect, it } from "vitest";
import {
  dueBetween,
  holderOf,
  holdingsOf,
  keywords,
  licenceExpiry,
  ownersOf,
  reportsTo,
  thisMonth,
  ultimateHolders,
  whichEntity,
  whoHandles,
  whoSigns,
} from "./answers";
import {
  emptyOrganisation,
  type Appointment,
  type AuthorityParty,
  type AuthorityRule,
  type Entity,
  type Holding,
  type Licence,
  type Obligation,
  type Organisation,
  type Person,
  type Responsibility,
  type Role,
} from "./model";

const TODAY = "2026-09-16";

const entity = (id: string, name: string, over: Partial<Entity> = {}): Entity => ({
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
  ...over,
});

const person = (id: string, fullName: string): Person => ({
  id,
  clientId: "c",
  fullName,
  email: "",
  phone: "",
  location: "",
  notes: "",
  archivedAt: null,
});

const role = (id: string, title: string, over: Partial<Role> = {}): Role => ({
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
  ...over,
});

const holding = (
  id: string,
  subsidiaryEntityId: string,
  percent: number,
  over: Partial<Holding>,
): Holding => ({
  id,
  ownerEntityId: null,
  ownerPersonId: null,
  ownerName: null,
  subsidiaryEntityId,
  percent,
  instrument: "",
  effectiveFrom: null,
  effectiveTo: null,
  proposedChangeId: null,
  removedByChangeId: null,
  lastChangeOn: null,
  lastChangeRef: null,
  ...over,
});

const licence = (id: string, name: string, over: Partial<Licence>): Licence => ({
  id,
  entityId: null,
  typeKey: "other",
  name,
  authority: "",
  country: "Ghana",
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

const rule = (id: string, over: Partial<AuthorityRule>): AuthorityRule => ({
  id,
  instrumentId: "doa",
  matterType: "Supply contract",
  entityId: null,
  minAmount: null,
  maxAmount: null,
  currency: "GHS",
  basis: "recorded",
  note: "",
  position: 0,
  effectiveFrom: null,
  effectiveTo: null,
  ...over,
});

let partyN = 0;
const party = (
  ruleId: string,
  step: AuthorityParty["step"],
  over: Partial<AuthorityParty>,
): AuthorityParty => ({
  id: `p${++partyN}`,
  ruleId,
  step,
  roleId: null,
  capacity: null,
  body: null,
  count: 1,
  position: partyN,
  ...over,
});

const appointment = (
  id: string,
  personId: string,
  entityId: string,
  capacity: Appointment["capacity"],
  over: Partial<Appointment> = {},
): Appointment => ({
  id,
  personId,
  entityId,
  capacity,
  title: "",
  appointedOn: "2025-05-06",
  ceasedOn: null,
  lastChangeRef: null,
  ...over,
});

const obligation = (id: string, title: string, over: Partial<Obligation>): Obligation => ({
  id,
  entityId: null,
  licenceId: null,
  title,
  kind: "filing",
  recurrence: "none",
  dueOn: TODAY,
  endsOn: null,
  ownerRoleId: null,
  ownerPersonId: null,
  penaltyNote: "",
  detail: "",
  archivedAt: null,
  ...over,
});

const responsibility = (
  id: string,
  area: string,
  roleId: string,
  deputyRoleId: string | null = null,
): Responsibility => ({
  id,
  area,
  detail: "",
  roleId,
  deputyRoleId,
  position: 0,
});

/** A multi-entity group drawn from the Column 7 reference. */
function group(): Organisation {
  const org = emptyOrganisation("c", "ws");
  org.entities = [
    entity("llc", "Nexis Africa LLC", { jurisdiction: "UAE", activity: "Holding company" }),
    entity("fzco", "Nexis Africa MEA FZCO", { jurisdiction: "UAE", activity: "General trading" }),
    entity("gh", "Nexis Africa (Ghana) Ltd", {
      shortName: "Nexis GH",
      activity: "Management and advisory services",
    }),
    entity("gm", "Goldenmark Ghana Ltd", {
      activity: "Buying and exporting of gold and other precious metals",
    }),
    entity("abm", "ABM Ghana Ltd", { activity: "Trading in mining supplies" }),
    entity("old", "Old Minerals Ltd", { status: "dissolved", activity: "Gold export" }),
  ];
  org.people = [
    person("dk", "Dominik Kleemann"),
    person("ka", "Kojo Amankwah"),
    person("ma", "Mawusi Adusu"),
    person("de", "Dede Anku"),
  ];
  org.holdings = [
    holding("h1", "llc", 100, { ownerPersonId: "dk" }),
    holding("h2", "fzco", 51, { ownerEntityId: "llc" }),
    holding("h3", "fzco", 49, { ownerName: "Minority partner" }),
    holding("h4", "gh", 100, { ownerPersonId: "dk" }),
    holding("h5", "gm", 100, { ownerEntityId: "gh" }),
    holding("h6", "abm", 100, { ownerEntityId: "gh" }),
  ];
  org.roles = [
    role("ceo", "Chief Executive", { kind: "leadership", holderPersonId: "dk" }),
    role("cm", "Country Manager", {
      kind: "leadership",
      parentRoleId: "ceo",
      holderPersonId: "ka",
      coverRoleId: "ops",
    }),
    role("ops", "Operations", { kind: "head", parentRoleId: "cm", holderPersonId: "de" }),
    role("log", "Logistics", { parentRoleId: "ops", functionName: "Operations" }),
    role("legal", "Legal", {
      kind: "head",
      parentRoleId: "ceo",
      holderPersonId: "ma",
      functionName: "Corporate",
    }),
    role("comp", "Compliance", { kind: "head", parentRoleId: "ceo" }),
  ];
  org.lines = [{ id: "l1", roleId: "log", toRoleId: "comp", note: "export documentation" }];
  org.appointments = [
    appointment("a1", "dk", "gm", "director"),
    appointment("a2", "ka", "gm", "director"),
    appointment("a3", "ma", "gm", "secretary"),
    appointment("a4", "de", "gm", "director", {
      appointedOn: "2025-05-06",
      ceasedOn: "2026-01-31",
    }),
    appointment("a5", "ka", "abm", "managing_director"),
  ];
  org.responsibilities = [
    responsibility("r1", "Company secretarial", "legal"),
    responsibility("r2", "Contracts and disputes", "legal"),
    responsibility("r3", "Regulator liaison and licences", "comp", "legal"),
  ];
  org.instruments = [
    {
      id: "doa",
      title: "Delegation of Authority Policy v3",
      approvedOn: "2026-09-02",
      approvedBy: "Board",
      scopeNote: "All Ghana entities",
      reviewDueOn: "2027-03-31",
      reference: "BM-2026-07",
      documentId: null,
      supersededOn: null,
    },
  ];
  org.rules = [
    rule("small", { maxAmount: 250000, position: 1 }),
    rule("large", { minAmount: 250000, position: 2 }),
    rule("settle", {
      matterType: "Litigation / settlement",
      basis: "inferred",
      instrumentId: null,
      position: 3,
    }),
  ];
  org.parties = [
    party("small", "approve", { roleId: "cm" }),
    party("small", "sign", { roleId: "cm" }),
    party("large", "recommend", { roleId: "legal" }),
    party("large", "approve", { roleId: "ceo" }),
    party("large", "sign", { roleId: "ceo" }),
    party("large", "sign", { capacity: "director", count: 1 }),
    party("settle", "approve", { body: "board" }),
  ];
  org.licences = [
    licence("pmmc", "PMMC gold export licence", {
      entityId: "gm",
      authority: "Precious Minerals Marketing Company",
      expiresOn: "2026-09-04",
      renewalState: "lodged",
      renewalLodgedOn: "2026-09-01",
    }),
    licence("dwtc", "DWTC trade licence", {
      entityId: "fzco",
      expiresOn: "2026-10-17",
      ownerPersonId: "ka",
    }),
    licence("vat", "VAT registration", { entityId: "gh", verified: false }),
  ];
  org.obligations = [
    obligation("ar", "Annual return 2025", {
      entityId: "gm",
      dueOn: "2026-06-30",
      penaltyNote: "GHS 50 a month",
    }),
    obligation("vatr", "VAT return", {
      entityId: "gh",
      recurrence: "monthly",
      dueOn: "2026-07-20",
    }),
  ];
  org.occurrences = [
    {
      id: "o1",
      obligationId: "vatr",
      dueOn: "2026-07-20",
      state: "done",
      completedOn: "2026-07-18",
      note: "",
    },
    {
      id: "o2",
      obligationId: "vatr",
      dueOn: "2026-08-20",
      state: "done",
      completedOn: "2026-08-19",
      note: "",
    },
  ];
  return org;
}

const text = (a: { sections: { label: string; text: string }[] }, label: string) =>
  a.sections.find((s) => s.label === label)?.text ?? "";

describe("keywords", () => {
  it("drops filler and numbers", () => {
    expect(
      keywords("We're signing a GHS 400,000 gold supply contract with a new Ghanaian supplier"),
    ).toEqual(expect.arrayContaining(["gold", "supply", "ghs", "ghanaian", "supplier"]));
    expect(keywords("the contract 400")).toEqual([]);
  });
});

describe("whoSigns", () => {
  it("takes the band above the threshold and names the directors of the contracting entity", () => {
    const a = whoSigns(
      group(),
      { matterType: "supply contract", amount: 400000, entityId: "gm" },
      TODAY,
    );
    expect(text(a, "APPROVES")).toBe("Chief Executive — Dominik Kleemann");
    expect(text(a, "SIGNS")).toBe(
      "Chief Executive — Dominik Kleemann + 1 director — Dominik Kleemann and Kojo Amankwah",
    );
    expect(text(a, "RECOMMENDS")).toContain("Legal — Mawusi Adusu");
    expect(text(a, "BASIS")).toContain("Delegation of Authority Policy v3");
    expect(a.citations.map((c) => c.recordId)).toEqual(
      expect.arrayContaining(["large", "doa", "gm", "ceo"]),
    );
  });

  it("does not name a director who has ceased", () => {
    const a = whoSigns(
      group(),
      { matterType: "Supply contract", amount: 400000, entityId: "gm" },
      TODAY,
    );
    expect(text(a, "SIGNS")).not.toContain("Dede Anku");
  });

  it("uses the lower band at the threshold itself", () => {
    const a = whoSigns(
      group(),
      { matterType: "Supply contract", amount: 250000, entityId: "gm" },
      TODAY,
    );
    expect(text(a, "SIGNS")).toBe("Country Manager — Kojo Amankwah");
  });

  it("asks for the value rather than guessing a band", () => {
    const a = whoSigns(
      group(),
      { matterType: "Supply contract", amount: null, entityId: "gm" },
      TODAY,
    );
    expect(a.sections[0]!.text).toContain("No rule in force");
    expect(a.gaps[0]).toContain("Give the value");
  });

  it("says plainly when the position is inferred", () => {
    const a = whoSigns(
      group(),
      { matterType: "Litigation / settlement", amount: null, entityId: null },
      TODAY,
    );
    expect(text(a, "APPROVES")).toBe("Board resolution");
    expect(text(a, "BASIS")).toMatch(/^Inferred/);
  });

  it("flags a vacant role instead of naming nobody silently", () => {
    const org = group();
    org.roles = org.roles.map((r) => (r.id === "cm" ? { ...r, holderPersonId: null } : r));
    const a = whoSigns(org, { matterType: "Supply contract", amount: 1000, entityId: "gm" }, TODAY);
    expect(text(a, "SIGNS")).toBe("Country Manager");
    expect(a.gaps).toContain("Country Manager is vacant");
  });
});

describe("whichEntity", () => {
  it("recommends the entity whose activity and licence fit, and says what to watch", () => {
    const a = whichEntity(
      group(),
      "GHS 400,000 gold supply contract with a new Ghanaian supplier",
      TODAY,
    );
    expect(a.basis).toBe("inference");
    expect(text(a, "ENTITY")).toMatch(/^Goldenmark Ghana Ltd is the closest match/);
    expect(text(a, "ENTITY")).toContain("recommendation");
    expect(text(a, "WATCH")).toContain("Annual return 2025 overdue");
    expect(text(a, "WATCH")).toContain("PMMC gold export licence expired");
    expect(a.citations.some((c) => c.recordId === "old")).toBe(false);
  });

  it("says when nothing recorded matches", () => {
    const a = whichEntity(group(), "software licensing deal", TODAY);
    expect(text(a, "ENTITY")).toContain("Nothing recorded");
  });
});

describe("whoHandles", () => {
  it("names the owner and flags a missing deputy", () => {
    const a = whoHandles(group(), "company secretarial filings", TODAY);
    expect(a.sections[0]!.text).toBe("Legal — Mawusi Adusu; no deputy.");
    expect(a.gaps).toContain("Company secretarial has no deputy.");
  });

  it("falls back to role titles and says so", () => {
    const a = whoHandles(group(), "logistics", TODAY);
    expect(a.basis).toBe("inference");
    expect(a.sections[0]!.text).toContain("Logistics");
  });
});

describe("licenceExpiry", () => {
  it("orders by expiry and says what is lodged", () => {
    const a = licenceExpiry(group(), {}, TODAY);
    expect(a.sections[0]!.text).toContain("expired 4 Sept 2026, renewal lodged and not yet issued");
    expect(a.sections[1]!.text).toContain(
      "expires 17 Oct 2026 (31 days), inside its renewal window",
    );
    expect(a.gaps).toContain("VAT registration is unverified: no document backs it.");
  });
});

describe("dueBetween", () => {
  it("separates what is overdue from what falls due, and leaves out what is done", () => {
    const { from, to } = thisMonth(TODAY);
    const a = dueBetween(group(), from, to, TODAY);
    expect(text(a, "OVERDUE")).toContain("Annual return 2025");
    expect(text(a, "DUE")).toContain("VAT return");
    expect(text(a, "OVERDUE")).not.toContain("VAT return");
  });
});

describe("reportsTo", () => {
  it("walks the chain and mentions the functional line", () => {
    const a = reportsTo(group(), { roleId: "log" });
    expect(text(a, "LOGISTICS")).toContain(
      "Reports to Operations (Dede Anku), who reports to Country Manager (Kojo Amankwah)",
    );
    expect(text(a, "LOGISTICS")).toContain("functional line to Compliance (vacant)");
    expect(text(a, "CHAIN")).toBe("Chief Executive › Country Manager › Operations › Logistics");
  });

  it("answers for a person through the roles they hold", () => {
    const a = reportsTo(group(), { personId: "ka" });
    expect(text(a, "COUNTRY MANAGER")).toContain("Chief Executive (Dominik Kleemann)");
  });
});

describe("ownership", () => {
  it("gives direct holders and the ultimate owners with effective shares", () => {
    const a = ownersOf(group(), "gm", TODAY);
    expect(text(a, "HELD BY")).toBe("Nexis GH 100%");
    expect(text(a, "ULTIMATELY")).toBe("Dominik Kleemann 100%");
    expect(ultimateHolders(group(), "fzco", TODAY)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Dominik Kleemann", effective: 51 }),
        expect.objectContaining({ label: "Minority partner", effective: 49 }),
      ]),
    );
  });

  it("flags holdings that do not add to 100", () => {
    const org = group();
    org.holdings = org.holdings.filter((h) => h.id !== "h3");
    expect(ownersOf(org, "fzco", TODAY).gaps).toContain("The recorded holdings add to 51%.");
  });

  it("lists what an entity owns, directly and through others", () => {
    const org = group();
    org.holdings.push(holding("h7", "llc", 10, { ownerEntityId: "gm" }));
    const a = holdingsOf(org, "gh", TODAY);
    expect(text(a, "DIRECTLY")).toBe("Goldenmark Ghana Ltd 100%; ABM Ghana Ltd 100%");
    expect(text(a, "THROUGH OTHERS")).toContain("Nexis Africa LLC 10% via Goldenmark Ghana Ltd");
  });
});

describe("holderOf", () => {
  it("reads current appointments for an entity", () => {
    const a = holderOf(group(), "managing director", "abm", TODAY);
    expect(text(a, "MANAGING DIRECTOR")).toContain("Kojo Amankwah");
    const d = holderOf(group(), "directors", "gm", TODAY);
    expect(text(d, "DIRECTOR")).toContain("Dominik Kleemann");
    expect(text(d, "DIRECTOR")).not.toContain("Dede Anku");
  });

  it("reads the organogram for a role title", () => {
    const a = holderOf(group(), "compliance", null, TODAY);
    expect(text(a, "ORGANOGRAM")).toBe("Compliance — vacant");
    expect(a.gaps).toContain("Compliance is vacant.");
  });
});
