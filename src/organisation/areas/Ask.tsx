/**
 * Questions about the client, answered from its organisation.
 *
 * The questions lawyers are asked most — who signs, which entity, who handles
 * it, when does the licence expire, what is due, who reports to whom, who owns
 * what — are chips with the few facts they need, answered by the same
 * functions the other screens use (answers.ts), with no model involved.
 * Anything else can be typed; that goes to Scripta, which is given only this
 * organisation's records and must cite them. Either way an answer is sections,
 * the records behind it as chips that open them, and what the records do not
 * say.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/primitives";
import GeminiMark from "@/components/GeminiMark";
import type { AreaProps, OrgGo } from "../area";
import {
  dueBetween,
  holderOf,
  holdingsOf,
  licenceExpiry,
  ownersOf,
  reportsTo,
  thisMonth,
  whichEntity,
  whoHandles,
  whoSigns,
  type Answer,
  type Citation,
} from "../answers";
import { askOrganisation } from "../ask.functions";
import {
  liveEntities,
  localDay,
  monthLabel,
  ORG_CATEGORY_LABEL,
  categoryLabel,
  type OrgArea,
  type OrgCategory,
  type Organisation,
} from "../model";
import {
  EntitySelect,
  Eyebrow,
  Field,
  FieldRow,
  LinkButton,
  OrgPage,
  Panel,
  PersonSelect,
  RoleSelect,
  Select,
  TextArea,
  TextInput,
} from "../ui";
import "../governance.css";

type Chip = "signs" | "entity" | "handles" | "licence" | "due" | "reports" | "owns" | "holder";

const CHIPS: { id: Chip; label: string }[] = [
  { id: "signs", label: "Who signs this?" },
  { id: "entity", label: "Which entity should contract?" },
  { id: "handles", label: "Who handles this?" },
  { id: "licence", label: "When does a licence expire?" },
  { id: "due", label: "What is due this month?" },
  { id: "reports", label: "Who does this role report to?" },
  { id: "owns", label: "Who owns this entity?" },
  { id: "holder", label: "Who holds an office?" },
];

/** Where a citation opens. A holding opens the structure it belongs to. */
const AREA_OF: Record<Citation["recordType"], OrgArea> = {
  entity: "entities",
  person: "people",
  role: "organogram",
  licence: "licences",
  obligation: "calendar",
  rule: "authority",
  instrument: "authority",
  holding: "structure",
  appointment: "entities",
  responsibility: "people",
  process: "processes",
};

type Asked = { key: string; answer: Answer; source: "records" | "scripta" };

export default function Ask({ org, client, go, on }: AreaProps) {
  const [chip, setChip] = useState<Chip | null>(null);
  const [asked, setAsked] = useState<Asked[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ask = useServerFn(askOrganisation);

  const record = (answer: Answer, source: Asked["source"] = "records") =>
    setAsked((prev) => [{ key: crypto.randomUUID(), answer, source }, ...prev]);

  const askScripta = async () => {
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    try {
      const history = asked
        .slice(0, 4)
        .reverse()
        .map((a) => ({
          question: a.answer.question,
          answer: a.answer.sections.map((s) => `${s.label}: ${s.text}`).join(" "),
        }));
      const res = await ask({ data: { clientId: client.id, question: q, history } });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      record({ question: q, ...res.answer }, "scripta");
      setQuestion("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scripta could not answer that.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <OrgPage
      title={`Ask about ${client.name}`}
      subtitle="Answers are drawn from the organogram, group structure, entities, authority matrix and calendar, and cite them."
      aside={<Shelf org={org} go={go} processes={on("processes")} />}
    >
      <div className="og-chips gv-chips" role="group" aria-label="Common questions">
        {CHIPS.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`og-chip gv-question${chip === c.id ? " is-on" : ""}`}
            aria-pressed={chip === c.id}
            onClick={() => setChip(chip === c.id ? null : c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {chip && (
        <Panel title={CHIPS.find((c) => c.id === chip)?.label}>
          <QuestionForm
            key={chip}
            chip={chip}
            org={org}
            onAnswer={(a) => {
              record(a);
              setChip(null);
            }}
          />
        </Panel>
      )}

      {asked.length === 0 && !chip && (
        <p className="og-muted gv-lead">
          Choose a question above, or type one below. Answers from the chips are read straight from
          the records; typed questions are answered by Scripta from the same records.
        </p>
      )}

      {asked.map((a) => (
        <Panel
          key={a.key}
          className="gv-answer-panel"
          title={a.answer.question}
          right={
            <span className="gv-source-tag">
              {a.source === "scripta" ? (
                <>
                  <GeminiMark size={14} /> Drawn by Scripta
                  {a.answer.basis === "inference" ? " · inference" : ""}
                </>
              ) : a.answer.basis === "inference" ? (
                "From the records · recommendation"
              ) : (
                "From the records"
              )}
            </span>
          }
        >
          <AnswerView answer={a.answer} go={go} />
        </Panel>
      ))}

      {asked.length > 1 && (
        <div className="gv-asked">
          <Eyebrow>Asked this session</Eyebrow>
          <p className="og-row-meta">{asked.map((a) => a.answer.question).join(" · ")}</p>
        </div>
      )}

      <form
        className="gv-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void askScripta();
        }}
      >
        <label className="gv-composer-field">
          <span className="org-label">Ask about the organisation</span>
          <textarea
            rows={2}
            value={question}
            placeholder="We're signing a GHS 400,000 gold supply contract with a new supplier. Which entity should contract, and who signs?"
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void askScripta();
              }
            }}
            disabled={busy}
          />
        </label>
        <Button type="submit" variant="primary" disabled={busy || !question.trim()}>
          {busy ? "Asking…" : "Ask"}
        </Button>
      </form>
      {busy && (
        <p className="og-hint" role="status">
          Reading the organisation…
        </p>
      )}
      {error && (
        <p className="org-error" role="alert">
          {error}
        </p>
      )}
    </OrgPage>
  );
}

/** One answer: labelled sections, the records it rests on, and the gaps. */
export function AnswerView({
  answer,
  go,
  compact,
}: {
  answer: Answer;
  go: OrgGo;
  compact?: boolean;
}) {
  return (
    <div className={`gv-answer${compact ? " is-compact" : ""}`}>
      {answer.sections.length > 0 && (
        <dl className="gv-sections">
          {answer.sections.map((s, i) => (
            <div key={`${s.label}-${i}`}>
              <dt>{s.label}</dt>
              <dd>{s.text}</dd>
            </div>
          ))}
        </dl>
      )}
      {answer.gaps.length > 0 && (
        <ul className="gv-gaps" aria-label="What the records do not say">
          {answer.gaps.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      )}
      {answer.citations.length > 0 && (
        <div className="gv-based">
          <Eyebrow>Based on</Eyebrow>
          <div className="og-chips">
            {answer.citations.map((c) => (
              <button
                key={`${c.recordType}-${c.recordId}`}
                type="button"
                className="og-chip is-source"
                onClick={() =>
                  go({
                    area: AREA_OF[c.recordType],
                    item: [
                      "holding",
                      "appointment",
                      "responsibility",
                      "rule",
                      "instrument",
                    ].includes(c.recordType)
                      ? null
                      : c.recordId,
                    mode: null,
                  })
                }
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function QuestionForm({
  chip,
  org,
  onAnswer,
}: {
  chip: Chip;
  org: Organisation;
  onAnswer: (a: Answer) => void;
}) {
  const today = localDay();
  const types = [...new Set(org.rules.map((r) => r.matterType))].sort();
  const entities = liveEntities(org);
  const [text, setText] = useState(chip === "signs" ? (types[0] ?? "") : "");
  const [amount, setAmount] = useState("");
  const [entityId, setEntityId] = useState<string | null>(
    chip === "owns" ? (entities[0]?.id ?? null) : null,
  );
  const [roleId, setRoleId] = useState<string | null>(null);
  const [personId, setPersonId] = useState<string | null>(null);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [direction, setDirection] = useState<"owners" | "holdings">("owners");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    switch (chip) {
      case "signs": {
        const raw = amount.replace(/[,\s]/g, "");
        const value = raw ? Number(raw) : null;
        if (!text.trim()) return setError("Choose the kind of matter.");
        if (raw && !Number.isFinite(value)) return setError("The value must be a number.");
        return onAnswer(whoSigns(org, { matterType: text, amount: value, entityId }, today));
      }
      case "entity":
        if (!text.trim()) return setError("Describe the contract.");
        return onAnswer(whichEntity(org, text, today));
      case "handles":
        if (!text.trim()) return setError("Say what needs handling.");
        return onAnswer(whoHandles(org, text, today));
      case "licence":
        return onAnswer(licenceExpiry(org, { entityId, query: text }, today));
      case "due": {
        const { from, to } = thisMonth(`${month}-01`);
        return onAnswer(dueBetween(org, from, to, today));
      }
      case "reports":
        if (!roleId && !personId) return setError("Choose a role or a person.");
        return onAnswer(reportsTo(org, roleId ? { roleId } : { personId }));
      case "owns":
        if (!entityId) return setError("Choose an entity.");
        return onAnswer(
          direction === "owners"
            ? ownersOf(org, entityId, today)
            : holdingsOf(org, entityId, today),
        );
      case "holder":
        if (!text.trim()) return setError("Name the office or role.");
        return onAnswer(holderOf(org, text, entityId, today));
    }
  };

  return (
    <form
      className="gv-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {chip === "signs" && (
        <FieldRow>
          <Field label="Matter">
            <input
              list="og-ask-types"
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
            />
            <datalist id="og-ask-types">
              {types.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </Field>
          <Field label="Value">
            <TextInput value={amount} onChange={setAmount} placeholder="400000" />
          </Field>
          <Field label="Contracting entity">
            <EntitySelect org={org} value={entityId} onChange={setEntityId} empty="Not chosen" />
          </Field>
        </FieldRow>
      )}
      {chip === "entity" && (
        <Field
          label="What is being contracted"
          hint="The subject matter, counterparty and place: the words are matched to each entity's activity and licences."
        >
          <TextArea value={text} onChange={setText} rows={2} />
        </Field>
      )}
      {chip === "handles" && (
        <Field label="What needs handling" hint="e.g. tax filings, regulator liaison, payroll">
          <TextInput value={text} onChange={setText} autoFocus />
        </Field>
      )}
      {chip === "licence" && (
        <FieldRow>
          <Field label="Entity">
            <EntitySelect org={org} value={entityId} onChange={setEntityId} empty="Every entity" />
          </Field>
          <Field label="Licence" hint="Optional: a word from its name or authority">
            <TextInput value={text} onChange={setText} />
          </Field>
        </FieldRow>
      )}
      {chip === "due" && (
        <Field label="Month">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value || today.slice(0, 7))}
          />
          <span className="og-hint">
            {monthLabel(`${month}-01`)}, with anything already overdue
          </span>
        </Field>
      )}
      {chip === "reports" && (
        <FieldRow>
          <Field label="Role">
            <RoleSelect
              org={org}
              value={roleId}
              onChange={(id) => {
                setRoleId(id);
                if (id) setPersonId(null);
              }}
              empty="Choose a role"
            />
          </Field>
          <Field label="Or a person">
            <PersonSelect
              org={org}
              value={personId}
              onChange={(id) => {
                setPersonId(id);
                if (id) setRoleId(null);
              }}
              empty="Choose a person"
            />
          </Field>
        </FieldRow>
      )}
      {chip === "owns" && (
        <FieldRow>
          <Field label="Entity">
            <EntitySelect
              org={org}
              value={entityId}
              onChange={setEntityId}
              empty="Choose an entity"
            />
          </Field>
          <Field label="Question">
            <Select
              value={direction}
              onChange={(v) => setDirection(v === "holdings" ? "holdings" : "owners")}
              options={[
                { value: "owners", label: "Who owns it" },
                { value: "holdings", label: "What it owns" },
              ]}
            />
          </Field>
        </FieldRow>
      )}
      {chip === "holder" && (
        <FieldRow>
          <Field
            label="Office or role"
            hint="e.g. managing director, company secretary, finance manager"
          >
            <TextInput value={text} onChange={setText} autoFocus />
          </Field>
          <Field label="Entity">
            <EntitySelect org={org} value={entityId} onChange={setEntityId} empty="Any entity" />
          </Field>
        </FieldRow>
      )}
      {error && (
        <p className="org-error" role="alert">
          {error}
        </p>
      )}
      <div>
        <Button type="submit" variant="primary">
          Answer
        </Button>
      </div>
    </form>
  );
}

/** Read-only: the processes an answer can start, and the shelf answers are read from. */
function Shelf({
  org,
  go,
  processes: showProcesses,
}: {
  org: Organisation;
  go: OrgGo;
  processes: boolean;
}) {
  const processes = org.processes.filter((p) => !p.archivedAt);
  const byCategory = new Map<OrgCategory | "uncategorised", number>();
  for (const d of org.documents.filter((x) => !x.archivedAt)) {
    const key = d.category ?? "uncategorised";
    byCategory.set(key, (byCategory.get(key) ?? 0) + 1);
  }
  return (
    <>
      {showProcesses && (
        <section className="gv-shelf">
          <div className="gv-ctx-head">
            <h3>Processes</h3>
            <LinkButton onClick={() => go({ area: "processes", item: null, mode: null })}>
              {processes.length ? "All processes" : "Record one"}
            </LinkButton>
          </div>
          {processes.length === 0 ? (
            <p className="og-muted">No processes recorded.</p>
          ) : (
            processes.slice(0, 4).map((p) => {
              const steps = org.steps
                .filter((s) => s.processId === p.id)
                .sort((a, b) => a.position - b.position);
              return (
                <button
                  key={p.id}
                  type="button"
                  className="gv-shelf-card"
                  onClick={() => go({ area: "processes", item: p.id, mode: null })}
                >
                  <span className="gv-shelf-title">
                    {p.name}
                    <span className="og-eyebrow">
                      {p.status === "published" ? `${steps.length} steps` : "Draft"}
                    </span>
                  </span>
                  {steps.length > 0 && (
                    <span className="gv-steps">
                      {steps.slice(0, 6).map((s, i) => (
                        <span key={s.id}>
                          {i > 0 && <span aria-hidden> › </span>}
                          <span className="gv-step">{s.title}</span>
                        </span>
                      ))}
                      {steps.length > 6 && <span className="og-muted"> +{steps.length - 6}</span>}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </section>
      )}
      <section className="gv-shelf">
        <div className="gv-ctx-head">
          <h3>Key documents</h3>
          <LinkButton onClick={() => go({ area: "documents", item: null, mode: null })}>
            {org.documents.length ? `${org.documents.length} on file` : "Add one"}
          </LinkButton>
        </div>
        {byCategory.size === 0 ? (
          <p className="og-muted">No documents held for this client.</p>
        ) : (
          <ul className="gv-shelf-list">
            {[...byCategory.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([key, n]) => (
                <li key={key}>
                  <span>
                    {key === "uncategorised" ? "Not yet sorted" : categoryLabel(key)}
                  </span>
                  <span className="og-mono og-muted">{n}</span>
                </li>
              ))}
          </ul>
        )}
      </section>
    </>
  );
}
