import type { DocKind } from "@/lib/use-upload";

/**
 * What a document is, in the words a lawyer would use bringing it in.
 *
 * The first four are the review's own vocabulary — the pair being compared,
 * the meeting it was discussed in, the playbook it is read against. The rest
 * are the documents a matter accumulates, which used to have nowhere to go:
 * every one of them came in as "Reference" and was filed as a contract.
 */
export const INTAKE_ROLES = [
  "Original / baseline",
  "Amendment / proposed",
  "Transcript",
  "Playbook",
  "Letter",
  "Board resolution",
  "Minutes",
  "Proposal",
  "Research",
  "Reference",
] as const;
export type IntakeRole = (typeof INTAKE_ROLES)[number];

export function roleToKind(role: IntakeRole): DocKind {
  switch (role) {
    case "Amendment / proposed":
      return "amendment";
    case "Transcript":
      return "transcript";
    case "Playbook":
      return "playbook";
    case "Letter":
      return "letter";
    case "Board resolution":
      return "resolution";
    case "Minutes":
      return "minutes";
    case "Proposal":
      return "proposal";
    case "Research":
      return "research";
    // "Reference" is a document kept for context rather than reviewed. It is
    // no longer filed as a contract, which is what it always was before.
    case "Reference":
      return "reference";
    default:
      return "contract";
  }
}

/** Guess a document's role from its filename. Always shown to the user as editable. */
export function inferRole(filename: string): IntakeRole {
  const n = filename.toLowerCase();
  if (/(transcript|otter)/.test(n)) return "Transcript";
  if (/playbook/.test(n)) return "Playbook";
  if (/(minutes|minute[-_ ]?of)/.test(n)) return "Minutes";
  if (/(resolution|written[-_ ]?res)/.test(n)) return "Board resolution";
  if (/(proposal|engagement[-_ ]?letter|fee[-_ ]?(note|proposal)|quote)/.test(n)) return "Proposal";
  if (/(letter|correspondence|memo(randum)?[-_ ]?to|response[-_ ]?from)/.test(n)) return "Letter";
  if (/(research|opinion|advice|note[-_ ]?on)/.test(n)) return "Research";
  if (/(meeting|call)/.test(n)) return "Transcript";
  if (/(amend|proposed|redline|markup|marked[-_ ]?up|counterparty)/.test(n))
    return "Amendment / proposed";
  if (/(original|baseline|execution|executed|clean)/.test(n)) return "Original / baseline";
  const v = versionNumber(n);
  if (v !== null) return v >= 4 ? "Amendment / proposed" : "Original / baseline";
  // A name that says what the document is: "Services_Agreement_…" is a
  // contract, and was being filed as Reference, which review never reads.
  if (CONTRACT_WORDS.test(n)) return "Original / baseline";
  return "Reference";
}

const CONTRACT_WORDS =
  /(agreement|contract|deed|lease|licen[cs]e|\bnda\b|non[-_ ]?disclosure|\bmou\b|memorandum[-_ ]?of[-_ ]?understanding|terms[-_ ]?(and|&)[-_ ]?conditions|\bsla\b|facility|guarantee|indemnity|charter|shareholders|subscription|engagement[-_ ]?terms)/;

/**
 * Whether a document reads as a contract, from its own words: it calls itself
 * an agreement, names the parties and has clauses. Used when the name gave no
 * signal, so an upload is not filed as Reference only because of its filename.
 */
export function readsAsContract(text: string, clauseCount: number): boolean {
  if (clauseCount < 3) return false;
  const opening = text.slice(0, 1500);
  // It names itself one: a title such as "SERVICES AGREEMENT", or "This Agreement".
  const selfNamed =
    /(^|\n)\s*[A-Z][A-Z0-9 ,&'\-()]*\b(AGREEMENT|CONTRACT|DEED|TERMS AND CONDITIONS)\b/.test(
      opening,
    ) || /\bthis (agreement|contract|deed)\b/i.test(opening);
  // And it is made between parties, or says what they agree.
  const made =
    /\bbetween\b[\s\S]{0,600}\band\b/i.test(opening) ||
    /\b(agreed as follows|it is (hereby )?agreed|hereby agree|in consideration of)\b/i.test(text);
  return selfNamed && made;
}

function versionNumber(lower: string): number | null {
  const m = lower.match(/[_\-. ]v(\d{1,2})\b/);
  return m ? Number(m[1]) : null;
}

export function inferVersion(filename: string): string {
  const m = filename.match(/[_\-. ]v(\d{1,2})(?:\.\d+)?\b/i);
  if (m) return `v${m[1]}`;
  if (/execution/i.test(filename)) return "Execution";
  return "";
}

export function inferDate(filename: string): string {
  const iso = filename.match(/(20\d{2})[-_.]?(\d{2})[-_.]?(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return new Date().toISOString().slice(0, 10);
}

export function cleanName(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/[_]+/g, " ")
    .trim();
}

export type IntakeDetails = {
  name: string;
  /** The client's name as chosen; with `clientId` when it is an existing client. */
  client: string;
  clientId?: string | undefined;
  counterparty: string;
  matterType: string;
  governingLaw: string;
  reference: string;
  targetDate: string;
  playbookId: string;
  runAnalysis: boolean;
};

export const EMPTY_DETAILS: IntakeDetails = {
  name: "",
  client: "",
  counterparty: "",
  matterType: "Vendor agreement",
  governingLaw: "",
  reference: "",
  targetDate: "",
  playbookId: "",
  runAnalysis: true,
};

export const draftKey = (workspaceId: string | null) => `px.intake.${workspaceId ?? "none"}`;

/**
 * The contract to review when there is no original/amendment pair to diff.
 * A single incoming draft is the ordinary case, so the review must not
 * depend on a second version existing.
 */
export function soloContractKey(
  rows: { key: string; role: IntakeRole }[],
  uploadedKeys: string[],
): string | null {
  const uploaded = new Set(uploadedKeys);
  return rows.find((r) => roleToKind(r.role) === "contract" && uploaded.has(r.key))?.key ?? null;
}
