import { describe, expect, it } from "vitest";
import { docToParas } from "./rich-doc";
import type { ClauseDoc } from "@/wireframe/clause-doc";

const text = (t: string, marks?: { type: string }[]) => ({
  type: "text",
  text: t,
  ...(marks ? { marks } : {}),
});
const para = (...content: ReturnType<typeof text>[]) => ({ type: "paragraph", content });
const doc = (...content: unknown[]): ClauseDoc =>
  ({ type: "doc", content }) as unknown as ClauseDoc;

describe("docToParas", () => {
  it("carries bold, italic and underline onto the runs", () => {
    const out = docToParas(
      doc(
        para(
          text("The rate is "),
          text("enforceable", [{ type: "bold" }, { type: "italic" }]),
          text("."),
        ),
      ),
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.runs).toEqual([
      { t: "The rate is ", k: "n" },
      { t: "enforceable", k: "n", m: { b: true, i: true } },
      { t: ".", k: "n" },
    ]);
  });

  it("keeps a heading a heading, clamped to the three levels Word is given", () => {
    const out = docToParas(
      doc(
        { type: "heading", attrs: { level: 1 }, content: [text("Question")] },
        { type: "heading", attrs: { level: 9 }, content: [text("Too deep")] },
      ),
    );
    expect(out[0]!.heading).toBe(1);
    expect(out[1]!.heading).toBe(3);
  });

  it("carries alignment, but says nothing when it is the default", () => {
    const out = docToParas(
      doc(
        { type: "paragraph", attrs: { textAlign: "justify" }, content: [text("Justified.")] },
        { type: "paragraph", attrs: { textAlign: "left" }, content: [text("Ordinary.")] },
      ),
    );
    expect(out[0]!.align).toBe("justify");
    expect(out[1]!.align).toBeUndefined();
  });

  it("makes a lettered sub-paragraph a real list item", () => {
    const out = docToParas(
      doc({
        type: "orderedList",
        content: [
          { type: "listItem", content: [para(text("first"))] },
          { type: "listItem", content: [para(text("second"))] },
        ],
      }),
    );
    expect(out.map((p) => [p.list, p.level, p.runs[0]!.t])).toEqual([
      ["ordered", 0, "first"],
      ["ordered", 0, "second"],
    ]);
  });

  it("counts a list inside a list item as one level deeper", () => {
    const out = docToParas(
      doc({
        type: "orderedList",
        content: [
          {
            type: "listItem",
            content: [
              para(text("outer")),
              {
                type: "bulletList",
                content: [{ type: "listItem", content: [para(text("inner"))] }],
              },
            ],
          },
        ],
      }),
    );
    expect(out.map((p) => [p.list, p.level, p.runs[0]!.t])).toEqual([
      ["ordered", 0, "outer"],
      ["bullet", 1, "inner"],
    ]);
  });

  it("indents a block quotation", () => {
    const out = docToParas(doc({ type: "blockquote", content: [para(text("Quoted."))] }));
    expect(out[0]!.quote).toBe(true);
  });

  it("turns a hard break into a line break inside the run", () => {
    const out = docToParas(doc({ type: "paragraph", content: [text("one"), { type: "hardBreak" }, text("two")] }));
    expect(out[0]!.runs.map((r) => r.t)).toEqual(["one", "\n", "two"]);
  });

  it("keeps a blank line between paragraphs but drops trailing ones", () => {
    const out = docToParas(
      doc(para(text("one")), { type: "paragraph" }, para(text("two")), { type: "paragraph" }),
    );
    expect(out).toHaveLength(3);
    expect(out[1]!.runs[0]!.t).toBe("");
    expect(out[2]!.runs[0]!.t).toBe("two");
  });

  it("reads an absent document as nothing to export", () => {
    expect(docToParas(null)).toEqual([]);
    expect(docToParas({ type: "doc", content: [] })).toEqual([]);
  });
});
