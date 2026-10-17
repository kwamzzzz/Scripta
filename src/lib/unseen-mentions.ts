/**
 * The mention marker: a quiet dot on a matter that has named you since you last
 * opened it.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS DELIBERATELY IS NOT
 * ---------------------------------------------------------------------------
 *
 * Not an inbox, not a feed, not a notification centre, and not a count. It
 * returns a SET OF MATTER IDS and nothing else — never a timestamp, never whose
 * mention it was, never how many. A count is the first step towards an inbox,
 * and an inbox is the thing Phase 4 refused to build: a list that carried every
 * mention would stop being the answer to "what do I have to do" within a week,
 * and the first thing anybody would ask for is a way to filter it out.
 *
 * A mention creates no task. That is the whole point of the four verbs. Request,
 * assignment and review put work in somebody's list because each is work
 * somebody has to do; a mention means *look at this*, and it earns a dot.
 *
 * ---------------------------------------------------------------------------
 * WHY THE READ IS A FUNCTION AND NOT A QUERY
 * ---------------------------------------------------------------------------
 *
 * `mentions_seen_at` is unreadable by `authenticated` — a column privilege, not
 * a policy, because RLS is row-level and the team card reads every row of
 * `matter_members`. Nobody learns when a colleague last read their mentions. So
 * both directions go through security-definer functions that touch only the
 * caller's own row: `matters_with_unseen_mentions()` to read, and
 * `mark_mentions_seen()` to clear.
 *
 * A null `mentions_seen_at` means never looked, and every mention counts. That
 * is the right answer for somebody added to a matter this morning: they should
 * see that they were named in it, not a clean slate that hides it.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export const UNSEEN_MENTIONS_KEY = ["unseen-mentions"] as const;

/** Matter ids carrying a mention of me made after I last opened them. */
export function useUnseenMentions() {
  return useQuery({
    queryKey: UNSEEN_MENTIONS_KEY,
    staleTime: 30_000,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await db.rpc("matters_with_unseen_mentions");
      /* A marker is a courtesy. If it cannot be read the matters list must still
         draw — failing the whole screen because a dot could not be computed
         would be the wrong trade every time. */
      if (error) return new Set<string>();
      const ids = (data ?? []) as unknown[];
      return new Set(
        ids
          .map((row) =>
            typeof row === "string"
              ? row
              : ((row as Record<string, unknown>)?.["matters_with_unseen_mentions"] as string),
          )
          .filter((id): id is string => typeof id === "string"),
      );
    },
  });
}

export function useMarkMentionsSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (matterId: string) => {
      const { error } = await db.rpc("mark_mentions_seen", { p_matter: matterId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: UNSEEN_MENTIONS_KEY }),
  });
}

/**
 * Opening the matter clears its marker.
 *
 * Deliberately on opening the matter rather than on scrolling the thread into
 * view: the promise the dot makes is "there is something here you have not
 * seen", and a person who opens the file has been given the chance to see it.
 * Anything finer becomes a read receipt, which is the per-message state the
 * plan rules out.
 */
export function useClearMentionsOnOpen(matterId: string | null | undefined) {
  const mark = useMarkMentionsSeen();
  const run = mark.mutate;
  useEffect(() => {
    if (!matterId) return;
    run(matterId);
    // `run` is stable for the life of the mutation; re-running on it would
    // clear the marker again on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matterId]);
}
