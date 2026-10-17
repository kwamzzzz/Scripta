import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type ServerContext = {
  supabase: { from: (table: string) => any };
  userId: string;
};

const bodyInput = z.object({
  matterId: z.string().uuid(),
  body: z.string().trim().min(1, "Write the note first.").max(10_000),
});

const noteInput = z.object({
  matterId: z.string().uuid(),
  noteId: z.string().uuid(),
});

const resolveInput = noteInput.extend({ resolved: z.boolean() });

async function matterContext(supabase: ServerContext["supabase"], matterId: string) {
  const { data, error } = await supabase
    .from("matters")
    .select("id, workspace_id")
    .eq("id", matterId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("This matter is unavailable.");
  return data as { id: string; workspace_id: string };
}

async function noteContext(supabase: ServerContext["supabase"], matterId: string, noteId: string) {
  const matter = await matterContext(supabase, matterId);
  const { data, error } = await supabase
    .from("comments")
    .select("id, workspace_id, entity_kind, entity_id, body, resolved, kind")
    .eq("id", noteId)
    .eq("workspace_id", matter.workspace_id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || (data.kind ?? "note") !== "note") throw new Error("That note is unavailable.");

  if (data.entity_kind === "matter" && data.entity_id === matter.id) return { matter, note: data };
  if (data.entity_kind !== "clause") throw new Error("That note is not held on this matter.");

  const { data: clause, error: clauseError } = await supabase
    .from("clauses")
    .select("id")
    .eq("id", data.entity_id)
    .eq("matter_id", matter.id)
    .maybeSingle();
  if (clauseError) throw new Error(clauseError.message);
  if (!clause) throw new Error("That note is not held on this matter.");
  return { matter, note: data };
}

async function actorName(supabase: ServerContext["supabase"], userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();
  return data?.full_name ?? data?.email ?? "Unknown";
}

async function recordAudit(
  context: ServerContext,
  matterId: string,
  eventType: string,
  noteId: string,
  summary: string,
) {
  await context.supabase.from("audit_events").insert({
    matter_id: matterId,
    actor_id: context.userId,
    actor_name: await actorName(context.supabase, context.userId),
    event_type: eventType,
    entity_type: "comment",
    entity_id: noteId,
    summary,
  });
}

/** Add a note to the matter itself. Clause notes continue to be added beside their clause. */
export const addMatterNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((value) => bodyInput.parse(value))
  .handler(async ({ data, context }) => {
    const server = context as unknown as ServerContext;
    const matter = await matterContext(server.supabase, data.matterId);
    const { data: inserted, error } = await server.supabase
      .from("comments")
      .insert({
        workspace_id: matter.workspace_id,
        entity_kind: "matter",
        entity_id: matter.id,
        body: data.body,
        author_id: server.userId,
        resolved: false,
        kind: "note",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await recordAudit(server, matter.id, "matter.note_added", inserted.id, "Matter note added");
    return { id: inserted.id as string };
  });

/** Resolve or reopen one of this matter's notes. RLS limits the action to its author or an admin. */
export const setMatterNoteResolved = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((value) => resolveInput.parse(value))
  .handler(async ({ data, context }) => {
    const server = context as unknown as ServerContext;
    const { matter, note } = await noteContext(server.supabase, data.matterId, data.noteId);
    const { data: updated, error } = await server.supabase
      .from("comments")
      .update({ resolved: data.resolved })
      .eq("workspace_id", matter.workspace_id)
      .eq("id", note.id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated)
      throw new Error("Only the note's author or a workspace admin can change its status.");
    await recordAudit(
      server,
      matter.id,
      data.resolved ? "matter.note_resolved" : "matter.note_reopened",
      note.id,
      data.resolved ? "Matter note resolved" : "Matter note reopened",
    );
    return { ok: true };
  });

/** Delete one of this matter's notes, after proving its polymorphic target belongs to the matter. */
export const deleteMatterNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((value) => noteInput.parse(value))
  .handler(async ({ data, context }) => {
    const server = context as unknown as ServerContext;
    const { matter, note } = await noteContext(server.supabase, data.matterId, data.noteId);
    const { data: deleted, error } = await server.supabase
      .from("comments")
      .delete()
      .eq("workspace_id", matter.workspace_id)
      .eq("id", note.id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!deleted) throw new Error("Only the note's author or a workspace admin can delete it.");
    await recordAudit(server, matter.id, "matter.note_deleted", note.id, "Matter note deleted");
    return { ok: true };
  });
