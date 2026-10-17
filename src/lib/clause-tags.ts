/**
 * The research-backed classification a clause carries on its header. One
 * vocabulary for the whole product, so the editor tag, the review popover,
 * the analysis prompt and the playbook check never disagree about what a
 * label means. Every tag answers: is this clause right in law, and right for
 * this contract?
 */
export type ClauseTagTone = "law" | "practice" | "risk" | "ok" | "context";

export type ClauseTag = {
  key: string;
  label: string;
  tone: ClauseTagTone;
  /** What the tag asserts, shown to the lawyer and given to the model. */
  meaning: string;
};

export const CLAUSE_TAGS: ClauseTag[] = [
  {
    key: "mandatory_law",
    label: "Mandatory law",
    tone: "law",
    meaning:
      "The clause restates, or is required by, statute or regulation that the parties cannot contract out of. Change it only within what the law allows.",
  },
  {
    key: "contrary_to_law",
    label: "Contrary to law",
    tone: "risk",
    meaning:
      "The clause conflicts with mandatory law and would be struck down, read down or expose the client. It must be corrected.",
  },
  {
    key: "unenforceable",
    label: "Unenforceable",
    tone: "risk",
    meaning:
      "The clause is likely void or unenforceable as drafted, for example a penalty, an unreasonable restraint or an illegal object.",
  },
  {
    key: "wrong_for_contract",
    label: "Wrong for this contract",
    tone: "context",
    meaning:
      "The clause is legally valid but does not fit this agreement: the wrong contract type, party, jurisdiction or commercial context.",
  },
  {
    key: "inconsistent",
    label: "Inconsistent",
    tone: "practice",
    meaning:
      "The clause conflicts with another clause, a definition or a schedule in the same agreement, so the document cannot be read as one.",
  },
  {
    key: "incomplete",
    label: "Incomplete",
    tone: "practice",
    meaning:
      "The clause is missing something it needs to operate: a blank, an undefined term, a broken cross-reference or an unstated consequence.",
  },
  {
    key: "outdated_authority",
    label: "Outdated authority",
    tone: "practice",
    meaning:
      "The clause relies on law that has since been repealed, amended or superseded. Verify against the current consolidation.",
  },
  {
    key: "good_practice",
    label: "Good practice",
    tone: "practice",
    meaning:
      "Not required by law, but protective drafting that experienced practitioners include. Keep it unless there is a reason to trade it away.",
  },
  {
    key: "market_standard",
    label: "Market standard",
    tone: "ok",
    meaning:
      "In line with market practice for this kind of agreement and lawful as drafted. Nothing to change.",
  },
  {
    key: "negotiable",
    label: "Negotiable term",
    tone: "ok",
    meaning:
      "A purely commercial term with no legal constraint either way. The position is the client's to decide.",
  },
];

export const TAG_KEYS = CLAUSE_TAGS.map((t) => t.key);

export function tagByKey(key: string | null | undefined): ClauseTag | null {
  if (!key) return null;
  return CLAUSE_TAGS.find((t) => t.key === key) ?? null;
}

/** The bank as one block of text, for the analysis prompt. */
export const TAG_BANK_TEXT = CLAUSE_TAGS.map((t) => `${t.key} — ${t.label}: ${t.meaning}`).join(
  "\n",
);
