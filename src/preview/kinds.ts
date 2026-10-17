/**
 * Working out what a file is. The name is a hint, not the truth — files
 * arrive from storage with a path rather than an extension often enough that
 * the bytes have to settle it.
 */
import type { DocKind } from "./model";

export const kindFromName = (name: string): DocKind => {
  const ext = /\.([a-z0-9]+)$/i.exec(name.toLowerCase())?.[1] ?? "";
  if (ext === "pdf") return "pdf";
  if (["docx", "doc", "rtf", "odt"].includes(ext)) return "word";
  if (["pptx", "ppt", "odp"].includes(ext)) return "slides";
  if (["xlsx", "xls", "xlsm", "csv", "ods"].includes(ext)) return "sheet";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp"].includes(ext)) return "image";
  if (["txt", "md", "markdown", "json", "xml", "html"].includes(ext)) return "text";
  return "unknown";
};

const startsWith = (bytes: ArrayBuffer, signature: string) =>
  String.fromCharCode(...new Uint8Array(bytes.slice(0, signature.length))) === signature;

const isZip = (bytes: ArrayBuffer) => {
  const b = new Uint8Array(bytes.slice(0, 2));
  return b[0] === 0x50 && b[1] === 0x4b;
};

/**
 * Which Office format a zip holds, read from the part names in its central
 * directory. Cheaper than unzipping, and enough to tell the three apart.
 */
function officeKind(bytes: ArrayBuffer): DocKind {
  const names = new TextDecoder("latin1").decode(new Uint8Array(bytes.slice(0, 64_000)));
  if (names.includes("word/document.xml")) return "word";
  if (names.includes("ppt/presentation.xml")) return "slides";
  if (names.includes("xl/workbook.xml")) return "sheet";
  return "unknown";
}

/** The kind of document these bytes are, falling back to what the name says. */
export function kindOf(bytes: ArrayBuffer, name = ""): DocKind {
  if (startsWith(bytes, "%PDF-")) return "pdf";
  if (isZip(bytes)) {
    const office = officeKind(bytes);
    if (office !== "unknown") return office;
  }
  if (startsWith(bytes, "\x89PNG") || startsWith(bytes, "GIF8")) return "image";
  const jpeg = new Uint8Array(bytes.slice(0, 3));
  if (jpeg[0] === 0xff && jpeg[1] === 0xd8 && jpeg[2] === 0xff) return "image";
  const named = kindFromName(name);
  if (named !== "unknown") return named;
  return "unknown";
}

/** The name to show for a file, from a storage path or an upload. */
export const fileName = (ref: string) => ref.split("/").pop() ?? ref;
