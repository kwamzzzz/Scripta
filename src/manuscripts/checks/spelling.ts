/**
 * British/American spelling drift.
 *
 * Counts the author's own words only: quotations are masked, and a word
 * capitalised in the middle of a sentence is taken for part of a name
 * ("World Health Organization", "Pearl Harbor") and not counted. The
 * manuscript's majority is never imposed: a mixed family is an author query,
 * unless an active style rule settles it, in which case the off-rule forms
 * are corrections.
 */
import type { DraftFinding, StyleRule } from "../model";
import { corpusOf, type Prose, type Tok } from "./corpus";
import {
  activeRules,
  detected,
  draft,
  ev,
  finish,
  groupOccurrences,
  type Occurrence,
} from "./finding";
import {
  familyKey,
  SPELL_LOOKUP,
  spellingRuleKind,
  type SpellFamily,
  type Variety,
} from "./spelling-data";
import { listing, matchCase, q, times } from "./text";
import type { CheckInput, CheckResult, DetectedRule } from "./types";

type Occ = { p: Prose; t: Tok; fam: SpellFamily; variety: Variety; index: number };

const LABEL: Record<Variety, string> = { gb: "British", us: "American" };
const other = (v: Variety): Variety => (v === "gb" ? "us" : "gb");

const COMPUTING =
  /\b(?:computer|computers|software|code|coding|programming|programmer|algorithm|app|script|executable|install|installed|compile|compiled|python|java)\b/i;
const NOUN_BEFORE = new Set(
  (
    "a the this that its their his her our your each any no every driving operating mining trading " +
    "business export import exploration prospecting broadcasting banking valid new special of such " +
    "these those issued granted revoked"
  ).split(" "),
);
const NAME_JOINERS = new Set(["of", "for", "the", "and", "on", "in", "de"]);

/** A capitalised opening word followed by more capitalised words is probably a name. */
function opensName(toks: Tok[], i: number): boolean {
  for (let k = i + 1; k < toks.length && k <= i + 3; k++) {
    const t = toks[k]!;
    if (!/^\s+$/.test(t.sep)) return false;
    if (NAME_JOINERS.has(t.lw)) continue;
    return /^\p{Lu}/u.test(t.w);
  }
  return false;
}

/** Every counted occurrence of a family form, in document order. */
export function spellingOccurrences(input: CheckInput): Occ[] {
  const corpus = corpusOf(input.nodes);
  const out: Occ[] = [];
  for (const p of corpus.prose) {
    if (!p.english) continue;
    p.toks.forEach((t, i) => {
      const lw = t.lw.replace(/['’]s$/, "");
      const hit = SPELL_LOOKUP.get(lw);
      if (!hit) return;
      if (/^\p{Lu}/u.test(t.w)) {
        if (t.w.length > 1 && t.w === t.w.toUpperCase()) return;
        if (/\p{Lu}/u.test(t.w.slice(1))) return;
        if (t.init !== 1 || opensName(p.toks, i)) return;
      }
      if (hit.variety === "us" && hit.fam.context === "computing" && COMPUTING.test(p.masked)) return;
      if (hit.variety === "us" && hit.fam.context === "noun") {
        const prev = p.toks[i - 1];
        if (!prev || !NOUN_BEFORE.has(prev.lw) || !/^\s+$/.test(t.sep)) return;
      }
      out.push({ p, t, fam: hit.fam, variety: hit.variety, index: hit.index });
    });
  }
  return out;
}

/** How an active spelling rule maps a counted occurrence, if it does. */
function ruleTarget(rule: StyleRule, o: Occ): Variety | null {
  const kind = spellingRuleKind(rule);
  if (!kind) return null;
  if (kind.kind === "variety")
    return o.fam.pool || !o.fam.overall ? null : kind.variety;
  if (kind.kind === "ise") return o.fam.pool === "ise" ? kind.variety : null;
  const forms = new Set([rule.preferred, ...rule.variants].map((f) => f.trim().toLowerCase()));
  const pref = SPELL_LOOKUP.get(rule.preferred.trim().toLowerCase());
  if (!pref || pref.fam !== o.fam) return null;
  const fam = o.fam.pairs.flat();
  return fam.some((f) => forms.has(f)) ? pref.variety : null;
}

const headOf = (fam: SpellFamily, v: Variety) => (fam.pool === "ise" ? `-i${v === "gb" ? "s" : "z"}e` : fam.head[v]);

export function checkSpelling(input: CheckInput): CheckResult {
  const occs = spellingOccurrences(input);
  const rules = activeRules(input.rules, ["spelling"]).filter((r) => spellingRuleKind(r));
  const drafts: DraftFinding[] = [];
  const detectedRules: DetectedRule[] = [];

  // 1. Active rules: off-rule forms are corrections; the families they settle are not queried.
  const settled = new Set<string>();
  const corrections: (Occurrence & { rule: StyleRule })[] = [];
  for (const o of occs) {
    for (const rule of rules) {
      const want = ruleTarget(rule, o);
      if (!want) continue;
      settled.add(familyKey(o.fam));
      if (o.variety !== want) {
        const replacement = o.fam.pairs[o.index]![want === "gb" ? 0 : 1];
        const original = o.t.w.replace(/['’]s$/, "");
        corrections.push({
          nodeKey: o.p.node.key,
          original,
          replacement: matchCase(original, replacement),
          quote: original,
          rule,
        });
      }
      break;
    }
  }
  for (const group of groupOccurrences(corrections).values()) {
    const first = group[0]! as Occurrence & { rule: StyleRule };
    drafts.push(
      draft({
        pass: "style",
        category: "style",
        severity: "minor",
        action: "correction",
        title: `${q(first.original)} should read ${q(first.replacement)}`,
        body: `The style sheet settles this spelling (${q(first.rule.preferred)}). ${q(first.original)} appears ${times(group.length)}.`,
        original: first.original,
        replacement: first.replacement,
        evidence: group.map((o) => ev(o.nodeKey, o.quote)),
        fp: ["style.spelling.rule", first.original, first.replacement],
        ruleId: first.rule.id,
      }),
    );
  }

  // 2. Drift within a family.
  const byFamily = new Map<string, { gb: Occ[]; us: Occ[]; fam: SpellFamily }>();
  for (const o of occs) {
    const k = familyKey(o.fam);
    let f = byFamily.get(k);
    if (!f) byFamily.set(k, (f = { gb: [], us: [], fam: o.fam }));
    f[o.variety].push(o);
  }
  let overallGb = 0;
  let overallUs = 0;
  for (const f of byFamily.values())
    if (f.fam.overall) {
      overallGb += f.gb.length;
      overallUs += f.us.length;
    }
  const overallTotal = overallGb + overallUs;
  const overall: Variety | null =
    overallTotal >= 10 && overallGb / overallTotal >= 0.8
      ? "gb"
      : overallTotal >= 10 && overallUs / overallTotal >= 0.8
        ? "us"
        : null;

  const examples = (list: Occ[]) => {
    const forms = [...new Set(list.map((o) => o.t.lw))];
    return listing(forms.slice(0, 3).map(q));
  };

  for (const [key, f] of byFamily) {
    if (settled.has(key)) continue;
    const pooled = f.fam.pool === "ise";
    if (f.gb.length && f.us.length) {
      const major: Variety | null =
        f.gb.length > f.us.length ? "gb" : f.us.length > f.gb.length ? "us" : f.fam.overall ? overall : null;
      const minor: Variety = major ? other(major) : "us";
      const minority = f[minor];
      const majority = f[other(minor)];
      const title = pooled
        ? "Both -ise and -ize spellings are used"
        : `${q(f.fam.head[minor])} and ${q(f.fam.head[other(minor)])} are both used`;
      const body = major
        ? `The manuscript mostly uses ${examples(majority)} (${times(majority.length)}), but ${examples(minority)} appears ${times(minority.length)}. Please confirm which spelling you want.`
        : `The manuscript uses ${examples(f.gb)} and ${examples(f.us)} equally often. Please confirm which spelling you want.`;
      drafts.push(
        draft({
          pass: "style",
          category: "style",
          severity: "minor",
          action: "query",
          title,
          body,
          evidence: [
            ...minority.map((o) => ev(o.p.node.key, o.t.w, major ? "less common form" : undefined)),
            ...majority.slice(0, 2).map((o) => ev(o.p.node.key, o.t.w, major ? "usual form" : undefined)),
          ],
          fp: ["style.spelling.drift", key],
        }),
      );
      if (major)
        detectedRules.push(
          detected(
            "spelling",
            headOf(f.fam, major),
            [headOf(f.fam, minor)],
            pooled
              ? `Use ${major === "gb" ? "-ise" : "-ize"} endings (the manuscript's usual form).`
              : `Spell it ${q(f.fam.head[major])} (the manuscript's usual form).`,
          ),
        );
      continue;
    }
    // 3. A family used only in the other variety, in a manuscript that is clearly one variety.
    if (!overall || !f.fam.overall) continue;
    const odd = f[other(overall)];
    if (!odd.length || f[overall].length) continue;
    drafts.push(
      draft({
        pass: "style",
        category: "style",
        severity: "minor",
        action: "query",
        title: `${LABEL[other(overall)]} spelling ${q(f.fam.head[other(overall)])} in a ${LABEL[overall]}-spelled manuscript`,
        body: `The manuscript otherwise uses ${LABEL[overall]} spelling (${overall === "gb" ? overallGb : overallUs} of ${overallTotal} words that differ), but ${examples(odd)} appears ${times(odd.length)}. The ${LABEL[overall]} form would be ${q(f.fam.head[overall])}. Please confirm.`,
        evidence: odd.map((o) => ev(o.p.node.key, o.t.w)),
        fp: ["style.spelling.variety", key, other(overall)],
      }),
    );
  }

  // 4. Conventions for the style sheet.
  if (overall)
    detectedRules.push(
      detected(
        "spelling",
        `${LABEL[overall]} spelling`,
        [],
        `The manuscript uses ${LABEL[overall]} spelling (${overall === "gb" ? "behaviour, centre, defence" : "behavior, center, defense"}).`,
      ),
    );
  const ise = byFamily.get("ise");
  if (ise && !settled.has("ise") && ise.gb.length + ise.us.length >= 3 && (!ise.gb.length || !ise.us.length)) {
    const v: Variety = ise.gb.length ? "gb" : "us";
    detectedRules.push(
      detected("spelling", headOf(ise.fam, v), [headOf(ise.fam, other(v))], `Use ${headOf(ise.fam, v)} endings (organise/organize, recognise/recognize).`),
    );
  }

  return { findings: finish(input, drafts), detectedRules };
}
