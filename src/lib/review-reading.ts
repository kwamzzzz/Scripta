/**
 * Which wording the Playbook review is shown.
 *
 * ---------------------------------------------------------------------------
 * IF ACCEPTED, FROM THE DOCUMENT
 * ---------------------------------------------------------------------------
 *
 * Two questions, and they were being answered separately in two files.
 *
 * WHICH READING. The review judges the clause AS THE LAWYER MEANS IT TO READ —
 * every outstanding proposal applied. That is the reading that tells them
 * whether their markup solved the problem. Operative would strip their own
 * proposals out before judging and re-raise an issue they have already fixed,
 * and Marked up would hand the model the deleted and the inserted wording at
 * once and ask it to reason about both. Confirmed with Kwame in the
 * clause-workflow acceptance review.
 *
 * WHERE FROM. `clauses.doc`. Both call sites already intended If accepted —
 * `rebuildAmendment` drops deletions, and the packet builder dropped its `d`
 * runs under a comment calling it "the amended reading" — but both read
 * `clause_segments`, which `save_clause_doc` has never written. The shadow has
 * been frozen since Phase 5, so the review has been assessing wording from
 * before every tracked edit on the file, and so have the definitions it reasons
 * from. Found by Codex in the acceptance review.
 *
 * Segments remain the fallback for a clause with no document. The rule lives
 * here rather than in each caller because two copies of it is how the first one
 * drifted.
 */
import { asDoc, docToText, type ClauseDoc } from "@/wireframe/clause-doc";
import { ifAccepted, operative } from "@/wireframe/tracked-change";

/** A clause's legacy segments: `n` untouched, `i` inserted, `d` deleted. */
export type ReadingSeg = { t: string; k: string };

const fromSegs = (segs: ReadingSeg[], drop: string) =>
  segs
    .filter((seg) => seg.k !== drop)
    .map((seg) => seg.t)
    .join("")
    .trimEnd();

/** The clause as it would read if every outstanding proposal were accepted. */
export function reviewBody(doc: ClauseDoc | null, segs: ReadingSeg[]): string {
  return doc ? docToText(ifAccepted(doc)) : fromSegs(segs, "d");
}

/** The wording those proposals were made against, for the diff the review shows. */
export function reviewOriginal(doc: ClauseDoc | null, segs: ReadingSeg[]): string {
  return doc ? docToText(operative(doc)) : fromSegs(segs, "i");
}

/** The document a clause row carries, or null for one the migration never converted. */
export const readingDoc = (value: unknown): ClauseDoc | null => asDoc(value);
