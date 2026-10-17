import { asDoc } from "@/wireframe/clause-doc";
import { changesIn } from "@/wireframe/tracked-change";
import { isFlat, proposedDoc } from "@/wireframe/segments-to-marks";
import type { DiffSeg } from "@/lib/parsing/word-diff";

/**
 * Write a redline into the clause's DOCUMENT, in the caller's name.
 *
 * ---------------------------------------------------------------------------
 * THE SHADOW IS NOT THE CLAUSE
 * ---------------------------------------------------------------------------
 *
 * Phase 5 made `clauses.doc` the clause and `save_clause_doc` its only writer.
 * Every server function in this file was still writing `clause_segments` and
 * nothing else, so wording accepted here never reached the document that the
 * export, the Changes pane, the four readings and the Playbook review all read.
 * `acceptSuggestion` is how AI review output becomes wording, which made it the
 * worst of them: a suggestion could be accepted and leave no trace anywhere
 * that matters.
 *
 * Two refusals rather than a guess, because both alternatives are worse than
 * stopping:
 *
 *   OUTSTANDING PROPOSALS. Rebuilding the document from a flat word diff would
 *   drop every existing mark, which `save_clause_doc` would read as settling a
 *   colleague's wording by omission. It would be refused — correctly — with a
 *   message about settling rights that explains nothing. Better to say what is
 *   actually in the way.
 *
 *   FORMATTING. A clause holding a list, a table or bold text cannot be rebuilt
 *   from a flattened string without losing it. `isFlat` is exactly the question
 *   "would rebuilding lose anything", and when the answer is yes the honest
 *   thing is to send the lawyer to the editor rather than quietly flatten a
 *   rates table.
 */
export async function proposeIntoDoc(
  supabase: any,
  clause: { id: string; doc: unknown; updated_at: string | null },
  userId: string,
  segs: DiffSeg[],
  what: string,
) {
  const doc = asDoc(clause.doc);
  if (doc && changesIn(doc).length > 0) {
    throw new Error(
      `There are proposals outstanding on this clause. Settle them before ${what}.`,
    );
  }
  if (doc && !isFlat(doc)) {
    throw new Error(
      `This clause carries formatting that ${what} cannot preserve. Mark it up in the editor instead.`,
    );
  }
  const proposed = proposedDoc(segs, {
    authorId: userId,
    setId: `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
  });
  const saved = await supabase.rpc("save_clause_doc", {
    _clause: clause.id,
    _doc: proposed,
    _seen: clause.updated_at,
  });
  if (saved.error) throw new Error(saved.error.message);
}

