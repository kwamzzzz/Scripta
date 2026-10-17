/**
 * The punctuation lens: every mark a block of text carries, and every place a
 * mark is missing.
 *
 * Two levels, kept apart on purpose:
 *
 *   missing  a certainty. The block ends with no closing mark, or a bracket or
 *            quotation mark is opened and never closed (or closed and never
 *            opened). Red never cries wolf.
 *   check    likely, not certain. "agreed The Seller shall" is a missing full
 *            stop unless "The Seller" is a name; "However the" wants a comma
 *            unless the author meant otherwise.
 *
 * A missing comma inside a sentence is a judgement of grammar no rule can make
 * with certainty, so it is never claimed here. The marks themselves are listed
 * in full, so a long run with none stands out to the reader's eye.
 *
 * Pure functions: text in, positions out. The screens draw them.
 */

/** How a block is read: a paragraph must end with a mark; a heading or a table cell need not. */
export type BlockKind = "prose" | "item" | "heading" | "cell";

export type Gap = {
  /** Where the mark belongs: an insertion point in the text (0…length). */
  at: number;
  level: "missing" | "check";
  reason: string;
  /** A mark the gap is about (an orphaned bracket), drawn red rather than green. */
  mark?: number;
};

export type Scan = {
  /** The index of every punctuation mark in the text. */
  marks: number[];
  gaps: Gap[];
};

export type Block = { text: string; kind: BlockKind };
export type Summary = { marks: number; missing: number; check: number };

const MARK = /[.,;:?!…()[\]{}"“”'‘’—–\-/]/;
const PAIRS: Record<string, string> = { "(": ")", "[": "]", "{": "}", "“": "”" };
const CLOSERS: Record<string, string> = { ")": "(", "]": "[", "}": "{", "”": "“" };
const NAME: Record<string, string> = {
  "(": "bracket",
  "[": "square bracket",
  "{": "brace",
  "“": "quotation mark",
};

/** Marks that may end a block of prose. */
const ENDS = /[.?!…:;]$/;
/** What may trail a closing mark: quotation marks, brackets, a note number. */
const TRAIL = /(?:[”"’')\]]|\[\d{1,4}\]|[¹²³⁴⁵⁶⁷⁸⁹⁰]+|\*+)+$/;

/** Words that begin a sentence far more often than they follow a lowercase word inside one. */
const STARTERS = new Set(
  (
    "The This That These Those It Its We He She They There Their Our His Her " +
    "In However Accordingly Furthermore Moreover Therefore Thus Hence Also " +
    "A An If When Where While Each All No As For On At By Such Any Both " +
    "Neither Either Following Subject Notwithstanding Unless Until After Before " +
    "Although Because Since Finally Firstly Secondly Thirdly Lastly Consequently " +
    "Nevertheless Nonetheless Additionally Similarly Instead Here You"
  ).split(" "),
);
/** A capitalised word after one of these is its object, not a new sentence ("with The Company"). */
const LINKERS = new Set(
  (
    "a an the and or nor but of to by with between under from for in on at as than " +
    "into onto upon via per called named entitled titled see cf versus vs against " +
    "including include includes like unlike about within without among amongst " +
    "towards toward through throughout during over across behind beside besides " +
    "said says say told called mr mrs ms dr prof st"
  ).split(" "),
);

/** Verbs that make a short run of words a sentence rather than a label. */
const VERB =
  /\b(?:shall|must|will|may|might|can|could|should|would|is|are|was|were|be|been|has|have|had|does|did|agrees?|agreed|means)\b/i;

/** The small words a heading leaves in lower case. */
const SMALL = new Set("a an the and or nor but of to by with at in on for from as".split(" "));

/** Openers that want a comma after them when they open a sentence. */
const INTRODUCERS = [
  "However",
  "Moreover",
  "Furthermore",
  "Nevertheless",
  "Nonetheless",
  "Consequently",
  "Accordingly",
  "Additionally",
  "Finally",
  "Firstly",
  "Secondly",
  "Thirdly",
  "Lastly",
  "Meanwhile",
  "Conversely",
  "Similarly",
  "Likewise",
  "Indeed",
  "Notably",
  "Alternatively",
  "Specifically",
  "For example",
  "For instance",
  "In addition",
  "In particular",
  "In contrast",
  "By contrast",
  "As a result",
  "In other words",
  "On the other hand",
  "In conclusion",
  "In summary",
];
/** "However much", "However long": an adverb of degree, no comma. */
const HOWEVER_DEGREE =
  /^(much|many|long|far|often|little|few|small|large|great|hard|good|bad|well|badly|strong|high|low)\b/i;

const isMark = (text: string, i: number): boolean => {
  const ch = text[i]!;
  if (!MARK.test(ch)) return false;
  // 3.5, 1,000, 10:30: a separator inside a number is not punctuation.
  if (
    (ch === "." || ch === "," || ch === ":") &&
    /\d/.test(text[i - 1] ?? "") &&
    /\d/.test(text[i + 1] ?? "")
  )
    return false;
  return true;
};

/** A few words either side of a place, to name it in a reason. */
const near = (text: string, at: number): string => {
  const before = text.slice(Math.max(0, at - 24), at).replace(/^\S*\s/, "");
  return `“${before.trim()}”`;
};

/** An enumerator such as "a)", "iv)" or "2)" closing a bracket that was never opened. */
const enumerator = (text: string, i: number): boolean =>
  /(?:^|[\s(])(?:[a-z]|[ivxlc]{1,5}|\d{1,3})$/i.test(text.slice(Math.max(0, i - 7), i)) &&
  (i + 1 >= text.length || /\s/.test(text[i + 1]!));

function pairs(text: string, gaps: Gap[]) {
  const stack: { ch: string; at: number }[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (PAIRS[ch]) {
      stack.push({ ch, at: i });
      continue;
    }
    const opener = CLOSERS[ch];
    if (!opener) continue;
    let top = stack.length - 1;
    while (top >= 0 && stack[top]!.ch !== opener) top--;
    if (top >= 0) {
      stack.splice(top, 1);
      continue;
    }
    if (ch === ")" && enumerator(text, i)) continue;
    gaps.push({
      at: i,
      mark: i,
      level: "missing",
      reason: `This ${ch === "”" ? "closing quotation mark" : `closing ${NAME[opener]}`} has no opening one before it.`,
    });
  }
  for (const open of stack)
    gaps.push({
      at: text.trimEnd().length,
      mark: open.at,
      level: "missing",
      reason: `The ${NAME[open.ch]} opened after ${near(text, open.at + 1)} is never closed.`,
    });

  // Straight quotation marks cannot say which way they face: an odd count is only a query.
  const straight = [...text.matchAll(/"/g)].map((m) => m.index ?? 0);
  if (straight.length % 2 === 1) {
    const last = straight[straight.length - 1]!;
    gaps.push({
      at: last,
      mark: last,
      level: "check",
      reason: "An odd number of straight quotation marks: one of them is not closed.",
    });
  }
  // ’ is also the apostrophe, so an opening ‘ is only settled when a ’ follows it somewhere.
  for (const m of text.matchAll(/‘/g)) {
    const at = m.index ?? 0;
    if (!text.includes("’", at + 1))
      gaps.push({
        at: text.trimEnd().length,
        mark: at,
        level: "check",
        reason: `The single quotation mark opened after ${near(text, at + 1)} does not appear to close.`,
      });
  }
}

function ending(text: string, kind: BlockKind, gaps: Gap[]) {
  if (kind === "heading" || kind === "cell") return;
  const body = text.trimEnd();
  if (!/\p{L}/u.test(body)) return;
  // Blanks for filling in ("Name: ________") are not sentences.
  if (/(?:_{2,}|\.{4,}|…{2,}|\t)$/.test(body)) return;
  // A note number set straight after the closing mark ("below.12") is the note's, not the sentence's.
  const core = body.replace(/(?<=[.?!…;:”"’)\]])\d{1,3}$/, "").replace(TRAIL, "");
  if (ENDS.test(core)) return;
  // "the Seller; and", "each of them; or": the running end of a list.
  if (/[;,]\s+(?:and|or|but|and\/or)$/i.test(core)) return;
  const at = core.length;
  if (/[,—–-]$/.test(core)) {
    gaps.push({
      at,
      level: "check",
      reason: `Ends with “${core.slice(-1)}” rather than a closing mark.`,
    });
    return;
  }
  if (kind === "item") {
    gaps.push({
      at,
      level: "check",
      reason: "This list item ends with no punctuation. Fine in a bare list; missing in a clause.",
    });
    return;
  }
  // A heading is short and mostly capitalised ("Governing Law and Jurisdiction");
  // a short sentence is not ("The Seller shall pay on demand").
  const words = core.split(/\s+/).filter((w) => /^\p{L}/u.test(w));
  const content = words.filter((w) => !SMALL.has(w.toLowerCase()));
  const capitals = content.filter((w) => /^\p{Lu}/u.test(w)).length;
  const titleLike =
    words.length <= 3 ||
    // A colon or comma inside does not make it a sentence ("Prepared for: NEXIS AFRICA");
    // a full stop inside does ("It was signed. The Seller paid").
    (words.length <= 12 && !/[.?!]\s/.test(core) && capitals >= content.length * 0.6) ||
    core === core.toUpperCase();
  if (titleLike) {
    gaps.push({ at, level: "check", reason: "No full stop at the end. Is this a heading?" });
    return;
  }
  // Only a sentence is certainly missing its full stop. A short run with no verb
  // ("Build and included revisions") is a label or a table entry, and a
  // "Label: value" line ("Client notice email: …") is a field.
  const field = /^[^:]{1,40}:\s/.test(core) && !VERB.test(core.slice(core.indexOf(":") + 1));
  const sentence = !field && (words.length > 8 || VERB.test(core));
  gaps.push(
    sentence
      ? { at, level: "missing", reason: "This paragraph ends without a full stop." }
      : {
          at,
          level: "check",
          reason: "No full stop at the end. Fine for a label, a field or a table entry; missing in a sentence.",
        },
  );
}

function sentenceJoins(text: string, gaps: Gap[]) {
  // "agreed The Seller shall": a lowercase word, a space, a word that starts sentences.
  for (const m of text.matchAll(
    /(?<![\p{L}\p{N}.])([a-z][\p{Ll}’'-]*)(\s+)(\p{Lu}\p{Ll}*)(?=[\s,])/gu,
  )) {
    const [, prev, gap, next] = m as unknown as [string, string, string, string];
    if (!STARTERS.has(next) || LINKERS.has(prev.toLowerCase())) continue;
    // Inside a line break the break itself may be doing the work.
    if (gap.includes("\n")) continue;
    const at = (m.index ?? 0) + prev.length;
    gaps.push({
      at,
      level: "check",
      reason: `“${next}” starts a new sentence here with nothing closing the last one. A full stop missing, unless “${next}” is part of a name.`,
    });
  }
}

const OPENER = new RegExp(
  `(?:^|[.?!…]["”’)]?\\s+)(${INTRODUCERS.join("|")})(\\s+)(?=\\p{L})`,
  "gu",
);

function introducers(text: string, gaps: Gap[]) {
  for (const m of text.matchAll(OPENER)) {
    const word = m[1]!;
    const end = (m.index ?? 0) + m[0].length;
    if (word === "However" && HOWEVER_DEGREE.test(text.slice(end))) continue;
    gaps.push({
      at: end - m[2]!.length,
      level: "check",
      reason: `A comma usually follows “${word}” at the start of a sentence.`,
    });
  }
}

/** Every mark in a block, and every place one is missing. */
export function scanPunctuation(text: string, kind: BlockKind = "prose"): Scan {
  const marks: number[] = [];
  for (let i = 0; i < text.length; i++) if (isMark(text, i)) marks.push(i);
  const gaps: Gap[] = [];
  pairs(text, gaps);
  ending(text, kind, gaps);
  if (kind === "prose" || kind === "item") {
    sentenceJoins(text, gaps);
    introducers(text, gaps);
  }
  gaps.sort((a, b) => a.at - b.at || (a.level === b.level ? 0 : a.level === "missing" ? -1 : 1));
  return { marks, gaps };
}

/** The counts a screen shows beside its Punctuation button. */
export function summarise(blocks: Block[]): Summary {
  const out: Summary = { marks: 0, missing: 0, check: 0 };
  for (const b of blocks) {
    const s = scanPunctuation(b.text, b.kind);
    out.marks += s.marks.length;
    for (const g of s.gaps) out[g.level] += 1;
  }
  return out;
}
