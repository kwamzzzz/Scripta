import type { ClauseFilters } from "@/lib/drafting";

export type DraftSource = "ai" | "human";

/** The columns the Drafting feature owns, with the optional matter label joined for lists. */
export type DraftRow = {
  id: string;
  workspace_id: string;
  matter_id: string | null;
  title: string;
  body: string;
  source: DraftSource;
  agreement_type: string | null;
  clause_category: string | null;
  jurisdiction: string | null;
  sector: string | null;
  risk_position: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  matters?: { name: string | null } | { name: string | null }[] | null;
};

/** Exactly the state a current `drafts` row can restore without invention. */
export type RestorableDraft = {
  id: string;
  workspaceId: string;
  matterId: string;
  title: string;
  body: string;
  provenance: "ai" | "user";
  filters: ClauseFilters;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  historyAvailable: false;
};

export type DraftListItem = {
  id: string;
  title: string;
  bodyPreview: string;
  matterId: string | null;
  matterName: string | null;
  provenance: "ai" | "user";
  updatedAt: string;
};

export type SaveableDraft = {
  workspaceId: string;
  matterId: string | null;
  title: string;
  body: string;
  source: DraftSource;
  agreementType: string | null;
  clauseCategory: string | null;
  jurisdiction: string | null;
  sector: string | null;
  riskPosition: string | null;
};

export const DRAFT_HISTORY_UNAVAILABLE =
  "The request, source and guidance history were not saved with this draft.";

/**
 * Restore only persisted fields. Request, selected source, action, assessment
 * and guidance are deliberately absent: a plausible blank would be false data.
 */
export function restoreDraft(row: DraftRow): RestorableDraft {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    matterId: row.matter_id ?? "",
    title: row.title,
    body: row.body,
    provenance: row.source === "ai" ? "ai" : "user",
    filters: {
      agreementType: row.agreement_type ?? "",
      clauseCategory: row.clause_category ?? "",
      jurisdiction: row.jurisdiction ?? "",
      sector: row.sector ?? "",
      riskPosition: row.risk_position ?? "",
    },
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    historyAvailable: false,
  };
}

const joinedMatterName = (matter: DraftRow["matters"]): string | null => {
  const joined = Array.isArray(matter) ? matter[0] : matter;
  return joined?.name?.trim() || null;
};

const preview = (body: string): string => {
  const compact = body.replace(/\s+/g, " ").trim();
  return compact.length > 120 ? `${compact.slice(0, 119).trimEnd()}…` : compact;
};

/** Shape and deterministically order the rows returned by the recent-drafts query. */
export function shapeDraftList(rows: DraftRow[]): DraftListItem[] {
  return rows
    .map((row) => ({
      id: row.id,
      title: row.title,
      bodyPreview: preview(row.body),
      matterId: row.matter_id,
      matterName: joinedMatterName(row.matters),
      provenance: row.source === "ai" ? ("ai" as const) : ("user" as const),
      updatedAt: row.updated_at,
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
}

/** Stable comparison for deciding whether persisted draft fields have changed. */
export function draftFingerprint(draft: SaveableDraft): string {
  return JSON.stringify([
    draft.workspaceId,
    draft.matterId,
    draft.title,
    draft.body,
    draft.source,
    draft.agreementType,
    draft.clauseCategory,
    draft.jurisdiction,
    draft.sector,
    draft.riskPosition,
  ]);
}
