/**
 * A PDF manuscript read by its layout.
 *
 * A PDF carries no headings, paragraphs or notes, only glyphs at positions.
 * Structure is inferred in two stages:
 *
 *   (a) extraction (`extractPdfLines`): PDF.js gives text items with a size
 *       and a position; they are grouped into lines, with superscript note
 *       markers lifted out. This needs PDF.js and runs in the browser.
 *   (b) layout (`layoutToManuscript`): pure, and unit tested. Running heads
 *       and page numbers are dropped, the body size is the most common size,
 *       footnotes are small lines at the foot of the page, lines join into
 *       paragraphs by spacing and indent, larger or bold short paragraphs are
 *       headings ranked by size, and the shared `assemble` does the rest.
 */
import type { ParsedManuscript } from "../model";
import {
  assemble,
  captionParts,
  leadingNumber,
  looksLikeCaption,
  type Block,
  type NoteDraft,
} from "./structure";

export type PdfLine = {
  /** 1-based page. */
  page: number;
  text: string;
  /** Left edge and right edge of the line, in points. */
  x: number;
  right: number;
  /** Baseline, in points from the top of the page. */
  top: number;
  /** Font size in points (the size most of the line is set in). */
  size: number;
  bold: boolean;
  pageWidth: number;
  pageHeight: number;
  /** Superscript note markers lifted out of the line's text. */
  sups: string[];
  /** A superscript marker that opens the line (a footnote's own number). */
  leadSup?: string | undefined;
};

/* ------------------------------------------------------------- extraction -- */

export type PdfTextItem = {
  str: string;
  x: number;
  /** Baseline from the top of the page. */
  y: number;
  width: number;
  size: number;
  bold: boolean;
};

const MARKER = /^(?:\d{1,3}|[*†‡§])$/;

/** Items of one page into lines, superscript markers lifted out. Pure. */
export function itemsToLines(
  items: PdfTextItem[],
  page: number,
  pageWidth: number,
  pageHeight: number,
): PdfLine[] {
  const sorted = items.filter((i) => i.str.length > 0).sort((a, b) => a.y - b.y || a.x - b.x);
  const clusters: PdfTextItem[][] = [];
  let current: PdfTextItem[] = [];
  let firstY = 0;
  let maxSize = 0;
  for (const item of sorted) {
    const size = Math.max(maxSize, item.size);
    if (current.length && item.y - firstY <= 0.5 * size) {
      current.push(item);
      maxSize = size;
      continue;
    }
    if (current.length) clusters.push(current);
    current = [item];
    firstY = item.y;
    maxSize = item.size;
  }
  if (current.length) clusters.push(current);

  const lines: PdfLine[] = [];
  for (const cluster of clusters) {
    // The line's size is the size most of its characters are set in.
    const weight = new Map<number, number>();
    for (const it of cluster) {
      const k = Math.round(it.size * 2) / 2;
      weight.set(k, (weight.get(k) ?? 0) + it.str.trim().length);
    }
    const size = [...weight.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]![0];
    const main = cluster.filter((it) => Math.abs(it.size - size) < 0.75);
    const baseline = main.length ? Math.max(...main.map((it) => it.y)) : cluster[0]!.y;
    const ordered = [...cluster].sort((a, b) => a.x - b.x);
    const sups: string[] = [];
    let leadSup: string | undefined;
    const parts: string[] = [];
    let prevRight: number | null = null;
    let boldChars = 0;
    let allChars = 0;
    for (const it of ordered) {
      const raised = it.size <= size * 0.85 && baseline - it.y > size * 0.15;
      if (raised && MARKER.test(it.str.trim())) {
        if (!parts.join("").trim()) leadSup = it.str.trim();
        else sups.push(it.str.trim());
        prevRight = it.x + it.width;
        continue;
      }
      if (prevRight !== null && it.x - prevRight > size * 0.15) {
        const last = parts[parts.length - 1] ?? "";
        if (!/\s$/.test(last) && !/^\s/.test(it.str)) parts.push(" ");
      }
      parts.push(it.str);
      prevRight = it.x + it.width;
      const n = it.str.trim().length;
      allChars += n;
      if (it.bold) boldChars += n;
    }
    const text = parts.join("").replace(/\s+/g, " ").trim();
    if (!text && !leadSup) continue;
    lines.push({
      page,
      text,
      x: ordered[0]!.x,
      right: Math.max(...ordered.map((it) => it.x + it.width)),
      top: baseline,
      size,
      bold: allChars > 0 && boldChars / allChars > 0.6,
      pageWidth,
      pageHeight,
      sups,
      ...(leadSup !== undefined ? { leadSup } : {}),
    });
  }
  return lines;
}

/** Every page's lines, read with PDF.js. Browser only (it loads the PDF.js worker). */
export async function extractPdfLines(
  data: ArrayBuffer,
): Promise<{ pages: PdfLine[][]; title: string }> {
  const pdfjs = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  // PDF.js takes ownership of the buffer it is given, so it gets a copy.
  const task = pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) });
  const doc = await task.promise;
  try {
    let title = "";
    try {
      const meta = await doc.getMetadata();
      const info = meta.info as { Title?: unknown } | undefined;
      if (typeof info?.Title === "string") title = info.Title.trim();
    } catch {
      // No metadata is not a problem.
    }
    const pages: PdfLine[][] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items: PdfTextItem[] = [];
      for (const raw of content.items) {
        if (!("str" in raw)) continue;
        const [, , c, d, e, f] = raw.transform as number[];
        const size = Math.hypot(c ?? 0, d ?? 0) || raw.height;
        const [x, y] = viewport.convertToViewportPoint(e ?? 0, f ?? 0) as [number, number];
        let bold = false;
        try {
          // Real font names are only known once PDF.js has loaded the font.
          if (page.commonObjs.has(raw.fontName)) {
            const font = page.commonObjs.get(raw.fontName) as { name?: string } | undefined;
            bold = /bold|black|heavy|semibold|demi/i.test(font?.name ?? "");
          }
        } catch {
          bold = false;
        }
        items.push({ str: raw.str, x, y, width: raw.width, size, bold });
      }
      pages.push(itemsToLines(items, n, viewport.width, viewport.height));
      page.cleanup();
    }
    return { pages, title };
  } finally {
    void task.destroy();
  }
}

export async function parsePdf(data: ArrayBuffer, fileName: string): Promise<ParsedManuscript> {
  const { pages, title } = await extractPdfLines(data);
  return layoutToManuscript(pages, fileName, title);
}

/* ----------------------------------------------------------------- layout -- */

const round = (n: number) => Math.round(n * 2) / 2;
const wordCount = (t: string) => t.split(/\s+/).filter(Boolean).length;
const PAGE_NUMBER =
  /^(?:page\s+)?[-–—]?\s*(?:\d{1,4}|[ivxlcdm]{1,7})\s*[-–—]?(?:\s*(?:of|\/)\s*\d{1,4})?$/i;
const NOTE_START = /^(\d{1,3})[.)]?\s+(\S.*)$/;
const CONTENTS = /^(?:(?:table of )?contents|list of (?:figures|tables|illustrations))$/i;
const SENTENCE_END = /[.?!:;]["”’)\]]?$/;

/** A generic title that PDF writers put in the metadata. */
const JUNK_TITLE = /^(?:untitled|microsoft word\b.*|.*\.(?:docx?|pdf|tex|indd))$/i;

function mode(values: number[]): number | null {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: number | null = null;
  let bestCount = 0;
  for (const [v, c] of counts)
    if (c > bestCount || (c === bestCount && best !== null && v < best)) {
      best = v;
      bestCount = c;
    }
  return best;
}

/** "inter-" + "national" → "international"; otherwise a space. */
function joinText(parts: string[], next: string) {
  const last = parts[parts.length - 1];
  if (last !== undefined && /[A-Za-z]-$/.test(last) && /^[a-z]/.test(next))
    parts[parts.length - 1] = last.slice(0, -1) + next;
  else if (last !== undefined && last.endsWith("­"))
    parts[parts.length - 1] = last.slice(0, -1) + next;
  else parts.push(next);
}

type Para = {
  lines: PdfLine[];
  parts: string[];
  head: boolean;
  size: number;
  page: number;
  pages: Set<number>;
  sups: { page: number; marker: string }[];
  toc: boolean;
  /** A contents entry that has reached its page number. */
  done: boolean;
};

type Note = { page: number; marker: string; parts: string[] };

export function layoutToManuscript(
  pages: PdfLine[][],
  fileName: string,
  metaTitle = "",
): ParsedManuscript {
  const warnings: string[] = [
    "The structure of this PDF was inferred from its layout (type size, spacing and position on the page), so headings, paragraphs and notes should be checked against the file.",
  ];
  const stem = fileName.replace(/\.[^.]+$/, "");
  const all = pages.flat();
  if (!all.some((l) => l.text.trim())) {
    warnings.push(
      "This PDF has no readable text. It may be a scan; run it through OCR, or upload the Word file instead.",
    );
    return {
      title: metaTitle && !JUNK_TITLE.test(metaTitle) ? metaTitle : stem,
      format: "pdf",
      nodes: [],
      warnings,
    };
  }

  /* 1. Running heads, footers and bare page numbers. */
  const inMargin = (l: PdfLine) => l.top < l.pageHeight * 0.1 || l.top > l.pageHeight * 0.9;
  const marginKey = (l: PdfLine) =>
    `${l.text.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim()}@${Math.round(l.top / 6)}`;
  const seenOn = new Map<string, Set<number>>();
  for (const l of all)
    if (inMargin(l)) {
      const k = marginKey(l);
      const s = seenOn.get(k) ?? new Set<number>();
      s.add(l.page);
      seenOn.set(k, s);
    }
  const repeatThreshold = Math.min(3, Math.max(2, pages.length));
  let dropped = 0;
  const kept = pages.map((lines) =>
    lines.filter((l) => {
      if (!inMargin(l)) return true;
      const repeated = pages.length > 1 && (seenOn.get(marginKey(l))?.size ?? 0) >= repeatThreshold;
      if (repeated || PAGE_NUMBER.test(l.text.trim())) {
        dropped += 1;
        return false;
      }
      return true;
    }),
  );
  if (dropped) warnings.push("Running headers, footers and page numbers were left out.");

  /* 2. Body size: the size most text is set in. */
  const sizeWeight = new Map<number, number>();
  for (const l of kept.flat())
    sizeWeight.set(round(l.size), (sizeWeight.get(round(l.size)) ?? 0) + l.text.length);
  const body = [...sizeWeight.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 12;
  const bodyBold = (() => {
    let bold = 0;
    let n = 0;
    for (const l of kept.flat())
      if (round(l.size) === body) {
        n += l.text.length;
        if (l.bold) bold += l.text.length;
      }
    return n > 0 && bold / n > 0.5;
  })();

  /* 3. Footnotes: small lines at the foot of the page, each opening with its number. */
  const notes: Note[] = [];
  const bodyLines: PdfLine[][] = kept.map((lines) => {
    const sorted = [...lines].sort((a, b) => a.top - b.top || a.x - b.x);
    let start = sorted.length;
    while (
      start > 0 &&
      sorted[start - 1]!.size <= body * 0.9 &&
      sorted[start - 1]!.top > sorted[start - 1]!.pageHeight * 0.45
    )
      start -= 1;
    const zone = sorted.slice(start);
    const opens = (l: PdfLine) => l.leadSup !== undefined || NOTE_START.test(l.text);
    const first = zone.findIndex(opens);
    if (first === -1) return sorted;
    // Lines above the first numbered one continue the previous page's last note.
    const lead = zone.slice(0, first);
    const prevNote = notes[notes.length - 1];
    let keepLead: PdfLine[] = [];
    if (lead.length && prevNote && prevNote.page < (zone[0]?.page ?? 0))
      for (const l of lead) joinText(prevNote.parts, l.text);
    else keepLead = lead;
    for (const l of zone.slice(first)) {
      if (opens(l)) {
        const m = l.leadSup !== undefined ? null : NOTE_START.exec(l.text);
        notes.push({
          page: l.page,
          marker: l.leadSup ?? m![1]!,
          parts: [l.leadSup !== undefined ? l.text : m![2]!],
        });
      } else joinText(notes[notes.length - 1]!.parts, l.text);
    }
    return [...sorted.slice(0, start), ...keepLead];
  });

  /* 4. Line spacing, margins. */
  const gaps: number[] = [];
  for (const lines of bodyLines)
    for (let i = 1; i < lines.length; i++) {
      const a = lines[i - 1]!;
      const b = lines[i]!;
      const d = b.top - a.top;
      if (round(a.size) === body && round(b.size) === body && d > 0 && d < body * 3)
        gaps.push(round(d));
    }
  const lineGap = mode(gaps) ?? body * 1.2;
  const leftOf = new Map<number, number>();
  const rightOf = new Map<number, number>();
  bodyLines.forEach((lines, i) => {
    const bodyish = lines.filter((l) => round(l.size) === body);
    leftOf.set(i + 1, mode(bodyish.map((l) => Math.round(l.x))) ?? 0);
    rightOf.set(i + 1, Math.max(0, ...bodyish.map((l) => l.right)));
  });

  const isHead = (l: PdfLine) =>
    l.size >= body * 1.15 ||
    (l.bold && !bodyBold && wordCount(l.text) <= 15 && !SENTENCE_END.test(l.text));

  /* 5. Lines into paragraphs; contents pages kept line by line. */
  const paras: Para[] = [];
  let cur: Para | null = null;
  const open = (l: PdfLine, toc = false): Para => {
    const p: Para = {
      lines: [l],
      parts: [l.text],
      head: isHead(l),
      size: l.size,
      page: l.page,
      pages: new Set([l.page]),
      sups: l.sups.map((marker) => ({ page: l.page, marker })),
      toc,
      done: !toc,
    };
    paras.push(p);
    return p;
  };
  const tocEntry = (l: PdfLine | undefined) =>
    !!l && !isHead(l) && /(?:\.{2,}|\s)\s*(\d+|[ivxlc]+)$/i.test(l.text) && wordCount(l.text) >= 2;

  const flat = bodyLines.flat().filter((l) => l.text);
  let inContents = false;
  for (let i = 0; i < flat.length; i++) {
    const l = flat[i]!;
    const head = isHead(l);
    if (CONTENTS.test(l.text.trim())) {
      cur = open(l);
      inContents = true;
      continue;
    }
    if (inContents) {
      if (tocEntry(l)) {
        if (cur?.toc && !cur.done) {
          joinText(cur.parts, l.text);
          cur.lines.push(l);
          cur.done = true;
        } else cur = open(l, true);
        cur.done = true;
        continue;
      }
      if (
        !head &&
        !(cur?.toc && !cur.done) &&
        tocEntry(flat[i + 1]) &&
        flat[i + 1]!.page === l.page
      ) {
        // An entry wrapped onto two lines: its page number is on the second.
        cur = open(l, true);
        continue;
      }
      inContents = false;
    }

    const prev = cur?.lines[cur.lines.length - 1];
    let fresh = !cur || !prev || cur.toc;
    if (!fresh && cur && prev) {
      const text = cur.parts[cur.parts.length - 1] ?? "";
      if (head !== cur.head || Math.abs(l.size - cur.size) > 0.6) fresh = true;
      else if (l.page !== prev.page) {
        // A paragraph runs over the page unless it had visibly finished.
        fresh =
          cur.head || SENTENCE_END.test(text) || l.x > (leftOf.get(l.page) ?? 0) + l.size * 0.8;
      } else {
        const gap = l.top - prev.top;
        const spacing = cur.head ? cur.size * 1.6 : lineGap * 1.4;
        if (gap <= 0 || gap > spacing) fresh = true;
        else if (!cur.head && l.x > prev.x + l.size * 0.8)
          fresh = true; // indented first line
        else if (!cur.head && cur.lines.length >= 2 && l.x < prev.x - l.size * 0.8)
          fresh = true; // end of an indented block
        else if (
          !cur.head &&
          SENTENCE_END.test(prev.text) &&
          prev.right < (rightOf.get(prev.page) ?? prev.pageWidth) - prev.pageWidth * 0.12
        )
          fresh = true; // short last line
      }
    }
    if (fresh) cur = open(l);
    else if (cur) {
      joinText(cur.parts, l.text);
      cur.lines.push(l);
      cur.pages.add(l.page);
      for (const marker of l.sups) cur.sups.push({ page: l.page, marker });
    }
  }

  /* 6. Heading sizes ranked into levels. Sizes used only on the title page
   * and larger than any heading after it (title, university) are the title
   * page, not the hierarchy. */
  const headParas = paras.filter(
    (p) => p.head && !p.toc && p.lines.length <= 3 && wordCount(p.parts.join(" ")) <= 20,
  );
  const headSizes = [...new Set(headParas.map((p) => round(p.size)))].sort((a, b) => b - a);
  const later = headParas.filter((p) => p.page > 1).map((p) => round(p.size));
  const maxLater = later.length ? Math.max(...later) : null;
  const titleSizes = new Set(
    headSizes.filter((size) => {
      const withSize = headParas.filter((p) => round(p.size) === size);
      if (!withSize.every((p) => p.page === 1)) return false;
      if (maxLater !== null) return size > maxLater;
      return size === headSizes[0] && headSizes.length > 1 && withSize.length === 1;
    }),
  );
  const ranks = headSizes.filter((s) => !titleSizes.has(s));
  const rankOf = (size: number) => ranks.indexOf(round(size)) + 1;
  const titleSize = [...titleSizes][0];
  const heads = new Set(headParas);

  /* 7. Paragraphs into blocks. */
  const blocks: Block[] = [];
  const blockOf = new Map<Para, Block>();
  let title = "";
  for (const p of paras) {
    const text = p.parts.join(" ").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const base = { number: "", label: "", level: 0, page: p.page, style: String(round(p.size)) };
    let block: Block;
    const minX = Math.min(...p.lines.map((l) => l.x));
    const left = leftOf.get(p.page) ?? 0;
    const numbered = /^(\d+(?:\.\d+)*)\.?\s+[A-Z]/.exec(text);
    if (p.toc) {
      const entry = text.replace(/(?:\s*\.{2,}[\s.]*|\s+)(\d+|[ivxlc]+)$/i, "").trim();
      block = {
        ...base,
        role: "toc_entry",
        level: 1,
        text: entry,
        label: entry,
        number: leadingNumber(entry),
      };
    } else if (heads.has(p)) {
      if (titleSizes.has(round(p.size))) {
        block = { ...base, role: "title", text, label: text };
        if (round(p.size) === titleSize && !title) title = text;
      } else block = { ...base, role: "heading", level: rankOf(p.size), text, label: text };
    } else if (
      numbered &&
      p.lines.length === 1 &&
      wordCount(text) <= 12 &&
      !SENTENCE_END.test(text) &&
      !/,$/.test(text)
    ) {
      // "4.2 Methods" set in body type: a heading by its number.
      block = {
        ...base,
        role: "heading",
        level: numbered[1]!.split(".").length,
        text,
        label: text,
      };
    } else if (looksLikeCaption(text) && wordCount(text) <= 40) {
      const c = captionParts(text)!;
      block = { ...base, role: "caption", text, number: c.number, label: c.label };
    } else if (/^[•●▪◦·–-]\s+|^\(?(?:[a-z]|[ivx]{1,4}|\d{1,2})\)\s+/.test(text)) {
      block = { ...base, role: "list_item", text };
    } else if (
      (p.lines.length >= 2 && minX >= left + body * 1.5) ||
      (round(p.size) < body && round(p.size) >= body * 0.8 && p.lines.length >= 2)
    ) {
      block = { ...base, role: "quote", text };
    } else block = { ...base, role: "paragraph", text };
    blocks.push(block);
    blockOf.set(p, block);
  }

  /* 8. Notes onto the paragraph that carries their marker on that page. */
  let byPosition = 0;
  for (const note of notes) {
    const onPage = paras.filter((p) => p.pages.has(note.page) && blockOf.has(p) && !p.toc);
    let host = [...onPage]
      .reverse()
      .find((p) => p.sups.some((s) => s.page === note.page && s.marker === note.marker));
    if (!host) {
      byPosition += 1;
      host =
        [...onPage].reverse().find((p) => !p.head) ??
        onPage[onPage.length - 1] ??
        [...paras].reverse().find((p) => p.page < note.page && blockOf.has(p));
    }
    const block = host ? blockOf.get(host) : undefined;
    if (!block) continue;
    const draft: NoteDraft = {
      kind: "footnote",
      marker: note.marker,
      text: note.parts.join(" ").replace(/\s+/g, " ").trim(),
    };
    block.notes = [...(block.notes ?? []), draft];
    block.noteRefs = [...new Set([...(block.noteRefs ?? []), note.marker])];
  }
  if (notes.length)
    warnings.push(
      byPosition
        ? `Footnotes in a PDF are matched to their paragraph by position on the page; ${byPosition} had no visible marker and were attached to the last paragraph on their page.`
        : "Footnotes in a PDF are matched to their paragraph by position on the page and by their superscript marker.",
    );

  const assembled = assemble(blocks);
  warnings.push(...assembled.warnings);

  const metaOk = metaTitle && !JUNK_TITLE.test(metaTitle) ? metaTitle : "";
  return {
    title: metaOk || title || stem,
    format: "pdf",
    nodes: assembled.nodes,
    warnings,
  };
}
