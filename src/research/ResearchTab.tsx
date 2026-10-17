/**
 * Research — the heart of the workstation.
 *
 * Not a stream of searches and not a chat. The research is organised around
 * the questions presented: each one carries its own provisional answer, the
 * authorities behind it, and Scripta's reasoning connecting the two. That is
 * what makes it auditable rather than magical — a lawyer can see which source
 * carries which proposition, and say so in the memo.
 */
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/primitives";
import type { ResearchState } from "@/wireframe/research-store";
import type { StoredRecords } from "@/lib/research-rows";
import { researchQuestion } from "./functions";
import { mergeQuestionResearch } from "./merge";
import { authoritiesFor, findingsFor, isDoubtful, type Question } from "./model";
import { Card, Chip, ConfidenceChip, Empty, SourceBadges, Working } from "./ui";

const ANGLES = [
  {
    label: "Find stronger authority",
    angle:
      "Find stronger, more directly on-point authority for this question than what is on the record.",
  },
  {
    label: "Research contrary authority",
    angle:
      "Look specifically for authority that cuts against the provisional answer, and say how strong it is.",
  },
  {
    label: "Check it is still good law",
    angle:
      "Check whether each authority relied on is still current, and flag anything repealed, superseded or since distinguished.",
  },
];

export default function ResearchTab({
  state,
  records,
  onState,
  onRecords,
  matterId,
  researchId,
  factsText,
  onOpenSource,
  onTab,
}: {
  state: ResearchState;
  records: StoredRecords;
  onState: (next: ResearchState) => void;
  onRecords: (next: StoredRecords) => void;
  matterId: string | null;
  researchId: string;
  factsText: string;
  onOpenSource: (n: number) => void;
  onTab: (tab: "brief" | "analysis") => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [runAll, setRunAll] = useState(false);

  const planText = [
    records.plan.legislation.length ? `Legislation: ${records.plan.legislation.join("; ")}` : "",
    records.plan.caseLaw.length ? `Case law: ${records.plan.caseLaw.join("; ")}` : "",
    records.plan.secondary.length ? `Secondary: ${records.plan.secondary.join("; ")}` : "",
    records.plan.themes.length ? `Themes: ${records.plan.themes.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  /**
   * Research one question and fold the result back in. The record is read
   * fresh from the arguments each time so running several in a row cannot
   * lose the one before it.
   */
  const run = async (
    question: Question,
    angle: string | undefined,
    current: { state: ResearchState; records: StoredRecords },
  ): Promise<{ state: ResearchState; records: StoredRecords } | null> => {
    const res = await researchQuestion({
      data: {
        question: question.q,
        instructions: current.records.instructions,
        facts: factsText,
        jurisdiction: current.state.jurisdiction,
        areaOfLaw: current.state.areaOfLaw,
        sources: current.state.sources,
        since: current.state.since,
        lawAsAt: current.state.lawAsAt,
        depth: current.state.depth,
        plan: planText,
        knownAuthorities: (current.state.answer?.authorities ?? []).map((a) => ({
          n: a.n,
          cite: a.cite,
        })),
        ...(angle ? { angle } : {}),
        matterId,
        researchId,
      },
    });
    if (!res.ok) {
      setProblem(res.error);
      return null;
    }
    const { answer } = mergeQuestionResearch(current.state.answer, res.research, question.no);
    const nextState: ResearchState = { ...current.state, answer };
    const nextRecords: StoredRecords = {
      ...current.records,
      issueCards: current.records.issueCards.map((q) =>
        q.no === question.no
          ? {
              ...q,
              answer: res.research.answer,
              reasoning: res.research.reasoning,
              confidence: q.confidence || res.research.confidence,
              researchStatus: "researched",
            }
          : q,
      ),
    };
    return { state: nextState, records: nextRecords };
  };

  const researchOne = async (question: Question, angle?: string) => {
    setBusy(question.no);
    setProblem(null);
    try {
      const next = await run(question, angle, { state, records });
      if (next) {
        onState(next.state);
        onRecords(next.records);
        setOpen((o) => ({ ...o, [question.no]: true }));
      }
    } catch (e) {
      setProblem((e as Error).message || "Scripta is unavailable.");
    } finally {
      setBusy(null);
    }
  };

  const researchAll = async () => {
    const pending = records.issueCards.filter(
      (q) => q.q.trim() && findingsFor(state, q.no).length === 0,
    );
    if (!pending.length) return;
    setRunAll(true);
    setProblem(null);
    let current = { state, records };
    try {
      for (const question of pending) {
        setBusy(question.no);
        const next = await run(question, undefined, current);
        if (!next) break;
        current = next;
        onState(next.state);
        onRecords(next.records);
      }
    } catch (e) {
      setProblem((e as Error).message || "Scripta is unavailable.");
    } finally {
      setBusy(null);
      setRunAll(false);
    }
  };

  const questions = records.issueCards;
  const unresearched = questions.filter((q) => findingsFor(state, q.no).length === 0).length;

  if (!questions.length)
    return (
      <div className="rs-body">
        <Empty
          title="No questions to research"
          body="Research is organised around the questions presented. Settle those on the Brief tab and each one gets its own research here."
          action={
            <Button variant="primary" onClick={() => onTab("brief")}>
              Go to the brief
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
        title="Questions"
        right={
          <>
            {runAll && <Working label={`Researching ${busy ?? ""}…`} />}
            <span className="rs-eyebrow">
              {questions.length - unresearched} of {questions.length} researched
            </span>
            <Button
              variant="primary"
              disabled={!unresearched || runAll || !!busy}
              onClick={() => void researchAll()}
            >
              Research {unresearched > 1 ? `all ${unresearched}` : "the outstanding question"}
            </Button>
          </>
        }
        tight
      >
        {questions.map((question) => {
          const findings = findingsFor(state, question.no);
          const authorities = authoritiesFor(state, question.no);
          const isOpen = open[question.no] ?? findings.length > 0;
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
                  {question.answer && !isOpen && <span>{question.answer}</span>}
                </span>
                {working ? (
                  <Working label="Researching…" />
                ) : findings.length ? (
                  <ConfidenceChip value={question.confidence} />
                ) : (
                  <Chip tone="context" mono>
                    Not researched
                  </Chip>
                )}
              </button>
              {isOpen && (
                <div className="rs-question-body">
                  {!findings.length && !working && (
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}
                    >
                      <p className="rs-note" style={{ margin: 0, flex: 1 }}>
                        Nothing has been researched on this question yet.
                      </p>
                      <Button
                        variant="primary"
                        disabled={!question.q.trim() || runAll}
                        onClick={() => void researchOne(question)}
                      >
                        Research this question
                      </Button>
                    </div>
                  )}

                  {question.answer && (
                    <div className="rs-part">
                      <span className="rs-eyebrow">Provisional answer</span>
                      <div className="rs-part-body">{question.answer}</div>
                    </div>
                  )}

                  {!!findings.length && (
                    <div className="rs-part">
                      <span className="rs-eyebrow">What the research establishes</span>
                      <ul
                        style={{
                          margin: 0,
                          paddingLeft: 18,
                          fontSize: 12.5,
                          lineHeight: 1.7,
                          color: "#333",
                        }}
                      >
                        {findings.map((finding, index) => (
                          <li key={index}>
                            {finding.text}{" "}
                            {finding.cites.map((n) => (
                              <button
                                key={n}
                                type="button"
                                className="rs-link"
                                title="Open this source"
                                style={{ fontSize: 10.5, verticalAlign: "super" }}
                                onClick={() => onOpenSource(n)}
                              >
                                [{n}]
                              </button>
                            ))}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {!!authorities.length && (
                    <div className="rs-part">
                      <span className="rs-eyebrow">Key authorities</span>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {authorities.map((authority) => (
                          <div
                            key={authority.n}
                            style={{
                              display: "flex",
                              gap: 10,
                              alignItems: "flex-start",
                              border: "1px solid #eee",
                              borderRadius: 7,
                              padding: "9px 11px",
                              background: isDoubtful(authority) ? "#fffaf6" : "#fff",
                            }}
                          >
                            <span className="rs-question-no">[{authority.n}]</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <button
                                type="button"
                                className="rs-link"
                                style={{ fontSize: 12.5, fontWeight: 600, color: "#232323" }}
                                onClick={() => onOpenSource(authority.n)}
                              >
                                {authority.cite}
                              </button>
                              <div className="rs-note">
                                {[authority.source, authority.date].filter(Boolean).join(" · ")}
                              </div>
                              {authority.held && (
                                <div
                                  style={{
                                    fontSize: 12,
                                    color: "#545454",
                                    lineHeight: 1.55,
                                    marginTop: 3,
                                  }}
                                >
                                  {authority.held}
                                </div>
                              )}
                            </div>
                            <SourceBadges authority={authority} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {question.reasoning && (
                    <div className="rs-part">
                      <span className="rs-eyebrow">
                        Scripta's reasoning · verify before reliance
                      </span>
                      <div className="rs-reasoning">{question.reasoning}</div>
                    </div>
                  )}

                  {!!findings.length && (
                    <div
                      style={{
                        display: "flex",
                        gap: 12,
                        flexWrap: "wrap",
                        alignItems: "center",
                        paddingTop: 2,
                      }}
                    >
                      {ANGLES.map((a) => (
                        <button
                          key={a.label}
                          type="button"
                          className="rs-link"
                          disabled={working || runAll}
                          onClick={() => void researchOne(question, a.angle)}
                        >
                          {a.label}
                        </button>
                      ))}
                      <div className="rs-spacer" />
                      <button type="button" className="rs-link" onClick={() => onTab("analysis")}>
                        Write the analysis →
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </Card>
    </div>
  );
}
