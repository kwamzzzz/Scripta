/**
 * Reads and writes for a client's marketing. Every read goes through the
 * marketing policies, so a person without access gets empty lists, not an
 * error: there is nothing here to tell them marketing exists.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  explainMarketingError,
  type AccessGrant,
  type Approval,
  type ApprovalKind,
  type Asset,
  type AssetKind,
  type BrandKit,
  type Campaign,
  type Check,
  type Consent,
  type HistoryRow,
  type Marketing,
  type MarketingLevel,
  type Override,
  type Post,
} from "./model";

export const marketingKey = (clientId: string) => ["marketing", clientId];
export const marketingLevelKey = (clientId: string) => ["marketing-level", clientId];

const BUCKET = "matter-documents";

async function run<T>(
  promise: PromiseLike<{ data: T; error: { message: string } | null }>,
): Promise<T> {
  const { data, error } = await promise;
  if (error) throw new Error(explainMarketingError(error.message));
  return data;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** 'owner', 'approver', 'contributor', or null for someone who may not see it. */
export async function loadMarketingLevel(clientId: string): Promise<MarketingLevel | null> {
  const data = await run(supabase.rpc("marketing_level", { _client: clientId }));
  return data === "owner" || data === "approver" || data === "contributor" ? data : null;
}

export async function loadMarketing(workspaceId: string, clientId: string): Promise<Marketing> {
  const [auth, client, kit, campaigns, posts, assets, consents, approvals, overrides, access] =
    await Promise.all([
      supabase.auth.getUser(),
      run(supabase.from("clients").select("created_by").eq("id", clientId).maybeSingle()),
      run(supabase.from("mkt_brand_kits").select("*").eq("client_id", clientId).maybeSingle()),
      run(supabase.from("mkt_campaigns").select("*").eq("client_id", clientId).order("created_at")),
      run(
        supabase
          .from("mkt_content")
          .select("*")
          .eq("client_id", clientId)
          .order("updated_at", { ascending: false }),
      ),
      run(
        supabase
          .from("mkt_assets")
          .select("*")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false }),
      ),
      run(supabase.from("mkt_consents").select("*").eq("client_id", clientId).order("party")),
      run(
        supabase
          .from("mkt_approvals")
          .select("*")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false }),
      ),
      run(supabase.from("mkt_overrides").select("*").eq("client_id", clientId).order("created_at")),
      run(
        supabase
          .from("client_marketing_access")
          .select("*")
          .eq("client_id", clientId)
          .order("created_at"),
      ),
    ]);
  return {
    workspaceId,
    clientId,
    ownerId: client?.created_by ?? null,
    meId: auth.data.user?.id ?? null,
    kit: kit
      ? ({
          id: kit.id,
          palette: Array.isArray(kit.palette)
            ? (kit.palette as { name?: unknown; hex?: unknown }[]).map((p) => ({
                name: str(p?.name),
                hex: str(p?.hex),
              }))
            : [],
          headingFont: kit.heading_font,
          bodyFont: kit.body_font,
          tone: kit.tone,
          avoidWords: kit.avoid_words ?? [],
          rules: kit.rules,
          updatedAt: kit.updated_at,
        } satisfies BrandKit)
      : null,
    campaigns: (campaigns ?? []).map((c): Campaign => ({
      id: c.id,
      name: c.name,
      goal: c.goal,
      audience: c.audience,
      message: c.message,
      channels: (c.channels ?? []) as Campaign["channels"],
      measure: c.measure,
      entityId: c.entity_id,
      startsOn: c.starts_on,
      endsOn: c.ends_on,
      status: c.status === "closed" ? "closed" : "active",
      archivedAt: c.archived_at,
      createdAt: c.created_at,
    })),
    posts: (posts ?? []).map((p): Post => ({
      id: p.id,
      campaignId: p.campaign_id,
      channel: p.channel as Post["channel"],
      title: p.title,
      body: p.body,
      assetId: p.asset_id,
      stage: p.stage as Post["stage"],
      scheduledAt: p.scheduled_at,
      publishedAt: p.published_at,
      metrics: (p.metrics && typeof p.metrics === "object" ? p.metrics : {}) as Post["metrics"],
      version: p.version,
      createdBy: p.created_by,
      updatedAt: p.updated_at,
      archivedAt: p.archived_at,
    })),
    assets: (assets ?? []).map((a): Asset => ({
      id: a.id,
      kind: a.kind as AssetKind,
      name: a.name,
      storagePath: a.storage_path,
      mimeType: a.mime_type,
      byteSize: a.byte_size,
      rules: a.rules,
      status: a.status as Asset["status"],
      approvedAt: a.approved_at,
      expiresOn: a.expires_on,
      createdAt: a.created_at,
    })),
    consents: (consents ?? []).map((c): Consent => ({
      id: c.id,
      party: c.party,
      status: c.status as Consent["status"],
      note: c.note,
      updatedAt: c.updated_at,
    })),
    approvals: (approvals ?? []).map((a): Approval => ({
      id: a.id,
      contentId: a.content_id,
      kind: a.kind as ApprovalKind,
      version: a.version,
      status: a.status as Approval["status"],
      note: a.note,
      requestedBy: a.requested_by,
      decidedBy: a.decided_by,
      decidedAt: a.decided_at,
      createdAt: a.created_at,
    })),
    overrides: (overrides ?? []).map((o): Override => ({
      id: o.id,
      contentId: o.content_id,
      checkKey: o.check_key,
      version: o.version,
      reason: o.reason,
      actorId: o.actor_id,
      createdAt: o.created_at,
    })),
    access: (access ?? []).map((a): AccessGrant => ({
      id: a.id,
      userId: a.user_id,
      level: a.level === "approver" ? "approver" : "contributor",
      grantedBy: a.granted_by,
      createdAt: a.created_at,
    })),
  };
}

/** The pre-send checks, run by the database on the saved post. */
export async function loadChecks(contentId: string): Promise<Check[]> {
  const rows = await run(supabase.rpc("mkt_content_checks", { _content: contentId }));
  return (rows ?? []).map((r) => ({
    checkKey: r.check_key,
    level: r.level === "block" ? "block" : r.level === "warn" ? "warn" : "pass",
    title: r.title,
    reason: r.reason,
  }));
}

export async function loadVersions(contentId: string) {
  const rows = await run(
    supabase
      .from("mkt_content_versions")
      .select("id, version, title, body, created_by, created_at")
      .eq("content_id", contentId)
      .order("version", { ascending: false }),
  );
  return (rows ?? []).map((v) => ({
    id: v.id,
    version: v.version,
    title: v.title,
    body: v.body,
    createdBy: v.created_by,
    createdAt: v.created_at,
  }));
}

export async function loadMarketingHistory(clientId: string): Promise<HistoryRow[]> {
  const rows = await run(
    supabase
      .from("audit_events")
      .select("id, summary, actor_name, created_at")
      .eq("entity_type", "marketing")
      .eq("entity_id", clientId)
      .order("created_at", { ascending: false })
      .limit(200),
  );
  return (rows ?? []).map((r) => ({
    id: r.id,
    summary: r.summary ?? "",
    actor: r.actor_name ?? "",
    at: r.created_at,
  }));
}

/* ----------------------------------------------------------------- writes */

export type MarketingTable =
  | "mkt_brand_kits"
  | "mkt_assets"
  | "mkt_consents"
  | "mkt_campaigns"
  | "mkt_content"
  | "mkt_approvals"
  | "mkt_overrides"
  | "client_marketing_access";

type Scope = Pick<Marketing, "workspaceId" | "clientId">;

export async function insertMarketing(
  m: Scope,
  table: MarketingTable,
  row: Record<string, unknown>,
): Promise<string> {
  const id = (row["id"] as string | undefined) ?? crypto.randomUUID();
  await run(
    supabase
      .from(table as never)
      .insert({ ...row, id, workspace_id: m.workspaceId, client_id: m.clientId } as never),
  );
  return id;
}

export async function updateMarketing(
  table: MarketingTable,
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await run(
    supabase
      .from(table as never)
      .update(patch as never)
      .eq("id", id),
  );
}

export async function deleteMarketing(table: MarketingTable, id: string): Promise<void> {
  await run(
    supabase
      .from(table as never)
      .delete()
      .eq("id", id),
  );
}

/** Ask for a decision on the post as it stands now; the database stamps the version. */
export async function requestApproval(m: Scope, contentId: string, kind: ApprovalKind) {
  await insertMarketing(m, "mkt_approvals", { content_id: contentId, kind, version: 0 });
}

/**
 * Decide on the current version: the open request for it if there is one,
 * otherwise a request made and decided in one go.
 */
export async function decideApproval(
  m: Scope,
  contentId: string,
  version: number,
  kind: ApprovalKind,
  status: "approved" | "changes_requested",
  note = "",
) {
  const open = await run(
    supabase
      .from("mkt_approvals")
      .select("id")
      .eq("content_id", contentId)
      .eq("kind", kind)
      .eq("version", version)
      .eq("status", "requested")
      .order("created_at", { ascending: false })
      .limit(1),
  );
  const id =
    open?.[0]?.id ??
    (await insertMarketing(m, "mkt_approvals", { content_id: contentId, kind, version }));
  await updateMarketing("mkt_approvals", id, { status, note });
}

const extOf = (name: string) => {
  const match = /\.[a-z0-9]+$/i.exec(name);
  return match ? match[0].toLowerCase() : "";
};

/** Files sit under `<ws>/marketing/<client>/`, readable only by marketing people. */
export async function uploadAsset(m: Scope, file: File, kind: AssetKind): Promise<string> {
  const id = crypto.randomUUID();
  const path = `${m.workspaceId}/marketing/${m.clientId}/${id}${extOf(file.name)}`;
  const up = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || "application/octet-stream" });
  if (up.error) throw new Error(explainMarketingError(up.error.message));
  try {
    await insertMarketing(m, "mkt_assets", {
      id,
      kind,
      name: file.name.replace(/\.[^.]+$/, "") || file.name,
      storage_path: path,
      mime_type: file.type || null,
      byte_size: file.size,
    });
  } catch (cause) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw cause;
  }
  return id;
}

export async function removeAsset(asset: Asset): Promise<void> {
  await deleteMarketing("mkt_assets", asset.id);
  if (asset.storagePath) await supabase.storage.from(BUCKET).remove([asset.storagePath]);
}

export async function assetUrl(path: string, download?: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 600, download ? { download } : undefined);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
