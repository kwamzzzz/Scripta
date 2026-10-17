import { describe, expect, it } from "vitest";
import {
  carryReviewOver,
  matchByWording,
  normaliseForMatch,
  placeDraftedClauses,
  REVIEW_FIELDS,
  snapshotReview,
  type OldClause,
} from "./carry-review";

describe("carrying a review across a re-reading", () => {
  it("matches a clause whose wording is unchanged but whose number moved", () => {
    // Exactly the case that prompted this: identical words, every number out
    // by one because a cover page had been taken for clause 1.
    const previous = [
      { id: "a", num: "2.1", text: "The Service Provider shall perform the Services." },
      { id: "b", num: "3.1", text: "The Client shall provide accurate Client Materials." },
    ];
    const next = [
      { num: "1.1", text: "The Service Provider shall perform the Services." },
      { num: "2.1", text: "The Client shall provide accurate Client Materials." },
    ];
    const carry = matchByWording(previous, next);
    expect(carry.matched.get(0)!.id).toBe("a");
    expect(carry.matched.get(1)!.id).toBe("b");
    expect(carry.renumbered).toBe(2);
    expect(carry.unmatched).toBe(0);
  });

  it("does not carry an assessment onto wording that changed", () => {
    const previous = [{ id: "a", num: "5.3", text: "Payment within sixty (60) days." }];
    const next = [{ num: "5.3", text: "Payment within thirty (30) days." }];
    const carry = matchByWording(previous, next);
    expect(carry.matched.size).toBe(0);
    expect(carry.unmatched).toBe(1);
  });

  it("ignores the marks Word substitutes, which carry no meaning", () => {
    const previous = [{ id: "a", num: "1", text: "the “Client” — see clause ‎4" }];
    const next = [{ num: "1", text: 'the "Client" - see clause 4' }];
    expect(matchByWording(previous, next).matched.size).toBe(1);
  });

  it("refuses to guess when the same wording appears twice", () => {
    // "Not used" appears all over a set of standard terms and there is no way
    // to tell which one an assessment belonged to.
    const previous = [
      { id: "a", num: "6", text: "Not used" },
      { id: "b", num: "8", text: "Not used" },
    ];
    const next = [
      { num: "6", text: "Not used" },
      { num: "8", text: "Not used" },
    ];
    expect(matchByWording(previous, next).matched.size).toBe(0);
  });

  it("refuses when wording is unique before but duplicated after", () => {
    const previous = [{ id: "a", num: "6", text: "Not used" }];
    const next = [
      { num: "6", text: "Not used" },
      { num: "9", text: "Not used" },
    ];
    expect(matchByWording(previous, next).matched.size).toBe(0);
  });

  it("skips empty clauses rather than matching them to each other", () => {
    const previous = [{ id: "a", num: "1", text: "   " }];
    const next = [{ num: "1", text: "" }];
    expect(matchByWording(previous, next).matched.size).toBe(0);
  });

  it("counts a match that kept its number as not renumbered", () => {
    const previous = [{ id: "a", num: "4.2", text: "Either Party may request a change." }];
    const next = [{ num: "4.2", text: "Either Party may request a change." }];
    const carry = matchByWording(previous, next);
    expect(carry.matched.size).toBe(1);
    expect(carry.renumbered).toBe(0);
  });

  it("normalises only what cannot carry meaning", () => {
    expect(normaliseForMatch("  A  B\n")).toBe("a b");
    expect(normaliseForMatch("sixty (60)")).not.toBe(normaliseForMatch("thirty (30)"));
  });
});

/* ------------------------------------------------- reading it back in -- */

/**
 * A stub of the one thing the carry does to the database, so the shape of
 * what is written can be asserted without a database. The rows it writes are
 * rows it has just read back out of the same table, so the risk is never the
 * columns — it is dropping the wrong key, or writing the survivors against
 * the wrong clause, and both are visible here.
 */
const stub = () => {
  const writes: { table: string; op: string; rows?: any; match?: any; patch?: any }[] = [];
  const supabase = {
    from(table: string) {
      const chain: any = {
        select: () => chain,
        eq: (col: string, val: string) => {
          const last = writes.at(-1);
          if (last && last.table === table) last.match = { ...(last.match ?? {}), [col]: val };
          return chain;
        },
        order: () => chain,
        insert: (rows: any) => {
          writes.push({ table, op: "insert", rows });
          return Promise.resolve({ error: null });
        },
        update: (patch: any) => {
          writes.push({ table, op: "update", patch });
          return chain;
        },
        then: (resolve: any) => resolve({ error: null }),
      };
      return chain;
    },
  };
  return { supabase, writes };
};

describe("carryReviewOver", () => {
  const was = (id: string, num: string): OldClause => ({ id, num, text: "x", createdAt: "2026-01-01" });

  it("writes each assessment afresh against the clause that kept its wording", async () => {
    const { supabase, writes } = stub();
    const assessments = new Map<string, any[]>([
      [
        "old-1",
        [
          {
            id: "a-1",
            clause_id: "old-1",
            matter_id: "m",
            summary: "Uncapped liability",
            created_at: "2026-09-01T10:00:00Z",
          },
        ],
      ],
    ]);

    const carried = await carryReviewOver(
      supabase,
      "m",
      [{ newId: "new-1", was: was("old-1", "6") }],
      assessments,
    );

    expect(carried).toBe(1);
    const insert = writes.find((w) => w.table === "clause_assessments");
    expect(insert?.rows).toEqual([
      {
        clause_id: "new-1",
        matter_id: "m",
        summary: "Uncapped liability",
        created_at: "2026-09-01T10:00:00Z",
      },
    ]);
    // The old row's own id must not travel with it: it belongs to a row that
    // the clause delete has already taken away.
    expect(Object.keys(insert?.rows[0] ?? {})).not.toContain("id");
  });

  it("re-points the findings raised against the clause", async () => {
    const { supabase, writes } = stub();
    await carryReviewOver(supabase, "m", [{ newId: "new-1", was: was("old-1", "6") }], new Map());
    const update = writes.find((w) => w.table === "contract_issues");
    expect(update?.patch).toEqual({ clause_id: "new-1" });
    expect(update?.match).toEqual({ matter_id: "m", clause_id: "old-1" });
  });

  it("touches nothing for a clause the re-read did not keep", async () => {
    const { supabase, writes } = stub();
    const carried = await carryReviewOver(supabase, "m", [], new Map([["old-1", [{ id: "a" }]]]));
    expect(carried).toBe(0);
    expect(writes).toEqual([]);
  });
});

describe("snapshotReview", () => {
  it("reads the operative wording, ignoring what a deletion took out", async () => {
    const supabase = {
      from: () => {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          order: () =>
            Promise.resolve({
              error: null,
              data: [
                {
                  id: "c-1",
                  num: "6",
                  created_at: "2026-01-01",
                  clause_segments: [
                    { ordinal: 2, text: "shall be capped.", kind: "n" },
                    { ordinal: 1, text: "Liability ", kind: "n" },
                    { ordinal: 3, text: " No it shall not.", kind: "d" },
                  ],
                  clause_assessments: [{ id: "a-1" }],
                },
              ],
            }),
        };
        return chain;
      },
    };

    const { clauses, assessments } = await snapshotReview(supabase, "m");
    expect(clauses).toEqual([
      {
        id: "c-1",
        num: "6",
        createdAt: "2026-01-01",
        text: "Liability shall be capped.",
        review: {},
        draftedHere: false,
      },
    ]);
    expect(assessments.get("c-1")).toEqual([{ id: "a-1" }]);
  });
});

describe("REVIEW_FIELDS", () => {
  it("carries the judgements about the clause, not the reading of it", () => {
    // The tags, analysis and decisions are what a re-read used to strip off
    // clauses whose words had not changed.
    expect(REVIEW_FIELDS).toContain("classification");
    expect(REVIEW_FIELDS).toContain("analysis");
    expect(REVIEW_FIELDS).toContain("risk");
    expect(REVIEW_FIELDS).toContain("approval");
    // These describe the document as it has just been read. Carrying them
    // would put the old reading back over the new one, which is the very bug
    // a re-read is used to fix.
    for (const field of [
      "num",
      "title",
      "ordinal",
      "doc",
      "kind",
      "refs",
      "page_ref",
      "document_num",
      "change",
      "diff_summary",
      "source_document_id",
    ])
      expect(REVIEW_FIELDS).not.toContain(field);
  });

  it("reads them off the old row so they can be written onto the new one", async () => {
    const supabase = {
      from: () => {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          order: () =>
            Promise.resolve({
              error: null,
              data: [
                {
                  id: "c-1",
                  num: "4",
                  created_at: "2026-01-01",
                  classification: "negotiable",
                  classification_source: "human",
                  analysis: "A commercial term, not a legal one.",
                  risk: "low",
                  clause_segments: [{ ordinal: 1, text: "Liability.", kind: "n" }],
                  clause_assessments: [],
                },
              ],
            }),
        };
        return chain;
      },
    };

    const { clauses } = await snapshotReview(supabase, "m");
    expect(clauses[0]?.review).toMatchObject({
      classification: "negotiable",
      classification_source: "human",
      analysis: "A commercial term, not a legal one.",
      risk: "low",
    });
    // Only what the row actually holds. A column the read did not return is
    // left out, because several of them are NOT NULL and writing a null would
    // fail the insert with the old register already deleted.
    expect(Object.keys(clauses[0]?.review ?? {}).sort()).toEqual([
      "analysis",
      "classification",
      "classification_source",
      "risk",
    ]);
  });
});

describe("placeDraftedClauses", () => {
  const doc = (id: string, num: string, text: string): OldClause => ({
    id,
    num,
    text,
    draftedHere: false,
  });
  const ours = (id: string, num: string): OldClause => ({
    id,
    num,
    text: `our ${id}`,
    draftedHere: true,
  });

  /**
   * The case this exists for: the numbering was read wrongly, the document is
   * read again, and the clause the lawyer drafted must come back between the
   * same two clauses — not vanish, and not surface somewhere else because the
   * numbers moved.
   */
  it("puts our clause back after the clause it used to follow", () => {
    const previous = [doc("a", "1", "First."), ours("x", "1A"), doc("b", "2", "Second.")];
    // The re-read renumbered everything: "First." is now clause 2.
    const matched = new Map([
      [0, doc("a", "1", "First.")],
      [1, doc("b", "2", "Second.")],
    ]);
    expect(placeDraftedClauses(previous, matched, 10)).toEqual([{ id: "x", ordinal: 1 }]);
  });

  it("keeps two insertions in the same place in the order they were made", () => {
    const previous = [doc("a", "1", "First."), ours("x", "1A"), ours("y", "1B")];
    const matched = new Map([[3, doc("a", "1", "First.")]]);
    expect(placeDraftedClauses(previous, matched, 10)).toEqual([
      { id: "x", ordinal: 31 },
      { id: "y", ordinal: 32 },
    ]);
  });

  it("looks further up when the clause above has gone from the document", () => {
    const previous = [
      doc("a", "1", "Kept."),
      doc("b", "2", "Deleted by the other side."),
      ours("x", "2A"),
    ];
    const matched = new Map([[5, doc("a", "1", "Kept.")]]);
    expect(placeDraftedClauses(previous, matched, 10)).toEqual([{ id: "x", ordinal: 51 }]);
  });

  it("brings it to the front rather than losing it when nothing above survives", () => {
    const previous = [doc("a", "1", "All new wording now."), ours("x", "1A")];
    expect(placeDraftedClauses(previous, new Map(), 10)).toEqual([{ id: "x", ordinal: -1 }]);
  });

  it("has nothing to do when every clause came from the document", () => {
    const previous = [doc("a", "1", "First."), doc("b", "2", "Second.")];
    expect(placeDraftedClauses(previous, new Map([[0, doc("a", "1", "First.")]]), 10)).toEqual([]);
  });
});
