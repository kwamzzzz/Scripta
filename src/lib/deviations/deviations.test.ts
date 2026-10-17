/**
 * Unit tests for the parts that can be tested without a client document.
 *
 * The fixtures that drove this module's development are a privileged redline
 * and a live tender appendix, so they are not in the repository and never
 * should be. `live.test.ts` runs against them when they happen to be on the
 * machine and skips when they are not; everything provable from synthetic
 * WordprocessingML is proved here, and runs everywhere.
 */
import { describe, expect, it } from "vitest";
import { closeOfNested, readRevisions, scan, segmentsOf } from "./revisions";
import { formatCounter, labelParagraphs, readNumbering, toLetter, toRoman } from "./numbering";
import { buildRows, reasonToSetAside, type NumberedParagraph } from "./rows";

const doc = (body: string) =>
  `<?xml version="1.0"?><w:document><w:body>${body}</w:body></w:document>`;
const para = (inner: string) => `<w:p>${inner}</w:p>`;
const run = (text: string) => `<w:r><w:t xml:space="preserve">${text}</w:t></w:r>`;
const del = (text: string) =>
  `<w:del w:id="1" w:author="A"><w:r><w:delText xml:space="preserve">${text}</w:delText></w:r></w:del>`;
const ins = (text: string) => `<w:ins w:id="2" w:author="A">${run(text)}</w:ins>`;

describe("scanning WordprocessingML", () => {
  it("decodes the entities Word writes", () => {
    const [segment] = segmentsOf(para(run("Fees &amp; costs &lt;10&gt; &#8212; net")));
    expect(segment!.text).toBe("Fees & costs <10> — net");
  });

  it("skips comments and processing instructions rather than reading them as text", () => {
    const tokens = [...scan("<a><!-- hidden --><?pi?>seen</a>")];
    expect(tokens.filter((t) => t.kind === "text").map((t) => t.text)).toEqual(["seen"]);
  });

  it("finds the close tag that matches, not the first one", () => {
    const nested = "<w:pPr><w:pPrChange><w:pPr><w:ind/></w:pPr></w:pPrChange></w:pPr>";
    expect(closeOfNested(nested, "<w:pPr>", "</w:pPr>")).toBe(nested.lastIndexOf("</w:pPr>"));
  });
});

describe("reading revisions out of a paragraph", () => {
  it("labels each run as kept, inserted or struck", () => {
    const segments = segmentsOf(para(`${run("Osool ")}${del("may")}${ins("either Party may")}${run(" terminate.")}`));
    expect(segments.map((s) => [s.kind, s.text])).toEqual([
      ["same", "Osool "],
      ["delete", "may"],
      ["insert", "either Party may"],
      ["same", " terminate."],
    ]);
  });

  it("reads a deletion nested inside an insertion", () => {
    const segments = segmentsOf(
      para(`<w:ins w:id="1" w:author="A">${run("kept ")}${del("struck")}</w:ins>`),
    );
    expect(segments.map((s) => s.kind)).toEqual(["insert", "delete"]);
  });

  it("treats a revision on the paragraph MARK as structure, not wording", () => {
    const [paragraph] = readRevisions(
      doc(para(`<w:pPr><w:rPr><w:ins w:id="3" w:author="A"/></w:rPr></w:pPr>${run("Unchanged text.")}`)),
    );
    expect(paragraph!.paraMarkInserted).toBe(true);
    expect(paragraph!.original).toBe("Unchanged text.");
    expect(paragraph!.amended).toBe("Unchanged text.");
  });

  it("reads the current numbering, not the numbering held in w:pPrChange", () => {
    const [paragraph] = readRevisions(
      doc(
        para(
          `<w:pPr><w:numPr><w:ilvl w:val="1"/><w:numId w:val="7"/></w:numPr>` +
            `<w:pPrChange w:id="4" w:author="A"><w:pPr><w:numPr><w:ilvl w:val="0"/>` +
            `<w:numId w:val="99"/></w:numPr></w:pPr></w:pPrChange></w:pPr>${run("Body.")}`,
        ),
      ),
    );
    expect(paragraph!.numId).toBe("7");
    expect(paragraph!.ilvl).toBe(1);
    expect(paragraph!.propertiesChanged).toBe(true);
  });

  it("finds paragraphs inside tables and content controls", () => {
    const body =
      `<w:tbl><w:tr><w:sdt><w:sdtContent><w:tc>${para(run("In a wrapped cell"))}</w:tc></w:sdtContent></w:sdt></w:tr></w:tbl>` +
      para(run("After the table"));
    expect(readRevisions(doc(body)).map((p) => p.amended)).toEqual([
      "In a wrapped cell",
      "After the table",
    ]);
  });
});

const NUMBERING = `<w:numbering>
  <w:abstractNum w:abstractNumId="1">
    <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl>
    <w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1.%2"/></w:lvl>
    <w:lvl w:ilvl="2"><w:start w:val="1"/><w:numFmt w:val="lowerLetter"/><w:lvlText w:val="(%3)"/></w:lvl>
  </w:abstractNum>
  <w:num w:numId="4"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`;
const STYLES = `<w:styles>
  <w:style w:styleId="L1"><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="4"/></w:numPr></w:pPr></w:style>
  <w:style w:styleId="L2"><w:pPr><w:numPr><w:ilvl w:val="1"/><w:numId w:val="4"/></w:numPr></w:pPr></w:style>
  <w:style w:styleId="L3"><w:pPr><w:numPr><w:ilvl w:val="2"/><w:numId w:val="4"/></w:numPr></w:pPr></w:style>
</w:styles>`;

const styled = (style: string, inner: string) =>
  para(`<w:pPr><w:pStyle w:val="${style}"/></w:pPr>${inner}`);

describe("resolving numbers Word generates", () => {
  const tables = readNumbering(NUMBERING, STYLES);

  it("counts levels and restarts the deeper ones", () => {
    const paragraphs = readRevisions(
      doc(
        styled("L1", run("One")) + styled("L2", run("One one")) + styled("L2", run("One two")) +
        styled("L3", run("letter a")) + styled("L3", run("letter b")) +
        styled("L1", run("Two")) + styled("L2", run("Two one")),
      ),
    );
    expect(labelParagraphs(paragraphs, tables)).toEqual([
      "1.", "1.1", "1.2", "(a)", "(b)", "2.", "2.1",
    ]);
  });

  it("seeds a missing parent when a sub-level appears first", () => {
    // The tell that a drafter typed the top-level heading by hand. Without
    // this, every later heading reports one number too low.
    const paragraphs = readRevisions(
      doc(styled("L2", run("Definitions")) + styled("L1", run("PURCHASE AGREEMENT")) + styled("L2", run("Formation"))),
    );
    expect(labelParagraphs(paragraphs, tables)).toEqual(["1.1", "2.", "2.1"]);
  });

  it("numbers the same document twice, once each way, when a clause is inserted", () => {
    const paragraphs = readRevisions(
      doc(
        styled("L1", run("First")) +
        para(`<w:pPr><w:pStyle w:val="L1"/><w:rPr><w:ins w:id="9" w:author="A"/></w:rPr></w:pPr>${ins("Inserted")}`) +
        styled("L1", run("Was second")),
      ),
    );
    const asArrived = labelParagraphs(paragraphs, tables, (p) => p.paraMarkInserted && !p.original.trim());
    const ifAccepted = labelParagraphs(paragraphs, tables, (p) => p.paraMarkDeleted && !p.amended.trim());
    expect(asArrived).toEqual(["1.", null, "2."]);
    expect(ifAccepted).toEqual(["1.", "2.", "3."]);
  });

  it("formats the counters Word offers", () => {
    expect(formatCounter(4, "lowerRoman")).toBe("iv");
    expect(toRoman(2026, true)).toBe("MMXXVI");
    expect(toLetter(28)).toBe("ab");
  });
});

describe("gathering changes into rows", () => {
  const numbered = (xml: string): NumberedParagraph[] => {
    const paragraphs = readRevisions(xml);
    const tables = readNumbering(NUMBERING, STYLES);
    const asArrived = labelParagraphs(paragraphs, tables, (p) => p.paraMarkInserted && !p.original.trim());
    const ifAccepted = labelParagraphs(paragraphs, tables, (p) => p.paraMarkDeleted && !p.amended.trim());
    return paragraphs.map((p, at) => ({ ...p, originalLabel: asArrived[at]!, amendedLabel: ifAccepted[at]! }));
  };

  it("keeps a clause and its lettered sub-paragraphs in one row", () => {
    const { rows } = buildRows(
      numbered(doc(
        styled("L2", `${run("Either party may terminate if ")}${ins("materially ")}${run("in breach:")}`) +
        styled("L3", `${run("the other is ")}${del("bankrupt")}${ins("insolvent")}`),
      )),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.paragraphs).toEqual([1, 2]);
  });

  it("does not merge two clauses that merely sit next to each other", () => {
    const { rows } = buildRows(
      numbered(doc(
        styled("L2", `${run("Clause one ")}${ins("amended")}`) +
        styled("L2", `${run("Clause two ")}${ins("also amended")}`),
      )),
    );
    expect(rows).toHaveLength(2);
  });

  it("says when a provision is new, and when it is struck out", () => {
    const { rows } = buildRows(
      numbered(doc(
        para(`<w:pPr><w:pStyle w:val="L2"/><w:rPr><w:ins w:id="5" w:author="A"/></w:rPr></w:pPr>${ins("A wholly new clause.")}`) +
        styled("L2", del("A clause the reviewer removed.")),
      )),
    );
    expect(rows.map((r) => [r.isNew, r.isDeleted])).toEqual([[true, false], [false, true]]);
    expect(rows[0]!.original).toBe("[No equivalent provision in the Agreement]");
  });

  it("sets aside a change that moves no words, with a reason", () => {
    const [paragraph] = readRevisions(
      doc(para(`<w:pPr><w:pStyle w:val="L2"/><w:pPrChange w:id="6" w:author="A"><w:pPr/></w:pPrChange></w:pPr>${run("Same words.")}`)),
    );
    expect(reasonToSetAside(paragraph!)).toMatch(/formatting only/i);
  });

  it("does not report a lone inserted space as a deviation", () => {
    const [paragraph] = readRevisions(doc(para(`${run("Services")}${ins(" ")}${run(".")}`)));
    expect(reasonToSetAside(paragraph!)).toMatch(/spacing only/i);
  });

  it("reconstructs the clause: accepting what is shown gives the amended wording", () => {
    const xml = doc(styled("L2", `${run("Pay within ")}${del("sixty (60)")}${ins("thirty (30)")}${run(" days.")}`));
    const { rows } = buildRows(numbered(xml));
    const accepted = rows[0]!.proposed
      .filter((s) => s.kind === "same" || s.kind === "insert").map((s) => s.text).join("");
    const rejected = rows[0]!.proposed
      .filter((s) => s.kind === "same" || s.kind === "delete").map((s) => s.text).join("");
    expect(accepted).toBe("Pay within thirty (30) days.");
    expect(rejected).toBe("Pay within sixty (60) days.");
  });
});
