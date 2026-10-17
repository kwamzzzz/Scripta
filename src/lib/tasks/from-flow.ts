/**
 * A deliverable that needs doing, as a task.
 *
 * Flow says how a matter progresses; Tasks says what needs your attention. A
 * deliverable is both, so it is one row in each, joined rather than copied:
 * the task holds the deliverable's id, and completing either updates the other.
 *
 * Everything Scripta already knows travels with it, because the whole point is
 * that nobody retypes the matter, the deadline or what the work is.
 */
import type { DerivedDeliverable } from "@/matter-flow/model";
import { typeLabel } from "@/matter-flow/editor-routes";
import type { TaskSeed } from "./data";
import type { ToolKey } from "./model";

/** Which tool produces this kind of deliverable, where Scripta knows. */
const TOOL_BY_TYPE: Record<string, ToolKey> = {
  contract: "review",
  board_resolution: "corporate",
  letter: "corporate",
  memo: "research",
};

export function seedFromDeliverable(
  deliverable: DerivedDeliverable,
  matterId: string | null,
): TaskSeed & { origin: "flow"; originId: string } {
  const tool = TOOL_BY_TYPE[deliverable.type];
  return {
    title: deliverable.name,
    detail:
      deliverable.description ||
      deliverable.note ||
      `${typeLabel(deliverable)} owed by this phase.`,
    origin: "flow",
    // Keyed on the deliverable, so visiting the phase again never leaves a
    // second copy behind.
    originId: deliverable.id,
    matterId,
    deliverableId: deliverable.id,
    ...(tool ? { tool } : {}),
    dueDate: deliverable.deadline || null,
    plannedOn: deliverable.start || null,
    priority: deliverable.mandatory ? ("high" as const) : ("normal" as const),
  };
}
