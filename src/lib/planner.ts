/**
 * The planner: a running notebook for planning a day, a month, a year, or the
 * strategy behind them. Not a task list. Any line can be made into a task when its
 * author wants one, and the entry remembers which lines were.
 *
 * Plans are personal: the database lets only the author see them.
 */
import { supabase } from "@/integrations/supabase/client";
import { quickAdd } from "@/lib/tasks/data";

export type PlanScope = "day" | "month" | "year" | "open";

export const PLAN_SCOPES: { id: PlanScope; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
  { id: "open", label: "Strategic" },
];

export type MadeTask = { line: string; taskId: string };

export type PlanEntry = {
  id: string;
  scope: PlanScope;
  /** The day planned, or the first of the month or year; null for a strategic plan. */
  forDate: string | null;
  body: string;
  madeTasks: MadeTask[];
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export type PlanDraft = { scope: PlanScope; forDate: string | null; body: string };

export const planKey = (workspaceId: string | null) => ["plan-entries", workspaceId];

const scopeOf = (v: unknown): PlanScope =>
  v === "month" || v === "year" || v === "open" ? v : "day";

/** The date an entry is filed under: the day, or the first of its month or year. */
export function periodStart(scope: PlanScope, day: string | null): string | null {
  if (scope === "open" || !day) return null;
  if (scope === "month") return `${day.slice(0, 7)}-01`;
  if (scope === "year") return `${day.slice(0, 4)}-01-01`;
  return day.slice(0, 10);
}

/** "Friday 18 September 2026", "September 2026", "2026" or "Strategic plan". */
export function periodLabel(scope: PlanScope, forDate: string | null): string {
  if (scope === "open" || !forDate) return "Strategic plan";
  const d = new Date(`${forDate}T00:00:00`);
  if (scope === "year") return String(d.getFullYear());
  if (scope === "month") return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const weekday = d.toLocaleDateString("en-GB", { weekday: "long" });
  return `${weekday} ${d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`;
}

/**
 * A line as a task name: without the bullet, checkbox or time it was written
 * with. "- [ ] 9:30 Call Bugatti" becomes "Call Bugatti".
 */
export function taskTitle(line: string): string {
  return line
    .trim()
    .replace(/^([-*•·]|\d+[.)])\s+/, "")
    .replace(/^\[[ xX]?\]\s*/, "")
    .replace(/^\d{1,2}([:.]\d{2})?\s*(am|pm)?\s*[-–:]?\s+/i, "")
    .trim();
}

export async function listPlan(workspaceId: string): Promise<PlanEntry[]> {
  const { data, error } = await supabase
    .from("plan_entries")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    scope: scopeOf(r.scope),
    forDate: r.for_date,
    body: r.body ?? "",
    madeTasks: Array.isArray(r.made_tasks) ? (r.made_tasks as MadeTask[]) : [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    archivedAt: r.archived_at,
  }));
}

const clean = (draft: PlanDraft) => {
  const body = draft.body.replace(/\s+$/, "");
  if (!body.trim()) throw new Error("Write something in the plan first.");
  return { scope: draft.scope, for_date: periodStart(draft.scope, draft.forDate), body };
};

export async function addPlan(workspaceId: string, draft: PlanDraft): Promise<void> {
  const { error } = await supabase
    .from("plan_entries")
    .insert({ workspace_id: workspaceId, ...clean(draft) });
  if (error) throw new Error(error.message);
}

export async function updatePlan(id: string, draft: PlanDraft): Promise<void> {
  const { error } = await supabase.from("plan_entries").update(clean(draft)).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setPlanArchived(id: string, archived: boolean): Promise<void> {
  const { error } = await supabase
    .from("plan_entries")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deletePlan(id: string): Promise<void> {
  const { error } = await supabase.from("plan_entries").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Make one line of a plan into a task. A day's plan puts the task on that day
 * ("planned on", not a deadline); a longer plan leaves the date to the task.
 */
export async function makeTaskFromLine(
  workspaceId: string,
  entry: PlanEntry,
  line: string,
): Promise<void> {
  const title = taskTitle(line);
  if (!title) throw new Error("That line has nothing to make a task of.");
  const taskId = await quickAdd(workspaceId, {
    title,
    plannedOn: entry.scope === "day" ? entry.forDate : null,
  });
  const madeTasks: MadeTask[] = [...entry.madeTasks, { line: line.trim(), taskId }];
  const { error } = await supabase
    .from("plan_entries")
    .update({ made_tasks: madeTasks as never })
    .eq("id", entry.id);
  if (error) throw new Error(error.message);
}
