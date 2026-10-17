/**
 * Columns a reader can size for themselves: drag the divider at the right of a
 * header to widen or narrow the column, double-click it to fit the column to
 * its longest entry. Widths are remembered per person, per table.
 *
 * Two parts, so any table can take it on: `useColumnWidths` (lib/column-widths) keeps the widths
 * (and forgets a column's own when it is reset), and `ColumnResizer` is the
 * handle, placed inside the header cell it sizes. The table uses the widths in
 * its <colgroup> and should be `table-layout: fixed`.
 */
import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { MAX_COLUMN, MIN_COLUMN, clampColumn as clamp } from "@/lib/column-widths";
import "./column-resizer.css";

/**
 * The divider on a header cell's right edge. `width` is the column's current
 * width; `onResize` is told the new one while dragging. Double-click fits the
 * column to its content (measured from the cells of the same column), or goes
 * back to the default when it already fits. Arrow keys nudge it when focused.
 */
export function ColumnResizer({
  label,
  width,
  onResize,
  onReset,
  onStart,
}: {
  /** The column's name, for the handle's accessible label. */
  label: string;
  width: number;
  onResize: (width: number) => void;
  onReset?: () => void;
  /**
   * Called as a drag begins, with the header row. A table that stretches its
   * columns to fill the width should pin every column at its drawn width
   * here, so the edge follows the pointer exactly; it returns this column's
   * drawn width to start from.
   */
  onStart?: (headerRow: HTMLTableRowElement) => number | undefined;
}) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);
  const self = useRef<HTMLSpanElement>(null);

  const down = (e: PointerEvent<HTMLSpanElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const row = e.currentTarget.closest("tr");
    const drawn = row && onStart ? onStart(row) : undefined;
    drag.current = { startX: e.clientX, startWidth: drawn ?? width };
    document.body.classList.add("is-resizing-column");
  };
  const move = (e: PointerEvent<HTMLSpanElement>) => {
    if (!drag.current) return;
    onResize(clamp(drag.current.startWidth + e.clientX - drag.current.startX));
  };
  const up = () => {
    drag.current = null;
    document.body.classList.remove("is-resizing-column");
  };

  /** The widest entry in this column, measured from the table's own cells. */
  const fit = () => {
    const th = self.current?.closest("th");
    const table = th?.closest("table");
    if (!th || !table) return;
    const index = Array.from(th.parentElement!.children).indexOf(th);
    let widest = th.scrollWidth;
    for (const row of Array.from(table.querySelectorAll("tbody tr"))) {
      const cell = row.children[index] as HTMLElement | undefined;
      if (cell && !cell.hasAttribute("colspan")) widest = Math.max(widest, cell.scrollWidth);
    }
    const target = clamp(widest + 8);
    if (Math.abs(target - width) < 4 && onReset) onReset();
    else onResize(target);
  };

  const key = (e: KeyboardEvent<HTMLSpanElement>) => {
    const step = e.shiftKey ? 48 : 16;
    if (e.key === "ArrowRight") onResize(clamp(width + step));
    else if (e.key === "ArrowLeft") onResize(clamp(width - step));
    else if (e.key === "Enter") fit();
    else return;
    e.preventDefault();
  };

  return (
    <span
      ref={self}
      className="column-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${label} column`}
      aria-valuenow={width}
      aria-valuemin={MIN_COLUMN}
      aria-valuemax={MAX_COLUMN}
      tabIndex={0}
      title="Drag to resize · double-click to fit"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onDoubleClick={(e) => {
        e.stopPropagation();
        fit();
      }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={key}
    />
  );
}
