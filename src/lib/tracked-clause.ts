/**
 * One clause, as the workbench works with it.
 *
 * Loading, saving, and settling — the three things a lawyer does to wording —
 * with the model in `tracked-change.ts` doing the document work and the
 * database doing the judging.
 *
 * ---------------------------------------------------------------------------
 * THE INTERFACE HAS NO OPINION ABOUT WHO MAY SETTLE
 * ---------------------------------------------------------------------------
 *
 * `mayISettle` is not computed here. `clause_context()` returns it, decided by
 * `can_settle_change()` — the same function `save_clause_doc()` consults when
 * the write arrives. This is the arrangement Phase 4 arrived at after
 * `task_actions()` and `review_for()` were found reading with more authority
 * than their callers, and it is the reason a control that is drawn is a control
 * that works.
 *
 * Accepting and rejecting are computed locally and sent as a whole document,
 * because they ARE document transformations — the server does not need a verb,
 * it needs to check that the changes which disappeared were the caller's to
 * settle. That check does not depend on being told what the caller intended,
 * which is what makes it hard to fool.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { asDoc, docToText, type ClauseDoc } from "@/wireframe/clause-doc";
import { retitle } from "@/lib/clause-title";
import {
  acceptChange,
  acceptSet,
  changesIn,
  ifAccepted,
  operative,
  rejectChange,
  rejectSet,
  type TrackedChange,
} from "@/wireframe/tracked-change";

const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

/**
 * The four ways a lawyer reads a clause.
 *
 * Named so that none of them can be mistaken for the operative wording. The
 * first draft of the plan called the third "Current", which quietly implied
 * that unresolved proposals had already become the contract — the ambiguity
 * that had to go before the model was frozen.
 */
export type Reading = "received" | "markedUp" | "operative" | "ifAccepted";

export const READING_LABEL: Record<Reading, string> = {
  received: "As received",
  markedUp: "Marked up",
  operative: "Operative",
  ifAccepted: "If accepted",
};

export const READING_MEANING: Record<Reading, string> = {
  received: "The counterparty's wording, before anybody marked it up.",
  markedUp: "Every unresolved proposal, attributed. This is what you send out.",
  operative: "The wording that stands today. No unresolved proposal is applied.",
  ifAccepted: "How it would read if every outstanding proposal were taken.",
};

export type ClauseContext = {
  matterId: string | null;
  /** From the database, never derived here. */
  mayEdit: boolean;
  /** The Lead, and therefore the only one who may take a held clause. */
  mayBreak: boolean;
  /** Whether this person may settle a change made by the named author. */
  maySettle: (authorId: string) => boolean;
};

export type TrackedClause = {
  doc: ClauseDoc | null;
  /** `updated_at` as this copy was read. Sent back on save; see `save` below. */
  seenAt: string | null;
  /** The clause as received. Read from the first revision; not derivable. */
  baseline: ClauseDoc | null;
  changes: TrackedChange[];
};

/** The document a given reading shows. */
export function render(clause: TrackedClause, reading: Reading): ClauseDoc | null {
  if (!clause.doc) return null;
  switch (reading) {
    case "received":
      // The one reading that is stored rather than computed, because accepting
      // a change removes its mark and the original stops being recoverable.
      return clause.baseline;
    case "markedUp":
      return clause.doc;
    case "operative":
      return operative(clause.doc);
    case "ifAccepted":
      return ifAccepted(clause.doc);
  }
}

export function useTrackedClause(clauseId: string | null | undefined) {
  return useQuery({
    queryKey: ["tracked-clause", clauseId],
    enabled: !!clauseId,
    queryFn: async (): Promise<TrackedClause> => {
      const [clause, baseline] = await Promise.all([
        db.from("clauses").select("doc, updated_at").eq("id", clauseId).maybeSingle(),
        db.rpc("clause_baseline", { _clause: clauseId }),
      ]);
      if (clause.error) throw new Error(clause.error.message);
      const doc = asDoc(clause.data?.doc);
      return {
        doc,
        seenAt: (clause.data?.updated_at as string | null) ?? null,
        baseline: asDoc(baseline.data) ?? doc,
        changes: doc ? changesIn(doc) : [],
      };
    },
  });
}

/**
 * Who may do what to this clause, as the database sees it.
 *
 * One call rather than one per change: `can_settle_change` depends on the
 * change's AUTHOR and nothing else about it, so the answer is the same for
 * every change by the same person and the interface can ask once.
 */
export function useClauseContext(clauseId: string | null | undefined, authors: string[]) {
  const key = [...new Set(authors)].sort().join(",");
  return useQuery({
    queryKey: ["clause-context", clauseId, key],
    enabled: !!clauseId,
    queryFn: async (): Promise<ClauseContext> => {
      const { data, error } = await db.rpc("clause_context", {
        _clause: clauseId,
        _authors: [...new Set(authors)],
      });
      if (error) throw new Error(error.message);
      const row = (data ?? [])[0] as Record<string, unknown> | undefined;
      if (!row) return { matterId: null, mayEdit: false, mayBreak: false, maySettle: () => false };
      const settleable = new Set((row["settleable"] as string[] | null) ?? []);
      return {
        matterId: (row["matter_id"] as string | null) ?? null,
        mayEdit: row["may_edit"] === true,
        mayBreak: row["may_break"] === true,
        maySettle: (authorId: string) => settleable.has(authorId),
      };
    },
  });
}

/**
 * Every cache that a write to a clause makes stale.
 *
 * ---------------------------------------------------------------------------
 * ONE LIST, BECAUSE THREE LISTS DRIFTED
 * ---------------------------------------------------------------------------
 *
 * A clause is written from three places — the editor and the settle buttons
 * here, a restore in `clause-versions.ts`, and another lawyer's write arriving
 * through `live.ts` — and each of them kept its own list of what to refetch.
 * Only the restore path listed `matter-changes`, so the Changes pane went on
 * showing a change AFTER THE PANE'S OWN BUTTON SETTLED IT, and never learned
 * about a colleague's new proposal at all.
 *
 * A pane that contradicts the click you just made in it is worse than a pane
 * that is merely behind. Found by Codex in the independent acceptance review.
 *
 * The keys are unscoped on purpose: `live.ts` has always invalidated this way,
 * a settle is rare, and a refetch too many costs a query while a refetch too
 * few costs the lawyer a wrong answer about what is outstanding.
 */
export const CLAUSE_WRITE_CACHES = [
  "tracked-clause",
  "clause-context",
  "matter-data",
  "matter-changes",
] as const;

/** Refetch everything a clause write invalidates. */
export function refreshAfterClauseWrite(qc: {
  invalidateQueries: (filters: { queryKey: unknown[] }) => unknown;
}) {
  for (const key of CLAUSE_WRITE_CACHES) void qc.invalidateQueries({ queryKey: [key] });
}

export function useClauseActions(clauseId: string) {
  const qc = useQueryClient();
  const done = () => refreshAfterClauseWrite(qc);
  /**
   * The document arrives whole, with the clause's `updated_at` AS WE READ IT.
   *
   * That second argument is the lost-update guard and it is not a nicety. Two
   * lawyers can hold the clause at different moments, neither lease overlapping
   * the other, and the second still destroy the first's wording. `_seen` is
   * what makes the server able to tell — it refuses rather than overwrites, and
   * the refusal leaves the text on the screen it was typed on.
   */
  const save = async (doc: ClauseDoc) => {
    const seen = qc.getQueryData<TrackedClause>(["tracked-clause", clauseId])?.seenAt ?? null;
    // What the clause said, and its title, before this save: a title taken
    // from the wording is brought up to date when the wording that stands
    // changes, which is when a change is accepted.
    const { data: prior } = await db
      .from("clauses")
      .select("title, doc, clause_segments(ordinal, text, kind)")
      .eq("id", clauseId)
      .maybeSingle();
    const { error } = await db.rpc("save_clause_doc", {
      _clause: clauseId,
      _doc: doc,
      _seen: seen,
    });
    if (error) throw new Error(error.message);
    if (!prior?.title) return;
    const priorDoc = asDoc(prior.doc);
    const before = priorDoc
      ? docToText(operative(priorDoc))
      : [...(prior.clause_segments ?? [])]
          .sort((a: any, b: any) => a.ordinal - b.ordinal)
          .filter((x: any) => x.kind !== "i")
          .map((x: any) => x.text)
          .join("");
    const title = retitle(prior.title, before, docToText(operative(doc)));
    // The wording is saved either way; a title that could not follow is not
    // worth failing the save over.
    if (title) await db.from("clauses").update({ title }).eq("id", clauseId);
  };

  return {
    /** The editor's own save. The document arrives whole; the server judges it. */
    save: useMutation({ mutationFn: save, onSuccess: done }),

    accept: useMutation({
      mutationFn: ({ doc, changeId }: { doc: ClauseDoc; changeId: string }) =>
        save(acceptChange(doc, changeId)),
      onSuccess: done,
    }),
    reject: useMutation({
      mutationFn: ({ doc, changeId }: { doc: ClauseDoc; changeId: string }) =>
        save(rejectChange(doc, changeId)),
      onSuccess: done,
    }),
    /* Withdraw is the same transformation as reject, under the name the product
       uses when it is your own. They are separate here because the RIGHT
       differs — anybody may take back their own proposal — and one function
       with two names makes that impossible to enforce at the callers. */
    withdraw: useMutation({
      mutationFn: ({ doc, changeId }: { doc: ClauseDoc; changeId: string }) =>
        save(rejectChange(doc, changeId)),
      onSuccess: done,
    }),
    acceptAll: useMutation({
      mutationFn: ({ doc, setId }: { doc: ClauseDoc; setId: string }) =>
        save(acceptSet(doc, setId)),
      onSuccess: done,
    }),
    rejectAll: useMutation({
      mutationFn: ({ doc, setId }: { doc: ClauseDoc; setId: string }) =>
        save(rejectSet(doc, setId)),
      onSuccess: done,
    }),
  };
}
