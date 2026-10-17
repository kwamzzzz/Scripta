import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildCleanDocx, type ExportPara, type ExportSeg } from "@/lib/export/docx";
import { docToParas } from "@/lib/export/rich-doc";
import { loadLetterhead } from "@/lib/letterhead-paper.server";
import type { ClauseDoc } from "@/wireframe/clause-doc";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const input = z.object({
  workspaceId: z.string().uuid(),
  handoverId: z.string().uuid(),
  letterheadId: z.string().uuid().nullable(),
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
    .slice(0, 60) || "handover";

const seg = (t: string, bold = false): ExportSeg => ({
  t,
  k: "n",
  ...(bold ? { m: { b: true } } : {}),
});

/**
 * A handover as a Word document: who it is for and from, the date and the
 * subject in a small ruled table, then the note itself, then the list of what
 * went with it. On the firm's paper when a letterhead is chosen.
 */
export const exportHandover = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((value) => input.parse(value))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { data: row, error } = await supabase
      .from("handovers")
      .select("id, subject, to_line, cc_line, body, attachments, created_by, updated_at")
      .eq("workspace_id", data.workspaceId)
      .eq("id", data.handoverId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("This handover is unavailable.");
    const { data: me } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", row.created_by)
      .maybeSingle();

    const date = new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const facts: [string, string][] = [
      ["To", row.to_line],
      ["Cc", row.cc_line],
      ["From", me?.full_name || me?.email || ""],
      ["Date", date],
      ["Subject", row.subject],
    ];
    const meta: ExportPara = {
      runs: [],
      grid: {
        rows: facts
          .filter(([, value]) => value.trim())
          .map(([label, value]) => ({ cells: [[seg(label, true)], [seg(value)]] })),
      },
    };
    const files: { name: string }[] = Array.isArray(row.attachments) ? row.attachments : [];
    const paras: ExportPara[] = [
      meta,
      ...docToParas(row.body as ClauseDoc | null),
      ...(files.length
        ? [
            { runs: [seg("Attachments")], heading: 2 as const },
            ...files.map((f) => ({ runs: [seg(f.name)], list: "bullet" as const, level: 0 })),
          ]
        : []),
    ];

    const paper = data.letterheadId ? await loadLetterhead(supabase, data.letterheadId) : undefined;
    const options = {
      title: "Handover note",
      clauses: [{ num: "", title: "", segs: [], paras, unnumbered: true }],
      numbering: "literal" as const,
      kind: "letter" as const,
      author: me?.full_name || "Scripta",
      date: new Date().toISOString(),
    };
    const bytes = buildCleanDocx(paper ? { ...options, letterhead: paper.docx } : options);
    return {
      filename: `${slug(row.subject || "handover")}.docx`,
      mime: DOCX_MIME,
      base64: b64(bytes),
    };
  });
