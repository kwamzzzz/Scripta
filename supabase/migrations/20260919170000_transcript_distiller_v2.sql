-- Transcript Distiller 2.0: speaker-tolerant distillation.
--
-- The rule it is built on: first reconstruct what was said and what the
-- conversation established; then decide whether who said it matters; if it
-- does, attribute conservatively; if attribution is uncertain, keep the
-- uncertainty rather than contaminating the substance.
--
--   discussion_points   the raw transcript: one row per bubble, as the provider
--                       gave it. Evidence, never rewritten (guarded below).
--   transcript_units    Conversation Units: a coherent proposition, question,
--                       answer, decision, instruction… reconstructed from one or
--                       more bubbles (or part of one). Bubble ≠ unit.
--   transcript_insights the distilled items, now with the kind of thing each is,
--                       its provenance (units → bubbles), how sure Scripta is of
--                       the substance, and separately who said it, who owns it
--                       and who is reported to have decided it — each with its
--                       own attribution status.
--   transcripts         gains the meeting's real participants (distinct from the
--                       provider's speaker labels), its episodes, a summary, and
--                       the Raw → Distilled → Approved lifecycle.
--
-- Everything is additive. Existing rows keep working: a transcript with no
-- distillation is simply "raw".

-- ---------------------------------------------------------------- raw bubbles
alter table public.discussion_points
  -- The label the provider gave this bubble ("Speaker 2"). Kept verbatim: it
  -- is a hint, not an identity. `speaker_name` stays the display name.
  add column if not exists speaker_label text,
  add column if not exists seconds integer;

create or replace function public.discussion_point_raw_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.text is distinct from old.text
     or new.timestamp_label is distinct from old.timestamp_label
     or new.speaker_label is distinct from old.speaker_label
     or new.seconds is distinct from old.seconds
     or new.ordinal is distinct from old.ordinal
     or new.transcript_id is distinct from old.transcript_id then
    raise exception 'The raw transcript is evidence: its words, labels, times and order are never rewritten.';
  end if;
  return new;
end; $$;
drop trigger if exists discussion_points_raw_guard on public.discussion_points;
create trigger discussion_points_raw_guard before update on public.discussion_points
  for each row execute function public.discussion_point_raw_guard();

-- ---------------------------------------------------------------- transcripts
alter table public.transcripts
  -- Real people in the meeting: [{ "key", "name", "userId"?, "source": "lawyer"|"detected" }].
  add column if not exists participants jsonb not null default '[]'::jsonb,
  -- Discussion episodes: [{ "title", "fromOrdinal", "toOrdinal" }].
  add column if not exists episodes jsonb not null default '[]'::jsonb,
  add column if not exists summary text not null default '',
  add column if not exists distill_status text not null default 'raw'
    check (distill_status in ('raw', 'distilling', 'distilled', 'approved')),
  -- The distillation run in progress or last completed; items and units carry it.
  add column if not exists distill_run uuid,
  add column if not exists distill_error text,
  add column if not exists distilled_at timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references public.profiles(id) on delete set null;

-- -------------------------------------------------------- conversation units
create table if not exists public.transcript_units (
  id uuid primary key default gen_random_uuid(),
  transcript_id uuid not null references public.transcripts(id) on delete cascade,
  run_id uuid,
  ordinal integer not null default 0,
  episode text not null default '',
  -- The proposition as reconstructed: faithful, neutral, not a quotation.
  text text not null,
  -- The bubbles it was built from, in order. A bubble may serve several units.
  point_ids uuid[] not null default '{}',
  -- Scripta's local continuity token ("A", "B"…): which adjacent pieces seem to
  -- be one voice. Never an identity.
  voice text not null default '',
  -- { "name"?, "status": confirmed|likely|uncertain|unattributed, "basis" }
  speaker jsonb not null default '{"status":"unattributed"}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists transcript_units_transcript_idx
  on public.transcript_units (transcript_id, ordinal);

grant select, insert, update, delete on public.transcript_units to authenticated;
grant all on public.transcript_units to service_role;
alter table public.transcript_units enable row level security;
drop policy if exists "members read transcript units" on public.transcript_units;
create policy "members read transcript units" on public.transcript_units for select to authenticated
  using (public.is_matter_member(public.transcript_matter(transcript_id)));
drop policy if exists "writers insert transcript units" on public.transcript_units;
create policy "writers insert transcript units" on public.transcript_units for insert to authenticated
  with check (public.can_write_matter(public.transcript_matter(transcript_id)));
drop policy if exists "writers update transcript units" on public.transcript_units;
create policy "writers update transcript units" on public.transcript_units for update to authenticated
  using (public.can_write_matter(public.transcript_matter(transcript_id)))
  with check (public.can_write_matter(public.transcript_matter(transcript_id)));
drop policy if exists "writers delete transcript units" on public.transcript_units;
create policy "writers delete transcript units" on public.transcript_units for delete to authenticated
  using (public.can_write_matter(public.transcript_matter(transcript_id)));

-- ----------------------------------------------------------- distilled items
alter table public.transcript_insights
  -- fact · statement · position · proposal · question · answer · decision ·
  -- instruction · action · commitment · issue · risk · agreement ·
  -- disagreement · open_point. `category` stays, derived, for existing readers.
  add column if not exists kind text,
  add column if not exists run_id uuid,
  add column if not exists unit_ids uuid[] not null default '{}',
  add column if not exists point_ids uuid[] not null default '{}',
  add column if not exists substance_confidence text not null default 'high'
    check (substance_confidence in ('high', 'medium', 'low')),
  -- Who spoke, who owns it, who is reported to have decided it — kept apart:
  -- { "speaker"?: Ref, "owner"?: Ref, "decisionMaker"?: Ref, "subjects"?: [text] }
  -- Ref = { "participant"?, "name"?, "status", "basis", "resolvedBy"?, "resolvedAt"? }
  add column if not exists roles jsonb not null default '{}'::jsonb,
  -- The statement reports what someone else said or decided; not verified.
  add column if not exists reported boolean not null default false,
  -- Knowing who is behind this matters (decisions, commitments, owners…).
  add column if not exists attribution_material boolean not null default false,
  add column if not exists review_state text not null default 'distilled'
    check (review_state in ('distilled', 'confirmed', 'edited', 'rejected')),
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists due_text text,
  add column if not exists task_id uuid references public.tasks(id) on delete set null;

-- A change to what an approved record says takes the approval away: approval
-- vouches for a distillation as it stood, not for later edits.
create or replace function public.transcript_insight_unapprove()
returns trigger language plpgsql security definer set search_path = public as $$
declare tid uuid := coalesce(new.transcript_id, old.transcript_id);
begin
  -- Linking a task, or a timestamp moving, is not a change to what it says.
  if tg_op = 'UPDATE'
     and (new.title, new.detail, new.kind, new.category, new.roles, new.review_state,
          new.reported, new.due_text, new.unit_ids, new.point_ids, new.substance_confidence)
         is not distinct from
         (old.title, old.detail, old.kind, old.category, old.roles, old.review_state,
          old.reported, old.due_text, old.unit_ids, old.point_ids, old.substance_confidence) then
    return new;
  end if;
  update public.transcripts
     set distill_status = 'distilled', approved_at = null, approved_by = null
   where id = tid and distill_status = 'approved';
  return coalesce(new, old);
end; $$;
drop trigger if exists transcript_insights_unapprove on public.transcript_insights;
create trigger transcript_insights_unapprove
  after insert or update or delete on public.transcript_insights
  for each row execute function public.transcript_insight_unapprove();
