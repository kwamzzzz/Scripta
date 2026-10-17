/**
 * Flow data model (wireframe column 6).
 *
 * One tree per mandate: matter → phase (scope-of-services item) → deliverable
 * → document versions (kind "document") or evidence (kind "action").
 *
 * State is never stored. `deriveFlow` computes it from the facts on record:
 * a document deliverable is complete when its final version is attached and it
 * is ticked; an action is complete when it is ticked with evidence; a phase
 * closes when every mandatory deliverable is complete. "Waiting on" is a real
 * state with an expected-by date.
 */

import {
  correspondenceSearchText,
  searchableText,
  threadWhen,
  type EmailDraft as SharedEmailDraft,
  type ThreadAttachment,
  type ThreadEntry as SharedThreadEntry,
} from "@/lib/correspondence";

/** Re-exported so Flow's own callers keep one import for the model. */
export { searchableText, threadWhen };

/** What a flow calls its phases until somebody says otherwise. */
export const DEFAULT_PHASES_TITLE = "Scope of Services";

export type DeliverableKind = "document" | "action";

/** Document types drive the Open-in-editor route. */
export type DocumentType =
  | "contract"
  | "board_resolution"
  | "memo"
  | "letter"
  | "diagram"
  | "schedule"
  | "annex"
  | "client_note"
  | "report"
  | "other";

export type ActionType = "meeting" | "email" | "visit" | "call" | "filing" | "payment" | "waiting";

export type DeliverableState =
  "complete" | "overdue" | "due_today" | "waiting_on" | "in_progress" | "planned";

export type PhaseState = "done" | "active" | "upcoming";

/**
 * What a version of a document IS, in the words a law firm uses for it.
 *
 * Scripta used to work this out for itself and call anything with a newer
 * version behind it "superseded", which is a filing clerk's word for a fact a
 * lawyer can already see from the numbers. What a lawyer wants to know is what
 * kind of document this is — the draft, the one for execution, the comparison
 * run against the last one — and that is a thing they decide, not something to
 * be derived from a timestamp.
 */
export type VersionTag = "draft" | "execution" | "comparison" | "conformed" | "signed";

export const VERSION_TAGS: VersionTag[] = [
  "draft",
  "execution",
  "comparison",
  "conformed",
  "signed",
];

export const VERSION_TAG_LABEL: Record<VersionTag, string> = {
  draft: "Draft",
  execution: "Execution version",
  comparison: "Comparison",
  conformed: "Conformed copy",
  signed: "Signed",
};

/** The word on a chip, where "Execution version" is more than there is room for. */
export const VERSION_TAG_SHORT: Record<VersionTag, string> = {
  draft: "Draft",
  execution: "Execution",
  comparison: "Comparison",
  conformed: "Conformed",
  signed: "Signed",
};

export const isVersionTag = (v: unknown): v is VersionTag =>
  typeof v === "string" && (VERSION_TAGS as string[]).includes(v);

export type Version = {
  id: string;
  deliverableId: string;
  /** Storage path, object URL or https URL of the file; null while nothing is attached. */
  fileRef: string | null;
  label: string;
  createdAt: string;
  isFinal: boolean;
  /** What kind of document this version is. Unset on versions filed before tags existed. */
  tag?: VersionTag;
  /** Cached first-page raster (data URL or storage path); null until generated. */
  thumbnailRef: string | null;
  pages?: number;
  by?: string;
  note?: string;
};

export type Evidence = {
  id: string;
  deliverableId: string;
  name: string;
  createdAt: string;
  fileRef?: string;
  emailRef?: string;
  note?: string;
  meta?: string;
};

/**
 * A flow's correspondence is the shared kind, told which deliverable it belongs
 * to. The shapes and the search folding live in `lib/correspondence`, so a task
 * keeps its replies the same way a deliverable does; only the extra field and
 * where the rows are stored differ.
 */
export type EmailDraft = SharedEmailDraft & { deliverableId: string };
export type ThreadEntry = SharedThreadEntry & { deliverableId: string };
export type { ThreadAttachment };

export type WaitingOn = {
  who: string;
  since: string;
  expectedBy: string;
  workingDays?: number;
  note?: string;
  followUpAt?: string | null;
};

export type Deliverable = {
  id: string;
  phaseId: string;
  kind: DeliverableKind;
  name: string;
  /** DocumentType for documents, ActionType for actions. */
  type: DocumentType | ActionType;
  description: string;
  /** Guidance carried in from a preset: what to watch out for here. */
  note?: string;
  /** What was typed before responsibility pointed at a person. Kept: for many
      deliverables it is the only surviving record of who was meant to do it. */
  owner: string;
  /** Who is responsible: a member of the matter team, or nobody. */
  ownerId?: string | null;
  start: string;
  deadline: string;
  mandatory: boolean;
  /** The lawyer's tick. Completion still needs a final version / evidence. */
  ticked: boolean;
  /**
   * When it was ticked. Absent on ticks recorded before this was kept, and on
   * anything not ticked — so "what did I finish today" can be asked of it at
   * all, which it could not be when only the boolean existed.
   */
  tickedAt?: string | null;
  waitingOn?: WaitingOn | null;
  /** Named empty slots drawn in the repository (annexes still expected). */
  expected?: string[];
  /** Where the document is referenced, as shown in the repository panel. */
  references?: string;
  /** Id of the editor document (e.g. a research matter for a memo). */
  editorRef?: string;
  counterparty?: string;
  dependsOn?: string[];
};

export type Phase = {
  id: string;
  /** Null while the flow belongs to no matter. */
  matterId: string | null;
  name: string;
  description: string;
  /** Guidance carried in from a preset: why this phase is here. */
  note?: string;
  steps: string[];
  deadline: string;
  order: number;
};

export type Party = { name: string; role: string };
export type Contact = { initials: string; name: string; org: string; last: string };

export type MatterFlowRecord = {
  /** Null for a flow started on its own, or under a client, and not yet filed. */
  matterId: string | null;
  kind: DeliverableKind;
  startedAt: string;
  /**
   * What this matter calls its phases. Empty means it has never been renamed
   * and reads `DEFAULT_PHASES_TITLE`.
   *
   * "Scope of Services" is right for a mandate that was sold as one and wrong
   * for ongoing work — managing an account has phases and no scope of
   * services — so the heading is the matter's word, not Scripta's.
   */
  phasesTitle?: string;
  phases: Phase[];
  deliverables: Deliverable[];
  versions: Version[];
  evidence: Evidence[];
  parties: Party[];
  contacts: Contact[];
  /** Optional: records written before email drafting existed have neither. */
  emails?: EmailDraft[];
  threads?: ThreadEntry[];
};

export type DerivedDeliverable = Deliverable & {
  state: DeliverableState;
  versions: Version[];
  evidence: Evidence[];
  /** Replies logged against this deliverable, oldest first. */
  threads: ThreadEntry[];
  emailDraft: EmailDraft | null;
  finalVersion: Version | null;
  complete: boolean;
};

export type DerivedPhase = Phase & {
  state: PhaseState;
  deliverables: DerivedDeliverable[];
  completeCount: number;
  mandatoryOutstanding: number;
  /** 0–1 share of deliverables complete. */
  progress: number;
};

export type DerivedFlow = {
  /** The matter's word for its phases, already defaulted. */
  phasesTitle: string;
  phases: DerivedPhase[];
  activePhase: DerivedPhase | null;
  closedCount: number;
  activeForDays: number;
};

/* ---------------------------------------------------------------- dates */

export const DAY = 86_400_000;

/** ISO date (YYYY-MM-DD) → local midnight. */
export const toDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
};

export const isoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export const daysBetween = (fromIso: string, toIso: string) =>
  Math.round((toDate(toIso).getTime() - toDate(fromIso).getTime()) / DAY);

/** Working days elapsed (Mon–Fri), exclusive of the start day. */
export const workingDaysBetween = (fromIso: string, toIso: string) => {
  const from = toDate(fromIso);
  const to = toDate(toIso);
  let count = 0;
  const cursor = new Date(from);
  while (cursor < to) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
};

/* --------------------------------------------------------------- derive */

const byOrder = (a: Phase, b: Phase) => a.order - b.order;

export function deriveDeliverable(
  d: Deliverable,
  versions: Version[],
  evidence: Evidence[],
  today: string,
  /** Correspondence, for the deliverables that have any. */
  correspondence: { threads?: ThreadEntry[]; emails?: EmailDraft[] } = {},
): DerivedDeliverable {
  const own = versions
    .filter((v) => v.deliverableId === d.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const proof = evidence
    .filter((e) => e.deliverableId === d.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const finalVersion = own.filter((v) => v.isFinal).at(-1) ?? null;
  const complete =
    d.kind === "document" ? d.ticked && finalVersion !== null : d.ticked && proof.length > 0;
  let state: DeliverableState;
  if (complete) state = "complete";
  else if (d.waitingOn) state = "waiting_on";
  else if (d.deadline < today) state = "overdue";
  else if (d.deadline === today) state = "due_today";
  else if (d.start <= today || own.length > 0 || proof.length > 0) state = "in_progress";
  else state = "planned";
  const threads = (correspondence.threads ?? [])
    .filter((t) => t.deliverableId === d.id)
    .sort((a, b) => threadWhen(a).localeCompare(threadWhen(b)));
  const emailDraft = (correspondence.emails ?? []).find((e) => e.deliverableId === d.id) ?? null;
  return {
    ...d,
    state,
    versions: own,
    evidence: proof,
    threads,
    emailDraft,
    finalVersion,
    complete,
  };
}

export function deriveFlow(record: MatterFlowRecord, today: string): DerivedFlow {
  const phases = [...record.phases].sort(byOrder).map((phase) => {
    const deliverables = record.deliverables
      .filter((d) => d.phaseId === phase.id)
      .map((d) =>
        deriveDeliverable(d, record.versions, record.evidence, today, {
          ...(record.threads ? { threads: record.threads } : {}),
          ...(record.emails ? { emails: record.emails } : {}),
        }),
      );
    const completeCount = deliverables.filter((d) => d.complete).length;
    const mandatoryOutstanding = deliverables.filter((d) => d.mandatory && !d.complete).length;
    return {
      ...phase,
      deliverables,
      completeCount,
      mandatoryOutstanding,
      progress: deliverables.length ? completeCount / deliverables.length : 0,
    };
  });
  // A phase is done when it has deliverables and every mandatory one is
  // complete. The first phase not done is the active one; the rest wait.
  let activeSeen = false;
  const derived: DerivedPhase[] = phases.map((p) => {
    const done = p.deliverables.length > 0 && p.mandatoryOutstanding === 0;
    let state: PhaseState;
    if (done && !activeSeen) state = "done";
    else if (!activeSeen) {
      state = "active";
      activeSeen = true;
    } else state = "upcoming";
    return { ...p, state };
  });
  const activePhase = derived.find((p) => p.state === "active") ?? derived.at(-1) ?? null;
  return {
    // Defaulted once, here, so no screen has to remember the fallback.
    phasesTitle: record.phasesTitle?.trim() || DEFAULT_PHASES_TITLE,
    phases: derived,
    activePhase,
    closedCount: derived.filter((p) => p.state === "done").length,
    activeForDays: Math.max(0, daysBetween(record.startedAt, today)),
  };
}

/**
 * A phase's deliverables put in the order given, every other row left where it
 * was: the phase's slots in the list are refilled in the new sequence, so the
 * list's order is the phase's order. Ids the phase does not hold are ignored,
 * and any of its rows the order leaves out keep their place at the end.
 */
export function reorderInPhase(
  deliverables: Deliverable[],
  phaseId: string,
  ids: string[],
): Deliverable[] {
  const mine = deliverables.filter((d) => d.phaseId === phaseId);
  const byId = new Map(mine.map((d) => [d.id, d]));
  const ordered = [
    ...ids.map((id) => byId.get(id)).filter((d): d is Deliverable => !!d),
    ...mine.filter((d) => !ids.includes(d.id)),
  ];
  let next = 0;
  return deliverables.map((d) => (d.phaseId === phaseId ? ordered[next++]! : d));
}

/** The whole matter's deliverables in phase order, for the timeline. */
export const allDeliverables = (flow: DerivedFlow) => flow.phases.flatMap((p) => p.deliverables);

/**
 * A new id.
 *
 * Flow rows are referenced from outside Flow now — a task points at a
 * deliverable — so these are real uuids rather than the readable
 * `del_l2k3abc` they used to be. The prefix is kept in the call signature
 * because it still says, at the call site, what is being made.
 */
export const uid = (prefix: string): string => {
  void prefix;
  return globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : // Older runtimes (and jsdom without webcrypto) still need an id.
      "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });
};

/* ------------------------------------------------------- email threads */

/** An email deliverable is an action carried out by email. */
export const isEmailDeliverable = (d: Pick<Deliverable, "kind" | "type">) =>
  d.kind === "action" && d.type === "email";

/**
 * The words of a reply, folded for matching: case removed, runs of whitespace
 * and the punctuation mail clients scatter through quoted text collapsed to
 * single spaces. The original text is never touched.
 */

export const emailDraftFor = (record: MatterFlowRecord, deliverableId: string) =>
  (record.emails ?? []).find((e) => e.deliverableId === deliverableId) ?? null;

/** A deliverable's replies, oldest first: by when they arrived, else when logged. */
export const threadsFor = (record: MatterFlowRecord, deliverableId: string) =>
  (record.threads ?? [])
    .filter((t) => t.deliverableId === deliverableId)
    .sort((a, b) => threadWhen(a).localeCompare(threadWhen(b)));

/**
 * Everything about a deliverable a keyword should reach: its own name and
 * purpose, the draft it carries, and every reply logged against it — authors
 * and attachment names included, since those are how correspondence is
 * remembered.
 */
export function deliverableSearchText(d: {
  name: string;
  description: string;
  threads: ThreadEntry[];
  emailDraft: EmailDraft | null;
}): string {
  return searchableText([d.name, d.description, correspondenceSearchText(d)].join(" "));
}

/** Does this deliverable answer to the words typed in the search box? */
export const deliverableMatches = (
  d: Parameters<typeof deliverableSearchText>[0],
  query: string,
) => {
  const folded = searchableText(query);
  return folded === "" || deliverableSearchText(d).includes(folded);
};

/** Next version label for a deliverable: v1, v2 … */
export const nextVersionLabel = (versions: Version[]) => `v${versions.length + 1}`;
