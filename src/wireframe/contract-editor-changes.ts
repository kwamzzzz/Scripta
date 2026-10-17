import type { Clause } from "@/data/legal";
import { changesIn } from "./tracked-change";
import type { ClauseNode } from "./contract-editor-tree";

type Changeable = Pick<Clause, "segs" | "suggestedText" | "doc">;

/**
 * A clause carries a change when its wording is redlined, or when an AI
 * proposal is still outstanding on it and waiting for a decision.
 *
 * ---------------------------------------------------------------------------
 * THE DOCUMENT IS THE AUTHORITY
 * ---------------------------------------------------------------------------
 *
 * This read `segs` alone, which is the legacy shadow of the clause rather than
 * the clause. Since Phase 5 a tracked change is a MARK IN `clauses.doc`, and
 * `clause_segments` is only kept as an export fallback — so a lawyer who
 * proposed wording through the editor got:
 *
 *   Changes pane   5 OUTSTANDING
 *   See changes    disabled, "Nothing has changed yet"
 *
 * Two surfaces answering the same question differently, with the filter and
 * the clause-tree navigation believing the stale one. Found in the independent
 * clause-workflow acceptance review.
 *
 * `changesIn()` is the same function the Changes pane uses, so the two now
 * derive from one source and cannot drift again.
 *
 * `segs` remains the fallback for a clause with no document — a clause the
 * step 2 migration declined to convert. There are none in this database (417
 * of 417 carry a `doc`, and no clause has a change known only to `segs`), but
 * removing legacy support to tidy the architecture is not this fix's business.
 */
export function hasClauseChange(clause: Changeable) {
  if (clause.suggestedText?.trim()) return true;
  if (clause.doc) return changesIn(clause.doc).length > 0;
  return clause.segs.some(
    (segment) => (segment.k === "i" || segment.k === "d") && segment.t.trim(),
  );
}

/**
 * Narrow the document to the clauses carrying changes. A section is kept when
 * it or anything beneath it changed; unchanged descendants are pruned, so the
 * view holds only what there is to read, with the headings that locate it.
 */
export function filterChangedClauses(nodes: ClauseNode[]): ClauseNode[] {
  return nodes.flatMap((node) => {
    const children = filterChangedClauses(node.children);
    if (!children.length && !hasClauseChange(node)) return [];
    return [{ ...node, children }];
  });
}

/** How many clauses carry a change, for the toolbar count. */
export function countChangedClauses(clauses: Changeable[]) {
  return clauses.filter(hasClauseChange).length;
}
