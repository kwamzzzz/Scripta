import { describe, expect, it } from "vitest";
import { docxBlocks } from "./docx-blocks";
import { splitClauses } from "./clauses";

/** A contract shaped like the one that exposed this: cover page, then clause 1. */
const NUMBERING = `<w:numbering>
  <w:abstractNum w:abstractNumId="1">
    <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl>
    <w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1.%2"/></w:lvl>
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="2">
    <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="(%1)"/></w:lvl>
  </w:abstractNum>
  <w:num w:numId="4"><w:abstractNumId w:val="1"/></w:num>
  <w:num w:numId="9"><w:abstractNumId w:val="2"/></w:num>
</w:numbering>`;

const STYLES = `<w:styles>
  <w:style w:styleId="Heading1"><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="4"/></w:numPr></w:pPr></w:style>
  <w:style w:styleId="Body2"><w:pPr><w:numPr><w:ilvl w:val="1"/><w:numId w:val="4"/></w:numPr></w:pPr></w:style>
  <w:style w:styleId="Party"><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="9"/></w:numPr></w:pPr></w:style>
  <w:style w:styleId="Title"/>
</w:styles>`;

const para = (style: string | null, text: string, pageBreak = false) =>
  `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}` +
  `${pageBreak ? '<w:r><w:lastRenderedPageBreak/></w:r>' : ""}` +
  `<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

const DOC =
  '<w:document><w:body>' +
  para("Title", "BRAND DEVELOPMENT SERVICES AGREEMENT") +
  para(null, "Prepared for: A CLIENT") +
  para(null, "Monday, September 21, 2026") +
  para(null, "This Services Agreement is made between the following Parties.", true) +
  para("Party", "The Client, a company; and") +
  para("Party", "The Service Provider, an individual.") +
  para("Heading1", "SERVICES AND RELATIONSHIP") +
  para("Body2", "The Service Provider shall perform the Services under clause 6.") +
  para("Body2", "The Service Provider is an independent contractor.") +
  para("Heading1", "CLIENT RESPONSIBILITIES") +
  para("Body2", "The Client shall provide accurate materials.") +
  '</w:body></w:document>';

describe("reading a .docx with its own numbering", () => {
  const read = docxBlocks(DOC, NUMBERING, STYLES);

  it("writes the document's clause numbers into the text", () => {
    const numbered = read.blocks.filter((b) => /^\d/.test(b.text)).map((b) => b.text.slice(0, 26));
    expect(numbered).toEqual([
      "1. SERVICES AND RELATIONSH",
      "1.1 The Service Provider s",
      "1.2 The Service Provider i",
      "2. CLIENT RESPONSIBILITIES",
      "2.1 The Client shall provi",
    ]);
  });

  it("does not present the parties as clauses (1) and (2)", () => {
    // Their numbering is a sequence of its own; writing it into the text made
    // the counterparties read as the first two clauses of the agreement.
    const parties = read.blocks.filter((b) => /The Client, a company/.test(b.text));
    expect(parties).toHaveLength(1);
    expect(parties[0]!.text).toBe("The Client, a company; and");
  });

  it("counts pages from the breaks Word recorded", () => {
    expect(read.pageCount).toBe(2);
    expect(read.blocks.find((b) => /^1\. SERVICES/.test(b.text))!.page).toBe(2);
  });

  it("numbers the first operative clause 1, not 2", () => {
    const { clauses } = splitClauses(read.blocks);
    const operative = clauses.filter((c) => !["Title", "Preamble"].includes(c.num));
    expect(operative[0]!.num).toBe("1");
    expect(operative[0]!.title).toBe("SERVICES AND RELATIONSHIP");
    // The cross-reference in 1.1 has to still mean what it says.
    expect(clauses.find((c) => c.num === "2")!.title).toBe("CLIENT RESPONSIBILITIES");
  });

  it("keeps the front matter, and tells the title page from the preamble", () => {
    const { clauses, preamble } = splitClauses(read.blocks);
    expect(preamble).toBeTruthy();

    // The title page is what sits before the drafter's page break, and it is
    // centred — which is how every contract sets one.
    const title = clauses.find((c) => c.num === "Title")!;
    expect(title.ordinal).toBe(1);
    expect(title.body).toContain("BRAND DEVELOPMENT SERVICES AGREEMENT");
    expect(title.body).toContain("Prepared for: A CLIENT");
    expect(title.body).not.toContain("The Client, a company; and");
    expect(title.doc!.content.every((n) => (n as { attrs?: { textAlign?: string } }).attrs?.textAlign === "center")).toBe(true);

    // The preamble is operative wording and is set like any other prose.
    const front = clauses.find((c) => c.num === "Preamble")!;
    expect(front.ordinal).toBe(2);
    expect(front.body).toContain("The Client, a company; and");
    expect(front.body).not.toContain("BRAND DEVELOPMENT SERVICES AGREEMENT");
    expect(front.doc).toBeUndefined();
    // One line per paragraph, with no blank line opening a gap between them.
    expect(front.body).not.toMatch(/\n\n/);
  });
});
