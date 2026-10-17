/**
 * The firm's forms for a written resolution, taken from the signed standard
 * (Board Resolution — GMG / Gold Coast Refinery, 8 September 2026).
 *
 * These are the sentences and marks the firm actually uses, not an
 * approximation of them: the date line that leaves room to be dated on
 * execution, the operative sentence that opens the document, the dotted rule a
 * director signs on, and the punctuation that runs a list of resolutions.
 */

const ORDINALS = ["th", "st", "nd", "rd"];

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st. */
export function ordinal(day: number): string {
  const rest = day % 100;
  const suffix = ORDINALS[(rest - 20) % 10] ?? ORDINALS[rest] ?? ORDINALS[0]!;
  return `${day}${suffix}`;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * "Dated this 8th day of September 2026" once a date is settled, and
 * "Dated this [          ] day of [                   ] 2026" until it is, so
 * the document can be printed and dated on execution.
 */
export function houseResolutionDate(date: string, today = new Date()): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!match) {
    const year = /\b(20\d{2})\b/.exec(date)?.[1] ?? String(today.getFullYear());
    return `Dated this [          ] day of [                   ] ${year}`;
  }
  const [, year, month, day] = match;
  const name = MONTHS[Number(month) - 1] ?? "";
  return `Dated this ${ordinal(Number(day))} day of ${name} ${year}`;
}

/**
 * A date as the firm writes one in a letter or a minute: "16th September 2026".
 *
 * Setup stores a date as the date picker gives it, 2026-09-16, and the letter
 * printed exactly that. A date the lawyer typed in words is theirs and is kept
 * as typed; no date at all is an empty string, for the caller to mark.
 */
export function houseLongDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return value.trim();
  const [, year, month, day] = match;
  return `${ordinal(Number(day))} ${MONTHS[Number(month) - 1] ?? ""} ${year}`;
}

/**
 * The sentence that opens a written resolution: the company in capitals, where
 * it is registered, and that its directors have adopted what follows.
 */
export function houseOpening(input: {
  companyName: string;
  registeredOffice: string;
  /** "directors" for a board resolution, "members" for a shareholders' one. */
  organ: "directors" | "members";
}): string {
  const company = input.companyName.trim();
  const office = input.registeredOffice.trim();
  const head = company ? company.toUpperCase() : "[company name]";
  const where = office ? `, having its registered office at ${office}` : "";
  return `${head}${where}, acting by its ${input.organ}, has adopted the following written resolutions:`;
}

/** The rule a director signs on. */
export const HOUSE_SIGNATURE_RULE = "…………………………………………………";

/**
 * A signature block: the rule, the name beneath it, and the office beneath
 * that. An unnamed signatory still gets a rule to sign on.
 */
export const houseSignature = (name: string, office: string): string =>
  `${HOUSE_SIGNATURE_RULE}\n${name.trim() || "[name]"}\n${office}`;

/**
 * How a run of resolutions is punctuated: each ends in a semicolon, the one
 * before the last ends "; and", and the last ends in a full stop. Reported by
 * the review rather than imposed, because the words are the lawyer's.
 */
export function housePunctuation(index: number, total: number): ";" | "; and" | "." {
  if (index === total - 1) return ".";
  if (index === total - 2) return "; and";
  return ";";
}

/** Does this resolution end the way the house runs a list? */
export function endsAsHouse(text: string, index: number, total: number): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  const want = housePunctuation(index, total);
  if (want === ".") return /[.]$/.test(trimmed);
  if (want === "; and") return /;\s*and$/i.test(trimmed);
  return /;$/.test(trimmed) && !/;\s*and$/i.test(trimmed);
}
