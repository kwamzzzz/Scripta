/** Work in progress before a contract is accepted into a matter. */
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesUpdate } from "@/integrations/supabase/types";
import type { ContractPlan } from "@/lib/contract-plan";
import type { ClauseDraftOutcome } from "@/lib/contract-draft";
import { setArchived } from "@/lib/archive";

// Keep plain PostgrestError objects readable, as in the preset library.
export { errorMessage } from "@/matter-flow/presets/db";

export type ContractDraftStage = "brief" | "plan" | "draft";
export type ContractDraftView = "All" | "Accepted" | "Archived";

export type ContractDraftContent = {
  matterId: string | null;
  title: string;
  agreementType: string;
  governingLaw: string;
  instructions: string;
  stage: ContractDraftStage;
  plan: ContractPlan | null;
  outcomes: ClauseDraftOutcome[];
};

export type ContractDraft = ContractDraftContent & {
  id: string;
  workspaceId: string;
  matterName: string;
  acceptedAt: string | null;
  acceptedMatterId: string | null;
  acceptedMatterName: string;
  archivedAt: string | null;
  /** In Recently Deleted since this moment; null means live. */
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const contractDraftsQueryKey = (workspaceId: string | null) => [
  "contract-drafts",
  workspaceId,
];
export const contractDraftQueryKey = (workspaceId: string | null, id: string | undefined) => [
  "contract-draft",
  workspaceId,
  id,
];

export const emptyContractDraft = (): ContractDraftContent => ({
  matterId: null,
  title: "",
  agreementType: "",
  governingLaw: "",
  instructions: "",
  stage: "brief",
  plan: null,
  outcomes: [],
});

const STAGE_LABEL: Record<ContractDraftStage, string> = {
  brief: "Brief",
  plan: "Plan agreed",
  draft: "Drafting",
};
type DraftState = Pick<ContractDraft, "stage" | "acceptedAt" | "archivedAt">;

export const contractDraftStageLabel = (draft: Pick<DraftState, "stage" | "acceptedAt">) =>
  draft.acceptedAt ? "Accepted" : STAGE_LABEL[draft.stage];

export function contractDraftMatchesView(draft: DraftState, view: ContractDraftView): boolean {
  if (view === "Archived") return !!draft.archivedAt;
  return !draft.archivedAt && (view === "All" || !!draft.acceptedAt);
}

export const contractDraftTitle = (draft: Pick<ContractDraftContent, "title">) =>
  draft.title.trim() || "Untitled contract";

/** Only the screen's editable fields participate in autosave. */
export function contractDraftContent(draft: ContractDraftContent): ContractDraftContent {
  return {
    matterId: draft.matterId,
    title: draft.title,
    agreementType: draft.agreementType,
    governingLaw: draft.governingLaw,
    instructions: draft.instructions,
    stage: draft.stage,
    plan: draft.plan,
    outcomes: draft.outcomes,
  };
}

export const contractDraftFingerprint = (draft: ContractDraftContent) =>
  JSON.stringify(contractDraftContent(draft));

/** A refreshed interrupted run must offer the existing single-clause Retry action. */
export function resumableContractOutcomes(draft: ContractDraftContent): ClauseDraftOutcome[] {
  if (draft.stage !== "draft" || !draft.plan) return draft.outcomes;
  return draft.plan.clauses.map(
    (clause) =>
      draft.outcomes.find((outcome) => outcome.num === clause.num) ?? {
        num: clause.num,
        title: clause.title,
        ok: false,
        reason:
          "Drafting was interrupted before this clause was saved. Retry this clause to continue.",
      },
  );
}

// Validate persisted JSON without trimming an unfinished edit or silently discarding work.
const planSchema = z.object({
  agreementType: z.string(),
  governingLaw: z.string(),
  clauses: z.array(z.object({ num: z.string(), title: z.string(), purpose: z.string() })),
});
const outcomesSchema = z.array(
  z.discriminatedUnion("ok", [
    z.object({ num: z.string(), title: z.string(), ok: z.literal(true), text: z.string() }),
    z.object({ num: z.string(), title: z.string(), ok: z.literal(false), reason: z.string() }),
  ]),
);
type DraftRow = Tables<"contract_drafts"> & {
  matters: { name: string } | null;
  accepted_matter: { name: string } | null;
};
const SELECT =
  "*, matters!contract_drafts_matter_id_fkey(name), accepted_matter:matters!contract_drafts_accepted_matter_id_fkey(name)";

export function readContractDraft(row: DraftRow): ContractDraft {
  const stage = z.enum(["brief", "plan", "draft"]).safeParse(row.stage);
  const plan = planSchema.nullable().safeParse(row.plan);
  const outcomes = outcomesSchema.safeParse(row.outcomes);
  if (
    !stage.success ||
    !plan.success ||
    !outcomes.success ||
    (stage.data !== "brief" && !plan.data)
  )
    throw new Error("This contract draft contains unreadable saved work. It has not been changed.");
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    matterId: row.matter_id,
    matterName: row.matters?.name ?? "",
    title: row.title,
    agreementType: row.agreement_type,
    governingLaw: row.governing_law,
    instructions: row.instructions,
    stage: stage.data,
    plan: plan.data,
    outcomes: outcomes.data,
    acceptedAt: row.accepted_at,
    acceptedMatterId: row.accepted_matter_id,
    acceptedMatterName: row.accepted_matter?.name ?? "",
    archivedAt: row.archived_at,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function writable(draft: ContractDraftContent): TablesUpdate<"contract_drafts"> {
  return {
    matter_id: draft.matterId,
    title: draft.title,
    agreement_type: draft.agreementType,
    governing_law: draft.governingLaw,
    instructions: draft.instructions,
    stage: draft.stage,
    plan: draft.plan,
    outcomes: draft.outcomes,
    updated_at: new Date().toISOString(),
  };
}

export async function listContractDrafts(workspaceId: string): Promise<ContractDraft[]> {
  const { data, error } = await supabase
    .from("contract_drafts")
    .select(SELECT)
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .order("id");
  if (error) throw error;
  return (data ?? []).map(readContractDraft);
}

export async function getContractDraft(
  id: string,
  workspaceId: string,
): Promise<ContractDraft | null> {
  const { data, error } = await supabase
    .from("contract_drafts")
    .select(SELECT)
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? readContractDraft(data) : null;
}

export async function createContractDraft(
  workspaceId: string,
  content: ContractDraftContent,
): Promise<ContractDraft> {
  const { data, error } = await supabase
    .from("contract_drafts")
    .insert({ ...writable(content), workspace_id: workspaceId, title: content.title })
    .select(SELECT)
    .single();
  if (error) throw error;
  return readContractDraft(data);
}

export async function updateContractDraft(
  id: string,
  workspaceId: string,
  content: ContractDraftContent,
): Promise<ContractDraft> {
  const { data, error } = await supabase
    .from("contract_drafts")
    .update(writable(content))
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .is("accepted_at", null)
    .is("archived_at", null)
    .select(SELECT)
    .maybeSingle();
  if (error) throw error;
  if (!data)
    throw new Error(
      "This draft was accepted, archived or removed. Your latest changes have not been saved.",
    );
  return readContractDraft(data);
}

/** Record acceptance after the existing atomic matter/document/clause operation succeeds. */
export async function markContractDraftAccepted(
  id: string,
  workspaceId: string,
  matterId: string,
): Promise<ContractDraft> {
  const { data, error } = await supabase
    .from("contract_drafts")
    .update({
      accepted_at: new Date().toISOString(),
      accepted_matter_id: matterId,
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .is("accepted_at", null)
    .select(SELECT)
    .maybeSingle();
  if (error) throw error;
  if (data) return readContractDraft(data);
  const existing = await getContractDraft(id, workspaceId);
  if (existing?.acceptedAt && existing.acceptedMatterId === matterId) return existing;
  throw new Error("The contract was accepted, but this draft's acceptance could not be recorded.");
}

export const archiveContractDrafts = (ids: string[], archived: boolean) =>
  setArchived("contract_drafts", ids, archived);

export async function deleteContractDraft(id: string, workspaceId: string): Promise<void> {
  const { error } = await supabase
    .from("contract_drafts")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("id", id);
  if (error) throw error;
}
