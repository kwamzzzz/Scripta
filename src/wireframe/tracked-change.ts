/**
 * Tracked changes: the model, and the readings derived from it.
 *
 * A tracked change is a MARK ON THE TEXT, never a row pointing at an offset. A
 * table of `from`/`to` positions fails on the first edit anybody makes above the
 * change, because every stored offset silently shifts — which is the ground on
 * which Phase 4 refused text anchors outright. A mark is the anchor that
 * survives, because the editor moves marks with their text as part of applying
 * every transaction. Nothing in this module, or anywhere else in Phase 5,
 * stores a position.
 *
 * This file depends on no editor and no database, for the same reason
 * `clause-doc.ts` next to it does not: the Word and PDF exporters, the server's
 * authorship check and the readings all have to understand a clause without
 * loading ProseMirror.
 *
 * ---------------------------------------------------------------------------
 * THE FOUR READINGS, AND THE ONE THAT IS NOT HERE
 * ---------------------------------------------------------------------------
 *
 *   As received   the counterparty's baseline
 *   Marked up     every unresolved proposal, attributed — what you send out
 *   Operative     the wording that stands today
 *   If accepted   how it would read if every outstanding proposal were taken
 *
 * `asReceived` is deliberately ABSENT from this module, and that absence is
 * load-bearing. Accepting a change removes its mark — that is what accepting
 * means — so once anything has been accepted the document no longer contains
 * the wording it started from. The baseline is therefore NOT derivable and is
 * read from the clause's first stored revision. A function here that claimed to
 * reconstruct it would be right until the first acceptance and quietly wrong
 * forever after.
 *
 * ---------------------------------------------------------------------------
 * AN UNRESOLVED PROPOSAL IS NOT OPERATIVE WORDING
 * ---------------------------------------------------------------------------
 *
 * This is the distinction the whole model exists to keep, so it is written out:
 *
 *   text proposed for DELETION  still operates, until the deletion is accepted
 *   text proposed for INSERTION does not operate, until the insertion is
 *
 * So `operative()` drops insertions and keeps deletions, and `ifAccepted()` does
 * the opposite. They are not variations on a theme; they are opposite readings,
 * and a person who confuses them signs the wrong contract.
 */
import type { ClauseDoc, DocMark, DocNode } from "./clause-doc";

export const INSERTION = "insertion";
export const DELETION = "deletion";
export const COMMENT_REF = "commentRef";

export type ChangeKind = typeof INSERTION | typeof DELETION;

/** What a change mark carries. All four are required; none is optional. */
export type ChangeAttrs = {
  /** This change, so it can be accepted alone, cited in a comment, audited. */
  changeId: string;
  /** The sitting it belongs to, so "accept all of Podrick's" is one act. */
  setId: string;
  /** Stamped and validated server-side. Never trusted from the client. */
  authorId: string;
  /** ISO 8601. */
  at: string;
};

/** One change, gathered from however many text nodes carry its mark. */
export type TrackedChange = ChangeAttrs & {
  kind: ChangeKind;
  /** The words it covers, in document order. */
  text: string;
};

const isChangeMark = (mark: DocMark): mark is DocMark & { attrs: Record<string, string> } =>
  (mark.type === INSERTION || mark.type === DELETION) &&
  typeof mark.attrs?.["changeId"] === "string";

const markOf = (node: DocNode, type: string): DocMark | undefined =>
  node.marks?.find((mark) => mark.type === type);

const attrsOf = (mark: DocMark): ChangeAttrs => ({
  changeId: String(mark.attrs?.["changeId"] ?? ""),
  setId: String(mark.attrs?.["setId"] ?? ""),
  authorId: String(mark.attrs?.["authorId"] ?? ""),
  at: String(mark.attrs?.["at"] ?? ""),
});

/* -------------------------------------------------------------------------- */
/* The two primitives                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Drop every text node the predicate selects.
 *
 * Empty blocks are KEPT. A paragraph whose every word was an unaccepted
 * insertion is still a paragraph the author wrote, and silently collapsing it
 * would make `operative()` change the shape of the document rather than its
 * wording. A text node with an empty string is removed, because ProseMirror
 * does not admit one.
 */
function dropText(node: DocNode, select: (node: DocNode) => boolean): DocNode | null {
  if (typeof node.text === "string") return select(node) ? null : node;
  if (!node.content) return node;
  const content = node.content
    .map((child) => dropText(child, select))
    .filter((child): child is DocNode => child !== null && child.text !== "");
  return { ...node, content };
}

/** Strip one mark from every node carrying it, leaving the text in place. */
function dropMark(node: DocNode, select: (mark: DocMark, node: DocNode) => boolean): DocNode {
  const next: DocNode = { ...node };
  if (node.marks) {
    const marks = node.marks.filter((mark) => !select(mark, node));
    if (marks.length) next.marks = marks;
    else delete next.marks;
  }
  if (node.content) next.content = node.content.map((child) => dropMark(child, select));
  return next;
}

const mapDoc = (doc: ClauseDoc, f: (node: DocNode) => DocNode | null): ClauseDoc => {
  const mapped = f({ type: "doc", content: doc.content });
  return { type: "doc", content: mapped?.content ?? [] };
};

const carries = (node: DocNode, type: string, id: string, key: "changeId" | "setId") =>
  node.marks?.some((mark) => mark.type === type && mark.attrs?.[key] === id) === true;

const carriesAny = (node: DocNode, id: string, key: "changeId" | "setId") =>
  carries(node, INSERTION, id, key) || carries(node, DELETION, id, key);

/* -------------------------------------------------------------------------- */
/* The readings                                                                */
/* -------------------------------------------------------------------------- */

/** What you send out: the document exactly as stored. */
export const markedUp = (doc: ClauseDoc): ClauseDoc => doc;

/**
 * The wording that stands today.
 *
 * Drops text proposed for insertion — it does not operate yet. Keeps text
 * proposed for deletion, unmarked — it still operates until the deletion is
 * accepted.
 *
 * Text carrying BOTH marks was inserted by one lawyer and then proposed for
 * deletion by another. Neither proposal is resolved, so it does not operate,
 * and the insertion branch below removes it first.
 */
export function operative(doc: ClauseDoc): ClauseDoc {
  const withoutInsertions = mapDoc(doc, (node) =>
    dropText(node, (n) => markOf(n, INSERTION) !== undefined),
  );
  return mapDoc(withoutInsertions, (node) =>
    dropMark(node, (mark) => mark.type === DELETION || mark.type === INSERTION),
  ) as ClauseDoc;
}

/**
 * How it would read if every outstanding proposal were accepted.
 *
 * A preview, never a state. Nothing is signed from this reading, and the label
 * in the interface says so.
 */
export function ifAccepted(doc: ClauseDoc): ClauseDoc {
  const withoutDeletions = mapDoc(doc, (node) =>
    dropText(node, (n) => markOf(n, DELETION) !== undefined),
  );
  return mapDoc(withoutDeletions, (node) =>
    dropMark(node, (mark) => mark.type === DELETION || mark.type === INSERTION),
  ) as ClauseDoc;
}

/** Any reading, with comment anchors removed. For export, never for editing. */
export const withoutAnchors = (doc: ClauseDoc): ClauseDoc =>
  mapDoc(doc, (node) => dropMark(node, (mark) => mark.type === COMMENT_REF)) as ClauseDoc;

/**
 * The words a thread is anchored to.
 *
 * Gathered across text nodes, for the same reason `changesIn` gathers: the
 * editor splits a run wherever another mark starts or stops, so a comment on
 * "the Seller shall not, without consent," is four nodes if two of those words
 * are somebody's proposal.
 *
 * Returns null when the anchor is gone. That happens honestly — the words a
 * comment was about can be deleted and the deletion accepted — and a thread
 * that has lost its anchor is still a thread ON THE CLAUSE. It is shown without
 * a quotation rather than hidden, because a note somebody wrote does not stop
 * existing when the sentence it was about does.
 */
export function anchorText(doc: ClauseDoc, threadId: string): string | null {
  let found = "";
  const walk = (node: DocNode) => {
    if (typeof node.text === "string") {
      const mark = node.marks?.find(
        (m) => m.type === COMMENT_REF && m.attrs?.["threadId"] === threadId,
      );
      if (mark) found += node.text;
    }
    node.content?.forEach(walk);
  };
  doc.content.forEach(walk);
  return found ? found : null;
}

/* -------------------------------------------------------------------------- */
/* Reading the changes out                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Every change in the document, in document order, one entry per `changeId`.
 *
 * A change usually spans several text nodes — the editor splits a run wherever
 * another mark starts or stops — so the text is gathered rather than taken from
 * the first node found. This is what the Changes pane lists and what the
 * server's authorship check walks.
 */
export function changesIn(doc: ClauseDoc): TrackedChange[] {
  const byId = new Map<string, TrackedChange>();
  const walk = (node: DocNode) => {
    if (typeof node.text === "string" && node.marks) {
      for (const mark of node.marks) {
        if (!isChangeMark(mark)) continue;
        const attrs = attrsOf(mark);
        const existing = byId.get(attrs.changeId);
        if (existing) existing.text += node.text;
        else
          byId.set(attrs.changeId, {
            ...attrs,
            kind: mark.type as ChangeKind,
            text: node.text,
          });
      }
    }
    node.content?.forEach(walk);
  };
  doc.content.forEach(walk);
  return [...byId.values()];
}

/** Whether anything is outstanding. Gates "export for signature". */
export const hasUnresolved = (doc: ClauseDoc): boolean => changesIn(doc).length > 0;

/** The comment threads anchored into this document. */
export function anchoredThreads(doc: ClauseDoc): string[] {
  const ids = new Set<string>();
  const walk = (node: DocNode) => {
    const mark = node.marks?.find((m) => m.type === COMMENT_REF);
    const id = mark?.attrs?.["threadId"];
    if (typeof id === "string" && id) ids.add(id);
    node.content?.forEach(walk);
  };
  doc.content.forEach(walk);
  return [...ids];
}

/* -------------------------------------------------------------------------- */
/* Settling changes                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Accept: the proposal becomes the wording.
 *
 *   an insertion  the mark goes, the text stays
 *   a deletion    the text goes
 */
export function acceptChange(doc: ClauseDoc, changeId: string): ClauseDoc {
  const withoutDeleted = mapDoc(doc, (node) =>
    dropText(node, (n) => carries(n, DELETION, changeId, "changeId")),
  );
  return mapDoc(withoutDeleted, (node) =>
    dropMark(node, (mark) => isChangeMark(mark) && mark.attrs["changeId"] === changeId),
  ) as ClauseDoc;
}

/**
 * Reject: the proposal is refused and the wording is unaffected.
 *
 *   an insertion  the text goes
 *   a deletion    the mark goes, the text stays
 *
 * `withdrawChange` is the identical transformation under the name the product
 * uses when the person doing it is the change's own author. They are separated
 * because the AUTHORITY differs — anybody may take back their own proposal,
 * and refusing somebody else's is a substantive act — and keeping one function
 * with two names makes that distinction impossible to enforce at the callers.
 */
export function rejectChange(doc: ClauseDoc, changeId: string): ClauseDoc {
  const withoutInserted = mapDoc(doc, (node) =>
    dropText(node, (n) => carries(n, INSERTION, changeId, "changeId")),
  );
  return mapDoc(withoutInserted, (node) =>
    dropMark(node, (mark) => isChangeMark(mark) && mark.attrs["changeId"] === changeId),
  ) as ClauseDoc;
}

/** The author taking back their own proposal. Same transformation, different right. */
export const withdrawChange = rejectChange;

/** Accept every change made in one sitting. */
export function acceptSet(doc: ClauseDoc, setId: string): ClauseDoc {
  const withoutDeleted = mapDoc(doc, (node) =>
    dropText(node, (n) => carries(n, DELETION, setId, "setId")),
  );
  return mapDoc(withoutDeleted, (node) =>
    dropMark(node, (mark) => isChangeMark(mark) && mark.attrs["setId"] === setId),
  ) as ClauseDoc;
}

/** Refuse every change made in one sitting. */
export function rejectSet(doc: ClauseDoc, setId: string): ClauseDoc {
  const withoutInserted = mapDoc(doc, (node) =>
    dropText(node, (n) => carries(n, INSERTION, setId, "setId")),
  );
  return mapDoc(withoutInserted, (node) =>
    dropMark(node, (mark) => isChangeMark(mark) && mark.attrs["setId"] === setId),
  ) as ClauseDoc;
}

/** Whether this document mentions a change or a set at all. */
export const containsChange = (
  doc: ClauseDoc,
  id: string,
  key: "changeId" | "setId" = "changeId",
) => {
  let found = false;
  const walk = (node: DocNode) => {
    if (found) return;
    if (carriesAny(node, id, key)) found = true;
    else node.content?.forEach(walk);
  };
  doc.content.forEach(walk);
  return found;
};

/* -------------------------------------------------------------------------- */
/* Authorship                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Every author named anywhere in the document.
 *
 * The server compares this against `auth.uid()` before accepting a write. Phase
 * 4's worst defect was a comment that could be signed as a colleague because
 * nothing stamped or checked `author_id`; a tracked change makes the same claim
 * about a person, on the same professional record, and arrives buried in JSON
 * where it is far easier to miss.
 */
export const authorsIn = (doc: ClauseDoc): string[] => [
  ...new Set(
    changesIn(doc)
      .map((change) => change.authorId)
      .filter(Boolean),
  ),
];

/**
 * The changes in `next` that are not in `previous`, by id.
 *
 * What a save is allowed to introduce. Anything new must be attributed to the
 * person saving it; changes that were already there keep whatever authorship
 * they had, which is how a colleague can accept part of your markup without
 * the remainder being re-signed in their name.
 */
export function changesAdded(previous: ClauseDoc, next: ClauseDoc): TrackedChange[] {
  const before = new Set(changesIn(previous).map((change) => change.changeId));
  return changesIn(next).filter((change) => !before.has(change.changeId));
}
