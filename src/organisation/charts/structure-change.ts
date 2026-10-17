/**
 * Carrying out a planned change. Marking a change done is not a label: its
 * proposed entities and holdings become part of the current structure from
 * that day, and the holdings it removes end on it, so the current chart and
 * the history both say what happened.
 */
import { updateRecord } from "../db";
import { localDay, type ChangeContext, type Organisation, type StructureChange } from "../model";

export async function completeStructureChange(
  org: Organisation,
  change: StructureChange,
  context: ChangeContext,
): Promise<void> {
  const on = context.on || localDay();
  const ctx = { ...context, on };
  for (const e of org.entities.filter((x) => x.proposedChangeId === change.id))
    await updateRecord("org_entities", e.id, { proposed_change_id: null }, ctx);
  for (const h of org.holdings.filter((x) => x.proposedChangeId === change.id))
    await updateRecord(
      "org_holdings",
      h.id,
      { proposed_change_id: null, effective_from: h.effectiveFrom ?? on },
      ctx,
    );
  for (const h of org.holdings.filter((x) => x.removedByChangeId === change.id && !x.effectiveTo))
    await updateRecord("org_holdings", h.id, { effective_to: on }, ctx);
  await updateRecord("org_structure_changes", change.id, { status: "done" });
}
