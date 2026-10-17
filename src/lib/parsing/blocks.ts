/**
 * Document → block list. A block is one paragraph / heading / list item with
 * the page it appeared on. Everything downstream (clause splitting, page refs)
 * works off this shape, so parsers only differ in how they produce blocks.
 */

export type Block = {
  text: string;
  page: number;
  heading: boolean;
  /** 1–6 for real headings, undefined for body text. */
  level?: number;
  /**
   * A table, row by row. `text` then holds the same table as `| a | b |`
   * lines, which is how it travels through clause text: readable to a lawyer
   * and a model, and recognisable again when the clause document is built.
   */
  table?: string[][];
};

/** A table as the text every clause carries: one `| a | b |` line per row. */
export function tableText(rows: string[][]): string {
  return rows
    .map((cells) => `| ${cells.map((c) => c.replace(/\|/g, "¦").trim()).join(" | ")} |`)
    .join("\n");
}

/** True for a line that is a table row as `tableText` writes it. */
export const TABLE_ROW = /^\|.*\|$/;

/** The cells of a `| a | b |` line. */
export function rowCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

export type ParsedDocument = {
  text: string;
  blocks: Block[];
  pageCount: number;
};

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m);
}

const stripTags = (s: string) => decodeEntities(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();

/**
 * mammoth gives us semantic HTML — headings stay headings and numbering is
 * preserved in the text, which is exactly what clause splitting needs.
 */
export function htmlToBlocks(html: string): Block[] {
  const blocks: Block[] = [];
  // A table is taken whole, before its cells' paragraphs can be read one by
  // one: the grid is the meaning of a fee schedule, and cells read as loose
  // lines were being mistaken for clauses ("180 per hour" became clause 180).
  const re = /<table\b[^>]*>([\s\S]*?)<\/table>|<(h[1-6]|p|li)\b[^>]*>([\s\S]*?)<\/\2>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[1] !== undefined) {
      const rows = [...m[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
        .map((row) =>
          [...row[1]!.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) =>
            // A cell of several paragraphs reads as one line.
            stripTags(cell[1]!.replace(/<\/p>\s*<p\b[^>]*>/gi, " / ")),
          ),
        )
        .filter((cells) => cells.some(Boolean));
      if (rows.length) blocks.push({ text: tableText(rows), page: 1, heading: false, table: rows });
      continue;
    }
    const tag = m[2]!.toLowerCase();
    const inner = m[3] ?? "";
    const text = stripTags(inner);
    if (!text) continue;
    if (tag.startsWith("h")) {
      blocks.push({ text, page: 1, heading: true, level: Number(tag[1]) });
    } else {
      // A short paragraph that is entirely bold reads as a heading in most
      // contract templates even when Word never tagged it as one.
      const boldOnly = /^\s*<(strong|b)>[\s\S]*<\/\1>\s*$/i.test(inner.trim()) && text.length <= 120;
      blocks.push(boldOnly ? { text, page: 1, heading: true, level: 3 } : { text, page: 1, heading: false });
    }
  }
  return blocks;
}

/** Plain text / Markdown. Form feeds and `\n\n` separate blocks; `\f` bumps the page. */
export function textToBlocks(raw: string): Block[] {
  const blocks: Block[] = [];
  let page = 1;
  for (const chunk of raw.split(/\f/)) {
    for (const para of chunk.split(/\n\s*\n/)) {
      const lines = para.split(/\n/).map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        const md = /^(#{1,6})\s+(.*)$/.exec(line);
        if (md) {
          blocks.push({ text: md[2]!.trim(), page, heading: true, level: md[1]!.length });
          continue;
        }
        const bold = /^\*\*(.+)\*\*$/.exec(line);
        if (bold) {
          blocks.push({ text: bold[1]!.trim(), page, heading: true, level: 3 });
          continue;
        }
        blocks.push({ text: line, page, heading: false });
      }
    }
    page += 1;
  }
  return blocks;
}

/** PDF: one string per page, so page numbers survive into every block. */
export function pagesToBlocks(pages: string[]): Block[] {
  const blocks: Block[] = [];
  pages.forEach((pageText, i) => {
    const page = i + 1;
    for (const para of pageText.split(/\n\s*\n|\n(?=\s*(?:\d+\.|[A-Z]{4,}))/)) {
      const text = para.replace(/\s+/g, " ").trim();
      if (!text) continue;
      // Short standalone lines that start with a number read as clause headings.
      const heading = text.length <= 120 && /^(?:clause\s+|article\s+|section\s+)?(?:\d+(?:\.\d+)*|[IVXLCDM]+)[.):]?\s+\S/i.test(text);
      blocks.push(heading ? { text, page, heading: true, level: 3 } : { text, page, heading: false });
    }
  });
  return blocks;
}

export function blocksToText(blocks: Block[]): string {
  return blocks.map((b) => b.text).join("\n\n");
}
