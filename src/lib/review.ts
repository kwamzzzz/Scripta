/**
 * Check my work.
 *
 * `Requested → In review → Changes requested → Approved`, with the round trip
 * professional review actually has. Four values on a column that already
 * existed, one rule about who may move them, and nothing that resembles a
 * workflow engine: no branches, no conditions, no configuration.
 *
 * ---------------------------------------------------------------------------
 * THE STATE LIVES ON THE THING, NOT IN A QUEUE
 * ---------------------------------------------------------------------------
 *
 * A review queue would be a second place to look, and a second place to look is
 * a place that goes stale. The review is drawn beside the clause or the task it
 * is about, and the only thing that goes into anybody's list is the reviewer's
 * task — because that is work somebody has to do.
 *
 * ---------------------------------------------------------------------------
 * WHY EVERY MOVE GOES THROUGH THE DATABASE
 * ---------------------------------------------------------------------------
 *
 * `canMove` is not computed here. `review_for()` returns `i_may_move`, decided
 * by `can_move_review()` — the same function the trigger consults when the
 * write arrives. The interface has no opinion of its own about who may decide a
 * review, which is the point: the rule that somebody demoted to Viewer stops
 * being able to approve is exactly the rule a screen would forget.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ThreadKind } from "@/lib/thread";

const db = supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export type ReviewStatus =
  "Not required" | "Requested" | "In review" | "Changes requested" | "Approved" | "Rejected";

export type Review = {
  id: string;
  status: ReviewStatus;
  assignedTo: string | null;
  requestedBy: string | null;
  taskId: string | null;
  reason: string | null;
  decidedAt: string | null;
  /** From the database, never derived here. */
  iMayMove: boolean;
  iMayWithdraw: boolean;
};

/** What each state means, in the words a firm would use. */
export const REVIEW_LABEL: Record<ReviewStatus, string> = {
  "Not required": "No review",
  Requested: "Review requested",
  "In review": "In review",
  "Changes requested": "Changes requested",
  Approved: "Approved",
  Rejected: "Rejected",
};

/**
 * The moves offered from each state, and what the button should say.
 *
 * A transcription of `review_transition_allowed()`. Offering a move the
 * database refuses would be the interface arguing with a rule it cannot change;
 * offering fewer than it allows would quietly remove a step people need.
 */
export const REVIEW_MOVES: Record<ReviewStatus, { to: ReviewStatus; label: string }[]> = {
  "Not required": [{ to: "Requested", label: "Ask for review" }],
  Requested: [
    { to: "In review", label: "Start reviewing" },
    { to: "Changes requested", label: "Request changes" },
    { to: "Approved", label: "Approve" },
    { to: "Rejected", label: "Reject" },
  ],
  "In review": [
    { to: "Changes requested", label: "Request changes" },
    { to: "Approved", label: "Approve" },
    { to: "Rejected", label: "Reject" },
  ],
  "Changes requested": [{ to: "Requested", label: "Resubmit" }],
  Approved: [],
  Rejected: [],
};

/** Terminal states are terminal. A decision that quietly reopens is not one. */
export const isSettled = (status: ReviewStatus) => status === "Approved" || status === "Rejected";

export function useReview(kind: ThreadKind, entityId: string | null | undefined) {
  return useQuery({
    queryKey: ["review", kind, entityId],
    enabled: !!entityId,
    queryFn: async (): Promise<Review | null> => {
      const { data, error } = await db.rpc("review_for", { _kind: kind, _id: entityId });
      if (error) throw new Error(error.message);
      const row = (data ?? [])[0] as Record<string, unknown> | undefined;
      // No row means either no review, or not a member. Both draw nothing, and
      // the interface must not try to tell them apart.
      if (!row) return null;
      return {
        id: String(row["id"]),
        status: row["status"] as ReviewStatus,
        assignedTo: (row["assigned_to"] as string | null) ?? null,
        requestedBy: (row["requested_by"] as string | null) ?? null,
        taskId: (row["task_id"] as string | null) ?? null,
        reason: (row["reason"] as string | null) ?? null,
        decidedAt: (row["decided_at"] as string | null) ?? null,
        iMayMove: row["i_may_move"] === true,
        iMayWithdraw: row["i_may_withdraw"] === true,
      };
    },
  });
}

export function useReviewActions(kind: ThreadKind, entityId: string) {
  const qc = useQueryClient();
  const done = () => {
    void qc.invalidateQueries({ queryKey: ["review", kind, entityId] });
    void qc.invalidateQueries({ queryKey: ["tasks"] });
    void qc.invalidateQueries({ queryKey: ["board"] });
  };
  const call = async (fn: string, args: Record<string, unknown>) => {
    const { error } = await db.rpc(fn, args);
    if (error) throw new Error(error.message);
  };

  return {
    /** Creates the approval, the reviewer's task and the audit row together. */
    request: useMutation({
      mutationFn: ({
        reviewer,
        title,
        reason,
      }: {
        reviewer: string;
        title: string;
        reason?: string | null;
      }) =>
        call("request_review", {
          _kind: kind,
          _id: entityId,
          _reviewer: reviewer,
          _title: title,
          _reason: reason ?? null,
        }),
      onSuccess: done,
    }),
    /* A plain table write. The trigger judges the transition and the person,
       and a function here would be a third place for the rule to live. */
    move: useMutation({
      mutationFn: async ({
        id,
        status,
        reason,
      }: {
        id: string;
        status: ReviewStatus;
        reason?: string | null;
      }) => {
        const patch: Record<string, unknown> = { status };
        if (reason !== undefined) patch["reason"] = reason;
        const { error } = await (supabase as unknown as { from: (t: string) => any })
          .from("approvals")
          .update(patch)
          .eq("id", id);
        if (error) throw new Error(error.message);
      },
      onSuccess: done,
    }),
    /** Not a state: a withdrawn review did not happen, and its task goes too. */
    withdraw: useMutation({
      mutationFn: (id: string) => call("withdraw_review", { _approval: id }),
      onSuccess: done,
    }),
  };
}
