/**
 * Building findings, and the last step every check shares: keep only what
 * touches the chapters under review, cap long evidence lists, and make
 * fingerprints unique within a run.
 */
import {
  fingerprint,
  type DraftFinding,
  type Evidence,
  type FindingAction,
  type FindingCategory,
  type FindingSeverity,
  type ReviewPass,
  type StyleRule,
} from "../model";
import { corpusOf } from "./corpus";
import { EVIDENCE_CAP, type CheckInput, type DetectedRule } from "./types";

export type Draft = {
  pass: ReviewPass;
  category: FindingCategory;
  severity: FindingSeverity;
  action: FindingAction;
  title: string;
  body: string;
  original?: string | undefined;
  replacement?: string | undefined;
  evidence: Evidence[];
  /** What identifies the problem: check id first, then its words (never a node key for manuscript-wide findings). */
  fp: (string | undefined)[];
  ruleId?: string | undefined;
};

export function draft(d: Draft): DraftFinding {
  const f: DraftFinding = {
    pass: d.pass,
    category: d.category,
    severity: d.severity,
    action: d.action,
    title: d.title,
    body: d.body,
    evidence: d.evidence,
    fingerprint: fingerprint(d.fp),
    source: "rule",
  };
  if (d.original !== undefined) f.original = d.original;
  if (d.replacement !== undefined) f.replacement = d.replacement;
  if (d.ruleId !== undefined) f.ruleId = d.ruleId;
  return f;
}

export function ev(nodeKey: string, quote?: string, note?: string): Evidence {
  const e: Evidence = { nodeKey };
  if (quote !== undefined && quote !== "") e.quote = quote;
  if (note !== undefined && note !== "") e.note = note;
  return e;
}

/** Evidence without repeats (same node and same words). */
export function uniqueEvidence(list: Evidence[]): Evidence[] {
  const seen = new Set<string>();
  return list.filter((e) => {
    const k = `${e.nodeKey}\u0000${e.quote ?? ""}\u0000${e.note ?? ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function targetSet(input: CheckInput): Set<string> | null {
  const t = input.targetChapterKeys;
  return t && t.length ? new Set(t) : null;
}

/**
 * Keep the findings that rest on at least one place inside the target
 * chapters (the whole manuscript was still read to compute them), cap the
 * evidence at EVIDENCE_CAP (preferring places inside the target), and make
 * fingerprints unique.
 */
export function finish(input: CheckInput, drafts: DraftFinding[]): DraftFinding[] {
  const corpus = corpusOf(input.nodes);
  const target = targetSet(input);
  const inTarget = (e: Evidence) => !!target && target.has(corpus.chapterOf(e.nodeKey) ?? "");
  const seen = new Map<string, number>();
  const out: DraftFinding[] = [];
  for (const d of drafts) {
    const all = uniqueEvidence(d.evidence);
    if (!all.length) continue;
    if (target && !all.some(inTarget)) continue;
    let evidence = all;
    let body = d.body;
    if (all.length > EVIDENCE_CAP) {
      const ranked = target ? [...all.filter(inTarget), ...all.filter((e) => !inTarget(e))] : all;
      const chosen = new Set(ranked.slice(0, EVIDENCE_CAP));
      evidence = all.filter((e) => chosen.has(e));
      body = `${body} ${EVIDENCE_CAP} places are listed here, and ${all.length - EVIDENCE_CAP} more.`;
    }
    let fp = d.fingerprint;
    const n = seen.get(fp) ?? 0;
    seen.set(fp, n + 1);
    if (n > 0) fp = fingerprint([fp, String(n + 1)]);
    out.push({ ...d, evidence, body, fingerprint: fp });
  }
  return out;
}

/* ------------------------------------------------------------ style rules -- */

export const norm = (s: string): string => s.trim().toLowerCase();

export function activeRules(rules: StyleRule[], categories: StyleRule["category"][]): StyleRule[] {
  return rules.filter((r) => r.active && categories.includes(r.category));
}

/** An active rule in these categories that names any of these forms (case-insensitive). */
export function ruleCovering(
  rules: StyleRule[],
  categories: StyleRule["category"][],
  forms: string[],
): StyleRule | undefined {
  const wanted = new Set(forms.map(norm));
  return activeRules(rules, categories).find((r) =>
    [r.preferred, ...r.variants].some((f) => wanted.has(norm(f))),
  );
}

export function detected(
  category: StyleRule["category"],
  preferred: string,
  variants: string[],
  note: string,
): DetectedRule {
  return { category, preferred, variants, note, origin: "detected", active: false };
}

/** Drop detected conventions the style sheet already has, and repeats. */
export function freshRules(existing: StyleRule[], found: DetectedRule[]): DetectedRule[] {
  const known = new Set<string>();
  for (const r of existing) for (const f of [r.preferred, ...r.variants]) known.add(`${r.category}|${norm(f)}`);
  const out: DetectedRule[] = [];
  for (const d of found) {
    const forms = [d.preferred, ...d.variants];
    if (!d.preferred.trim() || forms.some((f) => known.has(`${d.category}|${norm(f)}`))) continue;
    for (const f of forms) known.add(`${d.category}|${norm(f)}`);
    out.push(d);
  }
  return out;
}

/** Corrections that share the same original and replacement become one finding. */
export type Occurrence = { nodeKey: string; original: string; replacement: string; quote: string };

export function groupOccurrences(occs: Occurrence[]): Map<string, Occurrence[]> {
  const groups = new Map<string, Occurrence[]>();
  for (const o of occs) {
    const k = `${o.original}\u0000${o.replacement}`;
    const g = groups.get(k);
    if (g) g.push(o);
    else groups.set(k, [o]);
  }
  return groups;
}
