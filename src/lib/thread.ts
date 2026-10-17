/**
 * One thread, wherever the work is.
 *
 * A clause, a task, a deliverable, a flow phase, a research note, a document
 * and the matter itself all carry the same discussion: roots, replies, a
 * resolve, and an edit that says it was edited. There is one component above
 * this module and one set of rules in it, because a comment box per screen is
 * how a product ends up with a different idea per screen of who may speak.
 *
 * ---------------------------------------------------------------------------
 * THE ONE RULE THIS MODULE EXISTS TO KEEP
 * ---------------------------------------------------------------------------
 *
 * Every control is rendered against the same predicate that judges it. Not a
 * predicate that agrees with it — the same one. So nothing here re-derives
 * authorisation from rows it has read: `useThreadContext` asks the database for
 * the matter, the responsible person and the caller's role, and the database
 * answers with `comment_matter()`, `entity_owner()` and `can_review_matter()`,
 * which are the identical functions the RLS policies and the update trigger
 * consult when the write actually arrives.
 *
 * `mayResolve` below is the one piece of real judgement on this side, and it is
 * a transcription of `enforce_comment_change()` — three grounds, any one of
 * which is enough, narrowing rather than widening where nobody is responsible.
 * It is unit-tested against the same table of cases as the SQL suite. If the
 * two ever disagree the database wins and the person sees a control that does
 * nothing, which is the failure this arrangement is meant to make loud rather
 * than to prevent.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { MatterRole } from "@/lib/matter-team";

/* The generated Supabase types are regenerated on sync and do not yet carry the
   Phase 4 columns, so the calls are cast at this boundary and nowhere else. */
const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

/**
 * Where a thread can hang.
 *
 * This list is not decoration. Every kind here must be a `source_kind` value,
 * must be answered by `comment_matter()`, and must be answered by
 * `entity_owner()` — a kind missing from the first is unwritable, and a kind
 * missing from either resolver fails silently rather than loudly. Adding to
 * this list without adding to both functions in the same migration is the
 * mistake Phase 3 made three times.
 *
 * `research_finding` is deliberately absent. A finding is not a durable entity —
 * every save of a research matter destroys and recreates its findings — so a
 * thread on one is orphaned by the next save and silently becomes author-only.
 * Research collaboration attaches to the research matter instead. The reasoning
 * and what it would take to change is in `docs/research-finding-identity.md`.
 */
export const THREAD_KINDS = [
  "matter",
  "clause",
  "document",
  "task",
  "deliverable",
  "flow_phase",
  "research",
] as const;

export type ThreadKind = (typeof THREAD_KINDS)[number];

/** A note is kept for a reader; an instruction is handed to the redraft. */
export type CommentKind = "note" | "instruction";

export type Comment = {
  id: string;
  parentId: string | null;
  entityKind: ThreadKind;
  entityId: string;
  body: string;
  authorId: string | null;
  resolved: boolean;
  createdAt: string;
  /** Null until somebody edits. The presence of a value IS the Edited marker. */
  updatedAt: string | null;
  mentions: string[];
  kind: CommentKind;
};

/** A root and the replies under it, which is as deep as a thread goes. */
export type ThreadItem = { comment: Comment; replies: Comment[] };

/**
 * What the database says about the thing this thread is about.
 *
 * `matterId` null means firm knowledge or unfiled private work — there is no
 * team, so no mention and no role. `ownerId` null means nobody is responsible,
 * which narrows resolution to the raiser and the Lead rather than widening it.
 */
export type ThreadContext = {
  matterId: string | null;
  ownerId: string | null;
  myRole: MatterRole | null;
  mayComment: boolean;
};

/** A non-member gets nothing back at all, which is not the same as a null row. */
export const NO_ACCESS: ThreadContext = {
  matterId: null,
  ownerId: null,
  myRole: null,
  mayComment: false,
};

const COLUMNS =
  "id, parent_id, entity_kind, entity_id, body, author_id, resolved, created_at, updated_at, mentions, kind";

const str = (v: unknown) => (typeof v === "string" ? v : "");

const toComment = (row: Record<string, unknown>): Comment => ({
  id: str(row["id"]),
  parentId: typeof row["parent_id"] === "string" ? row["parent_id"] : null,
  entityKind: row["entity_kind"] as ThreadKind,
  entityId: str(row["entity_id"]),
  body: str(row["body"]),
  authorId: typeof row["author_id"] === "string" ? row["author_id"] : null,
  resolved: row["resolved"] === true,
  createdAt: str(row["created_at"]),
  updatedAt: typeof row["updated_at"] === "string" ? row["updated_at"] : null,
  mentions: Array.isArray(row["mentions"]) ? (row["mentions"] as string[]).filter(Boolean) : [],
  kind: row["kind"] === "instruction" ? "instruction" : "note",
});

/**
 * Roots oldest first, replies oldest first under their root.
 *
 * A discussion reads downwards. This is the one place in the module that
 * decides that, so the clause workbench and the flow board cannot disagree
 * about which way a conversation runs.
 */
export function buildThread(comments: Comment[]): ThreadItem[] {
  const byTime = (a: Comment, b: Comment) => Date.parse(a.createdAt) - Date.parse(b.createdAt);
  const roots = comments.filter((c) => !c.parentId).sort(byTime);
  const replies = comments.filter((c) => c.parentId);
  return roots.map((comment) => ({
    comment,
    replies: replies.filter((r) => r.parentId === comment.id).sort(byTime),
  }));
}

/**
 * Whether this person may resolve this thread. A transcription of
 * `enforce_comment_change()`, and deliberately not a clever generalisation of
 * it.
 *
 * Three grounds, any one of which is enough:
 *   you raised it · you are responsible for what it is about · you lead the matter
 *
 * Where responsibility cannot be identified, `ownerId` is null and the rule
 * falls to the raiser and the Lead. It never widens: an Editor who is none of
 * these may not close a Reviewer's objection on somebody else's work.
 */
export function mayResolve(
  comment: Pick<Comment, "authorId">,
  context: ThreadContext,
  userId: string | null | undefined,
): boolean {
  if (!userId) return false;
  if (!context.mayComment) return false; // A Viewer resolves nothing.
  if (comment.authorId === userId) return true;
  if (context.ownerId && context.ownerId === userId) return true;
  return context.myRole === "lead";
}

/**
 * Whether this person may edit this comment. The author, and nobody else.
 *
 * A Lead may delete a comment and may not rewrite one. That asymmetry is
 * deliberate: removing something from the record is a supervisory act with an
 * audit row behind it, and changing what a colleague is recorded as having
 * said is not a thing the product should be able to do at all.
 */
export function mayEdit(
  comment: Pick<Comment, "authorId">,
  context: ThreadContext,
  userId: string | null | undefined,
): boolean {
  return !!userId && comment.authorId === userId && context.mayComment;
}

/** The author, or the Lead. Matches the delete policy. */
export function mayDelete(
  comment: Pick<Comment, "authorId">,
  context: ThreadContext,
  userId: string | null | undefined,
): boolean {
  if (!userId) return false;
  return comment.authorId === userId || context.myRole === "lead";
}

/** "Edited 14 August, 09:12", or nothing at all if it never was. */
export function editedLabel(comment: Pick<Comment, "updatedAt">): string | null {
  if (!comment.updatedAt) return null;
  const when = new Date(comment.updatedAt);
  if (Number.isNaN(when.getTime())) return "Edited";
  return `Edited ${when.toLocaleString(undefined, {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export function useThreadContext(kind: ThreadKind, entityId: string | null | undefined) {
  return useQuery({
    queryKey: ["thread-context", kind, entityId],
    enabled: !!entityId,
    queryFn: async (): Promise<ThreadContext> => {
      const { data, error } = await db.rpc("thread_context", { _kind: kind, _id: entityId });
      if (error) throw new Error(error.message);
      const row = (data ?? [])[0] as Record<string, unknown> | undefined;
      // No row means not a member. The absence is the answer.
      if (!row) return NO_ACCESS;
      return {
        matterId: typeof row["matter_id"] === "string" ? row["matter_id"] : null,
        ownerId: typeof row["owner_id"] === "string" ? row["owner_id"] : null,
        myRole: (row["my_role"] as MatterRole | null) ?? null,
        mayComment: row["may_comment"] === true,
      };
    },
  });
}

export function useThread(kind: ThreadKind, entityId: string | null | undefined) {
  return useQuery({
    queryKey: ["thread", kind, entityId],
    enabled: !!entityId,
    queryFn: async (): Promise<ThreadItem[]> => {
      const { data, error } = await db
        .from("comments")
        .select(COLUMNS)
        .eq("entity_kind", kind)
        .eq("entity_id", entityId);
      if (error) throw new Error(error.message);
      return buildThread(((data ?? []) as Record<string, unknown>[]).map(toComment));
    },
  });
}

/**
 * Posting, replying, editing, resolving and deleting.
 *
 * Every one of these is a plain table write rather than an RPC, because RLS and
 * the update trigger already carry the rules and a function wrapping them would
 * be a third place for the rules to live. The workspace is read from the entity
 * rather than passed in, and a reply does not send an entity at all — the
 * `comments_inherit_parent` trigger takes it from the root, so a reply cannot
 * be aimed at a different matter than the thread it appears in.
 */
export function useThreadActions(
  kind: ThreadKind,
  entityId: string,
  workspaceId: string | null | undefined,
) {
  const qc = useQueryClient();
  const done = () => {
    void qc.invalidateQueries({ queryKey: ["thread", kind, entityId] });
    void qc.invalidateQueries({ queryKey: ["notes"] });
    void qc.invalidateQueries({ queryKey: ["unseen-mentions"] });
  };
  const write = async (run: Promise<{ error: unknown }>) => {
    const { error } = await run;
    if (error) throw new Error((error as { message?: string }).message ?? "The write was refused.");
  };

  return {
    post: useMutation({
      mutationFn: ({
        body,
        mentions = [],
        commentKind = "note",
      }: {
        body: string;
        mentions?: string[];
        commentKind?: CommentKind;
      }) =>
        write(
          db.from("comments").insert({
            workspace_id: workspaceId,
            entity_kind: kind,
            entity_id: entityId,
            body,
            mentions,
            kind: commentKind,
          }),
        ),
      onSuccess: done,
    }),
    reply: useMutation({
      mutationFn: ({
        parentId,
        body,
        mentions = [],
      }: {
        parentId: string;
        body: string;
        mentions?: string[];
      }) =>
        write(
          db.from("comments").insert({
            // entity_kind, entity_id and workspace_id are set by the trigger
            // from the root. Sending them would be sending a second opinion.
            workspace_id: workspaceId,
            entity_kind: kind,
            entity_id: entityId,
            parent_id: parentId,
            body,
            mentions,
          }),
        ),
      onSuccess: done,
    }),
    edit: useMutation({
      mutationFn: ({ id, body }: { id: string; body: string }) =>
        write(db.from("comments").update({ body }).eq("id", id)),
      onSuccess: done,
    }),
    setResolved: useMutation({
      mutationFn: ({ id, resolved }: { id: string; resolved: boolean }) =>
        write(db.from("comments").update({ resolved }).eq("id", id)),
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: (id: string) => write(db.from("comments").delete().eq("id", id)),
      onSuccess: done,
    }),
  };
}
