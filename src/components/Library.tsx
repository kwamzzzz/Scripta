import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import {
  Archive,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Columns3,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { scriptaTheme } from "@/lib/tokens";
import ActionMenu from "@/components/ActionMenu";
import { Button } from "@/components/primitives";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import ResizableSplitPane from "@/components/ResizableSplitPane";
import { ColumnResizer } from "@/components/ColumnResizer";
import { useColumnWidths } from "@/lib/column-widths";
import { usePersisted } from "@/lib/use-board";
import { purgeExpired } from "@/lib/trash";

import "./library.css";

export type LibColumn<T> = {
  key: string;
  label: string;
  width?: number;
  render: (row: T) => ReactNode;
  value?: (row: T) => string | number;
  defaultOff?: boolean;
};

export type LibView<T> = { key: string; label: string; filter: (row: T) => boolean };
export type LibAction<T> = { label: string; onClick: (row: T) => void; danger?: boolean };
export type LibBulk<T> = { label: string; onClick: (rows: T[]) => void; danger?: boolean };

export type ViewMode = "table" | "board" | "cards";

/**
 * A way of splitting the list into headed sections. `value` names the section
 * a row falls in, or the several it falls in (a source with three topics is
 * listed under each); a blank value lands in `none`, which always comes last.
 * `order` lists the sections in their natural order where the alphabet is
 * wrong (priority, due state); anything it leaves out follows alphabetically.
 */
export type LibGroup<T> = {
  key: string;
  label: string;
  value: (row: T) => string | string[];
  none: string;
  order?: string[];
};

export type LibraryProps<T extends { id: string }> = {
  /**
   * Where this collection's per-person preferences live — the view it opens
   * on, the mode, the sort, the hidden columns. Not the same thing as
   * AppShell's `section`, which is a typed SectionKey naming a place in the
   * navigation. The two sat side by side on every screen under one word and
   * disagreed on most of them: Precedents was `knowledge` to the shell and
   * `precedents` here.
   */
  storageKey: string;
  /** The view this section is most useful in before anyone chooses. */
  defaultMode?: ViewMode;
  /**
   * The views this collection offers at all.
   *
   * A screen whose meaning IS one view says so here, and the switcher goes with
   * it. Flow is a board: its columns are execution states, its cards carry
   * progress, and a table of the same rows is a different product wearing the
   * same data. Offering a view because the component supports it is how two
   * screens come to look like each other.
   */
  modes?: ViewMode[] | undefined;
  /** Scopes a screen's own board and card styling without forking this. */
  className?: string | undefined;
  title?: string;
  description?: string;
  beforeToolbar?: ReactNode;
  rows: T[];
  columns: LibColumn<T>[];
  views?: LibView<T>[];
  /**
   * Hands the views to the screen. A section that shows them in its panel —
   * the second navigation column beside the rail — passes the chosen one in
   * and takes the changes back, and the row of view buttons above the table
   * goes away, because the same choice in two places is one place too many.
   */
  view?: string | undefined;
  onViewChange?: ((key: string) => void) | undefined;
  searchText: (row: T) => string;
  searchPlaceholder?: string;
  rowLabel?: (row: T) => string;
  onOpen: (row: T) => void;
  /**
   * The one action that puts something in this collection. It sits in the same
   * place on every screen, and it is named "New <thing>" — the exception being
   * where the button does something other than create, in which case it says
   * what it actually does rather than what the collection contains.
   *
   * What happens after the click is deliberately not standardised, because it
   * depends on whether the record can exist yet. A task needs only a name, so
   * it is typed straight into the toolbar. A matter needs a client and a
   * counterparty before it means anything, so it opens an intake. A document
   * arrives by upload. Forcing one flow on all three would make two of them
   * worse.
   */
  primary?: { label: string; onClick: () => void } | undefined;
  secondary?: { label: string; onClick: () => void } | undefined;
  actions?: (row: T) => LibAction<T>[];
  /**
   * Actions on a selection. A function of the view, because the same word
   * means different things in different ones: "Restore" un-archives in
   * Archived and recovers from the bin in Recently Deleted, and "Delete"
   * would otherwise re-bin a binned row and silently reset its fifteen days.
   */
  bulk?: LibBulk<T>[] | ((view: string) => LibBulk<T>[]);
  detail: (row: T) => ReactNode;
  board?: { columns: string[]; column: (row: T) => string; card: (row: T) => ReactNode };
  cards?: (row: T) => ReactNode;
  /**
   * Optional ways to group the table and cards. Off until someone chooses one,
   * and remembered per person like the view and the sort. The board is left
   * alone: its columns are already a grouping.
   */
  groups?: LibGroup<T>[];
  empty?: ReactNode;
};

/** The row's menu is the shared one, bound to this row. */
function RowActions<T>({
  row,
  label,
  actions,
}: {
  row: T;
  label: string;
  actions: LibAction<T>[];
}) {
  return (
    <ActionMenu
      label={label}
      actions={actions.map((action) => ({
        label: action.label,
        danger: action.danger,
        onClick: () => action.onClick(row),
      }))}
    />
  );
}

export default function Library<T extends { id: string }>(props: LibraryProps<T>) {
  const {
    storageKey,
    defaultMode = "table",
    modes: allowed,
    className,
    title,
    beforeToolbar,
    description,
    rows,
    columns,
    views = [],
    view: controlledView,
    onViewChange,
    searchText,
    searchPlaceholder = "Search",
    rowLabel = (row) => String(columns[0]?.value?.(row) ?? row.id),
    onOpen,
    primary,
    secondary,
    actions,
    bulk = [],
    detail,
    board,
    cards,
    groups = [],
    empty,
  } = props;

  const [mode, setMode] = usePersisted<ViewMode>(`px.lib.${storageKey}.mode`, defaultMode);
  const [hidden, setHidden] = usePersisted<string[]>(
    `px.lib.${storageKey}.hidden`,
    columns.filter((c) => c.defaultOff).map((c) => c.key),
  );
  const [ownView, setOwnView] = usePersisted(`px.lib.${storageKey}.view`, views[0]?.key ?? "All");
  const view = controlledView ?? ownView;
  const setView = onViewChange ?? setOwnView;
  /* Drawn here only when nobody else is drawing them. */
  const showViewRow = controlledView === undefined;
  const [term, setTerm] = usePersisted(`px.lib.${storageKey}.term`, "");
  const [sort, setSort] = usePersisted<{ key: string; dir: 1 | -1 } | null>(
    `px.lib.${storageKey}.sort`,
    null,
  );
  const [groupKey, setGroupKey] = usePersisted(`px.lib.${storageKey}.group`, "");
  const [folded, setFolded] = useState<string[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  /** What a bulk action means depends on which view you are standing in. */
  const bulkFor = typeof bulk === "function" ? bulk(view) : bulk;
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [pickCols, setPickCols] = useState(false);

  /**
   * Recently Deleted is the one view whose contents expire, so opening it
   * clears whatever has run out of time — the fifteen days hold whether or not
   * anything is scheduled on the database. Once per selection, not per render,
   * and a refusal is swallowed: the rows on screen are right either way.
   */
  useEffect(() => {
    if (view === "Deleted") void purgeExpired().catch(() => {});
  }, [view]);

  const shown = columns.filter((c) => !hidden.includes(c.key));
  /* A column can only be sorted by if it says what its rows are worth. */
  const sortable = columns.filter((c) => c.value);
  const filtered = useMemo(() => {
    const v = views.find((x) => x.key === view);
    const t = term.trim().toLowerCase();
    let out = rows;
    if (v) out = out.filter(v.filter);
    if (t) out = out.filter((r) => searchText(r).toLowerCase().includes(t));
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      const val = col?.value ?? (() => "");
      out = [...out].sort((a, b) => {
        const av = val(a);
        const bv = val(b);
        if (av === bv) return 0;
        return (av > bv ? 1 : -1) * sort.dir;
      });
    }
    return out;
  }, [rows, views, view, term, sort, columns, searchText]);

  /**
   * Archived and Recently Deleted are not ways of looking at the collection;
   * they are where a row goes when it leaves it. Sitting in the views row
   * dressed exactly like the filters, they were invisible: the delete dialog
   * promises that a draft "goes to Recently Deleted", and then there was no
   * place on screen that looked like somewhere a thing could have gone. They
   * are set apart at the end of the row, and marked.
   *
   * Recognised by key, the same way the purge above knows "Deleted": every
   * screen already names these two views identically.
   */
  const filterViews = views.filter((v) => v.key !== "Archived" && v.key !== "Deleted");
  const placeViews = views.filter((v) => v.key === "Archived" || v.key === "Deleted");
  const viewButton = (v: LibView<T>, icon?: ReactNode) => (
    <button
      type="button"
      key={v.key}
      className="scripta-chip"
      aria-pressed={view === v.key}
      onClick={() => setView(v.key)}
    >
      {icon}
      {v.label}
      <span>{rows.filter(v.filter).length}</span>
    </button>
  );

  const group = groups.find((g) => g.key === groupKey) ?? null;
  /** The filtered rows in headed sections, or one unheaded section. */
  const sections = useMemo(() => {
    if (!group) return [{ name: "", rows: filtered }];
    const by = new Map<string, T[]>();
    for (const r of filtered) {
      const value = group.value(r);
      const names = (Array.isArray(value) ? value : [value]).map((v) => v.trim()).filter(Boolean);
      for (const name of names.length ? [...new Set(names)] : [group.none])
        by.set(name, [...(by.get(name) ?? []), r]);
    }
    const rank = (name: string) => {
      if (name === group.none) return Number.MAX_SAFE_INTEGER;
      const i = group.order?.indexOf(name) ?? -1;
      return i === -1 ? Number.MAX_SAFE_INTEGER - 1 : i;
    };
    return [...by.entries()]
      .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
      .map(([name, list]) => ({ name, rows: list }));
  }, [filtered, group]);
  const toggleFold = (name: string) =>
    setFolded((f) => (f.includes(name) ? f.filter((x) => x !== name) : [...f, name]));
  const sectionHead = (name: string, count: number) => (
    <button
      type="button"
      className="scripta-library-group-head"
      aria-expanded={!folded.includes(name)}
      onClick={() => toggleFold(name)}
    >
      <ChevronDown size={14} aria-hidden="true" />
      {name}
      <span>{count}</span>
    </button>
  );

  const selected = filtered.filter((r) => sel.includes(r.id));
  const detailRow = openRow ? rows.find((r) => r.id === openRow) : null;

  /** Selecting a card or board tile, without swallowing its own controls. */
  const choose = (event: MouseEvent, row: T) => {
    if (
      event.target instanceof Element &&
      event.target.closest("button, a, input, select, textarea")
    )
      return;
    setOpenRow(row.id);
  };
  const modes =
    allowed ?? (["table", ...(board ? ["board"] : []), ...(cards ? ["cards"] : [])] as ViewMode[]);
  const activeMode = modes.includes(mode) ? mode : defaultMode;
  // Each reader sizes the columns for themselves; the widths are remembered.
  const {
    widthOf,
    setWidth,
    pinWidths,
    widths: chosenWidths,
  } = useColumnWidths(`lib.${storageKey}`);
  // Once a reader has sized a column the table is exactly as wide as its
  // columns; until then it stretches them to fill the space, as before.
  const sized = shown.some((c) => chosenWidths[c.key] !== undefined);
  /** As a drag begins, pin every column at the width it is drawn at. */
  const pinDrawn = (row: HTMLTableRowElement, key: string) => {
    const cells = Array.from(row.children) as HTMLElement[];
    const drawn: Record<string, number> = {};
    shown.forEach((c, i) => {
      // The first cell is the selection column.
      const cell = cells[i + 1];
      // offsetWidth: layout pixels, unaffected by any scaling the shell applies.
      if (cell) drawn[c.key] = cell.offsetWidth;
    });
    pinWidths(drawn);
    return drawn[key];
  };
  const colWidth = (c: LibColumn<T>) => widthOf(c.key, c.width ?? 280);
  const tableWidth = 44 + 56 + shown.reduce((n, c) => n + colWidth(c), 0);

  return (
    <ResizableSplitPane
      className={`scripta-library${className ? ` ${className}` : ""}`}
      storageKey={`px.library.${storageKey}.detail.width`}
      defaultSize={320}
      minSize={280}
      maxSize={560}
      minPrimarySize={480}
      compactAt={760}
      label={`Resize ${storageKey} detail panel`}
      primary={
        <div className="scripta-library-inner">
          {title && (
            <header className="scripta-library-heading">
              <div>
                <h1 className="scripta-page-title">{title}</h1>
                {description && <p className="scripta-page-description">{description}</p>}
              </div>
              <div className="scripta-library-primary-actions">
                {secondary && <Button onClick={secondary.onClick}>{secondary.label}</Button>}
                {primary && (
                  <Button variant="primary" onClick={primary.onClick}>
                    {primary.label}
                  </Button>
                )}
              </div>
            </header>
          )}

          {beforeToolbar}
          <div className="scripta-library-toolbar">
            {!title && (
              <div className="scripta-library-primary-actions">
                {primary && (
                  <Button variant="primary" onClick={primary.onClick}>
                    {primary.label}
                  </Button>
                )}
                {secondary && <Button onClick={secondary.onClick}>{secondary.label}</Button>}
              </div>
            )}
            <div className="scripta-library-search">
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                aria-label={searchPlaceholder}
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder={searchPlaceholder}
              />
              {term && (
                <button type="button" aria-label="Clear search" onClick={() => setTerm("")}>
                  <X size={16} aria-hidden="true" />
                </button>
              )}
            </div>
            <div className="scripta-library-display-controls">
              {modes.length > 1 && (
                <div className="scripta-library-modes" role="group" aria-label="Display layout">
                  {modes.map((m) => (
                    <button
                      type="button"
                      key={m}
                      aria-pressed={activeMode === m}
                      onClick={() => setMode(m)}
                    >
                      {m === "table" ? "Table" : m === "board" ? "Board" : "Cards"}
                    </button>
                  ))}
                </div>
              )}
              {groups.length > 0 && activeMode !== "board" && (
                <label className="scripta-library-control scripta-library-group">
                  <span>Group by</span>
                  <select value={group?.key ?? ""} onChange={(e) => setGroupKey(e.target.value)}>
                    <option value="">Nothing</option>
                    {groups.map((g) => (
                      <option key={g.key} value={g.key}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {/* The same sort the table's headers set, reachable from every
                  layout. Cards and the board had no way to order themselves at
                  all, which made "oldest first" a reason to leave a view
                  rather than a thing you could ask for where you were. */}
              {sortable.length > 0 && (
                <div className="scripta-library-control scripta-library-sort">
                  <label>
                    <span>Sort by</span>
                    <select
                      value={sort?.key ?? ""}
                      onChange={(e) =>
                        setSort(e.target.value ? { key: e.target.value, dir: 1 } : null)
                      }
                    >
                      <option value="">Default order</option>
                      {sortable.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {sort && (
                    <button
                      type="button"
                      onClick={() => setSort({ key: sort.key, dir: sort.dir === 1 ? -1 : 1 })}
                      aria-label={
                        sort.dir === 1
                          ? "Ascending. Reverse the order."
                          : "Descending. Reverse the order."
                      }
                      title={sort.dir === 1 ? "Ascending" : "Descending"}
                    >
                      {sort.dir === 1 ? (
                        <ChevronUp size={14} aria-hidden="true" />
                      ) : (
                        <ChevronDown size={14} aria-hidden="true" />
                      )}
                    </button>
                  )}
                </div>
              )}
              {activeMode === "table" && (
                <Popover open={pickCols} onOpenChange={setPickCols}>
                  <PopoverTrigger asChild>
                    <button type="button" className="scripta-library-control">
                      <Columns3 size={16} aria-hidden="true" /> Columns
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="scripta-library-popover"
                    style={scriptaTheme}
                    align="end"
                    aria-label="Visible columns"
                  >
                    <h2>Visible columns</h2>
                    {columns.map((c) => (
                      <label key={c.key}>
                        <input
                          type="checkbox"
                          checked={!hidden.includes(c.key)}
                          onChange={() =>
                            setHidden(
                              hidden.includes(c.key)
                                ? hidden.filter((k) => k !== c.key)
                                : [...hidden, c.key],
                            )
                          }
                        />
                        {c.label}
                      </label>
                    ))}
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>

          {views.length > 0 && showViewRow && (
            <div className="scripta-library-views" role="group" aria-label="Saved views">
              {filterViews.map((v) => viewButton(v))}
              {placeViews.length > 0 && (
                <div className="scripta-library-places">
                  {placeViews.map((v) =>
                    viewButton(
                      v,
                      v.key === "Archived" ? (
                        <Archive size={14} aria-hidden="true" />
                      ) : (
                        <Trash2 size={14} aria-hidden="true" />
                      ),
                    ),
                  )}
                </div>
              )}
            </div>
          )}

          {activeMode === "table" && selected.length > 0 && bulkFor.length > 0 ? (
            <div className="scripta-library-bulk" role="group" aria-label="Selected row actions">
              <span aria-live="polite">{selected.length} selected</span>
              {bulkFor.map((b) => (
                <button
                  key={b.label}
                  type="button"
                  className={b.danger ? "is-danger" : undefined}
                  onClick={() => {
                    b.onClick(selected);
                    setSel([]);
                  }}
                >
                  {b.label}
                </button>
              ))}
              <button
                type="button"
                className="scripta-library-clear-selection"
                onClick={() => setSel([])}
              >
                Clear selection
              </button>
            </div>
          ) : (
            <div className="scripta-library-count" aria-live="polite">
              {filtered.length} {filtered.length === 1 ? "result" : "results"}
            </div>
          )}

          <div className="scripta-library-body">
            {filtered.length === 0 ? (
              <div className="scripta-library-empty">
                {rows.length > 0 ? (
                  <>
                    <h2>No matching results</h2>
                    <p>Try another view or search term.</p>
                    {term && (
                      <button
                        type="button"
                        className="scripta-library-control"
                        onClick={() => setTerm("")}
                      >
                        Clear search
                      </button>
                    )}
                  </>
                ) : (
                  (empty ?? "Nothing here yet.")
                )}
              </div>
            ) : activeMode === "table" ? (
              <table
                className="scripta-library-table"
                style={
                  sized ? { width: tableWidth, minWidth: tableWidth } : { minWidth: tableWidth }
                }
                aria-label={title ?? searchPlaceholder}
              >
                <colgroup>
                  <col style={{ width: 44 }} />
                  {shown.map((c) => (
                    <col key={c.key} style={{ width: colWidth(c) }} />
                  ))}
                  <col style={{ width: 56 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col" className="scripta-library-select-cell">
                      <input
                        type="checkbox"
                        aria-label="Select all displayed rows"
                        checked={selected.length === filtered.length}
                        ref={(input) => {
                          if (input)
                            input.indeterminate =
                              selected.length > 0 && selected.length < filtered.length;
                        }}
                        onChange={(event) =>
                          setSel(event.target.checked ? filtered.map((r) => r.id) : [])
                        }
                      />
                    </th>
                    {shown.map((c) => {
                      const active = sort?.key === c.key;
                      return (
                        <th
                          key={c.key}
                          scope="col"
                          aria-sort={
                            active ? (sort.dir === 1 ? "ascending" : "descending") : undefined
                          }
                        >
                          {c.value ? (
                            <button
                              type="button"
                              onClick={() =>
                                setSort(
                                  active
                                    ? { key: c.key, dir: sort!.dir === 1 ? -1 : 1 }
                                    : { key: c.key, dir: 1 },
                                )
                              }
                            >
                              {c.label}
                              {active &&
                                (sort.dir === 1 ? (
                                  <ChevronUp size={14} aria-hidden="true" />
                                ) : (
                                  <ChevronDown size={14} aria-hidden="true" />
                                ))}
                            </button>
                          ) : (
                            c.label
                          )}
                          <ColumnResizer
                            label={c.label}
                            width={colWidth(c)}
                            onResize={(w) => setWidth(c.key, w)}
                            onReset={() => setWidth(c.key, null)}
                            onStart={(row) => pinDrawn(row, c.key)}
                          />
                        </th>
                      );
                    })}
                    <th scope="col" className="scripta-library-row-actions">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sections.map((section) => [
                    group && (
                      <tr key={`group:${section.name}`} className="scripta-library-group-row">
                        <th scope="rowgroup" colSpan={shown.length + 2}>
                          {sectionHead(section.name, section.rows.length)}
                        </th>
                      </tr>
                    ),
                    ...(folded.includes(section.name) ? [] : section.rows).map((r) => {
                      const label = rowLabel(r);
                      const rowActions = actions?.(r) ?? [];
                      return (
                        <tr
                          key={group ? `${section.name}:${r.id}` : r.id}
                          className={openRow === r.id ? "is-open" : undefined}
                          onClick={() => setOpenRow(r.id)}
                          onDoubleClick={() => onOpen(r)}
                        >
                          <td className="scripta-library-select-cell">
                            <input
                              type="checkbox"
                              aria-label={`Select ${label}`}
                              checked={sel.includes(r.id)}
                              onClick={(event) => event.stopPropagation()}
                              onDoubleClick={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                setSel(
                                  event.target.checked
                                    ? [...sel, r.id]
                                    : sel.filter((x) => x !== r.id),
                                )
                              }
                            />
                          </td>
                          {shown.map((c, index) => (
                            <td key={c.key}>
                              {index === 0 ? (
                                <button
                                  type="button"
                                  className="scripta-library-preview"
                                  aria-label={`View details for ${label}`}
                                  onClick={() => setOpenRow(r.id)}
                                >
                                  {c.render(r)}
                                </button>
                              ) : (
                                c.render(r)
                              )}
                            </td>
                          ))}
                          <td className="scripta-library-row-actions">
                            {rowActions.length > 0 ? (
                              <RowActions row={r} label={label} actions={rowActions} />
                            ) : (
                              <button
                                type="button"
                                className="scripta-library-icon-button"
                                aria-label={`Open ${label}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onOpen(r);
                                }}
                              >
                                <ArrowUpRight size={16} aria-hidden="true" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    }),
                  ])}
                </tbody>
              </table>
            ) : activeMode === "board" && board ? (
              <div
                className="scripta-library-board"
                style={{
                  // Narrower once a board carries five columns, so the last one
                  // is not clipped at the right edge — a column half off screen
                  // reads as broken rather than as something to scroll to.
                  gridTemplateColumns: `repeat(${board.columns.length}, minmax(${
                    board.columns.length > 4 ? 218 : 260
                  }px, 1fr))`,
                }}
              >
                {board.columns.map((col) => {
                  const inCol = filtered.filter((r) => board.column(r) === col);
                  return (
                    <section key={col} className="scripta-library-board-column" aria-label={col}>
                      <header>
                        <h2>{col}</h2>
                        <span>{inCol.length}</span>
                      </header>
                      {inCol.map((r) => (
                        <div key={r.id} onClick={(event) => choose(event, r)}>
                          {board.card(r)}
                        </div>
                      ))}
                    </section>
                  );
                })}
              </div>
            ) : activeMode === "cards" && cards ? (
              sections.map((section) => (
                <section
                  key={section.name}
                  className="scripta-library-group"
                  aria-label={group ? section.name : undefined}
                >
                  {group && sectionHead(section.name, section.rows.length)}
                  {!folded.includes(section.name) && (
                    <div className="scripta-library-cards">
                      {section.rows.map((r) => (
                        <div key={r.id} onClick={(event) => choose(event, r)}>
                          {cards(r)}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              ))
            ) : null}
          </div>
        </div>
      }
      secondary={
        detailRow ? (
          <aside
            className="scripta-library-detail"
            aria-label={`Details for ${rowLabel(detailRow)}`}
            key={detailRow.id}
          >
            <button
              type="button"
              className="scripta-library-detail-close scripta-library-icon-button"
              aria-label="Close details"
              onClick={() => setOpenRow(null)}
            >
              <X size={18} aria-hidden="true" />
            </button>
            {detail(detailRow)}
          </aside>
        ) : null
      }
    />
  );
}
