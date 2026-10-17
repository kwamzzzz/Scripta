/**
 * A blueprint is what Scripta knows about a kind of corporate document: what
 * it needs to ask, what sections the finished instrument has, in what order,
 * and what a lawyer needs to know to write each one.
 *
 * It is deterministic on purpose. The structure of a written board resolution
 * is not a matter of opinion, so it is not a matter for a language model: the
 * blueprint lays the document out the moment setup is done, offline, the same
 * way every time. Scripta's drafting help then works section by section on top
 * of a structure that is already correct.
 */
import { makePart, type EditorPart } from "@/editor/model";
import type { CorporateDocumentKind, CorporateGroup } from "./kinds";

export type Answers = Record<string, string | string[]>;

export const answer = (a: Answers, key: string): string => {
  const value = a[key];
  return typeof value === "string" ? value.trim() : "";
};

export const answerList = (a: Answers, key: string): string[] => {
  const value = a[key];
  if (Array.isArray(value)) return value.map((v) => v.trim()).filter(Boolean);
  return answer(a, key)
    .split("\n")
    .map((v) => v.trim())
    .filter(Boolean);
};

export type SetupFieldKind = "text" | "textarea" | "date" | "choice" | "list";

export type SetupField = {
  key: string;
  label: string;
  kind: SetupFieldKind;
  /** Why Scripta is asking, in the lawyer's terms. */
  help?: string;
  placeholder?: string;
  options?: { value: string; label: string; help?: string }[];
  required?: boolean;
  /** Asked only when the answers so far call for it. */
  when?: (a: Answers) => boolean;
};

export type SetupStep = {
  id: string;
  title: string;
  intro?: string;
  fields: SetupField[];
};

export type SectionSpec = {
  group: CorporateGroup;
  title: string;
  /** What this section is for and what makes it right. Shown in the guide. */
  guide: string;
  /** What belongs here while it is empty. */
  placeholder: string;
  /** Wording built from the answers. Empty leaves the section for the lawyer. */
  seed?: string;
  /** A section the lawyer can delete without the document being wrong. */
  optional?: boolean;
};

export type Blueprint = {
  kind: CorporateDocumentKind;
  /** The document's own name, from the answers. */
  title: (a: Answers) => string;
  steps: SetupStep[];
  /** The facts that furnish the document, keyed as the export reads them. */
  particulars: (a: Answers) => Record<string, string>;
  /** Who signs. */
  signatories: (a: Answers) => string[];
  /** The document's sections, in order, decided by the answers. */
  sections: (a: Answers) => SectionSpec[];
};

/* ----------------------------------------------------------------- ask */

/** The fields of a step that the answers so far call for. */
export const visibleFields = (step: SetupStep, a: Answers): SetupField[] =>
  step.fields.filter((f) => !f.when || f.when(a));

/** The steps that have anything to ask, given the answers so far. */
export const visibleSteps = (blueprint: Blueprint, a: Answers): SetupStep[] =>
  blueprint.steps.filter((step) => visibleFields(step, a).length > 0);

/** Required fields that are currently visible and still unanswered. */
export function missingAnswers(blueprint: Blueprint, a: Answers): SetupField[] {
  return visibleSteps(blueprint, a)
    .flatMap((step) => visibleFields(step, a))
    .filter((field) => field.required && !answer(a, field.key) && !answerList(a, field.key).length);
}

export const setupComplete = (blueprint: Blueprint, a: Answers) =>
  missingAnswers(blueprint, a).length === 0;

/* --------------------------------------------------------------- build */

export type BuiltDocument = {
  title: string;
  particulars: Record<string, string>;
  signatories: string[];
  parts: (EditorPart & { group: CorporateGroup })[];
};

/**
 * The document a blueprint and a set of answers make: its title, the facts
 * that furnish it, who signs, and every section in order, each carrying the
 * guidance for writing it.
 */
export function buildDocument(blueprint: Blueprint, a: Answers): BuiltDocument {
  const parts = blueprint.sections(a).map((section) =>
    Object.assign(
      makePart({
        title: section.title,
        text: section.seed ?? "",
        placeholder: section.placeholder,
        hint: section.guide,
      }),
      { group: section.group },
    ),
  );
  return {
    title: blueprint.title(a),
    particulars: blueprint.particulars(a),
    signatories: blueprint.signatories(a),
    parts,
  };
}
