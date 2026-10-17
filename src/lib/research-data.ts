/**
 * Research, read from and written to the research tables.
 *
 * Research used to live entirely in localStorage, which meant every keystroke
 * was a write and one cleared cache lost the lot. Here the matter list and the
 * two halves of a matter (`state` — the question, its answer and the memo;
 * `records` — the 4f–4k working records) come from the server, and edits are
 * held in a draft that is written back on a quiet interval.
 *
 * The one-time move off localStorage runs once per workspace, before the list
 * is read, and clears the browser only for what the server confirmed it took.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createResearchMatter,
  deleteResearchMatter,
  importLocalResearch,
  listResearchActivity,
  listResearchMatters,
  loadResearchMatter,
  renameResearchMatter,
  saveResearchRecords,
  saveResearchState,
  upgradeResearchMatter,
} from "@/lib/research-store.functions";
import { useApp } from "@/store/app";
import { readRecords, type ResearchKind, type ResearchRecords } from "@/wireframe/research-matter";
import type { ResearchState } from "@/wireframe/research-store";

export type ResearchSummary = {
  id: string;
  legacyId: string | null;
  matterId: string | null;
  kind: ResearchKind;
  title: string;
  updatedAt: string;
  reportLocked: boolean;
  /** Put aside and out of the active workspace; null means live. */
  archivedAt: string | null;
  /** In Recently Deleted since this moment; null means live. */
  deletedAt: string | null;
};

export const RESEARCH_LIST_KEY = (workspaceId: string | null) => ["research-matters", workspaceId];
export const RESEARCH_MATTER_KEY = (researchId: string | null) => ["research-matter", researchId];

/* ------------------------------------------------------------- import ---- */

const indexKey = (workspaceId: string) => `px.research.index.${workspaceId}`;
const stateKey = (workspaceId: string, id: string) => `px.research.${workspaceId}.${id}`;
const recordsKey = (workspaceId: string, id: string) => `px.research.records.${workspaceId}.${id}`;

type LocalIndexEntry = { id: string; kind?: ResearchKind; title?: string; updatedAt?: string };

export type ResearchImport = {
  imported: number;
  skipped: number;
  failed: { legacyId: string; error: string }[];
};
const NOTHING_TO_IMPORT: ResearchImport = { imported: 0, skipped: 0, failed: [] };

function readJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}
function forget(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* storage the browser will not let us write is storage we cannot clear */
  }
}

function readLocalIndex(workspaceId: string): LocalIndexEntry[] {
  const parsed = readJson(indexKey(workspaceId));
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (entry): entry is LocalIndexEntry =>
      !!entry && typeof entry === "object" && typeof (entry as LocalIndexEntry).id === "string",
  );
}

/**
 * The one-time move off localStorage for one workspace.
 *
 * Nothing leaves the browser until the server has said it took it. A matter
 * the server reported as failed keeps its own three keys and stays in the
 * index, so re-running finishes the job and the caller can say what is stuck.
 */
async function importLocal(workspaceId: string): Promise<ResearchImport> {
  if (typeof window === "undefined") return NOTHING_TO_IMPORT;
  const entries = readLocalIndex(workspaceId);
  if (!entries.length) return NOTHING_TO_IMPORT;

  const result = await importLocalResearch({
    data: {
      workspaceId,
      matters: entries.map((entry) => ({
        legacyId: entry.id,
        kind: entry.kind,
        title: typeof entry.title === "string" ? entry.title.slice(0, 300) : undefined,
        updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt.slice(0, 60) : undefined,
        state: readJson(stateKey(workspaceId, entry.id)),
        // Rows the wireframe demo once seeded into real matters are left in
        // the browser rather than imported as a lawyer's own research.
        records: readRecords(
          readJson(recordsKey(workspaceId, entry.id)) as Partial<ResearchRecords> | undefined,
        ),
      })),
    },
  });

  const stuck = new Set(result.failed.map((f) => f.legacyId));
  for (const entry of entries) {
    if (stuck.has(entry.id)) continue;
    forget(stateKey(workspaceId, entry.id));
    forget(recordsKey(workspaceId, entry.id));
  }
  const left = entries.filter((entry) => stuck.has(entry.id));
  if (left.length) {
    try {
      window.localStorage.setItem(indexKey(workspaceId), JSON.stringify(left));
    } catch {
      /* the failed matters keep their own keys either way */
    }
  } else forget(indexKey(workspaceId));
  return result;
}

/**
 * The import, run at most once per workspace per session. React Query holds
 * the result, so the several screens that need the list share one run.
 */
function useResearchImport(workspaceId: string | null) {
  const q = useQuery({
    queryKey: ["research-import", workspaceId],
    enabled: !!workspaceId,
    queryFn: () => importLocal(workspaceId!),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  // A failed import must not hold the list back: it left the browser's copy
  // alone, so nothing is lost by reading the server and trying again later.
  const done = !workspaceId || q.isSuccess || q.isError;
  const failed = q.data?.failed ?? [];
  const notice = q.isError
    ? `Research still in this browser could not be moved to the database: ${
        q.error instanceof Error ? q.error.message : "the import failed"
      }. It has been left where it is — reload to try again.`
    : failed.length
      ? `${failed.length} research ${failed.length === 1 ? "matter" : "matters"} could not be moved out of this browser and ${failed.length === 1 ? "is" : "are"} still stored here: ${failed
          .map((f) => `${f.legacyId} (${f.error})`)
          .join("; ")}`
      : null;
  return { done, notice };
}

/* -------------------------------------------------------------- reads ---- */

/** Every research matter in the signed-in workspace, newest change first. */
export function useResearchMatters() {
  const { workspaceId } = useApp();
  const imported = useResearchImport(workspaceId);
  const q = useQuery({
    queryKey: RESEARCH_LIST_KEY(workspaceId),
    enabled: !!workspaceId && imported.done,
    queryFn: async () =>
      (await listResearchMatters({ data: { workspaceId: workspaceId! } }))
        .matters as ResearchSummary[],
  });
  return {
    matters: q.data ?? [],
    loading: !!workspaceId && (!imported.done || q.isLoading),
    error: q.error instanceof Error ? q.error.message : null,
    importNotice: imported.notice,
  };
}

/** One research matter, whole. */
export function useResearchRow(researchId: string | null) {
  return useQuery({
    queryKey: RESEARCH_MATTER_KEY(researchId),
    enabled: !!researchId,
    queryFn: () => loadResearchMatter({ data: { researchId: researchId! } }),
  });
}

export const RESEARCH_ACTIVITY_KEY = (researchId: string | null) => [
  "research-activity",
  researchId,
];

/** What has been done to this matter, newest first, read from the audit trail. */
export function useResearchActivity(researchId: string | null) {
  return useQuery({
    queryKey: RESEARCH_ACTIVITY_KEY(researchId),
    enabled: !!researchId,
    queryFn: () => listResearchActivity({ data: { researchId: researchId! } }),
  });
}

/**
 * A route's `researchId` resolved against the workspace's matters. Ids written
 * by the localStorage build ("simple-<uuid>") were imported as `legacy_id`, so
 * an old link resolves to the row it became.
 */
export function resolveResearch(matters: ResearchSummary[], routeId: string) {
  return matters.find((m) => m.id === routeId || m.legacyId === routeId) ?? null;
}

/* ------------------------------------------------------------- writes ---- */

/** Create a research matter and hand back its id, so the caller can navigate to it. */
export function useCreateResearch() {
  const { workspaceId } = useApp();
  const qc = useQueryClient();
  return useCallback(
    async (kind: ResearchKind, title: string, matterId: string | null = null) => {
      if (!workspaceId) throw new Error("No workspace is selected.");
      const { id } = await createResearchMatter({ data: { workspaceId, kind, title, matterId } });
      await qc.invalidateQueries({ queryKey: RESEARCH_LIST_KEY(workspaceId) });
      return id;
    },
    [workspaceId, qc],
  );
}

/** Rename a research matter. A blank name is refused, so a matter cannot lose the name it has. */
export function useRenameResearch() {
  const { workspaceId } = useApp();
  const qc = useQueryClient();
  return useCallback(
    async (researchId: string, title: string) => {
      const name = title.trim();
      if (!name) return;
      await renameResearchMatter({ data: { researchId, title: name } });
      await qc.invalidateQueries({ queryKey: RESEARCH_LIST_KEY(workspaceId) });
    },
    [workspaceId, qc],
  );
}

/** Upgrade in place, then refresh both the library row and the open matter. */
export function useUpgradeResearch() {
  const { workspaceId } = useApp();
  const qc = useQueryClient();
  return useCallback(
    async (researchId: string) => {
      await upgradeResearchMatter({ data: { researchId } });
      await Promise.all([
        qc.invalidateQueries({ queryKey: RESEARCH_LIST_KEY(workspaceId) }),
        qc.invalidateQueries({ queryKey: RESEARCH_MATTER_KEY(researchId) }),
      ]);
    },
    [workspaceId, qc],
  );
}

/**
 * Delete a research matter. The child rows go with it through the foreign keys,
 * and the audit row survives, so the workspace keeps a record that it existed.
 * The matter's own cache is dropped rather than refetched: there is nothing
 * left to fetch, and a stale entry would render an empty matter.
 */
export function useDeleteResearch() {
  const { workspaceId } = useApp();
  const qc = useQueryClient();
  return useCallback(
    async (researchId: string) => {
      await deleteResearchMatter({ data: { researchId } });
      qc.removeQueries({ queryKey: RESEARCH_MATTER_KEY(researchId) });
      await qc.invalidateQueries({ queryKey: RESEARCH_LIST_KEY(workspaceId) });
    },
    [workspaceId, qc],
  );
}

/**
 * How long the screen waits for typing to stop before writing, and how long it
 * will wait at most while typing continues.
 *
 * A save rewrites the matter's child rows wholesale, so it is not something to
 * do on every keystroke; a second of quiet is short enough that a lawyer who
 * stops to think has already been saved. The ceiling matters more than the
 * floor: someone drafting a memo paragraph without pausing is still written
 * out every ten seconds rather than holding minutes of work in a tab.
 */
const QUIET_MS = 1000;
const AT_MOST_MS = 10000;

/**
 * A local draft of one half of a research matter, written back on a quiet
 * interval.
 *
 * The draft is seeded once from the server and is authoritative from then on:
 * a later read never overwrites what is in the editor. A save carries the
 * value as it stood when the timer fired, and edits made while it is in flight
 * are simply the next save — a save can never put back an older version of
 * something the user has since changed. Saves are chained, so two of them
 * cannot interleave their row rewrites. A failed save keeps the value in hand
 * and says so; the next edit, or leaving the screen, writes it again.
 */
export function useResearchDraft<T>(
  key: string | null,
  loaded: T | undefined,
  save: (value: T) => Promise<unknown>,
) {
  const [value, setValue] = useState<T | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const seeded = useRef<string | null>(null);
  const owed = useRef(false);
  const owedSince = useRef(0);
  const latest = useRef<T | undefined>(undefined);
  const saveRef = useRef(save);
  const chain = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    saveRef.current = save;
  }, [save]);
  useEffect(() => {
    latest.current = value;
  }, [value]);

  const write = useCallback((next: T) => {
    // Read the writer now: by the time the chain reaches this save the screen
    // may already be pointed at a different research matter.
    const to = saveRef.current;
    owed.current = false;
    owedSince.current = 0;
    setSaving(true);
    chain.current = chain.current
      .catch(() => {})
      .then(() => to(next))
      .then(
        () => setError(null),
        (e: unknown) => {
          // The write is still owed. The value is in hand, so nothing is lost.
          owed.current = true;
          if (!owedSince.current) owedSince.current = Date.now();
          setError(e instanceof Error ? e.message : "This research could not be saved.");
        },
      )
      .finally(() => setSaving(false));
  }, []);

  // Seed from the server once per matter, and never again.
  useEffect(() => {
    if (!key || loaded === undefined || seeded.current === key) return;
    seeded.current = key;
    // The screen was edited before its row arrived: those edits are the newer
    // ones, and seeding over them would be the read clobbering the writer.
    if (owed.current) return;
    setValue(loaded);
  }, [key, loaded]);

  // Leaving this matter — for another one or for another screen — writes
  // whatever it still owes before the draft is dropped.
  useEffect(
    () => () => {
      if (owed.current && latest.current !== undefined) write(latest.current);
      seeded.current = null;
      owed.current = false;
      owedSince.current = 0;
      setValue(undefined);
    },
    [key, write],
  );

  // The quiet interval, restarted by every edit and capped by AT_MOST_MS.
  useEffect(() => {
    if (!owed.current || value === undefined) return;
    const waited = Date.now() - (owedSince.current || Date.now());
    const t = setTimeout(() => write(value), Math.max(0, Math.min(QUIET_MS, AT_MOST_MS - waited)));
    return () => clearTimeout(t);
  }, [value, write]);

  const set = useCallback((next: T) => {
    owed.current = true;
    if (!owedSince.current) owedSince.current = Date.now();
    setValue(next);
  }, []);

  // Between a matter changing and the draft being re-seeded there is one
  // render where the held value still belongs to the matter just left. The
  // key it was seeded under decides whose value this is.
  const mine = seeded.current === key ? value : undefined;
  return { value: mine ?? loaded, set, saving, error };
}

/** The question, its answer, the pins and the memo, saved on a quiet interval. */
export function useResearchStateDraft(
  researchId: string | null,
  loaded: ResearchState | undefined,
) {
  const save = useCallback(
    (state: ResearchState) => {
      if (!researchId) return Promise.resolve();
      return saveResearchState({ data: { researchId, state } });
    },
    [researchId],
  );
  return useResearchDraft(researchId, loaded, save);
}

/** Issues, facts, assumptions, risks and the report's own state, saved on a quiet interval. */
export function useResearchRecordsDraft(
  researchId: string | null,
  loaded: ResearchRecords | undefined,
) {
  const save = useCallback(
    (records: ResearchRecords) => {
      if (!researchId) return Promise.resolve();
      return saveResearchRecords({ data: { researchId, records } });
    },
    [researchId],
  );
  return useResearchDraft(researchId, loaded, save);
}
