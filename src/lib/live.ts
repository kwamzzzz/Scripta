/**
 * Live structured collaboration.
 *
 * A thread appears while you are reading the matter. A review moves on both
 * screens at once. A task lands in your list without a refresh. That is the
 * whole of it.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS SUBSCRIBES TO, AND WHAT IT REFUSES TO
 * ---------------------------------------------------------------------------
 *
 * INSERT and UPDATE on four tables: comments, approvals, tasks,
 * flow_deliverables. Realtime evaluates each table's SELECT policy as the
 * subscribing user and drops rows they could not read, so the Phase 3 boundary
 * is the boundary here too, unchanged and not re-implemented.
 *
 * NOT DELETE. A delete payload carries only the primary key — the row is gone,
 * so there is nothing left to run a policy against — and it therefore reaches
 * every subscriber. Subscribing would leak the existence and the id of rows on
 * matters you are not on. Something vanishing is handled by refetching, which
 * is what the invalidations below do anyway.
 *
 STILL NOT PRESENCE, in the channel sense. Phase 4's objection stands and has
 * not been overruled: channel membership is not gated by table policies, so a
 * matter-keyed presence channel would need its own authorisation surface
 * written from scratch. Phase 5 sidesteps it instead. A lease is a ROW, in
 * `edit_locks`, with a policy on it — so "who is in this clause" is read
 * through the boundary that already exists, and nothing new is authorised.
 *
 * CLAUSES, from Phase 5 and not before. Phase 4 refused this in code, and the
 * reason was that publishing document text before there was a model for
 * concurrent editing would have made LAST WRITE WINS the behaviour of the
 * product. That reason is spent: `save_clause_doc` now refuses a save while
 * another lawyer holds the clause, and refuses a save built on a stale read.
 * The last write does not win, so the clause can go live.
 *
 * STILL NOT DOCUMENTS. Nothing has changed about whole documents: there is no
 * lease on one and no merge model for one, and publishing them would reinstate
 * exactly the behaviour above, one level up.
 *
 * ---------------------------------------------------------------------------
 * WHY IT INVALIDATES RATHER THAN PATCHING THE CACHE
 * ---------------------------------------------------------------------------
 *
 * The obvious optimisation is to take the row out of the payload and splice it
 * into the query cache. It is wrong here. The payload is a table row; what the
 * screens render is the output of `thread_context()`, `review_for()` and
 * `task_actions()` — answers that depend on the reader's role, on who is
 * responsible for the entity, and on whether the transition is theirs to make.
 * Splicing the row in would show new content judged by stale permissions, which
 * is the one thing this phase has spent its whole length refusing to do.
 *
 * So a change is a signal to ask again, never an answer in itself.
 */
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CLAUSE_WRITE_CACHES } from "@/lib/tracked-clause";

/** Tables whose changes mean "ask again", and what to ask again about. */
const WATCHED: { table: string; keys: string[][] }[] = [
  { table: "comments", keys: [["thread"], ["notes"], ["unseen-mentions"]] },
  { table: "approvals", keys: [["review"], ["tasks"], ["board"]] },
  { table: "tasks", keys: [["tasks"], ["board"], ["task-actions"], ["matter-data"]] },
  { table: "flow_deliverables", keys: [["flow"], ["matter-data"], ["board"]] },
  /* Wording. The payload carries the whole document and is dropped by RLS for
     anybody not on the matter — but it is still only a signal to ask again.
     What the screens render is the four readings plus `clause_context()`, and
     splicing a row in would show new wording judged by stale standing. */
  { table: "clauses", keys: CLAUSE_WRITE_CACHES.map((key) => [key]) },
  /* Somebody arriving in a clause. Expiry is not published — nobody writes a
     row when a lease lapses — so the presence hooks poll for that separately. */
  { table: "edit_locks", keys: [["clause-lease"], ["presence"]] },
];

/**
 * Subscribe while a matter is open.
 *
 * One channel per matter, torn down when the matter changes or the screen goes
 * away. The subscription is not filtered by matter in the server-side `filter`
 * clause: `comments` is polymorphic and carries no `matter_id` to filter on, so
 * the honest arrangement is to let RLS do the scoping it already does correctly
 * rather than to half-filter in two places and believe the weaker one.
 */
export function useLiveMatter(matterId: string | null | undefined) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!matterId) return;

    // A name of its own: supabase.channel() hands back an existing channel of
    // the same name, already subscribed, and two providers open on one matter
    // (a screen nested in another) would then fail adding their listeners.
    // crypto.randomUUID is absent on non-secure origins, hence the fallback.
    const unique =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase.channel(`matter:${matterId}:${unique}`);
    try {
      for (const { table, keys } of WATCHED) {
        for (const event of ["INSERT", "UPDATE"] as const) {
          channel.on(
            // The generated types do not carry the realtime overloads, and this
            // is the one place that needs them.
            "postgres_changes" as never,
            { event, schema: "public", table } as never,
            (() => {
              for (const key of keys) void qc.invalidateQueries({ queryKey: key });
            }) as never,
          );
        }
      }
      void channel.subscribe();
    } catch {
      // A channel that refuses its listeners is a lost live update, never a
      // blank screen: the screens still read through their queries.
      void supabase.removeChannel(channel);
    }

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [matterId, qc]);
}
