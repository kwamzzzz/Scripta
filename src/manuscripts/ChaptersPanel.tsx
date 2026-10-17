/**
 * Chapters as first-class objects: the list of them with where each review
 * stands, and a chapter opened as its own review workspace — the descriptive
 * summary, the editorial assessment kept apart from it, the text itself with
 * its findings marked, and the chapter's findings beside it.
 */
import { useMemo } from "react";
import { Card, Chip, Eyebrow } from "@/review/ui";
import { Button } from "@/components/primitives";
import type { Chapter, Finding, StoredNode } from "./db";
import FindingsPanel from "./FindingsPanel";
import ChapterReader, { chapterBlocks } from "./ChapterReader";
import { PunctuationButton } from "@/components/PunctuationLens";
import { NO_FILTER } from "./findings";
import { CATEGORY_LABEL, type FindingCategory, type FindingStatus } from "./model";

const STATE: Record<Chapter["state"], { label: string; tone: "ok" | "info" | "quiet" }> = {
  reviewed: { label: "Reviewed", tone: "ok" },
  reviewing: { label: "Reviewing", tone: "info" },
  not_reviewed: { label: "Not reviewed", tone: "quiet" },
};

const chapterName = (c: Chapter) =>
  [c.number, c.title].filter(Boolean).join(" ") || "Untitled chapter";

export function ChapterList({
  chapters,
  findings,
  onOpen,
  onReview,
  busy,
}: {
  chapters: Chapter[];
  findings: Finding[];
  onOpen: (key: string) => void;
  onReview: (key: string) => void;
  busy: boolean;
}) {
  const counts = useMemo(() => {
    const out = new Map<string, Finding[]>();
    for (const f of findings)
      if (f.status === "open")
        for (const k of f.chapterKeys) out.set(k, [...(out.get(k) ?? []), f]);
    return out;
  }, [findings]);
  if (!chapters.length)
    return (
      <p className="ms-quiet">
        No chapters were found in this reading. Check the headings in the file, or upload it as
        Word.
      </p>
    );
  return (
    <ol className="ms-chapters">
      {chapters.map((c) => {
        const open = counts.get(c.chapterKey) ?? [];
        const byCat = new Map<FindingCategory, number>();
        for (const f of open) byCat.set(f.category, (byCat.get(f.category) ?? 0) + 1);
        return (
          <li key={c.chapterKey} className="ms-chapter-row">
            <button type="button" className="ms-chapter-open" onClick={() => onOpen(c.chapterKey)}>
              <span className="ms-chapter-name">{chapterName(c)}</span>
              <span className="ms-muted ms-small">
                {c.wordCount.toLocaleString("en-GB")} words
                {c.summary?.purpose ? ` · ${c.summary.purpose}` : ""}
              </span>
            </button>
            <span className="ms-chapter-counts">
              {open.length === 0 ? (
                <span className="ms-muted ms-small">
                  {c.state === "reviewed" ? "No open findings" : ""}
                </span>
              ) : (
                [...byCat.entries()].map(([cat, n]) => (
                  <span key={cat} className="ms-count">
                    {n} {CATEGORY_LABEL[cat]}
                  </span>
                ))
              )}
            </span>
            <Chip tone={STATE[c.state].tone}>{STATE[c.state].label}</Chip>
            <Button variant="quiet" disabled={busy} onClick={() => onReview(c.chapterKey)}>
              {c.state === "reviewed" ? "Review again" : "Review"}
            </Button>
          </li>
        );
      })}
    </ol>
  );
}

function SummaryCard({ c }: { c: Chapter }) {
  const s = c.summary;
  if (!s)
    return (
      <Card title="Chapter summary">
        <p className="ms-quiet">Not read yet. Review the chapter and its summary appears here.</p>
      </Card>
    );
  const listOf = (label: string, items: string[]) =>
    items.length > 0 && (
      <div className="ms-sum-block">
        <Eyebrow>{label}</Eyebrow>
        <ul>
          {items.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      </div>
    );
  return (
    <Card
      title="Chapter summary"
      hint="What the chapter says. The assessment below says how well it says it."
    >
      {s.purpose && (
        <p>
          <strong>Purpose.</strong> {s.purpose}
        </p>
      )}
      <p>{s.summary}</p>
      {listOf("Key arguments", s.propositions)}
      {listOf("Findings", s.findings)}
      {listOf("Evidence and authorities relied on", s.evidence)}
      {s.concepts.length > 0 && (
        <div className="ms-sum-block">
          <Eyebrow>Concepts introduced</Eyebrow>
          <dl className="ms-concepts">
            {s.concepts.map((k) => (
              <div key={k.term}>
                <dt>{k.term}</dt>
                <dd>{k.meaning}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {s.relationship && (
        <p>
          <strong>Relationship to other chapters.</strong> {s.relationship}
        </p>
      )}
      {s.contribution && (
        <p>
          <strong>Contribution to the manuscript.</strong> {s.contribution}
        </p>
      )}
      {listOf("Research questions addressed", s.questionsAddressed)}
      {listOf("Unresolved points", s.gaps)}
    </Card>
  );
}

function AssessmentCard({ c }: { c: Chapter }) {
  const a = c.assessment;
  if (!a) return null;
  const rows: [string, string][] = [
    ["Clarity", a.clarity],
    ["Structure", a.structure],
    ["Internal coherence", a.coherence],
    ["Evidential support", a.support],
    ["Duplication", a.duplication],
    ["Role in the manuscript", a.roleInManuscript],
  ];
  return (
    <Card
      title="Editorial assessment"
      hint="How well the chapter does its job. Kept apart from the summary."
    >
      <p>{a.overall}</p>
      <dl className="ms-assess">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
      </dl>
    </Card>
  );
}

export function ChapterView({
  chapter,
  nodes,
  allNodes,
  chapters,
  findings,
  focus,
  onBack,
  onReview,
  busy,
  onDecide,
  onDecideMany,
  onOpenPlace,
  refs,
}: {
  refs: Map<string, string>;
  chapter: Chapter;
  nodes: StoredNode[];
  allNodes: Map<string, StoredNode>;
  chapters: Map<string, Chapter>;
  findings: Finding[];
  focus: string | null;
  onBack: () => void;
  onReview: () => void;
  busy: boolean;
  onDecide: (f: Finding, status: FindingStatus) => void;
  onDecideMany: (ids: string[], status: FindingStatus) => void;
  onOpenPlace: (nodeKey: string) => void;
}) {
  const mine = useMemo(
    () => findings.filter((f) => f.chapterKeys.includes(chapter.chapterKey)),
    [findings, chapter.chapterKey],
  );
  const openOn = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of mine)
      if (f.status === "open")
        for (const e of f.evidence) m.set(e.nodeKey, (m.get(e.nodeKey) ?? 0) + 1);
    return m;
  }, [mine]);
  const marks = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const f of mine)
      if (f.status === "open")
        for (const e of f.evidence) {
          const words =
            e.quote ?? (f.evidence.length === 1 ? (f.original ?? undefined) : undefined);
          if (words) m.set(e.nodeKey, [...(m.get(e.nodeKey) ?? []), words]);
        }
    return m;
  }, [mine]);
  const others = mine.filter((f) => f.chapterKeys.length > 1 && f.status === "open").length;
  return (
    <div className="ms-chapter">
      <div className="ms-chapter-bar">
        <Button variant="quiet" onClick={onBack}>
          ← All chapters
        </Button>
        <h2>{chapterName(chapter)}</h2>
        <Chip tone={STATE[chapter.state].tone}>{STATE[chapter.state].label}</Chip>
        <span style={{ flex: 1 }} />
        <PunctuationButton
          className="pl-toggle"
          blocks={() => chapterBlocks(chapter.chapterKey, nodes)}
        />
        <span className="ms-muted ms-small">
          Reviewed against the whole manuscript
          {others ? ` · ${others} open finding${others === 1 ? "" : "s"} reach other chapters` : ""}
        </span>
        <Button
          variant={chapter.state === "reviewed" ? "secondary" : "primary"}
          disabled={busy}
          onClick={onReview}
        >
          {chapter.state === "reviewed" ? "Review again" : "Review this chapter"}
        </Button>
      </div>
      <div className="ms-chapter-cols">
        <div className="ms-chapter-main">
          <SummaryCard c={chapter} />
          <AssessmentCard c={chapter} />
          <ChapterReader
            chapter={chapter}
            nodes={nodes}
            openOn={openOn}
            focus={focus}
            refs={refs}
            marks={marks}
          />
        </div>
        <div className="ms-chapter-side">
          <Card title="Findings in this chapter">
            <FindingsPanel
              findings={mine}
              nodes={allNodes}
              chapters={chapters}
              onDecide={onDecide}
              onDecideMany={onDecideMany}
              onOpenPlace={onOpenPlace}
              initial={NO_FILTER}
              lockChapter={chapter.chapterKey}
              refs={refs}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
