import type { Clause } from "@/data/legal";

export type ClauseNode = Clause & { children: ClauseNode[] };

function directParent(num: string, known: Set<string>) {
  let value = num;
  while (value.includes(".")) {
    value = value.slice(0, value.lastIndexOf("."));
    if (known.has(value)) return value;
  }
  return null;
}

/** Build the document hierarchy from real flat clause rows without changing IDs. */
export function buildClauseTree(clauses: Clause[]): ClauseNode[] {
  const known = new Set(clauses.map((clause) => clause.num));
  const nodes = new Map<string, ClauseNode>(
    clauses.map((clause) => [clause.num, { ...clause, children: [] as ClauseNode[] }]),
  );
  const roots: ClauseNode[] = [];

  clauses.forEach((clause) => {
    const node = nodes.get(clause.num)!;
    const parent = directParent(clause.num, known);
    if (parent) nodes.get(parent)!.children.push(node);
    else roots.push(node);
  });

  return roots;
}
