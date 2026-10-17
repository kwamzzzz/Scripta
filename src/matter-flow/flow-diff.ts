/**
 * What changed in a flow, so only that is written.
 *
 * Every action in the flow store takes the whole record and returns a new
 * whole record. That is a good shape to reason about and a terrible shape to
 * send to a database, so the two are kept apart: the store keeps working on
 * whole records, and this works out what actually moved between one and the
 * next. Ticking a box writes one row, not the matter.
 *
 * Pure, so it can be tested without a database.
 */
import type {
  Deliverable,
  EmailDraft,
  Evidence,
  MatterFlowRecord,
  Phase,
  ThreadEntry,
  Version,
} from "./model";

export type Change<T> = {
  inserted: T[];
  updated: T[];
  deletedIds: string[];
};

/** An email belongs to its deliverable; everything else is keyed by its own id. */
const identity = (row: unknown) => (row as { id: string }).id;
const byDeliverable = (row: EmailDraft) => row.deliverableId;

export const isEmptyChange = <T>(c: Change<T>) =>
  !c.inserted.length && !c.updated.length && !c.deletedIds.length;

/**
 * Rows in, rows out, by id.
 *
 * Comparison is by serialised value: a flow record is plain data, the store
 * rebuilds objects on every action, and reference equality would call every
 * untouched row an update.
 */
export function changes<T>(prev: T[], next: T[], key: (row: T) => string = identity): Change<T> {
  const before = new Map(prev.map((row) => [key(row), row]));
  const inserted: T[] = [];
  const updated: T[] = [];
  for (const row of next) {
    const k = key(row);
    const was = before.get(k);
    if (!was) inserted.push(row);
    else if (JSON.stringify(was) !== JSON.stringify(row)) updated.push(row);
    before.delete(k);
  }
  return { inserted, updated, deletedIds: [...before.keys()] };
}

/**
 * Deliverables are ordered by where they sit in the list; they carry no order
 * field of their own. So a row that only moved is still a row to write, or
 * dragging one into place would change the screen and nothing else: the next
 * load would put it back.
 */
function withMoves(prev: Deliverable[], next: Deliverable[]): Change<Deliverable> {
  const change = changes(prev, next);
  const was = new Map(prev.map((row, i) => [row.id, i]));
  const written = new Set([...change.inserted, ...change.updated].map((row) => row.id));
  next.forEach((row, i) => {
    const before = was.get(row.id);
    if (before !== undefined && before !== i && !written.has(row.id)) change.updated.push(row);
  });
  return change;
}

/** The flow's own fields, which live on one row and are written whole. */
export type FlowHead = Pick<
  MatterFlowRecord,
  "kind" | "startedAt" | "phasesTitle" | "parties" | "contacts"
>;

const head = (r: MatterFlowRecord): FlowHead => ({
  kind: r.kind,
  startedAt: r.startedAt,
  phasesTitle: r.phasesTitle ?? "",
  parties: r.parties,
  contacts: r.contacts,
});

export type FlowWrite = {
  head: FlowHead | null;
  phases: Change<Phase>;
  deliverables: Change<Deliverable>;
  versions: Change<Version>;
  evidence: Change<Evidence>;
  threads: Change<ThreadEntry>;
  emails: Change<EmailDraft>;
};

export const isEmptyWrite = (w: FlowWrite) =>
  !w.head &&
  isEmptyChange(w.phases) &&
  isEmptyChange(w.deliverables) &&
  isEmptyChange(w.versions) &&
  isEmptyChange(w.evidence) &&
  isEmptyChange(w.threads) &&
  isEmptyChange(w.emails);

/**
 * A record's worth of difference.
 *
 * Deletes are reported for every collection even though the database cascades
 * them, because a caller writing in order needs to know a phase's deliverables
 * went with it rather than discovering it from a foreign key.
 */
export function flowDiff(prev: MatterFlowRecord | null, next: MatterFlowRecord): FlowWrite {
  const nothing = { inserted: [], updated: [], deletedIds: [] };
  if (!prev)
    return {
      head: head(next),
      phases: { ...nothing, inserted: next.phases },
      deliverables: { ...nothing, inserted: next.deliverables },
      versions: { ...nothing, inserted: next.versions },
      evidence: { ...nothing, inserted: next.evidence },
      threads: { ...nothing, inserted: next.threads ?? [] },
      emails: { ...nothing, inserted: next.emails ?? [] },
    };
  return {
    head: JSON.stringify(head(prev)) === JSON.stringify(head(next)) ? null : head(next),
    phases: changes(prev.phases, next.phases),
    deliverables: withMoves(prev.deliverables, next.deliverables),
    versions: changes(prev.versions, next.versions),
    evidence: changes(prev.evidence, next.evidence),
    threads: changes(prev.threads ?? [], next.threads ?? []),
    emails: changes(prev.emails ?? [], next.emails ?? [], byDeliverable),
  };
}
