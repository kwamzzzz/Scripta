/**
 * Findings, filtered. Open first, most severe first; decided ones are one
 * switch away rather than gone.
 */
import { useMemo, useState } from "react";
import { Button } from "@/components/primitives";
import type { Chapter, Finding, StoredNode } from "./db";
import FindingCard from "./FindingCard";
import { NO_FILTER, sortFindings, type FindingFilter } from "./findings";
import {
  ACTION_LABEL,
  CATEGORY_LABEL,
  SEVERITY_LABEL,
  type FindingAction,
  type FindingCategory,
  type FindingSeverity,
  type FindingStatus,
} from "./model";

const PAGE = 60;

export default function FindingsPanel({
  findings,
  nodes,
  chapters,
  onDecide,
  onDecideMany,
  onOpenPlace,
  initial = NO_FILTER,
  lockChapter,
  refs,
}: {
  refs?: Map<string, string> | undefined;
  findings: Finding[];
  nodes: Map<string, StoredNode>;
  chapters: Map<string, Chapter>;
  onDecide: (f: Finding, status: FindingStatus) => void;
  onDecideMany: (ids: string[], status: FindingStatus) => void;
  onOpenPlace: (nodeKey: string) => void;
  initial?: FindingFilter;
  /** Inside a chapter: the chapter filter is fixed and not offered. */
  lockChapter?: string;
}) {
  const [filter, setFilter] = useState<FindingFilter>(initial);
  const [shown, setShown] = useState(PAGE);
  const set = (patch: Partial<FindingFilter>) => {
    setFilter((f) => ({ ...f, ...patch }));
    setShown(PAGE);
  };
  const chapterKey = lockChapter ?? filter.chapter;

  const list = useMemo(() => {
    const term = filter.term.trim().toLowerCase();
    return sortFindings(
      findings.filter(
        (f) =>
          (filter.status === "all" ||
            (filter.status === "open" ? f.status === "open" : f.status !== "open")) &&
          (!filter.category || f.category === filter.category) &&
          (!filter.severity || f.severity === filter.severity) &&
          (!filter.action || f.action === filter.action) &&
          (!filter.verification || f.verification === filter.verification) &&
          (!chapterKey || f.chapterKeys.includes(chapterKey)) &&
          (!term ||
            `${f.title} ${f.body} ${f.original ?? ""} ${f.replacement ?? ""}`
              .toLowerCase()
              .includes(term)),
      ),
    );
  }, [findings, filter, chapterKey]);

  const openCorrections = list.filter((f) => f.status === "open" && f.action === "correction");
  const hasVerification = findings.some((f) => f.verification);

  return (
    <div className="ms-findings">
      <div className="ms-filters" role="group" aria-label="Filter findings">
        <input
          className="ms-search"
          placeholder="Search findings"
          value={filter.term}
          onChange={(e) => set({ term: e.target.value })}
        />
        <select
          value={filter.status}
          onChange={(e) => set({ status: e.target.value as FindingFilter["status"] })}
        >
          <option value="open">Open</option>
          <option value="decided">Decided</option>
          <option value="all">All</option>
        </select>
        <select
          value={filter.severity}
          onChange={(e) => set({ severity: e.target.value as FindingSeverity | "" })}
        >
          <option value="">Any severity</option>
          {(Object.keys(SEVERITY_LABEL) as FindingSeverity[]).map((k) => (
            <option key={k} value={k}>
              {SEVERITY_LABEL[k]}
            </option>
          ))}
        </select>
        <select
          value={filter.action}
          onChange={(e) => set({ action: e.target.value as FindingAction | "" })}
        >
          <option value="">Corrections, queries, suggestions</option>
          {(Object.keys(ACTION_LABEL) as FindingAction[]).map((k) => (
            <option key={k} value={k}>
              {ACTION_LABEL[k]}s
            </option>
          ))}
        </select>
        <select
          value={filter.category}
          onChange={(e) => set({ category: e.target.value as FindingCategory | "" })}
        >
          <option value="">Any category</option>
          {(Object.keys(CATEGORY_LABEL) as FindingCategory[]).map((k) => (
            <option key={k} value={k}>
              {CATEGORY_LABEL[k]}
            </option>
          ))}
        </select>
        {!lockChapter && (
          <select value={filter.chapter} onChange={(e) => set({ chapter: e.target.value })}>
            <option value="">Every chapter</option>
            {[...chapters.values()].map((c) => (
              <option key={c.chapterKey} value={c.chapterKey}>
                {[c.number, c.title].filter(Boolean).join(" ")}
              </option>
            ))}
          </select>
        )}
        {hasVerification && (
          <select
            value={filter.verification}
            onChange={(e) => set({ verification: e.target.value as FindingFilter["verification"] })}
          >
            <option value="">Any version status</option>
            <option value="introduced">New in this version</option>
            <option value="remains">Still in the text</option>
            <option value="fixed">Fixed in this version</option>
          </select>
        )}
      </div>
      <div className="ms-findings-bar">
        <span className="ms-muted">
          {list.length} finding{list.length === 1 ? "" : "s"}
        </span>
        <span style={{ flex: 1 }} />
        {openCorrections.length > 1 && (
          <Button
            variant="quiet"
            onClick={() =>
              onDecideMany(
                openCorrections.map((f) => f.id),
                "accepted",
              )
            }
            title="Accept every correction in this list"
          >
            Accept {openCorrections.length} corrections
          </Button>
        )}
      </div>
      {list.length === 0 ? (
        <p className="ms-quiet">Nothing matches.</p>
      ) : (
        list
          .slice(0, shown)
          .map((f) => (
            <FindingCard
              key={f.id}
              finding={f}
              nodes={nodes}
              chapters={chapters}
              onDecide={(s) => onDecide(f, s)}
              onOpenPlace={onOpenPlace}
              refs={refs}
            />
          ))
      )}
      {list.length > shown && (
        <Button variant="quiet" onClick={() => setShown((n) => n + PAGE)}>
          Show {Math.min(PAGE, list.length - shown)} more
        </Button>
      )}
    </div>
  );
}
