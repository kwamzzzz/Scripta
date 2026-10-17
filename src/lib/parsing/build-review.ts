import type { ParsedClause } from "./clauses";
import type { Reference } from "@/lib/subclauses";
import { pairClauses } from "./match";
import { diffSummary } from "./summary";
import { wordDiff, type DiffSeg } from "./word-diff";

export type ReviewClause = {
  num: string;
  title: string;
  page: string;
  change: "Added" | "Deleted" | "Modified";
  diffSummary: string;
  segs: DiffSeg[];
  ordinal: number;
  /** Structural facts carried through from parsing, so they reach the database. */
  kind?: ParsedClause["kind"];
  parent?: string | undefined;
  refs?: Reference[];
};

/**
 * Pair the two versions and turn each pair into a review clause. Clauses that
 * are byte-identical across versions are dropped so the register only holds
 * real changes.
 */
export function buildReview(originals: ParsedClause[], amendments: ParsedClause[]): ReviewClause[] {
  const out: ReviewClause[] = [];

  for (const { original, amendment } of pairClauses(originals, amendments)) {
    const change: ReviewClause["change"] = !original ? "Added" : !amendment ? "Deleted" : "Modified";
    const segs = wordDiff(original?.body ?? "", amendment?.body ?? "");
    if (change === "Modified" && !segs.some((s) => s.k !== "n")) continue; // unchanged clause
    const src = amendment ?? original!;
    out.push({
      num: src.num,
      title: src.title,
      page: src.page,
      change,
      diffSummary: diffSummary(segs, { change, title: src.title }),
      segs,
      ordinal: 0,
      // From the amended version where there is one: it is the text being
      // reviewed, and a provision can change what it points at.
      kind: src.kind,
      parent: src.parent,
      refs: src.refs ?? [],
    });
  }

  return out
    .sort((a, b) => numKey(a.num).localeCompare(numKey(b.num), undefined, { numeric: true }))
    .map((c, i) => ({ ...c, ordinal: i + 1 }));
}

const numKey = (num: string) =>
  num
    .split(".")
    .map((part) => part.padStart(4, "0"))
    .join(".");
