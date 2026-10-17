/**
 * Application-wide administrators.
 *
 * Membership lives in `public.platform_admins`; the tables enforce who may
 * read or change it. These helpers only decide what the interface offers.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type AdminRow = {
  user_id: string;
  created_at: string;
  full_name: string | null;
  email: string | null;
};

export function useIsPlatformAdmin() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["platform-admin", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_admins")
        .select("user_id")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
  });
  return { isAdmin: query.data ?? false, loading: !!user && query.isLoading };
}

export async function listPlatformAdmins(): Promise<AdminRow[]> {
  const { data, error } = await supabase
    .from("platform_admins")
    .select("user_id, created_at")
    .order("created_at", { ascending: true });
  if (error) throw error;
  const rows = data ?? [];
  if (!rows.length) return [];
  const { data: people } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in(
      "id",
      rows.map((r) => r.user_id),
    );
  return rows.map((r) => {
    const p = (people ?? []).find((x) => x.id === r.user_id);
    return {
      user_id: r.user_id,
      created_at: r.created_at,
      full_name: p?.full_name ?? null,
      email: p?.email ?? null,
    };
  });
}

export async function listPeople(): Promise<
  { id: string; full_name: string | null; email: string | null }[]
> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .order("email", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Grants administrator access to an existing account, found by email. */
export async function addPlatformAdmin(email: string, grantedBy: string) {
  const clean = email.trim().toLowerCase();
  if (!clean) throw new Error("Enter an email address.");
  const { data: person, error } = await supabase
    .from("profiles")
    .select("id, email")
    .ilike("email", clean)
    .maybeSingle();
  if (error) throw error;
  if (!person) throw new Error("No account with that email has signed in yet.");
  const { error: insertError } = await supabase
    .from("platform_admins")
    .insert({ user_id: person.id, granted_by: grantedBy });
  if (insertError) {
    if (insertError.code === "23505") throw new Error("That person is already an administrator.");
    throw insertError;
  }
}

export async function removePlatformAdmin(userId: string) {
  const { error } = await supabase.from("platform_admins").delete().eq("user_id", userId);
  if (error) throw error;
}
