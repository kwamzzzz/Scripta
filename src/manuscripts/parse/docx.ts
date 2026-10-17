/**
 * A Word manuscript read into blocks, then shaped by `assemble`.
 *
 * Like the redline reader in `lib/deviations/revisions.ts`, this walks the
 * XML with that module's scanner rather than `DOMParser`, so it runs the same
 * in the browser and under vitest (a node environment). The scanner's events
 * are built into a small element tree once, which is linear in the size of
 * the part, and everything after that is a walk of the tree.
 *
 * Tracked changes are read as if accepted: inserted text is kept, deleted
 * text is dropped. Field codes are skipped and field results kept, so a
 * cross-reference reads as "Table 6.2", not as `REF _Ref123 \h`.
 */
import JSZip from "jszip";
import { scan } from "@/lib/deviations/revisions";
import { labelParagraphs, readNumbering } from "@/lib/deviations/numbering";
import type { ParsedManuscript } from "../model";
import {
  assemble,
  captionParts,
  CAPTION,
  leadingNumber,
  type Block,
  type NoteDraft,
} from "./structure";

/* -------------------------------------------------------------- xml tree -- */

type El = { name: string; attrs: Record<string, string>; kids: (El | string)[] };

/** Text worth keeping: only these elements carry document text. */
const TEXT_HOLDERS = new Set(["w:t", "m:t", "w:instrText", "w:delText"]);

export function xmlTree(xml: string): El {
  const root: El = { name: "#root", attrs: {}, kids: [] };
  const stack: El[] = [root];
  for (const token of scan(xml)) {
    const top = stack[stack.length - 1]!;
    if (token.kind === "open") {
      const el: El = { name: token.name, attrs: token.attrs, kids: [] };
      top.kids.push(el);
      if (!token.selfClosing) stack.push(el);
    } else if (token.kind === "close") {
      // Well-formed input closes the top; anything else is tolerated by
      // unwinding to the matching element.
      for (let i = stack.length - 1; i > 0; i--)
        if (stack[i]!.name === token.name) {
          stack.length = i;
          break;
        }
    } else if (TEXT_HOLDERS.has(top.name)) top.kids.push(token.text);
  }
  return root;
}

const elements = (el: El) => el.kids.filter((k): k is El => typeof k !== "string");
const child = (el: El | undefined, name: string): El | undefined =>
  el?.kids.find((k): k is El => typeof k !== "string" && k.name === name);
const val = (el: El | undefined, name = "w:val") => el?.attrs[name];
const textOf = (el: El) => el.kids.filter((k): k is string => typeof k === "string").join("");

function find(el: El, name: string): El | undefined {
  for (const k of el.kids) {
    if (typeof k === "string") continue;
    if (k.name === name) return k;
    const hit = find(k, name);
    if (hit) return hit;
  }
  return undefined;
}

/* ---------------------------------------------------------------- styles -- */

type Style = {
  name: string;
  outline: number | null;
  numbered: boolean;
  left: number;
  right: number;
  hanging: number;
};

type RawStyle = {
  name: string;
  basedOn?: string | undefined;
  outline?: number | undefined;
  numbered?: boolean | undefined;
  left?: number | undefined;
  right?: number | undefined;
  hanging?: number | undefined;
};

type Indent = { left?: number; right?: number; hanging?: number };

function readIndent(pPr: El | undefined): Indent {
  const ind = child(pPr, "w:ind");
  if (!ind) return {};
  const num = (...names: string[]) => {
    for (const n of names) {
      const v = ind.attrs[n];
      if (v !== undefined && v !== "") return Number(v) || 0;
    }
    return undefined;
  };
  const out: Indent = {};
  const left = num("w:left", "w:start");
  const right = num("w:right", "w:end");
  const hanging = num("w:hanging");
  if (left !== undefined) out.left = left;
  if (right !== undefined) out.right = right;
  if (hanging !== undefined) out.hanging = hanging;
  return out;
}

function readStyles(xml: string): { styles: Map<string, Style>; defaultId: string | null } {
  const raw = new Map<string, RawStyle>();
  let defaultId: string | null = null;
  if (xml) {
    const root = find(xmlTree(xml), "w:styles");
    for (const s of root ? elements(root) : []) {
      if (s.name !== "w:style" || (s.attrs["w:type"] ?? "paragraph") !== "paragraph") continue;
      const id = s.attrs["w:styleId"];
      if (!id) continue;
      if (s.attrs["w:default"] === "1" || s.attrs["w:default"] === "true") defaultId = id;
      const pPr = child(s, "w:pPr");
      const outline = val(child(pPr, "w:outlineLvl"));
      const ind = readIndent(pPr);
      raw.set(id, {
        name: val(child(s, "w:name")) ?? id,
        basedOn: val(child(s, "w:basedOn")),
        outline: outline !== undefined ? Number(outline) : undefined,
        numbered: child(pPr, "w:numPr") ? true : undefined,
        left: ind.left,
        right: ind.right,
        hanging: ind.hanging,
      });
    }
  }
  const resolved = new Map<string, Style>();
  const resolve = (id: string, seen: Set<string>): Style | undefined => {
    const done = resolved.get(id);
    if (done) return done;
    const r = raw.get(id);
    if (!r || seen.has(id)) return undefined;
    seen.add(id);
    const base = r.basedOn ? resolve(r.basedOn, seen) : undefined;
    const style: Style = {
      name: r.name,
      outline: r.outline ?? base?.outline ?? null,
      numbered: r.numbered ?? base?.numbered ?? false,
      left: r.left ?? base?.left ?? 0,
      right: r.right ?? base?.right ?? 0,
      hanging: r.hanging ?? base?.hanging ?? 0,
    };
    resolved.set(id, style);
    return style;
  };
  for (const id of raw.keys()) resolve(id, new Set());
  return { styles: resolved, defaultId };
}

/* ------------------------------------------------------------ inline text -- */

/** Greek and mathematical signs from the Symbol font, which Word writes as w:sym. */
const SYMBOL_FONT: Record<number, string> = {
  0x61: "α",
  0x62: "β",
  0x63: "χ",
  0x64: "δ",
  0x65: "ε",
  0x66: "φ",
  0x67: "γ",
  0x68: "η",
  0x69: "ι",
  0x6b: "κ",
  0x6c: "λ",
  0x6d: "μ",
  0x6e: "ν",
  0x6f: "ο",
  0x70: "π",
  0x71: "θ",
  0x72: "ρ",
  0x73: "σ",
  0x74: "τ",
  0x75: "υ",
  0x77: "ω",
  0x78: "ξ",
  0x79: "ψ",
  0x7a: "ζ",
  0x44: "Δ",
  0x46: "Φ",
  0x47: "Γ",
  0x4c: "Λ",
  0x50: "Π",
  0x51: "Θ",
  0x53: "Σ",
  0x57: "Ω",
  0x58: "Ξ",
  0x59: "Ψ",
  0xa3: "≤",
  0xb3: "≥",
  0xb1: "±",
  0xb4: "×",
  0xb8: "÷",
  0xb9: "≠",
  0xbb: "≈",
  0xae: "→",
  0xac: "←",
  0xb7: "•",
  0xb0: "°",
  0xa5: "∞",
  0xb6: "∂",
  0xe5: "∑",
  0xd6: "√",
  0xc6: "∅",
  0xce: "∈",
  0xde: "⇒",
  0xdb: "⇔",
  0xa2: "′",
  0xb2: "″",
  0x2d: "−",
};

export function symbolChar(font: string, hex: string): string {
  let code = parseInt(hex, 16);
  if (!Number.isFinite(code)) return "";
  // Symbol fonts are addressed in the private-use block F000–F0FF.
  if (code >= 0xf000 && code <= 0xf0ff) code -= 0xf000;
  if (/^symbol$/i.test(font))
    return SYMBOL_FONT[code] ?? (code >= 0x20 && code < 0x7f ? String.fromCharCode(code) : "");
  // Wingdings and friends are pictures, not words.
  if (/wingdings|webdings/i.test(font)) return "";
  return code >= 0x20 ? String.fromCodePoint(code) : "";
}

type Field = { instr: string; result: boolean; toc: boolean };

/** State that runs across paragraphs: fields span them, note numbers count through the book. */
type Walk = {
  fields: Field[];
  tracked: boolean;
  tocSdt: number;
  noteNumber: { footnote: Map<string, string>; endnote: Map<string, string> };
};

type Inline = {
  parts: string[];
  plain: string[];
  tocChars: number;
  bodyChars: number;
  drawing: boolean;
  alt: string[];
  math: boolean;
  refs: { kind: "footnote" | "endnote"; id: string }[];
};

const newInline = (): Inline => ({
  parts: [],
  plain: [],
  tocChars: 0,
  bodyChars: 0,
  drawing: false,
  alt: [],
  math: false,
  refs: [],
});

/** Elements whose contents are never document text. */
const SKIP = new Set([
  "w:pPr",
  "w:rPr",
  "w:sdtPr",
  "w:sdtEndPr",
  "w:instrText",
  "w:delText",
  "w:fldData",
  "w:footnoteRef",
  "w:endnoteRef",
  "w:annotationRef",
  "w:commentReference",
  "w:pPrChange",
  "w:rPrChange",
  "m:oMathParaPr",
  "m:rPr",
  "m:ctrlPr",
]);

function emit(text: string, into: Inline, walk: Walk, math: boolean) {
  if (!text) return;
  // Inside a field's instruction part: not text the reader sees.
  for (const f of walk.fields) if (!f.result) return;
  into.parts.push(text);
  if (!math) into.plain.push(text);
  if (walk.tocSdt > 0 || walk.fields.some((f) => f.toc)) into.tocChars += text.length;
  else into.bodyChars += text.length;
}

function walkInline(el: El, into: Inline, walk: Walk, math = false) {
  for (const k of el.kids) {
    if (typeof k === "string") continue;
    const name = k.name;
    if (SKIP.has(name)) continue;
    switch (name) {
      case "w:t":
        emit(textOf(k), into, walk, math);
        break;
      case "m:t":
        emit(textOf(k), into, walk, true);
        break;
      case "w:tab":
      case "w:ptab":
        emit("\t", into, walk, math);
        break;
      case "w:br":
      case "w:cr":
        emit(" ", into, walk, math);
        break;
      case "w:noBreakHyphen":
        emit("-", into, walk, math);
        break;
      case "w:sym":
        emit(symbolChar(k.attrs["w:font"] ?? "", k.attrs["w:char"] ?? ""), into, walk, math);
        break;
      case "w:fldChar": {
        const type = k.attrs["w:fldCharType"];
        if (type === "begin") walk.fields.push({ instr: "", result: false, toc: false });
        else if (type === "separate") {
          const f = walk.fields[walk.fields.length - 1];
          if (f) {
            f.result = true;
            f.toc = /^\s*TOC\b/.test(f.instr);
          }
        } else if (type === "end") walk.fields.pop();
        break;
      }
      case "w:del":
      case "w:moveFrom":
        walk.tracked = true;
        break;
      case "w:ins":
      case "w:moveTo":
        walk.tracked = true;
        walkInline(k, into, walk, math);
        break;
      case "w:r": {
        // The instruction of the innermost open field is collected here, so
        // the TOC field is recognised when its result begins.
        const f = walk.fields[walk.fields.length - 1];
        if (f && !f.result)
          for (const part of elements(k)) if (part.name === "w:instrText") f.instr += textOf(part);
        walkInline(k, into, walk, math);
        break;
      }
      case "w:footnoteReference":
      case "w:endnoteReference": {
        const id = k.attrs["w:id"];
        if (id)
          into.refs.push({ kind: name === "w:footnoteReference" ? "footnote" : "endnote", id });
        break;
      }
      case "w:drawing": {
        into.drawing = true;
        const docPr = find(k, "wp:docPr");
        const alt = docPr?.attrs["descr"] || docPr?.attrs["title"];
        if (alt) into.alt.push(alt);
        break;
      }
      case "w:pict":
      case "w:object": {
        const ole = find(k, "o:OLEObject");
        if (ole && /^Equation/i.test(ole.attrs["ProgID"] ?? "")) into.math = true;
        else {
          into.drawing = true;
          const shape = find(k, "v:shape");
          const alt = shape?.attrs["alt"];
          if (alt) into.alt.push(alt);
        }
        break;
      }
      case "m:oMath":
      case "m:oMathPara":
        into.math = true;
        walkInline(k, into, walk, true);
        break;
      case "mc:AlternateContent": {
        const choice = child(k, "mc:Choice");
        if (choice) walkInline(choice, into, walk, math);
        break;
      }
      case "w:fldSimple":
        // Its runs are the field's result.
        walkInline(k, into, walk, math);
        break;
      default:
        if (k.kids.length) walkInline(k, into, walk, math);
    }
  }
}

/* ------------------------------------------------------------ paragraphs -- */

type Para = {
  source: number;
  styleId: string | null;
  numId: string | null;
  ilvl: number | null;
  outline: number | null;
  indent: Indent;
  inline: Inline;
  /** The paragraph mark was struck: accepted, this paragraph runs into the next. */
  markDeleted: boolean;
};

type Item = { type: "p"; para: Para } | { type: "tbl"; rows: Para[][][]; source: number };

type Collected = { items: Item[]; paras: Para[] };

function readPara(p: El, walk: Walk, collected: Collected): Para {
  const pPr = child(p, "w:pPr");
  const numPr = child(pPr, "w:numPr");
  const numId = val(child(numPr, "w:numId")) ?? null;
  const ilvl = val(child(numPr, "w:ilvl"));
  const outline = val(child(pPr, "w:outlineLvl"));
  const markDel = child(child(pPr, "w:rPr"), "w:del");
  if (markDel || child(child(pPr, "w:rPr"), "w:ins")) walk.tracked = true;
  const inline = newInline();
  walkInline(p, inline, walk);
  const para: Para = {
    source: collected.paras.length + 1,
    styleId: val(child(pPr, "w:pStyle")) ?? null,
    numId: numId && numId !== "0" ? numId : null,
    ilvl: ilvl !== undefined ? Number(ilvl) : null,
    outline: outline !== undefined ? Number(outline) : null,
    indent: readIndent(pPr),
    inline,
    markDeleted: !!markDel,
  };
  collected.paras.push(para);
  return para;
}

/** Paragraphs and tables in the order they appear, looking through content controls. */
function walkBlocks(container: El, walk: Walk, collected: Collected, out: Item[]) {
  let carry: Para | null = null;
  for (const k of elements(container)) {
    if (k.name === "w:p") {
      const para = readPara(k, walk, collected);
      if (carry) {
        // Accepting a deleted paragraph mark joins this paragraph to the one before.
        para.inline.parts.unshift(...carry.inline.parts);
        para.inline.plain.unshift(...carry.inline.plain);
        para.inline.refs.unshift(...carry.inline.refs);
        para.inline.bodyChars += carry.inline.bodyChars;
        para.inline.tocChars += carry.inline.tocChars;
        para.source = carry.source;
        carry = null;
      }
      if (para.markDeleted) carry = para;
      else out.push({ type: "p", para });
    } else if (k.name === "w:tbl") {
      if (carry) out.push({ type: "p", para: carry });
      carry = null;
      out.push(readTable(k, walk, collected));
    } else if (k.name === "w:sdt") {
      if (carry) out.push({ type: "p", para: carry });
      carry = null;
      const sdtPr = child(k, "w:sdtPr");
      const gallery = sdtPr ? val(find(sdtPr, "w:docPartGallery")) : undefined;
      const toc = !!gallery && /table of contents/i.test(gallery);
      const content = child(k, "w:sdtContent");
      if (toc) walk.tocSdt += 1;
      if (content) walkBlocks(content, walk, collected, out);
      if (toc) walk.tocSdt -= 1;
    } else if (k.name === "w:customXml" || k.name === "w:ins" || k.name === "w:moveTo") {
      if (k.name !== "w:customXml") walk.tracked = true;
      walkBlocks(k, walk, collected, out);
    } else if (k.name === "w:del" || k.name === "w:moveFrom") walk.tracked = true;
  }
  if (carry) out.push({ type: "p", para: carry });
}

function readTable(tbl: El, walk: Walk, collected: Collected): Item {
  const source = collected.paras.length + 1;
  const rows: Para[][][] = [];
  const rowsOf = (el: El): El[] =>
    elements(el).flatMap((k) =>
      k.name === "w:tr"
        ? [k]
        : k.name === "w:sdt" || k.name === "w:customXml"
          ? rowsOf(child(k, "w:sdtContent") ?? k)
          : [],
    );
  for (const tr of rowsOf(tbl)) {
    const row: Para[][] = [];
    const cellsOf = (el: El): El[] =>
      elements(el).flatMap((k) =>
        k.name === "w:tc"
          ? [k]
          : k.name === "w:sdt" || k.name === "w:customXml"
            ? cellsOf(child(k, "w:sdtContent") ?? k)
            : [],
      );
    for (const tc of cellsOf(tr)) {
      const items: Item[] = [];
      walkBlocks(tc, walk, collected, items);
      // A table nested in a cell is read into the cell's text.
      row.push(items.flatMap((it) => (it.type === "p" ? [it.para] : it.rows.flat(2))));
    }
    rows.push(row);
  }
  return { type: "tbl", rows, source };
}

/* ---------------------------------------------------------------- blocks -- */

const squash = (s: string) => s.replace(/[ \t\r\n]+/g, " ").trim();

const QUOTE_STYLE =
  /^(?:quote|intense quote|block text|quotation|block quote|blockquote|extract)$/i;
const TOC_STYLE = /^(?:toc\s*(\d)|table of figures)$/i;
const HEADING_STYLE = /^heading\s*([1-9])$/i;

/** "Introduction\t5" or "Introduction ........ 5" → "Introduction". */
function stripPageNumber(raw: string): string {
  const cut = raw.replace(/(?:\t|\s*\.{2,}|\s*…+)[\s.…]*(\d+|[ivxlcdm]+)\s*$/i, "");
  return squash(cut === raw ? raw.replace(/\s+\d+\s*$/, "") : cut);
}

type Context = {
  styles: Map<string, Style>;
  defaultId: string | null;
  labels: (string | null)[];
  notes: {
    footnote: Map<string, string>;
    endnote: Map<string, string>;
  };
  walk: Walk;
};

function markerFor(ctx: Context, ref: { kind: "footnote" | "endnote"; id: string }): string {
  const map = ctx.walk.noteNumber[ref.kind];
  let marker = map.get(ref.id);
  if (!marker) {
    marker = String(map.size + 1);
    map.set(ref.id, marker);
  }
  return marker;
}

function notesOf(ctx: Context, refs: Inline["refs"]): { noteRefs: string[]; notes: NoteDraft[] } {
  const noteRefs: string[] = [];
  const notes: NoteDraft[] = [];
  for (const ref of refs) {
    const marker = markerFor(ctx, ref);
    noteRefs.push(marker);
    notes.push({ kind: ref.kind, marker, text: ctx.notes[ref.kind].get(ref.id) ?? "" });
  }
  return { noteRefs, notes };
}

function paraBlocks(p: Para, ctx: Context): Block[] {
  const style = ctx.styles.get(p.styleId ?? ctx.defaultId ?? "") ?? null;
  const styleName = style?.name ?? p.styleId ?? "";
  const raw = p.inline.parts.join("");
  const text = squash(raw);
  const plain = squash(p.inline.plain.join(""));
  const { noteRefs, notes } = notesOf(ctx, p.inline.refs);
  const base = {
    number: "",
    label: "",
    level: 0,
    source: p.source,
    ...(styleName ? { style: styleName } : {}),
    ...(noteRefs.length ? { noteRefs, notes } : {}),
  };

  if (!text && !p.inline.drawing && !p.inline.math) return [];

  const outline = p.outline ?? style?.outline ?? null;
  const headingMatch = HEADING_STYLE.exec(styleName);
  const headingLevel = headingMatch
    ? Number(headingMatch[1])
    : outline !== null && outline >= 0 && outline < 9
      ? outline + 1
      : null;
  const tocMatch = TOC_STYLE.exec(styleName);
  const label = ctx.labels[p.source - 1] ?? "";

  if (/^toc heading$/i.test(styleName))
    return [{ ...base, role: "heading", level: 1, text, label: text, front: true }];
  if (tocMatch || (p.inline.tocChars > p.inline.bodyChars && !headingLevel)) {
    const entry = stripPageNumber(raw);
    if (!entry) return [];
    return [
      {
        ...base,
        role: "toc_entry",
        level: tocMatch?.[1] ? Number(tocMatch[1]) : 1,
        text: entry,
        label: entry,
        number: leadingNumber(entry),
      },
    ];
  }
  if (/^title$/i.test(styleName)) return [{ ...base, role: "title", text, label: text }];
  if (headingLevel && text)
    return [{ ...base, role: "heading", level: headingLevel, text, label: text, number: label }];

  const caption = captionParts(text);
  if (/caption/i.test(styleName) && text)
    return [
      {
        ...base,
        role: "caption",
        text,
        number: caption?.number ?? "",
        label: caption?.label ?? text,
      },
    ];

  if (p.inline.math && (!plain || /^\(?\d+(?:\.\d+)*\)?$/.test(plain))) {
    const eq = /^\(?(\d+(?:\.\d+)*)\)?$/.exec(plain)?.[1] ?? "";
    return [{ ...base, role: "equation", text, number: eq }];
  }

  if (p.inline.drawing) {
    const figure: Block = { ...base, role: "figure", text: p.inline.alt.join(" ") };
    if (!text) return [figure];
    if (caption) {
      // A picture and its caption in one paragraph: two atoms.
      const { noteRefs: _r, notes: _n, ...bare } = figure;
      return [
        bare,
        { ...base, role: "caption", text, number: caption.number, label: caption.label },
      ];
    }
  }

  const left = p.indent.left ?? style?.left ?? 0;
  const right = p.indent.right ?? style?.right ?? 0;
  const hanging = p.indent.hanging ?? style?.hanging ?? 0;
  const listed = !!p.numId || !!style?.numbered || /^list/i.test(styleName);
  if (
    QUOTE_STYLE.test(styleName) ||
    (!listed && ((left >= 567 && right >= 567) || (left >= 1134 && !hanging)))
  )
    return [{ ...base, role: "quote", text }];
  if (listed)
    return [
      { ...base, role: "list_item", text, number: /[\p{L}\p{N}]/u.test(label) ? label.trim() : "" },
    ];
  return [{ ...base, role: "paragraph", text }];
}

function tableBlock(item: Extract<Item, { type: "tbl" }>, ctx: Context): Block {
  const refs: Inline["refs"] = [];
  const rows = item.rows.map((row) =>
    row.map((cell) => {
      for (const p of cell) refs.push(...p.inline.refs);
      return cell
        .map((p) => squash(p.inline.parts.join("")))
        .filter(Boolean)
        .join(" ");
    }),
  );
  const { noteRefs, notes } = notesOf(ctx, refs);
  return {
    role: "table",
    level: 0,
    number: "",
    label: "",
    text: rows.map((r) => r.join(" | ")).join("\n"),
    rows,
    source: item.source,
    ...(noteRefs.length ? { noteRefs, notes } : {}),
  };
}

/* ----------------------------------------------------------------- notes -- */

function readNotes(xml: string, tag: "w:footnote" | "w:endnote", walk: Walk): Map<string, string> {
  const out = new Map<string, string>();
  if (!xml) return out;
  const root = find(xmlTree(xml), tag === "w:footnote" ? "w:footnotes" : "w:endnotes");
  for (const note of root ? elements(root) : []) {
    if (note.name !== tag) continue;
    const type = note.attrs["w:type"];
    if (type && type !== "normal") continue; // separators
    const id = note.attrs["w:id"];
    if (!id) continue;
    const noteWalk: Walk = { ...walk, fields: [], tocSdt: 0 };
    const texts: string[] = [];
    for (const p of elements(note)) {
      if (p.name !== "w:p") continue;
      const inline = newInline();
      walkInline(p, inline, noteWalk);
      const t = squash(inline.parts.join(""));
      if (t) texts.push(t);
    }
    if (noteWalk.tracked) walk.tracked = true;
    out.set(id, texts.join(" "));
  }
  return out;
}

/* ------------------------------------------------------------------ main -- */

const stem = (fileName: string) => fileName.replace(/\.[^.]+$/, "");

export async function parseDocx(data: ArrayBuffer, fileName: string): Promise<ParsedManuscript> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new Error(
      `${fileName} could not be opened as a Word document. It may be damaged, or not really a .docx.`,
    );
  }
  const part = async (path: string) => (await zip.file(path)?.async("string")) ?? "";
  const documentXml = await part("word/document.xml");
  if (!documentXml)
    throw new Error(`${fileName} has no document body, so it cannot be read as a Word manuscript.`);
  const [stylesXml, numberingXml, footnotesXml, endnotesXml, coreXml] = await Promise.all([
    part("word/styles.xml"),
    part("word/numbering.xml"),
    part("word/footnotes.xml"),
    part("word/endnotes.xml"),
    part("docProps/core.xml"),
  ]);
  return docxToManuscript(
    { documentXml, stylesXml, numberingXml, footnotesXml, endnotesXml, coreXml },
    fileName,
  );
}

export function docxToManuscript(
  parts: {
    documentXml: string;
    stylesXml?: string;
    numberingXml?: string;
    footnotesXml?: string;
    endnotesXml?: string;
    coreXml?: string;
  },
  fileName: string,
): ParsedManuscript {
  const { styles, defaultId } = readStyles(parts.stylesXml ?? "");
  const walk: Walk = {
    fields: [],
    tracked: false,
    tocSdt: 0,
    noteNumber: { footnote: new Map(), endnote: new Map() },
  };
  const notes = {
    footnote: readNotes(parts.footnotesXml ?? "", "w:footnote", walk),
    endnote: readNotes(parts.endnotesXml ?? "", "w:endnote", walk),
  };

  const tree = xmlTree(parts.documentXml);
  const body = find(tree, "w:body");
  const collected: Collected = { items: [], paras: [] };
  if (body) walkBlocks(body, walk, collected, collected.items);

  let labels: (string | null)[] = [];
  if (parts.numberingXml) {
    try {
      labels = labelParagraphs(
        collected.paras.map((p) => ({ style: p.styleId, numId: p.numId, ilvl: p.ilvl })),
        readNumbering(parts.numberingXml, parts.stylesXml ?? ""),
      );
    } catch {
      labels = [];
    }
  }

  const ctx: Context = { styles, defaultId, labels, notes, walk };
  const blocks: Block[] = [];
  for (const item of collected.items)
    if (item.type === "p") blocks.push(...paraBlocks(item.para, ctx));
    else blocks.push(tableBlock(item, ctx));

  // A "Table 3: …" or "Figure 2 …" line right next to a table or picture is its caption.
  blocks.forEach((b, i) => {
    if (b.role !== "paragraph" || !CAPTION.test(b.text)) return;
    const near = (x: Block | undefined) => x?.role === "table" || x?.role === "figure";
    if (!near(blocks[i - 1]) && !near(blocks[i + 1])) return;
    const c = captionParts(b.text)!;
    b.role = "caption";
    b.number = c.number;
    b.label = c.label;
  });

  const { nodes, warnings } = assemble(blocks);
  if (walk.tracked)
    warnings.unshift(
      "Tracked changes were present; the review reads the document as if they were accepted.",
    );

  const coreTitle = /<dc:title>([^<]*)<\/dc:title>/.exec(parts.coreXml ?? "")?.[1]?.trim();
  const titleBlock = blocks.find((b) => b.role === "title");
  const title = (coreTitle && decode(coreTitle)) || titleBlock?.text || stem(fileName);

  return { title, format: "docx", nodes, warnings };
}

const decode = (s: string) =>
  s.replace(
    /&(amp|lt|gt|quot|apos);/g,
    (_, e: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" })[e] ?? "",
  );
