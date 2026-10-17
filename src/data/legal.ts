import type { ClauseDoc } from "@/wireframe/clause-doc";
export type Seg = { t: string; k: "n" | "d" | "i" };
export type ClauseStatus = "Accepted" | "Escalated" | "Open" | "For discussion" | "Draft";
export type Verdict = "Consistent" | "Fallback" | "Red flag" | "Escalate";
export type Risk = "Low" | "Medium" | "High";
export type Change = "Modified" | "Added" | "Deleted" | "Baseline";

export type Doc = {
  id: string;
  name: string;
  ver: string;
  date: string;
  kind: string;
  rawKind: DocKind;
  parseStatus: "pending" | "parsing" | "parsed" | "failed";
  parseError: string | null;
  /** Where the file itself is, so a list can show page one. */
  storagePath: string | null;
};
export type TimelineEvent = { d: string; e: string; by: string };
import type { DocKind } from "@/lib/use-upload";

export type Matter = {
  /**
   * Print this contract on the firm's letterhead. Undefined means yes, which
   * is what every contract did before there was a choice.
   */
  useLetterhead?: boolean | undefined;
  name: string;
  client: string;
  counterparty: string;
  stage: string;
  playbook: string;
  docs: Doc[];
  timeline: TimelineEvent[];
};
export type ClausePb = { rule: string; topic: string; verdict: Verdict; detail: string };
export type Clause = {
  id: string;
  num: string;
  title: string;
  change: Change;
  risk: Risk;
  status: ClauseStatus;
  diff: string;
  analysis: string;
  pb: ClausePb | null;
  page: string;
  segs: Seg[];
  /**
   * The clause as an editor document, holding the formatting a string cannot:
   * bold, italics, underlining, links, lists and tables. Null for a clause
   * nobody has formatted — its words are then exactly its segments' text.
   */
  doc?: ClauseDoc | null;
  /** What the uploaded document numbered this clause, where the lawyer has renumbered it. */
  documentNum?: string | null;
  /**
   * Print this section's sub-clauses with their numbers. Undefined and true
   * both mean numbered; false prints each part headed by its title alone.
   * Presentation only — `num` still orders the document and carries the tree.
   */
  partsNumbered?: boolean | undefined;
  /** True while the analysis text is still the model's, untouched by a human. */
  aiAnalysis?: boolean;
  analysisError?: string | null;
  /** Phase 3 review taxonomy. Null until analysis or a reviewer sets it. */
  reviewState?: ReviewStateName | null;
  approval?: ApprovalStatus;
  assigneeId?: string | null;
  /** AI-proposed replacement language, drawn from approved drafting. */
  suggestedText?: string | null;
  /** Research-backed classification key (src/lib/clause-tags.ts), its reason and who set it. */
  classification?: string | null;
  classificationReason?: string | null;
  classificationSource?: "ai" | "human" | null;
  confidence?: number | null;
};
export type ReviewStateName =
  "aligned" | "review" | "high-risk" | "missing" | "deviation" | "approval";
export type ApprovalStatus = "Not required" | "Requested" | "Approved" | "Rejected";

export type Discussion = {
  id: string;
  t: string;
  speaker: string;
  role: string;
  text: string;
  /** The passage a decision or drafting point actually cites, when one does. */
  excerpt?: string | null;
  res: string[];
};
export type Resolution = {
  id: string;
  title: string;
  status: ClauseStatus;
  text: string;
  src: string[];
  dp: string[];
  owner: string;
  pb: { verdict: Verdict; detail: string } | null;
  ai?: boolean;
  updatedAt?: string;
  ownerId?: string | null;
  reviewedBy?: string | undefined;
  reviewedAt?: string | undefined;
};
export type DraftingPoint = {
  id: string;
  title: string;
  status: ClauseStatus;
  text: string;
  from: string;
  clause: string | null;
  ai?: boolean;
  kind?: import("@/lib/collaboration").NextStepKind;
  linkConfirmed?: boolean;
};
export type PlaybookRule = {
  id: string;
  topic: string;
  preferred: string;
  fallback: string;
  redflag: string;
  escalate: string;
  clause: string;
  owner: string;
  usage: string;
  linked: string[];
  note: string | null;
  /** Phase 3 governance detail. */
  acceptable: string;
  riskLevel: string;
  negotiation: string;
  commercialRationale: string;
  legalRationale: string;
  approvalThreshold: string;
  jurisdictionNote: string;
  internalNote: string;
  updatedAt: string | null;
};
/** The playbook itself — the controlled standard a review is measured against. */
export type PlaybookMeta = {
  id: string;
  name: string;
  version: string;
  status: string;
  description: string;
  jurisdiction: string;
  agreementType: string;
  team: string;
  owner: string;
  effectiveDate: string;
  lastReviewedAt: string;
  approval: ApprovalStatus;
  approvers: string[];
};
export type Precedent = {
  id: string;
  title: string;
  clauseType: string;
  agreementType: string;
  jurisdiction: string;
  body: string;
  approved: boolean;
};
/** A stored connection between a clause and something that explains it. */
export type ClauseLink = {
  id: string;
  clauseId: string;
  toKind: string;
  toId: string;
  note: string;
};
export type TranscriptMeta = {
  /** Row id — the structured extraction hangs off this. */
  id: string;
  /** negotiation · board · hearing · deposition · interview · diligence · internal */
  meetingKind: string;
  title: string;
  date: string;
  durationMinutes: number | null;
  sourceLabel: string;
  speakerCount: number | null;
  /** How speakers were attributed: from the file, assigned by hand, or AI-inferred. */
  attribution?: "file" | "manual" | "inferred";
};

export type LegalData = {
  transcript: TranscriptMeta | null;
  matter: Matter;
  clauses: Clause[];
  discussions: Discussion[];
  resolutions: Resolution[];
  draftingPoints: DraftingPoint[];
  playbook: PlaybookRule[];
  playbookMeta: PlaybookMeta | null;
  precedents: Precedent[];
  links: ClauseLink[];
};

// Praxis ships no sample data. This module is types only: a new account starts
// empty and the user populates it by uploading their own documents.
