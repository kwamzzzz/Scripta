/**
 * The chart on screen: the same composition the files are drawn from, as SVG.
 *
 * Boxes are buttons — reachable by Tab, opened with Enter — because a chart a
 * keyboard cannot use is a picture. Dragging a box puts it where it is
 * dropped; dragging the background moves the whole view; Snap back returns
 * both to the computed chart.
 *
 * In edit mode the chart is drawn on directly. A box shows dots on its edges:
 * drag from one to another box to join them. A selected box shows + buttons
 * to add a box above, below or beside it. Double-click a box to rename it, or
 * empty space to add one there. Shift-click or shift-drag selects several.
 * Lines, containers and notes are selected by clicking them. A dragged box
 * snaps into line with the boxes around it, with a guide to show what it lined
 * up with, so a line can be made to run straight; hold Alt to place it freely.
 * What each gesture
 * means (a shareholding, a reporting line) is decided by the page, which also
 * supplies the small popover the gesture opens.
 */
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { TONE_COLOURS, EDGE_COLOURS } from "./build";
import type { Point } from "./layout";
import type { Direction } from "./design";
import { TAG_FILL, type ComposedNode, type Composition } from "./compose";
import { containerLabelBox, tagBox } from "./export";
import { SNAP, bounds as boxBounds, snapMove, type Guide } from "./arrange";
import "./charts.css";

const MIN = 0.3;
const MAX = 1.8;
const DASH = { none: undefined, dotted: "2 3", dashed: "6 4" } as const;

export type Selection =
  | { kind: "none" }
  | { kind: "nodes"; ids: string[] }
  | { kind: "edge"; id: string }
  | { kind: "container"; id: string }
  | { kind: "note"; id: string };

export const NOTHING: Selection = { kind: "none" };

export type QuickAdd = "before" | "after" | "beside";

export type ChartEditor = {
  selection: Selection;
  onSelection: (next: Selection) => void;
  direction: Direction;
  /** A line drawn from one box to another, or to empty space (`null`). */
  onConnect: (from: string, to: string | null, at: Point) => void;
  onQuickAdd: (id: string, where: QuickAdd, at: Point) => void;
  /** Double-click on empty space. */
  onCreateAt: (at: Point) => void;
  /** Double-click on a box. */
  onRename: (id: string, at: Point) => void;
  onMoveNote: (id: string, at: Point) => void;
  /** A box dragged by a corner to a new size, at its new position. */
  onResize: (id: string, rect: Rect) => void;
  onDelete: () => void;
  /** Arrow keys: move the selected boxes by a few units. */
  onNudge: (dx: number, dy: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  popover: { at: Point; content: ReactNode } | null;
  onClosePopover: () => void;
  /** What the + buttons add, for their tooltips. */
  quickLabels: Record<QuickAdd, string>;
};

type Drag =
  | {
      kind: "nodes";
      ids: string[];
      sx: number;
      sy: number;
      dx: number;
      dy: number;
      moved: boolean;
      over: string | null;
      guides?: Guide[];
    }
  | { kind: "note"; id: string; sx: number; sy: number; dx: number; dy: number; moved: boolean }
  | {
      kind: "connect";
      from: string;
      start: Point;
      at: Point;
      over: string | null;
    }
  | { kind: "marquee"; start: Point; at: Point; additive: string[] }
  | {
      kind: "resize";
      id: string;
      corner: Corner;
      sx: number;
      sy: number;
      start: Rect;
      rect: Rect;
    };

type Rect = { x: number; y: number; w: number; h: number };
type Corner = "nw" | "ne" | "sw" | "se";
const MIN_W = 80;
const MIN_H = 36;

export default function ChartCanvas({
  composition,
  preview,
  selectedId = null,
  onSelect,
  onDrop,
  onPlace,
  onSnapBack,
  arranged: hasPlacements = false,
  editor,
  legend,
  label,
  emptyNote,
  height = 520,
  fullScreen: controlledFull,
  onToggleFullScreen,
}: {
  composition: Composition;
  /** The chart with some boxes placed elsewhere, drawn while they are dragged. */
  preview?:
    | ((
        placed: Record<string, Point>,
        sized?: Record<string, { w: number; h: number }>,
      ) => Composition)
    | undefined;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /** Called when one box is dropped on another (view mode only). */
  onDrop?: ((dragId: string, targetId: string | null) => void) | undefined;
  /** Boxes dropped somewhere new, at their new positions. */
  onPlace?: ((placed: Record<string, Point>) => void) | undefined;
  onSnapBack?: (() => void) | undefined;
  /** Whether any box has been placed by hand, so Snap back has something to do. */
  arranged?: boolean;
  editor?: ChartEditor | undefined;
  legend?: ReactNode;
  label: string;
  emptyNote?: ReactNode;
  height?: number;
  /**
   * Whether the page around the chart is full screen, when the page decides
   * (a chart being drawn keeps its toolbar and panel). Left out, Full screen
   * enlarges the chart on its own.
   */
  fullScreen?: boolean | undefined;
  onToggleFullScreen?: (() => void) | undefined;
}) {
  const arrowId = `oc-arrow-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const frame = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const panning = useRef<{ sx: number; sy: number; from: Point; moved: boolean } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  /** A drag ends in a click; that click is not a choice. */
  const swallowClick = useRef(false);
  /** Set once the lawyer zooms or pans; until then the chart keeps itself fitted. */
  const adjusted = useRef(false);
  const editing = !!editor;
  const [ownFull, setOwnFull] = useState(false);
  const full = controlledFull ?? ownFull;
  const toggleFull = onToggleFullScreen ?? (() => setOwnFull((v) => !v));
  // A chart enlarged on its own leaves full screen with Escape.
  useEffect(() => {
    if (controlledFull !== undefined || !ownFull) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) setOwnFull(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [controlledFull, ownFull]);
  const selection = editor?.selection ?? NOTHING;
  const selectedNodes = selection.kind === "nodes" ? selection.ids : [];

  const shown = useMemo(() => {
    if (drag?.kind === "resize" && preview) {
      const r = drag.rect;
      return preview({ [drag.id]: { x: r.x, y: r.y } }, { [drag.id]: { w: r.w, h: r.h } });
    }
    if (drag?.kind !== "nodes" || !drag.moved || !preview) return composition;
    const placed: Record<string, Point> = {};
    for (const id of drag.ids) {
      const n = composition.nodes.find((x) => x.id === id);
      if (n) placed[id] = { x: n.x + drag.dx, y: n.y + drag.dy };
    }
    return preview(placed);
  }, [composition, preview, drag]);

  const fit = () => {
    const box = scroller.current;
    if (!box || !shown.width) return;
    const z = Math.min(
      MAX,
      Math.max(
        MIN,
        Math.min((box.clientWidth - 16) / shown.width, (box.clientHeight - 16) / shown.height),
      ),
    );
    setZoom(Math.min(1, z));
    setPan({ x: 0, y: 0 });
  };

  // Entering or leaving full screen changes the room the chart has, so the
  // chart is fitted to it again.
  useEffect(() => {
    adjusted.current = false;
    const frame = window.requestAnimationFrame(() => fit());
    return () => window.cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full]);

  // Keep the chart fitted as it grows (a design arriving, a box added) until the
  // lawyer zooms or pans, then leave their view alone.
  useLayoutEffect(() => {
    if (adjusted.current || !composition.nodes.length) return;
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composition.nodes.length, composition.width, composition.height]);

  const toChart = (clientX: number, clientY: number): Point => {
    const rect = svg.current!.getBoundingClientRect();
    return { x: (clientX - rect.left) / zoom, y: (clientY - rect.top) / zoom };
  };
  const hitNode = (p: Point, except?: string): ComposedNode | null =>
    shown.nodes.find(
      (n) =>
        n.id !== except &&
        n.kind !== "group" &&
        p.x >= n.x &&
        p.x <= n.x + n.w &&
        p.y >= n.y &&
        p.y <= n.y + n.h,
    ) ?? null;
  const swallowNextClick = () => {
    swallowClick.current = true;
    window.setTimeout(() => (swallowClick.current = false), 0);
  };
  /**
   * What the pointer handlers read. They are attached the moment a drag starts,
   * before React has drawn anything, so a quick drag is never lost; this keeps
   * them looking at the chart as it is now.
   */
  const live = useRef({ composition, shown, zoom, editing, editor, onDrop, onPlace });
  live.current = { composition, shown, zoom, editing, editor, onDrop, onPlace };

  /** Keyboard shortcuts (Delete, ⌘Z) go to the chart once something on it is touched. */
  const claimKeys = () => {
    if (editor) scroller.current?.focus({ preventScroll: true });
  };

  const start = (first: Drag) => {
    dragRef.current = first;
    setDrag(first);
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const { composition, zoom, editing, onDrop } = live.current;
      const p = toChart(e.clientX, e.clientY);
      let next: Drag;
      if (d.kind === "nodes" || d.kind === "note") {
        const moved = d.moved || Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 4;
        let dx = (e.clientX - d.sx) / zoom;
        let dy = (e.clientY - d.sy) / zoom;
        let guides: Guide[] = [];
        if (d.kind === "nodes" && moved && !e.altKey) {
          const dragged = new Set(d.ids);
          const originals = composition.nodes.filter((n) => dragged.has(n.id));
          if (originals.length) {
            const box = boxBounds(originals);
            const connected = new Set(
              composition.edges
                .filter((x) => dragged.has(x.from) || dragged.has(x.to))
                .flatMap((x) => [x.from, x.to]),
            );
            const snapped = snapMove(
              { ...box, x: box.x + dx, y: box.y + dy },
              composition.nodes.filter((n) => !dragged.has(n.id) && n.kind !== "group"),
              connected,
              Math.max(4, SNAP / zoom),
            );
            dx += snapped.dx;
            dy += snapped.dy;
            guides = snapped.guides;
          }
        }
        next = {
          ...d,
          dx,
          dy,
          moved,
          ...(d.kind === "nodes" ? { guides } : {}),
          ...(d.kind === "nodes"
            ? {
                over:
                  onDrop && !editing && d.ids.length === 1
                    ? (hitNode(p, d.ids[0])?.id ?? null)
                    : null,
              }
            : {}),
        } as Drag;
      } else if (d.kind === "connect") {
        next = { ...d, at: p, over: hitNode(p, d.from)?.id ?? null };
      } else if (d.kind === "resize") {
        // The opposite corner stays put; sizes land on a 4-unit grid.
        const dx = (e.clientX - d.sx) / zoom;
        const dy = (e.clientY - d.sy) / zoom;
        const s0 = d.start;
        const snap = (v: number) => Math.round(v / 4) * 4;
        const left = d.corner === "nw" || d.corner === "sw";
        const up = d.corner === "nw" || d.corner === "ne";
        const w = Math.max(MIN_W, snap(s0.w + (left ? -dx : dx)));
        const h = Math.max(MIN_H, snap(s0.h + (up ? -dy : dy)));
        next = {
          ...d,
          rect: { x: left ? s0.x + s0.w - w : s0.x, y: up ? s0.y + s0.h - h : s0.y, w, h },
        };
      } else next = { ...d, at: p };
      dragRef.current = next;
      setDrag(next);
    };
    const up = () => {
      const { composition, shown, editing, editor, onDrop, onPlace } = live.current;
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!d) return;
      if (d.kind === "connect") {
        swallowNextClick();
        if (Math.hypot(d.at.x - d.start.x, d.at.y - d.start.y) > 12)
          editor?.onConnect(d.from, d.over, d.at);
        return;
      }
      if (d.kind === "resize") {
        swallowNextClick();
        const r = d.rect;
        const s0 = d.start;
        if (r.w !== s0.w || r.h !== s0.h || r.x !== s0.x || r.y !== s0.y) editor?.onResize(d.id, r);
        return;
      }
      if (d.kind === "marquee") {
        swallowNextClick();
        const x0 = Math.min(d.start.x, d.at.x);
        const x1 = Math.max(d.start.x, d.at.x);
        const y0 = Math.min(d.start.y, d.at.y);
        const y1 = Math.max(d.start.y, d.at.y);
        const inside = shown.nodes
          .filter(
            (n) => n.kind !== "group" && n.x < x1 && n.x + n.w > x0 && n.y < y1 && n.y + n.h > y0,
          )
          .map((n) => n.id);
        const ids = [...new Set([...d.additive, ...inside])];
        editor?.onSelection(ids.length ? { kind: "nodes", ids } : NOTHING);
        return;
      }
      if (!d.moved) return;
      swallowNextClick();
      if (d.kind === "note") {
        const note = composition.notes.find((n) => n.id === d.id);
        if (note) editor?.onMoveNote(d.id, { x: note.x + d.dx, y: note.y + d.dy });
        return;
      }
      if (d.over && onDrop && !editing) onDrop(d.ids[0]!, d.over);
      else if (onPlace) {
        const placed: Record<string, Point> = {};
        for (const id of d.ids) {
          const n = composition.nodes.find((x) => x.id === id);
          if (n) placed[id] = { x: n.x + d.dx, y: n.y + d.dy };
        }
        onPlace(placed);
      }
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
    const finish = () => {
      stop();
      up();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  };

  const blank = !composition.nodes.length && !composition.notes.length;
  if (blank && !editor) return <div className="oc-canvas oc-canvas-empty">{emptyNote}</div>;
  // An empty chart being drawn still needs room to double-click in.
  const width = editor ? Math.max(shown.width, 720) : shown.width;
  const tall = editor ? Math.max(shown.height, 380) : shown.height;

  const draggable = !!(onDrop || onPlace);
  const canSnap = pan.x !== 0 || pan.y !== 0 || (!!onSnapBack && hasPlacements);
  // Boxes being dragged are drawn last, over everything they pass.
  const dragging = drag?.kind === "nodes" && drag.moved ? new Set(drag.ids) : null;
  const nodes = dragging
    ? [
        ...shown.nodes.filter((n) => !dragging.has(n.id)),
        ...shown.nodes.filter((n) => dragging.has(n.id)),
      ]
    : shown.nodes;
  const colours = [...new Set(shown.edges.map((e) => e.colour))];

  /** Where a chart point sits inside the frame, for popovers. */
  const screenOf = (p: Point) => {
    const s = svg.current?.getBoundingClientRect();
    const f = frame.current?.getBoundingClientRect();
    if (!s || !f) return { left: 0, top: 0 };
    const left = s.left - f.left + p.x * zoom;
    const top = s.top - f.top + p.y * zoom;
    return {
      left: Math.max(8, Math.min(left, f.width - 300)),
      top: Math.max(40, Math.min(top, f.height - 60)),
    };
  };

  const selectNode = (id: string, additive: boolean) => {
    if (!editor) return onSelect?.(id);
    if (additive) {
      const ids = selectedNodes.includes(id)
        ? selectedNodes.filter((x) => x !== id)
        : [...selectedNodes, id];
      editor.onSelection(ids.length ? { kind: "nodes", ids } : NOTHING);
    } else editor.onSelection({ kind: "nodes", ids: [id] });
  };

  const single =
    selectedNodes.length === 1 ? shown.nodes.find((n) => n.id === selectedNodes[0]) : null;
  const quick = (
    n: ComposedNode,
  ): { where: "before" | "after" | "beside"; x: number; y: number }[] =>
    editor?.direction === "right"
      ? [
          { where: "before", x: n.x - 22, y: n.y + n.h / 2 },
          { where: "after", x: n.x + n.w + 22, y: n.y + n.h / 2 },
          { where: "beside", x: n.x + n.w / 2, y: n.y + n.h + 22 },
        ]
      : [
          { where: "before", x: n.x + n.w / 2, y: n.y - 22 },
          { where: "after", x: n.x + n.w / 2, y: n.y + n.h + 22 },
          { where: "beside", x: n.x + n.w + 22, y: n.y + n.h / 2 },
        ];
  const handles = (n: ComposedNode): Point[] => [
    { x: n.x + n.w / 2, y: n.y },
    { x: n.x + n.w, y: n.y + n.h / 2 },
    { x: n.x + n.w / 2, y: n.y + n.h },
    { x: n.x, y: n.y + n.h / 2 },
  ];
  const connecting = drag?.kind === "connect" ? drag : null;
  const marquee = drag?.kind === "marquee" ? drag : null;

  return (
    <div
      className={`oc-canvas${editing ? " is-editing" : ""}${ownFull && controlledFull === undefined ? " is-fullscreen" : ""}`}
      style={full ? undefined : { height }}
      ref={frame}
    >
      <div className="oc-toolbar" role="group" aria-label="Zoom">
        <button
          type="button"
          onClick={() => {
            adjusted.current = true;
            setZoom((z) => Math.max(MIN, +(z - 0.1).toFixed(2)));
          }}
          aria-label="Zoom out"
        >
          −
        </button>
        <span aria-live="polite">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          onClick={() => {
            adjusted.current = true;
            setZoom((z) => Math.min(MAX, +(z + 0.1).toFixed(2)));
          }}
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => {
            adjusted.current = false;
            fit();
          }}
        >
          Fit
        </button>
        <button
          type="button"
          onClick={toggleFull}
          title={full ? "Leave full screen (Esc)" : "Use the whole window for the chart"}
        >
          {full ? "Exit full screen" : "Full screen"}
        </button>
        {canSnap && (
          <button
            type="button"
            onClick={() => {
              setPan({ x: 0, y: 0 });
              onSnapBack?.();
            }}
            title="Put every box back where the chart places it"
          >
            Snap back
          </button>
        )}
      </div>
      <div
        className={`oc-scroll${isPanning ? " is-panning" : ""}`}
        ref={scroller}
        tabIndex={editing ? 0 : undefined}
        aria-label={editing ? `${label}, editing` : undefined}
        onKeyDown={(e) => {
          if (!editor) return;
          const target = e.target as HTMLElement;
          if (target.closest("input, textarea, select, .oc-popover")) return;
          const mod = e.metaKey || e.ctrlKey;
          // Undo and redo are handled for the whole page by the editor.
          if (mod && ["z", "y"].includes(e.key.toLowerCase())) return;
          else if (e.key === "Delete" || e.key === "Backspace") {
            if (selection.kind === "none") return;
            e.preventDefault();
            editor.onDelete();
          } else if (e.key.startsWith("Arrow") && selection.kind === "nodes") {
            e.preventDefault();
            const step = e.shiftKey ? 10 : 1;
            editor.onNudge(
              e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0,
              e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0,
            );
          } else if (e.key === "Escape") {
            // Escape clears what is open first, and only then leaves full screen.
            if (editor.popover) {
              e.preventDefault();
              editor.onClosePopover();
            } else if (selection.kind !== "none") {
              e.preventDefault();
              editor.onSelection(NOTHING);
            }
          }
        }}
        onClick={(e) => {
          if (swallowClick.current) return;
          if (e.target === e.currentTarget || (e.target as Element).tagName === "svg") {
            if (editor) {
              editor.onSelection(NOTHING);
              if (editor.popover) editor.onClosePopover();
            } else onSelect?.(null);
          }
        }}
        onDoubleClick={(e) => {
          if (!editor) return;
          if (e.target === e.currentTarget || (e.target as Element).tagName === "svg")
            editor.onCreateAt(toChart(e.clientX, e.clientY));
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          if ((e.target as HTMLElement).closest(".oc-popover")) return;
          if (editor && e.shiftKey && svg.current) {
            const p = toChart(e.clientX, e.clientY);
            start({ kind: "marquee", start: p, at: p, additive: selectedNodes });
            return;
          }
          panning.current = { sx: e.clientX, sy: e.clientY, from: pan, moved: false };
        }}
        onPointerMove={(e) => {
          const p = panning.current;
          if (!p) return;
          const dx = e.clientX - p.sx;
          const dy = e.clientY - p.sy;
          if (!p.moved && Math.hypot(dx, dy) <= 4) return;
          if (!p.moved) {
            // Captured only once it is a pan, so a click on a box stays a click.
            e.currentTarget.setPointerCapture(e.pointerId);
            setIsPanning(true);
          }
          p.moved = true;
          adjusted.current = true;
          setPan({ x: p.from.x + dx, y: p.from.y + dy });
        }}
        onPointerUp={(e) => {
          const p = panning.current;
          panning.current = null;
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
          if (p?.moved) {
            setIsPanning(false);
            swallowNextClick();
          }
        }}
        onPointerCancel={() => {
          panning.current = null;
          setIsPanning(false);
        }}
      >
        <svg
          ref={svg}
          role="group"
          aria-label={label}
          width={width * zoom}
          height={tall * zoom}
          viewBox={`0 0 ${width} ${tall}`}
          className={dragging ? "is-dragging" : undefined}
          style={pan.x || pan.y ? { transform: `translate(${pan.x}px, ${pan.y}px)` } : undefined}
        >
          <defs>
            {colours.map((colour) => (
              <marker
                key={colour}
                id={`${arrowId}-${colour.slice(1)}`}
                viewBox="0 0 8 8"
                refX="7"
                refY="4"
                markerWidth="6"
                markerHeight="6"
                orient="auto"
              >
                <path d="M0,0 L8,4 L0,8 z" fill={colour} />
              </marker>
            ))}
          </defs>

          {shown.containers.map((c) => {
            const selected = selection.kind === "container" && selection.id === c.id;
            const l = containerLabelBox(c);
            return (
              <g
                key={c.id}
                className={`oc-container${editing ? " is-interactive" : ""}${selected ? " is-selected" : ""}`}
                {...(editor
                  ? {
                      onClick: (e: React.MouseEvent) => {
                        e.stopPropagation();
                        if (swallowClick.current) return;
                        editor.onSelection({ kind: "container", id: c.id });
                      },
                      onPointerDown: (e: React.PointerEvent) => {
                        if (e.button !== 0 || e.shiftKey) return;
                        e.stopPropagation();
                        claimKeys();
                        start({
                          kind: "nodes",
                          ids: c.members,
                          sx: e.clientX,
                          sy: e.clientY,
                          dx: 0,
                          dy: 0,
                          moved: false,
                          over: null,
                        });
                      },
                    }
                  : {})}
              >
                <rect
                  x={c.x}
                  y={c.y}
                  width={c.w}
                  height={c.h}
                  rx={6}
                  fill={c.fill}
                  stroke={selected ? "#247A78" : c.stroke}
                  strokeWidth={selected ? 2 : 1}
                />
                {c.label && (
                  <>
                    <rect x={l.x} y={l.y} width={l.w} height={l.h} rx={2} fill={c.labelFill} />
                    <text x={l.x + 8} y={l.y + 11.5} className="oc-container-label">
                      {c.label.toUpperCase()}
                    </text>
                  </>
                )}
              </g>
            );
          })}

          {shown.edges.map((e) => {
            const selected = selection.kind === "edge" && selection.id === e.id;
            const points = e.points.map((p) => `${p.x},${p.y}`).join(" ");
            return (
              <g key={e.id} className={`oc-edge is-${e.style}${selected ? " is-selected" : ""}`}>
                {editor && (
                  <polyline
                    className="oc-edge-hit"
                    fill="none"
                    stroke="transparent"
                    strokeWidth={14}
                    points={points}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      if (swallowClick.current) return;
                      claimKeys();
                      editor.onSelection({ kind: "edge", id: e.id });
                    }}
                    onPointerDown={(ev) => ev.stopPropagation()}
                  />
                )}
                {selected && (
                  <polyline
                    fill="none"
                    stroke="#247A78"
                    strokeOpacity={0.25}
                    strokeWidth={8}
                    points={points}
                    pointerEvents="none"
                  />
                )}
                <polyline
                  fill="none"
                  stroke={e.colour}
                  strokeWidth={selected ? e.width + 0.8 : e.width}
                  strokeLinejoin="miter"
                  pointerEvents="none"
                  markerEnd={e.arrow ? `url(#${arrowId}-${e.colour.slice(1)})` : undefined}
                  strokeDasharray={DASH[e.dash]}
                  points={points}
                />
                {e.text && (
                  <text
                    x={e.textAt.x}
                    y={e.textAt.y}
                    className="oc-edge-label"
                    fill={e.textColour}
                    pointerEvents={editor ? "all" : "none"}
                    onPointerDown={editor ? (ev) => ev.stopPropagation() : undefined}
                    onClick={
                      editor
                        ? (ev) => {
                            // Where lines share a run, the share is the one place that
                            // belongs to a single line.
                            ev.stopPropagation();
                            claimKeys();
                            editor.onSelection({ kind: "edge", id: e.id });
                          }
                        : undefined
                    }
                    style={editor ? { cursor: "pointer" } : undefined}
                  >
                    {e.text}
                  </text>
                )}
              </g>
            );
          })}

          {nodes.map((n) => {
            const selected = editing ? selectedNodes.includes(n.id) : n.id === selectedId;
            const over =
              (drag?.kind === "nodes" && drag.over === n.id) || connecting?.over === n.id;
            const interactive = n.kind !== "group";
            return (
              <g
                key={n.id}
                className={`oc-node${selected ? " is-selected" : ""}${over ? " is-target" : ""}${n.state === "muted" ? " is-muted" : ""}${
                  interactive ? " is-interactive" : ""
                }`}
                transform={`translate(${n.x} ${n.y})`}
                onPointerEnter={() => editing && interactive && setHover(n.id)}
                onPointerLeave={() => editing && setHover((h) => (h === n.id ? null : h))}
                {...(interactive
                  ? {
                      role: "button",
                      tabIndex: 0,
                      "aria-pressed": selected,
                      "aria-label": `${n.title}${n.subtitle ? `, ${n.subtitle}` : ""}`,
                      onClick: (e: React.MouseEvent) => {
                        e.stopPropagation();
                        if (swallowClick.current) return;
                        if (!editor) onSelect?.(n.id);
                      },
                      onDoubleClick: (e: React.MouseEvent) => {
                        e.stopPropagation();
                        editor?.onRename(n.id, { x: n.x, y: n.y + n.h + 6 });
                      },
                      onKeyDown: (e: React.KeyboardEvent) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          selectNode(n.id, false);
                        }
                      },
                      onPointerDown: (e: React.PointerEvent) => {
                        if (e.button !== 0) return;
                        e.stopPropagation();
                        if (editor) {
                          claimKeys();
                          const additive = e.shiftKey || e.metaKey || e.ctrlKey;
                          if (additive) {
                            selectNode(n.id, true);
                            return;
                          }
                          const ids = selectedNodes.includes(n.id) ? selectedNodes : [n.id];
                          if (!selectedNodes.includes(n.id)) selectNode(n.id, false);
                          start({
                            kind: "nodes",
                            ids,
                            sx: e.clientX,
                            sy: e.clientY,
                            dx: 0,
                            dy: 0,
                            moved: false,
                            over: null,
                          });
                          return;
                        }
                        if (!draggable) return;
                        start({
                          kind: "nodes",
                          ids: [n.id],
                          sx: e.clientX,
                          sy: e.clientY,
                          dx: 0,
                          dy: 0,
                          moved: false,
                          over: null,
                        });
                      },
                    }
                  : {})}
              >
                <rect
                  width={n.w}
                  height={n.h}
                  rx={n.radius}
                  fill={n.fill}
                  stroke={selected || over ? "#247A78" : n.stroke}
                  strokeWidth={selected || over ? 2 : n.fill === "#FFFFFF" ? 1.4 : 1}
                  strokeDasharray={n.dashed ? "4 3" : undefined}
                />
                {n.lines.map((line, i) => (
                  <text
                    key={i}
                    x={n.w / 2}
                    y={line.y}
                    className={`oc-line${line.caps ? " is-caps" : ""}`}
                    fill={line.colour}
                    fontSize={line.size}
                    fontWeight={line.bold ? 600 : 400}
                    fontStyle={line.italic ? "italic" : undefined}
                  >
                    {line.text}
                  </text>
                ))}
                {n.badge && (
                  <text x={n.w - 6} y={11} className="oc-badge">
                    {n.badge}
                  </text>
                )}
                {n.state === "added" && (
                  <text x={6} y={11} className="oc-badge is-added">
                    Added
                  </text>
                )}
              </g>
            );
          })}

          {shown.nodes
            .filter((n) => n.tag)
            .map((n) => {
              const t = tagBox(n);
              return (
                <g key={`tag-${n.id}`} pointerEvents="none">
                  <rect x={t.x} y={t.y} width={t.w} height={t.h} rx={2} fill={TAG_FILL} />
                  <text x={t.x + t.w / 2} y={t.y + 10} className="oc-tag">
                    {n.tag}
                  </text>
                </g>
              );
            })}

          {shown.notes.map((note) => {
            const selected = selection.kind === "note" && selection.id === note.id;
            const moving = drag?.kind === "note" && drag.id === note.id && drag.moved ? drag : null;
            return (
              <g
                key={note.id}
                className={`oc-note${editing ? " is-interactive" : ""}${selected ? " is-selected" : ""}`}
                transform={`translate(${note.x + (moving?.dx ?? 0)} ${note.y + (moving?.dy ?? 0)})`}
                {...(editor
                  ? {
                      onClick: (e: React.MouseEvent) => {
                        e.stopPropagation();
                        if (swallowClick.current) return;
                        editor.onSelection({ kind: "note", id: note.id });
                      },
                      onPointerDown: (e: React.PointerEvent) => {
                        if (e.button !== 0) return;
                        e.stopPropagation();
                        claimKeys();
                        editor.onSelection({ kind: "note", id: note.id });
                        start({
                          kind: "note",
                          id: note.id,
                          sx: e.clientX,
                          sy: e.clientY,
                          dx: 0,
                          dy: 0,
                          moved: false,
                        });
                      },
                    }
                  : {})}
              >
                <rect
                  width={note.w}
                  height={note.h}
                  rx={3}
                  fill={editing ? "rgba(255,255,255,0.6)" : "transparent"}
                  stroke={selected ? "#247A78" : editing ? "#D3D7D1" : "none"}
                  strokeDasharray={selected ? undefined : "3 2"}
                />
                {note.lines.map((line, i) => (
                  <text key={i} x={6} y={16 + i * 15} className="oc-note-text">
                    {line}
                  </text>
                ))}
              </g>
            );
          })}

          {shown.legend && (
            <g className="oc-legend-box" pointerEvents="none">
              <rect
                x={shown.legend.x}
                y={shown.legend.y}
                width={shown.legend.w}
                height={shown.legend.h}
                rx={4}
                fill="#fff"
                stroke="#D3D7D1"
              />
              <text x={shown.legend.x + 12} y={shown.legend.y + 19} className="oc-legend-title">
                LEGEND
              </text>
              {shown.legend.items.map((item, i) => {
                const x = shown.legend!.x + 12;
                const y = shown.legend!.y + 30 + i * 18;
                return (
                  <g key={item.key}>
                    {item.shape === "line" ? (
                      <line
                        x1={x}
                        y1={y + 5}
                        x2={x + 22}
                        y2={y + 5}
                        stroke={item.stroke}
                        strokeWidth={1.5}
                        strokeDasharray={item.dash ? DASH[item.dash] : undefined}
                      />
                    ) : (
                      <rect
                        x={x}
                        y={y}
                        width={22}
                        height={11}
                        rx={2}
                        fill={item.fill}
                        stroke={item.stroke}
                        strokeDasharray={item.dash === "dashed" ? "3 2" : undefined}
                      />
                    )}
                    <text x={x + 32} y={y + 9.5} className="oc-legend-label">
                      {item.label}
                    </text>
                  </g>
                );
              })}
            </g>
          )}

          {editor &&
            shown.nodes
              .filter(
                (n) =>
                  n.kind !== "group" &&
                  (n.id === hover || selectedNodes.includes(n.id) || connecting?.over === n.id),
              )
              .filter(() => !dragging)
              .map((n) =>
                handles(n).map((h, i) => (
                  <circle
                    key={`${n.id}-h${i}`}
                    cx={h.x}
                    cy={h.y}
                    r={5}
                    className="oc-handle"
                    onPointerEnter={() => setHover(n.id)}
                    onPointerDown={(e) => {
                      if (e.button !== 0) return;
                      e.stopPropagation();
                      start({ kind: "connect", from: n.id, start: h, at: h, over: null });
                    }}
                  >
                    <title>Drag to another box to join them</title>
                  </circle>
                )),
              )}

          {editor &&
            single &&
            !dragging &&
            !connecting &&
            (
              [
                ["nw", single.x, single.y],
                ["ne", single.x + single.w, single.y],
                ["sw", single.x, single.y + single.h],
                ["se", single.x + single.w, single.y + single.h],
              ] as [Corner, number, number][]
            ).map(([corner, cx, cy]) => (
              <rect
                key={corner}
                className={`oc-resize is-${corner}`}
                x={cx - 4}
                y={cy - 4}
                width={8}
                height={8}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.stopPropagation();
                  claimKeys();
                  const origin = { x: single.x, y: single.y, w: single.w, h: single.h };
                  start({
                    kind: "resize",
                    id: single.id,
                    corner,
                    sx: e.clientX,
                    sy: e.clientY,
                    start: origin,
                    rect: origin,
                  });
                }}
              >
                <title>Drag to resize</title>
              </rect>
            ))}

          {editor &&
            single &&
            !dragging &&
            !connecting &&
            drag?.kind !== "resize" &&
            quick(single).map((q) => (
              <g
                key={q.where}
                className="oc-quick"
                transform={`translate(${q.x} ${q.y})`}
                role="button"
                aria-label={editor.quickLabels[q.where]}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  editor.onQuickAdd(single.id, q.where, { x: q.x, y: q.y });
                }}
              >
                <title>{editor.quickLabels[q.where]}</title>
                <circle r={11} />
                <path d="M-4.5,0 H4.5 M0,-4.5 V4.5" />
              </g>
            ))}

          {drag?.kind === "nodes" &&
            drag.moved &&
            drag.guides?.map((g, i) =>
              g.axis === "x" ? (
                <line key={i} className="oc-guide" x1={g.at} x2={g.at} y1={g.from} y2={g.to} />
              ) : (
                <line key={i} className="oc-guide" x1={g.from} x2={g.to} y1={g.at} y2={g.at} />
              ),
            )}
          {connecting && (
            <line
              x1={connecting.start.x}
              y1={connecting.start.y}
              x2={connecting.at.x}
              y2={connecting.at.y}
              className="oc-connect-preview"
            />
          )}
          {marquee && (
            <rect
              x={Math.min(marquee.start.x, marquee.at.x)}
              y={Math.min(marquee.start.y, marquee.at.y)}
              width={Math.abs(marquee.at.x - marquee.start.x)}
              height={Math.abs(marquee.at.y - marquee.start.y)}
              className="oc-marquee"
            />
          )}
        </svg>
      </div>
      {editor && blank && !editor.popover && (
        <div className="oc-blank-hint" aria-hidden>
          Double-click anywhere to add the first box, or use + Add.
        </div>
      )}
      {editor?.popover && (
        <div
          className="oc-popover"
          style={screenOf(editor.popover.at)}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {editor.popover.content}
        </div>
      )}
      {legend && <div className="oc-legend">{legend}</div>}
    </div>
  );
}

/** A legend swatch: a small box in a tone, or a line style. */
export function Swatch({
  tone,
  line,
  children,
}: {
  tone?: keyof typeof TONE_COLOURS;
  line?: "dotted" | "added" | "removed";
  children: ReactNode;
}) {
  if (line)
    return (
      <span className="oc-swatch">
        <svg width="22" height="8" aria-hidden="true">
          <line
            x1="0"
            y1="4"
            x2="22"
            y2="4"
            stroke={EDGE_COLOURS[line]}
            strokeWidth="1.5"
            strokeDasharray={line === "dotted" ? "2 3" : line === "added" ? "5 3" : undefined}
          />
        </svg>
        {children}
      </span>
    );
  const c = TONE_COLOURS[tone ?? "role"];
  return (
    <span className="oc-swatch">
      <i
        style={{
          background: c.fill,
          borderColor: c.stroke,
          borderStyle: tone === "vacant" || tone === "proposed" ? "dashed" : "solid",
        }}
      />
      {children}
    </span>
  );
}
