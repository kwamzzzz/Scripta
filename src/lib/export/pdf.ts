/**
 * PDF export, written by hand — no PDF library.
 *
 * The reason is the same one that produced `docx.ts` and `zip.ts`: a contract
 * export is a small, fully known document, and the parts of a PDF writer it
 * actually needs (an object table, an xref, one content stream per page) are
 * less code than the surface of a general-purpose library. The hard part a
 * library would hide is text layout, and that is bounded here because the text
 * is set in Helvetica — one of the fourteen faces every PDF reader is required
 * to provide, so nothing has to be embedded and the widths are a fixed table.
 * Helvetica is metric-compatible with the Arial the Word export uses, so the
 * two copies of a contract break their lines in the same places.
 *
 * Two variants mirror the Word exporter. A PDF has no revision model, so the
 * redline is drawn the way a printed redline is: insertions underlined,
 * deletions struck through. That is honest — nobody can mistake it for
 * something they can accept or reject — which is why the *editable* redline
 * stays the .docx and this is the read/print copy.
 */
import type { ExportClause, ExportPara, ExportSeg, SignTable } from "./docx";
import {
  clauseLevel,
  headingText,
  isCounted,
  namedLabel,
  showsTitle,
  tocEntries,
  type TocEntry,
} from "./structure";
import type { FrontMatter, FrontMatterLine } from "./front-matter";
import { imageObject, readImage } from "./pdf-image";
import {
  HOUSE_FONT,
  HOUSE_FRONT,
  HOUSE_NUMBERING,
  HOUSE_PAGE,
  HOUSE_TYPE,
  type DocumentKind,
} from "@/lib/house-style";

export type PdfOptions = {
  title: string;
  subtitle?: string;
  clauses: ExportClause[];
  /**
   * The cover page and preamble. The Word export has carried these since the
   * front matter was built; the PDF did not, so the same contract downloaded
   * as a PDF arrived without its first two pages and said nothing about it.
   */
  front?: FrontMatter;
  /**
   * The firm's paper, in the same shape the Word export takes, so a caller
   * passes one object to whichever builder runs. Word carried a letterhead and
   * the PDF silently did not, which is the same defect as the PDF that had no
   * cover page: the document is wrong and nothing says so.
   */
  letterhead?: PdfLetterhead;
  /**
   * The kind of document, as the Word export takes it: it sets the type, the
   * spacing and the top margin. A resolution is set smaller and tighter than
   * a contract, and a letter starts lower to clear its letterhead.
   */
  kind?: DocumentKind;
  /**
   * "literal" when the numbers are the author's own and are printed as given,
   * as Word prints them; otherwise clause numbers sit where Word's list puts
   * them.
   */
  numbering?: "list" | "literal";
  /** Running head and page numbers; on unless the document goes without. */
  furniture?: boolean;
};

export type PdfLetterhead = {
  /**
   * "strip": an image across the top of page one. "page": the firm's paper —
   * page one's design behind page one, the continuation behind every page
   * after it, each stretched to the page.
   */
  mode?: "strip" | "page";
  bytes: Uint8Array;
  mime: "image/png" | "image/jpeg";
  widthEmu: number;
  heightEmu: number;
  continuation?: { bytes: Uint8Array; mime: "image/png" | "image/jpeg" };
  /** Twips from the page edge that the following pages' artwork reaches. */
  bodyTop?: number;
  bodyBottom?: number;
};

/** 914,400 EMU to the inch, 72 points to the inch. */
const emuToPt = (emu: number) => (emu / 914_400) * 72;

/** The vertical room a letterhead takes on page one: itself, and air beneath. */
const LETTERHEAD_GAP = 18;
export const letterheadDrop = (letterhead?: PdfLetterhead) =>
  letterhead && letterhead.mode !== "page" ? emuToPt(letterhead.heightEmu) + LETTERHEAD_GAP : 0;

/**
 * Where the body may run on the pages after the first, on the firm's paper:
 * clear of the mark its header and footer carry, and never inside the house
 * margin. Points from the top and from the bottom of the page.
 */
export const bodyInsets = (letterhead?: PdfLetterhead, top = MARGIN) => {
  // A third of an inch between the artwork and the words, so the body never
  // sits on the mark the paper carries.
  const clear = 24;
  const pt = (twips: number | undefined) => (twips ?? 0) / 20;
  if (!letterhead || letterhead.mode !== "page") return { top, bottom: MARGIN };
  return {
    top: Math.max(top, pt(letterhead.bodyTop) + clear),
    bottom: Math.max(MARGIN, pt(letterhead.bodyBottom) + clear),
  };
};

/* ------------------------------------------------------------------ metrics */

type FontKey = "F1" | "F2" | "F3";

const BASE_FONT: Record<FontKey, string> = {
  F1: "Helvetica",
  F2: "Helvetica-Bold",
  F3: "Helvetica-Oblique",
};

/** Adobe core-14 advance widths, 1/1000 em, for character codes 32–126. */
const W_HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const W_HELVETICA_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667,
  611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556,
  278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

/** The WinAnsi punctuation a contract actually uses: dashes, curly quotes, section marks. */
const extra = (quote: number, dQuote: number): Record<number, number> => ({
  0x85: 1000, // ellipsis
  0x91: quote,
  0x92: quote,
  0x93: dQuote,
  0x94: dQuote,
  0x95: 350, // bullet
  0x96: 556, // en dash
  0x97: 1000, // em dash
  0xa3: 556, // sterling
  0xa7: 556, // section
  0xa9: 737, // copyright
  0xb0: 400, // degree
  0xb7: 278, // middot
});

const METRICS: Record<FontKey, { base: number[]; more: Record<number, number>; fallback: number }> =
  {
    F1: { base: W_HELVETICA, more: extra(222, 333), fallback: 556 },
    F2: { base: W_HELVETICA_BOLD, more: extra(278, 500), fallback: 611 },
    // Helvetica-Oblique is Helvetica leaned, and shares its widths.
    F3: { base: W_HELVETICA, more: extra(222, 333), fallback: 556 },
  };

const charWidth = (code: number, f: FontKey): number => {
  const m = METRICS[f];
  if (code >= 32 && code <= 126) return m.base[code - 32]!;
  return m.more[code] ?? m.fallback;
};

/**
 * Fold text into WinAnsiEncoding, the single-byte encoding the fonts declare.
 * Latin-1 passes through; the handful of typographic characters that live
 * outside it are remapped; anything else degrades to "?" rather than emitting a
 * byte the reader would draw as the wrong glyph.
 */
const WIN: Record<string, number> = {
  "‘": 0x91,
  "’": 0x92,
  "“": 0x93,
  "”": 0x94,
  "–": 0x96,
  "—": 0x97,
  "…": 0x85,
  "•": 0x95,
  // The firm's blank for a figure still to come, "[●] kg", has no WinAnsi
  // glyph; the bullet is the nearest mark and reads the same.
  "●": 0x95,
  "™": 0x99,
  "€": 0x80,
  "‚": 0x82,
  "„": 0x84,
  "†": 0x86,
  "‡": 0x87,
  "‰": 0x89,
};

export function winAnsi(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c === 9) out += " ";
    else if (c === 10 || c === 13) out += " ";
    else if (c < 0x80) out += ch;
    else if (WIN[ch] !== undefined) out += String.fromCharCode(WIN[ch]!);
    else if (c >= 0xa0 && c <= 0xff) out += ch;
    else out += "?";
  }
  return out;
}

/* -------------------------------------------------------------------- layout */

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN = 72; // 1in, matching the Word export
const TEXT_W = PAGE_W - MARGIN * 2;
/** 12pt, the house size (HOUSE_FONT.halfPoints / 2). */
const BODY = HOUSE_FONT.halfPoints / 2;
/** "At least 15pt", as the Word body is set. */
const LEAD = 15;
/** The front runs at 1.15 lines of Arial 12, which Word draws at about 16pt. */
const FRONT_LEAD = 16;
/** 1.25cm, the hanging indent each party sits in, in points. */
const HANG = HOUSE_FRONT.hanging / 20;
/** Word's paragraph spacing is in twips; the page is in points. */
const twips = (n: number | undefined) => (n ?? 0) / 20;

/**
 * Number column and text column per clause level, as the Word export sets
 * them. A literal number is indented a step further at each level; under
 * Word's list 1. and 1.1 share the margin, their words 36pt in, and (a) hangs
 * from where numbering.xml puts it.
 */
const NUM_X = [0, 18, 36];
const TEXT_X = [36, 54, 72];
const LIST_NUM_X = HOUSE_NUMBERING.slice(0, 3).map((l) => (l.left - l.hanging) / 20);
const LIST_TEXT_X = HOUSE_NUMBERING.slice(0, 3).map((l) => l.left / 20);

/** One colour for every revision mark, the way Word shows a single author. */
const REVISION = "0.72 0.11 0.09";
/** The highlighter's ink. Word's "yellow", which is the plain one. */
const MARKER = "1 1 0";
const INK = "0.09 0.09 0.09";
const GREY = "0.45 0.45 0.45";

type Style = {
  font: FontKey;
  size: number;
  color: string;
  underline?: boolean;
  strike?: boolean;
  /** Under the highlighter: a band of colour painted before the words. */
  highlight?: boolean;
  /** Raised off the baseline, for a superscript ordinal. */
  rise?: number;
};

/** `brk` is a line break the author typed, which ends the line wherever it falls. */
type Atom = { text: string; style: Style; w: number; space: boolean; brk?: boolean };
/** `hard` marks a line ended by a typed break, which justification leaves alone. */
type Line = { atoms: Atom[]; indent: number; hard?: boolean };

const measure = (s: string, st: Style): number => {
  let w = 0;
  for (let i = 0; i < s.length; i++) w += charWidth(s.charCodeAt(i), st.font);
  return (w / 1000) * st.size;
};

/**
 * Words and spaces, with a break wherever the text has a newline. The newline
 * used to be folded into a space like any other, so an addressee's four lines
 * and a signatory's rule, name and title each printed as one run-on line.
 */
const atomize = (runs: { text: string; style: Style }[]): Atom[] => {
  const out: Atom[] = [];
  for (const r of runs) {
    r.text.split(/\r\n|\r|\n/).forEach((piece, i) => {
      if (i > 0) out.push({ text: "", style: r.style, w: 0, space: false, brk: true });
      for (const tok of winAnsi(piece).match(/\s+|\S+/g) ?? [])
        out.push({
          text: tok,
          style: r.style,
          w: measure(tok, r.style),
          space: /\s/.test(tok[0]!),
        });
    });
  }
  return out;
};

/** A token wider than the whole column (a long reference, a URL) is cut by character. */
const hardSplit = (a: Atom, max: number): Atom[] => {
  if (a.w <= max || a.text.length < 2) return [a];
  const parts: Atom[] = [];
  let cur = "";
  let w = 0;
  for (const ch of a.text) {
    const cw = (charWidth(ch.charCodeAt(0), a.style.font) / 1000) * a.style.size;
    if (cur && w + cw > max) {
      parts.push({ text: cur, style: a.style, w, space: false });
      cur = "";
      w = 0;
    }
    cur += ch;
    w += cw;
  }
  if (cur) parts.push({ text: cur, style: a.style, w, space: false });
  return parts;
};

/**
 * Greedy wrap across style boundaries, so a run split by a revision still flows.
 * `right` is the right indent in points; a negative one runs out past the
 * margin, as a resolution's paragraphs do.
 */
export function wrapAtoms(
  atoms: Atom[],
  firstIndent: number,
  restIndent: number,
  right = 0,
): Line[] {
  const lines: Line[] = [];
  let cur: Atom[] = [];
  let indent = firstIndent;
  let x = 0;
  const flush = (hard = false) => {
    while (cur.length && cur[cur.length - 1]!.space) cur.pop();
    // A typed break keeps its line even when it is empty: a blank line between
    // two others is part of the layout.
    if (cur.length || hard) lines.push({ atoms: cur, indent, ...(hard ? { hard } : {}) });
    cur = [];
    x = 0;
    indent = restIndent;
  };
  for (const raw of atoms) {
    if (raw.brk) {
      flush(true);
      continue;
    }
    if (raw.space) {
      if (cur.length) {
        cur.push(raw);
        x += raw.w;
      }
      continue;
    }
    for (const a of hardSplit(raw, TEXT_W - restIndent - right)) {
      if (cur.length && x + a.w > TEXT_W - indent - right) flush();
      cur.push(a);
      x += a.w;
    }
  }
  flush();
  return lines;
}

/* ------------------------------------------------------------ content stream */

const f2 = (n: number) => (Math.round(n * 100) / 100).toString();

/** PDF literal strings escape only the delimiters and the escape itself. */
export const pdfString = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);

/**
 * Word spacing and rise are text state, which outlives ET: a justified line
 * would otherwise spread every line after it, and a superscript raise the
 * rest of the sentence. Each op therefore states both, zero included.
 */
const textOp = (x: number, y: number, st: Style, s: string, wordSpacing = 0) =>
  `BT ${st.color} rg /${st.font} ${f2(st.size)} Tf ${f2(wordSpacing)} Tw ${f2(st.rise ?? 0)} Ts` +
  ` 1 0 0 1 ${f2(x)} ${f2(y)} Tm (${pdfString(s)}) Tj ET`;

const rule = (x: number, y: number, w: number, h: number, color: string) =>
  `${color} rg ${f2(x)} ${f2(y)} ${f2(w)} ${f2(h)} re f`;

/**
 * Draw one laid-out line. Adjacent atoms sharing a style are merged into a
 * single show operation, which is also what makes the underline and strike
 * rules come out as one continuous mark per revision rather than per word.
 */
const spaceCount = (line: Line) =>
  line.atoms.reduce((n, a) => n + (a.text.match(/ /g)?.length ?? 0), 0);

function drawLine(ops: string[], line: Line, y: number, xOffset = 0, wordSpacing = 0) {
  let x = MARGIN + line.indent + xOffset;
  let i = 0;
  while (i < line.atoms.length) {
    const atom = line.atoms[i]!;
    if (atom.text === "") {
      // A tab: an advance with nothing drawn, so the text either side of it
      // is never merged into one show operation across the gap.
      x += atom.w;
      i++;
      continue;
    }
    const st = atom.style;
    let text = "";
    let w = 0;
    while (i < line.atoms.length && line.atoms[i]!.style === st && line.atoms[i]!.text !== "") {
      text += line.atoms[i]!.text;
      w += line.atoms[i]!.w;
      i++;
    }
    // Justification is Word's: the spaces stretch, the letters do not.
    w += (text.match(/ /g)?.length ?? 0) * wordSpacing;
    // The band goes down first, so the words are read on top of it rather
    // than under it. Word sets its highlight from the descender to a little
    // above the cap height, which is what these two numbers are.
    if (st.highlight) ops.push(rule(x, y - st.size * 0.22, w, st.size * 1.05, MARKER));
    ops.push(textOp(x, y, st, text, wordSpacing));
    if (st.underline) ops.push(rule(x, y - 1.7, w, 0.6, st.color));
    if (st.strike) ops.push(rule(x, y + st.size * 0.27, w, 0.6, st.color));
    x += w;
  }
}

const lineWidth = (line: Line) => line.atoms.reduce((n, a) => n + a.w, 0);

/* ----------------------------------------------------------------- document */

/** A hex colour from the house style, as PDF's fill operands. */
const rgb = (hex: string) =>
  [0, 2, 4].map((at) => f2(parseInt(hex.slice(at, at + 2), 16) / 255)).join(" ");

/**
 * The measure a kind of document is set in: size, line and the space beneath a
 * paragraph, in points. A contract keeps the PDF's own measure, which it has
 * always had; a resolution takes the firm's, as its Word copy does — Arial 11
 * on single lines, which Word draws at about 1.15 of the size.
 */
const measureOf = (kind: DocumentKind) => {
  if (kind !== "resolution") return { size: BODY, lead: LEAD, color: INK, after: 7 };
  const type = HOUSE_TYPE.resolution;
  const size = type.halfPoints / 2;
  return { size, lead: size * 1.15, color: rgb(type.colour ?? "000000"), after: twips(type.after) };
};

/**
 * The top margin. A contract keeps the inch it has always had here; a letter
 * and a resolution take their Word page's, so the two copies start in the
 * same place.
 */
const topOf = (kind: DocumentKind) => (kind === "contract" ? MARGIN : HOUSE_PAGE[kind].top / 20);

/** A run's face: its marks, and a revision drawn the way a printed redline draws one. */
const bodyStyle = (
  run: Pick<ExportSeg, "k" | "m">,
  redline: boolean,
  measure: { size: number; color: string } = { size: BODY, color: INK },
): Style => {
  // Helvetica has no bold oblique among the faces used here; bold wins.
  const font: FontKey = run.m?.b ? "F2" : run.m?.i ? "F3" : "F1";
  const revised = redline && run.k !== "n";
  return {
    font,
    size: measure.size,
    color: revised ? REVISION : measure.color,
    ...(run.m?.u || (revised && run.k === "i") ? { underline: true } : {}),
    ...(revised && run.k === "d" ? { strike: true } : {}),
    ...(run.m?.hl ? { highlight: true } : {}),
  };
};

/**
 * Lay the contract out into pages of content operations.
 *
 * `marks`, when given, is filled with the index of the page each clause
 * begins on, which is what the table of contents needs to know.
 */
export function layout(opts: PdfOptions, redline: boolean, marks: number[] = []): string[][] {
  const kind = opts.kind ?? "contract";
  const m = measureOf(kind);
  const top = topOf(kind);
  const pages: string[][] = [];
  let ops: string[] = [];
  // Page one starts below the letterhead, if there is one. The image is painted
  // at assembly time and the body was laid out from the ordinary top, so the
  // two occupied the same space and the paper covered the title, the date and
  // the recitals. Reserving the room here is the only place that can know.
  const inset = bodyInsets(opts.letterhead, top);
  // A contract's page one is the paper's own cover design, so it keeps its
  // margin. A letter or a resolution is written on the paper's ordinary page,
  // whose header and footer are on page one too, and clears them there as it
  // does on every page after.
  const onPaperPage = kind !== "contract" && opts.letterhead?.mode === "page";
  let y = PAGE_H - (onPaperPage ? inset.top : top) - 14 - letterheadDrop(opts.letterhead);

  const newPage = () => {
    pages.push(ops);
    ops = [];
    y = PAGE_H - inset.top - m.size;
  };
  /** Reserve room for the footer; `need` keeps a heading with its first lines. */
  const room = (need: number) => {
    if (y - need < (pages.length || onPaperPage ? inset.bottom : MARGIN)) newPage();
  };

  type Align = "left" | "center" | "right" | "justify";
  const paragraph = (
    lines: Line[],
    leading: number,
    gapAfter: number,
    align: Align = "left",
    right = 0,
  ) => {
    lines.forEach((line, i) => {
      room(0);
      const slack = TEXT_W - right - line.indent - lineWidth(line);
      const spaces = spaceCount(line);
      // The last line of a justified paragraph is left as it falls, as in Word,
      // and so is a line the author ended with a break.
      const stretch =
        align === "justify" && i < lines.length - 1 && !line.hard && spaces > 0 && slack > 0
          ? slack / spaces
          : 0;
      const offset = align === "center" ? slack / 2 : align === "right" ? slack : 0;
      drawLine(ops, line, y, offset, stretch);
      y -= leading;
    });
    y -= gapAfter;
  };

  /**
   * A signing table: its cells side by side, each line of a cell beneath the
   * last, and a row kept whole on one page, as Word keeps it.
   */
  const signTable = (table: SignTable) => {
    const columns = Math.max(1, ...table.rows.map((row) => row.length));
    const x0 = twips(table.indent);
    const width = table.width === undefined ? TEXT_W : twips(table.width);
    const column = width / columns;
    for (const row of table.rows) {
      const tallest = Math.max(1, ...row.map((cell) => cell.length));
      room(twips(table.before) + tallest * m.lead);
      const start = y - twips(table.before);
      let lowest = start;
      row.forEach((cell, index) => {
        let at = start;
        const left = x0 + index * column;
        // 113 twips of cell margin on the right, as the Word table has.
        const right = TEXT_W - (left + column) + 5.65;
        for (const line of cell) {
          const atoms = atomize(
            line.map((r) => ({
              text: r.text,
              style: { font: r.bold ? "F2" : "F1", size: m.size, color: m.color } as Style,
            })),
          );
          for (const wrapped of wrapAtoms(atoms, left, left, right)) {
            drawLine(ops, wrapped, at);
            at -= m.lead;
          }
          if (!atoms.length) at -= m.lead;
        }
        lowest = Math.min(lowest, at);
      });
      y = lowest;
    }
    // The empty paragraph Word needs after a table.
    y -= m.lead;
  };

  const titleStyle: Style = { font: "F2", size: 15, color: INK };

  if (opts.front) {
    /**
     * One line of front matter, set as the firm sets it: Helvetica for the
     * Word export's Arial, 12pt at 1.15 lines, justified, each party hanging
     * 1.25cm in from a tab after its number, the cover title larger and
     * ruled above and below.
     */
    const frontLine = (line: FrontMatterLine) => {
      if (line.rule) {
        // A rule is drawn, not written: a full-measure hairline with air.
        y -= 6;
        room(0);
        ops.push(`0.5 w ${MARGIN} ${y} m ${MARGIN + TEXT_W} ${y} l S`);
        y -= 12;
        return;
      }
      const size = line.size === "cover" ? HOUSE_FRONT.coverHalfPoints / 2 : BODY;
      const leading = line.size === "cover" ? size * 1.35 : FRONT_LEAD;
      y -= twips(line.spaceBefore);
      if (!line.text) {
        y -= leading + twips(line.spaceAfter);
        return;
      }
      const runs = line.runs ?? [{ text: line.text }];
      const atoms: Atom[] = [];
      for (const run of runs) {
        const style: Style = {
          font: line.strong || run.bold ? "F2" : "F1",
          size: run.sup ? size * 0.65 : size,
          color: INK,
          ...(run.sup ? { rise: size * 0.33 } : {}),
        };
        const [head, ...rest] = run.text.split("\t");
        atoms.push(...atomize([{ text: head ?? "", style }]));
        for (const piece of rest) {
          // The tab carries the text out to the hanging indent, whatever the
          // width of the number before it.
          const used = atoms.reduce((n, a) => n + a.w, 0);
          atoms.push({ text: "", style, w: Math.max(HANG - used, 4), space: true });
          atoms.push(...atomize([{ text: piece, style }]));
        }
      }
      const lines = wrapAtoms(atoms, 0, line.hanging ? HANG : 0);
      if (line.framed) {
        room(size * 3);
        ops.push(
          `0.5 w ${MARGIN} ${f2(y + size + 4)} m ${MARGIN + TEXT_W} ${f2(y + size + 4)} l S`,
        );
      }
      paragraph(lines, leading, 0, line.align);
      if (line.framed) {
        const under = y + leading - size * 0.3 - 4;
        ops.push(`0.5 w ${MARGIN} ${f2(under)} m ${MARGIN + TEXT_W} ${f2(under)} l S`);
      }
      y -= twips(line.spaceAfter);
    };

    // Page one is the cover and nothing else, as it is in Word. The title
    // sits where the lawyer placed it down the text area — at the top, or
    // clear of the logo the firm's letterhead carries in the middle — and
    // never below the foot of the page.
    const textTop = PAGE_H - MARGIN - letterheadDrop(opts.letterhead);
    const textHeight = textTop - MARGIN;
    const coverSize = HOUSE_FRONT.coverHalfPoints / 2;
    // The floor keeps the framed title, and the room it asks for, on page one.
    y = Math.max(
      MARGIN + coverSize * 4,
      textTop - coverSize - 6 - textHeight * Math.min(opts.front.coverY ?? 0, 1),
    );
    for (const line of opts.front.cover) frontLine(line);
    newPage();
    for (const line of opts.front.preamble) frontLine(line);
    y -= 8;
  } else if (kind === "resolution") {
    // The firm's resolution: its title in 14pt bold with a clear line above,
    // and the date beneath in the body's own type, neither in grey nor italic.
    const type = HOUSE_TYPE.resolution;
    const size = type.title.halfPoints / 2;
    y -= twips(type.title.before) - 14;
    if (opts.title)
      paragraph(
        wrapAtoms(
          atomize([{ text: opts.title, style: { font: "F2", size, color: m.color } }]),
          0,
          0,
        ),
        size * 1.15,
        twips(type.title.after),
        "center",
      );
    if (opts.subtitle)
      paragraph(
        wrapAtoms(
          atomize([{ text: opts.subtitle, style: { font: "F1", size: m.size, color: m.color } }]),
          0,
          0,
        ),
        m.lead,
        twips(type.subtitle.after),
        "center",
      );
  } else if (opts.title || opts.subtitle) {
    // A letter has no title of its own, and leaves no room for one.
    if (opts.title)
      paragraph(
        wrapAtoms(atomize([{ text: opts.title.toUpperCase(), style: titleStyle }]), 0, 0),
        20,
        opts.subtitle ? 4 : 18,
        "center",
      );
    if (opts.subtitle)
      paragraph(
        wrapAtoms(
          atomize([{ text: opts.subtitle, style: { font: "F3", size: 9.5, color: GREY } }]),
          0,
          0,
        ),
        13,
        20,
        "center",
      );
  }

  const literal = opts.numbering === "literal";

  opts.clauses.forEach((c, index) => {
    if (c.table) {
      marks[index] ??= pages.length;
      signTable(c.table);
      return;
    }
    const lvl = clauseLevel(c.num);
    const numbered = !c.unnumbered && c.num.trim() !== "";
    const numX = (literal ? NUM_X : LIST_NUM_X)[lvl]!;
    const textX = (literal ? TEXT_X : LIST_TEXT_X)[lvl]!;
    // A literal number is printed as given, as Word prints it: "(A)", not
    // "(A).". Under Word's list a first-level number takes its full stop.
    const bare = c.num.trim().replace(/\.$/, "");
    // A schedule, a part and the execution block name themselves in their
    // heading; a schedule's paragraphs carry their own short number.
    const num = !numbered
      ? ""
      : literal
        ? c.num.trim()
        : !isCounted(bare)
          ? namedLabel(bare)
          : lvl === 0
            ? `${bare}.`
            : bare;

    // What the clause says of its own place overrides the numbering's.
    const L = c.layout;
    const left = L?.left !== undefined ? twips(L.left) : numbered ? textX : 0;
    const hangAt = L?.left !== undefined ? twips(L.left - (L.hanging ?? 0)) : numX;
    const right = twips(L?.right);
    const after = L?.after !== undefined ? twips(L.after) : m.after;
    y -= twips(L?.before);

    const segs = c.segs.filter((s) => s.t);
    const showTitle = showsTitle(c);
    // A number is bold where it heads a clause, as the heading's style sets it
    // in Word, and in the body's weight beside the body.
    const numStyle = (bold: boolean): Style => ({
      font: bold ? "F2" : "F1",
      size: m.size,
      color: m.color,
    });

    // The number is printed once per clause: on the heading if there is one,
    // otherwise hanging beside the first line of the body.
    let numberPending = num !== "";

    if (showTitle) {
      // Clause headings are the body size in bold, the first level in capitals,
      // as the Word export's heading styles set them.
      const headStyle: Style = { font: "F2", size: m.size, color: m.color };
      const heading = lvl === 0 ? headingText(c).toUpperCase() : headingText(c);
      const lines = wrapAtoms(atomize([{ text: heading, style: headStyle }]), textX, textX);
      y -= 6;
      // A heading keeps company with what follows it: a section heading with
      // no body of its own must not be left alone at the foot of a page.
      const body = c.paras ? c.paras.length : segs.length;
      room(m.lead * (body ? Math.min(lines.length + 1, 3) : lines.length + 4));
      marks[index] ??= pages.length;
      if (numberPending) {
        ops.push(textOp(MARGIN + numX, y, numStyle(true), winAnsi(num)));
        numberPending = false;
      }
      paragraph(lines, m.lead, 3);
    }

    if (c.paras) {
      // The paragraphs a lawyer gave the clause, as Word sets them: headings,
      // lists, quotations, alignment and the weight of every run.
      const counters: number[] = [];
      // The PDF draws no rules: a table comes out a line per row, cells
      // divided by a bar and a heading row in bold, so no words are lost.
      const flat = c.paras.flatMap((para) =>
        para.grid
          ? para.grid.rows.map((row) => ({
              runs: row.cells.flatMap((cell, i) => [
                ...(i ? [{ t: "  |  ", k: "n" as const }] : []),
                ...cell.map((r) => (row.header ? { ...r, m: { ...r.m, b: true } } : r)),
              ]),
            }))
          : [para],
      );
      for (const para of flat as ExportPara[]) {
        if (!para.runs.some((r) => r.t)) continue;
        const level = Math.min(Math.max(para.level ?? 0, 0), 2);
        let indent = left;
        let label = "";
        let labelX = 0;
        if (para.list) {
          indent = [36, 54, 72][level]!;
          if (para.list === "ordered") {
            counters.length = level + 1;
            counters[level] = (counters[level] ?? 0) + 1;
            label = `(${String.fromCharCode(96 + (((counters[level]! - 1) % 26) + 1))})`;
            labelX = indent - 36;
          } else {
            label = "•";
            labelX = indent - 18;
          }
        } else if (para.quote) indent = 36;
        const heading = para.heading;
        const runs = para.runs
          .filter((r) => r.t)
          .map((r) => ({
            text: heading === 1 ? r.t.toUpperCase() : r.t,
            style: bodyStyle(heading ? { ...r, m: { ...r.m, b: true } } : r, redline, m),
          }));
        const lines = wrapAtoms(atomize(runs), indent, indent, right);
        room(m.lead * Math.min(lines.length, 2));
        marks[index] ??= pages.length;
        if (label) ops.push(textOp(MARGIN + labelX, y, numStyle(false), winAnsi(label)));
        if (numberPending && !para.list) {
          ops.push(textOp(MARGIN + hangAt, y, numStyle(false), winAnsi(num)));
          numberPending = false;
        }
        paragraph(lines, m.lead, after, para.align ?? "justify", right);
      }
      return;
    }

    if (!segs.length) return;

    const lines = wrapAtoms(
      atomize(segs.map((s) => ({ text: s.t, style: bodyStyle(s, redline, m) }))),
      left,
      left,
      right,
    );
    room(m.lead * Math.min(lines.length, 2));
    marks[index] ??= pages.length;
    if (numberPending) ops.push(textOp(MARGIN + hangAt, y, numStyle(false), winAnsi(num)));
    // Body text is justified, as the house style has it.
    paragraph(lines, m.lead, after, "justify", right);
  });

  // The page each party signs on, after the last clause.
  if (opts.front?.execution?.length) {
    newPage();
    const heading: Style = { font: "F2", size: m.size, color: m.color };
    paragraph(wrapAtoms(atomize([{ text: "EXECUTION", style: heading }]), 0, 0), m.lead, 12);
    for (const table of opts.front.execution) signTable(table);
  }

  pages.push(ops);
  return pages;
}

/* ------------------------------------------------------------ table of contents */

/**
 * The table of contents, set as the firm's are: the heading, then each
 * section in bold and each sub-section in italics stepped in beneath it, the
 * page number at the right margin and nothing between.
 *
 * Drawn twice: once without numbers to learn how many pages the table itself
 * takes, since every heading after it moves by that much, and again with the
 * numbers that follow.
 */
export function layoutToc(entries: TocEntry[], numbered: boolean): string[][] {
  const pages: string[][] = [];
  let ops: string[] = [];
  let y = PAGE_H - MARGIN - BODY;
  const newPage = () => {
    pages.push(ops);
    ops = [];
    y = PAGE_H - MARGIN - BODY;
  };
  const room = (need: number) => {
    if (y - need < MARGIN) newPage();
  };

  const head: Style = { font: "F2", size: 14, color: INK };
  ops.push(textOp(MARGIN, y, head, "Table of Contents"));
  y -= 14 * 1.35 + 14;

  for (const e of entries) {
    const top = e.level === 0;
    const style: Style = { font: top ? "F2" : "F3", size: BODY, color: INK };
    // Sections number at the margin with the title a step in; sub-sections
    // number under that title and step in once more, as the firm's tables do.
    const numX = top ? 0 : TEXT_X[0]!;
    const textX = top ? TEXT_X[0]! : TEXT_X[0]! * 2;
    const page = numbered && e.page ? String(e.page) : "";
    const pageW = measure(page, style);
    // The title wraps short of the page number; a wrapped line then sits at
    // the title's own indent, not the narrower measure it was wrapped to.
    const lines = wrapAtoms(
      atomize([{ text: e.title, style }]),
      textX + pageW + 18,
      textX + pageW + 18,
    );
    if (top) y -= 10;
    room(LEAD * lines.length);
    if (e.label) ops.push(textOp(MARGIN + numX, y, style, winAnsi(e.label)));
    lines.forEach((line, i) => {
      drawLine(ops, { ...line, indent: textX }, y);
      if (i === 0 && page) ops.push(textOp(MARGIN + TEXT_W - pageW, y, style, page));
      y -= LEAD;
    });
    y -= 5;
  }
  pages.push(ops);
  return pages;
}

/**
 * Revisions applied: deletions gone, insertions kept as ordinary text. Both
 * shapes, now that the PDF sets a clause's paragraphs rather than only its
 * flat text — a clean copy that still carried a paragraph's deletions would be
 * a clean copy in name only.
 */
const cleanClauses = (clauses: ExportClause[]): ExportClause[] =>
  clauses.map((c) => ({
    ...c,
    // Formatting is not a revision, so the clean copy keeps it. This dropped
    // `m` on the flat shape while keeping it on the paragraphs, so the same
    // clause came out bold in Word and plain in the PDF.
    segs: c.segs
      .filter((s) => s.k !== "d")
      .map((s) => ({ t: s.t, k: "n" as const, ...(s.m ? { m: s.m } : {}) })),
    ...(c.paras
      ? {
          paras: c.paras.map((para) => ({
            ...para,
            runs: para.runs
              .filter((r) => r.k !== "d")
              .map((r) => ({ t: r.t, k: "n" as const, ...(r.m ? { m: r.m } : {}) })),
          })),
        }
      : {}),
  }));

/**
 * The table of contents with the page each heading falls on in this layout:
 * the cover is page one, the table follows it, and the body begins after.
 * Only a contract — a document with a front — carries a table.
 */
export function tableOfContents(opts: PdfOptions, redline: boolean): TocEntry[] {
  if (!opts.front) return [];
  const clauses = redline ? opts.clauses : cleanClauses(opts.clauses);
  const marks: number[] = [];
  layout({ ...opts, clauses }, redline, marks);
  const entries = tocEntries(clauses);
  if (!entries.length) return [];
  const tocPages = layoutToc(entries, false).length;
  return entries.map((e) => ({ ...e, page: (marks[e.index] ?? 0) + tocPages + 1 }));
}

/** The pages of a contract: cover, table of contents, then the body. */
function paginate(opts: PdfOptions, redline: boolean): string[][] {
  const marks: number[] = [];
  const pages = layout(opts, redline, marks);
  if (!opts.front) return pages;
  const entries = tocEntries(opts.clauses);
  if (!entries.length) return pages;
  const tocPages = layoutToc(entries, false).length;
  const toc = layoutToc(
    entries.map((e) => ({ ...e, page: (marks[e.index] ?? 0) + tocPages + 1 })),
    true,
  );
  pages.splice(1, 0, ...toc);
  return pages;
}

/**
 * Running head and "Page n of m", added once the page count is known. A
 * cover page carries neither: it is the front of the document, not a page
 * of it, and the paper's design is all it shows.
 */
function furniture(
  pages: string[][],
  title: string,
  branded = false,
  cover = false,
  paper = false,
) {
  const small: Style = { font: "F1", size: 8.5, color: GREY };
  pages.forEach((ops, i) => {
    // On a page carrying the firm's paper there is already a header, and a
    // second one in grey type across the top of it is not a running head, it
    // is clutter over a logo.
    if (cover && i === 0) return;
    // The firm's paper has its own header; a running head across it is
    // clutter over the logo. The page number keeps to the foot.
    if (!(branded && i === 0) && !paper) {
      const head = winAnsi(title);
      ops.unshift(textOp(MARGIN, PAGE_H - MARGIN + 22, small, head));
      ops.unshift(rule(MARGIN, PAGE_H - MARGIN + 16, TEXT_W, 0.4, "0.8 0.8 0.8"));
    }
    const label = `Page ${i + 1} of ${pages.length}`;
    const w = measure(label, small);
    ops.push(textOp(MARGIN + (TEXT_W - w) / 2, MARGIN - 30, small, label));
  });
}

/* ------------------------------------------------------------- file assembly */

const latin1 = (s: string) => {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
};

const pad10 = (n: number) => n.toString().padStart(10, "0");

/**
 * Serialise the object table, then the cross-reference table that indexes it by
 * byte offset. The xref is the part a reader will not forgive: every entry is
 * exactly twenty bytes and object 0 is the free-list head.
 */
function serialise(objects: string[], rootRef: number, infoRef: number): Uint8Array {
  const chunks: Uint8Array[] = [];
  let offset = 0;
  const push = (s: string) => {
    const b = latin1(s);
    chunks.push(b);
    offset += b.length;
  };

  push("%PDF-1.4\n%âãÏÓ\n");

  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(offset);
    push(`${i + 1} 0 obj\n${body}\nendobj\n`);
  });

  const xrefAt = offset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) xref += `${pad10(o)} 00000 n \n`;
  push(xref);
  push(
    `trailer\n<< /Size ${objects.length + 1} /Root ${rootRef} 0 R /Info ${infoRef} 0 R >>\n` +
      `startxref\n${xrefAt}\n%%EOF\n`,
  );

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

function assemble(pages: string[][], title: string, letterhead?: PdfLetterhead): Uint8Array {
  const CATALOG = 1;
  const PAGES = 2;
  const FONT0 = 3; // 3,4,5 → F1,F2,F3
  const INFO = 6;
  // The letterhead, when there is one, is object 7 — and on the firm's paper
  // the continuation picture is object 8 — and the pages start after them.
  const image = letterhead ? readImage(letterhead.bytes) : null;
  const paperMode = !!letterhead && letterhead.mode === "page";
  const continuation =
    paperMode && letterhead?.continuation ? readImage(letterhead.continuation.bytes) : null;
  const IMAGE = image ? 7 : 0;
  const CONT = continuation ? 8 : 0;
  const first = 7 + (image ? 1 : 0) + (continuation ? 1 : 0); // page n → first+2n, its stream → first+2n+1

  const kids = pages.map((_, i) => `${first + i * 2} 0 R`).join(" ");
  const objects: string[] = [
    `<< /Type /Catalog /Pages ${PAGES} 0 R >>`,
    `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`,
    ...(["F1", "F2", "F3"] as FontKey[]).map(
      (f) =>
        `<< /Type /Font /Subtype /Type1 /BaseFont /${BASE_FONT[f]} /Encoding /WinAnsiEncoding >>`,
    ),
    `<< /Title (${pdfString(winAnsi(title))}) /Producer (Scripta) /Creator (Scripta) >>`,
  ];

  for (const img of [image, continuation]) {
    if (!img) continue;
    let stream = "";
    for (const b of img.data) stream += String.fromCharCode(b);
    objects.push(imageObject(img, stream));
  }

  const fonts = `/Font << /F1 ${FONT0} 0 R /F2 ${FONT0 + 1} 0 R /F3 ${FONT0 + 2} 0 R >>`;
  const xobject = image
    ? ` /XObject << /Letterhead ${IMAGE} 0 R${continuation ? ` /Continuation ${CONT} 0 R` : ""} >>`
    : "";
  const resources = `/Resources << ${fonts}${xobject} >>`;
  const fullPage = (name: string) => [
    "q",
    `${f2(PAGE_W)} 0 0 ${f2(PAGE_H)} 0 0 cm`,
    `/${name} Do`,
    "Q",
  ];
  pages.forEach((ops, i) => {
    // A strip goes on the first page only, above everything else, centred on
    // the text measure. The firm's paper goes behind every page: its page one
    // behind the first, its continuation behind the rest.
    const paper =
      image && letterhead && paperMode
        ? i === 0
          ? fullPage("Letterhead")
          : continuation
            ? fullPage("Continuation")
            : []
        : image && letterhead && i === 0
          ? [
              "q",
              `${f2(emuToPt(letterhead.widthEmu))} 0 0 ${f2(emuToPt(letterhead.heightEmu))} ` +
                `${f2(MARGIN + (TEXT_W - emuToPt(letterhead.widthEmu)) / 2)} ` +
                `${f2(PAGE_H - MARGIN - emuToPt(letterhead.heightEmu))} cm`,
              "/Letterhead Do",
              "Q",
            ]
          : [];
    const stream = [...paper, ...ops].join("\n");
    objects.push(
      `<< /Type /Page /Parent ${PAGES} 0 R /MediaBox [0 0 ${f2(PAGE_W)} ${f2(PAGE_H)}] ` +
        `${resources} /Contents ${first + i * 2 + 1} 0 R >>`,
    );
    objects.push(`<< /Length ${latin1(stream).length} >>\nstream\n${stream}\nendstream`);
  });

  return serialise(objects, CATALOG, INFO);
}

/** Redline copy: insertions underlined, deletions struck through. */
export function buildPdf(opts: PdfOptions): Uint8Array {
  const pages = paginate(opts, true);
  if (opts.furniture !== false)
    furniture(pages, opts.title, !!opts.letterhead, !!opts.front, opts.letterhead?.mode === "page");
  return assemble(pages, opts.title, opts.letterhead);
}

/** Clean copy: deletions dropped, insertions kept as ordinary text. */
export function buildCleanPdf(opts: PdfOptions): Uint8Array {
  const pages = paginate({ ...opts, clauses: cleanClauses(opts.clauses) }, false);
  if (opts.furniture !== false)
    furniture(pages, opts.title, !!opts.letterhead, !!opts.front, opts.letterhead?.mode === "page");
  return assemble(pages, opts.title, opts.letterhead);
}
