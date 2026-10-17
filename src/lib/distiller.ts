/**
 * Transcript Distiller 2.0: the shared model and the pure rules.
 *
 * The rule everything here serves: first reconstruct what was said and what
 * the conversation established; then decide whether who said it matters; if
 * it does, attribute conservatively; if attribution is uncertain, keep the
 * uncertainty rather than contaminating the substance.
 *
 * Three things are kept apart throughout, because a recorder conflates them:
 *   a bubble      what the recorder emitted: a fragment with a label and a time
 *   a unit        one coherent contribution, rebuilt from one or more bubbles
 *   an item       something the lawyer needs: a decision, a commitment, a risk…
 * And for each item, four people who are easily confused: who said it, who
 * owns it, who is reported to have decided it, and who it is about.
 *
 * Client-safe. The server functions (distiller.functions.ts) call these rules
 * on whatever the model returns, so nothing the model says reaches the record
 * without passing them.
 */
import type { InsightCategory } from "@/lib/insights";

/* ------------------------------------------------------------------ model */

/** How sure Scripta is of who is behind something. Only a lawyer confirms. */
export const ATTRIBUTION_STATUSES = ["confirmed", "likely", "uncertain", "unattributed"] as const;
export type AttributionStatus = (typeof ATTRIBUTION_STATUSES)[number];

export const ATTRIBUTION_LABEL: Record<AttributionStatus, string> = {
  confirmed: "Confirmed",
  likely: "Likely",
  uncertain: "Uncertain",
  unattributed: "Unattributed",
};

/** A person behind an item: a participant of the meeting, or a name the
 *  transcript itself gives for someone who is not one. */
export type Ref = {
  participant?: string;
  name?: string;
  status: AttributionStatus;
  /** Why Scripta (or the lawyer) thinks so, in a few words. */
  basis?: string;
  resolvedBy?: string;
  resolvedAt?: string;
};

export type Roles = {
  speaker?: Ref;
  owner?: Ref;
  decisionMaker?: Ref;
  /** Who or what the item is about. Free text; never an attribution. */
  subjects?: string[];
};
export type RoleKey = "speaker" | "owner" | "decisionMaker";

export const ROLE_LABEL: Record<RoleKey, string> = {
  speaker: "Said by",
  owner: "Owner",
  decisionMaker: "Decided by",
};

/** A real person in the meeting. Distinct from the recorder's labels. */
export type Participant = {
  key: string;
  name: string;
  userId?: string | null;
  /** "lawyer": named by a person. "detected": named in the transcript itself. */
  source: "lawyer" | "detected";
};

export const ITEM_KINDS = [
  "decision",
  "agreement",
  "action",
  "commitment",
  "instruction",
  "position",
  "proposal",
  "disagreement",
  "issue",
  "risk",
  "open_point",
  "question",
  "answer",
  "fact",
  "statement",
] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const KIND_LABEL: Record<ItemKind, string> = {
  decision: "Decision",
  agreement: "Agreement",
  action: "Action",
  commitment: "Commitment",
  instruction: "Instruction",
  position: "Position",
  proposal: "Proposal",
  disagreement: "Disagreement",
  issue: "Issue",
  risk: "Risk",
  open_point: "Open point",
  question: "Question",
  answer: "Answer",
  fact: "Fact",
  statement: "Statement",
};

/** The older category each kind files under, so existing readers keep working. */
export const KIND_CATEGORY: Record<ItemKind, InsightCategory> = {
  decision: "decisions",
  agreement: "decisions",
  action: "action_items",
  commitment: "obligations",
  instruction: "drafting_instructions",
  position: "commercial_issues",
  proposal: "commercial_issues",
  disagreement: "disputes",
  issue: "open_issues",
  risk: "risks",
  open_point: "open_issues",
  question: "follow_ups",
  answer: "key_facts",
  fact: "key_facts",
  statement: "key_facts",
};

/** How the workspace groups items, in the order a lawyer reads them. */
export const ITEM_GROUPS: { key: string; label: string; kinds: ItemKind[] }[] = [
  { key: "decisions", label: "Decisions & agreements", kinds: ["decision", "agreement"] },
  {
    key: "actions",
    label: "Actions & commitments",
    kinds: ["action", "commitment", "instruction"],
  },
  {
    key: "positions",
    label: "Positions & proposals",
    kinds: ["position", "proposal", "disagreement"],
  },
  { key: "issues", label: "Issues, risks & open points", kinds: ["issue", "risk", "open_point"] },
  {
    key: "facts",
    label: "Facts, questions & statements",
    kinds: ["fact", "statement", "question", "answer"],
  },
];

/**
 * Which person decides what an item means, where anyone does. An action is
 * about who will do it; a decision about who made it; an instruction, a
 * position or a concession about who gave it. For a fact the substance stands
 * whoever said it.
 */
export const REVIEW_ROLE: Record<ItemKind, RoleKey | null> = {
  decision: "decisionMaker",
  agreement: "speaker",
  action: "owner",
  commitment: "owner",
  instruction: "speaker",
  position: "speaker",
  proposal: "speaker",
  disagreement: "speaker",
  issue: null,
  risk: null,
  open_point: null,
  question: null,
  answer: "speaker",
  fact: null,
  statement: "speaker",
};

/** Kinds that can become a task. */
export const TASKABLE: ItemKind[] = ["action", "commitment", "instruction"];

export type DistillStatus = "raw" | "distilling" | "distilled" | "approved";
export type ReviewState = "distilled" | "confirmed" | "edited" | "rejected";
export type Confidence = "high" | "medium" | "low";

export type Bubble = {
  id: string;
  ordinal: number;
  label: string;
  ts: string;
  text: string;
};

export type Unit = {
  id: string;
  ordinal: number;
  episode: string;
  text: string;
  pointIds: string[];
  voice: string;
  speaker: Ref;
};

export type Item = {
  id: string;
  kind: ItemKind;
  title: string;
  statement: string;
  unitIds: string[];
  pointIds: string[];
  substance: Confidence;
  roles: Roles;
  reported: boolean;
  material: boolean;
  review: ReviewState;
  due: string | null;
  taskId: string | null;
  source: "ai" | "human";
  ordinal: number;
};

export type Episode = { title: string; fromOrdinal: number; toOrdinal: number };

/* ----------------------------------------------------------------- windows */

/** How many bubbles one model call reads, and how many before it for context. */
export const WINDOW = 50;
export const LOOKBACK = 6;

export type Window = { index: number; from: number; to: number; contextFrom: number };

/** Split ordinals 1..count into windows of `size`, each with a short run of
 *  the bubbles before it to read (never to distil) for continuity. */
export function windowsFor(count: number, size = WINDOW, lookback = LOOKBACK): Window[] {
  const out: Window[] = [];
  for (let from = 1, index = 0; from <= count; from += size, index += 1) {
    const to = Math.min(count, from + size - 1);
    out.push({ index, from, to, contextFrom: Math.max(1, from - lookback) });
  }
  return out;
}

/* ------------------------------------------------------------ attribution */

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** A participant a name refers to: the full name, or a first or last name
 *  that belongs to exactly one participant. */
export function matchParticipant(name: string, people: Participant[]): Participant | null {
  const n = norm(name);
  if (!n) return null;
  const exact = people.find((p) => norm(p.name) === n);
  if (exact) return exact;
  const byPart = people.filter((p) => norm(p.name).split(" ").includes(n));
  if (byPart.length === 1) return byPart[0]!;
  const byWhole = people.filter((p) => n.split(" ").includes(norm(p.name)));
  return byWhole.length === 1 ? byWhole[0]! : null;
}

/** True when `name` occurs in `evidence` as whole words. */
export function spokenIn(name: string, evidence: string): boolean {
  const n = norm(name);
  if (!n) return false;
  return ` ${norm(evidence)} `.includes(` ${n} `);
}

type RawRef =
  { name?: string | null; status?: string | null; basis?: string | null } | null | undefined;

/**
 * The model's view of who is behind something, made safe to record.
 *
 *  - It can never confirm: "confirmed" comes down to "likely". Only a lawyer confirms.
 *  - It can never invent: a name must be a participant, or appear in the
 *    transcript text or the recorder's labels that the model was shown.
 *    Otherwise the name is dropped and the person is unattributed.
 *  - A status without a name is not an attribution: it is unattributed.
 */
export function sanitiseRef(raw: RawRef, people: Participant[], evidence: string): Ref {
  const basis = (raw?.basis ?? "").trim().slice(0, 200) || undefined;
  const name = (raw?.name ?? "").trim();
  let status = (raw?.status ?? "unattributed") as AttributionStatus;
  if (!ATTRIBUTION_STATUSES.includes(status)) status = "unattributed";
  if (status === "confirmed") status = "likely";
  if (!name || status === "unattributed")
    return { status: "unattributed", ...(basis ? { basis } : {}) };
  const person = matchParticipant(name, people);
  if (person) return { participant: person.key, status, ...(basis ? { basis } : {}) };
  if (spokenIn(name, evidence))
    return { name: name.slice(0, 80), status, ...(basis ? { basis } : {}) };
  return { status: "unattributed", basis: "No named person in the transcript supports a guess." };
}

/** Where a role's person is recorded, if anywhere. */
export function refOf(roles: Roles, role: RoleKey): Ref | undefined {
  return roles[role];
}

/** The name to show for a reference. */
export function refName(ref: Ref | undefined, people: Participant[]): string | null {
  if (!ref) return null;
  if (ref.participant) return people.find((p) => p.key === ref.participant)?.name ?? null;
  return ref.name ?? null;
}

/**
 * Whether an item needs a lawyer's eye on who is behind it before the record
 * can be approved. Only where it matters (the item says so, and its kind has
 * a person whose identity changes what it means), and only where Scripta
 * cannot say:
 *  - an owner or a decision-maker that is uncertain or unknown: a commitment
 *    nobody is recorded as owning is a gap the lawyer should close, or
 *    knowingly leave open;
 *  - a speaker that is uncertain. An unknown speaker of a position is left
 *    alone: nothing wrong is recorded, and the substance stands.
 * "Likely" is shown on the item and can be confirmed there, but does not hold
 * up approval. Once the lawyer has answered, it is not asked again.
 */
export function needsAttributionReview(
  item: Pick<Item, "kind" | "roles" | "material" | "review">,
): RoleKey | null {
  if (!item.material || item.review === "rejected") return null;
  const role = REVIEW_ROLE[item.kind];
  if (!role) return null;
  const ref = item.roles[role] ?? { status: "unattributed" as const };
  if (ref.resolvedAt) return null;
  if (ref.status === "uncertain") return role;
  return ref.status === "unattributed" && role !== "speaker" ? role : null;
}

/** An item can be approved only once nothing material is left open. */
export function pendingReviews(items: Item[]): Item[] {
  return items.filter((i) => needsAttributionReview(i) !== null);
}

/**
 * Who a task may go to. A task is assigned only to a confirmed owner who is a
 * member of the workspace; anything less leaves it unassigned, because a task
 * on the wrong person's list is worse than one on nobody's.
 */
export function taskAssignee(item: Pick<Item, "roles">, people: Participant[]): string | null {
  const owner = item.roles.owner;
  if (!owner || owner.status !== "confirmed" || !owner.participant) return null;
  return people.find((p) => p.key === owner.participant)?.userId ?? null;
}

/* ------------------------------------------------------------------ merge */

export type DraftUnit = {
  key: string;
  ordinals: number[];
  text: string;
  voice: string;
  speaker: Ref;
  window: number;
};

/**
 * Join units that two neighbouring windows each built from the same bubbles:
 * a contribution that starts at the end of one window is read again, with its
 * ending, at the start of the next. The later window saw the whole thing, so
 * its wording wins and the bubbles are pooled. Units from the same window
 * that share a bubble are left alone: one bubble can carry two contributions.
 *
 * Returns the merged units and, for each dropped unit key, the key it went into.
 */
export function mergeUnits(units: DraftUnit[]): {
  units: DraftUnit[];
  into: Record<string, string>;
} {
  const into: Record<string, string> = {};
  const kept: DraftUnit[] = [];
  const sorted = [...units].sort(
    (a, b) => a.window - b.window || Math.min(...a.ordinals) - Math.min(...b.ordinals),
  );
  for (const u of sorted) {
    const earlier = kept.find(
      (k) => k.window === u.window - 1 && k.ordinals.some((o) => u.ordinals.includes(o)),
    );
    if (earlier) {
      into[earlier.key] = u.key;
      kept.splice(kept.indexOf(earlier), 1);
      kept.push({
        ...u,
        ordinals: [...new Set([...earlier.ordinals, ...u.ordinals])].sort((a, b) => a - b),
      });
    } else kept.push(u);
  }
  // Chains (a→b, b→c) resolve to the last.
  for (const k of Object.keys(into)) {
    let t = into[k]!;
    while (into[t]) t = into[t]!;
    into[k] = t;
  }
  return { units: kept, into };
}

/**
 * Fold duplicate items together. `groups` comes from the model and is
 * trusted for nothing: ids it did not see are ignored, an id is used at most
 * once, and only items of compatible kinds merge (a decision is not a
 * proposal of the same thing). The first of a group survives, taking every
 * unit and bubble of the others, so no provenance is lost.
 */
export function mergeDuplicates<
  T extends { id: string; kind: ItemKind; unitIds: string[]; pointIds: string[] },
>(items: T[], groups: string[][]): { items: T[]; dropped: string[] } {
  const byId = new Map(items.map((i) => [i.id, { ...i }]));
  const dropped: string[] = [];
  const family = (k: ItemKind) => ITEM_GROUPS.find((g) => g.kinds.includes(k))?.key;
  for (const group of groups) {
    // An id already folded away is gone from byId, so it is used at most once.
    const ids = [...new Set(group)].filter((id) => byId.has(id));
    if (ids.length < 2) continue;
    const head = byId.get(ids[0]!)!;
    for (const id of ids.slice(1)) {
      const other = byId.get(id)!;
      if (family(other.kind) !== family(head.kind)) continue;
      head.unitIds = [...new Set([...head.unitIds, ...other.unitIds])];
      head.pointIds = [...new Set([...head.pointIds, ...other.pointIds])];
      byId.delete(id);
      dropped.push(id);
    }
    byId.set(head.id, head);
  }
  return { items: items.filter((i) => byId.has(i.id)).map((i) => byId.get(i.id)!), dropped };
}

/** Clamp model episodes to the transcript and put them in order. */
export function cleanEpisodes(
  raw: { title?: string; from?: number; to?: number }[],
  count: number,
): Episode[] {
  return raw
    .map((e) => ({
      title: (e.title ?? "").trim().slice(0, 120),
      fromOrdinal: Math.max(1, Math.min(count, Math.round(e.from ?? 0))),
      toOrdinal: Math.max(1, Math.min(count, Math.round(e.to ?? 0))),
    }))
    .filter((e) => e.title && e.fromOrdinal <= e.toOrdinal)
    .sort((a, b) => a.fromOrdinal - b.fromOrdinal);
}

/** The episode a bubble falls in. */
export function episodeAt(episodes: Episode[], ordinal: number): string {
  return episodes.find((e) => ordinal >= e.fromOrdinal && ordinal <= e.toOrdinal)?.title ?? "";
}

/* ---------------------------------------------------------------- context */

/**
 * How much a transcript's content may be relied on elsewhere in Scripta.
 * A transcript is a record of what people said, never of what is true or
 * agreed: even approved, it ranks below any executed or final document.
 */
export function transcriptAuthority(status: DistillStatus): string {
  if (status === "approved")
    return "Approved by a lawyer as a faithful record of the meeting. Persuasive, not authoritative: it never overrides an executed or final document, and a reported statement is still only reported.";
  if (status === "distilled")
    return "AI distillation, not yet reviewed by a lawyer. Treat as a lead to check, not as a record.";
  return "Raw machine transcript. Evidence of what may have been said; the speaker labels are unreliable.";
}

/** One item as a line of matter context, carrying its own caveats. */
export function contextLine(item: Item, people: Participant[]): string {
  const bits: string[] = [];
  const role = REVIEW_ROLE[item.kind];
  const who = role ? refName(item.roles[role], people) : null;
  const st = role ? item.roles[role]?.status : undefined;
  if (who)
    bits.push(
      `${ROLE_LABEL[role!].toLowerCase()} ${who}${st && st !== "confirmed" ? ` (${st})` : ""}`,
    );
  else if (role) bits.push(`${ROLE_LABEL[role].toLowerCase()} unknown`);
  if (item.reported) bits.push("reported, not verified");
  if (item.substance !== "high") bits.push(`${item.substance} confidence in wording`);
  if (item.due) bits.push(`due ${item.due}`);
  // Records kept from before the label guard may still carry a label.
  const said = withoutLabels(`${item.title}. ${item.statement}`);
  return `- ${KIND_LABEL[item.kind]}: ${said}${bits.length ? ` [${bits.join("; ")}]` : ""}`;
}

/* ------------------------------------------------------------ one window */

/** What the model returns for one window, before anything is trusted. */
export type RawWindow = {
  units?: {
    key?: string;
    bubbles?: number[];
    text?: string;
    voice?: string;
    speaker?: RawRef;
  }[];
  items?: {
    kind?: string;
    title?: string;
    statement?: string;
    units?: string[];
    substance_confidence?: string;
    speaker?: RawRef;
    owner?: RawRef;
    decision_maker?: RawRef;
    subjects?: string[];
    reported?: boolean;
    attribution_material?: boolean;
    due?: string | null;
  }[];
};

export type WindowUnit = {
  key: string;
  ordinals: number[];
  text: string;
  voice: string;
  speaker: Ref;
};
export type WindowItem = {
  kind: ItemKind;
  title: string;
  statement: string;
  unitKeys: string[];
  substance: Confidence;
  roles: Roles;
  reported: boolean;
  material: boolean;
  due: string | null;
};

const OWNED: ItemKind[] = ["action", "commitment", "instruction"];

/**
 * A recorder label is never identity, so it never enters what the record
 * says: "Speaker 2 agreed" becomes "a participant agreed". Who said it is
 * kept apart, with its own confidence.
 */
export function withoutLabels(text: string): string {
  return text
    .replace(/\b(speaker|spk)\s*\d+\b/gi, "a participant")
    .replace(/(^|[.!?]\s+)a participant/g, (_, lead: string) => `${lead}A participant`);
}
const DECIDED: ItemKind[] = ["decision", "agreement"];

/**
 * One window's model output, checked against the transcript it was given.
 *
 *  - A unit must be built from bubbles the model was shown, and from at least
 *    one of this window's own (the look-back is for reading, not distilling).
 *  - An item must rest on at least one unit: an item without provenance is
 *    not recorded, whatever it says.
 *  - Every person passes `sanitiseRef`: never confirmed, never invented.
 *  - An owner is kept only on things someone can own, a decision-maker only on
 *    decisions and agreements, unless the model actually named someone.
 */
export function processWindow(
  raw: RawWindow,
  win: Pick<Window, "from" | "to" | "contextFrom">,
  people: Participant[],
  evidence: string,
): { units: WindowUnit[]; items: WindowItem[] } {
  const units: WindowUnit[] = [];
  const keys = new Set<string>();
  for (const [i, u] of (raw.units ?? []).entries()) {
    const ordinals = [
      ...new Set(
        (u.bubbles ?? []).filter((o) => Number.isInteger(o) && o >= win.contextFrom && o <= win.to),
      ),
    ].sort((a, b) => a - b);
    const text = (u.text ?? "").trim();
    if (!text || !ordinals.some((o) => o >= win.from)) continue;
    let key = (u.key ?? "").trim() || `u${i + 1}`;
    if (keys.has(key)) key = `${key}#${i}`;
    keys.add(key);
    units.push({
      key,
      ordinals,
      text: withoutLabels(text).slice(0, 2000),
      voice: (u.voice ?? "").trim().slice(0, 12),
      speaker: sanitiseRef(u.speaker, people, evidence),
    });
  }

  const items: WindowItem[] = [];
  for (const it of raw.items ?? []) {
    const unitKeys = [...new Set((it.units ?? []).filter((k) => keys.has(k)))];
    const title = (it.title ?? "").trim();
    if (!unitKeys.length || !title) continue;
    const kind = (ITEM_KINDS as readonly string[]).includes(it.kind ?? "")
      ? (it.kind as ItemKind)
      : "statement";
    const roles: Roles = {};
    const speaker = sanitiseRef(it.speaker, people, evidence);
    roles.speaker = speaker;
    const owner = sanitiseRef(it.owner, people, evidence);
    if (OWNED.includes(kind) || owner.status !== "unattributed") roles.owner = owner;
    const dm = sanitiseRef(it.decision_maker, people, evidence);
    if (DECIDED.includes(kind) || dm.status !== "unattributed") roles.decisionMaker = dm;
    const subjects = (it.subjects ?? [])
      .map((s) => s.trim().slice(0, 80))
      .filter(Boolean)
      .slice(0, 6);
    if (subjects.length) roles.subjects = subjects;
    const substance = (["high", "medium", "low"] as const).includes(
      it.substance_confidence as Confidence,
    )
      ? (it.substance_confidence as Confidence)
      : "medium";
    items.push({
      kind,
      title: withoutLabels(title).slice(0, 200),
      statement: withoutLabels((it.statement ?? "").trim()).slice(0, 3000),
      unitKeys,
      substance,
      roles,
      reported: it.reported === true,
      material: it.attribution_material === true && REVIEW_ROLE[kind] !== null,
      due: (it.due ?? "").trim().slice(0, 80) || null,
    });
  }
  return { units, items };
}
