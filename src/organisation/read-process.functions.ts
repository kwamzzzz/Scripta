/**
 * Read a client's written procedure into proposed process steps.
 *
 * The document is read through the caller's own policies, so nothing reaches
 * the model that the lawyer could not open. The answer is a proposal only:
 * this function writes nothing, and every step keeps the section and page it
 * came from so the lawyer can check it against the source before saving.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callStructured, GatewayError } from "@/lib/ai-gateway.server";

export type ProposedStep = {
  title: string;
  detail: string;
  ownerHint: string;
  durationDays: number | null;
  section: string;
  page: number | null;
};

export type ProcessDraft = { name: string; summary: string; steps: ProposedStep[] };

/** Enough of a long manual to find its procedure, and no more than a call can carry. */
const TEXT_LIMIT = 60_000;

const processTool = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string", description: "The procedure's own name, as the document gives it." },
    summary: { type: "string", description: "One sentence on what the procedure is for." },
    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string", description: "Short step name, e.g. 'Supplier KYC'." },
          detail: {
            type: "string",
            description: "What the step requires, in the document's terms.",
          },
          owner_hint: {
            type: "string",
            description:
              "The role or function the document says does this step. Empty when the document does not say.",
          },
          duration_days: {
            type: "number",
            description: "Working days the document allows for the step. 0 when it does not say.",
          },
          section: {
            type: "string",
            description: "Section or clause number the step comes from, e.g. '§3.1'.",
          },
          page: { type: "number", description: "Page the step appears on. 0 when unknown." },
        },
        required: ["title", "detail", "owner_hint", "duration_days", "section", "page"],
      },
    },
  },
  required: ["name", "summary", "steps"],
};

type Block = { text?: unknown; page?: unknown };

export const readProcess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { documentId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: doc, error } = await supabase
      .from("documents")
      .select("id, name, client_id, workspace_id, parse_status, parsed_blocks, parsed_text")
      .eq("id", data.documentId)
      .maybeSingle();
    if (error) return { ok: false as const, error: error.message as string };
    if (!doc) return { ok: false as const, error: "That document is unavailable." };
    if (doc.parse_status !== "parsed")
      return {
        ok: false as const,
        error:
          doc.parse_status === "failed"
            ? "Scripta could not read that document's text."
            : "Scripta is still reading that document. Try again in a moment.",
      };

    // Page-tagged, so a step can say where it came from.
    const blocks: Block[] = Array.isArray(doc.parsed_blocks) ? doc.parsed_blocks : [];
    let text = blocks.length
      ? blocks
          .map(
            (b) =>
              `[p.${typeof b.page === "number" ? b.page : "?"}] ${typeof b.text === "string" ? b.text : ""}`,
          )
          .join("\n")
      : String(doc.parsed_text ?? "");
    const truncated = text.length > TEXT_LIMIT;
    if (truncated) text = text.slice(0, TEXT_LIMIT);
    if (!text.trim()) return { ok: false as const, error: "No text was found in that document." };

    try {
      const out = await callStructured<{
        name: string;
        summary: string;
        steps: {
          title: string;
          detail: string;
          owner_hint: string;
          duration_days: number;
          section: string;
          page: number;
        }[];
      }>({
        feature: "organisation-read-process",
        actor: { supabase, userId, workspaceId: doc.workspace_id ?? null },
        system: [
          "You read an organisation's internal procedure (an SOP, manual or policy) and set out the steps it requires, in order.",
          "Use only what the document says. Do not add steps, owners or durations it does not state; leave them empty or zero instead.",
          "Where the document is vague about who acts ('approved internally'), leave the owner empty rather than inventing one.",
          "Each line of the text begins with its page as [p.N]; report the page and the section number each step comes from.",
        ].join(" "),
        user: [
          `DOCUMENT: ${doc.name}`,
          truncated ? "(Only the first part of a long document is included.)" : "",
          "",
          text,
        ].join("\n"),
        toolName: "record_process",
        toolDescription:
          "Record the procedure's name, purpose and ordered steps as the document states them.",
        parameters: processTool,
      });
      const draft: ProcessDraft = {
        name: out.name?.trim() || doc.name,
        summary: out.summary?.trim() ?? "",
        steps: (out.steps ?? [])
          .filter((s) => s?.title?.trim())
          .map((s) => ({
            title: s.title.trim(),
            detail: s.detail?.trim() ?? "",
            ownerHint: s.owner_hint?.trim() ?? "",
            durationDays:
              typeof s.duration_days === "number" && s.duration_days > 0
                ? Math.round(s.duration_days)
                : null,
            section: s.section?.trim() ?? "",
            page: typeof s.page === "number" && s.page > 0 ? Math.round(s.page) : null,
          })),
      };
      return { ok: true as const, draft, truncated };
    } catch (e) {
      return {
        ok: false as const,
        error:
          e instanceof GatewayError ? e.message : (e as Error).message || "Scripta is unavailable.",
      };
    }
  });
