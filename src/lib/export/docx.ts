/**
 * DOCX export with *real* Word tracked changes.
 *
 * Deletions become <w:del> and insertions <w:ins>, which Word treats as native
 * revisions a lawyer can accept or reject individually. This is deliberately not
 * coloured strikethrough text that merely looks like a redline — handing a
 * counterparty a lookalike is worse than handing them nothing.
 *
 * The package is a full (if small) WordprocessingML document: styles, a real
 * multilevel numbering definition, settings, and a header/footer pair. Clause
 * numbers therefore come from Word's list engine rather than literal text, so
 * the navigation pane, a table of contents and cross-references all work —
 * except where the caller asks for literal numbering, which documents whose
 * numbers are the author's own need (see DocxOptions.numbering).
 */
import { createZip, utf8, type ZipEntry } from "./zip";
import type { FrontMatter, FrontMatterLine, FrontMatterRun } from "./front-matter";
import {
  clauseLevel,
  headingText,
  isBodyOpening,
  isCounted,
  namedLabel,
  showsTitle,
  type TocEntry,
} from "./structure";
import { fitPageSizedDrawings, relIdsIn, type DocxTemplate } from "./letterhead-template";
import {
  HOUSE_ALIGN,
  HOUSE_FONT,
  HOUSE_FRONT,
  HOUSE_NUMBERING,
  HOUSE_PAGE,
  HOUSE_SPACING,
  HOUSE_TYPE,
  type DocumentKind,
} from "@/lib/house-style";

export type SegKind = "n" | "d" | "i";
/** The formatting a run carries. Absent means the document's body style. */
export type ExportMarks = {
  b?: boolean;
  i?: boolean;
  u?: boolean;
  /** Struck through as FORMATTING, not as a tracked deletion. */
  strike?: boolean;
  /** Six hex digits, no hash: "FF0000". */
  colour?: string;
  /**
   * Under the highlighter. Word's own highlight, not shading, so the reader
   * can lift it with the highlighter tool as they work through the document.
   */
  hl?: boolean;
};
export type ExportSeg = {
  t: string;
  k: SegKind;
  m?: ExportMarks;
  /**
   * The lawyer who proposed this run, for Word's own revision author.
   *
   * Phase 5 made every tracked change carry a name, and an export that
   * attributed all of them to one person would throw that away at exactly the
   * moment it matters most: the counterparty opens the file in Word and reads
   * the names in the margin. Absent falls back to `DocxOptions.author`, which
   * is what a document built from `clause_segments` still gives.
   */
  a?: string;
  /**
   * When it was proposed, for Word's revision date.
   *
   * The same argument as `a`, and it was losing the same argument. Every
   * revision carried one date — the moment the file was generated — so a
   * counterparty opening a negotiation in Word saw forty proposals made in the
   * same second, and could not tell what was asked for last week from what was
   * added this morning. Phase 5 stamps every change with `at`; this is what
   * carries it out of the building. Absent falls back to `DocxOptions.date`,
   * which is what a document built from `clause_segments` still gives.
   */
  d?: string;
};

/**
 * One paragraph of a document that has real structure — headings, alignment,
 * lists, quotations — rather than a single run of body text.
 *
 * A clause is one paragraph, so the contract export gives `segs` and nothing
 * else. A memo section is a piece of prose, so it gives `paras` and the words
 * arrive with the shape their author gave them.
 */
export type ExportPara = {
  runs: ExportSeg[];
  /** A heading level 1-3, or body prose. */
  heading?: 1 | 2 | 3;
  align?: "left" | "center" | "right" | "justify";
  list?: "ordered" | "bullet";
  /** Nesting depth of a list item, from 0. */
  level?: number;
  /** An indented block quotation. */
  quote?: boolean;
  /** A ruled table in place of the paragraph; `runs` is then ignored. */
  grid?: GridTable;
};

/**
 * A table with its rules drawn, as a schedule or a handover list is laid out.
 * Each cell is one run list; a newline in it is a line break in Word. A header
 * row is shaded, set in bold and repeated at the top of every page it spans.
 */
export type GridTable = {
  rows: { header?: boolean; cells: ExportSeg[][] }[];
  /**
   * Column widths in twips. Absent means equal columns across the portrait
   * text width, which is right for a handover list and wrong for a schedule
   * of deviations: there the clause reference needs an inch and the wording
   * either side of it needs everything left over. Given, their sum is the
   * table's width, so a landscape page can be filled.
   */
  widths?: number[];
};
export type ExportClause = {
  num: string;
  title: string;
  segs: ExportSeg[];
  /** When present, these paragraphs are the body and `segs` is ignored. */
  paras?: ExportPara[];
  /**
   * Print this one without its number — a definition in a section whose parts
   * are headed by the term they define rather than by 1.1, 1.2.
   *
   * `num` is still here and still right: it sets the indent, it orders the
   * document and it is what every cross-reference resolves through. Only the
   * label is withheld.
   */
  unnumbered?: boolean;
  /**
   * Where the clause sits and the space it takes, in twips, when the document
   * says so itself rather than leaving it to the numbering. A resolution's
   * recitals hang further in than its resolutions though both are lettered at
   * the first level, and each part of it keeps its own space beneath.
   */
  layout?: ClauseLayout;
  /**
   * A borderless signing table in place of the clause's words, which then
   * serve only as the plain-text reading of it (the in-app preview's).
   */
  table?: SignTable;
};

export type ClauseLayout = {
  left?: number | undefined;
  hanging?: number | undefined;
  right?: number | undefined;
  before?: number | undefined;
  after?: number | undefined;
};

/** One line of a signing block, in runs so a name can be set in bold. An empty line is room to sign. */
export type SignLine = { text: string; bold?: boolean }[];

/**
 * A table without borders that people sign in: rows of cells, each cell its
 * lines from the top. The firm's directors sign side by side in one, and each
 * party to a contract signs in its own.
 */
export type SignTable = {
  rows: SignLine[][][];
  /** Twips. Absent means the text width. */
  width?: number;
  /** Twips from the margin, negative to run out into it. */
  indent?: number;
  /** Space above the first line of every cell. */
  before?: number;
};

export type DocxOptions = {
  title: string;
  subtitle?: string;
  clauses: ExportClause[];
  /** Shown as the revision author in Word. */
  author?: string;
  /** ISO timestamp stamped on each revision. */
  date?: string;
  /**
   * How clause numbers reach the page.
   *
   * "list" (the default) hands the numbers to Word's list engine via w:numPr,
   * which is what a contract wants: its clause numbers are sequential, and live
   * numbering keeps the navigation pane, a table of contents and cross-references
   * working.
   *
   * "literal" prints the given number as run text instead. Documents like the
   * research memo carry section numbers that are the author's own — they may
   * skip, repeat or not be decimal at all — and Word's list engine would quietly
   * renumber them into 1, 2, 3.
   */
  numbering?: "list" | "literal";
  /**
   * The firm's paper. The exporter takes the bytes and the size it should be
   * drawn at; whose letterhead it is, and where it was stored, belong to the
   * caller. Omit it and the header stays empty, exactly as before.
   */
  letterhead?: DocxLetterhead;
  /**
   * Which of the firm's page setups to use. A contract runs closer to the top;
   * a letter leaves room for the letterhead it is printed on.
   */
  kind?: DocumentKind;
  /**
   * Turn the paper on its side. A schedule of deviations sets the clause, the
   * wording as it stood, the wording proposed and the reason side by side, and
   * four columns of contract prose on a portrait page is a column an inch wide.
   * Word wants the page dimensions swapped AND told, hence both.
   */
  orientation?: "portrait" | "landscape";
  /**
   * The cover page and preamble. Omit for a document that is only its parts —
   * a research memo has no parties to bind and no operative words.
   */
  front?: FrontMatter;
  /**
   * The table of contents, with the page each heading is expected on. Word
   * paginates for itself, so the numbers are a cache: the table is a real
   * TOC field and every entry a PAGEREF to a bookmark on its heading, marked
   * dirty so Word replaces the estimates with its own numbers on opening.
   * Only a contract — a document with a front — carries one.
   */
  toc?: TocEntry[];
  /**
   * Page numbers, and in the PDF a running head. On unless a document says
   * otherwise: the firm's letters and resolutions carry neither, so the
   * corporate export turns them off.
   */
  furniture?: boolean;
};

export type DocxLetterhead = {
  /**
   * "strip": an image across the top of page one, as a letter carries its
   * letterhead. "page": the firm's paper itself — page one's design and the
   * mark the pages after it carry — behind the text of every page.
   */
  mode?: "strip" | "page";
  bytes: Uint8Array;
  mime: "image/png" | "image/jpeg";
  /** English Metric Units. The caller preserves the aspect ratio. */
  widthEmu: number;
  heightEmu: number;
  /** Pages two onward as a picture, for paper that arrived as a PDF or image. */
  continuation?: { bytes: Uint8Array; mime: "image/png" | "image/jpeg" };
  /**
   * The paper as the firm's own Word template. Its page-one body and its
   * header and footer parts are spliced into the document, so Word shows the
   * paper exactly as the firm drew it; the pictures above are then not used.
   */
  template?: DocxTemplate;
  /**
   * How far, in twips from the page edge, the header and footer artwork of the
   * following pages reaches. The body starts and ends clear of it.
   */
  bodyTop?: number;
  bodyBottom?: number;
};

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const DECL = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`;
const W_NS = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"`;
const R_NS = `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"`;

/** A4 with 1in (1440 twip) margins: the extra side room a redline needs for Word's balloons. */
/** The page for a given kind of document, measured from the firm's own. */
const page = (kind: DocumentKind, paper?: DocxLetterhead, orientation?: "portrait" | "landscape") => {
  // On the firm's own Word paper the header and footer sit where the firm put
  // them. The Goldenmark logo is drawn 300 twips from the top; placed at
  // Word's default 708 instead, it pushed the whole of page one down.
  const reach = paper?.mode === "page" ? paper.template?.page : undefined;
  const house = HOUSE_PAGE[kind];
  // On the firm's paper the body keeps clear of the mark the following pages
  // carry, wherever that reaches; a house margin already clear of it stands.
  const clear = 480;
  const p =
    paper?.mode === "page"
      ? {
          ...house,
          top: Math.max(house.top, (paper.bodyTop ?? 0) + clear),
          bottom: Math.max(house.bottom, (paper.bodyBottom ?? 0) + clear),
        }
      : house;
  const sideways = orientation === "landscape";
  return (
    `<w:pgSz w:w="${sideways ? p.height : p.width}" w:h="${sideways ? p.width : p.height}"` +
    `${sideways ? ' w:orient="landscape"' : ""}/>` +
    `<w:pgMar w:top="${p.top}" w:right="${p.right}" w:bottom="${p.bottom}" w:left="${p.left}"` +
    ` w:header="${reach?.header ?? 708}" w:footer="${reach?.footer ?? 708}" w:gutter="0"/>`
  );
};

/** Text width at those margins, used for the header/footer tab stops. */
const TEXT_WIDTH = 11906 - 1440 * 2;

/** w:t must preserve leading/trailing spaces or words fuse across revisions. */
const tEl = (s: string) => `<w:t xml:space="preserve">${esc(s)}</w:t>`;
const delTextEl = (s: string) => `<w:delText xml:space="preserve">${esc(s)}</w:delText>`;

/**
 * OOXML has no implicit line break: a newline inside a w:t is simply dropped, so
 * multi-line text would print as one run-on line. Split it and join the pieces
 * with w:br, which is ordinary run content — it sits in the same choice group as
 * w:t and w:delText, so a break inside a w:del stays valid.
 */
const lines = (s: string, el: (line: string) => string) =>
  s
    .split(/\r\n|\r|\n/)
    .map((line) => (line ? el(line) : ""))
    .join("<w:br/>");

const t = (s: string) => lines(s, tEl);
const delText = (s: string) => lines(s, delTextEl);
/**
 * The run properties for a run's marks: bold, italic, strike, colour, underline.
 *
 * `strike` and `colour` are formatting and NOT tracked revisions, which is the
 * distinction a schedule of deviations turns on. Such a schedule records what
 * a bidder proposed, in red and struck through, as a statement of fact; if it
 * were built from w:ins and w:del then Accept All in Word would silently
 * rewrite the schedule into the thing it was describing.
 *
 * Element order is the one CT_RPr requires — b, i, strike, color, u. Emit them
 * in any other order and Word reports the file as needing repair.
 */
/**
 * `CT_RPr` is a SEQUENCE, so these are in the schema's order — b, i, strike,
 * color, highlight, u — and not in the order they were added. Word repairs a
 * file whose run properties are out of order, and a repair silently drops the
 * properties it could not place.
 */
const rPr = (m?: ExportMarks) => {
  if (!m?.b && !m?.i && !m?.u && !m?.strike && !m?.colour && !m?.hl) return "";
  return (
    `<w:rPr>${m.b ? "<w:b/>" : ""}${m.i ? "<w:i/>" : ""}` +
    `${m.strike ? "<w:strike/>" : ""}` +
    `${m.colour ? `<w:color w:val="${m.colour}"/>` : ""}` +
    `${m.hl ? '<w:highlight w:val="yellow"/>' : ""}` +
    `${m.u ? '<w:u w:val="single"/>' : ""}</w:rPr>`
  );
};
const run = (text: string, m?: ExportMarks) => `<w:r>${rPr(m)}${t(text)}</w:r>`;

/** Clause depth from its number: "2" → 0, "2.1" → 1, "2.1.3" → 2. The list has three levels. */
export { clauseLevel, isBodyOpening } from "./structure";

/** Left indent of each list level's text, matching numbering.xml. */
const INDENT = [720, 1080, 1440];

/** One run of the front: bold where the firm sets it bold, raised for an ordinal. */
const frontRun = (
  run: FrontMatterRun,
  strong: boolean | undefined,
  halfPoints?: number,
): string => {
  // Schema order: weight, then size, then vertical alignment.
  const props =
    (strong || run.bold ? "<w:b/>" : "") +
    (halfPoints ? `<w:sz w:val="${halfPoints}"/><w:szCs w:val="${halfPoints}"/>` : "") +
    (run.sup ? `<w:vertAlign w:val="superscript"/>` : "");
  const rPr = props ? `<w:rPr>${props}</w:rPr>` : "";
  // A tab in the text is Word's tab, not a character: it is what carries the
  // party's particulars out to the hanging indent.
  const text = run.text.split("\t").map(tEl).join("<w:tab/>");
  return `<w:r>${rPr}${text}</w:r>`;
};

/**
 * The cover title away from the top of the page: a frame anchored to the
 * page's margins, so it sits where it was placed whatever else the page
 * carries — the firm's letterhead has its logo in the middle of page one,
 * and the lawyer moves the title clear of it. At the very top no frame is
 * needed; the paragraph simply flows first.
 */
const coverFrame = (coverY: number | undefined, force = false): string => {
  if (!coverY && !force) return "";
  const page = HOUSE_PAGE.contract;
  const textHeight = page.height - page.top - page.bottom;
  // Keep the title on the page: a frame placed at the foot still needs its
  // own height above the bottom margin.
  const y = Math.round(textHeight * Math.min(coverY ?? 0, 0.92));
  return (
    `<w:framePr w:w="${TEXT_WIDTH}" w:wrap="notBeside" w:vAnchor="margin" w:hAnchor="margin"` +
    ` w:xAlign="center" w:y="${y}"/>`
  );
};

/**
 * The cover title, as a table of one cell.
 *
 * It used to be a paragraph with a rule above and below, which is what it
 * looks like and not what it is. Word gives you almost nothing to do with a
 * bordered paragraph: you cannot drag its edges, set its width, or move it
 * without moving everything around it. A single-cell table looks identical and
 * behaves like an object — grab a border and pull. A lawyer finishing the
 * document in Word can then make the title block theirs without rebuilding it.
 *
 * The vertical placement survives the change. A frame positioned the paragraph
 * against the page margin so the title could be moved clear of the letterhead's
 * logo; a floating table does the same through `w:tblpPr`, anchored the same
 * way, at the same offset.
 */
const coverTitleTable = (line: FrontMatterLine, coverY?: number, forceFrame = false): string => {
  const page = HOUSE_PAGE.contract;
  const textHeight = page.height - page.top - page.bottom;
  const y = Math.round(textHeight * Math.min(coverY ?? 0, 0.92));
  const float =
    coverY || forceFrame
      ? `<w:tblpPr w:vertAnchor="margin" w:horzAnchor="margin" w:tblpXSpec="center" w:tblpY="${y}"/>`
      : "";
  const align = line.align === "justify" ? "both" : line.align;
  const runs = line.runs ?? (line.text ? [{ text: line.text }] : []);
  const body = runs.map((run) => frontRun(run, line.strong, HOUSE_FRONT.coverHalfPoints)).join("");
  // The cell's own paragraph carries no border: the rules belong to the table
  // now, or Word would draw each of them twice.
  const inner =
    `<w:p><w:pPr><w:spacing w:before="${line.spaceBefore ?? 0}" w:after="${line.spaceAfter ?? 0}"` +
    ` w:line="${HOUSE_FRONT.line}" w:lineRule="auto"/><w:jc w:val="${align}"/>` +
    `<w:rPr><w:sz w:val="${HOUSE_FRONT.coverHalfPoints}"/>` +
    `<w:szCs w:val="${HOUSE_FRONT.coverHalfPoints}"/></w:rPr></w:pPr>${body}</w:p>`;
  return (
    `<w:tbl><w:tblPr>${float}<w:tblW w:w="${TEXT_WIDTH}" w:type="dxa"/><w:jc w:val="center"/>` +
    `<w:tblBorders>` +
    `<w:top w:val="single" w:sz="6" w:space="0" w:color="auto"/>` +
    `<w:bottom w:val="single" w:sz="6" w:space="0" w:color="auto"/>` +
    `<w:left w:val="nil"/><w:right w:val="nil"/>` +
    `<w:insideH w:val="nil"/><w:insideV w:val="nil"/>` +
    `</w:tblBorders>` +
    `<w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/>` +
    `<w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar>` +
    `</w:tblPr><w:tblGrid><w:gridCol w:w="${TEXT_WIDTH}"/></w:tblGrid>` +
    `<w:tr><w:tc><w:tcPr><w:tcW w:w="${TEXT_WIDTH}" w:type="dxa"/></w:tcPr>${inner}</w:tc></w:tr>` +
    `</w:tbl>`
  );
};

/**
 * One line of front matter, set as the firm's contracts set it: Arial 12 at
 * 1.15 lines, justified, the parties hanging 1.25cm from a tab after their
 * number, the cover title larger and ruled above and below. The paragraph
 * defaults are the body's, so every spacing here is stated rather than
 * inherited.
 */
const frontLine = (line: FrontMatterLine, coverY?: number, forceFrame = false): string => {
  // The title block is an object a lawyer finishes by hand, not a paragraph.
  if (line.size === "cover" && line.framed) return coverTitleTable(line, coverY, forceFrame);
  if (line.rule)
    // A rule is a bottom border on an empty paragraph, which is how Word draws
    // the lines above and below the agreement type on a cover page.
    return (
      `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="000000"/></w:pBdr>` +
      `<w:spacing w:before="120" w:after="120"/></w:pPr></w:p>`
    );
  const align = line.align === "justify" ? "both" : line.align;
  const border = line.framed
    ? `<w:pBdr><w:top w:val="single" w:sz="6" w:space="1" w:color="auto"/>` +
      `<w:bottom w:val="single" w:sz="6" w:space="1" w:color="auto"/></w:pBdr>`
    : "";
  const spacing =
    `<w:spacing w:before="${line.spaceBefore ?? 0}" w:after="${line.spaceAfter ?? 0}"` +
    ` w:line="${HOUSE_FRONT.line}" w:lineRule="auto"/>`;
  const indent = line.hanging
    ? `<w:ind w:left="${HOUSE_FRONT.hanging}" w:hanging="${HOUSE_FRONT.hanging}"/>`
    : "";
  const size =
    line.size === "cover"
      ? `<w:rPr><w:sz w:val="${HOUSE_FRONT.coverHalfPoints}"/><w:szCs w:val="${HOUSE_FRONT.coverHalfPoints}"/></w:rPr>`
      : "";
  const frame = line.size === "cover" ? coverFrame(coverY, forceFrame) : "";
  const pPr = `<w:pPr>${frame}${border}${spacing}${indent}<w:jc w:val="${align}"/>${size}</w:pPr>`;
  const runs = line.runs ?? (line.text ? [{ text: line.text }] : []);
  const body = runs
    .map((run) =>
      frontRun(run, line.strong, line.size === "cover" ? HOUSE_FRONT.coverHalfPoints : undefined),
    )
    .join("");
  return `<w:p>${pPr}${body}</w:p>`;
};

/** A field with a cached result, as Word writes one. */
const cachedField = (instr: string, cached: string, dirty = false) =>
  `<w:r><w:fldChar w:fldCharType="begin"${dirty ? ` w:dirty="true"` : ""}/></w:r>` +
  `<w:r><w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r>` +
  `<w:r><w:fldChar w:fldCharType="separate"/></w:r>` +
  cached +
  `<w:r><w:fldChar w:fldCharType="end"/></w:r>`;

/**
 * The table of contents, as the firm's contracts carry it: the heading, then
 * every section in bold and every sub-section in italics beneath it, each
 * with its page number at the right margin, over a dotted leader.
 *
 * It is NOT a TOC field. The document tells Word to update its fields when it
 * opens (`w:updateFields`, which the page numbers below need), and Word
 * rebuilds a TOC field from scratch when it does: it collects headings, so
 * every sub-clause that has none — 1.1, 1.2, 1.3, which is most of a
 * contract — was thrown away, and the reader was left with "No table of
 * contents entries found" where a correct table had been. Collecting hidden
 * TC entries instead did not survive that rebuild either.
 *
 * So the entries are the document's own words, in Word's own `toc 1` and
 * `toc 2` styles, each one a hyperlink to its clause. Only the page number is
 * a field: a PAGEREF, which Word corrects to its own pagination on open,
 * which is the one thing the exporter cannot know. What Scripta lists is what
 * the lawyer reads, and clicking an entry still goes to the clause.
 */
const tableOfContents = (toc: TocEntry[]): string[] => [
  `<w:p><w:pPr><w:pStyle w:val="TOCHeading"/></w:pPr>${run("Table of Contents")}</w:p>`,
  ...toc.map((e) => {
    const cached = `<w:r>${tEl(String(e.page ?? ""))}</w:r>`;
    return (
      `<w:p><w:pPr><w:pStyle w:val="TOC${e.level + 1}"/></w:pPr>` +
      `<w:hyperlink w:anchor="${e.anchor}" w:history="1">` +
      (e.label ? `<w:r>${tEl(e.label)}</w:r>` : "") +
      `<w:r><w:tab/></w:r><w:r>${tEl(e.title)}</w:r><w:r><w:tab/></w:r>` +
      cachedField(`PAGEREF ${e.anchor} \\h`, cached) +
      `</w:hyperlink></w:p>`
    );
  }),
];

/** A paragraph after a table, since Word will not end the body, or a page, on one. */
const SPACER = `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr></w:p>`;

/**
 * A signing table as Word draws it: no borders, fixed columns, and each line
 * its own left-aligned paragraph with nothing beneath it, so the rule, the
 * name and the office stack as they do in the firm's signed resolution.
 * Left-aligned said outright, because the document default is justified and
 * Word stretches a justified line that ends in a break.
 */
export const signTableXml = (table: SignTable): string => {
  const columns = Math.max(1, ...table.rows.map((row) => row.length));
  const width = table.width ?? TEXT_WIDTH;
  const column = Math.floor(width / columns);
  const cell = (lines: SignLine[]) => {
    const paras = (lines.length ? lines : [[]]).map((line, i) => {
      const runs = line
        .filter((r) => r.text)
        .map((r) => run(r.text, r.bold ? { b: true } : undefined))
        .join("");
      return (
        `<w:p><w:pPr><w:spacing w:before="${i === 0 ? (table.before ?? 0) : 0}" w:after="0"/>` +
        `<w:jc w:val="left"/></w:pPr>${runs}</w:p>`
      );
    });
    return `<w:tc><w:tcPr><w:tcW w:w="${column}" w:type="dxa"/></w:tcPr>${paras.join("")}</w:tc>`;
  };
  const rows = table.rows.map((row) => {
    const cells = [...row, ...Array.from({ length: columns - row.length }, (): SignLine[] => [])];
    return `<w:tr><w:trPr><w:cantSplit/></w:trPr>${cells.map(cell).join("")}</w:tr>`;
  });
  const nil = ["top", "left", "bottom", "right", "insideH", "insideV"]
    .map((side) => `<w:${side} w:val="nil"/>`)
    .join("");
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="${width}" w:type="dxa"/>` +
    (table.indent ? `<w:tblInd w:w="${table.indent}" w:type="dxa"/>` : "") +
    `<w:tblBorders>${nil}</w:tblBorders><w:tblLayout w:type="fixed"/>` +
    `<w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="113" w:type="dxa"/></w:tblCellMar>` +
    `</w:tblPr><w:tblGrid>${`<w:gridCol w:w="${column}"/>`.repeat(columns)}</w:tblGrid>` +
    `${rows.join("")}</w:tbl>${SPACER}`
  );
};

export const gridTableXml = (table: GridTable): string => {
  const columns = Math.max(1, ...table.rows.map((row) => row.cells.length));
  const even = Math.floor(TEXT_WIDTH / columns);
  const widths = Array.from({ length: columns }, (_, at) => table.widths?.[at] ?? even);
  const total = widths.reduce((sum, w) => sum + w, 0);
  const cell = (runs: ExportSeg[], header: boolean, column: number) => {
    const inner = runs
      .filter((r) => r.t)
      .map((r) => run(r.t, header ? { ...r.m, b: true } : r.m))
      .join("");
    return (
      `<w:tc><w:tcPr><w:tcW w:w="${column}" w:type="dxa"/>` +
      (header ? `<w:shd w:val="clear" w:color="auto" w:fill="EDEFEC"/>` : "") +
      // A row of contract prose is read from its first line down, so the cells
      // of one row have to start level. Left to Word they centre, and a short
      // clause reference floats in the middle of a half-page of wording.
      `<w:vAlign w:val="top"/>` +
      `</w:tcPr><w:p><w:pPr><w:spacing w:before="40" w:after="40"/><w:jc w:val="left"/></w:pPr>` +
      `${inner}</w:p></w:tc>`
    );
  };
  const rows = table.rows.map((row) => {
    const cells = [...row.cells, ...Array.from({ length: columns - row.cells.length }, () => [])];
    return (
      `<w:tr><w:trPr><w:cantSplit/>${row.header ? "<w:tblHeader/>" : ""}</w:trPr>` +
      `${cells.map((c, at) => cell(c, !!row.header, widths[at]!)).join("")}</w:tr>`
    );
  });
  const rule = ["top", "left", "bottom", "right", "insideH", "insideV"]
    .map((side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="A8B0AC"/>`)
    .join("");
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/>` +
    `<w:tblBorders>${rule}</w:tblBorders><w:tblLayout w:type="fixed"/>` +
    `<w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar>` +
    `</w:tblPr><w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>` +
    `${rows.join("")}</w:tbl>${SPACER}`
  );
};

/** The paragraph spacing a clause asks for, or nothing to take the style's. */
const spacingOf = (layout?: ClauseLayout) =>
  layout?.before === undefined && layout?.after === undefined
    ? ""
    : `<w:spacing${layout.before === undefined ? "" : ` w:before="${layout.before}"`}` +
      `${layout.after === undefined ? "" : ` w:after="${layout.after}"`}/>`;

/** An indent, the clause's own where it states one and the numbering's where it does not. */
const indentOf = (
  layout: ClauseLayout | undefined,
  fallback: { left?: number; hanging?: number },
): string => {
  const left = layout?.left ?? fallback.left;
  const hanging = layout?.hanging ?? fallback.hanging;
  const right = layout?.right;
  if (left === undefined && hanging === undefined && right === undefined) return "";
  return (
    `<w:ind${left === undefined ? "" : ` w:left="${left}"`}` +
    `${right === undefined ? "" : ` w:right="${right}"`}` +
    `${hanging === undefined ? "" : ` w:hanging="${hanging}"`}/>`
  );
};

/**
 * The page each party signs on, after the last clause.
 *
 * The firm's employment contract closes on its own EXECUTION page, a table per
 * party with room to sign and a witness beneath. It is set in plain bold
 * rather than as a heading so that refreshing the table of contents does not
 * list it as a clause.
 */
const executionXml = (tables: SignTable[]): string =>
  `<w:p><w:r><w:br w:type="page"/></w:r></w:p>` +
  `<w:p><w:pPr><w:keepNext/><w:spacing w:before="0" w:after="240"/><w:jc w:val="left"/></w:pPr>` +
  `${run("EXECUTION", { b: true })}</w:p>` +
  tables.map(signTableXml).join(SPACER);

export function buildDocumentXml(opts: DocxOptions): string {
  const author = esc(opts.author ?? "Scripta");
  const date = opts.date ?? "2026-01-01T00:00:00Z";
  let revId = 1;

  const body: string[] = [];
  const paper = paperPackage(opts.letterhead, opts.kind ?? "contract");

  if (opts.front) {
    // The cover, then a page break, then the words that make the clauses bite.
    // Without this the export opened on "1. DEFINITIONS AND INTERPRETATION",
    // which is not a contract: nothing said who was bound, on what date, or
    // why, and the operative sentence was missing entirely.
    //
    // On the firm's own Word paper, page one is drawn by the template's body
    // — its picture, its logo — which goes first; the title is then framed
    // over it wherever it was placed, since it can no longer simply flow first.
    if (paper.firstPageBody) body.push(paper.firstPageBody);
    for (const line of opts.front.cover)
      body.push(frontLine(line, opts.front.coverY, !!paper.firstPageBody));
    body.push(`<w:p><w:r><w:br w:type="page"/></w:r></w:p>`);
    // The table of contents has a page of its own between the cover and the
    // words that open the contract.
    if (opts.toc?.length) {
      body.push(...tableOfContents(opts.toc));
      body.push(`<w:p><w:r><w:br w:type="page"/></w:r></w:p>`);
    }
    for (const line of opts.front.preamble) body.push(frontLine(line));
  } else {
    // A letter has no title of its own. An empty Title paragraph still took a
    // 16pt line and its spacing above the date.
    if (opts.title)
      body.push(`<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr>${run(opts.title)}</w:p>`);
    if (opts.subtitle)
      body.push(`<w:p><w:pPr><w:pStyle w:val="Subtitle"/></w:pPr>${run(opts.subtitle)}</w:p>`);
  }

  const literal = opts.numbering === "literal";
  const listed = new Map((opts.toc ?? []).map((e) => [e.index, e]));

  opts.clauses.forEach((c, index) => {
    if (c.table) {
      body.push(signTableXml(c.table));
      return;
    }
    const lvl = clauseLevel(c.num);
    // A schedule, its parts and the execution block are not counted by Word's
    // list: they name themselves, and a schedule's paragraphs carry their own
    // number. Counted, they came out as clauses 14, 15 and 15.1.
    const own = literal || !isCounted(c.num);
    const printed = literal ? c.num.trim() : own ? namedLabel(c.num) : "";
    // Under Word's list numbering the words sit where numbering.xml puts them;
    // a literal number carries its own indent, stepped per level.
    const indent = own ? (INDENT[lvl] ?? 720) : (HOUSE_NUMBERING[lvl]?.left ?? 720);
    const numbered = !c.unnumbered && c.num.trim() !== "" && (!own || printed !== "");
    const numPr =
      numbered && !own ? `<w:numPr><w:ilvl w:val="${lvl}"/><w:numId w:val="1"/></w:numPr>` : "";
    // A literal number needs the hanging indent w:numPr would otherwise supply,
    // so the two modes lay out identically.
    const hanging = numbered && own ? indentOf(c.layout, { left: indent, hanging: 720 }) : "";
    const label = numbered && own ? `<w:r>${tEl(printed)}<w:tab/></w:r>` : "";
    const showTitle = showsTitle(c);
    const spacing = spacingOf(c.layout);
    // A clause the table lists is bookmarked, so the table can refer to it,
    // and carries the entry itself.
    const entry = listed.get(index);
    const anchor = entry?.anchor;
    // The bookmark goes on the clause's heading, or on its first paragraph
    // where it has none, and once per clause either way.
    let marked = false;
    const once = (inner: string) => {
      if (marked || !entry) return inner;
      marked = true;
      return mark(inner);
    };
    const mark = (inner: string) =>
      anchor
        ? `<w:bookmarkStart w:id="${1000 + index}" w:name="${anchor}"/>${inner}` +
          `<w:bookmarkEnd w:id="${1000 + index}"/>`
        : inner;

    // Exactly one paragraph per clause carries the number, or the list counts twice.
    if (showTitle)
      body.push(
        `<w:p><w:pPr><w:pStyle w:val="Heading${lvl + 1}"/>${numPr}${hanging}</w:pPr>` +
          `${label}${once(run(headingText(c)))}</w:p>`,
      );
    // A document with real structure renders its own paragraphs: headings,
    // alignment, lists and quotations, each with its runs' formatting.
    if (c.paras) {
      // The number goes on the first paragraph of the clause and nowhere else,
      // exactly as it does when the clause is plain text. Without this a
      // recital written as a real paragraph — which is every recital a lawyer
      // types — went out with no (A) against it. Under list numbering the same
      // was true of a sub-clause with no heading: once it had been edited its
      // words became paragraphs, and 1.2 went out with no number at all.
      /* The heading has already carried the number when the clause prints its
         own — a clause inserted into a numbered run, a schedule's paragraph —
         so the first paragraph must not print it again. Word's list numbering
         has never had this problem: it puts the number on the heading itself. */
      let labelled = showTitle && own;
      for (const para of c.paras) {
        if (para.grid) {
          body.push(gridTableXml(para.grid));
          continue;
        }
        if (!para.runs.some((r) => r.t)) continue;
        const level = Math.min(Math.max(para.level ?? 0, 0), 2);
        const first = numbered && own && !labelled;
        const listed = numbered && !own && !showTitle && !labelled && !para.list;
        const bits: string[] = [];
        if (para.heading) bits.push(`<w:pStyle w:val="Heading${para.heading}"/>`);
        if (para.list)
          bits.push(
            `<w:numPr><w:ilvl w:val="${level}"/>` +
              `<w:numId w:val="${para.list === "ordered" ? 2 : 3}"/></w:numPr>`,
          );
        else if (listed) bits.push(numPr);
        bits.push(spacing);
        if (para.list) {
          // The list definition places a list item.
        } else if (para.quote) bits.push(`<w:ind w:left="${INDENT[0]}"/>`);
        else if (first) bits.push(indentOf(c.layout, { left: indent, hanging: 720 }));
        else if (listed) bits.push(indentOf(c.layout, {}));
        else if (numbered)
          bits.push(indentOf({ ...c.layout, hanging: undefined }, { left: indent }));
        else bits.push(indentOf(c.layout, {}));
        // Left is said outright: the document default is justified, and Word
        // stretches every line of a justified address block that ends in a break.
        if (para.align)
          bits.push(`<w:jc w:val="${para.align === "justify" ? "both" : para.align}"/>`);
        /* A structured paragraph carries tracked changes exactly as a flat
           clause does. This branch used to render every run as plain text,
           which silently flattened a redline into a clean document the moment
           the clause had real paragraphs in it — and every clause does, now
           that they are ProseMirror documents. */
        const inner = para.runs
          .filter((r) => r.t)
          .map((r) =>
            r.k === "d"
              ? `<w:del w:id="${revId++}" w:author="${esc(r.a ?? "") || author}" w:date="${esc(r.d ?? "") || date}">` +
                `<w:r>${rPr(r.m)}${delTextEl(r.t)}</w:r></w:del>`
              : r.k === "i"
                ? `<w:ins w:id="${revId++}" w:author="${esc(r.a ?? "") || author}" w:date="${esc(r.d ?? "") || date}">` +
                  `<w:r>${rPr(r.m)}${t(r.t)}</w:r></w:ins>`
                : run(r.t, r.m),
          )
          .join("");
        const pPr = bits.join("");
        const opening = once(inner);
        body.push(
          `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}${first ? label : ""}${opening}</w:p>`,
        );
        if (first || listed) labelled = true;
      }
      return;
    }
    if (!c.segs.some((s) => s.t)) return;

    const runs: string[] = [];
    for (const s of c.segs) {
      if (!s.t) continue;
      if (s.k === "n") {
        runs.push(run(s.t));
      } else if (s.k === "d") {
        runs.push(
          `<w:del w:id="${revId++}" w:author="${esc(s.a ?? "") || author}" w:date="${esc(s.d ?? "") || date}">` +
            `<w:r>${delText(s.t)}</w:r></w:del>`,
        );
      } else {
        runs.push(
          `<w:ins w:id="${revId++}" w:author="${esc(s.a ?? "") || author}" w:date="${esc(s.d ?? "") || date}">` +
            `<w:r>${t(s.t)}</w:r></w:ins>`,
        );
      }
    }
    // A numbered paragraph takes its indent from numbering.xml; a continuation
    // paragraph under a heading has to be indented to line up with it.
    const pPr = !numbered
      ? spacing + indentOf(c.layout, {})
      : showTitle
        ? spacing + indentOf({ ...c.layout, hanging: undefined }, { left: indent })
        : numPr + spacing + (hanging || indentOf(c.layout, {}));
    const lead = showTitle ? "" : label;
    const words = runs.join("");
    body.push(`<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}${lead}` + `${once(words)}</w:p>`);
  });

  if (opts.front?.execution?.length) body.push(executionXml(opts.front.execution));

  return (
    DECL +
    `<w:document ${W_NS} ${R_NS}${paper.rootAttrs}><w:body>${body.join("")}` +
    `<w:sectPr>${paper.sectRefs}${page(opts.kind ?? "contract", opts.letterhead, opts.orientation)}</w:sectPr>` +
    `</w:body></w:document>`
  );
}

const heading = (id: number, size: number, extra: string) =>
  `<w:style w:type="paragraph" w:styleId="Heading${id}">` +
  `<w:name w:val="heading ${id}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>` +
  `<w:uiPriority w:val="9"/><w:qFormat/>` +
  `<w:pPr><w:keepNext/>` +
  `<w:spacing w:before="${HOUSE_SPACING.headingBefore}" w:after="${HOUSE_SPACING.headingAfter}"` +
  ` w:line="${HOUSE_SPACING.line}" w:lineRule="atLeast"/><w:jc w:val="left"/>` +
  `<w:outlineLvl w:val="${id - 1}"/></w:pPr>` +
  `<w:rPr><w:b/>${extra}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></w:style>`;

const hdrFtrStyle = (id: "Header" | "Footer") =>
  `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${id.toLowerCase()}"/>` +
  `<w:basedOn w:val="Normal"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/>` +
  `<w:pPr><w:tabs><w:tab w:val="center" w:pos="${Math.round(TEXT_WIDTH / 2)}"/>` +
  `<w:tab w:val="right" w:pos="${TEXT_WIDTH}"/></w:tabs><w:spacing w:after="0"/></w:pPr>` +
  `<w:rPr><w:color w:val="6B6B6B"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>`;

/**
 * Century Schoolbook is the document face; Word substitutes a serif automatically
 * where it is missing, which is the OOXML equivalent of the CSS fallback stack.
 *
 * The measure is the kind's own (see HOUSE_TYPE): a resolution is set smaller
 * and tighter than a contract, in the firm's near-black, under a smaller title.
 */
const stylesXml = (kind: DocumentKind) => {
  const type = HOUSE_TYPE[kind];
  const colour = type.colour ? `<w:color w:val="${type.colour}"/>` : "";
  const size = (halfPoints: number) =>
    `<w:sz w:val="${halfPoints}"/><w:szCs w:val="${halfPoints}"/>`;
  return (
    DECL +
    `<w:styles ${W_NS}>` +
    `<w:docDefaults><w:rPrDefault><w:rPr>` +
    `<w:rFonts w:ascii="${HOUSE_FONT.family}" w:hAnsi="${HOUSE_FONT.family}" w:eastAsia="${HOUSE_FONT.family}" w:cs="${HOUSE_FONT.family}"/>` +
    `${colour}${size(type.halfPoints)}</w:rPr></w:rPrDefault>` +
    `<w:pPrDefault><w:pPr>` +
    `<w:spacing w:before="${type.before}" w:after="${type.after}"` +
    ` w:line="${type.line}" w:lineRule="${type.lineRule}"/>` +
    `<w:jc w:val="${HOUSE_ALIGN}"/>` +
    `</w:pPr></w:pPrDefault>` +
    `</w:docDefaults>` +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>` +
    `<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/>` +
    `<w:next w:val="Normal"/><w:uiPriority w:val="10"/><w:qFormat/>` +
    `<w:pPr><w:spacing${type.title.before ? ` w:before="${type.title.before}"` : ""} w:after="${type.title.after}"/>` +
    `<w:jc w:val="center"/></w:pPr>` +
    `<w:rPr><w:b/>${type.title.caps ? "<w:caps/>" : ""}${colour}${size(type.title.halfPoints)}</w:rPr></w:style>` +
    `<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/>` +
    `<w:next w:val="Normal"/><w:uiPriority w:val="11"/><w:qFormat/>` +
    `<w:pPr><w:spacing w:after="${type.subtitle.after}"/><w:jc w:val="center"/></w:pPr>` +
    `<w:rPr>${type.subtitle.italic ? "<w:i/>" : ""}<w:color w:val="${type.subtitle.colour}"/>${size(type.subtitle.halfPoints)}</w:rPr></w:style>` +
    // Clause headings are the body size in bold capitals, not a larger type.
    // That is how the firm's contracts read: the heading is a label on the
    // clause, not a title competing with the document's own.
    heading(1, HOUSE_FONT.halfPoints, "<w:caps/>") +
    heading(2, HOUSE_FONT.halfPoints, "") +
    heading(3, HOUSE_FONT.halfPoints, "<w:i/>") +
    // The table of contents: sections bold, sub-sections italic and stepped in,
    // the page number at the right margin, nothing between — as the firm's are.
    `<w:style w:type="paragraph" w:styleId="TOCHeading"><w:name w:val="TOC Heading"/>` +
    `<w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="39"/>` +
    `<w:pPr><w:keepNext/><w:spacing w:before="0" w:after="240" w:line="276" w:lineRule="auto"/>` +
    `<w:jc w:val="left"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>` +
    `<w:style w:type="paragraph" w:styleId="TOC1"><w:name w:val="toc 1"/>` +
    `<w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="39"/>` +
    `<w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/><w:tab w:val="right" w:leader="dot" w:pos="${TEXT_WIDTH}"/></w:tabs>` +
    `<w:spacing w:before="240" w:after="120" w:line="276" w:lineRule="auto"/>` +
    `<w:ind w:left="720" w:hanging="720"/><w:jc w:val="left"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>` +
    `<w:style w:type="paragraph" w:styleId="TOC2"><w:name w:val="toc 2"/>` +
    `<w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="39"/>` +
    `<w:pPr><w:tabs><w:tab w:val="left" w:pos="1440"/><w:tab w:val="right" w:leader="dot" w:pos="${TEXT_WIDTH}"/></w:tabs>` +
    `<w:spacing w:before="0" w:after="120" w:line="276" w:lineRule="auto"/>` +
    `<w:ind w:left="1440" w:hanging="720"/><w:jc w:val="left"/></w:pPr><w:rPr><w:i/></w:rPr></w:style>` +
    hdrFtrStyle("Header") +
    hdrFtrStyle("Footer") +
    `</w:styles>`
  );
};

const alphaLvl = (i: number, left: number) =>
  `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="lowerLetter"/>` +
  `<w:lvlText w:val="(%${i + 1})"/><w:lvlJc w:val="left"/>` +
  `<w:pPr><w:ind w:left="${left}" w:hanging="720"/></w:pPr></w:lvl>`;

const bulletLvl = (i: number, left: number) =>
  `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="bullet"/>` +
  `<w:lvlText w:val="\u2022"/><w:lvlJc w:val="left"/>` +
  `<w:pPr><w:ind w:left="${left}" w:hanging="360"/></w:pPr>` +
  `<w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol" w:hint="default"/></w:rPr></w:lvl>`;

const houseLvl = (l: (typeof HOUSE_NUMBERING)[number]) =>
  `<w:lvl w:ilvl="${l.level}"><w:start w:val="1"/><w:numFmt w:val="${l.format}"/>` +
  `<w:lvlText w:val="${l.text}"/><w:lvlJc w:val="left"/>` +
  `<w:pPr><w:ind w:left="${l.left}" w:hanging="${l.hanging}"/></w:pPr></w:lvl>`;

/**
 * Clause numbering in the firm's own scheme: 1. / 1.1 / (a) / (i).
 *
 * It used to run 1 / 1.1 / 1.1.1. The firm's contracts change character below
 * the second level instead of adding another decimal, and they are right to:
 * "clause 4.2(b)(i)" is a thing a lawyer can say aloud and cross-refer to,
 * where 4.2.1.1 is a number you have to count.
 */
/**
 * Every abstract definition, then every mapping. The order is not cosmetic.
 *
 * OOXML's CT_Numbering is a sequence: abstractNum elements, then num elements.
 * This file used to interleave them — abstract 0, num 1, abstract 1, num 2 —
 * and Word does not report that. It silently repairs the part, keeping one
 * mapping and pointing it at whichever abstract list survived, which was the
 * bullet list. So every numbered clause in an exported contract came out as a
 * bullet, and the file gave no sign anything had gone wrong.
 *
 * A memo's sub-paragraphs are lettered (a), (b), (c) and its bullets are
 * bullets. Those stay separate definitions from the clause list so a memo list
 * can never disturb contract clause numbers.
 */
const ABSTRACT_LISTS = [
  `<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="multilevel"/>` +
    HOUSE_NUMBERING.map(houseLvl).join("") +
    `</w:abstractNum>`,
  `<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="multilevel"/>` +
    alphaLvl(0, INDENT[0]!) +
    alphaLvl(1, INDENT[1]!) +
    alphaLvl(2, INDENT[2]!) +
    `</w:abstractNum>`,
  `<w:abstractNum w:abstractNumId="2"><w:multiLevelType w:val="multilevel"/>` +
    bulletLvl(0, INDENT[0]!) +
    bulletLvl(1, INDENT[1]!) +
    bulletLvl(2, INDENT[2]!) +
    `</w:abstractNum>`,
];

const NUMBERING =
  DECL +
  `<w:numbering ${W_NS}>` +
  ABSTRACT_LISTS.join("") +
  ABSTRACT_LISTS.map(
    (_, i) => `<w:num w:numId="${i + 1}"><w:abstractNumId w:val="${i}"/></w:num>`,
  ).join("") +
  `</w:numbering>`;

/**
 * `w:trackChanges` turns *recording* on for whoever opens the file next. We set it
 * only when the document actually ships revisions — a redline is a live negotiation
 * and the counterparty's edits should stay tracked, whereas forcing revision marks
 * onto the clean execution copy would be wrong.
 */
/**
 * `w:updateFields` is what makes the table of contents behave like one.
 *
 * The document ships with the entries and page numbers the PDF layout worked
 * out, because Word cannot know its own pagination until it opens the file.
 * Marking the TOC field dirty says "this result is stale"; this says "act on
 * that when you open the document". Without it Word shows the cached table
 * for ever and never offers to rebuild it, which is how a real TOC field ends
 * up looking like typed text that happens to have page numbers next to it.
 *
 * It applies to every field in the document, which is what we want: the
 * PAGEREFs inside the table are exactly the numbers that need correcting.
 */
const settingsXml = (trackChanges: boolean) =>
  DECL +
  `<w:settings ${W_NS}><w:zoom w:percent="100"/>` +
  `<w:updateFields w:val="true"/>` +
  (trackChanges ? `<w:trackChanges/>` : "") +
  `<w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/>` +
  `<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>` +
  `</w:settings>`;

/**
 * An empty running header.
 *
 * It used to print the document's title on every page, which for an exported
 * contract meant the matter's name as saved in the app — "Alice Dennis —
 * Employment Contract Review" — running across the top of a document going to
 * a counterparty. The firm's own contracts have no running text here; the
 * header is where the letterhead goes.
 */
const headerXml = (letterhead?: DocxLetterhead) => {
  if (!letterhead)
    return DECL + `<w:hdr ${W_NS}><w:p><w:pPr><w:pStyle w:val="Header"/></w:pPr></w:p></w:hdr>`;
  // The image is anchored inline in the header paragraph and sized in EMU by
  // the caller, which is the only place that knows the file's real pixels.
  // Centring it is the firm's own arrangement on both letterheads.
  return (
    DECL +
    `<w:hdr ${W_NS} ${R_NS} ` +
    `xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ` +
    `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
    `xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<w:p><w:pPr><w:pStyle w:val="Header"/><w:jc w:val="center"/></w:pPr><w:r><w:drawing>` +
    `<wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${Math.round(letterhead.widthEmu)}" cy="${Math.round(letterhead.heightEmu)}"/>` +
    `<wp:docPr id="1" name="Letterhead" descr="Firm letterhead"/>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="Letterhead"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="rIdLetterhead"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/>` +
    `<a:ext cx="${Math.round(letterhead.widthEmu)}" cy="${Math.round(letterhead.heightEmu)}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>` +
    `</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p></w:hdr>`
  );
};

/** The header's own relationships. Only present when there is a letterhead. */
const headerRels = (ext: string) =>
  DECL +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rIdLetterhead" Type="${REL}/image" Target="media/letterhead.${ext}"/>` +
  `</Relationships>`;

const field = (instr: string) =>
  `<w:r><w:fldChar w:fldCharType="begin"/></w:r>` +
  `<w:r><w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r>` +
  `<w:r><w:fldChar w:fldCharType="separate"/></w:r>` +
  `<w:r><w:t>1</w:t></w:r>` +
  `<w:r><w:fldChar w:fldCharType="end"/></w:r>`;

/**
 * "Page X of Y" at the foot of the page, unless the document goes without.
 * The firm's letters and resolutions carry no page number, and on its paper
 * the foot of the page is the letterhead's.
 */
const footerXml = (numbered: boolean) =>
  DECL +
  `<w:ftr ${W_NS}><w:p><w:pPr><w:pStyle w:val="Footer"/><w:jc w:val="center"/></w:pPr>` +
  (numbered ? `${run("Page ")}${field("PAGE")}${run(" of ")}${field("NUMPAGES")}` : "") +
  `</w:p></w:ftr>`;

const OFFICE_DOC = "application/vnd.openxmlformats-officedocument.wordprocessingml";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

const DRAWING_NS =
  `xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ` +
  `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
  `xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"`;

/** A header or footer part with nothing in it, as page one of a paper has. */
const emptyPart = (tag: "hdr" | "ftr") => `${DECL}<w:${tag} ${W_NS}><w:p/></w:${tag}>`;

/**
 * A header whose only content is a picture the size of the page, behind the
 * text: how a paper that arrived as a PDF or an image is put on every page
 * of the kind the header serves.
 */
const paperHeaderXml = (relId: string, name: string, kind: DocumentKind) => {
  const p = HOUSE_PAGE[kind];
  const cx = p.width * 635;
  const cy = p.height * 635;
  return (
    `${DECL}<w:hdr ${W_NS} ${R_NS} ${DRAWING_NS}><w:p><w:pPr><w:pStyle w:val="Header"/></w:pPr>` +
    `<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="0"` +
    ` behindDoc="1" locked="0" layoutInCell="1" allowOverlap="1">` +
    `<wp:simplePos x="0" y="0"/>` +
    `<wp:positionH relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionH>` +
    `<wp:positionV relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionV>` +
    `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>` +
    `<wp:docPr id="10" name="${name}" descr="Firm paper"/>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic><pic:nvPicPr><pic:cNvPr id="10" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>` +
    `</a:graphicData></a:graphic></wp:anchor></w:drawing></w:r></w:p></w:hdr>`
  );
};

const relsXml = (rels: { id: string; type: string; target: string }[]) =>
  DECL +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  rels
    .map((r) => `<Relationship Id="${r.id}" Type="${REL}/${r.type}" Target="${esc(r.target)}"/>`)
    .join("") +
  `</Relationships>`;

type PaperPackage = {
  /** Extra zip entries: parts, their rels, media. */
  entries: ZipEntry[];
  /** Content-type declarations for those parts and media. */
  contentTypes: string;
  /** Relationships from document.xml to the parts. */
  docRels: string;
  /** Header and footer references for the section, and w:titlePg when page one differs. */
  sectRefs: string;
  /** Namespace declarations the spliced content needs on the document root. */
  rootAttrs: string;
  /** The template's page-one body, ready to go first in the document. */
  firstPageBody: string;
};

const NO_PAPER: PaperPackage = {
  entries: [],
  contentTypes: "",
  docRels: "",
  sectRefs:
    `<w:headerReference w:type="default" r:id="rId4"/>` +
    `<w:footerReference w:type="default" r:id="rId5"/>`,
  rootAttrs: "",
  firstPageBody: "",
};

const mediaName = (target: string) => `media/lh-${target.split("/").pop()}`;

/**
 * The firm's paper as parts of the package.
 *
 * A strip is the header picture the export has always carried, so it needs
 * nothing here. A paper is either the firm's Word template — whose page-one
 * body, headers and footers are spliced in as they are — or a PDF or image,
 * whose page pictures go behind the text from headers of their own. Either
 * way page one is its own: it takes the first-page header and an empty
 * first-page footer, so no page number lands on the cover.
 */
function paperPackage(paper: DocxLetterhead | undefined, kind: DocumentKind): PaperPackage {
  if (!paper || paper.mode !== "page") return NO_PAPER;
  const entries: ZipEntry[] = [];
  const overrides: string[] = [];
  const docRels: string[] = [];
  const refs: string[] = [];
  const exts = new Set<string>();
  let nextRel = 100;
  const addPart = (
    tag: "hdr" | "ftr",
    which: "first" | "default",
    xml: string,
    rels: { id: string; type: string; target: string }[],
  ) => {
    const type = tag === "hdr" ? "header" : "footer";
    const n = which === "first" ? 2 : 3;
    const name = `${type}${n}.xml`;
    const relId = `rId${nextRel++}`;
    entries.push({ path: `word/${name}`, data: utf8(xml) });
    if (rels.length) entries.push({ path: `word/_rels/${name}.rels`, data: utf8(relsXml(rels)) });
    overrides.push(`<Override PartName="/word/${name}" ContentType="${OFFICE_DOC}.${type}+xml"/>`);
    docRels.push(`<Relationship Id="${relId}" Type="${REL}/${type}" Target="${name}"/>`);
    refs.push(`<w:${type}Reference w:type="${which}" r:id="${relId}"/>`);
  };
  const addMedia = (target: string, mime: string, bytes: Uint8Array) => {
    const name = mediaName(target);
    if (!entries.some((e) => e.path === `word/${name}`))
      entries.push({ path: `word/${name}`, data: bytes });
    const ext = name.split(".").pop()!.toLowerCase();
    if (!exts.has(ext) && ext !== "png" && ext !== "jpg") {
      exts.add(ext);
      overrides.push(`<Default Extension="${ext}" ContentType="${mime}"/>`);
    }
    return name;
  };

  let rootAttrs = "";
  let firstPageBody = "";
  const t = paper.template;
  if (t) {
    const byTarget = new Map(t.media.map((m) => [m.target, m]));
    for (const m of t.media) addMedia(m.target, m.mime, m.bytes);
    // A template part keeps its own relationship ids; only the targets move.
    const partRels = (media: Record<string, string>) =>
      Object.entries(media).map(([id, target]) => ({
        id,
        type: "image",
        target: mediaName(target),
      }));
    const first = t.first.header;
    const dflt = t.default.header;
    const firstFtr = t.first.footer;
    const dfltFtr = t.default.footer;
    // Page one is its own only where the template makes it so. The firm's
    // letterheads do not: Word puts their logo and footer on page one as on
    // every other page. Marking page one different regardless took the
    // template's unused, empty first-page parts instead, and a one-page letter
    // went out with no letterhead on it at all.
    //
    // A template that gives page one its own header gets it; one that gives
    // page one nothing — titlePg with no first header — gets nothing, which
    // is what Word shows for it too.
    if (t.titlePage)
      addPart(
        "hdr",
        "first",
        first ? first.xml : emptyPart("hdr"),
        first ? partRels(first.media) : [],
      );
    addPart("hdr", "default", dflt ? dflt.xml : emptyPart("hdr"), dflt ? partRels(dflt.media) : []);
    if (t.titlePage)
      addPart(
        "ftr",
        "first",
        firstFtr ? firstFtr.xml : emptyPart("ftr"),
        firstFtr ? partRels(firstFtr.media) : [],
      );
    if (dfltFtr) addPart("ftr", "default", dfltFtr.xml, partRels(dfltFtr.media));
    else refs.push(`<w:footerReference w:type="default" r:id="rId5"/>`);

    // The page-one body: its pictures re-pointed at the media as stored here,
    // and any picture drawn to fill the template's page fitted to this one.
    const ids = relIdsIn(t.firstPageBody);
    let bodyXml = fitPageSizedDrawings(t.firstPageBody, t.page, HOUSE_PAGE[kind]);
    for (const id of ids) {
      const target = t.firstPageMedia[id];
      if (!target || !byTarget.has(target)) continue;
      const relId = `rId${nextRel++}`;
      docRels.push(
        `<Relationship Id="${relId}" Type="${REL}/image" Target="${mediaName(target)}"/>`,
      );
      bodyXml = bodyXml.replace(new RegExp(`="${id}"`, "g"), `="${relId}"`);
    }
    firstPageBody = bodyXml;
    for (const [prefix, uri] of Object.entries(t.namespaces))
      if (prefix !== "w" && prefix !== "r") rootAttrs += ` xmlns:${prefix}="${esc(uri)}"`;
    if (t.ignorable && t.namespaces["mc"]) rootAttrs += ` mc:Ignorable="${esc(t.ignorable)}"`;
  } else {
    // Paper as pictures: page one's behind page one, the continuation behind
    // the rest, each from a header that holds nothing else.
    const ext = paper.mime === "image/jpeg" ? "jpg" : "png";
    const firstName = addMedia(`media/paper-first.${ext}`, paper.mime, paper.bytes);
    addPart("hdr", "first", paperHeaderXml("rIdPaper", "Paper, page one", kind), [
      { id: "rIdPaper", type: "image", target: firstName },
    ]);
    if (paper.continuation) {
      const cExt = paper.continuation.mime === "image/jpeg" ? "jpg" : "png";
      const contName = addMedia(
        `media/paper-continuation.${cExt}`,
        paper.continuation.mime,
        paper.continuation.bytes,
      );
      addPart("hdr", "default", paperHeaderXml("rIdPaper", "Paper, following pages", kind), [
        { id: "rIdPaper", type: "image", target: contName },
      ]);
    } else addPart("hdr", "default", emptyPart("hdr"), []);
    addPart("ftr", "first", emptyPart("ftr"), []);
    refs.push(`<w:footerReference w:type="default" r:id="rId5"/>`);
  }
  if (!t || t.titlePage) refs.push(`<w:titlePg/>`);
  return {
    entries,
    contentTypes: overrides.join(""),
    docRels: docRels.join(""),
    sectRefs: refs.join(""),
    rootAttrs,
    firstPageBody,
  };
}

const contentTypesXml = (extra: string) =>
  DECL +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/word/document.xml" ContentType="${OFFICE_DOC}.document.main+xml"/>` +
  `<Override PartName="/word/styles.xml" ContentType="${OFFICE_DOC}.styles+xml"/>` +
  `<Override PartName="/word/numbering.xml" ContentType="${OFFICE_DOC}.numbering+xml"/>` +
  `<Override PartName="/word/settings.xml" ContentType="${OFFICE_DOC}.settings+xml"/>` +
  `<Override PartName="/word/header1.xml" ContentType="${OFFICE_DOC}.header+xml"/>` +
  // Both image extensions are always declared. A Default for an extension the
  // package does not contain is legal and costs nothing; getting it wrong the
  // other way — an image part with no content type — is what makes Word
  // refuse to open the file.
  `<Default Extension="png" ContentType="image/png"/>` +
  `<Default Extension="jpg" ContentType="image/jpeg"/>` +
  `<Override PartName="/word/footer1.xml" ContentType="${OFFICE_DOC}.footer+xml"/>` +
  extra +
  `</Types>`;

const ROOT_RELS =
  DECL +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/>` +
  `</Relationships>`;

/** rId4/rId5 are referenced by w:sectPr in document.xml — keep them in step. */
const docRelsXml = (extra: string) =>
  DECL +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="${REL}/styles" Target="styles.xml"/>` +
  `<Relationship Id="rId2" Type="${REL}/numbering" Target="numbering.xml"/>` +
  `<Relationship Id="rId3" Type="${REL}/settings" Target="settings.xml"/>` +
  `<Relationship Id="rId4" Type="${REL}/header" Target="header1.xml"/>` +
  `<Relationship Id="rId5" Type="${REL}/footer" Target="footer1.xml"/>` +
  extra +
  `</Relationships>`;

export function buildDocx(opts: DocxOptions): Uint8Array {
  const hasRevisions = opts.clauses.some((c) => c.segs.some((s) => s.k !== "n" && s.t));
  const paper = opts.letterhead;
  const strip = paper && paper.mode !== "page" ? paper : undefined;
  const pack = paperPackage(paper, opts.kind ?? "contract");
  const ext = strip?.mime === "image/jpeg" ? "jpg" : "png";
  const entries: ZipEntry[] = [
    { path: "[Content_Types].xml", data: utf8(contentTypesXml(pack.contentTypes)) },
    { path: "_rels/.rels", data: utf8(ROOT_RELS) },
    { path: "word/document.xml", data: utf8(buildDocumentXml(opts)) },
    { path: "word/_rels/document.xml.rels", data: utf8(docRelsXml(pack.docRels)) },
    { path: "word/styles.xml", data: utf8(stylesXml(opts.kind ?? "contract")) },
    { path: "word/numbering.xml", data: utf8(NUMBERING) },
    { path: "word/settings.xml", data: utf8(settingsXml(hasRevisions)) },
    { path: "word/header1.xml", data: utf8(headerXml(strip)) },
    { path: "word/footer1.xml", data: utf8(footerXml(opts.furniture ?? true)) },
    ...pack.entries,
  ];
  if (strip) {
    entries.push({ path: "word/_rels/header1.xml.rels", data: utf8(headerRels(ext)) });
    entries.push({ path: `word/media/letterhead.${ext}`, data: strip.bytes });
  }
  return createZip(entries);
}

/**
 * Clean copy: revisions already applied (accept-all), no tracked changes.
 *
 * BOTH SHAPES, which this used to get wrong. It cleaned `segs` and left `paras`
 * alone — harmless while paragraphs carried no tracked kinds, and a
 * counterparty-facing disaster the moment they did: a document labelled clean,
 * sent out for signature, with every deletion still in it.
 */
const cleanRun = (s: ExportSeg): ExportSeg => {
  const out: ExportSeg = { t: s.t, k: "n" };
  if (s.m) out.m = s.m;
  return out;
};

export function buildCleanDocx(opts: DocxOptions): Uint8Array {
  const clean: ExportClause[] = opts.clauses.map((c) => ({
    ...c,
    segs: c.segs.filter((s) => s.k !== "d").map(cleanRun),
    ...(c.paras
      ? {
          paras: c.paras.map((para) => ({
            ...para,
            runs: para.runs.filter((r) => r.k !== "d").map(cleanRun),
          })),
        }
      : {}),
  }));
  return buildDocx({ ...opts, clauses: clean });
}
