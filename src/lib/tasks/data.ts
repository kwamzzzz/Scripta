/**
 * Reading and writing tasks.
 *
 * Capture is the operation that has to be cheapest: `quickAdd` takes a title
 * and nothing else, because a lawyer between two meetings will not fill in a
 * form to remember something. Everything else is added afterwards, on a task
 * that already exists.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { Attachment, EmailDraft, ThreadEntry } from "@/lib/correspondence";
import type { ChecklistItem, Task, TaskOrigin, TaskPriority, TaskStatus, ToolKey } from "./model";

type TaskUpdate = Database["public"]["Tables"]["tasks"]["Update"];

const COLUMNS =
  "id, title, detail, status, priority, due_date, planned_on, matter_id, assignee_id, origin_kind, origin_id, flow_deliverable_id, tool, checklist, tags, email_draft, threads, attachments, output_kind, output_id, output_label, completed_at, created_at, updated_at, client_id, matters(name, client), clients(name), flow_deliverables(flow_id, matter_flows(name, client_id, clients(name)))";

const str = (v: unknown) => (typeof v === "string" ? v : "");
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

const toTask = (r: any): Task => ({
  id: r.id,
  title: str(r.title),
  detail: str(r.detail),
  status: (r.status ?? "Open") as TaskStatus,
  priority: (r.priority ?? "normal") as TaskPriority,
  dueDate: r.due_date ?? null,
  plannedOn: r.planned_on ?? null,
  matterId: r.matter_id ?? null,
  matterName: str(r.matters?.name),
  // Through the matter, then through the flow, then its own: never two answers.
  clientId: r.client_id ?? r.flow_deliverables?.matter_flows?.client_id ?? null,
  clientName: str(
    r.matters?.client ?? r.flow_deliverables?.matter_flows?.clients?.name ?? r.clients?.name,
  ),
  flowId: r.flow_deliverables?.flow_id ?? null,
  flowName: str(r.flow_deliverables?.matter_flows?.name) || str(r.matters?.name),
  assigneeId: r.assignee_id ?? null,
  origin: (r.origin_kind ?? null) as TaskOrigin | null,
  originId: r.origin_id ?? null,
  deliverableId: r.flow_deliverable_id ?? null,
  tool: (r.tool ?? null) as ToolKey | null,
  checklist: arr<ChecklistItem>(r.checklist),
  tags: arr<string>(r.tags),
  // A draft that was never started is null, not an empty one: "no email here"
  // and "an email with nothing in it yet" are different facts about the task.
  emailDraft: (r.email_draft ?? null) as EmailDraft | null,
  threads: arr<ThreadEntry>(r.threads),
  attachments: arr<Attachment>(r.attachments),
  output: r.output_kind
    ? { kind: str(r.output_kind), id: r.output_id ?? null, label: str(r.output_label) }
    : null,
  completedAt: r.completed_at ?? null,
  createdAt: str(r.created_at),
  updatedAt: str(r.updated_at),
});

export async function listTasks(workspaceId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select(COLUMNS)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(toTask);
}

/** Everything a caller elsewhere in Scripta already knows when it raises a task. */
export type TaskSeed = {
  title: string;
  detail?: string;
  origin?: TaskOrigin;
  originId?: string | null;
  matterId?: string | null;
  /** A client task: filed to no matter, but for this client. */
  clientId?: string | null;
  deliverableId?: string | null;
  tool?: ToolKey | null;
  dueDate?: string | null;
  plannedOn?: string | null;
  priority?: TaskPriority;
};

/**
 * Record it now, organise it later.
 *
 * One required field. A task with only a title is a perfectly good task —
 * the whole point is that nothing is lost between one meeting and the next.
 */
export async function quickAdd(workspaceId: string, seed: TaskSeed): Promise<string> {
  const title = seed.title.trim();
  if (!title) throw new Error("A task needs a name.");
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      workspace_id: workspaceId,
      title,
      detail: seed.detail ?? "",
      status: "Open",
      priority: seed.priority ?? "normal",
      due_date: seed.dueDate ?? null,
      planned_on: seed.plannedOn ?? null,
      matter_id: seed.matterId ?? null,
      client_id: seed.matterId || seed.deliverableId ? null : (seed.clientId ?? null),
      origin_kind: seed.origin ?? "manual",
      origin_id: seed.originId ?? null,
      flow_deliverable_id: seed.deliverableId ?? null,
      tool: seed.tool ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

export type TaskPatch = Partial<{
  title: string;
  assigneeId: string | null;
  detail: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  plannedOn: string | null;
  matterId: string | null;
  clientId: string | null;
  deliverableId: string | null;
  tool: ToolKey | null;
  checklist: ChecklistItem[];
  tags: string[];
  emailDraft: EmailDraft | null;
  threads: ThreadEntry[];
  attachments: Attachment[];
  output: { kind: string; id: string | null; label: string } | null;
}>;

export async function updateTask(id: string, patch: TaskPatch): Promise<void> {
  const row: TaskUpdate = {};
  if (patch.title !== undefined) row["title"] = patch.title.trim();
  if (patch.detail !== undefined) row["detail"] = patch.detail;
  if (patch.priority !== undefined) row["priority"] = patch.priority;
  if (patch.dueDate !== undefined) row["due_date"] = patch.dueDate;
  if (patch.plannedOn !== undefined) row["planned_on"] = patch.plannedOn;
  if (patch.matterId !== undefined) row["matter_id"] = patch.matterId;
  // A task filed to a matter reaches its client through it; the database
  // clears a client of its own at the same moment.
  if (patch.clientId !== undefined) row["client_id"] = patch.clientId;
  if (patch.assigneeId !== undefined) row["assignee_id"] = patch.assigneeId;
  if (patch.deliverableId !== undefined) row["flow_deliverable_id"] = patch.deliverableId;
  if (patch.tool !== undefined) row["tool"] = patch.tool;
  if (patch.checklist !== undefined) row["checklist"] = patch.checklist;
  if (patch.tags !== undefined) row["tags"] = patch.tags;
  if (patch.emailDraft !== undefined) row["email_draft"] = patch.emailDraft;
  if (patch.threads !== undefined) row["threads"] = patch.threads;
  if (patch.attachments !== undefined) row["attachments"] = patch.attachments;
  if (patch.output !== undefined) {
    row["output_kind"] = patch.output?.kind ?? null;
    row["output_id"] = patch.output?.id ?? null;
    row["output_label"] = patch.output?.label ?? null;
  }
  // Completing is a moment, so it is stamped rather than inferred later.
  if (patch.status !== undefined) {
    row["status"] = patch.status;
    row["completed_at"] = patch.status === "Done" ? new Date().toISOString() : null;
  }
  if (!Object.keys(row).length) return;
  const { error } = await supabase.from("tasks").update(row).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Raise a task from somewhere else in Scripta, without raising it twice.
 *
 * The same review issue or deliverable is looked at more than once, and each
 * visit must not leave another copy behind. Keyed on where it came from.
 */
export async function taskFor(
  workspaceId: string,
  seed: TaskSeed & { origin: TaskOrigin; originId: string },
): Promise<{ id: string; created: boolean }> {
  const { data, error } = await supabase
    .from("tasks")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("origin_kind", seed.origin)
    .eq("origin_id", seed.originId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return { id: (data as { id: string }).id, created: false };
  return { id: await quickAdd(workspaceId, seed), created: true };
}
