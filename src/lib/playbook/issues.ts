/**
 * What a lawyer negotiates in a given kind of agreement.
 *
 * A playbook used to start empty, so the first thing it asked was "what should
 * I call rule 1?" — a question about the tool rather than about the work. These
 * are the issues a practitioner would actually raise, grouped the way they
 * think about them, so a playbook starts as a list of things that matter and
 * the lawyer's job is to say where they stand on each.
 *
 * Suggestions, not doctrine: every one can be renamed, removed or reordered,
 * and a playbook can carry issues that appear on no list here.
 */

export const CATEGORIES = [
  "Commercial",
  "Risk allocation",
  "Operational",
  "IP and data",
  "Boilerplate",
] as const;

export type PlaybookCategory = (typeof CATEGORIES)[number];

export type IssueSuggestion = {
  topic: string;
  category: PlaybookCategory;
  /** Why a lawyer takes a position on it. Seeds the position's rationale. */
  why: string;
};

const COMMON: IssueSuggestion[] = [
  {
    topic: "Governing law and jurisdiction",
    category: "Boilerplate",
    why: "Where a dispute is heard decides how much it costs and how it ends.",
  },
  {
    topic: "Assignment and change of control",
    category: "Boilerplate",
    why: "Who you contracted with can become somebody else without your consent.",
  },
  {
    topic: "Notices",
    category: "Boilerplate",
    why: "A notice served the wrong way is a notice not served.",
  },
  {
    topic: "Termination",
    category: "Commercial",
    why: "How each side gets out, on what notice, and what survives.",
  },
  {
    topic: "Confidentiality",
    category: "IP and data",
    why: "What is protected, for how long, and what the exceptions are.",
  },
];

/**
 * Each agreement type's own issues come first; the common ones follow, so the
 * list reads as a lawyer would raise them rather than alphabetically.
 */
const BY_TYPE: Record<string, IssueSuggestion[]> = {
  services: [
    { topic: "Scope of services", category: "Commercial", why: "What is actually being bought, and what is out of scope." },
    { topic: "Fees and payment terms", category: "Commercial", why: "Amount, timing, and what happens when an invoice is late." },
    { topic: "Term and renewal", category: "Commercial", why: "How long it runs and whether it renews without anybody deciding to." },
    { topic: "Service levels and remedies", category: "Operational", why: "What performance is promised and what happens when it is missed." },
    { topic: "Limitation of liability", category: "Risk allocation", why: "Exposure should bear some relation to what the contract is worth." },
    { topic: "Indemnities", category: "Risk allocation", why: "Which risks one side carries for the other, whatever the cap says." },
    { topic: "Warranties", category: "Risk allocation", why: "What is promised about the service, and for how long." },
    { topic: "Insurance", category: "Risk allocation", why: "Cover is what makes an indemnity worth having." },
    { topic: "Data protection", category: "IP and data", why: "Who is controller, who is processor, and what happens on a breach." },
    { topic: "Intellectual property ownership", category: "IP and data", why: "Who owns what is created, and what the other side may use." },
    { topic: "Subcontracting", category: "Operational", why: "Whether the party you chose may hand the work to somebody you did not." },
    { topic: "Audit rights", category: "Operational", why: "Whether you can verify what you are being told." },
  ],
  supply: [
    { topic: "Volume and delivery", category: "Commercial", why: "What must be delivered, when, and what counts as delivered." },
    { topic: "Price and price adjustment", category: "Commercial", why: "What is paid, and what may move it." },
    { topic: "Title and risk", category: "Risk allocation", why: "When ownership passes, and who carries the loss before it does." },
    { topic: "Quality and rejection", category: "Operational", why: "What standard the goods must meet and how they are refused." },
    { topic: "Force majeure", category: "Risk allocation", why: "Which failures are excused, and for how long." },
    { topic: "Limitation of liability", category: "Risk allocation", why: "Exposure should bear some relation to what the contract is worth." },
    { topic: "Compliance and sanctions", category: "Risk allocation", why: "Who bears the consequence of a licence, permit or sanctions failure." },
  ],
  nda: [
    { topic: "Definition of confidential information", category: "IP and data", why: "Everything else follows from what is actually covered." },
    { topic: "Permitted use and recipients", category: "IP and data", why: "What the other side may do with it, and who may see it." },
    { topic: "Duration of obligations", category: "Commercial", why: "How long the duty runs after the relationship ends." },
    { topic: "Return and destruction", category: "Operational", why: "What happens to the material when it is over." },
    { topic: "Remedies and injunctive relief", category: "Risk allocation", why: "Damages are rarely the remedy that matters here." },
  ],
  employment: [
    { topic: "Remuneration and benefits", category: "Commercial", why: "What is paid, and what is discretionary." },
    { topic: "Probation and notice", category: "Commercial", why: "How each side ends it, and how quickly." },
    { topic: "Restrictive covenants", category: "Risk allocation", why: "How far they reach, for how long, and whether they would be enforced." },
    { topic: "Intellectual property and inventions", category: "IP and data", why: "Who owns what the employee makes." },
    { topic: "Confidentiality", category: "IP and data", why: "What is protected during employment and after it." },
    { topic: "Termination and garden leave", category: "Commercial", why: "What happens between notice and departure." },
  ],
  shareholders: [
    { topic: "Board composition and control", category: "Commercial", why: "Who decides, and with how many votes." },
    { topic: "Reserved matters", category: "Commercial", why: "The decisions a minority can stop." },
    { topic: "Transfer restrictions", category: "Commercial", why: "Who may sell, to whom, and on what terms." },
    { topic: "Drag and tag rights", category: "Commercial", why: "What happens to the minority on an exit." },
    { topic: "Deadlock", category: "Operational", why: "What happens when the shareholders cannot agree." },
    { topic: "Warranties and indemnities", category: "Risk allocation", why: "What each party promises about what it brings." },
  ],
  loan: [
    { topic: "Interest and default interest", category: "Commercial", why: "The price of the money, and the price of being late." },
    { topic: "Repayment and prepayment", category: "Commercial", why: "When it must be repaid and whether it may be repaid early." },
    { topic: "Security and guarantees", category: "Risk allocation", why: "What the lender can reach if it is not repaid." },
    { topic: "Financial covenants", category: "Operational", why: "The tests the borrower must keep meeting." },
    { topic: "Events of default", category: "Risk allocation", why: "What lets the lender call the loan." },
    { topic: "Representations and warranties", category: "Risk allocation", why: "What the borrower is taken to have said." },
  ],
  licence: [
    { topic: "Scope of licence", category: "Commercial", why: "What may be used, where, by whom and for what." },
    { topic: "Exclusivity", category: "Commercial", why: "Whether the licensor may licence the same thing to a competitor." },
    { topic: "Royalties and reporting", category: "Commercial", why: "What is paid and how it is verified." },
    { topic: "Improvements and derivatives", category: "IP and data", why: "Who owns what is built on top." },
    { topic: "Infringement and defence", category: "Risk allocation", why: "Who sues, who defends, and who pays." },
  ],
  lease: [
    { topic: "Rent and review", category: "Commercial", why: "What is paid and how it moves." },
    { topic: "Term, break and renewal", category: "Commercial", why: "How long, and how either side gets out." },
    { topic: "Repair and condition", category: "Operational", why: "The commonest and most expensive argument at the end of a lease." },
    { topic: "Permitted use and alterations", category: "Operational", why: "What the tenant may do with the premises." },
    { topic: "Service charge", category: "Commercial", why: "What the tenant pays for beyond rent." },
  ],
};

/** A playbook for a kind of agreement nobody has a list for still gets a start. */
export const GENERIC_ISSUES: IssueSuggestion[] = [
  { topic: "Scope and deliverables", category: "Commercial", why: "What is actually being agreed." },
  { topic: "Price and payment", category: "Commercial", why: "What is paid, when, and what happens if it is late." },
  { topic: "Limitation of liability", category: "Risk allocation", why: "Exposure should bear some relation to what the contract is worth." },
  { topic: "Indemnities", category: "Risk allocation", why: "Which risks one side carries for the other." },
  { topic: "Warranties", category: "Risk allocation", why: "What each side promises, and for how long." },
];

/** The agreement types a curated list exists for, for the setup screen. */
export const ISSUE_TYPES = Object.keys(BY_TYPE);

/** Matched loosely, because a lawyer writes "SaaS agreement", not "services". */
const ALIASES: [RegExp, string][] = [
  [/saas|software|subscription|technology|it\b|managed service|consult|services|msa/i, "services"],
  [/supply|offtake|purchase|distribut|manufactur/i, "supply"],
  [/nda|non-?disclosure|confidential/i, "nda"],
  [/employ|contract of service|staff/i, "employment"],
  [/shareholder|joint venture|investment|subscription and shareholders/i, "shareholders"],
  [/loan|facility|credit|finance|debt/i, "loan"],
  [/licen[cs]e|ip licen|trade ?mark|patent/i, "licence"],
  [/lease|tenancy|licence to occupy|premises/i, "lease"],
];

export function issueTypeFor(agreementType: string): string | null {
  const value = agreementType.trim();
  if (!value) return null;
  if (BY_TYPE[value.toLowerCase()]) return value.toLowerCase();
  for (const [pattern, key] of ALIASES) if (pattern.test(value)) return key;
  return null;
}

/**
 * The issues to offer for a kind of agreement: its own first, then the ones
 * every commercial agreement has, with nothing repeated.
 */
export function suggestedIssues(agreementType: string): IssueSuggestion[] {
  const key = issueTypeFor(agreementType);
  const own = key ? (BY_TYPE[key] ?? []) : GENERIC_ISSUES;
  const seen = new Set(own.map((i) => i.topic.toLowerCase()));
  return [...own, ...COMMON.filter((i) => !seen.has(i.topic.toLowerCase()))];
}

/** Positions in the order the categories read, then as the lawyer ordered them. */
export function byCategory<T extends { category?: string | null; ordinal?: number | null }>(
  rows: T[],
): { category: string; rows: T[] }[] {
  const order = new Map<string, number>(CATEGORIES.map((c, i) => [c, i]));
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = row.category?.trim() || "Uncategorised";
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()]
    .sort(
      ([a], [b]) =>
        (order.get(a) ?? CATEGORIES.length) - (order.get(b) ?? CATEGORIES.length) ||
        a.localeCompare(b),
    )
    .map(([category, rows]) => ({
      category,
      rows: [...rows].sort((x, y) => (x.ordinal ?? 0) - (y.ordinal ?? 0)),
    }));
}
