import { describe, expect, it } from "vitest";
import type { ClauseDoc } from "./clause-doc";
import type { ClauseNode } from "./contract-editor-tree";
import {
  countChangedClauses,
  filterChangedClauses,
  hasClauseChange,
} from "./contract-editor-changes";

const clause = (num: string, over: Partial<ClauseNode> = {}) =>
  ({
    id: num,
    num,
    title: `Clause ${num}`,
    change: "Baseline",
    risk: "Low",
    status: "Open",
    diff: "",
    analysis: "",
    pb: null,
    page: "1",
    segs: [{ t: "Original wording.", k: "n" }],
    children: [],
    ...over,
  }) as ClauseNode;

describe("clauses carrying changes", () => {
  it("counts a redlined clause and an outstanding proposal, and nothing else", () => {
    const plain = clause("1");
    const redlined = clause("2", {
      segs: [
        { t: "Kept ", k: "n" },
        { t: "removed", k: "d" },
      ],
    });
    const proposed = clause("3", { suggestedText: "Try this instead." });
    expect(hasClauseChange(plain)).toBe(false);
    expect(hasClauseChange(redlined)).toBe(true);
    expect(hasClauseChange(proposed)).toBe(true);
    expect(countChangedClauses([plain, redlined, proposed])).toBe(2);
  });

  it("ignores whitespace-only redline segments and an empty suggestion", () => {
    expect(hasClauseChange(clause("1", { suggestedText: "   " }))).toBe(false);
    expect(
      hasClauseChange(
        clause("2", {
          segs: [
            { t: "Kept.", k: "n" },
            { t: "  ", k: "i" },
          ],
        }),
      ),
    ).toBe(false);
  });

  it("keeps a heading that only locates a changed sub-clause, and prunes its quiet siblings", () => {
    const changedChild = clause("4.2", { suggestedText: "Cap it at 12 months." });
    const parent = clause("4", { children: [clause("4.1"), changedChild] });
    const filtered = filterChangedClauses([parent, clause("5")]);
    expect(filtered.map((node) => node.num)).toEqual(["4"]);
    expect(filtered[0]!.children.map((node) => node.num)).toEqual(["4.2"]);
  });

  it("keeps a changed parent without dragging its unchanged children along", () => {
    const parent = clause("6", {
      segs: [{ t: "New wording", k: "i" }],
      children: [clause("6.1")],
    });
    const filtered = filterChangedClauses([parent]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.children).toEqual([]);
  });

  it("returns nothing at all when the document is clean", () => {
    expect(filterChangedClauses([clause("1", { children: [clause("1.1")] })])).toEqual([]);
  });
});

/**
 * The regression behind the defect: two surfaces answering the same question
 * differently. The Changes pane read `clauses.doc` and said 5 OUTSTANDING; this
 * module read `clause_segments` and disabled "See changes" with "Nothing has
 * changed yet". `segs` is the legacy shadow, kept for export; the marks in the
 * document are the clause.
 */
const docWith = (marks: { type: string; changeId: string }[]): ClauseDoc => ({
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: marks.map((mark, at) => ({
        type: "text",
        text: `run ${at}`,
        marks: [
          {
            type: mark.type,
            attrs: {
              changeId: mark.changeId,
              setId: "set-1",
              authorId: "00000000-0000-4000-8000-000000000001",
              at: "2026-09-16T09:00:00.000Z",
            },
          },
        ],
      })),
    },
  ],
});

describe("the document is the authority, not the legacy segments", () => {
  it("sees a change the marks carry and the segments have never heard of", () => {
    const marked = clause("7", {
      segs: [{ t: "Original wording.", k: "n" }],
      doc: docWith([{ type: "insertion", changeId: "c1" }]),
    });
    expect(hasClauseChange(marked)).toBe(true);
    expect(countChangedClauses([marked])).toBe(1);
  });

  it("calls a clause clean when its document is clean, whatever the stale segments say", () => {
    const settled = clause("8", {
      // Accepted in the editor; the shadow was never rewritten.
      segs: [
        { t: "Kept ", k: "n" },
        { t: "removed", k: "d" },
      ],
      doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Settled wording." }] }] },
    });
    expect(hasClauseChange(settled)).toBe(false);
  });

  it("still answers from the segments for a clause with no document", () => {
    expect(hasClauseChange(clause("9", { segs: [{ t: "New wording", k: "i" }], doc: null }))).toBe(
      true,
    );
    expect(hasClauseChange(clause("10", { segs: [{ t: "Untouched.", k: "n" }] }))).toBe(false);
  });

  it("keeps an outstanding AI proposal ahead of both, since neither records it", () => {
    const proposed = clause("11", {
      suggestedText: "Cap it at 12 months.",
      doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "As sent." }] }] },
    });
    expect(hasClauseChange(proposed)).toBe(true);
  });
});
