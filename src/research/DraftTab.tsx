/**
 * Draft — the document, written from the research record.
 *
 * The important architectural point is what this tab may not do. It drafts
 * only from the analysis and the authorities already on the record: research
 * happens once, is checked once, and the drafting step cannot quietly reopen
 * it. Otherwise hallucination is introduced at the last stage, after every
 * check has passed.
 *
 * Review is a button, not a tab. It runs the checks that can be computed from
 * the record, and asks Scripta to read the draft back against what was asked.
 */
import { useState } from "react";
import { Button } from "@/components/primitives";
import { useConfirm } from "@/components/Confirm";
import MemoComposer from "./MemoComposer";
import { uid, type ResearchState } from "@/wireframe/research-store";
import type { StoredRecords } from "@/lib/research-rows";
import { docToText, textToDoc } from "@/wireframe/clause-doc";
import { buildCleanDocx } from "@/lib/export/docx";
import { buildCleanPdf } from "@/lib/export/pdf";
import { buildResearchReport, reportFilename } from "@/lib/export/research-report";
import { downloadBytes, DOCX_MIME, PDF_MIME } from "@/lib/export/download";
import { draftMemo, reviewDraft } from "./functions";
import {
  confidenceOf,
  hasAnalysis,
  localReview,
  openCount,
  OUTPUT_KINDS,
  type ReviewFinding,
} from "./model";
import { Card, Chip, Empty, Working } from "./ui";

type Tab = "brief" | "research" | "analysis" | "draft" | "sources";

export default function DraftTab({
  state,
  records,
  onState,
  onRecords,
  researchId,
  matterId,
  factsText,
  onOpenSource,
  onTab,
}: {
  state: ResearchState;
  records: StoredRecords;
  onState: (next: ResearchState) => void;
  onRecords: (next: StoredRecords) => void;
  researchId: string;
  matterId: string | null;
  factsText: string;
  onOpenSource: (n: number) => void;
  onTab: (tab: Tab) => void;
}) {
  const { confirm, confirmDialog } = useConfirm();
  const [busy, setBusy] = useState<"draft" | "review" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notes, setNotes] = useState<ReviewFinding[] | null>(null);

  const analysed = records.issueCards.filter(hasAnalysis);
  const authorities = state.answer?.authorities ?? [];
  const written = !!(state.memo.intro.trim() || state.memo.sections.some((s) => s.body.trim()));

  /**
   * The working record as a document: the questions and their conclusions, the
   * facts, the assumptions and the risks. Not the advice — the file note behind
   * it, which is what a reviewer asks for when they want to see the working.
   */
  const downloadRecord = (format: "docx" | "pdf") => {
    const report = buildResearchReport({
      title: state.memo.title || state.topic || "Research record",
      version: records.report.version,
      approvedAt: records.report.approvedAt,
      issues: records.issueCards,
      facts: records.factRows,
      assumptions: records.assumptionRows,
      risks: records.riskRows,
      included: [
        state.jurisdiction,
        state.areaOfLaw,
        state.lawAsAt ? `law as at ${state.lawAsAt}` : "",
      ].filter(Boolean),
    });
    const name = `${state.memo.title || state.topic || "research"} — record`;
    if (format === "docx")
      downloadBytes(
        buildCleanDocx({
          ...report,
          author: "Scripta",
          date: new Date().toISOString(),
          numbering: "literal",
        }),
        reportFilename(name, "docx"),
        DOCX_MIME,
      );
    else downloadBytes(buildCleanPdf(report), reportFilename(name, "pdf"), PDF_MIME);
  };

  const draftText = () =>
    [
      state.memo.title,
      state.memo.intro,
      ...state.memo.sections.map((s) => `${s.no} ${s.title}\n${s.body}`),
    ]
      .filter((part) => part.trim())
      .join("\n\n");

  /** Write the document from the analysis, and only from it. */
  const generate = async () => {
    if (
      written &&
      !(await confirm({
        title: "Replace the draft?",
        body: "A fresh draft is written from the analysis, and anything you have written here goes.",
        confirmLabel: "Replace the draft",
      }))
    )
      return;
    setBusy("draft");
    setProblem(null);
    try {
      const res = await draftMemo({
        data: {
          outputKind: state.outputKind || "Research memorandum",
          title: state.memo.title || state.topic,
          instructions: records.instructions,
          facts: factsText,
          assumptions: records.assumptionRows
            .filter((a) => a.a.trim())
            .map((a) => `${a.a}${a.why ? ` (${a.why})` : ""}`)
            .join("\n"),
          jurisdiction: state.jurisdiction,
          lawAsAt: state.lawAsAt,
          questions: analysed
            .filter((q) => q.inReport)
            .map((q) => ({
              no: q.no,
              short: q.short,
              question: q.q,
              rule: q.rule,
              application: q.application,
              counterpoint: q.counterpoint,
              conclusion: q.conclusion,
              confidence: q.confidence,
            })),
          authorities: authorities.map((a) => ({
            n: a.n,
            cite: a.cite,
            kind: a.kind,
            status: a.status ?? "",
            held: a.held,
          })),
        },
      });
      if (!res.ok) {
        setProblem(res.error);
        return;
      }
      onState({
        ...state,
        memo: {
          ...state.memo,
          title: res.memo.title || state.memo.title,
          intro: res.memo.intro,
          introDoc: textToDoc(res.memo.intro),
          sections: res.memo.sections.map((section, index) => ({
            id: uid(),
            no: `${index + 1}`,
            title: section.title,
            body: section.body,
            cites: section.cites,
            doc: textToDoc(section.body),
          })),
        },
      });
      setNotes(null);
    } catch (e) {
      setProblem((e as Error).message || "Scripta is unavailable.");
    } finally {
      setBusy(null);
    }
  };

  /** Read the draft back against the record it came from. */
  const review = async () => {
    setBusy("review");
    setProblem(null);
    const local = localReview(state, records);
    try {
      const res = await reviewDraft({
        data: {
          draft: draftText(),
          instructions: records.instructions,
          facts: factsText,
          questions: records.issueCards.map((q) => ({
            no: q.no,
            question: q.q,
            conclusion: q.conclusion,
            confidence: q.confidence,
          })),
          authorities: authorities.map((a) => ({
            n: a.n,
            cite: a.cite,
            kind: a.kind,
            status: a.status ?? "",
          })),
        },
      });
      if (!res.ok) {
        setProblem(res.error);
        setNotes(local);
        return;
      }
      setNotes([
        ...local,
        ...res.notes.map((n, index) => ({
          id: `ai-${index}`,
          area: n.area as ReviewFinding["area"],
          severity: n.severity as ReviewFinding["severity"],
          title: n.title,
          detail: n.detail,
          tab: "draft" as const,
        })),
      ]);
    } catch (e) {
      setProblem((e as Error).message || "Scripta is unavailable.");
      setNotes(local);
    } finally {
      setBusy(null);
    }
  };

  const readiness = localReview(state, records);
  const open = openCount(readiness);

  return (
    <div className="rs-screen">
      <div
        style={{
          flex: "none",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 24px",
          borderBottom: "1px solid #e8e8e8",
          background: "#fbfbfb",
          flexWrap: "wrap",
        }}
      >
        <select
          className="rs-select"
          style={{ width: 210 }}
          aria-label="What to produce"
          value={state.outputKind || "Research memorandum"}
          onChange={(e) => onState({ ...state, outputKind: e.target.value })}
        >
          {OUTPUT_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <Button
          variant="primary"
          disabled={!analysed.length || busy !== null}
          onClick={() => void generate()}
          title={
            analysed.length
              ? "Write the document from the analysis on the record"
              : "Write the analysis first — the document is drafted only from what is already checked"
          }
        >
          {written ? "Redraft from analysis" : "Generate from analysis"}
        </Button>
        <Button disabled={!written || busy !== null} onClick={() => void review()}>
          Review
        </Button>
        {busy === "draft" && <Working label="Writing the document…" />}
        {busy === "review" && <Working label="Reading it back…" />}
        <div className="rs-spacer" />
        <span className="rs-eyebrow">Research record</span>
        <button
          type="button"
          className="rs-link"
          disabled={!records.issueCards.length}
          title="The questions, facts, assumptions and risks as a file note — the working behind the advice"
          onClick={() => downloadRecord("docx")}
        >
          Word
        </button>
        <button
          type="button"
          className="rs-link"
          disabled={!records.issueCards.length}
          onClick={() => downloadRecord("pdf")}
        >
          PDF
        </button>
        <span className="rs-eyebrow">
          {analysed.length} of {records.issueCards.length} questions analysed
        </span>
        {open > 0 ? (
          <Chip tone="practice" mono>
            {open} to deal with
          </Chip>
        ) : (
          <Chip tone="ok" mono>
            Ready to export
          </Chip>
        )}
      </div>

      {problem && (
        <p className="rs-problem" role="alert" style={{ margin: "12px 24px 0" }}>
          {problem}
        </p>
      )}

      {notes && (
        <div style={{ padding: "12px 24px 0", flex: "none", maxHeight: 280, overflow: "auto" }}>
          <Card
            title={`Review · ${notes.length} ${notes.length === 1 ? "note" : "notes"}`}
            right={
              <button type="button" className="rs-link is-quiet" onClick={() => setNotes(null)}>
                Dismiss
              </button>
            }
            tight
          >
            {!notes.length ? (
              <p className="rs-note">
                Nothing to raise. Every proposition carries authority, the draft matches the facts,
                and the instructions are addressed.
              </p>
            ) : (
              notes.map((note) => (
                <div className="rs-review-row" key={note.id}>
                  <span className={`rs-review-mark is-${note.severity}`} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{note.title}</div>
                    <div className="rs-note">{note.detail}</div>
                  </div>
                  <Chip mono tone="context">
                    {note.area}
                  </Chip>
                  {note.tab && note.tab !== "draft" && (
                    <button type="button" className="rs-link" onClick={() => onTab(note.tab!)}>
                      Go there
                    </button>
                  )}
                </div>
              ))
            )}
          </Card>
        </div>
      )}

      {!analysed.length && !written ? (
        <div className="rs-body">
          <Empty
            title="Nothing to draft from yet"
            body="The document is written from the analysis, not researched afresh — that is what keeps a checked citation checked. Write the analysis on at least one question and come back."
            action={
              <Button variant="primary" onClick={() => onTab("analysis")}>
                Go to the analysis
              </Button>
            }
          />
        </div>
      ) : (
        <>
          {written && open > 0 && (
            <div style={{ padding: "12px 24px 0", flex: "none" }}>
              <details>
                <summary style={{ cursor: "pointer", fontSize: 12.5, color: "#b4560a" }}>
                  {open} thing{open === 1 ? "" : "s"} to deal with before this leaves the building
                </summary>
                <div style={{ paddingTop: 8 }}>
                  {readiness
                    .filter((n) => n.severity === "open")
                    .map((note) => (
                      <div className="rs-review-row" key={note.id}>
                        <span className={`rs-review-mark is-${note.severity}`} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600 }}>{note.title}</div>
                          <div className="rs-note">{note.detail}</div>
                        </div>
                        {note.tab && (
                          <button
                            type="button"
                            className="rs-link"
                            onClick={() => onTab(note.tab!)}
                          >
                            Go there
                          </button>
                        )}
                      </div>
                    ))}
                </div>
              </details>
            </div>
          )}
          <MemoComposer
            state={state}
            onChange={onState}
            onOpenAuthority={onOpenSource}
            researchId={researchId}
            matterId={matterId}
          />
        </>
      )}
      {confirmDialog}
    </div>
  );
}

/** The conclusions as they will read, for the export confirmation. */
export function conclusionSummary(records: StoredRecords) {
  return records.issueCards
    .filter((q) => q.inReport && q.conclusion.trim())
    .map((q) => `${q.no} ${q.conclusion} (${confidenceOf(q.confidence).label.toLowerCase()})`);
}

export { docToText };
