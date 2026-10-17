import { placeholdersIn } from "@/lib/templates";
import type { SegKind } from "@/lib/export/docx";
import { splitClause } from "@/lib/subclauses";

/**
 * Turning drafted clauses into the contract the rest of the app already knows.
 *
 * Everything downstream — the Contract Editor, the playbook check, the Final
 * Document tab, both exporters — reads `clauses` and `clause_segments`. So a
 * drafted contract is not a new kind of thing with a new screen. It is rows in
 * those two tables, and the moment they exist every one of those surfaces
 * works without being told about drafting at all.
 *
 * The interesting decision is which segment kinds to write, because that is
 * what decides whether a comparison exists:
 *
 *  - Drafting from scratch writes ordinary text. There is no prior version, so
 *    nothing is tracked, and the Final Document tab shows one document rather
 *    than two identical columns with one of them labelled a comparison.
 *
 *  - Converting an existing contract writes the old wording as a deletion and
 *    the new wording as an insertion. The redline is then not an account of
 *    what the model changed — it is the change itself, and a lawyer can read
 *    every edit rather than trusting a summary of them.
 */

export type DraftedClause = {
  num: string;
  title: string;
  text: string;
};

/** What a conversion decided about one clause of the original. */
export type ConversionVerdict = "keep" | "rewrite" | "delete" | "new";

export type ConvertedClause = DraftedClause & {
  verdict: ConversionVerdict;
  /** The wording being replaced or removed. Absent for a genuinely new clause. */
  priorText?: string | undefined;
};

export type SegmentPlan = { ordinal: number; text: string; kind: SegKind };

export type ClauseRowPlan = {
  num: string;
  title: string;
  ordinal: number;
  segments: SegmentPlan[];
};

const seg = (text: string, kind: SegKind, ordinal: number): SegmentPlan => ({
  ordinal,
  text,
  kind,
});

/**
 * A contract drafted from nothing.
 *
 * Empty clauses are dropped rather than written as a heading with no body: a
 * clause that says nothing is not a clause, and printing one would put a
 * number in the contract that a reader has to go looking behind.
 *
 * A drafted clause arrives as one block of prose, and a clause is rarely one
 * thing: "Definitions and Interpretation" is thirty definitions, each of which
 * is negotiated and marked on its own. Each part therefore becomes its own row,
 * so it can carry its own status, its own assessment and its own instruction.
 * Where the clause really is one thing, it stays one row — `splitClause`
 * returns no parts and there is nothing to wrap.
 */
export function assembleFreshContract(clauses: DraftedClause[]): ClauseRowPlan[] {
  const rows: ClauseRowPlan[] = [];
  for (const c of clauses) {
    const text = c.text.trim();
    if (!text) continue;
    const title = c.title.trim() || "Untitled clause";
    const { lead, parts } = splitClause(c.num, text);

    if (!parts.length) {
      rows.push({ num: c.num, title, ordinal: rows.length + 1, segments: [seg(text, "n", 1)] });
      continue;
    }

    // The section keeps its heading and whatever introduces the parts. It can
    // be empty — a clause that is only sub-clauses still needs its number and
    // name, which is what the editor nests the parts beneath.
    rows.push({
      num: c.num,
      title,
      ordinal: rows.length + 1,
      segments: lead ? [seg(lead, "n", 1)] : [],
    });
    for (const part of parts)
      rows.push({
        num: part.num,
        title: part.title,
        ordinal: rows.length + 1,
        segments: [seg(part.text, "n", 1)],
      });
  }
  return rows;
}

/**
 * A contract converted from one agreement type to another.
 *
 * A kept clause carries no change, so it stays ordinary text: marking it as an
 * insertion would put edits in the redline that nobody made, which is the
 * quickest way to make a redline useless.
 */
export function assembleConversion(clauses: ConvertedClause[]): ClauseRowPlan[] {
  const rows: ClauseRowPlan[] = [];
  clauses.forEach((c, i) => {
    const prior = (c.priorText ?? "").trim();
    const next = c.text.trim();
    const segments: SegmentPlan[] = [];

    if (c.verdict === "keep") {
      if (!next && !prior) return;
      segments.push(seg(next || prior, "n", 1));
    } else if (c.verdict === "delete") {
      if (!prior) return;
      segments.push(seg(prior, "d", 1));
    } else {
      // rewrite and new: the old wording struck, the new wording inserted.
      if (prior) segments.push(seg(prior, "d", segments.length + 1));
      if (next) segments.push(seg(next, "i", segments.length + 1));
      if (!segments.length) return;
    }

    rows.push({
      num: c.num,
      title: c.title.trim() || "Untitled clause",
      ordinal: i + 1,
      segments,
    });
  });
  return rows;
}

/**
 * Everything the draft still needs a human to supply.
 *
 * The model is told to mark anything it was not given as a {{placeholder}}
 * rather than invent a party, a sum or a date — the same form Templates
 * already uses, so one convention covers both. That instruction is worth
 * nothing on its own: it is worth something only if the screen can list what
 * came back unfilled, so the gaps are a checklist rather than something a
 * counterparty finds.
 */
export function draftPlaceholders(rows: ClauseRowPlan[]): { clause: string; fields: string[] }[] {
  return rows
    .map((row) => {
      const text = row.segments
        .filter((s) => s.kind !== "d")
        .map((s) => s.text)
        .join("\n");
      const fields = [...new Set(placeholdersIn(text))];
      return { clause: [row.num, row.title].filter(Boolean).join(" "), fields };
    })
    .filter((entry) => entry.fields.length > 0);
}

/** Whether the assembled document supports a comparison at all. */
export const isComparable = (rows: ClauseRowPlan[]): boolean =>
  rows.some((r) => r.segments.some((s) => s.kind !== "n"));
