/**
 * What a contract's key terms are depends on what kind of contract it is.
 *
 * The old summary showed "Principal · Annual interest · Default interest" over
 * an employment agreement, because the schema was fixed and financing-shaped.
 * A lawyer opening an employment contract wants probation, hours, notice and
 * leave; the same space over a shareholders' agreement wants board composition,
 * reserved matters and transfer restrictions. So the schema is chosen by the
 * contract's type, and the extraction is told what to look for.
 */

export type TermField = {
  key: string;
  label: string;
  /** What the extraction should look for. Also the empty-state hint. */
  hint: string;
};

export type ContractSchema = {
  key: string;
  label: string;
  /** Matched against the matter type and the document's own title. */
  match: RegExp;
  fields: TermField[];
};

const GOVERNING: TermField = {
  key: "governing_law",
  label: "Governing law",
  hint: "The law the agreement is governed by",
};

export const CONTRACT_SCHEMAS: ContractSchema[] = [
  {
    key: "employment",
    label: "Employment",
    match: /employ|contract of service|staff|secondment/i,
    fields: [
      { key: "employer", label: "Employer", hint: "The employing entity" },
      { key: "employee", label: "Employee", hint: "The individual employed" },
      { key: "role", label: "Role", hint: "Job title and reporting line" },
      { key: "commencement", label: "Commencement", hint: "The date employment starts" },
      { key: "employment_type", label: "Employment type", hint: "Indefinite, fixed term, casual" },
      { key: "probation", label: "Probation", hint: "Length and what applies during it" },
      { key: "hours", label: "Working hours", hint: "Hours per week and overtime" },
      { key: "salary", label: "Salary", hint: "Amount, currency and interval" },
      { key: "benefits", label: "Benefits", hint: "Allowances, pension, medical" },
      { key: "leave", label: "Annual leave", hint: "Days per year and accrual" },
      { key: "sick_leave", label: "Sick leave", hint: "Entitlement and pay" },
      { key: "notice", label: "Notice", hint: "Notice each side must give" },
      { key: "confidentiality", label: "Confidentiality", hint: "What is protected, for how long" },
      { key: "ip", label: "Intellectual property", hint: "Ownership of what the employee makes" },
      {
        key: "restrictive_covenants",
        label: "Restrictive covenants",
        hint: "Non-compete, non-solicit and their reach",
      },
      GOVERNING,
    ],
  },
  {
    key: "shareholders",
    label: "Shareholders' agreement",
    match: /shareholder|joint venture|sha\b|subscription and shareholders/i,
    fields: [
      { key: "company", label: "Company", hint: "The company the agreement concerns" },
      { key: "shareholders", label: "Shareholders", hint: "The parties and what each holds" },
      { key: "share_capital", label: "Share capital", hint: "Authorised and issued capital" },
      { key: "shareholding", label: "Shareholding", hint: "The split between the parties" },
      { key: "board", label: "Board composition", hint: "Who appoints how many directors" },
      { key: "quorum", label: "Quorum and voting", hint: "Board and shareholder majorities" },
      {
        key: "reserved_matters",
        label: "Reserved matters",
        hint: "What needs a special majority or consent",
      },
      {
        key: "transfer_restrictions",
        label: "Transfer restrictions",
        hint: "Lock-in and permitted transfers",
      },
      {
        key: "pre_emption",
        label: "Pre-emption",
        hint: "Rights of first refusal on issue and transfer",
      },
      { key: "drag_tag", label: "Drag and tag", hint: "Drag-along and tag-along thresholds" },
      { key: "deadlock", label: "Deadlock", hint: "How a deadlock is broken" },
      { key: "dividends", label: "Dividend policy", hint: "Distribution policy, if any" },
      { key: "exit", label: "Exit", hint: "Listing, sale or buy-out provisions" },
      GOVERNING,
    ],
  },
  {
    key: "loan",
    label: "Loan or facility",
    match: /loan|facility|credit agreement|convertible|debenture|promissory/i,
    fields: [
      { key: "lender", label: "Lender", hint: "Who lends" },
      { key: "borrower", label: "Borrower", hint: "Who borrows" },
      { key: "principal", label: "Principal", hint: "The amount and currency" },
      { key: "purpose", label: "Purpose", hint: "What the money may be used for" },
      { key: "interest", label: "Interest", hint: "Rate and how it accrues" },
      { key: "default_interest", label: "Default interest", hint: "The rate on overdue amounts" },
      { key: "drawdown", label: "Drawdown", hint: "Conditions precedent and availability" },
      { key: "repayment", label: "Repayment", hint: "Schedule and prepayment rights" },
      { key: "maturity", label: "Maturity", hint: "Final repayment date" },
      { key: "security", label: "Security", hint: "What secures the facility" },
      { key: "covenants", label: "Covenants", hint: "Financial and information undertakings" },
      { key: "events_of_default", label: "Events of default", hint: "What triggers acceleration" },
      GOVERNING,
    ],
  },
  {
    key: "supply",
    label: "Supply or offtake",
    match: /supply|offtake|purchase and sale|sale and purchase|spa\b|commodit/i,
    fields: [
      { key: "seller", label: "Seller", hint: "The supplier or producer" },
      { key: "buyer", label: "Buyer", hint: "The purchaser or offtaker" },
      { key: "product", label: "Product", hint: "What is sold" },
      { key: "quantity", label: "Quantity", hint: "Volumes and any minimum or maximum" },
      { key: "quality", label: "Quality and assay", hint: "Specification and how it is tested" },
      { key: "price", label: "Price", hint: "How price is set" },
      { key: "delivery", label: "Delivery terms", hint: "Incoterm, place and timing" },
      { key: "title_risk", label: "Title and risk", hint: "When each passes" },
      { key: "payment", label: "Payment", hint: "Mechanism, timing and security" },
      { key: "term", label: "Term", hint: "Duration and renewal" },
      { key: "force_majeure", label: "Force majeure", hint: "What is excused and for how long" },
      GOVERNING,
    ],
  },
  {
    key: "services",
    label: "Services",
    match: /services|consultan|engagement letter|statement of work|sow\b|vendor/i,
    fields: [
      { key: "supplier", label: "Supplier", hint: "Who provides the services" },
      { key: "customer", label: "Customer", hint: "Who receives them" },
      { key: "services", label: "Services", hint: "What is to be provided" },
      { key: "term", label: "Term", hint: "Duration and renewal" },
      { key: "fees", label: "Fees", hint: "Amount and basis" },
      { key: "payment_terms", label: "Payment terms", hint: "Invoicing and days to pay" },
      {
        key: "service_levels",
        label: "Service levels",
        hint: "Standards and remedies for failure",
      },
      { key: "liability", label: "Liability", hint: "Caps and exclusions" },
      { key: "ip", label: "Intellectual property", hint: "Who owns what is produced" },
      { key: "termination", label: "Termination", hint: "Rights to end it, and notice" },
      GOVERNING,
    ],
  },
  {
    key: "nda",
    label: "Confidentiality",
    match: /non-disclosure|nda\b|confidentiality agreement|mutual confidential/i,
    fields: [
      { key: "discloser", label: "Discloser", hint: "Who shares the information" },
      { key: "recipient", label: "Recipient", hint: "Who receives it" },
      { key: "mutual", label: "Mutual or one-way", hint: "Whether both sides are bound" },
      { key: "purpose", label: "Permitted purpose", hint: "What the information may be used for" },
      {
        key: "definition",
        label: "Confidential information",
        hint: "What counts, and the carve-outs",
      },
      { key: "term", label: "Term", hint: "How long the obligation lasts" },
      {
        key: "permitted_disclosures",
        label: "Permitted disclosures",
        hint: "Advisers, affiliates, compelled disclosure",
      },
      { key: "return", label: "Return or destruction", hint: "What happens at the end" },
      { key: "remedies", label: "Remedies", hint: "Injunctive relief and damages" },
      GOVERNING,
    ],
  },
  {
    key: "licence",
    label: "Licence",
    match: /licen[cs]e|franchis|distribution agreement|reseller/i,
    fields: [
      { key: "licensor", label: "Licensor", hint: "Who grants the rights" },
      { key: "licensee", label: "Licensee", hint: "Who takes them" },
      { key: "licensed_ip", label: "Licensed rights", hint: "What is licensed" },
      { key: "scope", label: "Scope", hint: "Permitted uses and restrictions" },
      { key: "territory", label: "Territory", hint: "Where the rights may be used" },
      { key: "exclusivity", label: "Exclusivity", hint: "Exclusive, sole or non-exclusive" },
      { key: "term", label: "Term", hint: "Duration and renewal" },
      { key: "royalties", label: "Royalties", hint: "Rate, basis and reporting" },
      {
        key: "sublicensing",
        label: "Sublicensing",
        hint: "Whether it is allowed, and on what terms",
      },
      { key: "termination", label: "Termination", hint: "Rights to end it and what survives" },
      GOVERNING,
    ],
  },
  {
    key: "lease",
    label: "Lease or tenancy",
    match: /lease|tenanc|licence to occupy|premises/i,
    fields: [
      { key: "landlord", label: "Landlord", hint: "Who lets the premises" },
      { key: "tenant", label: "Tenant", hint: "Who takes them" },
      { key: "premises", label: "Premises", hint: "What is let, and its extent" },
      { key: "term", label: "Term", hint: "Length and commencement" },
      { key: "rent", label: "Rent", hint: "Amount and when it is paid" },
      { key: "rent_review", label: "Rent review", hint: "How and when rent changes" },
      {
        key: "service_charge",
        label: "Service charge",
        hint: "What it covers and how it is apportioned",
      },
      { key: "repair", label: "Repair", hint: "Who repairs what" },
      { key: "alienation", label: "Alienation", hint: "Assignment and subletting" },
      { key: "break", label: "Break rights", hint: "Who may end it early, and how" },
      GOVERNING,
    ],
  },
];

/** The fallback: what any agreement has, when the type is not one we know. */
export const GENERIC_SCHEMA: ContractSchema = {
  key: "general",
  label: "Agreement",
  match: /.^/,
  fields: [
    { key: "parties", label: "Parties", hint: "Who is bound" },
    { key: "subject", label: "Subject", hint: "What the agreement is about" },
    { key: "term", label: "Term", hint: "Duration and renewal" },
    { key: "consideration", label: "Consideration", hint: "What is paid, and when" },
    { key: "obligations", label: "Key obligations", hint: "What each side must do" },
    { key: "liability", label: "Liability", hint: "Caps, exclusions and indemnities" },
    { key: "termination", label: "Termination", hint: "How it ends" },
    GOVERNING,
  ],
};

/**
 * The schema for a contract, from its matter type and its own title. The type
 * the lawyer set wins; the document's title is the fallback, because a matter
 * created as "Other" is very often something we can recognise from the paper.
 */
export function schemaFor(matterType: string | null, documentTitle = ""): ContractSchema {
  const byType = CONTRACT_SCHEMAS.find((s) => s.match.test(matterType ?? ""));
  if (byType) return byType;
  const byTitle = CONTRACT_SCHEMAS.find((s) => s.match.test(documentTitle));
  return byTitle ?? GENERIC_SCHEMA;
}

/** Every schema a matter can be set to, for the picker. */
export const SCHEMA_CHOICES = [...CONTRACT_SCHEMAS, GENERIC_SCHEMA].map((s) => ({
  key: s.key,
  label: s.label,
}));

export const schemaByKey = (key: string): ContractSchema =>
  [...CONTRACT_SCHEMAS, GENERIC_SCHEMA].find((s) => s.key === key) ?? GENERIC_SCHEMA;

/**
 * Which schema a stored term belongs to. Terms already extracted are the best
 * evidence of what schema they were read against, which beats guessing twice.
 */
export const schemaForTermKey = (termKey: string): ContractSchema | null =>
  [...CONTRACT_SCHEMAS, GENERIC_SCHEMA].find((s) => s.fields.some((f) => f.key === termKey)) ??
  null;
