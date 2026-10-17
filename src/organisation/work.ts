/**
 * Where the organisation meets ordinary Scripta work.
 *
 * An obligation that falls due, or a licence that needs renewing, becomes a
 * task in Tasks — not an item in a second list that only this screen knows
 * about. The task points back at what raised it, so asking twice opens the task
 * already made. Tasks keep their own privacy: a task filed only to a client is
 * its author's, so each lawyer sees the tasks they raised.
 */
import { supabase } from "@/integrations/supabase/client";
import { quickAdd, taskFor } from "@/lib/tasks/data";
import type { TaskStatus } from "@/lib/tasks/model";
import {
  entityLabel,
  formatDay,
  ownerLabel,
  type DatedOccurrence,
  type Licence,
  type Organisation,
} from "./model";

export type OrgTask = {
  id: string;
  title: string;
  status: TaskStatus;
  dueDate: string | null;
  originKind: "org_obligation" | "org_licence";
  originId: string;
};

/** The tasks this person can see that were raised from organisation records. */
export async function loadOrgTasks(workspaceId: string, originIds: string[]): Promise<OrgTask[]> {
  if (!originIds.length) return [];
  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, status, due_date, origin_kind, origin_id")
    .eq("workspace_id", workspaceId)
    .in("origin_kind", ["org_obligation", "org_licence"])
    .in("origin_id", originIds);
  if (error) throw new Error(error.message);
  return (data ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status as TaskStatus,
    dueDate: t.due_date,
    originKind: t.origin_kind as OrgTask["originKind"],
    originId: t.origin_id as string,
  }));
}

/**
 * The stored occurrence a task hangs off. Occurrences are generated, not
 * stored, until something is done with one; raising a task is something.
 */
async function occurrenceId(org: Organisation, occ: DatedOccurrence): Promise<string> {
  if (occ.record) return occ.record.id;
  const { data, error } = await supabase
    .from("org_obligation_occurrences")
    .upsert(
      {
        workspace_id: org.workspaceId,
        client_id: org.clientId,
        obligation_id: occ.obligation.id,
        due_on: occ.dueOn,
        state: "open",
      },
      { onConflict: "obligation_id,due_on" },
    )
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

export async function taskForOccurrence(
  org: Organisation,
  occ: DatedOccurrence,
): Promise<{ id: string; created: boolean }> {
  const originId = await occurrenceId(org, occ);
  const entity = org.entities.find((e) => e.id === occ.obligation.entityId);
  const owner = ownerLabel(org, occ.obligation);
  return taskFor(org.workspaceId, {
    title: `${occ.obligation.title}${entity ? ` — ${entityLabel(entity)}` : ""}`,
    detail: [
      `Due ${formatDay(occ.dueOn, "long")}.`,
      owner ? `Owner at the client: ${owner}.` : "",
      occ.obligation.penaltyNote ? `Penalty: ${occ.obligation.penaltyNote}.` : "",
      occ.obligation.detail,
    ]
      .filter(Boolean)
      .join("\n"),
    clientId: org.clientId,
    origin: "org_obligation",
    originId,
    dueDate: occ.dueOn,
    priority: occ.state === "overdue" ? "high" : "normal",
  });
}

/**
 * A renewal task for a licence. One open renewal task at a time: once the
 * last one is complete, the next renewal cycle gets a new task.
 */
export async function taskForLicenceRenewal(
  org: Organisation,
  licence: Licence,
): Promise<{ id: string; created: boolean }> {
  const { data, error } = await supabase
    .from("tasks")
    .select("id, status")
    .eq("workspace_id", org.workspaceId)
    .eq("origin_kind", "org_licence")
    .eq("origin_id", licence.id)
    .neq("status", "Done")
    .limit(1);
  if (error) throw new Error(error.message);
  const open = (data ?? [])[0] as { id: string } | undefined;
  if (open) return { id: open.id, created: false };
  const entity = org.entities.find((e) => e.id === licence.entityId);
  const missing = licence.prerequisites.filter((p) => !p.done).map((p) => p.label);
  const due = licence.expiresOn;
  const id = await quickAdd(org.workspaceId, {
    title: `Renew ${licence.name}${entity ? ` — ${entityLabel(entity)}` : ""}`,
    detail: [
      due ? `Expires ${formatDay(due, "long")}.` : "",
      licence.authority ? `Authority: ${licence.authority}.` : "",
      missing.length ? `Still needed: ${missing.join("; ")}.` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    clientId: org.clientId,
    origin: "org_licence",
    originId: licence.id,
    dueDate: due,
    priority: "high",
  });
  return { id, created: true };
}
