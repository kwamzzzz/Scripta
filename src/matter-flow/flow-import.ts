/**
 * Bringing a browser's flow up to the database.
 *
 * Flow used to live in localStorage, so the ids it generated were readable
 * strings like `del_l2k3abc`. The tables key on uuids, because a deliverable
 * is now something a task can point at. A record carried up from a browser
 * therefore needs new ids, and every reference between its rows needs to
 * follow — otherwise a phase arrives with no deliverables under it.
 */
import { uid, type MatterFlowRecord } from "./model";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when every id in the record is already something the tables accept. */
export function hasDatabaseIds(record: MatterFlowRecord): boolean {
  const ids = [
    ...record.phases.map((p) => p.id),
    ...record.deliverables.map((d) => d.id),
    ...record.versions.map((v) => v.id),
    ...record.evidence.map((e) => e.id),
    ...(record.threads ?? []).map((t) => t.id),
  ];
  return ids.every((id) => UUID.test(id));
}

/** The same flow, with ids the database will take and every link still intact. */
export function withDatabaseIds(record: MatterFlowRecord): MatterFlowRecord {
  const fresh = new Map<string, string>();
  const map = (id: string) => {
    if (UUID.test(id)) return id;
    const known = fresh.get(id);
    if (known) return known;
    const next = uid("row");
    fresh.set(id, next);
    return next;
  };

  return {
    ...record,
    phases: record.phases.map((p) => ({ ...p, id: map(p.id) })),
    deliverables: record.deliverables.map((d) => ({
      ...d,
      id: map(d.id),
      phaseId: map(d.phaseId),
      ...(d.dependsOn ? { dependsOn: d.dependsOn.map(map) } : {}),
    })),
    versions: record.versions.map((v) => ({
      ...v,
      id: map(v.id),
      deliverableId: map(v.deliverableId),
    })),
    evidence: record.evidence.map((e) => ({
      ...e,
      id: map(e.id),
      deliverableId: map(e.deliverableId),
    })),
    threads: (record.threads ?? []).map((t) => ({
      ...t,
      id: map(t.id),
      deliverableId: map(t.deliverableId),
    })),
    emails: (record.emails ?? []).map((e) => ({ ...e, deliverableId: map(e.deliverableId) })),
  };
}
