/**
 * Everything a chart page needs to show a chart and let a lawyer draw it: the
 * laid-out records with the firm's design, the canvas wiring, the edit toolbar
 * and the Format panel.
 *
 * What a gesture means for the records differs between the two charts (a
 * shareholding, a reporting line), so that part is an adapter the page
 * supplies; the rest — selection, colours, containers, notes, the legend,
 * undo, saving — is the same for both.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/primitives";
import { organisationKey } from "../../db";
import type { Organisation } from "../../model";
import { NOTHING, type ChartEditor, type QuickAdd, type Selection } from "../ChartCanvas";
import ChartStyleMenu from "../ChartStyleMenu";
import { arrange, compose, legendItems, type Composition } from "../compose";
import {
  BOX_LIMITS,
  CONTAINER_COLOURS,
  FILLS,
  LINE_COLOURS,
  addNote,
  formatEdges,
  formatNodes,
  groupNodes,
  placeNodes,
  removeContainer,
  removeNote,
  setDirection,
  setLegend,
  setLegendLabel,
  setMembership,
  setStyle,
  setWidth,
  snapBack,
  toggleLegendItem,
  updateContainer,
  updateNote,
  viewKey,
  type ChartDesign,
  type ChartKind,
  type ContainerColour,
  type DesignOp,
} from "../design";
import type { ChartLayout, Point, RouteOptions } from "../layout";
import { applyPositions } from "../positions";
import { DEFAULT_STYLE, routeOf } from "../style";
import { useChartDesign, useUndo, type Step } from "../useChartDesign";
import { Choice, CommitInput, Section, Swatches } from "./fields";
import { align, centredOver, distribute, inLineWith, type Alignment, type Box } from "../arrange";
import type { Direction } from "../design";

export type EditorContext = {
  org: Organisation;
  view: string;
  design: ChartDesign;
  composition: Composition;
  /** Opens the small form a gesture asks for, at a point on the chart. */
  open: (at: Point, content: ReactNode) => void;
  close: () => void;
  /** Changes records; the step it returns joins the undo history. */
  run: (work: () => Promise<Step | null>) => Promise<boolean>;
  /** Changes the design, as one undoable step. */
  change: (op: DesignOp, label: string) => void;
  /** Pins a box at a point in this view. */
  place: (id: string, at: Point) => void;
  select: (next: Selection) => void;
  notice: (text: string | null) => void;
};

export type ChartAdapter = {
  quickLabels: Record<QuickAdd, string>;
  howTo: string[];
  /** The Add ▾ menu: what can be added from the toolbar. */
  addItems: { label: string; open: (at: Point) => void }[];
  connect: (from: string, to: string | null, at: Point) => void;
  quickAdd: (id: string, where: QuickAdd, at: Point) => void;
  createAt: (at: Point) => void;
  rename: (id: string, at: Point) => void;
  /** Deletes the records behind selected boxes or a selected line. */
  remove: (selection: Selection) => void;
  nodeTitle: (id: string) => string;
  /** Record actions shown for selected boxes. */
  nodeActions: (ids: string[]) => ReactNode;
  edgeTitle: (id: string) => string;
  /** Record fields for a selected line: the share, the note. */
  edgeFields: (id: string) => ReactNode;
};

const noteText = "Note";

export function useChartWorkspace({
  org,
  kind,
  view,
  build,
  turnable,
  editing,
  adapter,
}: {
  org: Organisation;
  kind: ChartKind;
  view: string;
  /** Lays the records out at a size and routing; keep it stable with useCallback. */
  build: (route: RouteOptions) => ChartLayout;
  turnable: boolean;
  editing: boolean;
  adapter: (ctx: EditorContext) => ChartAdapter;
}) {
  const qc = useQueryClient();
  const stored = useChartDesign(org, kind);
  const history = useUndo();
  const design = stored.design;
  const [selection, setSelection] = useState<Selection>(NOTHING);
  const [popover, setPopover] = useState<{ at: Point; content: ReactNode } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fullScreen, setFullScreen] = useState(false);

  // Escape leaves full screen once nothing else is open to close.
  useEffect(() => {
    if (!fullScreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, .oc-popover")) return;
      if (document.querySelector("dialog[open], [data-radix-popper-content-wrapper]")) return;
      setFullScreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullScreen]);

  const direction = turnable ? design.direction : "down";
  const key = viewKey(view, direction);
  const layout = useMemo(
    () => arrange(build, design, view, turnable),
    [build, design, view, turnable],
  );
  const composition = useMemo(() => compose(layout, design, kind), [layout, design, kind]);
  const connector = routeOf(design.style).connector;
  const preview = useCallback(
    (placed: Record<string, Point>, sized: Record<string, { w: number; h: number }> = {}) =>
      compose(applyPositions(layout, placed, connector, direction, sized), design, kind),
    [layout, connector, direction, design, kind],
  );

  const refresh = useCallback(
    () => qc.invalidateQueries({ queryKey: organisationKey(org.clientId) }),
    [qc, org.clientId],
  );

  const change = useCallback(
    (op: DesignOp, label: string) => {
      const { before, after } = stored.apply(op);
      if (before === after) return;
      history.push({
        label,
        undo: () => void stored.apply(() => before),
        redo: () => void stored.apply(() => after),
      });
    },
    [stored, history],
  );

  const run = useCallback(
    async (work: () => Promise<Step | null>) => {
      setNotice(null);
      try {
        const step = await work();
        await refresh();
        if (step)
          history.push({
            label: step.label,
            undo: async () => {
              await step.undo();
              await refresh();
            },
            redo: async () => {
              await step.redo();
              await refresh();
            },
          });
        return true;
      } catch (cause) {
        setNotice(cause instanceof Error ? cause.message : "That change was not saved.");
        await refresh();
        return false;
      }
    },
    [refresh, history],
  );

  const ctx: EditorContext = {
    org,
    view,
    design,
    composition,
    open: (at, content) => setPopover({ at, content }),
    close: () => setPopover(null),
    run,
    change,
    place: (id, at) => void stored.apply(placeNodes(key, { [id]: at })),
    select: setSelection,
    notice: setNotice,
  };
  const a = adapter(ctx);

  const guarded = (step: () => Promise<unknown>) => async () => {
    try {
      await step();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "That could not be undone.");
      await refresh();
    }
  };
  const undo = guarded(history.undo);
  const redo = guarded(history.redo);

  // ⌘Z and ⇧⌘Z work anywhere on the page while drawing, not only when the
  // chart has focus: after a click in the Format panel, focus is in the panel.
  const shortcuts = useRef({ undo, redo });
  shortcuts.current = { undo, redo };
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true]")) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === "z" || key === "y") {
        e.preventDefault();
        if (key === "y" || e.shiftKey) void shortcuts.current.redo();
        else void shortcuts.current.undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing]);

  const placed = design.positions[key] ?? {};
  const hasPlacements = Object.keys(placed).some((id) => layout.nodes.some((n) => n.id === id));

  const deleteSelection = () => {
    if (selection.kind === "container") {
      change(removeContainer(selection.id), "Remove container");
      setSelection(NOTHING);
    } else if (selection.kind === "note") {
      change(removeNote(selection.id), "Delete note");
      setSelection(NOTHING);
    } else a.remove(selection);
  };

  const editor: ChartEditor | undefined = editing
    ? {
        selection,
        onSelection: (next) => {
          setSelection(next);
          setPopover(null);
        },
        direction,
        onConnect: a.connect,
        onQuickAdd: a.quickAdd,
        onCreateAt: a.createAt,
        onRename: a.rename,
        onMoveNote: (id, at) => change(updateNote(id, { x: at.x, y: at.y }), "Move note"),
        onResize: (id, rect) =>
          change(
            (d) =>
              formatNodes([id], { w: rect.w, h: rect.h })(
                placeNodes(key, { [id]: { x: rect.x, y: rect.y } })(d),
              ),
            "Resize box",
          ),
        onDelete: deleteSelection,
        onNudge: (dx, dy) => {
          if (selection.kind !== "nodes") return;
          const moved: Record<string, Point> = {};
          for (const id of selection.ids) {
            const n = composition.nodes.find((x) => x.id === id);
            if (n) moved[id] = { x: n.x + dx, y: n.y + dy };
          }
          change(placeNodes(key, moved), "Nudge");
        },
        onUndo: () => void undo(),
        onRedo: () => void redo(),
        popover,
        onClosePopover: () => setPopover(null),
        quickLabels: a.quickLabels,
      }
    : undefined;

  const canvasProps = {
    composition,
    preview,
    onPlace: (moved: Record<string, Point>) =>
      change(placeNodes(key, moved), Object.keys(moved).length > 1 ? "Move boxes" : "Move box"),
    onSnapBack: () => change(snapBack(key), "Snap back"),
    arranged: hasPlacements,
    editor,
    fullScreen,
    onToggleFullScreen: () => setFullScreen((v) => !v),
  };

  const selectedIds = selection.kind === "nodes" ? selection.ids : [];
  const containerOf = (id: string) => design.containers.find((c) => c.members.includes(id));
  const nextColour = (): ContainerColour => {
    const order = Object.keys(CONTAINER_COLOURS) as ContainerColour[];
    return order[design.containers.length % order.length]!;
  };
  const group = () => {
    if (!selectedIds.length) return;
    const made = groupNodes(selectedIds, "Group", nextColour());
    change(made.op, "Group boxes");
    setSelection({ kind: "container", id: made.id });
  };
  const ungroup = () => {
    if (selection.kind === "container") {
      change(removeContainer(selection.id), "Remove container");
      setSelection(NOTHING);
    } else if (selectedIds.some((id) => containerOf(id)))
      change(setMembership(selectedIds, null), "Take out of container");
  };
  const newNote = () => {
    const made = addNote(noteText, { x: 24, y: Math.max(24, composition.height - 8) });
    change(made.op, "Add note");
    setSelection({ kind: "note", id: made.id });
  };

  const [adding, setAdding] = useState(false);
  const toolbar = editing ? (
    <div className="oe-toolbar" role="toolbar" aria-label="Chart editing">
      <div className="oe-tools">
        <button
          type="button"
          onClick={() => void undo()}
          disabled={!history.canUndo || history.busy}
          title={history.undoLabel ? `Undo ${history.undoLabel}` : "Undo"}
        >
          ↶ Undo
        </button>
        <button
          type="button"
          onClick={() => void redo()}
          disabled={!history.canRedo || history.busy}
          title={history.redoLabel ? `Redo ${history.redoLabel}` : "Redo"}
        >
          ↷ Redo
        </button>
      </div>
      <div className="oe-tools">
        <div className="oc-menu">
          <button type="button" onClick={() => setAdding((v) => !v)} aria-expanded={adding}>
            + Add ▾
          </button>
          {adding && (
            <div className="oc-menu-list" role="menu" style={{ left: 0, right: "auto" }}>
              {a.addItems.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setAdding(false);
                    item.open({ x: 32, y: 32 });
                  }}
                >
                  {item.label}
                </button>
              ))}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setAdding(false);
                  newNote();
                }}
              >
                Note
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={group}
          disabled={!selectedIds.length}
          title="Put the selected boxes in a container"
        >
          Group
        </button>
        <button
          type="button"
          onClick={ungroup}
          disabled={!(selection.kind === "container" || selectedIds.some((id) => containerOf(id)))}
          title="Remove the container, or take the selected boxes out of theirs"
        >
          Ungroup
        </button>
      </div>
      {turnable && (
        <div className="oe-tools">
          <span className="oe-tools-label">Direction</span>
          <Choice
            label="Direction"
            value={design.direction}
            onChange={(d) =>
              change(setDirection(d), d === "right" ? "Read left to right" : "Read top to bottom")
            }
            options={[
              { id: "down", label: "Top down" },
              { id: "right", label: "Left to right" },
            ]}
          />
        </div>
      )}
      <div className="oe-tools">
        <span className="oe-tools-label">Cards</span>
        <Choice
          label="Card width"
          value={design.width}
          onChange={(w) => change(setWidth(w), w === "wide" ? "Wide cards" : "Standard cards")}
          options={[
            { id: "standard", label: "Standard" },
            { id: "wide", label: "Wide" },
          ]}
        />
      </div>
      <div className="oe-tools">
        <label className="oe-check">
          <input
            type="checkbox"
            checked={design.legend.show}
            onChange={(e) =>
              change(
                setLegend({ show: e.target.checked }),
                e.target.checked ? "Show legend" : "Hide legend",
              )
            }
          />
          Legend
        </label>
        <ChartStyleMenu
          style={design.style}
          onChange={(patch) => change(setStyle(patch), "Change chart style")}
          onReset={() => change(setStyle(DEFAULT_STYLE), "Reset chart style")}
          ownership={kind === "ownership"}
        />
      </div>
      <span className={`oe-save is-${stored.state}`} role="status">
        {stored.state === "saving" ? (
          "Saving…"
        ) : stored.state === "error" ? (
          <>
            Not saved ·{" "}
            <button type="button" onClick={stored.retry}>
              Retry
            </button>
          </>
        ) : (
          "Saved for the firm"
        )}
      </span>
    </div>
  ) : null;

  const panel = editing ? (
    <FormatPanel
      direction={direction}
      place={(moved, label) => change(placeNodes(key, moved), label)}
      kind={kind}
      design={design}
      composition={composition}
      selection={selection}
      adapter={a}
      change={change}
      select={setSelection}
      onDelete={deleteSelection}
      onGroup={group}
    />
  ) : null;

  return {
    design,
    ready: stored.ready,
    loadError: stored.loadError,
    saveError: stored.error,
    composition,
    layout,
    canvasProps,
    toolbar,
    panel,
    notice,
    setNotice,
    selection,
    setSelection,
    change,
    fullScreen,
  };
}

/* ------------------------------------------------------------ the panel */

function FormatPanel({
  direction,
  place,
  kind,
  design,
  composition,
  selection,
  adapter,
  change,
  select,
  onDelete,
  onGroup,
}: {
  direction: Direction;
  place: (moved: Record<string, Point>, label: string) => void;
  kind: ChartKind;
  design: ChartDesign;
  composition: Composition;
  selection: Selection;
  adapter: ChartAdapter;
  change: (op: DesignOp, label: string) => void;
  select: (s: Selection) => void;
  onDelete: () => void;
  onGroup: () => void;
}) {
  const boxOf = (id: string): Box | null => composition.nodes.find((n) => n.id === id) ?? null;
  if (selection.kind === "nodes") {
    const ids = selection.ids.filter((id) => composition.nodes.some((n) => n.id === id));
    if (!ids.length)
      return (
        <ChartPanel
          kind={kind}
          design={design}
          composition={composition}
          adapter={adapter}
          change={change}
        />
      );
    const one = ids.length === 1 ? ids[0]! : null;
    const f = one ? (design.nodes[one] ?? {}) : {};
    const node = one ? composition.nodes.find((n) => n.id === one) : null;
    const shared = <K extends "fill" | "edge" | "border">(k: K) => {
      const values = new Set(ids.map((id) => design.nodes[id]?.[k]));
      return values.size === 1 ? [...values][0] : undefined;
    };
    const set = (patch: Parameters<typeof formatNodes>[1], label: string) =>
      change(formatNodes(ids, patch), label);
    const container = one ? design.containers.find((c) => c.members.includes(one)) : undefined;
    return (
      <div className="oe-panel">
        <header className="oe-panel-head">
          <span className="oe-eyebrow">{one ? "Box" : "Boxes"}</span>
          <h3>{one ? adapter.nodeTitle(one) : `${ids.length} boxes selected`}</h3>
        </header>
        <div className="oe-actions">{adapter.nodeActions(ids)}</div>
        <ArrangeSection
          ids={ids}
          direction={direction}
          composition={composition}
          boxOf={boxOf}
          place={place}
        />
        <Section title="Fill">
          <Swatches
            label="Fill"
            colours={FILLS}
            value={shared("fill")}
            custom
            onChange={(fill) => set({ fill }, "Colour box")}
          />
        </Section>
        <Section title="Outline">
          <Swatches
            label="Outline colour"
            colours={[...LINE_COLOURS, { hex: "#FFFFFF", name: "White" }]}
            value={shared("edge")}
            onChange={(edge) => set({ edge }, "Change outline")}
          />
          <Choice
            label="Border"
            value={shared("border")}
            onChange={(border) =>
              set({ border }, border === "dashed" ? "Dashed border" : "Solid border")
            }
            options={[
              { id: "solid", label: "Solid" },
              { id: "dashed", label: "Dashed" },
            ]}
          />
        </Section>
        <Section title="Size">
          <div className="oe-size">
            {(["w", "h"] as const).map((k) => {
              const values = new Set(ids.map((id) => design.nodes[id]?.[k]));
              const own = values.size === 1 ? [...values][0] : undefined;
              const drawn = composition.nodes.find((n) => n.id === ids[0]);
              const [min, max] =
                k === "w" ? [BOX_LIMITS.minW, BOX_LIMITS.maxW] : [BOX_LIMITS.minH, BOX_LIMITS.maxH];
              return (
                <CommitInput
                  key={k}
                  label={k === "w" ? "Width" : "Height"}
                  value={own ? String(own) : ""}
                  placeholder={drawn ? String(Math.round(k === "w" ? drawn.w : drawn.h)) : ""}
                  onCommit={(text) => {
                    const n = Number(text.trim());
                    if (!text.trim())
                      return change(formatNodes(ids, { [k]: undefined }), "Reset size");
                    if (!Number.isFinite(n)) return;
                    const v = Math.round(Math.min(max, Math.max(min, n)));
                    change(
                      formatNodes(ids, { [k]: v }),
                      ids.length > 1 ? "Size boxes" : "Size box",
                    );
                  }}
                />
              );
            })}
          </div>
          <p className="oe-hint">
            Drag a corner of the box, or type a size
            {ids.length > 1 ? " for all selected boxes" : ""}.{" "}
            <button
              type="button"
              className="org-link"
              onClick={() => change(formatNodes(ids, { w: undefined, h: undefined }), "Reset size")}
            >
              Reset size
            </button>
          </p>
        </Section>
        {one && node && (
          <Section title="Text on the box">
            <CommitInput
              label="Line above the name"
              value={f.eyebrow ?? ""}
              placeholder="e.g. Ultimate beneficial owner"
              onCommit={(eyebrow) => set({ eyebrow }, "Change line above name")}
            />
            <CommitInput
              label="Line under the name"
              value={f.subtitle ?? ""}
              placeholder={node.subtitle || "e.g. Dubai, UAE"}
              onCommit={(subtitle) => set({ subtitle }, "Change line under name")}
            />
            <CommitInput
              label="Note (italic)"
              value={f.note ?? ""}
              placeholder="e.g. (Advisory business)"
              onCommit={(note) => set({ note }, "Change note")}
            />
            <CommitInput
              label="Tag"
              value={f.tag ?? ""}
              placeholder="e.g. NEW"
              onCommit={(tag) => set({ tag }, "Change tag")}
            />
          </Section>
        )}
        <Section title="Container">
          {design.containers.length ? (
            <select
              className="oe-select"
              aria-label="Container"
              value={
                container?.id ??
                (ids.every((id) => !design.containers.some((c) => c.members.includes(id)))
                  ? ""
                  : "mixed")
              }
              onChange={(e) =>
                e.target.value === "new"
                  ? onGroup()
                  : change(
                      setMembership(ids, e.target.value || null),
                      e.target.value ? "Move into container" : "Take out of container",
                    )
              }
            >
              <option value="">No container</option>
              {!one && (
                <option value="mixed" disabled>
                  Several
                </option>
              )}
              {design.containers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label || "Group"}
                </option>
              ))}
              <option value="new">New container with {one ? "this box" : "these boxes"}</option>
            </select>
          ) : (
            <Button onClick={onGroup}>Put in a new container</Button>
          )}
        </Section>
        <div className="oe-foot">
          <button
            type="button"
            className="org-link"
            onClick={() =>
              change(
                formatNodes(ids, {
                  fill: undefined,
                  edge: undefined,
                  border: undefined,
                  eyebrow: undefined,
                  subtitle: undefined,
                  note: undefined,
                  tag: undefined,
                }),
                "Clear formatting",
              )
            }
          >
            Clear formatting
          </button>
        </div>
      </div>
    );
  }

  if (selection.kind === "edge") {
    const id = selection.id;
    const edge = composition.edges.find((e) => e.id === id);
    if (!edge)
      return (
        <ChartPanel
          kind={kind}
          design={design}
          composition={composition}
          adapter={adapter}
          change={change}
        />
      );
    const f = design.edges[id] ?? {};
    const set = (patch: Parameters<typeof formatEdges>[1], label: string) =>
      change(formatEdges([id], patch), label);
    const meaningful = edge.style !== "solid";
    return (
      <div className="oe-panel">
        <header className="oe-panel-head">
          <span className="oe-eyebrow">Line</span>
          <h3>{adapter.edgeTitle(id)}</h3>
        </header>
        {adapter.edgeFields(id)}
        <Section title="Arrange">
          <div className="oe-arrange">
            <button
              type="button"
              className="is-wide"
              onClick={() => {
                const from = boxOf(edge.from);
                const to = boxOf(edge.to);
                if (from && to)
                  place({ [to.id]: inLineWith(from, to, direction) }, "Straighten line");
              }}
              title={
                direction === "right"
                  ? "Move the box it leads to level with where the line starts"
                  : "Move the box it leads to directly under where the line starts"
              }
            >
              Straighten this line
            </button>
          </div>
        </Section>
        <Section title="Label">
          <CommitInput
            label="Text on the line"
            value={f.label ?? ""}
            placeholder={edge.label || "e.g. DK + partners"}
            onCommit={(label) => set({ label }, "Change line label")}
          />
        </Section>
        <Section title="Line">
          {meaningful ? (
            <p className="oe-hint">
              {edge.style === "dotted"
                ? "A functional line is always dotted."
                : edge.style === "added"
                  ? "Added under the planned structure: drawn dashed."
                  : "Removed under the planned structure: drawn in red."}
            </p>
          ) : (
            <>
              <Choice
                label="Line style"
                value={f.line ?? "solid"}
                onChange={(line) =>
                  set(
                    { line: line === "solid" ? undefined : line },
                    line === "dashed" ? "Dashed line" : "Solid line",
                  )
                }
                options={[
                  { id: "solid", label: "Solid" },
                  { id: "dashed", label: "Dashed" },
                ]}
              />
              <Swatches
                label="Line colour"
                colours={LINE_COLOURS}
                value={f.colour}
                onChange={(colour) => set({ colour }, "Line colour")}
              />
            </>
          )}
          <Choice
            label="Arrowhead"
            value={f.arrow ?? "default"}
            onChange={(arrow) =>
              set({ arrow: arrow === "default" ? undefined : arrow }, "Arrowhead")
            }
            options={[
              { id: "default", label: "Chart default" },
              { id: "on", label: "Arrow" },
              { id: "off", label: "None" },
            ]}
          />
        </Section>
        <div className="oe-foot">
          <Button variant="quiet" onClick={onDelete}>
            {kind === "ownership" ? "Remove shareholding" : "Remove line"}
          </Button>
        </div>
      </div>
    );
  }

  if (selection.kind === "container") {
    const c = design.containers.find((x) => x.id === selection.id);
    if (!c)
      return (
        <ChartPanel
          kind={kind}
          design={design}
          composition={composition}
          adapter={adapter}
          change={change}
        />
      );
    const colours = (Object.keys(CONTAINER_COLOURS) as ContainerColour[]).map((k) => ({
      hex: CONTAINER_COLOURS[k].fill,
      name: CONTAINER_COLOURS[k].name,
      key: k,
    }));
    return (
      <div className="oe-panel">
        <header className="oe-panel-head">
          <span className="oe-eyebrow">Container</span>
          <h3>{c.label || "Group"}</h3>
        </header>
        <Section title="Label">
          <CommitInput
            label="Label"
            value={c.label}
            placeholder="e.g. Dubai entities"
            autoFocus={c.label === "Group"}
            onCommit={(label) => change(updateContainer(c.id, { label }), "Rename container")}
          />
        </Section>
        <Section title="Colour">
          <Swatches
            label="Container colour"
            allowDefault={false}
            colours={colours}
            value={CONTAINER_COLOURS[c.colour].fill}
            onChange={(hex) => {
              const picked = colours.find((x) => x.hex === hex);
              if (picked) change(updateContainer(c.id, { colour: picked.key }), "Container colour");
            }}
          />
        </Section>
        <p className="oe-hint">
          Holds {c.members.length} {c.members.length === 1 ? "box" : "boxes"}. Drag the container to
          move them together.
        </p>
        <div className="oe-foot">
          <button
            type="button"
            className="org-link"
            onClick={() => select({ kind: "nodes", ids: c.members })}
          >
            Select its boxes
          </button>
          <Button variant="quiet" onClick={onDelete}>
            Remove container
          </Button>
        </div>
      </div>
    );
  }

  if (selection.kind === "note") {
    const note = design.notes.find((n) => n.id === selection.id);
    if (!note)
      return (
        <ChartPanel
          kind={kind}
          design={design}
          composition={composition}
          adapter={adapter}
          change={change}
        />
      );
    return (
      <div className="oe-panel">
        <header className="oe-panel-head">
          <span className="oe-eyebrow">Note</span>
          <h3>Free text on the chart</h3>
        </header>
        <CommitInput
          multiline
          label="Text"
          value={note.text}
          autoFocus={note.text === noteText}
          onCommit={(text) => change(updateNote(note.id, { text }), "Edit note")}
        />
        <p className="oe-hint">
          Drag the note to place it. It is drawing only: it records nothing about the client.
        </p>
        <div className="oe-foot">
          <Button variant="quiet" onClick={onDelete}>
            Delete note
          </Button>
        </div>
      </div>
    );
  }

  return (
    <ChartPanel
      kind={kind}
      design={design}
      composition={composition}
      adapter={adapter}
      change={change}
    />
  );
}

function ChartPanel({
  kind,
  design,
  composition,
  adapter,
  change,
}: {
  kind: ChartKind;
  design: ChartDesign;
  composition: Composition;
  adapter: ChartAdapter;
  change: (op: DesignOp, label: string) => void;
}) {
  const items = legendItems(composition.nodes, composition.edges, design, kind, true);
  return (
    <div className="oe-panel">
      <header className="oe-panel-head">
        <span className="oe-eyebrow">Drawing the chart</span>
        <h3>{kind === "ownership" ? "Group structure" : "Organogram"}</h3>
      </header>
      <ul className="oe-howto">
        {adapter.howTo.map((line) => (
          <li key={line}>{line}</li>
        ))}
        <li>
          Click a box to colour it, add text or put it in a container. Shift-click or shift-drag to
          select several.
        </li>
        <li>
          Click a line, or its share where lines overlap, to change its label, style or colour, or
          to straighten it.
        </li>
        <li>
          Dragged boxes snap into line with a pink guide; hold Alt to place freely, or nudge with
          the arrow keys. ⌘Z undoes, ⇧⌘Z redoes. Delete removes what is selected.
        </li>
      </ul>
      <Section title="Legend">
        <label className="oe-check">
          <input
            type="checkbox"
            checked={design.legend.show}
            onChange={(e) =>
              change(
                setLegend({ show: e.target.checked }),
                e.target.checked ? "Show legend" : "Hide legend",
              )
            }
          />
          Show a legend on the chart
        </label>
        {design.legend.show &&
          (items.length ? (
            <ul className="oe-legend-list">
              {items.map((item) => {
                const shown = !design.legend.hidden.includes(item.key);
                return (
                  <li key={item.key}>
                    <input
                      type="checkbox"
                      checked={shown}
                      aria-label={`Show ${item.label}`}
                      onChange={(e) =>
                        change(
                          toggleLegendItem(item.key, e.target.checked),
                          e.target.checked ? "Show in legend" : "Hide from legend",
                        )
                      }
                    />
                    <span
                      className={`oe-legend-swatch is-${item.shape}`}
                      style={
                        item.shape === "line"
                          ? {
                              borderTopColor: item.stroke,
                              borderTopStyle:
                                item.dash === "dashed"
                                  ? "dashed"
                                  : item.dash === "dotted"
                                    ? "dotted"
                                    : "solid",
                            }
                          : {
                              background: item.fill,
                              borderColor: item.stroke,
                              borderStyle: item.dash === "dashed" ? "dashed" : "solid",
                            }
                      }
                    />
                    <CommitInput
                      label={`Legend label for ${item.label}`}
                      value={design.legend.labels[item.key] ?? ""}
                      placeholder={item.label}
                      onCommit={(label) =>
                        change(setLegendLabel(item.key, label), "Change legend label")
                      }
                    />
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="oe-hint">
              Colour a box, dash a line or add a container, and it appears here to be named.
            </p>
          ))}
      </Section>
    </div>
  );
}

/** Lining boxes up exactly, so lines run straight and forks are even. */
function ArrangeSection({
  ids,
  direction,
  composition,
  boxOf,
  place,
}: {
  ids: string[];
  direction: Direction;
  composition: Composition;
  boxOf: (id: string) => Box | null;
  place: (moved: Record<string, Point>, label: string) => void;
}) {
  const boxes = ids.map(boxOf).filter((b): b is Box => !!b);
  if (boxes.length > 1) {
    const aligned = (how: Alignment, label: string) => place(align(boxes, how), label);
    return (
      <Section title="Arrange">
        <div className="oe-arrange" role="group" aria-label="Align">
          <button type="button" onClick={() => aligned("left", "Align left")}>
            Left
          </button>
          <button type="button" onClick={() => aligned("centre", "Align centres")}>
            Centre
          </button>
          <button type="button" onClick={() => aligned("right", "Align right")}>
            Right
          </button>
          <button type="button" onClick={() => aligned("top", "Align tops")}>
            Top
          </button>
          <button type="button" onClick={() => aligned("middle", "Align middles")}>
            Middle
          </button>
          <button type="button" onClick={() => aligned("bottom", "Align bottoms")}>
            Bottom
          </button>
          <button
            type="button"
            className="is-wide"
            disabled={boxes.length < 3}
            onClick={() => place(distribute(boxes, "across"), "Space evenly across")}
          >
            Space evenly across
          </button>
          <button
            type="button"
            className="is-wide"
            disabled={boxes.length < 3}
            onClick={() => place(distribute(boxes, "down"), "Space evenly down")}
          >
            Space evenly down
          </button>
        </div>
        <p className="oe-hint">
          Spacing needs three or more boxes. Dragging a box snaps it into line; hold Alt to place it
          freely, or use the arrow keys.
        </p>
      </Section>
    );
  }
  const box = boxes[0];
  if (!box) return null;
  const into = composition.edges.filter((e) => e.to === box.id && e.style !== "dotted");
  const out = composition.edges.filter((e) => e.from === box.id && e.style !== "dotted");
  const above = into.map((e) => boxOf(e.from)).find((b): b is Box => !!b);
  const holders = into.map((e) => boxOf(e.from)).filter((b): b is Box => !!b);
  const below = out.map((e) => boxOf(e.to)).filter((b): b is Box => !!b);
  return (
    <Section title="Arrange">
      <div className="oe-arrange">
        <button
          type="button"
          className="is-wide"
          disabled={!above}
          onClick={() => above && place({ [box.id]: inLineWith(above, box, direction) }, "Line up")}
        >
          {direction === "right" ? "Line up with the box before it" : "Line up under the box above"}
        </button>
        <button
          type="button"
          className="is-wide"
          disabled={!below.length}
          onClick={() =>
            place({ [box.id]: centredOver(box, below, direction) }, "Centre over its boxes")
          }
        >
          {direction === "right"
            ? "Centre beside the boxes it leads to"
            : "Centre over the boxes it leads to"}
        </button>
        <button
          type="button"
          className="is-wide"
          disabled={holders.length < 2}
          onClick={() =>
            place(
              { [box.id]: centredOver(box, holders, direction) },
              "Centre on the boxes leading to it",
            )
          }
        >
          {direction === "right"
            ? "Centre beside the boxes leading to it"
            : "Centre under the boxes leading to it"}
        </button>
        <button
          type="button"
          className="is-wide"
          disabled={below.length < 3}
          onClick={() => {
            const spaced = distribute(below, direction === "right" ? "down" : "across");
            const centre = centredOver(
              box,
              below.map((b) => ({ ...b, ...spaced[b.id] })),
              direction,
            );
            place({ ...spaced, [box.id]: centre }, "Even out the fork");
          }}
        >
          Space the boxes it leads to evenly
        </button>
      </div>
    </Section>
  );
}
