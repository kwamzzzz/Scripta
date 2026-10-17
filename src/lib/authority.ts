/**
 * What an authority is worth.
 *
 * Every authority the research model returns carries a `kind`: STATUTE, COURT
 * DECISION, REGULATION, SECONDARY, or UNVERIFIED. Until now all five rendered
 * the same way — one grey word in a 9.5px monospace line between the source
 * and the date — so a statute and a citation the model told us it could not
 * stand behind looked identical on the page.
 *
 * That is the wrong way round. UNVERIFIED is not a category of authority; it
 * is the model saying it may have invented the citation. It is the single
 * most important thing on the card and it was the quietest. And the default
 * when the model omits `kind` altogether is UNVERIFIED, so the quiet label is
 * also the one that appears by accident.
 *
 * Three weights, because three is what changes what a lawyer does next:
 * primary authority you cite, secondary authority you cite carefully and
 * attribute, and an unverified citation you check before it goes anywhere.
 */

export type AuthorityWeight = "primary" | "secondary" | "unverified";

/** The kinds the research prompt asks the model to use, normalised. */
const PRIMARY = new Set(["STATUTE", "COURT DECISION", "REGULATION"]);

/**
 * Classify a `kind` string.
 *
 * Anything unrecognised is unverified, not primary. The model writes this
 * field freely, and a value we do not understand is a value we cannot vouch
 * for — guessing generously here would put an unknown citation on the same
 * footing as an Act.
 */
export function authorityWeight(kind: string | null | undefined): AuthorityWeight {
  const k = (kind ?? "").trim().toUpperCase();
  if (PRIMARY.has(k)) return "primary";
  if (k === "SECONDARY") return "secondary";
  return "unverified";
}

/** How the weight reads on the badge. Primary keeps its own kind; the other
 *  two say what they are, because that is the part that is easy to miss. */
export function authorityLabel(kind: string | null | undefined): string {
  const k = (kind ?? "").trim().toUpperCase();
  switch (authorityWeight(kind)) {
    case "primary":
      return k;
    case "secondary":
      return "SECONDARY";
    default:
      return k && k !== "UNVERIFIED" ? `UNVERIFIED · ${k}` : "UNVERIFIED";
  }
}

/** Badge colours, in the workbench's own palette. */
export const AUTHORITY_TONE: Record<AuthorityWeight, { fg: string; bg: string; edge: string }> = {
  primary: { fg: "#4a4a4a", bg: "#f4f4f4", edge: "#dcdcdc" },
  secondary: { fg: "#8a5b00", bg: "#F6F0DF", edge: "#E5D8B4" },
  unverified: { fg: "#c5221f", bg: "#F7ECEA", edge: "#E8CCC7" },
};

/** The sentence under an unverified badge, in the reader where there is room. */
export const UNVERIFIED_NOTE =
  "Scripta could not stand behind this citation. Check it exists, and in this form, before relying on it or putting it in a memo.";

export type WeighedAuthority = { kind: string };

export type AuthoritySupport = {
  primary: number;
  secondary: number;
  unverified: number;
  /** Nothing to say — either there are no authorities, or they are all primary. */
  ok: boolean;
  /** One sentence naming what is wrong, or null when nothing is. */
  warning: string | null;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * What an answer as a whole rests on.
 *
 * Two things are worth interrupting a reader for: a citation the model would
 * not vouch for, and an answer with no primary authority behind it at all.
 * The second is quieter but not smaller — an answer supported only by
 * commentary is an argument, not the law, and it should not be read as
 * settled because it came back formatted like everything else.
 */
export function authoritySupport(authorities: WeighedAuthority[]): AuthoritySupport {
  const counts = { primary: 0, secondary: 0, unverified: 0 };
  for (const a of authorities) counts[authorityWeight(a.kind)] += 1;

  const warning =
    counts.unverified > 0
      ? `${plural(counts.unverified, "citation is", "citations are")} unverified. Check ${counts.unverified === 1 ? "it exists" : "they exist"} before relying on this answer.`
      : authorities.length > 0 && counts.primary === 0
        ? "No primary authority. This answer rests on secondary sources, which persuade but do not bind."
        : null;

  return { ...counts, ok: warning === null, warning };
}
