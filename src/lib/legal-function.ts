/**
 * What a provision legally does.
 *
 * Everything Scripta records about a provision is currently a judgement about
 * its quality — lawful, market standard, how serious, where on the playbook
 * ladder. None of it records its function. A liability cap and a notice period
 * are both "provision / market_standard / medium", and the fact that one caps
 * liability and the other requires notice lives only in prose no query reaches.
 *
 * This is the vocabulary for changing that, and it is deliberately short.
 * Every category here had to be three things: useful to a lawyer, separable by
 * a model reading one provision, and the key to a workflow that does not exist
 * without it. A label that sounds legally sophisticated and fails any of the
 * three makes the classification less reliable, not more.
 *
 * What was left out matters as much. "Remedy" was considered and dropped: an
 * indemnity is an obligation to a lawyer and a remedy to a model, and the two
 * would have been returned interchangeably — which would make the reliability
 * this is meant to measure impossible to read. Representation, warranty and
 * covenant were left out for the same reason, compounded by the distinction
 * moving between jurisdictions.
 */

export const LEGAL_FUNCTIONS = [
  "obligation",
  "right",
  "prohibition",
  "condition",
  "exception",
  "definition",
  "deadline",
  "payment",
  "liability_limit",
  "termination_right",
  "notice_requirement",
  "approval_requirement",
  "other",
] as const;

export type LegalFunction = (typeof LEGAL_FUNCTIONS)[number];

/**
 * What each one means, and — for the model — how to tell it from its neighbour.
 *
 * The boundaries are where classification goes wrong, so each entry says what
 * it is NOT as well as what it is.
 */
export const FUNCTION_GUIDE: Record<LegalFunction, string> = {
  obligation: "A party must do something. The ordinary 'X shall …'. Prefer a more specific function below where one fits exactly.",
  right: "A party may do something, at its option. Not a right to terminate, which has its own function.",
  prohibition: "A party must not do something. 'shall not', 'may not', 'is prohibited from'.",
  condition: "Something only takes effect if a stated state of affairs holds. 'subject to', 'conditional upon', 'only if'.",
  exception: "It carves something out of another provision. 'save that', 'except', 'this does not apply to'.",
  definition: "It gives a term its meaning. Has no actor.",
  deadline: "Its substance is a period or date by which something must happen. Where the wording is mainly an obligation that merely mentions a date, use obligation.",
  payment: "Money must be paid, or the amount, currency or timing of payment is set.",
  liability_limit: "It caps, excludes or limits liability, or sets a financial ceiling on it.",
  termination_right: "It lets a party bring the agreement or part of it to an end.",
  notice_requirement: "Its substance is that notice must be given — form, period or recipient. Where notice is merely the mechanism of a termination right, use termination_right.",
  approval_requirement: "Something needs another party's consent, approval or sign-off before it may happen.",
  other: "It does none of these. Recitals, headings, interpretation rules, and — in a proposal or advisory letter rather than a contract — ordinary prose. Use this rather than forcing a provision into a category it does not fit.",
};

/** The bit of the prompt that teaches the vocabulary. Built from one source. */
export const FUNCTION_GUIDE_TEXT = LEGAL_FUNCTIONS.map(
  (k) => `${k}: ${FUNCTION_GUIDE[k]}`,
).join("\n");

export const isLegalFunction = (v: unknown): v is LegalFunction =>
  typeof v === "string" && (LEGAL_FUNCTIONS as readonly string[]).includes(v);

/**
 * Tidy an actor without inventing one.
 *
 * The model is asked for the party in the contract's own words, so "Supplier",
 * "Both Parties" and "Either Party" all arrive as written. Empty, "none",
 * "n/a" and "null" all mean the same thing — there is no actor — and are
 * normalised to null rather than stored as prose that later has to be parsed
 * back. A definition genuinely has no actor and should say so.
 */
export function normaliseActor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;
  if (/^(n\/?a|none|null|not applicable|no actor|-)$/i.test(v)) return null;
  return v.slice(0, 80);
}

/** A lawyer's reading is never replaced by a fresh machine reading. */
export type SemanticSource = "ai" | "human";
