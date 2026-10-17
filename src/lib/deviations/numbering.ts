/**
 * Turning Word's automatic numbering back into the clause numbers a lawyer cites.
 *
 * ---------------------------------------------------------------------------
 * WHY subclauses.ts CANNOT DO THIS ALONE
 * ---------------------------------------------------------------------------
 *
 * `lib/subclauses.ts` splits a clause by reading the numbers the drafter typed,
 * and says so: "the structure is already written down in the text". In a great
 * many contracts that is true and this module is not needed.
 *
 * It is not true of a document numbered by Word. There the paragraph says only
 * "Definitions and Interpretation"; the "1." is generated at render time from
 * `numbering.xml` via the paragraph's style. Hand such a document straight to
 * `splitClause` and every deviation comes out with a blank clause reference —
 * the single most important column in a schedule of deviations. So numbering is
 * resolved here first, and the atomiser is given text that has its numbers back.
 *
 * ---------------------------------------------------------------------------
 * TWO NUMBERINGS, BECAUSE A REDLINE HAS TWO DOCUMENTS IN IT
 * ---------------------------------------------------------------------------
 *
 * Insert a new Article 5 and the old Article 5 becomes 6. A schedule that cites
 * only one of those numbers misleads whoever reads it: the other side looks up
 * "Article 6" in the document they sent and finds something else. So every
 * paragraph is numbered twice — once as the document arrived, once as it would
 * read if every change were accepted — and the schedule shows both when they
 * differ.
 */

/** One level of a numbering definition: how it counts and how it prints. */
export type Level = { format: string; text: string; start: number };

/** Everything needed to number a document, read out of its two support parts. */
export type NumberingTables = {
  /** styleId → the numbering that style carries. */
  styleNumbering: Map<string, { numId: string; ilvl: number }>;
  /** numId → ilvl → level definition. */
  levels: Map<string, Map<number, Level>>;
};

const ROMAN: [number, string][] = [
  [1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"],
  [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"],
];

export function toRoman(value: number, upper = false): string {
  let left = value;
  let out = "";
  for (const [size, sign] of ROMAN) while (left >= size) { out += sign; left -= size; }
  return upper ? out.toUpperCase() : out;
}

export function toLetter(value: number, upper = false): string {
  let left = value;
  let out = "";
  while (left > 0) {
    const rest = (left - 1) % 26;
    out = String.fromCharCode(97 + rest) + out;
    left = Math.floor((left - 1) / 26);
  }
  return upper ? out.toUpperCase() : out;
}

export function formatCounter(value: number, format: string): string {
  switch (format) {
    case "decimal": return String(value);
    case "lowerLetter": return toLetter(value);
    case "upperLetter": return toLetter(value, true);
    case "lowerRoman": return toRoman(value);
    case "upperRoman": return toRoman(value, true);
    default: return "";
  }
}

const between = (xml: string, open: RegExp, close: string): string[] => {
  const out: string[] = [];
  let match: RegExpExecArray | null;
  const finder = new RegExp(open.source, "g");
  while ((match = finder.exec(xml))) {
    const from = match.index + match[0].length;
    const to = xml.indexOf(close, from);
    if (to === -1) break;
    out.push(xml.slice(match.index, to + close.length));
    finder.lastIndex = to + close.length;
  }
  return out;
};

const attr = (xml: string, tag: string): string | null =>
  new RegExp(`<${tag}\\s[^>]*w:val="([^"]*)"`).exec(xml)?.[1] ?? null;

/** Read `numbering.xml` and `styles.xml` into the tables the walker needs. */
export function readNumbering(numberingXml: string, stylesXml: string): NumberingTables {
  const abstractOf = new Map<string, string>();
  for (const num of between(numberingXml, /<w:num\s[^>]*>/, "</w:num>")) {
    const numId = /<w:num\s[^>]*w:numId="([^"]*)"/.exec(num)?.[1];
    const abstractId = attr(num, "w:abstractNumId");
    if (numId && abstractId) abstractOf.set(numId, abstractId);
  }

  const abstractLevels = new Map<string, Map<number, Level>>();
  for (const block of between(numberingXml, /<w:abstractNum\s[^>]*>/, "</w:abstractNum>")) {
    const id = /<w:abstractNum\s[^>]*w:abstractNumId="([^"]*)"/.exec(block)?.[1];
    if (!id) continue;
    const levels = new Map<number, Level>();
    for (const lvl of between(block, /<w:lvl\s[^>]*>/, "</w:lvl>")) {
      const ilvl = /<w:lvl\s[^>]*w:ilvl="([^"]*)"/.exec(lvl)?.[1];
      if (ilvl === undefined) continue;
      levels.set(Number(ilvl), {
        format: attr(lvl, "w:numFmt") ?? "decimal",
        text: attr(lvl, "w:lvlText") ?? "",
        start: Number(attr(lvl, "w:start") ?? "1"),
      });
    }
    abstractLevels.set(id, levels);
  }

  const levels = new Map<string, Map<number, Level>>();
  for (const [numId, abstractId] of abstractOf) {
    const found = abstractLevels.get(abstractId);
    if (found) levels.set(numId, found);
  }

  const styleNumbering = new Map<string, { numId: string; ilvl: number }>();
  for (const style of between(stylesXml, /<w:style\s[^>]*>/, "</w:style>")) {
    const id = /<w:style\s[^>]*w:styleId="([^"]*)"/.exec(style)?.[1];
    if (!id) continue;
    const numPr = /<w:numPr>([\s\S]*?)<\/w:numPr>/.exec(style)?.[1];
    if (!numPr) continue;
    const numId = attr(numPr, "w:numId");
    if (!numId) continue;
    styleNumbering.set(id, { numId, ilvl: Number(attr(numPr, "w:ilvl") ?? "0") });
  }

  return { styleNumbering, levels };
}

/** The numbering a paragraph is subject to: its own, else its style's. */
export function numberingFor(
  paragraph: { style: string | null; numId: string | null; ilvl: number | null },
  tables: NumberingTables,
): { numId: string; ilvl: number } | null {
  if (paragraph.numId) return { numId: paragraph.numId, ilvl: paragraph.ilvl ?? 0 };
  if (paragraph.style) {
    const fromStyle = tables.styleNumbering.get(paragraph.style);
    if (fromStyle) return { ...fromStyle, ilvl: paragraph.ilvl ?? fromStyle.ilvl };
  }
  return null;
}

/**
 * Walk a document and label every numbered paragraph.
 *
 * `skip` decides which paragraphs the counter should pretend are not there —
 * the inserted ones when numbering the document as it arrived, the deleted ones
 * when numbering it as it would read if accepted. A skipped paragraph is
 * labelled `null` rather than dropped, so callers keep their indexing.
 *
 * ---------------------------------------------------------------------------
 * THE ORPHANED SUB-LEVEL RULE
 * ---------------------------------------------------------------------------
 *
 * A drafter will sometimes type a top-level heading by hand — bold, centred,
 * not in the numbering scheme — and let Word number only what sits beneath it.
 * The counter then runs one behind for the whole document: every "Clause 5" is
 * reported as "Clause 4".
 *
 * The tell is structural and needs no guessing: a sub-level item appears before
 * any item of its parent level. When that happens the parent is assumed to have
 * occurred unnumbered and its counter is seeded, which puts every later heading
 * back where the drafter's own cross-references say it belongs.
 */
export function labelParagraphs<T extends { style: string | null; numId: string | null; ilvl: number | null }>(
  paragraphs: T[],
  tables: NumberingTables,
  skip: (paragraph: T) => boolean = () => false,
): (string | null)[] {
  const counters = new Map<string, Map<number, number>>();
  const seeded = new Set<string>();

  return paragraphs.map((paragraph) => {
    const numbering = numberingFor(paragraph, tables);
    if (!numbering || skip(paragraph)) return null;
    const levels = tables.levels.get(numbering.numId);
    const level = levels?.get(numbering.ilvl);
    if (!levels || !level) return null;

    let counter = counters.get(numbering.numId);
    if (!counter) { counter = new Map(); counters.set(numbering.numId, counter); }

    if (!seeded.has(numbering.numId)) {
      seeded.add(numbering.numId);
      // An orphaned sub-level: stand the missing parents up before counting.
      for (let above = 0; above < numbering.ilvl; above++)
        counter.set(above, levels.get(above)?.start ?? 1);
    }

    counter.set(numbering.ilvl, (counter.get(numbering.ilvl) ?? level.start - 1) + 1);
    for (const deeper of [...counter.keys()]) if (deeper > numbering.ilvl) counter.delete(deeper);

    let out = level.text;
    for (let at = 0; at < 9; at++) {
      const token = `%${at + 1}`;
      if (!out.includes(token)) continue;
      const value = counter.get(at) ?? levels.get(at)?.start ?? 1;
      out = out.split(token).join(formatCounter(value, levels.get(at)?.format ?? "decimal"));
    }
    return out;
  });
}
