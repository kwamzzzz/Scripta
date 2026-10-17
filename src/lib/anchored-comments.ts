/**
 * A note about particular words.
 *
 * ---------------------------------------------------------------------------
 * THE ORDER IS THE DESIGN
 * ---------------------------------------------------------------------------
 *
 * The comment is written FIRST and the mark carries its id, rather than the
 * mark being written first and a comment attached to it afterwards.
 *
 * That order is what makes the two halves fail well. A mark pointing at a
 * comment that was never created is an anchor to nothing — it highlights words
 * and opens nothing, and there is no way for a reader to tell it is broken. A
 * comment whose anchor failed to save is still a note on the clause, reads
 * perfectly well without a quotation, and the lawyer can say the same thing
 * again on the words if they want to.
 *
 * ---------------------------------------------------------------------------
 * ANCHORING IS NOT A CHANGE, AND SAVING ONE IS NOT A PROPOSAL
 * ---------------------------------------------------------------------------
 *
 * The saved document goes through `save_clause_doc` like any other, and passes
 * its checks trivially: `doc_change_marks()` looks at insertion and deletion
 * marks only, so a document that differs from its predecessor by one comment
 * anchor introduces no change, re-attributes none, and settles none.
 *
 * Which means anchors are not attributed and can be moved or removed by anyone
 * who may write the clause. That is the right weight for them: an anchor is a
 * pointer into text, not a statement anybody signs. The COMMENT carries the
 * name, it is stamped server-side by `stamp_comment_author()`, and it is the
 * thing that cannot be forged.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ClauseDoc } from "@/wireframe/clause-doc";

const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export function useAnchorComment(clauseId: string, workspaceId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      body,
      apply,
    }: {
      body: string;
      /** Put the mark on the words and hand back the document that results. */
      apply: (threadId: string) => ClauseDoc | null;
    }) => {
      const { data, error } = await db
        .from("comments")
        .insert({
          workspace_id: workspaceId,
          entity_kind: "clause",
          entity_id: clauseId,
          body,
          mentions: [],
          kind: "note",
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);

      const threadId = String((data as { id: string }).id);
      const doc = apply(threadId);
      if (!doc) return;

      const seen = qc.getQueryData<{ seenAt: string | null }>(["tracked-clause", clauseId])?.seenAt;
      const saved = await db.rpc("save_clause_doc", {
        _clause: clauseId,
        _doc: doc,
        _seen: seen ?? null,
      });
      /* The note exists either way. If the anchor could not be saved — the
         clause moved, a colleague took it — say so, and leave the note where
         it is rather than deleting a lawyer's words to tidy up. */
      if (saved.error) {
        throw new Error(`${saved.error.message} The note itself was saved on the clause.`);
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["thread", "clause", clauseId] });
      void qc.invalidateQueries({ queryKey: ["tracked-clause", clauseId] });
      void qc.invalidateQueries({ queryKey: ["notes"] });
    },
  });
}
