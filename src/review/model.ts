/**
 * The contract review record.
 *
 * The old model made a clause and an issue the same object. A clause carried
 * its own analysis, its own single suggested wording, its own risk and its own
 * status, so a document with fifty-six clauses had fifty-six open items, and a
 * reviewer had no way to say "I read all fifty-six and eight of them matter".
 *
 * Six objects, separately:
 *
 *   Clause        a structural part of the document
 *   Assessment    Scripta's reading of one clause
 *   Issue         something that needs a decision
 *   Instruction   something the lawyer told Scripta, which must persist
 *   Decision      what the lawyer decided, recorded on the issue
 *   Amendment     a proposed change to the words
 *
 * A clause can then carry three assessments, two issues, one instruction and
 * two proposed amendments, and each of those counts on its own terms. Review
 * progress is the proportion of clauses read; the issue list is the work.
 *
 * Nothing here touches the database or the model. These are the shapes that
 * `functions.ts` maps to the review tables.
 */
import type { Clause } from "@/data/legal";

/* -------------------------------------------------------------- severity -- */

/**
 * How much a finding matters. Four steps, because a reviewer needs to know
 * what to escalate, what to negotiate and what to note, and a fifth step adds
 * a judgement call without adding information.
 */
export type Severity = "critical" | "high" | "medium" | "low";

export const SEVERITY: {
  key: Severity;
  label: string;
  meaning: string;
  /** Ranked so lists sort by consequence, not by clause order. */
  rank: number;
  tone: "risk" | "practice" | "ok";
}[] = [
  {
    key: "critical",
    label: "Critical",
    meaning:
      "Do not sign as drafted. Unenforceable, unlawful, or exposes the client without limit.",
    rank: 0,
    tone: "risk",
  },
  {
    key: "high",
    label: "High",
    meaning:
      "Needs to be negotiated. A real risk the client should not accept without a reason to.",
    rank: 1,
    tone: "risk",
  },
  {
    key: "medium",
    label: "Medium",
    meaning:
      "Worth raising. Unfavourable or unclear, but survivable if the commercial case is there.",
    rank: 2,
    tone: "practice",
  },
  {
    key: "low",
    label: "Low",
    meaning: "For the record. A drafting point or a minor improvement.",
    rank: 3,
    tone: "ok",
  },
];

export const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export const severityMeta = (key: string) => SEVERITY.find((s) => s.key === key) ?? SEVERITY[2]!;

/* ------------------------------------------------------------------ kind -- */

/**
 * What sort of problem it is. This is the axis a reviewer filters on when they
 * have an hour: the legal points must be answered, the commercial ones are the
 * client's call, the drafting ones can go in a mark-up without a conversation.
 */
export type IssueKind =
  | "legal"
  | "commercial"
  | "drafting"
  | "conformity"
  | "playbook"
  | "standard";

export const ISSUE_KINDS: { key: IssueKind; label: string; meaning: string }[] = [
  {
    key: "legal",
    label: "Legal",
    meaning: "Enforceability, compliance with mandatory law, or the effect of the clause at law.",
  },
  {
    key: "commercial",
    label: "Commercial",
    meaning: "The deal the words describe. The client decides these; we tell them what they mean.",
  },
  {
    key: "drafting",
    label: "Drafting",
    meaning: "Ambiguity, a missing definition, a bad cross-reference, an inconsistency.",
  },
  {
    key: "conformity",
    label: "Conformity",
    meaning:
      "The agreement and its schedules do not agree: a figure, a term or a promise differs, or a schedule relied on is missing.",
  },
  {
    key: "playbook",
    label: "Playbook",
    meaning: "A departure from the firm's or the client's agreed position.",
  },
  {
    key: "standard",
    label: "Standard",
    meaning: "Nothing to raise. The clause was read and found unremarkable.",
  },
];

export const kindMeta = (key: string) => ISSUE_KINDS.find((k) => k.key === key) ?? ISSUE_KINDS[0]!;

/* ------------------------------------------------------------ assessment -- */

/** One authority cited in support of a reading. */
export type AssessmentAuthority = {
  cite: string;
  /** statute, case, regulation, commentary, or market. */
  kind: string;
  /** current, amended, repealed, or "" where we do not know. */
  status: string;
};

/**
 * Scripta's reading of one clause. It is not a verdict on the deal and it is
 * not an instruction: it is the answer to "what does this clause do, and what
 * does it mean for the party we act for".
 *
 * An assessment of kind "standard" is a real assessment. It is how the review
 * distinguishes a clause that is fine from a clause nobody has read, which is
 * the distinction the old model could not draw.
 */
export type Assessment = {
  id: string;
  clauseId: string;
  kind: IssueKind;
  severity: Severity;
  /** What the clause does, in a sentence. */
  summary: string;
  /** What it means for our client specifically, given the mandate. */
  clientImpact: string;
  /** What we would do about it. */
  recommendation: string;
  authorities: AssessmentAuthority[];
  /** The playbook rule compared against, where one was. */
  playbookRuleId: string | null;
  /** The playbook verdict, meaningful only where a rule was applied. */
  verdict: string | null;
  detail: string;
  source: "ai" | "human";
  createdAt: string;
};

/* ----------------------------------------------------------------- issue -- */

export type IssueStatus = "open" | "resolved" | "dismissed";

export const ISSUE_STATUSES: { key: IssueStatus; label: string; meaning: string }[] = [
  { key: "open", label: "Open", meaning: "Not yet decided." },
  {
    key: "resolved",
    label: "Resolved",
    meaning: "Dealt with — amended, accepted on the record, or answered by research.",
  },
  {
    key: "dismissed",
    label: "Dismissed",
    meaning:
      "Considered and set aside. Kept, because the fact we considered it is part of the file.",
  },
];

/**
 * Something that needs a decision.
 *
 * An issue is the unit of work in a review, and the unit a reviewer reports
 * on. It outlives the clause it was raised on, because re-parsing a document
 * rebuilds the clauses and a decision already taken must survive that.
 */
export type Issue = {
  id: string;
  matterId: string;
  clauseId: string | null;
  assessmentId: string | null;
  /** The number a lawyer refers to it by. Unique within the matter. */
  ref: number;
  kind: IssueKind;
  severity: Severity;
  title: string;
  detail: string;
  recommendation: string;
  status: IssueStatus;
  /** Why it was resolved or dismissed. The decision, in the lawyer's words. */
  decisionNote: string;
  decidedBy: string | null;
  decidedAt: string | null;
  source: "ai" | "human";
  ordinal: number;
  createdAt: string;
  /**
   * When the clause this finding is about entered the register. A finding
   * older than that was written against an earlier reading of the clause.
   */
  clauseBuiltAt?: string | null;
};

/* ------------------------------------------------------------- amendment -- */

export type AmendmentStatus = "proposed" | "accepted" | "rejected";

/** A proposed change to the words of one clause. */
export type Amendment = {
  id: string;
  matterId: string;
  clauseId: string;
  /** The issue this answers, where it answers one. */
  issueId: string | null;
  proposedText: string;
  rationale: string;
  /** ai, human, playbook or precedent. */
  origin: string;
  status: AmendmentStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  ordinal: number;
  createdAt: string;
};

/* -------------------------------------------------------------- key term -- */

/** One extracted term of the contract, named by the schema for its type. */
export type KeyTerm = {
  id: string;
  termKey: string;
  label: string;
  value: string;
  clauseId: string | null;
  source: "ai" | "human";
  ordinal: number;
};

/* ------------------------------------------------------------- the brief -- */

/**
 * Who we act for and what we are reviewing for. Scripta cannot say whether a
 * clause is bad for the client without being told which party the client is:
 * an uncapped indemnity is a problem for the party giving it and a protection
 * for the party taking it, and the same words produce opposite advice.
 */
export type ReviewMandate = {
  /** The party we act for, by name as it appears in the contract. */
  reviewFor: string;
  /** Their role: Buyer, Lender, Employer, Licensee. */
  reviewRole: string;
  /** What the reviewer was asked to do, in their own words. */
  instructions: string;
  /** full, focused, or triage. */
  depth: string;
  /** The things to look at first. */
  priorities: string[];
  /** When the whole document was last read. Null means never. */
  reviewedAt: string | null;
};

export const emptyMandate = (): ReviewMandate => ({
  reviewFor: "",
  reviewRole: "",
  instructions: "",
  depth: "full",
  priorities: [],
  reviewedAt: null,
});

export const REVIEW_DEPTHS: { key: string; label: string; meaning: string }[] = [
  {
    key: "full",
    label: "Full review",
    meaning: "Every clause read and assessed. What you do before advising on signature.",
  },
  {
    key: "focused",
    label: "Focused review",
    meaning: "The priority areas assessed in full, the rest read for anything serious.",
  },
  {
    key: "triage",
    label: "Triage",
    meaning: "One pass for anything critical. What you do when the client needs an answer today.",
  },
];

/** The things a reviewer commonly puts first, offered rather than typed. */
export const PRIORITY_SUGGESTIONS = [
  "Liability and indemnities",
  "Termination rights",
  "Payment terms",
  "Intellectual property",
  "Confidentiality",
  "Governing law and dispute resolution",
  "Data protection",
  "Change of control",
  "Restrictive covenants",
  "Warranties",
  "Force majeure",
  "Assignment and subcontracting",
];

/* ---------------------------------------------------------- instructions -- */

/**
 * The distinction that makes a second review worth running.
 *
 * A matter instruction shapes the whole review: "we act for the buyer, the
 * client will not accept an uncapped indemnity". A clause instruction is a
 * decision about one clause: "we have accepted this liability cap, do not
 * raise it again". Without the second kind, re-reviewing a document means
 * reading advice you have already rejected, which is worse than not
 * re-reviewing at all.
 */
export type Instruction = {
  id: string;
  /** Null for a matter-level instruction. */
  clauseId: string | null;
  body: string;
  authorId: string | null;
  createdAt: string;
};

/* ------------------------------------------------------------- derivation -- */

export type ClauseReview = {
  clause: Clause;
  assessments: Assessment[];
  issues: Issue[];
  amendments: Amendment[];
  instructions: Instruction[];
  /** The worst open issue on this clause, for the navigator marker. */
  severity: Severity | null;
  /** True once the clause has been assessed at all. */
  reviewed: boolean;
  openCount: number;
};

/** Everything known about one clause, gathered. */
export function clauseReview(
  clause: Clause,
  all: {
    assessments: Assessment[];
    issues: Issue[];
    amendments: Amendment[];
    instructions: Instruction[];
  },
): ClauseReview {
  const assessments = all.assessments.filter((a) => a.clauseId === clause.id);
  const issues = all.issues.filter((i) => i.clauseId === clause.id);
  const open = issues.filter((i) => i.status === "open");
  const worst = open.reduce<Severity | null>(
    (acc, i) => (acc === null || SEVERITY_RANK[i.severity] < SEVERITY_RANK[acc] ? i.severity : acc),
    null,
  );
  return {
    clause,
    assessments,
    issues,
    amendments: all.amendments.filter((a) => a.clauseId === clause.id),
    instructions: all.instructions.filter((n) => n.clauseId === clause.id),
    severity: worst,
    reviewed: assessments.length > 0,
    openCount: open.length,
  };
}

export type ReviewProgress = {
  clauses: number;
  reviewed: number;
  /** 0–1. The proportion of the document that has been read. */
  fraction: number;
  open: number;
  resolved: number;
  dismissed: number;
  critical: number;
  high: number;
  /** Amendments proposed but not yet decided. */
  pendingAmendments: number;
  acceptedAmendments: number;
};

/**
 * How far the review has got. Progress is clauses read, not issues closed —
 * a reviewer who has read the whole document and left eight issues open for
 * the client's decision has finished their review.
 */
export function reviewProgress(
  clauses: Clause[],
  assessments: Assessment[],
  issues: Issue[],
  amendments: Amendment[],
): ReviewProgress {
  const assessed = new Set(assessments.map((a) => a.clauseId));
  const reviewed = clauses.filter((c) => assessed.has(c.id)).length;
  const open = issues.filter((i) => i.status === "open");
  return {
    clauses: clauses.length,
    reviewed,
    fraction: clauses.length === 0 ? 0 : reviewed / clauses.length,
    open: open.length,
    resolved: issues.filter((i) => i.status === "resolved").length,
    dismissed: issues.filter((i) => i.status === "dismissed").length,
    critical: open.filter((i) => i.severity === "critical").length,
    high: open.filter((i) => i.severity === "high").length,
    pendingAmendments: amendments.filter((a) => a.status === "proposed").length,
    acceptedAmendments: amendments.filter((a) => a.status === "accepted").length,
  };
}

/** Issues worst-first, then by clause order, so the list reads as a priority. */
export function sortIssues(issues: Issue[], clauseOrder: Map<string, number>): Issue[] {
  return [...issues].sort((a, b) => {
    const sev = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (sev !== 0) return sev;
    const ca = clauseOrder.get(a.clauseId ?? "") ?? Number.MAX_SAFE_INTEGER;
    const cb = clauseOrder.get(b.clauseId ?? "") ?? Number.MAX_SAFE_INTEGER;
    if (ca !== cb) return ca - cb;
    return a.ref - b.ref;
  });
}

/**
 * What stands in the way of finalising. Not a score: a list of the specific
 * things a reviewer would want to have dealt with before the document goes
 * out, each with the count that makes it actionable.
 */
// The pre-flight is the same check wherever a document is finalised, so the
// shape and the words come from one place.
export type { PreflightItem } from "@/components/Preflight";
export { blocking } from "@/components/Preflight";

import type { PreflightItem as PreflightItemType } from "@/components/Preflight";

export function preflight(
  progress: ReviewProgress,
  mandate: ReviewMandate,
  keyTermGaps: number,
): PreflightItemType[] {
  const items: PreflightItemType[] = [];
  const unread = progress.clauses - progress.reviewed;
  items.push({
    key: "unread",
    label: unread === 0 ? "Every clause has been assessed" : "Clauses not yet assessed",
    detail:
      unread === 0
        ? `All ${progress.clauses} clauses carry an assessment.`
        : `${unread} of ${progress.clauses} clauses have never been read. Run the review before finalising.`,
    count: unread,
    level: unread === 0 ? "clear" : "blocking",
  });
  items.push({
    key: "critical",
    label: progress.critical === 0 ? "No critical issues are open" : "Critical issues still open",
    detail:
      progress.critical === 0
        ? "Nothing outstanding that would stop signature."
        : "A critical issue means the document should not be signed as drafted.",
    count: progress.critical,
    level: progress.critical === 0 ? "clear" : "blocking",
  });
  items.push({
    key: "high",
    label: progress.high === 0 ? "No high issues are open" : "High issues still open",
    detail:
      progress.high === 0
        ? "Nothing that needs to be negotiated is outstanding."
        : "These need a decision, even if the decision is to accept them.",
    count: progress.high,
    level: progress.high === 0 ? "clear" : "warning",
  });
  items.push({
    key: "amendments",
    label:
      progress.pendingAmendments === 0
        ? "No amendments are waiting"
        : "Proposed amendments not decided",
    detail:
      progress.pendingAmendments === 0
        ? "Every proposal has been accepted or rejected."
        : "A proposed amendment is not in the document until it is accepted. These will not appear in the redline.",
    count: progress.pendingAmendments,
    level: progress.pendingAmendments === 0 ? "clear" : "warning",
  });
  items.push({
    key: "mandate",
    label: mandate.reviewFor ? "The review mandate is recorded" : "No review mandate recorded",
    detail: mandate.reviewFor
      ? `Reviewed for ${mandate.reviewFor}${mandate.reviewRole ? ` as ${mandate.reviewRole}` : ""}.`
      : "Say who we act for. Advice on a clause depends on which side of it the client is.",
    count: mandate.reviewFor ? 0 : 1,
    level: mandate.reviewFor ? "clear" : "warning",
  });
  items.push({
    key: "terms",
    label: keyTermGaps === 0 ? "Key terms are all extracted" : "Key terms not found",
    detail:
      keyTermGaps === 0
        ? "Every term in the schema for this contract type has a value."
        : "Some terms could not be found in the document. Check whether they are genuinely absent.",
    count: keyTermGaps,
    level: keyTermGaps === 0 ? "clear" : "warning",
  });
  return items;
}
