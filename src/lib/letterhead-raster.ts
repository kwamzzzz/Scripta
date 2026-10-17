/**
 * Pictures of the firm's paper, made in the browser at upload.
 *
 * The exporters need the paper as pictures: the PDF draws them behind its
 * pages, the editor draws them behind page one and page two, and the Word
 * export uses them when the paper did not come as a Word template. A PDF is
 * rendered page by page. A Word template cannot be rendered by a browser, so
 * a picture of it is composed from what the template reader found: the
 * page-one body's pictures and text, then the header and footer parts of the
 * following pages, each placed as Word would place it, near enough for a
 * preview and for the PDF. The Word export itself uses the template's own
 * parts, so nothing here reaches Word when the paper is a Word file.
 *
 * On the picture of the following pages, the artwork's reach is measured —
 * how far down the header comes, how far up the footer — so the body of the
 * document can keep clear of it.
 */
import type { DocxTemplate, TemplateMedia } from "@/lib/export/letterhead-template";
import { HOUSE_PAGE } from "@/lib/house-style";

export type PaperRasters = {
  first: Blob;
  continuation: Blob | null;
  width: number;
  height: number;
  /** Pixel rows of the continuation picture the header and footer artwork reach. */
  bodyTopPx: number | null;
  bodyBottomPx: number | null;
};

/** The house page at 150 dots to the inch. */
const DPI = 150;
const PAGE = HOUSE_PAGE.contract;
const twipsPx = (twips: number) => (twips / 1440) * DPI;
const emuPx = (emu: number) => (emu / 914_400) * DPI;
const PAGE_W = Math.round(twipsPx(PAGE.width));
const PAGE_H = Math.round(twipsPx(PAGE.height));

const blank = () => {
  const canvas = document.createElement("canvas");
  canvas.width = PAGE_W;
  canvas.height = PAGE_H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  return { canvas, ctx };
};

const toJpeg = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("The page could not be encoded."))),
      "image/jpeg",
      0.9,
    ),
  );

/**
 * How far the artwork reaches into the page from the top and the bottom, in
 * pixel rows, judged by any pixel that is not paper-white. Only the outer
 * thirds are searched: a mark in the middle of a continuation page is not a
 * header or footer, and the body is not pushed around it.
 */
export function measureArtwork(canvas: HTMLCanvasElement): {
  bodyTopPx: number | null;
  bodyBottomPx: number | null;
} {
  const ctx = canvas.getContext("2d")!;
  const { width, height } = canvas;
  const band = Math.floor(height / 3);
  const rowHasInk = (y: number) => {
    const row = ctx.getImageData(0, y, width, 1).data;
    for (let i = 0; i < row.length; i += 8)
      if (row[i]! < 235 || row[i + 1]! < 235 || row[i + 2]! < 235) return true;
    return false;
  };
  let top: number | null = null;
  for (let y = band; y >= 0; y -= 2)
    if (rowHasInk(y)) {
      top = y + 1;
      break;
    }
  let bottom: number | null = null;
  for (let y = height - band; y < height; y += 2)
    if (rowHasInk(y)) {
      bottom = height - y + 1;
      break;
    }
  return { bodyTopPx: top, bodyBottomPx: bottom };
}

/* -------------------------------------------------------------------- PDF */

export async function rasterisePdf(file: File): Promise<PaperRasters> {
  const pdfjs = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const render = async (n: number) => {
    const page = await doc.getPage(n);
    const natural = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: PAGE_W / natural.width });
    const sheet = document.createElement("canvas");
    sheet.width = Math.round(viewport.width);
    sheet.height = Math.round(viewport.height);
    await page.render({ canvas: sheet, canvasContext: sheet.getContext("2d")!, viewport }).promise;
    // A template drawn for another page size is stretched to the house page,
    // so a design that fills its page still fills this one.
    const { canvas, ctx } = blank();
    ctx.drawImage(sheet, 0, 0, PAGE_W, PAGE_H);
    return canvas;
  };
  const first = await render(1);
  const continuation = doc.numPages >= 2 ? await render(2) : null;
  const reach = continuation
    ? measureArtwork(continuation)
    : { bodyTopPx: null, bodyBottomPx: null };
  return {
    first: await toJpeg(first),
    continuation: continuation ? await toJpeg(continuation) : null,
    width: PAGE_W,
    height: PAGE_H,
    ...reach,
  };
}

/* ----------------------------------------------------------- Word template */

type Pictures = Map<string, HTMLImageElement>;

const loadPictures = async (media: TemplateMedia[]): Promise<Pictures> => {
  const out: Pictures = new Map();
  for (const m of media) {
    if (!/^image\/(png|jpeg|gif|bmp|svg\+xml)$/.test(m.mime)) continue;
    const url = URL.createObjectURL(new Blob([m.bytes as BlobPart], { type: m.mime }));
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      out.set(m.target, img);
    } catch {
      // A picture the browser cannot decode is left out of the preview.
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  return out;
};

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

const parse = (xml: string) => {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length)
    throw new Error("The template could not be read.");
  return doc;
};

type Draw = { behind: boolean; paint: () => void };

/**
 * Lay the block content of one part onto the page the way Word does, near
 * enough: paragraphs flow down from `top` inside the column; a picture
 * anchored to the page, the margin or the paragraph lands where its offsets
 * say; an inline picture sits in the flow; text is set in the run's size and
 * weight at the paragraph's alignment.
 */
function layoutPart(
  root: Element,
  ctx: CanvasRenderingContext2D,
  pictures: Pictures,
  media: Record<string, string>,
  frame: {
    left: number;
    top: number;
    width: number;
    pageTop: number;
    pageBottom: number;
    /** The template's own page, so a picture drawn to fill it is known. */
    templateW: number;
    templateH: number;
  },
  draws: Draw[],
  paint: boolean,
): number {
  let y = frame.top;
  const blocks = [...root.children].filter((el) => el.localName === "p" || el.localName === "tbl");
  const paragraphs = blocks.flatMap((b) =>
    b.localName === "p" ? [b] : [...b.getElementsByTagNameNS(W, "p")],
  );
  const val = (el: Element | null, name: string) =>
    el?.getAttributeNS(W, name) ?? el?.getAttribute(`w:${name}`);
  for (const p of paragraphs) {
    const pPr = p.getElementsByTagNameNS(W, "pPr")[0] ?? null;
    const spacing = pPr?.getElementsByTagNameNS(W, "spacing")[0] ?? null;
    const before = twipsPx(Number(val(spacing, "before") ?? 0));
    const after = twipsPx(Number(val(spacing, "after") ?? 0));
    const jc = val(pPr?.getElementsByTagNameNS(W, "jc")[0] ?? null, "val") ?? "left";
    const runs = [...p.getElementsByTagNameNS(W, "r")];
    const sizes = runs
      .map((r) => Number(val(r.getElementsByTagNameNS(W, "sz")[0] ?? null, "val") ?? 0))
      .filter(Boolean);
    const fontPt = (sizes.length ? Math.max(...sizes) : 22) / 2;
    const fontPx = (fontPt * DPI) / 72;
    const lineH = fontPx * 1.17;
    y += before;
    let height = lineH;
    const text = runs
      .map((r) => [...r.getElementsByTagNameNS(W, "t")].map((t) => t.textContent ?? "").join(""))
      .join("");
    const bold = runs.some((r) => r.getElementsByTagNameNS(W, "b").length > 0);
    const color = val(runs[0]?.getElementsByTagNameNS(W, "color")[0] ?? null, "val");

    const pictureOf = (el: Element) => {
      const blip = el.getElementsByTagNameNS(A, "blip")[0];
      const id = blip?.getAttributeNS(R, "embed") ?? blip?.getAttribute("r:embed");
      const target = id ? media[id] : undefined;
      return target ? pictures.get(target) : undefined;
    };
    // Word crops a picture with a:srcRect, each side a share of the picture
    // in thousandths of a per cent; the part that shows is what is drawn.
    const cropOf = (el: Element, img: HTMLImageElement) => {
      const rect = el.getElementsByTagNameNS(A, "srcRect")[0];
      const pct = (name: string) => Number(rect?.getAttribute(name) ?? 0) / 100_000;
      const l = pct("l");
      const t = pct("t");
      const r = pct("r");
      const b = pct("b");
      return {
        sx: img.naturalWidth * l,
        sy: img.naturalHeight * t,
        sw: img.naturalWidth * (1 - l - r),
        sh: img.naturalHeight * (1 - t - b),
      };
    };
    const place =
      (img: HTMLImageElement, el: Element, x: number, yy: number, w: number, h: number) => () => {
        const c = cropOf(el, img);
        ctx.drawImage(img, c.sx, c.sy, c.sw, c.sh, x, yy, w, h);
      };
    const near = (a: number, b: number) => Math.abs(a - b) / b < 0.06;
    const extentOf = (el: Element) => {
      const ext = el.getElementsByTagNameNS(WP, "extent")[0];
      return {
        w: emuPx(Number(ext?.getAttribute("cx") ?? 0)),
        h: emuPx(Number(ext?.getAttribute("cy") ?? 0)),
      };
    };
    const flowY = y;
    for (const anchor of p.getElementsByTagNameNS(WP, "anchor")) {
      const img = pictureOf(anchor);
      const { w, h } = extentOf(anchor);
      if (!img || !w || !h) continue;
      const posH = anchor.getElementsByTagNameNS(WP, "positionH")[0];
      const posV = anchor.getElementsByTagNameNS(WP, "positionV")[0];
      const offset = (pos: Element | undefined) => {
        const o = pos?.getElementsByTagNameNS(WP, "posOffset")[0];
        return o ? emuPx(Number(o.textContent ?? 0)) : null;
      };
      const align = (pos: Element | undefined) =>
        pos?.getElementsByTagNameNS(WP, "align")[0]?.textContent ?? null;
      const relH = posH?.getAttribute("relativeFrom") ?? "column";
      const relV = posV?.getAttribute("relativeFrom") ?? "paragraph";
      const baseX =
        relH === "page"
          ? 0
          : relH === "leftMargin"
            ? 0
            : relH === "rightMargin"
              ? frame.left + frame.width
              : frame.left;
      const spanX = relH === "page" ? PAGE_W : frame.width;
      const baseY =
        relV === "page"
          ? 0
          : relV === "margin" || relV === "topMargin"
            ? frame.pageTop
            : relV === "bottomMargin"
              ? frame.pageBottom
              : flowY;
      const spanY =
        relV === "page" ? PAGE_H : relV === "margin" ? frame.pageBottom - frame.pageTop : lineH;
      const ah = align(posH);
      const av = align(posV);
      let x =
        baseX +
        (offset(posH) ?? (ah === "center" ? (spanX - w) / 2 : ah === "right" ? spanX - w : 0));
      let yy =
        baseY +
        (offset(posV) ?? (av === "center" ? (spanY - h) / 2 : av === "bottom" ? spanY - h : 0));
      let dw = w;
      let dh = h;
      if (near(w, frame.templateW) && near(h, frame.templateH)) {
        // A picture drawn to fill the template's page fills this one.
        x = 0;
        yy = 0;
        dw = PAGE_W;
        dh = PAGE_H;
      }
      // A picture anchored past the page's edge is not brought back: Word
      // leaves it off the page and out of sight, and so does this.
      const behind = anchor.getAttribute("behindDoc") === "1";
      draws.push({ behind, paint: place(img, anchor, x, yy, dw, dh) });
    }
    for (const inline of p.getElementsByTagNameNS(WP, "inline")) {
      const img = pictureOf(inline);
      const { w, h } = extentOf(inline);
      if (!img || !w || !h) continue;
      const x =
        jc === "center"
          ? frame.left + (frame.width - w) / 2
          : jc === "right"
            ? frame.left + frame.width - w
            : frame.left;
      const yy = y;
      draws.push({ behind: false, paint: place(img, inline, x, yy, w, h) });
      height = Math.max(height, h);
    }
    if (text.trim()) {
      const x =
        jc === "center"
          ? frame.left + frame.width / 2
          : jc === "right"
            ? frame.left + frame.width
            : frame.left;
      const baseline = y + fontPx;
      draws.push({
        behind: false,
        paint: () => {
          ctx.font = `${bold ? "bold " : ""}${fontPx}px Arial, Helvetica, sans-serif`;
          ctx.fillStyle = color && /^[0-9a-f]{6}$/i.test(color) ? `#${color}` : "#111";
          ctx.textAlign = jc === "center" ? "center" : jc === "right" ? "right" : "left";
          ctx.fillText(text, x, baseline, frame.width);
        },
      });
    }
    y += height + after;
  }
  if (!paint) draws.length = 0;
  return y - frame.top;
}

const wrapBody = (template: DocxTemplate, inner: string) => {
  const ns = Object.entries(template.namespaces)
    .map(([k, v]) => `xmlns:${k}="${v}"`)
    .join(" ");
  const withW = /xmlns:w=/.test(ns) ? ns : `xmlns:w="${W}" ${ns}`;
  return `<w:body ${withW}>${inner}</w:body>`;
};

export async function composeTemplateRasters(template: DocxTemplate): Promise<PaperRasters> {
  const pictures = await loadPictures(template.media);
  const t = template.page;
  const frame = {
    left: twipsPx(t.left),
    width: twipsPx(t.width - t.left - t.right),
    pageTop: twipsPx(t.top),
    pageBottom: twipsPx(t.height - t.bottom),
    templateW: twipsPx(t.width),
    templateH: twipsPx(t.height),
  };
  const draw = (ctx: CanvasRenderingContext2D, draws: Draw[]) => {
    for (const d of draws.filter((d) => d.behind)) d.paint();
    for (const d of draws.filter((d) => !d.behind)) d.paint();
  };
  const headerAt = (
    ctx: CanvasRenderingContext2D,
    part: { xml: string; media: Record<string, string> } | undefined,
    draws: Draw[],
  ) => {
    if (!part) return;
    const root = parse(part.xml).documentElement;
    layoutPart(root, ctx, pictures, part.media, { ...frame, top: twipsPx(t.header) }, draws, true);
  };
  const footerAt = (
    ctx: CanvasRenderingContext2D,
    part: { xml: string; media: Record<string, string> } | undefined,
    draws: Draw[],
  ) => {
    if (!part) return;
    const root = parse(part.xml).documentElement;
    // Measured first, so the footer can sit up from the foot by its own height.
    const height = layoutPart(root, ctx, pictures, part.media, { ...frame, top: 0 }, [], false);
    layoutPart(
      root,
      ctx,
      pictures,
      part.media,
      { ...frame, top: PAGE_H - twipsPx(t.footer) - height },
      draws,
      true,
    );
  };

  const first = blank();
  {
    const draws: Draw[] = [];
    const body = parse(wrapBody(template, template.firstPageBody)).documentElement;
    layoutPart(
      body,
      first.ctx,
      pictures,
      template.firstPageMedia,
      { ...frame, top: frame.pageTop },
      draws,
      true,
    );
    // Page one takes its own header and footer when the template gives it
    // any; a template that marks page one as different but gives it nothing
    // leaves it bare, as Word does.
    if (template.titlePage) {
      headerAt(first.ctx, template.first.header, draws);
      footerAt(first.ctx, template.first.footer, draws);
    } else {
      headerAt(first.ctx, template.default.header, draws);
      footerAt(first.ctx, template.default.footer, draws);
    }
    draw(first.ctx, draws);
  }

  const hasContinuation = !!(template.default.header || template.default.footer);
  let continuation: HTMLCanvasElement | null = null;
  if (hasContinuation) {
    const page = blank();
    const draws: Draw[] = [];
    headerAt(page.ctx, template.default.header, draws);
    footerAt(page.ctx, template.default.footer, draws);
    draw(page.ctx, draws);
    continuation = page.canvas;
  }
  const reach = continuation
    ? measureArtwork(continuation)
    : { bodyTopPx: null, bodyBottomPx: null };
  return {
    first: await toJpeg(first.canvas),
    continuation: continuation ? await toJpeg(continuation) : null,
    width: PAGE_W,
    height: PAGE_H,
    ...reach,
  };
}

/** A page-sized image is paper, not a strip: roughly the proportions of a sheet. */
export const looksLikeAPage = (width: number, height: number) =>
  width >= 600 && height / width > 1.25 && height / width < 1.5;
