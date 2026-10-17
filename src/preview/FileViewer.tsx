/**
 * The document viewer: a file opened full screen, drawn properly, whatever it
 * is — a PDF, a Word document, a deck, a workbook, a picture or plain text.
 *
 * The chrome is the same for all of them, because someone checking a draft
 * should not have to learn a new set of controls per file type: the pages run
 * down a filmstrip on the left, the paper sits on the stage, and paging, zoom
 * and the download sit in one bar at the foot of it. Arrow keys page,
 * + and − zoom, Escape closes.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Maximize2,
  Minus,
  PenLine,
  Plus,
  X,
} from "lucide-react";
import { Modal } from "@/wireframe/screens";
import { downloadFile } from "@/lib/files";
import { useDocument } from "./document";
import { KIND_LOOK } from "./model";
import { drawSlide, ImageView, PdfView, SheetView, SlidesView, TextView } from "./views";
import type { Opened } from "./document";
import type { Deck } from "./slides";
import type { PdfDoc } from "./pdf";
import { WordView } from "./views";
import "./preview.css";

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

export default function FileViewer({
  open,
  fileRef,
  name,
  meta,
  downloadName,
  editorLabel,
  onOpenEditor,
  onClose,
}: {
  open: boolean;
  /** Where the file lives; null while a deliverable has nothing attached. */
  fileRef: string | null;
  name: string;
  /** The line under the name: version, state, date, who. */
  meta?: string;
  downloadName?: string;
  /** Offered beside Download when the document has an editor of its own. */
  editorLabel?: string;
  onOpenEditor?: () => void;
  onClose: () => void;
}) {
  const doc = useDocument(fileRef, name, open);
  const [page, setPage] = useState(1);
  const [zoomAt, setZoomAt] = useState(2);
  const [fit, setFit] = useState(true);
  const zoom = fit ? 1 : ZOOMS[zoomAt]!;
  const look = KIND_LOOK[doc.kind];
  const count = doc.opened?.count ?? 1;
  const paging = (doc.opened?.kind === "pdf" || doc.opened?.kind === "slides") && count > 1;

  useEffect(() => {
    if (open) {
      setPage(1);
      setFit(true);
      setZoomAt(2);
    }
  }, [open, fileRef]);

  const go = useCallback(
    (to: number) => setPage((p) => Math.min(Math.max(to, 1), Math.max(count, 1)) || p),
    [count],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") go(page + 1);
      else if (e.key === "ArrowLeft" || e.key === "PageUp") go(page - 1);
      else if (e.key === "+" || e.key === "=") {
        setFit(false);
        setZoomAt((z) => Math.min(z + 1, ZOOMS.length - 1));
      } else if (e.key === "-") {
        setFit(false);
        setZoomAt((z) => Math.max(z - 1, 0));
      } else if (e.key === "0") setFit(true);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, page, go]);

  const download = () => {
    if (fileRef) void downloadFile(fileRef, downloadName || name);
  };

  return (
    <Modal open={open} onClose={onClose} label={`Preview of ${name}`}>
      <div className="pv" onClick={(e) => e.stopPropagation()}>
        <header className="pv-bar">
          <span className="pv-kind" style={{ background: look.tint, color: look.ink }}>
            {look.short}
          </span>
          <div className="pv-title">
            <strong title={name}>{name}</strong>
            {meta && <span>{meta}</span>}
          </div>
          <div className="pv-bar-tools">
            {onOpenEditor && (
              <button type="button" className="pv-button" onClick={onOpenEditor}>
                <PenLine size={14} aria-hidden /> {editorLabel ?? "Open in editor"}
              </button>
            )}
            <button
              type="button"
              className="pv-button"
              onClick={download}
              disabled={!fileRef}
              title="Download this file"
            >
              <Download size={14} aria-hidden /> Download
            </button>
            <button type="button" className="pv-icon" onClick={onClose} aria-label="Close preview">
              <X size={16} aria-hidden />
            </button>
          </div>
        </header>

        <div className="pv-body">
          {doc.opened && count > 1 && (
            <Filmstrip opened={doc.opened} page={page} onGo={go} kind={doc.kind} />
          )}
          <div className="pv-stage">
            {doc.status === "loading" && (
              <p className="pv-state">Opening {look.label.toLowerCase()}…</p>
            )}
            {doc.status === "error" && (
              <div className="pv-state">
                <p>{doc.error}</p>
                {fileRef && (
                  <button type="button" className="pv-button" onClick={download}>
                    <Download size={14} aria-hidden /> Download instead
                  </button>
                )}
              </div>
            )}
            {doc.status === "ready" && doc.opened && doc.bytes && (
              <View
                opened={doc.opened}
                bytes={doc.bytes}
                zoom={zoom}
                page={page}
                onPage={setPage}
              />
            )}

            {doc.status === "ready" && (
              <div className="pv-pill">
                {paging && (
                  <>
                    <button
                      type="button"
                      aria-label="Previous page"
                      disabled={page <= 1}
                      onClick={() => go(page - 1)}
                    >
                      <ChevronLeft size={15} aria-hidden />
                    </button>
                    <span className="pv-count">
                      {page} <i>/</i> {count}
                    </span>
                    <button
                      type="button"
                      aria-label="Next page"
                      disabled={page >= count}
                      onClick={() => go(page + 1)}
                    >
                      <ChevronRight size={15} aria-hidden />
                    </button>
                    <span className="pv-pill-rule" />
                  </>
                )}
                <button
                  type="button"
                  aria-label="Zoom out"
                  onClick={() => {
                    setFit(false);
                    setZoomAt((z) => Math.max(z - 1, 0));
                  }}
                >
                  <Minus size={15} aria-hidden />
                </button>
                <span className="pv-count">{fit ? "Fit" : `${Math.round(zoom * 100)}%`}</span>
                <button
                  type="button"
                  aria-label="Zoom in"
                  onClick={() => {
                    setFit(false);
                    setZoomAt((z) => Math.min(z + 1, ZOOMS.length - 1));
                  }}
                >
                  <Plus size={15} aria-hidden />
                </button>
                <button type="button" aria-label="Fit to the screen" onClick={() => setFit(true)}>
                  <Maximize2 size={14} aria-hidden />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function View(props: {
  opened: Opened;
  bytes: ArrayBuffer;
  zoom: number;
  page: number;
  onPage: (page: number) => void;
}) {
  switch (props.opened.kind) {
    case "pdf":
      return <PdfView {...props} />;
    case "slides":
      return <SlidesView {...props} />;
    case "sheet":
      return <SheetView {...props} />;
    case "word":
      return <WordView {...props} />;
    case "image":
      return <ImageView {...props} />;
    default:
      return <TextView {...props} />;
  }
}

/** The pages, slides or sheets of the open document, down the left. */
function Filmstrip({
  opened,
  page,
  onGo,
  kind,
}: {
  opened: Opened;
  page: number;
  onGo: (page: number) => void;
  kind: keyof typeof KIND_LOOK;
}) {
  if (opened.kind === "sheet")
    return (
      <nav className="pv-rail is-list" aria-label="Sheets">
        {opened.sheets.map((sheet, i) => (
          <button
            key={`${sheet.name}-${i}`}
            type="button"
            className={`pv-rail-sheet${page === i + 1 ? " is-on" : ""}`}
            onClick={() => onGo(i + 1)}
          >
            {sheet.name}
          </button>
        ))}
      </nav>
    );
  if (opened.kind !== "pdf" && opened.kind !== "slides") return null;
  return (
    <nav className="pv-rail" aria-label={kind === "slides" ? "Slides" : "Pages"}>
      {Array.from({ length: opened.count }, (_, i) => (
        <button
          key={i}
          type="button"
          className={`pv-thumb${page === i + 1 ? " is-on" : ""}`}
          aria-current={page === i + 1}
          onClick={() => onGo(i + 1)}
        >
          <ThumbCanvas opened={opened} page={i + 1} />
          <span>{i + 1}</span>
        </button>
      ))}
    </nav>
  );
}

const THUMB = 116;

function ThumbCanvas({
  opened,
  page,
}: {
  opened: Extract<Opened, { kind: "pdf" | "slides" }>;
  page: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(page <= 8);

  useEffect(() => {
    const host = holder.current;
    if (!host || near) return;
    const observer = new IntersectionObserver(
      (entries) => entries.some((e) => e.isIntersecting) && setNear(true),
      { rootMargin: "300px 0px" },
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, [near]);

  useEffect(() => {
    if (!near || !canvas.current) return;
    const target = canvas.current;
    let live = true;
    const work: Promise<unknown> =
      opened.kind === "pdf"
        ? (opened.doc as PdfDoc).draw(page, target, THUMB)
        : drawSlide(opened.deck as Deck, page, target, THUMB);
    void work.catch(() => {
      if (live) target.getContext("2d")?.clearRect(0, 0, target.width, target.height);
    });
    return () => {
      live = false;
    };
  }, [near, opened, page]);

  return (
    <div className="pv-thumb-paper" ref={holder}>
      <canvas ref={canvas} width={THUMB} />
    </div>
  );
}
