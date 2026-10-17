/**
 * Finishing a task that a deliverable was waiting on.
 *
 * Completing a task used to strike through its title. Where the task came from
 * a Flow deliverable, it should also say so in the Flow, otherwise the same
 * work has to be marked done twice and one of the two will drift.
 *
 * A tick is all this does. Flow decides what "complete" means — a document
 * deliverable still needs its final version attached — and it is not this
 * file's place to overrule that, so the caller is told what actually happened
 * rather than being allowed to assume.
 */
import { supabase } from "@/integrations/supabase/client";

export type FlowEcho =
  { kind: "ticked"; name: string; stillNeedsVersion: boolean } | { kind: "none" };

export async function tickDeliverable(deliverableId: string, ticked: boolean): Promise<FlowEcho> {
  const { data, error } = await supabase
    .from("flow_deliverables")
    .update({ ticked })
    .eq("id", deliverableId)
    .select("id, name, kind")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { kind: "none" };

  const row = data as { name: string; kind: string };
  if (!ticked) return { kind: "ticked", name: row.name, stillNeedsVersion: false };

  // A document deliverable is only complete once its final version is on it.
  const { count } = await supabase
    .from("flow_versions")
    .select("id", { count: "exact", head: true })
    .eq("deliverable_id", deliverableId)
    .eq("is_final", true);
  return {
    kind: "ticked",
    name: row.name,
    stillNeedsVersion: row.kind === "document" && !count,
  };
}
