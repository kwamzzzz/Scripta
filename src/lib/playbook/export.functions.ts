/**
 * Handing the playbook over as a file.
 *
 * Built on the server, like every other document this product produces, so it
 * comes out on the firm's paper rather than looking like a screenshot of an
 * app. A lawyer takes this into a call, or opens it in Word and drafts from it;
 * either way it should look like something the firm wrote.
 *
 * `ruleIds` is what makes it useful rather than merely possible. "What do we
 * say about liability" is the question actually asked on a call, and the answer
 * should be one page, not eighteen.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildCleanDocx } from "@/lib/export/docx";
import { buildCleanPdf } from "@/lib/export/pdf";
import { loadWorkspacePaper } from "@/lib/letterhead-paper.server";
import {
  playbookDocument,
  playbookFilename,
  type ExportPlaybook,
  type ExportRule,
} from "./export-document";

const RULE_COLUMNS =
  "id, topic, category, ordinal, preferred, acceptable, fallback, redflag, escalate, approved_clause_text, negotiation_guidance, commercial_rationale, legal_rationale, approval_threshold, risk_level";

const b64 = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

export const exportPlaybook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { playbookId: string; format: "docx" | "pdf"; ruleIds?: string[] | undefined }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;

    /* Read as the caller. A playbook is a workspace's own positions and the
       row-level policy is what decides whether this person may have them —
       exporting must not be a way around reading. */
    const { data: playbook, error } = await supabase
      .from("playbooks")
      .select(
        "id, workspace_id, name, version_label, status, jurisdiction, agreement_type, our_role, description, last_reviewed_at",
      )
      .eq("id", data.playbookId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!playbook) throw new Error("That playbook is unavailable.");

    const { data: ruleRows, error: ruleError } = await supabase
      .from("playbook_rules")
      .select(RULE_COLUMNS)
      .eq("playbook_id", data.playbookId)
      .order("ordinal", { ascending: true });
    if (ruleError) throw new Error(ruleError.message);

    const rules = (ruleRows ?? []) as (ExportRule & { id: string })[];
    if (rules.length === 0) throw new Error("This playbook has no positions to export yet.");

    const wanted = data.ruleIds?.length ? new Set(data.ruleIds) : null;
    const chosen = wanted ? rules.filter((rule) => wanted.has(rule.id)) : undefined;
    if (wanted && (!chosen || chosen.length === 0))
      throw new Error("Those positions are no longer in this playbook.");

    const shape = playbookDocument(playbook as ExportPlaybook, rules, chosen);
    const paper = await loadWorkspacePaper(supabase, playbook.workspace_id);
    const options = {
      ...shape,
      // A reference document, not a contract: no cover page, no clause scheme.
      kind: "letter" as const,
      author: "Scripta",
      date: new Date().toISOString(),
    };

    const bytes =
      data.format === "docx"
        ? buildCleanDocx(paper ? { ...options, letterhead: paper.docx } : (options as never))
        : buildCleanPdf(paper ? { ...options, letterhead: paper.pdf } : (options as never));

    return {
      filename: playbookFilename(playbook as ExportPlaybook, chosen, rules.length, data.format),
      mime:
        data.format === "docx"
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : "application/pdf",
      base64: b64(bytes),
    };
  });
