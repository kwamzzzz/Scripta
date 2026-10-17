/**
 * 8b — the module, outline first.
 *
 * One rule makes a module work: the outline comes first, says what the learner
 * will be able to do, and the content below mirrors its numbering exactly.
 * Both sides of that mirror are derived from the same numbering pass, so they
 * cannot drift — an item dragged to a new position renumbers itself, its
 * children, and the outline line that names it, in one render.
 *
 * Author and learner read the same list through this one component with a mode
 * flag. The page is not forked: the author sees controls, the learner sees
 * locks, and the content between them is identical.
 *
 * The author's natural order is the outline's: write what the learner will be
 * able to do, then write the item that answers each line. So an unanswered
 * line offers to create its item, named by the author and already bound to
 * it, rather than leaving the author to add an item and bind it by hand.
 */
import { useEffect, useState } from "react";
import EditableName from "@/components/EditableName";
import { InlineAdd } from "../authoring";
import { blockSummary } from "../blocks";
import { courseTimes, describeItem, formatDuration } from "../estimate";
import type { CourseFile } from "../db";
import { CourseCover, CoverField } from "../CourseCover";
import {
  canPublish,
  indexProgress,
  isComplete,
  isReleased,
  moduleWarnings,
  numberItems,
  outlineRows,
  standing,
  type Item,
  type ItemKind,
  type NumberedItem,
  type OutlineLine,
} from "../model";

const KIND_LABEL: Record<ItemKind, string> = {
  item: "Item",
  video: "Video",
  link: "Web link",
  file: "Reading",
  folder: "Folder",
  discussion: "Discussion",
  assignment: "Assignment",
  quiz: "Quiz",
};

const NO_TIME = { read: 0, reflect: 0, listen: 0, watch: 0, practice: 0, look: 0, total: 0 };

const newLineId = () => `l_${Math.random().toString(36).slice(2, 10)}`;

export function ModulePage({
  file,
  moduleId,
  authoring,
  onOpenItem,
  onAddItem,
  onWriteLine,
  onToggleVisible,
  onMove,
  onRename,
  onSaveOutline,
  onPublish,
  onDeleteItem,
  onDeleteModule,
  onUploadCover,
  onSaveCover,
}: {
  file: CourseFile;
  moduleId: string;
  authoring: boolean;
  onOpenItem: (itemId: string) => void;
  /** Resolves once the item exists, so the name field can clear for the next. */
  onAddItem: (kind: ItemKind, title: string, parentItemId?: string) => Promise<unknown>;
  /** Create the item that answers an outline line, bound to it, and open it. */
  onWriteLine: (line: OutlineLine, title: string) => Promise<unknown>;
  onToggleVisible: (item: Item) => void;
  onMove: (item: NumberedItem, by: -1 | 1, siblings: Item[]) => void;
  onRename: (title: string) => Promise<boolean>;
  onSaveOutline: (outline: OutlineLine[]) => Promise<void>;
  onPublish: (published: boolean) => void;
  onDeleteItem: (item: NumberedItem) => void;
  onDeleteModule: () => void;
  /** Store a cover image and return its path. */
  onUploadCover: (file: File) => Promise<string>;
  onSaveCover: (patch: { coverPath?: string | null; coverCredit?: string }) => Promise<boolean>;
}) {
  const [adding, setAdding] = useState<null | { kind: ItemKind; parent?: string }>(null);
  const [editingOutline, setEditingOutline] = useState(false);
  // The outline line whose item is being named. An outcome ("Explain how…")
  // is not a title, so the item is named before it is made.
  const [naming, setNaming] = useState<OutlineLine | null>(null);

  const module = file.modules.find((m) => m.id === moduleId);
  if (!module) {
    return (
      <div className="lr-page">
        <div className="lr-empty">That module is not in this course.</div>
      </div>
    );
  }

  const index = indexProgress(file.progress);
  const own = file.items.filter((i) => i.moduleId === moduleId);
  const numbered = numberItems(own);
  const visible = authoring ? numbered : numbered.filter((i) => i.visible);
  const rows = outlineRows(module, numbered);
  // An unanswered outline line is already marked on the outline, with the
  // button that answers it; repeating it in the warning box only nags.
  const warnings = moduleWarnings(module, numbered).filter((w) => w.kind !== "line-has-no-item");
  const cell = standing(own, index);
  const times = courseTimes([module], own, index);
  const moduleTime = times.byModule.get(module.id) ?? { total: 0, left: 0 };
  const published = !!module.publishedAt;
  const outlineOpen = authoring && (editingOutline || module.outline.length === 0);

  const siblingsOf = (item: NumberedItem) =>
    own.filter((i) => i.parentItemId === item.parentItemId);

  return (
    <div className="lr-page" style={{ display: "grid", gap: 18 }}>
      {module.coverPath ? (
        <CourseCover
          path={module.coverPath}
          title={module.title}
          credit={module.coverCredit}
          variant="banner"
        />
      ) : null}
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "flex-start",
          justifyContent: "space-between",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="lr-h1">
            {authoring ? (
              <EditableName
                label="module"
                value={module.title || "Untitled module"}
                onSave={onRename}
              />
            ) : (
              module.title || "Untitled module"
            )}
          </h1>
          <p className="lr-sub">
            {module.week ? `Week ${module.week} · ` : ""}
            {module.cpdHours > 0 ? `${module.cpdHours} CPD hours · ` : ""}
            {moduleTime.total > 0
              ? moduleTime.left > 0 && moduleTime.left < moduleTime.total
                ? `${formatDuration(moduleTime.left)} left of about ${formatDuration(moduleTime.total)} · `
                : `About ${formatDuration(moduleTime.total)} · `
              : ""}
            {own.length} {own.length === 1 ? "item" : "items"} · {cell.done} of {cell.total}{" "}
            complete
            {authoring ? (published ? " · published" : " · draft") : ""}
          </p>
        </div>
        {authoring ? (
          <div style={{ display: "flex", gap: 6, flex: "none" }}>
            <button
              type="button"
              className="lr-btn"
              data-primary={!published ? "true" : undefined}
              disabled={!published && !canPublish(module)}
              title={!canPublish(module) ? "Write the outline first" : undefined}
              onClick={() => onPublish(!published)}
            >
              {published ? "Unpublish" : "Publish module"}
            </button>
            <button type="button" className="lr-btn" data-danger="true" onClick={onDeleteModule}>
              Delete module
            </button>
          </div>
        ) : null}
      </div>

      {authoring ? (
        <section className="lr-card">
          <CoverField
            path={module.coverPath}
            credit={module.coverCredit}
            title={module.title}
            onUpload={onUploadCover}
            onSave={onSaveCover}
          />
        </section>
      ) : null}

      {/* Always the first thing on the page. */}
      <section className="lr-outline">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div className="lr-label" style={{ color: "var(--lr-action)" }}>
            Outline · always the first item
          </div>
          {authoring && module.outline.length > 0 ? (
            <button type="button" className="lr-btn" onClick={() => setEditingOutline((v) => !v)}>
              {editingOutline ? "Done" : "Edit outline"}
            </button>
          ) : null}
        </div>
        {outlineOpen ? (
          <OutlineEditor
            outline={module.outline}
            items={numbered}
            onSave={onSaveOutline}
            onWriteLine={setNaming}
          />
        ) : rows.length === 0 ? (
          <div style={{ marginTop: 8, fontSize: 12.5, color: "var(--lr-warn-ink)" }}>
            This module has no outline yet, so it cannot be published. The outline says what a
            learner will be able to do, and the content below answers it line by line.
          </div>
        ) : (
          <div style={{ marginTop: 8 }}>
            {rows.map((row) => {
              const line = module.outline.find((l) => l.id === row.id);
              return (
                <div
                  key={row.id}
                  className="lr-outline-line"
                  data-unbound={!row.number ? "true" : undefined}
                >
                  <b>{row.number ?? "—"}</b>
                  <span style={{ flex: 1 }}>{row.text}</span>
                  {authoring && !row.number && line ? (
                    <button type="button" className="lr-btn" onClick={() => setNaming(line)}>
                      Write the item
                    </button>
                  ) : null}
                </div>
              );
            })}
            <div style={{ marginTop: 10, fontSize: 11.5, color: "#5f5f5f" }}>
              The numbering below mirrors this outline. Reordering the content renumbers both.
            </div>
          </div>
        )}
      </section>

      {authoring && naming ? (
        <div className="lr-card" style={{ display: "grid", gap: 8 }}>
          <div className="lr-label">Name the item that answers</div>
          <div style={{ fontSize: 12.5, color: "#3f3f3f" }}>“{naming.text}”</div>
          <InlineAdd
            key={naming.id}
            label="Item title"
            placeholder="A short title the learner will see in the menu"
            onAdd={(title) => onWriteLine(naming, title)}
            onCancel={() => setNaming(null)}
          />
        </div>
      ) : null}

      {authoring && warnings.length > 0 ? (
        <div className="lr-warn">
          {warnings.map((w, i) => (
            <div key={i}>
              {w.kind === "no-outline"
                ? "No outline, so this module cannot be published."
                : `${w.number} · ${w.title || "Untitled item"} answers no outline line.`}
            </div>
          ))}
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <div className="lr-label">
            Module content{authoring ? " · numbers follow position" : ""}
          </div>
          {authoring && !adding ? (
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" className="lr-btn" onClick={() => setAdding({ kind: "item" })}>
                Add item
              </button>
              <button
                type="button"
                className="lr-btn"
                onClick={() => setAdding({ kind: "folder" })}
              >
                Add folder
              </button>
            </div>
          ) : null}
        </div>

        {authoring && adding ? (
          <InlineAdd
            label={adding.kind === "folder" ? "Folder name" : "Item title"}
            placeholder={
              adding.kind === "folder"
                ? "Name the folder"
                : adding.parent
                  ? "Name the item inside the folder"
                  : "Name the item"
            }
            onAdd={(title) => onAddItem(adding.kind, title, adding.parent)}
            onCancel={() => setAdding(null)}
          />
        ) : null}

        {visible.length === 0 ? (
          <div className="lr-empty">
            {authoring
              ? "Nothing in this module yet. Write the outline, then use Write the item on each line, or add items directly."
              : "Nothing has been released here yet."}
          </div>
        ) : (
          <div className="lr-rows">
            {visible.map((item) => {
              const released = isReleased(item, index);
              const done = isComplete(index, item.id);
              const siblings = siblingsOf(item);
              const answers = module.outline.find((l) => l.itemId === item.id);
              return (
                <div key={item.id} className="lr-row" data-depth={item.depth}>
                  <span className="lr-row-number">{item.number}</span>
                  <span className="lr-row-main">
                    <button
                      type="button"
                      className="lr-row-title"
                      disabled={(!released && !authoring) || item.kind === "folder"}
                      onClick={() => onOpenItem(item.id)}
                    >
                      {item.title || "Untitled item"}
                    </button>
                    <div className="lr-row-meta">
                      {[
                        describeItem(times.byItem.get(item.id) ?? NO_TIME) || KIND_LABEL[item.kind],
                        blockSummary(item.payload),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      {item.kind === "folder"
                        ? ` · ${own.filter((i) => i.parentItemId === item.id).length} items`
                        : ""}
                      {authoring && answers ? ` · answers “${shorten(answers.text, 60)}”` : ""}
                      {!released ? " · releases when the items before it are complete" : ""}
                    </div>
                  </span>
                  <span style={{ display: "flex", gap: 6, alignItems: "center", flex: "none" }}>
                    {done ? (
                      <span className="lr-badge" data-tone="done">
                        done
                      </span>
                    ) : !released ? (
                      <span className="lr-badge" data-tone="self">
                        locked
                      </span>
                    ) : null}
                    {authoring ? (
                      <>
                        {item.kind === "folder" ? (
                          <button
                            type="button"
                            className="lr-btn"
                            title="Add an item inside this folder"
                            onClick={() => setAdding({ kind: "item", parent: item.id })}
                          >
                            Add inside
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="lr-btn"
                          title="Move up"
                          onClick={() => onMove(item, -1, siblings)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="lr-btn"
                          title="Move down"
                          onClick={() => onMove(item, 1, siblings)}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="lr-btn"
                          onClick={() => onToggleVisible(item)}
                        >
                          {item.visible ? "Visible" : "Hidden"}
                        </button>
                        <button
                          type="button"
                          className="lr-btn"
                          data-danger="true"
                          title="Delete"
                          onClick={() => onDeleteItem(item)}
                        >
                          Delete
                        </button>
                      </>
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The outline, line by line. A line's text saves when you leave it; binding,
 * order and removal save at once. Pasting several lines into the new-line
 * field makes one outline line each, because outcomes are usually drafted as
 * a list somewhere else first.
 */
function OutlineEditor({
  outline,
  items,
  onSave,
  onWriteLine,
}: {
  outline: OutlineLine[];
  items: NumberedItem[];
  onSave: (outline: OutlineLine[]) => Promise<void>;
  onWriteLine: (line: OutlineLine) => void;
}) {
  const [lines, setLines] = useState(outline);
  const [draft, setDraft] = useState("");

  useEffect(() => setLines(outline), [outline]);

  const commit = (next: OutlineLine[]) => {
    setLines(next);
    void onSave(next);
  };

  const add = () => {
    const texts = draft
      .split("\n")
      .map((t) => t.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
      .filter(Boolean);
    if (texts.length === 0) return;
    commit([...lines, ...texts.map((text) => ({ id: newLineId(), text, itemId: null }))]);
    setDraft("");
  };

  const byNumber = new Map(items.map((i) => [i.id, i.number]));
  const answerable = items.filter((i) => i.kind !== "folder");
  const numberOf = (line: OutlineLine) => (line.itemId ? byNumber.get(line.itemId) : undefined);

  return (
    <div style={{ marginTop: 8, display: "grid", gap: 4 }}>
      {lines.map((line, i) => (
        <div key={line.id} className="lr-outline-edit">
          <b>{numberOf(line) ?? "—"}</b>
          <input
            className="lr-input"
            aria-label={`Outline line ${i + 1}`}
            value={line.text}
            onChange={(e) =>
              setLines(lines.map((l) => (l.id === line.id ? { ...l, text: e.target.value } : l)))
            }
            onBlur={() => {
              const before = outline.find((l) => l.id === line.id)?.text;
              if (before !== line.text) void onSave(lines);
            }}
          />
          <select
            className="lr-input"
            aria-label="Answered by"
            value={line.itemId ?? ""}
            onChange={(e) =>
              commit(
                lines.map((l) => (l.id === line.id ? { ...l, itemId: e.target.value || null } : l)),
              )
            }
          >
            <option value="">Answered by…</option>
            {answerable.map((item) => (
              <option key={item.id} value={item.id}>
                {item.number} · {shorten(item.title || "Untitled item", 40)}
              </option>
            ))}
          </select>
          {!line.itemId ? (
            <button
              type="button"
              className="lr-btn"
              title="Create the item that answers this line"
              onClick={() => onWriteLine(line)}
            >
              Write the item
            </button>
          ) : null}
          <button
            type="button"
            className="lr-btn"
            title="Move up"
            aria-disabled={i === 0}
            onClick={() => {
              if (i === 0) return;
              const next = [...lines];
              [next[i - 1], next[i]] = [next[i]!, next[i - 1]!];
              commit(next);
            }}
          >
            ↑
          </button>
          <button
            type="button"
            className="lr-btn"
            title="Remove this line"
            onClick={() => commit(lines.filter((l) => l.id !== line.id))}
          >
            ✕
          </button>
        </div>
      ))}
      <form
        className="lr-inline-add"
        style={{ marginTop: 6, alignItems: "flex-start" }}
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <textarea
          className="lr-textarea"
          rows={lines.length === 0 ? 3 : 1}
          aria-label="New outline line"
          value={draft}
          placeholder={
            lines.length === 0
              ? "What will the learner be able to do? One outcome per line, e.g.\nExplain how power is divided between the federation and the emirates"
              : "Add another outcome (paste several lines to add several)"
          }
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="submit" className="lr-btn" data-primary="true" disabled={!draft.trim()}>
          Add
        </button>
      </form>
    </div>
  );
}

function shorten(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
