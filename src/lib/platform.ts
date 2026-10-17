/**
 * Platform-wide controls the admin portal sets and every screen honours:
 * maintenance mode, announcements, and the administrators' own activity log.
 * The tables decide who may change them (platform administrators only); these
 * helpers decide what the interface shows.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/* ------------------------------------------------------------ maintenance */

export type Maintenance = { on: boolean; message: string; since: string | null };

export const MAINTENANCE_OFF: Maintenance = { on: false, message: "", since: null };

export function parseMaintenance(value: unknown): Maintenance {
  const v = (value ?? {}) as Partial<Maintenance>;
  return {
    on: v.on === true,
    message: typeof v.message === "string" ? v.message : "",
    since: v.since ?? null,
  };
}

export function useMaintenance() {
  const q = useQuery({
    queryKey: ["platform-settings", "maintenance"],
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", "maintenance")
        .maybeSingle();
      if (error) throw error;
      return parseMaintenance(data?.value);
    },
  });
  return q.data ?? MAINTENANCE_OFF;
}

export async function saveMaintenance(next: Maintenance, userId: string) {
  const { error } = await supabase
    .from("platform_settings")
    .upsert(
      { key: "maintenance", value: next, updated_by: userId, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  if (error) throw error;
}

/* ---------------------------------------------------------- announcements */

export type Tone = "info" | "warning" | "success";
export type Announcement = {
  id: string;
  title: string;
  body: string;
  tone: Tone;
  audience: "everyone" | "admins";
  startsAt: string;
  endsAt: string | null;
  dismissible: boolean;
  createdAt: string;
  archivedAt: string | null;
};

type Row = {
  id: string;
  title: string;
  body: string;
  tone: string;
  audience: string;
  starts_at: string;
  ends_at: string | null;
  dismissible: boolean;
  created_at: string;
  archived_at: string | null;
};

const toAnnouncement = (r: Row): Announcement => ({
  id: r.id,
  title: r.title,
  body: r.body,
  tone: (["info", "warning", "success"].includes(r.tone) ? r.tone : "info") as Tone,
  audience: r.audience === "admins" ? "admins" : "everyone",
  startsAt: r.starts_at,
  endsAt: r.ends_at,
  dismissible: r.dismissible,
  createdAt: r.created_at,
  archivedAt: r.archived_at,
});

/** Live now: not archived, started, not yet ended. */
export function isLive(a: Announcement, now = Date.now()): boolean {
  return (
    !a.archivedAt &&
    Date.parse(a.startsAt) <= now &&
    (a.endsAt === null || Date.parse(a.endsAt) > now)
  );
}

export async function listAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from("announcements")
    .select(
      "id, title, body, tone, audience, starts_at, ends_at, dismissible, created_at, archived_at",
    )
    .order("starts_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Row[]).map(toAnnouncement);
}

/** The announcements this person should see now. The table only returns
 *  administrators' notices to administrators. */
export function useLiveAnnouncements() {
  const q = useQuery({
    queryKey: ["announcements"],
    staleTime: 60_000,
    refetchInterval: 300_000,
    queryFn: listAnnouncements,
  });
  return (q.data ?? []).filter((a) => isLive(a));
}

const DISMISSED = "px.announcements.dismissed";
export function dismissedAnnouncements(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED) ?? "[]") as string[];
  } catch {
    return [];
  }
}
export function dismissAnnouncement(id: string) {
  try {
    localStorage.setItem(DISMISSED, JSON.stringify([...dismissedAnnouncements(), id].slice(-100)));
  } catch {
    /* a private window forgets; the banner comes back, which is harmless */
  }
}

/* ------------------------------------------------------------ activity log */

export type AdminEvent = {
  id: string;
  actorName: string;
  action: string;
  target: string;
  summary: string;
  createdAt: string;
};

/** Record an administrator's action. Best effort: a failed log line never
 *  undoes the change it describes. */
export async function logAdminEvent(
  actor: { id: string; name: string },
  action: string,
  target: string,
  summary: string,
  metadata: Record<string, unknown> = {},
) {
  await supabase.from("admin_events").insert({
    actor_id: actor.id,
    actor_name: actor.name,
    action,
    target,
    summary,
    metadata: metadata as never,
  });
}

export async function listAdminEvents(limit = 300): Promise<AdminEvent[]> {
  const { data, error } = await supabase
    .from("admin_events")
    .select("id, actor_name, action, target, summary, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    actorName: r.actor_name,
    action: r.action,
    target: r.target,
    summary: r.summary,
    createdAt: r.created_at,
  }));
}
