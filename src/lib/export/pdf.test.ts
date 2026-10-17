import { buildFrontMatter } from "./front-matter";
import { extractText } from "unpdf";
import { describe, expect, it } from "vitest";
import type { ExportClause } from "./docx";
import {
  buildCleanPdf,
  buildPdf,
  bodyInsets,
  layout,
  layoutToc,
  letterheadDrop,
  pdfString,
  tableOfContents,
  winAnsi,
  wrapAtoms,
} from "./pdf";

const CLAUSES: ExportClause[] = [
  {
    num: "1",
    title: "Definitions",
    segs: [{ t: "In this Agreement, “Services” means the services in Schedule 1.", k: "n" }],
  },
  { num: "2", title: "Term and Termination", segs: [] },
  {
    num: "2.1",
    title: "Initial Term",
    segs: [
      { t: "The term shall continue for ", k: "n" },
      { t: "twelve (12) ", k: "d" },
      { t: "thirty-six (36) ", k: "i" },
      { t: "months from the Commencement Date.", k: "n" },
    ],
  },
  {
    num: "2.1.3",
    title: "The Consultant shall at all times…",
    segs: [{ t: "The Consultant shall at all times act reasonably.", k: "n" }],
  },
];

const OPTS = {
  title: "Consultancy Services Agreement",
  subtitle: "Nexis Africa · Meridian Holdings",
  clauses: CLAUSES,
};

/** Long enough to force page breaks, so pagination and the footer are exercised. */
const LONG = {
  ...OPTS,
  clauses: [
    ...CLAUSES,
    ...Array.from({ length: 24 }, (_, i) => ({
      num: `${i + 3}`,
      title: `Filler Clause ${i + 3}`,
      segs: [
        {
          t: "The parties acknowledge that the provisions of this clause are reasonable and necessary to protect the legitimate interests of each of them. ".repeat(
            2,
          ),
          k: "n" as const,
        },
      ],
    })),
  ],
};

/**
 * pdf.js transfers the buffer it is given, which detaches the caller's array.
 * Every reader here gets its own copy so the same export can be asserted on twice.
 */
const read = (bytes: Uint8Array) => extractText(new Uint8Array(bytes), { mergePages: false });

const ascii = (b: Uint8Array) => new TextDecoder("latin1").decode(b);

describe("file structure", () => {
  const pdf = buildPdf(LONG);
  const src = ascii(pdf);

  it("starts with a PDF header and ends with the EOF marker", () => {
    expect(src.slice(0, 8)).toBe("%PDF-1.4");
    expect(src.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("points startxref at a cross-reference table", () => {
    const at = Number(/startxref\s+(\d+)/.exec(src)![1]);
    expect(src.slice(at, at + 4)).toBe("xref");
  });

  /** A byte offset that misses its object is the classic way a hand-built PDF dies. */
  it("gives every object an xref entry that lands on that object", () => {
    const at = Number(/startxref\s+(\d+)/.exec(src)![1]);
    const head = /xref\s+0 (\d+)\s/.exec(src.slice(at))!;
    const count = Number(head[1]);
    const table = src.slice(at + head.index + head[0].length);
    expect(count).toBe(Number(/\/Size (\d+)/.exec(src)![1]));
    for (let i = 1; i < count; i++) {
      const entry = table.slice(i * 20, (i + 1) * 20);
      expect(entry).toHaveLength(20);
      expect(entry.endsWith("n \n")).toBe(true);
      expect(src.startsWith(`${i} 0 obj`, Number(entry.slice(0, 10)))).toBe(true);
    }
  });

  it("declares a trailer with a catalog root", () => {
    expect(src).toMatch(/trailer\s*<< \/Size \d+ \/Root 1 0 R \/Info \d+ 0 R >>/);
    expect(src).toContain("<< /Type /Catalog /Pages 2 0 R >>");
  });

  it("declares one page object per /Kids entry and a matching /Count", () => {
    const kids = /\/Kids \[([^\]]*)\]/
      .exec(src)![1]!
      .trim()
      .split(/\s+0 R\s*/)
      .filter(Boolean);
    expect(kids.length).toBeGreaterThan(1);
    expect(Number(/\/Count (\d+)/.exec(src)![1])).toBe(kids.length);
    expect(src.match(/\/Type \/Page[ /]/g)).toHaveLength(kids.length);
  });

  it("states a byte-accurate /Length for every content stream", () => {
    const streams = [...src.matchAll(/<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/g)];
    expect(streams.length).toBeGreaterThan(1);
    for (const m of streams) expect(m[2]!.length).toBe(Number(m[1]));
  });

  it("uses only base-14 faces, so nothing has to be embedded", () => {
    // Helvetica, because it is the base-14 face metric-compatible with the
    // Arial the Word export is set in.
    expect(src).toContain("/BaseFont /Helvetica");
    expect(src).toContain("/BaseFont /Helvetica-Bold");
    expect(src).toContain("/BaseFont /Helvetica-Oblique");
    expect(src).not.toContain("/FontFile");
    expect(src.match(/\/Encoding \/WinAnsiEncoding/g)).toHaveLength(3);
  });

  it("sets A4 with one-inch margins, matching the Word export", () => {
    expect(src).toContain("/MediaBox [0 0 595.28 841.89]");
    // Nothing is drawn outside the text column.
    const xs = [...src.matchAll(/1 0 0 1 (-?[\d.]+) [\d.]+ Tm/g)].map((m) => Number(m[1]));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(72);
    expect(Math.max(...xs)).toBeLessThan(595.28 - 72);
  });
});

describe("a reader can actually open it", () => {
  it("parses, and every clause number and title survives the round trip", async () => {
    const { totalPages, text } = await read(buildPdf(OPTS));
    expect(totalPages).toBe(1);
    const page = text[0]!;
    expect(page).toContain("CONSULTANCY SERVICES AGREEMENT");
    expect(page).toContain("Nexis Africa · Meridian Holdings");
    // First-level headings are set in capitals, as Word's Heading 1 sets them.
    expect(page).toContain("1. DEFINITIONS");
    expect(page).toContain("2. TERM AND TERMINATION");
    expect(page).toContain("2.1 Initial Term");
  });

  it("keeps WinAnsi punctuation legible rather than mangling it", async () => {
    const page = (await read(buildPdf(OPTS))).text[0]!;
    expect(page).toContain("“Services”");
    expect(page).not.toContain("?");
  });

  it("paginates, and numbers every page with the running total", async () => {
    const { totalPages, text } = await read(buildPdf(LONG));
    expect(totalPages).toBeGreaterThan(1);
    text.forEach((p, i) => {
      expect(p).toContain(`Page ${i + 1} of ${totalPages}`);
      // The running head repeats on every page.
      expect(p).toContain("Consultancy Services Agreement");
    });
  });

  it("does not repeat a sub-clause title that is only the opening of its body", async () => {
    const page = (await read(buildPdf(OPTS))).text[0]!;
    expect(page.match(/The Consultant shall at all times/g)).toHaveLength(1);
  });
});

describe("redline variant", () => {
  const src = ascii(buildPdf(OPTS));

  it("keeps both sides of the change", async () => {
    const page = (await read(buildPdf(OPTS))).text[0]!;
    expect(page).toContain("continue for twelve (12) thirty-six (36) months");
  });

  it("marks revisions with rules, not with a colour alone", () => {
    // Two filled rules in the revision colour: one underline, one strike.
    const marks = [...src.matchAll(/0\.72 0\.11 0\.09 rg ([\d.]+) ([\d.]+) ([\d.]+) 0\.6 re f/g)];
    expect(marks).toHaveLength(2);
    for (const m of marks) expect(Number(m[3])).toBeGreaterThan(0);
    // The strike sits above the baseline, the underline below it.
    const ys = marks.map((m) => Number(m[2])).sort((a, b) => a - b);
    expect(ys[1]! - ys[0]!).toBeGreaterThan(1);
  });

  it("draws the revision text in the revision colour", () => {
    expect(src).toContain("BT 0.72 0.11 0.09 rg /F1 12 Tf");
  });
});

describe("the highlighter", () => {
  const marked: ExportClause[] = [
    {
      num: "1",
      title: "Fees",
      segs: [
        { t: "The Customer shall pay ", k: "n" },
        { t: "USD 6,000 per month", k: "n", m: { hl: true } },
        { t: " in arrears.", k: "n" },
      ],
    },
  ];

  it("paints a band of yellow under the highlighted words, and only those", () => {
    const src = ascii(buildPdf({ ...OPTS, clauses: marked }));
    const bands = [...src.matchAll(/1 1 0 rg ([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) re f/g)];
    expect(bands).toHaveLength(1);
    // Wide enough to be the phrase and not a character, and tall enough to
    // cover the line rather than sit as a rule under it.
    expect(Number(bands[0]![3])).toBeGreaterThan(50);
    expect(Number(bands[0]![4])).toBeGreaterThan(8);
  });

  it("puts the words on top of the band, not under it", () => {
    const src = ascii(buildPdf({ ...OPTS, clauses: marked }));
    expect(src.indexOf("1 1 0 rg")).toBeLessThan(src.indexOf("(USD 6,000 per month)"));
  });

  it("marks the clean copy too: a highlight is not a revision", () => {
    expect(ascii(buildCleanPdf({ ...OPTS, clauses: marked }))).toContain("1 1 0 rg");
  });
});

describe("clean variant", () => {
  it("drops deletions and keeps insertions as ordinary text", async () => {
    const page = (await read(buildCleanPdf(OPTS))).text[0]!;
    expect(page).toContain("continue for thirty-six (36) months");
    expect(page).not.toContain("twelve (12)");
  });

  it("carries no revision marks at all", () => {
    const src = ascii(buildCleanPdf(OPTS));
    expect(src).not.toContain("0.72 0.11 0.09");
  });

  it("is still a complete, readable document", async () => {
    const { totalPages, text } = await read(buildCleanPdf(LONG));
    expect(totalPages).toBeGreaterThan(1);
    expect(text[0]).toContain("CONSULTANCY SERVICES AGREEMENT");
    expect(text[totalPages - 1]).toContain(`Page ${totalPages} of ${totalPages}`);
  });
});

describe("layout", () => {
  it("sets clause levels where Word's list sets them", () => {
    const ops = layout(OPTS, false).flat().join("\n");
    const xOf = (needle: string) =>
      Number(new RegExp(`1 0 0 1 ([\\d.]+) [\\d.]+ Tm \\(${needle}`).exec(ops)![1]);
    // 1. and 1.1 share the margin, their words 36pt in; (a) steps further in.
    expect(xOf("DEFINITIONS")).toBe(xOf("Initial Term"));
    expect(xOf("DEFINITIONS")).toBe(72 + 36);
    expect(xOf("The Consultant")).toBeGreaterThan(xOf("Initial Term"));
    // Numbers hang to the left of the text they introduce.
    expect(xOf("2\\.1\\)")).toBeLessThan(xOf("Initial Term"));
  });

  it("prints each clause number exactly once", () => {
    const ops = layout(OPTS, false).flat().join("\n");
    expect(ops.match(/\(2\.1\) Tj/g)).toHaveLength(1);
    expect(ops.match(/\(2\.1\.3\) Tj/g)).toHaveLength(1);
  });

  it("leaves an unnumbered paragraph unnumbered", () => {
    const ops = layout(
      { ...OPTS, clauses: [{ num: "", title: "", segs: [{ t: "Recital.", k: "n" }] }] },
      false,
    )
      .flat()
      .join("\n");
    expect(ops).toContain("(Recital.) Tj");
  });

  it("wraps greedily to the text column and never past it", () => {
    const style = { font: "F1" as const, size: 10.5, color: "0 0 0" };
    const atoms = Array.from({ length: 60 }, () => ({
      text: "indemnification ",
      style,
    }));
    const lines = wrapAtoms(
      atoms.flatMap((a) => [
        { text: a.text.trim(), style, w: 70, space: false },
        { text: " ", style, w: 3, space: true },
      ]),
      0,
      0,
    );
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(l.atoms.reduce((n, a) => n + a.w, 0)).toBeLessThanOrEqual(451.28);
    // No line begins or ends on whitespace.
    for (const l of lines) {
      expect(l.atoms[0]!.space).toBe(false);
      expect(l.atoms[l.atoms.length - 1]!.space).toBe(false);
    }
  });
});

describe("encoding", () => {
  it("maps typographic punctuation into WinAnsi", () => {
    expect(
      winAnsi("—–’“”…")
        .split("")
        .map((c) => c.charCodeAt(0)),
    ).toEqual([0x97, 0x96, 0x92, 0x93, 0x94, 0x85]);
  });

  it("passes Latin-1 through and degrades what Helvetica cannot set", () => {
    expect(winAnsi("café §5")).toBe("café §5");
    expect(winAnsi("你好")).toBe("??");
  });

  it("escapes the three characters that would break a PDF string", () => {
    expect(pdfString("a(b)c\\d")).toBe("a\\(b\\)c\\\\d");
  });

  it("cannot emit an unescaped delimiter into a content stream", () => {
    const src = ascii(
      buildPdf({
        ...OPTS,
        clauses: [{ num: "1", title: "T", segs: [{ t: "(a) b) \\", k: "n" }] }],
      }),
    );
    expect(src).toContain("(\\(a\\) b\\) \\\\) Tj");
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
    clientAddress:
      "a company incorporated under the laws of the Republic of Ghana with its registered office at 12 Bissau Avenue, East Legon, Accra",
  });
  const opts = {
    title: "Employment Contract",
    clauses: [
      { num: "1", title: "DEFINITIONS", segs: [{ t: "In this Agreement…", k: "n" as const }] },
    ],
  };

  it("puts the cover on its own page and the preamble on the next", () => {
    // The Word export has carried these since the front matter was built. The
    // PDF did not, so the same contract downloaded as a PDF arrived without
    // its first two pages and said nothing about it.
    const pages = layout({ ...opts, front }, false);
    expect(pages.length).toBeGreaterThanOrEqual(2);
    const asText = (page: string[]) => page.join(" ");
    expect(asText(pages[0]!)).toContain("EMPLOYMENT CONTRACT");
    expect(asText(pages[0]!)).not.toContain("BETWEEN");
    expect(asText(pages[1]!)).toContain("BETWEEN");
  });

  it("sets the front in the house form", () => {
    const page = layout({ ...opts, front }, false)[1]!.join("\n");
    // The type in bold, the rest of the sentence regular, the ordinal raised.
    expect(page).toMatch(/\/F2 12 Tf [\d.]+ Tw 0 Ts 1 0 0 1 72 /);
    // Left-aligned lines carry no word spacing of their own, and none inherited.
    expect(page).toMatch(/\/F2 12 Tf 0 Tw 0 Ts 1 0 0 1 72 [\d.]+ Tm \(BETWEEN:\) Tj/);
    expect(page).toMatch(/\/F1 7\.8 Tf( [\d.]+ Tw)? 3\.96 Ts 1 0 0 1 [\d.]+ [\d.]+ Tm \(st\) Tj/);
    // The party number sits at the margin and its particulars at the hanging
    // indent, 1.25cm in, on every line of the paragraph.
    const hang = 72 + 709 / 20;
    // "(1)" is escaped in a PDF string, so the op reads (\(1\)).
    expect(page).toMatch(/1 0 0 1 72 [\d.]+ Tm \(\\\(1\\\)\) Tj/);
    expect(page).toMatch(
      new RegExp(`1 0 0 1 ${hang.toFixed(2)} [\\d.]+ Tm \\(Acme Ghana Ltd, a company`),
    );
    const wrapped = page.match(new RegExp(`1 0 0 1 ${hang.toFixed(2)} [\\d.]+ Tm`, "g")) ?? [];
    expect(wrapped.length).toBeGreaterThan(1);
    // Justified: the full lines of the party paragraph carry word spacing.
    expect(page).toMatch(/Tf (?!0 Tw)[\d.]+ Tw 0 Ts 1 0 0 1 107\.45/);
  });

  it("moves the cover title below the middle, or to the foot, when asked", () => {
    const titleY = (coverY: number) => {
      const cover = layout({ ...opts, front: { ...front, coverY } }, false)[0]!;
      const op = cover.find((o) => o.includes("(EMPLOYMENT CONTRACT)"))!;
      return Number(/ 1 0 0 1 [\d.]+ ([\d.]+) Tm/.exec(op)![1]);
    };
    const top = titleY(0);
    const middle = titleY(0.62);
    const foot = titleY(1);
    expect(top).toBeGreaterThan(middle);
    expect(middle).toBeGreaterThan(foot);
    // At the top the title hangs just under the top margin.
    expect(top).toBeGreaterThan(841.89 - 72 - 30);
    // Below the centre of the page, clear of a logo there, but not at the foot.
    expect(middle).toBeLessThan(841.89 / 2);
    expect(middle).toBeGreaterThan(841.89 * 0.25);
    // Even asked for the very foot, the title stays inside the bottom margin.
    expect(foot).toBeGreaterThan(72);
  });

  it("frames the cover title with a rule above and below", () => {
    const cover = layout({ ...opts, front }, false)[0]!.join("\n");
    expect(cover.match(/0\.5 w 72 [\d.]+ m 523\.28 [\d.]+ l S/g)).toHaveLength(2);
    expect(cover).toContain("/F2 14 Tf");
  });

  it("still reaches the clauses after the front", () => {
    const all = layout({ ...opts, front }, false)
      .flat()
      .join(" ");
    expect(all).toContain("DEFINITIONS");
  });

  it("falls back to the plain title block when there is no front matter", () => {
    const pages = layout({ ...opts, subtitle: "Acme · Jane Doe" }, false);
    expect(pages[0]!.join(" ")).toContain("EMPLOYMENT CONTRACT");
    expect(pages.length).toBe(1);
  });
});

describe("the letterhead", () => {
  const jpegPaper = new Uint8Array([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x64, 0x01, 0x2c, 3, 0xff, 0xd9,
  ]);
  const opts = {
    title: "Board Resolution",
    clauses: [{ num: "", title: "", segs: [{ t: "It is resolved…", k: "n" as const }] }],
  };

  it("puts the paper in the file, and only on the first page", () => {
    // Word carried a letterhead and the PDF silently did not, which is the same
    // defect as the PDF that had no cover page.
    const bytes = buildCleanPdf({
      ...opts,
      letterhead: {
        bytes: jpegPaper,
        mime: "image/jpeg",
        widthEmu: 5_733_415,
        heightEmu: 1_956_165,
      },
    });
    const text = new TextDecoder("latin1").decode(bytes);
    expect(text).toContain("/Subtype /Image");
    expect(text).toContain("/Filter /DCTDecode");
    expect(text).toContain("/XObject << /Letterhead");
    // Drawn once, not once per page.
    expect(text.split("/Letterhead Do").length - 1).toBe(1);
  });

  it("starts the body below the paper rather than under it", () => {
    // The image was painted at the top of page one while the body had been laid
    // out from the ordinary top, so the paper covered the title, the date and
    // the recitals. Codex found it by looking at the rendered page.
    const paper = {
      bytes: jpegPaper,
      mime: "image/jpeg" as const,
      widthEmu: 5_733_415,
      heightEmu: 1_956_165,
    };
    const withPaper = layout({ ...opts, letterhead: paper }, false);
    const without = layout(opts, false);
    const firstY = (page: string[]) => {
      const m = page.join(" ").match(/1 0 0 1 [\d.]+ ([\d.]+) Tm/);
      return m ? Number(m[1]) : NaN;
    };
    expect(letterheadDrop(paper)).toBeGreaterThan(150);
    expect(firstY(withPaper[0]!)).toBeLessThan(firstY(without[0]!) - 150);
  });

  it("does not print a grey running head across the firm's logo", () => {
    const text = new TextDecoder("latin1").decode(
      buildCleanPdf({
        ...opts,
        letterhead: {
          bytes: jpegPaper,
          mime: "image/jpeg",
          widthEmu: 5_733_415,
          heightEmu: 1_956_165,
        },
      }),
    );
    // The title still runs on later pages and in the metadata; it is only the
    // branded first page that loses it.
    expect(text).toContain("/Title (Board Resolution)");
  });

  it("adds nothing at all when there is no letterhead", () => {
    const text = new TextDecoder("latin1").decode(buildCleanPdf(opts));
    expect(text).not.toContain("/Subtype /Image");
    expect(text).not.toContain("/XObject");
  });

  it("refuses an image it cannot place rather than printing a blank space", () => {
    expect(() =>
      buildCleanPdf({
        ...opts,
        letterhead: {
          bytes: new Uint8Array([1, 2, 3, 4]),
          mime: "image/png",
          widthEmu: 100,
          heightEmu: 50,
        },
      }),
    ).toThrow(/Only PNG and JPEG/);
  });
});

describe("the table of contents", () => {
  const front = buildFrontMatter({
    agreementType: "Employment Contract",
    client: "Acme Ghana Ltd",
    counterparty: "Jane Doe",
    date: "2026-09-01",
  });
  const filler =
    "The Employee shall perform the duties assigned with due diligence and care. ".repeat(12);
  const clauses: ExportClause[] = [1, 2, 3, 4, 5, 6].flatMap((n) => [
    { num: String(n), title: `SECTION ${n} HEADING`, segs: [] },
    { num: `${n}.1`, title: `Sub ${n}`, segs: [{ t: filler, k: "n" }] },
    { num: `${n}.1.1`, title: "", segs: [{ t: "Deeper text.", k: "n" }] },
    { num: `${n}.2`, title: `Other ${n}`, segs: [{ t: filler, k: "n" }] },
  ]);
  const opts = { title: "Employment Contract", clauses, front };

  it("takes the page after the cover, before the operative sentence", async () => {
    const { text } = await read(buildCleanPdf(opts));
    expect(text[0]).toContain("EMPLOYMENT CONTRACT");
    expect(text[0]).not.toContain("Table of Contents");
    // The cover is the front of the document, not a page of it: no number.
    expect(text[0]).not.toContain("Page 1 of");
    expect(text[1]).toContain("Table of Contents");
    expect(text[1]).not.toContain("BETWEEN");
    expect(text[2]).toContain("BETWEEN");
    expect(text[1]).toContain("Page 2 of");
  });

  it("lists every section and titled sub-section with the page it falls on", async () => {
    const toc = tableOfContents(opts, false);
    expect(toc.map((e) => e.label)).toEqual(
      [1, 2, 3, 4, 5, 6].flatMap((n) => [`${n}.`, `${n}.1`, `${n}.2`]),
    );
    expect(toc[0]).toMatchObject({ title: "Section 1 heading", page: 3 });
    const { text } = await read(buildCleanPdf(opts));
    for (const e of toc) {
      // The heading really is on the page the table says.
      const heading = e.level === 0 ? e.title.toUpperCase() : e.title;
      expect(text[e.page! - 1]).toContain(heading);
    }
    // Pages run forward through the table, and the last heading is late in the document.
    const pages = toc.map((e) => e.page!);
    expect([...pages].sort((a, b) => a - b)).toEqual(pages);
    expect(pages[pages.length - 1]).toBeGreaterThan(4);
  });

  it("sets sections bold at the margin and sub-sections italic a step in", () => {
    const page = layoutToc(tableOfContents(opts, false), true)[0]!.join("\n");
    expect(page).toMatch(/\/F2 14 Tf 0 Tw 0 Ts 1 0 0 1 72 [\d.]+ Tm \(Table of Contents\)/);
    expect(page).toMatch(/\/F2 12 Tf 0 Tw 0 Ts 1 0 0 1 72 [\d.]+ Tm \(1\.\)/);
    expect(page).toMatch(/\/F2 12 Tf 0 Tw 0 Ts 1 0 0 1 108 [\d.]+ Tm \(Section 1 heading\)/);
    expect(page).toMatch(/\/F3 12 Tf 0 Tw 0 Ts 1 0 0 1 108 [\d.]+ Tm \(1\.1\)/);
    expect(page).toMatch(/\/F3 12 Tf 0 Tw 0 Ts 1 0 0 1 144 [\d.]+ Tm \(Sub 1\)/);
    // The page number sits against the right margin.
    const pageNo = /\/F2 12 Tf 0 Tw 0 Ts 1 0 0 1 ([\d.]+) [\d.]+ Tm \(3\)/.exec(page);
    expect(pageNo).not.toBeNull();
    expect(Number(pageNo![1])).toBeGreaterThan(500);
  });

  it("is left out of a document with no front", async () => {
    const { text } = await read(buildCleanPdf({ title: "Memo", clauses }));
    expect(text.join(" ")).not.toContain("Table of Contents");
    expect(tableOfContents({ title: "Memo", clauses }, false)).toEqual([]);
  });
});

describe("the firm's paper", () => {
  const front = buildFrontMatter({
    agreementType: "Employment Contract",
    client: "Acme Ghana Ltd",
    counterparty: "Jane Doe",
    date: "2026-09-01",
  });
  const filler =
    "The Employee shall perform the duties assigned with due diligence and care. ".repeat(40);
  const clauses: ExportClause[] = [
    { num: "1", title: "DUTIES", segs: [{ t: filler, k: "n" }] },
    { num: "2", title: "TERM", segs: [{ t: filler, k: "n" }] },
  ];
  const jpegPaper = new Uint8Array([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x64, 0x01, 0x2c, 3, 0xff, 0xd9,
  ]);
  const paper = {
    mode: "page" as const,
    bytes: jpegPaper,
    mime: "image/jpeg" as const,
    widthEmu: 11910 * 635,
    heightEmu: 16845 * 635,
    continuation: { bytes: jpegPaper, mime: "image/jpeg" as const },
    bodyTop: 2400,
    bodyBottom: 1800,
  };

  it("draws page one's design behind page one and the continuation behind every other page", () => {
    const src = ascii(
      buildCleanPdf({ title: "Employment Contract", clauses, front, letterhead: paper }),
    );
    const streams = [...src.matchAll(/stream\n([\s\S]*?)\nendstream/g)].map((m) => m[1]!);
    const pages = streams.filter(
      (s) => /\/F[123] /.test(s) || /\/(Letterhead|Continuation) Do/.test(s),
    );
    expect(pages.length).toBeGreaterThan(2);
    expect(pages[0]).toContain(
      `${(595.28).toFixed(2)} 0 0 ${(841.89).toFixed(2)} 0 0 cm\n/Letterhead Do`,
    );
    for (const page of pages.slice(1)) {
      expect(page).toContain("/Continuation Do");
      expect(page).not.toContain("/Letterhead Do");
    }
    expect(src).toContain("/XObject << /Letterhead 7 0 R /Continuation 8 0 R >>");
  });

  it("keeps the body clear of the mark the following pages carry", () => {
    const pages = layout(
      { title: "Employment Contract", clauses, front, letterhead: paper },
      false,
    );
    // Page three is the first body page; its first baseline sits below the
    // header's reach (2400 twips = 120pt, plus air), and its last above the footer's.
    const ys = (page: string[]) =>
      page
        .map((op) => / 1 0 0 1 [\d.]+ ([\d.]+) Tm/.exec(op)?.[1])
        .filter(Boolean)
        .map(Number);
    const body = ys(pages[2]!);
    expect(Math.max(...body)).toBeLessThan(841.89 - 120 - 24);
    expect(Math.min(...body)).toBeGreaterThan(90 + 24);
    // A strip still takes only the house margin.
    expect(bodyInsets(undefined)).toEqual({ top: 72, bottom: 72 });
    expect(bodyInsets(paper)).toEqual({ top: 144, bottom: 114 });
  });

  it("clears the paper's header and footer on page one of a letter, not only on later pages", () => {
    const pages = layout(
      {
        title: "",
        kind: "letter",
        clauses: [{ num: "", title: "", segs: [{ t: filler, k: "n" }] }],
        letterhead: paper,
      },
      false,
    );
    const ys = pages[0]!
      .map((op) => / 1 0 0 1 [\d.]+ ([\d.]+) Tm/.exec(op)?.[1])
      .filter(Boolean)
      .map(Number);
    // The header reaches 2400 twips (120pt) down the page and the footer 1800
    // (90pt) up it; a third of an inch of air on each.
    expect(Math.max(...ys)).toBeLessThan(841.89 - 120 - 24);
    expect(Math.min(...ys)).toBeGreaterThan(90 + 24);
  });

  it("does not drop the cover for paper, which sits behind the page rather than above it", () => {
    expect(letterheadDrop(paper)).toBe(0);
  });

  it("prints no running head over the paper's own header, and still numbers the pages", async () => {
    const { text } = await read(
      buildCleanPdf({ title: "Employment Contract", clauses, front, letterhead: paper }),
    );
    expect(text[1]).not.toMatch(/^\s*Employment Contract\s*\n/);
    expect(text[1]).toContain("Page 2 of");
  });
});

describe("a corporate document", () => {
  it("keeps each line of an address block on its own line", async () => {
    // A newline used to be folded into a space, so the addressee's four lines
    // printed as one.
    const { text } = await read(
      buildCleanPdf({
        title: "",
        kind: "letter",
        numbering: "literal",
        furniture: false,
        clauses: [
          {
            num: "",
            title: "",
            segs: [{ t: "The Chief Executive Officer\nGhana Gold Board\n1 Thorpe Road", k: "n" }],
          },
        ],
      }),
    );
    const lines = text[0]!.split("\n").map((l) => l.trim());
    expect(lines).toContain("The Chief Executive Officer");
    expect(lines).toContain("Ghana Gold Board");
    expect(lines).toContain("1 Thorpe Road");
  });

  it("letters recitals and resolutions as given, in the body's weight and without a full stop", () => {
    const ops = layout(
      {
        title: "Resolution",
        kind: "resolution",
        numbering: "literal",
        clauses: [
          { num: "(A)", title: "", segs: [{ t: "A recital.", k: "n" }] },
          { num: "(a)", title: "", segs: [{ t: "A resolution.", k: "n" }] },
        ],
      },
      false,
    )
      .flat()
      .join("\n");
    // PDF escapes the parentheses of the marker inside its string.
    expect(ops).toMatch(/\/F1 11 Tf [^\n]*\(\\\(A\\\)\) Tj/);
    expect(ops).toMatch(/\/F1 11 Tf [^\n]*\(\\\(a\\\)\) Tj/);
    expect(ops).not.toContain("\\(A\\).");
    expect(ops).not.toContain("\\(a\\).");
  });

  it("sets a paragraph's alignment and marks, as Word does", () => {
    const ops = layout(
      {
        title: "",
        kind: "letter",
        clauses: [
          {
            num: "",
            title: "",
            segs: [{ t: "RE: SUBJECT", k: "n" }],
            paras: [
              { runs: [{ t: "RE: SUBJECT", k: "n", m: { b: true, u: true } }], align: "center" },
              { runs: [{ t: "16th September 2026", k: "n" }], align: "right" },
            ],
          },
        ],
      },
      false,
    )
      .flat()
      .join("\n");
    const x = (needle: string) =>
      Number(new RegExp(`1 0 0 1 ([\\d.]+) [\\d.]+ Tm \\(${needle}`).exec(ops)![1]);
    expect(ops).toMatch(/\/F2 12 Tf [^\n]*\(RE: SUBJECT\) Tj/);
    // Underlined with a rule, centred, and the date against the right margin.
    expect(ops).toMatch(/\(RE: SUBJECT\) Tj ET\n[\d. ]+ rg [\d. ]+ re f/);
    expect(x("RE: SUBJECT")).toBeGreaterThan(150);
    expect(x("16th September 2026")).toBeGreaterThan(x("RE: SUBJECT"));
  });

  it("carries no running head and no page number when the document goes without", async () => {
    const { text } = await read(buildCleanPdf({ ...LONG, furniture: false }));
    for (const page of text) {
      expect(page).not.toContain("Page 1 of");
      expect(page).not.toMatch(/^Consultancy Services Agreement/);
    }
  });

  it("closes a contract with the execution page", async () => {
    const front = buildFrontMatter({
      agreementType: "Employment Contract",
      client: "Nexis Africa Ghana Ltd",
      counterparty: "Alice Dennis Ewurakua",
      date: "2026-09-01",
    });
    const { text } = await read(buildCleanPdf({ ...OPTS, front }));
    const last = text.at(-1)!;
    expect(last).toContain("EXECUTION");
    expect(last).toContain("Signed for and on behalf of Nexis Africa");
    expect(last).toContain("Ewurakua by its duly authorised officer:");
    expect(last).toContain("In the presence of:");
  });
});
