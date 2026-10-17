/** Findings: the filter, the order they are read in, and how a place is named. */
import type { Chapter, Finding, StoredNode } from "./db";
import type { FindingAction, FindingCategory, FindingSeverity } from "./model";

const RANK: Record<FindingSeverity, number> = { critical: 0, material: 1, minor: 2 };

export type FindingFilter = {
  status: "open" | "decided" | "all";
  category: FindingCategory | "";
  severity: FindingSeverity | "";
  action: FindingAction | "";
  chapter: string;
  verification: "" | "introduced" | "fixed" | "remains";
  term: string;
};

export const NO_FILTER: FindingFilter = {
  status: "open",
  category: "",
  severity: "",
  action: "",
  chapter: "",
  verification: "",
  term: "",
};

export function sortFindings(list: Finding[]) {
  return [...list].sort(
    (a, b) =>
      Number(a.status !== "open") - Number(b.status !== "open") ||
      RANK[a.severity] - RANK[b.severity] ||
      a.ref - b.ref,
  );
}

const PROSE_KINDS = new Set(["paragraph", "quote", "list_item", "front"]);

/**
 * How a place is cited: "3 ¶2" is chapter 3's second paragraph. Front matter
 * counts as chapter "0". One function, used
 * by the reader, the findings and the report, so the numbers always agree.
 */
export function paragraphRefs(
  nodes: Pick<StoredNode, "key" | "kind" | "chapterKey">[],
  chapters: Map<string, Pick<Chapter, "number" | "ord">>,
): Map<string, string> {
  const out = new Map<string, string>();
  const seen = new Map<string, number>();
  for (const n of nodes) {
    if (!PROSE_KINDS.has(n.kind)) continue;
    const c = n.chapterKey ? chapters.get(n.chapterKey) : undefined;
    const no = c ? c.number || String(c.ord + 1) : "0";
    const i = (seen.get(no) ?? 0) + 1;
    seen.set(no, i);
    out.set(n.key, `${no} ¶${i}`);
  }
  return out;
}

export function placeName(
  node: StoredNode | undefined,
  chapters: Map<string, Chapter>,
  refs?: Map<string, string>,
) {
  if (!node) return "A passage no longer in this version";
  const chapter = node.chapterKey ? chapters.get(node.chapterKey) : chapters.get(node.key);
  const where = chapter
    ? [chapter.number, chapter.title].filter(Boolean).join(" ")
    : "Front matter";
  const ref = refs?.get(node.key);
  const what = ref
    ? ref
    : node.kind === "footnote" || node.kind === "endnote"
      ? `note ${node.number}`
      : node.kind === "chapter"
        ? ""
        : node.kind === "heading"
          ? `§${node.number || node.label}`
          : node.kind === "table" || node.kind === "figure" || node.kind === "caption"
            ? node.number || node.kind
            : node.page
              ? `p. ${node.page}`
              : "";
  return [where, what].filter(Boolean).join(" · ");
}
