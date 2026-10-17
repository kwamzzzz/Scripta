-- The planner: a running notebook where a lawyer plans a day, a month, a year,
-- or its wider strategy. It is not a task list. A line becomes a task only when
-- its author says so, and `made_tasks` remembers which lines did.
--
-- A plan is personal. Only its author reads or changes it, in any workspace
-- they belong to; nobody else in the workspace sees it.
--
-- `scope` says what the entry plans and `for_date` which one: the day itself,
-- the first of the month, or the first of the year. A strategic plan has no
-- date.

create table public.plan_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  scope text not null default 'day' check (scope in ('day', 'month', 'year', 'open')),
  for_date date,
  body text not null check (btrim(body) <> ''),
  -- [{ "line": "Call Bugatti re structure", "taskId": "<uuid>" }]
  made_tasks jsonb not null default '[]'::jsonb,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint plan_entries_dated check ((scope = 'open') = (for_date is null))
);

create index plan_entries_author_idx on public.plan_entries (created_by, workspace_id, created_at desc);

create trigger plan_entries_updated_at before update on public.plan_entries
  for each row execute function public.set_updated_at();

alter table public.plan_entries enable row level security;
grant select, insert, update, delete on public.plan_entries to authenticated;
grant all on public.plan_entries to service_role;

create policy "authors read plan_entries" on public.plan_entries
  for select to authenticated
  using (created_by = auth.uid() and public.is_workspace_member(workspace_id));
create policy "authors insert plan_entries" on public.plan_entries
  for insert to authenticated
  with check (created_by = auth.uid() and public.is_workspace_member(workspace_id));
create policy "authors update plan_entries" on public.plan_entries
  for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid() and public.is_workspace_member(workspace_id));
create policy "authors delete plan_entries" on public.plan_entries
  for delete to authenticated
  using (created_by = auth.uid());
