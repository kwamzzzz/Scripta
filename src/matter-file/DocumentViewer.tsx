/**
 * Reading a document where it is filed.
 *
 * Every document on a matter can be opened, whatever kind it is: a PDF or a
 * Word document laid out page by page, and anything else as the text Scripta
 * extracted from it. A contract or an amendment also offers the review,
 * because that is the other place it is read.
 *
 * The file comes through a short-lived signed URL or a storage download, both
 * of which the storage policy judges: nobody reads a document here that they
 * could not already download.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/primitives";
import { signedUrl } from "@/lib/documents-library";
import type { Doc } from "@/data/legal";

type Source = {
  storagePath: string | null;
  mimeType: string;
  parsedText: string;
};

const kindOf = (doc: Doc, source: Source) => {
  const name = `${doc.name} ${source.storagePath ?? ""}`.toLowerCase();
  if (source.mimeType === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (source.mimeType.includes("wordprocessingml") || name.endsWith(".docx")) return "docx";
  return "text";
};

export default function DocumentViewer({
  doc,
  onOpenReview,
}: {
  doc: Doc;
  /** Present when the document can be read in Contract Review. */
  onOpenReview?: (() => void) | undefined;
}) {
  const source = useQuery({
    queryKey: ["document-source", doc.id],
    retry: false,
    queryFn: async (): Promise<Source> => {
      const { data, error } = await supabase
        .from("documents")
        .select("storage_path, mime_type, parsed_text")
        .eq("id", doc.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("This document is unavailable.");
      return {
        storagePath: data.storage_path,
        mimeType: data.mime_type ?? "",
        parsedText: data.parsed_text ?? "",
      };
    },
  });
  const [problem, setProblem] = useState<string | null>(null);

  const download = async () => {
    setProblem(null);
    const path = source.data?.storagePath;
    if (!path) return setProblem("There is no stored file for this document.");
    try {
      window.open(await signedUrl(path, doc.name), "_blank", "noopener");
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : "The download link could not be made.");
    }
  };

  const s = source.data;
  const kind = s ? kindOf(doc, s) : null;

  return (
    <section className="mfile-viewer" aria-label={`Document: ${doc.name}`}>
      <header className="mfile-viewer-head">
        <div>
          <h3>{doc.name}</h3>
          <p>{[doc.kind, doc.ver, doc.date].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="mfile-viewer-actions">
          {onOpenReview && (
            <Button variant="primary" onClick={onOpenReview}>
              Open in Contract Review
            </Button>
          )}
          <Button onClick={() => void download()} disabled={!s?.storagePath}>
            Download
          </Button>
        </div>
      </header>
      {problem && (
        <p className="org-error" role="alert">
          {problem}
        </p>
      )}
      <div className="mfile-viewer-body">
        {source.isError ? (
          <p className="org-error" role="alert">
            {(source.error as Error).message}
          </p>
        ) : !s ? (
          <p className="org-hint" role="status">
            Opening…
          </p>
        ) : kind === "pdf" && s.storagePath ? (
          <PdfView path={s.storagePath} name={doc.name} />
        ) : kind === "docx" && s.storagePath ? (
          <DocxView path={s.storagePath} fallback={s.parsedText} />
        ) : (
          <TextView text={s.parsedText} parseStatus={doc.parseStatus} />
        )}
      </div>
    </section>
  );
}

/** The most pages drawn at once. A longer PDF says so and can be downloaded. */
const PDF_PAGE_LIMIT = 40;

function PdfView({ path, name }: { path: string; name: string }) {
  const pages = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [truncated, setTruncated] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    setState("loading");
    setTruncated(null);
    void (async () => {
      try {
        const { data, error } = await supabase.storage.from("matter-documents").download(path);
        if (error) throw error;
        const pdfjs = await import("pdfjs-dist");
        const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
        pdfjs.GlobalWorkerOptions.workerSrc = worker;
        const doc = await pdfjs.getDocument({ data: new Uint8Array(await data.arrayBuffer()) })
          .promise;
        const host = pages.current;
        if (!live || !host) return;
        host.innerHTML = "";
        const count = Math.min(doc.numPages, PDF_PAGE_LIMIT);
        // Drawn at twice the column width and shown at the column width, so
        // the text stays sharp on a high-density screen.
        const width = Math.max(480, Math.min(host.clientWidth || 760, 900));
        for (let n = 1; n <= count; n += 1) {
          const page = await doc.getPage(n);
          const natural = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (width * 2) / natural.width });
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(viewport.width);
          canvas.height = Math.round(viewport.height);
          canvas.setAttribute("aria-label", `${name}, page ${n}`);
          await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
          if (!live) return;
          host.appendChild(canvas);
          if (n === 1) setState("ready");
        }
        if (doc.numPages > count) setTruncated(doc.numPages);
      } catch {
        if (live) setState("failed");
      }
    })();
    return () => {
      live = false;
    };
  }, [path, name]);

  return (
    <>
      {state === "loading" && (
        <p className="org-hint" role="status">
          Laying out the document…
        </p>
      )}
      {state === "failed" && (
        <p className="org-hint">
          This PDF could not be laid out here. Download it to open it in its own application.
        </p>
      )}
      <div ref={pages} className="mfile-viewer-pdf" hidden={state === "failed"} />
      {truncated && (
        <p className="org-hint">
          The first {PDF_PAGE_LIMIT} of {truncated} pages are shown. Download the file for the rest.
        </p>
      )}
    </>
  );
}

function DocxView({ path, fallback }: { path: string; fallback: string }) {
  const body = useRef<HTMLDivElement>(null);
  const styles = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    let live = true;
    setState("loading");
    void (async () => {
      try {
        const { data, error } = await supabase.storage.from("matter-documents").download(path);
        if (error) throw error;
        const { renderAsync } = await import("docx-preview");
        if (!live || !body.current || !styles.current) return;
        body.current.innerHTML = "";
        styles.current.innerHTML = "";
        await renderAsync(await data.arrayBuffer(), body.current, styles.current, {
          inWrapper: true,
          useBase64URL: true,
          renderAltChunks: false,
          ignoreLastRenderedPageBreak: false,
          breakPages: true,
        });
        if (live) setState("ready");
      } catch {
        if (live) setState("failed");
      }
    })();
    return () => {
      live = false;
    };
  }, [path]);

  return (
    <>
      {state === "loading" && (
        <p className="org-hint" role="status">
          Laying out the document…
        </p>
      )}
      {state === "failed" && (
        <>
          <p className="org-hint">
            This Word document could not be laid out here, so its extracted text is shown instead.
          </p>
          <TextView text={fallback} parseStatus="parsed" />
        </>
      )}
      <div ref={styles} hidden />
      <div ref={body} className="mfile-viewer-docx" hidden={state === "failed"} />
    </>
  );
}

function TextView({ text, parseStatus }: { text: string; parseStatus: Doc["parseStatus"] }) {
  if (!text.trim())
    return (
      <p className="org-hint">
        {parseStatus === "failed"
          ? "Scripta could not read this file. Download it to open it in its own application."
          : parseStatus === "parsed"
            ? "No text was found in this file. Download it to open it in its own application."
            : "Scripta is still reading this file."}
      </p>
    );
  return <div className="mfile-viewer-text">{text}</div>;
}
