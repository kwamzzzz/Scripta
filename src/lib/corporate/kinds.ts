/**
 * The corporate instruments Scripta drafts, and the structural groups a
 * corporate document is built from.
 *
 * These live apart from the document store so a blueprint can name a group
 * and the store can read one without either importing the other.
 */

export type CorporateDocumentKind =
  "board_written_resolution" | "board_minutes" | "shareholder_written_resolution" | "letter";

export const CORPORATE_KINDS: CorporateDocumentKind[] = [
  "board_written_resolution",
  "board_minutes",
  "shareholder_written_resolution",
  "letter",
];

export const KIND_LABEL: Record<CorporateDocumentKind, string> = {
  board_written_resolution: "Written board resolution",
  board_minutes: "Minutes of a board meeting",
  shareholder_written_resolution: "Written shareholders' resolution",
  letter: "Corporate letter",
};

/** One line on when to reach for it, shown on the type picker. */
export const KIND_SUMMARY: Record<CorporateDocumentKind, string> = {
  board_written_resolution:
    "The directors resolve without meeting, each signing the same document.",
  board_minutes: "A meeting was held: who attended, what was considered, what was resolved.",
  shareholder_written_resolution:
    "The members resolve without a general meeting, by written resolution.",
  letter:
    "A letter on the firm's paper: a general letter, or an employment or address confirmation.",
};

/**
 * Is this a kind the app can actually draft and export? Accepts the legacy
 * value as well, because rows written before the kinds were split out are
 * still perfectly good documents.
 */
export const isCorporateKind = (value: unknown): value is CorporateDocumentKind | "resolution" =>
  typeof value === "string" &&
  (value === "resolution" || (CORPORATE_KINDS as string[]).includes(value));

/**
 * Written before the kinds were split out, every resolution was one kind.
 * A row saved then is a written board resolution.
 */
export const readKind = (value: string): CorporateDocumentKind =>
  value === "resolution"
    ? "board_written_resolution"
    : (CORPORATE_KINDS as string[]).includes(value)
      ? (value as CorporateDocumentKind)
      : "letter";

/**
 * The structural parts a corporate document is made of. A blueprint decides
 * which of these a given instrument has and in what order; the export lays
 * them out; the numbering counts within each group.
 */
export type CorporateGroup =
  | "company"
  | "attendance"
  | "recital"
  | "consideration"
  | "resolution"
  | "authority"
  | "execution"
  | "body"
  | "purpose";

export const CORPORATE_GROUPS: CorporateGroup[] = [
  "company",
  "attendance",
  "recital",
  "consideration",
  "resolution",
  "authority",
  "execution",
  "body",
  "purpose",
];

export const GROUP_LABEL: Record<CorporateGroup, string> = {
  company: "Company",
  attendance: "Attendance",
  recital: "Recital",
  consideration: "Consideration",
  resolution: "Resolution",
  authority: "Authority",
  execution: "Execution",
  body: "Body",
  purpose: "Purpose",
};
