/**
 * A firm's letterhead as a Word template, read for what the exporters need.
 *
 * The templates firms keep are Word files: page one is the paper's design —
 * a full-page picture, a logo, an address block — drawn in the document body
 * and followed by a page break, and the pages after it take their smaller
 * mark from the default header and footer. This module reads that structure
 * once, in a form both exporters can use: the Word export splices the parts
 * themselves into the document it builds, so Word shows the paper exactly as
 * the firm drew it; the PDF and the editor draw a picture of the same parts.
 *
 * Only what the paper needs is read: page geometry, the page-one body, the
 * header and footer parts for the first and following pages, and the media
 * those parts refer to. Styles, numbering and the rest of the template stay
 * behind — a document exported on this paper keeps the firm's house style,
 * not the template's.
 */
import JSZip from "jszip";

export type TemplatePage = {
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
  /** Distance of the header and footer from the page edge. */
  header: number;
  footer: number;
};

export type TemplateMedia = {
  /** The part name inside the template, e.g. media/image1.jpg. */
  target: string;
  mime: string;
  bytes: Uint8Array;
};

export type TemplatePart = {
  /** The part's XML, complete with its root element and namespaces. */
  xml: string;
  /** Relationship id to media target, for every image the part refers to. */
  media: Record<string, string>;
};

export type DocxTemplate = {
  page: TemplatePage;
  /** Namespace declarations on the template's document root, e.g. xmlns:wp="…". */
  namespaces: Record<string, string>;
  ignorable: string;
  /** Whether the template gives page one its own header and footer. */
  titlePage: boolean;
  /** The body content that draws page one: paragraphs up to the first page break. */
  firstPageBody: string;
  firstPageMedia: Record<string, string>;
  first: { header?: TemplatePart | undefined; footer?: TemplatePart | undefined };
  default: { header?: TemplatePart | undefined; footer?: TemplatePart | undefined };
  media: TemplateMedia[];
};

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
  emf: "image/x-emf",
  wmf: "image/x-wmf",
  svg: "image/svg+xml",
};

export const mediaMime = (target: string) =>
  MIME_BY_EXT[target.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";

const attr = (xml: string, name: string): string | undefined =>
  new RegExp(`${name}="([^"]*)"`).exec(xml)?.[1];

/** Relationship id → target, for a part's .rels file. */
const readRels = (xml: string | undefined): { id: string; type: string; target: string }[] => {
  if (!xml) return [];
  return [...xml.matchAll(/<Relationship\b[^>]*>/g)].map((m) => ({
    id: attr(m[0], "Id") ?? "",
    type: (attr(m[0], "Type") ?? "").split("/").pop() ?? "",
    target: attr(m[0], "Target") ?? "",
  }));
};

/** Every relationship id a piece of WordprocessingML refers to. */
export const relIdsIn = (xml: string): string[] => [
  ...new Set([...xml.matchAll(/\b(?:r:embed|r:id|r:link|o:relid)="([^"]+)"/g)].map((m) => m[1]!)),
];

/** Resolve a part-relative target like media/image1.png against word/. */
const resolve = (target: string) =>
  target.startsWith("/") ? target.slice(1) : `word/${target.replace(/^\.\//, "")}`;

export async function readDocxTemplate(bytes: Uint8Array): Promise<DocxTemplate> {
  const zip = await JSZip.loadAsync(bytes);
  const text = async (path: string) => zip.file(path)?.async("string");
  const document = await text("word/document.xml");
  if (!document) throw new Error("This is not a Word document.");

  const root = /<w:document\b[^>]*>/.exec(document)?.[0] ?? "";
  const namespaces: Record<string, string> = {};
  for (const m of root.matchAll(/xmlns:([\w-]+)="([^"]*)"/g)) namespaces[m[1]!] = m[2]!;
  const ignorable = attr(root, "mc:Ignorable") ?? "";

  const sectPrs = [...document.matchAll(/<w:sectPr\b[^>]*>[\s\S]*?<\/w:sectPr>/g)];
  const sectPr = sectPrs[sectPrs.length - 1]?.[0] ?? "";
  const num = (xml: string, name: string, fallback: number) => {
    const v = attr(xml, name);
    return v === undefined ? fallback : Number(v);
  };
  const pgSz = /<w:pgSz\b[^>]*\/>/.exec(sectPr)?.[0] ?? "";
  const pgMar = /<w:pgMar\b[^>]*\/>/.exec(sectPr)?.[0] ?? "";
  const page: TemplatePage = {
    width: num(pgSz, "w:w", 11906),
    height: num(pgSz, "w:h", 16838),
    top: num(pgMar, "w:top", 1440),
    right: num(pgMar, "w:right", 1440),
    bottom: num(pgMar, "w:bottom", 1440),
    left: num(pgMar, "w:left", 1440),
    header: num(pgMar, "w:header", 708),
    footer: num(pgMar, "w:footer", 708),
  };
  const titlePage = /<w:titlePg\b/.test(sectPr);

  const docRels = readRels(await text("word/_rels/document.xml.rels"));
  const relTarget = new Map(docRels.map((r) => [r.id, r.target]));

  // Page one: the body up to and including the first page break, with the
  // break itself removed — the exporter decides where its own page two starts.
  const bodyStart = document.indexOf("<w:body>") + "<w:body>".length;
  const bodyEnd = sectPrs.length
    ? document.lastIndexOf("<w:sectPr")
    : document.indexOf("</w:body>");
  let body = document.slice(bodyStart, bodyEnd);
  const blocks = [
    ...body.matchAll(/<w:p\b[^>]*\/>|<w:p\b[^>]*>[\s\S]*?<\/w:p>|<w:tbl\b[\s\S]*?<\/w:tbl>/g),
  ];
  const breakAt = blocks.findIndex((b) => /<w:br\b[^>]*w:type="page"/.test(b[0]));
  if (breakAt >= 0) {
    const upTo = blocks[breakAt]!;
    const last = upTo[0].replace(
      /<w:r\b[^>]*>(?:(?!<\/w:r>)[\s\S])*?<w:br\b[^>]*w:type="page"[^>]*\/>[\s\S]*?<\/w:r>/g,
      "",
    );
    body = body.slice(0, upTo.index!) + last;
  }
  const firstPageBody = artOnly(body.trim());

  const media: TemplateMedia[] = [];
  const seen = new Set<string>();
  const collect = async (ids: string[], rels: Map<string, string>) => {
    const out: Record<string, string> = {};
    for (const id of ids) {
      const target = rels.get(id);
      if (!target) continue;
      const path = resolve(target);
      const file = zip.file(path);
      if (!file) continue;
      out[id] = target;
      if (!seen.has(target)) {
        seen.add(target);
        media.push({ target, mime: mediaMime(target), bytes: await file.async("uint8array") });
      }
    }
    return out;
  };
  const firstPageMedia = await collect(relIdsIn(firstPageBody), relTarget);

  const part = async (type: "header" | "footer", which: "first" | "default") => {
    const ref = new RegExp(`<w:${type}Reference\\b[^>]*w:type="${which}"[^>]*/>`).exec(sectPr)?.[0];
    const id = ref ? attr(ref, "r:id") : undefined;
    const target = id ? relTarget.get(id) : undefined;
    if (!target) return undefined;
    const xml = await text(resolve(target));
    if (!xml) return undefined;
    const name = target.split("/").pop()!;
    const rels = new Map(
      readRels(await text(`word/_rels/${name}.rels`)).map((r) => [r.id, r.target]),
    );
    return { xml, media: await collect(relIdsIn(xml), rels) } satisfies TemplatePart;
  };

  return {
    page,
    namespaces,
    ignorable,
    titlePage,
    firstPageBody,
    firstPageMedia,
    first: { header: await part("header", "first"), footer: await part("footer", "first") },
    default: { header: await part("header", "default"), footer: await part("footer", "default") },
    media,
  };
}

/**
 * The elements of a piece of WordprocessingML at the outermost level, each
 * whole. A regular expression cannot find where a paragraph ends, because a
 * text box inside a drawing holds paragraphs of its own; counting opening and
 * closing tags can.
 */
const outermost = (xml: string, tag: "w:p" | "w:r" | "w:tbl"): { start: number; end: number }[] => {
  const pattern = new RegExp(`<(/?)${tag}(?=[\\s>/])[^>]*?(/?)>`, "g");
  const found: { start: number; end: number }[] = [];
  let depth = 0;
  let start = 0;
  for (const m of xml.matchAll(pattern)) {
    const closing = m[1] === "/";
    const empty = m[2] === "/";
    if (!closing && depth === 0) start = m.index!;
    if (empty) {
      if (depth === 0) found.push({ start, end: m.index! + m[0].length });
      continue;
    }
    depth += closing ? -1 : 1;
    if (closing && depth === 0) found.push({ start, end: m.index! + m[0].length });
  }
  return found;
};

const ART = /<w:drawing\b|<w:pict\b|<w:object\b/;

/**
 * Page one's art without its words.
 *
 * A firm's template is usually a document someone once wrote on: the
 * contract template's page one still names "SVG & Co as Seller" and a
 * "DESIGN AGREEMENT", and the letterhead carries a whole sample letter. All of
 * that went out on page one of every export, under the document's own title.
 * The paper is the logo and the background, so only runs that draw something
 * are kept. The paragraphs around them stay, emptied, because a picture
 * anchored to its paragraph is placed from where that paragraph falls; those
 * after the last picture place nothing and go. A table keeps only the
 * paragraphs that hold art, and a section break is dropped, since it would
 * point at parts of the template this document does not carry.
 */
export function artOnly(body: string): string {
  const paragraph = (xml: string): string => {
    const open = /^<w:p\b[^>]*?(\/?)>/.exec(xml)!;
    if (open[1] === "/") return "";
    const inner = xml.slice(open[0].length, xml.length - "</w:p>".length);
    const pPr = (/^\s*(<w:pPr\b[^>]*\/>|<w:pPr\b[^>]*>[\s\S]*?<\/w:pPr>)/.exec(inner)?.[1] ?? "")
      .replace(/<w:sectPr\b[^>]*\/>|<w:sectPr\b[^>]*>[\s\S]*?<\/w:sectPr>/g, "")
      .replace(/<w:pageBreakBefore\b[^>]*\/>/g, "");
    const art = outermost(inner, "w:r")
      .map(({ start, end }) => inner.slice(start, end))
      .filter((run) => ART.test(run))
      .join("");
    return `<w:p>${pPr}${art}</w:p>`;
  };
  const kept: { xml: string; art: boolean }[] = [];
  const blocks = [...outermost(body, "w:p"), ...outermost(body, "w:tbl")].sort(
    (a, b) => a.start - b.start,
  );
  for (const { start, end } of blocks) {
    const xml = body.slice(start, end);
    // A paragraph inside a table was found as part of the table, not alone.
    if (blocks.some((b) => b.start < start && b.end >= end)) continue;
    if (xml.startsWith("<w:tbl")) {
      for (const cell of outermost(xml, "w:p")) {
        const inner = xml.slice(cell.start, cell.end);
        if (ART.test(inner)) kept.push({ xml: paragraph(inner), art: true });
      }
      continue;
    }
    kept.push({ xml: paragraph(xml), art: ART.test(xml) });
  }
  const last = kept.map((k) => k.art).lastIndexOf(true);
  return kept
    .slice(0, last + 1)
    .map((k) => k.xml)
    .join("");
}

/**
 * The template's page-one design, sized to the exporter's page. A firm's
 * template is often US Letter while the house page is A4; a picture drawn to
 * fill the template's page is stretched to fill the new one, so it still
 * reaches every edge rather than leaving a white band at the foot.
 */
export function fitPageSizedDrawings(
  xml: string,
  from: { width: number; height: number },
  to: { width: number; height: number },
): string {
  const emu = (twips: number) => twips * 635;
  const near = (a: number, b: number) => Math.abs(a - b) / b < 0.06;
  const fromW = emu(from.width);
  const fromH = emu(from.height);
  return xml.replace(
    /(<(?:wp:extent|a:ext)\b[^>]*\bcx=")(\d+)("[^>]*\bcy=")(\d+)(")/g,
    (all, pre, cx, mid, cy, post) =>
      near(Number(cx), fromW) && near(Number(cy), fromH)
        ? `${pre}${emu(to.width)}${mid}${emu(to.height)}${post}`
        : all,
  );
}
