/**
 * Putting an item aside, and bringing it back.
 *
 * Archiving is the reversible half of an item's life: it leaves the active
 * workspace without losing anything, so a lawyer clearing out a stale playbook
 * never has to choose between clutter and destruction. Every archivable table
 * carries the same `archived_at` column with the same meaning — null is live,
 * a timestamp is put aside — so one function serves all of them rather than a
 * slightly different one per screen.
 */
import { supabase } from "@/integrations/supabase/client";

export type ArchivableTable =
  | "matters"
  | "documents"
  | "playbooks"
  | "templates"
  | "corporate_documents"
  | "research_matters"
  | "flow_presets"
  | "flow_preset_families"
  | "precedents"
  | "contract_drafts"
  | "clients"
  | "matter_flows";

const db = supabase;

export async function setArchived(
  table: ArchivableTable,
  ids: string[],
  archived: boolean,
): Promise<void> {
  if (!ids.length) return;
  const { error } = await db
    .from(table)
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .in("id", ids);
  if (error) throw error;
}

/** "Archive" or "Restore": what the menu offers for an item in this state. */
export const archiveLabel = (archived: boolean) => (archived ? "Restore" : "Archive");

/** What the action did, for an error message that reads like a sentence. */
export const archiveVerb = (archived: boolean) => (archived ? "archived" : "restored");
