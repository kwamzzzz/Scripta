/**
 * A tracked clause, on its way into Word.
 *
 * The inverse of `segments-to-marks.ts`, and the point at which Phase 5 has to
 * survive contact with the outside world: the counterparty does not open
 * Scripta, they open the .docx, and what they see there is what the work
 * actually looks like.
 *
 * ---------------------------------------------------------------------------
 * THE NAMES SURVIVE THE EXPORT
 * ---------------------------------------------------------------------------
 *
 * Every run carries its own author into `w:ins`/`w:del`, rather than the
 * document being stamped with one name. A marked-up contract where every
 * change says "Scripta" in the margin has thrown away the one thing the whole
 * phase was built to keep, at exactly the moment it matters most.
 *
 * ---------------------------------------------------------------------------
 * WHICH READING IS EXPORTED IS THE CALLER'S DECISION, AND A REAL ONE
 * ---------------------------------------------------------------------------
 *
 * This converts whatever document it is handed. The four readings already
 * differ in ways a lawyer can see, and the export screen names them the same
 * way the clause rail does, because "export" without saying which reading is
 * the sentence that sends an unresolved draft to a counterparty as though it
 * were agreed.
 */
import type { ClauseDoc, DocNode } from "./clause-doc";
import { DELETION, INSERTION } from "./tracked-change";
import { HIGHLIGHT } from "./highlight-mark";
import type { ExportPara, ExportSeg, SegKind } from "@/lib/export/docx";

/** A ProseMirror text node's formatting, in the shape the builder wants. */
function marksOf(node: DocNode): ExportSeg["m"] {
  const names = new Set((node.marks ?? []).map((mark) => mark.type));
  const out: NonNullable<ExportSeg["m"]> = {};
  if (names.has("bold") || names.has("strong")) out.b = true;
  if (names.has("italic") || names.has("em")) out.i = true;
  if (names.has("underline")) out.u = true;
  if (names.has(HIGHLIGHT)) out.hl = true;
  return Object.keys(out).length ? out : undefined;
}

function kindOf(node: DocNode): SegKind {
  const names = (node.marks ?? []).map((mark) => mark.type);
  /* Text one lawyer proposed and another then struck carries BOTH marks. It
     goes out as a deletion, because that is what it now is: the proposal to add
     it has been overtaken by a proposal to remove it, and Word has no way to
     show a run that is being inserted and deleted at once. */
  if (names.includes(DELETION)) return "d";
  if (names.includes(INSERTION)) return "i";
  return "n";
}

/** The change mark on this run, if it carries one. */
const changeMark = (node: DocNode) =>
  (node.marks ?? []).find((m) => m.type === DELETION || m.type === INSERTION);

/** Who proposed this run, for Word's revision author. */
function authorOf(node: DocNode, nameOf: (authorId: string) => string): string | undefined {
  const id = changeMark(node)?.attrs?.["authorId"];
  return typeof id === "string" && id ? nameOf(id) : undefined;
}

/** When it was proposed, for Word's revision date. */
function whenOf(node: DocNode): string | undefined {
  const at = changeMark(node)?.attrs?.["at"];
  return typeof at === "string" && at ? at : undefined;
}

const HEADINGS: Record<number, 1 | 2 | 3> = { 1: 1, 2: 2, 3: 3 };

/**
 * The runs of one block, flattened.
 *
 * A clause's inline content nests — a link around bold text around an
 * insertion — so this descends rather than reading `content` once. Anything
 * that is not text contributes nothing: an image or a hard break has no place
 * in a redline run and Word will lay the paragraph out without it.
 */
function runsIn(node: DocNode, nameOf: (authorId: string) => string): ExportSeg[] {
  const runs: ExportSeg[] = [];
  const walk = (current: DocNode) => {
    if (typeof current.text === "string" && current.text) {
      const seg: ExportSeg = { t: current.text, k: kindOf(current) };
      const m = marksOf(current);
      if (m) seg.m = m;
      const a = authorOf(current, nameOf);
      if (a) seg.a = a;
      const d = whenOf(current);
      if (d) seg.d = d;
      runs.push(seg);
      return;
    }
    current.content?.forEach(walk);
  };
  node.content?.forEach(walk);
  return runs;
}

/**
 * A clause document as paragraphs the docx builder can lay out.
 *
 * Paragraphs are kept rather than flattened into one run of text. A clause with
 * sub-paragraphs (a), (b), (c) that arrived in Word as three paragraphs must
 * leave as three, or the export quietly rewrites the drafting.
 */
export function docToParas(
  doc: ClauseDoc | null | undefined,
  nameOf: (authorId: string) => string = (id) => id,
): ExportPara[] {
  if (!doc) return [];
  const paras: ExportPara[] = [];

  const walk = (node: DocNode, depth: number) => {
    switch (node.type) {
      case "paragraph": {
        const runs = runsIn(node, nameOf);
        if (runs.length) paras.push(depth > 0 ? { runs, level: Math.min(depth, 2) } : { runs });
        return;
      }
      case "heading": {
        const runs = runsIn(node, nameOf);
        const level = Number(node.attrs?.["level"] ?? 1);
        if (runs.length) paras.push({ runs, heading: HEADINGS[level] ?? 3 });
        return;
      }
      case "blockquote": {
        node.content?.forEach((child) => {
          const runs = runsIn(child, nameOf);
          if (runs.length) paras.push({ runs, quote: true });
        });
        return;
      }
      case "bulletList":
      case "orderedList": {
        const list = node.type === "orderedList" ? "ordered" : "bullet";
        node.content?.forEach((item) => {
          item.content?.forEach((child) => {
            if (child.type === "bulletList" || child.type === "orderedList") {
              walk(child, depth + 1);
              return;
            }
            const runs = runsIn(child, nameOf);
            if (runs.length) paras.push({ runs, list, level: Math.min(depth, 2) });
          });
        });
        return;
      }
      /* A table is where `clause_segments` lost clause 1.5 during the step 2
         migration, and it is the reason the document won that argument. It
         goes to Word as a ruled table: a fee schedule read as one line per
         row lost its columns, which are its meaning. Each cell keeps its runs,
         tracked changes included; a header row stays the header row. */
      case "table": {
        const rows = (node.content ?? [])
          .map((row) => ({
            header:
              (row.content ?? []).length > 0 &&
              (row.content ?? []).every((c) => c.type === "tableHeader"),
            cells: (row.content ?? []).map((cell) => {
              const cellRuns: ExportSeg[] = [];
              (cell.content ?? []).forEach((block, i) => {
                const runs = runsIn(block, nameOf);
                if (!runs.length) return;
                if (i && cellRuns.length) cellRuns.push({ t: "\n", k: "n" });
                cellRuns.push(...runs);
              });
              return cellRuns;
            }),
          }))
          .filter((row) => row.cells.some((cell) => cell.some((r) => r.t.trim())));
        if (rows.length) paras.push({ runs: [], grid: { rows } });
        return;
      }
      default:
        node.content?.forEach((child) => walk(child, depth));
    }
  };

  doc.content.forEach((node) => walk(node, 0));
  return paras;
}

/** The same thing as one flat run of segments, for a single-paragraph clause. */
export function docToSegs(
  doc: ClauseDoc | null | undefined,
  nameOf: (authorId: string) => string = (id) => id,
): ExportSeg[] {
  const paras = docToParas(doc, nameOf);
  const segs: ExportSeg[] = [];
  paras.forEach((para, index) => {
    if (index) segs.push({ t: " ", k: "n" });
    segs.push(...para.runs);
  });
  return segs;
}
