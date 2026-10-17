/**
 * Where a document's own record cannot hold the editing record (the memo's
 * sections and a clause draft have fixed columns), the instructions, notes,
 * history and baselines live in this browser under the document's id until the
 * flow tables exist server-side. Corporate documents keep theirs in their own
 * JSON content instead.
 */
import { useCallback } from "react";
import { usePersisted } from "@/lib/use-board";
import { emptyMeta, readMeta, type EditorMeta } from "./model";

export function useLocalMeta(key: string) {
  const [stored, setStored] = usePersisted<EditorMeta>(key, emptyMeta());
  const meta = readMeta(stored);
  const setMeta = useCallback(
    (next: EditorMeta | ((current: EditorMeta) => EditorMeta)) =>
      setStored((current) => (typeof next === "function" ? next(readMeta(current)) : next)),
    [setStored],
  );
  return [meta, setMeta] as const;
}
