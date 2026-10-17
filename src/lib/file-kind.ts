/**
 * What a file is, in the two or three letters a reader already knows.
 *
 * Shown where a thumbnail cannot be drawn — a file still uploading, a format
 * nothing here can rasterise — because "DOC" tells a reader more than a blank
 * white rectangle pretending to be a page.
 */
const EXTENSION = /\.([a-z0-9]{2,5})$/i;

export function fileKindLabel(name: string | null | undefined, fileRef?: string | null): string {
  const from = (text: string | null | undefined) => EXTENSION.exec((text ?? "").trim())?.[1];
  const ext = (from(name) ?? from(fileRef) ?? "").toUpperCase();
  if (!ext) return "FILE";
  if (ext === "DOCX" || ext === "DOC") return "DOC";
  if (ext === "PPTX" || ext === "PPT") return "PPT";
  if (ext === "XLSX" || ext === "XLS" || ext === "CSV") return "XLS";
  if (ext === "JPEG") return "JPG";
  return ext.slice(0, 4);
}
