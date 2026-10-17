/**
 * Reading and writing a matter's flow.
 *
 * The row shapes here and the record shape the screens use are deliberately
 * not the same object. Screens want one record with its collections nested;
 * the database wants a phase's deliverables to be rows a task can point at.
 * Everything that translates between the two lives in this file.
 */
import { supabase } from "@/integrations/supabase/client";
import type {
  Deliverable,
  DeliverableKind,
  EmailDraft,
  Evidence,
  MatterFlowRecord,
  Phase,
  ThreadEntry,
  Version,
} from "./model";
import { isVersionTag, searchableText } from "./model";
import type { FlowWrite } from "./flow-diff";

/** The tables a flow is spread across, so a dynamic .from() still resolves. */
type FlowTable =
  | "matter_flows"
  | "flow_phases"
  | "flow_deliverables"
  | "flow_versions"
  | "flow_evidence"
  | "flow_threads"
  | "flow_emails";

const str = (v: unknown) => (typeof v === "string" ? v : "");
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/* ------------------------------------------------------------- reading */

const toPhase = (r: any, matterId: string | null): Phase => ({
  id: r.id,
  matterId,
  name: str(r.name),
  description: str(r.description),
  ...(r.note ? { note: str(r.note) } : {}),
  steps: arr<string>(r.steps),
  deadline: str(r.deadline),
  order: r.position ?? 0,
});

const toDeliverable = (r: any): Deliverable => ({
  id: r.id,
  phaseId: r.phase_id,
  kind: r.kind as DeliverableKind,
  name: str(r.name),
  type: r.type,
  description: str(r.description),
  ...(r.note ? { note: str(r.note) } : {}),
  owner: str(r.owner),
  ownerId: (r.owner_id as string | null) ?? null,
  start: str(r.start_on),
  deadline: str(r.deadline),
  mandatory: !!r.mandatory,
  ticked: !!r.ticked,
  tickedAt: r.ticked_at ?? null,
  waitingOn: r.waiting_on ?? null,
  expected: arr<string>(r.expected),
  references: str(r.references_note),
  ...(r.editor_ref ? { editorRef: str(r.editor_ref) } : {}),
  counterparty: str(r.counterparty),
  dependsOn: arr<string>(r.depends_on),
});

const toVersion = (r: any): Version => ({
  id: r.id,
  deliverableId: r.deliverable_id,
  fileRef: r.file_ref ?? null,
  label: str(r.label),
  createdAt: str(r.created_at),
  isFinal: !!r.is_final,
  ...(isVersionTag(r.tag) ? { tag: r.tag } : {}),
  thumbnailRef: r.thumbnail_ref ?? null,
  ...(r.pages != null ? { pages: r.pages } : {}),
  ...(r.by_name ? { by: str(r.by_name) } : {}),
  ...(r.note ? { note: str(r.note) } : {}),
});

const toEvidence = (r: any): Evidence => ({
  id: r.id,
  deliverableId: r.deliverable_id,
  name: str(r.name),
  createdAt: str(r.created_at),
  ...(r.file_ref ? { fileRef: str(r.file_ref) } : {}),
  ...(r.email_ref ? { emailRef: str(r.email_ref) } : {}),
  ...(r.note ? { note: str(r.note) } : {}),
  ...(r.meta ? { meta: str(r.meta) } : {}),
});

const toThread = (r: any): ThreadEntry => ({
  id: r.id,
  deliverableId: r.deliverable_id,
  author: str(r.author),
  text: str(r.body),
  searchText: str(r.search_text),
  ...(r.received_at ? { receivedAt: str(r.received_at) } : {}),
  attachments: arr(r.attachments),
  createdAt: str(r.created_at),
});

const toEmail = (r: any): EmailDraft => ({
  deliverableId: r.deliverable_id,
  to: str(r.to_line),
  subject: str(r.subject),
  body: str(r.body),
  updatedAt: str(r.updated_at),
});

/**
 * The flow row itself: what it belongs to, rather than what is in it.
 *
 * A flow may be filed to a matter, organised under a client, or neither. The
 * two are never both set — a filed flow reaches its client through its matter
 * — and the database enforces that, so this shape does not have to.
 */
export type FlowHead = {
  flowId: string;
  workspaceId: string;
  matterId: string | null;
  clientId: string | null;
  /** The flow's own name. Empty for a matter's flow that was never named. */
  name: string;
  createdBy: string | null;
  createdAt: string;
  archivedAt: string | null;
  deletedAt: string | null;
};

export type LoadedFlow = { flowId: string; head: FlowHead; record: MatterFlowRecord };

const HEAD_COLUMNS =
  "id, workspace_id, matter_id, client_id, name, created_by, created_at, archived_at, deleted_at, kind, started_at, phases_title, parties, contacts";

const toHead = (r: any): FlowHead => ({
  flowId: r.id,
  workspaceId: r.workspace_id,
  matterId: r.matter_id ?? null,
  clientId: r.client_id ?? null,
  name: str(r.name),
  createdBy: r.created_by ?? null,
  createdAt: str(r.created_at),
  archivedAt: r.archived_at ?? null,
  deletedAt: r.deleted_at ?? null,
});

/** Which flow to open: a particular one, or the one a matter already has. */
export type FlowKey = { flowId: string } | { matterId: string };

/**
 * The whole flow, or null when there is none.
 *
 * By id it is found wherever it is filed; the policy decides whether it can be
 * read, and "cannot" and "does not exist" are the same null on purpose. By
 * matter it is the matter's first flow, since a matter may now hold several.
 */
export async function loadFlow(workspaceId: string, key: FlowKey): Promise<LoadedFlow | null> {
  const query =
    "flowId" in key
      ? supabase.from("matter_flows").select(HEAD_COLUMNS).eq("id", key.flowId)
      : supabase
          .from("matter_flows")
          .select(HEAD_COLUMNS)
          .eq("workspace_id", workspaceId)
          .eq("matter_id", key.matterId)
          .order("created_at")
          .limit(1);
  const { data: flow, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  if (!flow) return null;
  const head = toHead(flow);
  const matterId = head.matterId;

  const [phases, deliverables] = await Promise.all([
    supabase.from("flow_phases").select("*").eq("flow_id", flow.id).order("position"),
    supabase.from("flow_deliverables").select("*").eq("flow_id", flow.id).order("position"),
  ]);
  if (phases.error) throw new Error(phases.error.message);
  if (deliverables.error) throw new Error(deliverables.error.message);

  const ids = (deliverables.data ?? []).map((d: any) => d.id);
  // No deliverables means no leaves; asking anyway returns the workspace's lot.
  const leaves = ids.length
    ? await Promise.all([
        supabase.from("flow_versions").select("*").in("deliverable_id", ids).order("created_at"),
        supabase.from("flow_evidence").select("*").in("deliverable_id", ids).order("created_at"),
        supabase.from("flow_threads").select("*").in("deliverable_id", ids).order("created_at"),
        supabase.from("flow_emails").select("*").in("deliverable_id", ids),
      ])
    : [];
  for (const res of leaves) if (res.error) throw new Error(res.error.message);

  return {
    flowId: flow.id,
    head,
    record: {
      matterId,
      kind: flow.kind as DeliverableKind,
      startedAt: str(flow.started_at),
      phasesTitle: str(flow.phases_title),
      phases: (phases.data ?? []).map((r: any) => toPhase(r, matterId)),
      deliverables: (deliverables.data ?? []).map(toDeliverable),
      versions: (leaves[0]?.data ?? []).map(toVersion),
      evidence: (leaves[1]?.data ?? []).map(toEvidence),
      threads: (leaves[2]?.data ?? []).map(toThread),
      emails: (leaves[3]?.data ?? []).map(toEmail),
      parties: arr(flow.parties),
      contacts: arr(flow.contacts),
    },
  };
}

export type WorkspaceFlow = { head: FlowHead; record: MatterFlowRecord };

/**
 * Every flow in the workspace that this person can open.
 *
 * Filed flows, flows organised under a client and flows standing on their
 * own all come back from one read; the policy has already removed anything
 * that is somebody else's unfiled work or on a matter they are not on.
 *
 * Five queries whatever the number of flows, rather than one `loadFlow` per
 * row. It loads the leaves as well as the phases, because the list reports
 * overdue, waiting and complete counts, and those are derived from the
 * versions and evidence rather than stored.
 */
export async function loadWorkspaceFlows(workspaceId: string): Promise<WorkspaceFlow[]> {
  const { data: flows, error } = await supabase
    .from("matter_flows")
    .select(HEAD_COLUMNS)
    .eq("workspace_id", workspaceId)
    .order("created_at");
  if (error) throw new Error(error.message);
  if (!flows?.length) return [];

  const flowIds = flows.map((f: any) => f.id);
  const [phases, deliverables] = await Promise.all([
    supabase.from("flow_phases").select("*").in("flow_id", flowIds).order("position"),
    supabase.from("flow_deliverables").select("*").in("flow_id", flowIds).order("position"),
  ]);
  if (phases.error) throw new Error(phases.error.message);
  if (deliverables.error) throw new Error(deliverables.error.message);

  const deliverableIds = (deliverables.data ?? []).map((d: any) => d.id);
  // No deliverables means no leaves; asking anyway returns the workspace's lot.
  const [versions, evidence] = deliverableIds.length
    ? await Promise.all([
        supabase.from("flow_versions").select("*").in("deliverable_id", deliverableIds),
        supabase.from("flow_evidence").select("*").in("deliverable_id", deliverableIds),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];
  if (versions.error) throw new Error(versions.error.message);
  if (evidence.error) throw new Error(evidence.error.message);

  const byFlow = <T>(rows: T[], key: (row: T) => string) => {
    const out = new Map<string, T[]>();
    for (const row of rows) {
      const k = key(row);
      const list = out.get(k);
      if (list) list.push(row);
      else out.set(k, [row]);
    }
    return out;
  };

  const phasesByFlow = byFlow((phases.data ?? []) as any[], (r) => r.flow_id);
  const deliverablesByFlow = byFlow((deliverables.data ?? []) as any[], (r) => r.flow_id);
  // Versions and evidence hang off deliverables, so they are gathered by the
  // flow their deliverable belongs to.
  const flowOfDeliverable = new Map(
    (deliverables.data ?? []).map((d: any) => [d.id as string, d.flow_id as string]),
  );
  const versionsByFlow = byFlow(
    (versions.data ?? []) as any[],
    (r) => flowOfDeliverable.get(r.deliverable_id) ?? "",
  );
  const evidenceByFlow = byFlow(
    (evidence.data ?? []) as any[],
    (r) => flowOfDeliverable.get(r.deliverable_id) ?? "",
  );

  return (flows as any[]).map((flow) => {
    const head = toHead(flow);
    const matterId = head.matterId;
    return {
      head,
      record: {
        matterId,
        kind: flow.kind as DeliverableKind,
        startedAt: str(flow.started_at),
        phasesTitle: str(flow.phases_title),
        phases: (phasesByFlow.get(flow.id) ?? []).map((r: any) => toPhase(r, matterId)),
        deliverables: (deliverablesByFlow.get(flow.id) ?? []).map(toDeliverable),
        versions: (versionsByFlow.get(flow.id) ?? []).map(toVersion),
        evidence: (evidenceByFlow.get(flow.id) ?? []).map(toEvidence),
        threads: [],
        emails: [],
        parties: arr(flow.parties),
        contacts: arr(flow.contacts),
      },
    };
  });
}

/* ------------------------------------------------------------- writing */

const phaseRow = (p: Phase, workspaceId: string, flowId: string) => ({
  id: p.id,
  workspace_id: workspaceId,
  flow_id: flowId,
  name: p.name,
  description: p.description,
  note: p.note ?? null,
  steps: p.steps,
  deadline: p.deadline || null,
  position: p.order,
});

const deliverableRow = (d: Deliverable, workspaceId: string, flowId: string, position: number) => ({
  id: d.id,
  workspace_id: workspaceId,
  flow_id: flowId,
  phase_id: d.phaseId,
  kind: d.kind,
  name: d.name,
  type: d.type,
  description: d.description,
  note: d.note ?? null,
  owner: d.owner,
  owner_id: d.ownerId ?? null,
  start_on: d.start || null,
  deadline: d.deadline || null,
  mandatory: d.mandatory,
  ticked: d.ticked,
  ticked_at: d.tickedAt ?? null,
  waiting_on: d.waitingOn ?? null,
  expected: d.expected ?? [],
  references_note: d.references ?? "",
  editor_ref: d.editorRef ?? null,
  counterparty: d.counterparty ?? "",
  depends_on: d.dependsOn ?? [],
  position,
});

const versionRow = (v: Version, workspaceId: string) => ({
  id: v.id,
  workspace_id: workspaceId,
  deliverable_id: v.deliverableId,
  file_ref: v.fileRef,
  label: v.label,
  is_final: v.isFinal,
  tag: v.tag ?? null,
  thumbnail_ref: v.thumbnailRef,
  pages: v.pages ?? null,
  by_name: v.by ?? "",
  note: v.note ?? "",
  created_at: v.createdAt,
});

const evidenceRow = (e: Evidence, workspaceId: string) => ({
  id: e.id,
  workspace_id: workspaceId,
  deliverable_id: e.deliverableId,
  name: e.name,
  file_ref: e.fileRef ?? null,
  email_ref: e.emailRef ?? null,
  note: e.note ?? "",
  meta: e.meta ?? "",
  created_at: e.createdAt,
});

const threadRow = (t: ThreadEntry, workspaceId: string) => ({
  id: t.id,
  workspace_id: workspaceId,
  deliverable_id: t.deliverableId,
  author: t.author,
  body: t.text,
  search_text: t.searchText || searchableText(t.text),
  received_at: t.receivedAt ?? null,
  attachments: t.attachments ?? [],
  created_at: t.createdAt,
});

const emailRow = (e: EmailDraft, workspaceId: string) => ({
  workspace_id: workspaceId,
  deliverable_id: e.deliverableId,
  to_line: e.to,
  subject: e.subject,
  body: e.body,
});

/**
 * Apply one write.
 *
 * Order matters in one direction only: a phase must exist before its
 * deliverables, and a deliverable before anything hanging off it. Deletes run
 * last, and only for rows the database would not have cascaded anyway.
 */
export async function saveFlow(
  workspaceId: string,
  flowId: string,
  write: FlowWrite,
  order: { phases: string[]; deliverables: string[] },
): Promise<void> {
  const fail = (error: { message: string } | null) => {
    if (error) throw new Error(error.message);
  };

  if (write.head)
    fail(
      (
        await supabase
          .from("matter_flows")
          .update({
            kind: write.head.kind,
            started_at: write.head.startedAt || null,
            // Null, not "", so the column says "never renamed" rather than
            // "deliberately blank".
            phases_title: write.head.phasesTitle?.trim() || null,
            parties: write.head.parties,
            contacts: write.head.contacts,
          })
          .eq("id", flowId)
      ).error,
    );

  const phasePos = new Map(order.phases.map((id, i) => [id, i]));
  const deliverablePos = new Map(order.deliverables.map((id, i) => [id, i]));

  const phases = [...write.phases.inserted, ...write.phases.updated];
  if (phases.length)
    fail(
      (
        await supabase.from("flow_phases").upsert(
          phases.map((p) => ({
            ...phaseRow(p, workspaceId, flowId),
            position: phasePos.get(p.id) ?? p.order,
          })),
        )
      ).error,
    );

  const deliverables = [...write.deliverables.inserted, ...write.deliverables.updated];
  if (deliverables.length)
    fail(
      (
        await supabase
          .from("flow_deliverables")
          .upsert(
            deliverables.map((d) =>
              deliverableRow(d, workspaceId, flowId, deliverablePos.get(d.id) ?? 0),
            ),
          )
      ).error,
    );

  type LeafRow =
    ReturnType<typeof versionRow> | ReturnType<typeof evidenceRow> | ReturnType<typeof threadRow>;
  const leaves: [FlowTable, LeafRow[]][] = [
    [
      "flow_versions",
      [...write.versions.inserted, ...write.versions.updated].map((v) =>
        versionRow(v, workspaceId),
      ),
    ],
    [
      "flow_evidence",
      [...write.evidence.inserted, ...write.evidence.updated].map((e) =>
        evidenceRow(e, workspaceId),
      ),
    ],
    [
      "flow_threads",
      [...write.threads.inserted, ...write.threads.updated].map((t) => threadRow(t, workspaceId)),
    ],
  ];
  for (const [table, rows] of leaves)
    // The one place the typed client cannot follow. supabase-js does not
    // correlate .from()'s table with .upsert()'s argument: with `table` a
    // union, its RejectExcessProperties guard types every column that is not
    // common to all seven flow tables as `never`, so a perfectly correct
    // flow_versions row is rejected as an excess property. Both sides are
    // otherwise typed — `table` is a FlowTable, `rows` is LeafRow[] built by
    // the row functions above — so the cast covers the builder and nothing
    // else. Removable if supabase-js gains that correlation, or if this loop
    // is unrolled into one upsert per table, which is a change to what this
    // function does rather than to its types.
    if (rows.length) fail((await (supabase.from(table) as any).upsert(rows)).error);

  const emails = [...write.emails.inserted, ...write.emails.updated];
  if (emails.length)
    fail(
      (
        await supabase.from("flow_emails").upsert(
          emails.map((e) => emailRow(e, workspaceId)),
          {
            onConflict: "deliverable_id",
          },
        )
      ).error,
    );

  // Deletes last: a phase takes its deliverables and their leaves with it.
  const removals: [FlowTable, string[]][] = [
    ["flow_emails", write.emails.deletedIds],
    ["flow_threads", write.threads.deletedIds],
    ["flow_evidence", write.evidence.deletedIds],
    ["flow_versions", write.versions.deletedIds],
    ["flow_deliverables", write.deliverables.deletedIds],
    ["flow_phases", write.phases.deletedIds],
  ];
  for (const [table, ids] of removals) {
    if (!ids.length) continue;
    const column = table === "flow_emails" ? "deliverable_id" : "id";
    fail((await supabase.from(table).delete().in(column, ids)).error);
  }
}

/** A new flow: the head row, then everything in it. */
export async function createFlow(
  workspaceId: string,
  record: MatterFlowRecord,
  write: FlowWrite,
  order: { phases: string[]; deliverables: string[] },
  filing: { name?: string; clientId?: string | null } = {},
): Promise<string> {
  const { data, error } = await supabase
    .from("matter_flows")
    .insert({
      workspace_id: workspaceId,
      matter_id: record.matterId,
      // The database clears a client on a filed flow; not sending one keeps
      // the request saying what will actually be stored.
      client_id: record.matterId ? null : (filing.clientId ?? null),
      name: filing.name?.trim() || null,
      kind: record.kind,
      started_at: record.startedAt || null,
      phases_title: record.phasesTitle?.trim() || null,
      parties: record.parties,
      contacts: record.contacts,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const flowId = (data as { id: string }).id;
  await saveFlow(workspaceId, flowId, { ...write, head: null }, order);
  return flowId;
}

/**
 * Where a flow belongs, changed in place.
 *
 * Never a copy: the row keeps its id, and with it every phase, deliverable,
 * version, thread, comment and task that points at it. Filing into a matter is
 * one-way; the database refuses to unfile or refile, and carries the flow's
 * tasks and client into the matter itself.
 */
export async function fileFlow(
  flowId: string,
  to: { matterId: string } | { clientId: string | null },
): Promise<void> {
  const patch = "matterId" in to ? { matter_id: to.matterId } : { client_id: to.clientId };
  const { error } = await supabase.from("matter_flows").update(patch).eq("id", flowId);
  if (error) throw new Error(error.message);
}

export async function renameFlow(flowId: string, name: string): Promise<void> {
  const { error } = await supabase
    .from("matter_flows")
    .update({ name: name.trim() || null })
    .eq("id", flowId);
  if (error) throw new Error(error.message);
}
