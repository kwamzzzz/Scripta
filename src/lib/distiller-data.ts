/**
 * One transcript as the Distiller workspace reads it: the meeting, its raw
 * bubbles, the conversation units and the distilled items. Read through the
 * signed-in client, so the matter's access rules decide what comes back.
 */
import { supabase } from "@/integrations/supabase/client";
import type {
  Bubble,
  Confidence,
  DistillStatus,
  Episode,
  Item,
  ItemKind,
  Participant,
  Ref,
  ReviewState,
  Roles,
  Unit,
} from "@/lib/distiller";

export type Distillation = {
  id: string;
  matterId: string;
  title: string;
  date: string | null;
  durationMinutes: number | null;
  kind: string;
  status: DistillStatus;
  run: string | null;
  error: string | null;
  summary: string;
  episodes: Episode[];
  participants: Participant[];
  distilledAt: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  updatedAt: string;
  bubbles: Bubble[];
  units: Unit[];
  items: Item[];
};

export const distillationKey = (id: string) => ["distillation", id] as const;

export async function fetchDistillation(transcriptId: string): Promise<Distillation> {
  const [t, points, units, items] = await Promise.all([
    supabase
      .from("transcripts")
      .select(
        "id, matter_id, meeting_title, meeting_date, duration_minutes, meeting_kind, distill_status, distill_run, distill_error, summary, episodes, participants, distilled_at, approved_at, approved_by, updated_at",
      )
      .eq("id", transcriptId)
      .maybeSingle(),
    supabase
      .from("discussion_points")
      .select("id, ordinal, speaker_label, speaker_name, timestamp_label, text")
      .eq("transcript_id", transcriptId)
      .order("ordinal"),
    supabase
      .from("transcript_units")
      .select("id, ordinal, episode, text, point_ids, voice, speaker")
      .eq("transcript_id", transcriptId)
      .order("ordinal"),
    supabase
      .from("transcript_insights")
      .select(
        "id, kind, category, title, detail, unit_ids, point_ids, substance_confidence, roles, reported, attribution_material, review_state, due_text, task_id, source, ordinal, run_id",
      )
      .eq("transcript_id", transcriptId)
      .order("ordinal"),
  ]);
  for (const r of [t, points, units, items]) if (r.error) throw new Error(r.error.message);
  if (!t.data) throw new Error("This transcript does not exist, or is on a matter you are not on.");
  const row = t.data;
  // While a run is in progress its half-written items are not shown.
  const live = row.distill_status === "distilling" ? row.distill_run : null;
  return {
    id: row.id,
    matterId: row.matter_id,
    title: row.meeting_title ?? "Meeting",
    date: row.meeting_date,
    durationMinutes: row.duration_minutes,
    kind: row.meeting_kind,
    status: row.distill_status as DistillStatus,
    run: row.distill_run,
    error: row.distill_error,
    summary: row.summary ?? "",
    episodes: (row.episodes ?? []) as unknown as Episode[],
    participants: (row.participants ?? []) as unknown as Participant[],
    distilledAt: row.distilled_at,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    updatedAt: row.updated_at,
    bubbles: (points.data ?? []).map((p) => ({
      id: p.id,
      ordinal: p.ordinal,
      label: p.speaker_label ?? p.speaker_name ?? "",
      ts: p.timestamp_label ?? "",
      text: p.text,
    })),
    units: (units.data ?? []).map((u) => ({
      id: u.id,
      ordinal: u.ordinal,
      episode: u.episode,
      text: u.text,
      pointIds: u.point_ids ?? [],
      voice: u.voice,
      speaker: (u.speaker ?? { status: "unattributed" }) as unknown as Ref,
    })),
    items: (items.data ?? [])
      .filter((i) => !live || i.run_id !== live)
      .map((i) => ({
        id: i.id,
        kind: (i.kind ?? "statement") as ItemKind,
        title: i.title,
        statement: i.detail ?? "",
        unitIds: i.unit_ids ?? [],
        pointIds: i.point_ids ?? [],
        substance: i.substance_confidence as Confidence,
        roles: (i.roles ?? {}) as unknown as Roles,
        reported: i.reported,
        material: i.attribution_material,
        review: i.review_state as ReviewState,
        due: i.due_text,
        taskId: i.task_id,
        source: (i.source as "ai" | "human") ?? "ai",
        ordinal: i.ordinal,
      })),
  };
}
