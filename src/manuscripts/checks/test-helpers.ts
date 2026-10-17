/**
 * Hand-built manuscripts for the checks' tests: a list of atoms in reading
 * order becomes ParsedNode[] with keys, chapters and parents filled in the
 * way the parser fills them.
 */
import type { DraftFinding, NodeKind, ParsedNode, StyleRule } from "../model";

type Item = { kind: NodeKind; text: string; number?: string; level?: number; label?: string; rows?: string[][] };

const lead = (text: string) =>
  /^(?:chapter\s+)?(\d+(?:\.\d+)*)\b[.:]?\s/i.exec(text.trim())?.[1] ?? "";

export const ch = (text: string, number = lead(text)): Item => ({ kind: "chapter", text, number, level: 1 });
export const part = (text: string): Item => ({ kind: "part", text, number: lead(text), level: 1 });
export const h = (text: string, level = 2, number = lead(text)): Item => ({ kind: "heading", text, number, level });
export const p = (text: string): Item => ({ kind: "paragraph", text });
export const li = (text: string): Item => ({ kind: "list_item", text });
export const quote = (text: string): Item => ({ kind: "quote", text });
export const fn = (text: string, number = ""): Item => ({ kind: "footnote", text, number });
export const cap = (text: string): Item => {
  const m = /^(Table|Figure)\s+([\w.]+)/.exec(text);
  return { kind: "caption", text, number: m ? `${m[1]} ${m[2]}` : "", label: text };
};
export const table = (rows: string[][] = [["a", "b"]]): Item => ({
  kind: "table",
  text: rows.map((r) => r.join(" | ")).join("\n"),
  rows,
});
export const figure = (): Item => ({ kind: "figure", text: "" });
export const eq = (number: string): Item => ({ kind: "equation", text: "x = y", number });
export const bib = (text: string): Item => ({ kind: "bibliography_entry", text });
export const toc = (text: string, level = 1): Item => ({ kind: "toc_entry", text, level, number: lead(text) });
export const front = (text: string, label = "Abstract"): Item => ({ kind: "front", text, label });

/** Keys n1, n2…; `prefix` changes them, as a re-import would. */
export function build(items: Item[], prefix = "n"): ParsedNode[] {
  const nodes: ParsedNode[] = [];
  let chapterKey: string | null = null;
  let heading: string | null = null;
  let lastHost: string | null = null;
  items.forEach((it, i) => {
    const key = `${prefix}${i + 1}`;
    const base = {
      key,
      kind: it.kind,
      level: it.level ?? 0,
      number: it.number ?? "",
      label: it.label ?? (it.kind === "chapter" || it.kind === "heading" || it.kind === "part" ? it.text : ""),
      text: it.text,
      source: i,
    };
    if (it.kind === "chapter") {
      chapterKey = key;
      heading = key;
      nodes.push({ ...base, parentKey: null, chapterKey: key });
    } else if (it.kind === "part") {
      chapterKey = null;
      heading = key;
      nodes.push({ ...base, parentKey: null, chapterKey: null });
    } else if (it.kind === "heading") {
      heading = key;
      nodes.push({ ...base, parentKey: chapterKey, chapterKey });
    } else if (it.kind === "footnote" || it.kind === "endnote") {
      nodes.push({ ...base, parentKey: lastHost, chapterKey });
    } else if (it.kind === "front" || it.kind === "toc_entry") {
      nodes.push({ ...base, parentKey: null, chapterKey: null });
    } else {
      nodes.push({ ...base, parentKey: heading, chapterKey, ...(it.rows ? { rows: it.rows } : {}) });
      lastHost = key;
    }
  });
  return nodes;
}

let ruleSeq = 0;
export function rule(
  category: StyleRule["category"],
  preferred: string,
  variants: string[] = [],
  note = "",
  active = true,
): StyleRule {
  return { id: `r${++ruleSeq}`, category, preferred, variants, note, origin: "author", active };
}

/** Every correction's original must be an exact substring of each node it cites. */
export function assertOriginals(findings: DraftFinding[], nodes: ParsedNode[]): string[] {
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  const problems: string[] = [];
  for (const f of findings) {
    for (const e of f.evidence) {
      const n = byKey.get(e.nodeKey);
      if (!n) problems.push(`${f.title}: unknown node ${e.nodeKey}`);
      else if (e.quote && !(n.text || n.label).includes(e.quote) && !(n.rows ?? []).flat().join(" ").includes(e.quote))
        problems.push(`${f.title}: quote ${JSON.stringify(e.quote)} not in ${e.nodeKey}`);
    }
    if (f.action === "correction") {
      if (f.original === undefined || f.replacement === undefined) problems.push(`${f.title}: correction without a fix`);
      else
        for (const e of f.evidence) {
          const n = byKey.get(e.nodeKey);
          if (n && !n.text.includes(f.original)) problems.push(`${f.title}: original not in ${e.nodeKey}`);
        }
    }
  }
  return problems;
}
