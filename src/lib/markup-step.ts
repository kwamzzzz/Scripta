/**
 * What one step of the mark-up did, read off the two versions either side of it.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS COMPUTED AND NOT LOGGED
 * ---------------------------------------------------------------------------
 *
 * A log records what somebody's code believed at the time. The documents
 * record what the clause actually said. Every step here — a proposal, an
 * acceptance, a rejection, a highlight lifted — is derived from the pair of
 * documents, so the history cannot drift from the wording it describes, and a
 * step nobody thought to log still shows up.
 *
 * ---------------------------------------------------------------------------
 * ACCEPTED AND REJECTED LOOK THE SAME UNTIL YOU READ THE WORDS
 * ---------------------------------------------------------------------------
 *
 * Settling a change removes its mark, so in the newer document there is
 * nothing left of it either way. What separates the two is whether its words
 * are still in the clause: an accepted insertion leaves its words behind, a
 * rejected one takes them away; an accepted deletion takes them away, a
 * rejected one leaves them. That is the test used here, and it is why this
 * file needs both documents rather than the marks alone.
 */
import { docToText, type ClauseDoc, type DocNode } from "@/wireframe/clause-doc";
import { changesIn, operative, type TrackedChange } from "@/wireframe/tracked-change";
import { HIGHLIGHT } from "@/wireframe/highlight-mark";
import { wordDiff, type DiffSeg } from "@/lib/parsing/word-diff";

/** A change that was settled in this step, and what became of its words. */
export type Settled = {
  changeId: string;
  kind: "insertion" | "deletion";
  text: string;
  authorId: string | null;
  fate: "accepted" | "rejected";
};

export type MarkupStep = {
  /** The wording, word by word: what went in, what came out. Empty if nothing moved. */
  wording: DiffSeg[];
  /**
   * There is no earlier version to compare with — this is where the record of
   * this clause begins. `text` is what it said, and it is shown as it stands
   * rather than as a diff: painting a whole clause green would say the lawyer
   * wrote all of it, which is exactly the wrong thing to tell them.
   */
  first: boolean;
  text: string;
  /** Changes proposed in this step. */
  proposed: TrackedChange[];
  /** Changes settled in this step, with their fate. */
  settled: Settled[];
  /** Phrases the highlighter was run over, and taken off. */
  highlighted: string[];
  unhighlighted: string[];
  /** True when the two versions say and mark exactly the same thing. */
  nothing: boolean;
};

/** The text of every run carrying a mark, in document order. */
export function phrasesWithMark(doc: ClauseDoc | null | undefined, markType: string): string[] {
  const out: string[] = [];
  let run = "";
  const flush = () => {
    const phrase = run.trim();
    if (phrase) out.push(phrase);
    run = "";
  };
  const walk = (nodes: DocNode[] | undefined) => {
    for (const node of nodes ?? []) {
      if (typeof node.text === "string") {
        if (node.marks?.some((m) => m.type === markType)) run += node.text;
        else flush();
        continue;
      }
      flush();
      if (node.content) walk(node.content);
    }
  };
  walk(doc?.content);
  flush();
  return out;
}

const only = (list: string[], other: string[]): string[] => {
  const seen = new Map<string, number>();
  for (const phrase of other) seen.set(phrase, (seen.get(phrase) ?? 0) + 1);
  return list.filter((phrase) => {
    const left = seen.get(phrase) ?? 0;
    if (left > 0) {
      seen.set(phrase, left - 1);
      return false;
    }
    return true;
  });
};

/** Whether these words are still in the clause once revisions are applied. */
const survives = (text: string, doc: ClauseDoc): boolean => {
  const words = text.trim();
  if (!words) return false;
  // Against the reading that treats every outstanding change as settled the
  // way it stands: an insertion in, a deletion out.
  return docToText(operative(doc)).includes(words) || docToText(doc).includes(words);
};

/**
 * One step: from the version before to the version after.
 *
 * `before` may be null — the first version recorded of a clause has nothing to
 * be compared with, and saying so is better than inventing a diff against an
 * empty document.
 */
export function describeStep(before: ClauseDoc | null, after: ClauseDoc): MarkupStep {
  const wasChanges = before ? changesIn(before) : [];
  const nowChanges = changesIn(after);
  const nowIds = new Set(nowChanges.map((c) => c.changeId));
  const wasIds = new Set(wasChanges.map((c) => c.changeId));

  const proposed = nowChanges.filter((c) => !wasIds.has(c.changeId));
  const settled: Settled[] = wasChanges
    .filter((c) => !nowIds.has(c.changeId))
    .map((c) => {
      const kept = survives(c.text, after);
      return {
        changeId: c.changeId,
        kind: c.kind === "deletion" ? "deletion" : "insertion",
        text: c.text,
        authorId: c.authorId ?? null,
        // An insertion that left its words behind was accepted; a deletion
        // that left its words behind was refused.
        fate: (c.kind === "deletion" ? !kept : kept) ? "accepted" : "rejected",
      };
    });

  /* The wording as a reader sees it: the operative text either side, so a
     proposal shows as the words it would add rather than as nothing at all. */
  const beforeText = before ? docToText(before) : "";
  const afterText = docToText(after);
  const first = !before;
  const wording = first || beforeText === afterText ? [] : wordDiff(beforeText, afterText);

  const wasMarked = phrasesWithMark(before, HIGHLIGHT);
  const nowMarked = phrasesWithMark(after, HIGHLIGHT);
  const highlighted = only(nowMarked, wasMarked);
  const unhighlighted = only(wasMarked, nowMarked);

  return {
    wording,
    first,
    text: afterText,
    proposed,
    settled,
    highlighted,
    unhighlighted,
    nothing:
      !first &&
      !wording.length &&
      !proposed.length &&
      !settled.length &&
      !highlighted.length &&
      !unhighlighted.length,
  };
}

/**
 * A sitting: a run of work by one person with no long gap in it.
 *
 * A lawyer does not think in saves, they think in sittings — "what did I do to
 * this document on Tuesday afternoon". Consecutive steps by the same author
 * within `gapMinutes` of each other are one sitting; a different author, or a
 * longer silence, starts another.
 */
export function intoSittings<T extends { at: string; authorId: string | null }>(
  steps: T[],
  gapMinutes = 45,
): T[][] {
  const out: T[][] = [];
  for (const step of steps) {
    const current = out[out.length - 1];
    const last = current?.[current.length - 1];
    const apart = last
      ? Math.abs(new Date(step.at).getTime() - new Date(last.at).getTime()) / 60000
      : Infinity;
    if (current && last && last.authorId === step.authorId && apart <= gapMinutes)
      current.push(step);
    else out.push([step]);
  }
  return out;
}
