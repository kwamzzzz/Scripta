/**
 * Feature availability.
 *
 * Every part of Scripta a member can reach has a switch with three states:
 *   on           everyone can use it
 *   coming soon  members see it greyed out and inert, with the administrator's note
 *   hidden       members do not see it at all
 * Administrators keep full access whatever the state (they can "view as a
 * member" to check what others see), and a switched-off feature can be opened
 * early to named people: an early-access group.
 *
 * `public.feature_flags` holds only the rows an administrator has touched; a
 * missing row means the feature is on.
 */
import { useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useIsPlatformAdmin } from "@/lib/platform-admin";

export type FeatureGroup = "Workspace" | "Tools" | "Knowledge" | "Housekeeping" | "Inside screens";

export type FeatureDef = {
  key: string;
  label: string;
  group: FeatureGroup;
  /** How it is withdrawn: from the sidebar (and its pages), or from inside screens. */
  scope: "nav" | "screen";
  hint: string;
  /** Said beside the switch when switching it off has a wider effect. */
  caution?: string;
};

export const FEATURES: FeatureDef[] = [
  {
    key: "home",
    label: "Dashboard",
    group: "Workspace",
    scope: "nav",
    hint: "The landing page after sign-in.",
    caution: "Members land on a closed page when this is off.",
  },
  {
    key: "tasks",
    label: "Tasks",
    group: "Workspace",
    scope: "nav",
    hint: "What needs doing across the workspace.",
  },
  {
    key: "clients",
    label: "Clients",
    group: "Workspace",
    scope: "nav",
    hint: "Who the firm acts for, and their work.",
  },
  {
    key: "matters",
    label: "Matters",
    group: "Workspace",
    scope: "nav",
    hint: "The files the work is organised in.",
  },
  {
    key: "manuscripts",
    label: "Manuscripts",
    group: "Workspace",
    scope: "nav",
    hint: "Theses, dissertations and books under Book Review.",
  },
  {
    key: "matter-flow",
    label: "Flow",
    group: "Workspace",
    scope: "nav",
    hint: "Phases and deliverables for standalone work.",
  },
  {
    key: "contract-drafting",
    label: "Contract Drafting",
    group: "Tools",
    scope: "nav",
    hint: "Drafting contracts from a plan.",
  },
  {
    key: "contract-review",
    label: "Contract Review",
    group: "Tools",
    scope: "nav",
    hint: "Reviewing contracts clause by clause.",
  },
  {
    key: "research",
    label: "Legal Research",
    group: "Tools",
    scope: "nav",
    hint: "The legal research workspace.",
  },
  {
    key: "corporate-drafting",
    label: "Corporate Drafting",
    group: "Tools",
    scope: "nav",
    hint: "Board and shareholder documents.",
  },
  {
    key: "transcripts",
    label: "Transcript distiller",
    group: "Tools",
    scope: "nav",
    hint: "Meeting transcripts and distillation.",
  },
  {
    key: "library",
    label: "Library",
    group: "Knowledge",
    scope: "nav",
    hint: "Statutes, cases, books, articles and links.",
  },
  {
    key: "learning",
    label: "Learning",
    group: "Knowledge",
    scope: "nav",
    hint: "Courses, CPD training and a lawyer's own reading discipline.",
    caution:
      "Switching this off hides the portal; progress, hours and certificates are kept.",
  },
  {
    key: "career",
    label: "Career",
    group: "Knowledge",
    scope: "nav",
    hint: "A lawyer's own progression against the roles they are working towards.",
    caution: "Each person's record stays theirs; switching this off only hides the portal.",
  },
  {
    key: "knowledge",
    label: "Precedents",
    group: "Knowledge",
    scope: "nav",
    hint: "The stored clause library.",
  },
  {
    key: "templates",
    label: "Templates",
    group: "Knowledge",
    scope: "nav",
    hint: "Reusable document structures.",
  },
  {
    key: "playbooks",
    label: "Playbooks",
    group: "Knowledge",
    scope: "nav",
    hint: "Negotiation positions and rules.",
  },
  {
    key: "archive",
    label: "Archive",
    group: "Housekeeping",
    scope: "nav",
    hint: "Work put aside.",
  },
  {
    key: "deleted",
    label: "Recently Deleted",
    group: "Housekeeping",
    scope: "nav",
    hint: "Deleted work, restorable for a while.",
  },
  {
    key: "settings",
    label: "Settings",
    group: "Housekeeping",
    scope: "nav",
    hint: "Each person's own settings.",
    caution: "Members cannot change their own settings while this is off.",
  },
  {
    key: "ai",
    label: "All AI",
    group: "Inside screens",
    scope: "screen",
    hint: "Every AI call, stopped at the server: the pause switch for AI.",
    caution: "Off stops every AI action for members, in every tool.",
  },
  {
    key: "assistant",
    label: "Assistant panel",
    group: "Inside screens",
    scope: "screen",
    hint: "The Scripta assistant beside every screen.",
  },
  {
    key: "feedback",
    label: "Feedback button",
    group: "Inside screens",
    scope: "screen",
    hint: "“Share your feedback” in the top bar.",
  },
  {
    key: "quick-task",
    label: "Quick capture",
    group: "Inside screens",
    scope: "screen",
    hint: "Capturing a task from anywhere.",
  },
  {
    key: "planner",
    label: "Day planner",
    group: "Inside screens",
    scope: "screen",
    hint: "The Plan tab in Tasks.",
  },
  {
    key: "handover",
    label: "Handover",
    group: "Inside screens",
    scope: "screen",
    hint: "The Handover tab in Tasks.",
  },
];

export const FEATURE_GROUPS: FeatureGroup[] = [
  "Workspace",
  "Tools",
  "Knowledge",
  "Housekeeping",
  "Inside screens",
];

export const FEATURE_BY_KEY: Record<string, FeatureDef> = Object.fromEntries(
  FEATURES.map((f) => [f.key, f]),
);

export type FeatureState = "on" | "dim" | "hidden";
export type OffMode = "dim" | "hidden";

export type FlagRow = {
  key: string;
  enabled: boolean;
  off_mode?: string | null;
  note?: string | null;
  preview_users?: string[] | null;
  updated_at?: string | null;
};

export type FeatureSetting = {
  state: FeatureState;
  note: string;
  preview: string[];
  updatedAt: string | null;
};
export type FeatureSettings = Record<string, FeatureSetting>;

/** The catalogue, overridden by whatever administrators have stored. */
export function mergeSettings(rows: FlagRow[] | null | undefined): FeatureSettings {
  const out: FeatureSettings = {};
  for (const f of FEATURES) out[f.key] = { state: "on", note: "", preview: [], updatedAt: null };
  for (const row of rows ?? []) {
    if (!(row.key in out)) continue;
    out[row.key] = {
      state: row.enabled ? "on" : row.off_mode === "hidden" ? "hidden" : "dim",
      note: row.note ?? "",
      preview: row.preview_users ?? [],
      updatedAt: row.updated_at ?? null,
    };
  }
  return out;
}

/**
 * What one person sees of a feature. Administrators see everything unless
 * they are viewing as a member; someone in the early-access group sees it on.
 */
export function stateFor(
  setting: FeatureSetting | undefined,
  viewer: { userId: string | null; isAdmin: boolean; asMember: boolean },
): FeatureState {
  if (!setting || setting.state === "on") return "on";
  if (viewer.isAdmin && !viewer.asMember) return "on";
  if (viewer.userId && setting.preview.includes(viewer.userId)) return "on";
  return setting.state;
}

/* ------------------------------------------------------ view as a member */

const AS_MEMBER_KEY = "px.admin.view-as-member";
const listeners = new Set<() => void>();
const readAsMember = () => {
  try {
    return localStorage.getItem(AS_MEMBER_KEY) === "1";
  } catch {
    return false;
  }
};

/** An administrator's "see it as members do" switch, kept in this browser. */
export function useViewAsMember(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    readAsMember,
    () => false,
  );
  const set = (next: boolean) => {
    try {
      if (next) localStorage.setItem(AS_MEMBER_KEY, "1");
      else localStorage.removeItem(AS_MEMBER_KEY);
    } catch {
      /* private window: the switch simply does not stick */
    }
    for (const l of listeners) l();
  };
  return [on, set];
}

/* ----------------------------------------------------------------- hooks */

export function useFeatureSettings() {
  const query = useQuery({
    queryKey: ["feature-flags"],
    staleTime: 60_000,
    queryFn: async (): Promise<FeatureSettings> => {
      const { data, error } = await supabase
        .from("feature_flags")
        .select("key, enabled, off_mode, note, preview_users, updated_at");
      if (error) throw error;
      return mergeSettings(data as unknown as FlagRow[]);
    },
  });
  return { settings: query.data ?? mergeSettings([]), loading: query.isLoading };
}

/** How every feature looks to the person at the screen. */
export function useFeatureAccess() {
  const { settings } = useFeatureSettings();
  const { user } = useAuth();
  const { isAdmin } = useIsPlatformAdmin();
  const [asMember] = useViewAsMember();
  const viewer = { userId: user?.id ?? null, isAdmin, asMember };
  return {
    state: (key: string) => stateFor(settings[key], viewer),
    note: (key: string) => settings[key]?.note ?? "",
    /** The state everyone else sees, whoever is looking. */
    raw: (key: string) => settings[key]?.state ?? "on",
    isAdmin,
    asMember,
  };
}

/** Whether one in-screen feature is there for the person at the screen. */
export function useFeature(key: string): boolean {
  return useFeatureAccess().state(key) === "on";
}

export function useSaveFeature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      key: string;
      state: FeatureState;
      note: string;
      preview: string[];
      userId: string;
    }) => {
      const { error } = await supabase.from("feature_flags").upsert(
        {
          key: input.key,
          enabled: input.state === "on",
          off_mode: input.state === "hidden" ? "hidden" : "dim",
          note: input.note.trim() || null,
          preview_users: input.preview,
          updated_by: input.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feature-flags"] }),
  });
}
