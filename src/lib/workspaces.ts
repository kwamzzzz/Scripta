/**
 * Personal workspaces and firms.
 *
 * A personal workspace is made for you at signup, belongs to you alone, and can
 * never have a second member. A firm is an organisation: it has a name, members
 * with roles, invitations, shared matters and the firm's own knowledge and
 * paper. You have one personal workspace and belong to zero or more firms.
 *
 * The distinction existed in the schema from the first day — `workspace_kind`
 * has always been an enum of exactly these two — and nothing read it, so a
 * personal workspace offered "Invite someone" under the heading "Your firm".
 * The rules now live in the database; this module is how the interface asks.
 *
 * None of this touches the matter boundary. Belonging to a firm still grants
 * access to not one matter.
 */
import { supabase } from "@/integrations/supabase/client";

const db = supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export type WorkspaceKind = "personal" | "firm";

/** What a workspace is called on screen. A personal one is never named. */
export const workspaceLabel = (w: { name: string; kind: string }) =>
  w.kind === "personal" ? "Personal" : w.name;

export async function createFirmWorkspace(name: string): Promise<string> {
  const { data, error } = await db.rpc("create_firm_workspace", { p_name: name });
  if (error) throw new Error(error.message);
  return typeof data === "string" ? data : "";
}

/**
 * Renames a firm. Display only — the workspace keeps its id, and with it every
 * matter, reference, storage path, membership and permission it had.
 */
export async function renameWorkspace(workspaceId: string, name: string): Promise<string> {
  const { data, error } = await db.rpc("rename_workspace", {
    p_workspace: workspaceId,
    p_name: name,
  });
  if (error) throw new Error(error.message);
  return typeof data === "string" ? data : name;
}
