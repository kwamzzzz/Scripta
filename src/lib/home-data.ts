import { supabase } from "@/integrations/supabase/client";
import type { DocKind } from "@/lib/use-upload";

export const MATTER_TYPES = [
  "Vendor agreement",
  "NDA",
  "Services",
  "Licence",
  "Employment",
  "Other",
] as const;
export type MatterType = (typeof MATTER_TYPES)[number];

export type BoardDoc = {
  id: string;
  matterId: string;
  name: string;
  kind: DocKind;
  ver: string;
  date: string | null;
  parseStatus: "pending" | "parsing" | "parsed" | "failed";
  parseError: string | null;
  storagePath: string | null;
  bytes: number | null;
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
  /** In Recently Deleted since this moment; null or absent means live. */
  deletedAt?: string | null;
  jurisdiction?: string | null;
  effectiveDate?: string | null;
  parties?: string[];
  tags?: string[];
  confidentiality?: string | null;
  notes?: string | null;
  lastEditedBy?: string;
  lastEditedAt?: string | null;
};

export type BoardAudit = {
  matterId: string;
  summary: string;
  by: string;
  at: string;
  type: string;
};

export type BoardTranscript = {
  id: string;
  matterId: string;
  title: string;
  date: string | null;
  durationMinutes: number | null;
  speakers: number | null;
  source: string;
  resolutions: number;
  /** raw · distilling · distilled · approved */
  status: string;
};

export type BoardMatter = {
  id: string;
  name: string;
  isSample: boolean;
  client: string;
  /** The client record; `client` is its name. Null for a matter filed under no client. */
  clientId: string | null;
  counterparty: string;
  stage: string;
  playbookId: string | null;
  playbookName: string;
  matterType: MatterType;
  governingLaw: string;
  value: number | null;
  currency: string;
  ownerId: string | null;
  ownerName: string;
  targetDate: string | null;
  reference: string;
  createdAt: string;
  updatedAt: string;
  /** When the matter was archived, or null while it is still active. */
  archivedAt: string | null;
  /** In Recently Deleted since this moment; null means live. */
  deletedAt: string | null;
  docs: BoardDoc[];
  clauses: { id: string; status: string; risk: string | null; analysis: string | null }[];
  transcripts: number;
  resolutions: { id: string; status: string; owner: string; ai?: boolean }[];
  draftingPoints: { id: string; status: string }[];
  lastEvent: BoardAudit | null;
};

export type BoardPlaybook = {
  id: string;
  name: string;
  version: string;
  status: string;
  positions: number;
  matters: number;
  ownerName: string;
  updatedAt: string;
  archivedAt: string | null;
  deletedAt: string | null;
};

export type Board = {
  matters: BoardMatter[];
  docs: BoardDoc[];
  playbooks: BoardPlaybook[];
  transcripts: BoardTranscript[];
  events: BoardAudit[];
};

export const EMPTY_BOARD: Board = {
  matters: [],
  docs: [],
  playbooks: [],
  transcripts: [],
  events: [],
};

export async function fetchBoard(workspaceId: string): Promise<Board> {
  const { data: matterRows } = await supabase
    .from("matters")
    .select(
      "id, name, is_sample, client, client_id, counterparty, stage, playbook_id, created_at, updated_at, archived_at, deleted_at, matter_type, governing_law, value, currency, owner_id, target_date, reference",
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });

  const matters = matterRows ?? [];
  const ids = matters.map((m) => m.id);
  const none = { data: [] as never[] };

  const [docRes, clauseRes, transcriptRes, resRes, dpRes, auditRes, pbRes, memberRes] =
    await Promise.all([
      ids.length
        ? supabase
            .from("documents")
            .select(
              "id, matter_id, name, kind, version_label, doc_date, parse_status, parse_error, storage_path, byte_size, uploaded_by, created_at, updated_at, archived_at, deleted_at, jurisdiction, effective_date, parties, tags, confidentiality, notes, last_edited_by, last_edited_at",
            )
            .in("matter_id", ids)
            .is("archived_at", null)
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
        : none,

      ids.length
        ? supabase
            .from("clauses")
            .select("id, matter_id, status, risk, analysis")
            .in("matter_id", ids)
        : none,
      ids.length
        ? supabase
            .from("transcripts")
            .select(
              "id, matter_id, meeting_title, meeting_date, duration_minutes, speaker_count, source_label, distill_status",
            )
            .in("matter_id", ids)
        : none,
      ids.length
        ? supabase
            .from("resolutions")
            .select("id, matter_id, status, owner_name, source")
            .in("matter_id", ids)
        : none,
      ids.length
        ? supabase.from("drafting_points").select("id, matter_id, status").in("matter_id", ids)
        : none,
      ids.length
        ? supabase
            .from("audit_events")
            .select("matter_id, summary, actor_name, created_at, event_type")
            .in("matter_id", ids)
            .order("created_at", { ascending: false })
            .limit(400)
        : none,
      supabase
        .from("playbooks")
        .select(
          "id, name, version_label, status, owner_id, updated_at, archived_at, deleted_at, playbook_rules(id)",
        )
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: true }),
      /*
       * Members and their names in one request.
       *
       * The names used to be a third round trip, sent only once the member ids
       * came back — so every screen that reads the board waited for matters,
       * then for the tables, then for this. Embedding the profile row removes
       * that wait; the fallback below still covers a deployment where the
       * relationship cannot be embedded.
       */
      supabase
        .from("workspace_members")
        .select("user_id, profiles(id, full_name, email)")
        .eq("workspace_id", workspaceId),
    ]);

  type MemberRow = {
    user_id: string;
    profiles?: { id: string; full_name: string | null; email: string | null } | null;
  };
  const memberRows = (memberRes.data ?? []) as MemberRow[];
  const nameById = new Map<string, string>();
  for (const m of memberRows)
    if (m.profiles) nameById.set(m.profiles.id, m.profiles.full_name ?? m.profiles.email ?? "");

  if (!nameById.size && memberRows.length) {
    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in(
        "id",
        memberRows.map((m) => m.user_id),
      );
    for (const p of profileRows ?? []) nameById.set(p.id, p.full_name ?? p.email ?? "");
  }
  const who = (id: string | null) => (id ? (nameById.get(id) ?? "") : "");

  const docs: BoardDoc[] = (docRes.data ?? []).map((d) => ({
    id: d.id,
    // Read by matter, so every row has one; client documents are not on the board.
    matterId: d.matter_id as string,
    name: d.name,
    kind: d.kind,
    ver: d.version_label ?? "",
    date: d.doc_date,
    parseStatus: d.parse_status,
    parseError: d.parse_error,
    storagePath: d.storage_path,
    bytes: d.byte_size,
    uploadedBy: who(d.uploaded_by),
    createdAt: d.created_at,
    updatedAt: d.updated_at,
    archivedAt: d.archived_at ?? null,
    deletedAt: d.deleted_at ?? null,
    jurisdiction: d.jurisdiction ?? null,
    effectiveDate: d.effective_date ?? null,
    parties: d.parties ?? [],
    tags: d.tags ?? [],
    confidentiality: d.confidentiality ?? null,
    notes: d.notes ?? null,
    lastEditedBy: who(d.last_edited_by),
    lastEditedAt: d.last_edited_at ?? null,
  }));

  const events: BoardAudit[] = (auditRes.data ?? [])
    .filter((e): e is typeof e & { matter_id: string } => !!e.matter_id)
    .map((e) => ({
      matterId: e.matter_id,
      summary: e.summary,
      by: e.actor_name ?? "System",
      at: e.created_at,
      type: e.event_type,
    }));

  const firstEvent = new Map<string, BoardAudit>();
  for (const e of events) if (!firstEvent.has(e.matterId)) firstEvent.set(e.matterId, e);

  type PlaybookRow = {
    id: string;
    name: string;
    version_label: string | null;
    status: string;
    owner_id: string | null;
    updated_at: string;
    archived_at: string | null;
    deleted_at: string | null;
    playbook_rules?: { id: string }[];
  };
  const playbookRows = (pbRes.data ?? []) as PlaybookRow[];

  const pbName = new Map(
    playbookRows.map((p) => [p.id, `${p.name} ${p.version_label ?? ""}`.trim()]),
  );

  const boardMatters: BoardMatter[] = matters.map((m) => ({
    id: m.id,
    name: m.name,
    isSample: m.is_sample,
    archivedAt: m.archived_at ?? null,
    deletedAt: m.deleted_at ?? null,
    // Text left from before clients were records, or kept after a move to
    // another firm, is not a client: only a linked record is shown as one.
    client: m.client_id ? (m.client ?? "") : "",
    clientId: m.client_id ?? null,
    counterparty: m.counterparty ?? "",
    stage: m.stage ?? "",
    playbookId: m.playbook_id,
    playbookName: m.playbook_id ? (pbName.get(m.playbook_id) ?? "") : "",
    matterType: (m.matter_type ?? "Other") as MatterType,
    governingLaw: m.governing_law ?? "",
    value: m.value === null || m.value === undefined ? null : Number(m.value),
    currency: m.currency ?? "",
    ownerId: m.owner_id,
    ownerName: who(m.owner_id),
    targetDate: m.target_date,
    reference: m.reference ?? "",
    createdAt: m.created_at,
    updatedAt: m.updated_at,
    docs: docs.filter((d) => d.matterId === m.id),
    clauses: (clauseRes.data ?? [])
      .filter((c) => c.matter_id === m.id)
      .map((c) => ({ id: c.id, status: c.status, risk: c.risk, analysis: c.analysis })),
    transcripts: (transcriptRes.data ?? []).filter((t) => t.matter_id === m.id).length,
    resolutions: (resRes.data ?? [])
      .filter((r) => r.matter_id === m.id)
      .map((r) => ({
        id: r.id,
        status: r.status,
        owner: r.owner_name ?? "",
        ai: r.source === "ai",
      })),
    draftingPoints: (dpRes.data ?? [])
      .filter((d) => d.matter_id === m.id)
      .map((d) => ({ id: d.id, status: d.status })),
    lastEvent: firstEvent.get(m.id) ?? null,
  }));

  const transcripts: BoardTranscript[] = (transcriptRes.data ?? []).map((t) => ({
    id: t.id,
    matterId: t.matter_id,
    title: t.meeting_title ?? "Meeting",
    date: t.meeting_date,
    durationMinutes: t.duration_minutes,
    speakers: t.speaker_count,
    source: t.source_label ?? "",
    resolutions: (resRes.data ?? []).filter((r) => r.matter_id === t.matter_id).length,
    status: t.distill_status,
  }));

  const playbooks: BoardPlaybook[] = playbookRows.map((p) => ({
    id: p.id,
    name: p.name,
    version: p.version_label ?? "",
    status: p.status,
    positions: (p.playbook_rules ?? []).length,
    matters: matters.filter((m) => m.playbook_id === p.id).length,
    ownerName: who(p.owner_id),
    updatedAt: p.updated_at,
    archivedAt: p.archived_at ?? null,
    deletedAt: p.deleted_at ?? null,
  }));

  return { matters: boardMatters, docs, playbooks, transcripts, events };
}

/* ---------- derivations ---------- */

export type Stage =
  "To review" | "In review" | "Awaiting decisions" | "Ready to draft" | "Complete";
export const STAGES: Stage[] = [
  "To review",
  "In review",
  "Awaiting decisions",
  "Ready to draft",
  "Complete",
];

const openish = (s: string) => s === "Open" || s === "For discussion";

export function counts(m: BoardMatter) {
  return {
    clauses: m.clauses.length,
    escalated: m.clauses.filter((c) => c.status === "Escalated").length,
    open: m.clauses.filter((c) => openish(c.status)).length,
    analysed: m.clauses.filter((c) => (c.analysis ?? "").trim().length > 0).length,
    openRes: m.resolutions.filter((r) => r.ai || r.status !== "Accepted").length,
    draftDp: m.draftingPoints.filter((d) => d.status === "Draft" || d.status === "Open").length,
    high: m.clauses.filter((c) => c.risk === "High").length,
    medium: m.clauses.filter((c) => c.risk === "Medium").length,
    low: m.clauses.filter((c) => c.risk === "Low").length,
  };
}

export function topRisk(m: BoardMatter): "High" | "Medium" | "Low" | null {
  const c = counts(m);
  return c.high ? "High" : c.medium ? "Medium" : c.low ? "Low" : null;
}

export function stageOf(m: BoardMatter): Stage {
  const c = counts(m);
  if (c.clauses === 0) return "To review";
  if (c.escalated > 0 || c.openRes > 0) return "Awaiting decisions";
  if (c.draftDp > 0) return "Ready to draft";
  if (c.open > 0) return "In review";
  return "Complete";
}

export type NextMove = {
  label: string;
  primary?: boolean | undefined;
  screen: "contract" | "review" | "transcript" | "playbook" | "messages";
  clause?: string | undefined;
  res?: string | undefined;
};

export function nextMoves(m: BoardMatter): NextMove[] {
  const c = counts(m);
  const out: NextMove[] = [{ label: "Open contract editor", primary: true, screen: "review" }];
  const has = (k: BoardDoc["kind"]) => m.docs.some((d) => d.kind === k);

  if (m.docs.length === 0)
    out.push({ label: "Upload documents", primary: true, screen: "contract" });

  if (has("contract") && has("amendment") && c.clauses === 0)
    out.push({ label: "Generate review", primary: true, screen: "contract" });

  if (c.clauses > 0 && c.analysed === 0)
    out.push({ label: "Run analysis", primary: true, screen: "review" });

  if (c.analysed > 0 && c.open + c.escalated > 0) {
    const target =
      m.clauses.find((x) => x.status === "Escalated") ?? m.clauses.find((x) => openish(x.status));
    out.push({
      label: `Continue review · ${c.open + c.escalated} open`,
      primary: true,
      screen: "review",
      clause: target?.id,
    });
  }

  if (has("transcript") && m.resolutions.length === 0)
    out.push({ label: "Distil transcript", screen: "transcript" });

  if (m.resolutions.length > 0)
    out.push({ label: "Open decision map", screen: "transcript", res: m.resolutions[0]!.id });

  if (c.draftDp > 0)
    out.push({
      label: `${c.draftDp} drafting point${c.draftDp === 1 ? "" : "s"}`,
      screen: "transcript",
    });

  return [...out.filter((a) => a.primary), ...out.filter((a) => !a.primary)].slice(0, 3);
}

export function relTime(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const d = Math.round(hr / 24);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function longDate(d: string | null): string {
  return d
    ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : "";
}

export function fileSize(bytes: number | null): string {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
