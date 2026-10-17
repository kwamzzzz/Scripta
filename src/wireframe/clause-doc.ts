/**
 * The clause content model.
 *
 * A clause used to be a string, because the wireframe framed contract review as
 * a redline and a redline only needs words. Formatting a lawyer actually uses —
 * bold, italics, underlining, a defined-term link, a sub-list, a rates table —
 * has nowhere to live in a string, so the toolbar's formatting tools were drawn
 * but never wired.
 *
 * The content is now a ProseMirror document, which is what the editor speaks.
 * This module is the part of that model which does not depend on the editor: the
 * shape, the plain text the diff engine reads, and the walk the exporters need.
 * Keeping it here means the redline and the Word and PDF exports never have to
 * load an editor to understand a clause.
 */

/**
 * What a node or mark carries besides its text: a heading level, a link's href,
 * an alignment, a cell's span. These are JSON scalars (and, for a table cell's
 * column widths, an array of them) — never arbitrary values, because a document
 * crosses a server-function boundary and has to be provably serializable.
 */
export type DocAttrValue = string | number | boolean | null;
export type DocAttrs = Record<string, DocAttrValue | DocAttrValue[]>;

/** A formatting mark on a run of text. `href` belongs to `link`. */
export type DocMark = { type: string; attrs?: DocAttrs | undefined };

/** One ProseMirror node: a block, a table part, or a run of text. */
export type DocNode = {
  type: string;
  // These are optional and may be explicitly undefined: a document crosses a
  // server-function boundary, where the serializer checks for exactly that.
  text?: string | undefined;
  marks?: DocMark[] | undefined;
  attrs?: DocAttrs | undefined;
  content?: DocNode[] | undefined;
};

export type ClauseDoc = { type: "doc"; content: DocNode[] };

/** Blocks that hold inline content directly: each one is a line of its own. */
const LEAF_BLOCKS = new Set(["paragraph", "heading", "codeBlock"]);
/** Blocks that only wrap other blocks: a list item's line comes from its paragraph. */
const CONTAINERS = new Set(["bulletList", "orderedList", "listItem", "blockquote"]);

/** A document holding exactly this text, one paragraph per line. */
export function textToDoc(text: string): ClauseDoc {
  const lines = text.split("\n");
  return {
    type: "doc",
    content: lines.map((line) =>
      line ? { type: "paragraph", content: [{ type: "text", text: line }] } : { type: "paragraph" },
    ),
  };
}

/** The text of a run of inline nodes. A hard break is a line break. */
function inlineText(nodes: DocNode[] | undefined): string {
  if (!nodes?.length) return "";
  return nodes
    .map((node) => {
      if (node.type === "text") return node.text ?? "";
      if (node.type === "hardBreak") return "\n";
      return inlineText(node.content);
    })
    .join("");
}

/** One table cell's text, however many paragraphs it holds. */
function cellText(cell: DocNode): string {
  return (cell.content ?? [])
    .map((block) => (block.type === "text" ? (block.text ?? "") : inlineText(block.content)))
    .filter(Boolean)
    .join(" ");
}

/**
 * The document as the plain text the diff engine compares.
 *
 * Every block ends a line and every table cell is separated by a tab, so moving
 * a word between two paragraphs reads as a move rather than as one enormous
 * rewrite of both. Formatting is deliberately absent: a word that is merely
 * bolded is not a change to the contract's words, and showing it as a deletion
 * and a re-insertion of the same text would be a lie about what was amended.
 */
export function docToText(doc: ClauseDoc | null | undefined): string {
  if (!doc?.content?.length) return "";
  const lines: string[] = [];
  const walk = (nodes: DocNode[]) => {
    for (const node of nodes) {
      if (node.type === "tableRow") {
        lines.push((node.content ?? []).map(cellText).join("\t"));
        continue;
      }
      if (LEAF_BLOCKS.has(node.type)) {
        lines.push(inlineText(node.content));
        continue;
      }
      if (CONTAINERS.has(node.type) || node.type === "table") {
        walk(node.content ?? []);
        continue;
      }
      if (node.type === "text") lines.push(node.text ?? "");
      else if (node.content) walk(node.content);
    }
  };
  walk(doc.content);
  // A trailing empty paragraph is the editor's caret parking space, not content.
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines.join("\n");
}

/** True when the document carries formatting a plain string could not hold. */
export function hasFormatting(doc: ClauseDoc | null | undefined): boolean {
  if (!doc?.content?.length) return false;
  let found = false;
  const walk = (nodes: DocNode[]) => {
    for (const node of nodes) {
      if (found) return;
      if (node.marks?.length) found = true;
      else if (node.type !== "paragraph" && node.type !== "text" && node.type !== "doc")
        found = true;
      else if (node.content) walk(node.content);
    }
  };
  walk(doc.content);
  return found;
}

/** Read a document off a row, accepting the JSON the database hands back. */
/**
 * Whether two documents say the same thing.
 *
 * ---------------------------------------------------------------------------
 * POSTGRES DOES NOT KEEP YOUR KEY ORDER
 * ---------------------------------------------------------------------------
 *
 * A clause is stored as `jsonb`, and `jsonb` sorts object keys — by length,
 * then bytewise. The editor emits a text node as `{type, text, marks}`; it
 * comes back as `{text, type, marks}`. The same document, never the same
 * string.
 *
 * So `JSON.stringify(a) !== JSON.stringify(b)` is not "these differ", it is
 * "one of these has been to the database". The tracked editor used exactly that
 * to decide whether it had unsaved work, which was invisible while the only
 * path saved and closed in one motion — and became visible the moment anchoring
 * a note saved the document and LEFT THE EDITOR OPEN. It then offered "Leave
 * without saving" over a note that was already safely on the clause.
 *
 * Found in the browser during the clause-workflow acceptance review. Comparing
 * canonically is the fix, because the reordering is the database being correct
 * rather than anything the editor should be trying to match.
 */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, held: unknown) =>
    held && typeof held === "object" && !Array.isArray(held)
      ? Object.fromEntries(
          Object.keys(held as Record<string, unknown>)
            .sort()
            .map((key) => [key, (held as Record<string, unknown>)[key]]),
        )
      : held,
  );

export function sameDoc(a: ClauseDoc | null | undefined, b: ClauseDoc | null | undefined): boolean {
  return canonical(a ?? null) === canonical(b ?? null);
}

export function asDoc(value: unknown): ClauseDoc | null {
  if (!value || typeof value !== "object") return null;
  const doc = value as ClauseDoc;
  if (doc.type !== "doc" || !Array.isArray(doc.content)) return null;
  return doc;
}
