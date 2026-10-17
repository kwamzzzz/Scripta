/**
 * The document as it will actually come out: the exported file itself, on the
 * page, drawn by Scripta.
 *
 * The text preview beside it is a reading of the clauses — useful for
 * comparing the two copies clause by clause, and honest about what it is. It
 * cannot answer the question a lawyer asks with a hand on the send button:
 * does it LOOK right. Paper, margins, the letterhead, where the pages break,
 * the table of contents and its page numbers, the numbering, the signature
 * blocks — none of that is visible until the file exists.
 *
 * So this draws the file. It asks the exporter for the PDF, which is built by
 * the same layout the Word copy is, and renders those bytes with the viewer
 * the rest of the app uses. Handing them to the browser's own PDF plugin
 * instead was quicker, and gave a different screen in every browser: Chrome
 * drew its toolbar, others drew a bare page with no paging or zoom at all.
 */
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight, Maximize2, Minus, Plus } from "lucide-react";
import { exportMatterDocument } from "@/lib/exports.functions";
import { openPdf } from "@/preview/pdf";
import { PdfView, WordView } from "@/preview/views";
import type { Opened } from "@/preview/document";
import { C } from "@/lib/tokens";
import { withDeadline } from "@/lib/deadline";
import "@/preview/preview.css";

export type PreviewKind = "clean" | "redline";

/**
 * Which file is drawn.
 *
 * A contract normally leaves as Word, so Word is what a lawyer wants to look
 * at: its own numbering, its tables, its tracked changes, its table of
 * contents, laid out by the library the app reads any .docx with, which pages
 * a file the way Word prints it. The PDF is drawn by Scripta's own layout and
 * is exact about the page. The two are a click apart rather than a guess.
 */
export type PreviewFormat = "docx" | "pdf";

/**
 * Zoom is a scale, not a list of sizes: each press is a step of a sixth, so
 * it goes as close and as far out as the reader wants — a schedule's small
 * print at 400%, ten pages at a glance at 25% — rather than stopping at
 * whatever six sizes somebody chose. 1 is the page across the stage.
 */
const ZOOM_STEP = 7 / 6;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 6;

/** A4 upright, which is what the exporter draws. */
const PAGE_RATIO = 1 / 1.414;

export default function PagePreview({
  matterId,
  kind,
  format,
  letterhead,
}: {
  matterId: string;
  kind: PreviewKind;
  format: PreviewFormat;
  letterhead: boolean;
}) {
  const exportDoc = useServerFn(exportMatterDocument);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [page, setPage] = useState(1);
  const [zoomAt, setZoomAt] = useState(1);
  /**
   * The page fills the width of the stage to begin with.
   *
   * Fitting the WHOLE page sounds right and reads badly: in a panel a few
   * hundred pixels tall it draws a contract page the size of a stamp. The
   * words matter more than the shape, so the width is what is fitted, and
   * the whole page is a button away.
   */
  const [fit, setFit] = useState(false);
  const count = opened?.kind === "pdf" ? opened.count : 1;
  /* Word is laid out as one flowing set of pages, so paging through it is the
     scroll and the counter has nothing to count. */
  const paged = opened?.kind === "pdf";
  const stage = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });
  /**
   * Fitting means the WHOLE page, not the width of one. The question this
   * screen answers is how the page looks, and a page whose foot is below the
   * fold does not answer it.
   */
  const fitZoom = (() => {
    const across = Math.min(Math.max(stageSize.w - 56, 240), 1080);
    const down = (stageSize.h - 52) * PAGE_RATIO;
    return across > 0 && down > 0 ? Math.min(1, down / across) : 1;
  })();
  const zoom = fit ? fitZoom : zoomAt;
  // What the wheel listener needs to know, without being rebuilt to learn it.
  const fitRef = useRef({ fit, zoom });
  fitRef.current = { fit, zoom };

  /* Pinching, or holding the command key and scrolling, zooms the pages —
     what a reader does in any document viewer without being told. */
  useEffect(() => {
    const host = stage.current;
    if (!host) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoomAt((z) => {
        const from = fitRef.current.fit ? fitRef.current.zoom : z;
        return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, from * Math.exp(-e.deltaY / 240)));
      });
      setFit(false);
    };
    host.addEventListener("wheel", wheel, { passive: false });
    return () => host.removeEventListener("wheel", wheel);
  }, []);

  useEffect(() => {
    const host = stage.current;
    if (!host) return;
    const measure = () => setStageSize({ w: host.clientWidth, h: host.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  /* Paging scrolls the stage itself. Asking the view to scroll by changing
     the page it is given fought the counter, which reports the page in view:
     the jump began, the page still filling the stage reported itself, and the
     view came straight back. */
  const goTo = (target: number) => {
    const to = Math.min(count, Math.max(1, target));
    setPage(to);
    // The column of pages is what scrolls, not the screen. `scrollIntoView`
    // moved the window instead, so the page on screen and the page the
    // counter named came apart.
    const jump = () => {
      const column = stage.current?.querySelector<HTMLElement>(".pv-stage-inner");
      const paper = column?.querySelector<HTMLElement>(`[data-page="${to}"]`);
      if (column && paper) column.scrollTop = paper.offsetTop - column.offsetTop;
    };
    // Pages take their height as each one's size comes back from the file, so
    // the column is still settling when the jump is made and a single scroll
    // is undone by the next layout. It is made again as the dust settles.
    jump();
    [60, 220, 500].forEach((ms) => setTimeout(jump, ms));
  };
  // The open document holds a worker; the one being replaced is closed.
  const current = useRef<Opened | null>(null);

  useEffect(() => {
    let live = true;
    setBusy(true);
    setError(null);
    /* Building the file is real work — the firm's paper, the tables, the page
       breaks — so it is given a minute. Beyond that something has gone wrong
       and saying so beats a spinner that never stops. */
    void withDeadline(
      exportDoc({ data: { matterId, kind, format, letterhead } }),
      60,
      "The preview",
    )
      .then(async (file) => {
        const binary = atob(file.base64);
        const raw = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) raw[i] = binary.charCodeAt(i);
        if (format === "docx") {
          if (!live) return;
          if (current.current?.kind === "pdf") current.current.doc.close();
          current.current = null;
          setBytes(raw.buffer);
          setOpened({ kind: "word", count: 1 });
          setPage(1);
          return;
        }
        const doc = await openPdf(raw.buffer);
        if (!live) {
          doc.close();
          return;
        }
        if (current.current?.kind === "pdf") current.current.doc.close();
        const next: Opened = { kind: "pdf", doc, count: doc.count };
        current.current = next;
        setBytes(raw.buffer);
        setOpened(next);
        setPage(1);
      })
      .catch((cause: unknown) => {
        if (!live) return;
        setError(cause instanceof Error ? cause.message : "The pages could not be drawn.");
      })
      .finally(() => live && setBusy(false));
    return () => {
      live = false;
    };
    // exportDoc is stable for the life of the screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matterId, kind, format, letterhead]);

  useEffect(
    () => () => {
      if (current.current?.kind === "pdf") current.current.doc.close();
      current.current = null;
    },
    [],
  );

  const button = (label: string, icon: React.ReactNode, onClick: () => void, disabled = false) => (
    <button
      type="button"
      className="pv-tool"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
    </button>
  );

  return (
    <div
      style={{
        flex: 1,
        // Definite, not "as wide as what is inside": see `.pv-stage`.
        width: "100%",
        minHeight: 0,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div className="pv-bar">
        <span className="pv-bar-label">
          {busy
            ? "Laying out the pages…"
            : paged
              ? `Page ${Math.min(page, count)} of ${count}`
              : "As Word lays it out"}
        </span>
        <div style={{ flex: 1 }} />
        {paged && (
          <>
            {button(
              "Previous page",
              <ChevronLeft size={15} />,
              () => goTo(page - 1),
              busy || page <= 1,
            )}
            {button(
              "Next page",
              <ChevronRight size={15} />,
              () => goTo(page + 1),
              busy || page >= count,
            )}
            <span className="pv-bar-gap" />
          </>
        )}
        {button(
          "Zoom out",
          <Minus size={15} />,
          () => {
            const from = fit ? fitZoom : zoomAt;
            setFit(false);
            setZoomAt(Math.max(ZOOM_MIN, from / ZOOM_STEP));
          },
          busy,
        )}
        <button
          type="button"
          className="pv-bar-zoom"
          title="Back to the page across the width"
          onClick={() => {
            setFit(false);
            setZoomAt(1);
          }}
        >
          {fit ? "Page" : zoom === 1 ? "Width" : `${Math.round(zoom * 100)}%`}
        </button>
        {button(
          "Zoom in",
          <Plus size={15} />,
          () => {
            const from = fit ? fitZoom : zoomAt;
            setFit(false);
            setZoomAt(Math.min(ZOOM_MAX, from * ZOOM_STEP));
          },
          busy,
        )}
        {paged && button("Fit the whole page", <Maximize2 size={15} />, () => setFit(true), busy)}
      </div>
      <div className="pv-stage" ref={stage} style={{ opacity: busy ? 0.45 : 1 }}>
        {error ? (
          <p style={{ margin: 0, padding: 18, fontSize: 12.5, color: C.red, lineHeight: 1.6 }}>
            {error}
          </p>
        ) : opened?.kind === "pdf" && bytes ? (
          <PdfView opened={opened} bytes={bytes} zoom={zoom} page={page} onPage={setPage} />
        ) : opened && bytes ? (
          <WordView opened={opened} bytes={bytes} zoom={zoom} page={page} onPage={setPage} />
        ) : null}
      </div>
    </div>
  );
}
