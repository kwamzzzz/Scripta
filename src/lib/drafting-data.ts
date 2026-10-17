import { supabase } from "@/integrations/supabase/client";
import type { ClauseFilters } from "@/lib/drafting";

export type LibraryItem = {
  id: string;
  kind: "precedent" | "playbook";
  title: string;
  body: string;
  meta: string;
  approved: boolean;
  agreementType: string | null;
  clauseCategory: string | null;
  jurisdiction: string | null;
  sector: string | null;
  riskPosition: string | null;
};

/**
 * Everything reusable in the workspace: approved playbook positions and saved
 * precedents, in one list, because a lawyer starting a draft does not care which
 * table the language lives in.
 */
export async function fetchLibrary(workspaceId: string): Promise<LibraryItem[]> {
  const [precRes, ruleRes] = await Promise.all([
    supabase
      .from("precedents")
      .select("id, title, body, clause_type, agreement_type, jurisdiction, sector, approved, source_note")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false }),
    supabase
      .from("playbook_rules")
      .select(
        "id, topic, preferred, approved_clause_text, risk_level, jurisdiction_note, playbooks!inner(id, name, version_label, workspace_id, agreement_type, jurisdiction, status)",
      )
      .eq("playbooks.workspace_id", workspaceId)
      .order("ordinal"),
  ]);

  const precedents: LibraryItem[] = (precRes.data ?? []).map((p) => ({
    id: p.id,
    kind: "precedent",
    title: p.title,
    body: p.body,
    meta: [p.clause_type, p.agreement_type, p.jurisdiction, p.sector].filter(Boolean).join(" · "),
    approved: p.approved,
    agreementType: p.agreement_type,
    clauseCategory: p.clause_type,
    jurisdiction: p.jurisdiction,
    sector: p.sector,
    riskPosition: null,
  }));

  const rules: LibraryItem[] = (ruleRes.data ?? []).map((r) => {
    const pb = r.playbooks as unknown as {
      name: string;
      version_label: string | null;
      agreement_type: string | null;
      jurisdiction: string | null;
      status: string;
    };
    return {
      id: r.id,
      kind: "playbook" as const,
      title: r.topic,
      body: r.approved_clause_text ?? r.preferred ?? "",
      meta: [pb.name, pb.version_label, pb.agreement_type, r.jurisdiction_note ?? pb.jurisdiction]
        .filter(Boolean)
        .join(" · "),
      approved: pb.status === "Active",
      agreementType: pb.agreement_type,
      clauseCategory: null,
      jurisdiction: r.jurisdiction_note ?? pb.jurisdiction,
      sector: null,
      riskPosition: r.risk_level ?? null,
    };
  });

  return [...rules, ...precedents];
}

const match = (value: string | null, filter: string) =>
  !filter || (value ?? "").toLowerCase().includes(filter.toLowerCase());

export function filterLibrary(items: LibraryItem[], f: ClauseFilters, q: string): LibraryItem[] {
  const needle = q.trim().toLowerCase();
  return items.filter(
    (i) =>
      match(i.agreementType, f.agreementType) &&
      match(i.clauseCategory, f.clauseCategory) &&
      match(i.jurisdiction, f.jurisdiction) &&
      match(i.sector, f.sector) &&
      match(i.riskPosition, f.riskPosition) &&
      (!needle || i.title.toLowerCase().includes(needle) || i.body.toLowerCase().includes(needle)),
  );
}
