/**
 * Publishing a process and running it.
 *
 * A published process is a flow preset in the workspace's library, in a family
 * named for the client, so the firm's preset library and this screen hold the
 * same thing. Running it makes a flow filed to the client — private to the
 * lawyer who starts it until it is filed to a matter, like any client flow.
 */
import { blankFixture } from "@/matter-flow/fixtures";
import { flowDiff } from "@/matter-flow/flow-diff";
import { createFlow } from "@/matter-flow/flow-db";
import type { MatterFlowRecord } from "@/matter-flow/model";
import { applyPresetBody } from "@/matter-flow/presets/model";
import {
  createFamily,
  createPreset,
  errorMessage,
  getPreset,
  listPresetLibrary,
  updatePreset,
} from "@/matter-flow/presets/db";
import { localDay, type Organisation, type Process, type ProcessStep } from "../model";
import { updateRecord } from "../db";
import { presetBodyFromSteps } from "./preset";

export const processFamilyName = (clientName: string) => `${clientName} — processes`;

/** Row order as the flow screen keeps it (store.ts does the same privately). */
function orderOf(record: MatterFlowRecord) {
  return {
    phases: [...record.phases].sort((a, b) => a.order - b.order).map((p) => p.id),
    deliverables: record.deliverables.map((d) => d.id),
  };
}

/** Publish, or republish, a process as a preset. Returns the preset id. */
export async function publishProcess(
  org: Organisation,
  clientName: string,
  process: Process,
  steps: ProcessStep[],
): Promise<string> {
  const body = presetBodyFromSteps(org, steps);
  try {
    const existing = process.presetId ? await getPreset(process.presetId) : null;
    let presetId: string;
    if (existing && !existing.deletedAt) {
      await updatePreset(existing.id, {
        name: process.name,
        summary: process.summary,
        kind: "action",
        body,
      });
      presetId = existing.id;
    } else {
      const familyName = processFamilyName(clientName);
      const library = await listPresetLibrary(org.workspaceId);
      const found = library.find((f) => f.name.trim().toLowerCase() === familyName.toLowerCase());
      const family =
        found ??
        (await createFamily(
          org.workspaceId,
          familyName,
          `Internal processes recorded for ${clientName}.`,
        ));
      // A family may already hold a variant of this name from an earlier publish.
      const clash = found?.variants.find((v) => v.name === process.name);
      if (clash) {
        await updatePreset(clash.id, { summary: process.summary, kind: "action", body });
        presetId = clash.id;
      } else {
        presetId = (
          await createPreset(org.workspaceId, {
            familyId: family.id,
            name: process.name,
            summary: process.summary,
            kind: "action",
            body,
          })
        ).id;
      }
    }
    await updateRecord("org_processes", process.id, { status: "published", preset_id: presetId });
    return presetId;
  } catch (cause) {
    throw new Error(errorMessage(cause, "The process was not published."));
  }
}

/** A new flow for one run of the process, filed to the client. Returns the flow id. */
export async function runProcess(
  org: Organisation,
  process: Process,
  start = localDay(),
): Promise<string> {
  if (!process.presetId) throw new Error("Publish the process before running it.");
  const preset = await getPreset(process.presetId).catch((cause: unknown) => {
    throw new Error(errorMessage(cause, "The published process could not be read."));
  });
  if (!preset || preset.deletedAt)
    throw new Error("The published process is no longer in the preset library. Publish it again.");
  const base: MatterFlowRecord = { ...blankFixture(""), matterId: null, startedAt: start };
  const record = applyPresetBody(base, preset.body, { start });
  return createFlow(org.workspaceId, record, flowDiff(null, record), orderOf(record), {
    name: `${process.name} — ${start}`,
    clientId: org.clientId,
  });
}
