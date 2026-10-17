import type { ParsedClause } from "./clauses";

const bigrams = (s: string) => {
  const t = s.toLowerCase().replace(/[^a-z0-9 ]/g, "");
  const out = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
};

/** Dice coefficient over character bigrams — cheap and stable for titles. */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.size === 0 || B.size === 0) return a === b ? 1 : 0;
  let hits = 0;
  A.forEach((g) => {
    if (B.has(g)) hits++;
  });
  return (2 * hits) / (A.size + B.size);
}

export type Pair = { original: ParsedClause | null; amendment: ParsedClause | null };

/**
 * Pair clauses across two versions: by clause number first, then by title
 * similarity, then by body similarity so renumbered clauses still line up.
 */
export function pairClauses(originals: ParsedClause[], amendments: ParsedClause[]): Pair[] {
  const pairs: Pair[] = [];
  const usedOriginal = new Set<number>();

  const takeBy = (predicate: (o: ParsedClause) => number, threshold: number) => (a: ParsedClause) => {
    let best = -1;
    let bestScore = threshold;
    originals.forEach((o, idx) => {
      if (usedOriginal.has(idx)) return;
      const score = predicate(o);
      if (score > bestScore) {
        bestScore = score;
        best = idx;
      }
    });
    return best;
  };

  for (const a of amendments) {
    let idx = takeBy((o) => (o.num && o.num === a.num ? 1 : 0), 0.99)(a);
    if (idx < 0) idx = takeBy((o) => similarity(o.title, a.title), 0.6)(a);
    if (idx < 0) idx = takeBy((o) => similarity(o.body, a.body), 0.5)(a);
    if (idx >= 0) {
      usedOriginal.add(idx);
      pairs.push({ original: originals[idx]!, amendment: a });
    } else {
      pairs.push({ original: null, amendment: a });
    }
  }

  originals.forEach((o, idx) => {
    if (!usedOriginal.has(idx)) pairs.push({ original: o, amendment: null });
  });

  return pairs;
}
