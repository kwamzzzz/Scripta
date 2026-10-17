/**
 * The schedule as a workbook we draw ourselves.
 *
 * ---------------------------------------------------------------------------
 * A SPREADSHEET IS A ZIP OF XML, AND THAT IS ALL IT IS
 * ---------------------------------------------------------------------------
 *
 * `preview/sheet.ts` already reads a workbook with JSZip on the argument that
 * SheetJS is more than the job needs. Writing one is the same argument: six
 * small parts, no dependency, and total control over the one thing that
 * matters here — rich text inside a cell, so an addition is red and a deletion
 * struck through in the same paragraph.
 *
 * `workbook.ts` fills the buyer's own appendix and must disturb nothing. This
 * builds a fresh one when no appendix was sent, and so it owns its whole look:
 * the column widths, the shaded heading row, the wrapping, the freeze under
 * the headings and the filter across them.
 *
 * The parts, and why each is there:
 *   [Content_Types].xml        what every part in the zip is
 *   _rels/.rels                the way in, pointing at the workbook
 *   xl/workbook.xml            the sheet, and the frozen-pane definition
 *   xl/_rels/workbook.xml.rels the way from the workbook to the sheet
 *   xl/styles.xml              fonts, fills, borders, and the formats that use them
 *   xl/worksheets/sheet1.xml   the cells
 */
import { createZip, utf8, type ZipEntry } from "@/lib/export/zip";
// One escaper for both writers: the buyer's workbook and ours have the same
// job of getting Word's stray control characters past the XML parser.
import { escapeXml } from "./workbook";
import type { DeviationRow } from "./rows";

const SHEET_NAME = "Legal Deviations";

const HEADINGS = [
  "Clause Ref.",
  "Bidder Name",
  "Original Clause in the Agreement",
  "The Bidder's Proposed Clause",
  "Brief Justification / Comments for the Proposed Change",
];

/** Characters per column, as Excel measures width. */
const WIDTHS = [26, 22, 58, 58, 46];

/** Style indices into `cellXfs` below, in the order they are declared there. */
const STYLE = { plain: 0, heading: 1, body: 2, reference: 3 } as const;

const CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
  "</Types>";

const ROOT_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  "</Relationships>";

const WORKBOOK_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
  "</Relationships>";

const WORKBOOK =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"' +
  ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
  `<sheets><sheet name="${SHEET_NAME}" sheetId="1" r:id="rId1"/></sheets>` +
  "</workbook>";

/**
 * Fonts, fills, borders and the four formats that combine them.
 *
 * The indices are positional and the order of the elements is fixed by the
 * schema, which is why they are written out rather than generated: a spare
 * comma here and Excel offers to repair the file instead of opening it.
 */
const STYLES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="2">' +
  '<font><sz val="10"/><name val="Arial"/></font>' +
  '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>' +
  "</fonts>" +
  '<fills count="3">' +
  '<fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill>' +
  // The heading band, in the workbench's own ink.
  '<fill><patternFill patternType="solid"><fgColor rgb="FF123247"/><bgColor indexed="64"/></patternFill></fill>' +
  "</fills>" +
  '<borders count="2">' +
  "<border><left/><right/><top/><bottom/><diagonal/></border>" +
  '<border><left style="thin"><color rgb="FFB0B4AE"/></left>' +
  '<right style="thin"><color rgb="FFB0B4AE"/></right>' +
  '<top style="thin"><color rgb="FFB0B4AE"/></top>' +
  '<bottom style="thin"><color rgb="FFB0B4AE"/></bottom><diagonal/></border>' +
  "</borders>" +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="4">' +
  // 0 plain
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  // 1 heading: white on ink, wrapped, ruled
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1"' +
  ' applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +
  // 2 body: wrapped, top-aligned, ruled
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"' +
  ' applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
  // 3 reference: as body, but the clause number reads better unwrapped-ish
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"' +
  ' applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
  "</cellXfs>" +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  "</styleSheet>";

type Run = { text: string; red?: boolean; strike?: boolean; bold?: boolean };

/**
 * A cell holding rich text, written inline rather than through the shared
 * string table: nothing else references it, so there is nothing to renumber.
 *
 * `rPr` children follow the order CT_RPrElt requires — rFont, b, strike,
 * color, sz. Out of order, Excel reports the workbook as needing repair.
 */
function cell(ref: string, style: number, runs: Run[]): string {
  const body = runs
    .filter((r) => r.text)
    .map((r) => {
      // CT_RPrElt is a SEQUENCE: rFont, charset, family, b, i, strike,
      // outline, shadow, condense, extend, color, sz, u, vertAlign, scheme.
      // rFont last and sz before color — as this emitted at first — is the
      // kind of error openpyxl reads straight through and Excel refuses:
      // "We found a problem with some content", and the repair throws away
      // every cell's style with it, which is why the wrapping vanished too.
      const props =
        '<rFont val="Arial"/>' +
        `${r.bold ? "<b/>" : ""}${r.strike ? "<strike/>" : ""}` +
        `${r.red || r.strike ? '<color rgb="FFC00000"/>' : ""}` +
        '<sz val="10"/>';
      return `<r><rPr>${props}</rPr><t xml:space="preserve">${escapeXml(r.text)}</t></r>`;
    })
    .join("");
  if (!body) return `<c r="${ref}" s="${style}"/>`;
  return `<c r="${ref}" s="${style}" t="inlineStr"><is>${body}</is></c>`;
}

const columnLetter = (index: number): string => {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rest = (n - 1) % 26;
    out = String.fromCharCode(65 + rest) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
};

export type DeviationsXlsxOptions = {
  rows: DeviationRow[];
  justifications: string[];
  bidder: string;
  responseDate?: string;
};

/** The sheet part, so a test can read the cells without unzipping. */
export function buildSheetXml(options: DeviationsXlsxOptions): string {
  const { rows, justifications, bidder, responseDate } = options;
  const headings = [...HEADINGS];
  if (responseDate) headings[4] = `${HEADINGS[4]} (${responseDate})`;

  const header =
    `<row r="1" ht="30" customHeight="1">` +
    headings.map((h, at) => cell(`${columnLetter(at)}1`, STYLE.heading, [{ text: h }])).join("") +
    "</row>";

  const body = rows
    .map((row, at) => {
      const r = at + 2;
      const cells = [
        cell(`A${r}`, STYLE.reference, [{ text: row.reference }]),
        cell(`B${r}`, STYLE.body, [{ text: bidder }]),
        cell(`C${r}`, STYLE.body, [{ text: row.original }]),
        cell(
          `D${r}`,
          STYLE.body,
          row.proposed.map((segment) => ({
            text: segment.text,
            red: segment.kind === "insert" || segment.kind === "delete",
            strike: segment.kind === "delete",
            bold: segment.kind === "label",
          })),
        ),
        cell(`E${r}`, STYLE.body, [{ text: justifications[at] ?? "" }]),
      ].join("");
      return `<row r="${r}">${cells}</row>`;
    })
    .join("");

  const last = rows.length + 1;
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<dimension ref="A1:E${Math.max(last, 1)}"/>` +
    // The headings stay put while a hundred and fifty rows scroll under them.
    '<sheetViews><sheetView workbookViewId="0">' +
    '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
    "</sheetView></sheetViews>" +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    "<cols>" +
    WIDTHS.map(
      (w, at) => `<col min="${at + 1}" max="${at + 1}" width="${w}" customWidth="1"/>`,
    ).join("") +
    "</cols>" +
    `<sheetData>${header}${body}</sheetData>` +
    `<autoFilter ref="A1:E${Math.max(last, 1)}"/>` +
    '<pageMargins left="0.5" right="0.5" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>' +
    '<pageSetup orientation="landscape" fitToWidth="1" paperSize="9"/>' +
    "</worksheet>"
  );
}

/** The whole workbook, as bytes ready to download. */
export function buildDeviationsXlsx(options: DeviationsXlsxOptions): Uint8Array {
  const entries: ZipEntry[] = [
    { path: "[Content_Types].xml", data: utf8(CONTENT_TYPES) },
    { path: "_rels/.rels", data: utf8(ROOT_RELS) },
    { path: "xl/workbook.xml", data: utf8(WORKBOOK) },
    { path: "xl/_rels/workbook.xml.rels", data: utf8(WORKBOOK_RELS) },
    { path: "xl/styles.xml", data: utf8(STYLES) },
    { path: "xl/worksheets/sheet1.xml", data: utf8(buildSheetXml(options)) },
  ];
  return createZip(entries);
}
