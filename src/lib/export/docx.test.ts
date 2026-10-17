import JSZip from "jszip";
import { buildFrontMatter } from "./front-matter";
import { tocEntries } from "./structure";
import { readDocxTemplate } from "./letterhead-template";
import { templateDocx } from "./letterhead-template.test";
import { describe, expect, it } from "vitest";
import type { ExportPara, ExportSeg } from "./docx";
import {
  buildCleanDocx,
  buildDocumentXml,
  buildDocx,
  clauseLevel,
  esc,
  type ExportClause,
} from "./docx";
import { crc32, createZip, utf8 } from "./zip";
import { HOUSE_FONT, HOUSE_PAGE } from "@/lib/house-style";

const CLAUSES: ExportClause[] = [
  {
    num: "2",
    title: "Term and Termination",
    segs: [
      { t: "The term shall continue for ", k: "n" },
      { t: "twelve (12) ", k: "d" },
      { t: "thirty-six (36) ", k: "i" },
      { t: "months.", k: "n" },
    ],
  },
];

const OPTS = {
  title: "Amendment v4 — redline",
  clauses: CLAUSES,
  author: "Scripta",
  date: "2026-08-31T00:00:00Z",
};

describe("tracked changes", () => {
  const xml = buildDocumentXml(OPTS);

  it("emits real w:del and w:ins revisions, not styled text", () => {
    expect(xml).toContain("<w:del ");
    expect(xml).toContain("<w:ins ");
    // A lookalike redline would use strikethrough formatting instead.
    expect(xml).not.toContain("<w:strike/>");
  });

  it("uses w:delText inside deletions", () => {
    expect(xml).toMatch(/<w:del [^>]*><w:r><w:delText/);
  });

  it("preserves whitespace so words do not fuse across revisions", () => {
    expect(xml).toContain('xml:space="preserve"');
  });

  it("stamps a unique revision id on every change", () => {
    const ids = [...xml.matchAll(/w:id="(\d+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(1);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("attributes revisions to the author", () => {
    expect(xml).toContain('w:author="Scripta"');
  });
});

describe("escaping", () => {
  it("escapes XML metacharacters in clause text", () => {
    const xml = buildDocumentXml({
      ...OPTS,
      clauses: [{ num: "1", title: "T", segs: [{ t: 'a <b> & "c"', k: "n" }] }],
    });
    expect(xml).toContain("&lt;b&gt;");
    expect(xml).toContain("&amp;");
    expect(xml).not.toContain("<b>");
  });

  it("esc handles all five metacharacters", () => {
    expect(esc('<>&"')).toBe("&lt;&gt;&amp;&quot;");
  });
});

describe("clean copy", () => {
  const xml = buildDocumentXml({
    ...OPTS,
    clauses: CLAUSES.map((c) => ({
      ...c,
      segs: c.segs.filter((s) => s.k !== "d").map((s) => ({ t: s.t, k: "n" as const })),
    })),
  });

  it("carries no revisions", () => {
    expect(xml).not.toContain("<w:del ");
    expect(xml).not.toContain("<w:ins ");
  });

  it("keeps insertions and drops deletions", () => {
    expect(xml).toContain("thirty-six (36)");
    expect(xml).not.toContain("twelve (12)");
  });
});

describe("package", () => {
  it("produces a ZIP whose local file header magic is intact", () => {
    const buf = buildDocx(OPTS);
    expect(buf.length).toBeGreaterThan(0);
    // Local file header magic.
    expect(Array.from(buf.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });

  it("buildCleanDocx also produces a valid package", () => {
    const buf = buildCleanDocx(OPTS);
    expect(Array.from(buf.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });

  it("crc32 matches the known check value", () => {
    // Standard CRC-32 of "123456789".
    expect(crc32(utf8("123456789")).toString(16)).toBe("cbf43926");
  });

  it("writes an end-of-central-directory record", () => {
    const buf = createZip([{ path: "a.txt", data: utf8("hello") }]);
    const tail = buf.slice(buf.length - 22, buf.length - 18);
    expect(Array.from(tail)).toEqual([0x50, 0x4b, 0x05, 0x06]);
  });
});

/**
 * Word refuses to open a package with one malformed part, so every part is
 * checked for well-formedness. The Node test environment has no XML parser and
 * we will not add one, so this is a deliberately small scanner: it tokenises
 * tags and asserts they nest, and that nothing outside a tag carries a raw
 * angle bracket or a bare ampersand.
 */
function xmlErrors(xml: string): string[] {
  const errs: string[] = [];
  const stack: string[] = [];
  const TOKEN =
    /<\?[^>]*\?>|<!--[\s\S]*?-->|<\/([A-Za-z_:][\w.:-]*)\s*>|<([A-Za-z_:][\w.:-]*)((?:\s+[A-Za-z_:][\w.:-]*\s*=\s*"[^"<]*")*)\s*(\/?)>/g;
  const badText = (s: string, where: string) => {
    if (/[<>]/.test(s))
      errs.push(`raw angle bracket in ${where}: ${JSON.stringify(s.slice(0, 60))}`);
    if (/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(s)) errs.push(`bare & in ${where}`);
  };
  let last = 0;
  for (const m of xml.matchAll(TOKEN)) {
    badText(xml.slice(last, m.index), "text");
    last = m.index + m[0].length;
    if (m[1] !== undefined) {
      const open = stack.pop();
      if (open !== m[1]) errs.push(`</${m[1]}> closes <${open ?? "nothing"}>`);
    } else if (m[2] !== undefined && !m[4]) {
      stack.push(m[2]);
    }
  }
  badText(xml.slice(last), "trailing text");
  if (stack.length) errs.push(`unclosed: ${stack.join(", ")}`);
  return errs;
}

const PARTS = [
  "[Content_Types].xml",
  "_rels/.rels",
  "word/document.xml",
  "word/_rels/document.xml.rels",
  "word/styles.xml",
  "word/numbering.xml",
  "word/settings.xml",
  "word/header1.xml",
  "word/footer1.xml",
];

const unzip = async (buf: Uint8Array) => {
  const zip = await JSZip.loadAsync(buf);
  const out: Record<string, string> = {};
  for (const path of Object.keys(zip.files)) out[path] = await zip.files[path]!.async("string");
  return out;
};

describe("the scanner used by these tests", () => {
  it("accepts well-formed XML", () => {
    expect(xmlErrors('<?xml version="1.0"?><a x="1"><b/>t &amp; t</a>')).toEqual([]);
  });

  it("rejects unclosed, mismatched and unescaped content", () => {
    expect(xmlErrors("<a><b></a>").length).toBeGreaterThan(0);
    expect(xmlErrors("<a>")).toContain("unclosed: a");
    expect(xmlErrors("<a>a & b</a>").some((e) => e.includes("bare &"))).toBe(true);
    expect(xmlErrors("<a x=1></a>").some((e) => e.includes("raw angle"))).toBe(true);
  });
});

describe("OOXML package", () => {
  it("contains every part the document references", async () => {
    const files = await unzip(buildDocx(OPTS));
    expect(Object.keys(files).sort()).toEqual([...PARTS].sort());
  });

  it("emits well-formed XML in every part", async () => {
    const files = await unzip(buildDocx(OPTS));
    for (const [path, xml] of Object.entries(files))
      expect([path, xmlErrors(xml)]).toEqual([path, []]);
  });

  it("declares a content type for every part", async () => {
    const files = await unzip(buildDocx(OPTS));
    const types = files["[Content_Types].xml"]!;
    for (const path of PARTS) {
      // The manifest does not list itself, and .rels are covered by the Default.
      if (path === "[Content_Types].xml" || path.endsWith(".rels")) continue;
      expect(types).toContain(`PartName="/${path}"`);
    }
    expect(types).toContain('Extension="rels"');
  });

  it("resolves the header and footer relationship ids used by w:sectPr", async () => {
    const files = await unzip(buildDocx(OPTS));
    const doc = files["word/document.xml"]!;
    const rels = files["word/_rels/document.xml.rels"]!;
    const ids = [...doc.matchAll(/r:id="(rId\d+)"/g)].map((m) => m[1]!);
    expect(ids.length).toBe(2);
    for (const id of ids) expect(rels).toContain(`Id="${id}"`);
    expect(rels).toContain('Target="header1.xml"');
    expect(rels).toContain('Target="footer1.xml"');
    expect(rels).toContain('Target="styles.xml"');
    expect(rels).toContain('Target="numbering.xml"');
    expect(rels).toContain('Target="settings.xml"');
  });

  it("keeps real tracked changes in the redline package", async () => {
    const files = await unzip(buildDocx(OPTS));
    expect(files["word/document.xml"]).toContain("<w:del ");
    expect(files["word/document.xml"]).toContain("<w:ins ");
  });
});

describe("document face", () => {
  it("sets the house document face in the document defaults", async () => {
    // Arial 12pt, measured from the firm's own contracts rather than chosen.
    const files = await unzip(buildDocx(OPTS));
    expect(files["word/styles.xml"]).toContain("<w:rFonts ");
    expect(files["word/styles.xml"]).toContain(`w:ascii="${HOUSE_FONT.family}"`);
    expect(files["word/styles.xml"]).toContain(`w:hAnsi="${HOUSE_FONT.family}"`);
    expect(files["word/styles.xml"]).toContain(`<w:sz w:val="${HOUSE_FONT.halfPoints}"/>`);
  });

  it("defines heading and title styles with outline levels", async () => {
    const styles = (await unzip(buildDocx(OPTS)))["word/styles.xml"]!;
    for (const id of [1, 2, 3]) {
      expect(styles).toContain(`w:styleId="Heading${id}"`);
      expect(styles).toContain(`<w:outlineLvl w:val="${id - 1}"/>`);
    }
    expect(styles).toContain('w:styleId="Title"');
  });
});

describe("numbering", () => {
  const NESTED: ExportClause[] = [
    { num: "2", title: "Term and Termination", segs: [] },
    { num: "2.1", title: "Initial Term", segs: [{ t: "Twelve months.", k: "n" }] },
    { num: "2.1.3", title: "Renewal", segs: [{ t: "Automatic.", k: "n" }] },
  ];

  it("maps clause numbers to list levels", () => {
    expect(clauseLevel("2")).toBe(0);
    expect(clauseLevel("2.1")).toBe(1);
    expect(clauseLevel("2.1.3")).toBe(2);
    // The list has three levels; anything deeper sits on the last one.
    expect(clauseLevel("2.1.3.4")).toBe(2);
    expect(clauseLevel("")).toBe(0);
  });

  it("numbers clauses with w:numPr rather than literal text", () => {
    const xml = buildDocumentXml({ ...OPTS, clauses: NESTED });
    expect(xml).toContain('<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>');
    expect(xml).toContain('<w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr>');
    expect(xml).toContain('<w:numPr><w:ilvl w:val="2"/><w:numId w:val="1"/></w:numPr>');
    // The old exporter baked "2. Term and Termination" into the run text.
    expect(xml).not.toContain("2. Term");
    expect(xml).not.toContain("2.1  ");
  });

  /**
   * The assertion the insert feature stands on. A clause added between 5.1 and
   * 5.2 is numbered 5.1A and must not be counted: if Word's list counted it,
   * the clause after it would print as 5.2 having been 5.1A's successor — that
   * is, the document would renumber itself from the insertion point down, and
   * every "clause 5.2" written in its own prose would be pointing at the wrong
   * provision.
   */
  it("keeps an inserted clause out of the list, so the clauses after it do not move", () => {
    const withInsert: ExportClause[] = [
      { num: "5", title: "Fees and Payment", segs: [] },
      { num: "5.1", title: "The Website fee", segs: [{ t: "USD 1,350.", k: "n" }] },
      {
        num: "5.1A",
        title: "Currency of payment",
        segs: [{ t: "All sums are payable in USD.", k: "i" }],
      },
      { num: "5.2", title: "Invoices", segs: [{ t: "Within 3 days.", k: "n" }] },
    ];
    const xml = buildDocumentXml({ ...OPTS, clauses: withInsert });
    // Three counted clauses, three list numbers: 5, 5.1, 5.2.
    expect([...xml.matchAll(/<w:numPr>/g)].length).toBe(3);
    // The inserted clause prints the number it was given, as text.
    expect(xml).toContain('<w:t xml:space="preserve">5.1A</w:t>');
    // And it goes out as a tracked insertion, so the other side can accept it.
    expect(xml).toContain("<w:ins ");
    expect(xml).toContain("All sums are payable in USD.");
  });

  it("prints a self-numbered clause's number once, not on the heading and again below it", () => {
    const xml = buildDocumentXml({
      ...OPTS,
      clauses: [
        {
          num: "3A",
          title: "Interest on late payment",
          segs: [],
          paras: [{ runs: [{ t: "Interest accrues at 1% per month.", k: "i" }] }],
        },
      ],
    });
    expect([...xml.matchAll(/<w:t xml:space="preserve">3A\.<\/w:t>/g)]).toHaveLength(1);
  });

  it("numbers each clause exactly once so the list does not double-count", () => {
    const xml = buildDocumentXml({ ...OPTS, clauses: NESTED });
    expect([...xml.matchAll(/<w:numPr>/g)].length).toBe(NESTED.length);
  });

  it("leaves unnumbered paragraphs out of the list", () => {
    const xml = buildDocumentXml({
      ...OPTS,
      clauses: [{ num: "", title: "", segs: [{ t: "Recital.", k: "n" }] }],
    });
    expect(xml).not.toContain("<w:numPr>");
  });

  it("indents sub-clauses further than their parent", async () => {
    const numbering = (await unzip(buildDocx(OPTS)))["word/numbering.xml"]!;
    // Each list is checked on its own. The file defines the clause list and,
    // for the memo, a lettered and a bulleted one; those restart their indents
    // from the left margin rather than continuing the clause list's.
    const lists = [...numbering.matchAll(/<w:abstractNum[\s\S]*?<\/w:abstractNum>/g)].map(
      (m) => m[0],
    );
    expect(lists.length).toBe(3);
    for (const list of lists) {
      const lefts = [...list.matchAll(/w:left="(\d+)"/g)].map((m) => Number(m[1]));
      // Never steps back towards the margin. The house clause list holds 1.
      // and 1.1 at the same left indent and separates them with the hanging
      // indent, so equal neighbours are correct here and were not before.
      expect(lefts).toEqual([...lefts].sort((a, b) => a - b));
    }
    // The firm's scheme: 1. / 1.1 / (a) / (i), and never another decimal below.
    expect(numbering).toContain('<w:lvlText w:val="%1.%2"/>');
    expect(numbering).toContain('<w:lvlText w:val="(%3)"/>');
    expect(numbering).toContain('<w:lvlText w:val="(%4)"/>');
    expect(numbering).not.toContain('<w:lvlText w:val="%1.%2.%3"/>');
    expect(numbering).toContain('<w:numFmt w:val="lowerRoman"/>');
    expect(numbering).toContain('<w:multiLevelType w:val="multilevel"/>');

    // OOXML's CT_Numbering is a sequence: every abstractNum, then every num.
    // Interleaving them is not reported — Word repairs the part, keeps one
    // mapping and points it at whichever list survived. It pointed at the
    // bullet list, so every numbered clause exported as a bullet.
    expect(numbering.indexOf("<w:num ")).toBeGreaterThan(numbering.lastIndexOf("<w:abstractNum "));

    // Each mapping resolves to a definition that exists, and to a distinct one.
    const mappings = [
      ...numbering.matchAll(/<w:num w:numId="(\d+)"><w:abstractNumId w:val="(\d+)"\/><\/w:num>/g),
    ];
    const defined = new Set(
      [...numbering.matchAll(/<w:abstractNum w:abstractNumId="(\d+)"/g)].map((m) => m[1]),
    );
    expect(mappings.length).toBe(defined.size);
    for (const [, , abstractId] of mappings) expect(defined.has(abstractId!)).toBe(true);
    expect(new Set(mappings.map((m) => m[1])).size).toBe(mappings.length);

    // The clause list is numId 1 and must be the decimal one, not a bullet.
    const clauseAbstract = mappings.find((m) => m[1] === "1")?.[2];
    const clauseList = numbering.slice(
      numbering.indexOf(`<w:abstractNum w:abstractNumId="${clauseAbstract}"`),
    );
    expect(clauseList.slice(0, clauseList.indexOf("</w:abstractNum>"))).toContain(
      '<w:numFmt w:val="decimal"/>',
    );
    // The memo's own lists, which must not disturb the clause list's numbering.
    expect(numbering).toContain('<w:numFmt w:val="lowerLetter"/>');
    expect(numbering).toContain('<w:numFmt w:val="bullet"/>');
  });

  it("does not repeat a sub-clause title that is only the opening of its body", () => {
    const xml = buildDocumentXml({
      ...OPTS,
      clauses: [
        {
          num: "3.1",
          title: "The Supplier shall at all times…",
          segs: [{ t: "The Supplier shall at all times act reasonably.", k: "n" }],
        },
      ],
    });
    expect([...xml.matchAll(/The Supplier shall/g)].length).toBe(1);
    expect(xml).not.toContain('w:val="Heading2"');
  });
});

describe("page furniture", () => {
  it("carries a page-number field in the footer", async () => {
    const footer = (await unzip(buildDocx(OPTS)))["word/footer1.xml"]!;
    expect(footer).toContain("PAGE");
    expect(footer).toContain("NUMPAGES");
    expect(footer).toContain('<w:fldChar w:fldCharType="begin"/>');
    expect(footer).toContain('<w:fldChar w:fldCharType="end"/>');
  });

  it("carries the firm's letterhead in the header when one is given", async () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
    const files = await unzip(
      buildDocx({
        ...OPTS,
        letterhead: { bytes, mime: "image/png", widthEmu: 5486400, heightEmu: 914400 },
      }),
    );
    const header = files["word/header1.xml"]!;
    expect(header).toContain("<w:drawing>");
    expect(header).toContain('<wp:extent cx="5486400" cy="914400"/>');
    expect(header).toContain('r:embed="rIdLetterhead"');

    // The image needs three things or Word refuses the file: the part itself,
    // a relationship from the header to it, and a content type for the
    // extension.
    expect(files["word/media/letterhead.png"]).toBeDefined();
    expect(files["word/_rels/header1.xml.rels"]).toContain("media/letterhead.png");
    expect(files["[Content_Types].xml"]).toContain('Extension="png"');
  });

  it("names a JPEG letterhead as a JPEG in every place that has to agree", async () => {
    const files = await unzip(
      buildDocx({
        ...OPTS,
        letterhead: {
          bytes: new Uint8Array([255, 216, 255]),
          mime: "image/jpeg",
          widthEmu: 100,
          heightEmu: 50,
        },
      }),
    );
    expect(files["word/media/letterhead.jpg"]).toBeDefined();
    expect(files["word/_rels/header1.xml.rels"]).toContain("media/letterhead.jpg");
  });

  it("adds no image part at all when there is no letterhead", async () => {
    const files = await unzip(buildDocx(OPTS));
    expect(Object.keys(files).some((p) => p.startsWith("word/media/"))).toBe(false);
    expect(files["word/_rels/header1.xml.rels"]).toBeUndefined();
    expect(files["word/header1.xml"]).not.toContain("<w:drawing>");
  });

  it("puts no running text in the header", async () => {
    // It used to print the title on every page, which for an exported contract
    // was the matter's name as saved in the app running across the top of a
    // document going to a counterparty. The firm's contracts keep this empty;
    // the header is where a letterhead goes.
    const header = (await unzip(buildDocx(OPTS)))["word/header1.xml"]!;
    expect(header).not.toContain("Amendment v4");
    expect(header).toContain("<w:hdr ");
  });

  it("uses the firm's own page for each kind of document", () => {
    // Measured, not chosen: their contracts are US Letter and run closer to
    // the top; the resolution and the letter are A4, and the letter leaves
    // room for the letterhead it is printed on.
    const contract = buildDocumentXml(OPTS);
    expect(contract).toContain(
      `<w:pgSz w:w="${HOUSE_PAGE.contract.width}" w:h="${HOUSE_PAGE.contract.height}"/>`,
    );
    expect(contract).toContain(`w:top="${HOUSE_PAGE.contract.top}"`);

    const letter = buildDocumentXml({ ...OPTS, kind: "letter" });
    expect(letter).toContain(
      `<w:pgSz w:w="${HOUSE_PAGE.letter.width}" w:h="${HOUSE_PAGE.letter.height}"/>`,
    );
    expect(letter).toContain(`w:top="${HOUSE_PAGE.letter.top}"`);
  });

  it("keeps one inch at the sides and foot whatever the document is", () => {
    for (const kind of ["contract", "resolution", "letter"] as const) {
      const xml = buildDocumentXml({ ...OPTS, kind });
      expect(xml).toContain('w:left="1440"');
      expect(xml).toContain('w:right="1440"');
      expect(xml).toContain('w:bottom="1440"');
    }
  });

  it("references the header and footer", () => {
    const xml = buildDocumentXml(OPTS);
    expect(xml).toContain("<w:headerReference ");
    expect(xml).toContain("<w:footerReference ");
  });
});

describe("settings", () => {
  it("turns revision recording on for a redline that ships revisions", async () => {
    const settings = (await unzip(buildDocx(OPTS)))["word/settings.xml"]!;
    expect(settings).toContain("<w:trackChanges/>");
  });

  it("leaves revision recording off on the clean copy", async () => {
    const settings = (await unzip(buildCleanDocx(OPTS)))["word/settings.xml"]!;
    expect(settings).not.toContain("<w:trackChanges/>");
  });

  it("still produces every part for the clean copy", async () => {
    const files = await unzip(buildCleanDocx(OPTS));
    expect(Object.keys(files).sort()).toEqual([...PARTS].sort());
    expect(files["word/document.xml"]).not.toContain("<w:del ");
  });
});

describe("line breaks", () => {
  const MULTILINE: ExportClause[] = [
    {
      num: "",
      title: "Footnotes",
      segs: [{ t: "1 Smith v Jones [2019] EWCA 12\n2 Brown v Green [2021] UKSC 3", k: "n" }],
    },
  ];

  it("turns a newline into w:br rather than swallowing it", () => {
    const xml = buildDocumentXml({ ...OPTS, clauses: MULTILINE });
    expect(xml).toContain("<w:br/>");
    // Both footnotes survive, and neither is fused into the other.
    expect(xml).toContain("Smith v Jones");
    expect(xml).toContain("Brown v Green");
    expect(xml).not.toContain("EWCA 122");
  });

  it("emits no break for single-line text", () => {
    expect(buildDocumentXml(OPTS)).not.toContain("<w:br/>");
  });

  it("keeps a blank line as a second break", () => {
    const xml = buildDocumentXml({
      ...OPTS,
      clauses: [{ num: "", title: "", segs: [{ t: "a\n\nb", k: "n" }] }],
    });
    expect(xml).toContain("<w:br/><w:br/>");
  });

  it("survives the round trip into the package", async () => {
    const doc = (await unzip(buildDocx({ ...OPTS, clauses: MULTILINE })))["word/document.xml"]!;
    expect(doc).toContain("<w:br/>");
    expect(xmlErrors(doc)).toEqual([]);
  });

  it("keeps a deletion containing a newline valid, using w:delText throughout", () => {
    const xml = buildDocumentXml({
      ...OPTS,
      clauses: [{ num: "1", title: "", segs: [{ t: "first line\nsecond line", k: "d" }] }],
    });
    expect(xml).toContain("<w:delText");
    // The break sits between two w:delText runs inside the deletion, never a w:t.
    expect(xml).toMatch(/<w:del [^>]*><w:r><w:delText[^>]*>first line<\/w:delText><w:br\/>/);
    expect(xml).not.toMatch(/<w:del [^>]*><w:r>[\s\S]*?<w:t /);
    expect(xmlErrors(xml)).toEqual([]);
  });

  it("keeps an insertion containing a newline valid", () => {
    const xml = buildDocumentXml({
      ...OPTS,
      clauses: [{ num: "1", title: "", segs: [{ t: "one\ntwo", k: "i" }] }],
    });
    expect(xml).toMatch(/<w:ins [^>]*><w:r><w:t[^>]*>one<\/w:t><w:br\/>/);
    expect(xmlErrors(xml)).toEqual([]);
  });

  it("escapes each line of a multi-line segment", () => {
    const xml = buildDocumentXml({
      ...OPTS,
      clauses: [{ num: "", title: "", segs: [{ t: "a & b\n<c>", k: "n" }] }],
    });
    expect(xml).toContain("&amp;");
    expect(xml).toContain("&lt;c&gt;");
    expect(xmlErrors(xml)).toEqual([]);
  });
});

describe("literal numbering", () => {
  // A memo's own section numbers: they skip, and Word would renumber them 1,2,3.
  const MEMO: ExportClause[] = [
    { num: "1", title: "Question", segs: [{ t: "Whether the clause bites.", k: "n" }] },
    { num: "3.5", title: "Application", segs: [{ t: "It does.", k: "n" }] },
    { num: "R-07", title: "Recommendation", segs: [{ t: "Amend.", k: "n" }] },
  ];
  const memoOpts = { ...OPTS, clauses: MEMO, numbering: "literal" as const };

  it("prints the given numbers as text and never hands them to the list engine", () => {
    const xml = buildDocumentXml(memoOpts);
    expect(xml).not.toContain("<w:numPr>");
    for (const c of MEMO) expect(xml).toContain(`>${c.num}</w:t>`);
  });

  it("keeps a non-decimal number verbatim", () => {
    expect(buildDocumentXml(memoOpts)).toContain(">R-07</w:t>");
  });

  it("numbers each section exactly once", () => {
    const xml = buildDocumentXml(memoOpts);
    // One label run — number then tab — per section, on the heading only.
    expect([...xml.matchAll(/<w:tab\/>/g)].length).toBe(MEMO.length);
    expect([...xml.matchAll(/>1<\/w:t>/g)].length).toBe(1);
  });

  it("indents literal numbers the way the list engine would", () => {
    const xml = buildDocumentXml(memoOpts);
    expect(xml).toContain('<w:ind w:left="720" w:hanging="720"/>');
    expect(xml).toContain('<w:ind w:left="1080" w:hanging="720"/>');
  });

  it("leaves unnumbered memo paragraphs unlabelled", () => {
    const xml = buildDocumentXml({
      ...memoOpts,
      clauses: [{ num: "", title: "", segs: [{ t: "Intro.", k: "n" }] }],
    });
    expect(xml).not.toContain("<w:tab/>");
    expect(xml).not.toContain("<w:ind ");
  });

  it("produces a well-formed package", async () => {
    const files = await unzip(buildCleanDocx(memoOpts));
    expect(Object.keys(files).sort()).toEqual([...PARTS].sort());
    for (const [path, xml] of Object.entries(files))
      expect([path, xmlErrors(xml)]).toEqual([path, []]);
  });

  it("does not regress the contract, which keeps real w:numPr numbering", () => {
    const xml = buildDocumentXml({
      ...OPTS,
      clauses: [
        { num: "2", title: "Term", segs: [{ t: "Twelve months.", k: "n" }] },
        { num: "2.1", title: "Renewal", segs: [{ t: "Automatic.", k: "n" }] },
      ],
    });
    expect(xml).toContain('<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>');
    expect(xml).toContain('<w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr>');
    // No literal number text and no tab label leaked into the contract path.
    expect(xml).not.toContain("<w:tab/>");
    expect(xml).not.toContain(">2.1</w:t>");
  });

  it("defaults to list numbering when the option is absent", () => {
    expect(buildDocumentXml(OPTS)).toContain("<w:numPr>");
  });
});

describe("a memo's formatting", () => {
  // The memo composer hands the exporter paragraphs rather than one run of body
  // text, so what a lawyer sets on the page is what the counterparty opens.
  const memo = (paras: ExportPara[]) =>
    buildDocumentXml({
      ...OPTS,
      numbering: "literal",
      clauses: [{ num: "1", title: "Question", segs: [{ t: "ignored", k: "n" }], paras }],
    });

  it("writes bold, italic and underline as Word run properties", () => {
    const xml = memo([
      {
        runs: [
          { t: "plain ", k: "n" },
          { t: "strong", k: "n", m: { b: true } },
          { t: "slanted", k: "n", m: { i: true } },
          { t: "ruled", k: "n", m: { u: true } },
        ],
      },
    ]);
    expect(xml).toContain("<w:rPr><w:b/></w:rPr>");
    expect(xml).toContain("<w:rPr><w:i/></w:rPr>");
    expect(xml).toContain('<w:rPr><w:u w:val="single"/></w:rPr>');
    // A run with no marks carries no run properties at all.
    expect(xml).toContain('<w:r><w:t xml:space="preserve">plain </w:t></w:r>');
  });

  it("writes a highlight as Word's own highlighter, in schema order", () => {
    const xml = memo([
      {
        runs: [
          { t: "marked", k: "n", m: { hl: true } },
          { t: "marked and ruled", k: "n", m: { hl: true, u: true, b: true } },
        ],
      },
    ]);
    expect(xml).toContain('<w:rPr><w:highlight w:val="yellow"/></w:rPr>');
    /* CT_RPr is a sequence: b, i, strike, color, highlight, u. Word repairs a
       file whose run properties are out of order, and the repair drops what it
       could not place — which is how a highlight would leave the building and
       arrive invisible. */
    expect(xml).toContain('<w:rPr><w:b/><w:highlight w:val="yellow"/><w:u w:val="single"/></w:rPr>');
  });

  it("writes a heading as a heading and an alignment as Word's own", () => {
    const xml = memo([
      { runs: [{ t: "Heading", k: "n" }], heading: 2 },
      { runs: [{ t: "Justified", k: "n" }], align: "justify" },
      { runs: [{ t: "Centred", k: "n" }], align: "center" },
    ]);
    expect(xml).toContain('<w:pStyle w:val="Heading2"/>');
    // Word calls justified "both".
    expect(xml).toContain('<w:jc w:val="both"/>');
    expect(xml).toContain('<w:jc w:val="center"/>');
  });

  it("writes a list as a real Word list, not typed-out letters", () => {
    const xml = memo([
      { runs: [{ t: "first", k: "n" }], list: "ordered", level: 0 },
      { runs: [{ t: "nested", k: "n" }], list: "bullet", level: 1 },
    ]);
    expect(xml).toContain('<w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>');
    expect(xml).toContain('<w:numPr><w:ilvl w:val="1"/><w:numId w:val="3"/></w:numPr>');
    // The letters come from the list definition, never from the run text.
    expect(xml).not.toContain("(a)</w:t>");
  });

  it("indents a block quotation", () => {
    expect(memo([{ runs: [{ t: "Quoted.", k: "n" }], quote: true }])).toContain(
      '<w:ind w:left="720"/>',
    );
  });

  it("leaves a clause with no paragraphs on the old path", () => {
    const xml = buildDocumentXml({
      ...OPTS,
      clauses: [{ num: "1", title: "Question", segs: [{ t: "Just words.", k: "n" }] }],
    });
    expect(xml).toContain("Just words.");
    expect(xml).not.toContain("<w:rPr>");
  });
});

describe("the front matter", () => {
  const front = buildFrontMatter({
    agreementType: "Employment Contract",
    client: "Acme Ghana Ltd",
    counterparty: "Jane Doe",
    date: "2026-09-01",
    clientRole: "Employer",
    counterpartyRole: "Employee",
  });
  const xml = buildDocumentXml({
    title: "Employment Contract",
    clauses: [{ num: "1", title: "DEFINITIONS", segs: [{ t: "In this Contract…", k: "n" }] }],
    front,
  });

  it("sets the parties hanging 1.25cm from a tab after their number", () => {
    expect(xml).toContain('<w:ind w:left="709" w:hanging="709"/>');
    expect(xml).toContain(
      '<w:r><w:t xml:space="preserve">(1)</w:t><w:tab/><w:t xml:space="preserve">Acme Ghana Ltd of [First party address] (the “Employer”); AND</w:t></w:r>',
    );
  });

  it("bolds the type, raises the ordinal and leaves the rest of the sentence regular", () => {
    expect(xml).toContain(
      '<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">THIS EMPLOYMENT CONTRACT </w:t></w:r>' +
        '<w:r><w:t xml:space="preserve">(the “Contract”) is made on this 1</w:t></w:r>' +
        '<w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t xml:space="preserve">st</w:t></w:r>',
    );
  });

  it("spaces every front paragraph at 1.15 lines rather than the body's at-least-15pt", () => {
    const fronts =
      xml.match(/<w:spacing w:before="\d+" w:after="\d+" w:line="276" w:lineRule="auto"\/>/g) ?? [];
    expect(fronts.length).toBe(front.cover.length + front.preamble.length);
    expect(xml).toContain(
      '<w:spacing w:before="120" w:after="200" w:line="276" w:lineRule="auto"/>',
    );
  });

  // The title block is a floating table now, so it anchors through w:tblpPr
  // rather than w:framePr. The behaviour is the same: dragged clear of the
  // letterhead's logo, it stays where it was put.
  it("moves the title clear of a letterhead logo when asked, anchored to the page", () => {
    const at = (coverY: number) =>
      buildDocumentXml({
        title: "Employment Contract",
        clauses: [],
        front: { ...front, coverY },
      });
    expect(at(0)).not.toContain("<w:tblpPr");
    expect(at(0.62)).toMatch(
      /<w:tblpPr w:vertAnchor="margin" w:horzAnchor="margin" w:tblpXSpec="center" w:tblpY="\d+"\/>/,
    );
    const textHeight = 16845 - 1204 - 1440;
    expect(Number(/w:tblpY="(\d+)"/.exec(at(0.62))![1])).toBe(Math.round(textHeight * 0.62));
    // The foot of the page still leaves the title its own height above the margin.
    expect(Number(/w:tblpY="(\d+)"/.exec(at(1))![1])).toBe(Math.round(textHeight * 0.92));
    // Only the cover title floats; the preamble flows as before.
    expect(at(1).match(/<w:tblpPr/g)).toHaveLength(1);
  });

  it("rules the cover title above and below at 14pt", () => {
    // The rules are the table's borders; the size is still on the run.
    expect(xml).toMatch(
      /<w:tblBorders><w:top w:val="single"[^>]*\/><w:bottom w:val="single"[^>]*\/>/,
    );
    expect(xml).toMatch(/<w:jc w:val="center"\/><w:rPr><w:sz w:val="28"\/>/);
  });
});

describe("the table of contents", () => {
  const front = buildFrontMatter({
    agreementType: "Employment Contract",
    client: "Acme Ghana Ltd",
    counterparty: "Jane Doe",
    date: "2026-09-01",
  });
  const clauses: ExportClause[] = [
    { num: "1", title: "DEFINITIONS AND INTERPRETATION", segs: [] },
    { num: "1.1", title: "Definitions", segs: [{ t: "Words mean things.", k: "n" }] },
    { num: "1.1.1", title: "Deeper", segs: [{ t: "Not listed.", k: "n" }] },
    { num: "2", title: "TERM", segs: [{ t: "Three years.", k: "n" }] },
  ];
  const toc = tocEntries(clauses).map((e, i) => ({ ...e, page: 3 + i }));
  const xml = buildDocumentXml({ title: "Employment Contract", clauses, front, toc });

  /* The table is NOT a TOC field. `w:updateFields` tells Word to update its
     fields when the document opens — the page numbers need that — and Word
     rebuilds a TOC field when it does, from headings alone. That threw away
     every sub-clause without a heading and left "No table of contents entries
     found" where a correct table had been. Hidden TC entries did not survive
     it either. So the entries are the document's own words; only each page
     number is a field. */
  it("is written as entries Word cannot throw away", () => {
    expect(xml).not.toContain("TOC \\f");
    expect(xml).not.toContain('TOC \\o "1-2"');
    expect(xml).not.toContain("<w:vanish/>");
    expect(xml.match(/<w:pStyle w:val="TOC[12]"\/>/g)).toHaveLength(toc.length);
  });

  it("gives every entry a live page number and a link to its clause", () => {
    expect(xml.match(/ PAGEREF /g)).toHaveLength(toc.length);
    expect(xml).toContain('<w:hyperlink w:anchor="_Toc000001" w:history="1">');
    // Which is what the bookmark on the clause is for.
    expect(xml).toContain('<w:bookmarkStart w:id="1000" w:name="_Toc000001"/>');
  });

  it("leads the eye to the page number with dots, as the firm's tables do", async () => {
    const zip = await JSZip.loadAsync(buildCleanDocx({ title: "T", clauses, front, toc }));
    const styles = await zip.file("word/styles.xml")!.async("string");
    expect(styles).toContain('<w:name w:val="toc 1"/>');
    expect(styles.match(/<w:tab w:val="right" w:leader="dot"/g)).toHaveLength(2);
  });

  it("sits on its own page between the cover and the operative sentence", () => {
    const cover = xml.indexOf("EMPLOYMENT CONTRACT</w:t>");
    const table = xml.indexOf("Table of Contents");
    const between = xml.indexOf("BETWEEN:");
    expect(cover).toBeLessThan(table);
    expect(table).toBeLessThan(between);
    const breaks = [...xml.matchAll(/<w:br w:type="page"\/>/g)].map((m) => m.index!);
    expect(breaks.some((at) => at > cover && at < table)).toBe(true);
    expect(breaks.some((at) => at > table && at < between)).toBe(true);
  });

  it("lists sections in toc 1 and sub-sections in toc 2, each linked to its heading", () => {
    expect(xml).toContain(
      '<w:pStyle w:val="TOC1"/></w:pPr><w:hyperlink w:anchor="_Toc000001" w:history="1">',
    );
    expect(xml).toContain(
      '<w:hyperlink w:anchor="_Toc000001" w:history="1"><w:r><w:t xml:space="preserve">1.</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t xml:space="preserve">Definitions and interpretation</w:t></w:r>',
    );
    expect(xml).toContain(
      '<w:pStyle w:val="TOC2"/></w:pPr><w:hyperlink w:anchor="_Toc000002" w:history="1"><w:r><w:t xml:space="preserve">1.1</w:t></w:r>',
    );
    expect(xml).not.toContain("Deeper</w:t></w:r><w:r><w:tab/>");
  });

  it("carries the expected page as a PAGEREF Word can correct", () => {
    expect(xml).toContain(
      '<w:instrText xml:space="preserve"> PAGEREF _Toc000001 \\h </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t xml:space="preserve">3</w:t></w:r>',
    );
  });

  it("bookmarks every heading the table refers to", () => {
    expect(xml).toContain(
      '<w:bookmarkStart w:id="1000" w:name="_Toc000001"/><w:r><w:t xml:space="preserve">DEFINITIONS AND INTERPRETATION</w:t></w:r><w:bookmarkEnd w:id="1000"/>',
    );
    expect(xml).toContain('w:name="_Toc000002"');
    expect(xml).not.toContain('w:name="_Toc000003"');
  });

  it("is left out of a document with no front, and of one given no entries", () => {
    expect(buildDocumentXml({ title: "Memo", clauses, toc })).not.toContain("Table of Contents");
    expect(buildDocumentXml({ title: "Employment Contract", clauses, front })).not.toContain(
      "Table of Contents",
    );
  });
});

describe("the firm's paper", () => {
  const front = buildFrontMatter({
    agreementType: "Employment Contract",
    client: "Acme Ghana Ltd",
    counterparty: "Jane Doe",
    date: "2026-09-01",
  });
  const clauses: ExportClause[] = [
    { num: "1", title: "TERM", segs: [{ t: "Three years.", k: "n" }] },
  ];
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1]);
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 2]);
  const unzip = async (bytes: Uint8Array) => {
    const zip = await JSZip.loadAsync(bytes);
    const read = (path: string) => zip.file(path)!.async("string");
    return { zip, read, has: (path: string) => !!zip.file(path) };
  };

  it("puts paper that came as pictures behind page one and behind the rest, from headers of their own", async () => {
    const { read, has } = await unzip(
      buildDocx({
        title: "Employment Contract",
        clauses,
        front,
        letterhead: {
          mode: "page",
          bytes: jpg,
          mime: "image/jpeg",
          widthEmu: 11910 * 635,
          heightEmu: 16845 * 635,
          continuation: { bytes: png, mime: "image/png" },
          bodyTop: 1600,
          bodyBottom: 900,
        },
      }),
    );
    const doc = await read("word/document.xml");
    // Page one is its own: a first-page header and an empty first-page footer.
    expect(doc).toContain("<w:titlePg/>");
    expect(doc).toMatch(/<w:headerReference w:type="first" r:id="rId\d+"\/>/);
    expect(doc).toMatch(/<w:headerReference w:type="default" r:id="rId\d+"\/>/);
    expect(doc).toMatch(/<w:footerReference w:type="first" r:id="rId\d+"\/>/);
    expect(doc).toContain('<w:footerReference w:type="default" r:id="rId5"/>');
    const header2 = await read("word/header2.xml");
    expect(header2).toContain('behindDoc="1"');
    expect(header2).toContain('<wp:positionH relativeFrom="page"><wp:posOffset>0</wp:posOffset>');
    expect(header2).toContain(`<wp:extent cx="${11910 * 635}" cy="${16845 * 635}"/>`);
    expect(await read("word/_rels/header2.xml.rels")).toContain(
      'Target="media/lh-paper-first.jpg"',
    );
    expect(await read("word/_rels/header3.xml.rels")).toContain(
      'Target="media/lh-paper-continuation.png"',
    );
    expect(await read("word/footer2.xml")).toContain("<w:p/>");
    expect(has("word/media/lh-paper-first.jpg")).toBe(true);
    expect(has("word/media/lh-paper-continuation.png")).toBe(true);
    // The body keeps clear of the mark the following pages carry.
    expect(doc).toContain('w:top="2080"');
    expect(doc).toContain('w:bottom="1440"');
    // No strip header any more.
    expect(await read("word/header1.xml")).not.toContain("<w:drawing>");
  });

  it("splices the firm's own Word template in: its page one first, its parts, its pictures", async () => {
    const template = await readDocxTemplate(await templateDocx());
    const { read, has } = await unzip(
      buildDocx({
        title: "Employment Contract",
        clauses,
        front: { ...front, coverY: 0 },
        letterhead: {
          mode: "page",
          bytes: jpg,
          mime: "image/jpeg",
          widthEmu: 11910 * 635,
          heightEmu: 16845 * 635,
          template,
        },
      }),
    );
    const doc = await read("word/document.xml");
    // The template's page-one body comes first, its pictures re-pointed.
    const bodyAt = doc.indexOf("<w:body>");
    const coverAt = doc.indexOf("EMPLOYMENT CONTRACT</w:t>");
    const logoAt = doc.indexOf('cx="3429000"');
    expect(logoAt).toBeGreaterThan(bodyAt);
    expect(logoAt).toBeLessThan(coverAt);
    expect(doc).not.toContain('r:embed="rId9"');
    expect(doc).toMatch(/r:embed="rId1\d\d"/);
    // The full-page picture is fitted to the house page.
    expect(doc).toContain(`<wp:extent cx="${11910 * 635}" cy="${16845 * 635}"/>`);
    // The title block is anchored even at the top, since it can no longer flow
    // first past the letterhead's own page-one picture.
    expect(doc).toContain("<w:tblpPr");
    // The template's namespaces reach the document root.
    expect(doc).toMatch(/<w:document [^>]*xmlns:wp="/);
    expect(doc).toContain('mc:Ignorable="w14 wp14"');
    // Page one has an empty header, as the template gives it none; the
    // following pages take the template's default header and its picture.
    expect(doc).toContain("<w:titlePg/>");
    expect(await read("word/header2.xml")).toContain("<w:p/>");
    expect(await read("word/header3.xml")).toContain('r:embed="rId1"');
    expect(await read("word/_rels/header3.xml.rels")).toContain('Target="media/lh-image3.png"');
    expect(has("word/media/lh-image1.jpg")).toBe(true);
    expect(has("word/media/lh-image2.png")).toBe(true);
    expect(has("word/media/lh-image3.png")).toBe(true);
    const rels = await read("word/_rels/document.xml.rels");
    expect(rels).toContain('Target="media/lh-image1.jpg"');
    expect(rels).toContain('Target="header3.xml"');
    const types = await read("[Content_Types].xml");
    expect(types).toContain('PartName="/word/header3.xml"');
  });

  it("still carries a strip as the header picture it always was", async () => {
    const { read, has } = await unzip(
      buildDocx({
        title: "Letter",
        clauses,
        letterhead: { bytes: png, mime: "image/png", widthEmu: 5_000_000, heightEmu: 900_000 },
      }),
    );
    expect(await read("word/header1.xml")).toContain("<w:drawing>");
    expect(has("word/header2.xml")).toBe(false);
    expect(await read("word/document.xml")).not.toContain("<w:titlePg/>");
  });
});

describe("a section whose parts are printed without numbers", () => {
  /**
   * The case this exists for: a definitions clause where each definition is
   * headed by the term it defines rather than by 1.1, 1.2. The rows keep their
   * numbers — they still order the document and still carry the tree — and only
   * the label is withheld.
   */
  const definitions: ExportClause[] = [
    {
      num: "1",
      title: "Definitions and Interpretation",
      segs: [{ t: "In this Agreement:", k: "n" }],
    },
    {
      num: "1.1",
      title: "“Business Day”",
      unnumbered: true,
      segs: [{ t: "“Business Day” means any day other than a Saturday or Sunday.", k: "n" }],
    },
  ];

  it("prints the section's own number and withholds its parts'", () => {
    const xml = buildDocumentXml({ ...OPTS, clauses: definitions, numbering: "literal" });
    expect(xml).toContain("Definitions and Interpretation");
    // The section keeps its label; the definition under it does not get one.
    expect(xml).toContain(">1<");
    expect(xml).not.toContain(">1.1<");
  });

  it("hands nothing to Word's list engine for an unnumbered part", () => {
    const xml = buildDocumentXml({ ...OPTS, clauses: definitions });
    // One numbered paragraph, the section — not two.
    expect(xml.match(/<w:numPr>/g)?.length ?? 0).toBe(1);
  });

  it("still indents the part under its section, because num is untouched", () => {
    expect(clauseLevel("1.1")).toBe(1);
    expect(clauseLevel("1")).toBe(0);
  });
});

describe("the cover title block", () => {
  const cover = buildFrontMatter({
    agreementType: "Trading Management Agreement",
    client: "MKA",
    counterparty: "SKA",
    date: "2026-09-14",
  });

  it("is a table, so Word lets you move and resize it", () => {
    const xml = buildDocumentXml({ ...OPTS, front: cover });
    expect(xml).toContain("<w:tbl>");
    expect(xml).toContain("TRADING MANAGEMENT AGREEMENT");
  });

  it("keeps the rules above and below, and draws them only once", () => {
    const xml = buildDocumentXml({ ...OPTS, front: cover });
    const table = xml.slice(xml.indexOf("<w:tbl>"), xml.indexOf("</w:tbl>"));
    expect(table).toContain("<w:tblBorders>");
    // The rules belong to the table; the cell's paragraph must not repeat them.
    expect(table).not.toContain("<w:pBdr>");
  });

  /** Dragging the title clear of the letterhead logo has to survive the change. */
  it("floats where the lawyer put it", () => {
    const moved = { ...cover, coverY: 0.4 };
    const xml = buildDocumentXml({ ...OPTS, front: moved });
    expect(xml).toContain("<w:tblpPr");
    expect(xml).toContain('w:vertAnchor="margin"');
  });

  it("sits at the top when it was never moved", () => {
    const xml = buildDocumentXml({ ...OPTS, front: cover });
    expect(xml).not.toContain("<w:tblpPr");
  });
});

describe("the table of contents is a real one", () => {
  const clauses: ExportClause[] = [
    { num: "1", title: "Interpretation", segs: [{ t: "In this Agreement:", k: "n" }] },
    { num: "1.1", title: "\u201cCapital\u201d", segs: [{ t: "means the sum.", k: "n" }] },
    { num: "2", title: "Capital", segs: [{ t: "The Investor shall pay.", k: "n" }] },
  ];
  const front = buildFrontMatter({
    agreementType: "Trading Management Agreement",
    client: "MKA",
    counterparty: "SKA",
    date: "2026-09-14",
  });
  const toc = tocEntries(clauses);
  const xml = buildDocumentXml({ title: "T", clauses, front, toc });

  it("is a table of real entries, each with a page number Word keeps right", () => {
    expect(xml).not.toContain("TOC \\f");
    expect(xml).toContain('<w:pStyle w:val="TOC1"/>');
    expect(xml).toContain(" PAGEREF ");
    expect(xml).toContain('<w:fldChar w:fldCharType="end"/>');
  });

  /**
   * `\o "1-2"` collects by style NAME, not by styleId, so "heading 1" is the
   * part that matters. Without it a refresh finds nothing and Word replaces the
   * table with "No table of contents entries found."
   */
  it("styles the headings so a refresh can find them again", async () => {
    expect(xml).toContain('<w:pStyle w:val="Heading1"/>');
    expect(xml).toContain('<w:pStyle w:val="Heading2"/>');
    const zip = await JSZip.loadAsync(buildCleanDocx({ title: "T", clauses, front, toc }));
    const styles = await zip.file("word/styles.xml")!.async("string");
    expect(styles).toContain('<w:name w:val="heading 1"/>');
    expect(styles).toContain('<w:name w:val="heading 2"/>');
    expect(styles).toContain('<w:outlineLvl w:val="0"/>');
  });

  /** Without this Word shows the shipped page numbers for ever. */
  it("tells Word its fields are stale, so it offers to rebuild them on open", async () => {
    const zip = await JSZip.loadAsync(buildCleanDocx({ title: "T", clauses, front, toc }));
    const settings = await zip.file("word/settings.xml")!.async("string");
    expect(settings).toContain('<w:updateFields w:val="true"/>');
  });

  it("anchors every entry to a bookmark on its heading", () => {
    for (const entry of toc) {
      expect(xml).toContain(
        `<w:bookmarkStart w:id="${1000 + entry.index}" w:name="${entry.anchor}"`,
      );
      expect(xml).toContain(`PAGEREF ${entry.anchor} \\h`);
    }
  });
});

/**
 * Phase 5: a marked-up clause on its way to the counterparty.
 *
 * The assertion this block exists for is CLEAN-PARAS. `buildCleanDocx` cleaned
 * `segs` and left `paras` untouched — harmless while paragraphs carried no
 * tracked kinds, and a disaster the moment they did: a document labelled clean,
 * sent out for signature, with every deletion still in it.
 */
describe("tracked changes in structured paragraphs", () => {
  const clause = {
    num: "1.1",
    title: "Delivery",
    segs: [],
    paras: [
      {
        runs: [
          { t: "The Seller shall ", k: "n" as const },
          { t: "promptly ", k: "i" as const, a: "Podrick Robogo" },
          { t: "forthwith ", k: "d" as const, a: "Mawusi Kwame" },
          { t: "deliver.", k: "n" as const },
        ],
      },
    ],
  };

  it("sends a paragraph's insertions and deletions as real Word revisions", () => {
    const xml = buildDocumentXml({ title: "Test", clauses: [clause], author: "Scripta" });
    expect(xml).toContain("<w:ins");
    expect(xml).toContain("<w:del");
    expect(xml).toContain("<w:delText");
  });

  /* Every run keeps its own author, which is the whole of Phase 5 arriving in
     the counterparty's margin. */
  it("names each lawyer against their own change", () => {
    const xml = buildDocumentXml({ title: "Test", clauses: [clause], author: "Scripta" });
    expect(xml).toContain('w:author="Podrick Robogo"');
    expect(xml).toContain('w:author="Mawusi Kwame"');
  });

  it("falls back to the document author for a run with no name", () => {
    const xml = buildDocumentXml({
      title: "Test",
      author: "Scripta",
      clauses: [{ ...clause, paras: [{ runs: [{ t: "added", k: "i" as const }] }] }],
    });
    expect(xml).toContain('w:author="Scripta"');
  });

  /* CLEAN-PARAS. */
  it("leaves no deletion in a clean copy of a structured clause", () => {
    const bytes = buildCleanDocx({ title: "Test", clauses: [clause], author: "Scripta" });
    const text = new TextDecoder().decode(bytes);
    expect(text).not.toContain("forthwith");
  });
});

describe("Word's revision dates", () => {
  const clause = (segs: ExportSeg[]) => ({
    title: "Acceptance",
    date: "2026-01-01T00:00:00Z",
    clauses: [{ num: "1.1", title: "Payment", segs }],
  });

  it("uses each proposal's own date, not the moment of export", () => {
    const xml = buildDocumentXml(
      clause([
        { t: "Payment within ", k: "n" },
        { t: "sixty", k: "d", a: "Mawusi Adusu", d: "2026-09-10T08:00:00.000Z" },
        { t: "thirty", k: "i", a: "Podrick Robogo", d: "2026-09-16T09:12:00.000Z" },
      ]) as never,
    );
    expect(xml).toContain('w:author="Mawusi Adusu" w:date="2026-09-10T08:00:00.000Z"');
    expect(xml).toContain('w:author="Podrick Robogo" w:date="2026-09-16T09:12:00.000Z"');
    // Two proposals a week apart must not read as one moment.
    expect(xml).not.toContain('w:date="2026-01-01T00:00:00Z"');
  });

  it("falls back to the document's date for a run that carries none", () => {
    const xml = buildDocumentXml(
      clause([
        { t: "Payment within ", k: "n" },
        { t: "sixty", k: "d", a: "Mawusi Adusu" },
      ]) as never,
    );
    expect(xml).toContain('w:date="2026-01-01T00:00:00Z"');
  });
});

describe("the firm's Word letterhead, as its own templates are set", () => {
  const letterClauses: ExportClause[] = [
    { num: "", title: "", segs: [{ t: "Dear Sir/Madam,", k: "n" }] },
  ];
  const paper = async (titlePage: boolean) => {
    const template = await readDocxTemplate(await templateDocx());
    return {
      mode: "page" as const,
      bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      mime: "image/png" as const,
      widthEmu: 11910 * 635,
      heightEmu: 16845 * 635,
      template: { ...template, titlePage, page: { ...template.page, header: 300, footer: 384 } },
    };
  };

  it("puts the letterhead on page one when the template does not make page one different", async () => {
    // The NA and GMG letterheads have no titlePg. Marking page one different
    // anyway took their empty first-page header, and a one-page letter went
    // out with no logo and no footer.
    const xml = buildDocumentXml({
      title: "",
      kind: "letter",
      clauses: letterClauses,
      letterhead: await paper(false),
    });
    expect(xml).not.toContain("<w:titlePg/>");
    expect(xml).not.toContain('w:type="first"');
    expect(xml).toMatch(/<w:headerReference w:type="default" r:id="rId\d+"\/>/);
  });

  it("keeps page one its own when the template says so", async () => {
    const xml = buildDocumentXml({
      title: "",
      kind: "letter",
      clauses: letterClauses,
      letterhead: await paper(true),
    });
    expect(xml).toContain("<w:titlePg/>");
    expect(xml).toMatch(/<w:headerReference w:type="first" r:id="rId\d+"\/>/);
  });

  it("sets the header and footer where the template sets them", async () => {
    const xml = buildDocumentXml({
      title: "",
      kind: "resolution",
      clauses: letterClauses,
      letterhead: await paper(false),
    });
    expect(xml).toContain('w:header="300" w:footer="384"');
  });
});

describe("a corporate document's page", () => {
  it("prints no empty title paragraph for a letter", () => {
    const xml = buildDocumentXml({
      title: "",
      kind: "letter",
      clauses: [{ num: "", title: "", segs: [{ t: "16th September 2026", k: "n" }] }],
    });
    expect(xml).not.toContain('<w:pStyle w:val="Title"/>');
  });

  it("carries no page number when the document goes without", async () => {
    const files = await unzip(buildDocx({ ...OPTS, kind: "letter", furniture: false }));
    expect(files["word/footer1.xml"]).not.toContain("PAGE");
  });

  it("sets a resolution in the firm's resolution measure", async () => {
    const styles = (await unzip(buildDocx({ ...OPTS, kind: "resolution" })))["word/styles.xml"]!;
    expect(styles).toContain('<w:color w:val="1A1A1A"/><w:sz w:val="22"/>');
    expect(styles).toContain('w:before="0" w:after="120" w:line="240" w:lineRule="auto"');
    expect(styles).toContain('<w:spacing w:before="480" w:after="160"/>');
  });

  it("lays a clause out where it says, and a signing table as a table without borders", () => {
    const xml = buildDocumentXml({
      title: "Resolution",
      kind: "resolution",
      numbering: "literal",
      clauses: [
        {
          num: "(A)",
          title: "",
          segs: [{ t: "A recital.", k: "n" }],
          layout: { left: 933, hanging: 560, right: -326, after: 120 },
        },
        {
          num: "",
          title: "",
          segs: [{ t: "rule\nName\nDirector", k: "n" }],
          table: {
            rows: [
              [
                [
                  [{ text: "……" }],
                  [{ text: "Dominik Kleemann", bold: true }],
                  [{ text: "Director" }],
                ],
              ],
            ],
          },
        },
      ],
    });
    expect(xml).toContain(
      '<w:spacing w:after="120"/><w:ind w:left="933" w:right="-326" w:hanging="560"/>',
    );
    expect(xml).toContain('<w:top w:val="nil"/>');
    expect(xml).toContain('<w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Dominik Kleemann</w:t>');
  });
});

describe("a sub-clause written as paragraphs", () => {
  it("keeps its clause number under Word's list", () => {
    // Once a sub-clause had been edited its words became paragraphs, and 1.2
    // went out with no number at all.
    const xml = buildDocumentXml({
      ...OPTS,
      clauses: [
        { num: "1", title: "Definitions", segs: [] },
        {
          num: "1.2",
          title: "",
          segs: [{ t: "Headings do not affect interpretation.", k: "n" }],
          paras: [
            { runs: [{ t: "Headings do not affect interpretation.", k: "n" }] },
            { runs: [{ t: "A second paragraph.", k: "n" }] },
          ],
        },
      ],
    });
    expect(xml).toContain(
      '<w:p><w:pPr><w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr></w:pPr>' +
        '<w:r><w:t xml:space="preserve">Headings do not affect interpretation.</w:t></w:r></w:p>',
    );
    // Numbered once; the second paragraph lines up with the words.
    expect(xml.match(/<w:numPr>/g)).toHaveLength(2);
    expect(xml).toContain(
      '<w:pPr><w:ind w:left="720"/></w:pPr><w:r><w:t xml:space="preserve">A second',
    );
  });
});

describe("the execution page", () => {
  const front = buildFrontMatter({
    agreementType: "Employment Contract",
    client: "Nexis Africa Ghana Ltd",
    counterparty: "Alice Dennis Ewurakua",
    date: "2026-09-01",
  });

  it("closes a contract with a signing table for each party, on its own page", () => {
    const xml = buildDocumentXml({
      title: "Employment Contract",
      clauses: [{ num: "1", title: "TERM", segs: [{ t: "Indefinite.", k: "n" }] }],
      front,
    });
    const at = xml.indexOf(">EXECUTION</w:t>");
    expect(at).toBeGreaterThan(xml.indexOf(">Indefinite.</w:t>"));
    expect(xml.lastIndexOf('<w:br w:type="page"/>', at)).toBeGreaterThan(
      xml.indexOf("Indefinite."),
    );
    for (const party of ["Nexis Africa Ghana Ltd", "Alice Dennis Ewurakua"])
      expect(xml).toContain(`<w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${party}</w:t>`);
    expect(xml.match(/by its duly authorised officer:/g)).toHaveLength(2);
    expect(xml.match(/In the presence of:/g)).toHaveLength(2);
    expect(xml.match(/Witness signature/g)).toHaveLength(2);
    expect(xml.slice(at)).toContain("<w:tbl>");
  });

  it("is not added to a document with no parties", () => {
    const xml = buildDocumentXml({ ...OPTS });
    expect(xml).not.toContain("EXECUTION");
  });
});
