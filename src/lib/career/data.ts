/**
 * Reading and writing a lawyer's own career record.
 *
 * One load, not seven. The whole record is a few hundred rows at most — the
 * roles a person is working towards, the requirements in them, their evidence
 * and the claims between — and it is read as a whole every time, because the
 * point of the feature is what one piece of evidence does across every role.
 * Splitting it into a query per view would mean a claim written on one screen
 * leaving another screen stale.
 *
 * Every row is written by its author and readable by nobody else; row-level
 * security enforces that, and nothing here asks for anybody else's.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  CareerRole,
  Claim,
  Criterion,
  CriterionKind,
  Evidence,
  EvidenceKind,
  EvidenceLevel,
  Repetition,
  Complexity,
  CareerRoleKind,
} from "./model";

/* The career tables are newer than the generated types, so the calls are cast
   at this boundary and nowhere else. */
const db = supabase as unknown as { from: (t: string) => any };

const str = (v: unknown) => (typeof v === "string" ? v : "");

const toRole = (r: any): CareerRole => ({
  id: r.id,
  title: str(r.title),
  organisation: str(r.organisation),
  kind: (r.kind ?? "jd") as CareerRoleKind,
  sourceText: str(r.source_text),
  fileRef: r.file_ref ?? null,
  fileName: r.file_name ?? null,
  note: str(r.note),
  targetOn: r.target_on ?? null,
  createdAt: str(r.created_at),
  updatedAt: str(r.updated_at),
  archivedAt: r.archived_at ?? null,
});

const toCriterion = (r: any): Criterion => ({
  id: r.id,
  roleId: r.role_id,
  kind: (r.kind ?? "responsibility") as CriterionKind,
  section: str(r.section),
  text: str(r.text),
  note: str(r.note),
  essential: r.essential !== false,
  sortOrder: r.sort_order ?? 0,
});

const toEvidence = (r: any, links: any[]): Evidence => ({
  id: r.id,
  title: str(r.title),
  kind: (r.kind ?? "work") as EvidenceKind,
  statement: str(r.statement),
  outcome: str(r.outcome),
  level: (r.level ?? "performed") as EvidenceLevel,
  repetition: (r.repetition ?? "once") as Repetition,
  complexity: (r.complexity ?? "standard") as Complexity,
  area: str(r.area),
  happenedOn: r.happened_on ?? null,
  throughTo: r.through_to ?? null,
  corroboratedBy: str(r.corroborated_by),
  fileRef: r.file_ref ?? null,
  fileName: r.file_name ?? null,
  links: links
    .filter((l) => l.evidence_id === r.id)
    .map((l) => ({ id: l.id, kind: str(l.kind), refId: l.ref_id, label: str(l.label) })),
  createdAt: str(r.created_at),
  updatedAt: str(r.updated_at),
  archivedAt: r.archived_at ?? null,
});

export type CareerRecord = {
  roles: CareerRole[];
  criteria: Criterion[];
  evidence: Evidence[];
  claims: Claim[];
};

export const EMPTY_RECORD: CareerRecord = { roles: [], criteria: [], evidence: [], claims: [] };

export async function loadCareer(workspaceId: string): Promise<CareerRecord> {
  const [roles, criteria, evidence, links, claims] = await Promise.all([
    db.from("career_roles").select("*").eq("workspace_id", workspaceId).order("created_at"),
    db.from("career_criteria").select("*").eq("workspace_id", workspaceId).order("sort_order"),
    db.from("career_evidence").select("*").eq("workspace_id", workspaceId).order("created_at"),
    db.from("career_evidence_links").select("*").eq("workspace_id", workspaceId),
    db.from("career_claims").select("*").eq("workspace_id", workspaceId),
  ]);
  for (const r of [roles, criteria, evidence, links, claims])
    if (r.error) throw new Error(r.error.message);
  const linkRows = links.data ?? [];
  return {
    roles: (roles.data ?? []).map(toRole),
    criteria: (criteria.data ?? []).map(toCriterion),
    evidence: (evidence.data ?? []).map((r: any) => toEvidence(r, linkRows)),
    claims: (claims.data ?? []).map((c: any) => ({
      id: c.id,
      criterionId: c.criterion_id,
      evidenceId: c.evidence_id,
      note: str(c.note),
      createdAt: str(c.created_at),
    })),
  };
}

export function useCareer(workspaceId: string | null) {
  return useQuery({
    queryKey: ["career", workspaceId],
    enabled: !!workspaceId,
    queryFn: () => loadCareer(workspaceId!),
  });
}

/* ------------------------------------------------------------------ writing */

export type RolePatch = Partial<{
  title: string;
  organisation: string;
  kind: CareerRoleKind;
  sourceText: string;
  note: string;
  targetOn: string | null;
  fileRef: string | null;
  fileName: string | null;
  archivedAt: string | null;
}>;

const roleRow = (p: RolePatch) => ({
  ...(p.title !== undefined ? { title: p.title } : {}),
  ...(p.organisation !== undefined ? { organisation: p.organisation } : {}),
  ...(p.kind !== undefined ? { kind: p.kind } : {}),
  ...(p.sourceText !== undefined ? { source_text: p.sourceText } : {}),
  ...(p.note !== undefined ? { note: p.note } : {}),
  ...(p.targetOn !== undefined ? { target_on: p.targetOn } : {}),
  ...(p.fileRef !== undefined ? { file_ref: p.fileRef } : {}),
  ...(p.fileName !== undefined ? { file_name: p.fileName } : {}),
  ...(p.archivedAt !== undefined ? { archived_at: p.archivedAt } : {}),
});

export type CriterionPatch = Partial<{
  kind: CriterionKind;
  section: string;
  text: string;
  note: string;
  essential: boolean;
  sortOrder: number;
}>;

const criterionRow = (p: CriterionPatch) => ({
  ...(p.kind !== undefined ? { kind: p.kind } : {}),
  ...(p.section !== undefined ? { section: p.section } : {}),
  ...(p.text !== undefined ? { text: p.text } : {}),
  ...(p.note !== undefined ? { note: p.note } : {}),
  ...(p.essential !== undefined ? { essential: p.essential } : {}),
  ...(p.sortOrder !== undefined ? { sort_order: p.sortOrder } : {}),
});

export type EvidencePatch = Partial<{
  title: string;
  kind: EvidenceKind;
  statement: string;
  outcome: string;
  level: EvidenceLevel;
  repetition: Repetition;
  complexity: Complexity;
  area: string;
  happenedOn: string | null;
  throughTo: string | null;
  corroboratedBy: string;
  fileRef: string | null;
  fileName: string | null;
  archivedAt: string | null;
}>;

const evidenceRow = (p: EvidencePatch) => ({
  ...(p.title !== undefined ? { title: p.title } : {}),
  ...(p.kind !== undefined ? { kind: p.kind } : {}),
  ...(p.statement !== undefined ? { statement: p.statement } : {}),
  ...(p.outcome !== undefined ? { outcome: p.outcome } : {}),
  ...(p.level !== undefined ? { level: p.level } : {}),
  ...(p.repetition !== undefined ? { repetition: p.repetition } : {}),
  ...(p.complexity !== undefined ? { complexity: p.complexity } : {}),
  ...(p.area !== undefined ? { area: p.area } : {}),
  ...(p.happenedOn !== undefined ? { happened_on: p.happenedOn } : {}),
  ...(p.throughTo !== undefined ? { through_to: p.throughTo } : {}),
  ...(p.corroboratedBy !== undefined ? { corroborated_by: p.corroboratedBy } : {}),
  ...(p.fileRef !== undefined ? { file_ref: p.fileRef } : {}),
  ...(p.fileName !== undefined ? { file_name: p.fileName } : {}),
  ...(p.archivedAt !== undefined ? { archived_at: p.archivedAt } : {}),
});

const fail = ({ error }: { error: { message: string } | null }) => {
  if (error) throw new Error(error.message);
};

/**
 * Every write the portal makes, against one workspace.
 *
 * They all invalidate the same key, because the record is read as a whole:
 * claiming evidence against a requirement in one role changes what the
 * Strengths view of another role says, and a screen that showed otherwise
 * would be lying about the thing this feature exists to get right.
 */
export function useCareerActions(workspaceId: string | null) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["career", workspaceId] });
  const ws = () => {
    if (!workspaceId) throw new Error("No workspace is open.");
    return workspaceId;
  };

  /* One shape for every action: run it, then re-read the record. Named as a
     hook because it is one — called in a fixed order, once per action, on
     every render. */
  const useAction = <T>(run: (input: T) => Promise<unknown>) =>
    useMutation({ mutationFn: run, onSuccess: refresh });

  return {
    addRole: useAction(async (input: RolePatch & { title: string }) => {
      const { data, error } = await db
        .from("career_roles")
        .insert({ workspace_id: ws(), ...roleRow(input) })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return data.id as string;
    }),
    patchRole: useAction(async ({ id, patch }: { id: string; patch: RolePatch }) =>
      fail(await db.from("career_roles").update(roleRow(patch)).eq("id", id)),
    ),
    removeRole: useAction(async (id: string) =>
      fail(await db.from("career_roles").delete().eq("id", id)),
    ),

    addCriteria: useAction(
      async ({ roleId, rows }: { roleId: string; rows: (CriterionPatch & { text: string })[] }) =>
        fail(
          await db.from("career_criteria").insert(
            rows.map((r, i) => ({
              workspace_id: ws(),
              role_id: roleId,
              sort_order: r.sortOrder ?? i,
              ...criterionRow(r),
            })),
          ),
        ),
    ),
    patchCriterion: useAction(async ({ id, patch }: { id: string; patch: CriterionPatch }) =>
      fail(await db.from("career_criteria").update(criterionRow(patch)).eq("id", id)),
    ),
    removeCriterion: useAction(async (id: string) =>
      fail(await db.from("career_criteria").delete().eq("id", id)),
    ),

    addEvidence: useAction(async (input: EvidencePatch & { title: string }) => {
      const { data, error } = await db
        .from("career_evidence")
        .insert({ workspace_id: ws(), ...evidenceRow(input) })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return data.id as string;
    }),
    patchEvidence: useAction(async ({ id, patch }: { id: string; patch: EvidencePatch }) =>
      fail(await db.from("career_evidence").update(evidenceRow(patch)).eq("id", id)),
    ),
    removeEvidence: useAction(async (id: string) =>
      fail(await db.from("career_evidence").delete().eq("id", id)),
    ),

    /** Point a piece of evidence at work Scripta already holds. */
    linkWork: useAction(
      async ({
        evidenceId,
        kind,
        refId,
        label,
      }: {
        evidenceId: string;
        kind: string;
        refId: string;
        label: string;
      }) =>
        fail(
          await db
            .from("career_evidence_links")
            .upsert(
              { workspace_id: ws(), evidence_id: evidenceId, kind, ref_id: refId, label },
              { onConflict: "evidence_id,kind,ref_id" },
            ),
        ),
    ),
    unlinkWork: useAction(async (id: string) =>
      fail(await db.from("career_evidence_links").delete().eq("id", id)),
    ),

    /** Claim a piece of evidence against a requirement. Never a copy of it. */
    claim: useAction(
      async ({
        criterionId,
        evidenceId,
        note,
      }: {
        criterionId: string;
        evidenceId: string;
        note?: string;
      }) =>
        fail(
          await db.from("career_claims").upsert(
            {
              workspace_id: ws(),
              criterion_id: criterionId,
              evidence_id: evidenceId,
              note: note ?? "",
            },
            { onConflict: "criterion_id,evidence_id" },
          ),
        ),
    ),
    unclaim: useAction(async (id: string) =>
      fail(await db.from("career_claims").delete().eq("id", id)),
    ),
  };
}

/* ------------------------------------------------- work Scripta already holds */

export type WorkObject = { kind: string; id: string; label: string; meta: string };

/** The kinds of work that can stand as evidence, in the order they prove most. */
export const WORK_SOURCES: { kind: string; label: string }[] = [
  { kind: "matter", label: "Matters" },
  { kind: "document", label: "Documents" },
  { kind: "task", label: "Tasks" },
  { kind: "deliverable", label: "Deliverables" },
  { kind: "research", label: "Research" },
  { kind: "transcript", label: "Meetings" },
  { kind: "precedent", label: "Precedents" },
  { kind: "playbook", label: "Playbooks" },
];

/**
 * Search the work in this workspace to point evidence at.
 *
 * Read through the lawyer's own client, so what comes back is what they can
 * already open: a matter they are not on cannot be attached to their evidence
 * by knowing its name. Only the identifier and the label are ever kept — the
 * work itself stays where it is.
 */
export async function searchWork(workspaceId: string, term: string): Promise<WorkObject[]> {
  const q = term.trim();
  if (q.length < 2) return [];
  const like = `%${q}%`;
  const lim = 6;
  const [matters, documents, tasks, deliverables, research, transcripts, precedents, playbooks] =
    await Promise.all([
      db
        .from("matters")
        .select("id, name, client")
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null)
        .ilike("name", like)
        .limit(lim),
      db
        .from("documents")
        .select("id, name, kind")
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null)
        .ilike("name", like)
        .limit(lim),
      db
        .from("tasks")
        .select("id, title, status")
        .eq("workspace_id", workspaceId)
        .ilike("title", like)
        .limit(lim),
      db
        .from("flow_deliverables")
        .select("id, name")
        .eq("workspace_id", workspaceId)
        .ilike("name", like)
        .limit(lim),
      db
        .from("research_matters")
        .select("id, title, question")
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null)
        .ilike("title", like)
        .limit(lim),
      db
        .from("transcripts")
        .select("id, meeting_title, meeting_date")
        .ilike("meeting_title", like)
        .limit(lim),
      db
        .from("precedents")
        .select("id, title")
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null)
        .ilike("title", like)
        .limit(lim),
      db
        .from("playbooks")
        .select("id, name")
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null)
        .ilike("name", like)
        .limit(lim),
    ]);

  const out: WorkObject[] = [];
  const push = (kind: string, rows: any[], label: (r: any) => string, meta: (r: any) => string) => {
    for (const r of rows ?? []) out.push({ kind, id: r.id, label: label(r), meta: meta(r) });
  };
  push(
    "matter",
    matters.data,
    (r) => r.name,
    (r) => str(r.client) || "Matter",
  );
  push(
    "document",
    documents.data,
    (r) => r.name,
    (r) => str(r.kind) || "Document",
  );
  push(
    "task",
    tasks.data,
    (r) => r.title,
    (r) => str(r.status) || "Task",
  );
  push(
    "deliverable",
    deliverables.data,
    (r) => r.name,
    () => "Flow deliverable",
  );
  push(
    "research",
    research.data,
    (r) => r.title,
    (r) => str(r.question).slice(0, 60) || "Research",
  );
  push(
    "transcript",
    transcripts.data,
    (r) => str(r.meeting_title) || "Meeting",
    (r) => str(r.meeting_date) || "Meeting",
  );
  push(
    "precedent",
    precedents.data,
    (r) => r.title,
    () => "Precedent",
  );
  push(
    "playbook",
    playbooks.data,
    (r) => r.name,
    () => "Playbook",
  );
  return out;
}
