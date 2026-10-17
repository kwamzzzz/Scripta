/**
 * Documents filed against a research matter: the instructing email, the
 * contract under advice, a judgment somebody downloaded.
 *
 * Until now nothing could be filed here at all — `documents.matter_id` is a
 * non-null reference to a contract matter, and a research matter usually has
 * none — so the tab could only apologise. These rows live in their own table
 * with the bytes in the existing private bucket, whose policies already
 * authorise a path whose first segment is the workspace id.
 */
import { supabase } from "@/integrations/supabase/client";

export const RESEARCH_BUCKET = "matter-documents";
const MAX_BYTES = 25 * 1024 * 1024;

export type ResearchDocumentKind = "instruction" | "evidence" | "authority" | "background";

export const DOCUMENT_KINDS: { key: ResearchDocumentKind; label: string; hint: string }[] = [
  { key: "instruction", label: "Instruction", hint: "What you were asked to advise on" },
  {
    key: "evidence",
    label: "Evidence",
    hint: "The contract, correspondence or record under advice",
  },
  {
    key: "authority",
    label: "Authority",
    hint: "A statute, judgment or article you are relying on",
  },
  { key: "background", label: "Background", hint: "Anything else worth keeping with the research" },
];

export type ResearchDocument = {
  id: string;
  researchId: string;
  workspaceId: string;
  name: string;
  storagePath: string;
  mime: string;
  bytes: number;
  kind: ResearchDocumentKind;
  note: string;
  createdAt: string;
};

type Row = {
  id: string;
  research_matter_id: string;
  workspace_id: string;
  name: string;
  storage_path: string;
  mime_type: string;
  bytes: number;
  kind: string;
  note: string;
  created_at: string;
};

const KINDS = DOCUMENT_KINDS.map((k) => k.key);
const toDocument = (row: Row): ResearchDocument => ({
  id: row.id,
  researchId: row.research_matter_id,
  workspaceId: row.workspace_id,
  name: row.name,
  storagePath: row.storage_path,
  mime: row.mime_type,
  bytes: Number(row.bytes) || 0,
  kind: (KINDS as string[]).includes(row.kind) ? (row.kind as ResearchDocumentKind) : "background",
  note: row.note ?? "",
  createdAt: row.created_at,
});

const COLUMNS =
  "id, research_matter_id, workspace_id, name, storage_path, mime_type, bytes, kind, note, created_at";

export function documentFileProblem(file: File): string | null {
  if (!file.size) return "That file is empty.";
  if (file.size > MAX_BYTES) return "Choose a file no larger than 25 MB.";
  return null;
}

export async function listResearchDocuments(researchId: string): Promise<ResearchDocument[]> {
  const { data, error } = await supabase
    .from("research_documents")
    .select(COLUMNS)
    .eq("research_matter_id", researchId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: Row) => toDocument(row));
}

export async function uploadResearchDocument(input: {
  researchId: string;
  workspaceId: string;
  file: File;
  kind: ResearchDocumentKind;
  note?: string;
}): Promise<ResearchDocument> {
  const problem = documentFileProblem(input.file);
  if (problem) throw new Error(problem);
  const id = crypto.randomUUID();
  const safe = input.file.name.replace(/[^A-Za-z0-9._ -]/g, "_").slice(-120) || "document";
  const path = `${input.workspaceId}/research/${input.researchId}/${id}-${safe}`;
  const { error: uploadError } = await supabase.storage
    .from(RESEARCH_BUCKET)
    .upload(path, input.file, {
      contentType: input.file.type || "application/octet-stream",
      upsert: false,
    });
  if (uploadError) throw new Error(uploadError.message);
  const { data, error } = await supabase
    .from("research_documents")
    .insert({
      id,
      research_matter_id: input.researchId,
      workspace_id: input.workspaceId,
      name: input.file.name,
      storage_path: path,
      mime_type: input.file.type || "",
      bytes: input.file.size,
      kind: input.kind,
      note: input.note ?? "",
    })
    .select(COLUMNS)
    .single();
  if (error) {
    // The row is what makes the file findable; without it the bytes are litter.
    await supabase.storage.from(RESEARCH_BUCKET).remove([path]);
    throw new Error(error.message);
  }
  return toDocument(data as Row);
}

export async function deleteResearchDocument(document: ResearchDocument): Promise<void> {
  const { error } = await supabase.from("research_documents").delete().eq("id", document.id);
  if (error) throw new Error(error.message);
  await supabase.storage.from(RESEARCH_BUCKET).remove([document.storagePath]);
}

export async function researchDocumentUrl(document: ResearchDocument): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(RESEARCH_BUCKET)
    .createSignedUrl(document.storagePath, 600);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/** The text of a document, where it is one we can read without a viewer. */
export async function readResearchDocumentText(document: ResearchDocument): Promise<string | null> {
  const extension = document.name.split(".").pop()?.toLowerCase() ?? "";
  if (!["txt", "md", "csv", "json"].includes(extension) && !document.mime.startsWith("text/"))
    return null;
  const { data, error } = await supabase.storage
    .from(RESEARCH_BUCKET)
    .download(document.storagePath);
  if (error || !data) return null;
  return data.text();
}

export const humanBytes = (bytes: number) =>
  bytes >= 1_048_576
    ? `${(bytes / 1_048_576).toFixed(1)} MB`
    : bytes >= 1024
      ? `${Math.round(bytes / 1024)} KB`
      : `${bytes} B`;
