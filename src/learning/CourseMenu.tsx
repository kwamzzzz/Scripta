/**
 * The course menu, drawn from authored data rather than a fixed nav.
 *
 * An entry is a heading, a divider or a link, in the order the author put
 * them. That is the whole reason the grouped look works — Welcome, Course
 * content, Course tools — and why an instructor can add a group and drag
 * items into it without anybody changing this file.
 *
 * Completion ticks render against content entries only, and every tick is
 * derived from progress at render time.
 */
import type { CourseFile } from "./db";
import { courseTimes, formatDuration } from "./estimate";
import {
  indexProgress,
  isComplete,
  isReleased,
  numberItems,
  standing,
  type MenuEntry,
} from "./model";

export type MenuTarget = { kind: "module" | "item"; id: string };

export function CourseMenu({
  file,
  activeRef,
  authoring = false,
  onOpen,
  onHome,
  onBack,
}: {
  file: CourseFile;
  /** The module or item currently open, so one row reads as current. */
  activeRef: string | null;
  /** Hidden items are listed for the author and nobody else. */
  authoring?: boolean;
  onOpen: (target: MenuTarget) => void;
  onHome: () => void;
  onBack: () => void;
}) {
  const { course, menu, modules, items, progress } = file;
  const index = indexProgress(progress);
  const numbered = numberItems(items);

  const itemsOfModule = (moduleId: string) => items.filter((i) => i.moduleId === moduleId);
  const times = courseTimes(modules, items, index);

  /** Whether a content entry is done. A module is done when its items are. */
  const entryComplete = (entry: MenuEntry): boolean => {
    if (!entry.countsAsContent || !entry.targetRef) return false;
    if (entry.targetKind === "item") return isComplete(index, entry.targetRef);
    if (entry.targetKind === "module") {
      const own = itemsOfModule(entry.targetRef);
      const { done, total } = standing(own, index);
      return total > 0 && done === total;
    }
    return false;
  };

  /** A link to an item nobody has unlocked yet is shown, but not openable. */
  const entryLocked = (entry: MenuEntry): boolean => {
    if (entry.targetKind === "item" && entry.targetRef) {
      const item = numbered.find((i) => i.id === entry.targetRef);
      return item ? !isReleased(item, index) : false;
    }
    if (entry.targetKind === "tool" || entry.targetKind === "url") return true;
    return false;
  };

  const period = () => {
    const from = course.opensOn ? month(course.opensOn) : "";
    const to = course.endsOn ? month(course.endsOn) : "";
    const span = from && to ? `${from}–${to}` : from || to;
    const hours = course.cpdHours > 0 ? `${trim(course.cpdHours)} CPD HRS` : "NO CPD HOURS";
    const length =
      times.course.total > 0 ? `ABOUT ${formatDuration(times.course.total).toUpperCase()}` : "";
    return [span, length, hours].filter(Boolean).join(" · ");
  };

  const overall = standing(items, index);

  return (
    <nav className="lr-menu lr-dark" aria-label="Course menu">
      <div className="lr-menu-head">
        <div className="lr-menu-title">{course.title || "Untitled course"}</div>
        <div className="lr-menu-meta">{period()}</div>
      </div>

      <div className="lr-menu-list">
        <button type="button" className="lr-menu-link lr-menu-back" onClick={onBack}>
          <span className="lr-menu-tick">←</span>
          <span className="lr-menu-label">All learning</span>
        </button>
        <button
          type="button"
          className="lr-menu-link"
          aria-current={activeRef === null ? "true" : undefined}
          onClick={onHome}
        >
          <span className="lr-menu-tick" />
          <span className="lr-menu-label">Course home</span>
        </button>
        <div className="lr-menu-divider" role="separator" />
        <div className="lr-menu-heading">Course content</div>
        {modules.length === 0 ? <div className="lr-menu-empty">No modules yet.</div> : null}
        {menu.length === 0
          ? modules.map((module, moduleIndex) => {
              const own = itemsOfModule(module.id);
              const { done, total } = standing(own, index);
              // The module's items in reading order, numbered the way the
              // module page numbers them, so "2.1" means the same thing here.
              const rows = numberItems(own).filter((i) => authoring || i.visible);
              return (
                <div key={module.id} className="lr-menu-module">
                  <button
                    type="button"
                    className="lr-menu-link"
                    aria-current={activeRef === module.id ? "true" : undefined}
                    data-complete={total > 0 && done === total ? "true" : undefined}
                    onClick={() => onOpen({ kind: "module", id: module.id })}
                  >
                    <span className="lr-menu-tick">
                      {total > 0 && done === total ? "✓" : moduleIndex + 1}
                    </span>
                    <span className="lr-menu-stack">
                      <span className="lr-menu-label" style={{ fontWeight: 600 }}>
                        {module.title || "Untitled module"}
                      </span>
                      {times.byModule.get(module.id)?.total ? (
                        <span className="lr-menu-time">
                          {(() => {
                            const t = times.byModule.get(module.id)!;
                            if (t.left === 0) return "done";
                            return t.left < t.total
                              ? `${formatDuration(t.left)} left`
                              : `about ${formatDuration(t.total)}`;
                          })()}
                        </span>
                      ) : null}
                    </span>
                  </button>
                  {rows.map((item) => {
                    const complete = isComplete(index, item.id);
                    const locked = !authoring && !isReleased(item, index);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className="lr-menu-link lr-menu-item"
                        data-depth={item.depth}
                        aria-current={activeRef === item.id ? "true" : undefined}
                        data-complete={complete ? "true" : undefined}
                        data-locked={locked ? "true" : undefined}
                        data-hidden={!item.visible ? "true" : undefined}
                        disabled={locked}
                        onClick={() =>
                          onOpen(
                            item.kind === "folder"
                              ? { kind: "module", id: module.id }
                              : { kind: "item", id: item.id },
                          )
                        }
                      >
                        <span className="lr-menu-tick">{complete ? "✓" : ""}</span>
                        <span className="lr-menu-num">
                          {moduleIndex + 1}.{item.number}
                        </span>
                        <span className="lr-menu-label">{item.title || "Untitled item"}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })
          : menu.map((entry) => {
              if (entry.kind === "divider") {
                return <div key={entry.id} className="lr-menu-divider" role="separator" />;
              }
              if (entry.kind === "heading") {
                return (
                  <div key={entry.id} className="lr-menu-heading">
                    {entry.label}
                  </div>
                );
              }
              const locked = entryLocked(entry);
              const done = entryComplete(entry);
              const openable =
                !locked &&
                !!entry.targetRef &&
                (entry.targetKind === "module" || entry.targetKind === "item");
              return (
                <button
                  key={entry.id}
                  type="button"
                  className="lr-menu-link"
                  aria-current={activeRef === entry.targetRef ? "true" : undefined}
                  data-complete={done ? "true" : undefined}
                  data-locked={locked ? "true" : undefined}
                  disabled={!openable}
                  onClick={() => {
                    if (!openable || !entry.targetRef) return;
                    onOpen({
                      kind: entry.targetKind === "item" ? "item" : "module",
                      id: entry.targetRef,
                    });
                  }}
                >
                  <span className="lr-menu-tick">{done ? "✓" : ""}</span>
                  <span className="lr-menu-label">{entry.label}</span>
                </button>
              );
            })}
      </div>

      <div className="lr-menu-foot">
        {course.visibility === "self" ? (
          <>
            <b>{overall.done}</b> of {overall.total} read
            {times.course.left > 0
              ? ` · ${formatDuration(times.course.left)} left`
              : " · own reading"}
          </>
        ) : (
          <>
            <b>{overall.percent}%</b> complete · {trim(course.cpdHours)} CPD hrs on completion
          </>
        )}
      </div>
    </nav>
  );
}

const MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEPT",
  "OCT",
  "NOV",
  "DEC",
];

function month(date: string): string {
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? "" : (MONTHS[d.getMonth()] ?? "");
}

/** 1.50 reads as 1.5, and 9.00 as 9. */
function trim(n: number): string {
  return String(Math.round(n * 100) / 100);
}
