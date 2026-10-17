/**
 * Date format drift: "22 September 2026", "September 22, 2026", "22/09/2026",
 * "2026-09-22". A numeric date is only ever rewritten when it cannot be
 * misread (a day above 12); "03/04/2026" is a question for the author.
 */
import type { DraftFinding, StyleRule } from "../model";
import { corpusOf, type Prose } from "./corpus";
import { activeRules, detected, draft, ev, finish, groupOccurrences, type Occurrence } from "./finding";
import { listing, q, times } from "./text";
import type { CheckInput, CheckResult, DetectedRule } from "./types";

type DateStyle = "dmy" | "mdy" | "numeric" | "iso";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const M = MONTHS.join("|");

const PATTERNS: [DateStyle, RegExp][] = [
  ["dmy", new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${M}),?\\s+(\\d{4})\\b`, "g")],
  ["mdy", new RegExp(`\\b(${M})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, "g")],
  ["numeric", /(?<![\d/.])(\d{1,2})[/.](\d{1,2})[/.](\d{4})(?![\d/]|\.\d)/g],
  ["iso", /(?<![\d-])(\d{4})-(\d{2})-(\d{2})(?![\d-])/g],
];

const EXAMPLE: Record<DateStyle, string> = {
  dmy: "22 September 2026",
  mdy: "September 22, 2026",
  numeric: "22/09/2026",
  iso: "2026-09-22",
};
const DESCRIBE: Record<DateStyle, string> = {
  dmy: "day month year",
  mdy: "month day, year",
  numeric: "all in figures",
  iso: "year-month-day (ISO)",
};

type Hit = { p: Prose; style: DateStyle; text: string; day: number; month: number; year: number };

export function styleOfDateRule(rule: StyleRule): DateStyle | null {
  const t = rule.preferred.trim();
  for (const [style, re] of PATTERNS) {
    re.lastIndex = 0;
    const m = new RegExp(`^${re.source}$`).exec(t);
    if (m) return style;
  }
  return null;
}

function hitsIn(prose: Prose[]): Hit[] {
  const out: Hit[] = [];
  for (const p of prose)
    for (const [style, re] of PATTERNS)
      for (const m of p.masked.matchAll(re)) {
        let day: number;
        let month: number;
        let year: number;
        if (style === "dmy") [day, month, year] = [+m[1]!, MONTHS.indexOf(m[2]!) + 1, +m[3]!];
        else if (style === "mdy") [day, month, year] = [+m[2]!, MONTHS.indexOf(m[1]!) + 1, +m[3]!];
        else if (style === "iso") [day, month, year] = [+m[3]!, +m[2]!, +m[1]!];
        else {
          const a = +m[1]!;
          const b = +m[2]!;
          // Day and month unknown until one of them is over 12.
          [day, month, year] = a > 12 ? [a, b, +m[3]!] : b > 12 ? [b, a, +m[3]!] : [0, 0, +m[3]!];
          if (a > 31 || b > 31 || (a > 12 && b > 12)) continue;
        }
        if (year < 1000 || year > 2200) continue;
        if (style !== "numeric" && (day < 1 || day > 31 || month < 1 || month > 12)) continue;
        out.push({ p, style, text: m[0], day, month, year });
      }
  return out;
}

function render(h: Hit, to: DateStyle): string | null {
  if (!h.day || !h.month) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  switch (to) {
    case "dmy":
      return `${h.day} ${MONTHS[h.month - 1]} ${h.year}`;
    case "mdy":
      return `${MONTHS[h.month - 1]} ${h.day}, ${h.year}`;
    case "iso":
      return `${h.year}-${pad(h.month)}-${pad(h.day)}`;
    case "numeric":
      return null; // which order the author wants is not ours to guess
  }
}

export function checkDates(input: CheckInput): CheckResult {
  const corpus = corpusOf(input.nodes);
  const prose = corpus.prose.filter((p) => p.node.kind !== "caption");
  const hits = hitsIn(prose);
  const drafts: DraftFinding[] = [];
  const detectedRules: DetectedRule[] = [];
  if (!hits.length) return { findings: [], detectedRules };

  const by = new Map<DateStyle, Hit[]>();
  for (const h of hits) by.set(h.style, [...(by.get(h.style) ?? []), h]);
  const rule = activeRules(input.rules, ["dates"]).find((r) => styleOfDateRule(r));

  if (rule) {
    const want = styleOfDateRule(rule)!;
    const occs: Occurrence[] = [];
    const unsure: Hit[] = [];
    for (const h of hits) {
      if (h.style === want) continue;
      const replacement = render(h, want);
      if (replacement) occs.push({ nodeKey: h.p.node.key, original: h.text, replacement, quote: h.text });
      else unsure.push(h);
    }
    for (const g of groupOccurrences(occs).values())
      drafts.push(
        draft({
          pass: "style",
          category: "style",
          severity: "minor",
          action: "correction",
          title: `${q(g[0]!.original)} should read ${q(g[0]!.replacement)}`,
          body: `The style sheet writes dates as ${q(rule.preferred.trim())} (${DESCRIBE[want]}).`,
          original: g[0]!.original,
          replacement: g[0]!.replacement,
          evidence: g.map((o) => ev(o.nodeKey, o.quote)),
          fp: ["style.dates.rule", g[0]!.original, want],
          ruleId: rule.id,
        }),
      );
    if (unsure.length)
      drafts.push(
        draft({
          pass: "style",
          category: "style",
          severity: "minor",
          action: "query",
          title: `${unsure.length === 1 ? "A date does" : `${unsure.length} dates do`} not follow the style sheet`,
          body: `The style sheet writes dates as ${q(rule.preferred.trim())}, but ${listing(unsure.slice(0, 3).map((h) => q(h.text)))}${unsure.length > 3 ? " and others" : ""} could be read either way round. Please rewrite ${unsure.length === 1 ? "it" : "them"} in the style sheet's form.`,
          evidence: unsure.map((h) => ev(h.p.node.key, h.text)),
          fp: ["style.dates.rule.unsure", want],
          ruleId: rule.id,
        }),
      );
    return { findings: finish(input, drafts), detectedRules };
  }

  const ranked = [...by.entries()].sort((a, b) => b[1].length - a[1].length);
  const [top, topHits] = ranked[0]!;
  if (ranked.length >= 2 && hits.length >= 3) {
    const tie = ranked[1]![1].length === topHits.length;
    drafts.push(
      draft({
        pass: "style",
        category: "style",
        severity: "minor",
        action: "query",
        title: `Dates are written in ${ranked.length} formats`,
        body: `Dates appear as ${listing(ranked.map(([s, list]) => `${DESCRIBE[s]} (${q(list[0]!.text)}, ${times(list.length)})`))}. Please confirm which format you want.`,
        evidence: [
          ...(tie ? ranked : ranked.slice(1)).flatMap(([, list]) =>
            list.map((h) => ev(h.p.node.key, h.text, tie ? undefined : "less common form")),
          ),
          ...(tie ? [] : topHits.slice(0, 2).map((h) => ev(h.p.node.key, h.text, "usual form"))),
        ],
        fp: ["style.dates", ...ranked.map(([s]) => s).sort()],
      }),
    );
    if (!tie)
      detectedRules.push(
        detected(
          "dates",
          EXAMPLE[top],
          ranked.slice(1).map(([s]) => EXAMPLE[s]),
          `Write dates ${DESCRIBE[top]} (the manuscript's usual form).`,
        ),
      );
  } else if (ranked.length === 1 && topHits.length >= 3) {
    detectedRules.push(detected("dates", EXAMPLE[top], [], `Write dates ${DESCRIBE[top]}.`));
  }
  return { findings: finish(input, drafts), detectedRules };
}
