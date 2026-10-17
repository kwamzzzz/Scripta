/**
 * The signed-in member's role in the current workspace.
 *
 * Read straight from `workspace_members`, which every member may already see.
 * It answers what the interface should offer, never what the caller may have:
 * the tables enforce that themselves.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useApp } from "@/store/app";

export type WorkspaceRole = "owner" | "admin" | "lawyer" | "viewer";

export function useWorkspaceRole() {
  const { workspace } = useApp();
  const { user } = useAuth();
  const enabled = !!workspace && !!user;
  const query = useQuery({
    queryKey: ["workspace-role", workspace?.id, user?.id],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", workspace!.id)
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data?.role ?? null) as WorkspaceRole | null;
    },
  });
  return { role: query.data ?? null, loading: enabled && query.isLoading };
}
