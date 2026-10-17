/**
 * Getting a second person into the firm.
 *
 * Until now a workspace has been something you are given when you sign up and
 * are then alone in forever: there was no invite table, no invite screen and no
 * way to add anybody. This is that path, and it is deliberately the whole of it
 * — invited, pending, accepted, with revoke, expiry and supersede as the three
 * side exits — rather than a bare "add member" button that leaves an
 * administrator with no way to see who has been asked and not yet come.
 *
 * An ADDRESS is invited, not an account. The person on the other end may not
 * have signed into Scripta in their life, and asking an administrator to find
 * out whether they have before inviting them would be a strange question about
 * somebody else's software.
 *
 * Every write is one round trip to a database function, never a read-then-write
 * from here. Creating an invitation means closing any earlier one for the same
 * address and opening a new one, and two statements from a browser are one
 * dropped connection away from an address that has been superseded and never
 * reinvited.
 *
 * WHAT THIS DOES NOT DO YET, on purpose: the matter-scoped invitation. The
 * table and the accept function both understand `scope = 'matter'`, because
 * external counsel and secondees are coming and the shape should not have to
 * change when they do. Nothing here writes one.
 */
import { supabase } from "@/integrations/supabase/client";
import type { WorkspaceRole } from "@/lib/workspace-role";

/* The generated Supabase types are regenerated on sync and do not yet carry
   these tables, so the calls are cast at this boundary and nowhere else. */
const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export type InviteStatus = "pending" | "accepted" | "revoked" | "expired" | "superseded";

export type Invite = {
  id: string;
  email: string;
  role: WorkspaceRole;
  status: InviteStatus;
  token: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
};

/** What an invited person may learn before they are anybody: whether the link is good. */
export type InvitePeek = {
  workspaceName: string;
  invitedRole: string;
  status: InviteStatus;
  expiresAt: string;
  email: string;
};

const str = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * A pending invitation whose date has passed is expired whatever the column
 * says. Nothing sweeps the table on a schedule, and a status that only becomes
 * true when somebody happens to run a job is not a status.
 */
export function effectiveStatus(invite: { status: InviteStatus; expiresAt: string }): InviteStatus {
  if (invite.status !== "pending") return invite.status;
  return new Date(invite.expiresAt).getTime() < Date.now() ? "expired" : "pending";
}

const shape = (row: any): Invite => ({
  id: str(row.id),
  email: str(row.email),
  role: (row.role ?? "lawyer") as WorkspaceRole,
  status: (row.status ?? "pending") as InviteStatus,
  token: str(row.token),
  createdAt: str(row.created_at),
  expiresAt: str(row.expires_at),
  acceptedAt: row.accepted_at ? str(row.accepted_at) : null,
});

/**
 * Every invitation this firm has ever sent, newest first — not only the open
 * ones. "Did we ever ask her?" is a question an administrator asks, and a list
 * that quietly drops the cancelled and the lapsed cannot answer it.
 */
export async function listInvites(workspaceId: string): Promise<Invite[]> {
  const { data, error } = await db
    .from("workspace_invites")
    .select("id, email, role, status, token, created_at, expires_at, accepted_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map(shape);
}

export async function createInvite(
  workspaceId: string,
  email: string,
  role: WorkspaceRole,
): Promise<Invite> {
  const { data, error } = await db.rpc("create_workspace_invite", {
    p_workspace: workspaceId,
    p_email: email,
    p_role: role,
  });
  if (error) throw new Error(error.message);
  return shape(data);
}

/** Reissues the token and pushes the date on the row that exists. Never a second row. */
export async function resendInvite(id: string): Promise<Invite> {
  const { data, error } = await db.rpc("resend_workspace_invite", { p_id: id });
  if (error) throw new Error(error.message);
  return shape(data);
}

export async function revokeInvite(id: string): Promise<void> {
  const { error } = await db.rpc("revoke_workspace_invite", { p_id: id });
  if (error) throw new Error(error.message);
}

export async function peekInvite(token: string): Promise<InvitePeek | null> {
  const { data, error } = await db.rpc("peek_workspace_invite", { p_token: token });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    workspaceName: str(row.workspace_name),
    invitedRole: str(row.invited_role),
    status: (row.status ?? "pending") as InviteStatus,
    expiresAt: str(row.expires_at),
    email: str(row.email),
  };
}

/**
 * The invitations addressed to YOU.
 *
 * `workspace_invites` is readable only by an administrator of the firm that
 * sent it, which is right and which meant the only way to accept one was to be
 * holding the token link. A person who lost the email had no route at all.
 *
 * This returns only invitations written to the signed-in person's own address —
 * never a firm's other invitations, never somebody else's token.
 */
export type IncomingInvite = {
  token: string;
  firmName: string;
  invitedRole: string;
  expiresAt: string;
};

export async function myPendingInvites(): Promise<IncomingInvite[]> {
  const { data, error } = await db.rpc("my_pending_invites");
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((row) => ({
    token: str(row.token),
    firmName: str(row.firm_name),
    invitedRole: str(row.invited_role),
    expiresAt: str(row.expires_at),
  }));
}

/** Join the firm. One statement in the database, or none: there is no half-joined. */
export async function acceptInvite(token: string): Promise<string> {
  const { data, error } = await db.rpc("accept_workspace_invite", { p_token: token });
  if (error) throw new Error(error.message);
  return str(data);
}

/**
 * The link to send.
 *
 * Scripta does not send the email. A firm this size forwards the link in the
 * message they were going to write anyway, and an administrator who can see and
 * copy the link can tell at a glance that the invitation is real — which is
 * more than can be said for mail that may or may not have left the building.
 */
export const inviteLink = (token: string) =>
  typeof window === "undefined" ? `/join/${token}` : `${window.location.origin}/join/${token}`;

/** How a status reads to a person, rather than to the column it came from. */
export const statusLabel: Record<InviteStatus, string> = {
  pending: "Awaiting reply",
  accepted: "Joined",
  revoked: "Cancelled",
  expired: "Expired",
  superseded: "Replaced by a later invitation",
};
