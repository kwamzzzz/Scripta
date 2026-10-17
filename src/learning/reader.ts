/**
 * What the read-aloud button says, block by block.
 *
 * The page is written to be read, not heard, so this turns each block into
 * plain speech: a citation's name without its web address, a table row by row
 * with its column names, a practice question with its options but never its
 * answer, and nothing at all for author notes, media and team cards. Long
 * passages are cut at sentence ends, because browsers drop long utterances.
 */
import { isFilledCredit, type Block } from "./blocks";

/** One utterance, and the block on the page it belongs to (for highlighting). */
export type Segment = { blockId: string; text: string };

/** Short enough that no browser cuts it off, long enough to sound natural. */
const MAX_CHARS = 240;

/** Remove what is written for the eye: web addresses, brackets, arrows, table rules. */
export function speakable(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/www\.\S+/g, "")
    .replace(/[[\]]/g, "")
    .replace(/\s+\/\s+/g, ", ")
    .replace(/→/g, " to ")
    .replace(/\s*\|\s*/g, ". ")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/([,.;:])(?:\s*[,.;:])+/g, "$1")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,.;:]+|[\s,;:]+$/g, "")
    .trim();
}

/** Cut at sentence ends into pieces no longer than MAX_CHARS where possible. */
export function chunk(text: string, max = MAX_CHARS): string[] {
  const sentences = text.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g)?.map((s) => s.trim()) ?? [];
  const out: string[] = [];
  let current = "";
  for (const s of sentences.filter(Boolean)) {
    if (current && current.length + 1 + s.length > max) {
      out.push(current);
      current = s;
    } else {
      current = current ? `${current} ${s}` : s;
    }
  }
  if (current) out.push(current);
  return out;
}

const isRule = (cell: string) => /^:?-{2,}:?$/.test(cell.trim());

/** What one block sounds like, before it is cut into utterances. Empty = silent. */
export function spoken(block: Block): string[] {
  const t = speakable(block.text ?? "");
  switch (block.type) {
    case "note":
    case "media":
    case "credit":
      return [];
    case "heading":
      return t ? [t.replace(/[.:]?$/, ".")] : [];
    case "clause":
      return t ? [`Quoted: ${t}`] : [];
    case "caveat":
      return t ? [`Check the current position. ${t}`] : [];
    case "check":
      return t ? [`A question to think about. ${t}`] : [];
    case "authority": {
      const cite = speakable(block.cite ?? "");
      return [[cite, t].filter(Boolean).join(". ")].filter(Boolean);
    }
    case "quiz": {
      const letters = "ABCDEFGH";
      const options = (block.options ?? []).map((o, i) => `${letters[i]}: ${speakable(o)}.`);
      return t ? [`Practice question. ${t}`, ...(options.length ? [options.join(" ")] : [])] : [];
    }
    case "flashcards": {
      const fronts = (block.cards ?? []).map((c, i) => `Card ${i + 1}: ${speakable(c.front)}.`);
      return fronts.length ? [`Flashcards. ${t ? `${t}. ` : ""}${fronts.join(" ")}`] : [];
    }
    case "table": {
      const rows = (block.rows ?? []).filter((r) => !r.every(isRule));
      const [header, ...body] = rows;
      if (!header) return [];
      const title = t ? [`Table: ${t}.`] : [];
      return [
        ...title,
        ...body.map((row) =>
          row
            .map((cell, i) => {
              const value = speakable(cell);
              const name = speakable(header[i] ?? "");
              return value ? (name ? `${name}: ${value}.` : `${value}.`) : "";
            })
            .filter(Boolean)
            .join(" "),
        ),
      ].filter(Boolean);
    }
    default:
      return t ? [t] : [];
  }
}

/** Everything on the page that can be read aloud, in reading order. */
export function readingSegments(blocks: Block[]): Segment[] {
  return blocks.flatMap((block) => {
    if (block.type === "credit" && !isFilledCredit(block)) return [];
    return spoken(block).flatMap((text) =>
      chunk(text).map((t) => ({ blockId: block.id, text: t })),
    );
  });
}
