/**
 * One document, opened where the organisation cites it.
 *
 * The same viewer the matter file uses, in a dialog, so a certificate read
 * from an entity or a licence reads exactly as it would anywhere else in
 * Scripta. The row is read through the documents policy: a document the reader
 * may not open says so rather than appearing.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/primitives";
import DocumentViewer from "@/matter-file/DocumentViewer";
import { Modal } from "@/wireframe/screens";
import type { Doc } from "@/data/legal";
import type { DocKind } from "@/lib/use-upload";
import "@/matter-file/matter-file.css";
import "../documents.css";

export default function DocumentReader({
  documentId,
  onClose,
}: {
  documentId: string | null;
  onClose: () => void;
}) {
  const row = useQuery({
    queryKey: ["organisation-document", documentId],
    enabled: !!documentId,
    retry: false,
    queryFn: async (): Promise<Doc> => {
      const { data, error } = await supabase
        .from("documents")
        .select("id, name, kind, parse_status, parse_error, created_at, version_label, storage_path")
        .eq("id", documentId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("This document is unavailable to you.");
      return {
        id: data.id,
        name: data.name,
        ver: data.version_label ?? "",
        storagePath: data.storage_path ?? null,
        date: new Date(data.created_at).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        }),
        kind: "",
        rawKind: data.kind as DocKind,
        parseStatus: data.parse_status,
        parseError: data.parse_error,
      };
    },
  });

  return (
    <Modal open={!!documentId} onClose={onClose} label="Read document">
      <div className="dr-reader">
        <div className="dr-reader-bar">
          <Button onClick={onClose}>Close</Button>
        </div>
        {row.isError ? (
          <p className="org-error" role="alert">
            {(row.error as Error).message}
          </p>
        ) : !row.data ? (
          <p className="org-hint" role="status">
            Opening…
          </p>
        ) : (
          <DocumentViewer doc={row.data} />
        )}
      </div>
    </Modal>
  );
}
