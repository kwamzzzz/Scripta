/**
 * The structured extraction taxonomy for Transcript Distillation.
 *
 * Client-safe: the categories and conversion actions are shared between the
 * extraction server function and the panel that renders the result, so the two
 * can never disagree about what a category is called.
 */

export const INSIGHT_CATEGORIES = [
  "executive_summary",
  "key_facts",
  "decisions",
  "action_items",
  "open_issues",
  "legal_issues",
  "commercial_issues",
  "risks",
  "disputes",
  "parties",
  "dates",
  "obligations",
  "financial_terms",
  "follow_ups",
  "clause_refs",
  "review_actions",
  "drafting_instructions",
] as const;

export type InsightCategory = (typeof INSIGHT_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<InsightCategory, string> = {
  executive_summary: "Executive summary",
  key_facts: "Key facts",
  decisions: "Decisions made",
  action_items: "Action items",
  open_issues: "Open issues",
  legal_issues: "Legal issues",
  commercial_issues: "Commercial issues",
  risks: "Risks",
  disputes: "Disputes",
  parties: "Parties and stakeholders",
  dates: "Dates and deadlines",
  obligations: "Obligations and commitments",
  financial_terms: "Financial terms",
  follow_ups: "Follow-up questions",
  clause_refs: "Relevant document clauses",
  review_actions: "Suggested review actions",
  drafting_instructions: "Drafting instructions",
};

/** Categories a lawyer opens first stay expanded; the long tail starts closed. */
export const DEFAULT_OPEN: InsightCategory[] = [
  "executive_summary",
  "decisions",
  "action_items",
  "open_issues",
];

export const MEETING_KINDS = [
  "negotiation",
  "board",
  "hearing",
  "deposition",
  "interview",
  "diligence",
  "internal",
] as const;
export type MeetingKind = (typeof MEETING_KINDS)[number];

export const MEETING_KIND_LABEL: Record<MeetingKind, string> = {
  negotiation: "Negotiation",
  board: "Board meeting",
  hearing: "Hearing",
  deposition: "Deposition",
  interview: "Interview",
  diligence: "Diligence session",
  internal: "Internal notes",
};

export const CONVERSIONS = [
  { key: "create_task", label: "Create task", needs: null },
  { key: "add_to_matter", label: "Add to matter", needs: null },
  { key: "raise_review_issue", label: "Raise as review issue", needs: "clause" },
  { key: "create_negotiation_point", label: "Create negotiation point", needs: null },
  { key: "save_as_note", label: "Save as note", needs: null },
  { key: "add_to_playbook", label: "Add to playbook", needs: null },
  { key: "link_to_clause", label: "Link to clause", needs: "clause" },
  { key: "save_as_precedent", label: "Save as precedent", needs: null },
  { key: "request_follow_up", label: "Request follow-up", needs: null },
] as const;

export type ConversionKey = (typeof CONVERSIONS)[number]["key"];

export type Insight = {
  id: string;
  transcriptId: string;
  category: InsightCategory;
  title: string;
  detail: string;
  excerpt: string;
  discussionPointId: string | null;
  source: "ai" | "human";
  ordinal: number;
};
