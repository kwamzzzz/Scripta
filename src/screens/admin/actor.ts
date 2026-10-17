import { useAuth } from "@/lib/auth";

/** Who is making a change in the portal, for the activity log. */
export function useAdminActor() {
  const { user, profile } = useAuth();
  return {
    id: user?.id ?? "",
    name: profile?.full_name || profile?.email || user?.email || "An administrator",
  };
}
