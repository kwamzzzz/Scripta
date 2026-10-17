/**
 * Flow presets — the reusable half of a matter's Flow.
 *
 * A preset is a mandate's structure with the facts taken out: phases and the
 * deliverables each owes, but no versions, no evidence, no ticks and no fixed
 * dates. Dates are held as working-day offsets from the matter start, so the
 * same preset lays out correctly whenever it is applied.
 *
 * Presets are grouped into families. A family is the kind of work ("Gold
 * Transaction Safeguard"); a variant is how that work is actually structured
 * this time ("Spot sale, refining in country"), because no two transactions of
 * a type run the same way.
 */
import {
  isoDate,
  toDate,
  uid,
  workingDaysBetween,
  type Deliverable,
  type DeliverableKind,
  type DocumentType,
  type ActionType,
  type MatterFlowRecord,
  type Party,
  type Phase,
} from "../model";

export type PresetPhase = {
  id: string;
  name: string;
  description: string;
  steps: string[];
  /** Why this phase is here and what to watch out for. */
  note: string;
  /** Working days from the matter start to this phase's deadline. */
  dueOffset: number;
  order: number;
};

export type PresetDeliverable = {
  id: string;
  phaseId: string;
  kind: DeliverableKind;
  name: string;
  type: DocumentType | ActionType;
  description: string;
  note: string;
  /** The role that owes it ("Lead", "Associate", "Client"), never a person. */
  ownerRole: string;
  startOffset: number;
  dueOffset: number;
  mandatory: boolean;
  /** Named uploads this deliverable expects: annexes, certificates, proofs. */
  expected: string[];
};

/** The cast a matter of this kind needs, with the names left blank. */
export type PresetParty = { role: string; note: string };

export type PresetBody = {
  version: 1;
  kind: DeliverableKind;
  phases: PresetPhase[];
  deliverables: PresetDeliverable[];
  parties: PresetParty[];
};

export const emptyPresetBody = (kind: DeliverableKind = "document"): PresetBody => ({
  version: 1,
  kind,
  phases: [],
  deliverables: [],
  parties: [],
});

/* ----------------------------------------------------------------- dates */

/**
 * The inverse of `workingDaysBetween`: the date `days` working days after
 * `fromIso`, counting Mon–Fri after the start day. A zero or negative offset
 * is the start day itself.
 */
export function addWorkingDays(fromIso: string, days: number): string {
  const cursor = toDate(fromIso);
  let remaining = Math.max(0, Math.round(days));
  while (remaining > 0) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) remaining--;
  }
  return isoDate(cursor);
}

const offsetFrom = (startIso: string, iso: string) =>
  Math.max(0, workingDaysBetween(startIso, iso));

/* --------------------------------------------------------------- capture */

/**
 * A live flow becomes a preset: structure kept, work discarded. Owners arrive
 * as whatever the matter recorded (often initials) — the editor is where they
 * are turned into roles.
 */
export function presetBodyFromFlow(record: MatterFlowRecord): PresetBody {
  const start = record.startedAt;
  const phases = [...record.phases]
    .sort((a, b) => a.order - b.order)
    .map((p, index) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      steps: [...p.steps],
      note: p.note ?? "",
      dueOffset: offsetFrom(start, p.deadline),
      order: index,
    }));
  const known = new Set(phases.map((p) => p.id));
  return {
    version: 1,
    kind: record.kind,
    phases,
    deliverables: record.deliverables
      .filter((d) => known.has(d.phaseId))
      .map((d) => ({
        id: d.id,
        phaseId: d.phaseId,
        kind: d.kind,
        name: d.name,
        type: d.type,
        description: d.description,
        note: d.note ?? "",
        ownerRole: d.owner === "—" ? "" : d.owner,
        startOffset: offsetFrom(start, d.start),
        dueOffset: offsetFrom(start, d.deadline),
        mandatory: d.mandatory,
        expected: [...(d.expected ?? [])],
      })),
    parties: record.parties.map((p) => ({ role: p.role, note: p.name })),
  };
}

/* ----------------------------------------------------------------- apply */

export type ApplyOptions = {
  /** Day zero for every offset. */
  start: string;
  /** Bring the preset's party roles in as unnamed slots. Default true. */
  withParties?: boolean;
};

/**
 * Lay a preset onto a matter's flow. Phases are appended after whatever is
 * already there — applying a preset never disturbs work already done. Ids are
 * minted fresh so the same preset can be applied twice (a second tranche, a
 * second parcel) without collision.
 */
export function applyPresetBody(
  record: MatterFlowRecord,
  body: PresetBody,
  { start, withParties = true }: ApplyOptions,
): MatterFlowRecord {
  const baseOrder = Math.max(0, ...record.phases.map((p) => p.order), 0);
  const phaseIds = new Map<string, string>();
  const ordered = [...body.phases].sort((a, b) => a.order - b.order);

  const phases: Phase[] = ordered.map((p, index) => {
    const id = uid("ph");
    phaseIds.set(p.id, id);
    return {
      id,
      matterId: record.matterId,
      name: p.name,
      description: p.description,
      steps: [...p.steps],
      deadline: addWorkingDays(start, p.dueOffset),
      order: baseOrder + index + 1,
      ...(p.note ? { note: p.note } : {}),
    };
  });

  const deliverables: Deliverable[] = body.deliverables.flatMap((d) => {
    const phaseId = phaseIds.get(d.phaseId);
    if (!phaseId) return [];
    const startIso = addWorkingDays(start, d.startOffset);
    const deadline = addWorkingDays(start, Math.max(d.startOffset, d.dueOffset));
    return [
      {
        id: uid("del"),
        phaseId,
        kind: d.kind,
        name: d.name,
        type: d.type,
        description: d.description,
        owner: d.ownerRole.trim() || "—",
        start: startIso,
        deadline,
        mandatory: d.mandatory,
        ticked: false,
        ...(d.expected.length ? { expected: [...d.expected] } : {}),
        ...(d.note ? { note: d.note } : {}),
      },
    ];
  });

  const roles = new Set(record.parties.map((p) => p.role.toLowerCase()));
  const parties: Party[] = withParties
    ? [
        ...record.parties,
        ...body.parties
          .filter((p) => p.role.trim() && !roles.has(p.role.trim().toLowerCase()))
          .map((p) => ({ name: "", role: p.role.trim() })),
      ]
    : record.parties;

  return {
    ...record,
    kind: record.phases.length === 0 ? body.kind : record.kind,
    phases: [...record.phases, ...phases],
    deliverables: [...record.deliverables, ...deliverables],
    parties,
  };
}

/* ----------------------------------------------------------------- parse */

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const num = (v: unknown, fallback = 0) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && s.trim() !== "") : [];

/** jsonb from the database is untyped; read it defensively. */
export function parsePresetBody(raw: unknown): PresetBody {
  const source = (raw ?? {}) as Record<string, unknown>;
  const kind: DeliverableKind = source["kind"] === "action" ? "action" : "document";
  const phases: PresetPhase[] = (Array.isArray(source["phases"]) ? source["phases"] : []).map(
    (value, index) => {
      const p = (value ?? {}) as Record<string, unknown>;
      return {
        id: str(p["id"]) || uid("pp"),
        name: str(p["name"]),
        description: str(p["description"]),
        steps: strings(p["steps"]),
        note: str(p["note"]),
        dueOffset: Math.max(0, num(p["dueOffset"])),
        order: num(p["order"], index),
      };
    },
  );
  const known = new Set(phases.map((p) => p.id));
  const deliverables: PresetDeliverable[] = (
    Array.isArray(source["deliverables"]) ? source["deliverables"] : []
  )
    .map((value) => {
      const d = (value ?? {}) as Record<string, unknown>;
      const dKind: DeliverableKind = d["kind"] === "action" ? "action" : "document";
      return {
        id: str(d["id"]) || uid("pd"),
        phaseId: str(d["phaseId"]),
        kind: dKind,
        name: str(d["name"]),
        type: (str(d["type"]) || (dKind === "document" ? "memo" : "email")) as
          | DocumentType
          | ActionType,
        description: str(d["description"]),
        note: str(d["note"]),
        ownerRole: str(d["ownerRole"]),
        startOffset: Math.max(0, num(d["startOffset"])),
        dueOffset: Math.max(0, num(d["dueOffset"])),
        mandatory: d["mandatory"] !== false,
        expected: strings(d["expected"]),
      };
    })
    .filter((d) => known.has(d.phaseId));
  const parties: PresetParty[] = (Array.isArray(source["parties"]) ? source["parties"] : []).map(
    (value) => {
      const p = (value ?? {}) as Record<string, unknown>;
      return { role: str(p["role"]), note: str(p["note"]) };
    },
  );
  return { version: 1, kind, phases, deliverables, parties };
}

/** What the library shows about a variant without opening it. */
export function presetShape(body: PresetBody) {
  const documents = body.deliverables.filter((d) => d.kind === "document").length;
  const actions = body.deliverables.length - documents;
  const uploads = body.deliverables.reduce((n, d) => n + d.expected.length, 0);
  const span = body.phases.reduce((n, p) => Math.max(n, p.dueOffset), 0);
  return { phases: body.phases.length, documents, actions, uploads, span };
}
