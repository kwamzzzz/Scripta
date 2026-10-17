/**
 * Cross-references: tables, figures, chapters, sections, appendices and
 * equations referred to but not there; tables and figures numbered out of
 * sequence, twice, or never referred to; the contents list against the
 * headings; heading levels and numbers that skip.
 *
 * Precision first. A reference that may point outside the manuscript ("Table
 * 3 of the Annual Report", "section 4.2 of the Companies Act", anything
 * inside a citation) is not judged, and a kind of target the parser found
 * none of at all (no numbered equations, say) is not judged either.
 */
import type { DraftFinding, ParsedNode } from "../model";
import { corpusOf, HEADING_KINDS, textOf } from "./corpus";
import { draft, ev, finish } from "./finding";
import { fold, listing, normaliseNumber, q, sentenceAt, times, WORD_NUMBERS } from "./text";
import type { CheckInput, CheckResult } from "./types";

type Scheme = "table" | "figure";
const LABEL: Record<Scheme, string> = { table: "Table", figure: "Figure" };

/** Any table or figure number, as a caption writes it ("6.2", "6-2", "A.1", "IV", "3a"). */
const NUM = String.raw`(?:\d+|[IVXLC]+\b|[A-Z]\b)(?:[.\-–]\d+)*[a-z]?`;

/**
 * A number in a reference, and a list of them. Where the captions number
 * with dots, "3-5" is a range; only where they number "6-2" is it a number.
 */
function refPatterns(hyphenated: boolean): { num: string; list: string } {
  const num = hyphenated ? NUM : String.raw`(?:\d+|[IVXLC]+\b|[A-Z]\b)(?:\.\d+)*[a-z]?`;
  const sep = hyphenated ? String.raw`(?:,|and|&|or|to)` : String.raw`(?:,|and|&|or|to|–|-)`;
  return { num, list: String.raw`${num}(?:\s*${sep}\s*${num})*` };
}

/** "6-2" → "6.2", "3a" → "3", "IV" → "4". */
function normFigNum(s: string): string {
  const t = s.trim().replace(/[-–]/g, ".").replace(/(\d)[a-z]$/, "$1");
  return t
    .split(".")
    .map((part) => (/^\d+$/.test(part) ? String(Number(part)) : normaliseNumber(part)))
    .join(".");
}

const CAPTION_LEAD = new RegExp(String.raw`^\s*(Table|TABLE|Figure|FIGURE|Fig\.|FIG\.)\s+(${NUM})`);

type Def = { scheme: Scheme; num: string; raw: string; node: ParsedNode; ord: number };

function defOf(n: ParsedNode): { scheme: Scheme; raw: string } | null {
  const pick = (s: string) => {
    const m = CAPTION_LEAD.exec(s);
    return m ? { scheme: (/^t/i.test(m[1]!) ? "table" : "figure") as Scheme, raw: m[2]! } : null;
  };
  if (n.kind === "caption" || n.kind === "table" || n.kind === "figure")
    return pick(n.number) ?? pick(n.label) ?? pick(n.text);
  if (n.kind === "paragraph") {
    const m = CAPTION_LEAD.exec(n.text);
    if (!m) return null;
    const rest = n.text.trim().slice(m[0].length);
    if ((n.style && /caption/i.test(n.style)) || /^\s*[:.\-–—|]\s/.test(rest))
      return { scheme: /^t/i.test(m[1]!) ? "table" : "figure", raw: m[2]! };
  }
  return null;
}

/** Tables and figures as numbered, a caption and its table counted once. */
function definitions(nodes: ParsedNode[]): Def[] {
  const out: Def[] = [];
  nodes.forEach((n, ord) => {
    const d = defOf(n);
    if (!d) return;
    const num = normFigNum(d.raw);
    const last = [...out].reverse().find((x) => x.scheme === d.scheme);
    const pair = (a: ParsedNode, b: ParsedNode) =>
      (a.kind === "caption" || a.kind === "paragraph") !== (b.kind === "caption" || b.kind === "paragraph");
    if (last && last.num === num && ord - last.ord <= 2 && pair(last.node, n)) return;
    out.push({ scheme: d.scheme, num, raw: d.raw, node: n, ord });
  });
  return out;
}

/** Numbers in "6.1, 6.2 and 6.4" or "3–5" (a range of whole numbers expands). */
function numbersIn(list: string, num: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`(${num})|(to|–|-)`, "g");
  let range = false;
  for (const m of list.matchAll(re)) {
    if (m[2]) {
      range = true;
      continue;
    }
    const n = normFigNum(m[1]!);
    const prev = out[out.length - 1];
    if (range && prev) {
      const a = /^(.*?)(\d+)$/.exec(prev);
      const b = /^(.*?)(\d+)$/.exec(n);
      if (a && b && a[1] === b[1] && Number(b[2]) - Number(a[2]) < 50)
        for (let k = Number(a[2]) + 1; k < Number(b[2]); k++) out.push(`${a[1]}${k}`);
    }
    range = false;
    out.push(n);
  }
  return out;
}

/** The text of a prose node, less a caption's own label. */
function scanText(n: ParsedNode): string {
  if (n.kind === "caption") return n.text.replace(CAPTION_LEAD, (m) => " ".repeat(m.length));
  return n.text;
}

const YEAR = /\b(?:1[6-9]|20)\d{2}[a-z]?\b/;
const LEGAL = /\b(?:Acts?|Regulations?|Code|Constitution|Directive|Convention|Treaty|Law|Laws|Ordinance|Decree|Rules|Bill|Statute|Charter|Protocol|Agreement|Guidelines?|Proclamation)\b/;

/** Whether a reference at [s, e) may point outside the manuscript. */
function external(text: string, s: number, e: number, legal: boolean): boolean {
  const after = text.slice(e, e + 60);
  if (/^\s+of\b/i.test(after)) return true;
  if (
    /^\s+in\s+/i.test(after) &&
    !/^\s+in\s+(?:this|chapter|section|appendix|the\s+(?:previous|next|following|preceding|present|last|first|second|third)\s+(?:chapter|section))\b/i.test(after)
  )
    return true;
  if (/^\s*\(\s*\d/.test(after)) return true; // section 4(2)
  const sent = sentenceAt(text, s);
  if (YEAR.test(text.slice(sent.s, s))) return true;
  // Inside brackets that also hold a year: a citation.
  const open = text.lastIndexOf("(", s);
  if (open !== -1 && text.lastIndexOf(")", s) < open) {
    const close = text.indexOf(")", e);
    if (YEAR.test(text.slice(open, close === -1 ? e : close))) return true;
  }
  if (legal && LEGAL.test(text.slice(sent.s, sent.e))) return true;
  return false;
}

type Ref = { kind: string; label: string; num: string; node: ParsedNode; quote: string };

export function checkReferences(input: CheckInput): CheckResult {
  const nodes = input.nodes;
  const corpus = corpusOf(nodes);
  const drafts: DraftFinding[] = [];

  const defs = definitions(nodes);
  const tables = new Set(defs.filter((d) => d.scheme === "table").map((d) => d.num));
  const figures = new Set(defs.filter((d) => d.scheme === "figure").map((d) => d.num));

  const chapterNodes = nodes.filter((n) => n.kind === "chapter");
  const isAppendix = (n: ParsedNode) => /^\s*(?:appendix|annex|annexure)\b/i.test(textOf(n));
  const chapters = new Set<string>();
  const appendices = new Set<string>();
  chapterNodes
    .filter((n) => !isAppendix(n))
    .forEach((n, i) => {
      chapters.add(String(i + 1));
      if (n.number) chapters.add(normaliseNumber(n.number));
    });
  for (const n of nodes) {
    if (!HEADING_KINDS.has(n.kind) && n.kind !== "front") continue;
    const m = /^\s*(?:appendix|annex|annexure)\s+(\d+|[A-Z]|[IVX]+)\b/i.exec(textOf(n));
    if (m) appendices.add(m[1]!.toUpperCase());
  }
  const sections = new Set<string>();
  for (const n of nodes)
    if (HEADING_KINDS.has(n.kind) && n.number) sections.add(n.number.replace(/\.$/, ""));
  const dottedSections = [...sections].some((s) => s.includes("."));
  const equations = new Set(
    nodes.filter((n) => n.kind === "equation" && n.number).map((n) => n.number.replace(/[()]/g, "").trim()),
  );

  // References.
  const refs: Ref[] = [];
  const refTexts = nodes.filter((n) => corpus.proseByKey.has(n.key) && n.kind !== "front");
  const wordNum = WORD_NUMBERS.slice(1).join("|");
  const { num: REF_NUM, list: NUM_LIST } = refPatterns(defs.some((d) => /\d[-–]\d/.test(d.raw)));
  const patterns: { kind: string; label: string; re: RegExp; legal: boolean }[] = [
    { kind: "table", label: "Table", re: new RegExp(String.raw`\b(?:Tables?|Tab\.)\s+(${NUM_LIST})`, "g"), legal: false },
    {
      kind: "figure",
      label: "Figure",
      re: new RegExp(String.raw`\b(?:Figures?|Figs?\.)\s+(${NUM_LIST})`, "g"),
      legal: false,
    },
    {
      kind: "chapter",
      label: "Chapter",
      re: new RegExp(String.raw`\b[Cc]hapters?\s+((?:\d+|${wordNum}|[IVXL]+\b)(?:\s*(?:,|and|&|or|to|–|-)\s*(?:\d+|${wordNum}|[IVXL]+\b))*)(?![.\d])`, "gi"),
      legal: true,
    },
    {
      kind: "section",
      label: "Section",
      re: /(?:\b[Ss]ections?|§§?)\s*(\d+\.\d+(?:\.\d+)*(?:\s*(?:,|and|&|or|to|–|-)\s*\d+\.\d+(?:\.\d+)*)*)(?![.\d])/g,
      legal: true,
    },
    { kind: "appendix", label: "Appendix", re: /\bAppendi(?:x|ces)\s+([A-Z]|\d+)\b(?!\.\d)/g, legal: true },
    {
      kind: "equation",
      label: "Equation",
      re: /\b(?:Equations?|Eqs?\.)\s*\(?(\d+(?:\.\d+)*)\)?/g,
      legal: false,
    },
  ];
  for (const n of refTexts) {
    const text = scanText(n);
    for (const pat of patterns) {
      pat.re.lastIndex = 0;
      for (const m of text.matchAll(pat.re)) {
        const s = m.index ?? 0;
        const e = s + m[0].length;
        if (external(text, s, e, pat.legal)) continue;
        const nums =
          pat.kind === "chapter"
            ? m[1]!.split(/\s*(?:,|and|&|or|to|–|-)\s*/i).map((x) => normaliseNumber(x))
            : pat.kind === "section"
              ? m[1]!.split(/\s*(?:,|and|&|or|to|–|-)\s*/).map((x) => x.trim())
              : pat.kind === "appendix" || pat.kind === "equation"
                ? [m[1]!.toUpperCase()]
                : numbersIn(m[1]!, REF_NUM);
        if (pat.kind === "chapter" && /(?:^|[\s,&-])(?:I|[ivxl]+)(?:$|[\s,&-])/.test(m[1]!)) continue; // "chapter I argue"
        // In a note, "Smith, Table 3" is someone else's table: only "see Table 3" and the like count.
        if (
          (n.kind === "footnote" || n.kind === "endnote") &&
          !/(?:\b(?:see|See|cf\.|in|In|and|also)\s+)$/.test(text.slice(Math.max(0, s - 12), s)) &&
          !/^\s+(?:above|below)\b/.test(text.slice(e, e + 8))
        )
          continue;
        for (const num of nums) refs.push({ kind: pat.kind, label: pat.label, num, node: n, quote: m[0].trim() });
      }
    }
  }

  // With none found at all, a PDF may simply not have yielded them; a Word file would have.
  const reliable = input.format === "docx";
  const noTables = !tables.size && !nodes.some((n) => n.kind === "table");
  const noFigures = !figures.size && !nodes.some((n) => n.kind === "figure");
  const exists = (r: Ref): boolean | null => {
    switch (r.kind) {
      case "table":
        return tables.size ? tables.has(r.num) : reliable && noTables ? false : null;
      case "figure":
        return figures.size ? figures.has(r.num) : reliable && noFigures ? false : null;
      case "chapter":
        return chapterNodes.length ? chapters.has(r.num) : null;
      case "section": {
        if (!dottedSections) return null;
        const chapter = r.num.split(".")[0]!;
        if (!chapters.has(chapter)) return null; // perhaps a statute's section
        return sections.has(r.num);
      }
      case "appendix":
        return appendices.size ? appendices.has(r.num) : null;
      case "equation":
        return equations.size ? equations.has(r.num) : null;
    }
    return null;
  };

  const missing = new Map<string, Ref[]>();
  for (const r of refs) {
    if (exists(r) !== false) continue;
    const k = `${r.kind}\u0000${r.num}`;
    missing.set(k, [...(missing.get(k) ?? []), r]);
  }
  const existingList = (kind: string, num: string): string => {
    const prefix = num.includes(".") ? num.slice(0, num.lastIndexOf(".") + 1) : "";
    const pool =
      kind === "table" ? tables : kind === "figure" ? figures : kind === "section" ? sections : kind === "chapter" ? chapters : kind === "appendix" ? appendices : equations;
    const near = [...pool].filter((x) => (prefix ? x.startsWith(prefix) : !x.includes("."))).sort(byNumber);
    return near.length ? listing(near.slice(0, 8)) : "";
  };
  for (const list of missing.values()) {
    const r = list[0]!;
    const noun = r.kind === "section" ? "heading" : r.kind;
    const near = existingList(r.kind, r.num);
    drafts.push(
      draft({
        pass: "references",
        category: "cross_reference",
        severity: "material",
        action: "query",
        title: `${r.label} ${r.num} is referred to but does not exist`,
        body: `The text refers to ${r.label} ${r.num} ${times(list.length)}, but no ${noun} carries that number.${near ? ` The ${noun}s numbered in this series are ${near}.` : r.kind === "table" || r.kind === "figure" ? ` The manuscript has no numbered ${noun}s at all.` : ""} Please correct the reference or the numbering.`,
        evidence: list.map((x) => ev(x.node.key, x.quote)),
        fp: ["references.missing", r.kind, r.num],
      }),
    );
  }

  // Numbering of tables and figures.
  for (const scheme of ["table", "figure"] as Scheme[]) {
    const list = defs.filter((d) => d.scheme === scheme);
    if (!list.length) continue;
    const seen = new Map<string, Def[]>();
    for (const d of list) seen.set(d.num, [...(seen.get(d.num) ?? []), d]);
    for (const [num, same] of seen)
      if (same.length > 1)
        drafts.push(
          draft({
            pass: "references",
            category: "cross_reference",
            severity: "material",
            action: "query",
            title: `${LABEL[scheme]} ${num} is numbered twice`,
            body: `${same.length} ${scheme}s carry the number ${num}, so a reference to ${LABEL[scheme]} ${num} is ambiguous. Please renumber.`,
            evidence: same.map((d) => ev(d.node.key, textOf(d.node).slice(0, 80))),
            fp: ["references.duplicate", scheme, num],
          }),
        );

    const numeric = list.filter((d) => /^\d+(?:\.\d+)?$/.test(d.num));
    const dotted = numeric.filter((d) => d.num.includes("."));
    if (numeric.length !== list.length || (dotted.length && dotted.length !== numeric.length)) continue;
    const groups = new Map<string, Def[]>();
    for (const d of numeric) {
      const prefix = d.num.includes(".") ? d.num.split(".")[0]! : "";
      groups.set(prefix, [...(groups.get(prefix) ?? []), d]);
    }
    for (const [prefix, g] of groups) {
      const values = g.map((d) => Number(d.num.split(".").pop()));
      const name = (v: number) => `${LABEL[scheme]} ${prefix ? `${prefix}.` : ""}${v}`;
      const inversion = values.findIndex((v, i) => i > 0 && v < values[i - 1]!);
      if (inversion > 0)
        drafts.push(
          draft({
            pass: "references",
            category: "cross_reference",
            severity: "minor",
            action: "query",
            title: `${name(values[inversion - 1]!)} comes before ${name(values[inversion]!)}`,
            body: `The ${scheme}s are out of order: ${name(values[inversion - 1]!)} appears before ${name(values[inversion]!)}. Please renumber them in the order they appear.`,
            evidence: [g[inversion - 1]!, g[inversion]!].map((d) => ev(d.node.key, textOf(d.node).slice(0, 80))),
            fp: ["references.order", scheme, prefix, String(values[inversion - 1]), String(values[inversion])],
          }),
        );
      const have = new Set(values);
      const max = Math.max(...values);
      for (let v = 1; v < max; v++) {
        if (have.has(v)) continue;
        const num = `${prefix ? `${prefix}.` : ""}${v}`;
        if (missing.has(`${scheme}\u0000${num}`)) continue; // already raised as a missing reference
        const before = g.filter((d) => Number(d.num.split(".").pop()) < v).pop();
        const after = g.find((d) => Number(d.num.split(".").pop()) > v);
        drafts.push(
          draft({
            pass: "references",
            category: "cross_reference",
            severity: "minor",
            action: "query",
            title: `There is no ${name(v)}`,
            body: `The ${scheme} numbering skips ${name(v)}${before && after ? `: ${LABEL[scheme]} ${before.num} is followed by ${LABEL[scheme]} ${after.num}` : ""}. Please check whether a ${scheme} is missing or the numbering is wrong.`,
            evidence: [before, after].filter((d): d is Def => !!d).map((d) => ev(d.node.key, textOf(d.node).slice(0, 80))),
            fp: ["references.gap", scheme, num],
          }),
        );
      }
    }
  }

  // Tables and figures never referred to.
  const mentioned: Record<Scheme, Set<string>> = { table: new Set(), figure: new Set() };
  const lenient = new RegExp(String.raw`\b(tables?|tab\.|figures?|figs?\.)\s+(${NUM_LIST})`, "gi");
  for (const n of nodes) {
    if (!corpus.proseByKey.has(n.key) && n.kind !== "quote" && n.kind !== "table") continue;
    for (const m of scanText(n).matchAll(lenient)) {
      const scheme: Scheme = /^t/i.test(m[1]!) ? "table" : "figure";
      for (const num of numbersIn(m[2]!, REF_NUM)) mentioned[scheme].add(num);
    }
  }
  const unreferenced = defs.filter(
    (d, i) => !mentioned[d.scheme].has(d.num) && defs.findIndex((x) => x.scheme === d.scheme && x.num === d.num) === i,
  );
  for (const scheme of ["table", "figure"] as Scheme[]) {
    const list = unreferenced.filter((d) => d.scheme === scheme);
    if (!list.length) continue;
    if (list.length > 8) {
      drafts.push(
        draft({
          pass: "references",
          category: "cross_reference",
          severity: "minor",
          action: "suggestion",
          title: `${list.length} ${scheme}s are never referred to in the text`,
          body: `Each ${scheme} is usually introduced in the text before it appears ("see ${LABEL[scheme]} ${list[0]!.num}"). These ${scheme}s are not mentioned anywhere: ${listing(list.slice(0, 10).map((d) => d.num))}${list.length > 10 ? " and others" : ""}.`,
          evidence: list.map((d) => ev(d.node.key, textOf(d.node).slice(0, 80))),
          fp: ["references.unreferenced", scheme, "many"],
        }),
      );
      continue;
    }
    for (const d of list)
      drafts.push(
        draft({
          pass: "references",
          category: "cross_reference",
          severity: "minor",
          action: "suggestion",
          title: `${LABEL[scheme]} ${d.num} is never referred to in the text`,
          body: `${LABEL[scheme]} ${d.num} is not mentioned anywhere in the text. Consider introducing it where it is discussed, for example "see ${LABEL[scheme]} ${d.num}".`,
          evidence: [ev(d.node.key, textOf(d.node).slice(0, 80))],
          fp: ["references.unreferenced", scheme, d.num],
        }),
      );
  }

  drafts.push(...contents(nodes), ...headingOrder(nodes));
  return { findings: finish(input, drafts), detectedRules: [] };
}

function byNumber(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? -1) - (pb[i] ?? -1);
    if (d) return Number.isNaN(d) ? a.localeCompare(b) : d;
  }
  return 0;
}

/* ------------------------------------------------------------ contents -- */

/** A heading or contents line reduced to its words: no number, no "Chapter 4:", no page. */
export function normHeading(s: string): string {
  const wordNum = WORD_NUMBERS.slice(1).join("|");
  return fold(s)
    .replace(/\t.*$/, "")
    .replace(/(?:\s*\.{2,}|\s*…+)\s*\S*$/, "")
    .replace(/\s+(?:\d+|[ivxlc]+)\s*$/, "")
    .replace(new RegExp(`^(?:chapter|part|appendix|annex)\\s+(?:\\d+|[ivxlc]+|[a-z]|${wordNum})\\b[\\s.:\\-–—]*`), "")
    .replace(/^(?:\d+(?:\.\d+)*|[ivxlc]+|[a-z])[.)]?\s+/, "")
    .replace(/&/g, "and")
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contents(nodes: ParsedNode[]): DraftFinding[] {
  const toc = nodes.filter((n) => n.kind === "toc_entry" && !/^\s*(?:table|figure|fig\.)\s/i.test(n.text));
  if (toc.length < 3) return [];
  const headings = new Map<string, ParsedNode>();
  // A short line of its own ("Exhibit A") may be a heading the file never styled as one.
  const shortLine = (n: ParsedNode) =>
    (n.kind === "paragraph" || n.kind === "caption") && n.text.trim().split(/\s+/).length <= 12;
  for (const n of nodes)
    if (HEADING_KINDS.has(n.kind) || n.kind === "front" || shortLine(n)) {
      for (const s of [n.label, n.text]) {
        const k = normHeading(s);
        if (k && !headings.has(k)) headings.set(k, n);
      }
    }
  const unmatched = toc.filter((t) => {
    const k = normHeading(t.text);
    return k && !headings.has(k);
  });
  // If most of the contents matches nothing, the headings were not read reliably: say nothing.
  if (unmatched.length > toc.length / 2) return [];

  const out: DraftFinding[] = [];
  const byNumberKey = new Map<string, ParsedNode>();
  for (const n of nodes) if (HEADING_KINDS.has(n.kind) && n.number) byNumberKey.set(normaliseNumber(n.number), n);
  const explained = new Set<string>();
  for (const t of unmatched) {
    const num = t.number || /^\s*(?:chapter\s+)?(\d+(?:\.\d+)*)/i.exec(t.text)?.[1] || "";
    const actual = num ? byNumberKey.get(normaliseNumber(num)) : undefined;
    if (actual) explained.add(actual.key);
    out.push(
      draft({
        pass: "references",
        category: "cross_reference",
        severity: "minor",
        action: "query",
        title: `Contents entry ${q(t.text.trim().slice(0, 60))} does not match a heading`,
        body: actual
          ? `The contents lists ${q(t.text.trim())}, but the heading ${num ? `numbered ${num} ` : ""}reads ${q(textOf(actual).trim())}. Please bring them into line.`
          : `The contents lists ${q(t.text.trim())}, but no heading in the manuscript reads that way. Please update the contents or the heading.`,
        evidence: [ev(t.key, t.text.trim()), ...(actual ? [ev(actual.key, textOf(actual).trim())] : [])],
        fp: ["references.toc.unmatched", normHeading(t.text)],
      }),
    );
  }

  const tocKeys = new Set(toc.map((t) => normHeading(t.text)));
  const chapters = nodes.filter((n) => n.kind === "chapter" || n.kind === "part");
  const found = chapters.filter((c) => tocKeys.has(normHeading(textOf(c))));
  if (found.length >= chapters.length / 2)
    for (const c of chapters) {
      const k = normHeading(textOf(c));
      if (!k || explained.has(c.key) || tocKeys.has(k) || tocKeys.has(normHeading(c.label))) continue;
      out.push(
        draft({
          pass: "references",
          category: "cross_reference",
          severity: "minor",
          action: "query",
          title: `${q(textOf(c).trim().slice(0, 60))} is missing from the contents`,
          body: `The ${c.kind} ${q(textOf(c).trim())} does not appear in the table of contents. Please add it or update the contents.`,
          evidence: [ev(c.key, textOf(c).trim())],
          fp: ["references.toc.missing", k],
        }),
      );
    }
  return out;
}

/* ------------------------------------------------------ heading order -- */

/**
 * Beyond this many heading problems the "headings" are more likely list
 * numbering or body text read as headings (a contract, a badly styled file)
 * than the author's structure, and a page of queries would be noise.
 */
const HEADING_NOISE = 8;

function headingOrder(nodes: ParsedNode[]): DraftFinding[] {
  const levels: DraftFinding[] = [];
  const out: DraftFinding[] = [];
  const heads = nodes.filter((n) => HEADING_KINDS.has(n.kind));
  let prev: ParsedNode | null = null;
  for (const h of heads) {
    if (prev && h.level > prev.level + 1)
      levels.push(
        draft({
          pass: "references",
          category: "cross_reference",
          severity: "minor",
          action: "query",
          title: `Heading level jumps from ${prev.level} to ${h.level}`,
          body: `${q(textOf(h).trim())} is a level ${h.level} heading, but the heading before it (${q(textOf(prev).trim())}) is level ${prev.level}, so a level is skipped. Please check the heading style.`,
          evidence: [ev(prev.key, textOf(prev).trim()), ev(h.key, textOf(h).trim())],
          fp: ["references.heading-level", normHeading(textOf(h))],
        }),
      );
    prev = h;
  }

  // Numbering: 4.1 then 4.3; 4.2 twice; 1, 2, 4 for chapters.
  const numOf = (h: ParsedNode) => normaliseNumber(h.number);
  const numbered = heads.filter((h) => h.number && /^\d+(?:\.\d+)*$/.test(numOf(h)));
  // Undotted numbers restart per chapter ("1. Background" in every chapter), so they are
  // compared within their chapter and level; chapters and parts among themselves.
  const groups = new Map<string, { prefix: string; list: ParsedNode[] }>();
  for (const h of numbered) {
    const num = numOf(h);
    const prefix = num.includes(".") ? num.slice(0, num.lastIndexOf(".")) : "";
    const scope = prefix
      ? `${prefix}|${h.level}`
      : h.kind === "heading"
        ? `|${h.level}|${h.chapterKey ?? ""}`
        : `|${h.kind}`;
    const g = groups.get(scope) ?? { prefix, list: [] };
    g.list.push(h);
    groups.set(scope, g);
  }
  const paragraphStarts = new Set(
    nodes
      .filter((n) => n.kind === "paragraph")
      .map((n) => /^\s*(\d+(?:\.\d+)+)\s/.exec(n.text)?.[1])
      .filter((x): x is string => !!x),
  );
  // Numbering that starts again at 1 (a second agreement, a schedule) is a new series, not a repeat.
  const series: { prefix: string; list: ParsedNode[] }[] = [];
  for (const { prefix, list } of groups.values()) {
    let cur: ParsedNode[] = [];
    for (const h of list) {
      const v = Number(numOf(h).split(".").pop());
      if (cur.length && v === 1) {
        series.push({ prefix, list: cur });
        cur = [];
      }
      cur.push(h);
    }
    if (cur.length) series.push({ prefix, list: cur });
  }
  for (const { prefix, list: g } of series) {
    const nums = g.map((h) => Number(numOf(h).split(".").pop()));
    const name = (v: number) => (prefix ? `${prefix}.${v}` : String(v));
    const seen = new Map<number, ParsedNode[]>();
    g.forEach((h, i) => seen.set(nums[i]!, [...(seen.get(nums[i]!) ?? []), h]));
    for (const [v, same] of seen)
      if (same.length > 1)
        out.push(
          draft({
            pass: "references",
            category: "cross_reference",
            severity: "minor",
            action: "query",
            title: `Heading number ${name(v)} is used ${times(same.length)}`,
            body: `${same.length} headings are numbered ${name(v)}. Please renumber so each is unique.`,
            evidence: same.map((h) => ev(h.key, textOf(h).trim())),
            fp: ["references.heading-duplicate", name(v)],
          }),
        );
    for (let i = 1; i < nums.length; i++) {
      const a = nums[i - 1]!;
      const b = nums[i]!;
      if (b <= a + 1) continue;
      const skipped = Array.from({ length: b - a - 1 }, (_, k) => name(a + 1 + k)).filter(
        (n) => !paragraphStarts.has(n),
      );
      if (!skipped.length) continue;
      out.push(
        draft({
          pass: "references",
          category: "cross_reference",
          severity: "minor",
          action: "query",
          title: `Heading numbering skips ${listing(skipped)}`,
          body: `${q(textOf(g[i - 1]!).trim())} is followed by ${q(textOf(g[i]!).trim())}, so ${listing(skipped)} ${skipped.length === 1 ? "is" : "are"} missing. Please check the numbering.`,
          evidence: [ev(g[i - 1]!.key, textOf(g[i - 1]!).trim()), ev(g[i]!.key, textOf(g[i]!).trim())],
          fp: ["references.heading-gap", name(a), name(b)],
        }),
      );
    }
  }
  return [...(levels.length > HEADING_NOISE ? [] : levels), ...(out.length > HEADING_NOISE ? [] : out)];
}
