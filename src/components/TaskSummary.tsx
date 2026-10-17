/**
 * What needs you, on the Dashboard.
 *
 * A summary, not a second Tasks screen: the counts a lawyer wants before
 * deciding what to open, and the few items actually pressing. Managing the
 * workload happens in Tasks, and every line here goes there.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useApp } from "@/store/app";
import { listTasks } from "@/lib/tasks/data";
import {
  ATTENTION_LABEL,
  actingDate,
  attentionOf,
  byAttention,
  taskSummary,
  type Attention,
  type Task,
} from "@/lib/tasks/model";
import { useToday } from "@/matter-flow/store";
import "./task-summary.css";

/** The four shelves, in the order they are offered. Today comes first and is
 *  where the summary opens: the day's work, not a list of what slipped. */
const SHELVES = ["today", "overdue", "waiting", "upcoming"] as const;
type Shelf = (typeof SHELVES)[number];

const EMPTY: Record<Shelf, string> = {
  today: "Nothing is due today.",
  overdue: "Nothing is past its date.",
  waiting: "Nothing is waiting on anyone.",
  upcoming: "Nothing is dated ahead.",
};

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/** A plain fact about when, in the words the Tasks screen uses. */
function when(t: Task, shelf: Attention): string {
  if (shelf === "waiting") return ATTENTION_LABEL.waiting;
  if (t.dueDate) return `Due ${shortDate(t.dueDate)}`;
  const on = actingDate(t);
  return on ? `Work on ${shortDate(on)}` : "";
}

export default function TaskSummary() {
  const { workspaceId } = useApp();
  const navigate = useNavigate();
  const today = useToday();
  const [shelf, setShelf] = useState<Shelf>("today");

  const tasks = useQuery({
    queryKey: ["tasks", workspaceId],
    enabled: !!workspaceId,
    retry: false,
    queryFn: () => listTasks(workspaceId!),
  });

  // A failed read must not be drawn as a clear desk.
  if (tasks.isError || !tasks.data) return null;

  const summary = taskSummary(tasks.data, today);
  const shown = tasks.data
    .filter((t) => attentionOf(t, today) === shelf)
    .sort(byAttention(today))
    .slice(0, 5);

  const go = () => void navigate({ to: "/tasks" });
  // Four zeros above a list of six tasks reads like a broken panel. It is not:
  // nothing has a date. Say that instead of showing the counts.
  const undatedOnly =
    summary.total > 0 && summary.today + summary.overdue + summary.waiting + summary.upcoming === 0;

  return (
    <section className="task-summary" aria-labelledby="task-summary-heading">
      <div className="task-summary-head">
        <h2 id="task-summary-heading">What needs you</h2>
        <button type="button" className="scripta-text-button" onClick={go}>
          All tasks <ArrowRight size={14} aria-hidden="true" />
        </button>
      </div>

      {summary.total === 0 ? (
        <p className="task-summary-clear">
          Nothing on your list. Press <kbd>⌘</kbd>
          <kbd>I</kbd> anywhere to add something.
        </p>
      ) : undatedOnly ? (
        <p className="task-summary-clear">
          {summary.total} task{summary.total === 1 ? "" : "s"} waiting, none with a date yet.
          Nothing is due or overdue.
        </p>
      ) : (
        <>
          <div className="task-summary-counts" role="group" aria-label="Show tasks">
            {SHELVES.map((key) => (
              <button
                key={key}
                type="button"
                className="scripta-chip"
                aria-pressed={shelf === key}
                onClick={() => setShelf(key)}
              >
                {ATTENTION_LABEL[key]}
                <span>{summary[key]}</span>
              </button>
            ))}
          </div>
          {shown.length > 0 ? (
            <ul className="task-summary-list">
              {shown.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={go}>
                    <span className="task-summary-title">{t.title}</span>
                    <span className="task-summary-meta">
                      {[t.matterName || "No matter", when(t, shelf)].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="task-summary-clear">{EMPTY[shelf]}</p>
          )}
        </>
      )}
    </section>
  );
}
