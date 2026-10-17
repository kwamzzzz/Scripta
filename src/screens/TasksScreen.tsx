/**
 * Tasks — what needs your attention, and how to start it.
 *
 * The screen answers one question the moment it opens: what do I need to work
 * on? So the first row is a single field for recording something before it is
 * forgotten, the views are the states a lawyer actually thinks in, and the
 * panel on the right offers the tool that does this kind of work.
 *
 * It runs on the same Library as Matters, Templates and Precedents, so the
 * search, views, columns, row menu and bulk selection behave identically. What
 * differs is only what a task is.
 */
import { useMemo, useState } from "react";
import { useFeatureAccess } from "@/lib/features";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import MoveTaskToWorkspace from "@/components/MoveTaskToWorkspace";
import AppShell, { Crumbs } from "@/components/AppShell";
import { AssigneeMark } from "@/components/Person";
import Library, { type LibColumn, type LibGroup, type LibView } from "@/components/Library";
import { Button } from "@/components/primitives";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import { useApp } from "@/store/app";
import { C } from "@/lib/tokens";
import { relTime } from "@/lib/home-data";
import { useToday } from "@/matter-flow/store";
import TaskDetail from "./tasks/TaskDetail";
import PlanNotebook from "./tasks/PlanNotebook";
import HandoverDesk from "./tasks/HandoverDesk";
import { usePersisted } from "@/lib/use-board";
import {
  ATTENTION_LABEL,
  BOARD_STATUSES,
  ORIGIN_LABEL,
  PRIORITY_LABEL,
  STATUS_LABEL,
  attentionOf,
  byAttention,
  taskSearchText,
  toolFor,
  type Attention,
  type Task,
  type TaskStatus,
} from "@/lib/tasks/model";
import { deleteTask, listTasks, quickAdd, updateTask, type TaskPatch } from "@/lib/tasks/data";
import { tickDeliverable } from "@/lib/tasks/to-flow";
import "./tasks-screen.css";

/**
 * What a task is filed under, in one line: its matter, or the flow it came
 * from, and the client either reaches — or the client alone for a client task.
 */
const taskContext = (t: Task) =>
  [t.matterName || (t.flowId ? t.flowName : ""), t.clientName].filter(Boolean).join(" · ");

const shortDate = (iso: string | null) =>
  iso
    ? new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" })
    : "";

/**
 * The month a date falls in, for grouping by it.
 *
 * A day each would give a section per task and no grouping at all; a month is
 * the unit a lawyer already plans in, and the exact order within it is what
 * sorting is for.
 */
const monthLabel = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
};

/** Those months in the order they happen, since the alphabet is wrong for them. */
const monthOrder = (dates: (string | null | undefined)[]) => {
  const byKey = new Map<string, string>();
  for (const iso of dates) {
    const label = monthLabel(iso);
    if (label) byKey.set(iso!.slice(0, 7), label);
  }
  return [...byKey.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, label]) => label);
};

export default function TasksScreen() {
  const { workspaceId, matters } = useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const today = useToday();
  const [notice, setNotice] = useState<string | null>(null);
  /* The task whose filing is being changed. `matterName` is set when it is
     filed to a matter, which is the case the dialog explains rather than
     offers. */
  const [movingTask, setMovingTask] = useState<{
    id: string;
    title: string;
    matterName: string | null;
  } | null>(null);
  const [draft, setDraft] = useState("");
  const [chosenPage, setPage] = usePersisted<TasksPage>("px.tasks.page", "tasks");
  // The planner and handovers can be switched off from the admin portal; a
  // page left open from before then falls back to Tasks.
  const access = useFeatureAccess();
  const pageState = (p: TasksPage) =>
    p === "plan" ? access.state("planner") : p === "handover" ? access.state("handover") : "on";
  const page: TasksPage = pageState(chosenPage) === "on" ? chosenPage : "tasks";

  const tasks = useQuery({
    queryKey: ["tasks", workspaceId],
    enabled: !!workspaceId,
    retry: false,
    queryFn: () => listTasks(workspaceId!),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["tasks", workspaceId] });

  const add = useMutation({
    // Nothing is recorded about the tool: the suggestion is read off the title
    // each time, so renaming a task re-routes it, and a stored tool can only
    // ever mean somebody chose one.
    mutationFn: (title: string) => quickAdd(workspaceId!, { title }),
    onSuccess: () => {
      setDraft("");
      void refresh();
    },
    onError: (error) => setNotice((error as Error).message),
  });

  const patch = useMutation({
    mutationFn: async ({ id, ...rest }: TaskPatch & { id: string }) => {
      await updateTask(id, rest);
      // Work that discharges a deliverable is done in the Flow too, or the
      // same job has to be marked finished twice and the two will drift.
      const task = (tasks.data ?? []).find((t) => t.id === id);
      if (rest.status !== undefined && task?.deliverableId) {
        const echo = await tickDeliverable(task.deliverableId, rest.status === "Done");
        if (echo.kind === "ticked" && echo.stillNeedsVersion)
          return `Ticked “${echo.name}” in the Flow. It still needs its final version attached before the phase counts it complete.`;
        if (echo.kind === "ticked" && rest.status === "Done")
          return `Ticked “${echo.name}” in the Flow.`;
      }
      return null;
    },
    onSuccess: (message) => {
      setNotice(message);
      void refresh();
    },
    onError: (error) => setNotice((error as Error).message),
  });

  const { confirmDelete, confirmDialog } = useConfirmDelete();
  const remove = async (rows: Task[]) => {
    if (!rows.length) return;
    const what = rows.length === 1 ? `“${rows[0]!.title}”` : `${rows.length} tasks`;
    // A task has no archive: completing one is how it leaves the list, and
    // offering a reversible alternative that does not exist would be a lie.
    if (!(await confirmDelete({ what, count: rows.length, archivable: false }))) return;
    try {
      for (const row of rows) await deleteTask(row.id);
      await refresh();
    } catch (error) {
      setNotice((error as Error).message);
    }
  };

  const rows = useMemo(() => [...(tasks.data ?? [])].sort(byAttention(today)), [tasks.data, today]);

  const columns: LibColumn<Task>[] = [
    {
      key: "title",
      label: "Task",
      render: (t) => (
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600,
              color: C.text,
              textDecoration: t.status === "Done" ? "line-through" : "none",
            }}
          >
            {t.title}
          </div>
          {taskContext(t) && <div style={{ color: C.muted, fontSize: 11.5 }}>{taskContext(t)}</div>}
        </div>
      ),
      value: (t) => t.title.toLowerCase(),
    },
    {
      key: "attention",
      label: "When",
      width: 120,
      render: (t) => {
        const a = attentionOf(t, today);
        return <span className={`task-chip is-${a}`}>{ATTENTION_LABEL[a]}</span>;
      },
      value: (t) => attentionOf(t, today),
    },
    {
      key: "status",
      label: "Status",
      width: 120,
      render: (t) => STATUS_LABEL[t.status],
      value: (t) => t.status,
    },
    {
      key: "priority",
      label: "Priority",
      width: 100,
      render: (t) =>
        t.priority === "normal" ? (
          <span style={{ color: C.faint }}>—</span>
        ) : (
          PRIORITY_LABEL[t.priority]
        ),
      value: (t) => t.priority,
    },
    {
      key: "due",
      label: "Due",
      width: 100,
      render: (t) => shortDate(t.dueDate) || <span style={{ color: C.faint }}>—</span>,
      // A task with no deadline sorts after every task that has one, either
      // way round: it is not the most urgent thing on the list.
      value: (t) => t.dueDate ?? "9999-12-31",
    },
    {
      key: "planned",
      label: "Work on",
      width: 100,
      render: (t) => shortDate(t.plannedOn) || <span style={{ color: C.faint }}>—</span>,
      value: (t) => t.plannedOn ?? "9999-12-31",
      defaultOff: true,
    },
    {
      key: "origin",
      label: "Came from",
      width: 150,
      render: (t) => (
        <span style={{ color: C.muted }}>{(t.origin && ORIGIN_LABEL[t.origin]) || "—"}</span>
      ),
      value: (t) => t.origin ?? "",
      defaultOff: true,
    },
    {
      key: "updated",
      label: "Changed",
      width: 110,
      render: (t) => <span style={{ color: C.muted }}>{relTime(t.updatedAt)}</span>,
      value: (t) => t.updatedAt,
      defaultOff: true,
    },
    {
      key: "added",
      label: "Added",
      width: 110,
      render: (t) => <span style={{ color: C.muted }}>{relTime(t.createdAt)}</span>,
      value: (t) => t.createdAt,
      defaultOff: true,
    },
  ];

  const inState = (a: Attention) => (t: Task) => attentionOf(t, today) === a;
  const groups: LibGroup<Task>[] = [
    { key: "client", label: "Client", value: (t) => t.clientName, none: "No client" },
    { key: "matter", label: "Matter", value: (t) => t.matterName, none: "No matter" },
    {
      key: "tool",
      label: "Kind of work",
      value: (t) => toolFor(t)?.short ?? "",
      none: "Not yet known",
    },
    {
      key: "due",
      label: "When it's due",
      value: (t) => ATTENTION_LABEL[attentionOf(t, today)],
      none: "",
      order: Object.values(ATTENTION_LABEL),
    },
    /* By the date itself, rather than by how near it is. The buckets above
       answer "what needs me now"; these answer "what does March look like",
       which is the question asked when planning rather than when working. */
    {
      key: "deadline-month",
      label: "Deadline month",
      value: (t) => monthLabel(t.dueDate),
      none: "No deadline",
      order: monthOrder(rows.map((t) => t.dueDate)),
    },
    {
      key: "planned-month",
      label: "Month planned",
      value: (t) => monthLabel(t.plannedOn),
      none: "No day set",
      order: monthOrder(rows.map((t) => t.plannedOn)),
    },
    {
      key: "added-month",
      label: "Month added",
      value: (t) => monthLabel(t.createdAt),
      none: "",
      order: monthOrder(rows.map((t) => t.createdAt)),
    },
    {
      key: "priority",
      label: "Priority",
      value: (t) => PRIORITY_LABEL[t.priority],
      none: "",
      order: Object.values(PRIORITY_LABEL),
    },
  ];

  const views: LibView<Task>[] = [
    { key: "Mine", label: "My tasks", filter: (t) => t.status !== "Done" },
    { key: "Today", label: "Today", filter: inState("today") },
    { key: "Overdue", label: "Overdue", filter: inState("overdue") },
    { key: "Upcoming", label: "Upcoming", filter: inState("upcoming") },
    { key: "Waiting", label: "Waiting", filter: inState("waiting") },
    {
      key: "Priority",
      label: "Priority",
      filter: (t) => t.status !== "Done" && t.priority === "high",
    },
    { key: "Someday", label: "No date", filter: inState("someday") },
    { key: "Done", label: "Completed", filter: (t) => t.status === "Done" },
  ];

  const matterList = matters.map((m) => ({ id: m.id, name: m.name }));

  return (
    <AppShell
      section="tasks"
      breadcrumb={<Crumbs items={[{ label: "Tasks" }]} />}
      scroll={false}
      assistant={{
        key: "tasks",
        screen: "Tasks",
        intro: "Ask what is overdue, or what you are waiting on and from whom.",
      }}
    >
      {(notice || tasks.isError) && (
        <div
          role={tasks.isError ? "alert" : "status"}
          style={{
            padding: "8px 20px",
            color: tasks.isError ? C.red : C.muted,
            fontSize: 12.5,
          }}
        >
          {tasks.isError ? (tasks.error as Error).message : notice}
        </div>
      )}
      <div className="tasks-page">
        {page !== "tasks" && workspaceId ? (
          <div className="scripta-library tasks-side">
            <div className="scripta-library-inner">
              <header className="scripta-library-heading">
                <div>
                  <h1 className="scripta-page-title">Tasks</h1>
                  <p className="scripta-page-description">
                    {page === "plan"
                      ? "Plan the day, a month, a year or your wider strategy. Only you see your plans; any line can become a task."
                      : "Write the note that hands your work to someone else, with its tables and documents, then open it in your email to send. Only you see your handovers."}
                  </p>
                </div>
              </header>
              <TasksSwitch page={page} onChange={setPage} stateOf={pageState} />
              {page === "plan" ? (
                <PlanNotebook workspaceId={workspaceId} today={today} />
              ) : (
                <HandoverDesk workspaceId={workspaceId} />
              )}
            </div>
          </div>
        ) : (
          <Library
            storageKey="tasks"
            defaultMode="cards"
            title="Tasks"
            description="What needs doing across the workspace. Record it in one line; Scripta works out what it relates to and which tool does that kind of work."
            // The day's report is made of completed tasks and nothing else, so it
            // lives here rather than as a place of its own in the sidebar.
            secondary={{ label: "Work report", onClick: () => void navigate({ to: "/reports" }) }}
            beforeToolbar={
              <>
                <TasksSwitch page={page} onChange={setPage} stateOf={pageState} />
                <form
                  className="task-quick"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (draft.trim()) add.mutate(draft);
                  }}
                >
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Add a task — a name is enough"
                    aria-label="Add a task"
                    disabled={add.isPending}
                  />
                  <Button type="submit" variant="primary" disabled={!draft.trim() || add.isPending}>
                    {add.isPending ? "Adding…" : "Add"}
                  </Button>
                </form>
              </>
            }
            rows={rows}
            columns={columns}
            views={views}
            groups={groups}
            searchText={taskSearchText}
            searchPlaceholder="Search tasks"
            rowLabel={(t) => t.title}
            onOpen={() => {}}
            actions={(t) => [
              t.status === "Done"
                ? { label: "Reopen", onClick: () => patch.mutate({ id: t.id, status: "Open" }) }
                : {
                    label: "Mark complete",
                    onClick: () => patch.mutate({ id: t.id, status: "Done" }),
                  },
              {
                label: "Waiting on someone",
                onClick: () => patch.mutate({ id: t.id, status: "Waiting" }),
              },
              {
                label: t.priority === "high" ? "Clear priority" : "Make it a priority",
                onClick: () =>
                  patch.mutate({ id: t.id, priority: t.priority === "high" ? "normal" : "high" }),
              },
              {
                label: "Move to another workspace…",
                onClick: () =>
                  setMovingTask({
                    id: t.id,
                    title: t.title,
                    matterName: t.matterId ? (t.matterName ?? "a matter") : null,
                  }),
              },
              { label: "Delete", danger: true, onClick: () => void remove([t]) },
            ]}
            bulk={[
              {
                label: "Mark complete",
                onClick: (r) => r.forEach((t) => patch.mutate({ id: t.id, status: "Done" })),
              },
              { label: "Delete", danger: true, onClick: (r) => void remove(r) },
            ]}
            board={{
              columns: BOARD_STATUSES.map((s) => STATUS_LABEL[s]),
              column: (t) =>
                STATUS_LABEL[t.status === "Blocked" ? ("Waiting" as TaskStatus) : t.status],
              card: (t) => <TaskCard task={t} today={today} />,
            }}
            cards={(t) => (
              <TaskRow task={t} today={today} onPatch={(p) => patch.mutate({ id: t.id, ...p })} />
            )}
            detail={(t) => (
              <TaskDetail
                task={t}
                today={today}
                matters={matterList}
                onPatch={(p) => patch.mutate({ id: t.id, ...p })}
                onDelete={(task) => void remove([task])}
                onConvertToFlow={(task) =>
                  void navigate(
                    task.matterId
                      ? {
                          to: "/matters/$matterId",
                          params: { matterId: task.matterId },
                          search: { screen: "flows" } as never,
                        }
                      : ({ to: "/matters/flow" } as never),
                  )
                }
              />
            )}
            empty={tasks.isLoading ? <p role="status">Loading tasks…</p> : <FirstTime />}
          />
        )}
      </div>
      {confirmDialog}
      {movingTask && (
        <MoveTaskToWorkspace
          taskId={movingTask.id}
          taskTitle={movingTask.title}
          matterName={movingTask.matterName}
          currentWorkspaceId={workspaceId}
          open
          onClose={() => setMovingTask(null)}
        />
      )}
    </AppShell>
  );
}

type TasksPage = "tasks" | "plan" | "handover";

/** Tasks, the planner and handovers share a page; this is how you move between them. */
function TasksSwitch({
  page,
  onChange,
  stateOf,
}: {
  page: TasksPage;
  onChange: (page: TasksPage) => void;
  stateOf: (page: TasksPage) => "on" | "dim" | "hidden";
}) {
  const pages: [TasksPage, string][] = [
    ["tasks", "Tasks"],
    ["plan", "Plan"],
    ["handover", "Handover"],
  ];
  return (
    <div className="tasks-switch" role="group" aria-label="Tasks or plan">
      {pages
        .filter(([p]) => stateOf(p) !== "hidden")
        .map(([p, label]) => (
          <button
            key={p}
            type="button"
            aria-pressed={page === p}
            disabled={stateOf(p) === "dim"}
            title={stateOf(p) === "dim" ? "Coming soon" : undefined}
            onClick={() => onChange(p)}
          >
            {label}
          </button>
        ))}
    </div>
  );
}

/** The default view: a task, the way a task should read. */
function TaskRow({
  task,
  today,
  onPatch,
}: {
  task: Task;
  today: string;
  onPatch: (patch: TaskPatch) => void;
}) {
  const attention = attentionOf(task, today);
  const tool = toolFor(task);
  const done = task.status === "Done";
  return (
    <div className={`task-row${done ? " is-done" : ""}`}>
      <input
        type="checkbox"
        checked={done}
        aria-label={`Mark ${task.title} complete`}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          e.stopPropagation();
          onPatch({ status: done ? "Open" : "Done" });
        }}
      />
      <div className="task-row-body">
        <div className="task-row-title">{task.title}</div>
        <div className="task-row-meta">
          {taskContext(task) && <span>{taskContext(task)}</span>}
          {task.dueDate && <span>Due {shortDate(task.dueDate)}</span>}
          {task.plannedOn && !task.dueDate && <span>Work on {shortDate(task.plannedOn)}</span>}
          {task.priority === "high" && <span className="is-priority">High</span>}
          {task.checklist.length > 0 && (
            <span>
              {task.checklist.filter((c) => c.done).length}/{task.checklist.length}
            </span>
          )}
          {task.threads.length > 0 && (
            <span>
              {task.threads.length} {task.threads.length === 1 ? "reply" : "replies"}
            </span>
          )}
          {tool && !done && <span className="is-tool">{tool.short}</span>}
        </div>
      </div>
      <AssigneeMark userId={task.assigneeId} />
      {!done && attention !== "someday" && (
        <span className={`task-chip is-${attention}`}>{ATTENTION_LABEL[attention]}</span>
      )}
    </div>
  );
}

function TaskCard({ task, today }: { task: Task; today: string }) {
  const attention = attentionOf(task, today);
  return (
    <div className="task-card">
      <div className="task-card-title">{task.title}</div>
      <div className="task-row-meta">
        {taskContext(task) && <span>{taskContext(task)}</span>}
        {task.dueDate && <span>Due {shortDate(task.dueDate)}</span>}
        {task.priority === "high" && <span className="is-priority">High</span>}
      </div>
      {task.status !== "Done" && attention !== "someday" && (
        <span className={`task-chip is-${attention}`}>{ATTENTION_LABEL[attention]}</span>
      )}
    </div>
  );
}

function FirstTime() {
  return (
    <div className="tasks-first">
      <h2>Nothing waiting on you</h2>
      <p>
        Type anything into the box above and it is recorded. A name is enough — the date, the matter
        and the rest can be added once it exists.
      </p>
      <p>
        Tasks also arrive on their own: a deliverable in Flow, a point raised in a review, an action
        out of a meeting. Scripta suggests them; you decide what becomes a task.
      </p>
    </div>
  );
}
