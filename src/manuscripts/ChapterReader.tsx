/**
 * A chapter's text as Scripta draws atomised text: containers.
 *
 * The same visual grammar as the contract editor's clauses — a rounded
 * container per unit, a chevron, a mono reference, nesting by depth — applied
 * to the manuscript's own hierarchy:
 *
 *   chapter (grey)  ›  section / subsection  ›  paragraph
 *
 * The paragraph is the atom a reader sees, cited "3 ¶2" (chapter 3, second
 * paragraph). The words an open finding rests on are highlighted inside it,
 * and a finding's place opens the containers around it. (The review itself
 * still checks quotes sentence by sentence; that precision is not shown.)
 */
import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { LensText, usePunctuationLens } from "@/components/PunctuationLens";
import { ReadButton, ReaderBar, useReadingId, useReadSource } from "@/components/DocReader";
import type { ReadItem } from "@/lib/read-aloud";
import type { Block, BlockKind } from "@/lib/punctuation";
import type { Chapter, StoredNode } from "./db";
import { parseSentenceKey } from "./sentences";

type Section = {
  key: string;
  node: StoredNode | null; // null: the chapter itself
  level: number;
  items: (Section | StoredNode)[];
};

const isSection = (x: Section | StoredNode): x is Section => "items" in x;
const PROSE = new Set(["paragraph", "quote", "list_item", "front"]);
const NOTE = new Set(["footnote", "endnote"]);

/**
 * How the punctuation lens reads an atom: running prose and notes must end
 * with a mark; captions, entries and table cells keep their own conventions,
 * so only their brackets and quotation marks are checked.
 */
const lensKind = (n: StoredNode): BlockKind | null =>
  n.kind === "list_item"
    ? "item"
    : PROSE.has(n.kind) || NOTE.has(n.kind)
      ? "prose"
      : n.kind === "heading" || n.kind === "chapter" || n.kind === "part" || n.kind === "table"
        ? null
        : "cell";

/** Every block of a chapter the reader shows, as the punctuation lens reads it. */
export function chapterBlocks(chapterKey: string, nodes: StoredNode[]): Block[] {
  const out: Block[] = [];
  for (const n of nodes) {
    if (n.key === chapterKey) continue;
    if (n.kind === "table") {
      for (const row of (n.rows ?? []).slice(0, 60))
        for (const cell of row) out.push({ text: cell, kind: "cell" });
      continue;
    }
    const kind = lensKind(n);
    if (kind) out.push({ text: n.text, kind });
  }
  return out;
}

/** Headings nest by level; everything else sits in the nearest heading above it. */
function tree(chapterKey: string, nodes: StoredNode[]): Section {
  const root: Section = { key: chapterKey, node: null, level: 1, items: [] };
  const stack: Section[] = [root];
  for (const n of nodes) {
    if (n.key === chapterKey) continue;
    if (n.kind === "heading") {
      while (stack.length > 1 && stack[stack.length - 1]!.level >= n.level) stack.pop();
      const s: Section = { key: n.key, node: n, level: n.level, items: [] };
      stack[stack.length - 1]!.items.push(s);
      stack.push(s);
      continue;
    }
    stack[stack.length - 1]!.items.push(n);
  }
  return root;
}

/** Keys of the sections that contain an atom, so a finding can open them. */
function pathTo(root: Section, key: string): string[] | null {
  for (const item of root.items) {
    if (isSection(item)) {
      if (item.key === key) return [item.key];
      const inner = pathTo(item, key);
      if (inner) return [item.key, ...inner];
    } else if (item.key === key) return [];
  }
  return null;
}

const countOf = (s: Section): { sections: number; paragraphs: number } =>
  s.items.reduce(
    (acc, x) => {
      if (isSection(x)) {
        const c = countOf(x);
        return {
          sections: acc.sections + 1 + c.sections,
          paragraphs: acc.paragraphs + c.paragraphs,
        };
      }
      return PROSE.has(x.kind) ? { ...acc, paragraphs: acc.paragraphs + 1 } : acc;
    },
    { sections: 0, paragraphs: 0 },
  );

function Count({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="ms-node-count" title={`${n} open finding${n === 1 ? "" : "s"}`}>
      {n}
    </span>
  );
}

/** The paragraph's text with the words open findings rest on highlighted. */
function Marked({ text, quotes }: { text: string; quotes: string[] }) {
  const spans: [number, number][] = [];
  for (const q of quotes) {
    if (!q.trim()) continue;
    for (let at = text.indexOf(q); at >= 0; at = text.indexOf(q, at + q.length))
      spans.push([at, at + q.length]);
  }
  spans.sort((x, y) => x[0] - y[0]);
  const merged: [number, number][] = [];
  for (const sp of spans) {
    const last = merged[merged.length - 1];
    if (last && sp[0] <= last[1]) last[1] = Math.max(last[1], sp[1]);
    else merged.push([...sp]);
  }
  const out: ReactNode[] = [];
  let pos = 0;
  merged.forEach(([from, to], i) => {
    if (from > pos) out.push(text.slice(pos, from));
    out.push(
      <mark key={i} className="ms-mark">
        {text.slice(from, to)}
      </mark>,
    );
    pos = to;
  });
  if (pos < text.length) out.push(text.slice(pos));
  return <>{out}</>;
}

export default function ChapterReader({
  chapter,
  nodes,
  openOn,
  focus,
  refs,
  marks,
}: {
  refs: Map<string, string>;
  chapter: Chapter;
  nodes: StoredNode[];
  /** Open findings per paragraph. */
  openOn: Map<string, number>;
  /** The words open findings are about, per paragraph, to highlight in place. */
  marks: Map<string, string[]>;
  focus: string | null;
}) {
  const root = useMemo(() => tree(chapter.chapterKey, nodes), [chapter.chapterKey, nodes]);

  // "3 ¶2" for paragraphs comes from the shared paragraphRefs; notes, tables
  // and figures are named by what they are.
  const refOf = (n: StoredNode) =>
    refs.get(n.key) ??
    (NOTE.has(n.kind)
      ? `Note ${n.number}`
      : n.kind === "equation"
        ? n.number
          ? `Eq. ${n.number}`
          : "Equation"
        : n.number || n.kind[0]!.toUpperCase() + n.kind.slice(1));

  // A place may still arrive as a sentence ("n20.2"); the paragraph is what is shown.
  const focusKey = focus ? parseSentenceKey(focus).nodeKey : null;
  const [closed, setClosed] = useState<Set<string>>(new Set());
  // Under the punctuation lens everything is open: a dot in a closed container would go unseen.
  const lens = usePunctuationLens();
  // Read aloud goes container by container: each section heading, then each
  // paragraph and note under it, in the order the chapter shows them.
  useReadSource(() => {
    const out: ReadItem[] = [];
    for (const n of nodes) {
      if (n.key === chapter.chapterKey || !n.text.trim()) continue;
      if (n.kind === "heading")
        out.push({ id: n.key, label: "", name: n.number || n.text, text: `${n.text}.` });
      else if (PROSE.has(n.kind) || NOTE.has(n.kind))
        out.push({
          id: n.key,
          label: NOTE.has(n.kind) ? `Note ${n.number}` : "",
          name: refOf(n),
          text: n.text,
        });
    }
    return out;
  });
  // The container being read is open, and so is everything around it.
  const readingId = useReadingId();
  const readingPath = useMemo(
    () => new Set(readingId ? [root.key, readingId, ...(pathTo(root, readingId) ?? [])] : []),
    [root, readingId],
  );
  const isOpen = (key: string) => lens || readingPath.has(key) || !closed.has(key);
  const toggle = (key: string) =>
    setClosed((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // A finding's place opens every container around it, then comes into view.
  useEffect(() => {
    if (!focusKey) return;
    const path = pathTo(root, focusKey) ?? [];
    setClosed((s) => {
      const next = new Set(s);
      next.delete(root.key);
      for (const k of path) next.delete(k);
      next.delete(focusKey);
      return next;
    });
    // Wait for the containers just opened, and for the cards above the text
    // (summary, assessment) to take their height, before bringing it into view.
    let tries = 0;
    let t = 0;
    const bring = () => {
      const el = document.getElementById(`atom-${focusKey}`);
      if (el) el.scrollIntoView({ block: "center" });
      if (!el || ++tries < 3) t = window.setTimeout(bring, 250);
    };
    t = window.setTimeout(bring, 120);
    return () => window.clearTimeout(t);
  }, [focusKey, root]);

  const header = (
    key: string,
    depth: number,
    ref: ReactNode,
    title: ReactNode,
    extra?: ReactNode,
  ) => (
    <header
      className="ms-node-header"
      onClick={() => toggle(key)}
      role="button"
      tabIndex={0}
      aria-expanded={isOpen(key)}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle(key);
        }
      }}
    >
      <span className="ms-node-chevron" aria-hidden>
        {isOpen(key) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </span>
      {ref && <span className="ms-node-ref">{ref}</span>}
      <strong className={depth === 0 ? "is-chapter" : ""}>{title}</strong>
      <ReadButton
        id={key}
        what={depth === 0 ? "this chapter" : typeof ref === "string" && ref ? ref : "this passage"}
      />
      <span className="ms-node-space" />
      {extra}
    </header>
  );

  const atom = (n: StoredNode) => {
    const ref = refOf(n);
    const open = openOn.get(n.key) ?? 0;
    const selected = focusKey === n.key;
    const cls = `ms-node depth-2 ms-kind-${n.kind}${selected ? " is-selected" : ""}`;

    if (n.kind === "table")
      return (
        <section key={n.key} id={`atom-${n.key}`} className={cls}>
          {header(n.key, 2, ref, "Table", <Count n={open} />)}
          {isOpen(n.key) && (
            <div className="ms-node-content">
              <table className="ms-table">
                <tbody>
                  {(n.rows ?? []).slice(0, 60).map((r, i) => (
                    <tr key={i}>
                      {r.map((cell, j) => (
                        <td key={j}>{lens ? <LensText text={cell} kind="cell" /> : cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      );

    if (!PROSE.has(n.kind) && !NOTE.has(n.kind))
      return (
        <section key={n.key} id={`atom-${n.key}`} className={cls}>
          <header className="ms-node-header is-static">
            <span className="ms-node-ref">{ref || n.kind}</span>
            <span className="ms-node-line">
              {lens ? <LensText text={n.text} kind={lensKind(n) ?? "cell"} /> : n.text}
            </span>
            <span className="ms-node-space" />
            <Count n={open} />
          </header>
        </section>
      );

    return (
      <section key={n.key} id={`atom-${n.key}`} className={cls} data-read-id={n.key}>
        {header(
          n.key,
          2,
          ref,
          n.kind === "quote" ? "Quotation" : NOTE.has(n.kind) ? "Note" : "",
          <Count n={open} />,
        )}
        {isOpen(n.key) && (
          <p className="ms-node-text">
            {lens ? (
              <LensText text={n.text} kind={lensKind(n) ?? "prose"} />
            ) : (
              <Marked text={n.text} quotes={marks.get(n.key) ?? []} />
            )}
          </p>
        )}
      </section>
    );
  };

  const section = (s: Section, depth: number): ReactNode => {
    const n = s.node!;
    const c = countOf(s);
    return (
      <section
        key={s.key}
        id={`atom-${s.key}`}
        className={`ms-node depth-${Math.min(depth, 2)}${focusKey === s.key ? " is-selected" : ""}`}
        data-read-id={s.key}
      >
        {header(
          s.key,
          depth,
          n.number,
          n.number
            ? n.text.replace(new RegExp(`^${n.number.replace(/\./g, "\\.")}\\s*`), "")
            : n.text,
          <>
            <span className="ms-node-meta">
              {c.paragraphs} PARAGRAPH{c.paragraphs === 1 ? "" : "S"}
            </span>
            <Count n={openOn.get(s.key) ?? 0} />
          </>,
        )}
        {isOpen(s.key) && (
          <div className="ms-node-children">{s.items.map((x) => item(x, depth + 1))}</div>
        )}
      </section>
    );
  };

  const item = (x: Section | StoredNode, depth: number) =>
    isSection(x) ? section(x, depth) : atom(x);

  const total = countOf(root);
  return (
    <section id={`atom-${root.key}`} className="ms-node depth-0" data-read-id={root.key}>
      <ReaderBar />
      {header(
        root.key,
        0,
        chapter.number,
        chapter.title,
        <>
          <span className="ms-node-meta">
            {total.sections} SECTION{total.sections === 1 ? "" : "S"} · {total.paragraphs} PARAGRAPH
            {total.paragraphs === 1 ? "" : "S"}
          </span>
          <Count n={openOn.get(root.key) ?? 0} />
        </>,
      )}
      {isOpen(root.key) && (
        <div className="ms-node-children">{root.items.map((x) => item(x, 1))}</div>
      )}
    </section>
  );
}
