/**
 * The planner: a running notebook, newest first, where you plan a day, a
 * month, a year, or the strategy behind them. Written freely, one thought per line.
 *
 * It is deliberately not a task list. Nothing in it is due, nothing nags, and
 * a line becomes a task only when you press "Make task" beside it; the entry
 * then marks that line so it is not made twice. Plans are yours alone.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/primitives";
import ActionMenu from "@/components/ActionMenu";
import ActionError, { attempt } from "@/components/ActionError";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import {
  PLAN_SCOPES,
  addPlan,
  deletePlan,
  listPlan,
  makeTaskFromLine,
  periodLabel,
  periodStart,
  planKey,
  setPlanArchived,
  taskTitle,
  updatePlan,
  type PlanDraft,
  type PlanEntry,
} from "@/lib/planner";
import "./planner.css";

export default function PlanNotebook({
  workspaceId,
  today,
}: {
  workspaceId: string;
  today: string;
}) {
  const qc = useQueryClient();
  const key = planKey(workspaceId);
  const plan = useQuery({ queryKey: key, retry: false, queryFn: () => listPlan(workspaceId) });
  const [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { confirmDelete, confirmDialog } = useConfirmDelete();

  const all = plan.data ?? [];
  const live = all.filter((e) => !e.archivedAt);
  const shown = archived ? all.filter((e) => e.archivedAt) : live;
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  const archive = async (entry: PlanEntry, on: boolean) => {
    const ok = await attempt(
      on ? "The plan could not be archived" : "The plan could not be restored",
      () => setPlanArchived(entry.id, on),
      setError,
    );
    if (ok) await refresh();
  };

  const remove = async (entry: PlanEntry) => {
    const yes = await confirmDelete({
      what: `the plan for ${periodLabel(entry.scope, entry.forDate)}`,
      binned: false,
      ...(entry.madeTasks.length
        ? { consequence: "Tasks made from it stay on your task list." }
        : {}),
    });
    if (!yes) return;
    const ok = await attempt("The plan could not be deleted", () => deletePlan(entry.id), setError);
    if (ok) await refresh();
  };

  const makeTask = async (entry: PlanEntry, line: string) => {
    const ok = await attempt(
      "The task could not be made",
      () => makeTaskFromLine(workspaceId, entry, line),
      setError,
    );
    if (ok) {
      await refresh();
      await qc.invalidateQueries({ queryKey: ["tasks", workspaceId] });
    }
  };

  return (
    <div className="plan">
      <ActionError error={error} onDismiss={() => setError(null)} />
      {!archived && (
        <PlanEditor
          key={`new-${all.length}`}
          initial={{ scope: "day", forDate: today, body: "" }}
          submit="Save plan"
          onSave={async (draft) => {
            const ok = await attempt(
              "The plan could not be saved",
              () => addPlan(workspaceId, draft),
              setError,
            );
            if (ok) await refresh();
          }}
        />
      )}

      <div className="plan-bar">
        <button
          type="button"
          aria-pressed={!archived}
          className={!archived ? "is-on" : undefined}
          onClick={() => setArchived(false)}
        >
          Plans <span>{live.length}</span>
        </button>
        <button
          type="button"
          aria-pressed={archived}
          className={archived ? "is-on" : undefined}
          onClick={() => setArchived(true)}
        >
          Archived <span>{all.length - live.length}</span>
        </button>
      </div>

      {plan.isError && (
        <p className="org-error" role="alert">
          {(plan.error as Error).message}
        </p>
      )}
      {plan.isSuccess && shown.length === 0 && (
        <p className="plan-empty">
          {archived
            ? "Nothing archived."
            : "Plan your day, a month, a year or your wider strategy. Write freely; any line can become a task."}
        </p>
      )}

      {shown.map((entry) =>
        editing === entry.id ? (
          <PlanEditor
            key={entry.id}
            initial={{ scope: entry.scope, forDate: entry.forDate ?? today, body: entry.body }}
            submit="Save"
            onCancel={() => setEditing(null)}
            onSave={async (draft) => {
              const ok = await attempt(
                "The plan could not be saved",
                () => updatePlan(entry.id, draft),
                setError,
              );
              if (ok) {
                await refresh();
                setEditing(null);
              }
            }}
          />
        ) : (
          <PlanCard
            key={entry.id}
            entry={entry}
            onEdit={() => setEditing(entry.id)}
            onArchive={(on) => void archive(entry, on)}
            onDelete={() => void remove(entry)}
            onMakeTask={(line) => makeTask(entry, line)}
          />
        ),
      )}
      {confirmDialog}
    </div>
  );
}

function PlanCard({
  entry,
  onEdit,
  onArchive,
  onDelete,
  onMakeTask,
}: {
  entry: PlanEntry;
  onEdit: () => void;
  onArchive: (on: boolean) => void;
  onDelete: () => void;
  onMakeTask: (line: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState<number | null>(null);
  const made = new Set(entry.madeTasks.map((m) => m.line));
  const lines = entry.body.split("\n");
  return (
    <article
      className={`plan-card is-${entry.scope}${entry.archivedAt ? " is-archived" : ""}`}
      onDoubleClick={() => !entry.archivedAt && onEdit()}
    >
      <header className="plan-card-head">
        <h3>{periodLabel(entry.scope, entry.forDate)}</h3>
        {entry.scope !== "open" && (
          <span className="plan-scope">{PLAN_SCOPES.find((s) => s.id === entry.scope)?.label}</span>
        )}
        <span className="plan-spacer" />
        {!entry.archivedAt && (
          <button type="button" className="plan-link" onClick={onEdit}>
            Edit
          </button>
        )}
        <ActionMenu
          label={`plan for ${periodLabel(entry.scope, entry.forDate)}`}
          actions={[
            ...(entry.archivedAt ? [] : [{ label: "Edit", onClick: onEdit }]),
            entry.archivedAt
              ? { label: "Restore", onClick: () => onArchive(false) }
              : { label: "Archive", onClick: () => onArchive(true) },
            { label: "Delete", danger: true, onClick: onDelete },
          ]}
        />
      </header>
      <ul className="plan-lines">
        {lines.map((line, i) =>
          line.trim() ? (
            <li key={i}>
              <span className="plan-line">{line}</span>
              {made.has(line.trim()) ? (
                <span className="plan-made">Task made</span>
              ) : (
                !entry.archivedAt &&
                taskTitle(line) && (
                  <button
                    type="button"
                    className="plan-make"
                    disabled={busy !== null}
                    onClick={async () => {
                      setBusy(i);
                      try {
                        await onMakeTask(line);
                      } finally {
                        setBusy(null);
                      }
                    }}
                  >
                    {busy === i ? "Making…" : "Make task"}
                  </button>
                )
              )}
            </li>
          ) : (
            <li key={i} className="plan-gap" aria-hidden="true" />
          ),
        )}
      </ul>
    </article>
  );
}

/** A few years either side of now, and the one chosen if it lies outside. */
const years = (date: string) => {
  const now = new Date().getFullYear();
  const list = Array.from({ length: 8 }, (_, i) => String(now - 2 + i));
  const chosen = date.slice(0, 4);
  return chosen && !list.includes(chosen) ? [chosen, ...list].sort() : list;
};

function PlanEditor({
  initial,
  submit,
  onSave,
  onCancel,
}: {
  initial: PlanDraft;
  submit: string;
  onSave: (draft: PlanDraft) => Promise<void>;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState<PlanDraft>(initial);
  const [busy, setBusy] = useState(false);
  const body = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!onCancel) return;
    const el = body.current;
    el?.focus();
    el?.setSelectionRange(el.value.length, el.value.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // The page grows with the plan, so a long one is read whole.
  useEffect(() => {
    const el = body.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(onCancel ? 140 : 96, el.scrollHeight)}px`;
  }, [draft.body, onCancel]);

  const date = draft.forDate ?? "";
  const setDate = (v: string) => setDraft((d) => ({ ...d, forDate: v || d.forDate }));
  const empty = !draft.body.trim();
  const save = async () => {
    if (empty || busy) return;
    setBusy(true);
    try {
      await onSave(draft);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="plan-card is-editing"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && onCancel) {
          e.preventDefault();
          onCancel();
        } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          void save();
        }
      }}
    >
      <div className="plan-editor-head">
        <div className="plan-scopes" role="group" aria-label="What this plans">
          {PLAN_SCOPES.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={draft.scope === s.id}
              className={draft.scope === s.id ? "is-on" : undefined}
              onClick={() => setDraft((d) => ({ ...d, scope: s.id }))}
            >
              {s.label}
            </button>
          ))}
        </div>
        {draft.scope === "day" && (
          <input
            type="date"
            aria-label="Day"
            value={date.slice(0, 10)}
            onChange={(e) => setDate(e.target.value)}
          />
        )}
        {draft.scope === "month" && (
          <input
            type="month"
            aria-label="Month"
            value={date.slice(0, 7)}
            onChange={(e) => setDate(e.target.value ? `${e.target.value}-01` : "")}
          />
        )}
        {draft.scope === "year" && (
          <select
            aria-label="Year"
            value={date.slice(0, 4)}
            onChange={(e) => setDate(`${e.target.value}-01-01`)}
          >
            {years(date).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        )}
        <span className="plan-for">
          {periodLabel(draft.scope, periodStart(draft.scope, draft.forDate))}
        </span>
      </div>
      <textarea
        ref={body}
        value={draft.body}
        aria-label="Plan"
        placeholder={
          draft.scope === "day"
            ? "What the day looks like. One thought per line."
            : draft.scope === "open"
              ? "Strategic priorities: what you are working towards."
              : "What you mean to get done. One thought per line."
        }
        onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
      />
      <div className="plan-editor-foot">
        <span className="plan-hint">⌘Enter to save{onCancel ? " · Esc to cancel" : ""}</span>
        {onCancel && <Button onClick={onCancel}>Cancel</Button>}
        <Button variant="primary" type="submit" disabled={empty || busy}>
          {busy ? "Saving…" : submit}
        </Button>
      </div>
    </form>
  );
}
