import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import type { ParsedNode } from "../model";
import { parseDocx } from "./docx";

const W_NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const run = (text: string) => `<w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
const p = (text: string, style?: string, extra = "") =>
  `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}${run(text)}${extra}</w:p>`;
const fnRef = (id: number) => `<w:r><w:footnoteReference w:id="${id}"/></w:r>`;
const table = (rows: string[][]) =>
  `<w:tbl>${rows
    .map((r) => `<w:tr>${r.map((c) => `<w:tc>${p(c)}</w:tc>`).join("")}</w:tr>`)
    .join("")}</w:tbl>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8"?><w:styles ${W_NS}>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="2"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="ChapterHead"><w:name w:val="Chapter Head"/><w:basedOn w:val="Heading1"/></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/></w:style>
  <w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/></w:style>
  <w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/></w:style>
  <w:style w:type="paragraph" w:styleId="TOC1"><w:name w:val="toc 1"/></w:style>
  <w:style w:type="paragraph" w:styleId="TOC2"><w:name w:val="toc 2"/></w:style>
  <w:style w:type="paragraph" w:styleId="TOCHeading"><w:name w:val="TOC Heading"/><w:basedOn w:val="Heading1"/><w:pPr><w:outlineLvl w:val="9"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/></w:style>
</w:styles>`;

const footnotes = (notes: Record<number, string>) =>
  `<?xml version="1.0"?><w:footnotes ${W_NS}>
  <w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>
  <w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>
  ${Object.entries(notes)
    .map(
      ([id, text]) =>
        `<w:footnote w:id="${id}"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr><w:r><w:footnoteRef/></w:r>${run(` ${text}`)}</w:p></w:footnote>`,
    )
    .join("")}
</w:footnotes>`;

async function docx(
  body: string,
  opts: { styles?: string; footnotes?: string; core?: string; numbering?: string } = {},
): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W_NS}><w:body>${body}<w:sectPr/></w:body></w:document>`,
  );
  zip.file("word/styles.xml", opts.styles ?? STYLES);
  if (opts.footnotes) zip.file("word/footnotes.xml", opts.footnotes);
  if (opts.core) zip.file("docProps/core.xml", opts.core);
  if (opts.numbering) zip.file("word/numbering.xml", opts.numbering);
  return zip.generateAsync({ type: "arraybuffer" });
}

const byText = (nodes: ParsedNode[], text: string) => {
  const n = nodes.find((x) => x.text === text);
  if (!n) throw new Error(`no node "${text}" in ${nodes.map((x) => x.text).join(" / ")}`);
  return n;
};

describe("parseDocx", () => {
  it("builds the heading hierarchy with chapter and parent keys", async () => {
    const doc = await parseDocx(
      await docx(
        [
          p("Introduction", "Heading1"),
          p("Opening words."),
          p("1.1 Background", "Heading2"),
          p("Background words."),
          p("1.1.1 Detail", "Heading3"),
          p("Detail words."),
          p("Method", "ChapterHead"),
          p("Method words."),
        ].join(""),
      ),
      "thesis.docx",
    );
    const intro = byText(doc.nodes, "Introduction");
    expect(intro).toMatchObject({
      kind: "chapter",
      level: 1,
      key: "n1",
      chapterKey: "n1",
      parentKey: null,
      source: 1,
    });
    const bg = byText(doc.nodes, "1.1 Background");
    expect(bg).toMatchObject({
      kind: "heading",
      level: 2,
      number: "1.1",
      parentKey: intro.key,
      chapterKey: intro.key,
    });
    const detail = byText(doc.nodes, "1.1.1 Detail");
    expect(detail).toMatchObject({ kind: "heading", level: 3, number: "1.1.1", parentKey: bg.key });
    expect(byText(doc.nodes, "Detail words.")).toMatchObject({
      kind: "paragraph",
      parentKey: detail.key,
      chapterKey: intro.key,
    });
    // A custom style based on Heading 1 inherits its outline level.
    const method = byText(doc.nodes, "Method");
    expect(method).toMatchObject({ kind: "chapter", level: 1, style: "Chapter Head" });
    expect(byText(doc.nodes, "Method words.")).toMatchObject({
      parentKey: method.key,
      chapterKey: method.key,
    });
    expect(doc.nodes.map((n) => n.key)).toEqual(doc.nodes.map((_, i) => `n${i + 1}`));
    expect(doc.title).toBe("thesis");
  });

  it("keeps front matter apart, labelled by its heading", async () => {
    const doc = await parseDocx(
      await docx(
        [
          p("On Rivers", "Title"),
          p("Abstract", "Heading1"),
          p("This thesis studies rivers."),
          p("Acknowledgements", "Heading1"),
          p("Thanks to all."),
          p("Introduction", "Heading1"),
          p("Rivers flow."),
        ].join(""),
      ),
      "rivers.docx",
    );
    expect(doc.title).toBe("On Rivers");
    expect(byText(doc.nodes, "Abstract")).toMatchObject({
      kind: "front",
      label: "Abstract",
      parentKey: null,
      chapterKey: null,
    });
    expect(byText(doc.nodes, "This thesis studies rivers.")).toMatchObject({
      kind: "front",
      label: "Abstract",
      chapterKey: null,
    });
    expect(byText(doc.nodes, "Thanks to all.")).toMatchObject({
      kind: "front",
      label: "Acknowledgements",
    });
    expect(byText(doc.nodes, "Introduction")).toMatchObject({ kind: "chapter", level: 1 });
    expect(byText(doc.nodes, "Rivers flow.")).toMatchObject({ kind: "paragraph" });
  });

  it("puts parts at the top and chapters one level down", async () => {
    const doc = await parseDocx(
      await docx(
        [
          p("Part I Foundations", "Heading1"),
          p("Origins", "Heading2"),
          p("Some text."),
          p("Early days", "Heading3"),
          p("Part II Practice", "Heading1"),
          p("Courts", "Heading2"),
        ].join(""),
      ),
      "book.docx",
    );
    const part1 = byText(doc.nodes, "Part I Foundations");
    expect(part1).toMatchObject({ kind: "part", level: 1, number: "I", chapterKey: null });
    const origins = byText(doc.nodes, "Origins");
    expect(origins).toMatchObject({
      kind: "chapter",
      level: 2,
      parentKey: part1.key,
      chapterKey: origins.key,
    });
    expect(byText(doc.nodes, "Early days")).toMatchObject({
      kind: "heading",
      level: 3,
      parentKey: origins.key,
    });
    const part2 = byText(doc.nodes, "Part II Practice");
    expect(byText(doc.nodes, "Courts")).toMatchObject({ kind: "chapter", parentKey: part2.key });
  });

  it("links footnotes to their paragraph and numbers them by appearance", async () => {
    const doc = await parseDocx(
      await docx(
        [
          p("Introduction", "Heading1"),
          p("First claim.", undefined, fnRef(7)),
          p("Second claim.", undefined, fnRef(3) + run(" More.") + fnRef(9)),
        ].join(""),
        { footnotes: footnotes({ 3: "Second source.", 7: "First source.", 9: "Third source." }) },
      ),
      "notes.docx",
    );
    const chapter = byText(doc.nodes, "Introduction");
    const first = byText(doc.nodes, "First claim.");
    expect(first.noteRefs).toEqual(["1"]);
    const second = byText(doc.nodes, "Second claim. More.");
    expect(second.noteRefs).toEqual(["2", "3"]);
    const notes = doc.nodes.filter((n) => n.kind === "footnote");
    expect(notes.map((n) => [n.number, n.text, n.parentKey])).toEqual([
      ["1", "First source.", first.key],
      ["2", "Second source.", second.key],
      ["3", "Third source.", second.key],
    ]);
    expect(notes.every((n) => n.chapterKey === chapter.key)).toBe(true);
    // Notes come straight after their host in document order.
    const at = doc.nodes.indexOf(first);
    expect(doc.nodes[at + 1]!.kind).toBe("footnote");
  });

  it("reads tables with their captions", async () => {
    const doc = await parseDocx(
      await docx(
        [
          p("Results", "Heading1"),
          p("Table 6.2: Survey responses"),
          table([
            ["Year", "Count"],
            ["2020", "14"],
          ]),
          p("Table 6.2 shows the responses in full, and that sentence is prose."),
          p("Figure 3 Map of the delta", "Caption"),
        ].join(""),
      ),
      "t.docx",
    );
    const t = doc.nodes.find((n) => n.kind === "table")!;
    expect(t.rows).toEqual([
      ["Year", "Count"],
      ["2020", "14"],
    ]);
    expect(t.text).toBe("Year | Count\n2020 | 14");
    expect(byText(doc.nodes, "Table 6.2: Survey responses")).toMatchObject({
      kind: "caption",
      number: "Table 6.2",
      label: "Survey responses",
    });
    // Adjacent to the table, but a caption only by wording and adjacency: this is prose after it.
    expect(byText(doc.nodes, "Figure 3 Map of the delta")).toMatchObject({
      kind: "caption",
      number: "Figure 3",
    });
  });

  it("reads the bibliography as entries", async () => {
    const doc = await parseDocx(
      await docx(
        [
          p("Conclusion", "Heading1"),
          p("Done."),
          p("References", "Heading1"),
          p("Adams, J. (2001) Rivers. London: Press."),
          p("Baker, K. (2010) Deltas. Oxford: OUP."),
          p("Appendix A Survey", "Heading1"),
          p("Questions."),
        ].join(""),
      ),
      "b.docx",
    );
    const refs = byText(doc.nodes, "References");
    expect(refs.kind).toBe("chapter");
    const entries = doc.nodes.filter((n) => n.kind === "bibliography_entry");
    expect(entries.map((e) => e.text)).toEqual([
      "Adams, J. (2001) Rivers. London: Press.",
      "Baker, K. (2010) Deltas. Oxford: OUP.",
    ]);
    expect(entries.every((e) => e.chapterKey === refs.key)).toBe(true);
    expect(byText(doc.nodes, "Appendix A Survey")).toMatchObject({ kind: "chapter", number: "A" });
    expect(byText(doc.nodes, "Questions.")).toMatchObject({ kind: "paragraph" });
  });

  it("reads contents entries from TOC styles and a TOC field, without page numbers", async () => {
    const tocField = (text: string, page: string, style: string, begin: boolean) =>
      `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr>${
        begin
          ? `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>`
          : ""
      }${run(text)}<w:r><w:tab/></w:r>${run(page)}</w:p>`;
    const doc = await parseDocx(
      await docx(
        [
          p("Contents", "TOCHeading"),
          tocField("Chapter 1 Introduction", "1", "TOC1", true),
          tocField("1.1 Background", "3", "TOC2", false),
          // An unstyled entry still inside the field.
          `<w:p>${run("Chapter 2 Method")}<w:r><w:tab/></w:r>${run("9")}</w:p>`,
          `<w:p><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`,
          p("Introduction", "Heading1"),
          p("Text."),
        ].join(""),
      ),
      "toc.docx",
    );
    const toc = doc.nodes.filter((n) => n.kind === "toc_entry");
    expect(toc.map((n) => [n.text, n.level])).toEqual([
      ["Chapter 1 Introduction", 1],
      ["1.1 Background", 2],
      ["Chapter 2 Method", 1],
    ]);
    expect(toc[1]!.number).toBe("1.1");
    expect(byText(doc.nodes, "Contents")).toMatchObject({ kind: "front" });
    // Contents lines saying "Chapter 1" are not chapters.
    expect(doc.nodes.filter((n) => n.kind === "chapter").map((n) => n.text)).toEqual([
      "Introduction",
    ]);
  });

  it("reads tracked changes as accepted and says so", async () => {
    const doc = await parseDocx(
      await docx(
        [
          p("Introduction", "Heading1"),
          `<w:p>${run("The river is ")}<w:del w:id="1" w:author="A"><w:r><w:delText>very </w:delText></w:r></w:del><w:ins w:id="2" w:author="A">${run("remarkably ")}</w:ins>${run("long.")}</w:p>`,
          // Field code skipped, result kept.
          `<w:p>${run("See ")}<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> REF _Ref1 \\h </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>${run("Table 2")}<w:r><w:fldChar w:fldCharType="end"/></w:r>${run(" and")}<w:r><w:tab/></w:r>${run("more")}<w:r><w:sym w:font="Symbol" w:char="F061"/></w:r></w:p>`,
        ].join(""),
      ),
      "tc.docx",
    );
    expect(doc.nodes.map((n) => n.text)).toContain("The river is remarkably long.");
    expect(doc.nodes.map((n) => n.text)).toContain("See Table 2 and moreα");
    expect(doc.warnings).toContain(
      "Tracked changes were present; the review reads the document as if they were accepted.",
    );
  });

  it("finds unstyled 'Chapter 3' headings and says how", async () => {
    const doc = await parseDocx(
      await docx(
        [
          p("Preface words."),
          p("Chapter 3"),
          p("The Delta"),
          p("Chapter 3 shows that rivers matter a great deal to everyone who lives near them."),
          p("CHAPTER IV: Floods"),
          p("Water rises."),
        ].join(""),
      ),
      "plain.docx",
    );
    const ch3 = byText(doc.nodes, "Chapter 3 The Delta");
    expect(ch3).toMatchObject({ kind: "chapter", number: "3", level: 1 });
    expect(
      byText(
        doc.nodes,
        "Chapter 3 shows that rivers matter a great deal to everyone who lives near them.",
      ),
    ).toMatchObject({ kind: "paragraph", chapterKey: ch3.key });
    expect(byText(doc.nodes, "CHAPTER IV: Floods")).toMatchObject({
      kind: "chapter",
      number: "IV",
    });
    expect(byText(doc.nodes, "Preface words.")).toMatchObject({ kind: "front" });
    expect(doc.warnings).toContain(
      "No heading styles were found, so chapters were found by their 'Chapter N' wording.",
    );
  });

  it("classifies quotes, list items, figures and equations", async () => {
    const drawing = `<w:p><w:r><w:drawing><wp:inline><wp:docPr id="1" name="Picture 1" descr="A map of the delta"/></wp:inline></w:drawing></w:r></w:p>`;
    const doc = await parseDocx(
      await docx(
        [
          p("Introduction", "Heading1"),
          p("To be or not to be.", "Quote"),
          `<w:p><w:pPr><w:ind w:left="720" w:right="720"/></w:pPr>${run("An indented extract.")}</w:p>`,
          `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>${run("First point")}</w:p>`,
          drawing,
          p("Figure 1: The delta"),
          `<w:p><m:oMathPara><m:oMath><m:r><m:t>E=mc</m:t></m:r></m:oMath></m:oMathPara>${run("(3.1)")}</w:p>`,
        ].join(""),
      ),
      "k.docx",
    );
    expect(byText(doc.nodes, "To be or not to be.").kind).toBe("quote");
    expect(byText(doc.nodes, "An indented extract.").kind).toBe("quote");
    expect(byText(doc.nodes, "First point").kind).toBe("list_item");
    expect(byText(doc.nodes, "A map of the delta").kind).toBe("figure");
    expect(byText(doc.nodes, "Figure 1: The delta")).toMatchObject({
      kind: "caption",
      number: "Figure 1",
    });
    expect(byText(doc.nodes, "E=mc(3.1)")).toMatchObject({ kind: "equation", number: "3.1" });
  });

  it("takes the title from the document properties", async () => {
    const core = `<?xml version="1.0"?><cp:coreProperties xmlns:cp="x" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Rivers &amp; Deltas</dc:title></cp:coreProperties>`;
    const doc = await parseDocx(await docx(p("Introduction", "Heading1"), { core }), "x.docx");
    expect(doc.title).toBe("Rivers & Deltas");
    expect(doc.format).toBe("docx");
  });

  it("takes heading numbers from Word's automatic numbering", async () => {
    const numbering = `<?xml version="1.0"?><w:numbering ${W_NS}>
      <w:abstractNum w:abstractNumId="0">
        <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="Chapter %1"/></w:lvl>
        <w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1.%2"/></w:lvl>
      </w:abstractNum>
      <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
    </w:numbering>`;
    const numbered = (text: string, style: string, ilvl: number) =>
      `<w:p><w:pPr><w:pStyle w:val="${style}"/><w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="1"/></w:numPr></w:pPr>${run(text)}</w:p>`;
    const doc = await parseDocx(
      await docx(
        [
          numbered("Introduction", "Heading1", 0),
          numbered("Background", "Heading2", 1),
          numbered("Scope", "Heading2", 1),
          numbered("Method", "Heading1", 0),
          numbered("Design", "Heading2", 1),
        ].join(""),
        { numbering },
      ),
      "n.docx",
    );
    expect(doc.nodes.map((n) => [n.kind, n.number, n.text])).toEqual([
      ["chapter", "1", "Introduction"],
      ["heading", "1.1", "Background"],
      ["heading", "1.2", "Scope"],
      ["chapter", "2", "Method"],
      ["heading", "2.1", "Design"],
    ]);
  });

  it("parses a 3,000-paragraph manuscript quickly", async () => {
    const parts: string[] = [];
    for (let c = 1; c <= 12; c++) {
      parts.push(p(`Chapter ${c} Title`, "Heading1"));
      for (let s = 1; s <= 10; s++) {
        parts.push(p(`${c}.${s} Section`, "Heading2"));
        for (let k = 0; k < 25; k++)
          parts.push(
            p(
              "Rivers carry water and sediment to the sea over many years of patient work. ".repeat(
                4,
              ),
              undefined,
              k === 0 ? fnRef(c * 100 + s) : "",
            ),
          );
      }
    }
    const notes: Record<number, string> = {};
    for (let c = 1; c <= 12; c++) for (let s = 1; s <= 10; s++) notes[c * 100 + s] = "A source.";
    const data = await docx(parts.join(""), { footnotes: footnotes(notes) });
    const started = performance.now();
    const doc = await parseDocx(data, "big.docx");
    const took = performance.now() - started;
    expect(doc.nodes.filter((n) => n.kind === "chapter")).toHaveLength(12);
    expect(doc.nodes.filter((n) => n.kind === "footnote")).toHaveLength(120);
    expect(took).toBeLessThan(3000);
  });
});
