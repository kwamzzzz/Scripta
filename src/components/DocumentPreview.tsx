import { useCallback, useMemo, useRef, type CSSProperties, type ReactNode } from "react";
import {
  buildPreview,
  outstandingCount,
  outstandingFacts,
  PREVIEW_COLUMNS,
  type PreviewClause,
} from "@/lib/export/preview";
import type { ExportClause } from "@/lib/export/docx";
import type { FrontMatter, FrontMatterLine } from "@/lib/export/front-matter";
import { C, mono } from "@/lib/tokens";

/**
 * A finished document, read before it is sent.
 *
 * One component for every document the app produces — a reviewed contract, a
 * research report, a board resolution — because they are all the same shape by
 * the time they are finished: a title, a subtitle and a list of numbered parts.
 * A separate preview per section would be three chances for one of them to
 * quietly disagree with the file it claims to be showing.
 *
 * It draws one column or two, and the document decides which. A contract that
 * has been marked up has something to compare and gets both, scrolling
 * together. A research report or a contract drafted from scratch has nothing
 * tracked, so it gets one — showing the same words twice with one column
 * labelled "Compared" would be a comparison in name only.
 */

export type DownloadKind = "redline" | "clean";
export type DownloadFormat = "docx" | "pdf";

function Part({ clause, redline }: { clause: PreviewClause; redline: boolean }) {
  return (
    <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.rowRule}` }}>
      <div style={{ display: "flex", gap: 8, alignItems: "baseline", marginBottom: 5 }}>
        {clause.num && !clause.unnumbered && (
          <span style={{ fontFamily: mono, fontSize: 11.5, color: C.muted, flex: "none" }}>
            {clause.num}
          </span>
        )}
        <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{clause.title}</span>
      </div>
      {clause.emptyWhenClean && !redline ? (
        // The row stays so the two columns keep step. Saying the clause is gone
        // is more use than a blank the reader has to interpret.
        <div style={{ fontSize: 12.5, color: C.red, fontStyle: "italic" }}>
          Deleted — this does not appear in the clean copy.
        </div>
      ) : (
        <p
          style={{
            fontSize: 13,
            lineHeight: 1.7,
            color: C.body,
            margin: 0,
            whiteSpace: "pre-wrap",
          }}
        >
          {clause.runs.map((run, i) => (
            <span
              key={i}
              style={
                run.kind === "i"
                  ? { textDecoration: "underline", color: "#137333" }
                  : run.kind === "d"
                    ? { textDecoration: "line-through", color: C.red }
                    : undefined
              }
            >
              {run.text}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

/** The page's own face for the front: Arial, as the export sets it. */
const frontFace = "Arial, Helvetica, sans-serif";

/** One run of the front, in the weight and position the page gives it. */
const frontRuns = (line: FrontMatterLine) =>
  (line.runs ?? [{ text: line.text }]).map((run, i) => {
    const text = run.text;
    if (run.sup) return <sup key={i}>{text}</sup>;
    return run.bold ? <b key={i}>{text}</b> : <span key={i}>{text}</span>;
  });

/**
 * A party line: the number at the margin, the particulars hanging 1.25cm in
 * on every line, which is what the tab and hanging indent do in Word.
 */
const splitAtTab = (line: FrontMatterLine) => {
  const runs = line.runs ?? [{ text: line.text }];
  const at = runs.findIndex((r) => r.text.includes("\t"));
  if (at < 0) return null;
  const [head, ...rest] = runs[at]!.text.split("\t");
  return {
    number:
      runs
        .slice(0, at)
        .map((r) => r.text)
        .join("") + head,
    rest: [{ ...runs[at]!, text: rest.join("\t") }, ...runs.slice(at + 1)],
  };
};

/** The cover and the preamble, as the page will read them. */
function Front({ front }: { front: FrontMatter }) {
  const line = (l: FrontMatterLine, i: number) => {
    if (l.rule)
      return <div key={i} style={{ borderBottom: `1px solid ${C.text}`, margin: "8px 0" }} />;
    const cover = l.size === "cover";
    const base: CSSProperties = {
      margin: `${(l.spaceBefore ?? 0) / 20}px 0 ${(l.spaceAfter ?? 0) / 20}px`,
      fontFamily: frontFace,
      fontSize: cover ? 15 : 13,
      lineHeight: 1.5,
      color: C.body,
      textAlign: l.align,
      fontWeight: l.strong ? 700 : 400,
      ...(l.framed
        ? {
            borderTop: `1px solid ${C.text}`,
            borderBottom: `1px solid ${C.text}`,
            padding: "6px 0",
          }
        : {}),
    };
    if (!l.text) return <p key={i} style={{ ...base, minHeight: "1.5em" }} />;
    const hanging = l.hanging ? splitAtTab(l) : null;
    if (hanging)
      return (
        <p key={i} style={{ ...base, display: "grid", gridTemplateColumns: "2.95em 1fr" }}>
          <span>{hanging.number}</span>
          <span>{frontRuns({ ...l, runs: hanging.rest })}</span>
        </p>
      );
    return (
      <p key={i} style={base}>
        {frontRuns(l)}
      </p>
    );
  };
  return (
    <div style={{ borderBottom: `1px solid ${C.border}` }}>
      <div
        style={{
          padding: "22px 18px",
          // The title as far down page one as it was placed, on a page drawn
          // to the same proportions.
          ...(front.coverY
            ? { minHeight: 300, paddingTop: 22 + Math.round(240 * front.coverY) }
            : {}),
        }}
      >
        {front.cover.map(line)}
      </div>
      {/* Where the page break falls. Page one is the cover and nothing else. */}
      <div
        style={{
          borderTop: `1px dashed ${C.border}`,
          padding: "3px 18px",
          fontFamily: mono,
          fontSize: 9.5,
          color: C.faint,
          letterSpacing: ".06em",
        }}
      >
        PAGE BREAK
      </div>
      <div style={{ padding: "14px 18px" }}>{front.preamble.map(line)}</div>
    </div>
  );
}

export default function DocumentPreview({
  title,
  subtitle,
  clauses,
  front,
  loading = false,
  busy = null,
  error = null,
  unit = "clauses",
  options,
  onDownload,
}: {
  title: string;
  subtitle?: string | undefined;
  clauses: ExportClause[];
  /** The cover and preamble, when the document has them. A memo does not. */
  front?: FrontMatter | undefined;
  loading?: boolean | undefined;
  /** `${kind}-${format}` of the download in flight, so only that one says so. */
  busy?: string | null | undefined;
  error?: string | null | undefined;
  /** What the parts are called here: clauses, sections, resolutions. */
  unit?: string | undefined;
  /**
   * A choice about the file itself, shown beside the title. The letterhead is
   * the first of these: what a screen decides about its own document does not
   * belong in the shared preview, but it does belong on screen next to the
   * buttons that produce it.
   */
  options?: ReactNode | undefined;
  onDownload: (kind: DownloadKind, format: DownloadFormat) => void;
}) {
  const preview = useMemo(() => buildPreview(clauses), [clauses]);
  const outstanding = useMemo(() => outstandingFacts(clauses, front), [clauses, front]);
  const missing = outstandingCount(outstanding);

  /**
   * One scroll, two panes.
   *
   * Whichever pane the reader is in drives the other, and the driven pane is
   * marked while it moves so its own scroll event cannot drive back — without
   * that the two fight each other and the document judders.
   */
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const driven = useRef<HTMLDivElement | null>(null);
  const sync = useCallback((from: HTMLDivElement | null, to: HTMLDivElement | null) => {
    if (!from || !to || driven.current === from) {
      driven.current = null;
      return;
    }
    driven.current = to;
    to.scrollTop = from.scrollTop;
  }, []);

  const button = (kind: DownloadKind, format: DownloadFormat, label: string) => {
    const key = `${kind}-${format}`;
    return (
      <button
        type="button"
        onClick={() => onDownload(kind, format)}
        disabled={busy !== null}
        style={{
          border: `1px solid ${C.border}`,
          background: "#fff",
          borderRadius: 6,
          padding: "5px 11px",
          fontSize: 12,
          color: C.text,
          cursor: busy ? "default" : "pointer",
          opacity: busy && busy !== key ? 0.5 : 1,
          font: "inherit",
          fontFamily: "inherit",
        }}
      >
        {busy === key ? "Preparing…" : label}
      </button>
    );
  };

  const pane = (
    which: DownloadKind,
    ref: React.RefObject<HTMLDivElement | null>,
    other: React.RefObject<HTMLDivElement | null>,
    parts: PreviewClause[],
  ) => (
    <div style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
      <div
        style={{
          flex: "none",
          padding: "10px 18px",
          borderBottom: `1px solid ${C.border}`,
          background: C.panel,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
            {preview.comparable ? PREVIEW_COLUMNS[which].label : "Document"}
          </span>
          <div style={{ flex: 1 }} />
          {button(which, "docx", "Word")}
          {button(which, "pdf", "PDF")}
        </div>
        <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.5 }}>
          {preview.comparable
            ? PREVIEW_COLUMNS[which].hint
            : "Nothing is tracked on this document, so there is no comparison to draw. This is the whole of it."}
        </div>
      </div>
      <div
        ref={ref}
        onScroll={() => sync(ref.current, other.current)}
        style={{ flex: 1, minHeight: 0, overflowY: "auto", background: "#fff" }}
      >
        {loading ? (
          <div style={{ padding: 18, fontSize: 12.5, color: C.muted }}>Loading…</div>
        ) : (
          <>
            {front && <Front front={front} />}
            {parts.map((c, i) => (
              <Part key={`${c.num}-${i}`} clause={c} redline={which === "redline"} />
            ))}
          </>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div
        style={{
          flex: "none",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "9px 18px",
          borderBottom: `1px solid ${C.border}`,
          fontSize: 12.5,
          color: C.muted,
        }}
      >
        <span style={{ color: C.text, fontWeight: 600 }}>{title}</span>
        {subtitle && <span>{subtitle}</span>}
        <div style={{ flex: 1 }} />
        {options}
        <span style={{ fontFamily: mono, fontSize: 11.5 }}>
          {preview.clean.length} {unit.toUpperCase()}
          {preview.comparable
            ? ` · ${preview.changed} CHANGED${preview.removed ? ` · ${preview.removed} DELETED` : ""}`
            : " · NOTHING TRACKED"}
        </span>
      </div>
      {/* A draft with blanks in it must not look finished. The drafter is told
          to mark what it was not given rather than invent it; this is where
          that instruction becomes worth something, immediately above the
          buttons that send the document. */}
      {missing > 0 && (
        <details
          style={{
            flex: "none",
            padding: "9px 18px",
            borderBottom: `1px solid #E5D8B4`,
            background: "#F6F0DF",
            color: "#8a5b00",
            fontSize: 12.5,
          }}
        >
          <summary style={{ cursor: "pointer" }}>
            <strong>
              {missing} fact{missing === 1 ? "" : "s"} still to fill in
            </strong>{" "}
            — this document is not ready to send.
          </summary>
          <div style={{ marginTop: 8, display: "grid", gap: 5 }}>
            {outstanding.map((entry) => (
              <div key={entry.where} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                <span style={{ fontFamily: mono, fontSize: 11, flex: "none", minWidth: 140 }}>
                  {entry.where}
                </span>
                <span>{entry.fields.join(" · ")}</span>
              </div>
            ))}
          </div>
        </details>
      )}
      {error && (
        <div
          role="alert"
          style={{
            flex: "none",
            padding: "9px 18px",
            background: "#F7ECEA",
            borderBottom: "1px solid #E8CCC7",
            color: C.red,
            fontSize: 12.5,
          }}
        >
          {error}
        </div>
      )}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: preview.comparable ? "1fr 1fr" : "1fr",
          gap: 1,
          background: C.border,
        }}
      >
        {preview.comparable && pane("redline", leftRef, rightRef, preview.redline)}
        {pane("clean", rightRef, leftRef, preview.clean)}
      </div>
    </div>
  );
}
