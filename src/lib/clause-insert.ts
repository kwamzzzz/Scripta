/**
 * Inserting a clause into a contract that is already numbered.
 *
 * ---------------------------------------------------------------------------
 * THE NEW CLAUSE TAKES A LETTER. NOTHING ELSE MOVES
 * ---------------------------------------------------------------------------
 *
 * A clause added between 5.2 and 5.3 could be numbered 5.3, with 5.3 becoming
 * 5.4 and every clause after it shifting up. That is the one thing it must not
 * do. The contract's own words refer to "clause 11" and "clause 3.4"; the
 * review's findings cite clause numbers; a schedule points back at the clause
 * that calls it up. Renumbering would leave every one of those pointing at
 * something else, silently, and there is no way to fix it afterwards because
 * the references are prose.
 *
 * So the new clause is 5.2A — which is what a lawyer writes on paper for
 * exactly this reason. Every other number in the document stays true, every
 * cross-reference still means what it said, and the counterparty reading the
 * mark-up can see at a glance which clause was added.
 *
 * The number is only a suggestion: the field is editable, because 5.2A is
 * right for an insertion into a numbered run and wrong for, say, a new
 * schedule.
 *
 * ---------------------------------------------------------------------------
 * AND IT IS PROPOSED, NOT PRONOUNCED
 * ---------------------------------------------------------------------------
 *
 * The wording goes in as a tracked insertion, like every other edit in this
 * app: the clean copy carries it, the marked-up copy shows it as added with
 * the author's name against it, and the counterparty can accept or reject it
 * in Word. A clause that appeared in the document as though it had always been
 * there would be the one edit in Scripta that arrives unannounced.
 */
import { isCounted, isInsertedNumber } from "@/lib/export/structure";
import type { ClauseDoc, DocNode } from "@/wireframe/clause-doc";
import { INSERTION } from "@/wireframe/tracked-change";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/** The number without a letter already added to it: "5.2A" → "5.2". */
export function rootOf(num: string): string {
  const n = num.trim();
  const m = /^(.*\d)([A-Za-z])$/.exec(n);
  return m ? m[1]! : n;
}

/**
 * The number to offer for a clause inserted after this one.
 *
 * A letter is added to the clause above, and the next free letter is taken, so
 * inserting twice in the same place gives 5.2A and then 5.2B rather than two
 * clauses claiming to be the same one. `taken` is every number already in the
 * document, however it got there.
 */
export function suggestClauseNumber(afterNum: string, taken: string[] = []): string {
  const root = rootOf(afterNum);
  if (!root) return "";
  const used = new Set(taken.map((t) => t.trim().toLowerCase()));
  for (const letter of LETTERS) {
    const candidate = `${root}${letter}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  // Twenty-six insertions in one place is not a numbering problem any more,
  // but the field must still come up with something the lawyer can edit.
  for (let n = 1; n < 100; n++) {
    const candidate = `${root}Z${n}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return `${root}Z`;
}

/* The rule itself lives with the exporters, which are the ones that have to
   act on it. Re-exported here because this is where a reader looks for it. */
export { isInsertedNumber };

/** Does this number belong to Word's list, or does it name itself? */
export const countsInList = (num: string) => isCounted(num) && !isInsertedNumber(num);

export type InsertionStamp = {
  changeId: string;
  setId: string;
  authorId: string;
  at: string;
};

/**
 * The wording as a clause document, marked as proposed throughout.
 *
 * Blank lines separate paragraphs, as they do everywhere a lawyer types prose;
 * a single newline is a line break within the paragraph, which is how a
 * lettered sub-paragraph typed into the box survives.
 */
export function insertionDoc(text: string, stamp: InsertionStamp): ClauseDoc {
  const marks = [{ type: INSERTION, attrs: { ...stamp } }];
  const paragraphs = text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const content: DocNode[] = (paragraphs.length ? paragraphs : [""]).map((para) => {
    const lines = para.split("\n");
    const inline: DocNode[] = [];
    lines.forEach((line, at) => {
      if (at) inline.push({ type: "hardBreak" });
      if (line) inline.push({ type: "text", text: line, marks });
    });
    return inline.length ? { type: "paragraph", content: inline } : { type: "paragraph" };
  });

  return { type: "doc", content };
}
