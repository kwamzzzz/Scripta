/**
 * Learning home: the section's own menu and the page behind each entry.
 *
 * The menu is fixed places, not a list of course titles, so it reads the same
 * with no courses as with forty: where you are in your training, what the firm
 * has assigned you, what else is on offer, what is due, what you have banked,
 * and what you are writing. Every figure is derived from the shelf on the way
 * past, like everything else in this area.
 */
import type { ReactNode } from "react";
import {
  Archive,
  BookOpen,
  CalendarClock,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  Library,
  PenLine,
} from "lucide-react";
import { SectionPanel, type PanelGroup } from "@/components/SectionPanel";
import type { CourseCard } from "./db";
import { CourseCover } from "./CourseCover";
import { formatDuration } from "./estimate";

export type ShelfView =
  | "overview"
  | "mine"
  | "assigned"
  | "catalogue"
  | "deadlines"
  | "progress"
  | "authoring"
  | "archived";

export const SHELF_VIEWS: ShelfView[] = [
  "overview",
  "mine",
  "assigned",
  "catalogue",
  "deadlines",
  "progress",
  "authoring",
  "archived",
];

const TITLES: Record<ShelfView, string> = {
  overview: "Overview",
  mine: "My courses",
  assigned: "Assigned to me",
  catalogue: "Catalogue",
  deadlines: "Deadlines",
  progress: "Progress & CPD",
  authoring: "Authoring",
  archived: "Archived",
};

const ICON = 15;

/** The shelf split into the lists each menu entry shows. One pass, no caching. */
export function shelve(list: CourseCard[]) {
  const live = list.filter((c) => !c.archivedAt);
  const enrolled = live.filter((c) => c.role !== null || c.authoring);
  return {
    live,
    mine: enrolled,
    assigned: live.filter((c) => c.visibility === "assigned" && c.role === "learner"),
    catalogue: live.filter((c) => c.visibility === "assigned" && c.role === null && !c.authoring),
    deadlines: enrolled
      .filter((c) => c.endsOn)
      .sort((a, b) => (a.endsOn ?? "").localeCompare(b.endsOn ?? "")),
    authoring: live.filter((c) => c.authoring),
    archived: list.filter((c) => c.archivedAt && c.authoring),
    inProgress: enrolled.filter((c) => c.done > 0 && c.done < c.total),
  };
}

export function ShelfPanel({
  list,
  view,
  onSelect,
}: {
  list: CourseCard[];
  view: ShelfView;
  onSelect: (view: ShelfView) => void;
}) {
  const s = shelve(list);
  const earned = cpdEarned(s.mine);
  const groups: PanelGroup[] = [
    {
      items: [
        { id: "overview", label: TITLES.overview, icon: <LayoutDashboard size={ICON} /> },
        { id: "mine", label: TITLES.mine, icon: <BookOpen size={ICON} />, count: s.mine.length },
        {
          id: "assigned",
          label: TITLES.assigned,
          icon: <ClipboardList size={ICON} />,
          count: s.assigned.length,
        },
        {
          id: "catalogue",
          label: TITLES.catalogue,
          icon: <Library size={ICON} />,
          count: s.catalogue.length,
        },
      ],
    },
    {
      heading: "Record",
      items: [
        {
          id: "deadlines",
          label: TITLES.deadlines,
          icon: <CalendarClock size={ICON} />,
          count: s.deadlines.length,
        },
        { id: "progress", label: TITLES.progress, icon: <GraduationCap size={ICON} /> },
      ],
    },
    {
      heading: "Write",
      items: [
        {
          id: "authoring",
          label: TITLES.authoring,
          icon: <PenLine size={ICON} />,
          count: s.authoring.length,
        },
      ],
    },
    {
      aside: true,
      items: [
        {
          id: "archived",
          label: TITLES.archived,
          icon: <Archive size={ICON} />,
          count: s.archived.length,
        },
      ],
    },
  ];

  return (
    <SectionPanel
      tone="dark"
      title="Learning"
      meta={`${s.mine.length} ${s.mine.length === 1 ? "COURSE" : "COURSES"}`}
      groups={groups}
      activeId={view}
      onSelect={(id) => onSelect(id as ShelfView)}
      foot={
        <>
          <b>{trim(earned)}</b> CPD hrs banked · {s.assigned.length} assigned
        </>
      }
    />
  );
}

export function ShelfPage({
  list,
  loading,
  view,
  onOpen,
  onNewCourse,
  onEnrol,
  onRestore,
  onDelete,
}: {
  list: CourseCard[];
  loading: boolean;
  view: ShelfView;
  onOpen: (course: CourseCard, authoring?: boolean) => void;
  onNewCourse: () => void;
  onEnrol: (course: CourseCard) => void;
  onRestore: (course: CourseCard) => void;
  onDelete: (course: CourseCard) => void;
}) {
  const s = shelve(list);
  const newButton = (
    <button type="button" className="lr-btn" data-primary="true" onClick={onNewCourse}>
      New course
    </button>
  );

  const head = (sub: string, action?: ReactNode) => (
    <div
      style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}
    >
      <div>
        <h1 className="lr-h1">{TITLES[view]}</h1>
        <p className="lr-sub">{sub}</p>
      </div>
      {action}
    </div>
  );

  const grid = (
    rows: CourseCard[],
    empty: ReactNode,
    card = (c: CourseCard) => (
      <CourseTile key={c.id} course={c} onOpen={() => onOpen(c, view === "authoring")} />
    ),
  ) =>
    loading ? (
      <div className="lr-empty">Loading…</div>
    ) : rows.length === 0 ? (
      <div className="lr-empty">{empty}</div>
    ) : (
      <div className="lr-grid">{rows.map(card)}</div>
    );

  let body: ReactNode;
  switch (view) {
    case "overview": {
      const earned = cpdEarned(s.mine);
      const due = s.deadlines.filter((c) => c.done < c.total).slice(0, 3);
      body = (
        <>
          {head("Where your training stands", newButton)}
          <div className="lr-stats">
            <Stat label="Courses" value={s.mine.length} />
            <Stat label="In progress" value={s.inProgress.length} />
            <Stat label="Items complete" value={s.mine.reduce((n, c) => n + c.done, 0)} />
            <Stat label="CPD hours banked" value={trim(earned)} />
          </div>
          <div className="lr-label">Pick up where you left off</div>
          {grid(
            s.inProgress.length > 0 ? s.inProgress : s.mine.slice(0, 6),
            <>
              Nothing on your shelf yet. Start a course of your own, or enrol in one from the
              Catalogue.
            </>,
          )}
          {due.length > 0 ? (
            <>
              <div className="lr-label">Due soon</div>
              <DeadlineRows rows={due} onOpen={(c) => onOpen(c)} />
            </>
          ) : null}
        </>
      );
      break;
    }
    case "mine":
      body = (
        <>
          {head(`${s.mine.length} ${s.mine.length === 1 ? "course" : "courses"}`, newButton)}
          {grid(s.mine, "No courses yet. Start one of your own with New course.")}
        </>
      );
      break;
    case "assigned":
      body = (
        <>
          {head("Training the firm has put you on")}
          {grid(s.assigned, "Nothing is assigned to you. Firm training you enrol in appears here.")}
        </>
      );
      break;
    case "catalogue":
      body = (
        <>
          {head("Firm training you are not yet enrolled in")}
          {grid(s.catalogue, "Every firm course is already on your shelf.", (c) => (
            <CourseTile
              key={c.id}
              course={c}
              onOpen={() => onOpen(c)}
              action={
                <button
                  type="button"
                  className="lr-btn"
                  data-primary="true"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEnrol(c);
                  }}
                >
                  Enrol
                </button>
              }
            />
          ))}
        </>
      );
      break;
    case "deadlines":
      body = (
        <>
          {head("Courses with a date to finish by")}
          {s.deadlines.length === 0 ? (
            <div className="lr-empty">No course on your shelf has a deadline.</div>
          ) : (
            <DeadlineRows rows={s.deadlines} onOpen={(c) => onOpen(c)} />
          )}
        </>
      );
      break;
    case "progress":
      body = (
        <>
          {head("What you have completed, and the hours it carries")}
          {s.mine.length === 0 ? (
            <div className="lr-empty">Nothing to report yet.</div>
          ) : (
            <table className="lr-table">
              <thead>
                <tr>
                  <th>Course</th>
                  <th>Kind</th>
                  <th>Items</th>
                  <th>Complete</th>
                  <th>CPD hours</th>
                </tr>
              </thead>
              <tbody>
                {s.mine.map((c) => {
                  const pct = c.total === 0 ? 0 : Math.round((c.done / c.total) * 100);
                  const finished = c.total > 0 && c.done === c.total;
                  return (
                    <tr key={c.id} onClick={() => onOpen(c)}>
                      <td>{c.title || "Untitled course"}</td>
                      <td>{c.visibility === "self" ? "Own reading" : "Firm training"}</td>
                      <td>
                        {c.done} of {c.total}
                      </td>
                      <td>{pct}%</td>
                      <td>
                        {c.visibility === "self"
                          ? "None"
                          : finished
                            ? `${trim(c.cpdHours)} banked`
                            : `${trim(c.cpdHours)} on completion`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      );
      break;
    case "authoring":
      body = (
        <>
          {head("Courses you are writing", newButton)}
          {grid(s.authoring, "You are not writing any courses. New course starts one.")}
        </>
      );
      break;
    case "archived":
      body = (
        <>
          {head("Put aside. Restore one to bring it back to the shelf.")}
          {grid(s.archived, "Nothing archived.", (c) => (
            <CourseTile
              key={c.id}
              course={c}
              onOpen={() => onOpen(c)}
              action={
                <span style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    className="lr-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRestore(c);
                    }}
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    className="lr-btn"
                    data-danger="true"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(c);
                    }}
                  >
                    Delete
                  </button>
                </span>
              }
            />
          ))}
        </>
      );
      break;
  }

  return (
    <div className="lr-page" style={{ display: "grid", gap: 16, alignContent: "start" }}>
      {body}
    </div>
  );
}

function CourseTile({
  course,
  onOpen,
  action,
}: {
  course: CourseCard;
  onOpen: () => void;
  action?: ReactNode;
}) {
  const percent = course.total === 0 ? 0 : Math.round((course.done / course.total) * 100);
  return (
    <div
      role="button"
      tabIndex={0}
      className="lr-card lr-tile"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
    >
      <CourseCover path={course.coverPath} title={course.title} variant="tile" />
      <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <span className="lr-label">
          {course.visibility === "self" ? "Own reading" : "Firm training"}
        </span>
        {course.authoring ? (
          <span className="lr-badge" data-tone="self">
            {course.publishedAt ? "author" : "draft"}
          </span>
        ) : null}
        {course.endsOn ? (
          <span className="lr-badge" data-tone="soon">
            due {shortDate(course.endsOn)}
          </span>
        ) : null}
      </div>
      <div style={{ marginTop: 6, fontSize: 14, fontWeight: 600 }}>
        {course.title || "Untitled course"}
      </div>
      {course.subtitle ? <div className="lr-tile-sub">{course.subtitle}</div> : null}
      <div style={{ marginTop: 10 }} className="lr-bar">
        <i style={{ width: `${percent}%` }} />
      </div>
      <div
        style={{
          marginTop: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 11.5, color: "#6f6f6f" }}>
          {course.done} of {course.total} {course.total === 1 ? "item" : "items"}
          {course.seconds > 0
            ? course.done > 0 && course.secondsLeft > 0
              ? ` · ${formatDuration(course.secondsLeft)} left`
              : course.secondsLeft === 0
                ? ""
                : ` · about ${formatDuration(course.seconds)}`
            : ""}
          {course.cpdHours > 0 ? ` · ${trim(course.cpdHours)} CPD hrs` : ""}
        </span>
        {action}
      </div>
    </div>
  );
}

function DeadlineRows({ rows, onOpen }: { rows: CourseCard[]; onOpen: (c: CourseCard) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="lr-rows">
      {rows.map((c) => {
        const finished = c.total > 0 && c.done === c.total;
        const late = !finished && (c.endsOn ?? "") < today;
        return (
          <div
            key={c.id}
            className="lr-row"
            style={{ cursor: "pointer" }}
            onClick={() => onOpen(c)}
          >
            <span className="lr-row-number">{shortDate(c.endsOn ?? "")}</span>
            <span className="lr-row-main">
              <span className="lr-row-title">{c.title || "Untitled course"}</span>
              <div className="lr-row-meta">
                {c.done} of {c.total} items
              </div>
            </span>
            {finished ? (
              <span className="lr-badge" data-tone="done">
                done
              </span>
            ) : late ? (
              <span className="lr-badge" data-tone="late">
                overdue
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="lr-card lr-stat">
      <div className="lr-label">{label}</div>
      <div className="lr-stat-value">{value}</div>
    </div>
  );
}

/** Hours on firm training that is actually finished. Own reading carries none. */
function cpdEarned(list: CourseCard[]): number {
  return list
    .filter((c) => c.visibility === "assigned" && c.total > 0 && c.done === c.total)
    .reduce((n, c) => n + c.cpdHours, 0);
}

function shortDate(date: string): string {
  const d = new Date(date);
  return Number.isNaN(d.getTime())
    ? date
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function trim(n: number): string {
  return String(Math.round(n * 100) / 100);
}
