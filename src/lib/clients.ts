/**
 * Clients: who the firm acts for.
 *
 * A client is a record the firm keeps — its register — so everybody in the
 * workspace can read one. What is filed under a client is not: the matters,
 * flows and tasks on a client's page are read through their own policies, so
 * each person sees the work they could already open and nothing else, and every
 * count on the page is a count of that. Nothing here asks the database to count
 * on anybody's behalf.
 *
 * A client is deleted only by the person who created it (or, for a client
 * nobody is recorded as creating, a workspace owner or admin). It goes to
 * Recently Deleted like anything else; when it is removed for good its
 * organisation and marketing go with it, and the matters, flows and tasks filed
 * under it are kept and unfiled — the database does that, so nobody needs to be
 * able to see a matter for it to survive.
 */
import { supabase } from "@/integrations/supabase/client";

export type ClientKind = "organisation" | "individual";

export const CLIENT_KIND_LABEL: Record<ClientKind, string> = {
  organisation: "Organisation",
  individual: "Individual",
};

export type Client = {
  id: string;
  workspaceId: string;
  name: string;
  kind: ClientKind;
  reference: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  deletedAt: string | null;
  createdBy: string | null;
  /** The corporate-services areas this client's file carries, beyond the essentials. */
  optionalAreas: OptionalArea[];
};

/**
 * The parts of a client's file that only a client whose company the firm helps
 * run needs. Everything else (organogram, group structure, people, authority,
 * entities, key documents, Ask) every organisation client has. Switching one
 * off hides it; nothing recorded in it is deleted.
 */
export type OptionalArea = "licences" | "calendar" | "processes" | "marketing";

export const OPTIONAL_AREAS: { id: OptionalArea; label: string; body: string }[] = [
  {
    id: "licences",
    label: "Licences & registrations",
    body: "What each entity is licensed for, and when renewals fall due.",
  },
  {
    id: "calendar",
    label: "Compliance calendar",
    body: "Filings and returns, with overdue ones raised on the overview.",
  },
  {
    id: "processes",
    label: "Processes",
    body: "The client's own procedures, step by step, ready to run as flows.",
  },
  {
    id: "marketing",
    label: "Marketing",
    body: "Posts, campaigns, brand kit and consents. Private to whoever creates the client.",
  },
];

const OPTIONAL_IDS = OPTIONAL_AREAS.map((a) => a.id);

/** The optional areas a client of this kind can carry: a person has no organisation. */
export const optionalAreasFor = (kind: ClientKind) =>
  OPTIONAL_AREAS.filter((a) => kind === "organisation" || a.id === "marketing");

/** "Full corporate services": every optional area this kind of client can carry is on. */
export const isFullService = (kind: ClientKind, areas: OptionalArea[]) =>
  optionalAreasFor(kind).every((a) => areas.includes(a.id));

/** Whether a part of the client's file is shown. Anything not optional always is. */
export const areaOn = (client: Pick<Client, "optionalAreas">, area: string) =>
  !(OPTIONAL_IDS as string[]).includes(area) || client.optionalAreas.includes(area as OptionalArea);

const COLUMNS =
  "id, workspace_id, name, kind, reference, created_at, updated_at, archived_at, deleted_at, created_by, optional_areas";

const toClient = (r: any): Client => ({
  id: r.id,
  workspaceId: r.workspace_id,
  name: String(r.name ?? ""),
  kind: (r.kind === "individual" ? "individual" : "organisation") as ClientKind,
  reference: String(r.reference ?? ""),
  createdAt: String(r.created_at ?? ""),
  updatedAt: String(r.updated_at ?? ""),
  archivedAt: r.archived_at ?? null,
  deletedAt: r.deleted_at ?? null,
  createdBy: r.created_by ?? null,
  optionalAreas: (Array.isArray(r.optional_areas) ? r.optional_areas : []).filter(
    (a: unknown): a is OptionalArea => (OPTIONAL_IDS as unknown[]).includes(a),
  ),
});

/**
 * Whether the interface should offer deleting this client. The database
 * decides for itself (`is_client_owner`); this only keeps the button honest.
 */
export const ownsClient = (
  client: Pick<Client, "createdBy">,
  userId: string | null | undefined,
  role: string | null | undefined,
) =>
  !!userId &&
  (client.createdBy ? client.createdBy === userId : role === "owner" || role === "admin");

export const clientsQueryKey = (workspaceId: string | null) => ["clients", workspaceId];

export async function listClients(workspaceId: string): Promise<Client[]> {
  const { data, error } = await supabase
    .from("clients")
    .select(COLUMNS)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map(toClient);
}

export async function getClient(clientId: string): Promise<Client | null> {
  const { data, error } = await supabase
    .from("clients")
    .select(COLUMNS)
    .eq("id", clientId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toClient(data) : null;
}

/** The client register's own history: created, renamed, archived. Never the work. */
async function record(
  workspaceId: string,
  clientId: string,
  eventType: string,
  summary: string,
  metadata: Record<string, unknown> = {},
) {
  const { data: auth } = await supabase.auth.getUser();
  const { data: profile } = auth.user
    ? await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", auth.user.id)
        .maybeSingle()
    : { data: null };
  await supabase.from("audit_events").insert({
    workspace_id: workspaceId,
    actor_id: auth.user?.id ?? null,
    actor_name: profile?.full_name ?? profile?.email ?? "Unknown",
    event_type: eventType,
    entity_type: "client",
    entity_id: clientId,
    summary,
    metadata: metadata as never,
  });
}

/** A name is enough. Everything else about a client is added when it is known. */
export async function createClient(
  workspaceId: string,
  input: { name: string; kind?: ClientKind; optionalAreas?: OptionalArea[] },
): Promise<Client> {
  const name = input.name.trim();
  if (!name) throw new Error("A client needs a name.");
  const { data, error } = await supabase
    .from("clients")
    .insert({
      workspace_id: workspaceId,
      name,
      kind: input.kind ?? "organisation",
      optional_areas: input.optionalAreas ?? [],
    })
    .select(COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  const client = toClient(data);
  await record(workspaceId, client.id, "client.created", `Client created: ${client.name}`);
  return client;
}

export async function updateClient(
  client: Client,
  patch: Partial<{
    name: string;
    kind: ClientKind;
    reference: string;
    optionalAreas: OptionalArea[];
  }>,
): Promise<void> {
  const row: {
    name?: string;
    kind?: ClientKind;
    reference?: string | null;
    optional_areas?: OptionalArea[];
  } = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error("A client needs a name.");
    if (name === client.name) delete patch.name;
    else row.name = name;
  }
  if (patch.kind !== undefined && patch.kind !== client.kind) row.kind = patch.kind;
  if (patch.reference !== undefined && patch.reference.trim() !== client.reference)
    row.reference = patch.reference.trim() || null;
  const areas = patch.optionalAreas && OPTIONAL_IDS.filter((a) => patch.optionalAreas!.includes(a));
  if (areas && areas.join() !== OPTIONAL_IDS.filter((a) => client.optionalAreas.includes(a)).join())
    row.optional_areas = areas;
  if (!Object.keys(row).length) return;
  const { error } = await supabase.from("clients").update(row).eq("id", client.id);
  if (error) throw new Error(error.message);
  if (row.name)
    await record(client.workspaceId, client.id, "client.renamed", `Renamed to ${row.name}`, {
      from: client.name,
      to: row.name,
    });
  if (row.optional_areas) {
    const label = (ids: OptionalArea[]) =>
      OPTIONAL_AREAS.filter((a) => ids.includes(a.id))
        .map((a) => a.label)
        .join(", ") || "none";
    await record(
      client.workspaceId,
      client.id,
      "client.areas_changed",
      `Corporate-services areas: ${label(row.optional_areas)}`,
      { from: client.optionalAreas, to: row.optional_areas },
    );
  }
}

export async function setClientArchived(client: Client, archived: boolean): Promise<void> {
  const { error } = await supabase
    .from("clients")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", client.id);
  if (error) throw new Error(error.message);
  await record(
    client.workspaceId,
    client.id,
    archived ? "client.archived" : "client.restored",
    archived ? "Client archived" : "Client restored",
  );
}

/** To Recently Deleted, or back out of it. Only the client's owner may do either. */
export async function setClientDeleted(client: Client, deleted: boolean): Promise<void> {
  const { error } = await supabase
    .from("clients")
    .update({ deleted_at: deleted ? new Date().toISOString() : null })
    .eq("id", client.id);
  if (error)
    throw new Error(
      /row-level security|created this client/.test(error.message)
        ? "Only the person who created this client can delete or restore it."
        : error.message,
    );
  await record(
    client.workspaceId,
    client.id,
    deleted ? "client.deleted" : "client.undeleted",
    deleted ? "Client moved to Recently Deleted" : "Client restored from Recently Deleted",
  );
}

/** File a matter under a client, or take it out from under one. The matter keeps its id. */
export async function setMatterClient(matterId: string, clientId: string | null): Promise<void> {
  const { error } = await supabase
    .from("matters")
    .update(clientId ? { client_id: clientId } : { client_id: null, client: null })
    .eq("id", matterId);
  if (error) throw new Error(error.message);
}

/* ------------------------------------------------------------ the page */

export type ClientMatterRow = {
  id: string;
  name: string;
  reference: string;
  matterType: string;
  stage: string;
  archivedAt: string | null;
  deletedAt: string | null;
  updatedAt: string;
};

export type ClientFlowRow = {
  id: string;
  name: string;
  /** The flow's own name, when it has one; `name` falls back to its matter's. */
  ownName: string;
  matterId: string | null;
  matterName: string;
  archivedAt: string | null;
  deletedAt: string | null;
  updatedAt: string;
};

export type ClientTaskRow = {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  matterId: string | null;
  matterName: string;
  /** How the task reaches this client: directly, through a matter, or through a flow. */
  via: "client" | "matter" | "flow";
};

export type ClientDocumentRow = {
  id: string;
  name: string;
  kind: string;
  matterId: string;
  matterName: string;
  createdAt: string;
};

export type ClientWork = {
  matters: ClientMatterRow[];
  flows: ClientFlowRow[];
  tasks: ClientTaskRow[];
  documents: ClientDocumentRow[];
};

const fail = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

/**
 * Everything filed under a client that this person can open.
 *
 * Each read goes through that table's own policy. A matter the reader is not
 * on is simply not returned, so it cannot appear, be counted, or lend its
 * documents or tasks to the page. There is deliberately no helper
 * that counts "all matters for this client": such a function would have to run
 * with more authority than the person asking, which is the one shape Scripta's
 * reader functions are not allowed to take.
 */
export async function loadClientWork(workspaceId: string, clientId: string): Promise<ClientWork> {
  const matters = await supabase
    .from("matters")
    .select("id, name, reference, matter_type, stage, archived_at, deleted_at, updated_at")
    .eq("workspace_id", workspaceId)
    .eq("client_id", clientId)
    .order("updated_at", { ascending: false });
  fail(matters.error);
  const matterRows: ClientMatterRow[] = (matters.data ?? []).map((m: any) => ({
    id: m.id,
    name: String(m.name ?? ""),
    reference: String(m.reference ?? ""),
    matterType: String(m.matter_type ?? ""),
    stage: String(m.stage ?? ""),
    archivedAt: m.archived_at ?? null,
    deletedAt: m.deleted_at ?? null,
    updatedAt: String(m.updated_at ?? ""),
  }));
  const matterIds = matterRows.map((m) => m.id);
  const matterName = new Map(matterRows.map((m) => [m.id, m.name]));
  const matterById = new Map(matterRows.map((m) => [m.id, m]));
  const inMatters = matterIds.length ? `(${matterIds.join(",")})` : null;

  const flowFilter = inMatters
    ? `client_id.eq.${clientId},matter_id.in.${inMatters}`
    : `client_id.eq.${clientId}`;
  const flows = await supabase
    .from("matter_flows")
    .select("id, name, matter_id, archived_at, deleted_at, updated_at")
    .eq("workspace_id", workspaceId)
    .or(flowFilter)
    .order("updated_at", { ascending: false });
  fail(flows.error);
  const flowRows: ClientFlowRow[] = (flows.data ?? []).map((f: any) => ({
    id: f.id,
    name: String(f.name ?? "") || (f.matter_id ? (matterName.get(f.matter_id) ?? "") : ""),
    ownName: String(f.name ?? ""),
    matterId: f.matter_id ?? null,
    matterName: f.matter_id ? (matterName.get(f.matter_id) ?? "") : "",
    // A flow filed to a matter is put aside and deleted with its matter, as
    // the Flow screen treats it; otherwise a flow whose matter was deleted
    // would still be listed here and nowhere else.
    archivedAt: f.matter_id
      ? (matterById.get(f.matter_id)?.archivedAt ?? null)
      : (f.archived_at ?? null),
    deletedAt: f.matter_id
      ? (matterById.get(f.matter_id)?.deletedAt ?? null)
      : (f.deleted_at ?? null),
    updatedAt: String(f.updated_at ?? ""),
  }));

  // Tasks of flows organised directly under the client: they reach it through
  // the flow, and hold neither a matter nor a client of their own.
  const clientFlowIds = flowRows.filter((f) => !f.matterId).map((f) => f.id);
  const deliverables = clientFlowIds.length
    ? await supabase.from("flow_deliverables").select("id").in("flow_id", clientFlowIds)
    : { data: [], error: null };
  fail(deliverables.error);
  const deliverableIds = (deliverables.data ?? []).map((d: any) => d.id as string);

  const taskFilter = [
    `client_id.eq.${clientId}`,
    inMatters ? `matter_id.in.${inMatters}` : "",
    deliverableIds.length ? `flow_deliverable_id.in.(${deliverableIds.join(",")})` : "",
  ]
    .filter(Boolean)
    .join(",");
  const tasks = await supabase
    .from("tasks")
    .select("id, title, status, due_date, matter_id, client_id, flow_deliverable_id")
    .eq("workspace_id", workspaceId)
    .or(taskFilter)
    .order("created_at", { ascending: false });
  fail(tasks.error);
  // A task on a matter in Recently Deleted leaves with the matter, as its flow does.
  const taskRows: ClientTaskRow[] = (tasks.data ?? [])
    .filter((t: any) => !(t.matter_id && matterById.get(t.matter_id)?.deletedAt))
    .map((t: any) => ({
      id: t.id,
      title: String(t.title ?? ""),
      status: String(t.status ?? "Open"),
      dueDate: t.due_date ?? null,
      matterId: t.matter_id ?? null,
      matterName: t.matter_id ? (matterName.get(t.matter_id) ?? "") : "",
      via: t.matter_id ? "matter" : t.client_id ? "client" : "flow",
    }));

  const documents = inMatters
    ? await supabase
        .from("documents")
        .select("id, name, kind, matter_id, created_at")
        .in("matter_id", matterIds)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : { data: [], error: null };
  fail(documents.error);
  const documentRows: ClientDocumentRow[] = (documents.data ?? []).map((d: any) => ({
    id: d.id,
    name: String(d.name ?? ""),
    kind: String(d.kind ?? ""),
    matterId: d.matter_id,
    matterName: matterName.get(d.matter_id) ?? "",
    createdAt: String(d.created_at ?? ""),
  }));

  return {
    matters: matterRows,
    flows: flowRows,
    tasks: taskRows,
    documents: documentRows,
  };
}

/** For the list: how much work each client has, as this person can see it. */
export type ClientCounts = { matters: number; flows: number; openTasks: number };

export async function loadClientCounts(workspaceId: string): Promise<Map<string, ClientCounts>> {
  const out = new Map<string, ClientCounts>();
  const take = (id: string) => {
    const found = out.get(id);
    if (found) return found;
    const fresh = { matters: 0, flows: 0, openTasks: 0 };
    out.set(id, fresh);
    return fresh;
  };
  const [matters, flows, tasks] = await Promise.all([
    supabase
      .from("matters")
      .select("id, client_id")
      .eq("workspace_id", workspaceId)
      .not("client_id", "is", null)
      .is("archived_at", null)
      .is("deleted_at", null),
    supabase
      .from("matter_flows")
      .select("id, client_id, matter_id")
      .eq("workspace_id", workspaceId)
      .is("archived_at", null)
      .is("deleted_at", null),
    supabase
      .from("tasks")
      .select("id, client_id, matter_id, flow_deliverable_id")
      .eq("workspace_id", workspaceId)
      .neq("status", "Done"),
  ]);
  fail(matters.error);
  fail(flows.error);
  fail(tasks.error);
  const clientOfMatter = new Map<string, string>();
  for (const m of (matters.data ?? []) as any[]) {
    clientOfMatter.set(m.id, m.client_id);
    take(m.client_id).matters += 1;
  }
  const clientOfFlow = new Map<string, string>();
  for (const f of (flows.data ?? []) as any[]) {
    const client = f.client_id ?? (f.matter_id ? clientOfMatter.get(f.matter_id) : undefined);
    if (!client) continue;
    take(client).flows += 1;
    if (!f.matter_id) clientOfFlow.set(f.id, client);
  }
  // A task raised in a flow organised straight under a client reaches the
  // client through that flow's deliverable.
  const clientOfDeliverable = new Map<string, string>();
  if (clientOfFlow.size) {
    const deliverables = await supabase
      .from("flow_deliverables")
      .select("id, flow_id")
      .in("flow_id", [...clientOfFlow.keys()]);
    fail(deliverables.error);
    for (const d of (deliverables.data ?? []) as any[])
      clientOfDeliverable.set(d.id, clientOfFlow.get(d.flow_id)!);
  }
  for (const t of (tasks.data ?? []) as any[]) {
    const client =
      t.client_id ??
      (t.matter_id ? clientOfMatter.get(t.matter_id) : undefined) ??
      (t.flow_deliverable_id ? clientOfDeliverable.get(t.flow_deliverable_id) : undefined);
    if (client) take(client).openTasks += 1;
  }
  return out;
}
