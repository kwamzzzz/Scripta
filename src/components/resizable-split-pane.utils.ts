export type SplitPaneSide = "start" | "end";

export const WORKSPACE_LAYOUT_RESET_EVENT = "praxis:reset-workspace-layout";

/** Restore every persisted split-pane width, including panes mounted on other routes. */
export function resetWorkspaceLayout() {
  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith("px.") && key.endsWith(".width")) window.localStorage.removeItem(key);
    }
  } catch {
    /* The mounted panes still reset when storage is unavailable. */
  }
  window.dispatchEvent(new Event(WORKSPACE_LAYOUT_RESET_EVENT));
}

export function clampPaneSize(value: number, min: number, max: number) {
  return Math.min(Math.max(value, Math.min(min, max)), Math.max(min, max));
}

export function paneSizeFromDelta(startSize: number, deltaX: number, side: SplitPaneSide) {
  return startSize + (side === "start" ? deltaX : -deltaX);
}

export function splitPaneConstraints({
  containerSize,
  minSize,
  maxSize,
  minPrimarySize,
  compactAt,
}: {
  containerSize: number;
  minSize: number;
  maxSize: number;
  minPrimarySize: number;
  compactAt: number;
}) {
  const compactThreshold = Math.max(compactAt, minSize + minPrimarySize + 1);
  return {
    compact: containerSize > 0 && containerSize <= compactThreshold,
    availableMax: containerSize
      ? Math.max(minSize, Math.min(maxSize, containerSize - minPrimarySize - 1))
      : maxSize,
  };
}
