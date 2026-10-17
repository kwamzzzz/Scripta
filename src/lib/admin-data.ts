/**
 * What the admin portal reads across the whole platform. Each read goes
 * through a database function that refuses anyone who is not a platform
 * administrator, so none of this is visible to members however it is asked.
 */
import { supabase } from "@/integrations/supabase/client";

export type Overview = {
  people: number;
  newPeople30d: number;
  active7d: number;
  workspaces: number;
  matters: number;
  aiCostMonth: number;
  aiCallsMonth: number;
  aiFailuresMonth: number;
  feedbackUnread: number;
  feedbackOpen: number;
  admins: number;
};

export async function loadOverview(): Promise<Overview> {
  const { data, error } = await supabase.rpc("admin_overview");
  if (error) throw new Error(error.message);
  const d = (data ?? {}) as Record<string, unknown>;
  const n = (k: string) => Number(d[k] ?? 0);
  return {
    people: n("people"),
    newPeople30d: n("newPeople30d"),
    active7d: n("active7d"),
    workspaces: n("workspaces"),
    matters: n("matters"),
    aiCostMonth: n("aiCostMonth"),
    aiCallsMonth: n("aiCallsMonth"),
    aiFailuresMonth: n("aiFailuresMonth"),
    feedbackUnread: n("feedbackUnread"),
    feedbackOpen: n("feedbackOpen"),
    admins: n("admins"),
  };
}

export type AdminPerson = {
  id: string;
  name: string;
  email: string;
  roleTitle: string;
  joined: string;
  isAdmin: boolean;
  lastActive: string | null;
  workspaces: { name: string; role: string; kind: string }[];
};

type RawPerson = {
  id: string;
  full_name: string | null;
  email: string | null;
  role_title: string | null;
  created_at: string;
  is_admin: boolean;
  last_active: string | null;
  workspaces: AdminPerson["workspaces"] | null;
};

export async function loadPeople(): Promise<AdminPerson[]> {
  const { data, error } = await supabase.rpc("admin_people");
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as RawPerson[]).map((p) => ({
    id: p.id,
    name: p.full_name || p.email || "Unnamed",
    email: p.email ?? "",
    roleTitle: p.role_title ?? "",
    joined: p.created_at,
    isAdmin: p.is_admin === true,
    lastActive: p.last_active ?? null,
    workspaces: p.workspaces ?? [],
  }));
}

export type UsageSlice = { key: string; calls: number; cost: number; tokens: number };
export type Usage = {
  total: {
    calls: number;
    failures: number;
    cost: number;
    inputTokens: number;
    outputTokens: number;
  };
  byFeature: UsageSlice[];
  byPerson: UsageSlice[];
  byModel: UsageSlice[];
  byDay: { day: string; calls: number; cost: number }[];
};

type RawUsage = {
  total?: Partial<Usage["total"]>;
  byFeature?: Partial<UsageSlice>[];
  byPerson?: Partial<UsageSlice>[];
  byModel?: Partial<UsageSlice>[];
  byDay?: Partial<Usage["byDay"][number]>[];
};

export async function loadUsage(since: Date): Promise<Usage> {
  const { data, error } = await supabase.rpc("admin_usage", { since: since.toISOString() });
  if (error) throw new Error(error.message);
  const d = (data ?? {}) as unknown as RawUsage;
  const slices = (v: Partial<UsageSlice>[] | undefined): UsageSlice[] =>
    (v ?? []).map((x) => ({
      key: String(x.key ?? ""),
      calls: Number(x.calls ?? 0),
      cost: Number(x.cost ?? 0),
      tokens: Number(x.tokens ?? 0),
    }));
  const t = d.total ?? {};
  return {
    total: {
      calls: Number(t.calls ?? 0),
      failures: Number(t.failures ?? 0),
      cost: Number(t.cost ?? 0),
      inputTokens: Number(t.inputTokens ?? 0),
      outputTokens: Number(t.outputTokens ?? 0),
    },
    byFeature: slices(d.byFeature),
    byPerson: slices(d.byPerson),
    byModel: slices(d.byModel),
    byDay: (d.byDay ?? []).map((x) => ({
      day: String(x.day ?? ""),
      calls: Number(x.calls ?? 0),
      cost: Number(x.cost ?? 0),
    })),
  };
}

/** Dollars, to the cent unless it is less than a cent. */
export const money = (n: number) => (n > 0 && n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);

/** "3 hours ago", "yesterday", "12 Sep". */
export function ago(iso: string | null): string {
  if (!iso) return "Never";
  const ms = Date.now() - Date.parse(iso);
  const min = Math.round(ms / 60_000);
  if (min < 2) return "Just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  if (d === 1) return "Yesterday";
  if (d < 14) return `${d} days ago`;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** A readable name for an AI feature key ("transcript-distil" → "Transcript distil"). */
export const featureName = (key: string) =>
  key ? key.charAt(0).toUpperCase() + key.slice(1).replace(/[-_]/g, " ") : "Unlabelled";
