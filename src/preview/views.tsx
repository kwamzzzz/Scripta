/**
 * How each kind of file is drawn inside the viewer: pages for a PDF, Word's
 * own layout for a document, one slide at a time for a deck, a grid for a
 * workbook, and the file itself for pictures and plain text.
 *
 * The file is parsed once by useDocument and handed to these views, so the
 * stage and the filmstrip draw from the same document.
 */
import { useEffect, useRef, useState, type RefObject } from "react";
import type { Opened } from "./document";
import type { PdfDoc } from "./pdf";
import type { Deck } from "./slides";
import { renderWord } from "./word";
import { columnName } from "./sheet";
import type { SheetGrid } from "./model";

export type ViewProps = {
  opened: Opened;
  bytes: ArrayBuffer;
  /** 1 fits the stage; the user can go closer or further out. */
  zoom: number;
  page: number;
  onPage: (page: number) => void;
};

/** The stage's width in CSS pixels, so a page can be drawn to fit it. */
function useWidth(ref: RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.round(entry!.contentRect.width)),
    );
    observer.observe(host);
    setWidth(Math.round(host.getBoundingClientRect().width));
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

const paperWidth = (stage: number, zoom: number) =>
  Math.max(240, Math.round(Math.min(Math.max(stage - 56, 240), 1080) * zoom));

/** Draw calls queued per canvas: a second render on a busy canvas throws. */
function useDrawQueue() {
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  return (work: () => Promise<unknown>) => {
    queue.current = queue.current.catch(() => {}).then(work);
    return queue.current;
  };
}

/* ---- PDF */

export function PdfView({ opened, zoom, page, onPage }: ViewProps) {
  const doc = (opened as Extract<Opened, { kind: "pdf" }>).doc;
  const stage = useRef<HTMLDivElement>(null);
  const width = useWidth(stage);
  // A page chosen in the filmstrip scrolls the stage to it; scrolling by hand
  // reports the page back. The two must not fight, so a jump is remembered.
  const jumped = useRef(0);

  useEffect(() => {
    if (!stage.current || page === jumped.current) return;
    const target = stage.current.querySelector(`[data-page="${page}"]`);
    if (!target) return;
    jumped.current = page;
    target.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [page]);

  return (
    <div className="pv-stage-inner" ref={stage}>
      {Array.from({ length: doc.count }, (_, i) => (
        <PdfPage
          key={i}
          doc={doc}
          page={i + 1}
          width={paperWidth(width, zoom)}
          onInView={() => {
            jumped.current = i + 1;
            onPage(i + 1);
          }}
        />
      ))}
    </div>
  );
}

function PdfPage({
  doc,
  page,
  width,
  onInView,
}: {
  doc: PdfDoc;
  page: number;
  width: number;
  onInView: () => void;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const draw = useDrawQueue();
  const [ratio, setRatio] = useState(1 / 1.414);
  const [near, setNear] = useState(false);

  useEffect(() => {
    let live = true;
    void doc.ratio(page).then((r) => live && setRatio(r));
    return () => {
      live = false;
    };
  }, [doc, page]);

  useEffect(() => {
    const host = holder.current;
    if (!host) return;
    // Pages are drawn a screen ahead, so scrolling never lands on a blank
    // sheet, and the page filling the stage is the one the counter names.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setNear(true);
          if (entry.intersectionRatio > 0.55) onInView();
        }
      },
      { rootMargin: "800px 0px", threshold: [0, 0.55] },
    );
    observer.observe(host);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!near || !canvas.current || !width) return;
    const target = canvas.current;
    void draw(() => doc.draw(page, target, width));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near, doc, page, width]);

  return (
    <div className="pv-paper" data-page={page} ref={holder} style={{ width, aspectRatio: ratio }}>
      <canvas ref={canvas} />
      <span className="pv-paper-no">{page}</span>
    </div>
  );
}

/* ---- Word */

export function WordView({ bytes, zoom }: ViewProps) {
  const stage = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const styles = useRef<HTMLDivElement>(null);
  const width = useWidth(stage);
  const [plain, setPlain] = useState(false);
  /** The document's own size, before it is scaled to the stage. */
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  // Word lays a page out at its printed width, which is rarely the width of
  // the stage; the page is scaled to fill it, as a PDF page is.
  const [pageWidth, setPageWidth] = useState(0);

  useEffect(() => {
    let live = true;
    if (!body.current || !styles.current) return;
    void renderWord(bytes, body.current, styles.current).then((render) => {
      if (!live) return;
      setPlain(render.fallback);
      const page = body.current?.querySelector<HTMLElement>("section.docx");
      const declared = page?.style.width ?? "";
      const points = parseFloat(declared);
      setPageWidth(
        declared.endsWith("pt") && points > 0 ? points * (4 / 3) : (page?.offsetWidth ?? 0),
      );
      const host = body.current;
      if (host) setNatural({ w: host.scrollWidth, h: host.scrollHeight });
    });
    return () => {
      live = false;
    };
  }, [bytes]);

  // The same room a PDF page gets, so a document and a bundle read alike.
  const fitted = pageWidth ? Math.min(Math.max(paperWidth(width, 1) / pageWidth, 0.35), 2) : 1;
  const scale = fitted * zoom;

  /* Scaled by a transform, not by `zoom`.
     `zoom` is laid out: a document zoomed past the width of the stage made
     the stage itself that wide, and the toolbar above it went off the side of
     the screen with no way back to the zoom control. A transform draws at a
     size without claiming one, so the pages scroll inside the stage. The
     holder carries the scaled size, since the transform does not. */
  return (
    <div className="pv-stage-inner" ref={stage}>
      <div ref={styles} hidden />
      <div
        className="pv-word-holder"
        style={
          natural.w
            ? { width: Math.round(natural.w * scale), height: Math.round(natural.h * scale) }
            : undefined
        }
      >
        <div
          className={`pv-word${plain ? " is-plain" : ""}`}
          style={{
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            ...(natural.w ? { width: natural.w } : {}),
          }}
          ref={body}
        />
      </div>
    </div>
  );
}

/* ---- Slides */

export function SlidesView({ opened, zoom, page }: ViewProps) {
  const deck = (opened as Extract<Opened, { kind: "slides" }>).deck;
  const stage = useRef<HTMLDivElement>(null);
  const width = useWidth(stage);
  const canvas = useRef<HTMLCanvasElement>(null);
  const draw = useDrawQueue();
  const slideWidth = paperWidth(width, zoom);

  useEffect(() => {
    if (!canvas.current || !slideWidth) return;
    const target = canvas.current;
    void draw(() => drawSlide(deck, page, target, slideWidth));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck, page, slideWidth]);

  return (
    <div className="pv-stage-inner is-slides" ref={stage}>
      <div className="pv-paper is-slide" style={{ width: slideWidth }}>
        <canvas ref={canvas} />
      </div>
    </div>
  );
}

/** Size a canvas for this screen and draw a slide onto it. */
export async function drawSlide(
  deck: Deck,
  slide: number,
  canvas: HTMLCanvasElement,
  width: number,
) {
  const density = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * density);
  canvas.height = Math.round((width / deck.ratio) * density);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${Math.round(width / deck.ratio)}px`;
  await deck.draw(slide, canvas);
}

/* ---- Workbook */

export function SheetView({ opened, zoom, page, onPage }: ViewProps) {
  const sheets = (opened as Extract<Opened, { kind: "sheet" }>).sheets;
  const sheet = sheets[Math.min(Math.max(page, 1), sheets.length) - 1];
  return (
    <div className="pv-stage-inner is-sheet">
      <div className="pv-sheet" style={{ zoom }}>
        {sheet && <Grid grid={sheet} />}
      </div>
      {sheets.length > 1 && (
        <div className="pv-tabs" role="tablist" aria-label="Sheets">
          {sheets.map((s, i) => (
            <button
              key={`${s.name}-${i}`}
              type="button"
              role="tab"
              aria-selected={page === i + 1}
              className={page === i + 1 ? "is-on" : undefined}
              onClick={() => onPage(i + 1)}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const ROW_LIMIT = 500;
const COLUMN_LIMIT = 60;

export function Grid({ grid }: { grid: SheetGrid }) {
  const columns = Math.min(Math.max(grid.columns, 1), COLUMN_LIMIT);
  const rows = grid.rows.slice(0, ROW_LIMIT);
  // A merged cell is drawn once and the cells it swallows are skipped.
  const covered = new Set<string>();
  const spans = new Map<string, { rows: number; cols: number }>();
  for (const m of grid.merges) {
    spans.set(`${m.row}:${m.col}`, { rows: m.rows, cols: m.cols });
    for (let r = m.row; r < m.row + m.rows; r++)
      for (let c = m.col; c < m.col + m.cols; c++)
        if (r !== m.row || c !== m.col) covered.add(`${r}:${c}`);
  }
  return (
    <>
      <table className="pv-grid">
        <thead>
          <tr>
            <th className="pv-grid-corner" />
            {Array.from({ length: columns }, (_, c) => (
              <th key={c} style={{ width: grid.widths[c] ?? 92 }}>
                {columnName(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              <th className="pv-grid-no">{r + 1}</th>
              {Array.from({ length: columns }, (_, c) => {
                if (covered.has(`${r}:${c}`)) return null;
                const cell = row.cells[c];
                const merge = spans.get(`${r}:${c}`);
                return (
                  <td
                    key={c}
                    className={cell?.numeric ? "is-number" : undefined}
                    rowSpan={merge?.rows}
                    colSpan={merge?.cols}
                  >
                    {cell?.value ?? ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {grid.rows.length > ROW_LIMIT && (
        <p className="pv-note">
          The first {ROW_LIMIT} rows of {grid.rows.length}. Download the file for the rest.
        </p>
      )}
    </>
  );
}

/* ---- Pictures and plain text */

export function ImageView({ bytes, zoom }: ViewProps) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const url = URL.createObjectURL(new Blob([bytes]));
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [bytes]);
  return (
    <div className="pv-stage-inner is-centred">
      {src && (
        <img
          className="pv-image"
          src={src}
          alt=""
          style={{ width: `${Math.round(zoom * 100)}%` }}
        />
      )}
    </div>
  );
}

export function TextView({ bytes, zoom }: ViewProps) {
  const [text, setText] = useState("");
  useEffect(() => setText(new TextDecoder().decode(bytes).slice(0, 400_000)), [bytes]);
  return (
    <div className="pv-stage-inner">
      <div className="pv-paper is-text" style={{ zoom }}>
        <pre>{text}</pre>
      </div>
    </div>
  );
}
