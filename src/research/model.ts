/**
 * The research record.
 *
 * Legal research is not a question and an answer. It is a chain — facts, the
 * questions those facts raise, the sources that answer them, the propositions
 * those sources establish, the analysis that applies them, and the document
 * that says so — and the value of the tool is that you can walk that chain
 * backwards from any link. This module is the vocabulary of that chain: what a
 * question is, what a source is, how far a conclusion is supported, and the
 * pure functions that derive one from another.
 *
 * Nothing here touches the database or the model. The shapes are the ones
 * `@/lib/research-rows` maps to the research tables.
 */
import type { ResearchAuthority, ResearchFinding } from "@/lib/research.functions";
import type { ResearchState } from "@/wireframe/research-store";
import type { StoredFact, StoredIssue, StoredPlan, StoredRecords } from "@/lib/research-rows";

/* ------------------------------------------------------------ confidence -- */

/**
 * How far a conclusion is carried by the authority behind it.
 *
 * Deliberately not a percentage. "87% confident" tells a lawyer nothing they
 * can act on; "limited authority" tells them exactly where their own judgement
 * is still required, which is the only thing the label is for.
 */
export type Confidence =
  "" | "well_supported" | "supported" | "limited" | "conflicting" | "unresolved";

export const CONFIDENCE: {
  key: Confidence;
  label: string;
  meaning: string;
  tone: "ok" | "practice" | "risk" | "law" | "context";
}[] = [
  {
    key: "",
    label: "Not assessed",
    meaning: "No conclusion has been reached on this question yet.",
    tone: "context",
  },
  {
    key: "well_supported",
    label: "Well supported",
    meaning: "Several reliable authorities point the same way, and none of them is doubtful.",
    tone: "ok",
  },
  {
    key: "supported",
    label: "Supported",
    meaning: "There is adequate authority for the conclusion.",
    tone: "ok",
  },
  {
    key: "limited",
    label: "Limited authority",
    meaning:
      "The conclusion is plausible, but the authority for it is thin. Your own judgement carries weight here.",
    tone: "practice",
  },
  {
    key: "conflicting",
    label: "Conflicting authority",
    meaning: "Authorities point in different directions and the conflict has not been resolved.",
    tone: "risk",
  },
  {
    key: "unresolved",
    label: "Unresolved",
    meaning: "The question cannot be answered on the authority found. Say so in the advice.",
    tone: "risk",
  },
];

export const confidenceOf = (key: string) =>
  CONFIDENCE.find((c) => c.key === key) ?? CONFIDENCE[0]!;

/* ---------------------------------------------------------------- sources -- */

/** Primary law, or writing about it. */
export const TIERS = ["primary", "secondary"] as const;
export const TIER_LABEL: Record<string, string> = { primary: "Primary", secondary: "Secondary" };

/**
 * Whether a source can still be relied on. This is the single most useful
 * thing a research tool can tell a lawyer, and the reason a repealed provision
 * quoted in old commentary has to be visible as repealed rather than quietly
 * carried into the advice.
 */
export const STATUSES = ["current", "repealed", "superseded", "unverified"] as const;
export const STATUS_LABEL: Record<string, string> = {
  current: "Current",
  repealed: "Repealed",
  superseded: "Superseded",
  unverified: "Unable to verify",
};
export const STATUS_TONE: Record<string, "ok" | "risk" | "practice" | "context"> = {
  current: "ok",
  repealed: "risk",
  superseded: "practice",
  unverified: "context",
};

export const WEIGHTS = ["binding", "persuasive"] as const;
export const WEIGHT_LABEL: Record<string, string> = {
  binding: "Binding",
  persuasive: "Persuasive",
};

export const SOURCE_KINDS = [
  "STATUTE",
  "COURT DECISION",
  "REGULATION",
  "SECONDARY",
  "UNVERIFIED",
] as const;

/** A source is primary unless it is commentary. Used where the model left the tier blank. */
export const tierFor = (kind: string): string =>
  kind === "SECONDARY" ? "secondary" : kind === "UNVERIFIED" ? "" : "primary";

/** A source whose status is doubtful, so the screens can count them in one place. */
export const isDoubtful = (a: ResearchAuthority) =>
  a.status === "repealed" ||
  a.status === "superseded" ||
  a.status === "unverified" ||
  a.kind === "UNVERIFIED";

/* -------------------------------------------------------------- questions -- */

export type Question = StoredIssue;

export const QUESTION_PRIORITIES = ["High", "Medium", "Low"] as const;

/** A blank question, numbered after the ones already there. */
export function emptyQuestion(index: number, jurisdiction = ""): Question {
  return {
    no: `Q${index + 1}`,
    short: "",
    q: "",
    juris: jurisdiction,
    pri: "Medium",
    state: "Open",
    answer: "",
    pos: "",
    risk: "",
    auth: "",
    assignee: "Unassigned",
    inReport: true,
    done: false,
    rule: "",
    application: "",
    counterpoint: "",
    conclusion: "",
    confidence: "",
    researchStatus: "",
    reasoning: "",
  };
}

/** Questions renumbered Q1, Q2, … in the order they sit in. */
export const renumberQuestions = (questions: Question[]): Question[] =>
  questions.map((q, i) => ({ ...q, no: `Q${i + 1}` }));

/** Everything the research found for one question. */
export function findingsFor(state: ResearchState, no: string): ResearchFinding[] {
  const findings = state.answer?.findings ?? [];
  // Research run before a question existed carries no question number; it
  // belongs to the matter as a whole and is shown against every question only
  // when there are no question-specific findings at all.
  const own = findings.filter((f) => (f.issueNo ?? "") === no);
  return own.length ? own : [];
}

/** The authorities a question's findings cite, in citation order. */
export function authoritiesFor(state: ResearchState, no: string): ResearchAuthority[] {
  const cited = new Set(findingsFor(state, no).flatMap((f) => f.cites));
  return (state.answer?.authorities ?? []).filter((a) => cited.has(a.n)).sort((a, b) => a.n - b.n);
}

/** Which questions a source is used in, read from the findings rather than the label. */
export function questionsUsingAuthority(state: ResearchState, n: number): string[] {
  const nos = new Set<string>();
  for (const f of state.answer?.findings ?? [])
    if (f.cites.includes(n) && f.issueNo) nos.add(f.issueNo);
  return [...nos].sort();
}

/** Has this question been researched at all? */
export const isResearched = (state: ResearchState, no: string) =>
  findingsFor(state, no).length > 0 || !!state.answer?.findings.some((f) => !f.issueNo);

/** Has the analysis been written? */
export const hasAnalysis = (q: Question) =>
  !!(q.rule.trim() || q.application.trim() || q.conclusion.trim());

/* ------------------------------------------------------------------ facts -- */

export type Fact = StoredFact;

export const FACT_CLASSES = ["Verified", "Client-provided", "Disputed", "Assumed", "Missing"];
export const FACT_TONE: Record<string, "ok" | "practice" | "risk" | "context"> = {
  Verified: "ok",
  "Client-provided": "context",
  Disputed: "risk",
  Assumed: "practice",
  Missing: "risk",
};

/** A blank fact. Ids carry a random tail so deleting one never collides. */
export function emptyFact(index: number): Fact {
  return {
    id: `F-${String(index + 1).padStart(2, "0")}-${Math.random().toString(36).slice(2, 6)}`,
    fact: "",
    src: "",
    cls: "Client-provided",
    issue: "",
    conf: "",
  };
}

/* ------------------------------------------------------------------- plan -- */

export type Plan = StoredPlan;
export const PLAN_PARTS: { key: keyof Plan; label: string; hint: string }[] = [
  { key: "legislation", label: "Primary legislation", hint: "The statutes and codes to read" },
  { key: "caseLaw", label: "Case law", hint: "The courts whose decisions bind or persuade" },
  { key: "secondary", label: "Secondary materials", hint: "Commentary and practitioner writing" },
  { key: "themes", label: "Research themes", hint: "The specific points to chase down" },
];

export const planIsEmpty = (plan: Plan) =>
  PLAN_PARTS.every((part) => (plan[part.key] ?? []).length === 0);

/* ------------------------------------------------------------- vocabulary -- */

export const JURISDICTIONS = [
  "Ghana",
  "Nigeria",
  "Kenya",
  "Liberia",
  "South Africa",
  "United Arab Emirates",
  "England & Wales",
  "Switzerland",
  "Other",
];
export const SOURCE_TYPES = [
  "Statute + case law",
  "Statute only",
  "Case law only",
  "Statute, case law + secondary",
];
export const SINCE_OPTIONS = ["Any date", "Since 2010", "Since 2015", "Since 2020"];
export const DEPTHS = ["Quick", "Standard", "Deep"];
export const OUTPUT_KINDS = [
  "Research memorandum",
  "Legal opinion",
  "Client advice",
  "Internal research note",
  "Executive summary",
  "Email advice",
];

/* --------------------------------------------------------------- progress -- */

export type Progress = {
  questions: number;
  researched: number;
  analysed: number;
  sources: number;
  doubtful: number;
  facts: number;
  /** True when there is enough on the record to draft from. */
  readyToDraft: boolean;
};

export function progressOf(state: ResearchState, records: StoredRecords): Progress {
  const questions = records.issueCards;
  const researched = questions.filter((q) => findingsFor(state, q.no).length > 0).length;
  const analysed = questions.filter(hasAnalysis).length;
  const sources = state.answer?.authorities.length ?? 0;
  return {
    questions: questions.length,
    researched,
    analysed,
    sources,
    doubtful: (state.answer?.authorities ?? []).filter(isDoubtful).length,
    facts: records.factRows.length,
    readyToDraft: questions.length > 0 && analysed > 0,
  };
}

/* ----------------------------------------------------------------- review -- */

export type ReviewFinding = {
  id: string;
  area: "scope" | "authority" | "facts" | "citation" | "drafting";
  severity: "open" | "warn" | "ok";
  title: string;
  detail: string;
  /** Where to go to deal with it. */
  tab?: "brief" | "research" | "analysis" | "draft" | "sources";
};

/**
 * The checks that can be computed from the record itself, without asking the
 * model anything. Everything here is a fact about what is on the page, so it
 * can never be wrong in the way a generated review can.
 */
export function localReview(state: ResearchState, records: StoredRecords): ReviewFinding[] {
  const out: ReviewFinding[] = [];
  const questions = records.issueCards;
  if (!records.instructions.trim())
    out.push({
      id: "instructions",
      area: "scope",
      severity: "open",
      title: "No instructions recorded",
      detail:
        "The memo cannot be checked against what was asked until the instructions are written down.",
      tab: "brief",
    });
  if (!questions.length)
    out.push({
      id: "questions",
      area: "scope",
      severity: "open",
      title: "No questions presented",
      detail: "Draft the questions the instructions raise before researching.",
      tab: "brief",
    });
  for (const q of questions) {
    if (findingsFor(state, q.no).length === 0)
      out.push({
        id: `research-${q.no}`,
        area: "authority",
        severity: "open",
        title: `${q.no} has not been researched`,
        detail: q.q || q.short || "This question carries no findings and no authority.",
        tab: "research",
      });
    else if (!hasAnalysis(q))
      out.push({
        id: `analysis-${q.no}`,
        area: "authority",
        severity: "warn",
        title: `${q.no} has research but no analysis`,
        detail:
          "The research found authority; the reasoning applying it to the facts is not written.",
        tab: "analysis",
      });
    if (
      q.confidence === "limited" ||
      q.confidence === "conflicting" ||
      q.confidence === "unresolved"
    )
      out.push({
        id: `confidence-${q.no}`,
        area: "authority",
        severity: "warn",
        title: `${q.no} — ${confidenceOf(q.confidence).label.toLowerCase()}`,
        detail: confidenceOf(q.confidence).meaning,
        tab: "analysis",
      });
  }
  for (const a of state.answer?.authorities ?? []) {
    if (a.status === "repealed" || a.status === "superseded")
      out.push({
        id: `source-${a.n}`,
        area: "citation",
        severity: "open",
        title: `${a.cite} is ${STATUS_LABEL[a.status]!.toLowerCase()}`,
        detail:
          "A source in this state should not carry a conclusion. Replace it or say why it still matters.",
        tab: "sources",
      });
    else if (a.kind === "UNVERIFIED" || a.status === "unverified")
      out.push({
        id: `source-${a.n}`,
        area: "citation",
        severity: "warn",
        title: `${a.cite} could not be verified`,
        detail: "Check this citation against the source before it goes into a document.",
        tab: "sources",
      });
  }
  const missingFacts = records.factRows.filter((f) => f.cls === "Missing");
  if (missingFacts.length)
    out.push({
      id: "facts-missing",
      area: "facts",
      severity: "warn",
      title: `${missingFacts.length} fact${missingFacts.length === 1 ? " is" : "s are"} recorded as missing`,
      detail: "The advice rests on facts nobody has. Say so in the memo, or get them.",
      tab: "brief",
    });
  const disputed = records.factRows.filter((f) => f.cls === "Disputed");
  if (disputed.length)
    out.push({
      id: "facts-disputed",
      area: "facts",
      severity: "warn",
      title: `${disputed.length} fact${disputed.length === 1 ? " is" : "s are"} disputed`,
      detail: "A conclusion that turns on a disputed fact should say what it assumes.",
      tab: "brief",
    });
  if (!state.lawAsAt.trim())
    out.push({
      id: "law-as-at",
      area: "scope",
      severity: "warn",
      title: "No law-as-at date",
      detail: "Advice without a date does not say how long it can be relied on.",
      tab: "brief",
    });
  return out;
}

export const openCount = (findings: ReviewFinding[]) =>
  findings.filter((f) => f.severity === "open").length;
