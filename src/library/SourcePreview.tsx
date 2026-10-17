/**
 * The picture at the top of a Library card: the first page of the source's
 * file, the preview a website offers for its link, or a drawn cover with the
 * kind and title when there is neither. Clicking it previews the source.
 *
 * File thumbnails are drawn by the same renderer as Flow's repository tiles
 * (PDF, Word, slides, sheets, pictures). Both kinds are remembered in this
 * browser, keyed by the file or the link, so a card is drawn once.
 */
import { useEffect, useState } from "react";
import { FileText, Globe } from "lucide-react";
import { loadFileBytes } from "@/lib/files";
import { renderThumbnail } from "@/lib/thumbnails";
import { fetchLinkPreview } from "@/lib/link-preview.functions";
import { hostOf, kindName, type LibrarySource } from "@/lib/library";
import type { LinkPreview } from "@/lib/link-preview";

const THUMB_PREFIX = "px.lib.thumb.1.";
const LINK_PREFIX = "px.lib.link.1.";
const THUMB_LIMIT = 180_000;
const memory = new Map<string, unknown>();

const read = <T,>(key: string): T | undefined => {
  if (memory.has(key)) return memory.get(key) as T;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return undefined;
    const value = JSON.parse(raw) as T;
    memory.set(key, value);
    return value;
  } catch {
    return undefined;
  }
};

const write = (key: string, value: unknown, limit = Infinity) => {
  memory.set(key, value);
  try {
    const raw = JSON.stringify(value);
    if (raw.length <= limit) window.localStorage.setItem(key, raw);
  } catch {
    // A full store only costs a redraw next visit.
  }
};

type Preview =
  | { kind: "loading" }
  | { kind: "thumb"; src: string }
  | { kind: "link"; preview: LinkPreview }
  | { kind: "none" };

/** A thumbnail for the file if it has one, else the link's preview, else nothing. */
function usePreview(source: LibrarySource): Preview {
  const path = source.file?.path ?? null;
  const url = source.url || null;
  const [state, setState] = useState<Preview>({ kind: "loading" });
  useEffect(() => {
    let cancelled = false;
    const done = (p: Preview) => !cancelled && setState(p);
    (async () => {
      if (path) {
        const key = THUMB_PREFIX + path;
        const cached = read<string | null>(key);
        if (cached !== undefined)
          return done(cached ? { kind: "thumb", src: cached } : linkOrNone());
        setState({ kind: "loading" });
        try {
          const thumb = await renderThumbnail(await loadFileBytes(path), source.file!.name);
          write(key, thumb?.src ?? null, THUMB_LIMIT);
          if (thumb) return done({ kind: "thumb", src: thumb.src });
        } catch {
          write(key, null);
        }
      }
      if (url) {
        const key = LINK_PREFIX + url;
        const cached = read<LinkPreview | null>(key);
        if (cached !== undefined)
          return done(cached ? { kind: "link", preview: cached } : { kind: "none" });
        setState({ kind: "loading" });
        try {
          const preview = await fetchLinkPreview({ data: { url } });
          write(key, preview);
          return done(preview ? { kind: "link", preview } : { kind: "none" });
        } catch {
          return done({ kind: "none" });
        }
      }
      done({ kind: "none" });
    })();
    // The file drew nothing: a cached link preview may still stand in for it.
    function linkOrNone(): Preview {
      const cached = url ? read<LinkPreview | null>(LINK_PREFIX + url) : null;
      return cached ? { kind: "link", preview: cached } : { kind: "none" };
    }
    return () => {
      cancelled = true;
    };
  }, [path, url, source.file]);
  return state;
}

export default function SourcePreview({
  source,
  onPreview,
}: {
  source: LibrarySource;
  onPreview: () => void;
}) {
  const preview = usePreview(source);
  const [broken, setBroken] = useState(false);
  const label = source.file
    ? `Preview ${source.file.name}`
    : source.url
      ? `Open ${hostOf(source.url)}`
      : `Open ${source.title}`;
  return (
    <button
      type="button"
      className={`lib-preview is-${preview.kind}`}
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onPreview();
      }}
    >
      {preview.kind === "thumb" ? (
        <img src={preview.src} alt="" loading="lazy" />
      ) : preview.kind === "link" && preview.preview.image && !broken ? (
        <>
          <img
            src={preview.preview.image}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setBroken(true)}
          />
          <span className="lib-preview-site">
            <Globe size={11} aria-hidden /> {preview.preview.site || hostOf(source.url)}
          </span>
        </>
      ) : preview.kind === "link" ? (
        <span className="lib-preview-page">
          <span className="lib-preview-site">
            <Globe size={11} aria-hidden /> {preview.preview.site || hostOf(source.url)}
          </span>
          <strong>{preview.preview.title || source.title}</strong>
          {preview.preview.description && <em>{preview.preview.description}</em>}
        </span>
      ) : preview.kind === "loading" ? (
        <span className="lib-preview-loading" aria-hidden />
      ) : (
        <span className="lib-preview-cover">
          <span>{kindName(source)}</span>
          <strong>{source.title}</strong>
          {source.file ? (
            <em>
              <FileText size={12} aria-hidden /> {source.file.name}
            </em>
          ) : source.url ? (
            <em>
              <Globe size={12} aria-hidden /> {hostOf(source.url)}
            </em>
          ) : null}
        </span>
      )}
    </button>
  );
}
