/**
 * The style sheet applied literally: for an active rule with variants, every
 * variant in the author's own text (quotations excluded) is a correction to
 * the preferred form. Spelling families, numbers, dates, citations and
 * abbreviations have their own checks, which know more about those forms.
 */
import type { DraftFinding, StyleRule } from "../model";
import { corpusOf } from "./corpus";
import { activeRules, draft, ev, finish, groupOccurrences, type Occurrence } from "./finding";
import { spellingRuleKind } from "./spelling-data";
import { escapeRe, initAt, matchCase, q, times } from "./text";
import type { CheckInput, CheckResult } from "./types";

const LITERAL: StyleRule["category"][] = ["spelling", "terminology", "hyphenation", "names", "capitalisation"];

const caseSensitive = (r: StyleRule) => r.category === "names" || r.category === "capitalisation";

export function literalRules(rules: StyleRule[]): StyleRule[] {
  return activeRules(rules, LITERAL).filter(
    (r) =>
      r.preferred.trim() &&
      r.variants.some((v) => v.trim()) &&
      !(r.category === "spelling" && spellingRuleKind(r)),
  );
}

export function checkStyleRules(input: CheckInput): CheckResult {
  const rules = literalRules(input.rules);
  if (!rules.length) return { findings: [], detectedRules: [] };
  const corpus = corpusOf(input.nodes);
  const drafts: DraftFinding[] = [];

  for (const rule of rules) {
    const sensitive = caseSensitive(rule);
    const variants = rule.variants
      .map((v) => v.trim())
      .filter((v) => v && (sensitive ? v !== rule.preferred.trim() : v.toLowerCase() !== rule.preferred.trim().toLowerCase()))
      .sort((a, b) => b.length - a.length);
    if (!variants.length) continue;
    const re = new RegExp(
      `(?<![\\p{L}\\p{N}\\-])(?:${variants.map(escapeRe).join("|")})(?![\\p{L}\\p{N}\\-])`,
      sensitive ? "gu" : "giu",
    );
    const occs: Occurrence[] = [];
    for (const p of corpus.prose) {
      for (const m of p.masked.matchAll(re)) {
        const s = m.index ?? 0;
        const found = p.raw.slice(s, s + m[0].length);
        const init = initAt(p.raw, s);
        if (sensitive) {
          // "Central bank" opening a sentence is capitalised by the sentence, not by choice.
          if (rule.category === "capitalisation" && init !== 0) continue;
        } else if (/^\p{Lu}/u.test(found) && !/^\p{Lu}/u.test(rule.preferred.trim()) && init === 0) {
          continue; // part of a name
        }
        const replacement = sensitive ? rule.preferred.trim() : matchCase(found, rule.preferred.trim());
        if (replacement === found) continue;
        occs.push({ nodeKey: p.node.key, original: found, replacement, quote: found });
      }
    }
    for (const group of groupOccurrences(occs).values()) {
      const first = group[0]!;
      drafts.push(
        draft({
          pass: "style",
          category: sensitive ? "consistency" : "style",
          severity: "minor",
          action: "correction",
          title: `${q(first.original)} should read ${q(first.replacement)}`,
          body: `The style sheet prefers ${q(rule.preferred.trim())}${rule.note ? ` (${rule.note.replace(/\.$/, "")})` : ""}. ${q(first.original)} appears ${times(group.length)}.`,
          original: first.original,
          replacement: first.replacement,
          evidence: group.map((o) => ev(o.nodeKey, o.quote)),
          fp: ["style.rule", rule.category, rule.preferred, first.original],
          ruleId: rule.id,
        }),
      );
    }
  }
  return { findings: finish(input, drafts), detectedRules: [] };
}
