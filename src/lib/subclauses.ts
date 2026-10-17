/**
 * Splitting a clause into the parts a lawyer actually works on.
 *
 * A clause is not one thing. "Definitions and Interpretation" is thirty
 * definitions, and each of them is negotiated, marked and argued about on its
 * own: one is market standard, another is the whole deal. "Remuneration and
 * Benefits" is three sub-clauses, one of which is mandatory law.
 *
 * Scripta stores that correctly already — a clause row per sub-clause, with
 * `num` carrying the hierarchy, so 1.1 sits under 1 — and the editor already
 * nests them and counts the subsections. What was missing is the step that
 * turns drafted or parsed prose into those rows. Both producers made one row
 * holding everything, so a whole section got one status chip and one Edit
 * button, and there was nowhere to put an assessment of a single definition.
 *
 * This is that step, and it is deliberately not an AI call. The structure is
 * already written down in the text — the drafter numbered the sub-clauses and
 * wrote the definitions in the form every contract uses — so reading it is
 * parsing, not judgement. An AI here would be slower, cost money and
 * occasionally invent a sub-clause that is not there.
 */

/**
 * What kind of provision this is, structurally — not what it means.
 *
 * A definition and an operative provision are read differently, cite
 * differently and are negotiated differently, and the document says which is
 * which in its own form. Anything beyond that — obligation, condition,
 * remedy — is legal interpretation and is deliberately not decided here.
 */
export type ProvisionKind = "definition" | "provision";

/** The kinds of thing a provision can point at, as the document names them. */
export type ReferenceType =
  "clause" | "section" | "schedule" | "annex" | "appendix" | "exhibit" | "paragraph";

export type Reference = {
  type: ReferenceType;
  /** The target exactly as written: "13", "8.3", "8.3(b)", "IV". */
  target: string;
};

export type SubClause = {
  /** "1.1", "3.2" — the parent's number extended, or the one the text carries. */
  num: string;
  /** What the editor shows in the collapsed row. */
  title: string;
  text: string;
  kind: ProvisionKind;
  /**
   * What this provision points at: `[{ type: "schedule", target: "2" }]`.
   *
   * Kept because throwing them away is what makes a provision look isolated.
   * "Confidential Information" defined by reference to clause 13 is only
   * meaningful alongside clause 13, and a later reviewer — or a context packet
   * built for one — needs to know the edge exists.
   *
   * The type is stored with the target because "2" alone cannot say whether
   * the source wrote clause 2 or Schedule 2, and those resolve to different
   * documents. The question this has to answer later is not "which numbers
   * were mentioned" but "which provision does this point to".
   *
   * Reading the reference is parsing. Following it, checking it exists, and
   * judging what it means are not done here.
   */
  refs: Reference[];
};

export type SplitClause = {
  /** Wording that belongs to the clause itself: the lead-in before the parts. */
  lead: string;
  parts: SubClause[];
};

/** "3.2 All cash, securities…" — the sub-clause states its own number. */
const NUMBERED = /^(\d+(?:\.\d+)+)[.)]?\s+(.*)$/s;

/** "(a) …" and "(i) …", which number themselves within their parent. */
const LETTERED = /^\(([a-z]{1,3}|[ivx]{1,4})\)\s+(.*)$/is;

/**
 * `"Business Day" means any day…` — the form every definition takes.
 *
 * Straight and curly quotes both, because one comes from a keyboard and the
 * other from Word, and a contract usually contains both.
 */
// "X" means …, "X" shall mean …, "X" has the meaning …, and the form this
// missed until a Saudi framework agreement turned up using it throughout:
// "X" SHALL HAVE the meaning given in clause Y. All four are the same act
// of defining a term, and a definition the splitter does not recognise is a
// definition that gets merged into its neighbour.
const DEFINITION =
  /^["“”']([^"“”']+)["“”']\s+(?:(?:shall\s+)?means?|(?:shall\s+have|has|have)\s+the\s+meaning)\b/i;

/**
 * "in clause 13", "under clause 8.3", "in Schedule 2" — a reference as written.
 *
 * Deliberately shallow: it records that an edge exists and where it points.
 * It does not resolve the target, check that it exists, or interpret it.
 */
const REFERENCE =
  /\b(clauses?|sections?|schedules?|annex(?:ures?|es)?|appendix|appendices|exhibits?|paragraphs?)\s+(\d+(?:\.\d+)*\b(?:\([a-z0-9]+\))?|[IVXLCDM]{1,7}\b)/gi;

/** Whether this wording is a defined term rather than an operative provision. */
export function isDefinition(text: string): boolean {
  const first = text.trim().split(/\n\s*\n|\r?\n/)[0] ?? "";
  const numbered = NUMBERED.exec(first);
  return DEFINITION.test(numbered ? numbered[2]! : first);
}

/** Everything this wording points at, in the order written, without duplicates. */
export function referencesIn(text: string): Reference[] {
  const found: Reference[] = [];
  for (const m of text.matchAll(REFERENCE)) {
    const type = normaliseType(m[1]!);
    const target = m[2]!.trim();
    if (!found.some((r) => r.type === type && r.target === target)) found.push({ type, target });
  }
  return found;
}

/** "Clauses" and "Annexure" are the same thing as "clause" and "annex". */
function normaliseType(word: string): ReferenceType {
  const w = word.toLowerCase();
  if (w.startsWith("clause")) return "clause";
  if (w.startsWith("section")) return "section";
  if (w.startsWith("schedule")) return "schedule";
  if (w.startsWith("annex")) return "annex";
  if (w.startsWith("appendix")) return "appendix";
  if (w.startsWith("exhibit")) return "exhibit";
  return "paragraph";
}

/** Words no heading should end on. */
const DANGLING = /^(and|or|of|to|for|in|on|with|the|a|an|that|which|by|from|as)[.,;:]?$/i;

/** A heading a lawyer would recognise, short enough for a collapsed row. */
function titleOf(text: string): string {
  const definition = DEFINITION.exec(text);
  if (definition) return `“${definition[1]!.trim()}”`;
  const words = text.trim().split(/\s+/);
  if (words.length <= 6) return words.join(" ").replace(/[.,;:]$/, "");
  // A heading that stops on "and" or "of" reads as though it were cut off by
  // accident, so the dangling connective goes with the ellipsis.
  const kept = words.slice(0, 6);
  while (kept.length > 2 && DANGLING.test(kept[kept.length - 1]!)) kept.pop();
  return `${kept.join(" ").replace(/[.,;:]$/, "")}…`;
}

/** Paragraphs, however the source separated them. */
function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n|\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Does this paragraph start a new part, or continue the one before it?
 *
 * A paragraph that carries its own number or opens a definition starts one.
 * Anything else is the rest of the part above — a second sentence, a proviso,
 * a list that belongs to the sub-clause it follows.
 *
 * `(a)` and `(i)` are the awkward case, because they are sometimes a clause's
 * whole structure and sometimes the items inside one of its sub-clauses. Which
 * they are is answered by the clause around them: where a clause numbers its
 * own sub-clauses 2.1, 2.2, 2.3, the lettered items beneath each of those are
 * that sub-clause's list and belong to it. Promoting them made a clause of
 * three sub-clauses into twelve siblings, with the drafter's "2.2" and a
 * positional "2.2" sitting next to each other meaning different things.
 */
function startsPart(text: string, numberedClause: boolean): boolean {
  if (NUMBERED.test(text) || DEFINITION.test(text)) return true;
  return !numberedClause && LETTERED.test(text);
}

/**
 * Split a clause into its lead-in and its parts.
 *
 * Returns no parts where there is nothing to split — a clause of one paragraph
 * is one thing and stays one thing. The caller keeps it whole rather than
 * wrapping a single part in a container that says nothing.
 */
export function splitClause(parentNum: string, text: string): SplitClause {
  const paras = paragraphs(text);
  if (!paras.length) return { lead: "", parts: [] };

  const lead: string[] = [];
  const parts: SubClause[] = [];
  const parent = parentNum.trim().replace(/\.$/, "");
  // Whether the drafter numbered the sub-clauses themselves. Decided for the
  // clause as a whole before any of it is read, because what `(a)` means
  // depends on it.
  const numberedClause = paras.some((para) => NUMBERED.test(para));
  // The numbers the drafter has already used, so a positional one never lands
  // on top of an explicit one and claims to be the same provision.
  const taken = new Set(
    paras.map((para) => NUMBERED.exec(para)?.[1]).filter((num): num is string => !!num),
  );
  let next = 0;
  const nextNum = () => {
    let candidate = "";
    do {
      next += 1;
      candidate = `${parent}.${next}`;
    } while (taken.has(candidate));
    taken.add(candidate);
    return candidate;
  };

  for (const para of paras) {
    if (!startsPart(para, numberedClause)) {
      // Before the first part it is the clause's own lead-in; after one, it is
      // more of that part.
      if (parts.length) parts[parts.length - 1]!.text += `\n\n${para}`;
      else lead.push(para);
      continue;
    }

    const numbered = NUMBERED.exec(para);
    if (numbered) {
      // The drafter's own numbering wins, even when it disagrees with the
      // parent — a mis-numbered sub-clause is a drafting error worth seeing,
      // not something to quietly correct.
      parts.push({
        num: numbered[1]!,
        title: titleOf(numbered[2]!),
        // The number is the part's `num`, printed from there. Kept in the
        // wording too, it printed twice and went stale on a renumber: clause
        // 1.3 reading "2.4 This Agreement starts…".
        text: numbered[2]!,
        kind: DEFINITION.test(numbered[2]!) ? "definition" : "provision",
        refs: referencesIn(para),
      });
      continue;
    }

    // A definition or a lettered part numbers itself by position under the
    // parent, which is how a reader refers to it anyway.
    parts.push({
      num: nextNum(),
      title: titleOf(para),
      text: para,
      kind: DEFINITION.test(para) ? "definition" : "provision",
      refs: referencesIn(para),
    });
  }

  // One part is not a split: it is the clause, said twice.
  if (parts.length < 2) return { lead: text.trim(), parts: [] };
  return { lead: lead.join("\n\n"), parts };
}

/**
 * The section a sub-clause belongs to. "1.1" and "1.1.2" both sit under "1".
 *
 * Lifted out of the sub-clause headings prompt, where it was the only copy, so
 * that every screen grouping clauses agrees about what a parent is.
 *
 * ---------------------------------------------------------------------------
 * A DOCUMENTED ASSUMPTION, NOT A SETTLED FACT.
 *
 * Deriving the tree from the number is right for conventional drafting and
 * costs nothing, which is why there is no parent_id column. It is not
 * guaranteed to hold. Real documents contain unnumbered lead-ins, lettered and
 * Roman schemes, schedules numbered independently of the body, tables, nested
 * bullets, provisions left unnumbered on purpose — and numbering the drafter
 * simply got wrong, which Scripta preserves rather than corrects.
 *
 * So: if a document shows that `num` cannot express its actual tree, the
 * answer is an explicit `parent_id`, not bending the document into a numbering
 * convention it never used. `ParsedClause.parent` already carries the edge
 * separately from the number, which is the seam to widen. Nothing downstream
 * should assume the tree can only ever be read out of `num`.
 * ---------------------------------------------------------------------------
 */
export function sectionOf(num: string): string {
  return (num.trim().replace(/\.$/, "").split(".")[0] ?? "").trim();
}

/** Whether `num` is a part of `parentNum` rather than a clause in its own right. */
export function isPartOf(num: string, parentNum: string): boolean {
  const child = num.trim().replace(/\.$/, "");
  const parent = parentNum.trim().replace(/\.$/, "");
  return child !== parent && child.startsWith(`${parent}.`);
}
