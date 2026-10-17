/**
 * What the document screens need to say about records: what a cited record is
 * called and where it lives, and which entities have no constitution or
 * certificate on file. Pure, so the shelf and the overview say the same thing.
 */
import {
  documentsFor,
  entityLabel,
  liveEntities,
  type OrgArea,
  type Organisation,
  type RecordType,
} from "../model";

/** What a record is called and where it lives, for chips and links. */
export function recordLabel(
  org: Organisation,
  recordType: RecordType,
  recordId: string,
): { label: string; area: OrgArea } | null {
  switch (recordType) {
    case "entity": {
      const e = org.entities.find((x) => x.id === recordId);
      return e ? { label: entityLabel(e), area: "entities" } : null;
    }
    case "licence": {
      const l = org.licences.find((x) => x.id === recordId);
      return l ? { label: l.name, area: "licences" } : null;
    }
    case "instrument": {
      const i = org.instruments.find((x) => x.id === recordId);
      return i ? { label: i.title, area: "authority" } : null;
    }
    case "process": {
      const p = org.processes.find((x) => x.id === recordId);
      return p ? { label: p.name, area: "processes" } : null;
    }
    case "obligation": {
      const o = org.obligations.find((x) => x.id === recordId);
      return o ? { label: o.title, area: "calendar" } : null;
    }
    case "person": {
      const p = org.people.find((x) => x.id === recordId);
      return p ? { label: p.fullName, area: "people" } : null;
    }
    case "holding": {
      const h = org.holdings.find((x) => x.id === recordId);
      const sub = h ? org.entities.find((e) => e.id === h.subsidiaryEntityId) : undefined;
      return h
        ? { label: `Holding in ${entityLabel(sub) || "an entity"}`, area: "structure" }
        : null;
    }
    case "appointment": {
      const a = org.appointments.find((x) => x.id === recordId);
      const person = a ? org.people.find((p) => p.id === a.personId) : undefined;
      return a
        ? { label: `Appointment of ${person?.fullName ?? "a person"}`, area: "entities" }
        : null;
    }
  }
}

/**
 * Entities with no constitution or certificate on file. "On file" means a
 * document in that category linked to the entity: a constitution sitting on
 * the shelf unlinked cannot tell anyone which company it constitutes.
 */
export function documentGaps(org: Organisation) {
  const gaps: {
    key: string;
    entityId: string;
    category: "constitution" | "certificate";
    text: string;
  }[] = [];
  for (const e of liveEntities(org)) {
    const held = documentsFor(org, "entity", e.id)
      .map((d) => d.document?.category)
      .filter(Boolean);
    if (!held.includes("constitution"))
      gaps.push({
        key: `const-${e.id}`,
        entityId: e.id,
        category: "constitution",
        text: `No constitution on file for ${entityLabel(e)}.`,
      });
    if (!held.includes("certificate"))
      gaps.push({
        key: `cert-${e.id}`,
        entityId: e.id,
        category: "certificate",
        text: `No certificate of incorporation on file for ${entityLabel(e)}.`,
      });
  }
  return gaps;
}
