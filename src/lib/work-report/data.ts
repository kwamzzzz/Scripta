/**
 * Reading a day out of the tasks you completed, and freezing it when it ends.
 *
 * Nothing here writes a new record of what you did — the tasks were already
 * there, marked complete by you. The report is a reading of them, which is why
 * a day you never opened still has a correct one waiting, and why no scheduled
 * job has to succeed for it to be right.
 *
 * Freezing matters for the opposite reason: once a day is over, the report is a
 * statement about that day and must stop moving. Rename a task next week and
 * last Tuesday still says what you did last Tuesday.
 */
import { supabase } from "@/integrations/supabase/client";
import { TOOLS, type ToolKey } from "@/lib/tasks/model";
import { dayBounds, type WorkEntry, type WorkReport } from "./model";

const str = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * The tasks completed on this day.
 *
 * One source, on purpose. A task is the only place in Scripta where somebody
 * has deliberately said "that is finished" — everything else is a trace of work
 * happening, and a report built from traces is an activity feed. The task
 * carries what the report needs with it: the matter it was filed to, the tool
 * it was work for, and what it produced.
 *
 * AND YOURS ALONE. The report is personal to the lawyer who did the work. A
 * supervisor does not read it: they see the work itself — the matter, the flow,
 * the tasks, the deliverables, the approvals — where they have access to the
 * matter, which is a view of the work rather than a view of the person. Turning
 * this into something a manager reads would make it surveillance, and the day
 * it became surveillance is the day people stopped writing honest notes in it.
 *
 * That is what `completed_by` is for. It used to be absent, which in a firm of
 * one was harmless and in a firm of two would have quietly credited your day
 * with a colleague's work. It is now stamped by a database trigger rather than
 * by whichever screen closed the task, because a completion recorded against
 * the wrong author is worse than one recorded against nobody.
 *
 * If management reporting is ever needed, it is a separate capability built on
 * the shared work — never this.
 */
export async function deriveDay(
  workspaceId: string,
  userId: string,
  day: string,
): Promise<WorkEntry[]> {
  const { from, to } = dayBounds(day);

  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, completed_at, matter_id, tool, output_label, matters(name)")
    .eq("workspace_id", workspaceId)
    .eq("completed_by", userId)
    .not("completed_at", "is", null)
    .gte("completed_at", from)
    .lt("completed_at", to);
  if (error) throw new Error(error.message);

  return ((data ?? []) as any[])
    .map((row): WorkEntry => {
      const tool = row.tool ? TOOLS[row.tool as ToolKey]?.short : undefined;
      return {
        id: `task:${row.id}`,
        title: str(row.title),
        at: str(row.completed_at),
        matterId: row.matter_id ?? null,
        matterName: str(row.matters?.name),
        ...(tool ? { tool } : {}),
        ...(row.output_label ? { output: str(row.output_label) } : {}),
        href: "/tasks",
      };
    })
    .sort((a, b) => a.at.localeCompare(b.at));
}

/** The frozen report for a day, if that day has been closed off. */
export async function loadSaved(
  workspaceId: string,
  userId: string,
  day: string,
): Promise<WorkReport | null> {
  const { data, error } = await supabase
    .from("work_reports")
    .select("day, entries, note, generated_at")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .eq("day", day)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as any;
  return {
    day: str(row.day),
    entries: Array.isArray(row.entries) ? (row.entries as WorkEntry[]) : [],
    note: str(row.note),
    savedAt: str(row.generated_at),
  };
}

/**
 * The day as it should read now: the frozen record where there is one, the
 * live derivation where there is not.
 */
export async function readDay(
  workspaceId: string,
  userId: string,
  day: string,
): Promise<WorkReport> {
  const saved = await loadSaved(workspaceId, userId, day);
  if (saved) return saved;
  return { day, entries: await deriveDay(workspaceId, userId, day), note: "", savedAt: null };
}

/**
 * Freeze a day.
 *
 * Called when the day has closed and the report is opened, and by hand from the
 * screen — including for a day long past, which simply derives it now and keeps
 * the result. Re-saving replaces the snapshot, which is what "regenerate"
 * means: go and look again.
 */
export async function saveDay(
  workspaceId: string,
  userId: string,
  day: string,
  report: { entries: WorkEntry[]; note: string },
): Promise<void> {
  const { error } = await supabase.from("work_reports").upsert(
    {
      workspace_id: workspaceId,
      user_id: userId,
      day,
      entries: report.entries as never,
      note: report.note || null,
      generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: "workspace_id,user_id,day" },
  );
  if (error) throw new Error(error.message);
}

/** Every day already frozen, newest first: the searchable work history. */
export async function listSaved(workspaceId: string, userId: string): Promise<WorkReport[]> {
  const { data, error } = await supabase
    .from("work_reports")
    .select("day, entries, note, generated_at")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .order("day", { ascending: false })
    .limit(400);
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((row) => ({
    day: str(row.day),
    entries: Array.isArray(row.entries) ? (row.entries as WorkEntry[]) : [],
    note: str(row.note),
    savedAt: str(row.generated_at),
  }));
}
