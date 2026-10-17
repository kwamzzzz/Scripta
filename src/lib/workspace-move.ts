/**
 * Filing a matter, or an unfiled task, under a different workspace.
 *
 * ---------------------------------------------------------------------------
 * THIS SHOWS THE MATTER TO NOBODY NEW
 * ---------------------------------------------------------------------------
 *
 * Worth stating plainly, because "move to another workspace" sounds like a
 * disclosure and is not one. `is_matter_member()` does not consult
 * `workspace_members` — Phase 3 decided the matter team is the confidentiality
 * boundary — and every read policy is written on top of that. So the team
 * travels with the matter, and somebody in the destination firm who is not on
 * the matter still cannot read a word of it.
 *
 * What it DOES change is the ceiling. A firm role caps a matter role:
 * a person admitted to the destination workspace as a viewer becomes a Viewer
 * on this matter whatever the team says. That is invisible in the data and it
 * is the one consequence worth showing before anybody presses anything, which
 * is what `matter_move_preview` is for.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export type Workspace = { id: string; name: string };

export type MovePreview = {
  fromName: string;
  toName: string;
  flows: number;
  tasks: number;
  notes: number;
  reviews: number;
  documents: number;
  /** People the destination firm's Viewer ceiling would quietly demote. */
  capped: string[];
  /** People the move would release from the ceiling they are under now. */
  released: string[];
};

/** Only workspaces you administer: moving needs admin at BOTH ends. */
export function useAdministeredWorkspaces() {
  return useQuery({
    queryKey: ["workspaces-i-administer"],
    queryFn: async (): Promise<Workspace[]> => {
      const { data, error } = await db.rpc("workspaces_i_administer");
      if (error) throw new Error(error.message);
      return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
        id: String(row["id"]),
        name: String(row["name"] ?? "Untitled workspace"),
      }));
    },
  });
}

export function useMovePreview(matterId: string | null, toWorkspace: string | null) {
  return useQuery({
    queryKey: ["matter-move-preview", matterId, toWorkspace],
    enabled: !!matterId && !!toWorkspace,
    queryFn: async (): Promise<MovePreview | null> => {
      const { data, error } = await db.rpc("matter_move_preview", {
        _matter: matterId,
        _to: toWorkspace,
      });
      if (error) throw new Error(error.message);
      const row = (data ?? [])[0] as Record<string, unknown> | undefined;
      if (!row) return null;
      return {
        fromName: String(row["from_name"] ?? "this workspace"),
        toName: String(row["to_name"] ?? "that workspace"),
        flows: Number(row["flows"] ?? 0),
        tasks: Number(row["tasks"] ?? 0),
        notes: Number(row["notes"] ?? 0),
        reviews: Number(row["reviews"] ?? 0),
        documents: Number(row["documents"] ?? 0),
        capped: (row["capped_names"] as string[] | null) ?? [],
        released: (row["released_names"] as string[] | null) ?? [],
      };
    },
  });
}

/** Everything the app knows about a workspace changes, so ask for all of it again. */
const forget = (qc: ReturnType<typeof useQueryClient>) => {
  for (const key of [
    ["matters"],
    ["matter-data"],
    ["board"],
    ["tasks"],
    ["flow"],
    ["workspaces"],
    ["matter-move-preview"],
  ]) {
    void qc.invalidateQueries({ queryKey: key });
  }
};

export function useMoveMatter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ matterId, to }: { matterId: string; to: string }) => {
      const { error } = await db.rpc("move_matter_to_workspace", { _matter: matterId, _to: to });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => forget(qc),
  });
}

export function useMoveTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, to }: { taskId: string; to: string }) => {
      const { error } = await db.rpc("move_task_to_workspace", { _task: taskId, _to: to });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => forget(qc),
  });
}

/**
 * What a move would carry, as one sentence.
 *
 * Exported because it is the line a person reads before deciding, and a wrong
 * count there is worse than no count at all.
 */
export function carries(preview: MovePreview): string {
  const parts: string[] = [];
  const add = (n: number, one: string, many: string) => {
    if (n > 0) parts.push(`${n} ${n === 1 ? one : many}`);
  };
  add(preview.documents, "document", "documents");
  add(preview.flows, "flow", "flows");
  add(preview.tasks, "task", "tasks");
  add(preview.notes, "note", "notes");
  add(preview.reviews, "review", "reviews");
  if (parts.length === 0) return "Nothing else is filed under it yet.";
  if (parts.length === 1) return `It carries ${parts[0]} with it.`;
  return `It carries ${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]} with it.`;
}
