-- Time spent on a piece of work, sitting by sitting.
--
-- A lawyer's answer to "how long did this take" is a fact about their day that
-- nothing in the app recorded. This records it, and it is deliberately the
-- narrowest possible shape for that: one row per SITTING at one SUBJECT, and
-- a total that is the sum of those rows. No cached total anywhere, for the
-- reason every other derived number in this schema is derived — a cached total
-- is a number that goes wrong once and stays wrong.
--
-- THE SUBJECT IS NOT A MATTER. `subject_kind` and `subject_id` are a loose
-- reference on purpose, so the same clock serves a matter under review, a
-- research question, a flow deliverable or anything a later tool times,
-- without a column or a migration each time. The kinds live in TypeScript
-- (`TIME_SUBJECTS`), not in a check constraint: a constraint here would mean a
-- migration every time a tool wants to time itself, which is exactly the tax
-- that stops it being used. There is no foreign key for the same reason, so a
-- deleted subject leaves its time behind — which is right for a record of
-- hours worked, and those rows are ignored by every reader.
--
-- NOTHING RUNS WHILE THE APP IS SHUT. `running_since` is when the clock was
-- last started, `seconds` is what has already been counted, and `beat_at` is
-- the last moment the app was seen watching it. A sitting whose heartbeat has
-- stopped is settled at that heartbeat and closed: a browser left open
-- overnight, or a tab closed at six, counts what it was there for and not the
-- hours after. That is the honest reading and it is the one a lawyer can put
-- their name to.
--
-- THE TIME IS THE LAWYER'S OWN. Row-level security is the author alone, for
-- select as much as for write. Time on a file is how a firm decides what to
-- bill and who is slow; that is a conversation a lawyer has with their
-- supervisor, not a column their colleagues can read without asking.

create table public.time_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  /* What was being worked on: 'matter', 'research', 'deliverable', 'document',
     'task', 'learning' — see TIME_SUBJECTS. */
  subject_kind text not null check (subject_kind <> ''),
  subject_id uuid not null,
  /* What it was called when the clock ran, so an old sitting still reads as
     something rather than as an id. */
  label text not null default '',
  /* Counted so far in this sitting. Settled on every heartbeat and on pause,
     so a sitting that ends badly still holds what it had counted. */
  seconds integer not null default 0 check (seconds >= 0),
  /* When the current run began. Null while paused: a paused sitting is still
     open and can be resumed into. */
  running_since timestamptz,
  /* Last time the app said it was still watching. */
  beat_at timestamptz not null default now(),
  /* Set when the sitting is stopped, by the lawyer or by the app closing. */
  ended_at timestamptz,
  started_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.time_sessions is
  'One sitting at one subject. Total time is the sum of seconds; nothing is cached.';

-- The reader: every sitting at this subject, for this lawyer.
create index time_sessions_subject
  on public.time_sessions (user_id, subject_kind, subject_id);

-- At most one open sitting per subject per lawyer, so two tabs cannot both
-- count the same hour. The second tab adopts the sitting instead of starting
-- one, which is what `startTiming` does when it finds one open.
create unique index time_sessions_one_open
  on public.time_sessions (user_id, subject_kind, subject_id)
  where ended_at is null;

alter table public.time_sessions enable row level security;

create policy "read own time"
  on public.time_sessions for select
  using (user_id = auth.uid());

create policy "start own time"
  on public.time_sessions for insert
  with check (user_id = auth.uid() and public.is_workspace_member(workspace_id));

create policy "keep own time"
  on public.time_sessions for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- A clock started by accident is not a record worth keeping.
create policy "drop own time"
  on public.time_sessions for delete
  using (user_id = auth.uid());
