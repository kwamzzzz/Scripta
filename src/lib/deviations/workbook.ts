/**
 * Writing the schedule into the client's own workbook.
 *
 * ---------------------------------------------------------------------------
 * THE TEMPLATE IS THE DELIVERABLE, NOT A SUGGESTION
 * ---------------------------------------------------------------------------
 *
 * A schedule of deviations comes to us as an appendix to a tender. It arrives
 * with a cover sheet, a header block, locked column widths, a response
 * dropdown the buyer will use, and instructions saying which cells to fill and
 * how. Rebuilding it from scratch — however faithfully — hands back a
 * different document, and a procurement team is entitled to reject it.
 *
 * So nothing here creates a workbook. It opens the one we were sent, writes
 * the cells the instructions nominate, and leaves every other part of the zip
 * byte-for-byte as it found it.
 *
 * ---------------------------------------------------------------------------
 * INLINE STRINGS, NOT THE SHARED STRING TABLE
 * ---------------------------------------------------------------------------
 *
 * Rich text — red for an addition, struck through for a deletion, as the
 * template's own instructions require — normally lives in `sharedStrings.xml`,
 * shared across every sheet. Rewriting that table means renumbering every
 * existing reference to it, and one slip silently changes a cell on another
 * sheet. `t="inlineStr"` carries the same runs inside the cell, touches
 * nothing else, and Excel renders it identically.
 */
import type { DeviationRow } from "./rows";

/** Where the schedule's columns live, and which row the instructions start on. */
export type SheetLayout = {
  /** Sheet name as the tab shows it. */
  sheet: string;
  /** 1-based row holding the column headings. */
  headerRow: number;
  reference: string;
  bidder: string;
  original: string;
  proposed: string;
  justification: string;
};

export const APPENDIX_E_LAYOUT: SheetLayout = {
  sheet: "Legal Deviations",
  headerRow: 10,
  reference: "B",
  bidder: "C",
  original: "D",
  proposed: "E",
  justification: "F",
};

export const escapeXml = (text: string): string =>
  text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    // Control characters are not representable in XML 1.0 and Word does emit
    // the odd stray one; a single vertical tab otherwise corrupts the file, so
    // matching them here is the point rather than an oversight.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

const columnIndex = (name: string): number => {
  let out = 0;
  for (const letter of name.toUpperCase()) out = out * 26 + (letter.charCodeAt(0) - 64);
  return out;
};

/**
 * A cell holding rich text.
 *
 * `rPr` children follow the order the schema requires — rFont, b, i, strike,
 * color, sz. Out of order, Excel reports the workbook as needing repair.
 */
function richCell(
  ref: string,
  style: string | null,
  runs: { text: string; red?: boolean; strike?: boolean }[],
): string {
  const body = runs
    .filter((run) => run.text)
    .map((run) => {
      const props: string[] = ['<rFont val="Arial"/>'];
      if (run.strike) props.push("<strike/>");
      if (run.red || run.strike) props.push('<color rgb="FFFF0000"/>');
      props.push('<sz val="10"/>');
      return `<r><rPr>${props.join("")}</rPr><t xml:space="preserve">${escapeXml(run.text)}</t></r>`;
    })
    .join("");
  const s = style ? ` s="${style}"` : "";
  return `<c r="${ref}"${s} t="inlineStr"><is>${body}</is></c>`;
}

const plainCell = (ref: string, style: string | null, text: string): string =>
  richCell(ref, style, [{ text }]);

/** Pull the `s=` style id off a cell in the template, so new rows inherit its look. */
function styleOf(sheetXml: string, ref: string): string | null {
  const cell = new RegExp(`<c r="${ref}"([^>]*)>`).exec(sheetXml)
    ?? new RegExp(`<c r="${ref}"([^>]*)/>`).exec(sheetXml);
  return cell ? /s="(\d+)"/.exec(cell[1]!)?.[1] ?? null : null;
}

/** The `<row …>…</row>` span for a given row number, if the template has one. */
function rowSpan(sheetXml: string, rowNumber: number): { start: number; end: number } | null {
  const open = new RegExp(`<row[^>]*\\sr="${rowNumber}"[^>]*>`).exec(sheetXml);
  if (!open) {
    const empty = new RegExp(`<row[^>]*\\sr="${rowNumber}"[^>]*/>`).exec(sheetXml);
    return empty ? { start: empty.index, end: empty.index + empty[0].length } : null;
  }
  const close = sheetXml.indexOf("</row>", open.index);
  if (close === -1) return null;
  return { start: open.index, end: close + 6 };
}

/**
 * Write the rows into one sheet's XML.
 *
 * Every data row from the first one down is replaced, so a second run over the
 * same workbook overwrites cleanly instead of appending a duplicate schedule.
 */
export function writeRowsIntoSheet(
  sheetXml: string,
  rows: DeviationRow[],
  bidder: string,
  justifications: string[],
  layout: SheetLayout = APPENDIX_E_LAYOUT,
  responseDate?: string,
): string {
  const firstRow = layout.headerRow + 1;
  const columns = [layout.reference, layout.bidder, layout.original, layout.proposed, layout.justification];
  const styles = Object.fromEntries(
    columns.map((c) => [c, styleOf(sheetXml, `${c}${firstRow}`)]),
  ) as Record<string, string | null>;
  // The response columns the buyer fills in keep their own look.
  const trailing = ["G", "H"].map((c) => ({ column: c, style: styleOf(sheetXml, `${c}${firstRow}`) }));

  const built = rows.map((row, at) => {
    const r = firstRow + at;
    const cells = [
      plainCell(`${layout.reference}${r}`, styles[layout.reference]!, row.reference),
      plainCell(`${layout.bidder}${r}`, styles[layout.bidder]!, bidder),
      plainCell(`${layout.original}${r}`, styles[layout.original]!, row.original),
      richCell(
        `${layout.proposed}${r}`,
        styles[layout.proposed]!,
        row.proposed.map((segment) => ({
          text: segment.text,
          red: segment.kind === "insert" || segment.kind === "delete",
          strike: segment.kind === "delete",
        })),
      ),
      plainCell(`${layout.justification}${r}`, styles[layout.justification]!, justifications[at] ?? ""),
      ...trailing.map((t) => (t.style ? `<c r="${t.column}${r}" s="${t.style}"/>` : "")),
    ].join("");
    const span = `${columnIndex(layout.reference)}:${columnIndex("H")}`;
    return `<row r="${r}" spans="${span}" customFormat="1">${cells}</row>`;
  }).join("");

  // Cut every existing row at or below the first data row, then splice ours in
  // where the first of them used to be.
  const existing: { start: number; end: number }[] = [];
  const finder = /<row[^>]*\sr="(\d+)"[^>]*?(?:\/>|>)/g;
  let match: RegExpExecArray | null;
  while ((match = finder.exec(sheetXml))) {
    const number = Number(match[1]);
    if (number < firstRow) continue;
    const span = rowSpan(sheetXml, number);
    if (span) { existing.push(span); finder.lastIndex = span.end; }
  }

  let out = sheetXml;
  if (existing.length) {
    const from = existing[0]!.start;
    const to = existing[existing.length - 1]!.end;
    out = out.slice(0, from) + built + out.slice(to);
  } else {
    out = out.replace("</sheetData>", `${built}</sheetData>`);
  }

  // "Bidders are required to insert date of response to the header of Column
  // F" — an instruction in the template's own preamble, and the kind of thing
  // a procurement team checks before it reads a single deviation. The heading
  // lives in the shared string table; rewriting the cell as an inline string
  // replaces it without renumbering references used by the other sheet.
  if (responseDate) {
    const ref = `${layout.justification}${layout.headerRow}`;
    const heading = new RegExp(`<c r="${ref}"[^>]*?(?:/>|>[\\s\\S]*?</c>)`).exec(out);
    if (heading) {
      const style = /s="(\d+)"/.exec(heading[0])?.[1] ?? null;
      const text = `Brief Justification / Comments for the Proposed Change (${responseDate})`;
      out = out.replace(heading[0], richCell(ref, style, [{ text }]));
    }
  }

  const lastRow = firstRow + rows.length - 1;
  // Carry the filter, the response dropdown and the declared extent down over
  // the rows we added, or the sheet looks truncated at the template's length.
  out = out.replace(/<autoFilter ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/,
    (_m, c1, r1, c2) => `<autoFilter ref="${c1}${r1}:${c2}${lastRow}"`);
  out = out.replace(/<dataValidation ([^>]*?)sqref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/g,
    (_m, rest, c1, r1, c2) => `<dataValidation ${rest}sqref="${c1}${r1}:${c2}${lastRow}"`);
  out = out.replace(/(<dimension ref="[A-Z]+\d+:[A-Z]+)(\d+)("\s*\/>)/,
    (_m, head, _n, tail) => `${head}${Math.max(lastRow, 1)}${tail}`);
  return out;
}

/** Which zip part holds a given sheet, resolved through the workbook's rels. */
export function sheetPartFor(
  workbookXml: string,
  relsXml: string,
  sheetName: string,
): string | null {
  const sheet = new RegExp(`<sheet[^>]*name="${sheetName}"[^>]*>`).exec(workbookXml)?.[0];
  if (!sheet) return null;
  const id = /r:id="([^"]+)"/.exec(sheet)?.[1];
  if (!id) return null;
  const rel = new RegExp(`<Relationship[^>]*Id="${id}"[^>]*>`).exec(relsXml)?.[0];
  const target = rel ? /Target="([^"]+)"/.exec(rel)?.[1] : null;
  if (!target) return null;
  return target.startsWith("/") ? target.slice(1)
    : target.startsWith("xl/") ? target
    : `xl/${target}`;
}
