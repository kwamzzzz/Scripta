/**
 * Reading and writing a client's organisation.
 *
 * Every table is read through its own policy: the organisation is firm
 * business, so any member of the workspace gets the same rows. Nothing here
 * touches a matter, a flow or a task, which keep their own boundaries.
 *
 * Writes carry an optional change context — the day the change took effect and
 * its reference (a board minute, a filing) — which the database copies into the
 * client's history. It is cleared on every write that does not give one, so a
 * later edit never borrows an earlier minute.
 */
import { supabase } from "@/integrations/supabase/client";
import type {
  Appointment,
  AuthorityParty,
  AuthorityRule,
  ChangeContext,
  ChangeEvent,
  Entity,
  FieldSources,
  Holding,
  Instrument,
  Licence,
  LicenceType,
  Obligation,
  Occurrence,
  OrgCategory,
  OrgDocument,
  Organisation,
  Person,
  Prerequisite,
  Process,
  ProcessStep,
  RecordDocument,
  RecordType,
  Responsibility,
  Role,
  RoleLine,
  StructureChange,
} from "./model";

export const organisationKey = (clientId: string) => ["organisation", clientId];

const fail = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

const toEntity = (r: any): Entity => ({
  id: r.id,
  clientId: r.client_id,
  name: str(r.name),
  shortName: str(r.short_name),
  entityType: str(r.entity_type),
  jurisdiction: str(r.jurisdiction),
  registrationNo: str(r.registration_no),
  taxNo: str(r.tax_no),
  incorporatedOn: r.incorporated_on ?? null,
  registeredOffice: str(r.registered_office),
  activity: str(r.activity),
  shareCapital: str(r.share_capital),
  status: r.status,
  proposedChangeId: r.proposed_change_id ?? null,
  notes: str(r.notes),
  fieldSources: (r.field_sources ?? {}) as FieldSources,
  lastChangeOn: r.last_change_on ?? null,
  lastChangeRef: r.last_change_ref ?? null,
  updatedAt: str(r.updated_at),
  archivedAt: r.archived_at ?? null,
});

const toPerson = (r: any): Person => ({
  id: r.id,
  clientId: r.client_id,
  fullName: str(r.full_name),
  email: str(r.email),
  phone: str(r.phone),
  location: str(r.location),
  notes: str(r.notes),
  archivedAt: r.archived_at ?? null,
});

const toHolding = (r: any): Holding => ({
  id: r.id,
  ownerEntityId: r.owner_entity_id ?? null,
  ownerPersonId: r.owner_person_id ?? null,
  ownerName: r.owner_name ?? null,
  subsidiaryEntityId: r.subsidiary_entity_id,
  percent: num(r.percent),
  instrument: str(r.instrument),
  effectiveFrom: r.effective_from ?? null,
  effectiveTo: r.effective_to ?? null,
  proposedChangeId: r.proposed_change_id ?? null,
  removedByChangeId: r.removed_by_change_id ?? null,
  lastChangeOn: r.last_change_on ?? null,
  lastChangeRef: r.last_change_ref ?? null,
});

const toChange = (r: any): StructureChange => ({
  id: r.id,
  title: str(r.title),
  detail: str(r.detail),
  status: r.status,
  position: r.position ?? 0,
});

const toRole = (r: any): Role => ({
  id: r.id,
  title: str(r.title),
  functionName: str(r.function_name),
  kind: r.kind,
  kindLabel: str(r.kind_label),
  entityId: r.entity_id ?? null,
  parentRoleId: r.parent_role_id ?? null,
  holderPersonId: r.holder_person_id ?? null,
  acting: !!r.acting,
  coverRoleId: r.cover_role_id ?? null,
  coverNote: str(r.cover_note),
  position: r.position ?? 0,
  effectiveFrom: r.effective_from ?? null,
  effectiveTo: r.effective_to ?? null,
  lastChangeOn: r.last_change_on ?? null,
  lastChangeRef: r.last_change_ref ?? null,
  updatedAt: str(r.updated_at),
});

const toLine = (r: any): RoleLine => ({
  id: r.id,
  roleId: r.role_id,
  toRoleId: r.to_role_id,
  note: str(r.note),
});

const toAppointment = (r: any): Appointment => ({
  id: r.id,
  personId: r.person_id,
  entityId: r.entity_id,
  capacity: r.capacity,
  title: str(r.title),
  appointedOn: r.appointed_on ?? null,
  ceasedOn: r.ceased_on ?? null,
  lastChangeRef: r.last_change_ref ?? null,
});

const toResponsibility = (r: any): Responsibility => ({
  id: r.id,
  area: str(r.area),
  detail: str(r.detail),
  roleId: r.role_id,
  deputyRoleId: r.deputy_role_id ?? null,
  position: r.position ?? 0,
});

const toInstrument = (r: any): Instrument => ({
  id: r.id,
  title: str(r.title),
  approvedOn: r.approved_on ?? null,
  approvedBy: str(r.approved_by),
  scopeNote: str(r.scope_note),
  reviewDueOn: r.review_due_on ?? null,
  reference: str(r.reference),
  documentId: r.document_id ?? null,
  supersededOn: r.superseded_on ?? null,
});

const toRule = (r: any): AuthorityRule => ({
  id: r.id,
  instrumentId: r.instrument_id ?? null,
  matterType: str(r.matter_type),
  entityId: r.entity_id ?? null,
  minAmount: num(r.min_amount),
  maxAmount: num(r.max_amount),
  currency: str(r.currency),
  basis: r.basis,
  note: str(r.note),
  position: r.position ?? 0,
  effectiveFrom: r.effective_from ?? null,
  effectiveTo: r.effective_to ?? null,
});

const toParty = (r: any): AuthorityParty => ({
  id: r.id,
  ruleId: r.rule_id,
  step: r.step,
  roleId: r.role_id ?? null,
  capacity: r.capacity ?? null,
  body: r.body ?? null,
  count: r.count ?? 1,
  position: r.position ?? 0,
});

const toLicenceType = (r: any): LicenceType => ({
  id: r.id,
  key: r.key,
  label: str(r.label),
  jurisdiction: str(r.jurisdiction),
  fields: Array.isArray(r.fields) ? r.fields : [],
  defaultLeadDays: r.default_lead_days ?? 60,
  typicalPrerequisites: r.typical_prerequisites ?? [],
  hasExpiry: r.has_expiry !== false,
  position: r.position ?? 0,
});

const toLicence = (r: any): Licence => ({
  id: r.id,
  entityId: r.entity_id ?? null,
  typeKey: str(r.type_key),
  name: str(r.name),
  authority: str(r.authority),
  country: str(r.country),
  reference: str(r.reference),
  issuedOn: r.issued_on ?? null,
  issuedNote: str(r.issued_note),
  expiresOn: r.expires_on ?? null,
  renewalLeadDays: r.renewal_lead_days ?? 60,
  ownerRoleId: r.owner_role_id ?? null,
  ownerPersonId: r.owner_person_id ?? null,
  prerequisites: (Array.isArray(r.prerequisites) ? r.prerequisites : []) as Prerequisite[],
  renewalState: r.renewal_state,
  renewalLodgedOn: r.renewal_lodged_on ?? null,
  conditions: str(r.conditions),
  recurringNote: str(r.recurring_note),
  originalLocation: str(r.original_location),
  verified: !!r.verified,
  fieldSources: (r.field_sources ?? {}) as FieldSources,
  archivedAt: r.archived_at ?? null,
});

const toObligation = (r: any): Obligation => ({
  id: r.id,
  entityId: r.entity_id ?? null,
  licenceId: r.licence_id ?? null,
  title: str(r.title),
  kind: r.kind,
  recurrence: r.recurrence,
  dueOn: r.due_on,
  endsOn: r.ends_on ?? null,
  ownerRoleId: r.owner_role_id ?? null,
  ownerPersonId: r.owner_person_id ?? null,
  penaltyNote: str(r.penalty_note),
  detail: str(r.detail),
  archivedAt: r.archived_at ?? null,
});

const toOccurrence = (r: any): Occurrence => ({
  id: r.id,
  obligationId: r.obligation_id,
  dueOn: r.due_on,
  state: r.state,
  completedOn: r.completed_on ?? null,
  note: str(r.note),
});

const toProcess = (r: any): Process => ({
  id: r.id,
  name: str(r.name),
  summary: str(r.summary),
  ownerRoleId: r.owner_role_id ?? null,
  cadence: str(r.cadence),
  sourceDocumentId: r.source_document_id ?? null,
  status: r.status,
  presetId: r.preset_id ?? null,
  archivedAt: r.archived_at ?? null,
});

const toStep = (r: any): ProcessStep => ({
  id: r.id,
  processId: r.process_id,
  position: r.position ?? 0,
  title: str(r.title),
  detail: str(r.detail),
  ownerRoleId: r.owner_role_id ?? null,
  durationDays: num(r.duration_days),
  sourceSection: str(r.source_section),
  sourcePage: num(r.source_page),
});

const toDocument = (r: any): OrgDocument => ({
  id: r.id,
  name: str(r.name),
  category: (r.org_category ?? null) as OrgCategory | null,
  mimeType: r.mime_type ?? null,
  storagePath: r.storage_path ?? null,
  pageCount: num(r.page_count),
  parseStatus: str(r.parse_status),
  createdAt: str(r.created_at),
  archivedAt: r.archived_at ?? null,
});

const toRecordDocument = (r: any): RecordDocument => ({
  id: r.id,
  documentId: r.document_id,
  recordType: r.record_type,
  recordId: r.record_id,
  page: num(r.page),
  note: str(r.note),
});

const toEvent = (r: any): ChangeEvent => ({
  id: r.id,
  summary: str(r.summary),
  actor: str(r.actor_name),
  at: str(r.created_at),
  recordType: str(r.metadata?.record_type),
  recordId: str(r.metadata?.record_id),
  effectiveOn: r.metadata?.effective_on ?? null,
  reference: r.metadata?.reference ?? null,
  changed: r.metadata?.changed ?? null,
  before: r.metadata?.before ?? null,
});

/** Everything about one client's organisation, in one round of reads. */
export async function loadOrganisation(
  workspaceId: string,
  clientId: string,
): Promise<Organisation> {
  const by = (table: string, order = "created_at") =>
    supabase
      .from(table as never)
      .select("*")
      .eq("client_id", clientId)
      .order(order);
  const [
    entities,
    people,
    holdings,
    changes,
    roles,
    lines,
    appointments,
    responsibilities,
    instruments,
    rules,
    parties,
    licences,
    obligations,
    occurrences,
    processes,
    steps,
    recordDocuments,
    types,
    documents,
    history,
    clientRow,
  ] = await Promise.all([
    by("org_entities", "name"),
    by("org_people", "full_name"),
    by("org_holdings"),
    by("org_structure_changes", "position"),
    by("org_roles", "position"),
    by("org_role_lines"),
    by("org_appointments"),
    by("org_responsibilities", "position"),
    by("org_authority_instruments"),
    by("org_authority_rules", "position"),
    by("org_authority_parties", "position"),
    by("org_licences", "name"),
    by("org_obligations", "due_on"),
    by("org_obligation_occurrences", "due_on"),
    by("org_processes", "name"),
    by("org_process_steps", "position"),
    by("org_record_documents"),
    supabase
      .from("org_licence_types")
      .select("*")
      .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
      .order("position"),
    supabase
      .from("documents")
      .select(
        "id, name, org_category, mime_type, storage_path, page_count, parse_status, created_at, archived_at",
      )
      .eq("client_id", clientId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("audit_events")
      .select("id, summary, actor_name, created_at, metadata, event_type")
      .eq("entity_type", "client")
      .eq("entity_id", clientId)
      .like("event_type", "org.%")
      .order("created_at", { ascending: false })
      .limit(200),
    /* The order this client files its shelves in. A preference, not a record,
       so a failure to read it is not a failure to open the organisation. */
    supabase.from("clients").select("doc_category_order").eq("id", clientId).maybeSingle(),
  ]);
  for (const r of [
    entities,
    people,
    holdings,
    changes,
    roles,
    lines,
    appointments,
    responsibilities,
    instruments,
    rules,
    parties,
    licences,
    obligations,
    occurrences,
    processes,
    steps,
    recordDocuments,
    types,
    documents,
    history,
  ])
    fail(r.error as { message: string } | null);
  const rows = (r: { data: unknown }) => (r.data ?? []) as any[];
  return {
    clientId,
    workspaceId,
    entities: rows(entities).map(toEntity),
    people: rows(people).map(toPerson),
    holdings: rows(holdings).map(toHolding),
    changes: rows(changes).map(toChange),
    roles: rows(roles).map(toRole),
    lines: rows(lines).map(toLine),
    appointments: rows(appointments).map(toAppointment),
    responsibilities: rows(responsibilities).map(toResponsibility),
    instruments: rows(instruments).map(toInstrument),
    rules: rows(rules).map(toRule),
    parties: rows(parties).map(toParty),
    licenceTypes: rows(types).map(toLicenceType),
    licences: rows(licences).map(toLicence),
    obligations: rows(obligations).map(toObligation),
    occurrences: rows(occurrences).map(toOccurrence),
    processes: rows(processes).map(toProcess),
    steps: rows(steps).map(toStep),
    documents: rows(documents).map(toDocument),
    categoryOrder: Array.isArray(
      (clientRow.data as { doc_category_order?: unknown } | null)?.doc_category_order,
    )
      ? ((
          (clientRow.data as { doc_category_order: unknown }).doc_category_order as unknown[]
        ).filter((c): c is string => typeof c === "string") as OrgCategory[])
      : [],
    recordDocuments: rows(recordDocuments).map(toRecordDocument),
    history: rows(history).map(toEvent),
  };
}

/* ------------------------------------------------------------------ writes */

export type OrgTable =
  | "org_entities"
  | "org_people"
  | "org_holdings"
  | "org_structure_changes"
  | "org_roles"
  | "org_role_lines"
  | "org_appointments"
  | "org_responsibilities"
  | "org_authority_instruments"
  | "org_authority_rules"
  | "org_authority_parties"
  | "org_licences"
  | "org_obligations"
  | "org_obligation_occurrences"
  | "org_processes"
  | "org_process_steps"
  | "org_record_documents";

/** Tables whose rows carry a dated change context. */
const DATED: OrgTable[] = [
  "org_entities",
  "org_people",
  "org_holdings",
  "org_roles",
  "org_appointments",
  "org_responsibilities",
  "org_authority_instruments",
  "org_authority_rules",
  "org_licences",
  "org_obligations",
  "org_processes",
];

const withContext = (table: OrgTable, row: Record<string, unknown>, change?: ChangeContext) =>
  DATED.includes(table)
    ? { ...row, last_change_on: change?.on || null, last_change_ref: change?.ref?.trim() || null }
    : row;

/** A friendlier sentence for the refusals a lawyer can actually cause. */
export const explainWriteError = (message: string): string => {
  if (/org_authority_parties_role_fk|org_responsibilities_role_fk/.test(message))
    return "Authority or a responsibility still names this role. Reassign it first, or end the role instead of deleting it.";
  if (/org_appointments_person_fk|org_holdings_owner_person_fk/.test(message))
    return "This person has recorded appointments or holdings. End them, or archive the person instead.";
  if (/org_holdings_one_holder/.test(message)) return "A holding needs exactly one holder.";
  if (/org_holdings_not_self/.test(message)) return "An entity cannot hold its own shares here.";
  if (/org_role_lines_unique/.test(message)) return "That functional line is already recorded.";
  if (/org_obligation_occurrences_unique/.test(message))
    return "That occurrence is already recorded.";
  if (/row-level security/.test(message))
    return "You can read this organisation but not change it.";
  return message;
};

async function run<T>(
  promise: PromiseLike<{ data: T; error: { message: string } | null }>,
): Promise<T> {
  const { data, error } = await promise;
  if (error) throw new Error(explainWriteError(error.message));
  return data;
}

export async function insertRecord(
  org: Pick<Organisation, "workspaceId" | "clientId">,
  table: OrgTable,
  row: Record<string, unknown>,
  change?: ChangeContext,
): Promise<string> {
  const id = (row["id"] as string | undefined) ?? crypto.randomUUID();
  await run(
    supabase
      .from(table as never)
      .insert(
        withContext(
          table,
          { ...row, id, workspace_id: org.workspaceId, client_id: org.clientId },
          change,
        ) as never,
      ),
  );
  return id;
}

export async function updateRecord(
  table: OrgTable,
  id: string,
  patch: Record<string, unknown>,
  change?: ChangeContext,
): Promise<void> {
  await run(
    supabase
      .from(table as never)
      .update(withContext(table, patch, change) as never)
      .eq("id", id),
  );
}

export async function deleteRecord(table: OrgTable, id: string): Promise<void> {
  await run(
    supabase
      .from(table as never)
      .delete()
      .eq("id", id),
  );
}

export async function setRecordArchived(
  table: "org_entities" | "org_people" | "org_licences" | "org_obligations" | "org_processes",
  id: string,
  archived: boolean,
): Promise<void> {
  await updateRecord(table, id, { archived_at: archived ? new Date().toISOString() : null });
}

/* -------------------------------------------------------------- documents */

const extOf = (name: string) => {
  const m = /\.[a-z0-9]+$/i.exec(name);
  return m ? m[0].toLowerCase() : "";
};

/**
 * Upload a document the client holds — a certificate, a constitution, a
 * licence — into the one document repository, filed to the client rather than
 * to a matter. Returns the new document's id; parsing is the caller's call.
 */
export async function uploadClientDocument(
  org: Pick<Organisation, "workspaceId" | "clientId">,
  file: File,
  category: OrgCategory,
): Promise<string> {
  const id = crypto.randomUUID();
  const path = `${org.workspaceId}/clients/${org.clientId}/${id}${extOf(file.name)}`;
  const up = await supabase.storage
    .from("matter-documents")
    .upload(path, file, { contentType: file.type || "application/octet-stream" });
  if (up.error) throw new Error(up.error.message);
  const { data: auth } = await supabase.auth.getUser();
  const name = file.name.replace(/\.[^.]+$/, "");
  const { error } = await supabase.from("documents").insert({
    id,
    workspace_id: org.workspaceId,
    client_id: org.clientId,
    matter_id: null,
    name,
    kind: "reference",
    org_category: category,
    doc_date: new Date().toISOString().slice(0, 10),
    storage_path: path,
    mime_type: file.type || null,
    byte_size: file.size,
    uploaded_by: auth.user?.id ?? null,
    parse_status: "pending",
  });
  if (error) {
    await supabase.storage.from("matter-documents").remove([path]);
    throw new Error(error.message);
  }
  await supabase.from("audit_events").insert({
    workspace_id: org.workspaceId,
    actor_id: auth.user?.id ?? null,
    actor_name: auth.user?.email ?? "Unknown",
    event_type: "org.document.uploaded",
    entity_type: "client",
    entity_id: org.clientId,
    summary: `Document added: ${name}`,
    metadata: { record_type: "document", record_id: id, category } as never,
  });
  return id;
}

export async function updateClientDocument(
  id: string,
  patch: { name?: string; org_category?: OrgCategory },
): Promise<void> {
  await run(supabase.from("documents").update(patch).eq("id", id));
}

/**
 * The order this client files its key documents in.
 *
 * A preference about a client's shelf, kept on the client, because the order a
 * company secretary keeps — the constitution first, the correspondence last —
 * is a judgement about them rather than about the firm.
 */
export async function setDocumentCategoryOrder(
  clientId: string,
  order: OrgCategory[],
): Promise<void> {
  await run(
    supabase
      .from("clients")
      .update({ doc_category_order: order as never, updated_at: new Date().toISOString() })
      .eq("id", clientId),
  );
}

/** Client documents go to the bin like any other document. */
export async function binClientDocument(id: string): Promise<void> {
  await run(
    supabase.from("documents").update({ deleted_at: new Date().toISOString() }).eq("id", id),
  );
}

export async function linkDocument(
  org: Pick<Organisation, "workspaceId" | "clientId">,
  documentId: string,
  recordType: RecordType,
  recordId: string,
  page: number | null = null,
): Promise<void> {
  const { error } = await supabase.from("org_record_documents").upsert(
    {
      workspace_id: org.workspaceId,
      client_id: org.clientId,
      document_id: documentId,
      record_type: recordType,
      record_id: recordId,
      page,
    },
    { onConflict: "document_id,record_type,record_id" },
  );
  if (error) throw new Error(explainWriteError(error.message));
}

/* ---------------------------------------------------- matters and entities */

export type EntityMatter = { id: string; name: string; reference: string; updatedAt: string };

/**
 * The matters about an entity that this person can open. Read through the
 * matters policy, so a matter the reader is not on is simply absent.
 */
export async function mattersForEntity(entityId: string): Promise<EntityMatter[]> {
  const { data, error } = await supabase
    .from("matters")
    .select("id, name, reference, updated_at")
    .eq("client_entity_id", entityId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  fail(error);
  return (data ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    reference: m.reference ?? "",
    updatedAt: m.updated_at,
  }));
}

export async function setMatterEntity(matterId: string, entityId: string | null): Promise<void> {
  await run(supabase.from("matters").update({ client_entity_id: entityId }).eq("id", matterId));
}
