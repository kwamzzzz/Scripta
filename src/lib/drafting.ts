/** Shared drafting vocabulary — used by the screen and the server functions. */

export const DRAFT_ACTIONS = [
  { key: "draft_clause", group: "Create", label: "Draft clause" },
  { key: "create_fallback", group: "Create", label: "Create fallback wording" },
  { key: "governing_law", group: "Create", label: "Add governing law variation" },
  { key: "improve", group: "Revise", label: "Improve clause" },
  { key: "balance", group: "Revise", label: "Make more balanced" },
  { key: "favour_customer", group: "Revise", label: "Favour customer" },
  { key: "favour_supplier", group: "Revise", label: "Favour supplier" },
  { key: "compare_playbook", group: "Assess", label: "Compare against playbook" },
  { key: "negotiation_summary", group: "Assess", label: "Create negotiation summary" },
  { key: "find_precedent", group: "Assess", label: "Find similar precedent" },
] as const;

export type DraftAction = (typeof DRAFT_ACTIONS)[number]["key"];

export const ACTION_LABEL = Object.fromEntries(
  DRAFT_ACTIONS.map((a) => [a.key, a.label]),
) as Record<DraftAction, string>;

/** Actions that assess rather than write — the output is analysis, not clause text. */
export const ASSESSMENTS: DraftAction[] = ["compare_playbook", "negotiation_summary", "find_precedent"];

export const RISK_POSITIONS = ["Preferred", "Acceptable", "Fallback", "Red flag"] as const;

export type ClauseFilters = {
  agreementType: string;
  clauseCategory: string;
  jurisdiction: string;
  sector: string;
  riskPosition: string;
};

export const EMPTY_FILTERS: ClauseFilters = {
  agreementType: "",
  clauseCategory: "",
  jurisdiction: "",
  sector: "",
  riskPosition: "",
};

export type GuidanceStep = { label: string; body: string; source: "playbook" | "precedent" | "user" | "ai" };
