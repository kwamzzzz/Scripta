/**
 * The migration converter, proved before it touches legal text.
 *
 * The wording in these cases is invented; the SHAPES are taken from the live
 * matter — a flat paragraph, a paragraph carrying formatting, and a paragraph
 * followed by a two-column table whose entire text was recorded by the old
 * model as one insertion. The client's actual contract text is deliberately not
 * committed to this repository as a fixture.
 *
 * The correctness condition is asserted in every case, because it is the same
 * condition the migration itself checks against all 417 real clauses before it
 * commits anything:
 *
 *   operative(converted)  === rebuildOriginal(segments)
 *   ifAccepted(converted) === rebuildAmendment(segments)
 */
import { describe, expect, it } from "vitest";
import { rebuildAmendment, rebuildOriginal, type DiffSeg } from "@/lib/parsing/word-diff";
import { type ClauseDoc } from "./clause-doc";
import { ifAccepted, operative, changesIn } from "./tracked-change";
import {
  convertClause,
  isFlat,
  MigrationRefused,
  sameWording,
  UNATTRIBUTED,
  wordingOf,
} from "./segments-to-marks";

const CLAUSE = "c0c2b172-4856-4e84-bf40-fafe7f9dee42";
const AT = "2026-09-16T00:00:00.000Z";

const n = (t: string): DiffSeg => ({ k: "n", t });
const i = (t: string): DiffSeg => ({ k: "i", t });
const d = (t: string): DiffSeg => ({ k: "d", t });

/** The condition the migration itself enforces, applied to a converted clause. */
const holdsTheCondition = (segs: DiffSeg[], doc: ClauseDoc) => {
  expect(sameWording(wordingOf(operative(doc)), rebuildOriginal(segs))).toBe(true);
  expect(sameWording(wordingOf(ifAccepted(doc)), rebuildAmendment(segs))).toBe(true);
};

describe("a clause nobody has marked up", () => {
  const segs = [n("The Supplier shall deliver the Goods to the Delivery Point. ")];

  it("keeps its document untouched", () => {
    const doc: ClauseDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "The Supplier shall deliver the Goods to the " },
            { type: "text", text: "Delivery Point", marks: [{ type: "bold" }] },
            { type: "text", text: "." },
          ],
        },
      ],
    };
    const result = convertClause(segs, doc, CLAUSE, AT);
    expect(result.route).toBe("unchanged");
    expect(result.doc).toEqual(doc);
    expect(changesIn(result.doc)).toEqual([]);
  });

  it("takes the current wording as its baseline, because nothing was proposed", () => {
    const result = convertClause(segs, null, CLAUSE, AT);
    expect(wordingOf(result.baseline)).toBe(wordingOf(result.doc));
    holdsTheCondition(segs, result.doc);
  });

  it("builds a document when the clause has none", () => {
    const result = convertClause(segs, null, CLAUSE, AT);
    expect(wordingOf(result.doc)).toBe(
      "The Supplier shall deliver the Goods to the Delivery Point.",
    );
  });
});

describe("a flat clause with a redline", () => {
  /* The shape of live clause 1.1: one plain paragraph, insertions and deletions.
     Rebuilding from segments loses nothing, because an unformatted paragraph
     holds no more than its words. */
  const segs = [
    n("The Employee shall give "),
    d("one month "),
    i("three months "),
    n("notice in writing"),
    i(" to the Employer"),
    n(". "),
  ];

  const result = convertClause(segs, null, CLAUSE, AT);

  it("is rebuilt from the segments", () => {
    expect(result.route).toBe("rebuilt");
  });

  it("holds the correctness condition", () => {
    holdsTheCondition(segs, result.doc);
  });

  it("reads as received when nothing is accepted", () => {
    expect(wordingOf(operative(result.doc))).toBe(
      "The Employee shall give one month notice in writing.",
    );
  });

  it("reads as amended if everything is accepted", () => {
    expect(wordingOf(ifAccepted(result.doc))).toBe(
      "The Employee shall give three months notice in writing to the Employer.",
    );
  });

  it("carries the baseline separately, because it is not derivable later", () => {
    expect(wordingOf(result.baseline)).toBe("The Employee shall give one month notice in writing.");
  });

  it("attributes migrated changes to nobody, rather than inventing an author", () => {
    const changes = changesIn(result.doc);
    expect(changes.length).toBeGreaterThan(0);
    expect(new Set(changes.map((c) => c.authorId))).toEqual(new Set([UNATTRIBUTED]));
  });

  it("groups them as one set, so they can be settled together", () => {
    expect(new Set(changesIn(result.doc).map((c) => c.setId)).size).toBe(1);
  });
});

describe("a structured clause whose table was inserted", () => {
  /* The shape of live clause 1.5, and the case that forced the document to win:
     a lawyer added a table, and the old diff recorded the whole thing as one
     insertion of the concatenated cell text. */
  const segs = [
    n("Notice periods are set out below. "),
    i("Band Notice Probation One week Confirmed One month "),
  ];

  const cell = (text: string, header = false): ClauseDoc["content"][number] => ({
    type: header ? "tableHeader" : "tableCell",
    attrs: { colspan: 1, rowspan: 1 },
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });

  const doc: ClauseDoc = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Notice periods are set out below." }] },
      {
        type: "table",
        content: [
          { type: "tableRow", content: [cell("Band", true), cell("Notice", true)] },
          { type: "tableRow", content: [cell("Probation"), cell("One week")] },
          { type: "tableRow", content: [cell("Confirmed"), cell("One month")] },
        ],
      },
    ],
  };

  const result = convertClause(segs, doc, CLAUSE, AT);

  it("marks the document in place rather than rebuilding it", () => {
    expect(result.route).toBe("marked-in-place");
  });

  /* The assertion this whole case exists for. */
  it("does not destroy the table", () => {
    expect(result.doc.content).toHaveLength(2);
    expect(result.doc.content[1]!.type).toBe("table");
    expect(result.doc.content[1]!.content).toHaveLength(3);
  });

  it("holds the correctness condition", () => {
    holdsTheCondition(segs, result.doc);
  });

  it("treats the whole table as the proposal it was", () => {
    expect(wordingOf(operative(result.doc))).toBe("Notice periods are set out below.");
    expect(wordingOf(ifAccepted(result.doc))).toContain("Probation One week");
  });

  it("leaves the unchanged paragraph unmarked", () => {
    const firstText = result.doc.content[0]!.content![0]!;
    expect(firstText.marks ?? []).toEqual([]);
  });

  it("marks every cell of the inserted table", () => {
    const marked: string[] = [];
    const walk = (node: {
      text?: string | undefined;
      marks?: { type: string }[] | undefined;
      content?: unknown[] | undefined;
    }) => {
      if (typeof node.text === "string" && node.marks?.some((m) => m.type === "insertion"))
        marked.push(node.text.trim());
      (node.content as (typeof node)[] | undefined)?.forEach(walk);
    };
    result.doc.content.forEach((node) => walk(node as never));
    expect(marked.sort()).toEqual(
      ["Band", "Confirmed", "Notice", "One month", "One week", "Probation"].sort(),
    );
  });
});

describe("the case the migration refuses rather than guesses", () => {
  /* Deleted words are absent from the document, so putting them back inside a
     table or a list is a guess about where legal wording used to sit. No clause
     in the matter is in this state; if one ever is, the migration stops. */
  const segs = [n("Before the table. "), d("A deleted sentence. "), i("Inserted. ")];
  const structured: ClauseDoc = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Before the table. Inserted." }] },
      { type: "table", content: [] },
    ],
  };

  it("refuses, and names the clause", () => {
    expect(() => convertClause(segs, structured, CLAUSE, AT)).toThrow(MigrationRefused);
    expect(() => convertClause(segs, structured, CLAUSE, AT)).toThrow(/Convert it by hand/);
  });

  it("does not refuse the same clause when it is flat", () => {
    expect(() => convertClause(segs, null, CLAUSE, AT)).not.toThrow();
  });
});

describe("isFlat", () => {
  it("treats a missing document as flat", () => {
    expect(isFlat(null)).toBe(true);
  });

  it("treats one plain paragraph as flat", () => {
    expect(
      isFlat({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "A." }] }],
      }),
    ).toBe(true);
  });

  it("does not treat formatting as flat", () => {
    expect(
      isFlat({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "A.", marks: [{ type: "bold" }] }] },
        ],
      }),
    ).toBe(false);
  });

  it("does not treat a table as flat", () => {
    expect(isFlat({ type: "doc", content: [{ type: "table", content: [] }] })).toBe(false);
  });

  it("ignores a trailing empty paragraph, which the editor leaves behind", () => {
    expect(
      isFlat({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "A." }] },
          { type: "paragraph" },
        ],
      }),
    ).toBe(true);
  });
});

describe("the condition holds across awkward redlines", () => {
  const cases: [string, DiffSeg[]][] = [
    ["a pure insertion", [n("Keep. "), i("Add. ")]],
    ["a pure deletion", [n("Keep. "), d("Drop. ")]],
    ["a replacement", [n("The cap is "), d("24 months"), i("12 months"), n(" of fees. ")]],
    ["an insertion at the start", [i("New first. "), n("Then the rest. ")]],
    ["a deletion at the end", [n("Kept. "), d("Gone. ")]],
    ["everything deleted", [d("All of it. ")]],
    ["everything inserted", [i("All of it. ")]],
    ["alternating runs", [n("a "), i("b "), n("c "), d("e "), i("f "), n("g ")]],
  ];

  for (const [name, segs] of cases) {
    it(name, () => {
      const result = convertClause(segs, null, CLAUSE, AT);
      holdsTheCondition(segs, result.doc);
      expect(wordingOf(result.baseline)).toBe(rebuildOriginal(segs));
    });
  }
});
