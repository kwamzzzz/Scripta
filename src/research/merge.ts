/**
 * Folding a question's research back into the record.
 *
 * Research happens one question at a time, but authorities are numbered across
 * the whole matter — a statute cited on Q1 keeps its number when Q4 relies on
 * it too, so a footnote means the same thing everywhere. The model is told the
 * numbers already in use, but it cannot be trusted to honour them, so the
 * merge matches on the citation itself and assigns a fresh number to anything
 * genuinely new. A source a lawyer has edited is never overwritten.
 */
import type { ResearchAnswer, ResearchAuthority, ResearchFinding } from "@/lib/research.functions";
import type { QuestionResearch } from "./functions";
import { tierFor } from "./model";

/** Citations compare loosely: punctuation and case are noise, the words are not. */
const key = (cite: string) =>
  cite
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export type MergeResult = { answer: ResearchAnswer; renumbered: Map<number, number> };

export function mergeQuestionResearch(
  answer: ResearchAnswer | null,
  research: QuestionResearch,
  issueNo: string,
): MergeResult {
  const existing = answer?.authorities ?? [];
  const byKey = new Map(existing.map((a) => [key(a.cite), a]));
  const used = new Set(existing.map((a) => a.n));
  let next = Math.max(0, ...existing.map((a) => a.n)) + 1;

  const renumbered = new Map<number, number>();
  const added: ResearchAuthority[] = [];
  for (const authority of research.authorities) {
    const match = byKey.get(key(authority.cite));
    if (match) {
      // Already on the record. Keep what is there — a lawyer may have corrected
      // its status or written a note on it — and only fill in blanks.
      renumbered.set(authority.n, match.n);
      if (!match.status && authority.status) match.status = authority.status;
      if (!match.tier && authority.tier) match.tier = authority.tier;
      if (!match.weight && authority.weight) match.weight = authority.weight;
      continue;
    }
    while (used.has(next)) next += 1;
    const n = next;
    used.add(n);
    renumbered.set(authority.n, n);
    const merged: ResearchAuthority = {
      ...authority,
      n,
      tier: authority.tier || tierFor(authority.kind),
      status: authority.status || (authority.kind === "UNVERIFIED" ? "unverified" : ""),
      addedBy: "ai",
    };
    added.push(merged);
    byKey.set(key(merged.cite), merged);
  }

  const map = (n: number) => renumbered.get(n) ?? n;
  const incoming: ResearchFinding[] = research.findings.map((f) => ({
    text: f.text,
    cites: [...new Set(f.cites.map(map))],
    issueNo,
  }));
  // This question's previous findings are replaced; every other question's
  // stand, so re-running one question never disturbs the rest of the matter.
  const kept = (answer?.findings ?? []).filter((f) => (f.issueNo ?? "") !== issueNo);

  return {
    answer: {
      shortAnswer: answer?.shortAnswer ?? "",
      findings: [...kept, ...incoming],
      authorities: [...existing, ...added].sort((a, b) => a.n - b.n),
    },
    renumbered,
  };
}

/** A source the lawyer adds by hand, numbered after everything on the record. */
export function addAuthority(
  answer: ResearchAnswer | null,
  authority: Omit<ResearchAuthority, "n">,
): ResearchAnswer {
  const existing = answer?.authorities ?? [];
  const n = Math.max(0, ...existing.map((a) => a.n)) + 1;
  return {
    shortAnswer: answer?.shortAnswer ?? "",
    findings: answer?.findings ?? [],
    authorities: [...existing, { ...authority, n, addedBy: "lawyer" }].sort((a, b) => a.n - b.n),
  };
}

/** Remove a source, and the citations to it, so nothing points at a gap. */
export function removeAuthority(answer: ResearchAnswer | null, n: number): ResearchAnswer | null {
  if (!answer) return null;
  return {
    ...answer,
    authorities: answer.authorities.filter((a) => a.n !== n),
    findings: answer.findings.map((f) => ({ ...f, cites: f.cites.filter((c) => c !== n) })),
  };
}

export function updateAuthority(
  answer: ResearchAnswer | null,
  n: number,
  patch: Partial<ResearchAuthority>,
): ResearchAnswer | null {
  if (!answer) return null;
  return {
    ...answer,
    authorities: answer.authorities.map((a) => (a.n === n ? { ...a, ...patch } : a)),
  };
}
