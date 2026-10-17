/**
 * Does the agreement agree with its schedules?
 *
 * The checks here need no model, and so are certain:
 *   missing        the agreement relies on a schedule it does not attach
 *   unreferenced   a schedule is attached and nothing in the agreement uses it
 *   total          a table's stated total is not the sum of its rows
 * The judgement calls (a payment term in clause 5 against the fee table, a
 * service level promised in the body and a lower one in the schedule) are
 * made by the model in the conformity check that uses these; see
 * review/conformity.functions.ts.
 */
import { TABLE_ROW, rowCells } from "@/lib/parsing/blocks";
import type { Reference } from "@/lib/subclauses";

export type ConformityClause = {
  id: string;
  num: string;
  title: string;
  refs: Reference[];
  text: string;
};

export type Finding = {
  clauseId: string;
  check: "missing" | "unreferenced" | "total" | "numbering";
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  detail: string;
  recommendation: string;
};

const LABEL: Partial<Record<Reference["type"], string>> = {
  schedule: "Schedule",
  annex: "Annex",
  appendix: "Appendix",
  exhibit: "Exhibit",
};

const SCHEDULE_NUM = /^(Schedule|Annex|Appendix|Exhibit|Attachment)\b/;

/** A schedule's own number, for anything filed under it ("Schedule 1.2" → "Schedule 1"). */
export function scheduleOf(num: string): string | null {
  const n = num.trim();
  if (!SCHEDULE_NUM.test(n)) return null;
  return n.split(".")[0]!.trim();
}

/** The schedule a reference points at, filed as the parser files it. */
export function referencedSchedule(ref: Reference): string | null {
  const label = LABEL[ref.type];
  return label ? `${label} ${ref.target.trim().replace(/\.$/, "").toUpperCase()}` : null;
}

/** "the Schedules form part of this Agreement": a general incorporation. */
const GENERAL = /\b(schedules|annexes|annexures|appendices|exhibits)\b/i;

export function structuralFindings(clauses: ConformityClause[]): Finding[] {
  const findings: Finding[] = [];
  const heads = new Map(
    clauses.filter((c) => scheduleOf(c.num) === c.num.trim()).map((c) => [c.num.trim(), c]),
  );
  const referenced = new Map<string, ConformityClause[]>();
  for (const c of clauses) {
    const own = scheduleOf(c.num);
    for (const ref of c.refs) {
      const target = referencedSchedule(ref);
      // A schedule mentioning itself does not incorporate it.
      if (!target || target === own) continue;
      referenced.set(target, [...(referenced.get(target) ?? []), c]);
    }
  }

  for (const [target, by] of referenced) {
    if (heads.has(target)) continue;
    const first = by[0]!;
    const where = [...new Set(by.map((c) => c.num))].join(", ");
    findings.push({
      clauseId: first.id,
      check: "missing",
      severity: "high",
      title: `${target} is relied on but not attached`,
      detail: `Clause ${where} refer${by.length === 1 ? "s" : ""} to ${target}, and no ${target} forms part of this document. Whatever the agreement expects ${target} to set out is, as the document stands, not agreed.`,
      recommendation: `Attach ${target}, or amend clause ${where} so that it does not depend on it.`,
    });
  }

  const operative = clauses.filter((c) => !scheduleOf(c.num));
  const generally = operative.some((c) => GENERAL.test(c.text));
  for (const [num, head] of heads) {
    if (referenced.has(num)) continue;
    findings.push({
      clauseId: head.id,
      check: "unreferenced",
      severity: generally ? "low" : "medium",
      title: `${num} is attached but the agreement never refers to it`,
      detail: generally
        ? `The agreement incorporates its schedules generally, but no clause says what ${num} (${head.title}) is for, so its effect on the parties' obligations is left to inference.`
        : `No clause refers to ${num} (${head.title}), and the agreement does not incorporate its schedules generally. It may not form part of the contract at all.`,
      recommendation: `Refer to ${num} in the clause it supports, or confirm it is meant to form part of the agreement.`,
    });
  }

  for (const c of clauses) for (const f of tableTotals(c)) findings.push(f);
  findings.push(...numberingGaps(clauses));
  return findings;
}

/**
 * Numbers the drafter skipped: an agreement that starts at clause 2, a 2.4
 * with no 2.3, a schedule Part whose paragraphs go 1, 2, 4. Usually a deleted
 * provision whose cross-references were not followed up, which is exactly
 * where a reference ends up pointing at the wrong clause.
 */
export function numberingGaps(clauses: ConformityClause[]): Finding[] {
  const groups = new Map<string, { n: number; clause: ConformityClause }[]>();
  for (const c of clauses) {
    const num = c.num.trim();
    const m = /^(.*?)(?:^|\.)(\d{1,3})$/.exec(num);
    if (!m) continue;
    // Only clause numbers and schedule paragraphs: "Execution" and the like are not numbered.
    if (!/^\d/.test(num) && !scheduleOf(num)) continue;
    const parent = m[1] ?? "";
    groups.set(parent, [...(groups.get(parent) ?? []), { n: Number(m[2]), clause: c }]);
  }
  const out: Finding[] = [];
  for (const [parent, members] of groups) {
    const have = new Set(members.map((x) => x.n));
    const max = Math.max(...have);
    if (max > 80) continue;
    const missing: number[] = [];
    for (let n = 1; n < max; n += 1) if (!have.has(n)) missing.push(n);
    if (!missing.length || missing.length > 5) continue;
    const label = (n: number) => (parent ? `${parent}.${n}` : `clause ${n}`);
    const after = members.filter((x) => x.n > missing[0]!).sort((a, b) => a.n - b.n)[0]!.clause;
    const where = parent ? (scheduleOf(parent) ? parent : `clause ${parent}`) : "The agreement";
    out.push({
      clauseId: after.id,
      check: "numbering",
      severity: "low",
      title: `Numbering skips ${missing.map(label).join(", ")}`,
      detail: `${where === "The agreement" ? "The agreement's clauses" : `The provisions of ${where}`} run ${[...have].sort((a, b) => a - b).join(", ")}: ${missing.map(label).join(", ")} ${missing.length === 1 ? "is" : "are"} missing. A provision may have been deleted without the numbering, or the cross-references to it, being updated.`,
      recommendation:
        "Renumber, or restore the missing provision, and check every cross-reference against the new numbers.",
    });
  }
  return out;
}

/** 25,000 · USD 4,500.00 · $1,200 · (300) — an amount, and nothing else. */
function amount(cell: string): number | null {
  const t = cell.trim();
  if (!t || /%|per\b|\/|x\b|×/i.test(t)) return null;
  const m =
    /^[A-Za-z$€£₵]{0,4}\s*(\(?)(-?\d{1,3}(?:,\d{3})*(?:\.\d+)?|-?\d+(?:\.\d+)?)(\)?)\s*[A-Za-z]{0,4}$/.exec(
      t,
    );
  if (!m) return null;
  const n = Number(m[2]!.replace(/,/g, ""));
  return m[1] && m[3] ? -n : n;
}

/** A "Total" row whose figures are not the sum of the rows above it. */
export function tableTotals(c: ConformityClause): Finding[] {
  const out: Finding[] = [];
  const lines = c.text.split(/\n/).map((l) => l.trim());
  let rows: string[][] = [];
  const check = () => {
    if (rows.length < 3) return;
    const totalAt = rows.findIndex((r) => /^(grand\s+)?(total|sum)\b/i.test(r[0] ?? ""));
    if (totalAt <= 1) return;
    const header = rows[0]!;
    const body = rows.slice(1, totalAt);
    const total = rows[totalAt]!;
    for (let col = 1; col < total.length; col += 1) {
      const stated = amount(total[col] ?? "");
      if (stated === null) continue;
      const values = body.map((r) => amount(r[col] ?? ""));
      if (values.some((v) => v === null)) continue;
      const sum = values.reduce<number>((a, v) => a + (v ?? 0), 0);
      if (Math.abs(sum - stated) > 0.005) {
        const column = header[col] || `column ${col + 1}`;
        out.push({
          clauseId: c.id,
          check: "total",
          severity: "high",
          title: `${c.num}: the total does not add up`,
          detail: `In the table in ${c.num}, the “${column}” column totals ${sum.toLocaleString("en-GB")}, but the table states ${total[col]}.`,
          recommendation:
            "Correct the total or the figures above it, and confirm which figure the parties agreed.",
        });
      }
    }
  };
  for (const line of lines) {
    if (TABLE_ROW.test(line)) {
      rows.push(rowCells(line));
      continue;
    }
    if (line) {
      check();
      rows = [];
    }
  }
  check();
  return out;
}
