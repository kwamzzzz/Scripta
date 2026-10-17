import { supabase } from "@/integrations/supabase/client";
import { extOf, fileTypeError } from "@/lib/parsing/mime";
import type { BoardDoc } from "@/lib/home-data";

/**
 * Real document-library operations: metadata, rename, move, archive, delete,
 * version history and export. Everything here writes to the database through
 * RLS as the signed-in user, and every mutation records an audit event.
 */

export type DocMeta = {
  name: string;
  kind: BoardDoc["kind"];
  versionLabel: string;
  docDate: string | null;
  jurisdiction: string | null;
  effectiveDate: string | null;
  parties: string[];
  tags: string[];
  confidentiality: string | null;
  notes: string | null;
};

export type DocVersion = {
  id: string;
  documentId: string;
  matterId: string;
  label: string;
  note: string;
  storagePath: string | null;
  bytes: number | null;
  createdAt: string;
  createdBy: string | null;
  current: boolean;
};

export const CONFIDENTIALITY = ["Internal", "Confidential", "Highly confidential"] as const;

type Actor = { id: string | null; name: string };

async function audit(
  matterId: string,
  actor: Actor,
  eventType: string,
  entityId: string,
  summary: string,
) {
  await supabase.from("audit_events").insert({
    matter_id: matterId,
    actor_id: actor.id,
    actor_name: actor.name,
    event_type: eventType,
    entity_type: "document",
    entity_id: entityId,
    summary,
  });
}

export async function saveDocumentMeta(doc: BoardDoc, meta: DocMeta, actor: Actor) {
  const { error } = await supabase
    .from("documents")
    .update({
      name: meta.name.trim() || doc.name,
      kind: meta.kind,
      version_label: meta.versionLabel.trim() || null,
      doc_date: meta.docDate || null,
      jurisdiction: meta.jurisdiction?.trim() || null,
      effective_date: meta.effectiveDate || null,
      parties: meta.parties.filter(Boolean),
      tags: meta.tags.filter(Boolean),
      confidentiality: meta.confidentiality || null,
      notes: meta.notes?.trim() || null,
      last_edited_by: actor.id,
      last_edited_at: new Date().toISOString(),
    })
    .eq("id", doc.id);
  if (error) throw new Error(error.message);
  await audit(doc.matterId, actor, "document.updated", doc.id, `${meta.name} details updated`);
}

export async function moveDocument(doc: BoardDoc, matterId: string, actor: Actor) {
  if (matterId === doc.matterId) return;
  const { error } = await supabase
    .from("documents")
    .update({ matter_id: matterId, last_edited_by: actor.id, last_edited_at: new Date().toISOString() })
    .eq("id", doc.id);
  if (error) throw new Error(error.message);
  await supabase.from("document_versions").update({ matter_id: matterId }).eq("document_id", doc.id);
  await audit(matterId, actor, "document.moved", doc.id, `${doc.name} moved into this matter`);
}

export async function setArchived(doc: BoardDoc, archived: boolean, actor: Actor) {
  const { error } = await supabase
    .from("documents")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", doc.id);
  if (error) throw new Error(error.message);
  await audit(
    doc.matterId,
    actor,
    archived ? "document.archived" : "document.restored",
    doc.id,
    `${doc.name} ${archived ? "archived" : "restored"}`,
  );
}

export async function deleteDocuments(rows: BoardDoc[], actor: Actor) {
  const paths = rows.map((r) => r.storagePath).filter((p): p is string => !!p);
  const versions = await supabase
    .from("document_versions")
    .select("storage_path")
    .in(
      "document_id",
      rows.map((r) => r.id),
    );
  for (const v of versions.data ?? []) if (v.storage_path) paths.push(v.storage_path);
  if (paths.length) await supabase.storage.from("matter-documents").remove([...new Set(paths)]);
  const { error } = await supabase
    .from("documents")
    .delete()
    .in(
      "id",
      rows.map((r) => r.id),
    );
  if (error) throw new Error(error.message);
  for (const r of rows) await audit(r.matterId, actor, "document.deleted", r.id, `${r.name} deleted`);
}

export async function signedUrl(path: string, download?: string) {
  const { data, error } = await supabase.storage
    .from("matter-documents")
    .createSignedUrl(path, 60, download ? { download } : undefined);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export async function listVersions(doc: BoardDoc): Promise<DocVersion[]> {
  const { data, error } = await supabase
    .from("document_versions")
    .select("id, document_id, matter_id, label, note, storage_path, byte_size, created_at, created_by")
    .eq("document_id", doc.id)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const history: DocVersion[] = (data ?? []).map((v) => ({
    id: v.id,
    documentId: v.document_id,
    matterId: v.matter_id,
    label: v.label ?? "",
    note: v.note ?? "",
    storagePath: v.storage_path,
    bytes: v.byte_size,
    createdAt: v.created_at,
    createdBy: v.created_by,
    current: false,
  }));
  return [
    {
      id: `current-${doc.id}`,
      documentId: doc.id,
      matterId: doc.matterId,
      label: doc.ver || "Current",
      note: "Current file",
      storagePath: doc.storagePath,
      bytes: doc.bytes,
      createdAt: doc.updatedAt,
      createdBy: null,
      current: true,
    },
    ...history,
  ];
}

/** Uploads a replacement file, keeping the file it replaces as a version. */
export async function uploadNewVersion(
  doc: BoardDoc,
  file: File,
  label: string,
  note: string,
  workspaceId: string,
  actor: Actor,
) {
  const typeError = fileTypeError(file);
  if (typeError) throw new Error(typeError);

  if (doc.storagePath) {
    const { error } = await supabase.from("document_versions").insert({
      document_id: doc.id,
      matter_id: doc.matterId,
      label: doc.ver || null,
      note: "Replaced by a newer version",
      storage_path: doc.storagePath,
      byte_size: doc.bytes,
      created_by: actor.id,
    });
    if (error) throw new Error(error.message);
  }

  const extraNote = note.trim();
  const path = `${workspaceId}/${doc.matterId}/${crypto.randomUUID()}${extOf(file.name)}`;
  const up = await supabase.storage
    .from("matter-documents")
    .upload(path, file, { contentType: file.type || "application/octet-stream" });
  if (up.error) throw new Error(up.error.message);

  const { error } = await supabase
    .from("documents")
    .update({
      storage_path: path,
      mime_type: file.type || null,
      byte_size: file.size,
      version_label: label.trim() || doc.ver || null,
      parse_status: "pending",
      parse_error: null,
      last_edited_by: actor.id,
      last_edited_at: new Date().toISOString(),
    })
    .eq("id", doc.id);
  if (error) throw new Error(error.message);

  if (extraNote) {
    await supabase
      .from("document_versions")
      .update({ note: extraNote })
      .eq("document_id", doc.id)
      .eq("storage_path", doc.storagePath ?? "");
  }

  await audit(
    doc.matterId,
    actor,
    "document.version.created",
    doc.id,
    `${doc.name} — new version ${label.trim() || file.name} uploaded`,
  );
}

/** Points the document back at an earlier file, keeping the current one in history. */
export async function restoreVersion(doc: BoardDoc, version: DocVersion, actor: Actor) {
  if (!version.storagePath) throw new Error("That version has no stored file.");
  if (doc.storagePath) {
    await supabase.from("document_versions").insert({
      document_id: doc.id,
      matter_id: doc.matterId,
      label: doc.ver || null,
      note: "Superseded by a restore",
      storage_path: doc.storagePath,
      byte_size: doc.bytes,
      created_by: actor.id,
    });
  }
  const { error } = await supabase
    .from("documents")
    .update({
      storage_path: version.storagePath,
      byte_size: version.bytes,
      version_label: version.label || doc.ver || null,
      parse_status: "pending",
      parse_error: null,
      last_edited_by: actor.id,
      last_edited_at: new Date().toISOString(),
    })
    .eq("id", doc.id);
  if (error) throw new Error(error.message);
  await supabase.from("document_versions").delete().eq("id", version.id);
  await audit(
    doc.matterId,
    actor,
    "document.version.restored",
    doc.id,
    `${doc.name} restored to ${version.label || "an earlier version"}`,
  );
}

/** Full-text search inside parsed document text. Returns matching ids. */
export async function searchDocumentText(matterIds: string[], term: string): Promise<Set<string>> {
  const q = term.trim();
  if (!q || matterIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from("documents")
    .select("id")
    .in("matter_id", matterIds)
    .textSearch("parsed_text", q, { type: "websearch", config: "english" });
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r) => r.id));
}

/** Loads the archived documents for a workspace's matters. */
export async function fetchArchivedDocs(matterIds: string[]) {
  if (matterIds.length === 0) return [];
  const { data } = await supabase
    .from("documents")
    .select(
      "id, matter_id, name, kind, version_label, doc_date, parse_status, parse_error, storage_path, byte_size, created_at, updated_at",
    )
    .in("matter_id", matterIds)
    .not("archived_at", "is", null)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  return data ?? [];
}

/**
 * Loads the documents in Recently Deleted, archived or not: a document that was
 * archived before it was deleted is in the bin like any other, and goes back to
 * being archived when it is restored.
 */
export async function fetchBinnedDocs(matterIds: string[]) {
  if (matterIds.length === 0) return [];
  const { data } = await supabase
    .from("documents")
    .select(
      "id, matter_id, name, kind, version_label, doc_date, parse_status, parse_error, storage_path, byte_size, created_at, updated_at, archived_at, deleted_at",
    )
    .in("matter_id", matterIds)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });
  return data ?? [];
}
