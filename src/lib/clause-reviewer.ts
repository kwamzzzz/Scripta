/**
 * Who is reviewing a clause.
 *
 * `clauses.assignee_id` has existed since the schema was written and has never
 * had an interface — a column recording a decision nobody could make. Phase 2
 * gives it one, on the same terms as every other piece of responsibility in
 * Scripta: a member of the matter team, or nobody.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useSetClauseReviewer(matterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ clauseId, userId }: { clauseId: string; userId: string | null }) => {
      const { error } = await supabase
        .from("clauses")
        .update({ assignee_id: userId })
        .eq("id", clauseId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["matter", matterId] });
      void qc.invalidateQueries({ queryKey: ["clauses", matterId] });
    },
  });
}
