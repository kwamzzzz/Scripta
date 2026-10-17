/**
 * A small picture of a document, and a proper look at it on hover.
 *
 * A row that says "GT GM DMCC Invoice — 25 June 2026" tells you the name
 * somebody typed. A picture of page one tells you it is an invoice, on the
 * client's paper, with a stamp in the corner — which is how a lawyer finds the
 * right file among five with similar names.
 *
 * The tile alone is too small to read, so pointing at it opens a peek: page
 * one at a size you can actually read, beside the row, without opening the
 * document. That is the whole point — the reader is deciding WHICH file to
 * open, and every file they open to find out is a file they did not need.
 *
 *     <DocThumb file={{ id: doc.id, fileRef: doc.storagePath }} name={doc.name} />
 *
 * It degrades honestly: a quiet frame while the file is being read, and the
 * extension where there is nothing to draw — a file still uploading, a format
 * we cannot rasterise — rather than a blank page pretending to be one. Every
 * picture is cached per file id, in memory and in browser storage, so a list
 * scrolled twice renders once and the peek costs nothing.
 */
import { useEffect, useRef, useState } from "react";
import { useFileThumbnail, type ThumbFile } from "@/lib/thumbnails";
import { fileKindLabel } from "@/lib/file-kind";

/** How wide the peek is drawn. The thumbnails are rendered at 360px, so this
 *  is as large as it can be without being an enlargement of a small picture. */
const PEEK_WIDTH = 330;

export default function DocThumb({
  file,
  name,
  meta,
  /** The width in pixels; the height follows the page's proportions. */
  size = 34,
  /** A bigger look on hover. Off where the tile is already large. */
  peek = true,
  className,
}: {
  file: ThumbFile | null;
  name?: string | null;
  /** A line under the peek: what it is, when it arrived. */
  meta?: string | null;
  size?: number;
  peek?: boolean;
  className?: string;
}) {
  const thumb = useFileThumbnail(file);
  const height = Math.round(size * 1.3);
  const label = fileKindLabel(name, file?.fileRef);
  const frame = useRef<HTMLSpanElement>(null);
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);

  /* Escape closes it, as it closes everything else that floats. */
  useEffect(() => {
    if (!at) return;
    const key = (event: KeyboardEvent) => event.key === "Escape" && setAt(null);
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [at]);

  const show = () => {
    if (!peek || thumb.status !== "ready" || !thumb.src) return;
    const box = frame.current?.getBoundingClientRect();
    if (!box) return;
    const tall = Math.round(PEEK_WIDTH * 1.3) + (meta ? 54 : 34);
    /* Beside the row where there is room, and on the other side where there is
       not; never off the top or the bottom of the window. */
    const left =
      box.right + 12 + PEEK_WIDTH < window.innerWidth
        ? box.right + 12
        : Math.max(8, box.left - PEEK_WIDTH - 12);
    const top = Math.min(Math.max(8, box.top - 8), Math.max(8, window.innerHeight - tall - 8));
    setAt({ top, left });
  };

  return (
    <>
      <span
        ref={frame}
        className={`px-thumb${className ? ` ${className}` : ""}`}
        style={{ width: size, height }}
        title={peek ? undefined : (name ?? undefined)}
        onMouseEnter={show}
        onMouseLeave={() => setAt(null)}
        onFocus={show}
        onBlur={() => setAt(null)}
      >
        {thumb.status === "ready" && thumb.src ? (
          <img src={thumb.src} alt={name ? `First page of ${name}` : ""} />
        ) : thumb.status === "loading" ? (
          <span className="px-thumb-wait" />
        ) : (
          <span className="px-thumb-kind" style={{ fontSize: Math.max(7, Math.round(size / 4.2)) }}>
            {label}
          </span>
        )}
      </span>
      {at && thumb.src && (
        <span className="px-peek" style={{ top: at.top, left: at.left, width: PEEK_WIDTH }}>
          <img src={thumb.src} alt="" />
          {(name || meta) && (
            <span className="px-peek-say">
              {name && <b>{name}</b>}
              {meta && <i>{meta}</i>}
            </span>
          )}
        </span>
      )}
    </>
  );
}
