import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

/* The generated types are behind the schema — they do not carry Phase 4's
   `mentions_seen_at`, Phase 5's tracked-change columns or Phase 6's
   `visibility` and approval columns. Every phase since Phase 4 has reached for
   the same escape hatch rather than hand-editing a generated file, so this one
   does too. */
const db = supabase as unknown as {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

/**
 * Precedents — work that was actually done, kept because it may be worth
 * adapting.
 *
 * A precedent is not a template and not a playbook. A template is the shape a
 * document starts from; a playbook is the position to take. A precedent is
 * evidence: this wording was agreed, on this deal, in this jurisdiction. Its
 * value is that it happened.
 *
 * Which is why `approved` matters and why nothing here sets it quietly. A
 * precedent that was used once is not thereby the firm's position — it is one
 * example of what was accepted, and treating every past deal as approved
 * drafting is how a bad compromise becomes a house style.
 */

/** Clause, section or whole document: a lawyer reuses all three. */
export type PrecedentKind = "clause" | "section" | "document";

/**
 * How far the drafting actually got. Executed wording is worth more than
 * wording somebody once typed, and the bank is only useful if it says which
 * is which.
 */
export type PrecedentStatus = "draft" | "negotiated" | "approved" | "executed" | "superseded";

export const PRECEDENT_KINDS: PrecedentKind[] = ["clause", "section", "document"];
export const PRECEDENT_STATUSES: PrecedentStatus[] = [
  "draft",
  "negotiated",
  "approved",
  "executed",
  "superseded",
];

export const KIND_LABEL: Record<PrecedentKind, string> = {
  clause: "Clause",
  section: "Section",
  document: "Document",
};

export const STATUS_LABEL: Record<PrecedentStatus, string> = {
  draft: "Draft",
  negotiated: "Negotiated",
  approved: "Approved",
  executed: "Executed",
  superseded: "Superseded",
};

/** Where a precedent was captured from, for the trail back to the work. */
export type PrecedentSourceKind = "review" | "corporate" | "drafting" | "flow" | "manual";

export type Precedent = {
  id: string;
  title: string;
  kind: PrecedentKind;
  clauseType: string;
  agreementType: string;
  jurisdiction: string;
  sector: string;
  body: string;
  sourceNote: string;
  /** A live approval: given, and not overtaken by an amendment since. */
  approved: boolean;
  /** The two facts behind the four states. See `src/lib/knowledge.ts`. */
  visibility: "private" | "shared" | "firm";
  approvedAt: string | null;
  approvedBy: string | null;
  contentChangedAt: string | null;
  ownerId: string | null;
  createdBy: string | null;
  status: PrecedentStatus;
  ourRole: string;
  whyUseful: string;
  counterpartyType: string;
  usedAt: string | null;
  /** The work it came from. Soft links: a precedent outlives its matter. */
  matterId: string | null;
  documentId: string | null;
  clauseId: string | null;
  sourceKind: PrecedentSourceKind | null;
  supersededBy: string | null;
  playbookRuleId: string | null;
  archivedAt: string | null;
  /** In Recently Deleted since this moment; null means live. */
  deletedAt: string | null;
  updatedAt: string;
};

type Row = {
  id: string;
  title: string;
  kind: string | null;
  clause_type: string | null;
  agreement_type: string | null;
  jurisdiction: string | null;
  sector: string | null;
  body: string;
  visibility: "private" | "shared" | "firm";
  approved_at: string | null;
  approved_by: string | null;
  content_changed_at: string | null;
  owner_id: string | null;
  created_by: string | null;
  approved: boolean;
  status: string | null;
  our_role: string | null;
  why_useful: string | null;
  counterparty_type: string | null;
  used_at: string | null;

  source_kind: string | null;
  superseded_by: string | null;
  playbook_rule_id: string | null;
  archived_at: string | null;
  deleted_at: string | null;
  updated_at: string;
};

const COLUMNS =
  /* PROVENANCE IS NOT SELECTED.
   *
   * `matter_id`, `document_id`, `clause_id` and `source_note` are revoked from
   * `authenticated` in Phase 6, so naming them here would make every one of
   * these queries fail. They are read through `precedent_provenance()`, which
   * tells the caller as much as they are entitled to hear and no more.
   *
   * Provenance visibility never exceeds source visibility, and the cheapest way
   * to keep that true is for the ordinary read not to carry it at all. */
  "id, title, kind, clause_type, agreement_type, jurisdiction, sector, body, approved, status, our_role, why_useful, counterparty_type, used_at, source_kind, superseded_by, playbook_rule_id, visibility, approved_at, approved_by, content_changed_at, owner_id, created_by, archived_at, deleted_at, updated_at";

const oneOf = <T extends string>(list: T[], value: unknown, fallback: T): T =>
  typeof value === "string" && (list as string[]).includes(value) ? (value as T) : fallback;

const toPrecedent = (r: Row): Precedent => ({
  id: r.id,
  title: r.title,
  kind: oneOf(PRECEDENT_KINDS, r.kind, "clause"),
  clauseType: r.clause_type ?? "",
  agreementType: r.agreement_type ?? "",
  jurisdiction: r.jurisdiction ?? "",
  sector: r.sector ?? "",
  body: r.body,
  sourceNote: "",
  approved: r.approved,
  status: oneOf(PRECEDENT_STATUSES, r.status, r.approved ? "approved" : "draft"),
  ourRole: r.our_role ?? "",
  whyUseful: r.why_useful ?? "",
  counterpartyType: r.counterparty_type ?? "",
  usedAt: r.used_at ?? null,
  visibility: (r.visibility ?? "firm") as "private" | "shared" | "firm",
  approvedAt: r.approved_at ?? null,
  approvedBy: r.approved_by ?? null,
  contentChangedAt: r.content_changed_at ?? null,
  ownerId: r.owner_id ?? null,
  createdBy: r.created_by ?? null,
  /* Always null on the ordinary read. Ask `precedent_provenance()`. */
  matterId: null,
  documentId: null,
  clauseId: null,
  sourceKind: (r.source_kind as Precedent["sourceKind"]) ?? null,
  supersededBy: r.superseded_by ?? null,
  playbookRuleId: r.playbook_rule_id ?? null,
  archivedAt: r.archived_at ?? null,
  deletedAt: r.deleted_at ?? null,
  updatedAt: r.updated_at,
});

export async function listPrecedents(workspaceId: string): Promise<Precedent[]> {
  const { data, error } = await db
    .from("precedents")
    .select(COLUMNS)
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Row[]).map(toPrecedent);
}

export async function loadPrecedent(id: string): Promise<Precedent | null> {
  const { data, error } = await db.from("precedents").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toPrecedent(data as Row) : null;
}

export async function createPrecedent(
  workspaceId: string,
  fields: { title: string; agreementType?: string },
): Promise<string> {
  const { data, error } = await supabase
    .from("precedents")
    .insert({
      workspace_id: workspaceId,
      title: fields.title.trim(),
      agreement_type: fields.agreementType?.trim() || null,
      // Empty rather than a placeholder: the body is the precedent, and a
      // stand-in would read as drafting nobody wrote.
      body: "",
      approved: false,
    })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export type PrecedentPatch = Partial<{
  title: string;
  kind: PrecedentKind;
  clauseType: string;
  agreementType: string;
  jurisdiction: string;
  sector: string;
  body: string;
  sourceNote: string;
  approved: boolean;
  status: PrecedentStatus;
  ourRole: string;
  whyUseful: string;
  counterpartyType: string;
  usedAt: string | null;
  playbookRuleId: string | null;
}>;

/**
 * What Scripta already knows when a lawyer keeps a piece of drafting.
 *
 * A precedent captured from work carries its provenance: the matter it came
 * from, the document and clause within it, and which side we acted for. That
 * trail is the whole advantage over a folder of clauses, so it is captured at
 * the moment of saving and never asked for again.
 */
export type PrecedentCapture = {
  workspaceId: string;
  title: string;
  body: string;
  kind: PrecedentKind;
  sourceKind: PrecedentSourceKind;
  clauseType?: string;
  agreementType?: string;
  jurisdiction?: string;
  sector?: string;
  ourRole?: string;
  counterpartyType?: string;
  whyUseful?: string;
  status?: PrecedentStatus;
  sourceNote?: string;
  matterId?: string | null;
  documentId?: string | null;
  clauseId?: string | null;
  playbookRuleId?: string | null;
  usedAt?: string | null;
};

/** Keep a piece of drafting, with where it came from. */
export async function capturePrecedent(input: PrecedentCapture): Promise<string> {
  if (!input.body.trim()) throw new Error("There is no drafting to keep.");
  const { data, error } = await supabase
    .from("precedents")
    .insert({
      workspace_id: input.workspaceId,
      title: input.title.trim() || "Untitled precedent",
      body: input.body,
      kind: input.kind,
      source_kind: input.sourceKind,
      status: input.status ?? "draft",
      clause_type: orNull(input.clauseType ?? ""),
      agreement_type: orNull(input.agreementType ?? ""),
      jurisdiction: orNull(input.jurisdiction ?? ""),
      sector: orNull(input.sector ?? ""),
      our_role: orNull(input.ourRole ?? ""),
      counterparty_type: orNull(input.counterpartyType ?? ""),
      why_useful: orNull(input.whyUseful ?? ""),
      source_note: orNull(input.sourceNote ?? ""),
      matter_id: input.matterId ?? null,
      document_id: input.documentId ?? null,
      clause_id: input.clauseId ?? null,
      playbook_rule_id: input.playbookRuleId ?? null,
      used_at: input.usedAt ?? null,
      /* `approved` is NOT sent. It used to be derived here from the status the
         lawyer picked, which meant the client declared its own work approved
         firm knowledge with no approver and no date. It is now a mirror of a
         live approval, maintained by the database, and off the update grant —
         so sending it would be refused rather than merely ignored. */
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

/**
 * Drafting already kept that looks like this one.
 *
 * Not a duplicate check that blocks anything: the same clause negotiated twice
 * is two precedents worth having, and only the lawyer knows which. It surfaces
 * the relationship and says nothing more.
 */
export async function similarPrecedents(
  workspaceId: string,
  input: { title: string; clauseType?: string; excludeId?: string },
): Promise<Precedent[]> {
  const type = (input.clauseType ?? "").trim();
  let query = db.from("precedents").select(COLUMNS).eq("workspace_id", workspaceId).limit(5);
  query = type
    ? query.eq("clause_type", type)
    : query.ilike("title", `%${input.title.trim().slice(0, 40)}%`);
  const { data, error } = await query;
  if (error) return [];
  return ((data ?? []) as Row[])
    .map(toPrecedent)
    .filter((p) => p.id !== input.excludeId && !p.archivedAt && !p.deletedAt);
}

const orNull = (v: string) => v.trim() || null;

export async function updatePrecedent(id: string, patch: PrecedentPatch): Promise<void> {
  const row: Database["public"]["Tables"]["precedents"]["Update"] = {};
  if (patch.title !== undefined) row["title"] = patch.title.trim() || "Untitled precedent";
  if (patch.kind !== undefined) row["kind"] = patch.kind;
  if (patch.clauseType !== undefined) row["clause_type"] = orNull(patch.clauseType);
  if (patch.agreementType !== undefined) row["agreement_type"] = orNull(patch.agreementType);
  if (patch.jurisdiction !== undefined) row["jurisdiction"] = orNull(patch.jurisdiction);
  if (patch.sector !== undefined) row["sector"] = orNull(patch.sector);
  if (patch.body !== undefined) row["body"] = patch.body;
  if (patch.sourceNote !== undefined) row["source_note"] = orNull(patch.sourceNote);
  if (patch.ourRole !== undefined) row["our_role"] = orNull(patch.ourRole);
  if (patch.whyUseful !== undefined) row["why_useful"] = orNull(patch.whyUseful);
  if (patch.counterpartyType !== undefined)
    row["counterparty_type"] = orNull(patch.counterpartyType);
  if (patch.usedAt !== undefined) row["used_at"] = patch.usedAt;
  if (patch.playbookRuleId !== undefined) row["playbook_rule_id"] = patch.playbookRuleId;
  if (patch.status !== undefined) {
    row["status"] = patch.status;
    // `approved` predates the status and other screens still read it.
    row["approved"] = patch.status === "approved" || patch.status === "executed";
  } else if (patch.approved !== undefined) {
    row["approved"] = patch.approved;
    row["status"] = patch.approved ? "approved" : "draft";
  }
  const { error } = await supabase.from("precedents").update(row).eq("id", id);
  if (error) throw error;
}

export async function deletePrecedent(id: string): Promise<void> {
  const { error } = await supabase.from("precedents").delete().eq("id", id);
  if (error) throw error;
}

/** The fields a precedent records about itself, in reading order. */
export const PRECEDENT_FIELDS: { key: keyof PrecedentPatch; label: string; placeholder: string }[] =
  [
    { key: "title", label: "Title", placeholder: "What this precedent is" },
    { key: "agreementType", label: "Agreement", placeholder: "Share purchase, lease, NDA…" },
    { key: "clauseType", label: "Clause", placeholder: "Interest, indemnity, termination…" },
    { key: "jurisdiction", label: "Jurisdiction", placeholder: "Ghana, England and Wales…" },
    { key: "sector", label: "Sector", placeholder: "Mining, energy, financial services…" },
    /* "Where it came from" is no longer an editable field here.
     *
     * `source_note` is gated with the rest of the provenance in Phase 6 — it is
     * the author's own words, and in practice those words are "taken from the
     * Westpoint SPA", which is the counterparty. It is not read back on the
     * ordinary select, so leaving it as a text box would have shown every
     * lawyer an empty field and quietly overwritten the real note with "".
     *
     * Provenance is read through `precedent_provenance()` and shown to whoever
     * is entitled to see it. */
  ];
