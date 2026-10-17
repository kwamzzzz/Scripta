/**
 * One finding, as every Book Review screen shows it: what kind of thing it is
 * and what it asks of the author, the words it is about, the places it rests
 * on (each one a link into the chapter), and the decision.
 */
import { Chip } from "@/review/ui";
import { Button } from "@/components/primitives";
import type { Chapter, Finding, StoredNode } from "./db";
import { placeName } from "./findings";
import { splitSentences } from "./sentences";
import { ACTION_LABEL, CATEGORY_LABEL, SEVERITY_LABEL, type FindingStatus } from "./model";

const SEVERITY_TONE = { critical: "critical", material: "high", minor: "low" } as const;
const ACTION_TONE = { correction: "ok", query: "info", suggestion: "quiet" } as const;
const STATUS_LABEL: Record<FindingStatus, string> = {
  open: "Open",
  accepted: "Accepted",
  resolved: "Resolved",
  dismissed: "Dismissed",
};
const VERIFY_LABEL = {
  remains: "Still in the text",
  fixed: "Fixed in this version",
  introduced: "New in this version",
};

/** A few words either side of the quote, so the place can be recognised. */
function around(text: string, quote: string | undefined, width = 90) {
  if (!quote) return text.length > width * 2 ? `${text.slice(0, width * 2)}…` : text;
  const at = text.indexOf(quote);
  if (at < 0) return text.slice(0, width * 2);
  const start = Math.max(0, at - width);
  const end = Math.min(text.length, at + quote.length + width);
  return {
    before: `${start > 0 ? "…" : ""}${text.slice(start, at)}`,
    quote,
    after: `${text.slice(at + quote.length, end)}${end < text.length ? "…" : ""}`,
  };
}

export default function FindingCard({
  finding: f,
  nodes,
  chapters,
  onDecide,
  onOpenPlace,
  refs,
  compact = false,
}: {
  finding: Finding;
  nodes: Map<string, StoredNode>;
  chapters: Map<string, Chapter>;
  onDecide: (status: FindingStatus) => void;
  onOpenPlace: (nodeKey: string) => void;
  /** "3 ¶2" references for paragraphs (see paragraphRefs). */
  refs?: Map<string, string> | undefined;
  compact?: boolean;
}) {
  const decided = f.status !== "open";
  return (
    <article className={`ms-finding${decided ? " is-decided" : ""}`} id={`finding-${f.id}`}>
      <header className="ms-finding-head">
        <span className="ms-ref">#{String(f.ref).padStart(3, "0")}</span>
        <Chip tone={SEVERITY_TONE[f.severity]}>{SEVERITY_LABEL[f.severity]}</Chip>
        <Chip tone={ACTION_TONE[f.action]}>{ACTION_LABEL[f.action]}</Chip>
        <span className="ms-cat">{CATEGORY_LABEL[f.category] ?? f.category}</span>
        {f.verification && (
          <Chip
            tone={
              f.verification === "introduced"
                ? "medium"
                : f.verification === "fixed"
                  ? "ok"
                  : "quiet"
            }
          >
            {VERIFY_LABEL[f.verification]}
          </Chip>
        )}
        {decided && <Chip tone="quiet">{STATUS_LABEL[f.status]}</Chip>}
      </header>
      <h3 className="ms-finding-title">{f.title}</h3>
      {!compact && f.body && <p className="ms-finding-body">{f.body}</p>}
      {f.action === "correction" && f.original && f.replacement !== null && (
        <p className="ms-change">
          <del>{f.original}</del>
          <span aria-hidden> → </span>
          <ins>{f.replacement}</ins>
        </p>
      )}
      {!compact && f.evidence.length > 0 && (
        <ul className="ms-evidence">
          {f.evidence.map((e, i) => {
            const node = nodes.get(e.nodeKey);
            // A whole chapter is named by its link; its heading is not a passage.
            // The sentence itself where the finding names one; otherwise a
            // window of words either side of the quote.
            const sentence =
              node && e.sentence ? splitSentences(node.text)[e.sentence - 1]?.text : undefined;
            const bit =
              node && node.kind !== "chapter" ? around(sentence ?? node.text, e.quote) : null;
            return (
              <li key={`${e.nodeKey}-${i}`}>
                <button type="button" className="ms-place" onClick={() => onOpenPlace(e.nodeKey)}>
                  {placeName(node, chapters, refs)}
                </button>
                {bit &&
                  (typeof bit === "string" ? (
                    <span className="ms-snippet">{bit}</span>
                  ) : (
                    <span className="ms-snippet">
                      {bit.before}
                      <mark>{bit.quote}</mark>
                      {bit.after}
                    </span>
                  ))}
                {e.note && <span className="ms-note">{e.note}</span>}
              </li>
            );
          })}
        </ul>
      )}
      {f.decisionNote && <p className="ms-muted ms-small">{f.decisionNote}</p>}
      <div className="ms-finding-actions">
        {decided ? (
          <Button variant="quiet" onClick={() => onDecide("open")}>
            Reopen
          </Button>
        ) : (
          <>
            {f.action === "correction" && (
              <Button onClick={() => onDecide("accepted")} title="The author will make this change">
                Accept
              </Button>
            )}
            <Button onClick={() => onDecide("resolved")} title="Dealt with">
              Resolve
            </Button>
            <Button
              variant="quiet"
              onClick={() => onDecide("dismissed")}
              title="Not a problem here; it will not be raised again on this version"
            >
              Dismiss
            </Button>
          </>
        )}
      </div>
    </article>
  );
}
