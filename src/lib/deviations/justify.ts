/**
 * The last column, when there is no model to write it.
 *
 * ---------------------------------------------------------------------------
 * A SHORT HONEST LINE BEATS A LONG ACCURATE ONE
 * ---------------------------------------------------------------------------
 *
 * The first version of this counted the edit: "The Bidder deletes 2 word(s)
 * and inserts 31 word(s) ('either Party other (other than as a result of an
 * internal reorganisation within the…'). Rationale to be confirmed by the
 * Bidder." Every word of that is true and no lawyer would ever write it. Word
 * counts are a machine showing its working; a reviewer wants the point of the
 * change, and nobody describes their own client in the third person while
 * failing to give a reason.
 *
 * So the fallback now says only what can be said without judgement — which
 * operation this row records — in the register of the column it sits in, and
 * leaves the reasoning to `justify.functions.ts`. A one-line placeholder a
 * lawyer can complete in ten seconds is more useful than a paragraph they
 * have to delete first.
 */
import type { DeviationRow } from "./rows";

/**
 * What this row records, in a lawyer's register and without judgement.
 *
 * Deliberately terse, and deliberately not an argument: the reason a bidder
 * wants a change cannot be read off the change, and guessing at it in a
 * document addressed to the counterparty is the one failure mode worth
 * designing against.
 */
export function describeEffect(row: DeviationRow): string {
  if (row.isNew) return "New provision proposed by the Vendor.";
  if (row.isDeleted) return "This provision is deleted.";
  const added = row.proposed.some((segment) => segment.kind === "insert");
  const removed = row.proposed.some((segment) => segment.kind === "delete");
  if (added && removed) return "The wording of this provision is amended.";
  if (added) return "Wording is added to this provision.";
  if (removed) return "Wording is removed from this provision.";
  return "This provision is amended.";
}

/** Placeholders for a whole schedule, used when no model is configured. */
export const describeAll = (rows: DeviationRow[]): string[] => rows.map(describeEffect);

/**
 * The model's drafts, with the placeholder standing in wherever it returned
 * nothing — so a partial answer fills what it can rather than failing whole.
 */
export function mergeJustifications(
  rows: DeviationRow[],
  drafted: { id: number; justification: string }[],
): string[] {
  const byId = new Map(drafted.map((item) => [item.id, item.justification]));
  return rows.map((row, at) => byId.get(at)?.trim() || describeEffect(row));
}
