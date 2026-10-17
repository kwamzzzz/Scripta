/**
 * Abbreviations: used before they are defined, defined twice, defined two
 * ways, or defined and never used again.
 *
 * Only abbreviations the manuscript defines somewhere are judged, so an
 * undefined "NATO" or "OECD" is never flagged. Headings, the front matter
 * (an abstract stands alone) and captions do not count as a first use.
 */
import type { DraftFinding, ParsedNode, StyleRule } from "../model";
import { corpusOf, HEADING_KINDS, textOf } from "./corpus";
import { activeRules, detected, draft, ev, finish } from "./finding";
import { escapeRe, fold, q, times } from "./text";
import type { CheckInput, CheckResult, DetectedRule } from "./types";

/** Needs no definition. */
const COMMON = new Set(
  (
    "UK US USA EU UN PHD CEO CFO COO GDP GNP AI OK TV AM PM BC AD BCE CE ID PDF URL HTML DNA RNA HIV AIDS " +
    "ISBN ISSN DOI PLC LLC LLP LTD INC SA AG NV BV GMBH SARL USD EUR GBP AED GHS NGN XOF XAF ZAR KES " +
    "COVID SARS FAQ CV NB PS RSVP ASAP VIP IQ"
  ).split(" "),
);
/** Roman numerals as used for numbering (I to XXXIX, and L, C); "MC" and "CD" are abbreviations. */
const ROMAN = /^(?:X{0,3}(?:IX|IV|V?I{0,3})|L|C)$/;
const STOPWORDS = new Set(["of", "and", "the", "for", "in", "on", "de", "des", "la", "le", "du", "et", "to", "&"]);

type Pos = { node: ParsedNode; ord: number; at: number };
type Def = Pos & { expansion: string | null; text: string };

const before = (a: Pos, b: Pos) => a.ord < b.ord || (a.ord === b.ord && a.at < b.at);

/** Letters of `abbr` in order within `phrase`, the first matching the phrase's first letter. */
function spells(abbr: string, words: string[]): boolean {
  if (!words.length) return false;
  const letters = abbr.replace(/s$/, "").toLowerCase();
  const first = fold(words[0]!)[0];
  if (first !== letters[0]) return false;
  const text = fold(words.join(" ")).replace(/[^a-z0-9 ]/g, "");
  let k = 0;
  for (const c of text) if (c === letters[k]) k++;
  if (k < letters.length) return false;
  // Every significant word should give at least one letter: "the Bank" does not spell "B".
  return words.length <= letters.length + 3;
}

const strip = (w: string) => w.replace(/^[“"‘'(]+|[”"’',]+$/g, "");
const capitalised = (w: string) => /^\p{Lu}/u.test(w);

/**
 * The expansion that the words before "(ABC)" spell. A proper name is taken
 * whole ("the Ghana Gold Board (GoldBod)" → "Ghana Gold Board"): the longest
 * run of capitalised words that spells the abbreviation. Otherwise the
 * shortest lower-case phrase that does ("gross domestic product (GDP)").
 */
function expansionBefore(abbr: string, textBefore: string): string | null {
  const clause = textBefore.split(/[.;:!?()]/).pop() ?? "";
  const words = clause.trim().split(/\s+/).filter(Boolean).slice(-(abbr.length * 2 + 3)).map(strip);
  let left = words.length;
  while (left > 0 && (capitalised(words[left - 1]!) || STOPWORDS.has(words[left - 1]!.toLowerCase()))) left--;
  for (let start = left; start < words.length; start++) {
    if (!capitalised(words[start]!)) continue;
    const phrase = words.slice(start);
    if (phrase.some(capitalised) && spells(abbr, phrase)) return phrase.join(" ");
  }
  for (let start = words.length - 1; start >= 0; start--) {
    const phrase = words.slice(start);
    if (STOPWORDS.has(phrase[0]!.toLowerCase())) continue;
    if (spells(abbr, phrase)) return phrase.join(" ");
  }
  return null;
}

const normExpansion = (s: string) =>
  fold(s)
    .replace(/^the\s+/, "")
    .replace(/&/g, "and")
    .replace(/[-‐‑–]/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/s\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * A short form: capitals ("UAE", "SOEs"), or a capitalised word with a
 * capital inside it ("GoldBod", "CoCoBod", "BoG"). Only ever taken from a
 * definition, so ordinary capitalised words are never swept in.
 */
const SHORT_FORM = String.raw`[A-Z][A-Z&]{1,5}s?|[A-Z][a-z]*[A-Z][A-Za-z]{0,8}`;

export function checkAbbreviations(input: CheckInput): CheckResult {
  const corpus = corpusOf(input.nodes);
  const defs = new Map<string, Def[]>();
  const defSpans = new Map<string, Set<number>>(); // node ord → token offsets that are definitions
  const uses = new Map<string, Pos[]>();

  const mostlyCaps = (t: string) => {
    const letters = t.replace(/[^\p{L}]/gu, "");
    return letters.length > 10 && letters.replace(/[^\p{Lu}]/gu, "").length / letters.length > 0.5;
  };
  const allCaps = (abbr: string) => /^[A-Z&]+$/.test(abbr);
  const baseOf = (tok: string) => (/[A-Z]s$/.test(tok) ? tok.slice(0, -1) : tok);
  const eligible = (abbr: string) =>
    allCaps(abbr)
      ? abbr.length >= 2 && abbr.length <= 6 && !ROMAN.test(abbr) && !abbr.includes("&")
      : abbr.length >= 3 && abbr.length <= 10 && /^[A-Z][a-z]*[A-Z]/.test(abbr);
  const addDef = (abbr: string, def: Def, tokenAt: number) => {
    defs.set(abbr, [...(defs.get(abbr) ?? []), def]);
    const spans = defSpans.get(`${def.ord}`) ?? new Set<number>();
    spans.add(tokenAt);
    defSpans.set(`${def.ord}`, spans);
  };

  // Definitions: "Expansion (ABC)", "ABC (Expansion)", "(hereinafter ‘ABC’)".
  const inBrackets = new RegExp(
    String.raw`\(\s*(?:(?:the|hereinafter|hereafter|referred to as)\s+)*[“"‘']?(${SHORT_FORM})[”"’']?\s*\)`,
    "g",
  );
  const beforeBrackets = new RegExp(String.raw`(?<![\p{L}\p{N}])(${SHORT_FORM})\s+\(([^()]{3,120})\)`, "gu");
  for (const p of corpus.prose) {
    const raw = p.raw;
    const ord = corpus.ord.get(p.node.key)!;
    for (const m of raw.matchAll(inBrackets)) {
      const abbr = baseOf(m[1]!);
      if (!eligible(abbr)) continue;
      const at = m.index ?? 0;
      const expansion = expansionBefore(abbr, raw.slice(0, at));
      // "(ABC)" with nothing before it that spells it out is a use in brackets, not a definition.
      if (!expansion) continue;
      const from = raw.lastIndexOf(expansion.split(" ")[0]!, at);
      addDef(
        abbr,
        { node: p.node, ord, at, expansion, text: raw.slice(from >= 0 ? from : at, at + m[0].length) },
        at + m[0].indexOf(m[1]!),
      );
    }
    for (const m of raw.matchAll(beforeBrackets)) {
      const abbr = baseOf(m[1]!);
      if (!eligible(abbr)) continue;
      const inner = m[2]!.trim();
      const hasThe = /^the\s/i.test(inner);
      const words = inner.replace(/^the\s+/i, "").split(/\s+/).map(strip);
      if (words.filter(capitalised).length < 2) continue;
      if (!words.every((w) => capitalised(w) || STOPWORDS.has(w.toLowerCase()))) continue;
      if (!spells(abbr, words) && !hasThe) continue;
      const at = m.index ?? 0;
      addDef(abbr, { node: p.node, ord, at, expansion: words.join(" "), text: m[0] }, at);
    }
  }
  if (!defs.size) return { findings: [], detectedRules: [] };
  for (const list of defs.values()) list.sort((a, b) => a.ord - b.ord || a.at - b.at);

  // Uses: every other occurrence of a defined form, in prose, headings and tables.
  const forms = [...defs.keys()].sort((a, b) => b.length - a.length).map(escapeRe);
  const useRe = new RegExp(`(?<![\\p{L}\\p{N}])(${forms.join("|")})s?(?![\\p{L}\\p{N}])`, "gu");
  for (const node of input.nodes) {
    const isProse = corpus.proseByKey.has(node.key);
    const heading = HEADING_KINDS.has(node.kind);
    if (!isProse && !heading && node.kind !== "table") continue;
    const text = node.kind === "table" ? (node.rows?.flat().join(" ") ?? node.text) : textOf(node);
    if (mostlyCaps(text)) continue;
    const ord = corpus.ord.get(node.key)!;
    const spans = defSpans.get(`${ord}`);
    for (const m of text.matchAll(useRe)) {
      const abbr = m[1]!;
      const at = m.index ?? 0;
      if (spans?.has(at)) continue;
      if (allCaps(abbr)) {
        // Part of a run of capitals ("THE COMPANIES ACT") is not an abbreviation.
        const prev = text.slice(Math.max(0, at - 12), at);
        const next = text.slice(at + m[0].length, at + m[0].length + 12);
        if (/[A-Z]{2,}\s+$/.test(prev) || /^\s+[A-Z]{2,}\b/.test(next)) continue;
      }
      const list = uses.get(abbr) ?? [];
      list.push({ node, ord, at });
      uses.set(abbr, list);
    }
  }

  const rules = activeRules(input.rules, ["abbreviation"]);
  const ruleFor = (abbr: string): StyleRule | undefined =>
    rules.find((r) => r.preferred.trim() === abbr || r.variants.some((v) => v.trim() === abbr));

  const drafts: DraftFinding[] = [];
  const detectedRules: DetectedRule[] = [];
  for (const [abbr, list] of defs) {
    const rule = ruleFor(abbr);
    if (COMMON.has(abbr.toUpperCase()) && !rule) continue;
    if (rule && !rule.note.trim()) continue; // the author says it needs no definition
    const first = list[0]!;
    const all = uses.get(abbr) ?? [];
    const withExpansion = list.filter((d) => d.expansion);

    // Used before it is defined.
    const early = all.filter(
      (u) =>
        before(u, first) &&
        u.node.kind !== "front" &&
        u.node.kind !== "caption" &&
        u.node.kind !== "table" &&
        u.node.chapterKey !== null &&
        !HEADING_KINDS.has(u.node.kind),
    );
    if (early.length)
      drafts.push(
        draft({
          pass: "consistency",
          category: "consistency",
          severity: "minor",
          action: "suggestion",
          title: `${abbr} is used before it is defined`,
          body: `${abbr} is first defined${first.expansion ? ` as ${q(first.expansion)}` : ""} later in the manuscript, but it is used ${times(early.length)} before that. Consider moving the definition to the first use.`,
          evidence: [
            ...early.map((u) => ev(u.node.key, abbr, "used before the definition")),
            ev(first.node.key, first.text, "definition"),
          ],
          fp: ["consistency.abbreviation.early", abbr],
        }),
      );

    // Defined two ways.
    const expansions = new Map<string, Def[]>();
    for (const d of withExpansion) {
      const k = normExpansion(d.expansion!);
      expansions.set(k, [...(expansions.get(k) ?? []), d]);
    }
    const official = rule?.note.trim();
    if (official) {
      const off = withExpansion.filter((d) => normExpansion(d.expansion!) !== normExpansion(official));
      for (const d of off)
        drafts.push(
          draft({
            pass: "consistency",
            category: "consistency",
            severity: "minor",
            action: "correction",
            title: `${abbr} should be defined as ${q(official)}`,
            body: `The style sheet defines ${abbr} as ${q(official)}, but here it is spelled out as ${q(d.expansion!)}.`,
            original: d.expansion!,
            replacement: official,
            evidence: [ev(d.node.key, d.expansion!)],
            fp: ["consistency.abbreviation.rule", abbr, d.expansion!],
            ruleId: rule!.id,
          }),
        );
    } else if (expansions.size > 1) {
      const groups = [...expansions.values()];
      drafts.push(
        draft({
          pass: "consistency",
          category: "consistency",
          severity: "material",
          action: "query",
          title: `${abbr} is defined in ${expansions.size} different ways`,
          body: `${abbr} is spelled out as ${groups.map((g) => q(g[0]!.expansion!)).join(" and as ")}. If these are the same thing, please choose one expansion; if they are different things, they need different abbreviations.`,
          evidence: groups.flatMap((g) => g.map((d) => ev(d.node.key, d.expansion!))),
          fp: ["consistency.abbreviation.expansions", abbr],
        }),
      );
    }

    // Defined more than once the same way.
    if (withExpansion.length > 1 && expansions.size === 1)
      drafts.push(
        draft({
          pass: "consistency",
          category: "consistency",
          severity: "minor",
          action: "query",
          title: `${abbr} is defined ${times(withExpansion.length)}`,
          body: `${abbr} is spelled out ${times(withExpansion.length)}. Usually it is defined once, at its first use; if your style is to define it again in each chapter, no change is needed.`,
          evidence: withExpansion.map((d) => ev(d.node.key, d.text)),
          fp: ["consistency.abbreviation.repeat", abbr],
        }),
      );

    // Defined and never used again. Defined twice means it did appear again: the findings above cover it.
    if (list.length === 1 && !all.some((u) => before(first, u)))
      drafts.push(
        draft({
          pass: "consistency",
          category: "consistency",
          severity: "minor",
          action: "suggestion",
          title: `${abbr} is defined but never used again`,
          body: `${abbr} is introduced${first.expansion ? ` for ${q(first.expansion)}` : ""} but does not appear again. Consider spelling it out and dropping the abbreviation.`,
          evidence: [ev(first.node.key, first.text)],
          fp: ["consistency.abbreviation.unused", abbr],
        }),
      );

    if (first.expansion && expansions.size === 1)
      detectedRules.push(detected("abbreviation", abbr, [], first.expansion));
  }
  return { findings: finish(input, drafts), detectedRules };
}
