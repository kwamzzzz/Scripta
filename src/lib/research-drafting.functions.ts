import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { DraftingResearchAuthority, DraftingResearchSource } from "@/lib/research-drafting";

/** A research conclusion for drafting, explicitly scoped to the active workspace. */
export const loadResearchForDrafting = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { workspaceId: string; researchId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { data: row, error } = await supabase
      .from("research_matters")
      .select(
        "id, title, short_answer, research_authorities(n, cite, kind, source, cite_date, held)",
      )
      .eq("workspace_id", data.workspaceId)
      .eq("id", data.researchId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("This research matter is unavailable in the current workspace.");

    return {
      id: row.id as string,
      title: row.title as string,
      shortAnswer: (row.short_answer ?? "") as string,
      authorities: (row.research_authorities ?? []).map(
        (authority: {
          n?: number | null;
          cite?: string | null;
          kind?: string | null;
          source?: string | null;
          cite_date?: string | null;
          held?: string | null;
        }): DraftingResearchAuthority => ({
          n: authority.n ?? 0,
          cite: authority.cite ?? "",
          kind: authority.kind ?? "",
          source: authority.source ?? "",
          date: authority.cite_date ?? "",
          held: authority.held ?? "",
        }),
      ),
    } satisfies DraftingResearchSource;
  });
