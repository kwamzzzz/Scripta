/**
 * Citations against the bibliography.
 *
 * Detects the manuscript's system (author–date, numbered, or notes) and
 * checks only what that system makes checkable: an author–date citation with
 * no entry, a numbered citation past the end of the list, entries never
 * cited, the same work cited with another year or spelling, mixed
 * "(Smith, 2019)"/"(Smith 2019)" forms, and "Ibid." with nothing before it.
 *
 * Never invents an entry or picks a year: every mismatch is a query. If most
 * citations fail to match, the bibliography was probably not read well, and
 * nothing is said rather than a page of false alarms.
 */
import type { DraftFinding, ParsedNode, StyleRule } from "../model";
import { corpusOf, type Prose } from "./corpus";
import { activeRules, detected, draft, ev, finish, groupOccurrences, type Occurrence } from "./finding";
import { editDistance, fold, listing, q, times, uniqueSpan } from "./text";
import type { CheckInput, CheckResult, DetectedRule } from "./types";

/* -------------------------------------------------------------- parsing -- */

const PARTICLE = String.raw`(?:van|von|de|der|den|du|da|di|la|le|del|della|dos|das|ten|ter|al|el|bin|ibn|d')`;
const NAME = String.raw`(?:${PARTICLE}\s+)*\p{Lu}[\p{L}'’\-]+`;
const AUTH = String.raw`${NAME}(?:\s+(?:(?:of|for|on|the)\s+)?${NAME})*`;
const AUTHORS = String.raw`${AUTH}(?:(?:\s*,\s*|\s+(?:and|&)\s+|\s*&\s*)${AUTH})*(?:,?\s+et\s+al\.?)?`;
const YEAR = String.raw`(?:1[5-9]\d{2}|20\d{2})[a-z]?|n\.\s?d\.`;
const YEARS = String.raw`(?:${YEAR})(?:\s*,\s*(?:${YEAR}))*`;
const PAGES = String.raw`(?:\s*[,:]\s*(?:(?:p|pp|para|paras|ch|chap|at|n|fn)\.?\s*)?[\divxlc]+(?:\s*[-–]\s*[\divxlc]+)?(?:\s*,\s*\d+(?:\s*[-–]\s*\d+)?)*)?`;
const LEAD = String.raw`(?:(?:[Ss]ee also|[Ss]ee|[Cc]f\.|e\.g\.,?|[Cc]ompare|[Aa]lso|[Qq]uoted in|[Cc]ited in|[Aa]s cited in)\s+)?`;

const PAREN_PART = new RegExp(String.raw`^(${LEAD})(${AUTHORS})(,?\s+)(${YEARS})(${PAGES})$`, "u");
const NARRATIVE = new RegExp(String.raw`(${AUTHORS})(?:['’]s)?\s+\((${YEARS})${PAGES}\)`, "gu");

/** Words that make a "name" something else: a statute, a month, a report. */
const NOT_AUTHOR = new RegExp(
  String.raw`\b(?:Acts?|Bill|Code|Constitution|Convention|Decree|Directive|Law|Laws|Order|Ordinance|Protocol|Regulations?|Rules|Treaty|Charter|Agreement|Declaration|Amendment|Article|Section|Chapter|Part|Schedule|Table|Figure|Appendix|Vision|Agenda|Plan|Strategy|Policy|Budget|Census|Survey|Report|Index|FY|Fiscal|Year|Edition|Vol|Volume|Q[1-4]|January|February|March|April|May|June|July|August|September|October|November|December|Spring|Summer|Autumn|Winter|Fall)\b`,
  "u",
);
/** Capitalised words that open a sentence before a narrative citation: "In Smith (2019)". */
const LEADING = new Set(
  (
    "In On At As By For From With According To The A An See While Whereas Although Though Following Unlike Like Both But And " +
    "However Yet So Thus Hence Also Similarly Indeed Moreover Furthermore Here There This That These Those When Where If Since " +
    "After Before Recently Notably Earlier Later Cf Per Via Among Between Then Only Even Nonetheless Nevertheless Instead " +
    "Crucially Importantly Specifically Accordingly Consequently Conversely Likewise Nonetheless Of Scholars Critics Writers"
  ).split(" "),
);
const NOT_START = new Set(
  "In On By Since From Until Before After During About Circa Around Approximately The A An See Year Summer Spring Autumn Winter Fall Accessed".split(
    " ",
  ),
);

export type Citation = {
  node: ParsedNode;
  s: number;
  e: number;
  /** The citation as written (one author–year part). */
  text: string;
  authors: string;
  first: string;
  years: string[];
  kind: "paren" | "narrative";
  /** Parenthetical only: a comma between author and year. */
  comma: boolean;
  /** The groups of a parenthetical part, to rebuild it with or without the comma. */
  parts?: { lead: string; authors: string; sep: string; years: string; pages: string };
};

function firstAuthor(authors: string): string {
  return authors
    .replace(/,?\s+et\s+al\.?$/, "")
    .split(/\s*,\s*|\s+(?:and|&)\s+|\s*&\s*/)[0]!
    .trim();
}

function clean(authors: string): string | null {
  const words = authors.split(/\s+/);
  while (words.length && LEADING.has(words[0]!)) words.shift();
  const a = words.join(" ");
  if (!a || NOT_AUTHOR.test(a)) return null;
  if (NOT_START.has(words[0]!)) return null;
  return a;
}

const yearsOf = (s: string) => s.split(/\s*,\s*/).map((y) => y.replace(/\s/g, "").toLowerCase());

export function findCitations(prose: Prose[]): Citation[] {
  const out: Citation[] = [];
  for (const p of prose) {
    const raw = p.raw;
    for (const m of raw.matchAll(/\(([^()]{3,400})\)/g)) {
      let offset = (m.index ?? 0) + 1;
      for (const part of m[1]!.split(";")) {
        const lead = part.length - part.trimStart().length;
        const trimmed = part.trim();
        const pm = PAREN_PART.exec(trimmed);
        const s = offset + lead;
        offset += part.length + 1;
        if (!pm) continue;
        const authors = clean(pm[2]!);
        if (!authors || authors !== pm[2]) continue;
        out.push({
          node: p.node,
          s,
          e: s + trimmed.length,
          text: trimmed,
          authors,
          first: firstAuthor(authors),
          years: yearsOf(pm[4]!),
          kind: "paren",
          comma: pm[3]!.includes(","),
          parts: { lead: pm[1]!, authors: pm[2]!, sep: pm[3]!, years: pm[4]!, pages: pm[5]! },
        });
      }
    }
    for (const m of raw.matchAll(NARRATIVE)) {
      const authors = clean(m[1]!);
      if (!authors) continue;
      const start = (m.index ?? 0) + m[1]!.length - authors.length;
      const e = (m.index ?? 0) + m[0].length;
      out.push({
        node: p.node,
        s: start,
        e,
        text: raw.slice(start, e),
        authors,
        first: firstAuthor(authors),
        years: yearsOf(m[2]!),
        kind: "narrative",
        comma: false,
      });
    }
  }
  return out;
}

type Entry = {
  node: ParsedNode;
  text: string;
  /** Folded first author ("van der berg", "world bank"). */
  first: string;
  years: Set<string>;
  number: number | null;
  /** Folded words, to see whether a name appears anywhere in the entry. */
  words: Set<string>;
};

function parseEntry(node: ParsedNode): Entry {
  const lead = /^\s*\[(\d+)\]\s*|^\s*(\d+)[.)]\s+/.exec(node.text);
  const number = /^\[?\d+[\].)]?$/.test(node.number.trim())
    ? Number(node.number.replace(/\D/g, ""))
    : lead
      ? Number(lead[1] ?? lead[2])
      : null;
  const text = lead ? node.text.slice(lead[0].length) : node.text;
  const first = fold(/^[^,(.]+/.exec(text.trim())?.[0] ?? "").trim();
  const years = new Set<string>();
  for (const m of text.matchAll(/\b((?:1[5-9]|20)\d{2})([a-z])?\b/g)) {
    years.add(m[1]!);
    if (m[2]) years.add(m[1]! + m[2]);
  }
  if (/\bn\.\s?d\./i.test(text)) years.add("n.d.");
  return { node, text, first, years, number, words: new Set(fold(text).match(/\p{L}+/gu) ?? []) };
}

const baseYear = (y: string) => y.replace(/[a-z]$/, "");

function authorMatches(e: Entry, first: string): boolean {
  const f = fold(first);
  const last = f.split(/\s+/).pop()!;
  return (
    e.first === f ||
    e.first === last ||
    e.first.startsWith(`${f} `) ||
    e.first.endsWith(` ${last}`) ||
    e.first.replace(/'/g, "") === f.replace(/'/g, "")
  );
}

function yearMatches(e: Entry, year: string): boolean {
  if (e.years.has(year)) return true;
  const base = baseYear(year);
  if (!e.years.has(base)) return false;
  // "2019a" cited, entry just "2019": fine unless the entry names another suffix.
  return year === base || ![...e.years].some((y) => y.startsWith(base) && y !== base);
}

/* --------------------------------------------------------------- check -- */

type Style = "author-date" | "numeric" | "notes" | "unknown";

export function checkCitations(input: CheckInput): CheckResult {
  const corpus = corpusOf(input.nodes);
  const prose = corpus.prose.filter((p) => p.node.kind !== "front");
  const bibNodes = input.nodes.filter((n) => n.kind === "bibliography_entry" && n.text.trim());
  const entries = bibNodes.map((n) => parseEntry(n));
  const cites = findCitations(prose);
  const numeric = numericCitations(prose);
  const notes = input.nodes.filter((n) => n.kind === "footnote" || n.kind === "endnote");

  const style: Style =
    numeric.length >= 3 && numeric.length > cites.length
      ? "numeric"
      : cites.length >= 3
        ? "author-date"
        : notes.length >= 5
          ? "notes"
          : "unknown";

  const drafts: DraftFinding[] = [];
  const detectedRules: DetectedRule[] = [];

  if (style === "author-date" && entries.length >= 3) authorDate(input, cites, entries, drafts, detectedRules);
  if (style === "numeric" && entries.length >= 3) numbered(numeric, entries, drafts);
  if (style === "notes" && entries.length >= 3) notesUncited(prose, entries, drafts);
  if (style === "numeric")
    detectedRules.push(detected("citation", "[12]", [], "Numbered citations in square brackets, keyed to the reference list."));
  if (style === "notes")
    detectedRules.push(detected("citation", "Footnote citations", [], "Sources are cited in footnotes."));
  ibid(input.nodes, corpus.chapterOf, drafts);

  return { findings: finish(input, drafts), detectedRules };
}

function authorDate(
  input: CheckInput,
  cites: Citation[],
  entries: Entry[],
  drafts: DraftFinding[],
  detectedRules: DetectedRule[],
) {
  type Result = { kind: "ok" } | { kind: "year"; near: Entry[] } | { kind: "spelling"; near: Entry } | { kind: "missing" };
  const cited = new Set<Entry>();
  const judge = (first: string, year: string): Result => {
    const byAuthor = entries.filter((e) => authorMatches(e, first));
    const hit = byAuthor.filter((e) => yearMatches(e, year));
    if (hit.length) {
      hit.forEach((e) => cited.add(e));
      return { kind: "ok" };
    }
    if (byAuthor.length) return { kind: "year", near: byAuthor };
    const f = fold(first);
    const similar = entries.find((e) => {
      const ef = e.first;
      const limit = f.length >= 8 ? 2 : f.length >= 4 ? 1 : 0;
      return limit > 0 && ef !== f && editDistance(ef, f, limit) <= limit && yearMatches(e, year);
    });
    if (similar) return { kind: "spelling", near: similar };
    // The name is in the bibliography somewhere (a second author, a title): not ours to call missing.
    if (entries.some((e) => e.words.has(f.split(/\s+/).pop()!))) return { kind: "ok" };
    return { kind: "missing" };
  };

  type Problem = { first: string; year: string; result: Exclude<Result, { kind: "ok" }>; list: Citation[] };
  const problems = new Map<string, Problem>();
  let judged = 0;
  let matched = 0;
  for (const c of cites) {
    for (const year of c.years) {
      judged++;
      const r = judge(c.first, year);
      if (r.kind === "ok") {
        matched++;
        continue;
      }
      const k = `${fold(c.first)}\u0000${year}`;
      const p = problems.get(k) ?? { first: c.first, year, result: r, list: [] };
      p.list.push(c);
      problems.set(k, p);
    }
  }

  // Most citations unmatched: the bibliography was not read well. Say nothing.
  const trustworthy = judged > 0 && matched / judged >= 0.5;
  if (trustworthy)
    for (const p of problems.values()) {
      const who = `${p.first} ${p.year}`;
      const evidence = p.list.map((c) => ev(c.node.key, c.text));
      if (p.result.kind === "missing")
        drafts.push(
          draft({
            pass: "citations",
            category: "citation",
            severity: "material",
            action: "query",
            title: `${q(who)} is cited but not in the bibliography`,
            body: `The text cites ${p.first} (${p.year}) ${times(p.list.length)}, but the bibliography has no entry for it. Please add the entry or correct the citation.`,
            evidence,
            fp: ["citations.missing", fold(p.first), p.year],
          }),
        );
      else if (p.result.kind === "year") {
        const years = [...new Set(p.result.near.flatMap((e) => [...e.years].filter((y) => /^\d{4}[a-z]?$/.test(y))))];
        drafts.push(
          draft({
            pass: "citations",
            category: "citation",
            severity: "minor",
            action: "query",
            title: `${q(who)} is cited but the bibliography has ${p.first} ${listing(years.slice(0, 3))}`,
            body: `The text cites ${p.first} (${p.year}) ${times(p.list.length)}, but the bibliography lists ${p.first} only for ${listing(years.slice(0, 3))}. Either the year in the text is wrong or an entry is missing. Please check which.`,
            evidence: [...evidence, ...p.result.near.slice(0, 2).map((e) => ev(e.node.key, e.text.slice(0, 120)))],
            fp: ["citations.year", fold(p.first), p.year],
          }),
        );
      } else if (p.result.kind === "spelling") {
        const entryName = /^[^,(.]+/.exec(p.result.near.text.trim())?.[0]?.trim() ?? p.result.near.first;
        drafts.push(
          draft({
            pass: "citations",
            category: "citation",
            severity: "minor",
            action: "query",
            title: `${q(who)} may be ${q(`${entryName} ${p.year}`)}`,
            body: `The text cites ${p.first} (${p.year}), but the bibliography has ${entryName} (${p.year}) and no ${p.first}. If they are the same work, please correct the spelling in one place or the other.`,
            evidence: [...evidence, ev(p.result.near.node.key, p.result.near.text.slice(0, 120))],
            fp: ["citations.spelling", fold(p.first), fold(entryName), p.year],
          }),
        );
      }
    }

  // Entries never cited.
  if (trustworthy) {
    const texts = corpusOf(input.nodes).prose.map((p) => fold(p.raw));
    const uncited = entries.filter((e) => {
      if (cited.has(e) || !e.first) return false;
      const name = e.first.split(/\s+/).pop()!;
      // Cited some other way ("as Smith argued in 2019"): the name near one of its years.
      const all = [...e.years].filter((y) => y !== "n.d.");
      const suffixed = all.filter((y) => /[a-z]$/.test(y));
      const years = suffixed.length ? suffixed : all;
      return !texts.some((t) => {
        let i = t.indexOf(name);
        while (i !== -1) {
          const window = t.slice(Math.max(0, i - 80), i + name.length + 80);
          if (years.some((y) => window.includes(y))) return true;
          i = t.indexOf(name, i + 1);
        }
        return false;
      });
    });
    if (uncited.length && uncited.length <= entries.length * 0.6) uncitedFindings(uncited, drafts);
  }

  // Mixed "(Smith, 2019)" and "(Smith 2019)".
  const single = cites.filter((c) => c.kind === "paren" && c.parts);
  const withComma = single.filter((c) => c.comma);
  const without = single.filter((c) => !c.comma);
  const rule = activeRules(input.rules, ["citation"]).find((r) => commaRule(r) !== null);
  if (rule) {
    const want = commaRule(rule)!;
    const occs: Occurrence[] = [];
    for (const c of want ? without : withComma) {
      const pp = c.parts!;
      const fixed = `${pp.lead}${pp.authors}${want ? ", " : " "}${pp.years}${pp.pages}`;
      const raw = c.node.text;
      const [a, b] = uniqueSpan(raw, c.s, c.e);
      const original = raw.slice(a, b);
      const replacement = original.slice(0, c.s - a) + fixed + original.slice(c.e - a);
      occs.push({ nodeKey: c.node.key, original, replacement, quote: original });
    }
    for (const g of groupOccurrences(occs).values())
      drafts.push(
        draft({
          pass: "citations",
          category: "citation",
          severity: "minor",
          action: "correction",
          title: `${q(g[0]!.original)} should read ${q(g[0]!.replacement)}`,
          body: `The style sheet writes author–date citations ${want ? "with" : "without"} a comma between author and year (${q(rule.preferred.trim())}).`,
          original: g[0]!.original,
          replacement: g[0]!.replacement,
          evidence: g.map((o) => ev(o.nodeKey, o.quote)),
          fp: ["citations.format.rule", g[0]!.original],
          ruleId: rule.id,
        }),
      );
  } else if (withComma.length && without.length && Math.min(withComma.length, without.length) >= 2 && single.length >= 5) {
    const commaMajor = withComma.length > without.length;
    const tie = withComma.length === without.length;
    const [minor, major] = commaMajor ? [without, withComma] : [withComma, without];
    drafts.push(
      draft({
        pass: "citations",
        category: "citation",
        severity: "minor",
        action: "query",
        title: "Citations mix ‘(Smith, 2019)’ and ‘(Smith 2019)’",
        body: `${withComma.length} citations put a comma between author and year and ${without.length} do not. Please confirm which form you want.`,
        evidence: [
          ...minor.map((c) => ev(c.node.key, c.text, tie ? undefined : "less common form")),
          ...major.slice(0, 2).map((c) => ev(c.node.key, c.text, tie ? undefined : "usual form")),
        ],
        fp: ["citations.format"],
      }),
    );
    if (!tie)
      detectedRules.push(
        detected(
          "citation",
          commaMajor ? "(Smith, 2019)" : "(Smith 2019)",
          [commaMajor ? "(Smith 2019)" : "(Smith, 2019)"],
          `Author–date citations ${commaMajor ? "with" : "without"} a comma between author and year.`,
        ),
      );
  } else if (single.length >= 5) {
    const commaMajor = withComma.length > without.length;
    detectedRules.push(
      detected(
        "citation",
        commaMajor ? "(Smith, 2019)" : "(Smith 2019)",
        [],
        `Author–date citations ${commaMajor ? "with" : "without"} a comma between author and year.`,
      ),
    );
  }
}

/** true: comma wanted; false: no comma; null: not a rule about that. */
function commaRule(rule: StyleRule): boolean | null {
  const p = rule.preferred.trim();
  if (/\p{L},\s*\d{4}/u.test(p)) return true;
  if (/\p{L}\s+\d{4}/u.test(p)) return false;
  return null;
}

function uncitedFindings(uncited: Entry[], drafts: DraftFinding[]) {
  const short = (e: Entry) => e.text.trim().slice(0, 70).trim();
  if (uncited.length > 5) {
    drafts.push(
      draft({
        pass: "citations",
        category: "citation",
        severity: "minor",
        action: "query",
        title: `${uncited.length} bibliography entries are never cited`,
        body: `These entries are not cited anywhere in the text or the notes. Please cite them where they are used, or remove them if the bibliography should list only works cited.`,
        evidence: uncited.map((e) => ev(e.node.key, short(e))),
        fp: ["citations.uncited", "many"],
      }),
    );
    return;
  }
  for (const e of uncited)
    drafts.push(
      draft({
        pass: "citations",
        category: "citation",
        severity: "minor",
        action: "query",
        title: `Bibliography entry never cited: ${short(e).slice(0, 50)}`,
        body: `This entry is not cited anywhere in the text or the notes. Please cite it where it is used, or remove it if the bibliography should list only works cited.`,
        evidence: [ev(e.node.key, short(e))],
        fp: ["citations.uncited", e.text.trim().slice(0, 120)],
      }),
    );
}

/* ------------------------------------------------------------- numbered -- */

type NumCite = { node: ParsedNode; text: string; numbers: number[] };

function numericCitations(prose: Prose[]): NumCite[] {
  const out: NumCite[] = [];
  for (const p of prose)
    for (const m of p.raw.matchAll(/(?<![\p{L}\d])\[(\d{1,3}(?:\s*[-–,]\s*\d{1,3})*)\]/gu)) {
      const numbers: number[] = [];
      for (const part of m[1]!.split(/\s*,\s*/)) {
        const r = /^(\d+)\s*[-–]\s*(\d+)$/.exec(part);
        if (r) {
          const a = Number(r[1]);
          const b = Number(r[2]);
          if (b >= a && b - a < 100) for (let k = a; k <= b; k++) numbers.push(k);
        } else numbers.push(Number(part));
      }
      out.push({ node: p.node, text: m[0], numbers });
    }
  return out;
}

function numbered(cites: NumCite[], entries: Entry[], drafts: DraftFinding[]) {
  const numbers = new Set(entries.map((e, i) => e.number ?? i + 1));
  const missing = new Map<number, NumCite[]>();
  const used = new Set<number>();
  for (const c of cites)
    for (const n of c.numbers) {
      used.add(n);
      if (!numbers.has(n)) missing.set(n, [...(missing.get(n) ?? []), c]);
    }
  for (const [n, list] of missing)
    drafts.push(
      draft({
        pass: "citations",
        category: "citation",
        severity: "material",
        action: "query",
        title: `Reference [${n}] is cited but the list has no entry ${n}`,
        body: `The text cites [${n}] ${times(list.length)}, but the reference list has no entry numbered ${n}. Please add the entry or correct the citation.`,
        evidence: list.map((c) => ev(c.node.key, c.text)),
        fp: ["citations.numeric.missing", String(n)],
      }),
    );
  const uncited = entries.filter((e, i) => !used.has(e.number ?? i + 1));
  if (uncited.length && uncited.length <= entries.length * 0.6) uncitedFindings(uncited, drafts);
}

/* ---------------------------------------------------------------- notes -- */

function notesUncited(prose: Prose[], entries: Entry[], drafts: DraftFinding[]) {
  const words = new Set<string>();
  for (const p of prose) for (const w of fold(p.raw).match(/\p{L}+/gu) ?? []) words.add(w);
  const uncited = entries.filter((e) => {
    const name = e.first.split(/\s+/).pop();
    return name && name.length >= 3 && !words.has(name);
  });
  if (uncited.length && uncited.length <= entries.length * 0.6) uncitedFindings(uncited, drafts);
}

function ibid(nodes: ParsedNode[], chapterOf: (key: string) => string | null, drafts: DraftFinding[]) {
  for (const kind of ["footnote", "endnote"] as const) {
    const notes = nodes.filter((n) => n.kind === kind);
    notes.forEach((n, i) => {
      const m = /^\s*(ibid(?:em)?\.?)/i.exec(n.text);
      if (!m) return;
      const prev = notes[i - 1];
      if (prev && chapterOf(prev.key) === chapterOf(n.key)) return;
      drafts.push(
        draft({
          pass: "citations",
          category: "citation",
          severity: "minor",
          action: "query",
          title: prev ? "‘Ibid.’ refers back across a chapter break" : "‘Ibid.’ has no earlier note to refer to",
          body: prev
            ? `This ${kind} opens with ${q(m[1]!)}, but the ${kind} before it is in another chapter, so a reader cannot tell which source is meant. Please give the source in full.`
            : `This ${kind} opens with ${q(m[1]!)}, but it is the first ${kind}, so there is no source for it to repeat. Please give the source in full.`,
          evidence: [ev(n.key, n.text.trim().slice(0, 80)), ...(prev ? [ev(prev.key, prev.text.trim().slice(0, 80))] : [])],
          fp: ["citations.ibid", n.text.trim().slice(0, 80)],
        }),
      );
    });
  }
}
