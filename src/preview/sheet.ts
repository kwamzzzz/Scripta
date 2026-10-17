/**
 * Reading an Excel workbook well enough to show it: sheet names, the cells
 * people typed, the column widths they set and the cells they merged.
 *
 * Nothing here writes, so the whole of SheetJS is more than the job needs; a
 * workbook is a zip of XML and JSZip is already in the build. What a preview
 * has to get right is the numbers — a date must read as a date and a
 * percentage as a percentage, or the sheet is worse than useless.
 */
import type { SheetCell, SheetDoc, SheetGrid } from "./model";

const text = (node: Element | null | undefined) => node?.textContent ?? "";

const parse = (xml: string) => new DOMParser().parseFromString(xml, "application/xml");

/** "BC12" → { col: 54, row: 11 }, both zero-based. */
export function cellAddress(ref: string): { col: number; row: number } {
  const match = /^([A-Z]+)(\d+)$/.exec(ref.toUpperCase());
  if (!match) return { col: 0, row: 0 };
  let col = 0;
  for (const letter of match[1]!) col = col * 26 + (letter.charCodeAt(0) - 64);
  return { col: col - 1, row: parseInt(match[2]!, 10) - 1 };
}

export const columnName = (index: number) => {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
};

/** Excel keeps dates as days since 1899-12-30; 1900 is treated as a leap year. */
export function excelDate(serial: number): Date {
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  return new Date(ms);
}

type Formats = { date: Set<number>; percent: Set<number>; grouped: Set<number> };

/** Which cell styles mean a date, a percentage or a grouped number. */
function readFormats(styles: string | null): Formats {
  const date = new Set<number>();
  const percent = new Set<number>();
  const grouped = new Set<number>();
  if (!styles) return { date, percent, grouped };
  const doc = parse(styles);
  const codes = new Map<number, string>();
  // The built-in formats are not written into the file; these are the ones a
  // preview has to recognise.
  for (const id of [14, 15, 16, 17, 22]) codes.set(id, "d");
  for (const id of [18, 19, 20, 21, 45, 46, 47]) codes.set(id, "t");
  for (const id of [9, 10]) codes.set(id, "%");
  for (const id of [3, 4, 37, 38, 39, 40, 41, 42, 43, 44]) codes.set(id, "#,##0");
  for (const fmt of doc.getElementsByTagName("numFmt")) {
    const id = Number(fmt.getAttribute("numFmtId"));
    if (Number.isFinite(id)) codes.set(id, fmt.getAttribute("formatCode") ?? "");
  }
  const xfs = doc.querySelector("cellXfs");
  const each = xfs ? [...xfs.getElementsByTagName("xf")] : [];
  each.forEach((xf, index) => {
    const code = codes.get(Number(xf.getAttribute("numFmtId"))) ?? "";
    const outsideQuotes = code.replace(/"[^"]*"/g, "").replace(/\\./g, "");
    if (code === "d" || code === "t" || /[dmyhs]/i.test(outsideQuotes.replace(/[^a-z]/gi, "")))
      date.add(index);
    if (code === "%" || outsideQuotes.includes("%")) percent.add(index);
    if (outsideQuotes.includes("#,##0")) grouped.add(index);
  });
  return { date, percent, grouped };
}

const dateText = (serial: number) => {
  const d = excelDate(serial);
  if (Number.isNaN(d.getTime())) return String(serial);
  const day = d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  // A whole number is a day; a fraction carries a time worth showing.
  if (Number.isInteger(serial)) return day;
  return `${day} ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
};

const numberText = (value: number, style: number, formats: Formats) => {
  if (formats.date.has(style)) return dateText(value);
  if (formats.percent.has(style))
    return `${(value * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
  const digits = Number.isInteger(value) ? 0 : 2;
  if (formats.grouped.has(style))
    return value.toLocaleString(undefined, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  return String(Math.round(value * 1e10) / 1e10);
};

/** The strings a workbook keeps in one table and points at from its cells. */
function readSharedStrings(xml: string | null): string[] {
  if (!xml) return [];
  return [...parse(xml).getElementsByTagName("si")].map((si) =>
    [...si.getElementsByTagName("t")]
      .filter((t) => t.parentElement?.tagName !== "rPh")
      .map((t) => t.textContent ?? "")
      .join(""),
  );
}

function readGrid(xml: string, shared: string[], formats: Formats, name: string): SheetGrid {
  const doc = parse(xml);
  const widths: number[] = [];
  for (const col of doc.getElementsByTagName("col")) {
    const from = Number(col.getAttribute("min")) - 1;
    const to = Number(col.getAttribute("max")) - 1;
    const width = Number(col.getAttribute("width"));
    if (!Number.isFinite(from) || !Number.isFinite(width)) continue;
    // Excel measures a column in characters of the standard font; 7px each is
    // the conversion Excel itself documents, plus the cell padding.
    for (let i = from; i <= Math.min(to, from + 200); i++) widths[i] = Math.round(width * 7 + 5);
  }

  const rows: SheetGrid["rows"] = [];
  let columns = 0;
  for (const row of doc.getElementsByTagName("row")) {
    const at = Number(row.getAttribute("r")) - 1;
    const cells: SheetGrid["rows"][number]["cells"] = [];
    for (const cell of row.getElementsByTagName("c")) {
      const ref = cell.getAttribute("r") ?? "";
      const { col } = cellAddress(ref);
      const type = cell.getAttribute("t");
      const style = Number(cell.getAttribute("s") ?? 0) || 0;
      const raw = text(cell.querySelector("v"));
      let value = "";
      let numeric = false;
      if (type === "s") value = shared[Number(raw)] ?? "";
      else if (type === "inlineStr")
        value = [...cell.getElementsByTagName("t")].map((t) => t.textContent ?? "").join("");
      else if (type === "b") value = raw === "1" ? "TRUE" : "FALSE";
      else if (type === "e") value = raw;
      else if (raw !== "") {
        const n = Number(raw);
        numeric = Number.isFinite(n);
        value = numeric ? numberText(n, style, formats) : raw;
      }
      if (value === "") continue;
      cells[col] = { value, numeric };
      columns = Math.max(columns, col + 1);
    }
    if (cells.length) rows[at] = { cells };
  }

  const merges = [...doc.getElementsByTagName("mergeCell")].flatMap((m) => {
    const ref = m.getAttribute("ref") ?? "";
    const [from, to] = ref.split(":");
    if (!from || !to) return [];
    const a = cellAddress(from);
    const b = cellAddress(to);
    return [{ row: a.row, col: a.col, rows: b.row - a.row + 1, cols: b.col - a.col + 1 }];
  });

  const frozen = doc.querySelector("pane");
  return {
    name,
    rows: [...rows].map((r) => r ?? { cells: [] }),
    columns,
    widths,
    merges,
    frozenRows: Number(frozen?.getAttribute("ySplit") ?? 0) || 0,
    frozenColumns: Number(frozen?.getAttribute("xSplit") ?? 0) || 0,
  };
}

/** A comma-separated file as one sheet, quotes and embedded commas respected. */
export function readCsv(text_: string, name = "Sheet"): SheetGrid {
  const rows: SheetGrid["rows"] = [];
  let cells: (SheetCell | undefined)[] = [];
  let value = "";
  let quoted = false;
  let columns = 0;
  const endCell = () => {
    cells.push({ value: value.trim(), numeric: value.trim() !== "" && !isNaN(Number(value)) });
    value = "";
  };
  const endRow = () => {
    endCell();
    columns = Math.max(columns, cells.length);
    rows.push({ cells });
    cells = [];
  };
  for (let i = 0; i < text_.length; i++) {
    const ch = text_[i]!;
    if (quoted) {
      if (ch === '"' && text_[i + 1] === '"') {
        value += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else value += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") endCell();
    else if (ch === "\n") endRow();
    else if (ch !== "\r") value += ch;
  }
  if (value || cells.length) endRow();
  return { name, rows, columns, widths: [], merges: [], frozenRows: 0, frozenColumns: 0 };
}

/** Read an .xlsx into the sheets a preview can draw. */
export async function readWorkbook(bytes: ArrayBuffer): Promise<SheetDoc> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(bytes);
  const read = async (path: string) => {
    const file = zip.file(path);
    return file ? await file.async("string") : null;
  };
  const workbook = await read("xl/workbook.xml");
  if (!workbook) throw new Error("This file is not a workbook.");
  const rels = parse((await read("xl/_rels/workbook.xml.rels")) ?? "<r/>");
  const target = new Map<string, string>();
  for (const rel of rels.getElementsByTagName("Relationship"))
    target.set(rel.getAttribute("Id") ?? "", (rel.getAttribute("Target") ?? "").replace(/^\//, ""));

  const formats = readFormats(await read("xl/styles.xml"));
  const shared = readSharedStrings(await read("xl/sharedStrings.xml"));

  const sheets: SheetGrid[] = [];
  for (const sheet of parse(workbook).getElementsByTagName("sheet")) {
    if (sheet.getAttribute("state") === "hidden") continue;
    const id =
      sheet.getAttributeNS(
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
        "id",
      ) ??
      sheet.getAttribute("r:id") ??
      "";
    const path = target.get(id);
    const xml = path ? await read(path.startsWith("xl/") ? path : `xl/${path}`) : null;
    if (!xml) continue;
    sheets.push(readGrid(xml, shared, formats, sheet.getAttribute("name") ?? "Sheet"));
  }
  if (!sheets.length) throw new Error("This workbook has no sheets to show.");
  return { sheets };
}
