/**
 * The server side of Research. Everything the Research workspace used to keep
 * in localStorage is read and written here, scoped to a workspace, behind row
 * level security, with an audit trail.
 *
 * Nothing in this file touches the UI: `loadResearchMatter` hands back exactly
 * the two objects the screens already hold (`state` and `records`), so the
 * swap is a change of source, not a change of shape.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  childRowsFromDb,
  coerceIndexEntry,
  coerceRecords,
  coerceState,
  recordsFromRows,
  stateFromRows,
  toAnswerRows,
  toChildRows,
  toMatterFields,
  toRecordFields,
  toRecordRows,
  toStateFields,
  type ResearchChildRows,
  type ResearchKind,
} from "@/lib/research-rows";

const uuid = z.string().uuid();
const kind = z.enum(["simple", "comprehensive"]);
const title = z.string().trim().min(1).max(300);

/** The child tables, and which save owns each of them. */
const ANSWER_TABLES = {
  authorities: "research_authorities",
  findings: "research_findings",
  pins: "research_pins",
  memoSections: "research_memo_sections",
} as const;
const RECORD_TABLES = {
  issues: "research_issues",
  facts: "research_facts",
  assumptions: "research_assumptions",
  risks: "research_risks",
} as const;

const CHILD_SELECT = [
  "research_authorities(*)",
  "research_findings(*)",
  "research_pins(*)",
  "research_memo_sections(*)",
  "research_issues(*)",
  "research_facts(*)",
  "research_assumptions(*)",
  "research_risks(*)",
].join(", ");

async function actorName(supabase: any, userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();
  return data?.full_name ?? data?.email ?? "Team member";
}

/**
 * A research audit entry. The workspace is the durable subject: the research
 * matter pointer goes null when the matter is deleted, so the deletion entry
 * outlives what it describes.
 */
async function audit(
  supabase: any,
  userId: string,
  subject: { workspaceId: string; researchId: string | null },
  event: string,
  summary: string,
  metadata: Record<string, unknown> = {},
) {
  const { error } = await supabase.from("audit_events").insert({
    workspace_id: subject.workspaceId,
    research_matter_id: subject.researchId,
    matter_id: null,
    actor_id: userId,
    actor_name: await actorName(supabase, userId),
    event_type: event,
    entity_type: "research_matter",
    entity_id: subject.researchId,
    summary,
    metadata,
  });
  if (error)
    throw new Error(
      `The research was saved but its audit entry failed: ${error.message}. Refresh before retrying.`,
    );
}

async function loadMatterRow(supabase: any, researchId: string) {
  const { data, error } = await supabase
    .from("research_matters")
    .select(`*, ${CHILD_SELECT}`)
    .eq("id", researchId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Research matter not found.");
  return data;
}

function childrenOf(row: any): ResearchChildRows {
  return childRowsFromDb({
    authorities: row.research_authorities,
    findings: row.research_findings,
    pins: row.research_pins,
    memoSections: row.research_memo_sections,
    issues: row.research_issues,
    facts: row.research_facts,
    assumptions: row.research_assumptions,
    risks: row.research_risks,
  });
}

/** The typed row groups, widened to what the Supabase insert builder takes. */
const asRows = (groups: Partial<ResearchChildRows>): Record<string, Record<string, unknown>[]> =>
  groups as unknown as Record<string, Record<string, unknown>[]>;

/**
 * Replace one save's child rows. Each table is one delete and one insert, so a
 * failure names the table it failed on and leaves the others alone; the caller
 * still holds the state in memory and can retry the same save.
 */
async function replaceChildren(
  supabase: any,
  researchId: string,
  tables: Record<string, string>,
  rows: Record<string, Record<string, unknown>[]>,
) {
  for (const [key, table] of Object.entries(tables)) {
    const { error: delErr } = await supabase
      .from(table)
      .delete()
      .eq("research_matter_id", researchId);
    if (delErr) throw new Error(`Could not clear ${table}: ${delErr.message}`);
    const next = (rows[key] ?? []).map((r) => ({ ...r, research_matter_id: researchId }));
    if (!next.length) continue;
    const { error: insErr } = await supabase.from(table).insert(next);
    if (insErr) throw new Error(`Could not write ${table}: ${insErr.message}`);
  }
}

/** The research matter list for a workspace, newest change first. */
export const listResearchMatters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ workspaceId: uuid }).parse)
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { data: rows, error } = await supabase
      .from("research_matters")
      .select("id, legacy_id, matter_id, kind, title, updated_at, report_locked, archived_at, deleted_at")
      .eq("workspace_id", data.workspaceId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return {
      matters: (rows ?? []).map((r: any) => ({
        id: r.id as string,
        legacyId: (r.legacy_id ?? null) as string | null,
        matterId: (r.matter_id ?? null) as string | null,
        kind: r.kind as ResearchKind,
        title: r.title as string,
        updatedAt: r.updated_at as string,
        // The client workspace shows the first approved report without having
        // to load every research matter to find out which one that is.
        reportLocked: Boolean(r.report_locked),
        archivedAt: (r.archived_at ?? null) as string | null,
        deletedAt: (r.deleted_at ?? null) as string | null,
      })),
    };
  });

/** A new, empty research matter. The screens fill it in with the two saves below. */
export const createResearchMatter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      workspaceId: uuid,
      kind,
      title,
      matterId: uuid.nullish(),
      legacyId: z.string().trim().min(1).max(200).nullish(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: row, error } = await supabase
      .from("research_matters")
      .insert({
        workspace_id: data.workspaceId,
        matter_id: data.matterId ?? null,
        legacy_id: data.legacyId ?? null,
        kind: data.kind,
        title: data.title,
        topic: data.title,
        memo_title: data.title,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Could not create the research matter.");
    await audit(
      supabase,
      userId,
      { workspaceId: data.workspaceId, researchId: row.id },
      "research.created",
      `Research matter created — "${data.title}" (${data.kind})`,
      { kind: data.kind, matter_id: data.matterId ?? null },
    );
    return { id: row.id as string };
  });

export const renameResearchMatter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ researchId: uuid, title }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: before, error: readErr } = await supabase
      .from("research_matters")
      .select("id, workspace_id, title")
      .eq("id", data.researchId)
      .maybeSingle();
    if (readErr || !before) throw new Error(readErr?.message ?? "Research matter not found.");
    if (before.title === data.title) return { ok: true as const };

    const { error } = await supabase
      .from("research_matters")
      .update({ title: data.title })
      .eq("id", data.researchId);
    if (error) throw new Error(error.message);
    await audit(
      supabase,
      userId,
      { workspaceId: before.workspace_id, researchId: before.id },
      "research.renamed",
      `Research matter renamed — "${before.title}" → "${data.title}"`,
      { from: before.title, to: data.title },
    );
    return { ok: true as const };
  });

/**
 * Expand a simple note in place. The id and every child row stay put, so the
 * questions, authorities, facts and memo cannot be lost or copied out of sync.
 */
export const upgradeResearchMatter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ researchId: uuid }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: before, error: readError } = await supabase
      .from("research_matters")
      .select("id, workspace_id, title, kind")
      .eq("id", data.researchId)
      .maybeSingle();
    if (readError || !before) throw new Error(readError?.message ?? "Research matter not found.");
    if (before.kind === "comprehensive") return { kind: "comprehensive" as const };
    if (before.kind !== "simple") throw new Error("This research matter has an unknown depth.");

    const { data: updated, error } = await supabase
      .from("research_matters")
      .update({ kind: "comprehensive" })
      .eq("workspace_id", before.workspace_id)
      .eq("id", before.id)
      .eq("kind", "simple")
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("The research depth changed elsewhere. Refresh and try again.");
    await audit(
      supabase,
      userId,
      { workspaceId: before.workspace_id, researchId: before.id },
      "research.upgraded",
      `Research matter upgraded to comprehensive — "${before.title}"`,
      { from: "simple", to: "comprehensive" },
    );
    return { kind: "comprehensive" as const };
  });

/** One research matter, in exactly the two shapes the screens hold. */
export const loadResearchMatter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ researchId: uuid }).parse)
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const row = await loadMatterRow(supabase, data.researchId);
    const children = childrenOf(row);
    return {
      id: row.id as string,
      workspaceId: row.workspace_id as string,
      matterId: (row.matter_id ?? null) as string | null,
      legacyId: (row.legacy_id ?? null) as string | null,
      kind: row.kind as ResearchKind,
      title: row.title as string,
      updatedAt: row.updated_at as string,
      state: stateFromRows(row, children),
      records: recordsFromRows(row, children),
    };
  });

/**
 * What has happened to this matter, newest first.
 *
 * The rows are the same audit entries every write in this file already
 * produces, so Activity reports what was actually recorded rather than a
 * second, parallel account of it. Read access is the workspace policy on
 * `audit_events`; a matter you cannot see returns nothing rather than failing.
 */
export const listResearchActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ researchId: uuid }).parse)
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { error, data: rows } = await supabase
      .from("audit_events")
      .select("id, event_type, summary, actor_name, created_at")
      .eq("research_matter_id", data.researchId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (rows ?? []) as {
      id: string;
      event_type: string;
      summary: string;
      actor_name: string | null;
      created_at: string;
    }[];
  });

/**
 * The question, the answer, the pins and the memo. Audited when the answer
 * itself changes — a lawyer needs to see when the research was run and what
 * it came back with, but not every keystroke in the memo body.
 */
export const saveResearchState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ researchId: uuid, state: z.unknown() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: before, error: readErr } = await supabase
      .from("research_matters")
      .select("id, workspace_id, kind, title, has_answer, short_answer")
      .eq("id", data.researchId)
      .maybeSingle();
    if (readErr || !before) throw new Error(readErr?.message ?? "Research matter not found.");

    const state = coerceState(data.state);
    // The state half of the row, whole. The records half is untouched here.
    const fields = toStateFields(state);
    const { error } = await supabase
      .from("research_matters")
      .update(fields)
      .eq("id", data.researchId);
    if (error) throw new Error(error.message);

    const children = toAnswerRows(state);
    await replaceChildren(supabase, data.researchId, ANSWER_TABLES, asRows(children));

    const answerChanged =
      fields.has_answer && (!before.has_answer || before.short_answer !== fields.short_answer);
    if (answerChanged)
      await audit(
        supabase,
        userId,
        { workspaceId: before.workspace_id, researchId: before.id },
        "research.answer_recorded",
        `Research answer recorded — ${children.authorities.length} authorities, ${children.findings.length} findings`,
        {
          question: state.question,
          jurisdiction: state.jurisdiction,
          sources: state.sources,
          since: state.since,
          authorities: children.authorities.map((a) => a.cite),
        },
      );
    return { ok: true as const };
  });

/**
 * Issues, facts, assumptions, risks and the report's own state. Audited when
 * the report is sent for approval or approved and locked — the two moments
 * that decide whether advice went out.
 */
export const saveResearchRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ researchId: uuid, records: z.unknown() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: before, error: readErr } = await supabase
      .from("research_matters")
      .select("id, workspace_id, kind, title, report_locked, report_approval_sent, report_version")
      .eq("id", data.researchId)
      .maybeSingle();
    if (readErr || !before) throw new Error(readErr?.message ?? "Research matter not found.");

    const records = coerceRecords(data.records);
    // The records half of the row, whole. The state half is untouched here.
    const fields = toRecordFields(records);
    const { error } = await supabase
      .from("research_matters")
      .update(fields)
      .eq("id", data.researchId);
    if (error) throw new Error(error.message);

    await replaceChildren(supabase, data.researchId, RECORD_TABLES, asRows(toRecordRows(records)));

    const subject = { workspaceId: before.workspace_id, researchId: before.id };
    if (!before.report_approval_sent && fields.report_approval_sent)
      await audit(
        supabase,
        userId,
        subject,
        "research.report_sent_for_approval",
        `Research report "${before.title}" sent for reviewer approval (${fields.report_version})`,
        { version: fields.report_version },
      );
    if (!before.report_locked && fields.report_locked)
      await audit(
        supabase,
        userId,
        subject,
        "research.report_approved",
        `Research report "${before.title}" approved and locked at ${fields.report_version}`,
        {
          version: fields.report_version,
          approved_at: fields.report_approved_at,
          open_risks: records.riskRows.filter((r) => r.status !== "Done").length,
        },
      );
    return { ok: true as const };
  });

/**
 * Delete a research matter and everything under it. The audit entry is written
 * first and keeps the workspace as its subject, so the record of the deletion
 * survives the deletion.
 */
export const deleteResearchMatter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ researchId: uuid }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: before, error: readErr } = await supabase
      .from("research_matters")
      .select("id, workspace_id, title, kind, report_locked")
      .eq("id", data.researchId)
      .maybeSingle();
    if (readErr || !before) throw new Error(readErr?.message ?? "Research matter not found.");

    await audit(
      supabase,
      userId,
      { workspaceId: before.workspace_id, researchId: before.id },
      "research.deleted",
      `Research matter "${before.title}" deleted — its authorities, pins, memo and records were removed`,
      { title: before.title, kind: before.kind, was_locked: before.report_locked },
    );
    const { error } = await supabase.from("research_matters").delete().eq("id", data.researchId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/* ------------------------------------------------------------- import ---- */

const importedMatter = z.object({
  legacyId: z.string().trim().min(1).max(200),
  kind: kind.optional(),
  title: z.string().trim().max(300).optional(),
  updatedAt: z.string().max(60).optional(),
  state: z.unknown(),
  records: z.unknown(),
});

/**
 * The one-time move off localStorage.
 *
 * The UI collects `px.research.index.<workspace>` and, for each entry, the two
 * blobs under `px.research.<workspace>.<id>` and
 * `px.research.records.<workspace>.<id>`, and hands them here. Nothing is read
 * from the browser on the server, and nothing in the browser is cleared: the
 * caller decides when it is safe to let go.
 *
 * Idempotent and restartable. Each imported matter keeps its localStorage id
 * in `legacy_id`, unique per workspace, so a matter already imported is
 * skipped. A matter that fails part way leaves its own rows behind but does
 * not stop the rest; re-running finishes the job, and a half-written matter is
 * reported by `legacyId` in `failed` so it can be looked at rather than
 * silently trusted.
 */
export const importLocalResearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ workspaceId: uuid, matters: z.array(importedMatter).max(500) }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: existing, error: readErr } = await supabase
      .from("research_matters")
      .select("legacy_id")
      .eq("workspace_id", data.workspaceId)
      .not("legacy_id", "is", null);
    if (readErr) throw new Error(readErr.message);
    const already = new Set((existing ?? []).map((r: any) => r.legacy_id as string));

    const failed: { legacyId: string; error: string }[] = [];
    let imported = 0;
    let skipped = 0;

    for (const entry of data.matters) {
      if (already.has(entry.legacyId)) {
        skipped += 1;
        continue;
      }
      try {
        const index = coerceIndexEntry({
          id: entry.legacyId,
          kind: entry.kind,
          title: entry.title,
          updatedAt: entry.updatedAt,
        });
        if (!index) throw new Error("The stored index entry has no id.");
        const state = coerceState(entry.state);
        const records = coerceRecords(entry.records);
        const fields = toMatterFields({
          kind: index.kind,
          // The index title is the lawyer's name for the matter; the state's
          // topic is what the research screen shows. Prefer whichever is set.
          title: index.title || state.topic || "Untitled research",
          state,
          records,
        });

        const { data: row, error } = await supabase
          .from("research_matters")
          .insert({
            ...fields,
            workspace_id: data.workspaceId,
            legacy_id: entry.legacyId,
            created_by: userId,
          })
          .select("id")
          .single();
        if (error || !row) throw new Error(error?.message ?? "Insert failed.");

        const children = toChildRows(state, records);
        await replaceChildren(
          supabase,
          row.id,
          { ...ANSWER_TABLES, ...RECORD_TABLES },
          asRows(children),
        );

        await audit(
          supabase,
          userId,
          { workspaceId: data.workspaceId, researchId: row.id },
          "research.imported",
          `Research matter "${fields.title}" imported from browser storage`,
          {
            legacy_id: entry.legacyId,
            authorities: children.authorities.length,
            pins: children.pins.length,
            memo_sections: children.memoSections.length,
            issues: children.issues.length,
            facts: children.facts.length,
            assumptions: children.assumptions.length,
            risks: children.risks.length,
          },
        );
        imported += 1;
      } catch (e) {
        failed.push({
          legacyId: entry.legacyId,
          error: e instanceof Error ? e.message : "Import failed.",
        });
      }
    }

    return { imported, skipped, failed };
  });
