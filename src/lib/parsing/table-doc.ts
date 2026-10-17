/**
 * A clause's text as the editor's document, with its tables as tables.
 *
 * Tables travel through clause text as `| a | b |` lines (see blocks.ts),
 * which a lawyer and a model can both read and a diff can compare. The editor
 * and the Word export need the grid itself, so when a clause holds a table
 * its document is built here and stored with it. A clause without a table
 * gets no document, exactly as before, so nothing else changes for it.
 */
import { TABLE_ROW, rowCells } from "./blocks";
import type { ClauseDoc } from "@/wireframe/clause-doc";

type Node = ClauseDoc["content"][number];

const paragraph = (text: string): Node =>
  text ? { type: "paragraph", content: [{ type: "text", text }] } : { type: "paragraph" };

/** True when the text holds at least one table row. */
export function hasTable(text: string): boolean {
  return text.split(/\n/).some((line) => TABLE_ROW.test(line.trim()));
}

/** The editor's document for a clause body; null when it holds no table. */
export function bodyToDoc(body: string): ClauseDoc | null {
  if (!hasTable(body)) return null;
  const content: Node[] = [];
  let rows: string[][] = [];
  const flushTable = () => {
    if (!rows.length) return;
    const width = Math.max(...rows.map((r) => r.length));
    content.push({
      type: "table",
      content: rows.map((cells, r) => ({
        type: "tableRow",
        content: Array.from({ length: width }, (_, c) => ({
          // The first row of a schedule table is its heading row.
          type: r === 0 && rows.length > 1 ? "tableHeader" : "tableCell",
          content: [paragraph(cells[c] ?? "")],
        })),
      })),
    });
    rows = [];
  };
  for (const line of body.split(/\n/)) {
    const t = line.trim();
    if (TABLE_ROW.test(t)) {
      rows.push(rowCells(t));
      continue;
    }
    flushTable();
    if (t) content.push(paragraph(t));
  }
  flushTable();
  return { type: "doc", content };
}
