/**
 * What the previewer knows about a document before it draws it: the kind of
 * file it is, how it should be described, and the shape a workbook takes once
 * it has been read.
 */
export type DocKind = "pdf" | "word" | "slides" | "sheet" | "image" | "text" | "unknown";

export type KindLook = { label: string; short: string; tint: string; ink: string };

/** How each kind is named and coloured, on tiles and in the viewer's chrome. */
export const KIND_LOOK: Record<DocKind, KindLook> = {
  pdf: { label: "PDF", short: "PDF", tint: "#fdeaea", ink: "#b4322c" },
  word: { label: "Word document", short: "DOC", tint: "#e8effb", ink: "#2b579a" },
  slides: { label: "Presentation", short: "PPT", tint: "#fdeee6", ink: "#c1441e" },
  sheet: { label: "Spreadsheet", short: "XLS", tint: "#e7f3ec", ink: "#1e7145" },
  image: { label: "Image", short: "IMG", tint: "#efeafa", ink: "#5b4b9c" },
  text: { label: "Text", short: "TXT", tint: "#f0f0f0", ink: "#4a4a4a" },
  unknown: { label: "File", short: "FILE", tint: "#f0f0f0", ink: "#6b6b6b" },
};

export type SheetCell = { value: string; numeric: boolean };
export type SheetGrid = {
  name: string;
  rows: { cells: (SheetCell | undefined)[] }[];
  columns: number;
  /** Column widths in pixels, by column index; missing means the default. */
  widths: number[];
  merges: { row: number; col: number; rows: number; cols: number }[];
  frozenRows: number;
  frozenColumns: number;
};
export type SheetDoc = { sheets: SheetGrid[] };
