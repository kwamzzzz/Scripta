import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { BoardDoc } from "@/lib/home-data";

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

/** Storage path for a document's canonical thumbnail, versioned by update time. */
const thumbnailPath = (document: BoardDoc) =>
  document.storagePath!.replace(
    /[^/]+$/,
    `.thumbs/${document.id}-${Date.parse(document.updatedAt) || 0}.png`,
  );

const dataUrlToBlob = async (dataUrl: string) => (await fetch(dataUrl)).blob();

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read thumbnail"));
    reader.readAsDataURL(blob);
  });

/**
 * Rasterize the rendered first page once into a PNG — after this, every
 * view picks the stored image instead of reconstructing the document.
 */
async function snapshotPage(
  page: HTMLElement,
  css: string,
  pageWidth: number,
  pageHeight: number,
): Promise<string> {
  const wrapper = window.document.createElement("div");
  wrapper.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  wrapper.style.cssText = `width:${pageWidth}px;height:${pageHeight}px;overflow:hidden;background:#fff;position:relative`;
  const style = window.document.createElement("style");
  style.textContent = css;
  wrapper.appendChild(style);
  wrapper.appendChild(page.cloneNode(true));
  const serialized = new XMLSerializer().serializeToString(wrapper);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pageWidth}" height="${pageHeight}"><foreignObject width="100%" height="100%">${serialized}</foreignObject></svg>`;
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Snapshot failed"));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
  const scale = 2;
  const canvas = window.document.createElement("canvas");
  canvas.width = Math.round(pageWidth * scale);
  canvas.height = Math.round(pageHeight * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

/** Best effort: persist the canonical thumbnail so the next viewer just picks it. */
async function storeThumbnail(document: BoardDoc, dataUrl: string) {
  try {
    await supabase.storage
      .from("matter-documents")
      .upload(thumbnailPath(document), await dataUrlToBlob(dataUrl), {
        upsert: true,
        contentType: "image/png",
      });
  } catch {
    /* viewing still works from the in-memory image */
  }
}

/** A read-only rendering of the uploaded source, never generated contract content. */
export default function DocumentThumbnail({ document }: { document: BoardDoc }) {
  const host = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [size, setSize] = useState({ width: 380, height: 440 });
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    const resize = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    resize.observe(el);
    return () => {
      observer.disconnect();
      resize.disconnect();
    };
  }, []);
  const preview = useQuery({
    queryKey: ["document-thumbnail", document.id, document.updatedAt, document.storagePath],
    staleTime: 4 * 60 * 1000,
    retry: false,
    enabled: !!document.storagePath && visible,
    queryFn: async () => {
      const ext = (document.storagePath ?? document.name).split(".").pop()?.toLowerCase();
      if (!["docx", "pdf", "txt", "md"].includes(ext ?? ""))
        throw new Error("Preview unavailable for this file type");
      if (document.bytes && document.bytes > 20 * 1024 * 1024)
        throw new Error("Open this large document in its matter");
      if (ext === "pdf") {
        const { data, error } = await supabase.storage
          .from("matter-documents")
          .createSignedUrl(document.storagePath!, 600);
        if (error) throw error;
        return {
          url: data.signedUrl + "#page=1&toolbar=0&navpanes=0&view=FitH",
          html: "",
          img: "",
          pageWidth: 0,
          pageHeight: 0,
        };
      }
      // The container picks the stored true thumbnail when one exists —
      // reconstruction is only ever a one-time fallback to create it.
      if (ext === "docx") {
        const cached = await supabase.storage
          .from("matter-documents")
          .download(thumbnailPath(document));
        if (!cached.error)
          return {
            url: "",
            html: "",
            img: await blobToDataUrl(cached.data),
            pageWidth: 0,
            pageHeight: 0,
          };
      }
      const { data, error } = await supabase.storage
        .from("matter-documents")
        .download(document.storagePath!);
      if (error) throw error;
      let content: string;
      let pageWidth = 0;
      let pageHeight = 0;
      if (ext === "docx") {
        const buffer = await data.arrayBuffer();
        const { default: JSZip } = await import("jszip");
        const archive = await JSZip.loadAsync(buffer);
        const thumbnail = archive.file(/^docProps\/thumbnail\.(png|jpe?g)$/i)[0];
        if (thumbnail) {
          const mime = thumbnail.name.toLowerCase().endsWith("png") ? "image/png" : "image/jpeg";
          const src = `data:${mime};base64,${await thumbnail.async("base64")}`;
          void storeThumbnail(document, src);
          return { url: "", html: "", img: src, pageWidth: 0, pageHeight: 0 };
        }
        const { renderAsync } = await import("docx-preview");
        const body = window.document.createElement("div");
        const styles = window.document.createElement("div");
        await renderAsync(buffer, body, styles, {
          inWrapper: false,
          useBase64URL: true,
          renderAltChunks: false,
          ignoreFonts: true,
          ignoreLastRenderedPageBreak: false,
        });
        const page = body.querySelector<HTMLElement>("section.docx");
        if (!page) throw new Error("No document page available");
        const pixels = (value: string) => parseFloat(value) * (value.endsWith("pt") ? 4 / 3 : 1);
        // docx-preview does not position behind-text drawings against the page.
        // Restore those decorative anchors from the source OOXML coordinates.
        const xmlText = await archive.file("word/document.xml")?.async("string");
        const relText = await archive.file("word/_rels/document.xml.rels")?.async("string");
        if (xmlText && relText) {
          const parser = new DOMParser();
          const xml = parser.parseFromString(xmlText, "application/xml");
          const rels = parser.parseFromString(relText, "application/xml");
          for (const anchor of Array.from(xml.getElementsByTagNameNS("*", "anchor"))) {
            if (!["1", "true"].includes(anchor.getAttribute("behindDoc") ?? "")) continue;
            const blip = anchor.getElementsByTagNameNS("*", "blip")[0];
            const embed = blip?.getAttributeNS(
              "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
              "embed",
            );
            const relationship = Array.from(rels.getElementsByTagNameNS("*", "Relationship")).find(
              (r) => r.getAttribute("Id") === embed,
            );
            const target = relationship?.getAttribute("Target");
            if (!target || relationship?.getAttribute("TargetMode") === "External") continue;
            const entry = archive.file(target.startsWith("/") ? target.slice(1) : `word/${target}`);
            if (!entry) continue;
            const base64 = await entry.async("base64");
            const img = Array.from(page.querySelectorAll("img")).find((image) =>
              image.src.endsWith(base64),
            );
            if (!img) continue;
            const drawing = img.parentElement;
            if (!drawing) continue;
            const coordinate = (axis: "H" | "V") => {
              const position = anchor.getElementsByTagNameNS("*", `position${axis}`)[0];
              const offset =
                Number(position?.getElementsByTagNameNS("*", "posOffset")[0]?.textContent ?? 0) /
                9525;
              const margin =
                position?.getAttribute("relativeFrom") === "margin"
                  ? pixels(axis === "H" ? page.style.paddingLeft : page.style.paddingTop) || 0
                  : 0;
              return offset + margin;
            };
            drawing.style.position = "absolute";
            drawing.style.float = "none";
            drawing.style.left = `${coordinate("H")}px`;
            drawing.style.top = `${coordinate("V")}px`;
            drawing.style.zIndex = "0";
            page.prepend(drawing);
          }
        }

        pageWidth = pixels(page.style.width) || 816;
        pageHeight = pixels(page.style.minHeight || page.style.height) || 1056;
        try {
          const img = await snapshotPage(page, styles.innerHTML, pageWidth, pageHeight);
          void storeThumbnail(document, img);
          return { url: "", html: "", img, pageWidth: 0, pageHeight: 0 };
        } catch {
          /* snapshot failed — fall back to the live reconstruction below */
        }
        content = styles.innerHTML + page.outerHTML;
      } else content = `<pre>${escapeHtml(await data.text())}</pre>`;
      // Isolate source markup; CSP also prevents links, remote images and active content.
      const html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>html{color-scheme:light;background:white}body{margin:0;overflow:hidden}pre{font:13px/1.5 "Century Schoolbook",serif;white-space:pre-wrap;overflow-wrap:anywhere}</style></head><body>${content}</body></html>`;
      return { url: "", html, img: "", pageWidth, pageHeight };
    },
  });
  const data = preview.data;
  const scale = data?.pageWidth
    ? Math.min(size.width / data.pageWidth, size.height / data.pageHeight)
    : 1;
  const html = data?.html.replace(
    "</head>",
    `<style>body{padding:0;display:flex;justify-content:center}section.docx{flex:none;zoom:${scale};box-shadow:none!important;margin:0!important}pre{padding:8px}</style></head>`,
  );
  return (
    <span className="home-thumbnail" ref={host}>
      {!document.storagePath || preview.error ? (
        <span className="home-preview-empty">
          <FileText size={28} strokeWidth={1} />
          <span>Preview unavailable</span>
          <span>Open the matter to view this document</span>
        </span>
      ) : !data ? (
        <span className="home-preview-empty" role="status">
          Loading document preview…
        </span>
      ) : data.img ? (
        <img
          className="home-thumbnail-img"
          alt={`Document thumbnail: ${document.name}`}
          src={data.img}
          draggable={false}
        />
      ) : (
        <iframe
          key={`${document.id}-${scale}`}
          title={`Document preview: ${document.name}`}
          tabIndex={-1}
          sandbox={data.url ? undefined : ""}
          referrerPolicy="no-referrer"
          src={data.url || undefined}
          srcDoc={html || undefined}
        />
      )}
    </span>
  );
}
