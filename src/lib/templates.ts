import { supabase } from "@/integrations/supabase/client";

/**
 * Templates — the reusable starting structure for a piece of drafting.
 *
 * A template is an ordered list of sections. Each section carries the drafting
 * itself, with {{placeholders}} marking where facts belong, and guidance that
 * explains why the section exists and how to complete it. The guidance is for
 * whoever is drafting; it never prints into the document.
 *
 * Placeholders are read out of the body rather than stored. They only exist
 * because the text says so, and a list kept alongside the text would be a
 * second source of truth that could disagree with it.
 */

export type TemplateStatus = "Draft" | "Active" | "Retired";

export interface TemplateSection {
  id: string;
  heading: string;
  body: string;
  guidance: string;
  optional: boolean;
  ordinal: number;
}

export interface Template {
  id: string;
  name: string;
  /** Contract, memorandum, opinion, board resolution, letter, notice, policy. */
  docType: string;
  jurisdiction: string;
  description: string;
  status: TemplateStatus;
  updatedAt: string;
  /** Put aside and out of the active workspace; null means live. */
  archivedAt: string | null;
  /** In Recently Deleted since this moment; null means live. */
  deletedAt: string | null;
  sections: TemplateSection[];
}

/** The document kinds offered when creating a template. Not a closed list:
 *  the field is free text, and this is only what the picker suggests. */
export const TEMPLATE_DOC_TYPES = [
  "Contract",
  "Memorandum",
  "Legal opinion",
  "Board resolution",
  "Letter",
  "Notice",
  "Policy",
  "Corporate document",
] as const;

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_ .-]{1,60}?)\s*\}\}/g;

/**
 * The placeholders a stretch of drafting asks to be filled in, in the order
 * they are first read, without repeats. A name is normalised to lower case so
 * {{Party Name}} and {{party name}} are understood as the same fact asked for
 * twice rather than two different facts.
 */
export function placeholdersIn(text: string): string[] {
  const seen = new Set<string>();
  const found: string[] = [];
  for (const match of text.matchAll(PLACEHOLDER)) {
    const raw = (match[1] ?? "").trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(raw);
  }
  return found;
}

/** Every placeholder across a template, so the drafter can see up front what
 *  facts the document will need. */
export function templatePlaceholders(sections: TemplateSection[]): string[] {
  const seen = new Set<string>();
  const found: string[] = [];
  for (const section of sections) {
    for (const name of placeholdersIn(section.body)) {
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      found.push(name);
    }
  }
  return found;
}

/**
 * Fill a template's sections with the facts given. A placeholder with no
 * answer is left exactly as it is rather than blanked, so an unfinished
 * document says which fact is still missing instead of hiding the hole.
 */
export function fillSection(body: string, facts: Record<string, string>): string {
  const byKey = new Map(Object.entries(facts).map(([k, v]) => [k.trim().toLowerCase(), v]));
  return body.replace(PLACEHOLDER, (whole, name: string) => {
    const value = byKey.get(name.trim().toLowerCase());
    return value && value.trim() ? value : whole;
  });
}

/** Which of a template's placeholders still have no answer. */
export const missingFacts = (
  sections: TemplateSection[],
  facts: Record<string, string>,
): string[] => templatePlaceholders(sections).filter((name) => !facts[name]?.trim());

// Kept for exactly two queries — listTemplates and loadTemplate — and not
// because the types are stale. The types are current, and the templates table
const db = supabase;

interface TemplateRow {
  id: string;
  name: string;
  doc_type: string;
  jurisdiction: string | null;
  description: string | null;
  status: TemplateStatus;
  updated_at: string;
  archived_at: string | null;
  deleted_at: string | null;
}

interface SectionRow {
  id: string;
  template_id: string;
  heading: string;
  body: string;
  guidance: string | null;
  optional: boolean;
  ordinal: number;
}

const toSection = (r: SectionRow): TemplateSection => ({
  id: r.id,
  heading: r.heading,
  body: r.body,
  guidance: r.guidance ?? "",
  optional: r.optional,
  ordinal: r.ordinal,
});

const toTemplate = (r: TemplateRow, sections: TemplateSection[]): Template => ({
  id: r.id,
  name: r.name,
  docType: r.doc_type,
  jurisdiction: r.jurisdiction ?? "",
  description: r.description ?? "",
  status: r.status,
  updatedAt: r.updated_at,
  archivedAt: r.archived_at ?? null,
  deletedAt: r.deleted_at ?? null,
  sections,
});

/** Every template in the workspace, newest first. Sections are not loaded
 *  here — the list shows what a template is for, not what it says. */
export async function listTemplates(workspaceId: string): Promise<Template[]> {
  const { data, error } = await db
    .from("templates")
    .select(
      "id, name, doc_type, jurisdiction, description, status, updated_at, archived_at, deleted_at",
    )
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as TemplateRow[]).map((row) => toTemplate(row, []));
}

/** One template with its sections in order. */
export async function loadTemplate(templateId: string): Promise<Template | null> {
  const { data, error } = await db
    .from("templates")
    .select(
      "id, name, doc_type, jurisdiction, description, status, updated_at, archived_at, deleted_at",
    )
    .eq("id", templateId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const { data: sectionRows, error: sectionError } = await supabase
    .from("template_sections")
    .select("id, template_id, heading, body, guidance, optional, ordinal")
    .eq("template_id", templateId)
    .order("ordinal", { ascending: true });
  if (sectionError) throw sectionError;

  return toTemplate(
    data as TemplateRow,
    (sectionRows ?? []).map((r) => toSection(r as SectionRow)),
  );
}

export async function createTemplate(
  workspaceId: string,
  fields: { name: string; docType: string; jurisdiction?: string; description?: string },
): Promise<string> {
  const { data, error } = await supabase
    .from("templates")
    .insert({
      workspace_id: workspaceId,
      name: fields.name.trim(),
      doc_type: fields.docType.trim(),
      jurisdiction: fields.jurisdiction?.trim() || null,
      description: fields.description?.trim() || null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function updateTemplate(
  templateId: string,
  patch: Partial<{
    name: string;
    docType: string;
    jurisdiction: string;
    description: string;
    status: TemplateStatus;
  }>,
): Promise<void> {
  // Built as a literal rather than assembled key by key: the generated row
  // types are exact, and a Record<string, unknown> satisfies none of them.
  const row = {
    updated_at: new Date().toISOString(),
    ...(patch.name === undefined ? {} : { name: patch.name.trim() }),
    ...(patch.docType === undefined ? {} : { doc_type: patch.docType.trim() }),
    ...(patch.jurisdiction === undefined
      ? {}
      : { jurisdiction: patch.jurisdiction.trim() || null }),
    ...(patch.description === undefined ? {} : { description: patch.description.trim() || null }),
    ...(patch.status === undefined ? {} : { status: patch.status }),
  };
  const { error } = await supabase.from("templates").update(row).eq("id", templateId);
  if (error) throw error;
}

export async function deleteTemplate(templateId: string): Promise<void> {
  const { error } = await supabase.from("templates").delete().eq("id", templateId);
  if (error) throw error;
}

/** Add a section at the end of the template. */
export async function addSection(templateId: string, heading: string): Promise<string> {
  const { data: last } = await supabase
    .from("template_sections")
    .select("ordinal")
    .eq("template_id", templateId)
    .order("ordinal", { ascending: false })
    .limit(1);
  const nextOrdinal = ((last?.[0] as { ordinal: number } | undefined)?.ordinal ?? -1) + 1;

  const { data, error } = await supabase
    .from("template_sections")
    .insert({ template_id: templateId, heading: heading.trim(), ordinal: nextOrdinal })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function updateSection(
  sectionId: string,
  patch: Partial<{ heading: string; body: string; guidance: string; optional: boolean }>,
): Promise<void> {
  const row = {
    updated_at: new Date().toISOString(),
    ...(patch.heading === undefined ? {} : { heading: patch.heading }),
    ...(patch.body === undefined ? {} : { body: patch.body }),
    ...(patch.guidance === undefined ? {} : { guidance: patch.guidance || null }),
    ...(patch.optional === undefined ? {} : { optional: patch.optional }),
  };
  const { error } = await supabase.from("template_sections").update(row).eq("id", sectionId);
  if (error) throw error;
}

export async function deleteSection(sectionId: string): Promise<void> {
  const { error } = await supabase.from("template_sections").delete().eq("id", sectionId);
  if (error) throw error;
}

/** Move a section one place up or down, by swapping ordinals with its
 *  neighbour. Order is what a template is for, so it has to be editable. */
export async function moveSection(
  sections: TemplateSection[],
  sectionId: string,
  direction: "up" | "down",
): Promise<void> {
  const ordered = [...sections].sort((a, b) => a.ordinal - b.ordinal);
  const index = ordered.findIndex((s) => s.id === sectionId);
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || swapWith < 0 || swapWith >= ordered.length) return;

  const a = ordered[index]!;
  const b = ordered[swapWith]!;
  // Two updates rather than an upsert: an upsert would have to send whole
  // rows, and sending a partial one would blank the columns it left out.
  const first = await supabase
    .from("template_sections")
    .update({ ordinal: b.ordinal })
    .eq("id", a.id);
  if (first.error) throw first.error;
  const second = await supabase
    .from("template_sections")
    .update({ ordinal: a.ordinal })
    .eq("id", b.id);
  if (second.error) throw second.error;
}
