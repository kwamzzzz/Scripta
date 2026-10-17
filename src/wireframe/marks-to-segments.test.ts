/**
 * A tracked clause on its way into Word.
 *
 * The assertion this file exists for is W1: EVERY RUN KEEPS ITS OWN AUTHOR.
 * A marked-up contract exported with one name in every margin has thrown away
 * the thing the whole phase was built to keep, at the moment it matters most —
 * when the counterparty opens the file.
 */
import { describe, expect, it } from "vitest";
import type { ClauseDoc } from "./clause-doc";
import { docToParas, docToSegs } from "./marks-to-segments";
import { HIGHLIGHT } from "./highlight-mark";

const change = (type: string, authorId: string) => ({
  type,
  attrs: { changeId: `c-${authorId}`, setId: "s1", authorId, at: "2026-09-16T09:00:00.000Z" },
});

const NAMES: Record<string, string> = { p: "Podrick Robogo", m: "Mawusi Kwame" };
const nameOf = (id: string) => NAMES[id] ?? id;

describe("a tracked clause becomes Word paragraphs", () => {
  const doc: ClauseDoc = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "The Seller shall " },
          { type: "text", text: "promptly ", marks: [change("insertion", "p")] },
          { type: "text", text: "deliver " },
          { type: "text", text: "forthwith ", marks: [change("deletion", "m")] },
          { type: "text", text: "the Shares." },
        ],
      },
    ],
  };

  /* W1. */
  it("keeps every run's own author", () => {
    const [para] = docToParas(doc, nameOf);
    expect(para!.runs.map((r) => [r.k, r.a])).toEqual([
      ["n", undefined],
      ["i", "Podrick Robogo"],
      ["n", undefined],
      ["d", "Mawusi Kwame"],
      ["n", undefined],
    ]);
  });

  it("carries the words through unchanged", () => {
    const [para] = docToParas(doc, nameOf);
    expect(para!.runs.map((r) => r.t).join("")).toBe(
      "The Seller shall promptly deliver forthwith the Shares.",
    );
  });

  /* Word cannot show a run that is being inserted and deleted at once, and the
     later act is the one that stands: a proposal to add has been overtaken by
     a proposal to remove. */
  it("sends wording that was proposed and then struck as a deletion", () => {
    const both: ClauseDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "promptly",
              marks: [change("insertion", "p"), change("deletion", "m")],
            },
          ],
        },
      ],
    };
    expect(docToParas(both, nameOf)[0]!.runs[0]!.k).toBe("d");
  });

  it("keeps sub-paragraphs apart rather than running them together", () => {
    const multi: ClauseDoc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "(a) first" }] },
        { type: "paragraph", content: [{ type: "text", text: "(b) second" }] },
      ],
    };
    expect(docToParas(multi, nameOf)).toHaveLength(2);
  });

  it("finds text nested under other marks", () => {
    const nested: ClauseDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Material Adverse Effect",
              marks: [{ type: "bold" }, change("insertion", "p")],
            },
          ],
        },
      ],
    };
    const [para] = docToParas(nested, nameOf);
    expect(para!.runs[0]).toMatchObject({ t: "Material Adverse Effect", k: "i", m: { b: true } });
  });

  /* Clause 1.5's table is why the step 2 migration let the document win over
     clause_segments. A row silently dropped on the way out would undo that. */
  it("sends a table to Word as a table, cell by cell", () => {
    const table: ClauseDoc = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Band A" }] }],
                },
                {
                  type: "tableCell",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "10%" }] }],
                },
              ],
            },
          ],
        },
      ],
    };
    const paras = docToParas(table, nameOf);
    expect(paras).toHaveLength(1);
    const grid = paras[0]!.grid!;
    expect(grid.rows).toHaveLength(1);
    expect(grid.rows[0]!.cells.map((cell) => cell.map((r) => r.t).join(""))).toEqual([
      "Band A",
      "10%",
    ]);
  });

  it("gives an empty document nothing rather than an empty paragraph", () => {
    expect(docToParas({ type: "doc", content: [] }, nameOf)).toEqual([]);
    expect(docToParas(null, nameOf)).toEqual([]);
  });

  it("flattens to segments with the paragraphs still separated", () => {
    const multi: ClauseDoc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "first" }] },
        { type: "paragraph", content: [{ type: "text", text: "second" }] },
      ],
    };
    expect(docToSegs(multi, nameOf).map((s) => s.t)).toEqual(["first", " ", "second"]);
  });
});

/**
 * The date goes out with the name.
 *
 * Phase 5 argued that attributing every revision to one person throws away what
 * the phase was built to keep, "at exactly the moment it matters most". The
 * date was losing that same argument silently: every revision carried the
 * moment of export, so a counterparty opening a negotiation in Word saw every
 * proposal made in the same second. Found by the export pass in the
 * clause-workflow acceptance review.
 */
describe("when a run was proposed", () => {
  const AT = "2026-09-16T09:12:00.000Z";
  const marked = (kind: "insertion" | "deletion"): ClauseDoc => ({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Payment within " },
          {
            type: "text",
            text: "thirty",
            marks: [
              { type: kind, attrs: { changeId: "c1", setId: "s1", authorId: "u1", at: AT } },
            ],
          },
          { type: "text", text: " days." },
        ],
      },
    ],
  });

  it("travels with the run, for both kinds of proposal", () => {
    for (const kind of ["insertion", "deletion"] as const) {
      const runs = docToSegs(marked(kind), () => "Somebody");
      const proposed = runs.find((run) => run.k !== "n");
      expect(proposed?.d).toBe(AT);
    }
  });

  it("is absent on wording nobody proposed, so the export falls back", () => {
    const runs = docToSegs(marked("insertion"), () => "Somebody");
    const untouched = runs.filter((run) => run.k === "n");
    expect(untouched.length).toBeGreaterThan(0);
    for (const run of untouched) expect(run.d).toBeUndefined();
  });
});

describe("the highlighter", () => {
  it("leaves as Word's highlight, and is not a proposed change", () => {
    const doc: ClauseDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Fees are " },
            { type: "text", text: "USD 6,000", marks: [{ type: HIGHLIGHT }] },
          ],
        },
      ],
    };
    const [para] = docToParas(doc, nameOf);
    expect(para!.runs[1]).toEqual({ t: "USD 6,000", k: "n", m: { hl: true } });
    // Highlighting the counterparty's wording proposes nothing about it.
    expect(para!.runs.every((r) => r.k === "n")).toBe(true);
  });
});
