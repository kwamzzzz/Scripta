/**
 * Deleting an entity that should never have been recorded — a typo, a test,
 * the wrong company.
 *
 * Archiving is still the answer for a company that existed and was dissolved
 * or sold: its history stays readable. Deleting takes the entity out of the
 * organisation. Its shareholdings, appointments and signing rules go with it;
 * licences, obligations, roles, campaigns and matters that named it are kept
 * and simply no longer name it (the database does this). The change itself is
 * kept in the organisation's history.
 */
import { useConfirmDelete } from "@/components/ConfirmDelete";
import { deleteRecord } from "../db";
import type { Entity, Organisation } from "../model";
import { count, useOrgWrite } from "../ui";
import { supabase } from "@/integrations/supabase/client";

export function entityDeleteConsequence(org: Organisation, entity: Entity): string {
  const holdings = org.holdings.filter(
    (h) => h.ownerEntityId === entity.id || h.subsidiaryEntityId === entity.id,
  ).length;
  const appointments = org.appointments.filter((a) => a.entityId === entity.id).length;
  const rules = org.rules.filter((r) => r.entityId === entity.id).length;
  const licences = org.licences.filter((l) => l.entityId === entity.id).length;
  const obligations = org.obligations.filter((o) => o.entityId === entity.id).length;
  const going = [
    holdings ? count(holdings, "shareholding") : "",
    appointments ? count(appointments, "appointment") : "",
    rules ? count(rules, "signing rule") : "",
  ].filter(Boolean);
  const kept = [
    licences ? count(licences, "licence") : "",
    obligations ? count(obligations, "filing obligation") : "",
  ].filter(Boolean);
  return [
    going.length ? `Its ${going.join(", ")} go with it.` : "Nothing else is recorded against it.",
    kept.length ? `Its ${kept.join(" and ")} are kept, with no entity.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function useDeleteEntity(org: Organisation) {
  const write = useOrgWrite(org.clientId);
  const { confirmDelete, confirmDialog } = useConfirmDelete();

  const remove = async (entity: Entity): Promise<boolean> => {
    const yes = await confirmDelete({
      what: `“${entity.name}”`,
      consequence: entityDeleteConsequence(org, entity),
      binned: false,
    });
    if (!yes) return false;
    return write.run(async () => {
      // Links from documents to the entity have no foreign key to follow it.
      const { error } = await supabase
        .from("org_record_documents")
        .delete()
        .eq("client_id", org.clientId)
        .eq("record_type", "entity")
        .eq("record_id", entity.id);
      if (error) throw new Error(error.message);
      await deleteRecord("org_entities", entity.id);
    });
  };

  return { remove, confirmDialog, error: write.error, busy: write.busy };
}
