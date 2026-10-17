-- Time recorded: the clock's reading, confirmed by the person who did the work.
--
-- ---------------------------------------------------------------------------
-- A SITTING IS NOT A TIME ENTRY
-- ---------------------------------------------------------------------------
--
-- `time_sessions` is what the clock saw: a run, to the second, with a
-- heartbeat. Nobody bills that. A time entry is what a lawyer says the work
-- was — a date, a duration in the firm's units, a narrative a client will
-- read, an activity code, and whether it is billable — and it exists because
-- somebody read the clock and confirmed it. The two are separate rows on
-- purpose: the clock is a measurement and the entry is a statement, and only
-- the second one goes anywhere near a bill.
--
-- `time_sessions.entry_id` records which sittings a given entry accounts for.
-- That is what stops the same minutes being recorded twice: a sitting that has
-- been accounted for no longer counts towards the clock, so the pill drops
-- back to zero and the next piece of work starts from nothing.
--
-- ---------------------------------------------------------------------------
-- MINUTES, NOT SECONDS
-- ---------------------------------------------------------------------------
--
-- The entry holds whole minutes, always a multiple of the firm's unit, and the
-- rounding is done once — in the application, where the lawyer can see the
-- figure and change it — rather than by whoever reads the row next.
--
-- The time is the author's own, as the clock is: row-level security is the
-- author alone, for reads as much as for writes. Who is slow and who writes
-- off is a conversation with a supervisor, not a column colleagues can browse.

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  /* The file it is billed to, where the work was on one. */
  matter_id uuid references public.matters(id) on delete set null,
  /* What was worked on, in the clock's terms. See TIME_SUBJECTS. */
  subject_kind text not null check (subject_kind <> ''),
  subject_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  /* The day the work was done, which is not always the day it is written up. */
  worked_on date not null default (now() at time zone 'utc')::date,
  /* Whole minutes, a multiple of the unit. */
  minutes integer not null check (minutes > 0),
  /* What the client reads. */
  narrative text not null default '',
  /* UTBMS activity code, so an entry can be exported without being re-coded. */
  activity_code text not null default 'A104',
  billable boolean not null default true,
  /* Where the figure came from: the clock, or typed by hand. */
  source text not null default 'clock' check (source in ('clock', 'manual')),
  created_at timestamptz not null default now()
);

comment on table public.time_entries is
  'A lawyer''s statement of time worked: confirmed, in units, with a narrative. Not the clock.';

create index time_entries_matter on public.time_entries (matter_id, worked_on desc);
create index time_entries_user on public.time_entries (user_id, worked_on desc);

alter table public.time_entries enable row level security;

create policy "read own time entries"
  on public.time_entries for select
  using (user_id = auth.uid());

create policy "write own time entries"
  on public.time_entries for insert
  with check (user_id = auth.uid() and public.is_workspace_member(workspace_id));

create policy "amend own time entries"
  on public.time_entries for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

/* An entry written by mistake is not a record worth keeping; the sittings it
   accounted for come back to the clock when it goes (ON DELETE SET NULL). */
create policy "drop own time entries"
  on public.time_entries for delete
  using (user_id = auth.uid());

-- Which sittings an entry accounts for. Null means still on the clock.
alter table public.time_sessions
  add column if not exists entry_id uuid references public.time_entries(id) on delete set null;

create index if not exists time_sessions_unrecorded
  on public.time_sessions (user_id, subject_kind, subject_id)
  where entry_id is null;
