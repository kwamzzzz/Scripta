/**
 * The manuscript read once for every check: nodes by key, document order,
 * chapter membership, and the running prose tokenised with its quoted matter
 * masked. Cached per nodes array so the checks share one reading.
 */
import type { NodeKind, ParsedNode } from "../model";
import { initAt, maskQuotes } from "./text";

export type Tok = {
  /** The word as written. */
  w: string;
  /** Lower case. */
  lw: string;
  s: number;
  e: number;
  /** The characters between the previous word and this one. */
  sep: string;
  /** 1: opens a sentence; 2: may open one; 0: mid-sentence. */
  init: 0 | 1 | 2;
};

export type Prose = {
  node: ParsedNode;
  raw: string;
  /** `raw` with quotations, URLs and e-mail addresses blanked. */
  masked: string;
  toks: Tok[];
  /** False for a passage that reads as another language (a French quotation, say). */
  english: boolean;
};

export type Corpus = {
  nodes: ParsedNode[];
  byKey: Map<string, ParsedNode>;
  ord: Map<string, number>;
  chapterOf: (key: string) => string | null;
  /** The author's own running text (quotations excluded), headings excluded. */
  prose: Prose[];
  proseByKey: Map<string, Prose>;
};

/** Running prose the author wrote. Block quotations are someone else's words. */
export const PROSE_KINDS: ReadonlySet<NodeKind> = new Set<NodeKind>([
  "front",
  "paragraph",
  "list_item",
  "footnote",
  "endnote",
  "caption",
]);

export const HEADING_KINDS: ReadonlySet<NodeKind> = new Set<NodeKind>(["part", "chapter", "heading"]);

export const textOf = (n: ParsedNode): string => n.text || n.label || "";

const EN = new Set(
  "the and of to in is that for with as by on are be this which was it or from not at were has have their its".split(
    " ",
  ),
);
const FOREIGN = new Set(
  "le la les des du est et une dans pour que qui el los las y por con una del não é das dos também sur au aux sont ont il elle nous vous ce cette der die das und ist nicht mit".split(
    " ",
  ),
);

const WORD = /\p{L}+(?:['’]\p{L}+)*/gu;

export function tokenise(raw: string, masked: string): Tok[] {
  const toks: Tok[] = [];
  let prev = 0;
  for (const m of masked.matchAll(WORD)) {
    const s = m.index ?? 0;
    const e = s + m[0].length;
    toks.push({ w: m[0], lw: m[0].toLowerCase(), s, e, sep: masked.slice(prev, s), init: initAt(raw, s) });
    prev = e;
  }
  return toks;
}

const cache = new WeakMap<ParsedNode[], Corpus>();

export function corpusOf(nodes: ParsedNode[]): Corpus {
  const hit = cache.get(nodes);
  if (hit) return hit;

  const byKey = new Map<string, ParsedNode>();
  const ord = new Map<string, number>();
  nodes.forEach((n, i) => {
    byKey.set(n.key, n);
    ord.set(n.key, i);
  });
  const chapterOf = (key: string): string | null => {
    const n = byKey.get(key);
    if (!n) return null;
    if (n.chapterKey) return n.chapterKey;
    return n.kind === "chapter" ? n.key : null;
  };

  const prose: Prose[] = [];
  for (const node of nodes) {
    if (!PROSE_KINDS.has(node.kind)) continue;
    // A front-matter heading ("Abstract") is a heading, not prose.
    if (node.kind === "front" && node.text.trim() === node.label.trim()) continue;
    const raw = node.text;
    if (!raw.trim()) continue;
    const masked = maskQuotes(raw);
    const toks = tokenise(raw, masked);
    let en = 0;
    let foreign = 0;
    for (const t of toks) {
      if (EN.has(t.lw)) en++;
      else if (FOREIGN.has(t.lw)) foreign++;
    }
    prose.push({ node, raw, masked, toks, english: foreign === 0 || en >= foreign * 2 });
  }

  const corpus: Corpus = {
    nodes,
    byKey,
    ord,
    chapterOf,
    prose,
    proseByKey: new Map(prose.map((p) => [p.node.key, p])),
  };
  cache.set(nodes, corpus);
  return corpus;
}
