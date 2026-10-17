/**
 * A client as an organisation: the records and what follows from them.
 *
 * Everything on the organisation screens is one of these records or is derived
 * from them here. Nothing derived is stored: an entity's standing comes from
 * its obligations and licences, a licence's state from its dates, a structure
 * flag from the role tree. Two screens therefore cannot disagree, and a
 * question put to Scripta later is answered from the same functions the
 * screens use.
 *
 * Two structures are kept apart on purpose. Roles and reporting lines are the
 * organogram (who reports to whom). Entities and holdings are the group
 * structure (what owns what). Nothing here merges them.
 */

/* ------------------------------------------------------------------ dates */

/** A calendar day as `YYYY-MM-DD`, in local time. */
export type Day = string;

export const localDay = (d: Date = new Date()): Day => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const parts = (day: Day) => {
  const [y, m, d] = day.split("-").map(Number);
  return { y: y!, m: m!, d: d! };
};

const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate();

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export const daysBetween = (from: Day, to: Day): number => {
  const a = parts(from);
  const b = parts(to);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000);
};

export const addDays = (day: Day, n: number): Day => {
  const p = parts(day);
  const t = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
};

/** The same day of the month `n` months on, held to the month's last day. */
export const addMonths = (day: Day, n: number, dayOfMonth?: number): Day => {
  const p = parts(day);
  const index = p.y * 12 + (p.m - 1) + n;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  const d = Math.min(dayOfMonth ?? p.d, daysInMonth(y, m));
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};

export const formatDay = (
  day: Day | null | undefined,
  style: "short" | "long" = "short",
): string => {
  if (!day) return "";
  const p = parts(day.slice(0, 10));
  return new Date(p.y, p.m - 1, p.d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: style === "long" ? "long" : "short",
    year: "numeric",
  });
};

export const monthLabel = (day: Day): string => {
  const p = parts(day);
  return new Date(p.y, p.m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
};

/* ---------------------------------------------------------------- records */

export type EntityStatus = "active" | "dormant" | "in_liquidation" | "dissolved";

export const ENTITY_STATUS_LABEL: Record<EntityStatus, string> = {
  active: "Active",
  dormant: "Dormant",
  in_liquidation: "In liquidation",
  dissolved: "Dissolved",
};

/** Where a fact was read from, when it was read from a document. */
export type FieldSource = {
  value: string;
  documentId: string | null;
  page: number | null;
  confidence: number | null;
  /** Other values other documents gave for the same field, kept rather than overwritten. */
  conflicts?: { value: string; documentId: string | null; page: number | null }[];
};

export type FieldSources = Record<string, FieldSource>;

/** A dated change given alongside a write: effective date and reference. */
export type ChangeContext = { on?: Day | null; ref?: string | null };

export type Entity = {
  id: string;
  clientId: string;
  name: string;
  shortName: string;
  entityType: string;
  jurisdiction: string;
  registrationNo: string;
  taxNo: string;
  incorporatedOn: Day | null;
  registeredOffice: string;
  activity: string;
  shareCapital: string;
  status: EntityStatus;
  proposedChangeId: string | null;
  notes: string;
  fieldSources: FieldSources;
  lastChangeOn: Day | null;
  lastChangeRef: string | null;
  updatedAt: string;
  archivedAt: string | null;
};

export type Person = {
  id: string;
  clientId: string;
  fullName: string;
  email: string;
  phone: string;
  location: string;
  notes: string;
  archivedAt: string | null;
};

export type Holding = {
  id: string;
  ownerEntityId: string | null;
  ownerPersonId: string | null;
  ownerName: string | null;
  subsidiaryEntityId: string;
  percent: number | null;
  instrument: string;
  effectiveFrom: Day | null;
  effectiveTo: Day | null;
  proposedChangeId: string | null;
  removedByChangeId: string | null;
  lastChangeOn: Day | null;
  lastChangeRef: string | null;
};

export type StructureChange = {
  id: string;
  title: string;
  detail: string;
  status: "planned" | "done" | "dropped";
  position: number;
};

export type RoleKind = "leadership" | "head" | "role";

export const ROLE_KIND_LABEL: Record<RoleKind, string> = {
  leadership: "Leadership",
  head: "Function head",
  role: "Role",
};

/** What the role's kind is called: the client's own word, else the tier's name. */
export const roleKindName = (r: Pick<Role, "kind" | "kindLabel">): string =>
  r.kindLabel.trim() || ROLE_KIND_LABEL[r.kind];

export type Role = {
  id: string;
  title: string;
  functionName: string;
  kind: RoleKind;
  /** The client's own name for the kind; blank means the tier's name. */
  kindLabel: string;
  entityId: string | null;
  parentRoleId: string | null;
  holderPersonId: string | null;
  acting: boolean;
  coverRoleId: string | null;
  coverNote: string;
  position: number;
  effectiveFrom: Day | null;
  effectiveTo: Day | null;
  lastChangeOn: Day | null;
  lastChangeRef: string | null;
  updatedAt: string;
};

export type RoleLine = { id: string; roleId: string; toRoleId: string; note: string };

export type Capacity =
  | "director"
  | "alternate_director"
  | "secretary"
  | "chair"
  | "managing_director"
  | "signatory"
  | "auditor"
  | "officer";

export const CAPACITY_LABEL: Record<Capacity, string> = {
  director: "Director",
  alternate_director: "Alternate director",
  secretary: "Company secretary",
  chair: "Chair",
  managing_director: "Managing director",
  signatory: "Authorised signatory",
  auditor: "Auditor",
  officer: "Officer",
};

export type Appointment = {
  id: string;
  personId: string;
  entityId: string;
  capacity: Capacity;
  title: string;
  appointedOn: Day | null;
  ceasedOn: Day | null;
  lastChangeRef: string | null;
};

export type Responsibility = {
  id: string;
  area: string;
  detail: string;
  roleId: string;
  deputyRoleId: string | null;
  position: number;
};

export type Instrument = {
  id: string;
  title: string;
  approvedOn: Day | null;
  approvedBy: string;
  scopeNote: string;
  reviewDueOn: Day | null;
  reference: string;
  documentId: string | null;
  supersededOn: Day | null;
};

export type AuthorityStep = "recommend" | "approve" | "sign";
export type AuthorityBody = "board" | "shareholders" | "committee";
export type AuthorityCapacity = "director" | "secretary" | "signatory";

export const BODY_LABEL: Record<AuthorityBody, string> = {
  board: "Board resolution",
  shareholders: "Shareholders' resolution",
  committee: "Committee",
};

export type AuthorityParty = {
  id: string;
  ruleId: string;
  step: AuthorityStep;
  roleId: string | null;
  capacity: AuthorityCapacity | null;
  body: AuthorityBody | null;
  count: number;
  position: number;
};

export type AuthorityRule = {
  id: string;
  instrumentId: string | null;
  matterType: string;
  entityId: string | null;
  minAmount: number | null;
  maxAmount: number | null;
  currency: string;
  basis: "recorded" | "inferred";
  note: string;
  position: number;
  effectiveFrom: Day | null;
  effectiveTo: Day | null;
};

export type LicenceField = {
  key: string;
  label: string;
  type: "text" | "date" | "entity" | "number" | "list";
  required: boolean;
  hint?: string;
};

export type LicenceType = {
  id: string;
  key: string;
  label: string;
  jurisdiction: string;
  fields: LicenceField[];
  defaultLeadDays: number;
  typicalPrerequisites: string[];
  hasExpiry: boolean;
  position: number;
};

export type Prerequisite = { id: string; label: string; done: boolean };

export type Licence = {
  id: string;
  entityId: string | null;
  typeKey: string;
  name: string;
  authority: string;
  country: string;
  reference: string;
  issuedOn: Day | null;
  issuedNote: string;
  expiresOn: Day | null;
  renewalLeadDays: number;
  ownerRoleId: string | null;
  ownerPersonId: string | null;
  prerequisites: Prerequisite[];
  renewalState: "none" | "preparing" | "lodged";
  renewalLodgedOn: Day | null;
  conditions: string;
  recurringNote: string;
  originalLocation: string;
  verified: boolean;
  fieldSources: FieldSources;
  archivedAt: string | null;
};

export type ObligationKind =
  "filing" | "return" | "meeting" | "register" | "payment" | "renewal" | "other";
export type Recurrence = "none" | "monthly" | "quarterly" | "annual";

export const RECURRENCE_LABEL: Record<Recurrence, string> = {
  none: "Once",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annually",
};

export type Obligation = {
  id: string;
  entityId: string | null;
  licenceId: string | null;
  title: string;
  kind: ObligationKind;
  recurrence: Recurrence;
  dueOn: Day;
  endsOn: Day | null;
  ownerRoleId: string | null;
  ownerPersonId: string | null;
  penaltyNote: string;
  detail: string;
  archivedAt: string | null;
};

export type Occurrence = {
  id: string;
  obligationId: string;
  dueOn: Day;
  state: "open" | "done" | "waived";
  completedOn: Day | null;
  note: string;
};

export type ProcessStep = {
  id: string;
  processId: string;
  position: number;
  title: string;
  detail: string;
  ownerRoleId: string | null;
  durationDays: number | null;
  sourceSection: string;
  sourcePage: number | null;
};

export type Process = {
  id: string;
  name: string;
  summary: string;
  ownerRoleId: string | null;
  cadence: string;
  sourceDocumentId: string | null;
  status: "draft" | "published";
  presetId: string | null;
  archivedAt: string | null;
};

/**
 * The shelves the firm keeps a client's records on.
 *
 * These eleven are offered, with their labels, because a company secretary
 * recognises every one of them. They are not a limit: a client who files
 * "Trust deeds" or "Tax rulings" says so, and the word they typed is the word
 * that is kept — see `categoryLabel`. `OrgCategory` therefore allows any
 * string while still suggesting these.
 */
export type KnownCategory =
  | "constitution"
  | "certificate"
  | "register"
  | "resolution"
  | "minutes"
  | "policy"
  | "licence"
  | "agreement"
  | "filing"
  | "correspondence"
  | "other";

/** Any category, with the known ones still offered by the editor. */
export type OrgCategory = KnownCategory | (string & {});

export const ORG_CATEGORY_LABEL: Record<KnownCategory, string> = {
  constitution: "Constitutions",
  certificate: "Certificates of incorporation",
  register: "Statutory registers",
  resolution: "Resolutions",
  minutes: "Board minutes",
  policy: "Policies",
  licence: "Licences & permits",
  agreement: "Shareholder & group agreements",
  filing: "Filings & returns",
  correspondence: "Regulator correspondence",
  other: "Other records",
};

/** What a category is called: the firm's label, or the client's own words. */
export const categoryLabel = (category: OrgCategory | null | undefined): string =>
  (category && ORG_CATEGORY_LABEL[category as KnownCategory]) || category || "Uncategorised";

/** The built-in shelves, in the order a company secretary files them. */
export const KNOWN_CATEGORIES = Object.keys(ORG_CATEGORY_LABEL) as KnownCategory[];

/**
 * The shelves in the order they are read: the client's own first, then the
 * firm's, then anything else they have named — alphabetically, so a shelf
 * created today appears somewhere a reader would look rather than at the top.
 */
export function shelfOrder(own: OrgCategory[], inUse: OrgCategory[]): OrgCategory[] {
  const seen = new Set<string>();
  const out: OrgCategory[] = [];
  const add = (c: OrgCategory) => {
    if (seen.has(c)) return;
    seen.add(c);
    out.push(c);
  };
  for (const c of own) add(c);
  for (const c of KNOWN_CATEGORIES) add(c);
  for (const c of [...inUse].sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b))))
    add(c);
  return out;
}

export type OrgDocument = {
  id: string;
  name: string;
  category: OrgCategory | null;
  mimeType: string | null;
  storagePath: string | null;
  pageCount: number | null;
  parseStatus: string;
  createdAt: string;
  archivedAt: string | null;
};

export type RecordType =
  | "entity"
  | "licence"
  | "instrument"
  | "process"
  | "holding"
  | "appointment"
  | "obligation"
  | "person";

export type RecordDocument = {
  id: string;
  documentId: string;
  recordType: RecordType;
  recordId: string;
  page: number | null;
  note: string;
};

export type ChangeEvent = {
  id: string;
  summary: string;
  actor: string;
  at: string;
  recordType: string;
  recordId: string;
  effectiveOn: Day | null;
  reference: string | null;
  changed: Record<string, unknown> | null;
  before: Record<string, unknown> | null;
};

/** Everything recorded about one client's organisation. */
export type Organisation = {
  clientId: string;
  workspaceId: string;
  entities: Entity[];
  people: Person[];
  holdings: Holding[];
  changes: StructureChange[];
  roles: Role[];
  lines: RoleLine[];
  appointments: Appointment[];
  responsibilities: Responsibility[];
  instruments: Instrument[];
  rules: AuthorityRule[];
  parties: AuthorityParty[];
  licenceTypes: LicenceType[];
  licences: Licence[];
  obligations: Obligation[];
  occurrences: Occurrence[];
  processes: Process[];
  steps: ProcessStep[];
  documents: OrgDocument[];
  /** The order this client files its key documents in; empty means the firm's. */
  categoryOrder: OrgCategory[];
  recordDocuments: RecordDocument[];
  history: ChangeEvent[];
};

export const emptyOrganisation = (clientId: string, workspaceId: string): Organisation => ({
  clientId,
  workspaceId,
  entities: [],
  people: [],
  holdings: [],
  changes: [],
  roles: [],
  lines: [],
  appointments: [],
  responsibilities: [],
  instruments: [],
  rules: [],
  parties: [],
  licenceTypes: [],
  licences: [],
  obligations: [],
  occurrences: [],
  processes: [],
  steps: [],
  documents: [],
  categoryOrder: [],
  recordDocuments: [],
  history: [],
});

/* ---------------------------------------------------------------- lookups */

export const byId = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]));

export const liveEntities = (org: Organisation) =>
  org.entities.filter((e) => !e.archivedAt && !e.proposedChangeId);

export const livePeople = (org: Organisation) => org.people.filter((p) => !p.archivedAt);

/** Roles in force on `on`: started (or undated) and not ended. */
export const currentRoles = (org: Organisation, on: Day = localDay()) =>
  org.roles.filter(
    (r) => (!r.effectiveFrom || r.effectiveFrom <= on) && (!r.effectiveTo || r.effectiveTo > on),
  );

export const entityLabel = (e: Entity | undefined | null) => (e ? e.shortName || e.name : "");

export const personName = (org: Organisation, id: string | null | undefined) =>
  id ? (org.people.find((p) => p.id === id)?.fullName ?? "") : "";

/** "Finance Manager — Alice Tetteh", or "Finance Manager — vacant". */
export const roleWithHolder = (org: Organisation, role: Role | undefined | null) => {
  if (!role) return "";
  const holder = personName(org, role.holderPersonId);
  return `${role.title} — ${holder ? `${holder}${role.acting ? " (acting)" : ""}` : "vacant"}`;
};

/** The owner of a licence or obligation, as a person's name where one is known. */
export const ownerLabel = (
  org: Organisation,
  row: { ownerRoleId: string | null; ownerPersonId: string | null },
) => {
  if (row.ownerPersonId) return personName(org, row.ownerPersonId);
  const role = org.roles.find((r) => r.id === row.ownerRoleId);
  if (!role) return "";
  const holder = personName(org, role.holderPersonId);
  return holder ? `${holder} (${role.title})` : `${role.title} (vacant)`;
};

/** Appointments in force on `on`. */
export const currentAppointments = (org: Organisation, on: Day = localDay()) =>
  org.appointments.filter(
    (a) => (!a.appointedOn || a.appointedOn <= on) && (!a.ceasedOn || a.ceasedOn > on),
  );

export const officersOf = (org: Organisation, entityId: string, on: Day = localDay()) =>
  currentAppointments(org, on).filter((a) => a.entityId === entityId);

export const documentsFor = (org: Organisation, recordType: RecordType, recordId: string) => {
  const docs = byId(org.documents);
  return org.recordDocuments
    .filter((l) => l.recordType === recordType && l.recordId === recordId)
    .map((l) => ({ link: l, document: docs.get(l.documentId) ?? null }));
};

/* ------------------------------------------------------ the group structure */

export type StructureView = "current" | "target";

/** Holdings in force in a view. The target applies planned changes to today's structure. */
export const holdingsIn = (org: Organisation, view: StructureView, on: Day = localDay()) => {
  const planned = new Set(org.changes.filter((c) => c.status === "planned").map((c) => c.id));
  return org.holdings.filter((h) => {
    const inForce =
      (!h.effectiveFrom || h.effectiveFrom <= on) && (!h.effectiveTo || h.effectiveTo > on);
    if (view === "current") return !h.proposedChangeId && inForce;
    if (h.proposedChangeId) return planned.has(h.proposedChangeId);
    if (h.removedByChangeId && planned.has(h.removedByChangeId)) return false;
    return inForce;
  });
};

export const entitiesIn = (org: Organisation, view: StructureView) => {
  const planned = new Set(org.changes.filter((c) => c.status === "planned").map((c) => c.id));
  return org.entities.filter(
    (e) =>
      !e.archivedAt &&
      e.status !== "dissolved" &&
      (view === "current"
        ? !e.proposedChangeId
        : !e.proposedChangeId || planned.has(e.proposedChangeId)),
  );
};

export const holderLabel = (org: Organisation, h: Holding) => {
  if (h.ownerEntityId) return entityLabel(org.entities.find((e) => e.id === h.ownerEntityId));
  if (h.ownerPersonId) return personName(org, h.ownerPersonId);
  return h.ownerName ?? "";
};

export const percentLabel = (p: number | null) =>
  p === null ? "—" : `${Number.isInteger(p) ? p : Number(p.toFixed(2))}%`;

/** Who holds an entity's shares, today. */
export const shareholdersOf = (org: Organisation, entityId: string, on: Day = localDay()) =>
  holdingsIn(org, "current", on).filter((h) => h.subsidiaryEntityId === entityId);

/** What an entity holds, today. */
export const holdingsBy = (org: Organisation, entityId: string, on: Day = localDay()) =>
  holdingsIn(org, "current", on).filter((h) => h.ownerEntityId === entityId);

/**
 * Everything an entity owns directly or through others, with the effective
 * share multiplied down the chain. A cycle is walked once.
 */
export const ownedThrough = (org: Organisation, entityId: string, on: Day = localDay()) => {
  const holdings = holdingsIn(org, "current", on);
  const out = new Map<string, { entityId: string; effective: number | null; path: string[] }>();
  const walk = (from: string, share: number | null, path: string[]) => {
    for (const h of holdings.filter((x) => x.ownerEntityId === from)) {
      if (path.includes(h.subsidiaryEntityId) || h.subsidiaryEntityId === entityId) continue;
      const effective = share === null || h.percent === null ? null : (share * h.percent) / 100;
      const nextPath = [...path, h.subsidiaryEntityId];
      if (!out.has(h.subsidiaryEntityId))
        out.set(h.subsidiaryEntityId, {
          entityId: h.subsidiaryEntityId,
          effective,
          path: nextPath,
        });
      walk(h.subsidiaryEntityId, effective, nextPath);
    }
  };
  walk(entityId, 100, []);
  return [...out.values()];
};

export type StructureFlag = { key: string; text: string; entityId: string | null };

export const structureFlags = (org: Organisation): StructureFlag[] => {
  const flags: StructureFlag[] = [];
  const holdings = holdingsIn(org, "current");
  for (const e of liveEntities(org)) {
    const held = holdings.filter((h) => h.subsidiaryEntityId === e.id);
    const total = held.reduce((n, h) => n + (h.percent ?? 0), 0);
    if (held.length && held.every((h) => h.percent !== null) && Math.abs(total - 100) > 0.01)
      flags.push({
        key: `pct-${e.id}`,
        text: `Recorded shareholdings in ${entityLabel(e)} add to ${percentLabel(total)}.`,
        entityId: e.id,
      });
  }
  return flags;
};

/** Compare view: what the planned changes add and remove. */
export const structureDiff = (org: Organisation) => {
  const current = new Set(holdingsIn(org, "current").map((h) => h.id));
  const target = new Set(holdingsIn(org, "target").map((h) => h.id));
  return {
    added: org.holdings.filter((h) => target.has(h.id) && !current.has(h.id)),
    removed: org.holdings.filter((h) => current.has(h.id) && !target.has(h.id)),
    addedEntities: entitiesIn(org, "target").filter((e) => e.proposedChangeId),
  };
};

/* ----------------------------------------------------------- the organogram */

export const childrenOf = (roles: Role[], parentId: string | null) =>
  roles
    .filter((r) => r.parentRoleId === parentId)
    .sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));

/** The reporting chain upwards, nearest first. Stops on a loop. */
export const reportingChain = (org: Organisation, roleId: string): Role[] => {
  const roles = byId(org.roles);
  const chain: Role[] = [];
  const seen = new Set<string>([roleId]);
  let next = roles.get(roleId)?.parentRoleId ?? null;
  while (next && !seen.has(next)) {
    const role = roles.get(next);
    if (!role) break;
    chain.push(role);
    seen.add(next);
    next = role.parentRoleId;
  }
  return chain;
};

/** Roles below `roleId`, at any depth. */
export const descendantsOf = (org: Organisation, roleId: string): Role[] => {
  const out: Role[] = [];
  const stack = [roleId];
  const seen = new Set(stack);
  while (stack.length) {
    const id = stack.pop()!;
    for (const child of org.roles.filter((r) => r.parentRoleId === id)) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      out.push(child);
      stack.push(child.id);
    }
  }
  return out;
};

/** A role may not be placed under itself or anything below it. */
export const canReportTo = (org: Organisation, roleId: string, parentId: string | null) =>
  parentId === null ||
  (parentId !== roleId && !descendantsOf(org, roleId).some((r) => r.id === parentId));

export type RoleFlag = {
  key: string;
  kind: "vacant" | "sole" | "two_lines" | "no_cover";
  roleId: string;
  text: string;
};

/** Gaps a lawyer would otherwise find during an absence: all derived from the tree. */
export const organogramFlags = (org: Organisation, on: Day = localDay()): RoleFlag[] => {
  const roles = currentRoles(org, on);
  const flags: RoleFlag[] = [];
  for (const r of roles) {
    if (!r.holderPersonId)
      flags.push({
        key: `vacant-${r.id}`,
        kind: "vacant",
        roleId: r.id,
        text: `${r.title} is vacant.`,
      });
    const lines = org.lines.filter((l) => l.roleId === r.id);
    if (r.parentRoleId && lines.length)
      flags.push({
        key: `lines-${r.id}`,
        kind: "two_lines",
        roleId: r.id,
        text: `${r.title} reports to ${lines.length + 1} roles.`,
      });
  }
  const sole = new Map<string, number>();
  for (const x of org.responsibilities)
    if (!x.deputyRoleId) sole.set(x.roleId, (sole.get(x.roleId) ?? 0) + 1);
  for (const [roleId, n] of sole) {
    const role = roles.find((r) => r.id === roleId);
    if (role)
      flags.push({
        key: `sole-${roleId}`,
        kind: "sole",
        roleId,
        text: `${role.title} holds ${n} responsibilit${n === 1 ? "y" : "ies"} with no deputy.`,
      });
  }
  for (const r of roles.filter((x) => x.kind !== "role"))
    if (!r.coverRoleId)
      flags.push({
        key: `cover-${r.id}`,
        kind: "no_cover",
        roleId: r.id,
        text: `No absence cover named for ${r.title}.`,
      });
  return flags;
};

/** Function heads and above, climbing: the escalation ladder from a role. */
export const escalationLadder = (org: Organisation, roleId: string): Role[] => {
  const role = org.roles.find((r) => r.id === roleId);
  return role ? [role, ...reportingChain(org, roleId)] : [];
};

/* ------------------------------------------------------------- obligations */

export type OccurrenceState = "done" | "waived" | "overdue" | "due_soon" | "upcoming";

export type DatedOccurrence = {
  key: string;
  obligation: Obligation;
  dueOn: Day;
  record: Occurrence | null;
  state: OccurrenceState;
};

const stepMonths: Record<Exclude<Recurrence, "none">, number> = {
  monthly: 1,
  quarterly: 3,
  annual: 12,
};

/** The due dates an obligation generates between two days, inclusive. */
export const dueDates = (o: Obligation, from: Day, to: Day): Day[] => {
  if (o.recurrence === "none") return o.dueOn >= from && o.dueOn <= to ? [o.dueOn] : [];
  const out: Day[] = [];
  const anchorDay = parts(o.dueOn).d;
  const step = stepMonths[o.recurrence];
  let i = 0;
  // Jump near `from` rather than walking every month since the anchor.
  if (o.dueOn < from) {
    const gap = daysBetween(o.dueOn, from);
    i = Math.max(0, Math.floor(gap / 31 / step) - 1);
  }
  for (; i < 2000; i++) {
    const due = addMonths(o.dueOn, i * step, anchorDay);
    if (due > to) break;
    if (o.endsOn && due > o.endsOn) break;
    if (due >= from) out.push(due);
  }
  return out;
};

export const SOON_DAYS = 14;

/**
 * Dated occurrences in a window, with their state. Overdue is anything past due
 * that nobody recorded as done or waived, back to `lookbackFrom`.
 */
export const occurrencesBetween = (
  org: Organisation,
  from: Day,
  to: Day,
  today: Day = localDay(),
): DatedOccurrence[] => {
  const records = new Map(org.occurrences.map((r) => [`${r.obligationId}|${r.dueOn}`, r]));
  const out: DatedOccurrence[] = [];
  for (const o of org.obligations) {
    if (o.archivedAt) continue;
    for (const due of dueDates(o, from, to)) {
      const record = records.get(`${o.id}|${due}`) ?? null;
      const state: OccurrenceState =
        record?.state === "done"
          ? "done"
          : record?.state === "waived"
            ? "waived"
            : due < today
              ? "overdue"
              : daysBetween(today, due) <= SOON_DAYS
                ? "due_soon"
                : "upcoming";
      out.push({ key: `${o.id}|${due}`, obligation: o, dueOn: due, record, state });
    }
  }
  return out.sort(
    (a, b) =>
      a.dueOn.localeCompare(b.dueOn) || a.obligation.title.localeCompare(b.obligation.title),
  );
};

/** How far back an unrecorded occurrence still counts as overdue. */
export const OVERDUE_LOOKBACK_DAYS = 400;

export const overdueOccurrences = (org: Organisation, today: Day = localDay()) =>
  occurrencesBetween(org, addDays(today, -OVERDUE_LOOKBACK_DAYS), addDays(today, -1), today).filter(
    (x) => x.state === "overdue",
  );

/* ---------------------------------------------------------------- licences */

export type LicenceState = "expired" | "renewal_due" | "live" | "no_expiry" | "lapsed_lodged";

export type LicenceStatus = {
  state: LicenceState;
  daysLeft: number | null;
  /** 0 when the renewal window has just opened, 1 on the expiry date. */
  windowUsed: number;
  label: string;
};

export const licenceStatus = (l: Licence, today: Day = localDay()): LicenceStatus => {
  if (!l.expiresOn)
    return { state: "no_expiry", daysLeft: null, windowUsed: 0, label: "No expiry" };
  const left = daysBetween(today, l.expiresOn);
  const lead = Math.max(1, l.renewalLeadDays);
  const windowUsed = left <= 0 ? 1 : left >= lead ? 0 : 1 - left / lead;
  if (left < 0)
    return {
      state: l.renewalState === "lodged" ? "lapsed_lodged" : "expired",
      daysLeft: left,
      windowUsed: 1,
      label: `Expired ${-left} day${left === -1 ? "" : "s"} ago`,
    };
  if (left <= l.renewalLeadDays)
    return {
      state: "renewal_due",
      daysLeft: left,
      windowUsed,
      label: `${left} day${left === 1 ? "" : "s"} left`,
    };
  return { state: "live", daysLeft: left, windowUsed, label: `Expires ${formatDay(l.expiresOn)}` };
};

/** Fields the licence's type expects that the record does not have. */
export const missingLicenceFields = (l: Licence, types: LicenceType[]): LicenceField[] => {
  const type = types.find((t) => t.key === l.typeKey);
  if (!type) return [];
  const value = (key: string): unknown =>
    key === "entity"
      ? l.entityId
      : key === "issued_on"
        ? l.issuedOn || l.issuedNote
        : key === "expires_on"
          ? l.expiresOn
          : key === "permitted"
            ? l.conditions
            : (l as unknown as Record<string, unknown>)[
                key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
              ];
  return type.fields.filter((f) => f.required && !value(f.key));
};

/** The date a renewal should start: expiry less the lead time. */
export const renewalStartsOn = (l: Licence): Day | null =>
  l.expiresOn ? addDays(l.expiresOn, -l.renewalLeadDays) : null;

/* ------------------------------------------------------- entity standing */

export type Standing = {
  tone: "good" | "warning" | "danger" | "neutral";
  label: string;
  reasons: string[];
};

/** Derived, never typed: an overdue filing or a lapsed licence says so here. */
export const entityStanding = (
  org: Organisation,
  entityId: string,
  today: Day = localDay(),
): Standing => {
  const entity = org.entities.find((e) => e.id === entityId);
  if (entity && entity.status !== "active")
    return { tone: "neutral", label: ENTITY_STATUS_LABEL[entity.status], reasons: [] };
  const overdue = overdueOccurrences(org, today).filter((x) => x.obligation.entityId === entityId);
  const licences = org.licences.filter((l) => l.entityId === entityId && !l.archivedAt);
  const expired = licences.filter((l) =>
    ["expired", "lapsed_lodged"].includes(licenceStatus(l, today).state),
  );
  const due = licences.filter((l) => licenceStatus(l, today).state === "renewal_due");
  const reasons = [
    ...overdue.map((x) => `${x.obligation.title} overdue since ${formatDay(x.dueOn)}`),
    ...expired.map((l) => `${l.name} expired ${formatDay(l.expiresOn)}`),
    ...due.map((l) => `${l.name} expires ${formatDay(l.expiresOn)}`),
  ];
  if (overdue.length)
    return {
      tone: "danger",
      label: overdue.length === 1 ? "Filing overdue" : `${overdue.length} filings overdue`,
      reasons,
    };
  if (expired.length) return { tone: "danger", label: "Licence expired", reasons };
  if (due.length) return { tone: "warning", label: "Licence due", reasons };
  return { tone: "good", label: "In good standing", reasons };
};

/* --------------------------------------------------------------- authority */

export type AuthorityQuestion = {
  matterType: string;
  amount: number | null;
  currency?: string;
  entityId: string | null;
  on?: Day;
};

export const ruleInForce = (org: Organisation, rule: AuthorityRule, on: Day) => {
  if (rule.effectiveFrom && rule.effectiveFrom > on) return false;
  if (rule.effectiveTo && rule.effectiveTo <= on) return false;
  const inst = org.instruments.find((i) => i.id === rule.instrumentId);
  if (inst?.supersededOn && inst.supersededOn <= on) return false;
  return true;
};

export const bandLabel = (r: Pick<AuthorityRule, "minAmount" | "maxAmount" | "currency">) => {
  const money = (n: number) =>
    `${r.currency ? `${r.currency} ` : ""}${n >= 1_000_000 ? `${n / 1_000_000}m` : n >= 1000 ? `${n / 1000}k` : n}`;
  if (r.minAmount === null && r.maxAmount === null) return "Any";
  if (r.minAmount === null) return `≤ ${money(r.maxAmount!)}`;
  if (r.maxAmount === null) return `> ${money(r.minAmount)}`;
  return `${money(r.minAmount)} – ${money(r.maxAmount)}`;
};

/**
 * The rule that answers "who approves and signs this?", most specific first:
 * an entity-specific rule beats a group-wide one, and a bounded band beats an
 * open one. Ties go to the lower position in the matrix.
 */
export const matchRule = (org: Organisation, q: AuthorityQuestion): AuthorityRule | null => {
  const on = q.on ?? localDay();
  const type = q.matterType.trim().toLowerCase();
  const candidates = org.rules.filter((r) => {
    if (r.matterType.trim().toLowerCase() !== type) return false;
    if (!ruleInForce(org, r, on)) return false;
    if (r.entityId && r.entityId !== q.entityId) return false;
    if (q.amount !== null) {
      if (r.minAmount !== null && !(q.amount > r.minAmount)) return false;
      if (r.maxAmount !== null && !(q.amount <= r.maxAmount)) return false;
    } else if (r.minAmount !== null || r.maxAmount !== null) {
      return false;
    }
    return true;
  });
  const specificity = (r: AuthorityRule) =>
    (r.entityId ? 4 : 0) +
    (r.minAmount !== null ? 1 : 0) +
    (r.maxAmount !== null ? 1 : 0) +
    (r.basis === "recorded" ? 0.5 : 0);
  return (
    [...candidates].sort((a, b) => specificity(b) - specificity(a) || a.position - b.position)[0] ??
    null
  );
};

export type ResolvedParty = {
  party: AuthorityParty;
  /** "Country Manager", "1 director", "Board resolution". */
  label: string;
  /** Names who can act today; empty when vacant or unrecorded. */
  people: string[];
  gap: string | null;
};

export const resolveParty = (
  org: Organisation,
  party: AuthorityParty,
  entityId: string | null,
  on: Day = localDay(),
): ResolvedParty => {
  if (party.body) return { party, label: BODY_LABEL[party.body], people: [], gap: null };
  if (party.roleId) {
    const role = org.roles.find((r) => r.id === party.roleId);
    const holder = personName(org, role?.holderPersonId);
    return {
      party,
      label: role?.title ?? "Role removed",
      people: holder ? [holder] : [],
      gap: role
        ? holder
          ? null
          : `${role.title} is vacant`
        : "The role this rule named no longer exists",
    };
  }
  const capacity = party.capacity!;
  const noun =
    capacity === "director"
      ? "director"
      : capacity === "secretary"
        ? "company secretary"
        : "authorised signatory";
  const nouns = (n: number) =>
    n === 1 ? noun : noun === "authorised signatory" ? "authorised signatories" : `${noun}s`;
  const label = `${party.count} ${nouns(party.count)}`;
  if (!entityId)
    return { party, label, people: [], gap: "Choose the contracting entity to name them" };
  const people = officersOf(org, entityId, on)
    .filter(
      (a) =>
        a.capacity === capacity || (capacity === "director" && a.capacity === "managing_director"),
    )
    .map((a) => personName(org, a.personId))
    .filter(Boolean);
  return {
    party,
    label,
    people,
    gap:
      people.length < party.count
        ? `${people.length} of ${party.count} ${nouns(party.count)} recorded for this entity`
        : null,
  };
};

export const partiesFor = (org: Organisation, ruleId: string, step: AuthorityStep) =>
  org.parties
    .filter((p) => p.ruleId === ruleId && p.step === step)
    .sort((a, b) => a.position - b.position);

/* ------------------------------------------------------------ responsibility */

/** A person's organisational context: never a floating card. */
export const personContext = (org: Organisation, personId: string, on: Day = localDay()) => {
  const roles = currentRoles(org, on).filter((r) => r.holderPersonId === personId);
  const roleIds = new Set(roles.map((r) => r.id));
  return {
    roles,
    appointments: org.appointments.filter((a) => a.personId === personId),
    responsibilities: org.responsibilities.filter((x) => roleIds.has(x.roleId)),
    deputising: org.responsibilities.filter((x) => x.deputyRoleId && roleIds.has(x.deputyRoleId)),
    authority: org.parties.filter((p) => p.roleId && roleIds.has(p.roleId)),
    licences: org.licences.filter(
      (l) =>
        !l.archivedAt &&
        (l.ownerPersonId === personId || (l.ownerRoleId && roleIds.has(l.ownerRoleId))),
    ),
    covers: org.roles.filter((r) => r.coverRoleId && roleIds.has(r.coverRoleId)),
    holdings: org.holdings.filter((h) => h.ownerPersonId === personId),
  };
};

/* ---------------------------------------------------------------- overview */

export type Attention = {
  key: string;
  tone: "danger" | "warning";
  title: string;
  detail: string;
  area: OrgArea;
};

export const attentionItems = (org: Organisation, today: Day = localDay()): Attention[] => {
  const entities = byId(org.entities);
  const items: Attention[] = [];
  for (const x of overdueOccurrences(org, today))
    items.push({
      key: `occ-${x.key}`,
      tone: "danger",
      title: `${x.obligation.title}${x.obligation.entityId ? ` — ${entityLabel(entities.get(x.obligation.entityId))}` : ""}`,
      detail: `${-daysBetween(today, x.dueOn)} days overdue${x.obligation.penaltyNote ? ` · ${x.obligation.penaltyNote}` : ""}`,
      area: "calendar",
    });
  for (const l of org.licences.filter((x) => !x.archivedAt)) {
    const s = licenceStatus(l, today);
    if (s.state === "expired" || s.state === "lapsed_lodged" || s.state === "renewal_due")
      items.push({
        key: `lic-${l.id}`,
        tone: s.state === "renewal_due" ? "warning" : "danger",
        title: `${l.name}${l.entityId ? ` — ${entityLabel(entities.get(l.entityId))}` : ""}`,
        detail:
          s.state === "lapsed_lodged"
            ? `${s.label} · renewal lodged${l.renewalLodgedOn ? ` ${formatDay(l.renewalLodgedOn)}` : ""}, not yet issued`
            : s.label,
        area: "licences",
      });
  }
  return items;
};

/* ------------------------------------------------------------- navigation */

export type OrgArea =
  | "organogram"
  | "structure"
  | "people"
  | "authority"
  | "entities"
  | "licences"
  | "calendar"
  | "documents"
  | "processes"
  | "ask";

export const ORG_AREAS: { id: OrgArea; label: string }[] = [
  { id: "organogram", label: "Organogram" },
  { id: "structure", label: "Group structure" },
  { id: "people", label: "People & responsibilities" },
  { id: "authority", label: "Authority & approvals" },
  { id: "entities", label: "Entities" },
  { id: "licences", label: "Licences & registrations" },
  { id: "calendar", label: "Compliance calendar" },
  { id: "documents", label: "Key documents" },
  { id: "processes", label: "Processes" },
  { id: "ask", label: "Ask about the organisation" },
];

export const isOrgArea = (v: unknown): v is OrgArea => ORG_AREAS.some((a) => a.id === v);
