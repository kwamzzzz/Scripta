/**
 * Name variants: capitalised names that differ by one letter, by case or by
 * an accent ("GoldBod"/"Goldbod", "Nkrumah"/"Nkruma"), each used at least
 * twice. Deliberately conservative: short names, sentence openings, plural
 * and adjectival endings ("Kenya"/"Kenyan"), first-letter differences
 * ("Gambia"/"Zambia") and two names that both appear in the bibliography
 * (two real people) are all left alone.
 */
import type { DraftFinding } from "../model";
import { corpusOf, type Prose } from "./corpus";
import { draft, ev, finish, ruleCovering } from "./finding";
import { SPELL_LOOKUP } from "./spelling-data";
import { editDistance, fold, q, times } from "./text";
import type { CheckInput, CheckResult } from "./types";

type Use = { p: Prose; w: string };

const ADJECTIVAL_END = new Set(["n", "s", "i", "e", "y", "a"]);

/** Why a one-letter difference between two folded names is not worth asking about. */
function innocent(a: string, b: string): boolean {
  if (a.length === b.length) {
    let diff = -1;
    for (let i = 0; i < a.length; i++)
      if (a[i] !== b[i]) {
        if (diff !== -1) return true; // more than one substitution: not ours
        diff = i;
      }
    if (diff === 0 || diff === a.length - 1) return true;
    return false;
  }
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  if (long.startsWith(short) && ADJECTIVAL_END.has(long[long.length - 1]!)) return true;
  if (long.slice(1) === short) return true; // first letter
  return false;
}

export function checkNameVariants(input: CheckInput): CheckResult {
  const corpus = corpusOf(input.nodes);
  const uses = new Map<string, Use[]>();
  const lowerWords = new Set<string>();
  for (const p of corpus.prose) {
    if (!p.english) continue;
    for (const t of p.toks) {
      if (!/^\p{Lu}/u.test(t.w)) {
        lowerWords.add(fold(t.w));
        continue;
      }
      if (t.init !== 0 || t.w.length < 5) continue;
      if (t.w === t.w.toUpperCase()) continue;
      const w = t.w.replace(/['’]s$/, "");
      const list = uses.get(w) ?? [];
      list.push({ p, w });
      uses.set(w, list);
    }
  }
  const bib = new Set<string>();
  for (const n of input.nodes)
    if (n.kind === "bibliography_entry") for (const w of n.text.match(/\p{L}+/gu) ?? []) bib.add(fold(w));

  // Candidates: used twice or more, not an ordinary word, not a spelling-family word.
  const names = [...uses.entries()]
    .filter(([w, list]) => list.length >= 2 && !lowerWords.has(fold(w)) && !SPELL_LOOKUP.has(w.toLowerCase()))
    .map(([w]) => w);

  // Group by folded form (case and accent variants), and by one deletion (one-letter variants).
  const pairs = new Set<string>();
  const byFold = new Map<string, string[]>();
  const byDeletion = new Map<string, Set<string>>();
  for (const w of names) {
    const f = fold(w);
    byFold.set(f, [...(byFold.get(f) ?? []), w]);
    const variants = new Set([f]);
    for (let i = 0; i < f.length; i++) variants.add(f.slice(0, i) + f.slice(i + 1));
    for (const v of variants) {
      const set = byDeletion.get(v) ?? new Set<string>();
      set.add(w);
      byDeletion.set(v, set);
    }
  }
  for (const group of byFold.values())
    for (let i = 0; i < group.length; i++)
      for (let j = i + 1; j < group.length; j++) pairs.add([group[i]!, group[j]!].sort().join("\u0000"));
  for (const set of byDeletion.values()) {
    if (set.size < 2) continue;
    const list = [...set];
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = fold(list[i]!);
        const b = fold(list[j]!);
        if (a === b || editDistance(a, b, 1) !== 1 || innocent(a, b)) continue;
        pairs.add([list[i]!, list[j]!].sort().join("\u0000"));
      }
  }

  const drafts: DraftFinding[] = [];
  for (const pair of pairs) {
    const [a, b] = pair.split("\u0000") as [string, string];
    if (bib.has(fold(a)) && bib.has(fold(b)) && fold(a) !== fold(b)) continue;
    if (ruleCovering(input.rules, ["names", "spelling", "terminology"], [a, b])) continue;
    const ua = uses.get(a)!;
    const ub = uses.get(b)!;
    const [minor, major] = ua.length <= ub.length ? [ua, ub] : [ub, ua];
    drafts.push(
      draft({
        pass: "consistency",
        category: "consistency",
        severity: "minor",
        action: "query",
        title: `${q(minor[0]!.w)} and ${q(major[0]!.w)} are both used`,
        body: `${q(major[0]!.w)} appears ${times(major.length)} and ${q(minor[0]!.w)} ${times(minor.length)}. If they are the same name, please confirm the correct spelling.`,
        evidence: [
          ...minor.map((u) => ev(u.p.node.key, u.w)),
          ...major.slice(0, 3).map((u) => ev(u.p.node.key, u.w)),
        ],
        fp: ["consistency.names", ...[a, b].sort()],
      }),
    );
  }
  return { findings: finish(input, drafts), detectedRules: [] };
}
