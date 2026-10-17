import type { Block } from "./blocks";
import type { ClauseDoc } from "@/wireframe/clause-doc";
import { scheduleClauses, splitSchedules } from "./schedules";
import {
  isDefinition,
  referencesIn,
  sectionOf,
  splitClause,
  type Reference,
} from "@/lib/subclauses";

export type ParsedClause = {
  num: string;
  title: string;
  page: string;
  body: string;
  ordinal: number;
  /**
   * Structurally what this is. A section that holds parts is "section"; a
   * definition is "definition"; everything else is an operative provision.
   * Nothing here is a judgement about meaning.
   */
  kind?: "section" | "definition" | "provision";
  /** The clause this one sits under, where it sits under one. "8.3" → "8". */
  parent?: string | undefined;
  /** What this wording points at, with the type the source used. */
  refs?: Reference[];
  /**
   * The editor document to store, where the plain text cannot carry how the
   * page is set. Only the title page uses it: its lines are centred, and
   * text alone cannot say so.
   */
  doc?: ClauseDoc | null;
};

export type SplitResult = {
  clauses: ParsedClause[];
  /** false when the document had no headings/numbering we could trust. */
  structureDetected: boolean;
  /**
   * Everything above clause 1: the title, the date, the parties, the recitals.
   *
   * It used to be dropped on the floor, because the clause walker only keeps
   * what follows a heading it recognised. That is a whole page of the contract
   * — who is bound, from when, and why — thrown away before anyone could read
   * it, and it is the part a firm most often redrafts in its own wording.
   */
  preamble?: Block[];
};

// The remainder is captured WITH its terminal punctuation, because that
// punctuation is the signal that tells a heading from a provision. The old
// pattern ended `[.:]?$`, which swallowed a full stop and threw it away, so
// "4.1 The Company shall maintain the Insurance Policies." read as a heading
// and its wording became a title with no body behind it.
const NUM_HEAD =
  /^(?:(?:clause|article|section)\s+)?(\d+(?:\.\d+)*|[IVXLCDM]{1,7})[.):]?\s+(.{1,140})$/i;

const ROMAN = /^[IVXLCDM]+$/;

/** A line that closes like a sentence. Headings do not. */
const SENTENCE_END = /[.;,]$/;

/**
 * Recognise `1.`, `1.1`, `Clause 4`, `ARTICLE V`, `3) Fees` …
 *
 * The hard case is a numbered line that could be either: `4.1 Term` is a
 * heading, `4.1 This Agreement starts on the Commencement Date.` is a
 * provision. Length used to decide it, which is the wrong signal — a short
 * provision is perfectly ordinary, and "8.4 The Cap shall not apply to fraud."
 * is both short and load-bearing.
 *
 * Signals in order of strength, strongest first:
 *   1. the document styled it as a heading — it said so itself, so believe it;
 *   2. it ends like a sentence — a heading does not end in "." ";" or ",";
 *   3. length, which only settles the remaining ambiguity.
 *
 * A trailing full stop is weaker than a semicolon or comma, because a few
 * documents do write "1. Definitions." So a very short line survives one; a
 * semicolon or comma never reads as a heading at any length.
 */
export function parseHeading(
  text: string,
  /** The source marked this as a heading in its own styles. */
  styled = false,
): { num: string; title: string } | null {
  const m = NUM_HEAD.exec(text.trim());
  if (!m) return null;
  const raw = (m[2] ?? "").trim();
  if (!raw) return null;
  const num = m[1]!;
  // A bare roman numeral is only a clause number when it is uppercase.
  if (ROMAN.test(num) && num !== num.toUpperCase()) return null;

  const title = raw.replace(/[.:;,]+$/, "").trim();
  if (!title) return null;
  const words = title.split(/\s+/).length;
  if (words > 14) return null;

  if (!styled && SENTENCE_END.test(raw)) {
    // A semicolon or comma is never a heading. A full stop is allowed only on
    // something too short to be a provision — "1. Definitions." and no more.
    if (!raw.endsWith(".") || words > 4) return null;
  }
  return { num, title };
}

/* ------------------------------------------------------------------ */
/* Real-world Word contracts                                           */
/* ------------------------------------------------------------------ */

/**
 * Word auto-numbering never reaches the text, and a heading styled as a run
 * inside the clause's first paragraph arrives glued to the body:
 *   "POSITION, DUTIES AND PLACE OF WORKThe Employee is employed…"
 *   "DEFINITIONS AND INTERPRETATION“the Act” means…"
 * Split on a run of capitals immediately followed — no space — by a
 * Capitalised word or an opening quote. "THIS EMPLOYMENT CONTRACT (the…" has a
 * space before "(" and is left alone; "NOW IT IS HEREBY AGREED as" is followed
 * by lowercase and is left alone.
 */
const GLUED_HEADING = /^([A-Z][A-Z0-9 ,&\-/()]{4,}?[A-Z])(?=[“"']|[A-Z][a-z])/;
const CAPS_ONLY = /^[A-Z][A-Z0-9 ,&\-/():]{1,60}$/;
const OPERATIVE = /\b(agreed|agree)\b.*\bas follows\b|^now (it is|this).*agreed/i;
const BACK_MATTER = /^(execution|signed|signature|schedule|annex|appendix|exhibit|witness)/i;
const PREAMBLE = /^(between|whereas|recitals|background|parties)\b/i;

export function normalizeBlocks(blocks: Block[]): Block[] {
  const out: Block[] = [];
  for (const b of blocks) {
    const text = b.text.trim();
    if (!b.heading) {
      const glued = GLUED_HEADING.exec(text);
      if (glued && glued[1]!.split(/\s+/).length >= 1) {
        const title = glued[1]!.trim();
        const body = text.slice(glued[1]!.length).trim();
        out.push({ text: title, page: b.page, heading: true, level: 3 });
        if (body) out.push({ text: body, page: b.page, heading: false });
        continue;
      }
      if (CAPS_ONLY.test(text) && /[A-Z]{2,}/.test(text) && text.length <= 60) {
        out.push({ ...b, text, heading: true, level: 3 });
        continue;
      }
    }
    out.push(b);
  }
  return out;
}

/**
 * Number un-numbered clause headings 1..N. Numbering starts after the
 * operative marker ("NOW IT IS HEREBY AGREED as follows") when there is one,
 * otherwise at the first heading that carries a body, and stops at execution
 * blocks and schedules. Preamble headings (BETWEEN:, the title) are excluded.
 */
function numberHeadings(blocks: Block[]): ParsedClause[] {
  const clauses: ParsedClause[] = [];
  let started = blocks.findIndex((b) => OPERATIVE.test(b.text)) >= 0 ? false : true;
  let cur: { title: string; page: number; body: string[] } | null = null;
  let n = 0;
  const snippet = (t: string) => {
    const words = t.split(/\s+/);
    return words.length > 8 ? `${words.slice(0, 8).join(" ")}…` : t;
  };
  /**
   * A heading with one paragraph is one clause. A heading with several is a
   * parent clause plus numbered sub-clauses (2.1, 2.2 …) — the unit a lawyer
   * actually cites — instead of one flattened blob.
   */
  const flush = () => {
    if (!cur) return;
    // Spaces are tidied within a block; line breaks are kept, because a
    // table's rows are lines.
    const paras = cur.body.map((b) => b.replace(/[ \t]+/g, " ").trim()).filter(Boolean);
    if (paras.length === 0) {
      cur = null;
      return;
    }
    n += 1;
    if (paras.length === 1) {
      clauses.push({
        num: String(n),
        title: cur.title,
        page: `p.${cur.page}`,
        body: paras[0]!,
        ordinal: clauses.length + 1,
      });
    } else {
      clauses.push({
        num: String(n),
        title: cur.title,
        page: `p.${cur.page}`,
        body: "",
        ordinal: clauses.length + 1,
      });
      paras.forEach((body, i) => {
        clauses.push({
          num: `${n}.${i + 1}`,
          title: snippet(body),
          page: `p.${cur!.page}`,
          body,
          ordinal: clauses.length + 1,
        });
      });
    }
    cur = null;
  };
  for (const b of blocks) {
    if (!started) {
      if (OPERATIVE.test(b.text)) started = true;
      continue;
    }
    if (b.heading) {
      if (BACK_MATTER.test(b.text)) {
        flush();
        break;
      }
      if (PREAMBLE.test(b.text) || OPERATIVE.test(b.text)) continue;
      flush();
      cur = { title: b.text.replace(/[:.]$/, "").trim(), page: b.page, body: [] };
    } else if (cur) {
      cur.body.push(b.text);
    }
  }
  flush();
  return clauses;
}

/**
 * Keep the paragraph the document drew, and tidy only within it.
 *
 * This used to join every block with a space and collapse all whitespace, so a
 * clause arrived as one run-on string and the boundaries between its
 * definitions and sub-clauses were gone. That is structure the document told
 * us plainly, destroyed at parse time and unrecoverable afterwards — no later
 * step can know whether "…in Ghana; \"Capital Contribution\" means…" was one
 * paragraph or two. Blocks keep their own lines; only runs of spaces inside a
 * block are normalised.
 */
export function joinBlocks(blocks: string[]): string {
  return blocks
    .map((b) => b.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

/**
 * Expand each parsed clause into the provisions it actually contains.
 *
 * An uploaded contract and one drafted in Scripta must arrive at the same
 * shape, or everything downstream — review, playbooks, comparison, the clause
 * UI — has to learn two document models. They now share `splitClause`: the
 * drafting path applies it on acceptance, and this applies it on parse.
 *
 * Doing it here rather than after the redline is deliberate. Clause rows are
 * only ever written for uploads by way of buildReview, and diffing at the
 * level of a definition is sharper than diffing a whole definitions clause:
 * a changed liability cap shows against 8.1, not against "clause 8".
 */
function expand(clauses: ParsedClause[]): ParsedClause[] {
  const out: ParsedClause[] = [];
  for (const c of clauses) {
    const { lead, parts } = splitClause(c.num, c.body);
    if (!parts.length) {
      out.push({
        ...c,
        ordinal: out.length + 1,
        kind: isDefinition(c.body) ? "definition" : "provision",
        parent: sectionOf(c.num) === c.num.trim().replace(/\.$/, "") ? undefined : sectionOf(c.num),
        refs: referencesIn(c.body),
      });
      continue;
    }
    // The section keeps its heading and its lead-in, and becomes the parent the
    // parts hang from. Its body is not duplicated onto them.
    out.push({
      ...c,
      body: lead,
      ordinal: out.length + 1,
      kind: "section",
      parent: sectionOf(c.num) === c.num.trim().replace(/\.$/, "") ? undefined : sectionOf(c.num),
      refs: referencesIn(lead),
    });
    for (const part of parts)
      out.push({
        num: part.num,
        title: part.title,
        page: c.page,
        body: part.text,
        ordinal: out.length + 1,
        kind: part.kind,
        parent: c.num,
        refs: part.refs,
      });
  }
  return out;
}

/**
 * A document's clauses: the operative clauses, then each schedule as a
 * section with its own paragraphs. Schedules are taken out before the clauses
 * are split, so they can neither run on from the clause before them nor
 * collide with its numbering (see schedules.ts).
 */

/** One line per paragraph. A blank line between each only opens a gap. */
const frontBody = (blocks: Block[]) =>
  blocks
    .map((b) => b.text.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");

/** Centred paragraphs, which is how a title page is set and text cannot say. */
const centredDoc = (body: string): ClauseDoc => ({
  type: "doc",
  content: body.split("\n").map((line) =>
    line
      ? { type: "paragraph", attrs: { textAlign: "center" }, content: [{ type: "text", text: line }] }
      : { type: "paragraph", attrs: { textAlign: "center" } },
  ),
});

/**
 * The front of a contract, as the two different things it actually is.
 *
 * A title page is not a preamble. It carries the name of the agreement, who it
 * was prepared for and by, and the date, set centred in the middle of an
 * otherwise empty sheet. The preamble is operative wording — who is bound,
 * from when, and why — set like any other prose. Holding both in one item
 * meant the title page was shown ranged left with the parties, which is not
 * how any contract sets it.
 *
 * The boundary needs no guessing: the drafter put a page break after the title
 * page, and the reader records it as a page number. Where there is no break —
 * a contract that opens straight onto its parties — there is no title page,
 * and nothing is invented.
 */
function frontClauses(blocks: Block[]): ParsedClause[] {
  if (!blocks.length) return [];
  const firstPage = blocks[0]!.page;
  const title = blocks.filter((b) => b.page === firstPage);
  const rest = blocks.filter((b) => b.page !== firstPage);
  const out: ParsedClause[] = [];
  if (rest.length) {
    const body = frontBody(title);
    if (body)
      out.push({
        num: "Title",
        title: "Title",
        page: `p.${firstPage}`,
        body,
        ordinal: 0,
        kind: "provision",
        refs: [],
        doc: centredDoc(body),
      });
  }
  const preambleBlocks = rest.length ? rest : title;
  const body = frontBody(preambleBlocks);
  if (body)
    out.push({
      num: "Preamble",
      title: "Preamble",
      page: `p.${preambleBlocks[0]!.page}`,
      body,
      ordinal: 0,
      kind: "provision",
      refs: [],
    });
  return out;
}

export function splitClauses(rawBlocks: Block[]): SplitResult {
  const { main, schedules, execution } = splitSchedules(normalizeBlocks(rawBlocks));
  const result = splitMain(main);

  /**
   * The preamble as an item of its own, above clause 1 and numbered as no
   * clause — because it is not one, and numbering it "1" is exactly the fault
   * this fixes. It sits in the atomisation so the firm can read it, assess it
   * and redraft it in its own wording like any other provision.
   */
  const front: ParsedClause[] = frontClauses(result.preamble ?? []);

  if (!schedules.length && !execution.length) {
    if (!front.length) return result;
    return {
      ...result,
      clauses: [...front, ...result.clauses].map((c, i) => ({ ...c, ordinal: i + 1 })),
    };
  }
  const signing: ParsedClause[] = execution.length
    ? [
        {
          num: "Execution",
          title: "Execution",
          page: `p.${execution[0]!.page}`,
          body: joinBlocks(execution.map((b) => b.text)),
          ordinal: 0,
          kind: "provision",
          refs: [],
        },
      ]
    : [];
  const all = [
    ...front,
    ...result.clauses,
    ...signing,
    ...scheduleClauses(schedules),
  ].map((c, i) => ({ ...c, ordinal: i + 1 }));
  return {
    clauses: all,
    structureDetected: result.structureDetected || all.length > 0,
    ...(result.preamble ? { preamble: result.preamble } : {}),
  };
}

function splitMain(blocks: Block[]): SplitResult {
  const clauses: ParsedClause[] = [];
  let current: { num: string; title: string; page: number; body: string[] } | null = null;
  // What sat above the first clause. Collected rather than skipped.
  const leading: Block[] = [];

  const flush = () => {
    if (!current) return;
    clauses.push({
      num: current.num,
      title: current.title,
      page: `p.${current.page}`,
      body: joinBlocks(current.body),
      ordinal: clauses.length + 1,
    });
    current = null;
  };

  for (const b of blocks) {
    const head =
      b.heading || /^(?:clause|article|section)\s|^\d+(?:\.\d+)*[.):]?\s/i.test(b.text)
        ? parseHeading(b.text, b.heading)
        : null;
    if (head) {
      flush();
      current = { num: head.num, title: head.title, page: b.page, body: [] };
    } else if (current) {
      current.body.push(b.text);
    } else {
      leading.push(b);
    }
  }
  flush();

  if (clauses.length >= 2)
    return {
      clauses: expand(clauses),
      structureDetected: true,
      ...(leading.length ? { preamble: leading } : {}),
    };

  // Word auto-numbering is not in the text: number the clause headings ourselves.
  const numbered = numberHeadings(blocks);
  if (numbered.length >= 3) return { clauses: expand(numbered), structureDetected: true };
  if (clauses.length > 0) return { clauses: expand(clauses), structureDetected: true };

  // Fallback 1: one clause per top-level heading, unnumbered.
  const headings = blocks.filter((b) => b.heading);
  if (headings.length > 0) {
    const out: ParsedClause[] = [];
    let cur: { title: string; page: number; body: string[] } | null = null;
    for (const b of blocks) {
      if (b.heading) {
        if (cur)
          out.push({
            num: String(out.length + 1),
            title: cur.title,
            page: `p.${cur.page}`,
            body: joinBlocks(cur.body),
            ordinal: out.length + 1,
          });
        cur = { title: b.text, page: b.page, body: [] };
      } else if (cur) cur.body.push(b.text);
    }
    if (cur)
      out.push({
        num: String(out.length + 1),
        title: cur.title,
        page: `p.${cur.page}`,
        body: joinBlocks(cur.body),
        ordinal: out.length + 1,
      });
    return { clauses: expand(out), structureDetected: false };
  }

  // Fallback 2: no structure at all — one clause holding the whole document.
  const body = blocks
    .map((b) => b.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!body) return { clauses: [], structureDetected: false };
  return {
    clauses: [
      { num: "1", title: "Document text", page: `p.${blocks[0]?.page ?? 1}`, body, ordinal: 1 },
    ],
    structureDetected: false,
  };
}
