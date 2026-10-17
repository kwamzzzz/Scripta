/**
 * Creating a matter or a flow, and filing one somewhere later.
 *
 * Capture the work first, organise it progressively. Each function here takes
 * only what the work needs to exist — a name — and treats a client or a matter
 * as optional context. Filing later changes a link on the existing row; it
 * never makes a new one, so ids, tasks, documents and history stay put.
 */
import { supabase } from "@/integrations/supabase/client";
import { createClient } from "@/lib/clients";
import type { ClientChoice } from "@/components/client-choice";
import { blankFixture } from "@/matter-flow/fixtures";
import { createFlow } from "@/matter-flow/flow-db";
import { flowDiff } from "@/matter-flow/flow-diff";

/** The client a choice names, creating it first when it is new. */
export async function resolveClient(
  workspaceId: string,
  choice: ClientChoice,
): Promise<string | null> {
  if (choice.kind === "none") return null;
  if (choice.kind === "existing") return choice.id;
  return (await createClient(workspaceId, { name: choice.name })).id;
}

async function actor() {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) throw new Error("You are signed out. Sign in again to continue.");
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .maybeSingle();
  return { id: user.id, name: profile?.full_name ?? profile?.email ?? "Unknown" };
}

/**
 * A matter: the legal file. Nothing about a contract, a review or a document.
 *
 * The id is chosen here rather than read back from the insert. A matter cannot
 * be read in the statement that creates it — its Lead is seeded by a trigger
 * after the row exists, and until then the reader is not on its team — so
 * asking the insert to return the row is refused outright.
 */
export async function createMatter(
  workspaceId: string,
  input: { name: string; client: ClientChoice },
): Promise<string> {
  const who = await actor();
  const clientId = await resolveClient(workspaceId, input.client);
  const id = crypto.randomUUID();
  const name = input.name.trim() || "Untitled matter";
  const { error } = await supabase.from("matters").insert({
    id,
    workspace_id: workspaceId,
    name,
    client_id: clientId,
    owner_id: who.id,
    created_by: who.id,
    is_sample: false,
  });
  if (error) throw new Error(error.message);
  await supabase.from("audit_events").insert({
    matter_id: id,
    actor_id: who.id,
    actor_name: who.name,
    event_type: "matter.created",
    entity_type: "matter",
    entity_id: id,
    summary: `Matter created — ${name}`,
    metadata: { client: clientId },
  });
  return id;
}

/**
 * A flow, filed to a matter, organised under a client, or neither.
 *
 * Empty to begin with. A preset or Scripta's help is laid onto it once it
 * exists, in the flow itself, so there is one way a structure arrives and it is
 * the same whether the flow was made a minute ago or a month ago.
 */
export async function createStandaloneFlow(
  workspaceId: string,
  input: { name: string; matterId?: string | null; client?: ClientChoice },
): Promise<string> {
  const matterId = input.matterId ?? null;
  const clientId =
    matterId || !input.client ? null : await resolveClient(workspaceId, input.client);
  const seed = blankFixture(matterId ?? "");
  const record = { ...seed, matterId };
  return createFlow(
    workspaceId,
    record,
    flowDiff(null, record),
    { phases: [], deliverables: [] },
    { name: input.name.trim() || "Untitled flow", clientId },
  );
}
