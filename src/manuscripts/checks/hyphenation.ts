/**
 * Hyphenation drift: the same compound written hyphenated and closed
 * ("e-mail"/"email", "policy-maker"/"policymaker"), or hyphenated and open
 * where the open form is never a different construction ("cross border",
 * "decision making", prefixes such as non-, anti-, co-).
 *
 * Hyphenated against open is otherwise left alone on purpose: "a well-known
 * case" and "the case is well known", "a long-term plan" and "in the long
 * term" are both right.
 */
import type { DraftFinding } from "../model";
import { corpusOf, type Prose, type Tok } from "./corpus";
import { detected, draft, ev, finish, ruleCovering } from "./finding";
import { listing, q, times } from "./text";
import type { CheckInput, CheckResult, DetectedRule } from "./types";

const HYPHENS = new Set(["-", "‐", "‑"]);

/** First parts after which the open form ("non governmental") is never right. */
const OPEN_PREFIXES = new Set(
  "non anti co cross multi self socio semi pre post inter intra sub micro macro neo pseudo quasi ultra"
    .split(" "),
);
/** Compounds whose open form means the same thing. */
const OPEN_COMPOUNDS = new Set([
  "decision-making",
  "decision-maker",
  "decision-makers",
  "policy-making",
  "policy-maker",
  "policy-makers",
  "law-making",
  "law-maker",
  "law-makers",
  "rule-making",
  "well-being",
  "e-mail",
  "e-mails",
  "on-line",
  "health-care",
  "stake-holder",
  "stake-holders",
  "sub-sector",
  "sub-sectors",
  "co-operation",
]);
/** Hyphenated and closed forms that are different words. */
const DIFFERENT_WORDS = new Set([
  "re-sign",
  "re-form",
  "re-count",
  "re-creation",
  "re-sort",
  "re-press",
  "re-lease",
  "re-treat",
  "re-cover",
  "re-mark",
  "re-serve",
  "re-solve",
  "re-act",
  "re-lay",
  "re-collect",
  "re-present",
  "re-sent",
  "re-side",
  "re-strain",
  "re-fund",
  "re-call",
  "re-coil",
  "re-dress",
  "re-pose",
  "co-op",
  "multi-ply",
  "un-ionised",
  "un-ionized",
]);

type Hit = { p: Prose; s: number; e: number; text: string };
type Forms = { hyphen: Hit[]; open: Hit[]; closed: Hit[] };

const isName = (t: Tok) => /^\p{Lu}/u.test(t.w) && t.init === 0;

export function checkHyphenation(input: CheckInput): CheckResult {
  const corpus = corpusOf(input.nodes);
  const prose = corpus.prose.filter((p) => p.english);
  const compounds = new Map<string, Forms>();

  // Hyphenated two-part compounds.
  for (const p of prose) {
    const toks = p.toks;
    for (let i = 0; i + 1 < toks.length; i++) {
      const a = toks[i]!;
      const b = toks[i + 1]!;
      if (!HYPHENS.has(b.sep)) continue;
      if (HYPHENS.has(a.sep) || HYPHENS.has(toks[i + 2]?.sep ?? "")) continue; // longer chains
      if (isName(a) || /\p{Lu}/u.test(b.w)) continue;
      if (a.lw.length < 2 && a.lw !== "e") continue;
      if (b.lw.length < 2) continue;
      const key = `${a.lw}-${b.lw}`;
      if (DIFFERENT_WORDS.has(key)) continue;
      let f = compounds.get(key);
      if (!f) compounds.set(key, (f = { hyphen: [], open: [], closed: [] }));
      f.hyphen.push({ p, s: a.s, e: b.e, text: p.raw.slice(a.s, b.e) });
    }
  }
  if (!compounds.size) return { findings: [], detectedRules: [] };

  const closedIndex = new Map<string, string>();
  const openIndex = new Map<string, string>();
  for (const key of compounds.keys()) {
    const [a, b] = key.split("-") as [string, string];
    closedIndex.set(a + b, key);
    if (OPEN_PREFIXES.has(a) || OPEN_COMPOUNDS.has(key)) openIndex.set(`${a} ${b}`, key);
  }
  for (const p of prose) {
    const toks = p.toks;
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i]!;
      if (isName(t)) continue;
      const closed = closedIndex.get(t.lw);
      if (closed && !HYPHENS.has(t.sep) && !HYPHENS.has(toks[i + 1]?.sep ?? ""))
        compounds.get(closed)!.closed.push({ p, s: t.s, e: t.e, text: t.w });
      const n = toks[i + 1];
      if (!n || n.sep !== " " || /\p{Lu}/u.test(n.w)) continue;
      const open = openIndex.get(`${t.lw} ${n.lw}`);
      if (open && !HYPHENS.has(t.sep) && !HYPHENS.has(toks[i + 2]?.sep ?? ""))
        compounds.get(open)!.open.push({ p, s: t.s, e: n.e, text: p.raw.slice(t.s, n.e) });
    }
  }

  const drafts: DraftFinding[] = [];
  const detectedRules: DetectedRule[] = [];
  for (const [key, f] of compounds) {
    const [a, b] = key.split("-") as [string, string];
    const variants = (
      [
        [key, f.hyphen],
        [a + b, f.closed],
        [`${a} ${b}`, f.open],
      ] as [string, Hit[]][]
    ).filter(([, hits]) => hits.length > 0);
    if (variants.length < 2) continue;
    if (ruleCovering(input.rules, ["hyphenation", "spelling", "terminology"], variants.map(([form]) => form)))
      continue;
    variants.sort((x, y) => y[1].length - x[1].length);
    const top = variants[0]!;
    const tie = variants[1]![1].length === top[1].length;
    const minority = tie ? variants : variants.slice(1);
    const described = variants.map(([form, hits]) => `${q(form)} (${times(hits.length)})`);
    drafts.push(
      draft({
        pass: "style",
        category: "style",
        severity: "minor",
        action: "query",
        title: `${listing(variants.map(([form]) => q(form)))} are ${variants.length === 2 ? "both" : "all"} used`,
        body: `The same compound is written ${listing(described)}. Please confirm which form you want.`,
        evidence: [
          ...minority.flatMap(([, hits]) =>
            hits.map((h) => ev(h.p.node.key, h.text, tie ? undefined : "less common form")),
          ),
          ...(tie ? [] : top[1].slice(0, 2).map((h) => ev(h.p.node.key, h.text, "usual form"))),
        ],
        fp: ["style.hyphenation", key],
      }),
    );
    if (!tie)
      detectedRules.push(
        detected(
          "hyphenation",
          top[0],
          variants.slice(1).map(([form]) => form),
          `Write ${q(top[0])} (the manuscript's usual form).`,
        ),
      );
  }
  return { findings: finish(input, drafts), detectedRules };
}
