/**
 * Building the day as a file.
 *
 * On the server rather than in the browser for one reason: the firm's paper.
 * A letterhead is bytes in a storage bucket, and `loadWorkspacePaper` is the
 * one place that knows how to fetch and shape it — the same path a contract and
 * a board resolution take. A day's report is a document the firm produced, so
 * it comes out looking like one.
 *
 * The entries are sent up rather than re-derived here, so the file says exactly
 * what the screen said — including the lines you corrected, the context you
 * added and the entries you left out. A file that quietly disagreed with the
 * report it was exported from would be worse than no file.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildCleanDocx } from "@/lib/export/docx";
import { buildCleanPdf } from "@/lib/export/pdf";
import { loadWorkspacePaper } from "@/lib/letterhead-paper.server";
import { reportClauses, reportFilename, reportTitle } from "./export";
import type { WorkEntry } from "./model";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PDF_MIME = "application/pdf";

const entry = z.object({
  id: z.string(),
  title: z.string(),
  at: z.string(),
  matterId: z.string().nullable(),
  matterName: z.string(),
  tool: z.string().optional(),
  output: z.string().optional(),
  href: z.string().optional(),
  note: z.string().optional(),
  excluded: z.boolean().optional(),
});

const input = z.object({
  workspaceId: z.string().uuid(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  format: z.enum(["docx", "pdf"]),
  entries: z.array(entry),
  note: z.string(),
});

const b64 = (bytes: Uint8Array) => {
  let value = "";
  for (let index = 0; index < bytes.length; index += 0x8000)
    value += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(value);
};

export const exportWorkReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((value) => input.parse(value))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;

    const clauses = reportClauses(data.entries as WorkEntry[], data.note);
    if (!clauses.length) throw new Error("There is nothing in this day to export.");

    const paper = await loadWorkspacePaper(supabase, data.workspaceId);
    const options = {
      title: reportTitle(data.day),
      clauses,
      // A letter, not a contract: no cover page, no clause numbering scheme,
      // no table of contents. It is a page about a day.
      kind: "letter" as const,
      author: "Scripta",
      date: new Date().toISOString(),
    };

    const bytes =
      data.format === "docx"
        ? buildCleanDocx(paper ? { ...options, letterhead: paper.docx } : options)
        : buildCleanPdf(paper ? { ...options, letterhead: paper.pdf } : options);

    return {
      filename: `${reportFilename(data.day)}.${data.format}`,
      mime: data.format === "docx" ? DOCX_MIME : PDF_MIME,
      base64: b64(bytes),
    };
  });
