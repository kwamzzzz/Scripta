/**
 * A list you can put in your own order: drag a row by its handle and the rows
 * around it make room, or focus the handle and use the arrow keys.
 *
 * It only reorders. What the order means, and where it is kept, belong to the
 * caller, which gets the ids in their new order and saves them however that
 * screen saves things. Each row is drawn by the caller too, with the handle
 * handed over to place wherever the row wants it.
 */
import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { moveTo } from "@/lib/move-to";
import "./sortable-list.css";

type Drag = {
  id: string;
  from: number;
  to: number;
  startY: number;
  dy: number;
  /** Where every row sat when the drag began, top and height. */
  slots: { top: number; height: number }[];
  /** How far a row moves to make room: the dragged row plus the gap after it. */
  step: number;
};

export default function SortableList<T>({
  items,
  getId,
  getLabel,
  onReorder,
  renderItem,
  className,
  disabled,
}: {
  items: T[];
  getId: (item: T) => string;
  /** What a screen reader hears the row called: "Move {label}". */
  getLabel: (item: T) => string;
  /** The ids in their new order. Called only when something moved. */
  onReorder: (ids: string[]) => void;
  renderItem: (item: T, handle: ReactNode, state: { dragging: boolean }) => ReactNode;
  className?: string;
  /** Draws the rows without handles, where the order cannot change. */
  disabled?: boolean;
}) {
  const rows = useRef(new Map<string, HTMLDivElement>());
  const [drag, setDrag] = useState<Drag | null>(null);
  const [said, setSaid] = useState("");
  const ids = items.map(getId);

  const begin = (event: PointerEvent<HTMLButtonElement>, index: number) => {
    if (event.button !== 0 || items.length < 2) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const slots = ids.map((id) => {
      const rect = rows.current.get(id)?.getBoundingClientRect();
      return { top: rect?.top ?? 0, height: rect?.height ?? 0 };
    });
    const me = slots[index]!;
    const after = slots[index + 1] ?? slots[index - 1];
    const gap = after
      ? index + 1 < slots.length
        ? after.top - (me.top + me.height)
        : me.top - (after.top + after.height)
      : 0;
    setDrag({
      id: ids[index]!,
      from: index,
      to: index,
      startY: event.clientY,
      dy: 0,
      slots,
      step: me.height + Math.max(0, gap),
    });
  };

  const follow = (event: PointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    const dy = event.clientY - drag.startY;
    const me = drag.slots[drag.from]!;
    const centre = me.top + me.height / 2 + dy;
    // The row lands after every other row whose middle it has passed.
    let to = 0;
    drag.slots.forEach((slot, i) => {
      if (i !== drag.from && slot.top + slot.height / 2 < centre) to++;
    });
    setDrag({ ...drag, dy, to });
  };

  const finish = (commit: boolean) => {
    if (!drag) return;
    if (commit && drag.to !== drag.from) {
      onReorder(moveTo(ids, drag.from, drag.to));
      const moved = items[drag.from]!;
      setSaid(`${getLabel(moved)} moved to position ${drag.to + 1} of ${items.length}.`);
    }
    setDrag(null);
  };

  const nudge = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    if (event.key === "Escape" && drag) {
      event.preventDefault();
      finish(false);
      return;
    }
    const to = index + delta;
    if (!delta || to < 0 || to >= items.length) return;
    event.preventDefault();
    onReorder(moveTo(ids, index, to));
    setSaid(`${getLabel(items[index]!)} moved to position ${to + 1} of ${items.length}.`);
  };

  /** How far a row slides while another is dragged past it. */
  const shift = (index: number) => {
    if (!drag || index === drag.from) return 0;
    if (drag.from < drag.to && index > drag.from && index <= drag.to) return -drag.step;
    if (drag.to < drag.from && index >= drag.to && index < drag.from) return drag.step;
    return 0;
  };

  return (
    <div className={`sortable${drag ? " is-sorting" : ""}${className ? ` ${className}` : ""}`}>
      {items.map((item, index) => {
        const id = ids[index]!;
        const dragging = drag?.id === id;
        const handle = disabled ? null : (
          <button
            type="button"
            className="sortable-handle"
            aria-label={`Move ${getLabel(item)}`}
            title="Drag to reorder, or focus and use the arrow keys"
            onPointerDown={(event) => begin(event, index)}
            onPointerMove={follow}
            onPointerUp={() => finish(true)}
            onPointerCancel={() => finish(false)}
            onKeyDown={(event) => nudge(event, index)}
          >
            <GripVertical size={14} aria-hidden="true" />
          </button>
        );
        return (
          <div
            key={id}
            ref={(node) => {
              if (node) rows.current.set(id, node);
              else rows.current.delete(id);
            }}
            className={`sortable-row${dragging ? " is-dragging" : ""}`}
            style={{
              transform: dragging
                ? `translateY(${drag!.dy}px)`
                : shift(index)
                  ? `translateY(${shift(index)}px)`
                  : undefined,
            }}
          >
            {renderItem(item, handle, { dragging })}
          </div>
        );
      })}
      <span className="sr-only" aria-live="polite">
        {said}
      </span>
    </div>
  );
}
