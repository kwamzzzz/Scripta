/**
 * Proofreading mechanics that are plainly wrong and carry their own fix:
 * repeated words, double spaces, a space before punctuation, a missing space
 * after it, "a"/"an" before the wrong sound. Unbalanced brackets and quotation
 * marks cannot be fixed without knowing where the author meant them to end,
 * so they are queries.
 *
 * Every correction's `original` is an exact substring of the node's text,
 * with just enough context to be unique in it.
 */
import type { DraftFinding, ParsedNode } from "../model";
import { corpusOf, HEADING_KINDS, textOf } from "./corpus";
import { draft, ev, finish } from "./finding";
import { around, initAt, maskQuotes, q, uniqueSpan } from "./text";
import type { CheckInput, CheckResult } from "./types";

type Text = { node: ParsedNode; raw: string; english: boolean; masked: string };

/** Whether any of [s, e) lies inside a quotation: quoted words are not the author's to correct. */
const quoted = (t: Text, s: number, e: number): boolean => {
  for (let i = s; i < e; i++) if (t.masked[i] === " " && t.raw[i] !== " ") return true;
  return false;
};

/** A correction at [s, e) of `raw`, widened to a unique span. */
function correction(raw: string, s: number, e: number, fix: (span: string, s: number, e: number) => string) {
  const [a, b] = uniqueSpan(raw, s, e);
  const original = raw.slice(a, b);
  const replacement = original.slice(0, s - a) + fix(raw.slice(s, e), s, e) + original.slice(e - a);
  return { original, replacement };
}

/* ------------------------------------------------------ repeated words -- */

const DOUBLING_OK = new Set(["that", "had", "is", "was", "do", "does", "can", "will"]);

function repeatedWords(t: Text, out: DraftFinding[]) {
  // The second word is only looked ahead at, so "found the the" still pairs "the" with "the".
  for (const m of t.raw.matchAll(/(?<![\p{L}\p{N}'’-])(\p{L}+)(?=([ \u00a0]+)(\p{L}+)(?![\p{L}\p{N}'’-]))/gu)) {
    const [, a, gap, b] = m as unknown as [string, string, string, string];
    if (a.toLowerCase() !== b.toLowerCase()) continue;
    if (DOUBLING_OK.has(a.toLowerCase()) || (a.length === 1 && !/^a$/i.test(a))) continue;
    const s = m.index ?? 0;
    // Names such as "Walla Walla" and "Bora Bora": both capitalised mid-sentence.
    if (/^\p{Lu}/u.test(a) && /^\p{Lu}/u.test(b) && initAt(t.raw, s) === 0) continue;
    const e = s + a.length + gap.length + b.length;
    if (quoted(t, s, e)) continue;
    const c = correction(t.raw, s, e, () => a);
    out.push(
      draft({
        pass: "mechanics",
        category: "error",
        severity: "minor",
        action: "correction",
        title: `Repeated word: ${q(`${a} ${b}`)}`,
        body: `${q(a)} is written twice in a row.`,
        original: c.original,
        replacement: c.replacement,
        evidence: [ev(t.node.key, c.original)],
        fp: ["mechanics.repeated-word", c.original, around(t.raw, s, e, 3)],
      }),
    );
  }
}

/* -------------------------------------------------------------- spaces -- */

type Spot = { node: ParsedNode; quote: string };

function doubleSpaces(t: Text, spots: Map<string, Spot[]>, chapter: string) {
  for (const m of t.raw.matchAll(/(?<=\S) {2,}(?=\S)/g)) {
    const s = m.index ?? 0;
    if (quoted(t, s - 1, s + m[0].length + 1)) continue;
    const list = spots.get(chapter) ?? [];
    list.push({ node: t.node, quote: around(t.raw, s, s + m[0].length, 1) });
    spots.set(chapter, list);
  }
}

function spaceBeforePunctuation(t: Text, spots: Map<string, Spot[]>, chapter: string) {
  for (const m of t.raw.matchAll(/(?<=[\p{L}\p{N})\]”’"])( +)([,;:.!?])(?=\s|$|[\p{L}"”’)])/gu)) {
    const s = m.index ?? 0;
    const mark = m[2]!;
    const after = t.raw[s + m[0].length];
    if (quoted(t, s - 1, s + m[0].length)) continue;
    if (mark === "." && (t.raw.startsWith("..", s + m[1]!.length) || !/^\s?$/.test(after ?? ""))) continue;
    if ((mark === "?" || mark === "!" || mark === ":" || mark === ";") && !t.english) continue; // French spacing
    const key = `${chapter}\u0000${mark}`;
    const list = spots.get(key) ?? [];
    list.push({ node: t.node, quote: around(t.raw, s, s + m[0].length, 1) });
    spots.set(key, list);
  }
}

function missingSpaceAfter(t: Text, out: DraftFinding[]) {
  const re = /(\p{Ll}{2,})([,;:])(\p{L}{2,})|(\p{Ll}{2,})([.?!])(\p{Lu}\p{Ll}+)/gu;
  for (const m of t.raw.matchAll(re)) {
    const s = m.index ?? 0;
    const e = s + m[0].length;
    if (quoted(t, s, e)) continue;
    // Inside a URL, e-mail address, file name or code-like token.
    let a = s;
    while (a > 0 && !/\s/.test(t.raw[a - 1]!)) a--;
    let b = e;
    while (b < t.raw.length && !/\s/.test(t.raw[b]!)) b++;
    const token = t.raw.slice(a, b);
    if (/:\/\/|www\.|@|\/|\\|\.(?:com|org|net|gov|edu|pdf|docx?|html?)\b/i.test(token)) continue;
    const left = m[1] ?? m[4]!;
    const mark = m[2] ?? m[5]!;
    const c = correction(t.raw, s, e, (span) => `${span.slice(0, left.length + 1)} ${span.slice(left.length + 1)}`);
    out.push(
      draft({
        pass: "mechanics",
        category: "error",
        severity: "minor",
        action: "correction",
        title: `Missing space after ${q(mark)}`,
        body: `There is no space after the ${mark === "," ? "comma" : mark === "." ? "full stop" : mark === ";" ? "semicolon" : mark === ":" ? "colon" : "punctuation mark"} in ${q(t.raw.slice(s, e))}.`,
        original: c.original,
        replacement: c.replacement,
        evidence: [ev(t.node.key, c.original)],
        fp: ["mechanics.missing-space", c.original, around(t.raw, s, e, 3)],
      }),
    );
  }
}

/* --------------------------------------------------------------- a / an -- */

const SILENT_H = new Set(
  "hour hours hourly honest honestly honesty honour honours honourable honourably honor honors honorable honorary honorarium heir heirs heiress heirloom".split(
    " ",
  ),
);
const SOUNDED_H = new Set(
  "house houses home homes high higher highest highly huge human humans hundred hundreds half hand hands head heads health hard heavy hospital hospitals holding holder holders hearing hearings helpful host hot".split(
    " ",
  ),
);
const YOU_U = new Set(
  (
    "university universities universal universally union unions unique uniquely unit units united unity uniform uniformly " +
    "unilateral unilaterally unified unification unanimous unanimously usual usually use used user users useful usefully " +
    "usage utility utilities utilitarian utopia utopian uranium ubiquitous uganda ugandan ukrainian unicameral"
  ).split(" "),
);
const VOWEL_U = /^(?:un(?!i)|up|ult|umb|urb|urg|utt|ugl|udd)/;

/** "vowel", "consonant", or null when unsure (and then nothing is said). */
function soundOf(word: string): "vowel" | "consonant" | null {
  if (!/^\p{L}+(?:-\p{L}+)*$/u.test(word) || !/^[A-Za-z-]+$/.test(word)) return null;
  const letters = word.replace(/-/g, "");
  if (letters.length >= 2 && letters === letters.toUpperCase()) {
    // An initialism: read letter by letter only when it has no vowels to say it as a word.
    const c = letters[0]!;
    if (!/[AEIOU]/.test(letters)) return /[FHLMNRSX]/.test(c) ? "vowel" : "consonant";
    if (/[AEIO]/.test(c)) return "vowel";
    if (/[BCDGJKPQTVWYZ]/.test(c)) return "consonant";
    return null;
  }
  if (letters.length < 2) return null;
  const w = word.toLowerCase();
  // A capitalised name may be said as letters ("an Mab" for MAB) or be a brand ("a OneNote"):
  // judge it only where every reading agrees.
  if (/^\p{Lu}/u.test(word) && (/^on(e|ce)/.test(w) || /^[fhlmnrsx]/.test(w))) return null;
  if (w.startsWith("eu") || w.startsWith("ewe")) return "consonant";
  if (w === "one" || w === "once" || w.startsWith("one-")) return "consonant";
  if (w[0] === "u") {
    if (YOU_U.has(w)) return "consonant";
    if (w.startsWith("uni")) return null;
    return VOWEL_U.test(w) ? "vowel" : null;
  }
  if (w[0] === "h") {
    if (SILENT_H.has(w)) return "vowel";
    if (SOUNDED_H.has(w)) return "consonant";
    return null; // "an historic" is accepted usage
  }
  if (/^[aeio]/.test(w)) return "vowel";
  if (/^[bcdfgjklmnpqrstvwxyz]/.test(w)) {
    if (/^(?:x-|y[td])/.test(w)) return null;
    return "consonant";
  }
  return null;
}

function articles(t: Text, out: DraftFinding[]) {
  if (!t.english) return;
  for (const m of t.raw.matchAll(/(?<![\p{L}\p{N}'’(-])(a|an|A|An)[ \u00a0]+([\p{L}][\p{L}-]*)(?![\p{L}'’]|\.\p{L})/gu)) {
    const art = m[1]!;
    const word = m[2]!;
    const s = m.index ?? 0;
    // "A" capitalised mid-sentence is a label ("Part A", "Schedule A"), not the article.
    if (/^A/.test(art) && initAt(t.raw, s) === 0) continue;
    if (t.raw[s + m[0].length] === ")") continue;
    if (quoted(t, s, s + m[0].length) || word.length < 3) continue;
    const sound = soundOf(word);
    if (!sound) continue;
    const isAn = art.toLowerCase() === "an";
    if ((sound === "vowel") === isAn) continue;
    const fixed = isAn ? (art === "An" ? "A" : "a") : art === "A" ? "An" : "an";
    const e = s + m[0].length;
    const c = correction(t.raw, s, e, (span) => fixed + span.slice(art.length));
    out.push(
      draft({
        pass: "mechanics",
        category: "error",
        severity: "minor",
        action: "correction",
        title: `${q(`${art} ${word}`)} should read ${q(`${fixed} ${word}`)}`,
        body: `${q(word)} begins with a ${sound} sound, so it takes ${q(fixed.toLowerCase())}.`,
        original: c.original,
        replacement: c.replacement,
        evidence: [ev(t.node.key, c.original)],
        fp: ["mechanics.article", c.original, around(t.raw, s, e, 3)],
      }),
    );
  }
}

/* ----------------------------------------------------------- balancing -- */

/** Brackets left open and closed with nothing open, in reading order; "a)", "iv)" list markers excused. */
function balance(raw: string) {
  let open = 0;
  let strayClose = 0;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === "(") open++;
    else if (c === ")") {
      if (open > 0) open--;
      else if (!/(?:^|[\s;:,])(?:[a-z]|[ivx]{1,5}|\d{1,2})$/i.test(raw.slice(Math.max(0, i - 7), i))) strayClose++;
    }
  }
  const curlyOpen = (raw.match(/“/g) ?? []).length;
  const curlyClose = (raw.match(/”/g) ?? []).length;
  return { open, strayClose, curly: curlyOpen - curlyClose };
}

function unbalanced(texts: Text[], out: DraftFinding[]) {
  const fine = (b: ReturnType<typeof balance>) => b.open === 0 && b.strayClose === 0;
  texts.forEach((t, i) => {
    if (t.node.kind === "footnote" || t.node.kind === "endnote" || HEADING_KINDS.has(t.node.kind)) return;
    // Execution blocks line up brackets as layout: "SIGNED by X )".
    if (/\s\)/.test(t.raw)) return;
    const b = balance(t.raw);
    // A paragraph split across a page break (or read as two atoms) closes in its neighbour.
    const prev = texts[i - 1];
    const next = texts[i + 1];
    const withNext = next ? balance(`${t.raw} ${next.raw}`) : null;
    const withPrev = prev ? balance(`${prev.raw} ${t.raw}`) : null;
    const nb = next ? balance(next.raw) : null;
    const pb = prev ? balance(prev.raw) : null;
    const closesInNext = !!nb && b.strayClose === 0 && nb.open === 0 && b.open === nb.strayClose;
    const opensInPrev = !!pb && b.open === 0 && pb.strayClose === 0 && pb.open === b.strayClose;
    const problems: string[] = [];
    if (!fine(b) && !closesInNext && !opensInPrev)
      problems.push(b.open > 0 ? "an opening bracket that is never closed" : "a closing bracket with no opening one");
    if (b.curly !== 0) {
      // A quotation running over several paragraphs opens each one and closes only at the end.
      const continued = b.curly > 0 && /^\s*“/.test(t.raw) && !!next && /^\s*“/.test(next.raw);
      if (!continued && !(withNext && withNext.curly === 0) && !(withPrev && withPrev.curly === 0))
        problems.push(b.curly > 0 ? "an opening quotation mark that is never closed" : "a closing quotation mark with no opening one");
    }
    if (!problems.length) return;
    out.push(
      draft({
        pass: "mechanics",
        category: "error",
        severity: "minor",
        action: "query",
        title: problems.length > 1 ? "Unbalanced brackets and quotation marks" : `Unbalanced ${problems[0]!.includes("bracket") ? "brackets" : "quotation marks"}`,
        body: `This ${t.node.kind === "list_item" ? "list item" : "paragraph"} has ${problems.join(" and ")}. Please check where ${problems.length > 1 ? "they" : "it"} should end.`,
        evidence: [ev(t.node.key, around(t.raw, 0, 0, 8))],
        fp: ["mechanics.unbalanced", problems.join("|"), around(t.raw, 0, 0, 8)],
      }),
    );
  });
}

/* --------------------------------------------------------------- check -- */

export function checkMechanics(input: CheckInput): CheckResult {
  const corpus = corpusOf(input.nodes);
  const texts: Text[] = [];
  for (const n of input.nodes) {
    const prose = corpus.proseByKey.get(n.key);
    if (prose) texts.push({ node: n, raw: prose.raw, english: prose.english, masked: prose.masked });
    else if (HEADING_KINDS.has(n.kind) && textOf(n).trim())
      texts.push({ node: n, raw: textOf(n), english: true, masked: maskQuotes(textOf(n)) });
  }

  const drafts: DraftFinding[] = [];
  const doubles = new Map<string, Spot[]>();
  const before = new Map<string, Spot[]>();
  for (const t of texts) {
    const chapter = corpus.chapterOf(t.node.key) ?? "";
    repeatedWords(t, drafts);
    doubleSpaces(t, doubles, chapter);
    spaceBeforePunctuation(t, before, chapter);
    missingSpaceAfter(t, drafts);
    articles(t, drafts);
  }
  unbalanced(texts, drafts);

  const chapterName = (key: string) => {
    const n = corpus.byKey.get(key);
    return n ? ` in ${q(textOf(n).trim().slice(0, 60))}` : "";
  };
  for (const [chapter, spots] of doubles)
    drafts.push(
      draft({
        pass: "mechanics",
        category: "error",
        severity: "minor",
        action: "correction",
        title: spots.length === 1 ? "Double space" : `${spots.length} double spaces${chapterName(chapter)}`,
        body: `Two or more spaces stand where one is wanted${spots.length > 1 ? ` in ${spots.length} places` : ""}. Each should be a single space.`,
        original: "  ",
        replacement: " ",
        evidence: spots.map((sp) => ev(sp.node.key, sp.quote)),
        fp: ["mechanics.double-space", chapter ? textOf(corpus.byKey.get(chapter)!).slice(0, 80) : "front"],
      }),
    );
  for (const [key, spots] of before) {
    const [chapter, mark] = key.split("\u0000") as [string, string];
    drafts.push(
      draft({
        pass: "mechanics",
        category: "error",
        severity: "minor",
        action: "correction",
        title: `Space before ${q(mark)}${spots.length > 1 ? ` (${spots.length} places)` : ""}`,
        body: `There is a space before the ${q(mark)}${spots.length > 1 ? ` in ${spots.length} places` : ""}. It should follow the preceding word directly.`,
        original: ` ${mark}`,
        replacement: mark,
        evidence: spots.map((sp) => ev(sp.node.key, sp.quote)),
        fp: ["mechanics.space-before", mark, chapter ? textOf(corpus.byKey.get(chapter)!).slice(0, 80) : "front"],
      }),
    );
  }
  return { findings: finish(input, drafts), detectedRules: [] };
}
