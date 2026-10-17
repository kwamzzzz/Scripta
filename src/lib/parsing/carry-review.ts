/**
 * Carrying a review across a re-reading of the document.
 *
 * ---------------------------------------------------------------------------
 * WHY
 * ---------------------------------------------------------------------------
 *
 * `extractClauses` rebuilds the register from scratch and matches nothing, so
 * every assessment is orphaned and deleted — even for a clause whose wording
 * did not change by a character. On the agreement that prompted this, the
 * wording was identical throughout and only the numbering moved: a cover page
 * that had been taken for clause 1 put every number out by one. Fixing that
 * cost a full review run of eighty-three clauses to read words that had
 * already been read.
 *
 * So the new register is matched to the old one by WORDING, and the
 * assessments of clauses whose wording is unchanged are carried over.
 *
 * ---------------------------------------------------------------------------
 * WHAT COUNTS AS THE SAME CLAUSE — AND WHY IT IS THIS STRICT
 * ---------------------------------------------------------------------------
 *
 * Identical wording, after normalising only what cannot carry meaning:
 * whitespace, the quotation marks and dashes Word substitutes, and the
 * invisible marks it wraps around cross-references. Nothing fuzzy. An
 * assessment is a judgement about particular words, and carrying it onto
 * words it was not written about would put a stale verdict beside new
 * wording, where a lawyer would read it as current. Re-reading a clause costs
 * one call; getting this wrong costs the reliability of the whole register.
 *
 * A match must also be unambiguous on both sides. "Not used" appears eleven
 * times in a set of standard terms, and there is no way to tell which one an
 * assessment belonged to, so none of them carries.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS DOES NOT FIX
 * ---------------------------------------------------------------------------
 *
 * A carried assessment is sound about the clause it is attached to, because
 * those words are the same words. Its PROSE may still cite other clauses by
 * numbers that have since moved — which is the fault this whole episode began
 * with. Carrying the assessment saves the cost of re-reading; it does not make
 * the old reading's cross-references right, and callers are told how many
 * clauses were renumbered so they can say so.
 */

/** The wording, with only what cannot carry meaning taken out. */
export function normaliseForMatch(text: string): string {
  return text
    .replace(/[​-‏‪-‮﻿]/g, "")
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * What a clause row records about the REVIEW rather than about the document.
 *
 * Everything here is a judgement or a decision about the clause's wording —
 * the analysis, the research-backed tag, the risk, the approval, who it is
 * assigned to — and every one of them costs either an AI call or a lawyer's
 * attention. They were being rebuilt as blanks on every re-read, which is why
 * correcting the numbering of a contract also stripped the tags off clauses
 * whose words had not changed.
 *
 * Deliberately not here: num, title, ordinal, doc, kind, refs, page_ref,
 * document_num, parts_numbered, change, diff_summary and the document ids.
 * Those describe the document as it has just been read, so they must come
 * from the reading and not from the register being replaced.
 */
export const REVIEW_FIELDS = [
  "analysis",
  "analysis_error",
  "analysis_source",
  "classification",
  "classification_reason",
  "classification_source",
  "risk",
  "confidence",
  "suggested_text",
  "review_state",
  "approval",
  "assignee_id",
  "status",
] as const;

export type OldClause = {
  id: string;
  num: string;
  text: string;
  /** The `REVIEW_FIELDS` of the old row, to be written onto the new one. */
  review?: Record<string, unknown>;
  /**
   * Written in Scripta rather than read out of the document, so the document
   * being read again cannot match it and must not delete it. See
   * `placeDraftedClauses`.
   */
  draftedHere?: boolean;
  /**
   * When this clause entered the register. Carried through untouched so a
   * re-read can put it back on a clause whose wording and number are both
   * unchanged, which is what keeps findings about it from looking stale.
   */
  createdAt?: string | null;
};
export type NewClause = { num: string; text: string };

export type Carry = {
  /** Index into the new register → the old clause whose wording it repeats. */
  matched: Map<number, OldClause>;
  /** Matched, but the clause is numbered differently now. */
  renumbered: number;
  /** New clauses with no match: these are what still need reading. */
  unmatched: number;
};

/**
 * Which new clauses repeat the wording of an old one.
 *
 * Only wording that appears exactly once on each side is matched, so a
 * duplicated provision is never guessed at.
 */
export function matchByWording(previous: OldClause[], next: NewClause[]): Carry {
  const index = (rows: { text: string }[]) => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const key = normaliseForMatch(row.text);
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  };

  const oldCounts = index(previous);
  const newCounts = index(next);
  const oldByKey = new Map<string, OldClause>();
  for (const row of previous) {
    const key = normaliseForMatch(row.text);
    if (key && oldCounts.get(key) === 1) oldByKey.set(key, row);
  }

  const matched = new Map<number, OldClause>();
  let renumbered = 0;
  next.forEach((row, at) => {
    const key = normaliseForMatch(row.text);
    if (!key || newCounts.get(key) !== 1) return;
    const was = oldByKey.get(key);
    if (!was) return;
    matched.set(at, was);
    if (was.num.trim() !== row.num.trim()) renumbered += 1;
  });

  return { matched, renumbered, unmatched: next.length - matched.size };
}

/* ------------------------------------------------- reading it back in -- */

/**
 * The review as it stands, before the register is rebuilt under it.
 *
 * Taken first because `clause_assessments` cascades on the clause delete: once
 * the rows are gone there is nothing left to carry, and a re-read of a
 * document whose wording never changed cost a full review run of clauses that
 * had already been read.
 */
export async function snapshotReview(supabase: any, matterId: string) {
  const { data, error } = await supabase
    .from("clauses")
    .select(
      `id, num, created_at, drafted_here, ${REVIEW_FIELDS.join(", ")},` +
        " clause_segments(ordinal, text, kind), clause_assessments(*)",
    )
    .eq("matter_id", matterId)
    .order("ordinal");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as any[];
  const clauses: OldClause[] = rows.map((r) => ({
    id: r.id,
    num: String(r.num ?? ""),
    createdAt: r.created_at ?? null,
    draftedHere: !!r.drafted_here,
    // A field the read did not return is left out rather than nulled: several
    // of these columns are NOT NULL with a default, and writing null to one
    // would fail the insert after the old register has already gone.
    review: Object.fromEntries(
      REVIEW_FIELDS.filter((f) => r[f] !== undefined).map((f) => [f, r[f]]),
    ),
    // The operative wording: what a deletion took out is not part of it.
    text: [...(r.clause_segments ?? [])]
      .sort((a: any, b: any) => a.ordinal - b.ordinal)
      .filter((x: any) => x.kind !== "d")
      .map((x: any) => x.text)
      .join(""),
  }));
  const assessments = new Map<string, any[]>(
    rows.map((r) => [r.id, (r.clause_assessments ?? []) as any[]]),
  );

  /**
   * Which versions belong to which clause, read BEFORE the delete.
   *
   * A revision survives its clause — the record of what a document said is not
   * the register's to destroy — but the foreign key detaches it, so after the
   * delete there is nothing left to tell us which clause it was about. This is
   * the last moment that is knowable.
   */
  const { data: versions, error: versionErr } = await supabase
    .from("clause_revisions")
    .select("id, clause_id")
    .eq("matter_id", matterId);
  if (versionErr) throw new Error(versionErr.message);
  const revisions = new Map<string, string[]>();
  for (const row of (versions ?? []) as { id: string; clause_id: string | null }[]) {
    if (!row.clause_id) continue;
    const list = revisions.get(row.clause_id) ?? [];
    list.push(row.id);
    revisions.set(row.clause_id, list);
  }

  return { clauses, assessments, revisions };
}

/**
 * Put the kept assessments back, against the clauses that repeat their wording.
 *
 * `id` is dropped so each row is written afresh, and `created_at` is kept so
 * the record still says when the clause was actually read. Issues are
 * re-pointed at the same time: a finding whose clause survived should still
 * open that clause.
 */
export async function carryReviewOver(
  supabase: any,
  matterId: string,
  pairs: { newId: string; was: OldClause }[],
  assessments: Map<string, any[]>,
  /** Versions by old clause id, from `snapshotReview`. */
  revisions: Map<string, string[]> = new Map(),
) {
  let carried = 0;
  for (const { newId, was } of pairs) {
    const rows = (assessments.get(was.id) ?? []).map((a) => {
      const { id: _id, clause_id: _clauseId, ...rest } = a;
      return { ...rest, clause_id: newId };
    });
    if (rows.length) {
      const { error } = await supabase.from("clause_assessments").insert(rows);
      if (error) throw new Error(error.message);
      carried += rows.length;
    }
    await supabase
      .from("contract_issues")
      .update({ clause_id: newId })
      .eq("matter_id", matterId)
      .eq("clause_id", was.id);

    /* The history of this wording follows the row that now holds it. Only
       `clause_id` is touched, which is the one change a revision permits. */
    const versions = revisions.get(was.id) ?? [];
    if (versions.length) {
      const { error } = await supabase
        .from("clause_revisions")
        .update({ clause_id: newId })
        .in("id", versions);
      if (error) throw new Error(error.message);
    }
  }
  return carried;
}

/**
 * Where the clauses WE drafted belong in the register that has just been read.
 *
 * A clause a lawyer inserted has no counterpart in the counterparty's file, so
 * a re-read — which rebuilds the register from that file — has nothing to match
 * it to. Deleting it would be the worst possible answer: the lawyer's own
 * drafting, gone, because they asked the parser to read the document again.
 *
 * So it is kept, and put back after the clause it used to follow. That clause
 * is found by wording, like everything else in this file, which means the
 * insertion survives the numbering moving around it — the whole reason a
 * re-read happens. Where the clause above it has gone from the document
 * altogether, the next one up is used; where none of them survive, the
 * insertion goes to the front, which is visible rather than silent.
 *
 * `spacing` is the gap left between two document clauses' ordinals, so an
 * insertion can sit between them without the register having to be shifted.
 */
export function placeDraftedClauses(
  previous: OldClause[],
  matched: Map<number, OldClause>,
  spacing: number,
): { id: string; ordinal: number }[] {
  const newIndexOf = new Map<string, number>();
  for (const [at, was] of matched) newIndexOf.set(was.id, at);

  const used = new Map<number, number>();
  const out: { id: string; ordinal: number }[] = [];

  previous.forEach((clause, at) => {
    if (!clause.draftedHere) return;
    let anchor = -1;
    for (let above = at - 1; above >= 0; above--) {
      const candidate = previous[above]!;
      if (candidate.draftedHere) continue;
      const found = newIndexOf.get(candidate.id);
      if (found !== undefined) {
        anchor = found;
        break;
      }
    }
    const nth = (used.get(anchor) ?? 0) + 1;
    used.set(anchor, nth);
    // Between the anchor and the clause after it, in the order they were
    // inserted. An insertion with nothing above it sorts before the document.
    out.push({ id: clause.id, ordinal: anchor === -1 ? -nth : anchor * spacing + nth });
  });

  return out;
}
