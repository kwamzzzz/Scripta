/**
 * The shape mapping between what Research keeps in the browser and what the
 * research tables hold. Pure functions only — no Supabase, no window — so the
 * place a silent data-loss bug would hide is the place that is tested.
 *
 * Two stored objects per research matter today:
 *   px.research.<workspace>.<id>          → ResearchState (question + answer + memo)
 *   px.research.records.<workspace>.<id>  → StoredRecords (the 4f–4k working records)
 *
 * Both are read tolerantly: anything written by an older build is coerced
 * rather than rejected, because the alternative is dropping a lawyer's work.
 */
import type { Memo, ResearchState } from "@/wireframe/research-store";
import type { ResearchAuthority } from "@/lib/research.functions";
import { asDoc } from "@/wireframe/clause-doc";

export type ResearchKind = "simple" | "comprehensive";
export type ReportDraftState = "pending" | "accepted" | "rejected";

const KINDS: ResearchKind[] = ["simple", "comprehensive"];
const DRAFT_STATES: ReportDraftState[] = ["pending", "accepted", "rejected"];
const MEMO_STYLES: Memo["style"][] = ["OSCOLA", "Bluebook", "Firm custom"];

/* ---------------------------------------------------------------- stored ---- */

/** One entry of px.research.index.<workspace>. */
export type StoredIndexEntry = {
  id: string;
  kind: ResearchKind;
  title: string;
  updatedAt: string;
};

export type StoredIssue = {
  no: string;
  short: string;
  q: string;
  juris: string;
  pri: string;
  state: string;
  /** The provisional answer the research reached. */
  answer: string;
  pos: string;
  risk: string;
  auth: string;
  assignee: string;
  inReport: boolean;
  done: boolean;
  /** The analysis written on this question: what the law says, how it applies. */
  rule: string;
  application: string;
  counterpoint: string;
  conclusion: string;
  /** A legal state — well supported, supported, limited, conflicting, unresolved. */
  confidence: string;
  /** Whether this question has been researched, and how it went. */
  researchStatus: string;
  /** Scripta's reasoning behind the provisional answer. Its words, not yours. */
  reasoning: string;
};
export type StoredFact = {
  id: string;
  fact: string;
  src: string;
  cls: string;
  issue: string;
  conf: string;
};
export type StoredAssumption = { a: string; why: string; risk: string; state: string };
export type StoredRisk = {
  title: string;
  issue: string;
  like: string;
  imp: string;
  rate: string;
  mit: string;
  who: string;
  by: string;
  override: string | null;
  action: string;
  pri: string;
  status: string;
};
export type StoredReport = {
  version: string;
  locked: boolean;
  draft: ReportDraftState;
  track: boolean;
  approvalSent: boolean;
  approvedAt: string;
};
/** px.research.records.<workspace>.<id>. */
/** The research plan: where Scripta proposes to look, and for what. */
export type StoredPlan = {
  legislation: string[];
  caseLaw: string[];
  secondary: string[];
  themes: string[];
};

export type StoredRecords = {
  /** What the lawyer asked for, in their own words. Steers the research call. */
  instructions: string;
  /** Where the research will look. Drafted by Scripta, edited by the lawyer. */
  plan: StoredPlan;
  issueCards: StoredIssue[];
  factRows: StoredFact[];
  assumptionRows: StoredAssumption[];
  riskRows: StoredRisk[];
  draftRejected: boolean;
  selectedIssue: number;
  format: string;
  deliv: Record<string, boolean>;
  report: StoredReport;
};

/* ------------------------------------------------------------------ rows ---- */

/**
 * research_matters is split the way the two saves are, so each save writes a
 * whole half and no column can be owned by both or by neither.
 */
export type ResearchStateFields = {
  topic: string;
  question: string;
  jurisdiction: string;
  area_of_law: string;
  law_as_at: string;
  output_kind: string;
  depth: string;
  sources: string;
  since_filter: string;
  linked_clause: string;
  selected_authority: number | null;
  has_answer: boolean;
  short_answer: string;
  memo_title: string;
  memo_intro: string;
  memo_intro_doc?: unknown;
  memo_style: string;
};
export type ResearchRecordFields = {
  instructions: string;
  plan: StoredPlan;
  selected_issue: number;
  analysis_format: string;
  draft_rejected: boolean;
  report_version: string;
  report_locked: boolean;
  report_draft: ReportDraftState;
  report_track: boolean;
  report_approval_sent: boolean;
  report_approved_at: string;
  deliverable_sections: Record<string, boolean>;
};
/** research_matters, minus the identity columns the server owns. */
export type ResearchMatterFields = { kind: ResearchKind; title: string } & ResearchStateFields &
  ResearchRecordFields;

export type AuthorityRow = {
  id?: string;
  n: number;
  cite: string;
  kind: string;
  source: string;
  cite_date: string;
  held: string;
  sections: ResearchAuthority["sections"];
  tier: string;
  status: string;
  weight: string;
  added_by: string;
  url: string;
  note: string;
  issue_nos: string;
};
export type FindingRow = {
  id?: string;
  ordinal: number;
  text: string;
  cites: number[];
  issue_no: string;
};
export type PinRow = {
  id?: string;
  ordinal: number;
  authority_n: number;
  section_index: number;
  paragraph_index: number;
  text: string;
  note: string;
};
export type MemoSectionRow = {
  id?: string;
  ordinal: number;
  no: string;
  title: string;
  body: string;
  cites: number[];
  /** The section's formatting, as an editor document. Null for a plain section. */
  doc?: unknown;
};
export type IssueRow = {
  id?: string;
  ordinal: number;
  no: string;
  short: string;
  question: string;
  jurisdiction: string;
  priority: string;
  state: string;
  answer: string;
  position_label: string;
  risk: string;
  authority: string;
  assignee: string;
  in_report: boolean;
  done: boolean;
  rule: string;
  application: string;
  counterpoint: string;
  conclusion: string;
  confidence: string;
  research_status: string;
  reasoning: string;
};
export type FactRow = {
  id?: string;
  ordinal: number;
  ref: string;
  fact: string;
  source: string;
  classification: string;
  issue_refs: string;
  confidence: string;
};
export type AssumptionRow = {
  id?: string;
  ordinal: number;
  assumption: string;
  why: string;
  risk: string;
  state: string;
};
export type RiskRow = {
  id?: string;
  ordinal: number;
  title: string;
  issue: string;
  likelihood: string;
  impact: string;
  rating: string;
  rating_override: string | null;
  mitigation: string;
  action: string;
  priority: string;
  owner: string;
  due: string;
  status: string;
};

/** Everything hanging off one research_matters row. */
export type ResearchChildRows = {
  authorities: AuthorityRow[];
  findings: FindingRow[];
  pins: PinRow[];
  memoSections: MemoSectionRow[];
  issues: IssueRow[];
  facts: FactRow[];
  assumptions: AssumptionRow[];
  risks: RiskRow[];
};

export const EMPTY_CHILD_ROWS: ResearchChildRows = {
  authorities: [],
  findings: [],
  pins: [],
  memoSections: [],
  issues: [],
  facts: [],
  assumptions: [],
  risks: [],
};

/* ------------------------------------------------------------- coercion ---- */

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const bool = (v: unknown, fallback = false): boolean =>
  typeof v === "boolean" ? v : Boolean(fallback);
const int = (v: unknown, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : fallback;
const intOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : null;
const ints = (v: unknown): number[] =>
  arr(v)
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n))
    .map((n) => Math.trunc(n));
const oneOf = <T extends string>(v: unknown, allowed: T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

/** Free-text or null: a risk override is absent, not empty. */
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

function coerceSections(v: unknown): ResearchAuthority["sections"] {
  return arr(v).map((s) => {
    const o = obj(s);
    return {
      title: str(o["title"], "Section"),
      paragraphs: arr(o["paragraphs"]).map((p) => str(p)),
    };
  });
}

/** px.research.<workspace>.<id> as written by any build so far. */
export function coerceState(raw: unknown): ResearchState {
  const o = obj(raw);
  const answerRaw = o["answer"];
  const memo = obj(o["memo"]);
  return {
    topic: str(o["topic"]),
    question: str(o["question"]),
    jurisdiction: str(o["jurisdiction"]),
    areaOfLaw: str(o["areaOfLaw"]),
    lawAsAt: str(o["lawAsAt"]),
    outputKind: str(o["outputKind"]),
    depth: str(o["depth"]),
    sources: str(o["sources"]),
    since: str(o["since"]),
    linkedClause: str(o["linkedClause"]),
    // Null is meaningful: the research has not been run.
    answer:
      answerRaw && typeof answerRaw === "object"
        ? {
            shortAnswer: str(obj(answerRaw)["shortAnswer"]),
            findings: arr(obj(answerRaw)["findings"]).map((f) => ({
              text: str(obj(f)["text"]),
              cites: ints(obj(f)["cites"]),
              issueNo: str(obj(f)["issueNo"]),
            })),
            authorities: arr(obj(answerRaw)["authorities"]).map((a, i) => {
              const ao = obj(a);
              return {
                n: int(ao["n"], i + 1),
                cite: str(ao["cite"], "Unnamed authority"),
                kind: str(ao["kind"], "UNVERIFIED"),
                source: str(ao["source"]),
                date: str(ao["date"]),
                held: str(ao["held"]),
                sections: coerceSections(ao["sections"]),
                tier: str(ao["tier"]),
                status: str(ao["status"]),
                weight: str(ao["weight"]),
                addedBy: str(ao["addedBy"], "ai"),
                url: str(ao["url"]),
                note: str(ao["note"]),
                issueNos: str(ao["issueNos"]),
              };
            }),
          }
        : null,
    pins: arr(o["pins"]).map((p, i) => {
      const po = obj(p);
      return {
        id: str(po["id"], `pin-${i + 1}`),
        authority: int(po["authority"]),
        section: int(po["section"]),
        paragraph: int(po["paragraph"]),
        text: str(po["text"]),
        note: str(po["note"]),
      };
    }),
    memo: {
      title: str(memo["title"]),
      intro: str(memo["intro"]),
      introDoc: asDoc(memo["introDoc"]),
      style: oneOf(memo["style"], MEMO_STYLES, "OSCOLA"),
      sections: arr(memo["sections"]).map((s, i) => {
        const so = obj(s);
        return {
          id: str(so["id"], `memo-${i + 1}`),
          no: str(so["no"], String(i + 1)),
          title: str(so["title"]),
          body: str(so["body"]),
          cites: ints(so["cites"]),
          doc: asDoc(so["doc"]),
        };
      }),
    },
    selectedAuthority: intOrNull(o["selectedAuthority"]),
  };
}

/** px.research.records.<workspace>.<id> as written by any build so far. */
export function coerceRecords(raw: unknown): StoredRecords {
  const o = obj(raw);
  const report = obj(o["report"]);
  const deliv: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(obj(o["deliv"]))) deliv[key] = Boolean(value);
  const plan = obj(o["plan"]);
  const planList = (v: unknown) => arr(v).map((x) => str(x)).filter(Boolean);
  return {
    instructions: str(o["instructions"]),
    plan: {
      legislation: planList(plan["legislation"]),
      caseLaw: planList(plan["caseLaw"]),
      secondary: planList(plan["secondary"]),
      themes: planList(plan["themes"]),
    },
    issueCards: arr(o["issueCards"]).map((c, i) => {
      const co = obj(c);
      return {
        no: str(co["no"], `ISSUE ${i + 1}`),
        short: str(co["short"]),
        q: str(co["q"]),
        juris: str(co["juris"]),
        pri: str(co["pri"]),
        state: str(co["state"]),
        answer: str(co["answer"]),
        pos: str(co["pos"]),
        risk: str(co["risk"]),
        auth: str(co["auth"]),
        assignee: str(co["assignee"], "Unassigned"),
        inReport: bool(co["inReport"]),
        done: bool(co["done"]),
        rule: str(co["rule"]),
        application: str(co["application"]),
        counterpoint: str(co["counterpoint"]),
        conclusion: str(co["conclusion"]),
        confidence: str(co["confidence"]),
        researchStatus: str(co["researchStatus"]),
        reasoning: str(co["reasoning"]),
      };
    }),
    factRows: arr(o["factRows"]).map((f, i) => {
      const fo = obj(f);
      return {
        id: str(fo["id"], `F-${String(i + 1).padStart(2, "0")}`),
        fact: str(fo["fact"]),
        src: str(fo["src"]),
        cls: str(fo["cls"]),
        issue: str(fo["issue"]),
        conf: str(fo["conf"]),
      };
    }),
    assumptionRows: arr(o["assumptionRows"]).map((a) => {
      const ao = obj(a);
      return {
        a: str(ao["a"]),
        why: str(ao["why"]),
        risk: str(ao["risk"]),
        state: str(ao["state"]),
      };
    }),
    riskRows: arr(o["riskRows"]).map((r) => {
      const ro = obj(r);
      return {
        title: str(ro["title"]),
        issue: str(ro["issue"]),
        like: str(ro["like"]),
        imp: str(ro["imp"]),
        rate: str(ro["rate"]),
        mit: str(ro["mit"]),
        who: str(ro["who"]),
        by: str(ro["by"]),
        override: strOrNull(ro["override"]),
        action: str(ro["action"]),
        pri: str(ro["pri"]),
        status: str(ro["status"], "Open"),
      };
    }),
    draftRejected: bool(o["draftRejected"]),
    selectedIssue: int(o["selectedIssue"]),
    format: str(o["format"], "IRAC"),
    deliv,
    report: {
      version: str(report["version"], "v0.4"),
      locked: bool(report["locked"]),
      draft: oneOf(report["draft"], DRAFT_STATES, "pending"),
      track: bool(report["track"]),
      approvalSent: bool(report["approvalSent"]),
      approvedAt: str(report["approvedAt"]),
    },
  };
}

/** One entry of px.research.index.<workspace>. */
export function coerceIndexEntry(raw: unknown): StoredIndexEntry | null {
  const o = obj(raw);
  const id = str(o["id"]);
  if (!id) return null;
  // Older entries carried the kind only in the id prefix ("simple-<uuid>").
  const fallbackKind: ResearchKind = id.startsWith("comprehensive") ? "comprehensive" : "simple";
  return {
    id,
    kind: oneOf(o["kind"], KINDS, fallbackKind),
    title: str(o["title"], "Untitled research"),
    updatedAt: str(o["updatedAt"], new Date(0).toISOString()),
  };
}

/* ------------------------------------------------------- stored -> rows ---- */

/** The half of research_matters that saveResearchState owns. */
export function toStateFields(state: ResearchState): ResearchStateFields {
  return {
    topic: state.topic,
    question: state.question,
    jurisdiction: state.jurisdiction,
    area_of_law: state.areaOfLaw,
    law_as_at: state.lawAsAt,
    output_kind: state.outputKind,
    depth: state.depth,
    sources: state.sources,
    since_filter: state.since,
    linked_clause: state.linkedClause,
    selected_authority: state.selectedAuthority,
    // `answer: null` means the research has not been run. Never derive this
    // from the short answer being empty — a run can come back with nothing.
    has_answer: state.answer !== null,
    short_answer: state.answer?.shortAnswer ?? "",
    memo_title: state.memo.title,
    memo_intro: state.memo.intro,
    memo_intro_doc: state.memo.introDoc ?? null,
    memo_style: state.memo.style,
  };
}

/** The half of research_matters that saveResearchRecords owns. */
export function toRecordFields(records: StoredRecords): ResearchRecordFields {
  return {
    instructions: records.instructions,
    plan: records.plan,
    selected_issue: records.selectedIssue,
    analysis_format: records.format,
    draft_rejected: records.draftRejected,
    report_version: records.report.version,
    report_locked: records.report.locked,
    report_draft: records.report.draft,
    report_track: records.report.track,
    report_approval_sent: records.report.approvalSent,
    deliverable_sections: records.deliv,
    report_approved_at: records.report.approvedAt,
  };
}

export function toMatterFields(input: {
  kind: ResearchKind;
  title: string;
  state: ResearchState;
  records: StoredRecords;
}): ResearchMatterFields {
  return {
    kind: input.kind,
    title: input.title,
    ...toStateFields(input.state),
    ...toRecordFields(input.records),
  };
}

/** The child rows saveResearchState owns: the answer, its pins and the memo. */
export function toAnswerRows(
  state: ResearchState,
): Pick<ResearchChildRows, "authorities" | "findings" | "pins" | "memoSections"> {
  return {
    authorities: (state.answer?.authorities ?? []).map((a) => ({
      n: a.n,
      cite: a.cite,
      kind: a.kind,
      source: a.source,
      cite_date: a.date,
      held: a.held,
      sections: a.sections,
      tier: a.tier ?? "",
      status: a.status ?? "",
      weight: a.weight ?? "",
      added_by: a.addedBy ?? "ai",
      url: a.url ?? "",
      note: a.note ?? "",
      issue_nos: a.issueNos ?? "",
    })),
    findings: (state.answer?.findings ?? []).map((f, i) => ({
      ordinal: i,
      text: f.text,
      cites: f.cites,
      issue_no: f.issueNo ?? "",
    })),
    pins: state.pins.map((p, i) => ({
      ordinal: i,
      authority_n: p.authority,
      section_index: p.section,
      paragraph_index: p.paragraph,
      text: p.text,
      note: p.note,
    })),
    memoSections: state.memo.sections.map((s, i) => ({
      ordinal: i,
      no: s.no,
      title: s.title,
      body: s.body,
      cites: s.cites,
      doc: s.doc ?? null,
    })),
  };
}

/** The child rows saveResearchRecords owns: the 4f–4j working records. */
export function toRecordRows(
  records: StoredRecords,
): Pick<ResearchChildRows, "issues" | "facts" | "assumptions" | "risks"> {
  return {
    issues: records.issueCards.map((c, i) => ({
      ordinal: i,
      no: c.no,
      short: c.short,
      question: c.q,
      jurisdiction: c.juris,
      priority: c.pri,
      state: c.state,
      answer: c.answer,
      position_label: c.pos,
      risk: c.risk,
      authority: c.auth,
      assignee: c.assignee,
      in_report: c.inReport,
      done: c.done,
      rule: c.rule,
      application: c.application,
      counterpoint: c.counterpoint,
      conclusion: c.conclusion,
      confidence: c.confidence,
      research_status: c.researchStatus,
      reasoning: c.reasoning,
    })),
    facts: records.factRows.map((f, i) => ({
      ordinal: i,
      ref: f.id,
      fact: f.fact,
      source: f.src,
      classification: f.cls,
      issue_refs: f.issue,
      confidence: f.conf,
    })),
    assumptions: records.assumptionRows.map((a, i) => ({
      ordinal: i,
      assumption: a.a,
      why: a.why,
      risk: a.risk,
      state: a.state,
    })),
    risks: records.riskRows.map((r, i) => ({
      ordinal: i,
      title: r.title,
      issue: r.issue,
      likelihood: r.like,
      impact: r.imp,
      rating: r.rate,
      rating_override: r.override,
      mitigation: r.mit,
      action: r.action,
      priority: r.pri,
      owner: r.who,
      due: r.by,
      status: r.status,
    })),
  };
}

export function toChildRows(state: ResearchState, records: StoredRecords): ResearchChildRows {
  return { ...toAnswerRows(state), ...toRecordRows(records) };
}

/* ------------------------------------------------------- rows -> stored ---- */

const byOrdinal = <T extends { ordinal: number }>(rows: T[]): T[] =>
  [...rows].sort((a, b) => a.ordinal - b.ordinal);

/** Rebuild px.research.<workspace>.<id> from a matter row and its children. */
export function stateFromRows(
  matter: Partial<ResearchMatterFields>,
  children: ResearchChildRows,
): ResearchState {
  return {
    topic: str(matter.topic),
    question: str(matter.question),
    jurisdiction: str(matter.jurisdiction),
    areaOfLaw: str(matter.area_of_law),
    lawAsAt: str(matter.law_as_at),
    outputKind: str(matter.output_kind),
    depth: str(matter.depth),
    sources: str(matter.sources),
    since: str(matter.since_filter),
    linkedClause: str(matter.linked_clause),
    answer: matter.has_answer
      ? {
          shortAnswer: str(matter.short_answer),
          findings: byOrdinal(children.findings).map((f) => ({
            text: f.text,
            cites: f.cites,
            issueNo: f.issue_no,
          })),
          authorities: [...children.authorities]
            .sort((a, b) => a.n - b.n)
            .map((a) => ({
              n: a.n,
              cite: a.cite,
              kind: a.kind,
              source: a.source,
              date: a.cite_date,
              held: a.held,
              sections: coerceSections(a.sections),
              tier: a.tier,
              status: a.status,
              weight: a.weight,
              addedBy: a.added_by,
              url: a.url,
              note: a.note,
              issueNos: a.issue_nos,
            })),
        }
      : null,
    pins: byOrdinal(children.pins).map((p, i) => ({
      id: p.id || `pin-${i + 1}`,
      authority: p.authority_n,
      section: p.section_index,
      paragraph: p.paragraph_index,
      text: p.text,
      note: p.note,
    })),
    memo: {
      title: str(matter.memo_title),
      intro: str(matter.memo_intro),
      introDoc: asDoc(matter.memo_intro_doc),
      style: oneOf(matter.memo_style, MEMO_STYLES, "OSCOLA"),
      sections: byOrdinal(children.memoSections).map((s, i) => ({
        id: s.id || `memo-${i + 1}`,
        no: s.no,
        title: s.title,
        body: s.body,
        cites: s.cites,
        doc: asDoc(s.doc),
      })),
    },
    selectedAuthority: matter.selected_authority ?? null,
  };
}

/** Rebuild px.research.records.<workspace>.<id> from a matter row and its children. */
export function recordsFromRows(
  matter: Partial<ResearchMatterFields>,
  children: ResearchChildRows,
): StoredRecords {
  return {
    issueCards: byOrdinal(children.issues).map((c) => ({
      no: c.no,
      short: c.short,
      q: c.question,
      juris: c.jurisdiction,
      pri: c.priority,
      state: c.state,
      answer: c.answer,
      pos: c.position_label,
      risk: c.risk,
      auth: c.authority,
      assignee: c.assignee,
      inReport: c.in_report,
      done: c.done,
      rule: c.rule,
      application: c.application,
      counterpoint: c.counterpoint,
      conclusion: c.conclusion,
      confidence: c.confidence,
      researchStatus: c.research_status,
      reasoning: c.reasoning,
    })),
    factRows: byOrdinal(children.facts).map((f) => ({
      id: f.ref,
      fact: f.fact,
      src: f.source,
      cls: f.classification,
      issue: f.issue_refs,
      conf: f.confidence,
    })),
    assumptionRows: byOrdinal(children.assumptions).map((a) => ({
      a: a.assumption,
      why: a.why,
      risk: a.risk,
      state: a.state,
    })),
    riskRows: byOrdinal(children.risks).map((r) => ({
      title: r.title,
      issue: r.issue,
      like: r.likelihood,
      imp: r.impact,
      rate: r.rating,
      mit: r.mitigation,
      who: r.owner,
      by: r.due,
      override: r.rating_override,
      action: r.action,
      pri: r.priority,
      status: r.status,
    })),
    instructions: str(matter.instructions),
    plan: {
      legislation: [...(matter.plan?.legislation ?? [])],
      caseLaw: [...(matter.plan?.caseLaw ?? [])],
      secondary: [...(matter.plan?.secondary ?? [])],
      themes: [...(matter.plan?.themes ?? [])],
    },
    draftRejected: bool(matter.draft_rejected),
    selectedIssue: int(matter.selected_issue),
    format: str(matter.analysis_format, "IRAC"),
    deliv: { ...(matter.deliverable_sections ?? {}) },
    report: {
      version: str(matter.report_version, "v0.4"),
      locked: bool(matter.report_locked),
      draft: oneOf(matter.report_draft, DRAFT_STATES, "pending"),
      track: bool(matter.report_track),
      approvalSent: bool(matter.report_approval_sent),
      approvedAt: str(matter.report_approved_at),
    },
  };
}

/** The child rows a `select` returns, coerced back into the row types. */
export function childRowsFromDb(raw: {
  authorities?: unknown;
  findings?: unknown;
  pins?: unknown;
  memoSections?: unknown;
  issues?: unknown;
  facts?: unknown;
  assumptions?: unknown;
  risks?: unknown;
}): ResearchChildRows {
  return {
    authorities: arr(raw.authorities).map((r) => {
      const o = obj(r);
      return {
        id: str(o["id"]),
        n: int(o["n"]),
        cite: str(o["cite"]),
        kind: str(o["kind"], "UNVERIFIED"),
        source: str(o["source"]),
        cite_date: str(o["cite_date"]),
        held: str(o["held"]),
        sections: coerceSections(o["sections"]),
        tier: str(o["tier"]),
        status: str(o["status"]),
        weight: str(o["weight"]),
        added_by: str(o["added_by"], "ai"),
        url: str(o["url"]),
        note: str(o["note"]),
        issue_nos: str(o["issue_nos"]),
      };
    }),
    findings: arr(raw.findings).map((r) => {
      const o = obj(r);
      return {
        id: str(o["id"]),
        ordinal: int(o["ordinal"]),
        text: str(o["text"]),
        cites: ints(o["cites"]),
        issue_no: str(o["issue_no"]),
      };
    }),
    pins: arr(raw.pins).map((r) => {
      const o = obj(r);
      return {
        id: str(o["id"]),
        ordinal: int(o["ordinal"]),
        authority_n: int(o["authority_n"]),
        section_index: int(o["section_index"]),
        paragraph_index: int(o["paragraph_index"]),
        text: str(o["text"]),
        note: str(o["note"]),
      };
    }),
    memoSections: arr(raw.memoSections).map((r) => {
      const o = obj(r);
      return {
        id: str(o["id"]),
        ordinal: int(o["ordinal"]),
        no: str(o["no"]),
        title: str(o["title"]),
        body: str(o["body"]),
        cites: ints(o["cites"]),
        doc: asDoc(o["doc"]),
      };
    }),
    issues: arr(raw.issues).map((r) => {
      const o = obj(r);
      return {
        id: str(o["id"]),
        ordinal: int(o["ordinal"]),
        no: str(o["no"]),
        short: str(o["short"]),
        question: str(o["question"]),
        jurisdiction: str(o["jurisdiction"]),
        priority: str(o["priority"]),
        state: str(o["state"]),
        answer: str(o["answer"]),
        position_label: str(o["position_label"]),
        risk: str(o["risk"]),
        authority: str(o["authority"]),
        assignee: str(o["assignee"]),
        in_report: bool(o["in_report"]),
        done: bool(o["done"]),
        rule: str(o["rule"]),
        application: str(o["application"]),
        counterpoint: str(o["counterpoint"]),
        conclusion: str(o["conclusion"]),
        confidence: str(o["confidence"]),
        research_status: str(o["research_status"]),
        reasoning: str(o["reasoning"]),
      };
    }),
    facts: arr(raw.facts).map((r) => {
      const o = obj(r);
      return {
        id: str(o["id"]),
        ordinal: int(o["ordinal"]),
        ref: str(o["ref"]),
        fact: str(o["fact"]),
        source: str(o["source"]),
        classification: str(o["classification"]),
        issue_refs: str(o["issue_refs"]),
        confidence: str(o["confidence"]),
      };
    }),
    assumptions: arr(raw.assumptions).map((r) => {
      const o = obj(r);
      return {
        id: str(o["id"]),
        ordinal: int(o["ordinal"]),
        assumption: str(o["assumption"]),
        why: str(o["why"]),
        risk: str(o["risk"]),
        state: str(o["state"]),
      };
    }),
    risks: arr(raw.risks).map((r) => {
      const o = obj(r);
      return {
        id: str(o["id"]),
        ordinal: int(o["ordinal"]),
        title: str(o["title"]),
        issue: str(o["issue"]),
        likelihood: str(o["likelihood"]),
        impact: str(o["impact"]),
        rating: str(o["rating"]),
        rating_override: strOrNull(o["rating_override"]),
        mitigation: str(o["mitigation"]),
        action: str(o["action"]),
        priority: str(o["priority"]),
        owner: str(o["owner"]),
        due: str(o["due"]),
        status: str(o["status"], "Open"),
      };
    }),
  };
}
