import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { exportMatterDocument, loadMatterExport } from "@/lib/exports.functions";
import { downloadBytes, DOCX_MIME, PDF_MIME } from "@/lib/export/download";
import DocumentPreview, {
  type DownloadFormat,
  type DownloadKind,
} from "@/components/DocumentPreview";
import { EmptyState } from "@/components/primitives";
import LoadError from "@/components/LoadError";
import PagePreview, { type PreviewFormat, type PreviewKind } from "@/components/PagePreview";
import { C } from "@/lib/tokens";
import { withDeadline } from "@/lib/deadline";

/**
 * The finished contract, before it leaves.
 *
 * The exporters build a clean copy and a compared copy in Word and PDF, and
 * the Word compared copy carries real tracked revisions a lawyer can accept or
 * reject rather than coloured text that resembles a redline. Nothing in the
 * app called any of it, so a lawyer could finish a contract and had no way to
 * get it out.
 *
 * The preview and the file come from one read, so the two cannot disagree — a
 * preview that can disagree with the file is worse than none, because it is a
 * check that passes when it should not. The reading itself is
 * `DocumentPreview`, shared with every other document the app produces.
 *
 * The cover page is edited in the Contract Editor, where the rest of the
 * document is edited, not here. This screen reads the finished thing.
 */

const b64ToBytes = (b64: string): Uint8Array => {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

export default function FinalDocument({ matterId }: { matterId: string }) {
  const load = useServerFn(loadMatterExport);
  const exportDoc = useServerFn(exportMatterDocument);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * On the firm's paper, or not.
   *
   * Every contract used to come out on the workspace letterhead with no way to
   * say otherwise, which is wrong for a draft going to the other side's
   * counsel, for a schedule that will be appended to someone else's document,
   * and for anything being sent for comment rather than signature. The default
   * stays as it was.
   */
  // Null while the document is still loading: the choice belongs to the matter,
  // and until it arrives this screen has no business having an opinion.
  /**
   * Which preview: the pages as they will be exported, or the two readings
   * side by side. The pages answer "does it look right"; the readings answer
   * "what changed". The pages come first, because that is the question asked
   * last, with a hand on the send button.
   */
  const [view, setView] = useState<"pages" | "text">("pages");
  const [shown, setShown] = useState<PreviewKind>("clean");
  /* A contract normally leaves as Word, so Word is what the preview shows. */
  const [as, setAs] = useState<PreviewFormat>("docx");
  /** The pages, over the whole window. Escape puts them back. */
  const [full, setFull] = useState(false);
  useEffect(() => {
    if (!full) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [full]);

  const doc = useQuery({
    queryKey: ["matter-export", matterId],
    /* With a deadline, because a call that never comes back rendered an empty
       contract: no clauses, no letterhead control, no preview, and no way to
       tell that anything had gone wrong. One retry, since the first failure of
       a read is usually the network rather than the document. */
    queryFn: () => withDeadline(load({ data: { matterId } }), 25, "The document"),
    retry: 1,
  });

  /**
   * What the matter says, full stop.
   *
   * This screen used to carry its own checkbox and override it for the
   * session. Two answers to one question, on two cards, and the one next to
   * Download was the one that reached the file — so a contract could preview
   * on plain paper and export on the firm's. Whether page one carries the
   * letterhead is asked on the cover page, where the change can be seen.
   */
  const on = doc.data?.useLetterhead ?? true;

  const download = async (kind: DownloadKind, format: DownloadFormat) => {
    setBusy(`${kind}-${format}`);
    setError(null);
    try {
      const file = await exportDoc({ data: { matterId, kind, format, letterhead: on } });
      downloadBytes(
        b64ToBytes(file.base64),
        file.filename,
        format === "docx" ? DOCX_MIME : PDF_MIME,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The document could not be exported.");
    } finally {
      setBusy(null);
    }
  };

  if (doc.isError)
    return (
      <LoadError what="contract" error={doc.error as Error} onRetry={() => void doc.refetch()} />
    );

  if (!doc.isPending && (doc.data?.clauses.length ?? 0) === 0)
    return (
      <EmptyState
        title="There is no document here yet"
        body="Upload a contract and generate its review, or start one from scratch, and the finished document will appear here."
      />
    );

  const tab = (key: "pages" | "text", label: string, hint: string) => (
    <button
      type="button"
      title={hint}
      onClick={() => setView(key)}
      style={{
        border: `1px solid ${view === key ? C.accentEdge : C.border}`,
        background: view === key ? "#fff" : "transparent",
        color: view === key ? C.text : C.muted,
        borderRadius: 6,
        padding: "4px 10px",
        fontSize: 12,
        fontWeight: view === key ? 600 : 400,
        cursor: "pointer",
        font: "inherit",
      }}
    >
      {label}
    </button>
  );

  if (view === "pages" && doc.data)
    return (
      <div
        style={
          full
            ? {
                position: "fixed",
                inset: 0,
                zIndex: 60,
                background: "#fff",
                display: "flex",
                flexDirection: "column",
                minWidth: 0,
              }
            : {
                display: "flex",
                flexDirection: "column",
                flex: 1,
                minHeight: 0,
                // Definite, so a zoomed page scrolls inside the preview
                // instead of stretching this — and the controls — past the
                // side of the window.
                width: "100%",
                minWidth: 0,
              }
        }
      >
        {/* One row. Wrapped over three on a narrower window it ate the height
            the pages needed, and left a strip of document under a stack of
            controls. */}
        <div
          style={{
            flex: "none",
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 14px",
            borderBottom: `1px solid ${C.border}`,
            fontSize: 12.5,
            color: C.muted,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              color: C.text,
              fontWeight: 600,
              maxWidth: 240,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={`${doc.data.title} — the pages as they will be exported`}
          >
            {doc.data.title}
          </span>
          <div style={{ flex: 1 }} />
          {tab("pages", "Pages", "The exported file itself, page by page")}
          {tab("text", "Compare", "The two readings side by side, clause by clause")}
          <span style={{ width: 8 }} />
          <button
            type="button"
            onClick={() => setFull(!full)}
            title={full ? "Back to the tab (Esc)" : "Read the pages over the whole window"}
            style={{
              border: `1px solid ${C.border}`,
              background: "#fff",
              borderRadius: 6,
              padding: "4px 10px",
              fontSize: 12,
              color: C.text,
              cursor: "pointer",
              font: "inherit",
            }}
          >
            {full ? "Close" : "Full screen"}
          </button>
          {(["docx", "pdf"] as PreviewFormat[]).map((f) => (
            <button
              key={f}
              type="button"
              title={
                f === "docx"
                  ? "The Word file itself, laid out as Word lays it out"
                  : "The PDF, exact about where every page breaks"
              }
              onClick={() => setAs(f)}
              style={{
                border: `1px solid ${as === f ? C.accentEdge : C.border}`,
                background: as === f ? "#fff" : "transparent",
                color: as === f ? C.text : C.muted,
                borderRadius: 6,
                padding: "4px 10px",
                fontSize: 12,
                cursor: "pointer",
                font: "inherit",
              }}
            >
              {f === "docx" ? "Word" : "PDF"}
            </button>
          ))}
          <span style={{ width: 8 }} />
          {(["clean", "redline"] as PreviewKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setShown(k)}
              style={{
                border: `1px solid ${shown === k ? C.accentEdge : C.border}`,
                background: shown === k ? "#fff" : "transparent",
                color: shown === k ? C.text : C.muted,
                borderRadius: 6,
                padding: "4px 10px",
                fontSize: 12,
                cursor: "pointer",
                font: "inherit",
              }}
            >
              {k === "clean" ? "Clean copy" : "Marked up"}
            </button>
          ))}
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void download(shown, "docx")}
            style={{
              border: `1px solid ${C.border}`,
              background: "#fff",
              borderRadius: 6,
              padding: "5px 11px",
              fontSize: 12,
              color: C.text,
              cursor: busy ? "default" : "pointer",
              font: "inherit",
            }}
          >
            {busy === `${shown}-docx` ? "Preparing…" : "Download Word"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void download(shown, "pdf")}
            style={{
              border: `1px solid ${C.border}`,
              background: "#fff",
              borderRadius: 6,
              padding: "5px 11px",
              fontSize: 12,
              color: C.text,
              cursor: busy ? "default" : "pointer",
              font: "inherit",
            }}
          >
            {busy === `${shown}-pdf` ? "Preparing…" : "Download PDF"}
          </button>
        </div>
        {error && (
          <p style={{ margin: 0, padding: "8px 18px", fontSize: 12.5, color: C.red }} role="alert">
            {error}
          </p>
        )}
        <PagePreview matterId={matterId} kind={shown} format={as} letterhead={on} />
      </div>
    );

  return (
    <DocumentPreview
      title={doc.data?.title ?? "Contract"}
      subtitle={doc.data?.subtitle}
      clauses={doc.data?.clauses ?? []}
      front={doc.data?.front}
      loading={doc.isPending}
      busy={busy}
      error={error}
      unit="clauses"
      options={
        <>
          {tab("pages", "Pages", "The exported file itself, page by page")}
          {tab("text", "Compare", "The two readings side by side, clause by clause")}
        </>
      }
      onDownload={(kind, format) => void download(kind, format)}
    />
  );
}
