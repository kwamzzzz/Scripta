/**
 * The clock, on the server.
 *
 * Four calls and no more: read the record, start (or resume) a sitting, say
 * the clock is still running, and put it down. The model in `time-spent.ts`
 * decides what the numbers mean; this only writes them.
 *
 * Every call is scoped to the signed-in lawyer by row-level security as well
 * as by these queries, because time on a file is not something a colleague
 * should be able to read without asking.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  proposeNarrative,
  TIME_SUBJECTS,
  type Sitting,
  type TimeSubjectKind,
} from "@/lib/time-spent";
import { asDoc, type ClauseDoc } from "@/wireframe/clause-doc";
import { describeStep } from "@/lib/markup-step";

type Row = {
  id: string;
  seconds: number;
  running_since: string | null;
  beat_at: string;
  ended_at: string | null;
};

const asSitting = (row: Row): Sitting => ({
  id: row.id,
  seconds: row.seconds,
  runningSince: row.running_since,
  beatAt: row.beat_at,
  endedAt: row.ended_at,
});

const kindOf = (kind: string): TimeSubjectKind => {
  const found = TIME_SUBJECTS.find((k) => k === kind);
  if (!found) throw new Error(`Nothing called "${kind}" can be timed`);
  return found;
};

/** Seconds from `from` to now, never negative. */
const since = (from: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(from).getTime()) / 1000));

/**
 * Every sitting at this subject, newest first, and the open one if there is
 * one. The total is computed by the reader from these rows.
 */
export const loadTimeSpent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { subjectKind: string; subjectId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const kind = kindOf(data.subjectKind);
    const { data: rows, error } = await supabase
      .from("time_sessions")
      .select("id, seconds, running_since, beat_at, ended_at")
      .eq("user_id", userId)
      .eq("subject_kind", kind)
      .eq("subject_id", data.subjectId)
      /* Only what has not been written up. A sitting that has been recorded is
         part of a time entry now, and counting it again would bill it twice. */
      .is("entry_id", null)
      .order("started_at", { ascending: false });
    if (error) throw new Error(error.message);
    const sittings = ((rows ?? []) as Row[]).map(asSitting);
    return { sittings, open: sittings.find((s) => !s.endedAt) ?? null };
  });

/**
 * Start the clock, or pick up where it was left.
 *
 * An open sitting is resumed rather than joined by a second one: two tabs on
 * the same document must not both count the same hour, which the unique index
 * also refuses. Resuming rolls the heartbeat forward first, so a sitting the
 * app abandoned is settled at its last beat before it runs again — otherwise
 * pressing Start tomorrow would silently bill the night.
 */
export const startTiming = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { workspaceId: string; subjectKind: string; subjectId: string; label: string }) =>
      input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const kind = kindOf(data.subjectKind);

    const { data: open, error: readErr } = await supabase
      .from("time_sessions")
      .select("id, seconds, running_since, beat_at, ended_at")
      .eq("user_id", userId)
      .eq("subject_kind", kind)
      .eq("subject_id", data.subjectId)
      .is("ended_at", null)
      .is("entry_id", null)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);

    if (open) {
      const row = open as Row;
      // What the abandoned run was actually watched for, if it was running.
      const settled =
        row.seconds +
        (row.running_since
          ? Math.max(
              0,
              Math.floor(
                (new Date(row.beat_at).getTime() - new Date(row.running_since).getTime()) / 1000,
              ),
            )
          : 0);
      const now = new Date().toISOString();
      const { data: resumed, error } = await supabase
        .from("time_sessions")
        .update({ seconds: settled, running_since: now, beat_at: now })
        .eq("id", row.id)
        .select("id, seconds, running_since, beat_at, ended_at")
        .single();
      if (error) throw new Error(error.message);
      return asSitting(resumed as Row);
    }

    const now = new Date().toISOString();
    const { data: made, error } = await supabase
      .from("time_sessions")
      .insert({
        workspace_id: data.workspaceId,
        user_id: userId,
        subject_kind: kind,
        subject_id: data.subjectId,
        label: data.label.slice(0, 200),
        seconds: 0,
        running_since: now,
        beat_at: now,
        started_at: now,
      })
      .select("id, seconds, running_since, beat_at, ended_at")
      .single();
    if (error) throw new Error(error.message);
    return asSitting(made as Row);
  });

/**
 * Still here.
 *
 * The beat settles what has run so far rather than only stamping the time, so
 * whatever happens to the tab next, the row already holds the work up to this
 * moment. That is what makes a closed app lose at most one beat.
 */
export const beatTiming = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error: readErr } = await supabase
      .from("time_sessions")
      .select("id, seconds, running_since, beat_at, ended_at")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!row) throw new Error("That sitting is not on the record");
    const open = row as Row;
    if (open.ended_at || !open.running_since) return asSitting(open);

    const now = new Date().toISOString();
    const { data: beaten, error } = await supabase
      .from("time_sessions")
      .update({
        seconds: open.seconds + since(open.running_since),
        running_since: now,
        beat_at: now,
      })
      .eq("id", open.id)
      .select("id, seconds, running_since, beat_at, ended_at")
      .single();
    if (error) throw new Error(error.message);
    return asSitting(beaten as Row);
  });

/**
 * Put the clock down.
 *
 * Pausing keeps the sitting open, so coming back in five minutes continues one
 * sitting rather than splitting a morning's work into two. Stopping closes it,
 * so the next start is a new sitting — which is what "I am done with this for
 * now" means on a time record.
 */
export const pauseTiming = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string; stop?: boolean }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error: readErr } = await supabase
      .from("time_sessions")
      .select("id, seconds, running_since, beat_at, ended_at")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!row) throw new Error("That sitting is not on the record");
    const open = row as Row;

    const now = new Date().toISOString();
    const counted = open.running_since ? open.seconds + since(open.running_since) : open.seconds;
    const { data: closed, error } = await supabase
      .from("time_sessions")
      .update({
        seconds: counted,
        running_since: null,
        beat_at: now,
        ...(data.stop ? { ended_at: open.ended_at ?? now } : {}),
      })
      .eq("id", open.id)
      .select("id, seconds, running_since, beat_at, ended_at")
      .single();
    if (error) throw new Error(error.message);
    return asSitting(closed as Row);
  });

/**
 * Put the clock back to nothing.
 *
 * The sittings go: this is the button for a clock left running over lunch, or
 * started on the wrong file, and the honest answer to that is that the
 * measurement was wrong and should not be kept. Anything already written up as
 * a time entry is untouched — that is a statement somebody made, not a
 * measurement, and it is not this button's to undo.
 */
export const resetTiming = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { subjectKind: string; subjectId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const kind = kindOf(data.subjectKind);
    const { data: gone, error } = await supabase
      .from("time_sessions")
      .delete()
      .eq("user_id", userId)
      .eq("subject_kind", kind)
      .eq("subject_id", data.subjectId)
      .is("entry_id", null)
      .select("id");
    if (error) throw new Error(error.message);
    return { discarded: (gone ?? []).length };
  });

/**
 * Write the time up: the lawyer's statement of what the work was.
 *
 * The sittings it accounts for are marked with the entry, which is what stops
 * the same minutes being recorded twice and what puts the clock back to zero
 * for the next piece of work. An open sitting is closed first, because you
 * cannot write up time that is still running.
 *
 * The figure is the caller's. The screen offers the clock's reading rounded up
 * to the firm's unit and lets it be changed, because the lawyer is the one
 * signing for it — the clock is evidence, not authority.
 */
export const recordTime = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      workspaceId: string;
      matterId: string | null;
      subjectKind: string;
      subjectId: string;
      minutes: number;
      narrative: string;
      activityCode: string;
      billable: boolean;
      workedOn: string;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const kind = kindOf(data.subjectKind);
    const minutes = Math.round(data.minutes);
    if (!Number.isFinite(minutes) || minutes <= 0) throw new Error("Say how long the work took");

    const { data: entry, error } = await supabase
      .from("time_entries")
      .insert({
        workspace_id: data.workspaceId,
        matter_id: data.matterId,
        subject_kind: kind,
        subject_id: data.subjectId,
        user_id: userId,
        worked_on: data.workedOn,
        minutes,
        narrative: data.narrative.trim().slice(0, 2000),
        activity_code: data.activityCode || "A104",
        billable: data.billable,
        source: "clock",
      })
      .select("id, minutes, worked_on, narrative, activity_code, billable")
      .single();
    if (error || !entry) throw new Error(error?.message ?? "The time could not be recorded");

    /* Everything on the clock for this subject is now accounted for by that
       entry — including a sitting still running, which is stopped as it goes. */
    const now = new Date().toISOString();
    const { error: closeErr } = await supabase
      .from("time_sessions")
      .update({ entry_id: (entry as { id: string }).id, running_since: null, ended_at: now })
      .eq("user_id", userId)
      .eq("subject_kind", kind)
      .eq("subject_id", data.subjectId)
      .is("entry_id", null);
    if (closeErr) throw new Error(closeErr.message);

    if (data.matterId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", userId)
        .maybeSingle();
      await supabase.from("audit_events").insert({
        matter_id: data.matterId,
        actor_id: userId,
        actor_name: profile?.full_name ?? profile?.email ?? "Unknown",
        event_type: "time.recorded",
        entity_type: "matter",
        entity_id: data.matterId,
        summary: `${(minutes / 60).toFixed(1)} hours recorded — ${data.narrative.trim().slice(0, 140)}`,
        metadata: {
          minutes,
          billable: data.billable,
          activity_code: data.activityCode,
          worked_on: data.workedOn,
        },
      });
    }

    return entry as unknown as {
      id: string;
      minutes: number;
      worked_on: string;
      narrative: string;
      activity_code: string;
      billable: boolean;
    };
  });

export type TimeEntry = {
  id: string;
  workedOn: string;
  minutes: number;
  narrative: string;
  activityCode: string;
  billable: boolean;
  subjectKind: string;
  subjectId: string;
};

/** Time already written up on this matter, newest first. */
export const loadTimeEntries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { matterId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("time_entries")
      .select(
        "id, worked_on, minutes, narrative, activity_code, billable, subject_kind, subject_id",
      )
      .eq("user_id", userId)
      .eq("matter_id", data.matterId)
      .order("worked_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const entries: TimeEntry[] = (
      (rows ?? []) as {
        id: string;
        worked_on: string;
        minutes: number;
        narrative: string;
        activity_code: string;
        billable: boolean;
        subject_kind: string;
        subject_id: string;
      }[]
    ).map((r) => ({
      id: r.id,
      workedOn: r.worked_on,
      minutes: r.minutes,
      narrative: r.narrative,
      activityCode: r.activity_code,
      billable: r.billable,
      subjectKind: r.subject_kind,
      subjectId: r.subject_id,
    }));
    return { entries };
  });

/** Take back an entry written by mistake; its sittings return to the clock. */
export const unrecordTime = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("time_entries")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * A first draft of the narrative, from what the sitting actually did.
 *
 * Writing up time is the part of the day everyone does badly, and the reason
 * is that it happens at six o'clock about work done at eleven. Scripta already
 * knows: every save wrote down what it did to which clause. So the narrative
 * is read off the mark-up history for the window the unrecorded sittings
 * cover, and offered — as a draft, in an editable field, because the lawyer is
 * the one signing it.
 *
 * It says what was done and to which clauses, never how many words moved. A
 * client reads this.
 */
export const proposeTimeNarrative = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { matterId: string | null; subjectKind: string; subjectId: string; label: string }) =>
      input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const kind = kindOf(data.subjectKind);

    /* The window: from the start of the earliest sitting not yet written up. */
    const { data: open } = await supabase
      .from("time_sessions")
      .select("started_at")
      .eq("user_id", userId)
      .eq("subject_kind", kind)
      .eq("subject_id", data.subjectId)
      .is("entry_id", null)
      .order("started_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const since = (open as { started_at?: string } | null)?.started_at ?? null;

    const document = data.label.trim();
    if (!since || !data.matterId)
      return {
        narrative: proposeNarrative({ document, amended: [], drafted: [], considered: [] }),
      };

    const { data: rows } = await supabase
      .from("clause_revisions")
      .select("clause_id, clause_num, kind, created_by, created_at, doc")
      .eq("matter_id", data.matterId)
      .order("created_at", { ascending: true })
      .limit(1000);

    const revisions = (rows ?? []) as unknown as {
      clause_id: string | null;
      clause_num: string;
      kind: string;
      created_by: string | null;
      created_at: string;
      doc: unknown;
    }[];

    const { data: clauseRows } = await supabase
      .from("clauses")
      .select("id, drafted_here")
      .eq("matter_id", data.matterId);
    const ours = new Set(
      ((clauseRows ?? []) as { id: string; drafted_here: boolean }[])
        .filter((c) => c.drafted_here)
        .map((c) => c.id),
    );

    /* Steps are per clause, so the chain is rebuilt the way the history screen
       rebuilds it, and only the ones inside the window and by this lawyer are
       counted. */
    const chains = new Map<string, typeof revisions>();
    for (const row of revisions) {
      const key = row.clause_id ?? `gone:${row.clause_num}`;
      const chain = chains.get(key) ?? [];
      chain.push(row);
      chains.set(key, chain);
    }

    const amended = new Set<string>();
    const drafted = new Set<string>();
    const considered = new Set<string>();

    for (const chain of chains.values()) {
      let previous: ClauseDoc | null = null;
      for (const row of chain) {
        const after = asDoc(row.doc);
        if (!after) continue;
        const step = describeStep(row.kind === "baseline" ? null : previous, after);
        previous = after;
        if (row.kind !== "step") continue;
        if (row.created_at < since || row.created_by !== userId) continue;
        const num = row.clause_num.trim();
        if (!num) continue;
        const touchedWording = step.proposed.length > 0 || step.settled.length > 0;
        if (touchedWording && row.clause_id && ours.has(row.clause_id)) drafted.add(num);
        else if (touchedWording) amended.add(num);
        else if (step.highlighted.length || step.unhighlighted.length) considered.add(num);
      }
    }

    return {
      narrative: proposeNarrative({
        document,
        amended: [...amended],
        drafted: [...drafted],
        // A clause that was amended is not also "considered".
        considered: [...considered].filter((n) => !amended.has(n) && !drafted.has(n)),
      }),
    };
  });
