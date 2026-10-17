import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useApp } from "@/store/app";
import { parseDocument } from "@/lib/documents.functions";
import { extOf, fileTypeError } from "@/lib/parsing/mime";

/**
 * What an uploaded document is.
 *
 * "contract" and "amendment" are the pair a review compares; the rest are the
 * documents a matter actually accumulates. Everything used to arrive as a
 * contract, because those were the only two kinds the review needed and the
 * intake never grew past them — so a letter, a resolution or a proposal was
 * filed as a contract and read as though it had clauses.
 *
 * Parsing does not branch on this: every document is extracted and offered to
 * the clause splitter, which records whether it found any structure. The kind
 * says what the document IS, so a screen can file it and a lawyer can find it.
 */
export type DocKind =
  | "contract"
  | "amendment"
  | "transcript"
  | "playbook"
  | "letter"
  | "resolution"
  | "minutes"
  | "proposal"
  | "research"
  | "reference";

export function useDocumentUpload(matterId: string | null) {
  const qc = useQueryClient();
  const { user, profile } = useAuth();
  const { workspaceId } = useApp();
  const parse = useServerFn(parseDocument);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (
      file: File,
      kind: DocKind,
      versionLabel: string,
      /** The kind is Scripta's guess from the name, not the lawyer's choice. */
      guessed = false,
    ) => {
      if (!matterId) return;
      if (!workspaceId) {
        setError("No workspace selected");
        return;
      }
      const typeError = fileTypeError(file);
      if (typeError) {
        setError(typeError);
        return;
      }
      setBusy(true);
      setError(null);
      try {
        // The storage policy authorises writes via can_write_workspace() on the
        // first path segment, so the workspace id must lead. Keying this off the
        // matter id denied every upload.
        const path = `${workspaceId}/${matterId}/${crypto.randomUUID()}${extOf(file.name)}`;
        const up = await supabase.storage.from("matter-documents").upload(path, file, {
          contentType: file.type || "application/octet-stream",
        });
        if (up.error) throw new Error(up.error.message);

        const name = file.name.replace(/\.[^.]+$/, "");
        const { data: row, error: insErr } = await supabase
          .from("documents")
          .insert({
            matter_id: matterId,
            name,
            kind,
            version_label: versionLabel || null,
            doc_date: new Date().toISOString().slice(0, 10),
            storage_path: path,
            mime_type: file.type || null,
            byte_size: file.size,
            uploaded_by: user?.id ?? null,
            parse_status: "pending",
          })
          .select("id")
          .single();
        if (insErr || !row) throw new Error(insErr?.message ?? "Could not record the document");

        await supabase.from("audit_events").insert({
          matter_id: matterId,
          actor_id: user?.id ?? null,
          actor_name: profile?.full_name ?? profile?.email ?? "Unknown",
          event_type: "document.uploaded",
          entity_type: "document",
          entity_id: row.id,
          summary: `${name} uploaded (${kind})`,
        });

        await qc.invalidateQueries({ queryKey: ["matter-data", matterId] });
        await parse({ data: { documentId: row.id, reclassify: guessed } });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      } finally {
        await qc.invalidateQueries({ queryKey: ["matter-data", matterId] });
        setBusy(false);
      }
    },
    [matterId, workspaceId, parse, profile, qc, user],
  );

  return { upload, busy, error, setError };
}
