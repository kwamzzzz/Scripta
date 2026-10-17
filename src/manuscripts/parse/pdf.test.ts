import { describe, expect, it } from "vitest";
import type { ParsedNode } from "../model";
import { itemsToLines, layoutToManuscript, type PdfLine } from "./pdf";

const W = 612;
const H = 792;

/** A line of a synthetic page. Full lines reach the right margin (540). */
function line(
  page: number,
  top: number,
  text: string,
  o: Partial<Pick<PdfLine, "size" | "x" | "right" | "bold" | "sups" | "leadSup">> = {},
): PdfLine {
  return {
    page,
    text,
    top,
    x: o.x ?? 72,
    right: o.right ?? 540,
    size: o.size ?? 12,
    bold: o.bold ?? false,
    pageWidth: W,
    pageHeight: H,
    sups: o.sups ?? [],
    ...(o.leadSup !== undefined ? { leadSup: o.leadSup } : {}),
  };
}

const furniture = (page: number) => [
  line(page, 40, "Rivers and the Law", { size: 10, right: 300 }),
  line(page, 760, String(page), { size: 10, x: 300, right: 306 }),
];

function manuscript() {
  const p1 = [
    ...furniture(1).slice(0, 1),
    line(1, 120, "Chapter 1", { size: 18, right: 200 }),
    line(1, 145, "Introduction", { size: 18, right: 220 }),
    line(1, 200, "The study of inter-"),
    line(1, 214, "national law begins with a claim.", { sups: ["1"], right: 320 }),
    line(1, 228, "A second paragraph starts here and runs", { x: 90 }),
    line(1, 242, "on to the end of it.", { right: 200 }),
    line(1, 280, "1.1 Background", { size: 14, right: 220 }),
    line(1, 310, "Background text is here and it", {}),
    line(1, 324, "continues.", { right: 150 }),
    line(1, 720, "1 See Smith (2001), p. 4.", { size: 9, right: 250 }),
    furniture(1)[1]!,
  ];
  const p2 = [
    ...furniture(2).slice(0, 1),
    line(2, 100, "1.2 Scope", { size: 14, right: 200 }),
    line(2, 130, "Scope is narrow and this paragraph", {}),
    line(2, 144, "has a note with no visible marker.", { right: 330 }),
    line(2, 720, "2 Another note that", { size: 9, right: 540 }),
    line(2, 731, "runs over two lines.", { size: 9, right: 200 }),
    furniture(2)[1]!,
  ];
  const p3 = [
    ...furniture(3).slice(0, 1),
    line(3, 120, "CHAPTER 2", { size: 18, right: 200 }),
    line(3, 145, "Method", { size: 18, right: 220 }),
    line(3, 200, "Table 3.1: Sites visited", { right: 240 }),
    line(3, 230, "Method text sits here.", { right: 250 }),
    furniture(3)[1]!,
  ];
  const p4 = [
    ...furniture(4).slice(0, 1),
    line(4, 120, "References", { size: 18, right: 200 }),
    line(4, 160, "Adams, J. (2001) Rivers. London: Press.", { right: 350 }),
    line(4, 190, "Baker, K. (2010) Deltas. Oxford: OUP.", { right: 350 }),
    furniture(4)[1]!,
  ];
  return layoutToManuscript([p1, p2, p3, p4], "rivers.pdf");
}

const byText = (nodes: ParsedNode[], text: string) => {
  const n = nodes.find((x) => x.text === text);
  if (!n) throw new Error(`no node "${text}" in ${nodes.map((x) => x.text).join(" / ")}`);
  return n;
};

describe("layoutToManuscript", () => {
  it("ranks headings by size and finds chapters", () => {
    const doc = manuscript();
    const ch1 = byText(doc.nodes, "Chapter 1 Introduction");
    expect(ch1).toMatchObject({ kind: "chapter", level: 1, number: "1", page: 1, style: "18" });
    const bg = byText(doc.nodes, "1.1 Background");
    expect(bg).toMatchObject({
      kind: "heading",
      level: 2,
      number: "1.1",
      parentKey: ch1.key,
      chapterKey: ch1.key,
    });
    const ch2 = byText(doc.nodes, "CHAPTER 2 Method");
    expect(ch2).toMatchObject({ kind: "chapter", number: "2", page: 3 });
    expect(byText(doc.nodes, "Method text sits here.").chapterKey).toBe(ch2.key);
    expect(doc.format).toBe("pdf");
    expect(doc.title).toBe("rivers");
  });

  it("drops running headers and page numbers", () => {
    const doc = manuscript();
    const texts = doc.nodes.map((n) => n.text);
    expect(texts.some((t) => t.includes("Rivers and the Law"))).toBe(false);
    expect(texts).not.toContain("1");
    expect(doc.warnings).toContain("Running headers, footers and page numbers were left out.");
    expect(doc.warnings[0]).toMatch(/inferred from its layout/);
  });

  it("joins hyphenated line breaks and splits paragraphs by indent and short lines", () => {
    const doc = manuscript();
    const first = byText(doc.nodes, "The study of international law begins with a claim.");
    expect(first.kind).toBe("paragraph");
    expect(
      byText(doc.nodes, "A second paragraph starts here and runs on to the end of it.").kind,
    ).toBe("paragraph");
  });

  it("reads footnotes and links them to their paragraph", () => {
    const doc = manuscript();
    const host = byText(doc.nodes, "The study of international law begins with a claim.");
    expect(host.noteRefs).toEqual(["1"]);
    const n1 = doc.nodes.find((n) => n.kind === "footnote" && n.number === "1")!;
    expect(n1).toMatchObject({ text: "See Smith (2001), p. 4.", parentKey: host.key, page: 1 });
    expect(doc.nodes[doc.nodes.indexOf(host) + 1]).toBe(n1);
    // No superscript marker on page 2: attached to the last paragraph there, and said so.
    const scope = byText(
      doc.nodes,
      "Scope is narrow and this paragraph has a note with no visible marker.",
    );
    const n2 = doc.nodes.find((n) => n.kind === "footnote" && n.number === "2")!;
    expect(n2).toMatchObject({
      text: "Another note that runs over two lines.",
      parentKey: scope.key,
      page: 2,
    });
    expect(doc.warnings.some((w) => /matched to their paragraph by position/.test(w))).toBe(true);
  });

  it("keeps page provenance on every node", () => {
    const doc = manuscript();
    expect(doc.nodes.every((n) => typeof n.page === "number")).toBe(true);
    expect(byText(doc.nodes, "1.2 Scope").page).toBe(2);
  });

  it("finds captions and the bibliography", () => {
    const doc = manuscript();
    expect(byText(doc.nodes, "Table 3.1: Sites visited")).toMatchObject({
      kind: "caption",
      number: "Table 3.1",
      label: "Sites visited",
    });
    const refs = byText(doc.nodes, "References");
    expect(refs.kind).toBe("chapter");
    const entries = doc.nodes.filter((n) => n.kind === "bibliography_entry");
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.chapterKey === refs.key && e.page === 4)).toBe(true);
  });

  it("reads a contents page as entries and a title page as front matter", () => {
    const pages: PdfLine[][] = [
      [
        line(1, 200, "Rivers and the Law", { size: 24, right: 400 }),
        line(1, 300, "A thesis submitted for the degree of Doctor of Philosophy", { right: 450 }),
      ],
      [
        line(2, 100, "Contents", { size: 16, right: 200 }),
        line(2, 140, "Chapter 1 Introduction .......... 1"),
        line(2, 154, "Chapter 2 A method that has a long title and"),
        line(2, 168, "wraps .......... 9"),
      ],
      [line(3, 100, "Chapter 1", { size: 16, right: 200 }), line(3, 140, "Words.", { right: 150 })],
      [
        line(4, 100, "Chapter 2", { size: 16, right: 200 }),
        line(4, 140, "More words.", { right: 150 }),
      ],
    ];
    const doc = layoutToManuscript(pages, "t.pdf");
    expect(doc.title).toBe("Rivers and the Law");
    expect(doc.nodes.filter((n) => n.kind === "toc_entry").map((n) => n.text)).toEqual([
      "Chapter 1 Introduction",
      "Chapter 2 A method that has a long title and wraps",
    ]);
    expect(doc.nodes.filter((n) => n.kind === "chapter").map((n) => n.text)).toEqual([
      "Chapter 1",
      "Chapter 2",
    ]);
    expect(
      byText(doc.nodes, "A thesis submitted for the degree of Doctor of Philosophy").kind,
    ).toBe("front");
  });

  it("says when there is no text layer", () => {
    const doc = layoutToManuscript([[], []], "scan.pdf");
    expect(doc.nodes).toEqual([]);
    expect(doc.warnings.some((w) => /no readable text/.test(w))).toBe(true);
  });
});

describe("itemsToLines", () => {
  it("groups items into lines and lifts out superscript markers", () => {
    const lines = itemsToLines(
      [
        { str: "The claim", x: 72, y: 200, width: 50, size: 12, bold: false },
        { str: "7", x: 122, y: 196, width: 4, size: 7, bold: false },
        { str: "holds.", x: 130, y: 200, width: 30, size: 12, bold: false },
        { str: "Next line", x: 72, y: 214, width: 50, size: 12, bold: true },
      ],
      1,
      W,
      H,
    );
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ text: "The claim holds.", sups: ["7"], size: 12, top: 200 });
    expect(lines[1]).toMatchObject({ text: "Next line", bold: true });
  });
});

describe("an opening title set at chapter size", () => {
  it("is the title, and the abstract after it is front matter, when chapters are numbered", () => {
    const body = (page: number, top: number) =>
      line(
        page,
        top,
        "The regulation of small-scale mining shapes what miners do and why they stay outside the licensing system for so long.",
      );
    const doc = layoutToManuscript(
      [
        [
          line(1, 80, "Regulating Artisanal Gold in Ghana", { size: 24, right: 400 }),
          line(1, 130, "Abstract", { size: 24, right: 160 }),
          body(1, 170),
          line(1, 230, "1 Introduction", { size: 24, right: 220 }),
          body(1, 270),
          line(1, 330, "2 Literature Review", { size: 24, right: 260 }),
          body(1, 370),
        ],
      ],
      "t.pdf",
    );
    const chapters = doc.nodes.filter((n) => n.kind === "chapter").map((n) => n.text);
    expect(chapters).toEqual(["1 Introduction", "2 Literature Review"]);
    expect(doc.nodes.filter((n) => n.kind === "front").map((n) => n.text)).toContain("Abstract");
  });
});
