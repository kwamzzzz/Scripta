/**
 * Turning a read redline into the rows of a schedule of deviations.
 *
 * ---------------------------------------------------------------------------
 * ONE ROW PER PROVISION, NOT ONE ROW PER EDIT
 * ---------------------------------------------------------------------------
 *
 * A reviewer who retypes a sentence leaves eleven separate insertions and
 * deletions behind. Eleven rows would be true and useless: the other side has
 * to read the clause, not the keystrokes. So changes are gathered to the
 * provision they amend, and a row shows that provision whole — as it arrived,
 * and as it would read if accepted.
 *
 * The opposite failure is worse, though, and it is the one to guard against:
 * two unrelated provisions merged into one row because they happen to sit next
 * to each other. Grouping is therefore by the clause each paragraph is
 * governed by, and never by proximity alone.
 *
 * ---------------------------------------------------------------------------
 * DETERMINISTIC, WITH THE MODEL AS AN OPTIONAL SECOND PASS
 * ---------------------------------------------------------------------------
 *
 * Nothing here calls a model. Which clause a paragraph belongs to is written
 * in the document's own numbering, so reading it is parsing — the argument
 * `lib/subclauses.ts` already makes about sub-clauses, and the reason the
 * schedule can be produced with no AI key configured at all.
 *
 * What a model is genuinely better at is the last column: why a bidder would
 * want this. That runs separately, over the rows this produces, and a missing
 * key costs you the prose and not the schedule.
 */
import { isDefinition } from "@/lib/subclauses";
import type { RevisedParagraph } from "./revisions";

/** A paragraph with both its numberings resolved. */
export type NumberedParagraph = RevisedParagraph & {
  /** Its number in the document as it arrived; null if the reviewer added it. */
  originalLabel: string | null;
  /** Its number if every change is accepted; null if the reviewer removed it. */
  amendedLabel: string | null;
};

/** One row of the schedule. */
export type DeviationRow = {
  /** The clause, sub-clause, recital, definition or schedule the row is about. */
  reference: string;
  /** The wording before the reviewer touched it. */
  original: string;
  /**
   * The wording with the changes shown, run by run.
   *
   * `label` marks a clause number this module injected so a multi-paragraph
   * row stays readable. It is not part of the contract wording, which is what
   * lets the reconstruction check compare the accepted text against the
   * document without having to guess which characters it added itself.
   */
  proposed: { text: string; kind: "same" | "insert" | "delete" | "label" }[];
  /** Paragraph indices, so a row can always be traced back to the document. */
  paragraphs: number[];
  /** True where the reviewer added a provision that has no counterpart. */
  isNew: boolean;
  /** True where the provision is struck out entirely. */
  isDeleted: boolean;
};

/** A change that carries no contractual consequence, and why it was set aside. */
export type SetAside = { paragraph: number; reason: string };

export type BuildResult = {
  rows: DeviationRow[];
  setAside: SetAside[];
  /** Every text-bearing revision in the document, and how many reached a row. */
  tally: { insertions: number; deletions: number; captured: number; setAside: number };
};

const CLAUSE_NUMBER = /^\d+(?:\.\d+)*\.?$/;

/** Whether a label is a clause number ("4.2") rather than a list marker ("(b)"). */
export const isClauseNumber = (label: string | null): boolean =>
  !!label && CLAUSE_NUMBER.test(label.trim());

/** "4.2." → "4.2", so a heading and its sub-clauses agree about the number. */
export const tidyNumber = (label: string): string => label.trim().replace(/\.$/, "");

/**
 * Word writes non-breaking spaces and bidi marks around cross-references.
 * They are invisible on the page and noise in a spreadsheet cell.
 */
export const tidyText = (text: string): string =>
  text
    .replace(/ /g, " ")
    .replace(/[‎‏]/g, "")
    .replace(/‑/g, "-")
    .replace(/\t/g, " ");

/**
 * The clause each paragraph is governed by.
 *
 * A lettered sub-paragraph, and an unnumbered paragraph of running text, both
 * belong to the last numbered clause above them — which is exactly how a
 * lawyer reads down a page.
 */
export function governingClause(paragraphs: NumberedParagraph[]): (string | null)[] {
  let current: string | null = null;
  return paragraphs.map((paragraph) => {
    const label = paragraph.originalLabel ?? paragraph.amendedLabel;
    if (isClauseNumber(label)) current = tidyNumber(label!);
    return current;
  });
}

/** The term a definition defines, as the document writes it: `"Deliverables"`. */
export function definedTerm(text: string): string | null {
  return /^\s*[“"']([^”"']{1,80})[”"']/.exec(text)?.[1] ?? null;
}

/**
 * How a row refers to its provision, saying so when the reviewer renumbered it.
 *
 * Only real clause numbers count as numbers here. A definitions list carries a
 * numbering definition it never prints — Word will happily report the tenth
 * definition as "Article X" — and quoting that back at the buyer is worse than
 * useless, because no such article exists in the document they sent. A
 * definition is cited the way a lawyer cites one: by its term.
 */
export function referenceFor(group: NumberedParagraph[], governing: string | null): string {
  const head = group[0]!;
  const original = isClauseNumber(head.originalLabel) ? tidyNumber(head.originalLabel!) : null;
  const amended = isClauseNumber(head.amendedLabel) ? tidyNumber(head.amendedLabel!) : null;
  const base = governing ?? original ?? amended;

  const term = definedTerm(head.original || head.amended);
  if (term && isDefinition(head.original || head.amended))
    return base ? `Clause ${base} — definition of “${term}”` : `Definition of “${term}”`;

  if (!base) return "Unnumbered paragraph";
  const everyOneIsNew = group.every((p) => !p.originalLabel && !p.original.trim());
  if (everyOneIsNew) return `New clause (proposed as ${base})`;
  const everyOneIsGone = group.every((p) => !p.amended.trim());
  if (everyOneIsGone) return `Clause ${base} (deleted)`;
  if (original && amended && original !== amended)
    return `Clause ${amended} (previously ${original})`;
  return `Clause ${base}`;
}

/**
 * A revision that changes no contractual wording.
 *
 * Word records a great deal that a schedule must not report as a deviation: a
 * paragraph mark absorbed by a neighbouring edit, an indent moved, an empty
 * spacer line added under a new block. Each is set aside with its reason
 * rather than dropped, because "we found nothing here" is a claim a reviewer
 * is entitled to check.
 */
export function reasonToSetAside(paragraph: RevisedParagraph): string | null {
  const changed = paragraph.segments
    .filter((s) => s.kind !== "same")
    .map((s) => s.text)
    .join("");
  if (changed) {
    // A reviewer who inserts a single space has changed the document and not
    // the contract. Nesting this inside a "words moved" test made it
    // unreachable, and the lone space in the "Services" definition was
    // reported as "No change to the wording" — true, but not the reason.
    if (!changed.trim()) return "Spacing only — no change to the wording";
    return null;
  }
  if (!paragraph.original.trim() && !paragraph.amended.trim())
    return "Empty paragraph added or removed — layout only";
  if (paragraph.propertiesChanged && !paragraph.paraMarkInserted && !paragraph.paraMarkDeleted)
    return "Paragraph formatting only — no change to the wording";
  if (paragraph.paraMarkInserted || paragraph.paraMarkDeleted)
    return "Paragraph mark only — the wording is unchanged, the numbering shifts";
  return "No change to the wording";
}

/** Build the schedule from a numbered, revision-bearing document. */
export function buildRows(paragraphs: NumberedParagraph[]): BuildResult {
  const governing = governingClause(paragraphs);
  const setAside: SetAside[] = [];

  // Which paragraphs carry a real amendment.
  const substantive = paragraphs.map((paragraph) => {
    if (!paragraph.changed) return false;
    const reason = reasonToSetAside(paragraph);
    if (reason) {
      setAside.push({ paragraph: paragraph.index, reason });
      return false;
    }
    return true;
  });

  // Contiguous runs sharing a governing clause become one row — but only where
  // the later paragraphs are genuinely PART of that clause rather than
  // provisions of their own.
  //
  // Two things start a row of their own even mid-clause:
  //
  //   a paragraph carrying its own clause number, because 5.1 and 5.2 are two
  //   provisions however adjacent they are; and
  //
  //   a definition, because "Definitions and Interpretation" is thirty of them
  //   and each is negotiated separately. That is `lib/subclauses.ts`' argument
  //   exactly, and `isDefinition` is its test, reused here rather than
  //   restated. Without it the whole of Article 1.1 arrived as one cell
  //   containing six amended definitions, which is unreadable and unusable:
  //   the buyer cannot accept one definition and reject another.
  const groups: NumberedParagraph[][] = [];
  let open: NumberedParagraph[] = [];
  let openUnder: string | null | undefined;
  paragraphs.forEach((paragraph, at) => {
    if (!substantive[at]) return;
    const under = governing[at];
    const previous = groups.length || open.length ? openUnder : undefined;
    const ownNumber = paragraph.originalLabel ?? paragraph.amendedLabel;
    const standsAlone =
      isClauseNumber(ownNumber) || isDefinition(paragraph.original || paragraph.amended);
    if (open.length && under === previous && !standsAlone) {
      // Still the same provision — but only if nothing untouched intervened
      // that belongs to a different clause.
      const lastIndex = open[open.length - 1]!.index;
      const between = paragraphs.slice(lastIndex, paragraph.index - 1);
      const interrupted = between.some(
        (p, k) => governing[lastIndex + k] !== under && (p.original.trim() || p.amended.trim()),
      );
      if (!interrupted) { open.push(paragraph); return; }
    }
    if (open.length) groups.push(open);
    open = [paragraph];
    openUnder = under;
  });
  if (open.length) groups.push(open);

  const rows = groups.map((group) => {
    const at = paragraphs.indexOf(group[0]!);
    const multiple = group.length > 1;
    const label = (paragraph: NumberedParagraph, which: "originalLabel" | "amendedLabel") => {
      if (!multiple) return "";
      const value = paragraph[which] ?? paragraph.originalLabel ?? paragraph.amendedLabel;
      return isClauseNumber(value) || /^\(?[a-z0-9]{1,4}[).]/i.test(value ?? "")
        ? `${tidyNumber(value!)} `
        : "";
    };

    const original = group
      .filter((p) => p.original.trim())
      .map((p) => label(p, "originalLabel") + tidyText(p.original).trim())
      .join("\n");

    const proposed: DeviationRow["proposed"] = [];
    let first = true;
    for (const paragraph of group) {
      if (!paragraph.segments.some((s) => s.text.trim())) continue;
      if (!first) proposed.push({ text: "\n", kind: "same" });
      first = false;
      const prefix = label(paragraph, "amendedLabel");
      if (prefix) proposed.push({ text: prefix, kind: "label" });
      for (const segment of paragraph.segments)
        proposed.push({ text: tidyText(segment.text), kind: segment.kind });
    }

    return {
      reference: referenceFor(group, governing[at] ?? null),
      original: original || "[No equivalent provision in the Agreement]",
      proposed,
      paragraphs: group.map((p) => p.index),
      isNew: !original,
      isDeleted: group.every((p) => !p.amended.trim()),
    };
  });

  const counts = paragraphs.reduce(
    (acc, p) => {
      for (const segment of p.segments) {
        if (!segment.text) continue;
        if (segment.kind === "insert") acc.insertions += 1;
        if (segment.kind === "delete") acc.deletions += 1;
      }
      return acc;
    },
    { insertions: 0, deletions: 0 },
  );

  const inRows = new Set(rows.flatMap((r) => r.paragraphs));
  return {
    rows,
    setAside,
    tally: {
      ...counts,
      captured: paragraphs.filter((p) => inRows.has(p.index)).length,
      setAside: setAside.length,
    },
  };
}
