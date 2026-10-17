import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { corporateExportSpec, readCorporateContentV2 } from "@/lib/corporate-documents";
import { isCorporateKind, readKind } from "@/lib/corporate/kinds";
import { buildCleanDocx } from "@/lib/export/docx";
import { buildCleanPdf } from "@/lib/export/pdf";
import { loadLetterhead } from "@/lib/letterhead-paper.server";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PDF_MIME = "application/pdf";

const input = z.object({
  workspaceId: z.string().uuid(),
  documentId: z.string().uuid(),
  format: z.enum(["docx", "pdf"]),
});

const b64 = (bytes: Uint8Array) => {
  let value = "";
  for (let index = 0; index < bytes.length; index += 0x8000)
    value += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(value);
};

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "corporate-document";

/**
 * Build a saved corporate document from the same database row that supplies
 * its preview. The workspace predicate is explicit as well as enforced by RLS.
 */
export const exportCorporateDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((value) => input.parse(value))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { data: row, error } = await supabase
      .from("corporate_documents")
      .select("id, workspace_id, kind, title, content, letterhead_id")
      .eq("workspace_id", data.workspaceId)
      .eq("id", data.documentId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("This document is unavailable in the current workspace.");
    // Every kind the app can draft, and the legacy value. This guard listed
    // only the two kinds that existed before the instruments were split out,
    // so a board minute or a shareholders' resolution could be written and
    // then refused at the door.
    if (!isCorporateKind(row.kind))
      throw new Error("This corporate document has an unsupported type.");
    const kind = readKind(row.kind);

    const spec = corporateExportSpec({
      kind,
      content: readCorporateContentV2(kind, row.content),
    });

    const paper = row.letterhead_id ? await loadLetterhead(supabase, row.letterhead_id) : undefined;

    const options = {
      ...spec,
      author: "Scripta",
      date: new Date().toISOString(),
    };
    const bytes =
      data.format === "docx"
        ? buildCleanDocx(paper ? { ...options, letterhead: paper.docx } : options)
        : buildCleanPdf(paper ? { ...options, letterhead: paper.pdf } : options);
    return {
      filename: `${slug(row.title)}.${data.format}`,
      mime: data.format === "docx" ? DOCX_MIME : PDF_MIME,
      base64: b64(bytes),
    };
  });
