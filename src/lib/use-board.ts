import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApp } from "@/store/app";
import { EMPTY_BOARD, fetchBoard } from "@/lib/home-data";

/**
 * The workspace's board.
 *
 * Documents in Recently Deleted are already left out by the query. Matters and
 * playbooks are read whole, because two screens list what is in the bin — so
 * every other caller is handed the board without them. A deleted matter must
 * not be offered by the command palette or as somewhere to file a document.
 */
export function useBoard(options: { binned?: boolean } = {}) {
  const { workspaceId } = useApp();
  const q = useQuery({
    queryKey: ["board", workspaceId],
    enabled: !!workspaceId,
    queryFn: () => fetchBoard(workspaceId!),
    refetchInterval: (query) =>
      (query.state.data?.docs ?? []).some(
        (d) => d.parseStatus === "pending" || d.parseStatus === "parsing",
      )
        ? 2500
        : false,
  });
  const { binned = false } = options;
  const board = useMemo(() => {
    const data = q.data ?? EMPTY_BOARD;
    if (binned) return data;
    return {
      ...data,
      matters: data.matters.filter((m) => !m.deletedAt),
      playbooks: data.playbooks.filter((p) => !p.deletedAt),
    };
  }, [q.data, binned]);

  // The error is returned, not swallowed. Falling back to an empty board and
  // saying nothing turns a failed read into "no matters yet" — the screen
  // reassures the lawyer that their workspace is empty when it is unreachable.
  return {
    board,
    loading: q.isLoading,
    error: q.error instanceof Error ? q.error : q.error ? new Error(String(q.error)) : null,
    refetch: q.refetch,
  };
}

/** Client-persisted UI preference. Written after mount so SSR output stays stable. */
export function usePersisted<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      setValue(raw !== null ? (JSON.parse(raw) as T) : initial);
    } catch {
      setValue(initial);
    }
    setLoadedKey(key);
    // `initial` is the default for this key, not a reactive input. Depending on
    // object literals here would reload storage on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (loadedKey !== key) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore quota errors */
    }
  }, [key, loadedKey, value]);

  return [value, setValue] as const;
}
