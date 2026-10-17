/**
 * PDFs, a page at a time. PDF.js does the drawing; this keeps one open
 * document per file so paging and zooming never re-parse it.
 */
export type PdfDoc = {
  count: number;
  /** Page width ÷ height, for sizing the paper before it is drawn. */
  ratio: (page: number) => Promise<number>;
  /** Draw a page (from 1) at a width in CSS pixels, sharp on this screen. */
  draw: (page: number, canvas: HTMLCanvasElement, width: number) => Promise<void>;
  close: () => void;
};

export async function openPdf(bytes: ArrayBuffer): Promise<PdfDoc> {
  const pdfjs = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  // PDF.js takes ownership of the buffer it is given (it moves it to its
  // worker), which empties the caller's copy. The viewer keeps bytes cached to
  // reopen and to download, so it is handed a copy of its own.
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
  return {
    count: doc.numPages,
    ratio: async (page) => {
      const view = (await doc.getPage(page)).getViewport({ scale: 1 });
      return view.width / view.height;
    },
    draw: async (page, canvas, width) => {
      const sheet = await doc.getPage(page);
      const natural = sheet.getViewport({ scale: 1 });
      const density = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = sheet.getViewport({ scale: (width * density) / natural.width });
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${Math.round(viewport.height / density)}px`;
      await sheet.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
    },
    close: () => void doc.loadingTask.destroy(),
  };
}
