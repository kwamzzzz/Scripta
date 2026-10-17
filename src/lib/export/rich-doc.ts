/**
 * An editor document, as paragraphs the Word exporter can lay out.
 *
 * Formatting that cannot leave the app is decoration, so this is the bridge
 * between what a writer sees in the memo and what the counterparty opens in
 * Word: headings stay headings, a lettered sub-paragraph stays a real Word list
 * item, an indented quotation keeps its indent, and bold stays bold.
 */
import type { ClauseDoc, DocNode } from "@/wireframe/clause-doc";
import type { ExportMarks, ExportPara, ExportSeg } from "./docx";

/** Blocks that only wrap other blocks; their children carry the words. */
const CONTAINERS = new Set(["blockquote", "bulletList", "orderedList", "listItem"]);

/** The marks a run carries, in the shape the exporter writes. */
function marksOf(node: DocNode): ExportMarks | undefined {
  const out: ExportMarks = {};
  for (const mark of node.marks ?? []) {
    if (mark.type === "bold") out.b = true;
    else if (mark.type === "italic") out.i = true;
    else if (mark.type === "underline") out.u = true;
    else if (mark.type === "highlight") out.hl = true;
  }
  return out.b || out.i || out.u || out.hl ? out : undefined;
}

/** The runs of one paragraph, each with its own formatting. */
function runsOf(nodes: DocNode[] | undefined): ExportSeg[] {
  const runs: ExportSeg[] = [];
  const walk = (list: DocNode[] | undefined) => {
    for (const node of list ?? []) {
      if (node.type === "text") {
        const marks = marksOf(node);
        runs.push({ t: node.text ?? "", k: "n", ...(marks ? { m: marks } : {}) });
      } else if (node.type === "hardBreak") {
        // The exporter turns a newline inside a run into a real <w:br/>.
        runs.push({ t: "\n", k: "n" });
      } else if (node.content) walk(node.content);
    }
  };
  walk(nodes);
  return runs;
}

/** The alignment a block was given, where it is not the default. */
function alignOf(node: DocNode): ExportPara["align"] | undefined {
  const align = node.attrs?.["textAlign"];
  if (align === "center" || align === "right" || align === "justify") return align;
  return undefined;
}

/**
 * Flatten a document into the paragraphs Word lays out.
 *
 * List nesting is tracked as it descends, so a sub-paragraph inside a
 * sub-paragraph reaches Word as a genuine second-level list item rather than an
 * indented line that merely looks like one.
 */
export function docToParas(doc: ClauseDoc | null | undefined): ExportPara[] {
  if (!doc?.content?.length) return [];
  const out: ExportPara[] = [];
  const walk = (
    nodes: DocNode[],
    ctx: { list?: "ordered" | "bullet"; level: number; quote: boolean },
  ) => {
    for (const node of nodes) {
      if (node.type === "bulletList" || node.type === "orderedList") {
        walk(node.content ?? [], {
          list: node.type === "bulletList" ? "bullet" : "ordered",
          // A list inside a list item is one level deeper.
          level: ctx.list ? ctx.level + 1 : 0,
          quote: ctx.quote,
        });
        continue;
      }
      if (node.type === "blockquote") {
        walk(node.content ?? [], { ...ctx, quote: true });
        continue;
      }
      if (node.type === "table") {
        // A table stays a table: each row's cells, each cell's paragraphs as
        // lines. A row of header cells is the table's heading row.
        out.push({
          runs: [],
          grid: {
            rows: (node.content ?? []).map((row) => ({
              header: (row.content ?? []).every((cell) => cell.type === "tableHeader"),
              cells: (row.content ?? []).map((cell) =>
                (cell.content ?? []).flatMap((block, i) => [
                  ...(i ? [{ t: "\n", k: "n" as const }] : []),
                  ...runsOf(block.content),
                ]),
              ),
            })),
          },
        });
        continue;
      }
      if (node.type === "listItem") {
        walk(node.content ?? [], ctx);
        continue;
      }
      if (node.type === "paragraph" || node.type === "heading") {
        const runs = runsOf(node.content);
        if (!runs.some((r) => r.t)) {
          // An empty paragraph is still a blank line between two others.
          out.push({ runs: [{ t: "", k: "n" }] });
          continue;
        }
        const align = alignOf(node);
        const level = Number(node.attrs?.["level"] ?? 2);
        out.push({
          runs,
          ...(node.type === "heading"
            ? { heading: Math.min(Math.max(level, 1), 3) as 1 | 2 | 3 }
            : {}),
          ...(align ? { align } : {}),
          ...(ctx.list ? { list: ctx.list, level: ctx.level } : {}),
          ...(ctx.quote && !ctx.list ? { quote: true } : {}),
        });
        continue;
      }
      if (CONTAINERS.has(node.type) || node.content) walk(node.content ?? [], ctx);
    }
  };
  walk(doc.content, { level: 0, quote: false });
  // Trailing blank paragraphs are the editor's caret parking space, not content.
  while (out.length && !out[out.length - 1]!.grid && !out[out.length - 1]!.runs.some((r) => r.t))
    out.pop();
  return out;
}
