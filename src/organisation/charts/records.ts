/**
 * Changing the records from the chart: a shareholding drawn between two
 * boxes, a company added under another, a role moved to report elsewhere.
 *
 * Each change is written through the same helpers the forms use, so the
 * organisation's history records it exactly as if a form had been filled in,
 * and each returns the step that undoes it. Deleting a company or a role is
 * not here: those go through the confirmations the rest of the organisation
 * uses, because what goes with them is not undone by a keystroke.
 */
import { deleteRecord, insertRecord, updateRecord } from "../db";
import { canReportTo, type Holding, type Organisation, type Role, type RoleLine } from "../model";
import type { Step } from "./useChartDesign";

type Org = Pick<Organisation, "workspaceId" | "clientId">;

/** Who holds shares, as the chart draws them: `p:` a person, `o:` someone outside. */
export type HolderRef =
  | { kind: "entity"; id: string }
  | { kind: "person"; id: string }
  | { kind: "outside"; name: string };

export const holderOf = (nodeId: string): HolderRef =>
  nodeId.startsWith("p:")
    ? { kind: "person", id: nodeId.slice(2) }
    : nodeId.startsWith("o:")
      ? { kind: "outside", name: nodeId.slice(2) }
      : { kind: "entity", id: nodeId };

const id = () => crypto.randomUUID();

/** Every column of a holding, so a deleted one can be put back as it was. */
const holdingRow = (h: Holding) => ({
  id: h.id,
  owner_entity_id: h.ownerEntityId,
  owner_person_id: h.ownerPersonId,
  owner_name: h.ownerName,
  subsidiary_entity_id: h.subsidiaryEntityId,
  percent: h.percent,
  instrument: h.instrument,
  effective_from: h.effectiveFrom,
  effective_to: h.effectiveTo,
  proposed_change_id: h.proposedChangeId,
  removed_by_change_id: h.removedByChangeId,
});

/** Several steps as one: undone in reverse, redone in order. */
export const together = (label: string, steps: Step[]): Step => ({
  label,
  undo: async () => {
    for (const s of [...steps].reverse()) await s.undo();
  },
  redo: async () => {
    for (const s of steps) await s.redo();
  },
});

/** A share typed as "51", "51%" or "51.5": a number in (0, 100], or null for none. */
export function parseShare(text: string): number | null | "invalid" {
  const t = text.replace("%", "").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : "invalid";
}

/* ----------------------------------------------------------- ownership */

export async function createEntity(
  org: Org,
  name: string,
  proposedChangeId: string | null = null,
): Promise<{ id: string; step: Step }> {
  const row = { id: id(), name: name.trim(), proposed_change_id: proposedChangeId };
  await insertRecord(org, "org_entities", row);
  return {
    id: row.id,
    step: {
      label: `Add ${row.name}`,
      undo: () => deleteRecord("org_entities", row.id),
      redo: () => insertRecord(org, "org_entities", row),
    },
  };
}

export async function createPerson(org: Org, name: string): Promise<{ id: string; step: Step }> {
  const row = { id: id(), full_name: name.trim() };
  await insertRecord(org, "org_people", row);
  return {
    id: row.id,
    step: {
      label: `Add ${row.full_name}`,
      undo: () => deleteRecord("org_people", row.id),
      redo: () => insertRecord(org, "org_people", row),
    },
  };
}

export async function addHolding(
  org: Org,
  holder: HolderRef,
  entityId: string,
  percent: number | null,
  proposedChangeId: string | null = null,
): Promise<{ id: string; step: Step }> {
  const row = {
    id: id(),
    owner_entity_id: holder.kind === "entity" ? holder.id : null,
    owner_person_id: holder.kind === "person" ? holder.id : null,
    owner_name: holder.kind === "outside" ? holder.name.trim() : null,
    subsidiary_entity_id: entityId,
    percent,
    proposed_change_id: proposedChangeId,
  };
  await insertRecord(org, "org_holdings", row);
  return {
    id: row.id,
    step: {
      label: "Add shareholding",
      undo: () => deleteRecord("org_holdings", row.id),
      redo: () => insertRecord(org, "org_holdings", row),
    },
  };
}

export async function setShare(holding: Holding, percent: number | null): Promise<Step> {
  const before = holding.percent;
  await updateRecord("org_holdings", holding.id, { percent });
  return {
    label: "Change share",
    undo: () => updateRecord("org_holdings", holding.id, { percent: before }),
    redo: () => updateRecord("org_holdings", holding.id, { percent }),
  };
}

export async function removeHolding(org: Org, holding: Holding): Promise<Step> {
  await deleteRecord("org_holdings", holding.id);
  return {
    label: "Remove shareholding",
    undo: () => insertRecord(org, "org_holdings", holdingRow(holding)),
    redo: () => deleteRecord("org_holdings", holding.id),
  };
}

export async function renameEntity(entityId: string, from: string, to: string): Promise<Step> {
  await updateRecord("org_entities", entityId, { name: to.trim() });
  return {
    label: `Rename ${from}`,
    undo: () => updateRecord("org_entities", entityId, { name: from }),
    redo: () => updateRecord("org_entities", entityId, { name: to.trim() }),
  };
}

export async function renamePerson(personId: string, from: string, to: string): Promise<Step> {
  await updateRecord("org_people", personId, { full_name: to.trim() });
  return {
    label: `Rename ${from}`,
    undo: () => updateRecord("org_people", personId, { full_name: from }),
    redo: () => updateRecord("org_people", personId, { full_name: to.trim() }),
  };
}

/** Someone outside the group is named on each of their holdings. */
export async function renameOutside(org: Organisation, from: string, to: string): Promise<Step> {
  const ids = org.holdings
    .filter((h) => !h.ownerEntityId && !h.ownerPersonId && (h.ownerName ?? "").trim() === from)
    .map((h) => h.id);
  const set = async (name: string) => {
    for (const hid of ids) await updateRecord("org_holdings", hid, { owner_name: name });
  };
  await set(to.trim());
  return { label: `Rename ${from}`, undo: () => set(from), redo: () => set(to.trim()) };
}

/* ----------------------------------------------------------- reporting */

export async function createRole(
  org: Org,
  title: string,
  parentRoleId: string | null,
  holderPersonId: string | null = null,
): Promise<{ id: string; step: Step }> {
  const row = {
    id: id(),
    title: title.trim(),
    parent_role_id: parentRoleId,
    holder_person_id: holderPersonId,
  };
  await insertRecord(org, "org_roles", row);
  return {
    id: row.id,
    step: {
      label: `Add ${row.title}`,
      undo: () => deleteRecord("org_roles", row.id),
      redo: () => insertRecord(org, "org_roles", row),
    },
  };
}

/** Why a role cannot report to another, or null when it can. */
export function reportingProblem(org: Organisation, roleId: string, parentId: string | null) {
  const role = org.roles.find((r) => r.id === roleId);
  if (!role) return "That role is no longer recorded.";
  if (parentId === roleId) return "A role cannot report to itself.";
  if (!canReportTo(org, roleId, parentId)) {
    const target = org.roles.find((r) => r.id === parentId);
    return `${role.title} cannot report to ${target?.title ?? "that role"}, which already reports up to ${role.title}.`;
  }
  return null;
}

export async function setParent(role: Role, parentId: string | null): Promise<Step> {
  const before = role.parentRoleId;
  await updateRecord("org_roles", role.id, { parent_role_id: parentId });
  return {
    label: parentId ? "Change reporting line" : "Remove reporting line",
    undo: () => updateRecord("org_roles", role.id, { parent_role_id: before }),
    redo: () => updateRecord("org_roles", role.id, { parent_role_id: parentId }),
  };
}

export async function addLine(
  org: Org,
  roleId: string,
  toRoleId: string,
  note = "",
): Promise<{ id: string; step: Step }> {
  const row = { id: id(), role_id: roleId, to_role_id: toRoleId, note };
  await insertRecord(org, "org_role_lines", row);
  return {
    id: row.id,
    step: {
      label: "Add dotted line",
      undo: () => deleteRecord("org_role_lines", row.id),
      redo: () => insertRecord(org, "org_role_lines", row),
    },
  };
}

export async function removeLine(org: Org, line: RoleLine): Promise<Step> {
  await deleteRecord("org_role_lines", line.id);
  const row = { id: line.id, role_id: line.roleId, to_role_id: line.toRoleId, note: line.note };
  return {
    label: "Remove dotted line",
    undo: () => insertRecord(org, "org_role_lines", row),
    redo: () => deleteRecord("org_role_lines", line.id),
  };
}

export async function setLineNote(line: RoleLine, note: string): Promise<Step> {
  const before = line.note;
  await updateRecord("org_role_lines", line.id, { note });
  return {
    label: "Change line note",
    undo: () => updateRecord("org_role_lines", line.id, { note: before }),
    redo: () => updateRecord("org_role_lines", line.id, { note }),
  };
}

export async function renameRole(role: Role, to: string): Promise<Step> {
  const from = role.title;
  await updateRecord("org_roles", role.id, { title: to.trim() });
  return {
    label: `Rename ${from}`,
    undo: () => updateRecord("org_roles", role.id, { title: from }),
    redo: () => updateRecord("org_roles", role.id, { title: to.trim() }),
  };
}
