/**
 * Brief — what was asked, what the facts are, and the questions those facts
 * raise. Everything downstream is built from this tab, so it is the one place
 * where the lawyer, not Scripta, has the last word on scope.
 */
import { useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/primitives";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import type { ResearchState } from "@/wireframe/research-store";
import type { StoredRecords } from "@/lib/research-rows";
import { draftBrief } from "./functions";
import {
  DEPTHS,
  emptyFact,
  emptyQuestion,
  FACT_CLASSES,
  FACT_TONE,
  JURISDICTIONS,
  OUTPUT_KINDS,
  PLAN_PARTS,
  planIsEmpty,
  QUESTION_PRIORITIES,
  renumberQuestions,
  SINCE_OPTIONS,
  SOURCE_TYPES,
  type Plan,
} from "./model";
import { Card, Chip, Empty, Field, LineList, Select, Working } from "./ui";

const ASSUMPTION_STATES = ["Unconfirmed", "Confirmed", "Rejected"];

export default function BriefTab({
  state,
  records,
  onState,
  onRecords,
  matterId,
  factsText,
  footer,
}: {
  state: ResearchState;
  records: StoredRecords;
  onState: (next: ResearchState) => void;
  onRecords: (next: StoredRecords) => void;
  matterId: string | null;
  /** The factual record as one block, for the model. */
  factsText: string;
  /** Drawn after the plan, at the foot of the brief: the research's discussion. */
  footer?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [narrative, setNarrative] = useState("");
  const { confirmDelete, confirmDialog } = useConfirmDelete();

  const setPlan = (plan: Plan) => onRecords({ ...records, plan });
  const setQuestions = (issueCards: StoredRecords["issueCards"]) =>
    onRecords({ ...records, issueCards: renumberQuestions(issueCards) });

  /**
   * Read the instructions and the facts and propose the assignment: the
   * questions presented, where to look, and what the instructions imply about
   * jurisdiction and output. Nothing is applied without the lawyer seeing it —
   * questions are appended, never replaced, and the settings only fill blanks.
   */
  const draft = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const res = await draftBrief({
        data: {
          instructions: records.instructions,
          facts: [factsText, narrative].filter((t) => t.trim()).join("\n\n"),
          jurisdiction: state.jurisdiction,
          existingQuestions: records.issueCards.map((q) => q.q).filter(Boolean),
          matterId,
        },
      });
      if (!res.ok) {
        setProblem(res.error);
        return;
      }
      const { brief } = res;
      const base = records.issueCards.length;
      const added = brief.questions.map((q, i) => ({
        ...emptyQuestion(base + i, brief.jurisdiction || state.jurisdiction),
        short: q.short,
        q: q.question,
        pri: q.priority,
      }));
      const factBase = records.factRows.length;
      const addedFacts = brief.facts.map((f, i) => ({
        ...emptyFact(factBase + i),
        fact: f.fact,
        cls: FACT_CLASSES.includes(f.classification) ? f.classification : "Client-provided",
      }));
      onRecords({
        ...records,
        issueCards: renumberQuestions([...records.issueCards, ...added]),
        factRows: [...records.factRows, ...addedFacts],
        plan: planIsEmpty(records.plan) ? brief.plan : records.plan,
      });
      onState({
        ...state,
        jurisdiction: state.jurisdiction || brief.jurisdiction,
        areaOfLaw: state.areaOfLaw || brief.areaOfLaw,
        outputKind: state.outputKind || brief.outputKind,
      });
      if (addedFacts.length) setNarrative("");
    } catch (e) {
      setProblem((e as Error).message || "Scripta is unavailable.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rs-body">
      {problem && (
        <p className="rs-problem" role="alert">
          {problem}
        </p>
      )}

      <Card
        title="Instructions"
        right={
          <>
            {busy && <Working label="Reading the brief…" />}
            <Button variant="primary" onClick={() => void draft()} disabled={busy}>
              Draft questions and plan
            </Button>
          </>
        }
      >
        <p className="rs-note" style={{ marginTop: -4 }}>
          What you were asked to advise on, in your own words. This governs the research: it says
          who the advice is for, what is in scope and what is not.
        </p>
        <textarea
          className="rs-textarea"
          aria-label="Instructions"
          placeholder="Prepare a research memorandum advising whether…"
          value={records.instructions}
          onChange={(e) => onRecords({ ...records, instructions: e.target.value })}
        />
      </Card>

      <Card title="Scope">
        <div className="rs-settings">
          <Select
            label="Jurisdiction"
            value={state.jurisdiction}
            options={JURISDICTIONS}
            allowEmpty="Not set"
            onChange={(jurisdiction) => onState({ ...state, jurisdiction })}
          />
          <Field label="Area of law">
            <input
              className="rs-input"
              value={state.areaOfLaw}
              placeholder="Contract law"
              onChange={(e) => onState({ ...state, areaOfLaw: e.target.value })}
            />
          </Field>
          <Field label="Law as at" hint="How the memo will date itself.">
            <input
              className="rs-input"
              value={state.lawAsAt}
              placeholder="12 September 2026"
              onChange={(e) => onState({ ...state, lawAsAt: e.target.value })}
            />
          </Field>
          <Select
            label="Output"
            value={state.outputKind}
            options={OUTPUT_KINDS}
            allowEmpty="Not set"
            onChange={(outputKind) => onState({ ...state, outputKind })}
          />
          <Select
            label="Sources"
            value={state.sources}
            options={SOURCE_TYPES}
            onChange={(sources) => onState({ ...state, sources })}
          />
          <Select
            label="Authorities since"
            value={state.since}
            options={SINCE_OPTIONS}
            onChange={(since) => onState({ ...state, since })}
          />
          <Select
            label="Depth"
            value={state.depth}
            options={DEPTHS}
            hint="How far each question is chased."
            onChange={(depth) => onState({ ...state, depth })}
          />
        </div>
      </Card>

      <Card
        title="Facts"
        right={
          <button
            type="button"
            className="rs-link"
            onClick={() =>
              onRecords({
                ...records,
                factRows: [...records.factRows, emptyFact(records.factRows.length)],
              })
            }
          >
            + Add fact
          </button>
        }
      >
        <p className="rs-note" style={{ marginTop: -4 }}>
          The factual record the advice rests on. Classify each one: a conclusion that turns on a
          disputed or missing fact has to say so.
        </p>
        {records.factRows.length === 0 ? (
          <Empty
            title="No facts recorded"
            body="Paste the factual narrative below and Scripta will break it into separate facts, or add them one at a time."
          />
        ) : (
          <div>
            {records.factRows.map((fact, index) => (
              <div className="rs-fact" key={fact.id}>
                <textarea
                  className="rs-textarea"
                  style={{ minHeight: 66 }}
                  aria-label={`Fact ${index + 1}`}
                  placeholder="What happened, in one sentence."
                  value={fact.fact}
                  onChange={(e) =>
                    onRecords({
                      ...records,
                      factRows: records.factRows.map((f) =>
                        f.id === fact.id ? { ...f, fact: e.target.value } : f,
                      ),
                    })
                  }
                />
                <input
                  className="rs-input"
                  aria-label={`Source of fact ${index + 1}`}
                  placeholder="Where it comes from"
                  value={fact.src}
                  onChange={(e) =>
                    onRecords({
                      ...records,
                      factRows: records.factRows.map((f) =>
                        f.id === fact.id ? { ...f, src: e.target.value } : f,
                      ),
                    })
                  }
                />
                <select
                  className="rs-select"
                  aria-label={`Classification of fact ${index + 1}`}
                  value={fact.cls}
                  onChange={(e) =>
                    onRecords({
                      ...records,
                      factRows: records.factRows.map((f) =>
                        f.id === fact.id ? { ...f, cls: e.target.value } : f,
                      ),
                    })
                  }
                >
                  {FACT_CLASSES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <input
                  className="rs-input"
                  aria-label={`Questions fact ${index + 1} bears on`}
                  placeholder="Q1, Q3"
                  value={fact.issue}
                  onChange={(e) =>
                    onRecords({
                      ...records,
                      factRows: records.factRows.map((f) =>
                        f.id === fact.id ? { ...f, issue: e.target.value } : f,
                      ),
                    })
                  }
                />
                <button
                  type="button"
                  className="rs-link is-quiet is-danger"
                  aria-label={`Delete fact ${index + 1}`}
                  title="Delete this fact"
                  onClick={() =>
                    onRecords({
                      ...records,
                      factRows: records.factRows.filter((f) => f.id !== fact.id),
                    })
                  }
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingTop: 10 }}>
              {FACT_CLASSES.map((c) => {
                const n = records.factRows.filter((f) => f.cls === c).length;
                return n ? (
                  <Chip key={c} tone={FACT_TONE[c] ?? "context"} mono>
                    {n} {c.toLowerCase()}
                  </Chip>
                ) : null;
              })}
            </div>
          </div>
        )}
        <Field
          label="Or paste the factual narrative"
          hint="Scripta breaks it into separate facts when you draft the brief. The narrative itself is not kept."
        >
          <textarea
            className="rs-textarea"
            style={{ minHeight: 100 }}
            placeholder="Nexa Engineering LLC entered into a three-year engineering services agreement with…"
            value={narrative}
            onChange={(e) => setNarrative(e.target.value)}
          />
        </Field>
      </Card>

      <Card
        title="Assumptions"
        right={
          <button
            type="button"
            className="rs-link"
            onClick={() =>
              onRecords({
                ...records,
                assumptionRows: [
                  ...records.assumptionRows,
                  { a: "", why: "", risk: "", state: "Unconfirmed" },
                ],
              })
            }
          >
            + Add assumption
          </button>
        }
      >
        <p className="rs-note" style={{ marginTop: -4 }}>
          What the advice takes as given because nobody has established it. Each one is printed in
          the memo so the reader knows what the conclusion depends on.
        </p>
        {records.assumptionRows.length === 0 ? (
          <p className="rs-note">None recorded.</p>
        ) : (
          <table className="rs-table">
            <thead>
              <tr>
                <th>Assumption</th>
                <th style={{ width: 260 }}>Why it is assumed</th>
                <th style={{ width: 150 }}>If it is wrong</th>
                <th style={{ width: 140 }}>State</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {records.assumptionRows.map((row, index) => {
                const patch = (next: Partial<typeof row>) =>
                  onRecords({
                    ...records,
                    assumptionRows: records.assumptionRows.map((r, i) =>
                      i === index ? { ...r, ...next } : r,
                    ),
                  });
                return (
                  <tr key={index}>
                    <td>
                      <textarea
                        className="rs-textarea"
                        style={{ minHeight: 56 }}
                        aria-label={`Assumption ${index + 1}`}
                        placeholder="That the agreement is governed by…"
                        value={row.a}
                        onChange={(e) => patch({ a: e.target.value })}
                      />
                    </td>
                    <td>
                      <textarea
                        className="rs-textarea"
                        style={{ minHeight: 56 }}
                        aria-label={`Why assumption ${index + 1} is made`}
                        value={row.why}
                        onChange={(e) => patch({ why: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="rs-input"
                        aria-label={`Consequence if assumption ${index + 1} is wrong`}
                        value={row.risk}
                        onChange={(e) => patch({ risk: e.target.value })}
                      />
                    </td>
                    <td>
                      <select
                        className="rs-select"
                        aria-label={`State of assumption ${index + 1}`}
                        value={row.state || "Unconfirmed"}
                        onChange={(e) => patch({ state: e.target.value })}
                      >
                        {ASSUMPTION_STATES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="is-actions">
                      <button
                        type="button"
                        className="rs-link is-quiet is-danger"
                        aria-label={`Delete assumption ${index + 1}`}
                        onClick={() =>
                          onRecords({
                            ...records,
                            assumptionRows: records.assumptionRows.filter((_, i) => i !== index),
                          })
                        }
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Card
        title="Questions presented"
        right={
          <button
            type="button"
            className="rs-link"
            onClick={() =>
              setQuestions([
                ...records.issueCards,
                emptyQuestion(records.issueCards.length, state.jurisdiction),
              ])
            }
          >
            + Add question
          </button>
        }
      >
        <p className="rs-note" style={{ marginTop: -4 }}>
          The legal questions that have to be answered. These are the scope of the research: every
          later tab is organised around them, so settle them here before the work begins.
        </p>
        {records.issueCards.length === 0 ? (
          <Empty
            title="No questions yet"
            body="Write the instructions and the facts, then draft the questions from them. You can edit, reorder and delete anything Scripta proposes."
            action={
              <Button variant="primary" onClick={() => void draft()} disabled={busy}>
                Draft questions and plan
              </Button>
            }
          />
        ) : (
          records.issueCards.map((question, index) => (
            <div className="rs-question" key={`${question.no}-${index}`}>
              <div
                style={{ display: "flex", gap: 10, padding: "12px 14px", alignItems: "flex-start" }}
              >
                <span className="rs-question-no">{question.no}</span>
                <div
                  style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}
                >
                  <input
                    className="rs-input"
                    aria-label={`Question ${question.no}`}
                    placeholder="Can the parties contractually cap liability for breach?"
                    value={question.q}
                    onChange={(e) =>
                      setQuestions(
                        records.issueCards.map((c, i) =>
                          i === index ? { ...c, q: e.target.value } : c,
                        ),
                      )
                    }
                  />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input
                      className="rs-input"
                      style={{ flex: "1 1 220px" }}
                      aria-label={`Short name for ${question.no}`}
                      placeholder="Short name — liability cap"
                      value={question.short}
                      onChange={(e) =>
                        setQuestions(
                          records.issueCards.map((c, i) =>
                            i === index ? { ...c, short: e.target.value } : c,
                          ),
                        )
                      }
                    />
                    <select
                      className="rs-select"
                      style={{ width: 130 }}
                      aria-label={`Priority of ${question.no}`}
                      value={question.pri || "Medium"}
                      onChange={(e) =>
                        setQuestions(
                          records.issueCards.map((c, i) =>
                            i === index ? { ...c, pri: e.target.value } : c,
                          ),
                        )
                      }
                    >
                      {QUESTION_PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {p} priority
                        </option>
                      ))}
                    </select>
                    <label
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}
                    >
                      <input
                        type="checkbox"
                        checked={question.inReport}
                        onChange={(e) =>
                          setQuestions(
                            records.issueCards.map((c, i) =>
                              i === index ? { ...c, inReport: e.target.checked } : c,
                            ),
                          )
                        }
                      />
                      In the document
                    </label>
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    alignItems: "flex-end",
                  }}
                >
                  <button
                    type="button"
                    className="rs-link is-quiet"
                    disabled={index === 0}
                    onClick={() => {
                      const next = [...records.issueCards];
                      const [moved] = next.splice(index, 1);
                      next.splice(index - 1, 0, moved!);
                      setQuestions(next);
                    }}
                  >
                    Move up
                  </button>
                  <button
                    type="button"
                    className="rs-link is-quiet"
                    disabled={index === records.issueCards.length - 1}
                    onClick={() => {
                      const next = [...records.issueCards];
                      const [moved] = next.splice(index, 1);
                      next.splice(index + 1, 0, moved!);
                      setQuestions(next);
                    }}
                  >
                    Move down
                  </button>
                  <button
                    type="button"
                    className="rs-link is-quiet is-danger"
                    onClick={() => {
                      void (async () => {
                        if (
                          !(await confirmDelete({
                            what: question.short
                              ? `question ${question.no} “${question.short}”`
                              : `question ${question.no}`,
                            consequence:
                              "Its research and analysis go with it, and the questions after it are renumbered.",
                            archivable: false,
                          }))
                        )
                          return;
                        setQuestions(records.issueCards.filter((_, i) => i !== index));
                      })();
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </Card>

      <Card title="Research plan" hint="Where the research will look, and for what.">
        {planIsEmpty(records.plan) ? (
          <Empty
            title="No plan yet"
            body="Scripta proposes the legislation, courts and themes to work through when it drafts the questions. You can write one yourself instead."
            action={
              <Button onClick={() => setPlan({ ...records.plan, legislation: [""] })}>
                Write a plan
              </Button>
            }
          />
        ) : (
          <div className="rs-plan">
            {PLAN_PARTS.map((part) => (
              <div key={part.key} style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{part.label}</div>
                  <div className="rs-note">{part.hint}</div>
                </div>
                <LineList
                  values={records.plan[part.key] ?? []}
                  placeholder={part.hint}
                  label={part.label}
                  addLabel={`Add to ${part.label.toLowerCase()}`}
                  onChange={(values) => setPlan({ ...records.plan, [part.key]: values })}
                />
              </div>
            ))}
          </div>
        )}
      </Card>
      {footer}
      {confirmDialog}
    </div>
  );
}
