/**
 * First-page thumbnails for anything the app holds a file for, rendered at
 * 1:1.3 and cached
 * per version: in memory for this tab, in browser storage across reloads,
 * and on the version record itself (thumbnailRef) once generated.
 *
 * PDFs are rasterised with PDF.js; Word files use the document's own embedded
 * thumbnail when it has one, otherwise a docx-preview render of page one;
 * decks show slide one, workbooks the top-left of the first sheet, and
 * pictures themselves. Anything else falls back to the drawn placeholder.
 */
import { useEffect, useState } from "react";
import { loadFileBytes } from "@/lib/files";
import { kindOf } from "@/preview/kinds";
import { renderSlideImage } from "@/preview/slides";
import { readWorkbook } from "@/preview/sheet";
import { columnName } from "@/preview/sheet";
import type { Version } from "@/matter-flow/model";

export const THUMB_RATIO = 1.3;
const THUMB_WIDTH = 360;
// Bumped when the way a thumbnail is drawn changes, so nobody is left
// looking at a picture made by the old renderer.
const STORAGE_PREFIX = "px.flow.thumb.3.";
const STORAGE_LIMIT = 180_000; // bytes of data URL we are willing to keep per version

const memory = new Map<string, string>();

const readStored = (id: string) => {
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + id);
  } catch {
    return null;
  }
};

// Pictures drawn by an older renderer would otherwise sit in storage for good.
let purged = false;
const purgeOldThumbnails = () => {
  if (purged) return;
  purged = true;
  try {
    for (const key of Object.keys(window.localStorage))
      if (key.startsWith("px.flow.thumb.") && !key.startsWith(STORAGE_PREFIX))
        window.localStorage.removeItem(key);
  } catch {
    /* storage is not available; nothing to tidy */
  }
};

const writeStored = (id: string, dataUrl: string) => {
  purgeOldThumbnails();
  if (dataUrl.length > STORAGE_LIMIT) return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + id, dataUrl);
  } catch {
    /* quota — the in-memory copy still serves this tab */
  }
};

export type Thumb = { src: string; pages?: number };

const isZip = (bytes: ArrayBuffer) => {
  const b = new Uint8Array(bytes.slice(0, 2));
  return b[0] === 0x50 && b[1] === 0x4b;
};

/** Fit a rendered page into the 1:1.3 tile, drawn from the top as it is read. */
function tileFrom(source: CanvasImageSource, sourceWidth: number, sourceHeight: number) {
  const tile = document.createElement("canvas");
  tile.width = THUMB_WIDTH;
  tile.height = Math.round(THUMB_WIDTH * THUMB_RATIO);
  const ctx = tile.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, tile.width, tile.height);
  const scale = THUMB_WIDTH / sourceWidth;
  ctx.drawImage(source, 0, 0, sourceWidth, sourceHeight, 0, 0, THUMB_WIDTH, sourceHeight * scale);
  return tile.toDataURL("image/jpeg", 0.82);
}

/** Rasterise page one of a PDF. */
export async function renderPdfThumbnail(bytes: ArrayBuffer): Promise<Thumb> {
  const pdfjs = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  const page = await doc.getPage(1);
  const natural = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: (THUMB_WIDTH * 2) / natural.width });
  const sheet = document.createElement("canvas");
  sheet.width = Math.round(viewport.width);
  sheet.height = Math.round(viewport.height);
  await page.render({ canvas: sheet, canvasContext: sheet.getContext("2d")!, viewport }).promise;
  return { src: tileFrom(sheet, sheet.width, sheet.height), pages: doc.numPages };
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not decode the thumbnail"));
    image.src = src;
  });

/** Page one of a Word document: the embedded thumbnail if present, else a docx-preview render. */
export async function renderDocxThumbnail(bytes: ArrayBuffer): Promise<Thumb> {
  const { default: JSZip } = await import("jszip");
  const archive = await JSZip.loadAsync(bytes);
  const embedded = archive.file(/^docProps\/thumbnail\.(png|jpe?g|emf|wmf)$/i)[0];
  if (embedded && /\.(png|jpe?g)$/i.test(embedded.name)) {
    const mime = embedded.name.toLowerCase().endsWith("png") ? "image/png" : "image/jpeg";
    const image = await loadImage(`data:${mime};base64,${await embedded.async("base64")}`);
    return { src: tileFrom(image, image.naturalWidth, image.naturalHeight) };
  }
  const { renderAsync } = await import("docx-preview");
  const body = document.createElement("div");
  const styles = document.createElement("div");
  await renderAsync(bytes, body, styles, {
    inWrapper: false,
    useBase64URL: true,
    renderAltChunks: false,
    ignoreFonts: true,
    ignoreLastRenderedPageBreak: false,
  });
  const page = body.querySelector<HTMLElement>("section.docx");
  if (!page) throw new Error("No page to render");
  const pixels = (value: string) => parseFloat(value) * (value.endsWith("pt") ? 4 / 3 : 1);
  const pageWidth = pixels(page.style.width) || 816;
  const pageHeight = pixels(page.style.minHeight || page.style.height) || 1056;
  const wrapper = document.createElement("div");
  wrapper.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  wrapper.style.cssText = `width:${pageWidth}px;height:${pageHeight}px;overflow:hidden;background:#fff;position:relative`;
  const style = document.createElement("style");
  style.textContent = styles.innerHTML.replace(/<\/?style[^>]*>/g, "");
  wrapper.appendChild(style);
  wrapper.appendChild(page.cloneNode(true));
  const serialized = new XMLSerializer().serializeToString(wrapper);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pageWidth}" height="${pageHeight}"><foreignObject width="100%" height="100%">${serialized}</foreignObject></svg>`;
  const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  const pages = body.querySelectorAll("section.docx").length || undefined;
  return { src: tileFrom(image, pageWidth, pageHeight), ...(pages ? { pages } : {}) };
}

/**
 * Slide one of a deck, in the deck's own shape. A slide is wide; boxing it
 * into a tall page tile would leave it swimming in empty paper, so the tile
 * takes the shape of the slide instead.
 */
export async function renderSlidesThumbnail(bytes: ArrayBuffer): Promise<Thumb> {
  const { canvas, pages } = await renderSlideImage(bytes, THUMB_WIDTH * 2);
  return { src: canvas.toDataURL("image/jpeg", 0.85), pages };
}

/** The top-left corner of a workbook's first sheet, drawn as the grid it is. */
export async function renderSheetThumbnail(bytes: ArrayBuffer): Promise<Thumb> {
  const { sheets } = await readWorkbook(bytes);
  const sheet = sheets[0]!;
  const scale = 2;
  const tile = document.createElement("canvas");
  tile.width = THUMB_WIDTH * scale;
  tile.height = Math.round(THUMB_WIDTH * THUMB_RATIO) * scale;
  const ctx = tile.getContext("2d")!;
  ctx.scale(scale, scale);
  const width = THUMB_WIDTH;
  const rowHeight = 21;
  const headHeight = 18;
  const gutter = 30;
  const columns = Math.min(Math.max(sheet.columns, 1), 6);
  const columnWidth = (width - gutter) / columns;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, tile.height / scale);
  ctx.fillStyle = "#f3f4f5";
  ctx.fillRect(0, 0, width, headHeight);
  ctx.fillRect(0, 0, gutter, tile.height / scale);
  ctx.font = '600 10px "Geist", sans-serif';
  ctx.fillStyle = "#8a8a8a";
  ctx.textBaseline = "middle";
  for (let c = 0; c < columns; c++)
    ctx.fillText(columnName(c), gutter + c * columnWidth + columnWidth / 2 - 4, headHeight / 2);
  const rows = Math.ceil((tile.height / scale - headHeight) / rowHeight);
  for (let r = 0; r < rows; r++) {
    const y = headHeight + r * rowHeight;
    ctx.fillStyle = "#8a8a8a";
    ctx.font = '500 9px "Geist", sans-serif';
    ctx.fillText(String(r + 1), 8, y + rowHeight / 2);
    ctx.strokeStyle = "#e8e8e8";
    ctx.beginPath();
    ctx.moveTo(0, y + rowHeight);
    ctx.lineTo(width, y + rowHeight);
    ctx.stroke();
    const row = sheet.rows[r];
    for (let c = 0; c < columns; c++) {
      const x = gutter + c * columnWidth;
      if (r === 0) {
        ctx.strokeStyle = "#e8e8e8";
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, tile.height / scale);
        ctx.stroke();
      }
      const cell = row?.cells[c];
      if (!cell) continue;
      ctx.fillStyle = "#232323";
      ctx.font = '11px "Geist", system-ui, sans-serif';
      const text = cell.value.length > 14 ? `${cell.value.slice(0, 13)}…` : cell.value;
      ctx.fillText(text, x + 5, y + rowHeight / 2);
    }
  }
  return { src: tile.toDataURL("image/jpeg", 0.85), pages: sheets.length };
}

/** A picture, fitted to the tile. */
export async function renderImageThumbnail(bytes: ArrayBuffer): Promise<Thumb> {
  const url = URL.createObjectURL(new Blob([bytes]));
  try {
    const image = await loadImage(url);
    return { src: tileFrom(image, image.naturalWidth, image.naturalHeight) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Thumbnail for uploaded bytes, by sniffing the content; null when we cannot draw it. */
export async function renderThumbnail(bytes: ArrayBuffer, name = ""): Promise<Thumb | null> {
  try {
    switch (kindOf(bytes, name)) {
      case "pdf":
        return await renderPdfThumbnail(bytes);
      case "word":
        return await renderDocxThumbnail(bytes);
      case "slides":
        return await renderSlidesThumbnail(bytes);
      case "sheet":
        return await renderSheetThumbnail(bytes);
      case "image":
        return await renderImageThumbnail(bytes);
      default:
        return isZip(bytes) ? await renderDocxThumbnail(bytes) : null;
    }
  } catch {
    return null;
  }
}

/**
 * Anything the app can draw a thumbnail of: an id to cache it under and a
 * stored file to read. `thumbnailRef` is a picture already made — a deck's own
 * slide image, a thumbnail generated at upload — which is used in preference
 * to rendering the file again.
 *
 * Deliberately not a Version, a document row or a library source: every one of
 * those has these three facts, and a picture of page one is the same job in
 * every part of the app.
 */
export type ThumbFile = {
  id: string;
  fileRef: string | null;
  thumbnailRef?: string | null;
};

export async function thumbnailFor(version: ThumbFile): Promise<string | null> {
  const cached = memory.get(version.id) ?? readStored(version.id);
  if (cached) return cached;
  if (version.thumbnailRef) {
    if (version.thumbnailRef.startsWith("data:")) return version.thumbnailRef;
    const bytes = await loadFileBytes(version.thumbnailRef);
    const src = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Could not read thumbnail"));
      reader.readAsDataURL(new Blob([bytes]));
    });
    memory.set(version.id, src);
    return src;
  }
  if (!version.fileRef) return null;
  const bytes = await loadFileBytes(version.fileRef);
  const thumb = await renderThumbnail(bytes, version.fileRef);
  if (!thumb) return null;
  memory.set(version.id, thumb.src);
  writeStored(version.id, thumb.src);
  return thumb.src;
}

export type ThumbnailStatus = "idle" | "loading" | "ready" | "none";

/**
 * The thumbnail for a file; `none` when there is nothing to render, so the
 * caller draws its own placeholder.
 */
export function useFileThumbnail(version: ThumbFile | null) {
  const [state, setState] = useState<{ src: string | null; status: ThumbnailStatus }>({
    src: null,
    status: "idle",
  });
  const id = version?.id ?? null;
  const fileRef = version?.fileRef ?? null;
  const thumbnailRef = version?.thumbnailRef ?? null;
  useEffect(() => {
    if (!version) {
      setState({ src: null, status: "none" });
      return;
    }
    let cancelled = false;
    const cached = memory.get(version.id) ?? readStored(version.id);
    if (cached) {
      setState({ src: cached, status: "ready" });
      return;
    }
    if (!version.fileRef && !version.thumbnailRef) {
      setState({ src: null, status: "none" });
      return;
    }
    setState({ src: null, status: "loading" });
    thumbnailFor(version)
      .then((src) => {
        if (!cancelled) setState({ src, status: src ? "ready" : "none" });
      })
      .catch(() => {
        if (!cancelled) setState({ src: null, status: "none" });
      });
    return () => {
      cancelled = true;
    };
    // The version object is rebuilt on every store write; only its identity and refs matter here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, fileRef, thumbnailRef]);
  return state;
}

/** Remember a thumbnail generated at upload time so the tile never re-renders the file. */
export function rememberThumbnail(versionId: string, src: string) {
  memory.set(versionId, src);
  writeStored(versionId, src);
}

/** The same, for a flow version — which is a file with a few more facts. */
export const useVersionThumbnail = (version: Version | null) =>
  useFileThumbnail(
    version
      ? { id: version.id, fileRef: version.fileRef, thumbnailRef: version.thumbnailRef }
      : null,
  );
