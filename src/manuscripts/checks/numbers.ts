/**
 * Number style in running prose: "per cent" / "percent" / "%", and numbers
 * under ten as words or figures. Tables and captions are left alone (figures
 * and % are normal there), and so are quotations.
 */
import type { DraftFinding, StyleRule } from "../model";
import { corpusOf, type Prose } from "./corpus";
import { activeRules, detected, draft, ev, finish, groupOccurrences, type Occurrence } from "./finding";
import { listing, q, sentenceAt, times, WORD_NUMBERS } from "./text";
import type { CheckInput, CheckResult, DetectedRule } from "./types";

type Hit = { p: Prose; s: number; e: number; text: string };

/* ------------------------------------------------------------- percent -- */

type PercentStyle = "per cent" | "percent" | "%";
const PERCENT_STYLES: PercentStyle[] = ["per cent", "percent", "%"];

function percentStyleOf(rule: StyleRule): PercentStyle | null {
  const t = `${rule.preferred} ${rule.note}`.toLowerCase();
  if (!/per ?cent|%/.test(t)) return null;
  const p = rule.preferred.toLowerCase();
  if (p.includes("%")) return "%";
  if (/per cent/.test(p)) return "per cent";
  if (/percent/.test(p)) return "percent";
  return null;
}

function percentHits(prose: Prose[]): Map<PercentStyle, Hit[]> {
  const out = new Map<PercentStyle, Hit[]>(PERCENT_STYLES.map((s) => [s, []]));
  for (const p of prose) {
    for (const m of p.masked.matchAll(/(\d(?:[\d,.]*\d)?)\s?%/g))
      out.get("%")!.push({ p, s: m.index ?? 0, e: (m.index ?? 0) + m[0].length, text: m[0] });
    for (const m of p.masked.matchAll(/\bper[\s\u00a0]cent\b/gi))
      out.get("per cent")!.push({ p, s: m.index ?? 0, e: (m.index ?? 0) + m[0].length, text: m[0] });
    for (const m of p.masked.matchAll(/\bpercent\b/gi))
      out.get("percent")!.push({ p, s: m.index ?? 0, e: (m.index ?? 0) + m[0].length, text: m[0] });
  }
  return out;
}

function convertPercent(h: Hit, to: PercentStyle): { original: string; replacement: string } | null {
  if (h.text.includes("%")) {
    const num = h.text.replace(/\s?%$/, "");
    return { original: h.text, replacement: `${num} ${to}` };
  }
  if (to === "%") {
    const from = Math.max(0, h.s - 20);
    const m = /(\d(?:[\d,.]*\d)?)\s+$/.exec(h.p.raw.slice(from, h.s));
    if (!m) return null; // "a small percent", "per cent of what": no number to join
    return { original: h.p.raw.slice(from + m.index, h.e), replacement: `${m[1]}%` };
  }
  return { original: h.text, replacement: h.text[0] === "P" ? to[0]!.toUpperCase() + to.slice(1) : to };
}

/* ---------------------------------------------------- numbers under ten -- */

const REF_BEFORE =
  /\b(?:table|figure|fig|chapter|section|article|part|page|p|pp|no|para|paragraph|appendix|schedule|rule|regulation|clause|step|phase|stage|level|grade|year|tier|round|wave|question|hypothesis|model|case|box|equation|annex|item|book|volume|vol|principle|objective|group|version|option|scenario|class|category|type|rq|h|sub-?section|of|between|from|by|at|over|under|about|approximately|around|nearly|almost)\.?\s+$/i;
/** A range or pair of figures ("3 and 5", "3 to 5"): figures are right there. */
const RANGE_BEFORE = /\d\s*(?:and|or|to|–|-)\s*$/;
const RANGE_AFTER = /^\s*(?:and|or|to|–|-)\s*\d/;
const UNIT_AFTER =
  /^\s*(?:%|per\b|percent|km|kg|g\b|mg|ml|l\b|m\b|cm|mm|ha|hours?|hrs?|minutes?|mins?|seconds?|secs?|days?|weeks?|months?|years?|a\.m|p\.m|am\b|pm\b|million|billion|trillion|bn|m\b|points?|pp\b|times|x\b)/i;

type SmallStyle = "words" | "figures";

function smallStyleOf(rule: StyleRule): SmallStyle | null {
  const t = `${rule.preferred} ${rule.note}`.toLowerCase();
  if (!/(under|below|less than)\s+(ten|10)|one to nine|1\s*(?:-|–|to)\s*9|zero to nine/.test(t)) return null;
  if (/\bwords?\b|spelt|spelled|written out/.test(t)) return "words";
  if (/figures|digits|numerals/.test(t)) return "figures";
  return null;
}

function smallHits(prose: Prose[]): Map<SmallStyle, Hit[]> {
  const out = new Map<SmallStyle, Hit[]>([
    ["words", []],
    ["figures", []],
  ]);
  const wordRe = new RegExp(`\\b(${WORD_NUMBERS.slice(2, 10).join("|")})\\s+(\\p{Ll}+s)\\b`, "gu");
  for (const p of prose) {
    if (p.node.kind === "caption" || p.node.kind === "front") continue;
    const text = p.masked;
    for (const m of text.matchAll(/(?<![\d.,:/\-–])\b([2-9])\s+(\p{Ll}+s)\b/gu)) {
      const s = m.index ?? 0;
      const before = text.slice(Math.max(0, s - 25), s);
      if (REF_BEFORE.test(before) || RANGE_BEFORE.test(before) || RANGE_AFTER.test(text.slice(s + 1, s + 12)))
        continue;
      if (UNIT_AFTER.test(text.slice(s + 1))) continue;
      const sent = sentenceAt(text, s);
      if (/\b\d{2,}\b/.test(text.slice(sent.s, sent.e))) continue; // "between 5 and 15 years": figures are right
      out.get("figures")!.push({ p, s, e: s + m[0].length, text: m[0] });
    }
    for (const m of text.matchAll(wordRe)) {
      const s = m.index ?? 0;
      if (s > 0 && /[\p{L}-]/u.test(text[s - 1]!)) continue;
      if (UNIT_AFTER.test(text.slice(s + m[1]!.length))) continue;
      out.get("words")!.push({ p, s, e: s + m[0].length, text: m[0] });
    }
  }
  return out;
}

/* --------------------------------------------------------------- check -- */

export function checkNumbers(input: CheckInput): CheckResult {
  const corpus = corpusOf(input.nodes);
  const prose = corpus.prose.filter((p) => p.english && p.node.kind !== "caption");
  const rules = activeRules(input.rules, ["numbers"]);
  const drafts: DraftFinding[] = [];
  const detectedRules: DetectedRule[] = [];

  // Percent.
  const percent = percentHits(prose);
  const pRule = rules.find((r) => percentStyleOf(r));
  const used = PERCENT_STYLES.filter((s) => percent.get(s)!.length);
  if (pRule) {
    const want = percentStyleOf(pRule)!;
    const occs: Occurrence[] = [];
    for (const s of used) {
      if (s === want) continue;
      for (const h of percent.get(s)!) {
        const c = convertPercent(h, want);
        if (c) occs.push({ nodeKey: h.p.node.key, ...c, quote: c.original });
      }
    }
    for (const g of groupOccurrences(occs).values())
      drafts.push(
        draft({
          pass: "style",
          category: "style",
          severity: "minor",
          action: "correction",
          title: `${q(g[0]!.original)} should read ${q(g[0]!.replacement)}`,
          body: `The style sheet writes percentages with ${q(want)}. This form appears ${times(g.length)}.`,
          original: g[0]!.original,
          replacement: g[0]!.replacement,
          evidence: g.map((o) => ev(o.nodeKey, o.quote)),
          fp: ["style.percent.rule", g[0]!.original, g[0]!.replacement],
          ruleId: pRule.id,
        }),
      );
  } else if (used.length >= 2) {
    const total = used.reduce((n, s) => n + percent.get(s)!.length, 0);
    const ranked = [...used].sort((a, b) => percent.get(b)!.length - percent.get(a)!.length);
    const top = ranked[0]!;
    const tie = percent.get(ranked[1]!)!.length === percent.get(top)!.length;
    if (total >= 3) {
      drafts.push(
        draft({
          pass: "style",
          category: "style",
          severity: "minor",
          action: "query",
          title: `Percentages are written as ${listing(ranked.map((s) => q(s)))}`,
          body: `In the running text percentages appear as ${listing(ranked.map((s) => `${q(s)} (${times(percent.get(s)!.length)})`))}. Please confirm which style you want.`,
          evidence: [
            ...(tie ? ranked : ranked.slice(1)).flatMap((s) =>
              percent.get(s)!.map((h) => ev(h.p.node.key, h.text, tie ? undefined : "less common form")),
            ),
            ...(tie ? [] : percent.get(top)!.slice(0, 2).map((h) => ev(h.p.node.key, h.text, "usual form"))),
          ],
          fp: ["style.percent", ...[...used].sort()],
        }),
      );
      if (!tie)
        detectedRules.push(
          detected("numbers", top, ranked.slice(1), `Write percentages with ${q(top)} (the manuscript's usual form).`),
        );
    }
  } else if (used.length === 1 && percent.get(used[0]!)!.length >= 3) {
    detectedRules.push(detected("numbers", used[0]!, [], `Write percentages with ${q(used[0]!)}.`));
  }

  // Numbers under ten.
  const small = smallHits(prose);
  const sRule = rules.find((r) => smallStyleOf(r));
  const words = small.get("words")!;
  const figures = small.get("figures")!;
  if (sRule) {
    const want = smallStyleOf(sRule)!;
    const occs: Occurrence[] = (want === "words" ? figures : words).map((h) => {
      const [num, noun] = h.text.split(/\s+/) as [string, string];
      const replacement =
        want === "words"
          ? `${WORD_NUMBERS[Number(num)]!} ${noun}`
          : `${WORD_NUMBERS.indexOf(num.toLowerCase())} ${noun}`;
      return { nodeKey: h.p.node.key, original: h.text, replacement, quote: h.text };
    });
    for (const g of groupOccurrences(occs).values()) {
      const o = g[0]!;
      const replacement = /^\p{Lu}/u.test(o.original) ? o.replacement[0]!.toUpperCase() + o.replacement.slice(1) : o.replacement;
      drafts.push(
        draft({
          pass: "style",
          category: "style",
          severity: "minor",
          action: "correction",
          title: `${q(o.original)} should read ${q(replacement)}`,
          body: `The style sheet writes numbers under ten in ${want}. This form appears ${times(g.length)}.`,
          original: o.original,
          replacement,
          evidence: g.map((x) => ev(x.nodeKey, x.quote)),
          fp: ["style.small-numbers.rule", o.original],
          ruleId: sRule.id,
        }),
      );
    }
  } else if (words.length >= 3 && figures.length >= 3) {
    const wordsMajor = words.length >= figures.length;
    const [minor, major] = wordsMajor ? [figures, words] : [words, figures];
    drafts.push(
      draft({
        pass: "style",
        category: "style",
        severity: "minor",
        action: "query",
        title: "Numbers under ten are written both as words and as figures",
        body: `Counting ordinary counts only (not measurements, percentages or references), numbers under ten appear as words ${times(words.length)} (${q(words[0]!.text)}) and as figures ${times(figures.length)} (${q(figures[0]!.text)}). Please confirm which style you want.`,
        evidence: [
          ...minor.map((h) => ev(h.p.node.key, h.text, "less common form")),
          ...major.slice(0, 2).map((h) => ev(h.p.node.key, h.text, "usual form")),
        ],
        fp: ["style.small-numbers"],
      }),
    );
    detectedRules.push(
      detected(
        "numbers",
        wordsMajor ? "Numbers under ten in words" : "Numbers under ten in figures",
        [],
        wordsMajor
          ? "Write numbers under ten as words (three companies), except with units and percentages."
          : "Write numbers under ten as figures (3 companies).",
      ),
    );
  }

  return { findings: finish(input, drafts), detectedRules };
}
