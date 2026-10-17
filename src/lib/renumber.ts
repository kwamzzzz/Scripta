/**
 * Renumbering a contract whose own numbering is wrong.
 *
 * There is one numbering. When the lawyer renumbers, the clause's number
 * itself changes, so "clause 1" means the same clause to them, to the review,
 * to the assistant and in the export. What keeps the contract whole:
 *   - a clause keeps its identity (its issues, comments and history are
 *     attached to it, not to its number);
 *   - its parts move with it: when 2 becomes 1, 2.4 becomes 1.3;
 *   - the links between clauses are remapped: clause 5's reference to 2.4
 *     now points at 1.3, so the review still reads the right clause with it;
 *   - wording that still cites the old number is not rewritten; it is listed,
 *     so the lawyer corrects it knowingly.
 * The document's own number is remembered (`documentNum`) for the record and
 * to put the numbering back.
 */
import type { Reference } from "@/lib/subclauses";

export type NumberedClause = { id: string; num: string };

const bare = (num: string) => num.trim().replace(/\.$/, "");

/** The nearest ancestor present in the document: 2.4 → 2, Schedule 1.A.3 → Schedule 1.A. */
function parentOf(num: string, known: Set<string>): string | null {
  let value = bare(num);
  while (value.includes(".")) {
    value = value.slice(0, value.lastIndexOf("."));
    if (known.has(value)) return value;
  }
  return null;
}

/** The last part of a number: "4" of 2.4, "A" of Schedule 1.A, all of "Execution". */
const lastPart = (num: string) => {
  const b = bare(num);
  return b.includes(".") ? b.slice(b.lastIndexOf(".") + 1) : b;
};

/**
 * Every clause numbered in order, in document order: top-level clauses run
 * 1, 2, 3…; a clause's numbered parts run 1, 2, 3… under its new number;
 * lettered parts ("Part A"), schedules and the execution keep their own names
 * under their parent's new number.
 */
export function sequentialNumbers(clauses: NumberedClause[]): Map<string, string> {
  const known = new Set(clauses.map((c) => bare(c.num)));
  const out = new Map<string, string>();
  const renamed = new Map<string, string>(); // old number → new number
  const counters = new Map<string, number>(); // parent's old number → last used
  for (const c of clauses) {
    const num = bare(c.num);
    const parent = parentOf(num, known);
    const own = lastPart(num);
    const base = parent ? (renamed.get(parent) ?? parent) : "";
    let next: string;
    if (/^\d+$/.test(own)) {
      const key = parent ?? "";
      const n = (counters.get(key) ?? 0) + 1;
      counters.set(key, n);
      next = base ? `${base}.${n}` : String(n);
    } else {
      next = base ? `${base}.${own}` : num;
    }
    renamed.set(num, next);
    out.set(c.id, next);
  }
  return out;
}

export type Change = { id: string; from: string; to: string };

/** What renumbering in order would change. */
export function renumberPlan(clauses: NumberedClause[]): Change[] {
  const next = sequentialNumbers(clauses);
  return clauses
    .map((c) => ({ id: c.id, from: bare(c.num), to: next.get(c.id) ?? bare(c.num) }))
    .filter((c) => c.from !== c.to);
}

/**
 * The full set of changes a lawyer's edits imply: a clause renumbered takes
 * its parts with it (2 → 1 makes 2.4 → 1.4, unless 2.4 is itself being
 * renumbered). Throws where two clauses would end up with one number.
 */
export function cascade(clauses: NumberedClause[], edits: { id: string; to: string }[]): Change[] {
  const wanted = new Map(edits.map((e) => [e.id, bare(e.to)]));
  const oldNum = new Map(clauses.map((c) => [c.id, bare(c.num)]));
  const next = new Map<string, string>();
  // Longest edited prefix wins, so an explicit edit on a part beats its parent's.
  const edited = [...wanted.entries()].map(([id, to]) => ({ from: oldNum.get(id)!, to }));
  for (const c of clauses) {
    const num = bare(c.num);
    const own = wanted.get(c.id);
    if (own !== undefined) {
      next.set(c.id, own);
      continue;
    }
    const ancestor = edited
      .filter((e) => num.startsWith(`${e.from}.`))
      .sort((a, b) => b.from.length - a.from.length)[0];
    next.set(c.id, ancestor ? `${ancestor.to}${num.slice(ancestor.from.length)}` : num);
  }
  const seen = new Map<string, string>();
  for (const c of clauses) {
    const n = next.get(c.id)!;
    if (!n) throw new Error("A clause number cannot be blank.");
    const other = seen.get(n);
    if (other) throw new Error(`Two clauses would both be numbered ${n}.`);
    seen.set(n, c.id);
  }
  return clauses
    .map((c) => ({ id: c.id, from: bare(c.num), to: next.get(c.id)! }))
    .filter((c) => c.from !== c.to);
}

export type Citation = { cites: string; now: string };

/**
 * A clause's references, pointed at the new numbers. "8.3(b)" follows 8.3.
 * Also returns each citation whose number changed: the wording still says
 * the old one, and the lawyer needs to know.
 */
export function remapRefs(
  refs: Reference[],
  renamed: Map<string, string>,
): { refs: Reference[]; moved: Citation[] } {
  const moved: Citation[] = [];
  const out = refs.map((ref) => {
    if (ref.type !== "clause" && ref.type !== "section") return ref;
    const target = bare(ref.target);
    const m = /^([^(]+)(\(.*\))?$/.exec(target);
    const base = m?.[1]?.trim() ?? target;
    const tail = m?.[2] ?? "";
    const to = renamed.get(base);
    if (!to || to === base) return ref;
    moved.push({ cites: target, now: `${to}${tail}` });
    return { ...ref, target: `${to}${tail}` };
  });
  return { refs: out, moved };
}

/**
 * Wording that still cites a clause by the number the document gave it,
 * after the lawyer renumbered that clause: "see clause 2.4" in clause 5,
 * where 2.4 is now 1.3. Read from the wording itself, so it stays right
 * however many times the contract is renumbered, and it clears once the
 * wording is corrected.
 */
export function staleCitations(
  clauses: (NumberedClause & { documentNum: string | null; text: string })[],
  citedIn: (text: string) => Reference[],
): { clauseId: string; clauseNum: string; cites: string; now: string }[] {
  const renumbered = new Map(
    clauses
      .filter((c) => c.documentNum && bare(c.documentNum) !== bare(c.num))
      .map((c) => [bare(c.documentNum!), bare(c.num)]),
  );
  const current = new Set(clauses.map((c) => bare(c.num)));
  const out: { clauseId: string; clauseNum: string; cites: string; now: string }[] = [];
  for (const c of clauses) {
    for (const ref of citedIn(c.text)) {
      if (ref.type !== "clause" && ref.type !== "section") continue;
      const target = bare(ref.target);
      const base = target.replace(/\(.*$/, "").trim();
      const now = renumbered.get(base);
      // Cited by a number the document used and the clause no longer has. If
      // some clause has since taken that number, the citation is ambiguous,
      // which is all the more reason to look at it.
      if (now && (now !== base || !current.has(base)))
        out.push({
          clauseId: c.id,
          clauseNum: bare(c.num),
          cites: target,
          now: `${now}${target.slice(base.length)}`,
        });
    }
  }
  return out;
}
