/**
 * Pure reading of the registers: what an entity still needs, how a register
 * exports, how read-from-a-document facts are merged. Kept apart from the
 * screens so the rules can be tested without rendering anything.
 */
import {
  addDays,
  byId,
  currentAppointments,
  daysBetween,
  entityLabel,
  entityStanding,
  formatDay,
  holderLabel,
  licenceStatus,
  localDay,
  occurrencesBetween,
  overdueOccurrences,
  percentLabel,
  shareholdersOf,
  type Day,
  type DatedOccurrence,
  type Entity,
  type FieldSource,
  type FieldSources,
  type Licence,
  type Organisation,
} from "../model";

/* ---------------------------------------------------------------- entities */

/** "Nexis GH 100%", "UBO 100%", "Nexis LLC 51% · minority partner 49%". */
export const heldBySummary = (org: Organisation, entityId: string, on: Day = localDay()) =>
  shareholdersOf(org, entityId, on)
    .map((h) => `${holderLabel(org, h)} ${percentLabel(h.percent)}`.trim())
    .join(" · ");

export const directorCount = (org: Organisation, entityId: string, on: Day = localDay()) =>
  currentAppointments(org, on).filter(
    (a) =>
      a.entityId === entityId && (a.capacity === "director" || a.capacity === "managing_director"),
  ).length;

export type EntityNeed = {
  key: string;
  tone: "danger" | "warning" | "neutral";
  title: string;
  detail: string;
  action:
    | { kind: "occurrence"; occurrence: DatedOccurrence }
    | { kind: "licence"; licence: Licence }
    | { kind: "edit" }
    | { kind: "officer" }
    | { kind: "document"; category: "constitution" };
};

const UPCOMING_DAYS = 45;

/**
 * What an entity still needs, in the order a company secretary would deal with
 * it: what is late, what is about to be, then gaps in the record itself.
 */
export function entityNeeds(
  org: Organisation,
  entityId: string,
  today: Day = localDay(),
): EntityNeed[] {
  const entity = org.entities.find((e) => e.id === entityId);
  if (!entity) return [];
  const needs: EntityNeed[] = [];
  const owners = byId(org.roles);

  for (const x of overdueOccurrences(org, today).filter((o) => o.obligation.entityId === entityId))
    needs.push({
      key: `over-${x.key}`,
      tone: "danger",
      title: x.obligation.title,
      detail: [
        `Was due ${formatDay(x.dueOn)}`,
        x.obligation.penaltyNote,
        x.obligation.ownerRoleId
          ? `owner: ${owners.get(x.obligation.ownerRoleId)?.title ?? ""}`
          : "",
      ]
        .filter(Boolean)
        .join(" · "),
      action: { kind: "occurrence", occurrence: x },
    });

  for (const x of occurrencesBetween(org, today, addDays(today, UPCOMING_DAYS), today).filter(
    (o) => o.obligation.entityId === entityId && (o.state === "due_soon" || o.state === "upcoming"),
  ))
    needs.push({
      key: `soon-${x.key}`,
      tone: x.state === "due_soon" ? "warning" : "neutral",
      title: x.obligation.title,
      detail: `Due ${formatDay(x.dueOn)} · in ${daysBetween(today, x.dueOn)} days`,
      action: { kind: "occurrence", occurrence: x },
    });

  for (const l of org.licences.filter((x) => x.entityId === entityId && !x.archivedAt)) {
    const s = licenceStatus(l, today);
    if (s.state === "expired" || s.state === "lapsed_lodged" || s.state === "renewal_due")
      needs.push({
        key: `lic-${l.id}`,
        tone: s.state === "renewal_due" ? "warning" : "danger",
        title: l.name,
        detail:
          s.state === "lapsed_lodged" ? `${s.label} · renewal lodged, not yet issued` : s.label,
        action: { kind: "licence", licence: l },
      });
  }

  const missing = [
    !entity.registrationNo && "registration number",
    !entity.incorporatedOn && "incorporation date",
    !entity.registeredOffice && "registered office",
  ].filter(Boolean) as string[];
  if (missing.length)
    needs.push({
      key: "facts",
      tone: "neutral",
      title: "Record incomplete",
      detail: `No ${missing.join(", ")} recorded.`,
      action: { kind: "edit" },
    });

  if (!directorCount(org, entityId, today))
    needs.push({
      key: "directors",
      tone: "warning",
      title: "No current directors recorded",
      detail: "Record the board so signing questions can be answered for this entity.",
      action: { kind: "officer" },
    });

  if (!hasDocumentOfCategory(org, entityId, "constitution"))
    needs.push({
      key: "constitution",
      tone: "neutral",
      title: "No constitution on file",
      detail: "Add the constitution or articles and link them to this entity.",
      action: { kind: "document", category: "constitution" },
    });

  return needs;
}

export const hasDocumentOfCategory = (org: Organisation, entityId: string, category: string) => {
  const docs = byId(org.documents);
  return org.recordDocuments.some(
    (l) =>
      l.recordType === "entity" &&
      l.recordId === entityId &&
      docs.get(l.documentId)?.category === category,
  );
};

/* ------------------------------------------------------------ CSV export */

const cell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export const toCsv = (rows: string[][]) =>
  rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";

/** The entity register as a spreadsheet: one row per company, standing derived. */
export function registerCsv(
  org: Organisation,
  entities: Entity[],
  today: Day = localDay(),
): string {
  const header = [
    "Entity",
    "Jurisdiction",
    "Registration no.",
    "Tax no.",
    "Incorporated",
    "Type",
    "Registered office",
    "Directors",
    "Held by",
    "Status",
  ];
  return toCsv([
    header,
    ...entities.map((e) => [
      e.name,
      e.jurisdiction,
      e.registrationNo,
      e.taxNo,
      e.incorporatedOn ?? "",
      e.entityType,
      e.registeredOffice,
      String(directorCount(org, e.id, today)),
      heldBySummary(org, e.id, today),
      entityStanding(org, e.id, today).label,
    ]),
  ]);
}

/* ------------------------------------------------ facts read from documents */

export type Proposal = {
  key: string;
  value: string;
  confidence: number | null;
  page: number | null;
};

export const CHECK_BELOW = 0.75;

export const proposalBadge = (p: Proposal): "Read" | "Check" =>
  p.confidence !== null && p.confidence >= CHECK_BELOW ? "Read" : "Check";

const same = (a: string, b: string) =>
  a.trim().toLowerCase().replace(/\s+/g, " ") === b.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Accept a value read from a document.
 *
 * A fact nobody has recorded, or one recorded by hand, takes the read value. A
 * fact that already came from a DIFFERENT document and disagrees is not
 * overwritten: the existing value stands and the disagreement is kept as a
 * conflict, so a lawyer sees that two filings say different things.
 */
export function acceptProposal(
  current: string,
  sources: FieldSources,
  proposal: Proposal,
  documentId: string,
): { value: string; sources: FieldSources; conflict: boolean } {
  const existing: FieldSource | undefined = sources[proposal.key];
  const fresh: FieldSource = {
    value: proposal.value,
    documentId,
    page: proposal.page,
    confidence: proposal.confidence,
  };
  if (
    existing?.documentId &&
    existing.documentId !== documentId &&
    current &&
    !same(current, proposal.value)
  ) {
    const conflicts = [
      ...(existing.conflicts ?? []).filter((c) => c.documentId !== documentId),
      { value: proposal.value, documentId, page: proposal.page },
    ];
    return {
      value: current,
      sources: { ...sources, [proposal.key]: { ...existing, conflicts } },
      conflict: true,
    };
  }
  return {
    value: proposal.value,
    sources: {
      ...sources,
      [proposal.key]: existing?.conflicts ? { ...fresh, conflicts: existing.conflicts } : fresh,
    },
    conflict: false,
  };
}

/** Match a name read from a document to one of the organisation's entities. */
export function matchEntity(org: Organisation, name: string): Entity | null {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/\b(limited|ltd|llc|plc|fzco|fze|inc|company|co)\b\.?/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const target = norm(name);
  if (!target) return null;
  const live = org.entities.filter((e) => !e.archivedAt);
  return (
    live.find((e) => norm(e.name) === target) ??
    live.find((e) => e.shortName && norm(e.shortName) === target) ??
    live.find((e) => norm(e.name).includes(target) || target.includes(norm(e.name))) ??
    null
  );
}

/* ---------------------------------------------------------------- licences */

export function licenceSummary(org: Organisation, licences: Licence[], today: Day = localDay()) {
  let live = 0;
  let expired = 0;
  let dueSoon = 0;
  for (const l of licences) {
    const s = licenceStatus(l, today);
    if (s.state === "expired" || s.state === "lapsed_lodged") expired += 1;
    else live += 1;
    if (s.daysLeft !== null && s.daysLeft >= 0 && s.daysLeft <= 60) dueSoon += 1;
  }
  return { live, expired, dueSoon };
}

export type CalendarEntry =
  | { kind: "occurrence"; key: string; day: Day; occurrence: DatedOccurrence }
  | { kind: "expiry"; key: string; day: Day; licence: Licence };

/** Occurrences and licence expiries, by month, in a window. */
export function calendarMonths(
  org: Organisation,
  from: Day,
  months: number,
  filter: (entityId: string | null) => boolean = () => true,
  today: Day = localDay(),
) {
  const start = `${from.slice(0, 7)}-01`;
  const out: { month: Day; entries: CalendarEntry[] }[] = [];
  for (let i = 0; i < months; i++) {
    const [y, m] = start.split("-").map(Number) as [number, number];
    const idx = y * 12 + (m - 1) + i;
    const month = `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}-01`;
    const last = addDays(
      `${Math.floor((idx + 1) / 12)}-${String(((idx + 1) % 12) + 1).padStart(2, "0")}-01`,
      -1,
    );
    const entries: CalendarEntry[] = [
      ...occurrencesBetween(org, month, last, today)
        .filter((o) => filter(o.obligation.entityId))
        .map((o) => ({ kind: "occurrence" as const, key: o.key, day: o.dueOn, occurrence: o })),
      ...org.licences
        .filter(
          (l) =>
            !l.archivedAt &&
            l.expiresOn &&
            l.expiresOn >= month &&
            l.expiresOn <= last &&
            filter(l.entityId),
        )
        .map((l) => ({
          kind: "expiry" as const,
          key: `exp-${l.id}`,
          day: l.expiresOn!,
          licence: l,
        })),
    ].sort((a, b) => a.day.localeCompare(b.day));
    out.push({ month, entries });
  }
  return out;
}

export const entityName = (org: Organisation, id: string | null) =>
  id ? entityLabel(org.entities.find((e) => e.id === id)) : "";
