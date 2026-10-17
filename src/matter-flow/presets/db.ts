/**
 * Reading and writing the workspace's flow presets. Plain client-side queries:
 * the `flow_preset_families` and `flow_presets` policies already decide who may
 * read (any member) and who may write (a writer).
 */
import { supabase } from "@/integrations/supabase/client";
import type { DeliverableKind } from "../model";
import { emptyPresetBody, parsePresetBody, type PresetBody } from "./model";

/**
 * What went wrong, in words. Supabase rejects with a PostgrestError — a plain
 * object, not an Error — so `instanceof Error` would quietly discard the only
 * account of the failure and leave a broken library looking like an empty one.
 */
export function errorMessage(cause: unknown, fallback = "That did not work."): string {
  if (cause instanceof Error && cause.message) return cause.message;
  if (cause && typeof cause === "object") {
    // Postgres's own hint ("perhaps you meant …") is for whoever wrote the
    // query, not for the lawyer reading the screen.
    const { message, details } = cause as Record<string, unknown>;
    for (const part of [message, details])
      if (typeof part === "string" && part.trim() !== "") return part.trim();
  }
  return fallback;
}

/** React Query key for the whole library of one workspace. */
export const presetsQueryKey = (workspaceId: string | null) => ["flow-presets", workspaceId];

export type PresetFamily = {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
  archivedAt: string | null;
  /** In Recently Deleted since this moment; null means live. */
  deletedAt: string | null;
};

export type FlowPreset = {
  id: string;
  familyId: string;
  name: string;
  summary: string;
  kind: DeliverableKind;
  body: PresetBody;
  position: number;
  updatedAt: string;
  archivedAt: string | null;
  /** In Recently Deleted since this moment; null means live. */
  deletedAt: string | null;
};

/** A family with the variants under it, in the order they are shown. */
export type PresetFamilyGroup = PresetFamily & { variants: FlowPreset[] };

type FamilyRow = {
  id: string;
  name: string;
  description: string | null;
  updated_at: string;
  archived_at: string | null;
  deleted_at: string | null;
};
type PresetRow = {
  id: string;
  family_id: string;
  name: string;
  summary: string | null;
  kind: string | null;
  body: unknown;
  position: number | null;
  updated_at: string;
  archived_at: string | null;
  deleted_at: string | null;
};

const toFamily = (row: FamilyRow): PresetFamily => ({
  id: row.id,
  name: row.name,
  description: row.description ?? "",
  updatedAt: row.updated_at,
  archivedAt: row.archived_at ?? null,
  deletedAt: row.deleted_at ?? null,
});

const toPreset = (row: PresetRow): FlowPreset => ({
  id: row.id,
  familyId: row.family_id,
  name: row.name,
  summary: row.summary ?? "",
  kind: row.kind === "action" ? "action" : "document",
  body: parsePresetBody(row.body),
  position: row.position ?? 0,
  updatedAt: row.updated_at,
  archivedAt: row.archived_at ?? null,
  deletedAt: row.deleted_at ?? null,
});

const FAMILY_COLUMNS = "id, name, description, updated_at, archived_at, deleted_at";
const PRESET_COLUMNS =
  "id, family_id, name, summary, kind, body, position, updated_at, archived_at, deleted_at";

/**
 * The library, grouped by family. Recently Deleted is left out unless it is
 * asked for: a preset in the bin must not be offered to apply to a matter.
 */
export async function listPresetLibrary(
  workspaceId: string,
  options: { binned?: boolean } = {},
): Promise<PresetFamilyGroup[]> {
  const familyQuery = supabase
    .from("flow_preset_families")
    .select(FAMILY_COLUMNS)
    .eq("workspace_id", workspaceId)
    .order("name");
  const presetQuery = supabase
    .from("flow_presets")
    .select(PRESET_COLUMNS)
    .eq("workspace_id", workspaceId)
    .order("position")
    .order("created_at");
  const [families, presets] = await Promise.all(
    options.binned
      ? [familyQuery, presetQuery]
      : [familyQuery.is("deleted_at", null), presetQuery.is("deleted_at", null)],
  );
  if (families.error) throw families.error;
  if (presets.error) throw presets.error;
  const variants = ((presets.data ?? []) as PresetRow[]).map(toPreset);
  return ((families.data ?? []) as FamilyRow[]).map((row) => ({
    ...toFamily(row),
    variants: variants.filter((v) => v.familyId === row.id),
  }));
}

/**
 * Every variant in the workspace, carrying the family it belongs to. The
 * library lists variants because a variant is the thing that gets applied; the
 * family is how they group, which is what the board view draws.
 */
export type PresetRowView = FlowPreset & {
  familyName: string;
  familyDescription: string;
  /** A variant inside an archived family is out of the way with it. */
  familyArchivedAt: string | null;
  /** A variant inside a deleted family is in the bin with it. */
  familyDeletedAt: string | null;
};

export async function listPresetRows(workspaceId: string): Promise<PresetRowView[]> {
  const families = await listPresetLibrary(workspaceId, { binned: true });
  return families.flatMap((family) =>
    family.variants.map((variant) => ({
      ...variant,
      familyName: family.name,
      familyDescription: family.description,
      familyArchivedAt: family.archivedAt,
      familyDeletedAt: family.deletedAt,
    })),
  );
}

export async function getPreset(id: string): Promise<FlowPreset | null> {
  const { data, error } = await supabase
    .from("flow_presets")
    .select(PRESET_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? toPreset(data as PresetRow) : null;
}

export async function createFamily(
  workspaceId: string,
  name: string,
  description = "",
): Promise<PresetFamily> {
  const { data, error } = await supabase
    .from("flow_preset_families")
    .insert({ workspace_id: workspaceId, name: name.trim(), description: description.trim() })
    .select(FAMILY_COLUMNS)
    .single();
  if (error) throw error;
  return toFamily(data as FamilyRow);
}

export async function updateFamily(
  id: string,
  patch: { name?: string; description?: string },
): Promise<void> {
  const { error } = await supabase
    .from("flow_preset_families")
    .update({
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.description !== undefined ? { description: patch.description.trim() } : {}),
    })
    .eq("id", id);
  if (error) throw error;
}

/** Removes the family and every variant under it. */
export async function deleteFamily(id: string): Promise<void> {
  const { error } = await supabase.from("flow_preset_families").delete().eq("id", id);
  if (error) throw error;
}

export type NewPreset = {
  familyId: string;
  name: string;
  summary?: string;
  kind?: DeliverableKind;
  body?: PresetBody;
};

export async function createPreset(
  workspaceId: string,
  input: NewPreset,
): Promise<FlowPreset> {
  const kind = input.kind ?? "document";
  const { data, error } = await supabase
    .from("flow_presets")
    .insert({
      workspace_id: workspaceId,
      family_id: input.familyId,
      name: input.name.trim(),
      summary: (input.summary ?? "").trim(),
      kind,
      body: input.body ?? emptyPresetBody(kind),
    })
    .select(PRESET_COLUMNS)
    .single();
  if (error) throw error;
  return toPreset(data as PresetRow);
}

export async function updatePreset(
  id: string,
  patch: { name?: string; summary?: string; kind?: DeliverableKind; body?: PresetBody },
): Promise<void> {
  const { error } = await supabase
    .from("flow_presets")
    .update({
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.summary !== undefined ? { summary: patch.summary.trim() } : {}),
      ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
    })
    .eq("id", id);
  if (error) throw error;
}

export async function deletePreset(id: string): Promise<void> {
  const { error } = await supabase.from("flow_presets").delete().eq("id", id);
  if (error) throw error;
}
