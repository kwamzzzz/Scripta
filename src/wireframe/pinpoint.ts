/**
 * Pinpointed rewording: replace the exact words that are wrong, where they
 * are, as a tracked change.
 *
 * `proposeIntoDoc` rebuilds a whole clause from a flat word diff, so it has to
 * refuse a clause holding a table or any formatting. A schedule's fee table is
 * exactly where a nonconformity tends to sit, so that refusal left the lawyer
 * retyping Scripta's wording by hand. This works on the document itself: it
 * finds the words inside whichever paragraph or table cell holds them, strikes
 * only the words that change, inserts the new ones beside them, and leaves
 * every other node, mark and cell as it was.
 *
 * Pure, like the rest of the model: no editor, no database.
 */
import type { ClauseDoc, DocMark, DocNode } from "./clause-doc";
import { COMMENT_REF, DELETION, INSERTION } from "./tracked-change";

export type Stamp = { setId: string; authorId: string; at: string };

export type Pinpointed = { ok: true; doc: ClauseDoc } | { ok: false; problem: string };

const newChangeId = () => `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

/** Quotes, dashes and spaces as a model may type them, and case, set aside. */
function fold(ch: string, lower = true): string {
  if (/[“”„"]/.test(ch)) return '"';
  if (/[‘’‚']/.test(ch)) return "'";
  if (/[‐‑‒–—−-]/.test(ch)) return "-";
  if (/\s/.test(ch)) return " ";
  return lower ? ch.toLowerCase() : ch;
}

/**
 * A word as the redline compares it: quotes and dashes set aside, case kept.
 * Finding the words may ignore case; changing them may not, or "The Supplier"
 * after an inserted "Except …," keeps its capital where the new wording has
 * "the Supplier".
 */
const wordKey = (word: string) => [...word].map((ch) => fold(ch, false)).join("");

/** The folded text, and where each of its characters came from. */
function folded(text: string): { text: string; at: number[] } {
  let out = "";
  const at: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = fold(text[i]!);
    if (ch === " " && (out === "" || out.endsWith(" "))) continue;
    out += ch;
    at.push(i);
  }
  return { text: out, at };
}

const foldedQuote = (quote: string) => folded(quote).text.trim();

/** Every line of words in the document (a paragraph or heading, in a cell or not), with the path to it. */
function textBlocks(doc: ClauseDoc): { path: number[]; node: DocNode }[] {
  const out: { path: number[]; node: DocNode }[] = [];
  const walk = (node: DocNode, path: number[]) => {
    if (typeof node.text === "string") return;
    if (node.content?.some((child) => typeof child.text === "string")) {
      out.push({ path, node });
      return;
    }
    node.content?.forEach((child, i) => walk(child, [...path, i]));
  };
  doc.content.forEach((node, i) => walk(node, [i]));
  return out;
}

/** A block's words, one character per position; anything inline but not text is one placeholder. */
const blockText = (node: DocNode) =>
  (node.content ?? []).map((child) => (typeof child.text === "string" ? child.text : "￼")).join("");

/** Every place the quote occurs, as [start, end) in the block's own characters. */
function occurrences(text: string, quote: string): [number, number][] {
  const q = foldedQuote(quote);
  if (!q) return [];
  const f = folded(text);
  const out: [number, number][] = [];
  let from = 0;
  for (;;) {
    const k = f.text.indexOf(q, from);
    if (k < 0) break;
    out.push([f.at[k]!, f.at[k + q.length - 1]! + 1]);
    from = k + 1;
  }
  return out;
}

/** How many times the words occur in the document: 1 is the only answer a replacement can use. */
export function countIn(doc: ClauseDoc, quote: string): number {
  return textBlocks(doc).reduce((n, b) => n + occurrences(blockText(b.node), quote).length, 0);
}

type Word = { key: string; start: number; end: number };

const wordsOf = (text: string, offset = 0): Word[] =>
  [...text.matchAll(/\S+/g)].map((m) => ({
    key: wordKey(m[0]),
    start: offset + m.index!,
    end: offset + m.index! + m[0].length,
  }));

/**
 * The edits, word by word, inside the found range: which original spans are
 * struck and what is inserted where. Words the two wordings share are left
 * alone, so "2 3 Business Days" → "3 Business Days" strikes one character.
 */
function plan(
  text: string,
  start: number,
  end: number,
  replacement: string,
): { strike: [number, number][]; insert: { at: number; text: string }[] } {
  const a = wordsOf(text.slice(start, end), start);
  const b = replacement.match(/\S+/g) ?? [];
  const bKeys = b.map(wordKey);
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i]![j] =
        a[i]!.key === bKeys[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);

  const strike: [number, number][] = [];
  const insert: { at: number; text: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i]!.key === bKeys[j]) {
      i++;
      j++;
      continue;
    }
    const di = i;
    const dj = j;
    while ((i < n || j < m) && !(i < n && j < m && a[i]!.key === bKeys[j])) {
      if (j >= m || (i < n && dp[i + 1]![j]! >= dp[i]![j + 1]!)) i++;
      else j++;
    }
    const next = a[i]; // the next word both wordings keep, if any
    const added = b.slice(dj, j).join(" ");
    if (i > di) {
      // Strike up to the next kept word, so its space goes with it.
      const s = a[di]!.start;
      const e = next ? next.start : a[i - 1]!.end;
      strike.push([s, e]);
      if (added) insert.push({ at: e, text: next ? `${added} ` : added });
    } else if (added) {
      if (next) insert.push({ at: next.start, text: `${added} ` });
      else insert.push({ at: a[n - 1]?.end ?? end, text: a.length ? ` ${added}` : added });
    }
  }
  return { strike, insert };
}

const changeMark = (type: string, stamp: Stamp): DocMark => ({
  type,
  attrs: { changeId: newChangeId(), setId: stamp.setId, authorId: stamp.authorId, at: stamp.at },
});

const isChange = (mark: DocMark) => mark.type === INSERTION || mark.type === DELETION;

/** The block's inline content, rebuilt with the strikes marked and the insertions placed. */
function rewrite(
  node: DocNode,
  strike: [number, number][],
  insert: { at: number; text: string }[],
  stamp: Stamp,
): DocNode {
  const deletions = strike.map(() => changeMark(DELETION, stamp));
  const insertions = insert.map(() => changeMark(INSERTION, stamp));
  const cuts = new Set<number>([...strike.flat(), ...insert.map((x) => x.at)]);
  const out: DocNode[] = [];
  const placed = new Set<number>();
  // Formatting for new words comes from the words they sit against.
  let lastMarks: DocMark[] | undefined;
  const place = (pos: number) =>
    insert.forEach((ins, k) => {
      if (ins.at !== pos || placed.has(k)) return;
      placed.add(k);
      const kept = (lastMarks ?? []).filter((mk) => !isChange(mk) && mk.type !== COMMENT_REF);
      out.push({ type: "text", text: ins.text, marks: [...kept, insertions[k]!] });
    });

  let pos = 0;
  for (const child of node.content ?? []) {
    if (typeof child.text !== "string") {
      place(pos);
      out.push(child);
      pos += 1;
      continue;
    }
    const text = child.text;
    const bounds = [
      0,
      ...[...cuts].filter((c) => c > pos && c < pos + text.length).map((c) => c - pos),
      text.length,
    ].sort((x, y) => x - y);
    for (let k = 0; k + 1 < bounds.length; k++) {
      const s = bounds[k]!;
      const e = bounds[k + 1]!;
      if (e <= s) continue;
      place(pos + s);
      const hit = strike.findIndex(([a, b]) => pos + s >= a && pos + e <= b);
      const marks = hit >= 0 ? [...(child.marks ?? []), deletions[hit]!] : child.marks;
      out.push({ ...child, text: text.slice(s, e), ...(marks?.length ? { marks } : {}) });
      lastMarks = child.marks;
    }
    pos += text.length;
  }
  place(pos);
  return { ...node, content: out };
}

const replaceAt = (doc: ClauseDoc, path: number[], next: DocNode): ClauseDoc => {
  const swap = (nodes: DocNode[], depth: number): DocNode[] =>
    nodes.map((node, i) =>
      i !== path[depth]
        ? node
        : depth === path.length - 1
          ? next
          : { ...node, content: swap(node.content ?? [], depth + 1) },
    );
  return { type: "doc", content: swap(doc.content, 0) };
};

/**
 * Replace `find` with `replacement` as tracked changes in `stamp`'s name.
 *
 * Refuses rather than guesses: words that are not there, words that are there
 * more than once, and words somebody already has a proposal on.
 */
export function replaceInDoc(
  doc: ClauseDoc,
  find: string,
  replacement: string,
  stamp: Stamp,
): Pinpointed {
  if (!foldedQuote(find)) return { ok: false, problem: "There were no words to replace." };
  const hits = textBlocks(doc).flatMap((block) =>
    occurrences(blockText(block.node), find).map((range) => ({ block, range })),
  );
  if (!hits.length)
    return { ok: false, problem: "Those words are not in the clause as it now reads." };
  if (hits.length > 1)
    return {
      ok: false,
      problem: `Those words appear ${hits.length} times in the clause, so Scripta cannot tell which to change.`,
    };
  const { block, range } = hits[0]!;
  const [start, end] = range;

  // Words already under somebody's proposal are theirs to settle first.
  let pos = 0;
  for (const child of block.node.content ?? []) {
    const len = typeof child.text === "string" ? child.text.length : 1;
    if (pos < end && pos + len > start) {
      if (typeof child.text !== "string")
        return { ok: false, problem: "Those words run across something that is not text." };
      if (child.marks?.some(isChange))
        return {
          ok: false,
          problem: "Those words already carry a tracked change. Settle it first.",
        };
    }
    pos += len;
  }

  const text = blockText(block.node);
  const { strike, insert } = plan(text, start, end, replacement);
  if (!strike.length && !insert.length)
    return { ok: false, problem: "The new wording is the same as the old." };
  return { ok: true, doc: replaceAt(doc, block.path, rewrite(block.node, strike, insert, stamp)) };
}
