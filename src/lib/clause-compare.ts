/**
 * What changed between two versions of a clause.
 *
 * ---------------------------------------------------------------------------
 * THIS IS NOT THE REDLINE, AND MUST NEVER BE MISTAKEN FOR IT
 * ---------------------------------------------------------------------------
 *
 * Phase 5's redline is a set of marks in the document, each carrying the name
 * of the lawyer who made it. THIS is a word diff between two saved versions,
 * computed after the fact, and it knows nothing about who did anything. The two
 * look similar on screen and mean entirely different things:
 *
 *   the redline    proposals, attributed, that somebody may accept or reject
 *   a comparison   how two versions differ, with nobody's name on it
 *
 * The plan's third prohibition was that diffs must not become pseudo-versioning
 * — the thing Phase 4 refused. This stays on the right side of it because
 * nothing here is stored, nothing is attributed, and nothing derived here can
 * be accepted. It is a reading aid for a lawyer asking "what moved since
 * Tuesday", and the screen that shows it says so.
 *
 * The algorithm is the oldest one there is — a longest common subsequence over
 * words — because a comparison that is clever about legal text is a comparison
 * that is occasionally confidently wrong about legal text.
 */
import { docToText, type ClauseDoc } from "@/wireframe/clause-doc";

export type DiffPart = { text: string; kind: "same" | "added" | "removed" };

/**
 * Words, with the whitespace that follows each one attached to it.
 *
 * Both halves of that matter. Keeping the whitespace means the two texts can be
 * rebuilt from the diff exactly, which is the property the suite checks on
 * every case. ATTACHING it, rather than emitting it as its own token, is what
 * makes consecutive edits read as one change: with separate space tokens the
 * spaces survive as common subsequence and "b c" becomes struck-b, kept-space,
 * struck-c, which a lawyer reads as two edits where there was one.
 */
const split = (text: string): string[] => text.match(/\S+\s*|\s+/g) ?? [];

export function compareText(before: string, after: string): DiffPart[] {
  const a = split(before);
  const b = split(after);

  /* The table is (a.length + 1) x (b.length + 1). A clause is a paragraph or
     two, so this is small — but a pasted schedule is not, and a comparison that
     locks the browser is worse than one that declines. */
  if (a.length * b.length > 1_000_000) {
    return before === after
      ? [{ text: after, kind: "same" }]
      : [
          { text: before, kind: "removed" },
          { text: after, kind: "added" },
        ];
  }

  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] =
        a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const parts: DiffPart[] = [];
  const push = (text: string, kind: DiffPart["kind"]) => {
    const last = parts[parts.length - 1];
    if (last && last.kind === kind) last.text += text;
    else parts.push({ text, kind });
  };

  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push(a[i]!, "same");
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      push(a[i]!, "removed");
      i++;
    } else {
      push(b[j]!, "added");
      j++;
    }
  }
  while (i < a.length) push(a[i++]!, "removed");
  while (j < b.length) push(b[j++]!, "added");
  return parts;
}

export const compareDocs = (before: ClauseDoc | null, after: ClauseDoc | null): DiffPart[] =>
  compareText(docToText(before), docToText(after));

/** Whether there is anything to show. A comparison of nothing is not a finding. */
export const differs = (parts: DiffPart[]): boolean => parts.some((part) => part.kind !== "same");
