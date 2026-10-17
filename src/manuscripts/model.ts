/**
 * Book Review: the manuscript model.
 *
 * A manuscript is read into atoms that each know where they live
 * (sentence → paragraph → section → chapter → manuscript), with the things
 * that are not running prose kept apart as their own kinds: notes, tables,
 * figures, captions, quotations, bibliography entries. Nothing is flattened
 * into ordinary paragraphs, and nothing loses its provenance (the page in a
 * PDF, the paragraph index in a Word file).
 *
 * Review locally. Validate globally. Preserve the author's voice. Query what
 * should not be silently changed.
 */

export type ManuscriptKind = "thesis" | "dissertation" | "book" | "monograph" | "report" | "other";

export const MANUSCRIPT_KINDS: { key: ManuscriptKind; label: string }[] = [
  { key: "thesis", label: "Thesis" },
  { key: "dissertation", label: "Dissertation" },
  { key: "book", label: "Book" },
  { key: "monograph", label: "Monograph" },
  { key: "report", label: "Report" },
  { key: "other", label: "Other manuscript" },
];

export type NodeKind =
  | "front" // title page, abstract, acknowledgements, contents: before chapter 1
  | "part"
  | "chapter"
  | "heading" // section / subsection heading below chapter level
  | "paragraph"
  | "quote"
  | "list_item"
  | "table"
  | "figure"
  | "caption"
  | "equation"
  | "footnote"
  | "endnote"
  | "toc_entry"
  | "bibliography_entry";

/**
 * One atom of the manuscript as parsed. `ord` is document order and is the
 * identity within a version; `key` is a stable id the parser gives it so
 * notes and captions can point at their host before rows exist.
 */
export type ParsedNode = {
  key: string;
  kind: NodeKind;
  /** Heading depth: 1 = chapter (or part, where the manuscript has parts), 2 = section… */
  level: number;
  /** "4", "4.2", "Table 6.2", "Figure 3", "12" for a note. Empty where the text has none. */
  number: string;
  /** Heading text, caption title, note marker. */
  label: string;
  text: string;
  /** The key of the heading/chapter this atom sits under (none for front matter). */
  parentKey: string | null;
  /** The key of the chapter this atom belongs to. */
  chapterKey: string | null;
  /** Where it came from: page in a PDF, paragraph index in a Word file. */
  page?: number | undefined;
  source?: number | undefined;
  /** Note markers referenced from this paragraph ("12", "13"). */
  noteRefs?: string[] | undefined;
  /** Rows of a table, cell text only. */
  rows?: string[][] | undefined;
  /** Word style name, or the PDF font size, kept for the checks. */
  style?: string | undefined;
};

export type ParsedManuscript = {
  title: string;
  format: "docx" | "pdf";
  nodes: ParsedNode[];
  /** Anything the parser had to guess, said plainly so the reader can check it. */
  warnings: string[];
};

/* -------------------------------------------------------------- findings -- */

export type FindingCategory =
  | "error"
  | "consistency"
  | "clarity"
  | "style"
  | "citation"
  | "cross_reference"
  | "coherence"
  | "query"
  | "suggestion";

export const CATEGORY_LABEL: Record<FindingCategory, string> = {
  error: "Error",
  consistency: "Consistency",
  clarity: "Clarity",
  style: "Style",
  citation: "Citation",
  cross_reference: "Cross-reference",
  coherence: "Coherence",
  query: "Query",
  suggestion: "Suggestion",
};

export type FindingSeverity = "critical" | "material" | "minor";

export const SEVERITY_LABEL: Record<FindingSeverity, string> = {
  critical: "Critical",
  material: "Material",
  minor: "Minor",
};

/**
 * What the finding asks of the author. A correction is objectively wrong and
 * carries its fix; a query is a question only the author can answer (Scripta
 * never guesses which of two dates is right); a suggestion is optional.
 */
export type FindingAction = "correction" | "query" | "suggestion";

export const ACTION_LABEL: Record<FindingAction, string> = {
  correction: "Correction",
  query: "Author query",
  suggestion: "Suggestion",
};

export type ReviewPass =
  | "structure"
  | "mechanics"
  | "style"
  | "consistency"
  | "coherence"
  | "citations"
  | "references"
  | "verification";

export const PASS_LABEL: Record<ReviewPass, string> = {
  structure: "Structure",
  mechanics: "Proofreading",
  style: "Style sheet",
  consistency: "Consistency",
  coherence: "Argument & coherence",
  citations: "Citations",
  references: "Tables, figures & references",
  verification: "Verification",
};

export type FindingStatus = "open" | "accepted" | "resolved" | "dismissed";

/** A place in the manuscript the finding rests on: the reader can go and look. */
export type Evidence = {
  nodeKey: string;
  /** The sentence of that paragraph, 1-based (see sentences.ts), when the finding is about one. */
  sentence?: number | undefined;
  /** The exact words, when the finding is about particular words. */
  quote?: string | undefined;
  note?: string | undefined;
};

export type DraftFinding = {
  pass: ReviewPass;
  category: FindingCategory;
  severity: FindingSeverity;
  action: FindingAction;
  title: string;
  body: string;
  /** For a correction: the exact words as they stand, and what they should read. */
  original?: string | undefined;
  replacement?: string | undefined;
  evidence: Evidence[];
  /**
   * Same problem, same place, same words → same fingerprint, so a second run
   * does not raise it again and a new version can say whether it survived.
   */
  fingerprint: string;
  source: "rule" | "ai";
  /** The style-sheet rule this applies, if any. */
  ruleId?: string | undefined;
};

/* ------------------------------------------------------------ style sheet -- */

export type StyleCategory =
  | "spelling"
  | "terminology"
  | "abbreviation"
  | "capitalisation"
  | "hyphenation"
  | "numbers"
  | "dates"
  | "punctuation"
  | "citation"
  | "names"
  | "other";

export const STYLE_CATEGORY_LABEL: Record<StyleCategory, string> = {
  spelling: "Spelling",
  terminology: "Terminology",
  abbreviation: "Abbreviations",
  capitalisation: "Capitalisation",
  hyphenation: "Hyphenation",
  numbers: "Numbers",
  dates: "Dates",
  punctuation: "Punctuation",
  citation: "Citations",
  names: "Names",
  other: "Other",
};

export type StyleRule = {
  id: string;
  category: StyleCategory;
  /** The form to use: "organisation", "UAE", "22 September 2026". */
  preferred: string;
  /** Forms that should become the preferred one. Empty for a general rule. */
  variants: string[];
  /** The rule in words, for rules that are not a simple spelling. */
  note: string;
  /** detected: Scripta noticed the manuscript's own majority usage. author: set by a person. */
  origin: "detected" | "author";
  active: boolean;
};

/* --------------------------------------------------- chapters and the map -- */

export type ChapterSummary = {
  purpose: string;
  summary: string;
  propositions: string[];
  findings: string[];
  evidence: string[];
  concepts: { term: string; meaning: string }[];
  relationship: string;
  contribution: string;
  questionsAddressed: string[];
  gaps: string[];
  /** Facts other chapters are checked against. Each carries the passage it came from. */
  facts: ChapterFact[];
};

export type ChapterFact = {
  kind: "date" | "number" | "name" | "definition" | "claim" | "finding";
  /** What the fact is about: "start of fieldwork", "corporate governance". */
  subject: string;
  /** What the chapter says about it: "2018", "the system by which companies are directed". */
  value: string;
  nodeKey: string;
  /** The sentence that states it, 1-based. */
  sentence?: number | undefined;
};

export type ChapterAssessment = {
  overall: string;
  clarity: string;
  structure: string;
  coherence: string;
  support: string;
  duplication: string;
  roleInManuscript: string;
};

export type ChapterReviewState = "not_reviewed" | "reviewing" | "reviewed";

export type ManuscriptMap = {
  thesis: string;
  researchQuestions: { id: string; text: string }[];
  objectives: string[];
  methodology: string;
  chapters: {
    chapterKey: string;
    role: string;
    establishes: string[];
    reliesOn: string[];
    answers: string[]; // research question ids
  }[];
};

/** What to review. The target is what is reviewed; context is always the whole manuscript. */
export type ReviewScope = "full" | "chapters" | "consistency" | "proofreading";

export const SCOPE_CHOICES: { key: ReviewScope; label: string; meaning: string }[] = [
  {
    key: "full",
    label: "Entire manuscript",
    meaning: "Every pass, every chapter, then the cross-chapter review.",
  },
  {
    key: "chapters",
    label: "Chapters",
    meaning: "The chapters you choose, read against the rest of the manuscript.",
  },
  {
    key: "consistency",
    label: "Final consistency review",
    meaning: "Cross-chapter and manuscript-wide integrity only.",
  },
  {
    key: "proofreading",
    label: "Proofreading only",
    meaning: "Language, mechanics and the style sheet.",
  },
];

/** The passes each scope runs. */
export function passesFor(scope: ReviewScope): ReviewPass[] {
  switch (scope) {
    case "full":
    case "chapters":
      return [
        "structure",
        "references",
        "citations",
        "style",
        "mechanics",
        "consistency",
        "coherence",
      ];
    case "consistency":
      return ["structure", "references", "citations", "style", "consistency", "coherence"];
    case "proofreading":
      return ["style", "mechanics"];
  }
}

/* ---------------------------------------------------------------- helpers -- */

/** A short stable hash (FNV-1a) for fingerprints and paragraph identity. */
export function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function fingerprint(parts: (string | undefined)[]): string {
  return hash(parts.map((p) => (p ?? "").toLowerCase().replace(/\s+/g, " ").trim()).join("|"));
}

export const wordCount = (text: string) => (text.match(/[\p{L}\p{N}’'-]+/gu) ?? []).length;
