-- What you actually got done today.
--
-- Two additions. The first is a gap: a flow deliverable records that it is
-- `ticked` and never records when, so "completed today" could not be asked of
-- it. Historic ticks get no date rather than a guessed one — they will be
-- absent from past reports instead of appearing on the wrong day, which is the
-- honest failure of the two.
alter table public.flow_deliverables
  add column if not exists ticked_at timestamptz;

comment on column public.flow_deliverables.ticked_at is
  'When this deliverable was ticked complete. Null for ticks recorded before this was kept.';

-- The second is the report itself.
--
-- A day's report is DERIVED from work already recorded — completed tasks,
-- ticked deliverables, final versions, a short allow-list of audit events — so
-- it is correct whether or not anybody was here at half past five. This table
-- is what happens when a day closes: the derivation is frozen into `entries`
-- so the record cannot quietly change afterwards when a task is renamed or a
-- matter archived. A report is a statement about a day, not a live query.
--
-- `entries` holds typed, addressable rows — each carrying what kind of work it
-- was, which matter and deliverable it belongs to, and when it completed. That
-- is deliberately the seam a Career Ledger reads later: it can promote chosen
-- entries into evidence of experience without this table knowing anything
-- about CVs, competencies or reviews. None of that vocabulary belongs here.
create table if not exists public.work_reports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- Whose day. A report is one person's work, not the workspace's.
  user_id uuid not null,
  day date not null,
  entries jsonb not null default '[]'::jsonb,
  -- Context the lawyer added afterwards. Never generated.
  note text,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id, day)
);

comment on table public.work_reports is
  'One person''s completed work for one day, frozen when the day closed. Derived from tasks, deliverables, versions and a narrow allow-list of audit events.';
comment on column public.work_reports.entries is
  'Snapshot of the day: typed entries carrying kind, matter, deliverable, tool and completion time. The seam a Career Ledger reads.';

create index if not exists work_reports_day_idx on public.work_reports (workspace_id, user_id, day desc);

alter table public.work_reports enable row level security;

-- A work report is personal. Being a member of the workspace is not enough to
-- read somebody else's day.
drop policy if exists "own work_reports read" on public.work_reports;
create policy "own work_reports read" on public.work_reports
  for select using (auth.uid() = user_id and is_workspace_member(workspace_id));

drop policy if exists "own work_reports insert" on public.work_reports;
create policy "own work_reports insert" on public.work_reports
  for insert with check (auth.uid() = user_id and is_workspace_member(workspace_id));

drop policy if exists "own work_reports update" on public.work_reports;
create policy "own work_reports update" on public.work_reports
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own work_reports delete" on public.work_reports;
create policy "own work_reports delete" on public.work_reports
  for delete using (auth.uid() = user_id);
