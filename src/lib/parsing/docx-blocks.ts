/**
 * A .docx read with its own clause numbers still attached.
 *
 * ---------------------------------------------------------------------------
 * WHY NOT mammoth, WHICH THIS REPLACES FOR .docx
 * ---------------------------------------------------------------------------
 *
 * mammoth gives good semantic HTML — a heading stays a heading — and throws
 * away the one thing a contract parser cannot do without: the clause numbers.
 * Word generates them from `numbering.xml` at render time, so they are not in
 * the text, and mammoth does not resolve them. The parser therefore saw a
 * document with no numbers anywhere and numbered it itself, 1..N, from the
 * first heading it could find.
 *
 * On a document with a cover page that is a disaster rather than a cosmetic
 * problem. The title and the parties became clause 1 with eight sub-clauses,
 * "SERVICES AND RELATIONSHIP" became clause 2 instead of clause 1, and every
 * clause after it shifted by one. The wording still said "commissioned only
 * under clause 6", which now pointed at the wrong clause, so the review run
 * reported broken cross-references that were never broken. Renumbering a
 * contract silently is worse than failing to parse it.
 *
 * So the numbers are resolved here first, from the document's own numbering
 * definitions, using the resolver written for the deviations schedule. One
 * reader, both features.
 */
import JSZip from "jszip";
import { paragraphSpans, readRevisions } from "@/lib/deviations/revisions";
import { labelParagraphs, readNumbering } from "@/lib/deviations/numbering";
import type { Block } from "./blocks";

/** `Heading3` → 3. `Title` heads the document rather than a clause. */
const HEADING_STYLE = /^Heading([1-9])$/i;

/**
 * A number the clause parser can read off the text: "4", "4.1", "4.1.2".
 *
 * Bracketed and lettered markers — "(1)", "(a)", "(iii)" — are deliberately
 * NOT written into the text. The parties of a contract are numbered "(1)" and
 * "(2)" in a sequence of their own, and prefixing those would present the
 * counterparties to the parser as the first two clauses of the agreement.
 */
const CLAUSE_NUMBER = /^\d+(?:\.\d+)*\.?$/;

/** Page breaks Word has recorded, so a clause can still be cited by page. */
const pageBreaksIn = (span: string): number =>
  (span.match(/<w:lastRenderedPageBreak\/>|<w:br [^>]*w:type="page"/g) ?? []).length;

export type DocxBlocks = {
  blocks: Block[];
  /** How many of them carried a resolved clause number. */
  numbered: number;
  pageCount: number;
};

/**
 * Blocks from the three parts of a .docx that decide structure.
 *
 * `numbering` and `styles` may be absent — a document with no lists has no
 * numbering part — and then this degrades to text and heading styles only,
 * which is no worse than what mammoth gave.
 */
export function docxBlocks(
  documentXml: string,
  numberingXml: string,
  stylesXml: string,
): DocxBlocks {
  const body = /<w:body>([\s\S]*)<\/w:body>/.exec(documentXml)?.[1] ?? documentXml;
  const paragraphs = readRevisions(documentXml);
  const spans = paragraphSpans(body);
  const labels = labelParagraphs(paragraphs, readNumbering(numberingXml, stylesXml));

  const blocks: Block[] = [];
  let page = 1;
  let numbered = 0;

  paragraphs.forEach((paragraph, at) => {
    // Both lists come from the same scan of the same body, so they line up;
    // if they ever did not, a page number would be attached to the wrong
    // paragraph, which is the sort of quiet wrongness worth refusing.
    page += pageBreaksIn(spans[at] ?? "");

    const text = paragraph.amended.replace(/[ \t]+/g, " ").trim();
    if (!text) return;

    const style = paragraph.style ?? "";
    const heading = HEADING_STYLE.exec(style);
    const label = labels[at];
    const carries = !!label && CLAUSE_NUMBER.test(label);
    if (carries) numbered += 1;

    blocks.push({
      text: carries ? `${label} ${text}` : text,
      page,
      heading: !!heading || /^Title$/i.test(style),
      ...(heading ? { level: Number(heading[1]) } : /^Title$/i.test(style) ? { level: 1 } : {}),
    });
  });

  return { blocks, numbered, pageCount: page };
}

/** The same, straight from the file. */
export async function blocksFromDocx(file: ArrayBuffer | Uint8Array): Promise<DocxBlocks> {
  const zip = await JSZip.loadAsync(file as never);
  const part = async (path: string) => (await zip.file(path)?.async("string")) ?? "";
  const documentXml = await part("word/document.xml");
  if (!documentXml) throw new Error("This .docx has no word/document.xml.");
  return docxBlocks(documentXml, await part("word/numbering.xml"), await part("word/styles.xml"));
}
