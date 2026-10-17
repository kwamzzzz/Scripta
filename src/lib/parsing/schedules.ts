/**
 * Schedules, annexes, appendices and exhibits: part of the contract, not
 * something after it.
 *
 * Before this, the clause splitter met "SCHEDULE 1 – FEES" in one of two ways.
 * Where the document numbered its clauses in the text, the heading was not a
 * clause heading, so the schedule and its fee table were glued onto the end
 * of the clause before it (the liability clause, in the test contract), and
 * its own "1." and "2." paragraphs came back as second clauses 1 and 2. Where
 * Word numbered the clauses, the splitter stopped at the schedule and nothing
 * after it was read at all.
 *
 * So schedules are taken out first, each as a section of its own:
 *   Schedule 1          its heading, and whatever comes before its first
 *                       numbered paragraph (often the table itself)
 *   Schedule 1.1, 1.2   its paragraphs, by the numbers the drafter gave them
 * and the operative clauses are split from what remains, exactly as before.
 * The numbering cannot collide with the main clauses, and a reference such as
 * "the Fees set out in Schedule 1" now has something to resolve to.
 */
import type { Block } from "./blocks";
import type { ParsedClause } from "./clauses";
import { isDefinition, referencesIn } from "@/lib/subclauses";

export type ScheduleLabel = "Schedule" | "Annex" | "Appendix" | "Exhibit" | "Attachment";

export type ScheduleSection = {
  label: ScheduleLabel;
  /** As the document numbers it: "1", "A", "II"; empty for a lone "SCHEDULE". */
  id: string;
  title: string;
  page: number;
  blocks: Block[];
};

const HEAD =
  /^(schedules?|annex(?:ure)?|appendix|exhibit|attachment)(?:\s+(no\.?\s*)?([0-9]{1,3}|[A-Z]|[IVXLC]{1,6}))?\b\s*[-–—:.)]*\s*(.*)$/i;

/** "Schedule 1 ….. 14" in a table of contents is not the schedule itself. */
const TOC_LINE = /(\.{3,}|…|\t)\s*\d+\s*$/;

const EXECUTION = /^(in witness|executed|signed\b|as witness|execution\b|signature page)/i;

/** "PART A", "Part 2 – Service levels": a heading inside a schedule. */
const PART = /^part\s+([0-9]{1,2}|[A-Z])\b\s*[-–—:.]*\s*(.*)$/i;

/** "1. Fees are exclusive of VAT." — a paragraph that carries its own number. */
const OWN_NUMBER = /^(\d{1,2}(?:\.\d{1,2})*)[.)]\s+(\S[\s\S]*)$/;

export function labelOf(word: string): ScheduleLabel {
  const w = word.toLowerCase();
  if (w.startsWith("schedule")) return "Schedule";
  if (w.startsWith("annex")) return "Annex";
  if (w.startsWith("appendix")) return "Appendix";
  if (w.startsWith("exhibit")) return "Exhibit";
  return "Attachment";
}

/** The clause number a schedule is filed under: "Schedule 1", "Annex A". */
export const scheduleNum = (label: ScheduleLabel, id: string) => (id ? `${label} ${id}` : label);

/**
 * Whether a block opens a schedule. A styled heading, a line in capitals, or
 * a short line that does not read as a sentence ("Schedule 1 sets out the
 * Fees." is a sentence about a schedule, not the start of one).
 */
export function scheduleHeading(
  b: Block,
): { label: ScheduleLabel; id: string; title: string } | null {
  if (b.table) return null;
  const text = b.text.trim();
  if (text.length > 140 || TOC_LINE.test(text)) return null;
  const m = HEAD.exec(text);
  if (!m) return null;
  const capitals = /^[A-Z]{4,}/.test(text);
  const words = text.split(/\s+/).length;
  const sentence = /[.;,]$/.test(text) && words > 4;
  if (!b.heading && !capitals && (sentence || words > 12)) return null;
  // "Schedule of Condition" and the like: a word, not a number, follows.
  if (!m[3] && m[4] && !capitals && !b.heading) return null;
  return { label: labelOf(m[1]!), id: (m[3] ?? "").toUpperCase(), title: (m[4] ?? "").trim() };
}

/**
 * Take the schedules out of a document, leaving the operative text, and the
 * execution block (the signing lines and their table) apart from both: it
 * was being read as the end of the last clause, so a governing-law clause
 * arrived carrying everyone's signature lines.
 */
export function splitSchedules(blocks: Block[]): {
  main: Block[];
  schedules: ScheduleSection[];
  execution: Block[];
} {
  const main: Block[] = [];
  const schedules: ScheduleSection[] = [];
  const execution: Block[] = [];
  let cur: ScheduleSection | null = null;
  let signing = false;
  for (let i = 0; i < blocks.length; i += 1) {
    const b = blocks[i]!;
    const head = scheduleHeading(b);
    if (head) {
      cur = { ...head, page: b.page, blocks: [] };
      // "SCHEDULE 1" with the title on the next line, as Word templates do.
      const next = blocks[i + 1];
      const nextText = next?.text.trim() ?? "";
      const titleLike =
        next?.heading ||
        /^[A-Z][A-Z0-9 ,&\-/()]{2,60}$/.test(nextText) ||
        (nextText.split(/\s+/).length <= 8 &&
          !/[.;:,]$/.test(nextText) &&
          !OWN_NUMBER.test(nextText));
      if (!cur.title && next && !next.table && nextText && titleLike) {
        cur.title = next.text.trim();
        i += 1;
      }
      schedules.push(cur);
      signing = false;
      continue;
    }
    // The execution block, wherever it sits: after the clauses or after a
    // schedule. Once it starts, what follows is signing until a schedule.
    if (!b.table && !b.heading && EXECUTION.test(b.text.trim()) && (cur || main.length)) {
      cur = null;
      signing = true;
    }
    if (signing) execution.push(b);
    else if (cur) cur.blocks.push(b);
    else main.push(b);
  }
  return { main, schedules, execution };
}

const SMALL = new Set(["of", "and", "the", "to", "for", "in", "on", "a", "an", "or", "with", "by", "at"]);
/** "SCOPE OF SERVICES" → "Scope of Services"; a title already in mixed case is kept. */
const titleCase = (s: string) =>
  /[a-z]/.test(s)
    ? s
    : s
        .toLowerCase()
        .split(/(\s+)/)
        .map((w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
        .join("");

const snippet = (t: string) => {
  const flat = t.replace(/\s+/g, " ").trim();
  const words = flat.split(" ");
  return words.length > 8 ? `${words.slice(0, 8).join(" ")}…` : flat.replace(/[.,;:]$/, "");
};

const joinParas = (parts: string[]) =>
  parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join("\n\n");

/** Each schedule as clauses: the schedule itself, then its numbered paragraphs. */
export function scheduleClauses(schedules: ScheduleSection[]): ParsedClause[] {
  const out: ParsedClause[] = [];
  const used = new Set<string>();
  for (const s of schedules) {
    let num = scheduleNum(s.label, s.id);
    // Two schedules numbered the same (a drafting slip) must still be two.
    for (let n = 2; used.has(num); n += 1) num = `${scheduleNum(s.label, s.id)} (${n})`;
    used.add(num);
    const page = `p.${s.page}`;
    const lead: string[] = [];
    const parts: { num: string; title: string; body: string[]; parent: string }[] = [];
    const taken = new Set<string>();
    /** A number no other part of this schedule has, the drafter's where possible. */
    const claim = (wanted: string) => {
      let candidate = wanted;
      for (let n = 2; taken.has(candidate); n += 1) candidate = `${wanted} (${n})`;
      taken.add(candidate);
      return candidate;
    };
    let seq = 0;
    /** The Part (or sub-heading) now open: numbered paragraphs belong to it. */
    let container: string | null = null;
    for (const b of s.blocks) {
      const text = b.text.trim();
      if (!text) continue;
      if (!b.table) {
        const own = OWN_NUMBER.exec(text);
        const part = PART.exec(text);
        if (own) {
          // Parts restart their numbering, so a paragraph is numbered within
          // its Part: Part A's "1." is Schedule 1.A.1, Part B's is 1.B.1.
          const base = container ?? num;
          const partNum = claim(`${base}.${own[1]}`);
          const rest = own[2]!.trim();
          // "1. Service levels" is a heading; "1. Fees are exclusive of VAT." is the paragraph.
          const heading = rest.split(/\s+/).length <= 8 && !/[.;:,]$/.test(rest);
          parts.push({
            num: partNum,
            title: heading ? rest : snippet(rest),
            body: heading ? [] : [rest],
            parent: base,
          });
          continue;
        }
        if (part) {
          const id = part[1]!.toUpperCase();
          container = claim(`${num}.${id}`);
          parts.push({
            num: container,
            title: `Part ${id}${part[2] ? ` – ${part[2]}` : ""}`,
            body: [],
            parent: num,
          });
          continue;
        }
        if (b.heading && text.length <= 100) {
          do seq += 1;
          while (taken.has(`${num}.${seq}`));
          container = claim(`${num}.${seq}`);
          parts.push({ num: container, title: text, body: [], parent: num });
          continue;
        }
      }
      if (parts.length) parts[parts.length - 1]!.body.push(text);
      else lead.push(text);
    }
    const leadText = joinParas(lead);
    out.push({
      num,
      title: titleCase(s.title) || num,
      page,
      body: leadText,
      ordinal: 0,
      kind: parts.length ? "section" : isDefinition(leadText) ? "definition" : "provision",
      refs: referencesIn(`${s.title}\n${leadText}`),
    });
    for (const p of parts) {
      const body = joinParas(p.body);
      out.push({
        num: p.num,
        title: p.title,
        page,
        body,
        ordinal: 0,
        kind: parts.some((q) => q.parent === p.num)
          ? "section"
          : isDefinition(body)
            ? "definition"
            : "provision",
        parent: p.parent,
        refs: referencesIn(body),
      });
    }
  }
  return out;
}
