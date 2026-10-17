/**
 * The widths a reader has given a table's columns, remembered per person and
 * per table. Paired with the ColumnResizer handle (components/ColumnResizer).
 */
import { useCallback } from "react";
import { usePersisted } from "@/lib/use-board";

export const MIN_COLUMN = 72;
export const MAX_COLUMN = 960;

export const clampColumn = (w: number) => Math.round(Math.min(MAX_COLUMN, Math.max(MIN_COLUMN, w)));

/** Widths chosen by the reader, by column key; unset columns keep their default. */
export function useColumnWidths(storageKey: string) {
  const [widths, setWidths] = usePersisted<Record<string, number>>(`px.columns.${storageKey}`, {});
  const widthOf = useCallback((key: string, fallback: number) => widths[key] ?? fallback, [widths]);
  const setWidth = useCallback(
    (key: string, width: number | null) =>
      setWidths((all) => {
        const next = { ...all };
        if (width === null) delete next[key];
        else next[key] = clampColumn(width);
        return next;
      }),
    [setWidths],
  );
  /** Pin several columns at once: the widths they are drawn at as a drag begins. */
  const pinWidths = useCallback(
    (pinned: Record<string, number>) =>
      setWidths((all) => {
        const next = { ...all };
        for (const [key, w] of Object.entries(pinned)) next[key] = clampColumn(w);
        return next;
      }),
    [setWidths],
  );
  return { widthOf, setWidth, pinWidths, widths };
}
