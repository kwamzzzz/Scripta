/**
 * One task, in full.
 *
 * The difference between this and a to-do list is the tool button: a task here
 * knows what it relates to and which tool does that kind of work, so it can be
 * started rather than merely ticked. Everything else exists to let a lawyer
 * judge whether to start it now.
 *
 * Built on the same grammar as every other detail panel — `scripta-matter-detail`
 * from Corporate Drafting, Contract Drafting and Matters: title, one muted line
 * of context, the action that matters, then sections. A task needs more
 * interaction than a document preview, so the properties are editable in place
 * the way a matter's are; they are not a form, and they do not each get a
 * caption. What a lawyer changes daily is on the surface, the rest is folded
 * away, and deleting is in the "…" menu where destructive actions live
 * everywhere else in Scripta.
 */
import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import ActionMenu, { type MenuAction } from "@/components/ActionMenu";
import Thread from "@/components/Thread";
import { useTaskActions, useWorkActions } from "@/lib/work";
import StatusPill, { type StatusTone } from "@/components/StatusPill";
import { Button } from "@/components/primitives";
import { relTime } from "@/lib/home-data";
import {
  ATTENTION_LABEL,
  ORIGIN_LABEL,
  PRIORITIES,
  PRIORITY_LABEL,
  STATUS_LABEL,
  TASK_STATUSES,
  TOOLS,
  attentionOf,
  outgrownTask,
  suggestTool,
  toolFor,
  type Attention,
  type ChecklistItem,
  type Task,
  type TaskPriority,
  type TaskStatus,
  type ToolKey,
} from "@/lib/tasks/model";
import type { TaskPatch } from "@/lib/tasks/data";
import Correspondence from "./Correspondence";
import Attachments, { useTaskAttachments } from "./Attachments";
import { PersonPicker } from "@/components/Person";
import { useFirmPeople, useMatterTeam } from "@/lib/matter-team";
import ClientPicker from "@/components/ClientPicker";
import { NO_CLIENT } from "@/components/client-choice";
import { resolveClient } from "@/lib/organise";
import { useApp } from "@/store/app";
import { useOpenFlow } from "@/lib/host-frame";
// The panel is also opened inside a client, so it brings its own styles.
import "@/components/library.css";
import "../tasks-screen.css";

const uid = () => globalThis.crypto?.randomUUID?.() ?? String(Math.random());

/**
 * What the attention state means, in the six meanings StatusPill knows. Overdue
 * is the only one drawn as a problem: a task with no date is not a failure, and
 * colouring it like one would make the panel shout at a list that is fine.
 */
const ATTENTION_TONE: Record<Attention, StatusTone> = {
  overdue: "danger",
  today: "warning",
  upcoming: "progress",
  waiting: "neutral",
  someday: "neutral",
  done: "good",
};

export default function TaskDetail({
  task,
  today,
  matters,
  onPatch,
  onDelete,
  onConvertToFlow,
}: {
  task: Task;
  today: string;
  matters: { id: string; name: string }[];
  onPatch: (patch: TaskPatch) => void;
  onDelete: (task: Task) => void;
  onConvertToFlow: (task: Task) => void;
}) {
  const navigate = useNavigate();
  const openFlow = useOpenFlow();
  const [title, setTitle] = useState(task.title);
  const [detail, setDetail] = useState(task.detail);
  const [item, setItem] = useState("");
  // Dropping a file on the panel is the same act as reaching for the button in
  // the attachments section, so both go through one hook.
  const attach = useTaskAttachments(task, onPatch);
  const [dropping, setDropping] = useState(false);

  // A different task selected replaces the fields; typing in them does not.
  useEffect(() => {
    setTitle(task.title);
    setDetail(task.detail);
    setItem("");
  }, [task.id, task.title, task.detail]);

  const tool = toolFor(task);
  // What the words alone would say, shown as the default option so choosing
  // "no tool" and "whatever Scripta thinks" stay distinguishable.
  const suggested = suggestTool(task.title, task.detail);
  const attention = attentionOf(task, today);
  const done = task.status === "Done";
  const ticked = task.checklist.filter((c) => c.done).length;
  const setChecklist = (next: ChecklistItem[]) => onPatch({ checklist: next });

  const menu: MenuAction[] = [
    ...(outgrownTask(task)
      ? [{ label: "Convert to a Flow", onClick: () => onConvertToFlow(task) }]
      : []),
    { label: "Delete task", danger: true, onClick: () => onDelete(task) },
  ];

  // The matter's team where the task has a matter; the firm where it has none.
  const { workspaceId } = useApp();
  const actions = useTaskActions(task.id);
  const work = useWorkActions();
  const [declining, setDeclining] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [workProblem, setWorkProblem] = useState<string | null>(null);
  const team = useMatterTeam(task.matterId);
  const firm = useFirmPeople(task.matterId ? null : workspaceId);
  const assignable = task.matterId ? (team.data ?? []) : (firm.data ?? []);

  return (
    <div
      className={`scripta-matter-detail task-detail${dropping ? " is-dropping" : ""}`}
      onDragOver={(e) => {
        // Only a file drag: dragging text around the notes field is not an
        // attempt to attach anything.
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDropping(false);
        void attach.attachFiles(e.dataTransfer.files);
      }}
    >
      <header>
        <input
          className="task-detail-title"
          value={title}
          aria-label="Task name"
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== task.title && onPatch({ title })}
        />
        <p>
          Added {relTime(task.createdAt)}
          {task.origin && task.origin !== "manual" ? ` · from ${ORIGIN_LABEL[task.origin]}` : ""}
        </p>
      </header>

      {/* The one thing to know before reading anything else, and the one thing
          to do about it. Delete sits in the menu at the end, a long way down
          the hierarchy from finishing the work. */}
      <div className="task-detail-actions">
        {done ? (
          <Button onClick={() => onPatch({ status: "Open" })}>Reopen</Button>
        ) : (
          <Button variant="primary" onClick={() => onPatch({ status: "Done" })}>
            Mark complete
          </Button>
        )}
        {tool && !done && (
          <Button onClick={() => void navigate({ to: tool.to } as never)} title={tool.because}>
            {tool.label} <ArrowRight size={14} aria-hidden="true" />
          </Button>
        )}
        <ActionMenu label={task.title} actions={menu} />
      </div>

      {/* Status, priority and the two dates are changed constantly, so they are
          controls rather than a form: a label in the same 90px column the other
          panels put their `dt` in, and a field that stays quiet until reached
          for. No captions — the names carry the difference, and the one
          distinction that genuinely needs saying is on the tooltip. */}
      <section className="task-detail-meta">
        <h3>
          Where it stands
          <StatusPill label={ATTENTION_LABEL[attention]} tone={ATTENTION_TONE[attention]} />
        </h3>
        <div className="task-meta-grid">
          <label>
            <span>Status</span>
            <select
              value={task.status}
              onChange={(e) => onPatch({ status: e.target.value as TaskStatus })}
            >
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Priority</span>
            <select
              value={task.priority}
              onChange={(e) => onPatch({ priority: e.target.value as TaskPriority })}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
          <label title="A real deadline — the date the work is owed by.">
            <span>Deadline</span>
            <input
              type="date"
              value={task.dueDate ?? ""}
              onChange={(e) => onPatch({ dueDate: e.target.value || null })}
            />
          </label>
          <label title="The day you mean to do it. Not a deadline.">
            <span>Planned</span>
            <input
              type="date"
              value={task.plannedOn ?? ""}
              onChange={(e) => onPatch({ plannedOn: e.target.value || null })}
            />
          </label>
          {task.deliverableId ? (
            /* A task raised in a flow is filed wherever its flow is. Offering a
               matter here would put a second answer beside that one. */
            <div className="task-detail-filing">
              <span>Flow</span>
              <div className="org-filing">
                {task.flowId ? (
                  <Link
                    to="/flows/$flowId"
                    params={{ flowId: task.flowId }}
                    onClick={(event) => {
                      // Opened inside a client, the flow opens inside it too.
                      if (event.metaKey || event.ctrlKey || event.shiftKey) return;
                      event.preventDefault();
                      openFlow(task.flowId!);
                    }}
                  >
                    {task.flowName || "Open the flow"}
                  </Link>
                ) : (
                  <strong>{task.flowName || "A flow"}</strong>
                )}
                {task.matterName && task.matterName !== task.flowName && (
                  <>
                    <span aria-hidden>·</span>
                    <span>{task.matterName}</span>
                  </>
                )}
                {task.clientName && (
                  <>
                    <span aria-hidden>·</span>
                    <span>{task.clientName}</span>
                  </>
                )}
              </div>
            </div>
          ) : (
            <>
              <label>
                <span>Matter</span>
                <select
                  value={task.matterId ?? ""}
                  onChange={(e) => onPatch({ matterId: e.target.value || null })}
                >
                  <option value="">Not filed to a matter</option>
                  {matters.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              {/* A task filed to a matter is for that matter's client. Only an
                  unfiled task names a client of its own. */}
              {task.matterId ? (
                task.clientName && (
                  <div className="task-detail-filing">
                    <span>Client</span>
                    <div className="org-filing">
                      <span>{task.clientName}</span>
                    </div>
                  </div>
                )
              ) : (
                <div className="task-detail-client">
                  <ClientPicker
                    value={
                      task.clientId
                        ? { kind: "existing", id: task.clientId, name: task.clientName }
                        : NO_CLIENT
                    }
                    onChange={(choice) => {
                      if (!workspaceId) return;
                      void resolveClient(workspaceId, choice)
                        .then((clientId) => onPatch({ clientId }))
                        .catch((cause: unknown) =>
                          setWorkProblem(
                            cause instanceof Error ? cause.message : "The client was not saved.",
                          ),
                        );
                    }}
                  />
                </div>
              )}
            </>
          )}
          {/* Responsibility points at a person or at nobody. Where the task is
              filed to a matter the choices are that matter's team, because
              responsibility for part of a file cannot sit with somebody who is
              not on it; an unfiled task is firm business and offers the firm. */}
          <label title="Who is doing this. Somebody on the matter, or nobody yet.">
            <span>Assignee</span>
            <PersonPicker
              value={task.assigneeId}
              team={assignable}
              onChange={(assigneeId) => {
                /* Filed work is handed over through assign_work: it checks that
                   the person is on the matter and writes the audit row that IS
                   the reassignment history. Unfiled work is author-only — there
                   is nobody to hand it to — so it stays a plain patch. */
                setWorkProblem(null);
                if (!task.matterId) {
                  onPatch({ assigneeId });
                  return;
                }
                void work.assign
                  .mutateAsync({ taskId: task.id, to: assigneeId })
                  .catch((cause: unknown) =>
                    setWorkProblem(
                      cause instanceof Error ? cause.message : "The handover was refused.",
                    ),
                  );
              }}
            />
          </label>
        </div>
      </section>

      {/* Declining. Only a request can be declined, only by the person asked,
          and only with a reason — the database enforces all three, and this
          control is drawn from what it reports rather than from a role compared
          here. The task returns to whoever asked; it does not vanish. */}
      {(actions.data?.iMayDecline || workProblem) && (
        <section className="task-detail-notes">
          {workProblem && (
            <p role="alert" className="task-detail-problem">
              {workProblem}
            </p>
          )}
          {actions.data?.iMayDecline &&
            (declining ? (
              <div style={{ display: "grid", gap: 8 }}>
                <textarea
                  aria-label="Why are you declining?"
                  placeholder="Why? The person who asked needs to know what to do next."
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <Button
                    variant="primary"
                    disabled={!declineReason.trim() || work.decline.isPending}
                    onClick={() => {
                      setWorkProblem(null);
                      void work.decline
                        .mutateAsync({ taskId: task.id, reason: declineReason.trim() })
                        .then(() => {
                          setDeclining(false);
                          setDeclineReason("");
                        })
                        .catch((cause: unknown) =>
                          setWorkProblem(
                            cause instanceof Error ? cause.message : "It could not be declined.",
                          ),
                        );
                    }}
                  >
                    Send it back
                  </Button>
                  <Button variant="quiet" onClick={() => setDeclining(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="secondary" onClick={() => setDeclining(true)}>
                Decline this request
              </Button>
            ))}
        </section>
      )}

      <section className="task-detail-notes">
        <h3>Notes</h3>
        <textarea
          rows={3}
          value={detail}
          aria-label="Notes"
          placeholder="Anything you would want to read before starting."
          onChange={(e) => setDetail(e.target.value)}
          onBlur={() => detail !== task.detail && onPatch({ detail })}
        />
      </section>

      <section className="task-detail-checklist">
        <h3>
          Checklist
          {task.checklist.length > 0 && (
            <span className="task-detail-count">
              {ticked} of {task.checklist.length}
            </span>
          )}
        </h3>
        {task.checklist.map((c) => (
          <div key={c.id} className={`task-check${c.done ? " is-done" : ""}`}>
            <input
              type="checkbox"
              checked={c.done}
              aria-label={c.text}
              onChange={() =>
                setChecklist(
                  task.checklist.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)),
                )
              }
            />
            <span>{c.text}</span>
            <button
              type="button"
              aria-label={`Remove ${c.text}`}
              onClick={() => setChecklist(task.checklist.filter((x) => x.id !== c.id))}
            >
              ×
            </button>
          </div>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!item.trim()) return;
            setChecklist([...task.checklist, { id: uid(), text: item.trim(), done: false }]);
            setItem("");
          }}
        >
          <input
            value={item}
            onChange={(e) => setItem(e.target.value)}
            placeholder="Add a step"
            aria-label="Add a checklist step"
          />
        </form>
        {outgrownTask(task) && (
          <div className="task-outgrown">
            <strong>This is starting to look like a process, not a task.</strong>
            <p>
              Phases, several deliverables and things that wait on each other are what Flow is for.
              The task stays, linked to it.
            </p>
            <Button onClick={() => onConvertToFlow(task)}>Convert to a Flow</Button>
          </div>
        )}
      </section>

      <Attachments task={task} attach={attach} />

      <Correspondence task={task} onPatch={onPatch} />

      {/* Folded away: which tool does this kind of work is decided once, if
          ever, and the sentence explaining the suggestion belongs beside the
          control that sets it rather than permanently under the button. */}
      <details className="task-detail-more">
        <summary>Tool</summary>
        <div className="task-meta-grid">
          <label>
            <span>Do this in</span>
            <select
              value={task.tool ?? ""}
              onChange={(e) => onPatch({ tool: (e.target.value || null) as ToolKey | null })}
            >
              <option value="">
                {suggested ? `Scripta suggests ${suggested.short}` : "Scripta has no suggestion"}
              </option>
              {(Object.keys(TOOLS) as ToolKey[]).map((k) => (
                <option key={k} value={k}>
                  {TOOLS[k].short}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p>
          {tool
            ? tool.because
            : "A suggestion, never a rule. Complete it by hand if that is the job."}
        </p>
      </details>

      {task.output && (
        <section>
          <h3>What it produced</h3>
          <dl>
            <dt>
              {task.output.kind ? (ORIGIN_LABEL[task.output.kind] ?? task.output.kind) : "Made"}
            </dt>
            <dd>{task.output.label}</dd>
          </dl>
        </section>
      )}

      {/* The discussion sits below the work and above the history, which is
          the order a person reads a task in: what it is, what was said about
          it, what has happened to it. */}
      <section className="scripta-matter-activity">
        <Thread
          kind="task"
          entityId={task.id}
          workspaceId={workspaceId}
          title="Discussion"
          blurb="Questions and decisions about this task, kept with it."
          reviewLabel={`Review: ${task.title}`}
        />
      </section>

      <section className="scripta-matter-activity">
        <h3>Activity</h3>
        <p>
          Added {relTime(task.createdAt)}
          {task.updatedAt !== task.createdAt ? ` · changed ${relTime(task.updatedAt)}` : ""}
          {task.completedAt ? ` · completed ${relTime(task.completedAt)}` : ""}
        </p>
      </section>
    </div>
  );
}
