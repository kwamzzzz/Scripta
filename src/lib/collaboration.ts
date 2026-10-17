import type { ClauseStatus } from "@/data/legal";
import type { InsightCategory } from "@/lib/insights";

export type MatterBrief = {
  representedParty: string;
  partyRole: string;
  governingLaw: string;
  objective: string;
  negotiationLimits: string;
  instructions: string;
};
export const EMPTY_BRIEF: MatterBrief = {
  representedParty: "",
  partyRole: "",
  governingLaw: "",
  objective: "",
  negotiationLimits: "",
  instructions: "",
};
export type NextStepKind = "drafting" | "task" | "obligation" | "reference" | "review";
export const NEXT_STEP_LABEL: Record<NextStepKind, string> = {
  drafting: "Drafting instruction",
  task: "Team task",
  obligation: "Obligation",
  reference: "Document reference",
  review: "Needs classification",
};
export function nextStepKind(category?: InsightCategory | string): NextStepKind {
  if (category === "drafting_instructions") return "drafting";
  if (category === "action_items") return "task";
  if (category === "obligations") return "obligation";
  if (category === "clause_refs") return "reference";
  return "review";
}
export function outcomeLabel(status: ClauseStatus, inferred = false): string {
  const label = status === "Accepted" ? "Agreed" : status === "Escalated" ? "Escalated" : "Open";
  return inferred ? `${label} · inferred` : label;
}
export function canDraftFromDecision(r: { ai?: boolean; status: ClauseStatus; src: string[] }) {
  return !r.ai && r.status === "Accepted" && r.src.length > 0;
}
export function briefMissing(brief: MatterBrief): string[] {
  return [
    !brief.representedParty.trim() && "represented party",
    !brief.partyRole.trim() && "party role",
    !brief.governingLaw.trim() && "governing law",
    !brief.objective.trim() && "objective",
  ].filter(Boolean) as string[];
}
export function formatBrief(brief: MatterBrief): string {
  return Object.entries({
    "Represented party": brief.representedParty,
    "Party role": brief.partyRole,
    "Governing law": brief.governingLaw,
    Objective: brief.objective,
    "Negotiation limits / escalation instructions": brief.negotiationLimits,
    "Team instructions": brief.instructions,
  })
    .map(([key, value]) => `${key}: ${value.trim() || "Not established — do not assume"}`)
    .join("\n");
}
