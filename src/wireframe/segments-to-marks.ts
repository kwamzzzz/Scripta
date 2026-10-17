/**
 * Converting the old redline into the new one.
 *
 * Phase 5 step 2, and the only part of Phase 5 that touches existing legal
 * text. It runs once per clause and has to be right the first time, so the
 * reasoning is written out rather than assumed.
 *
 * ---------------------------------------------------------------------------
 * WHAT THE OLD MODEL IS
 * ---------------------------------------------------------------------------
 *
 * `clause_segments` holds a word-level diff of ORIGINAL against CURRENT in
 * reading order, each row tagged `n` (unchanged), `d` (in the original, since
 * deleted) or `i` (not in the original, since inserted). So:
 *
 *   rebuildOriginal(segs)   = n + d   the wording as received
 *   rebuildAmendment(segs)  = n + i   the wording as it stands in the workbench
 *
 * Which maps onto the new readings exactly, and this is the correctness
 * condition the migration asserts for every clause before it commits:
 *
 *   operative(converted)   === rebuildOriginal(segs)
 *   ifAccepted(converted)  === rebuildAmendment(segs)
 *
 * ---------------------------------------------------------------------------
 * THE DOCUMENT WINS, BECAUSE THE SEGMENTS ARE A LOSSY SHADOW OF IT
 * ---------------------------------------------------------------------------
 *
 * `wordDiff()` runs on `normalizeText()`, which collapses every run of
 * whitespace to a single space. A clause's segments therefore contain no
 * newlines, no paragraphs, no lists and no tables — they are a flat line of
 * words.
 *
 * Clause 1.5 of the live employment contract proves what that costs. Its
 * document holds a paragraph and a two-column table; its segments hold one `n`
 * run for the paragraph and one `i` run reading "Band Notice Probation One week
 * Confirmed One month". A lawyer added a table and the diff recorded it as an
 * insertion of the concatenated cell text.
 *
 * So rebuilding a clause from its segments would silently destroy a table on
 * live legal text. Where a clause has a document with structure, the document
 * is the content and the marks are applied into it.
 *
 * ---------------------------------------------------------------------------
 * THREE CASES, AND THE FOURTH THAT REFUSES
 * ---------------------------------------------------------------------------
 *
 *   no redline               keep the document as it is; there is nothing to mark
 *   redline, flat document   build from the segments — exact, and loses nothing,
 *                            because a single unformatted paragraph holds no more
 *                            than its words
 *   redline, structured doc,
 *   insertions only          mark the document's own words in place
 *   redline, structured doc,
 *   with deletions           REFUSE. Deleted words are absent from the document,
 *                            so placing them inside a table or a list is a guess,
 *                            and a guess about where deleted legal wording used
 *                            to sit is not a thing to make silently. No clause in
 *                            the matter is in this state; if one ever is, the
 *                            migration stops and says which.
 */
import { docToText, textToDoc, type ClauseDoc, type DocMark, type DocNode } from "./clause-doc";
import {
  normalizeText,
  rebuildAmendment,
  rebuildOriginal,
  type DiffSeg,
} from "@/lib/parsing/word-diff";
import { DELETION, INSERTION, type ChangeAttrs } from "./tracked-change";

/**
 * Who a migrated change belongs to.
 *
 * The old segments carry no author, and inventing one would be worse than
 * admitting there is none — it would put a colleague's name against wording
 * they may not have written. The sentinel is deliberately not a uuid so it can
 * never collide with a person, and the server's authorship check refuses it on
 * any NEW change: a migrated change can be accepted or withdrawn, never minted.
 */
export const UNATTRIBUTED = "migrated";

/** How the interface names it. Not "Unknown", which suggests a lookup failed. */
export const UNATTRIBUTED_LABEL = "Before change tracking";

export class MigrationRefused extends Error {}

const changeMark = (type: string, attrs: ChangeAttrs): DocMark => ({
  type,
  attrs: { changeId: attrs.changeId, setId: attrs.setId, authorId: attrs.authorId, at: attrs.at },
});

/** Words, each keeping its trailing whitespace, so joining reproduces the text. */
const words = (text: string): string[] => text.match(/\S+\s*/g) ?? [];

const deepCopy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * Whether the document holds nothing the segments could not also hold.
 *
 * One paragraph, no marks, no attributes. Such a clause can be rebuilt from its
 * words without losing anything, which makes the exact path available.
 */
export function isFlat(doc: ClauseDoc | null): boolean {
  if (!doc) return true;
  const blocks = doc.content.filter((node) => node.type !== "paragraph" || node.content?.length);
  if (blocks.length > 1) return false;
  const only = blocks[0];
  if (!only) return true;
  if (only.type !== "paragraph") return false;
  return (only.content ?? []).every(
    (child) => typeof child.text === "string" && !child.marks?.length && !child.attrs,
  );
}

/**
 * A redline as a document, proposed by a named lawyer in one sitting.
 *
 * ---------------------------------------------------------------------------
 * ONE SITTING, ONE CHANGE PER RUN
 * ---------------------------------------------------------------------------
 *
 * A word diff scatters its insertions and deletions through the clause, and
 * they are one act — a suggestion accepted, a prior text restored. So they
 * share a `setId`, which is what "accept everything from that sitting" settles,
 * and each run keeps its own `changeId`.
 *
 * They cannot share a changeId: `changesIn()` keys by it and gathers the text,
 * so an insertion and a deletion under one id would merge into a single entry
 * wearing whichever kind was seen first. The set is the unit of the decision;
 * the change is the unit of the mark.
 */
export function proposedDoc(
  segs: DiffSeg[],
  who: { authorId: string; setId: string; at: string },
): ClauseDoc {
  return fromSegments(segs, (index) => ({
    changeId: `${who.setId}:${index}`,
    setId: who.setId,
    authorId: who.authorId,
    at: who.at,
  }));
}

/** A flat document carrying the whole redline as marks. Exact by construction. */
function fromSegments(segs: DiffSeg[], attrsFor: (at: number) => ChangeAttrs): ClauseDoc {
  const content: DocNode[] = [];
  segs.forEach((seg, index) => {
    if (!seg.t) return;
    const node: DocNode = { type: "text", text: seg.t };
    if (seg.k === "i") node.marks = [changeMark(INSERTION, attrsFor(index))];
    if (seg.k === "d") node.marks = [changeMark(DELETION, attrsFor(index))];
    content.push(node);
  });
  return { type: "doc", content: [{ type: "paragraph", content }] };
}

/**
 * Mark the document's own words, in place, leaving every block and every
 * formatting mark exactly where it was.
 *
 * Aligned BY WORD rather than by character, because the document's whitespace
 * and the segments' normalised whitespace do not agree and never will — the
 * diff ran on a flattened string. Word alignment is exact for the only property
 * that matters here: which words were inserted.
 */
function markInsertions(
  doc: ClauseDoc,
  segs: DiffSeg[],
  attrsFor: (at: number) => ChangeAttrs,
): ClauseDoc {
  /* Which segment each word of the amendment came from, in order, or null where
     the word was never proposed. Carrying the segment rather than a flag is what
     lets each run keep its own changeId, so a lawyer can take one correction
     without taking the next. */
  const from: (number | null)[] = [];
  segs.forEach((seg, index) => {
    if (seg.k === "d") return;
    for (const _ of words(seg.t)) from.push(seg.k === "i" ? index : null);
  });

  const next = deepCopy(doc);
  let cursor = 0;

  const rewrite = (parent: DocNode) => {
    if (!parent.content) return;
    const rebuilt: DocNode[] = [];
    for (const child of parent.content) {
      if (typeof child.text !== "string") {
        rewrite(child);
        rebuilt.push(child);
        continue;
      }
      // Split this text node wherever its words change which segment they
      // belong to, so each proposal keeps its own identity.
      let run = "";
      let runFrom: number | null | undefined;
      const push = () => {
        if (!run) return;
        const marks = [...(child.marks ?? [])];
        if (typeof runFrom === "number") marks.push(changeMark(INSERTION, attrsFor(runFrom)));
        rebuilt.push({ ...child, text: run, ...(marks.length ? { marks } : {}) });
        run = "";
      };
      for (const word of words(child.text)) {
        const owner = from[cursor] ?? null;
        cursor++;
        if (runFrom !== undefined && owner !== runFrom) push();
        runFrom = owner;
        run += word;
      }
      if (run) push();
      else if (!child.text.trim()) rebuilt.push(child); // whitespace-only node
    }
    parent.content = rebuilt;
  };

  rewrite({ type: "doc", content: next.content });
  return next;
}

export type Converted = {
  /** The marked-up document the clause becomes. */
  doc: ClauseDoc;
  /** The clause as received, for the baseline revision. */
  baseline: ClauseDoc;
  /** Which path was taken, for the migration's report. */
  route: "unchanged" | "rebuilt" | "marked-in-place";
  hadRedline: boolean;
};

/**
 * One clause, from the old representation to the new.
 *
 * Throws `MigrationRefused` rather than guessing. The migration catches it,
 * names the clause and commits nothing.
 */
export function convertClause(
  segs: DiffSeg[],
  existingDoc: ClauseDoc | null,
  clauseId: string,
  at: string,
): Converted {
  const hasInsertions = segs.some((seg) => seg.k === "i");
  const hasDeletions = segs.some((seg) => seg.k === "d");
  const hadRedline = hasInsertions || hasDeletions;

  /* One set per clause, so "accept everything that predates tracking on this
     clause" is one act — and one changeId PER SEGMENT, so a lawyer can take the
     correction of a statute year without also taking an unrelated insertion
     three lines down. The old model had no per-change identity at all; this is
     the most granularity its data can honestly support. */
  const setId = `migrated:${clauseId}`;
  const attrsFor = (at_: number): ChangeAttrs => ({
    changeId: `migrated:${clauseId}:${at_}`,
    setId,
    authorId: UNATTRIBUTED,
    at,
  });

  if (!hadRedline) {
    // Nothing was ever proposed, so what stands is what was received.
    const doc = existingDoc ?? textToDoc(rebuildAmendment(segs));
    return { doc, baseline: deepCopy(doc), route: "unchanged", hadRedline: false };
  }

  // The baseline is n + d, and the segments are the only record of it. Where
  // words were deleted their structure is unrecoverable, and a flat paragraph
  // is the honest representation of what is actually known.
  const baseline = textToDoc(rebuildOriginal(segs));

  if (isFlat(existingDoc)) {
    return { doc: fromSegments(segs, attrsFor), baseline, route: "rebuilt", hadRedline: true };
  }

  if (hasDeletions) {
    throw new MigrationRefused(
      `Clause ${clauseId} has a structured document and deleted words. Placing deleted wording ` +
        `inside a table or a list would be a guess. Convert it by hand.`,
    );
  }

  return {
    doc: markInsertions(existingDoc!, segs, attrsFor),
    baseline,
    route: "marked-in-place",
    hadRedline: true,
  };
}

/** Whitespace-insensitive, matching how the diff itself compares wording. */
export const sameWording = (a: string, b: string) => normalizeText(a) === normalizeText(b);

/** The wording a document reads as, for verification. */
export const wordingOf = (doc: ClauseDoc) => normalizeText(docToText(doc));
