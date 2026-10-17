/**
 * From a flat run of blocks to the manuscript's shape.
 *
 * Both readers (Word and PDF) first reduce the file to blocks in reading
 * order: a heading with its source depth, a paragraph, a table, a caption.
 * Deciding which of those headings are parts, chapters and sections, what is
 * front matter, where the bibliography runs and which heading each atom sits
 * under is the same job for both, so it is done once, here.
 */
import type { NodeKind, ParsedNode } from "../model";

export type NoteDraft = { kind: "footnote" | "endnote"; marker: string; text: string };

export type BlockRole =
  | "heading"
  | "title"
  | "paragraph"
  | "quote"
  | "list_item"
  | "table"
  | "figure"
  | "caption"
  | "equation"
  | "toc_entry";

export type Block = {
  role: BlockRole;
  text: string;
  /** heading: depth in the source (1 = top); toc_entry: contents level; otherwise 0. */
  level: number;
  /** A number the source supplies outright (Word list numbering, a caption number). */
  number: string;
  label: string;
  /** A heading that belongs to the front matter whatever it says ("TOC Heading"). */
  front?: boolean;
  style?: string | undefined;
  source?: number | undefined;
  page?: number | undefined;
  rows?: string[][] | undefined;
  noteRefs?: string[] | undefined;
  notes?: NoteDraft[] | undefined;
};

/* ----------------------------------------------------------- recognisers -- */

const NUMBER_WORDS =
  "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty";

const CHAPTER_WORDING = new RegExp(`^chapter\\s+(\\d+|[ivxlc]+|${NUMBER_WORDS})\\b`, "i");
const CHAPTER_ONLY = new RegExp(`^chapter\\s+(\\d+|[ivxlc]+|${NUMBER_WORDS})\\s*[.:]?$`, "i");
const APPENDIX_WORDING = /^(?:appendix|annex|annexure)\s+(\d+|[A-Z]|[IVX]+)\b/i;
/** Parts are recognised by their capitalised word only: "part of the problem" is prose. */
const PART_WORDING = new RegExp(
  `^(?:Part|PART)\\s+(\\d+|[IVXLC]+|${NUMBER_WORDS}|${NUMBER_WORDS.toUpperCase()}|${capitalise(NUMBER_WORDS)})\\b`,
);
export const BIBLIOGRAPHY =
  /^(?:references|bibliography|works cited|reference list|sources|list of references|select bibliography)$/i;
/** Headings that are front matter when they come before the first chapter. */
export const FRONT_MATTER =
  /^(?:abstract|résumé|acknowledge?ments?|dedication|declaration(?: of originality)?|preface|foreword|(?:table of )?contents|list of .+|table of (?:cases|statutes|legislation|authorities|treaties|abbreviations)|abbreviations(?: and acronyms)?|acronyms|glossary|nomenclature|(?:executive )?summary|copyright|approval|certificat(?:e|ion)|epigraph|about the author|keywords?)\b/i;

function capitalise(words: string): string {
  return words
    .split("|")
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join("|");
}

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
const clean = (text: string) => text.replace(/[\s:.]+$/, "").trim();

/**
 * "Chapter 3", "CHAPTER THREE: Method", "Appendix B". Short, so a sentence of
 * prose that happens to open "Chapter 3 shows that…" is not taken for one.
 */
export function chapterWording(text: string): string | null {
  const t = text.trim();
  const n = words(t);
  if (n > 15) return null;
  if (n > 3 && /[.;,]$/.test(t)) return null;
  const m = CHAPTER_WORDING.exec(t) ?? APPENDIX_WORDING.exec(t);
  return m ? m[1]! : null;
}

/** "4.2 Methods" → "4.2"; "1. Introduction" → "1". */
export function leadingNumber(text: string): string {
  return /^(\d+(?:\.\d+)*)\.?\s+\S/.exec(text.trim())?.[1] ?? "";
}

/** The number a heading carries, however it is written. */
export function headingNumber(text: string, supplied: string): string {
  const t = text.trim();
  const wording = CHAPTER_WORDING.exec(t) ?? APPENDIX_WORDING.exec(t) ?? PART_WORDING.exec(t);
  if (wording) return wording[1]!;
  const lead = leadingNumber(t);
  if (lead) return lead;
  // Word numbering such as "Chapter %1" or "%1.%2." prints as "Chapter 4" / "4.2."
  const m = /(\d+(?:\.\d+)*|[IVXLC]+|[A-Z])\.?\)?$/.exec(supplied.trim());
  return m ? m[1]! : "";
}

/** Figure and table captions: "Table 6.2", "Fig. 3", "FIGURE A.1". */
export const CAPTION =
  /^(Figure|FIGURE|Fig\.|FIG\.|Table|TABLE)\s+((?:\d+|[IVXLC]+|[A-Z])(?:[.\-–]\d+)*[a-z]?)(?![\w])/;

export function captionParts(text: string): { number: string; label: string } | null {
  const m = CAPTION.exec(text.trim());
  if (!m) return null;
  const word = /^t/i.test(m[1]!) ? "Table" : "Figure";
  const label = text
    .trim()
    .slice(m[0].length)
    .replace(/^\s*[:.\-–—]?\s*/, "")
    .trim();
  return { number: `${word} ${m[2]}`, label };
}

/** A caption standing on its own (no neighbouring table to prove it): "Table 2: Results". */
export function looksLikeCaption(text: string): boolean {
  const m = CAPTION.exec(text.trim());
  if (!m) return false;
  const rest = text.trim().slice(m[0].length);
  return /^\s*[:.\-–—]/.test(rest) || rest.trim() === "" || words(text) <= 20;
}

/* -------------------------------------------------------------- assembly -- */

type HeadingKind = "part" | "chapter" | "heading" | "front";

export type Assembled = {
  nodes: ParsedNode[];
  warnings: string[];
  chapters: number;
};

/**
 * "CHAPTER 1" on one line and "INTRODUCTION" on the next is one heading
 * typeset as two. Join them before anything counts headings.
 */
function joinChapterTitles(blocks: Block[]): Block[] {
  const out: Block[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    const next = blocks[i + 1];
    const isLabel = (b.role === "heading" || b.role === "paragraph") && CHAPTER_ONLY.test(b.text);
    const titleFollows =
      !!next &&
      !/^\d+\.\d/.test(next.text.trim()) &&
      ((next.role === "heading" && (b.role !== "heading" || next.level <= b.level)) ||
        (next.role === "paragraph" &&
          words(next.text) <= 12 &&
          !/[.;,]$/.test(next.text) &&
          !CAPTION.test(next.text) &&
          !chapterWording(next.text)));
    if (isLabel && titleFollows) {
      const level = b.role === "heading" ? b.level : next!.role === "heading" ? next!.level : 0;
      out.push({
        ...b,
        role: level ? "heading" : b.role,
        level,
        text: `${b.text.trim()} ${next!.text.trim()}`,
        label: `${b.text.trim()} ${next!.text.trim()}`,
        noteRefs: [...(b.noteRefs ?? []), ...(next!.noteRefs ?? [])],
        notes: [...(b.notes ?? []), ...(next!.notes ?? [])],
      });
      i += 1;
      continue;
    }
    out.push(b);
  }
  return out;
}

export function assemble(input: Block[]): Assembled {
  const blocks = joinChapterTitles(input);
  const warnings: string[] = [];

  const isBibliography = (b: Block) =>
    (b.role === "paragraph" || b.role === "heading") && BIBLIOGRAPHY.test(clean(b.text));
  // Chapters announced by their wording, styled or not.
  const byWording = blocks.map(
    (b) =>
      (b.role === "heading" || b.role === "paragraph") &&
      (chapterWording(b.text) !== null || (b.role === "paragraph" && isBibliography(b))),
  );

  const styled = blocks.filter(
    (b) => b.role === "heading" && !b.front && !FRONT_MATTER.test(b.text.trim()),
  );
  const minLevel = styled.length ? Math.min(...styled.map((b) => b.level)) : 1;
  const partsMode = styled.some((b) => b.level === minLevel && PART_WORDING.test(b.text.trim()));
  const wordingLevels = blocks
    .filter((b, i) => b.role === "heading" && byWording[i] && !isBibliography(b))
    .map((b) => b.level);
  // Unstyled "Chapter N" lines above styled headings: the styled ones are
  // sections. Only when a "Chapter N" line comes first; a stray one later in
  // a styled manuscript does not demote its real chapters.
  const firstUnstyled = blocks.findIndex(
    (b, i) => b.role === "paragraph" && byWording[i] && !isBibliography(b),
  );
  const firstStyled = styled.length ? blocks.indexOf(styled[0]!) : -1;
  const unstyledWording =
    firstUnstyled !== -1 && (firstStyled === -1 || firstUnstyled < firstStyled);

  let chapterLevel: number;
  if (partsMode) chapterLevel = minLevel + 1;
  else if (wordingLevels.length) chapterLevel = Math.min(...wordingLevels);
  else if (unstyledWording && styled.length) chapterLevel = minLevel - 1;
  else chapterLevel = minLevel;

  const headingKind = (b: Block, i: number): HeadingKind | null => {
    if (b.role === "title") return "front";
    if (b.front) return "front";
    if (byWording[i]) return "chapter";
    if (b.role !== "heading") return null;
    if (b.level <= chapterLevel)
      return PART_WORDING.test(b.text.trim()) && b.level < chapterLevel + (partsMode ? 0 : 1)
        ? "part"
        : "chapter";
    return "heading";
  };
  const kinds = blocks.map(headingKind);
  const hasParts = kinds.includes("part");
  // Where the chapters are numbered, the unnumbered heading the document opens
  // with is its title, not a chapter. A PDF gives no Title style to say so,
  // and a title set at chapter size would otherwise become chapter one and
  // carry the abstract in with it.
  const numbered = (i: number) =>
    byWording[i] || /^\s*(?:\d+|[IVXLC]+)(?:[.:)]|\s)\s*\S/.test(blocks[i]!.text);
  const chapterIdx = kinds.flatMap((k, i) => (k === "chapter" ? [i] : []));
  const firstNumbered = chapterIdx.find(numbered) ?? -1;
  const openingTitle =
    chapterIdx.filter(numbered).length >= 2 &&
    chapterIdx[0] !== undefined &&
    chapterIdx[0] < firstNumbered &&
    !numbered(chapterIdx[0])
      ? chapterIdx[0]
      : -1;
  const firstMain = kinds.findIndex((k, i) => {
    if (k !== "part" && k !== "chapter") return false;
    if (i === openingTitle) return false;
    // "Abstract" styled Heading 1 before the first real chapter is front matter.
    return !FRONT_MATTER.test(blocks[i]!.text.trim()) || byWording[i];
  });
  const chapterOut = hasParts ? 2 : 1;

  const nodes: ParsedNode[] = [];
  let seq = 0;
  const nextKey = () => `n${++seq}`;

  let partKey: string | null = null;
  let chapterKey: string | null = null;
  let stack: { level: number; key: string }[] = [];
  let bib: { level: number } | null = null;
  let frontLabel = "";
  let chapters = 0;

  const push = (b: Block, node: Omit<ParsedNode, "key">, key = nextKey()) => {
    const full: ParsedNode = { key, ...node };
    if (b.style) full.style = b.style;
    if (b.source !== undefined) full.source = b.source;
    if (b.page !== undefined) full.page = b.page;
    if (b.noteRefs?.length) full.noteRefs = [...b.noteRefs];
    if (b.rows) full.rows = b.rows;
    nodes.push(full);
    for (const note of b.notes ?? [])
      nodes.push({
        key: nextKey(),
        kind: note.kind,
        level: 0,
        number: note.marker,
        label: note.marker,
        text: note.text,
        parentKey: key,
        chapterKey: full.chapterKey,
        ...(b.source !== undefined ? { source: b.source } : {}),
        ...(b.page !== undefined ? { page: b.page } : {}),
      });
    return key;
  };

  blocks.forEach((b, i) => {
    const inFront = firstMain !== -1 && i < firstMain;
    const kind = kinds[i];

    if (inFront && (kind || b.role === "heading")) {
      frontLabel = b.text.trim();
      push(b, {
        kind: "front",
        level: 1,
        number: "",
        label: frontLabel,
        text: b.text,
        parentKey: null,
        chapterKey: null,
      });
      return;
    }

    if (kind === "part") {
      const key = nextKey();
      partKey = key;
      chapterKey = null;
      stack = [];
      bib = null;
      push(
        b,
        {
          kind: "part",
          level: 1,
          number: headingNumber(b.text, b.number),
          label: b.text.trim(),
          text: b.text,
          parentKey: null,
          chapterKey: null,
        },
        key,
      );
      return;
    }

    if (kind === "chapter") {
      const key = nextKey();
      // A top-level chapter in a parted book ("Introduction", "References")
      // stands outside any part.
      if (hasParts && b.role === "heading" && b.level < chapterLevel) partKey = null;
      chapterKey = key;
      chapters += 1;
      stack = [{ level: chapterOut, key }];
      bib = isBibliography(b) ? { level: chapterOut } : null;
      push(
        b,
        {
          kind: "chapter",
          level: chapterOut,
          number: headingNumber(b.text, b.number),
          label: b.text.trim(),
          text: b.text,
          parentKey: partKey,
          chapterKey: key,
        },
        key,
      );
      return;
    }

    if (kind === "heading" || kind === "front") {
      // front-flagged headings after the main matter began ("TOC Heading" of
      // a second contents list) and titles: ordinary headings from here on.
      const level = Math.max(
        chapterOut + 1,
        chapterOut + (b.role === "heading" ? b.level - chapterLevel : 1),
      );
      if (bib && level <= bib.level) bib = null;
      while (stack.length && stack[stack.length - 1]!.level >= level) stack.pop();
      const parentKey = stack.length ? stack[stack.length - 1]!.key : (chapterKey ?? partKey);
      const key = nextKey();
      stack.push({ level, key });
      if (isBibliography(b)) bib = { level };
      push(
        b,
        {
          kind: "heading",
          level,
          number: headingNumber(b.text, b.number),
          label: b.text.trim(),
          text: b.text,
          parentKey,
          chapterKey,
        },
        key,
      );
      return;
    }

    // Everything that is not a heading.
    const parentKey = inFront
      ? null
      : stack.length
        ? stack[stack.length - 1]!.key
        : (chapterKey ?? partKey);
    const prose = b.role === "paragraph" || b.role === "quote" || b.role === "list_item";
    let nodeKind: NodeKind = b.role as NodeKind;
    let label = b.label;
    if (inFront && prose) {
      nodeKind = "front";
      label = frontLabel;
    } else if (bib && prose) nodeKind = "bibliography_entry";
    push(b, {
      kind: nodeKind,
      level: b.role === "toc_entry" ? b.level : 0,
      number: b.number,
      label,
      text: b.text,
      parentKey,
      chapterKey: inFront ? null : chapterKey,
    });
  });

  if (!styled.length && chapters && !wordingLevels.length)
    warnings.push(
      "No heading styles were found, so chapters were found by their 'Chapter N' wording.",
    );
  if (!chapters)
    warnings.push(
      "No chapters could be found: there are no chapter headings and no 'Chapter N' lines, so the manuscript is read as one continuous section.",
    );
  if (hasParts)
    warnings.push(
      "The manuscript is divided into parts, so parts sit at the top level and chapters one level below.",
    );

  return { nodes, warnings, chapters };
}
