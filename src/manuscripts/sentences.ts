/**
 * Below the paragraph: sentences.
 *
 * A paragraph is where a manuscript is stored; a sentence is where it is
 * reviewed. Proofreading reads sentence by sentence, a fact is tied to the
 * sentence that states it, a finding points at the sentence it is about, and
 * the verification pass can tell which sentences changed rather than which
 * paragraphs did.
 *
 * Sentences are derived, not stored: splitting is deterministic, so the same
 * paragraph always yields the same sentences, and a sentence is addressed as
 * `<paragraph key>.<n>` (1-based) — "n29.2" is the second sentence of n29.
 *
 * Academic prose is hostile to naive splitting, so a full stop does not end a
 * sentence after an abbreviation (e.g., et al., p., Fig., No., Dr.), an
 * initial ("S. M. Banchirigah"), inside a number ("4.2", "3.5 per cent"), or
 * before a lowercase continuation; closing quotes and brackets stay with
 * their sentence, and "(Smith 2019)." after the stop is not a sentence of its
 * own.
 */

export type Sentence = {
  /** 1-based position in the paragraph. */
  n: number;
  start: number;
  end: number;
  text: string;
};

/** Words a full stop follows without ending the sentence (compared lowercase, without the stop). */
const ABBREVIATIONS = new Set(
  [
    "e.g",
    "i.e",
    "etc",
    "cf",
    "viz",
    "vs",
    "v",
    "al",
    "et al",
    "ibid",
    "op",
    "cit",
    "loc",
    "p",
    "pp",
    "para",
    "paras",
    "s",
    "ss",
    "art",
    "arts",
    "reg",
    "regs",
    "sch",
    "cl",
    "ch",
    "chap",
    "fig",
    "figs",
    "tab",
    "eq",
    "eqs",
    "no",
    "nos",
    "vol",
    "vols",
    "ed",
    "eds",
    "rev",
    "trans",
    "n",
    "nn",
    "fn",
    "sec",
    "secs",
    "pt",
    "pts",
    "app",
    "approx",
    "ca",
    "c",
    "mr",
    "mrs",
    "ms",
    "dr",
    "prof",
    "sr",
    "jr",
    "st",
    "hon",
    "rt",
    "gen",
    "col",
    "capt",
    "lt",
    "inc",
    "ltd",
    "co",
    "corp",
    "plc",
    "llc",
    "dept",
    "univ",
    "assn",
    "bros",
    "jan",
    "feb",
    "mar",
    "apr",
    "jun",
    "jul",
    "aug",
    "sep",
    "sept",
    "oct",
    "nov",
    "dec",
    "mon",
    "tue",
    "wed",
    "thu",
    "fri",
    "sat",
    "sun",
    "u.s",
    "u.k",
    "u.n",
    "e.u",
  ].map((a) => a.toLowerCase()),
);

const CLOSERS = new Set(['"', "'", "”", "’", ")", "]", "»"]);

/** The word immediately before position `i` (the full stop), as written. */
function wordBefore(text: string, i: number): string {
  let j = i;
  while (j > 0 && /[\p{L}\p{N}.]/u.test(text[j - 1]!)) j--;
  return text.slice(j, i);
}

function isBoundary(text: string, i: number): boolean {
  const ch = text[i]!;
  if (ch === "?" || ch === "!") return true;
  if (ch !== ".") return false;
  const prev = text[i - 1] ?? "";
  const next = text[i + 1] ?? "";
  if (/\d/.test(prev) && /\d/.test(next)) return false; // 4.2, 3.5
  const word = wordBefore(text, i);
  const bare = word.replace(/\.$/, "").toLowerCase();
  if (ABBREVIATIONS.has(bare)) return false;
  if (/^(?:[a-z]\.)+[a-z]$/i.test(word)) return false; // U.S, e.g written as e.g
  if (/^\p{Lu}$/u.test(word)) return false; // an initial: S. M. Banchirigah
  return true;
}

/** Where the next sentence would start after a boundary at `i`, or -1 if it does not. */
function nextStart(text: string, i: number): number {
  let j = i + 1;
  while (j < text.length && (text[j] === "." || text[j] === "?" || text[j] === "!")) j++;
  while (j < text.length && CLOSERS.has(text[j]!)) j++;
  if (j < text.length && !/\s/.test(text[j]!)) return -1; // "p.4", "e.g.,", URLs
  while (j < text.length && /\s/.test(text[j]!)) j++;
  if (j >= text.length) return text.length;
  const c = text[j]!;
  // A citation hanging off the stop belongs to the sentence before it.
  if (c === "(" && /^\([^)]{0,80}\d{4}[a-z]?[^)]*\)\s*[.;]?/.test(text.slice(j))) return -1;
  // A sentence starts with a capital, a digit, an opening quote or bracket.
  if (/[\p{Lu}\p{N}"“‘'([]/u.test(c)) return j;
  return -1;
}

export function splitSentences(text: string): Sentence[] {
  const out: Sentence[] = [];
  let start = 0;
  while (start < text.length && /\s/.test(text[start]!)) start++;
  for (let i = start; i < text.length; i++) {
    if (!isBoundary(text, i)) continue;
    const next = nextStart(text, i);
    if (next < 0) continue;
    // The sentence runs to its last closer, before the whitespace.
    let end = i + 1;
    while (end < text.length && (text[end] === "." || CLOSERS.has(text[end]!))) end++;
    if (end > start) out.push({ n: out.length + 1, start, end, text: text.slice(start, end) });
    start = next;
    i = next - 1;
  }
  let end = text.length;
  while (end > start && /\s/.test(text[end - 1]!)) end--;
  if (end > start) out.push({ n: out.length + 1, start, end, text: text.slice(start, end) });
  return out;
}

/** "n29.2" → { nodeKey: "n29", sentence: 2 }; a plain paragraph key has no sentence. */
export function parseSentenceKey(key: string): { nodeKey: string; sentence?: number } {
  const m = /^(.+)\.(\d+)$/.exec(key.trim());
  return m ? { nodeKey: m[1]!, sentence: Number(m[2]) } : { nodeKey: key.trim() };
}

/** The sentence of a paragraph that contains the quoted words, if exactly one does. */
export function sentenceOf(text: string, quote: string | undefined): number | undefined {
  if (!quote) return undefined;
  const at = text.indexOf(quote);
  if (at < 0) return undefined;
  const hit = splitSentences(text).find((s) => at >= s.start && at < s.end);
  return hit?.n;
}
