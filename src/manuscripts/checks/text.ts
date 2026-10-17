/**
 * Small text helpers shared by the checks. Pure string work: no DOM, no
 * network, so the checks run the same in the browser and in tests.
 */

/** Lower case, diacritics removed, curly apostrophes straightened. */
export const fold = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/[’‘`]/g, "'")
    .toLowerCase();

export const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const isLetter = (c: string | undefined): boolean => !!c && /\p{L}/u.test(c);
export const isUpper = (c: string | undefined): boolean => !!c && /\p{Lu}/u.test(c);

export const capitalise = (s: string): string => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

/** Give `word` the case pattern of `like` (all capitals, initial capital, or as is). */
export function matchCase(like: string, word: string): string {
  const letters = like.replace(/[^\p{L}]/gu, "");
  if (letters.length > 1 && letters === letters.toUpperCase()) return word.toUpperCase();
  if (isUpper(like[0])) return capitalise(word);
  return word;
}

/** Wraps a form in single curly quotes for finding titles and bodies. */
export const q = (s: string): string => `‘${s}’`;

export const times = (n: number): string => (n === 1 ? "once" : n === 2 ? "twice" : `${n} times`);

export const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n} ${n === 1 ? one : many}`;

/** "a, b and c" */
export function listing(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const OPENERS = new Set([" ", "\t", "\n", " ", '"', "'", "“", "‘", "(", "[", "«"]);
const DOTTED_ABBREVIATIONS = new Set(
  (
    "e.g i.e cf mr mrs ms dr st no nos vol vols p pp al etc viz vs v prof ed eds ch para paras " +
    "art arts s ss fig figs eq op cit ibid approx ca c jr sr inc ltd co corp dept govt min max n nn"
  ).split(" "),
);

/**
 * Whether the word starting at `idx` opens a sentence.
 * 1: plainly (start of the text, or after . ! ?);
 * 2: perhaps (after a colon, a bullet, a list number, an abbreviation);
 * 0: mid-sentence.
 */
export function initAt(raw: string, idx: number): 0 | 1 | 2 {
  let i = idx - 1;
  while (i >= 0 && OPENERS.has(raw[i]!)) i--;
  if (i < 0) return 1;
  const c = raw[i]!;
  if (c === ".") {
    let j = i - 1;
    while (j >= 0 && /[\p{L}.]/u.test(raw[j]!)) j--;
    const word = raw.slice(j + 1, i).toLowerCase();
    if (/\d/.test(raw[i - 1] ?? "")) return 2;
    if (word.replace(/\./g, "").length <= 1 || DOTTED_ABBREVIATIONS.has(word)) return 2;
    return 1;
  }
  if (c === "!" || c === "?" || c === "…") return 1;
  if (c === ":" || c === "•" || c === "·" || c === "–" || c === "—") return 2;
  if (c === ")") {
    const open = raw.lastIndexOf("(", i);
    if (open >= 0 && i - open <= 5) return 2;
  }
  return 0;
}

/**
 * The text with quoted matter, URLs and e-mail addresses blanked out (same
 * length, so offsets still line up with the raw text). Quoted words are the
 * quoted author's, not this author's, so spelling and convention checks do
 * not count them.
 */
export function maskQuotes(raw: string): string {
  const a = raw.split("");
  const blank = (s: number, e: number) => {
    for (let i = s; i <= e && i < a.length; i++) a[i] = " ";
  };
  for (const m of raw.matchAll(/\b(?:https?:\/\/|www\.)\S+|[\w.+-]+@[\w-]+\.[\w.]+/g))
    blank(m.index ?? 0, (m.index ?? 0) + m[0].length - 1);

  let i = raw.indexOf("“");
  while (i >= 0) {
    const j = raw.indexOf("”", i + 1);
    if (j < 0 || j - i > 1500) break;
    blank(i, j);
    i = raw.indexOf("“", j + 1);
  }

  const straight: number[] = [];
  for (let k = 0; k < raw.length; k++)
    if (raw[k] === '"' && !/\d/.test(raw[k - 1] ?? "")) straight.push(k);
  for (let k = 0; k + 1 < straight.length; k += 2)
    if (straight[k + 1]! - straight[k]! <= 1500) blank(straight[k]!, straight[k + 1]!);

  for (let k = 0; k < raw.length; k++) {
    const c = raw[k];
    const opens =
      (c === "‘" && !isLetter(raw[k - 1])) ||
      (c === "'" && (k === 0 || /[\s([—–]/.test(raw[k - 1]!)) && isLetter(raw[k + 1]));
    if (!opens) continue;
    const close = c === "‘" ? "’" : "'";
    let j = k + 1;
    for (; j < raw.length && j - k <= 1500; j++)
      if (raw[j] === close && !isLetter(raw[j + 1]) && !/\s/.test(raw[j - 1]!)) break;
    if (j < raw.length && j - k <= 1500 && raw[j] === close) {
      blank(k, j);
      k = j;
    }
  }
  return a.join("");
}

/** Extend [s, e) by whole words until the slice occurs once in `text`. */
export function uniqueSpan(text: string, s: number, e: number, maxSteps = 4): [number, number] {
  let a = s;
  let b = e;
  const unique = () => {
    const sub = text.slice(a, b);
    return text.indexOf(sub) === text.lastIndexOf(sub);
  };
  for (let step = 0; step < maxSteps && !unique(); step++) {
    if (a > 0) {
      let k = a;
      while (k > 0 && /\s/.test(text[k - 1]!)) k--;
      while (k > 0 && !/\s/.test(text[k - 1]!)) k--;
      a = k;
    }
    if (unique()) break;
    if (b < text.length) {
      let k = b;
      while (k < text.length && /\s/.test(text[k]!)) k++;
      while (k < text.length && !/\s/.test(text[k]!)) k++;
      b = k;
    }
  }
  return [a, b];
}

/** The slice [s, e) with up to `words` whole words either side, for evidence quotes. */
export function around(text: string, s: number, e: number, words = 2): string {
  let a = s;
  let b = e;
  for (let w = 0; w < words; w++) {
    while (a > 0 && /\s/.test(text[a - 1]!)) a--;
    while (a > 0 && !/\s/.test(text[a - 1]!)) a--;
    while (b < text.length && /\s/.test(text[b]!)) b++;
    while (b < text.length && !/\s/.test(text[b]!)) b++;
  }
  return text.slice(a, b).trim();
}

/** Levenshtein distance, giving up (returning max + 1) once it must exceed `max`. */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      cur.push(v);
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length]!;
}

export const WORD_NUMBERS: string[] = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
];

export function romanValue(s: string): number | null {
  if (!/^[ivxlcdm]+$/i.test(s)) return null;
  const v: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
  let total = 0;
  const t = s.toLowerCase();
  for (let i = 0; i < t.length; i++) {
    const cur = v[t[i]!]!;
    const next = v[t[i + 1] ?? ""] ?? 0;
    total += cur < next ? -cur : cur;
  }
  return total;
}

/** "4", "four", "IV" → "4"; anything else is returned trimmed and upper-cased. */
export function normaliseNumber(s: string): string {
  const t = s.trim().replace(/[.:]+$/, "");
  if (/^\d+(?:\.\d+)*$/.test(t)) return t.replace(/(^|\.)0+(\d)/g, "$1$2");
  const word = WORD_NUMBERS.indexOf(t.toLowerCase());
  if (word > 0) return String(word);
  if (t.length > 1 || /^[ivx]$/i.test(t)) {
    const r = romanValue(t);
    if (r !== null && /^[ivxlc]+$/i.test(t)) return String(r);
  }
  return t.toUpperCase();
}

/** The sentence around offset `idx`: from the previous . ! ? (or start) to the next. */
export function sentenceAt(text: string, idx: number): { s: number; e: number } {
  let s = idx;
  while (s > 0) {
    const c = text[s - 1]!;
    if ((c === "." || c === "!" || c === "?") && /\s/.test(text[s] ?? " ")) break;
    s--;
  }
  let e = idx;
  while (e < text.length) {
    const c = text[e]!;
    if ((c === "." || c === "!" || c === "?") && /\s|$/.test(text[e + 1] ?? "")) break;
    e++;
  }
  return { s, e: Math.min(text.length, e + 1) };
}
