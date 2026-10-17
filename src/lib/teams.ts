/**
 * Teams: saved lists of colleagues.
 *
 * ---------------------------------------------------------------------------
 * A TEAM IS AN ADDRESSING MECHANISM, NOT A SECURITY BOUNDARY
 * ---------------------------------------------------------------------------
 *
 * Nothing in this file decides whether anybody may open anything. A matter is
 * governed by `matter_members` and knowledge by its own visibility, exactly as
 * they were before Phase 7. A Team makes it faster to name several people at
 * once, and that is the whole of it.
 *
 * ---------------------------------------------------------------------------
 * THE ONE DISTINCTION
 * ---------------------------------------------------------------------------
 *
 *   Staffing a matter from a Team   SNAPSHOT  — copies the people in now
 *   Sharing knowledge with a Team   DYNAMIC   — follows who is in it
 *
 * They differ because the two sentences mean different things. "Staff this
 * matter with Transactions" is an act performed once on the people it names.
 * "Share this precedent with Transactions" is a standing statement about a
 * group, and the person who joins next month is exactly who it was for.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as unknown as {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export type Team = {
  id: string;
  name: string;
  archivedAt: string | null;
  memberCount: number;
};

export type TeamMember = { userId: string; name: string };

/** Live teams first; archived ones are history and sort to the bottom. */
export function useTeams(workspaceId: string | null | undefined) {
  return useQuery({
    queryKey: ["teams", workspaceId],
    enabled: !!workspaceId,
    queryFn: async (): Promise<Team[]> => {
      const { data, error } = await db
        .from("teams")
        .select("id, name, archived_at, team_members(user_id)")
        .eq("workspace_id", workspaceId)
        .order("name");
      if (error) return [];
      return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
        id: String(row["id"]),
        name: String(row["name"] ?? "Untitled team"),
        archivedAt: (row["archived_at"] as string | null) ?? null,
        memberCount: ((row["team_members"] as unknown[] | null) ?? []).length,
      }));
    },
  });
}

export function useTeamMembers(teamId: string | null | undefined) {
  return useQuery({
    queryKey: ["team-members", teamId],
    enabled: !!teamId,
    queryFn: async (): Promise<TeamMember[]> => {
      const { data, error } = await db
        .from("team_members")
        .select("user_id, profiles(full_name, email)")
        .eq("team_id", teamId);
      if (error) return [];
      return ((data ?? []) as Record<string, unknown>[]).map((row) => {
        const p = row["profiles"] as { full_name?: string; email?: string } | null;
        return {
          userId: String(row["user_id"]),
          name: p?.full_name || p?.email || "Somebody",
        };
      });
    },
  });
}

export function useTeamActions(workspaceId: string | null | undefined) {
  const qc = useQueryClient();
  const done = () => {
    void qc.invalidateQueries({ queryKey: ["teams", workspaceId] });
    void qc.invalidateQueries({ queryKey: ["team-members"] });
    /* Team membership decides team-derived knowledge access, so anything
       shared with a team may have just changed hands. */
    void qc.invalidateQueries({ queryKey: ["precedents"] });
    void qc.invalidateQueries({ queryKey: ["knowledge"] });
  };
  const call = async (fn: string, args: Record<string, unknown>) => {
    const { error } = await db.rpc(fn, args);
    if (error) throw new Error(error.message);
  };
  return {
    create: useMutation({
      mutationFn: (name: string) => call("create_team", { _workspace: workspaceId, _name: name }),
      onSuccess: done,
    }),
    rename: useMutation({
      mutationFn: ({ teamId, name }: { teamId: string; name: string }) =>
        call("rename_team", { _team: teamId, _name: name }),
      onSuccess: done,
    }),
    setArchived: useMutation({
      mutationFn: ({ teamId, archived }: { teamId: string; archived: boolean }) =>
        call("set_team_archived", { _team: teamId, _archived: archived }),
      onSuccess: done,
    }),
    addMember: useMutation({
      mutationFn: ({ teamId, userId }: { teamId: string; userId: string }) =>
        call("add_team_member", { _team: teamId, _user: userId }),
      onSuccess: done,
    }),
    removeMember: useMutation({
      mutationFn: ({ teamId, userId }: { teamId: string; userId: string }) =>
        call("remove_team_member", { _team: teamId, _user: userId }),
      onSuccess: done,
    }),
  };
}

export type StaffingPreview = {
  userId: string;
  name: string;
  alreadyMember: boolean;
  existingRole: string | null;
};

/** What staffing would do, before anybody does it. */
export function useStaffingPreview(matterId: string | null, teamId: string | null) {
  return useQuery({
    queryKey: ["staffing-preview", matterId, teamId],
    enabled: !!matterId && !!teamId,
    queryFn: async (): Promise<StaffingPreview[]> => {
      const { data, error } = await db.rpc("preview_team_staffing", {
        _matter: matterId,
        _team: teamId,
      });
      if (error) throw new Error(error.message);
      return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
        userId: String(row["user_id"]),
        name: String(row["name"] ?? "Somebody"),
        alreadyMember: row["already_member"] === true,
        existingRole: (row["existing_role"] as string | null) ?? null,
      }));
    },
  });
}

export function useStaffMatterFromTeam(matterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ teamId, role }: { teamId: string; role: string }) => {
      const { data, error } = await db.rpc("staff_matter_from_team", {
        _matter: matterId,
        _team: teamId,
        _role: role,
      });
      if (error) throw new Error(error.message);
      return (data ?? {}) as { added?: number; already?: number; team?: string };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["matter-team", matterId] });
      void qc.invalidateQueries({ queryKey: ["matter-data"] });
      void qc.invalidateQueries({ queryKey: ["awareness"] });
    },
  });
}

/** Sharing knowledge with a team, and taking it back. */
export function useTeamKnowledgeSharing(kind: string, id: string) {
  const qc = useQueryClient();
  const done = () => {
    void qc.invalidateQueries({ queryKey: ["knowledge-shares", kind, id] });
    void qc.invalidateQueries({ queryKey: ["knowledge-context", kind, id] });
    void qc.invalidateQueries({ queryKey: ["precedents"] });
  };
  const call = async (fn: string, teamId: string) => {
    const { error } = await db.rpc(fn, { _kind: kind, _id: id, _team: teamId });
    if (error) throw new Error(error.message);
  };
  return {
    shareWithTeam: useMutation({
      mutationFn: (teamId: string) => call("share_knowledge_with_team", teamId),
      onSuccess: done,
    }),
    unshareFromTeam: useMutation({
      mutationFn: (teamId: string) => call("unshare_knowledge_from_team", teamId),
      onSuccess: done,
    }),
  };
}

/**
 * The sentence shown before staffing a matter from a team.
 *
 * Exported because it is what a Lead reads before changing who can see a
 * confidential file, and a wrong count there is worse than no count.
 */
export function describeStaffing(preview: StaffingPreview[]): string {
  const joining = preview.filter((p) => !p.alreadyMember).length;
  const already = preview.length - joining;
  if (preview.length === 0) return "This team has nobody in it yet.";
  const parts: string[] = [];
  parts.push(joining === 1 ? "1 person will be added" : `${joining} people will be added`);
  if (already > 0) {
    parts.push(
      already === 1 ? "1 is already on this matter" : `${already} are already on this matter`,
    );
  }
  return `${parts.join(" · ")}.`;
}
