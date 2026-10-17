/**
 * Starting a corporate document.
 *
 * The old New resolution button made an empty row and dropped the lawyer into
 * an editor with two blank headings, which is the wrong way round: a lawyer who
 * knows the matter but has not drafted this instrument before does not know
 * what the instrument needs. So Scripta asks first — only what this document
 * needs, and later questions only when earlier answers call for them — and then
 * lays the document out itself.
 *
 * Nothing here is compulsory. Anyone who would rather just write can open a
 * blank document of the right kind and start typing.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileText, Gavel, ScrollText, Users } from "lucide-react";
import AppShell, { Crumbs } from "@/components/AppShell";
import { Button } from "@/components/primitives";
import { useApp } from "@/store/app";
import { C } from "@/lib/tokens";
import { listLetterheads } from "@/lib/letterheads";
import {
  answer,
  answerList,
  buildDocument,
  missingAnswers,
  setupComplete,
  visibleFields,
  visibleSteps,
  type Answers,
  type SetupField,
} from "@/lib/corporate/blueprint";
import { blueprintFor } from "@/lib/corporate/blueprints";
import {
  CORPORATE_KINDS,
  GROUP_LABEL,
  KIND_LABEL,
  KIND_SUMMARY,
  type CorporateDocumentKind,
} from "@/lib/corporate/kinds";
import { createCorporateDocument, renumberCorporateParts } from "@/lib/corporate-documents";
import { emptyMeta } from "@/editor/model";
import "./corporate-setup.css";

const KIND_ICON: Record<CorporateDocumentKind, typeof FileText> = {
  board_written_resolution: Gavel,
  board_minutes: Users,
  shareholder_written_resolution: ScrollText,
  letter: FileText,
};

export default function CorporateSetupScreen({
  kind: initialKind,
  matterId,
}: {
  kind?: string;
  /** Started from a matter: the document is filed to it from the outset. */
  matterId?: string;
}) {
  const { workspaceId } = useApp();
  const navigate = useNavigate();
  const [kind, setKind] = useState<CorporateDocumentKind | null>(
    CORPORATE_KINDS.includes(initialKind as CorporateDocumentKind)
      ? (initialKind as CorporateDocumentKind)
      : null,
  );
  const [answers, setAnswers] = useState<Answers>({});
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const letterheads = useQuery({
    queryKey: ["letterheads", workspaceId],
    queryFn: () => listLetterheads(workspaceId!),
    enabled: !!workspaceId,
  });
  const defaultPaper = letterheads.data?.find((item) => item.isDefault)?.id ?? null;

  const blueprint = kind ? blueprintFor(kind) : null;
  const steps = useMemo(
    () => (blueprint ? visibleSteps(blueprint, answers) : []),
    [blueprint, answers],
  );
  const built = useMemo(
    () => (blueprint ? buildDocument(blueprint, answers) : null),
    [blueprint, answers],
  );
  const ready = blueprint ? setupComplete(blueprint, answers) : false;
  const missing = blueprint ? missingAnswers(blueprint, answers) : [];

  const set = (key: string, value: string | string[]) =>
    setAnswers((current) => ({ ...current, [key]: value }));

  const create = useMutation({
    mutationFn: async (mode: "built" | "blank") => {
      if (!workspaceId || !kind) throw new Error("No workspace");
      const content =
        mode === "built" && built
          ? {
              version: 2 as const,
              particulars: built.particulars,
              directors: built.signatories.length ? built.signatories : [""],
              parts: renumberCorporateParts(built.parts),
              meta: emptyMeta(),
            }
          : undefined;
      return createCorporateDocument(workspaceId, kind, {
        letterheadId: defaultPaper,
        ...(matterId ? { matterId } : {}),
        ...(mode === "built" && built ? { title: built.title } : {}),
        ...(content ? { content } : {}),
      });
    },
    onSuccess: (created) =>
      void navigate({
        to: "/matters/corporate-drafting/$documentId",
        params: { documentId: created.id },
      }),
    onError: (cause) => setError((cause as Error).message),
  });

  const crumbs = (
    <Crumbs
      items={[
        { label: "Corporate Drafting", to: "/matters/corporate-drafting" },
        { label: kind ? KIND_LABEL[kind] : "New document" },
      ]}
    />
  );

  /* ------------------------------------------------------- type picker */

  if (!kind)
    return (
      <AppShell section="corporate-drafting" breadcrumb={crumbs}>
        <div className="cs-page">
          <header className="cs-head">
            <h1>What are you drafting?</h1>
            <p>
              Scripta will ask what this instrument needs, then lay it out. You can change
              everything afterwards.
            </p>
          </header>
          <div className="cs-kinds">
            {CORPORATE_KINDS.map((option) => {
              const Icon = KIND_ICON[option];
              return (
                <button
                  key={option}
                  type="button"
                  className="cs-kind"
                  onClick={() => setKind(option)}
                >
                  <span className="cs-kind-icon">
                    <Icon size={17} strokeWidth={1.7} />
                  </span>
                  <span className="cs-kind-name">{KIND_LABEL[option]}</span>
                  <span className="cs-kind-summary">{KIND_SUMMARY[option]}</span>
                </button>
              );
            })}
          </div>
        </div>
      </AppShell>
    );

  /* ------------------------------------------------------------- setup */

  return (
    <AppShell section="corporate-drafting" breadcrumb={crumbs} scroll={false}>
      <div className="cs-layout">
        <div className="cs-page">
          <header className="cs-head">
            <button type="button" className="cs-back" onClick={() => setKind(null)}>
              <ArrowLeft size={12} strokeWidth={2} /> Choose a different document
            </button>
            <h1>{KIND_LABEL[kind]}</h1>
            <p>{KIND_SUMMARY[kind]}</p>
          </header>

          {steps.map((step, index) => {
            const fields = visibleFields(step, answers);
            const earlier = steps.slice(0, index);
            // A step opens once the ones before it are answered, so the page
            // reveals itself rather than presenting everything at once.
            const reached =
              showAll ||
              earlier.every((s) =>
                visibleFields(s, answers)
                  .filter((f) => f.required)
                  .every((f) => answer(answers, f.key) || answerList(answers, f.key).length),
              );
            if (!reached) return null;
            return (
              <section key={step.id} className="cs-step">
                <div className="cs-step-head">
                  <span className="cs-step-num">{index + 1}</span>
                  <div>
                    <h2>{step.title}</h2>
                    {step.intro && <p>{step.intro}</p>}
                  </div>
                </div>
                <div className="cs-fields">
                  {fields.map((field) => (
                    <Field
                      key={field.key}
                      field={field}
                      value={answers[field.key] ?? ""}
                      onChange={(value) => set(field.key, value)}
                    />
                  ))}
                </div>
              </section>
            );
          })}

          {error && (
            <div role="alert" className="cs-error">
              {error}
            </div>
          )}

          <div className="cs-actions">
            <Button
              variant="primary"
              disabled={!ready || create.isPending}
              onClick={() => create.mutate("built")}
              title={
                ready
                  ? "Build the document and open it"
                  : `Still needed: ${missing.map((f) => f.label).join(", ")}`
              }
            >
              {create.isPending ? "Building…" : "Build the document"}
            </Button>
            <Button onClick={() => create.mutate("blank")} disabled={create.isPending}>
              Skip setup, open a blank document
            </Button>
            {!ready && missing.length > 0 && (
              <span className="cs-missing">
                Still needed: {missing.map((f) => f.label).join(", ")}
              </span>
            )}
          </div>
          {!showAll && (
            <button type="button" className="cs-showall" onClick={() => setShowAll(true)}>
              Show every question at once
            </button>
          )}
        </div>

        <aside className="cs-preview" aria-label="What Scripta will build">
          <h2>What Scripta will build</h2>
          <p className="cs-preview-note">
            {built?.parts.length
              ? "These sections, in this order. Add, remove, reorder or rewrite any of them afterwards."
              : "Answer the questions and the structure appears here."}
          </p>
          <ol className="cs-outline">
            {(built?.parts ?? []).map((part) => (
              <li key={part.id}>
                <span className="cs-outline-group">{GROUP_LABEL[part.group]}</span>
                <span className="cs-outline-title">{part.title}</span>
                {part.hint && <span className="cs-outline-guide">{part.hint}</span>}
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </AppShell>
  );
}

function Field({
  field,
  value,
  onChange,
}: {
  field: SetupField;
  value: string | string[];
  onChange: (value: string | string[]) => void;
}) {
  const text = Array.isArray(value) ? value.join("\n") : value;
  const id = `cs-${field.key}`;
  return (
    <div className={`cs-field${field.kind === "choice" ? " is-choice" : ""}`}>
      <label htmlFor={field.kind === "choice" ? undefined : id}>
        {field.label}
        {field.required && <span aria-hidden> *</span>}
      </label>
      {field.help && <p className="cs-help">{field.help}</p>}
      {field.kind === "choice" ? (
        <div role="radiogroup" aria-label={field.label} className="cs-choices">
          {(field.options ?? []).map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={text === option.value}
              className={`cs-choice${text === option.value ? " is-on" : ""}`}
              onClick={() => onChange(option.value)}
            >
              <span>{option.label}</span>
              {option.help && <span className="cs-choice-help">{option.help}</span>}
            </button>
          ))}
        </div>
      ) : field.kind === "textarea" || field.kind === "list" ? (
        <textarea
          id={id}
          value={text}
          placeholder={field.placeholder ?? ""}
          onChange={(e) =>
            onChange(field.kind === "list" ? e.target.value.split("\n") : e.target.value)
          }
          rows={field.kind === "list" ? 4 : 3}
        />
      ) : (
        <input
          id={id}
          type={field.kind === "date" ? "date" : "text"}
          value={text}
          placeholder={field.placeholder ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {field.kind === "list" && <p className="cs-help">One per line.</p>}
    </div>
  );
}

export const SETUP_ACCENT = C.accent;
