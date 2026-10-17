/**
 * Things I should know happened.
 *
 *   Tasks           what I must do
 *   Notifications   what I should know happened      ← this
 *   Matter Activity what happened on the file
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS REFUSES TO BE
 * ---------------------------------------------------------------------------
 *
 * Not an inbox. Not a notification-management product — no preferences matrix,
 * no per-event toggles, no digests, no channels. No unread count that climbs:
 * a dot, and the count exists only to decide whether the dot is lit.
 *
 * And no per-event read state. One timestamp per person, the same shape as
 * `matter_members.mentions_seen_at`, which has worked since Phase 4. If this
 * ever grows a table of read receipts it has become the thing we refused.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export type AwarenessEvent = {
  id: string;
  matterId: string | null;
  eventType: string;
  summary: string;
  actorName: string;
  entityType: string | null;
  entityId: string | null;
  at: string;
  isNew: boolean;
};

export const AWARENESS_KEY = ["awareness"] as const;

/**
 * Where an event takes you.
 *
 * Every entry deep-links to the exact thing, not to the matter it happened on.
 * That is not a convenience: the Phase 4 acceptance test failed to find a
 * review on a one-contract matter because the clause selection had moved by one
 * row, and "open the matter and hunt" is what this layer exists to replace.
 */
export function linkFor(event: AwarenessEvent): string | null {
  const matter = event.matterId;
  if (!matter) return null;
  switch (event.entityType) {
    case "clause":
      return `/matters/${matter}?screen=review&clause=${event.entityId}`;
    case "comment":
      // The thread lives on whatever the comment is about; the matter screen
      // resolves it and scrolls to the thread.
      return `/matters/${matter}?screen=matter&thread=${event.entityId}`;
    case "task":
      return `/tasks?task=${event.entityId}`;
    case "approval":
      return `/matters/${matter}?screen=review&review=${event.entityId}`;
    case "deliverable":
      return `/matters/flow?matter=${matter}&deliverable=${event.entityId}`;
    default:
      return `/matters/${matter}`;
  }
}

/** What the entry says, in the words a lawyer would use. */
export function describe(event: AwarenessEvent): string {
  const who = event.actorName || "Somebody";
  switch (event.eventType) {
    case "comment.posted":
      return `${who} commented`;
    case "comment.edited":
      return `${who} edited a comment`;
    case "review.requested":
      return `${who} asked you to review`;
    case "review.decided":
      return `${who} moved a review`;
    case "review.withdrawn":
      return `${who} withdrew a review`;
    case "work.requested":
      return `${who} asked you to do something`;
    case "work.declined":
      return `${who} declined`;
    case "work.handed_off":
      return `${who} handed work over`;
    case "change.proposed":
      return `${who} proposed wording`;
    case "change.settled":
    case "clause.edited":
      return `${who} settled wording`;
    /* The Lead took a clause you were working in. Phrased as what happened to
       YOU, because that is why you are being told — the audit summary reads
       from the actor's side ("Took the clause from Podrick Robogo") and would
       be an odd thing to read about yourself. */
    case "lease.broken":
      return `${who} took a clause you were in`;
    default:
      return `${who} — ${event.summary}`;
  }
}

export function useAwareness(limit = 30) {
  return useQuery({
    queryKey: [...AWARENESS_KEY, limit],
    staleTime: 20_000,
    queryFn: async (): Promise<AwarenessEvent[]> => {
      const { data, error } = await db.rpc("events_involving_me", { _limit: limit });
      /* A bell is a courtesy. If it cannot be read the application must still
         work — failing a screen because a dot could not be computed would be
         the wrong trade every time. */
      if (error) return [];
      return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
        id: String(row["id"]),
        matterId: (row["matter_id"] as string | null) ?? null,
        eventType: String(row["event_type"] ?? ""),
        summary: String(row["summary"] ?? ""),
        actorName: String(row["actor_name"] ?? ""),
        entityType: (row["entity_type"] as string | null) ?? null,
        entityId: (row["entity_id"] as string | null) ?? null,
        at: String(row["created_at"] ?? ""),
        isNew: row["is_new"] === true,
      }));
    },
  });
}

export function useMarkAwarenessSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("mark_notifications_seen");
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: AWARENESS_KEY }),
  });
}
