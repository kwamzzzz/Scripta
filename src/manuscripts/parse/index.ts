/**
 * One way in for a manuscript file: Word (.docx) or PDF, chosen by extension
 * and then by type. Anything else is refused with a plain reason.
 */
import type { ParsedManuscript } from "../model";
import { parseDocx } from "./docx";
import { parsePdf } from "./pdf";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const REFUSALS: Record<string, string> = {
  doc: "Older Word .doc files cannot be read. Open the file in Word and save it as .docx first.",
  docm: "Macro-enabled Word files cannot be read. Save the manuscript as a plain .docx first.",
  dotx: "This is a Word template, not a manuscript. Save the manuscript itself as .docx.",
  rtf: "Rich Text files cannot be read. Open the file in Word and save it as .docx first.",
  odt: "OpenDocument files cannot be read. Save the manuscript as .docx (File > Save As > Word) first.",
  pages:
    "Pages files cannot be read. Export the manuscript from Pages as a Word (.docx) file first.",
  txt: "Plain text has no headings or notes to read. Upload the Word (.docx) or PDF version instead.",
  md: "Markdown files cannot be read. Upload the Word (.docx) or PDF version instead.",
  tex: "LaTeX sources cannot be read. Upload the compiled PDF instead.",
};

export async function parseManuscript(file: File): Promise<ParsedManuscript> {
  const name = file.name || "manuscript";
  const ext = /\.([^.]+)$/.exec(name)?.[1]?.toLowerCase() ?? "";
  const isDocx = ext === "docx" || (!ext && file.type === DOCX_MIME);
  const isPdf = ext === "pdf" || (!ext && file.type === "application/pdf");
  if (isDocx) return parseDocx(await file.arrayBuffer(), name);
  if (isPdf) return parsePdf(await file.arrayBuffer(), name);
  throw new Error(
    REFUSALS[ext] ??
      `Scripta can read Word (.docx) and PDF manuscripts. ${ext ? `A .${ext} file` : "This file"} is neither.`,
  );
}

export { parseDocx } from "./docx";
export { layoutToManuscript, parsePdf } from "./pdf";
