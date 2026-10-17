/**
 * Quotation mark style: single or double as the outer marks, and curly or
 * straight. Nested quotations are expected to use the other kind, so only
 * the outermost marks count towards the primary style.
 */
import type { DraftFinding } from "../model";
import { corpusOf, type Prose } from "./corpus";
import { activeRules, detected, draft, ev, finish } from "./finding";
import { around, isLetter } from "./text";
import type { CheckInput, CheckResult, DetectedRule } from "./types";

type Mark = { p: Prose; at: number };

function scan(p: Prose) {
  const raw = p.raw;
  const primary = { single: [] as Mark[], double: [] as Mark[] };
  const straight: Mark[] = [];
  const curly: Mark[] = [];
  const stack: ("s" | "d")[] = [];
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]!;
    const prev = raw[i - 1];
    const next = raw[i + 1];
    const openCtx = i === 0 || /[\s([—–-]/.test(prev!);
    if (c === "“" || (c === '"' && openCtx && next !== undefined && !/\s/.test(next))) {
      if (!stack.length) primary.double.push({ p, at: i });
      stack.push("d");
      (c === '"' ? straight : curly).push({ p, at: i });
      continue;
    }
    if (c === "”" || c === '"') {
      if (c === '"' && /\d/.test(prev ?? "")) continue; // inches
      if (stack[stack.length - 1] === "d") stack.pop();
      (c === '"' ? straight : curly).push({ p, at: i });
      continue;
    }
    if (c === "‘" || (c === "'" && openCtx && isLetter(next))) {
      if (!stack.length) primary.single.push({ p, at: i });
      stack.push("s");
      (c === "'" ? straight : curly).push({ p, at: i });
      continue;
    }
    if (c === "’" || c === "'") {
      const apostrophe = isLetter(prev) && isLetter(next);
      if (apostrophe && p.masked[i] === " ") continue; // inside a quotation: the quoted writer's marks
      if (!apostrophe && stack[stack.length - 1] === "s" && !isLetter(next)) stack.pop();
      if (c === "'" && /\d/.test(prev ?? "")) continue; // feet, primes
      (c === "'" ? straight : curly).push({ p, at: i });
    }
  }
  return { primary, straight, curly };
}

export function checkQuotation(input: CheckInput): CheckResult {
  const corpus = corpusOf(input.nodes);
  const single: Mark[] = [];
  const double: Mark[] = [];
  const straight: Mark[] = [];
  const curly: Mark[] = [];
  for (const p of corpus.prose) {
    if (p.node.kind === "caption") continue;
    const r = scan(p);
    single.push(...r.primary.single);
    double.push(...r.primary.double);
    straight.push(...r.straight);
    curly.push(...r.curly);
  }
  const rules = activeRules(input.rules, ["punctuation"]);
  const ruleSays = (re: RegExp) => rules.some((r) => re.test(`${r.preferred} ${r.note}`));
  const quoteRule = ruleSays(/\b(single|double)\b.*\bquot/i) || ruleSays(/\bquot.*\b(single|double)\b/i);
  const shapeRule = ruleSays(/\b(curly|straight|smart)\b/i);

  const drafts: DraftFinding[] = [];
  const detectedRules: DetectedRule[] = [];
  const quote = (m: Mark) => around(m.p.raw, m.at, m.at + 1, 1);

  // Single or double as the outer marks.
  const total = single.length + double.length;
  if (total >= 5) {
    const singleMajor = single.length >= double.length;
    const [minor, major] = singleMajor ? [double, single] : [single, double];
    if (!quoteRule && minor.length >= 3 && minor.length / total >= 0.15) {
      drafts.push(
        draft({
          pass: "style",
          category: "style",
          severity: "minor",
          action: "query",
          title: "Single and double quotation marks are both used for quotations",
          body: `Quotations open with single marks ${single.length === 1 ? "once" : `${single.length} times`} and with double marks ${double.length === 1 ? "once" : `${double.length} times`}. Please confirm which you want as the outer marks (the other kind is then kept for quotations inside quotations). If you use one kind for quotations and the other for scare quotes on purpose, no change is needed.`,
          evidence: [
            ...minor.map((m) => ev(m.p.node.key, quote(m), "less common form")),
            ...major.slice(0, 2).map((m) => ev(m.p.node.key, quote(m), "usual form")),
          ],
          fp: ["style.quotes.primary"],
        }),
      );
    }
    if (minor.length / total < 0.15 || !minor.length)
      detectedRules.push(
        detected(
          "punctuation",
          singleMajor ? "Single quotation marks" : "Double quotation marks",
          [],
          singleMajor
            ? "Single quotation marks for quotations, double for a quotation inside a quotation."
            : "Double quotation marks for quotations, single for a quotation inside a quotation.",
        ),
      );
  }

  // Curly or straight.
  const marks = straight.length + curly.length;
  if (marks >= 10) {
    const curlyMajor = curly.length >= straight.length;
    const [minor, major] = curlyMajor ? [straight, curly] : [curly, straight];
    if (!shapeRule && minor.length >= 2 && minor.length / marks <= 0.5) {
      drafts.push(
        draft({
          pass: "style",
          category: "style",
          severity: "minor",
          action: "query",
          title: curlyMajor ? "Some quotation marks are straight, not curly" : "Some quotation marks are curly, not straight",
          body: `Most quotation marks and apostrophes are ${curlyMajor ? "curly (‘ ’ “ ”)" : "straight (' \")"}, but ${minor.length} ${minor.length === 1 ? "is" : "are"} ${curlyMajor ? "straight" : "curly"}. This usually comes from text pasted in from elsewhere. Please confirm the marks should all be ${curlyMajor ? "curly" : "straight"}.`,
          evidence: [
            ...minor.map((m) => ev(m.p.node.key, quote(m), "less common form")),
            ...major.slice(0, 1).map((m) => ev(m.p.node.key, quote(m), "usual form")),
          ],
          fp: ["style.quotes.shape", curlyMajor ? "straight" : "curly"],
        }),
      );
    }
    if (!minor.length)
      detectedRules.push(
        detected(
          "punctuation",
          curlyMajor ? "Curly quotation marks" : "Straight quotation marks",
          [],
          curlyMajor ? "Curly (typographic) quotation marks and apostrophes." : "Straight quotation marks and apostrophes.",
        ),
      );
  }
  return { findings: finish(input, drafts), detectedRules };
}
