/**
 * Who is working on a matter.
 *
 * Responsibility, not access. Everything here describes what a person is
 * answerable for on a file — leading it, drafting in it, reviewing it, reading
 * it — and none of it changes what anybody can open. That comes in Phase 3, and
 * until it does, no word in this module or the screens above it should suggest
 * otherwise.
 *
 * The Lead is the one role the database holds on to: exactly one per matter,
 * kept by a partial unique index, a delete guard and an update guard, because a
 * matter that loses its Lead becomes a file nobody can reach the moment the
 * boundary moves. So it does not change by picking a different value in a
 * select. It changes by handing the matter on, which is one deliberate act and
 * one function.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/* The generated Supabase types are regenerated on sync and do not yet carry
   `matter_members`, so the calls are cast at this boundary and nowhere else. */
const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export type MatterRole = "lead" | "editor" | "reviewer" | "viewer";

/** What each role is answerable for, in the words a firm would use. */
export const ROLE_LABEL: Record<MatterRole, string> = {
  lead: "Lead",
  editor: "Editor",
  reviewer: "Reviewer",
  viewer: "Viewer",
};

export const ROLE_MEANING: Record<MatterRole, string> = {
  lead: "Answerable for the file. One per matter.",
  editor: "Drafts, runs the tools, moves the work along.",
  reviewer: "Reads and comments on the work rather than doing it.",
  viewer: "Follows the matter without working on it.",
};

/** The roles somebody may be given directly. Lead is reached by handover. */
export const ASSIGNABLE_ROLES: MatterRole[] = ["editor", "reviewer", "viewer"];

export type TeamMember = {
  userId: string;
  role: MatterRole;
  name: string;
  email: string;
  addedAt: string;
  /** Null where the row records no adder, which no current path produces. */
  addedByName: string | null;
  /**
   * They put the matter there. The seed trigger writes the creator as their own
   * adder, so a row that added itself is the beginning of the file rather than
   * somebody being brought onto it.
   */
  isCreator: boolean;
};

export type FirmPerson = { userId: string; name: string; email: string };

const str = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * Two letters for a face.
 *
 * A name gives its first and last initial; a bare email gives the first two
 * letters of its local part, which is not elegant but is at least stable —
 * a person who has never set a name should not become a blank circle.
 */
export function initialsOf(name: string, email = ""): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase();
  if (words.length === 1 && words[0]!.length) return words[0]!.slice(0, 2).toUpperCase();
  const local = email.split("@")[0] ?? "";
  return (local.slice(0, 2) || "?").toUpperCase();
}

/** The name to print. Falls back to the address rather than to an empty space. */
export const displayName = (p: {
  name?: string | null | undefined;
  email?: string | null | undefined;
}) => (p.name ?? "").trim() || (p.email ?? "").trim() || "Unknown";

/** The role sort: the Lead first, then the order the roles were given. */
const ORDER: Record<MatterRole, number> = { lead: 0, editor: 1, reviewer: 2, viewer: 3 };

export async function loadMatterTeam(matterId: string): Promise<TeamMember[]> {
  const { data, error } = await db
    .from("matter_members")
    .select("user_id, role, added_by, added_at")
    .eq("matter_id", matterId);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as {
    user_id: string;
    role: MatterRole;
    added_by: string | null;
    added_at: string;
  }[];
  if (!rows.length) return [];

  const ids = [
    ...new Set(rows.flatMap((r) => [r.user_id, r.added_by].filter(Boolean))),
  ] as string[];
  const { data: people, error: peopleError } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", ids);
  if (peopleError) throw new Error(peopleError.message);
  const person = (id: string | null) => (people ?? []).find((p) => p.id === id) ?? null;

  return rows
    .map((r): TeamMember => {
      const me = person(r.user_id);
      const adder = person(r.added_by);
      return {
        userId: r.user_id,
        role: r.role,
        name: displayName({ name: me?.full_name, email: me?.email }),
        email: str(me?.email),
        addedAt: str(r.added_at),
        addedByName: adder ? displayName({ name: adder.full_name, email: adder.email }) : null,
        isCreator: r.added_by === r.user_id,
      };
    })
    .sort((a, b) => ORDER[a.role] - ORDER[b.role] || a.name.localeCompare(b.name));
}

/** Everybody in the firm, whether or not they are on this matter. */
export async function loadFirmPeople(workspaceId: string): Promise<FirmPerson[]> {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);
  const ids = ((data ?? []) as { user_id: string }[]).map((r) => r.user_id);
  if (!ids.length) return [];
  const { data: people, error: peopleError } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", ids);
  if (peopleError) throw new Error(peopleError.message);
  return ((people ?? []) as { id: string; full_name: string | null; email: string | null }[])
    .map((p) => ({
      userId: p.id,
      name: displayName({ name: p.full_name, email: p.email }),
      email: str(p.email),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function useMatterTeam(matterId: string | null | undefined) {
  return useQuery({
    queryKey: ["matter-team", matterId],
    enabled: !!matterId,
    queryFn: () => loadMatterTeam(matterId!),
  });
}

export function useFirmPeople(workspaceId: string | null | undefined) {
  return useQuery({
    queryKey: ["firm-people", workspaceId],
    enabled: !!workspaceId,
    queryFn: () => loadFirmPeople(workspaceId!),
  });
}

/**
 * Every change goes through a database function rather than a table write.
 *
 * Each one has a rule attached that the interface would otherwise have to
 * remember — you cannot add somebody straight to Lead, you cannot remove the
 * Lead, a role change is not a handover — and a rule the interface remembers is
 * a rule that holds until the next screen forgets it.
 */
export function useTeamActions(matterId: string) {
  const qc = useQueryClient();
  const done = () => {
    void qc.invalidateQueries({ queryKey: ["matter-team", matterId] });
    void qc.invalidateQueries({ queryKey: ["matters"] });
  };
  const call = async (fn: string, args: Record<string, unknown>) => {
    const { error } = await db.rpc(fn, args);
    if (error) throw new Error(error.message);
  };

  return {
    add: useMutation({
      mutationFn: ({ userId, role }: { userId: string; role: MatterRole }) =>
        call("add_matter_member", { p_matter: matterId, p_user: userId, p_role: role }),
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: (userId: string) =>
        call("remove_matter_member", { p_matter: matterId, p_user: userId }),
      onSuccess: done,
    }),
    setRole: useMutation({
      mutationFn: ({ userId, role }: { userId: string; role: MatterRole }) =>
        call("set_matter_member_role", { p_matter: matterId, p_user: userId, p_role: role }),
      onSuccess: done,
    }),
    handOver: useMutation({
      mutationFn: (userId: string) =>
        call("set_matter_lead", { p_matter: matterId, p_user: userId }),
      onSuccess: done,
    }),
  };
}

/**
 * Every name the signed-in person is allowed to see, in one query.
 *
 * A flow board draws dozens of owners and a task list dozens of assignees, and
 * each of them is a user id that has to become a name. Threading a team through
 * every row to resolve them would put a collaboration concern into components
 * that have no other reason to know about one — so the names are fetched once
 * and read from a map.
 *
 * The profiles policy already limits this to people who share a workspace with
 * you, so "every name" is the firm and nobody else.
 */
export function useProfileNames() {
  return useQuery({
    queryKey: ["profile-names"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, email");
      if (error) throw new Error(error.message);
      const names = new Map<string, { name: string; email: string }>();
      for (const p of (data ?? []) as {
        id: string;
        full_name: string | null;
        email: string | null;
      }[])
        names.set(p.id, {
          name: displayName({ name: p.full_name, email: p.email }),
          email: str(p.email),
        });
      return names;
    },
  });
}

/** "Added by Mawusi · 14 August", or "Created the matter · 12 August". */
export function provenanceOf(m: TeamMember): string {
  const date = new Date(m.addedAt);
  const when = Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
  const what = m.isCreator ? "Created the matter" : `Added by ${m.addedByName ?? "a colleague"}`;
  return when ? `${what} · ${when}` : what;
}
