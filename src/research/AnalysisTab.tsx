/**
 * Analysis — where research becomes legal reasoning.
 *
 * The step the old screen skipped. Going straight from search results to a
 * memorandum means nobody ever writes the reasoning down, and the document
 * ends up asserting conclusions whose working is nowhere. Each question gets
 * the rule, its application to these facts, what weighs against it, and a
 * conclusion — all editable prose, drafted by Scripta only from what the
 * research already found.
 */
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/primitives";
import type { ResearchState } from "@/wireframe/research-store";
import type { StoredRecords } from "@/lib/research-rows";
import { draftAnalysis } from "./functions";
import {
  authoritiesFor,
  CONFIDENCE,
  confidenceOf,
  findingsFor,
  hasAnalysis,
  type Question,
} from "./model";
import { Card, Chip, ConfidenceChip, Empty, Working } from "./ui";

const FORMATS = ["IRAC", "ILAC", "CRAC", "Narrative"];

const PARTS: {
  key: "rule" | "application" | "counterpoint" | "conclusion";
  label: string;
  hint: string;
}[] = [
  {
    key: "rule",
    label: "Rule",
    hint: "What the law is on this question, on the authorities found.",
  },
  { key: "application", label: "Application", hint: "How that law bears on these facts." },
  {
    key: "counterpoint",
    label: "Counterargument and uncertainty",
    hint: "What weighs the other way, and what the conclusion assumes.",
  },
  { key: "conclusion", label: "Conclusion", hint: "The answer, with any condition on it." },
];

const ANGLES = [
  {
    label: "Challenge this conclusion",
    angle:
      "Argue against the conclusion as strongly as the authorities allow, then say whether it survives.",
  },
  {
    label: "Make it more cautious",
    angle:
      "Restate the analysis more cautiously: say plainly what is not settled and what the conclusion depends on.",
  },
  {
    label: "Tighten it",
    angle: "Shorten the analysis without losing a point of substance. Cut restatement and hedging.",
  },
];

export default function AnalysisTab({
  state,
  records,
  onRecords,
  factsText,
  onOpenSource,
  onTab,
}: {
  state: ResearchState;
  records: StoredRecords;
  onRecords: (next: StoredRecords) => void;
  factsText: string;
  onOpenSource: (n: number) => void;
  onTab: (tab: "brief" | "research" | "draft") => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const patch = (no: string, next: Partial<Question>) =>
    onRecords({
      ...records,
      issueCards: records.issueCards.map((q) => (q.no === no ? { ...q, ...next } : q)),
    });

  const write = async (question: Question, angle?: string) => {
    setBusy(question.no);
    setProblem(null);
    try {
      const res = await draftAnalysis({
        data: {
          question: question.q,
          answer: question.answer,
          facts: factsText,
          jurisdiction: state.jurisdiction,
          format: records.format || "IRAC",
          findings: findingsFor(state, question.no).map((f) => ({ text: f.text, cites: f.cites })),
          authorities: authoritiesFor(state, question.no).map((a) => ({
            n: a.n,
            cite: a.cite,
            kind: a.kind,
            status: a.status ?? "",
            held: a.held,
          })),
          ...(angle ? { angle } : {}),
          ...(hasAnalysis(question)
            ? {
                existing: {
                  rule: question.rule,
                  application: question.application,
                  counterpoint: question.counterpoint,
                  conclusion: question.conclusion,
                  confidence: question.confidence,
                },
              }
            : {}),
        },
      });
      if (!res.ok) {
        setProblem(res.error);
        return;
      }
      patch(question.no, {
        rule: res.analysis.rule,
        application: res.analysis.application,
        counterpoint: res.analysis.counterpoint,
        conclusion: res.analysis.conclusion,
        confidence: res.analysis.confidence,
      });
      setOpen((o) => ({ ...o, [question.no]: true }));
    } catch (e) {
      setProblem((e as Error).message || "Scripta is unavailable.");
    } finally {
      setBusy(null);
    }
  };

  const questions = records.issueCards;
  const researched = questions.filter((q) => findingsFor(state, q.no).length > 0);
  const analysed = questions.filter(hasAnalysis).length;

  if (!questions.length)
    return (
      <div className="rs-body">
        <Empty
          title="Nothing to analyse yet"
          body="The analysis is written question by question. Settle the questions on the Brief tab first."
          action={
            <Button variant="primary" onClick={() => onTab("brief")}>
              Go to the brief
            </Button>
          }
        />
      </div>
    );
  if (!researched.length)
    return (
      <div className="rs-body">
        <Empty
          title="Research the questions first"
          body="The analysis is drafted only from authority already on the record, so that nothing new appears at the last minute. Run the research and come back."
          action={
            <Button variant="primary" onClick={() => onTab("research")}>
              Go to the research
            </Button>
          }
        />
      </div>
    );

  return (
    <div className="rs-body">
      {problem && (
        <p className="rs-problem" role="alert">
          {problem}
        </p>
      )}
      <Card
        title="Analysis"
        right={
          <>
            <span className="rs-eyebrow">
              {analysed} of {questions.length} written
            </span>
            <select
              className="rs-select"
              style={{ width: 130 }}
              aria-label="Analytical format"
              value={records.format || "IRAC"}
              onChange={(e) => onRecords({ ...records, format: e.target.value })}
            >
              {FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            {analysed > 0 && (
              <Button variant="primary" onClick={() => onTab("draft")}>
                Draft the document →
              </Button>
            )}
          </>
        }
        tight
      >
        {questions.map((question) => {
          const findings = findingsFor(state, question.no);
          const authorities = authoritiesFor(state, question.no);
          const written = hasAnalysis(question);
          const isOpen = open[question.no] ?? written;
          const working = busy === question.no;
          return (
            <div className={`rs-question${isOpen ? " is-open" : ""}`} key={question.no}>
              <button
                type="button"
                className="rs-question-head"
                onClick={() => setOpen((o) => ({ ...o, [question.no]: !isOpen }))}
              >
                <span style={{ paddingTop: 2, color: "#6b6b6b" }}>
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
                <span className="rs-question-no">{question.no}</span>
                <span className="rs-question-text">
                  <b>{question.q || question.short || "Untitled question"}</b>
                  {question.conclusion && !isOpen && <span>{question.conclusion}</span>}
                </span>
                {working ? (
                  <Working label="Writing…" />
                ) : written ? (
                  <ConfidenceChip value={question.confidence} />
                ) : findings.length ? (
                  <Chip tone="practice" mono>
                    Not written
                  </Chip>
                ) : (
                  <Chip tone="context" mono>
                    Not researched
                  </Chip>
                )}
              </button>
              {isOpen && (
                <div className="rs-question-body">
                  {!findings.length ? (
                    <div
                      style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}
                    >
                      <p className="rs-note" style={{ margin: 0, flex: 1 }}>
                        This question has no research behind it, so there is nothing to reason from.
                      </p>
                      <Button onClick={() => onTab("research")}>Research it</Button>
                    </div>
                  ) : (
                    <>
                      {!written && (
                        <div
                          style={{
                            display: "flex",
                            gap: 10,
                            alignItems: "center",
                            flexWrap: "wrap",
                          }}
                        >
                          <p className="rs-note" style={{ margin: 0, flex: 1 }}>
                            Scripta will draft the reasoning from the {authorities.length}{" "}
                            {authorities.length === 1 ? "authority" : "authorities"} on this
                            question. Edit anything it writes; the words are yours to stand behind.
                          </p>
                          <Button
                            variant="primary"
                            disabled={working}
                            onClick={() => void write(question)}
                          >
                            Draft the analysis
                          </Button>
                        </div>
                      )}

                      {!!authorities.length && (
                        <div
                          style={{
                            display: "flex",
                            gap: 6,
                            flexWrap: "wrap",
                            alignItems: "center",
                          }}
                        >
                          <span className="rs-eyebrow">Authorities</span>
                          {authorities.map((a) => (
                            <button
                              key={a.n}
                              type="button"
                              className="rs-chip"
                              style={{ cursor: "pointer" }}
                              onClick={() => onOpenSource(a.n)}
                              title={a.held}
                            >
                              [{a.n}] {a.cite}
                            </button>
                          ))}
                        </div>
                      )}

                      {PARTS.map((part) => (
                        <label className="rs-part" key={part.key}>
                          <span className="rs-eyebrow">{part.label}</span>
                          <textarea
                            className="rs-textarea"
                            style={{ minHeight: part.key === "conclusion" ? 70 : 100 }}
                            aria-label={`${part.label} for ${question.no}`}
                            placeholder={part.hint}
                            value={question[part.key]}
                            onChange={(e) => patch(question.no, { [part.key]: e.target.value })}
                          />
                        </label>
                      ))}

                      <div
                        style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}
                      >
                        <span className="rs-eyebrow">How far it is supported</span>
                        <select
                          className="rs-select"
                          style={{ width: 190 }}
                          aria-label={`Confidence on ${question.no}`}
                          value={question.confidence}
                          onChange={(e) => patch(question.no, { confidence: e.target.value })}
                        >
                          {CONFIDENCE.map((c) => (
                            <option key={c.key} value={c.key}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                        <span className="rs-note" style={{ flex: 1, minWidth: 180 }}>
                          {confidenceOf(question.confidence).meaning}
                        </span>
                      </div>

                      {written && (
                        <div
                          style={{
                            display: "flex",
                            gap: 12,
                            flexWrap: "wrap",
                            alignItems: "center",
                          }}
                        >
                          {ANGLES.map((a) => (
                            <button
                              key={a.label}
                              type="button"
                              className="rs-link"
                              disabled={working}
                              onClick={() => void write(question, a.angle)}
                            >
                              {a.label}
                            </button>
                          ))}
                          <div className="rs-spacer" />
                          <label
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              fontSize: 12,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={question.done}
                              onChange={(e) => patch(question.no, { done: e.target.checked })}
                            />
                            Settled
                          </label>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </Card>

      <RiskCard records={records} onRecords={onRecords} />
    </div>
  );
}

const LIKELIHOOD = ["Remote", "Unlikely", "Possible", "Likely", "Almost certain"];
const IMPACT = ["Minimal", "Minor", "Moderate", "Major", "Severe"];

/**
 * Risks that follow from the analysis. Kept here rather than on a tab of its
 * own: a risk is a consequence of a conclusion, and it reads as one.
 */
function RiskCard({
  records,
  onRecords,
}: {
  records: StoredRecords;
  onRecords: (next: StoredRecords) => void;
}) {
  const rows = records.riskRows;
  const patch = (index: number, next: Partial<(typeof rows)[number]>) =>
    onRecords({ ...records, riskRows: rows.map((r, i) => (i === index ? { ...r, ...next } : r)) });
  return (
    <Card
      title="Risks"
      right={
        <button
          type="button"
          className="rs-link"
          onClick={() =>
            onRecords({
              ...records,
              riskRows: [
                ...rows,
                {
                  title: "",
                  issue: "",
                  like: "Possible",
                  imp: "Moderate",
                  rate: "Medium",
                  mit: "",
                  who: "",
                  by: "",
                  override: null,
                  action: "",
                  pri: "Medium",
                  status: "Open",
                },
              ],
            })
          }
        >
          + Add risk
        </button>
      }
    >
      <p className="rs-note" style={{ marginTop: -4 }}>
        What could go wrong on the conclusions above, and what would reduce it. These print in the
        document's recommendations.
      </p>
      {!rows.length ? (
        <p className="rs-note">None recorded.</p>
      ) : (
        <table className="rs-table">
          <thead>
            <tr>
              <th>Risk</th>
              <th style={{ width: 130 }}>Likelihood</th>
              <th style={{ width: 130 }}>Impact</th>
              <th style={{ width: 260 }}>Mitigation</th>
              <th style={{ width: 120 }}>Owner</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                <td>
                  <textarea
                    className="rs-textarea"
                    style={{ minHeight: 56 }}
                    aria-label={`Risk ${index + 1}`}
                    placeholder="The cap may be set aside for gross fault."
                    value={row.title}
                    onChange={(e) => patch(index, { title: e.target.value })}
                  />
                </td>
                <td>
                  <select
                    className="rs-select"
                    aria-label={`Likelihood of risk ${index + 1}`}
                    value={row.like || "Possible"}
                    onChange={(e) => patch(index, { like: e.target.value })}
                  >
                    {LIKELIHOOD.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    className="rs-select"
                    aria-label={`Impact of risk ${index + 1}`}
                    value={row.imp || "Moderate"}
                    onChange={(e) => patch(index, { imp: e.target.value })}
                  >
                    {IMPACT.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <textarea
                    className="rs-textarea"
                    style={{ minHeight: 56 }}
                    aria-label={`Mitigation for risk ${index + 1}`}
                    value={row.mit}
                    onChange={(e) => patch(index, { mit: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="rs-input"
                    aria-label={`Owner of risk ${index + 1}`}
                    value={row.who}
                    onChange={(e) => patch(index, { who: e.target.value })}
                  />
                </td>
                <td className="is-actions">
                  <button
                    type="button"
                    className="rs-link is-quiet is-danger"
                    onClick={() =>
                      onRecords({ ...records, riskRows: rows.filter((_, i) => i !== index) })
                    }
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
