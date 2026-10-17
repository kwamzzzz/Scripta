/**
 * Requesting work, declining it, and handing it over.
 *
 * Three verbs that look alike in a task list and are not alike at all:
 *
 *   REQUEST   Please do this.      Creates a task.                 Declinable.
 *   DECLINE   Not me, because…     Returns it to whoever asked.
 *   ASSIGN    This is yours now.   Moves work that already exists. Not declinable.
 *
 * A request is an ASK, and an ask that cannot be refused is an instruction
 * wearing a question mark — so declining is a first-class move and the work goes
 * back to the person who wanted it rather than evaporating. An assignment is a
 * statement of fact by somebody entitled to make it, and refusing it would be
 * refusing the allocation of work, which is not a conversation a task list
 * should be hosting.
 *
 * All three go through database functions rather than table writes. Not for
 * ceremony: each carries a rule the interface would otherwise have to remember
 * (the person must be on the matter; only a request can be declined; a Reviewer
 * may ask and may not allocate) and each writes the audit row that IS the
 * reassignment history — there is no history table, and a screen that wrote the
 * row itself could forget to.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export type TaskActions = {
  /** Only a request, only its assignee, and only while it has an asker to go back to. */
  iMayDecline: boolean;
  /** can_write_matter: allocating work is running the matter. */
  iMayAssign: boolean;
  /** Who asked, where anybody did. Null on work that was assigned or self-made. */
  askedBy: string | null;
};

const NONE: TaskActions = { iMayDecline: false, iMayAssign: false, askedBy: null };

export function useTaskActions(taskId: string | null | undefined) {
  return useQuery({
    queryKey: ["task-actions", taskId],
    enabled: !!taskId,
    queryFn: async (): Promise<TaskActions> => {
      const { data, error } = await db.rpc("task_actions", { _task: taskId });
      if (error) throw new Error(error.message);
      const row = (data ?? [])[0] as Record<string, unknown> | undefined;
      // No row means not a member. The absence is the answer.
      if (!row) return NONE;
      return {
        iMayDecline: row["i_may_decline"] === true,
        iMayAssign: row["i_may_assign"] === true,
        askedBy: (row["asked_by"] as string | null) ?? null,
      };
    },
  });
}

export function useWorkActions() {
  const qc = useQueryClient();
  const done = () => {
    void qc.invalidateQueries({ queryKey: ["tasks"] });
    void qc.invalidateQueries({ queryKey: ["board"] });
    void qc.invalidateQueries({ queryKey: ["task-actions"] });
    void qc.invalidateQueries({ queryKey: ["matter-data"] });
  };
  const call = async (fn: string, args: Record<string, unknown>) => {
    const { error } = await db.rpc(fn, args);
    if (error) throw new Error(error.message);
  };

  return {
    request: useMutation({
      mutationFn: ({
        matterId,
        assignee,
        title,
        detail,
        due,
      }: {
        matterId: string;
        assignee: string;
        title: string;
        detail?: string | null;
        due?: string | null;
      }) =>
        call("request_work", {
          _matter: matterId,
          _assignee: assignee,
          _title: title,
          _detail: detail ?? null,
          _due: due ?? null,
        }),
      onSuccess: done,
    }),
    /* The reason is required by the database, not merely by this form. Declining
       without one sends the asker back to square one, which makes the whole
       round trip a waste of two people's time. */
    decline: useMutation({
      mutationFn: ({ taskId, reason }: { taskId: string; reason: string }) =>
        call("decline_work", { _task: taskId, _reason: reason }),
      onSuccess: done,
    }),
    assign: useMutation({
      mutationFn: ({ taskId, to }: { taskId: string; to: string | null }) =>
        call("assign_work", { _task: taskId, _to: to }),
      onSuccess: done,
    }),
    setDeliverableOwner: useMutation({
      mutationFn: ({ deliverableId, to }: { deliverableId: string; to: string | null }) =>
        call("set_deliverable_owner", { _deliverable: deliverableId, _to: to }),
      onSuccess: () => {
        done();
        void qc.invalidateQueries({ queryKey: ["flow"] });
      },
    }),
  };
}
