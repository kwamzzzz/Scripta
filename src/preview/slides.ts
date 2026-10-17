/**
 * PowerPoint decks, drawn slide by slide.
 *
 * The drawing is PptxViewJS's: it parses the deck and paints a slide onto a
 * canvas, which is the only honest way to show a deck in a browser — the
 * shapes, the theme and the pictures are all in the file, and nothing but a
 * renderer will put them where PowerPoint would. It is loaded only when a deck
 * is actually opened, so nobody pays for it while reading a PDF.
 */
import type { PPTXViewer } from "pptxviewjs";

export type Deck = {
  count: number;
  /** Slide width ÷ height, so a canvas can be sized before anything is drawn. */
  ratio: number;
  /** Draw a slide (from 1) into a canvas already sized by the caller. */
  draw: (slide: number, canvas: HTMLCanvasElement) => Promise<void>;
};

const EMU_PER_INCH = 914_400;

/** The deck's own slide size, for the shape of the paper we draw it on. */
async function slideRatio(bytes: ArrayBuffer): Promise<number> {
  try {
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file("ppt/presentation.xml")?.async("string");
    if (!xml) return 16 / 9;
    const size = new DOMParser().parseFromString(xml, "application/xml").querySelector("sldSz");
    const cx = Number(size?.getAttribute("cx"));
    const cy = Number(size?.getAttribute("cy"));
    return cx > 0 && cy > 0 ? cx / cy : 16 / 9;
  } catch {
    return 16 / 9;
  }
}

/**
 * Write the line spacing a paragraph actually needs into the slide.
 *
 * The renderer takes the height of a line from the paragraph's default font
 * size, not from the runs in it. A 50pt title in a paragraph that defaults to
 * 18pt is therefore drawn at 50pt with 18pt between the lines, and a wrapped
 * title lands on top of itself. PowerPoint spaces a single line at about 1.2
 * times the largest run in the paragraph, so that is written in as an exact
 * spacing before the deck is handed over — only where a run is bigger than the
 * paragraph's default, so decks that already read correctly are untouched.
 */
async function spaceLines(bytes: ArrayBuffer): Promise<ArrayBuffer> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(bytes.slice(0));
  const slides = Object.keys(zip.files).filter((path) =>
    /^ppt\/(slides|slideLayouts|slideMasters)\/[^/]+\.xml$/.test(path),
  );
  if (!slides.length) return bytes;
  const parser = new DOMParser();
  const serialiser = new XMLSerializer();
  let changed = false;

  for (const path of slides) {
    const xml = await zip.file(path)!.async("string");
    const doc = parser.parseFromString(xml, "application/xml");
    if (doc.querySelector("parsererror")) continue;
    let touched = false;

    for (const paragraph of doc.getElementsByTagName("a:p")) {
      let largest = 0;
      let biggest: Element | null = null;
      for (const run of paragraph.getElementsByTagName("a:rPr")) {
        const size = Number(run.getAttribute("sz")) || 0;
        if (size > largest) {
          largest = size;
          biggest = run;
        }
      }
      if (!largest) continue;

      const properties = paragraph.getElementsByTagName("a:pPr")[0];
      const fallback = properties?.getElementsByTagName("a:defRPr")[0];
      const paragraphSize = Number(fallback?.getAttribute("sz")) || 0;
      if (paragraphSize >= largest) continue;

      const spacing = properties?.getElementsByTagName("a:lnSpc")[0];
      // An exact spacing in the file is the author's own; leave it alone.
      if (spacing?.getElementsByTagName("a:spcPts").length) continue;
      const percent = Number(
        spacing?.getElementsByTagName("a:spcPct")[0]?.getAttribute("val") ?? 100_000,
      );
      const points = Math.round((largest * (percent / 100_000) * 1.2) / 100) * 100;

      const pPr = properties ?? doc.createElementNS(paragraph.namespaceURI, "a:pPr");
      if (!properties) paragraph.insertBefore(pPr, paragraph.firstChild);
      spacing?.remove();
      const lnSpc = doc.createElementNS(pPr.namespaceURI, "a:lnSpc");
      const spcPts = doc.createElementNS(pPr.namespaceURI, "a:spcPts");
      spcPts.setAttribute("val", String(points));
      lnSpc.appendChild(spcPts);
      pPr.insertBefore(lnSpc, pPr.firstChild);

      // The baseline within a line is measured from the paragraph's own size
      // too, so a big run on a small paragraph is drawn above where it
      // belongs. The paragraph is told how big its text really is.
      const defRPr = fallback ?? doc.createElementNS(pPr.namespaceURI, "a:defRPr");
      defRPr.setAttribute("sz", String(largest));
      if (!fallback) {
        // Carried over from the run this size came from, so the paragraph's
        // defaults do not contradict the text they belong to.
        for (const attribute of ["b", "i", "u"]) {
          const value = biggest?.getAttribute(attribute);
          if (value) defRPr.setAttribute(attribute, value);
        }
        const latin = biggest?.getElementsByTagName("a:latin")[0];
        if (latin) defRPr.appendChild(latin.cloneNode(true));
        pPr.appendChild(defRPr);
      }
      touched = true;
    }

    if (touched) {
      zip.file(path, serialiser.serializeToString(doc));
      changed = true;
    }
  }

  if (!changed) return bytes;
  return await zip.generateAsync({ type: "arraybuffer" });
}

export async function openDeck(bytes: ArrayBuffer): Promise<Deck> {
  const { PPTXViewer } = await import("pptxviewjs");
  const viewer: PPTXViewer = new PPTXViewer({ slideSizeMode: "fit", backgroundColor: "#ffffff" });
  // The viewer keeps the bytes, so hand it a copy of its own.
  await viewer.loadFile(await spaceLines(bytes));
  const count = viewer.getSlideCount();
  if (!count) throw new Error("This deck has no slides.");
  const ratio = await slideRatio(bytes);
  // One viewer paints one slide at a time: the stage and the filmstrip both
  // draw from it, so their turns are taken in order.
  let turn: Promise<unknown> = Promise.resolve();
  return {
    count,
    ratio,
    draw: (slide, canvas) => {
      turn = turn
        .catch(() => {})
        .then(() =>
          viewer.renderSlide(Math.max(0, Math.min(count - 1, slide - 1)), canvas, {
            quality: "high",
          }),
        );
      return turn as Promise<void>;
    },
  };
}

/** A picture of slide one, for a tile. Width is in device pixels. */
export async function renderSlideImage(bytes: ArrayBuffer, width: number, slide = 1) {
  const deck = await openDeck(bytes);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = Math.round(width / deck.ratio);
  await deck.draw(slide, canvas);
  return { canvas, pages: deck.count };
}

export const inches = (emu: number) => emu / EMU_PER_INCH;
