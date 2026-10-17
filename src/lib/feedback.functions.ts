/**
 * The server side of feedback: one write from the composer, one read and one
 * status change for the admin portal.
 *
 * Nothing here decides who may see what. Every call runs under the caller's own
 * token, so the `feedback` table's row level security is the authority: a
 * lawyer calling `listFeedback` gets their own submissions back and nothing
 * else, whatever the interface believes about their role.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  FEEDBACK_MAX_LENGTH,
  canTransition,
  type FeedbackKind,
  type FeedbackStatus,
} from "@/lib/feedback";
import type { FeedbackContext, FeedbackTarget } from "@/lib/feedback-capture";

const uuid = z.string().uuid();
const kind = z.enum(["bug", "idea", "other"]);
const status = z.enum(["unread", "read", "resolved"]);

/** One submission, as the portal lists it. */
export type FeedbackItem = {
  id: string;
  kind: FeedbackKind;
  message: string;
  route: string;
  screen: string;
  status: FeedbackStatus;
  createdAt: string;
  statusChangedAt: string | null;
  /** The author's name, or their email, or null when neither is on file. */
  author: string | null;
  /** What the sender pointed at, when they did. */
  target: FeedbackTarget | null;
  /** What was open and how it was seen; empty on feedback sent before this was kept. */
  context: Partial<FeedbackContext>;
  /** Fetched on its own, when opened: the list stays light. */
  hasScreenshot: boolean;
  reply: string | null;
  repliedAt: string | null;
};

const target = z
  .object({
    kind: z.enum(["element", "area"]),
    label: z.string().max(400),
    selector: z.string().max(1000),
    rect: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }),
    viewport: z.object({ width: z.number(), height: z.number() }),
  })
  .nullable()
  .default(null);

/** Context is the browser's own account of itself: bounded, not trusted for anything. */
const context = z
  .record(z.string(), z.unknown())
  .refine((c) => JSON.stringify(c).length <= 20_000, "Too much context.")
  .default({});

const screenshot = z
  .string()
  .max(1_500_000)
  .refine((s) => /^data:image\/(jpeg|png);base64,/.test(s), "Not a picture.")
  .nullable()
  .default(null);

const COLUMNS =
  "id, author_id, kind, message, route, screen, status, created_at, status_changed_at, target, context, reply, replied_at";

/**
 * Rows as the portal lists them. Authors are named separately rather than
 * through an embedded join: profiles has its own policies, and a missing
 * profile must leave the feedback readable rather than drop the row. Which
 * rows carry a picture is asked separately so the pictures themselves stay
 * out of the list.
 */
async function toItems(supabase: any, rows: any[]): Promise<FeedbackItem[]> {
  const authorIds = [...new Set(rows.map((r: any) => r.author_id))];
  const ids = rows.map((r: any) => r.id);
  const [{ data: people }, { data: pictured }] = await Promise.all([
    authorIds.length
      ? supabase.from("profiles").select("id, full_name, email").in("id", authorIds)
      : Promise.resolve({ data: [] }),
    ids.length
      ? supabase.from("feedback").select("id").in("id", ids).not("screenshot", "is", null)
      : Promise.resolve({ data: [] }),
  ]);
  const nameOf = new Map<string, string | null>(
    (people ?? []).map((p: any) => [
      p.id as string,
      (p.full_name ?? p.email ?? null) as string | null,
    ]),
  );
  const withPicture = new Set((pictured ?? []).map((r: any) => r.id as string));
  return rows.map((r: any) => ({
    id: r.id as string,
    kind: r.kind as FeedbackKind,
    message: r.message as string,
    route: (r.route ?? "") as string,
    screen: (r.screen ?? "") as string,
    status: r.status as FeedbackStatus,
    createdAt: r.created_at as string,
    statusChangedAt: (r.status_changed_at ?? null) as string | null,
    author: nameOf.get(r.author_id as string) ?? null,
    target: (r.target ?? null) as FeedbackTarget | null,
    context: (r.context ?? {}) as Partial<FeedbackContext>,
    hasScreenshot: withPicture.has(r.id as string),
    reply: (r.reply ?? null) as string | null,
    repliedAt: (r.replied_at ?? null) as string | null,
  }));
}

export const submitFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      workspaceId: uuid,
      kind,
      message: z.string().trim().min(1).max(FEEDBACK_MAX_LENGTH),
      // Captured at the moment of writing: the route the sender was on and the
      // name the shell gives that screen. Both are recorded verbatim.
      route: z.string().max(500).default(""),
      screen: z.string().max(200).default(""),
      target,
      context,
      screenshot,
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { error } = await supabase.from("feedback").insert({
      workspace_id: data.workspaceId,
      author_id: userId,
      kind: data.kind,
      message: data.message,
      route: data.route,
      screen: data.screen,
      target: data.target,
      context: data.context,
      screenshot: data.screenshot,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Every submission in the workspace, newest first. Admins only, by policy. */
export const listFeedback = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ workspaceId: uuid }).parse)
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { data: rows, error } = await supabase
      .from("feedback")
      .select(COLUMNS)
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { items: await toItems(supabase, rows ?? []) };
  });

/**
 * Move one item along the flow. The transition is checked against the row as it
 * stands, not against what the caller's screen last drew, so two admins working
 * at once cannot walk an item backwards.
 */
export const setFeedbackStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ id: uuid, status }).parse)
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { data: current, error: readErr } = await supabase
      .from("feedback")
      .select("status")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!current) throw new Error("That feedback is no longer available to you.");
    if (!canTransition(current.status as FeedbackStatus, data.status))
      throw new Error(
        `This item is already ${current.status}; reload the list before changing it again.`,
      );

    const { error } = await supabase
      .from("feedback")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/**
 * Every submission in the product, newest first, for the admin portal.
 *
 * No workspace filter: the `feedback` policies decide what comes back, and only
 * a platform administrator can read beyond their own submissions.
 */
export const listPlatformFeedback = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as any;
    const { data: rows, error } = await supabase
      .from("feedback")
      .select(COLUMNS)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return { items: await toItems(supabase, rows ?? []) };
  });

/** The sender's own feedback, newest first, with any reply. */
export const listMyFeedback = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { data: rows, error } = await supabase
      .from("feedback")
      .select(COLUMNS)
      .eq("author_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { items: await toItems(supabase, rows ?? []) };
  });

/** One item's screenshot, fetched when a reviewer or its sender opens it. */
export const getFeedbackScreenshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ id: uuid }).parse)
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { data: row, error } = await supabase
      .from("feedback")
      .select("screenshot")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { screenshot: (row?.screenshot ?? null) as string | null };
  });

/**
 * A reviewer's answer, shown to the sender under their own feedback. Null
 * takes it back. The table's trigger stamps who replied and when; only a
 * reviewer's update gets past the table's policies.
 */
export const setFeedbackReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({ id: uuid, reply: z.string().trim().max(FEEDBACK_MAX_LENGTH).nullable() }).parse,
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { data: updated, error } = await supabase
      .from("feedback")
      .update({ reply: data.reply || null })
      .eq("id", data.id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated?.length) throw new Error("Only a reviewer can reply to this feedback.");
    return { ok: true as const };
  });
