/**
 * Notes on a client: instructions (what a partner asked for), meeting notes,
 * and anything else worth having to hand before the work is picked up.
 *
 * Firm business, like the client record: the workspace reads them, writers
 * change them. Archive puts a note aside and Restore brings it back; Delete
 * removes it, and the screen asks first.
 */
import { supabase } from "@/integrations/supabase/client";

export type NoteKind = "instruction" | "meeting" | "note";

export const NOTE_KINDS: { id: NoteKind; label: string; plural: string }[] = [
  { id: "instruction", label: "Instructions", plural: "Instructions" },
  { id: "meeting", label: "Meeting notes", plural: "Meeting notes" },
  { id: "note", label: "Note", plural: "Notes" },
];

export const noteKindLabel = (kind: NoteKind) =>
  NOTE_KINDS.find((k) => k.id === kind)?.label ?? "Note";

export type ClientNote = {
  id: string;
  clientId: string;
  kind: NoteKind;
  title: string;
  body: string;
  notedOn: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  authorName: string;
  editorName: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export const clientNotesKey = (clientId: string) => ["client-notes", clientId];

const kindOf = (v: unknown): NoteKind => (v === "instruction" || v === "meeting" ? v : "note");

export async function listClientNotes(clientId: string): Promise<ClientNote[]> {
  const { data, error } = await supabase
    .from("client_notes")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const people = [
    ...new Set(rows.flatMap((r) => [r.created_by, r.updated_by]).filter((x): x is string => !!x)),
  ];
  const names = new Map<string, string>();
  if (people.length) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", people);
    for (const p of profiles ?? [])
      names.set(p.id, (p.full_name as string | null) || (p.email as string | null) || "Someone");
  }
  return rows.map((r) => ({
    id: r.id,
    clientId: r.client_id,
    kind: kindOf(r.kind),
    title: r.title ?? "",
    body: r.body ?? "",
    notedOn: r.noted_on,
    createdBy: r.created_by,
    updatedBy: r.updated_by,
    authorName: (r.created_by && names.get(r.created_by)) || "Someone",
    editorName: (r.updated_by && names.get(r.updated_by)) || "",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    archivedAt: r.archived_at,
  }));
}

export type NoteDraft = { kind: NoteKind; title: string; body: string; notedOn: string | null };

const clean = (draft: NoteDraft) => {
  const title = draft.title.trim();
  const body = draft.body.replace(/\s+$/, "");
  if (!title && !body.trim()) throw new Error("Write something in the note first.");
  return { kind: draft.kind, title, body, noted_on: draft.notedOn || null };
};

export async function addClientNote(
  workspaceId: string,
  clientId: string,
  draft: NoteDraft,
): Promise<void> {
  const { error } = await supabase
    .from("client_notes")
    .insert({ workspace_id: workspaceId, client_id: clientId, ...clean(draft) });
  if (error) throw new Error(error.message);
}

export async function updateClientNote(id: string, draft: NoteDraft): Promise<void> {
  const { error } = await supabase.from("client_notes").update(clean(draft)).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setClientNoteArchived(id: string, archived: boolean): Promise<void> {
  const { error } = await supabase
    .from("client_notes")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteClientNote(id: string): Promise<void> {
  const { error } = await supabase.from("client_notes").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
