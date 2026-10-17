/**
 * The structure of a contract as the exporters read it: which level a clause
 * number sits at, whether a title is really a title, and which clauses the
 * table of contents lists.
 *
 * Shared by the Word and PDF exporters so the two documents agree about what
 * is a section and what is a sub-section. A table that listed different
 * clauses in the two copies would be a table of two different contracts.
 */
import type { ExportClause } from "./docx";

export const clauseLevel = (num: string): number => {
  const n = num.trim().replace(/\.$/, "");
  if (!n) return 0;
  return Math.min(n.split(".").length - 1, 2);
};

/**
 * A title that is merely the opening words of the body is not a heading and
 * is not printed twice. Parsers produce these from a clause whose first
 * sentence was mistaken for its heading.
 */
export const isBodyOpening = (title: string, body: string) => {
  // A title cut off with an ellipsis is somebody's opening words, never a
  // heading, even when the words have since changed: 11.2 "On termination:
  // (a) subject to clause…" was listed in the table of contents as a heading
  // because its wording no longer began that way.
  if (/…\s*$/.test(title)) return true;
  const head = title.trim();
  return head.length > 0 && body.trimStart().startsWith(head);
};

/**
 * A number Word's list engine may count: 1, 2.3, 4.1.2. Anything else — a
 * schedule, a part of one, the execution block — names itself, and counted
 * it came out as clause 14, 15 and 15.1 in the Word copy.
 */
export const isCounted = (num: string) => /^\d+(?:\.\d+)*\.?$/.test(num.trim());

/**
 * A clause inserted into a numbered run: a counted number with a letter added,
 * 5A or 5.2A or 7.1.3B.
 *
 * It is structurally a clause like its neighbours — same level, listed in the
 * table of contents, headed by its title — but it is NOT handed to Word's list
 * engine. That is the whole point of the letter: 5.2 and 5.3 keep counting as
 * they did, and the inserted clause prints the number it was given. Counted,
 * it would renumber every clause after it and break every cross-reference in
 * the document, which are prose and cannot be fixed afterwards.
 */
export const isInsertedNumber = (num: string) => /^\d+(?:\.\d+)*[A-Za-z]$/.test(num.trim());

/** Numbered like a clause — whether or not Word's list is the one counting. */
export const isNumbered = (num: string) => isCounted(num) || isInsertedNumber(num);

/**
 * The words a named clause is headed by: "Schedule 1 – Scope of Services",
 * "Part A – Website", "Execution". A counted clause is headed by its title.
 */
export function headingText(c: { num: string; title: string }): string {
  const num = c.num.trim();
  const title = c.title.trim();
  if (isNumbered(num) || !num) return title;
  const parts = num.split(".");
  // A schedule: its name leads, unless the title already says it. Its title
  // was made by a parser, so it is set the way the firm heads a schedule
  // ("Scope of Services", not "Scope Of Services").
  if (parts.length === 1)
    return !title ||
      title.toLowerCase() === num.toLowerCase() ||
      title.toLowerCase().startsWith(num.toLowerCase())
      ? title || num
      : `${num} – ${headingCase(title === title.toUpperCase() ? title.toLowerCase() : title)}`;
  // A lettered part of a schedule: "Part A – …", unless the title already says it.
  const last = parts[parts.length - 1]!;
  if (parts.length === 2 && /^[A-Z]$/.test(last) && !/^part\b/i.test(title))
    return title ? `Part ${last} – ${title}` : `Part ${last}`;
  return title;
}

/**
 * The number printed beside a named clause's paragraph: a schedule's own
 * paragraphs run 1, 2, 3 within it (or within its part). A schedule, a part
 * and the execution block carry their name in the heading, not a number.
 */
export function namedLabel(num: string): string {
  const parts = num.trim().split(".");
  /* An inserted clause prints its own number, and prints it the way the
     numbering would have: "5A." at the top level, "5.2A" beneath it. */
  if (isInsertedNumber(num))
    return clauseLevel(num) === 0 ? `${num.trim()}.` : num.trim();
  if (isCounted(num) || parts.length === 1) return "";
  const last = parts[parts.length - 1]!;
  if (parts.length === 2 && /^[A-Z]$/.test(last)) return "";
  return /^\d+$/.test(last) ? `${last}.` : "";
}

/** The clauses that carry a heading of their own, by position. */
export const clauseText = (c: ExportClause) =>
  c.paras
    ? c.paras.flatMap((p) => p.runs.map((r) => r.t)).join("")
    : c.segs.map((s) => s.t).join("");

export const showsTitle = (c: ExportClause) =>
  c.title.trim() !== "" && !isBodyOpening(c.title, clauseText(c));

/**
 * A sub-clause is unnamed when it has no heading, or a heading that is only
 * its own first words. These are the ones the table of contents cannot list
 * and the ones a lawyer may ask Scripta to propose headings for.
 */
export const isUnnamedSubclause = (c: { num: string | null; title: string }, text: string) =>
  !!c.num?.trim() &&
  clauseLevel(c.num) === 1 &&
  // A definition — “the Act” means… — is headed by its term, and is not a
  // sub-clause a table of contents lists or a heading is proposed for.
  !/^\s*[“"']/.test(text) &&
  (!c.title.trim() || isBodyOpening(c.title, text));

/** Title Case the way the firm heads its sub-clauses, small words lowered after the first. */
export const headingCase = (title: string) =>
  title
    .trim()
    .replace(/\.$/, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((word, i) =>
      i > 0 && /^(a|an|and|at|by|for|in|of|on|or|the|to|with)$/i.test(word)
        ? word.toLowerCase()
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");

export type TocEntry = {
  /** Position in the clause list, so an exporter can find the heading again. */
  index: number;
  /** A section or a sub-section; deeper levels are not listed. */
  level: 0 | 1;
  /** "1." for a section, "1.1" for a sub-section, empty for an unnumbered heading. */
  label: string;
  title: string;
  /** A bookmark name the Word copy can refer to. */
  anchor: string;
  /** The page the heading falls on, once a layout has placed it. */
  page?: number;
};

/**
 * Headings read differently in a table than on the page: the sections are
 * set in capitals as clause headings, but the table lists them in sentence
 * case, as the firm's tables do. A title already in mixed case is the
 * author's own and is left alone.
 */
export const tocTitle = (title: string) => {
  const t = title.trim();
  if (t !== t.toUpperCase() || t === t.toLowerCase()) return t;
  return t.charAt(0) + t.slice(1).toLowerCase();
};

/** How many opening words stand for a sub-clause that was never given a heading. */
const OPENING = 9;

/** What a sub-clause with no heading is listed by: its opening words. */
const openingWords = (c: ExportClause) => {
  const title = c.title.trim();
  if (title) return title;
  const words = clauseText(c).replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (!words.length) return "";
  return words.length > OPENING
    ? `${words
        .slice(0, OPENING)
        .join(" ")
        .replace(/[.,;:]$/, "")}…`
    : words.join(" ");
};

/**
 * The table of contents: every section, every numbered sub-clause beneath it,
 * the execution block and each schedule.
 *
 * A sub-clause is listed whether or not the drafter gave it a heading — the
 * contract has 1.1 to 1.3 and a table that shows only "1. SERVICES" hides
 * them — and one with no heading is listed by its opening words. What sits
 * INSIDE a schedule is the schedule's own structure and is left to it: the
 * table lists "Schedule 1 – Scope of Services", not its parts. Clauses below
 * the sub-clause — (a), (i) — are not listed either.
 */
export function tocEntries(clauses: ExportClause[]): TocEntry[] {
  const out: TocEntry[] = [];
  clauses.forEach((c, index) => {
    const bare = c.num.trim().replace(/\.$/, "");
    // An inserted clause is listed exactly where its siblings are: it is a
    // clause of the contract, and a table that skipped it would be a table of
    // a document that does not exist.
    const counted = isNumbered(bare);
    const depth = clauseLevel(c.num);
    // Named clauses: the schedule itself and the execution block, never what
    // is inside them.
    if (bare && !counted && bare.includes(".")) return;
    if (counted && depth > 1) return;
    const titled = showsTitle(c);
    const title = titled ? headingText(c) : counted && depth === 1 ? openingWords(c) : "";
    if (!title.trim()) return;
    // An unnumbered heading is listed under the section it sits in.
    const level: 0 | 1 = bare ? (depth as 0 | 1) : 1;
    out.push({
      index,
      level,
      label: bare && counted ? (level === 0 ? `${bare}.` : bare) : "",
      title: titled ? tocTitle(title) : title,
      anchor: `_Toc${String(index + 1).padStart(6, "0")}`,
    });
  });
  return out;
}
