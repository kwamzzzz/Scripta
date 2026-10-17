/**
 * What is inside a matter, and what it owes next.
 *
 * The file card says "3 tasks · 2 deliverables · 4 documents" and "Next: review
 * the revised agreement, 17 Sep". Documents the matter already carries; the
 * other two live in tables the matters query has never needed to read, so they
 * are gathered here in two passes over the workspace rather than a query per
 * card.
 *
 * On "next": a matter's next obligation can come from a task or from a flow
 * deadline, and the two will often disagree. Neither outranks the other — a
 * deadline is a deadline — so the card shows whichever falls first and names
 * it. Inventing a precedence rule would be asserting something about the work
 * that nobody has said.
 */
import { supabase } from "@/integrations/supabase/client";
import { allDeliverables, deriveFlow } from "@/matter-flow/model";
import { loadWorkspaceFlows } from "@/matter-flow/flow-db";

export type MatterSummary = {
  tasks: number;
  deliverables: number;
  next: { label: string; on: string | null } | null;
};

const today = () => new Date().toISOString().slice(0, 10);

export async function loadMatterSummaries(
  workspaceId: string,
): Promise<Map<string, MatterSummary>> {
  const out = new Map<string, MatterSummary>();
  const take = (id: string) => {
    const found = out.get(id);
    if (found) return found;
    const fresh: MatterSummary = { tasks: 0, deliverables: 0, next: null };
    out.set(id, fresh);
    return fresh;
  };

  // Work still owed. A completed task is not something the file is carrying.
  const { data: tasks } = await supabase
    .from("tasks")
    .select("matter_id, title, due_date, planned_on, status")
    .eq("workspace_id", workspaceId)
    .neq("status", "Done")
    .not("matter_id", "is", null);

  for (const row of (tasks ?? []) as any[]) {
    const entry = take(row.matter_id as string);
    entry.tasks += 1;
    const when = (row.due_date ?? row.planned_on ?? null) as string | null;
    if (when && (!entry.next?.on || when < entry.next.on))
      entry.next = { label: String(row.title ?? ""), on: when };
  }

  // Deliverables, and the nearest one still outstanding. Reuses the loader the
  // Flow list already runs, so this is a second reader rather than new work.
  // A matter may hold more than one flow; its deliverables are all of theirs.
  const flows = await loadWorkspaceFlows(workspaceId).catch(() => []);
  for (const { head, record } of flows) {
    if (!head.matterId) continue;
    const entry = take(head.matterId);
    const derived = deriveFlow(record, today());
    const items = allDeliverables(derived);
    entry.deliverables += items.length;
    const due = items
      .filter((d) => !d.complete && d.deadline)
      .sort((a, b) => a.deadline.localeCompare(b.deadline))[0];
    if (due && (!entry.next?.on || due.deadline < entry.next.on))
      entry.next = { label: due.name, on: due.deadline };
  }

  return out;
}
