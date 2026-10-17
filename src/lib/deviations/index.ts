/**
 * The schedule of deviations, end to end.
 *
 * Four steps, in an order that matters:
 *
 *   1. read the redline's revisions out of `word/document.xml`
 *   2. resolve the numbering, because this document's clause numbers are
 *      generated and not typed
 *   3. gather the changes to the provision each one amends
 *   4. write them into the buyer's own workbook
 *
 * Step 2 before step 3 is the whole trick. Atomise first and every row comes
 * out with a blank clause reference, which is the column the other side reads
 * before any other.
 *
 * All of it runs in the browser: the two files a lawyer drops in are zips, and
 * JSZip is already in the build. Nothing is uploaded to produce the schedule.
 */
import JSZip from "jszip";
import { readRevisions } from "./revisions";
import { labelParagraphs, readNumbering } from "./numbering";
import { buildRows, tidyText, type BuildResult, type NumberedParagraph } from "./rows";
import { describeAll } from "./justify";
import { APPENDIX_E_LAYOUT, sheetPartFor, writeRowsIntoSheet, type SheetLayout } from "./workbook";

export * from "./revisions";
export * from "./numbering";
export * from "./rows";
export * from "./justify";
export * from "./workbook";
export * from "./export-xlsx";
export * from "./export-docx";

export type ReadRedline = BuildResult & { paragraphs: NumberedParagraph[] };

const textOf = async (zip: JSZip, path: string): Promise<string> => {
  const file = zip.file(path);
  if (!file) throw new Error(`This .docx has no ${path}. It may not be a Word document.`);
  return file.async("string");
};

/** Steps 1 to 3: a redline in, a set of deviation rows out. */
export async function readRedline(file: ArrayBuffer | Uint8Array | Blob): Promise<ReadRedline> {
  const zip = await JSZip.loadAsync(file as never);
  const [documentXml, numberingXml, stylesXml] = await Promise.all([
    textOf(zip, "word/document.xml"),
    zip.file("word/numbering.xml")?.async("string") ?? Promise.resolve(""),
    zip.file("word/styles.xml")?.async("string") ?? Promise.resolve(""),
  ]);

  const paragraphs = readRevisions(documentXml);
  const tables = readNumbering(numberingXml, stylesXml);
  // Two passes over the same document: as it arrived, and as it would read if
  // every change were accepted.
  const original = labelParagraphs(paragraphs, tables, (p) => p.paraMarkInserted && !p.original.trim());
  const amended = labelParagraphs(paragraphs, tables, (p) => p.paraMarkDeleted && !p.amended.trim());
  const numbered: NumberedParagraph[] = paragraphs.map((paragraph, at) => ({
    ...paragraph,
    originalLabel: original[at]!,
    amendedLabel: amended[at]!,
  }));
  return { ...buildRows(numbered), paragraphs: numbered };
}

/**
 * Which of the three ways out the lawyer is taking.
 *
 * "template" writes into the buyer's own appendix and needs one to have been
 * sent. The other two need nothing but the redline, which is the ordinary case:
 * the mark-up goes back with a covering letter and the deviations are set out
 * in a table the firm draws itself.
 */
export type ExportFormat = "template" | "xlsx" | "docx";

/** Step 4: the rows, written into the template we were sent. */
export async function fillSchedule(
  template: ArrayBuffer | Uint8Array | Blob,
  read: ReadRedline,
  bidder: string,
  justifications?: string[],
  responseDate?: string,
  layout: SheetLayout = APPENDIX_E_LAYOUT,
): Promise<Blob> {
  const zip = await JSZip.loadAsync(template as never);
  const workbookXml = await textOf(zip, "xl/workbook.xml");
  const relsXml = await textOf(zip, "xl/_rels/workbook.xml.rels");
  const part = sheetPartFor(workbookXml, relsXml, layout.sheet);
  if (!part)
    throw new Error(
      `This workbook has no sheet called “${layout.sheet}”. Check you picked the schedule of deviations.`,
    );
  const sheetXml = await textOf(zip, part);
  zip.file(
    part,
    writeRowsIntoSheet(
      sheetXml,
      read.rows,
      bidder,
      justifications ?? describeAll(read.rows),
      layout,
      responseDate,
    ),
  );
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/**
 * The three checks a schedule has to pass before anyone sends it.
 *
 * Named for what a reviewer is actually asking, and computed rather than
 * asserted: a green tick that is not derived from the document is worse than
 * no tick at all.
 */
export type Check = { name: string; passed: boolean; detail: string };

export function checkSchedule(read: ReadRedline): Check[] {
  const inRows = new Set(read.rows.flatMap((row) => row.paragraphs));
  const setAside = new Set(read.setAside.map((s) => s.paragraph));
  const orphans = read.paragraphs.filter(
    (p) => p.changed && !inRows.has(p.index) && !setAside.has(p.index),
  );

  const byIndex = new Map(read.paragraphs.map((p) => [p.index, p]));
  // Both sides must be normalised the SAME way. The rows have been through
  // `tidyText`, which removes the bidi marks Word wraps around every
  // cross-reference; the raw paragraph has not. Comparing one against the
  // other reported 42 rows as misquoting the Agreement when the only
  // difference was an invisible character — a red cross on a schedule that
  // was in fact correct, which is worse than no check at all.
  const strip = (text: string) => tidyText(text).replace(/\s+/g, " ").trim();
  const wrong = read.rows.filter((row) => {
    const accepted = row.proposed
      .filter((s) => s.kind === "same" || s.kind === "insert")
      .map((s) => s.text)
      .join("");
    const expected = row.paragraphs
      .map((i) => byIndex.get(i)!)
      .filter((p) => p.segments.some((s) => s.text.trim()))
      .map((p) => p.amended)
      .join("\n");
    return strip(accepted) !== strip(expected);
  });

  const quoted = read.rows.filter((row) => {
    if (row.isNew) return false;
    const rejected = row.proposed
      .filter((s) => s.kind === "same" || s.kind === "delete")
      .map((s) => s.text)
      .join("");
    const expected = row.paragraphs
      .map((i) => byIndex.get(i)!)
      .filter((p) => p.segments.some((s) => s.text.trim()))
      .map((p) => p.original)
      .join("\n");
    return strip(rejected) !== strip(expected);
  });

  return [
    {
      name: "Agreement → Schedule",
      passed: orphans.length === 0,
      detail: orphans.length
        ? `${orphans.length} changed paragraph(s) reached no row: ${orphans.map((p) => p.index).join(", ")}`
        : `Every tracked change is either in a row or set aside with a reason (${read.setAside.length} set aside).`,
    },
    {
      name: "Schedule → Agreement",
      passed: quoted.length === 0,
      detail: quoted.length
        ? `${quoted.length} row(s) do not quote the Agreement exactly.`
        : "Every row's original wording matches the Agreement before the change, character for character.",
    },
    {
      name: "Clause reconstruction",
      passed: wrong.length === 0,
      detail: wrong.length
        ? `${wrong.length} row(s) would not reproduce the amended clause.`
        : "Accepting the changes shown reproduces the amended clause exactly, in every row.",
    },
  ];
}
