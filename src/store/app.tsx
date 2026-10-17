import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClearMentionsOnOpen } from "@/lib/unseen-mentions";
import { useLiveMatter } from "@/lib/live";
import { deleteMatters } from "@/lib/delete-matters";
import { fetchBoard } from "@/lib/home-data";
import { useAuth } from "@/lib/auth";
import { EMPTY_DATA, fetchMatterData, type MatterSummary } from "@/lib/matter-data";
import type { Clause, ClauseStatus, LegalData } from "@/data/legal";

/**
 * Keep the selected clause and rule valid as data arrives.
 *
 * ---------------------------------------------------------------------------
 * A LIST THAT HAS NOT LOADED RECONCILES NOTHING
 * ---------------------------------------------------------------------------
 *
 * That clause is the whole of this function, and leaving it out broke the
 * awareness bell's central promise.
 *
 * A deep link — `?clause=<id>`, which is what every entry in the bell
 * generates — arrives as the initial selection. This effect then ran
 * immediately, while the matter data was still EMPTY_DATA, found no clause
 * with that id in an empty list, and fell through to `clauses[0]`, which is
 * `undefined`, and wrote "" over the selection. By the time the four hundred
 * clauses actually arrived, the id from the URL had already gone, and the
 * reconciliation settled on the first clause in the document.
 *
 * So Kwame clicking "Mawusi settled wording on clause 7.2" landed on clause
 * 1.1 — which is precisely the "open the matter and hunt" that the awareness
 * layer was built to replace, and precisely how Phase 4's acceptance failed.
 *
 * Found in the Phase 5 browser acceptance, by hard-reloading a deep link and
 * reading what was selected.
 */
export function reconcileSelection(
  state: { selClause: string; selRule: string },
  data: { clauses: { id: string }[]; playbook: { id: string }[] },
): { selClause: string; selRule: string } {
  return {
    selClause: data.clauses.length
      ? ((data.clauses.find((c) => c.id === state.selClause) ?? data.clauses[0])?.id ?? "")
      : state.selClause,
    selRule: data.playbook.length
      ? ((data.playbook.find((p) => p.id === state.selRule) ?? data.playbook[0])?.id ?? "")
      : state.selRule,
  };
}

export type Screen =
  // The file's Overview: where the work stands, what needs attention, whose
  // file it is. Keeps the "matter" id so every existing link still lands on
  // the matter rather than on a tool.
  | "matter"
  // The rest of the file.
  | "flows"
  | "tasks"
  | "documents"
  | "activity"
  // Contract Review's summary: the mandate, the key terms, the state of the
  // review. It was the matter Overview until a matter became a file.
  | "contract"
  | "review"
  // The issue register — what needs a decision, as objects rather than a count.
  | "issues"
  // The mark-up, pulled forward out of the Final tab: what we changed, and why.
  | "redline"
  // The schedule of deviations a bidder returns with a tender: every tracked
  // change in the marked-up agreement, clause by clause, in the buyer's own
  // appendix. Read-only with respect to the matter — it works on two files the
  // lawyer drops in, so it needs nothing from the review store.
  | "deviations"
  | "transcript"
  // Playbook Check is no longer a tab. A playbook deviation is a fact about a
  // clause, so it is shown on the clause; the id stays for old links.
  | "playbook"
  // The redraft session. Not a public tab: it is where Redraft with Scripta
  // lands, and it used to wear the Notes label while showing nothing of the
  // sort.
  | "messages"
  | "notes"
  // Every version of every clause, and what each step of the mark-up did.
  // Read-only, and the one screen where a settled change is still readable.
  | "history"
  | "final";
export type ReviewView = "split" | "reading";
export type ClauseFilter = "All" | "Flagged" | "High risk";

export type Workspace = { id: string; name: string; kind: "personal" | "firm"; owner_id: string };

type State = {
  screen: Screen;
  selClause: string;
  selRule: string;
  selRes: string | null;
  selDisc: string | null;
  speaker: string;
  openOnly: boolean;
  clauseFilter: ClauseFilter;
  reviewView: ReviewView;
  statusOverride: Record<string, ClauseStatus>;
  workspaceId: string | null;
  matterId: string | null;
  /** The last action the lawyer took that did not do what it looked like. */
  actionError: string | null;
};

type Store = State & {
  D: LegalData;
  loading: boolean;
  /**
   * The matter in the URL is not one this person can open — either because it
   * does not exist or because they are not on its team. The two are the same
   * answer on purpose: a matter you cannot open must be indistinguishable from
   * one that was never there, or the absence itself is a disclosure.
   */
  matterUnavailable: boolean;
  workspaces: Workspace[];
  workspace: Workspace | null;
  matters: MatterSummary[];
  matter: MatterSummary | null;
  st: (c: { id: string; status: ClauseStatus }) => ClauseStatus;
  set: (patch: Partial<State>) => void;
  setStatus: (clauseId: string, status: ClauseStatus) => void;
  setActionError: (message: string | null) => void;
  goClause: (clauseId: string) => void;
  goRule: (ruleId: string) => void;
  goResolution: (resId: string) => void;
  deleteMatter: (matterId: string) => Promise<void>;
};

const Ctx = createContext<Store | null>(null);

export function AppProvider({
  children,
  matterId: forcedMatterId,
  initial,
}: {
  children: ReactNode;
  /** When present the provider is pinned to this matter (route-driven). */
  matterId?: string;
  initial?: Partial<State>;
}) {
  const { user, profile } = useAuth();
  const qc = useQueryClient();

  const [state, setState] = useState<State>({
    screen: "matter",
    selClause: "",
    selRule: "",
    selRes: null,
    selDisc: null,
    speaker: "All",
    openOnly: false,
    clauseFilter: "All",
    reviewView: "reading",
    statusOverride: {},
    actionError: null,
    workspaceId: null,
    matterId: null,
    ...initial,
  });

  const set = useCallback((patch: Partial<State>) => setState((s) => ({ ...s, ...patch })), []);

  /** One reader, so the early fetch and the settled query cannot drift apart. */
  const fetchMatters = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from("matters")
      .select("id, name, is_sample, stage, client, counterparty, archived_at, deleted_at")
      .eq("workspace_id", id)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as MatterSummary[];
  }, []);

  const workspacesQuery = useQuery({
    queryKey: ["workspaces", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("id, name, kind, owner_id")
        // Ordering is a product decision, made below. The database used to sort
        // personal first, which dropped an established firm user into an empty
        // personal workspace on every sign-in.
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Workspace[];
    },
  });

  // A matter opened by URL may live in a workspace other than the last-selected one.
  const forcedQuery = useQuery({
    queryKey: ["matter", forcedMatterId],
    enabled: !!forcedMatterId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("matters")
        .select(
          "id, name, is_sample, stage, client, counterparty, archived_at, deleted_at, workspace_id",
        )
        .eq("id", forcedMatterId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const workspaces = useMemo(() => workspacesQuery.data ?? [], [workspacesQuery.data]);
  const forced = forcedQuery.data ?? null;

  /**
   * Where you land.
   *
   * The matter in the URL wins, then the workspace chosen this session, then
   * the one you were last in, and only then a default. The default prefers a
   * FIRM over a personal workspace: somebody who belongs to a firm is almost
   * always there to do the firm's work, and the alternative — alphabetical, or
   * the enum's own order — is how an established user was landing in an empty
   * personal workspace every time they signed in.
   *
   * "Last used" is one string in localStorage rather than a preferences table.
   * It is per-browser and per-device, which is the honest extent of what it
   * knows, and if it is missing or names a workspace you have left, the
   * deterministic fallback below takes over.
   */
  const lastKey = user ? `px.workspace.${user.id}` : null;
  const remembered = useMemo(() => {
    if (!lastKey) return null;
    try {
      return window.localStorage.getItem(lastKey);
    } catch {
      return null;
    }
  }, [lastKey]);

  const workspace =
    (forced ? workspaces.find((w) => w.id === forced.workspace_id) : null) ??
    workspaces.find((w) => w.id === state.workspaceId) ??
    workspaces.find((w) => w.id === remembered) ??
    workspaces.find((w) => w.kind === "firm") ??
    workspaces[0] ??
    null;
  const workspaceId = workspace?.id ?? null;

  // Written whenever the landed-on workspace changes, so the next sign-in on
  // this machine opens where the last one left off.
  useEffect(() => {
    if (!lastKey || !workspaceId) return;
    try {
      window.localStorage.setItem(lastKey, workspaceId);
    } catch {
      /* A browser with storage turned off simply falls back every time. */
    }
  }, [lastKey, workspaceId]);

  const mattersQuery = useQuery({
    queryKey: ["matters", workspaceId],
    enabled: !!workspaceId,
    queryFn: () => fetchMatters(workspaceId!),
  });

  /*
   * The matters of the workspace we left off in, fetched while the list of
   * workspaces is still on its way.
   *
   * Which workspace to open is decided from that list, so the matters could
   * not be asked for until it arrived — two round trips, one after the other,
   * on every cold open. But the answer is nearly always the workspace this
   * machine was last in, and that is known locally and instantly. This asks
   * for those matters under the very key the query above will use, so when the
   * list confirms the choice the data is already in hand. If the list names a
   * different workspace, this was one request that went to waste and changed
   * nothing: row-level security decides what comes back, not this guess.
   */
  useEffect(() => {
    if (!remembered || workspaceId) return;
    void qc.prefetchQuery({
      queryKey: ["matters", remembered],
      queryFn: () => fetchMatters(remembered),
    });
    // The board is what most screens actually draw from, and it is the longest
    // read of the open. Same guess, same key, same wasted-and-harmless request
    // if the list names another workspace.
    void qc.prefetchQuery({
      queryKey: ["board", remembered],
      queryFn: () => fetchBoard(remembered),
    });
  }, [remembered, workspaceId, qc]);

  const matters = useMemo(() => mattersQuery.data ?? [], [mattersQuery.data]);
  const matter = forcedMatterId
    ? (matters.find((m) => m.id === forcedMatterId) ??
      (forced
        ? {
            id: forced.id,
            name: forced.name,
            is_sample: forced.is_sample,
            stage: forced.stage,
            client: forced.client,
            counterparty: forced.counterparty,
            archived_at: forced.archived_at,
            deleted_at: forced.deleted_at,
          }
        : null))
    : (matters.find((m) => m.id === state.matterId) ?? matters[0] ?? null);
  const matterId = matter?.id ?? null;

  /* Opening a matter clears its mention marker.
  
     `forcedMatterId`, NOT `matterId`. The two are easy to confuse and the
     difference is the whole feature: `matterId` falls back to `matters[0]`, so
     it names a matter even on the matters LIST, and hooking the clear to it
     meant merely visiting the list marked the first matter as read. For anybody
     whose mentioned matter happened to be their first — which for a person on
     one matter is always — the dot was cleared a moment before it could be
     drawn, and the mention signal was silently unusable.
  
     `forcedMatterId` is set only when the route names the matter, which is what
     "opened it" means. Found in the two-user acceptance test: the marker never
     appeared, and mentions_seen_at was stamped one minute after the mention, at
     the exact moment of navigating to /matters.
  
     Clearing it when a thread scrolls into view would be the other mistake — a
     read receipt, which is the per-message state Phase 4 deliberately does not
     keep. */
  useClearMentionsOnOpen(forcedMatterId ?? null);

  /* Threads, reviews, assignments and flow changes arrive while the matter is
     open. Inserts and updates only, and no presence — see src/lib/live.ts. */
  useLiveMatter(matterId);

  const dataQuery = useQuery({
    queryKey: ["matter-data", matterId],
    enabled: !!matterId,
    queryFn: () => fetchMatterData(matterId!),
    // Poll while a document is still being parsed so the card settles on its own.
    refetchInterval: (q) =>
      (q.state.data as LegalData | undefined)?.matter.docs.some(
        (d) => d.parseStatus === "pending" || d.parseStatus === "parsing",
      )
        ? 2000
        : false,
  });

  const D = dataQuery.data ?? EMPTY_DATA;

  // Keep selections valid as data loads or the matter changes.
  useEffect(() => {
    setState((s) => {
      const next = reconcileSelection(s, D);
      if (next.selClause === s.selClause && next.selRule === s.selRule) return s;
      return { ...s, ...next };
    });
  }, [D]);

  const loading =
    (!!user && workspacesQuery.isLoading) ||
    (!!forcedMatterId && forcedQuery.isLoading) ||
    (!!workspaceId && mattersQuery.isLoading) ||
    (!!matterId && dataQuery.isLoading);

  // Settled, asked for by id, and nothing came back. `maybeSingle` returns null
  // rather than raising when row-level security excludes the row, so this is
  // the same state for a binned matter, a mistyped id and a colleague's
  // confidential file — which is the point.
  const matterUnavailable =
    !!forcedMatterId &&
    !forcedQuery.isLoading &&
    !forcedQuery.isError &&
    !forced &&
    !matters.some((m) => m.id === forcedMatterId);

  const value = useMemo<Store>(() => {
    const st = (c: { id: string; status: ClauseStatus }) => state.statusOverride[c.id] ?? c.status;
    return {
      ...state,
      workspaceId,
      matterId,
      D,
      loading,
      matterUnavailable,
      workspaces,
      workspace,
      matters,
      matter,
      st,
      set,
      setActionError: (message) => setState((s) => ({ ...s, actionError: message })),
      /**
       * The status shows immediately and is corrected if the write fails.
       *
       * It used to show immediately and stay: on an error this returned, and
       * the override sat over the real value for the rest of the session. A
       * clause the database still had as Open read as Accepted, which is a
       * worse failure than the write refusing outright — nothing on screen
       * said the change had not happened.
       */
      setStatus: (clauseId, status) => {
        const previous = state.statusOverride[clauseId];
        setState((s) => ({
          ...s,
          actionError: null,
          statusOverride: { ...s.statusOverride, [clauseId]: status },
        }));
        void (async () => {
          const clause = D.clauses.find((c) => c.id === clauseId);
          const { error } = await supabase
            .from("clauses")
            .update({ status: status as "Accepted" | "Open" | "For discussion" | "Escalated" })
            .eq("id", clauseId);
          if (error) {
            setState((s) => {
              const override = { ...s.statusOverride };
              if (previous === undefined) delete override[clauseId];
              else override[clauseId] = previous;
              return {
                ...s,
                statusOverride: override,
                actionError:
                  `Clause ${clause?.num ?? ""} could not be marked ${status}. ${error.message}`
                    .replace(/\s+/g, " ")
                    .trim(),
              };
            });
            return;
          }
          if (matterId) {
            await supabase.from("audit_events").insert({
              matter_id: matterId,
              actor_id: user?.id ?? null,
              actor_name: profile?.full_name ?? profile?.email ?? "Unknown",
              event_type: "clause.status_changed",
              entity_type: "clause",
              entity_id: clauseId,
              summary: `Clause ${clause?.num ?? ""} ${clause?.title ?? ""} marked ${status}`
                .replace(/\s+/g, " ")
                .trim(),
              metadata: { status },
            });
          }
          await qc.invalidateQueries({ queryKey: ["matter-data", matterId] });
        })();
      },
      goClause: (clauseId) => set({ screen: "review", selClause: clauseId }),
      goRule: (ruleId) => set({ screen: "playbook", selRule: ruleId }),
      goResolution: (resId) => set({ screen: "transcript", selRes: resId, selDisc: null }),
      deleteMatter: async (id: string) => {
        await deleteMatters([id]);
        setState((s) => ({ ...s, matterId: null, statusOverride: {} }));
        await qc.invalidateQueries({ queryKey: ["matters", workspaceId] });
      },
    };
  }, [
    state,
    D,
    loading,
    matterUnavailable,
    workspaces,
    workspace,
    workspaceId,
    matters,
    matter,
    matterId,
    set,
    qc,
    user,
    profile,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}

export function useSelectedClause(): Clause {
  const { D, selClause } = useApp();
  return D.clauses.find((c) => c.id === selClause) ?? D.clauses[0]!;
}
