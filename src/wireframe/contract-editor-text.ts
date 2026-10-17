import { normalizeText } from "@/lib/parsing/word-diff";

/**
 * The save path re-diffs on whitespace-normalised text, so a draft that differs
 * from the clause only in spacing is not an edit: saving it would record an
 * audit event and a "human" analysis source for no change to the document.
 */
export const isClauseEdited = (before: string, draft: string) =>
  normalizeText(before) !== normalizeText(draft);
