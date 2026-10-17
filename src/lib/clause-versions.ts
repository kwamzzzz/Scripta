/**
 * What this clause said before.
 *
 * ---------------------------------------------------------------------------
 * GOING BACK IS NOT AN UNDO
 * ---------------------------------------------------------------------------
 *
 * Restoring Tuesday's wording throws away every proposal made since. If three
 * of them were a colleague's, the restore has rejected their drafting without
 * anybody pressing Reject on it — so `restore_clause_revision()` requires the
 * right to settle every author whose work would go, which is the same right
 * asked for one change at a time. Nothing here computes that; the server
 * refuses and the screen says what it said.
 *
 * Nothing is ever rewound. A restore keeps the current document first, writes
 * the earlier one as the clause, and records a 'restored' revision — so going
 * back is reversible by the same means, and going back is itself in the
 * history.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { asDoc, type ClauseDoc } from "@/wireframe/clause-doc";
import { refreshAfterClauseWrite } from "@/lib/tracked-clause";

const db = supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export type RevisionKind = "baseline" | "kept" | "milestone" | "restored";

export type Revision = {
  id: string;
  kind: RevisionKind;
  label: string | null;
  note: string | null;
  by: string;
  at: string;
};

/** What each kind means, in the words a lawyer would use for it. */
export const REVISION_MEANING: Record<RevisionKind, string> = {
  baseline: "As received, before anybody marked it up.",
  kept: "Kept deliberately.",
  milestone: "A version that went out, or was approved.",
  restored: "An earlier version was brought back.",
};

export function useClauseVersions(clauseId: string | null | undefined) {
  return useQuery({
    queryKey: ["clause-versions", clauseId],
    enabled: !!clauseId,
    queryFn: async (): Promise<Revision[]> => {
      const { data, error } = await db.rpc("clause_revision_list", { _clause: clauseId });
      if (error) throw new Error(error.message);
      return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
        id: String(row["id"]),
        kind: (row["kind"] as RevisionKind) ?? "kept",
        label: (row["label"] as string | null) ?? null,
        note: (row["note"] as string | null) ?? null,
        by: String(row["created_by_name"] ?? "Somebody"),
        at: String(row["created_at"] ?? ""),
      }));
    },
  });
}

/** One version's document, for comparing against. */
export function useRevisionDoc(revisionId: string | null) {
  return useQuery({
    queryKey: ["clause-revision-doc", revisionId],
    enabled: !!revisionId,
    queryFn: async (): Promise<ClauseDoc | null> => {
      const { data, error } = await db.rpc("clause_revision_doc", { _revision: revisionId });
      if (error) throw new Error(error.message);
      return asDoc(data);
    },
  });
}

export function useVersionActions(clauseId: string) {
  const qc = useQueryClient();
  const done = () => {
    void qc.invalidateQueries({ queryKey: ["clause-versions", clauseId] });
    refreshAfterClauseWrite(qc);
  };
  return {
    keep: useMutation({
      mutationFn: async ({ label, milestone }: { label: string; milestone: boolean }) => {
        const { error } = await db.rpc("keep_clause_revision", {
          _clause: clauseId,
          _label: label,
          _note: null,
          _kind: milestone ? "milestone" : "kept",
        });
        if (error) throw new Error(error.message);
      },
      onSuccess: done,
    }),
    restore: useMutation({
      mutationFn: async (revisionId: string) => {
        const { data, error } = await db.rpc("restore_clause_revision", { _revision: revisionId });
        if (error) throw new Error(error.message);
        return (data ?? {}) as { discarded?: number };
      },
      onSuccess: done,
    }),
  };
}
