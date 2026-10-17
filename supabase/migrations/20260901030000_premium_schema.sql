-- Phase 1 of the legal-OS spec: the data model the workspaces depend on.
-- Playbook governance, precedents, tasks, comments, approvals and a link graph.

create type public.review_state as enum ('aligned','review','high-risk','missing','deviation','approval');
create type public.task_status as enum ('Open','In progress','Blocked','Done');
create type public.approval_status as enum ('Not required','Requested','Approved','Rejected');
create type public.source_kind as enum ('clause','transcript','playbook','precedent','document','matter');

alter table public.playbooks
  add column if not exists description text,
  add column if not exists jurisdiction text,
  add column if not exists agreement_type text,
  add column if not exists team text,
  add column if not exists effective_date date,
  add column if not exists last_reviewed_at date,
  add column if not exists approval approval_status not null default 'Not required',
  add column if not exists approvers uuid[] not null default '{}';

alter table public.playbook_rules
  add column if not exists risk_level text,
  add column if not exists negotiation_guidance text,
  add column if not exists commercial_rationale text,
  add column if not exists legal_rationale text,
  add column if not exists approval_threshold text,
  add column if not exists jurisdiction_note text,
  add column if not exists internal_note text,
  add column if not exists acceptable text;

alter table public.clauses
  add column if not exists review_state review_state,
  add column if not exists approval approval_status not null default 'Not required',
  add column if not exists assignee_id uuid references auth.users(id) on delete set null,
  add column if not exists suggested_text text,
  add column if not exists confidence numeric;

create table if not exists public.precedents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null, clause_type text, agreement_type text, jurisdiction text, sector text,
  body text not null, source_note text, approved boolean not null default false,
  owner_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  matter_id uuid references public.matters(id) on delete cascade,
  title text not null, detail text, status task_status not null default 'Open',
  due_date date, assignee_id uuid references auth.users(id) on delete set null,
  origin_kind source_kind, origin_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_kind source_kind not null, entity_id uuid not null, body text not null,
  author_id uuid references auth.users(id) on delete set null,
  resolved boolean not null default false, created_at timestamptz not null default now()
);

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_kind source_kind not null, entity_id uuid not null, reason text,
  status approval_status not null default 'Requested',
  requested_by uuid references auth.users(id) on delete set null,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz, created_at timestamptz not null default now()
);

create table if not exists public.links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  from_kind source_kind not null, from_id uuid not null,
  to_kind source_kind not null, to_id uuid not null, note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (from_kind, from_id, to_kind, to_id)
);

alter table public.precedents enable row level security;
alter table public.tasks enable row level security;
alter table public.comments enable row level security;
alter table public.approvals enable row level security;
alter table public.links enable row level security;

-- Membership to read, writer role to mutate, resolved through the existing
-- SECURITY DEFINER helpers so no policy queries workspace_members inline.
create policy "members read precedents"   on public.precedents for select using (is_workspace_member(workspace_id));
create policy "writers insert precedents" on public.precedents for insert with check (can_write_workspace(workspace_id));
create policy "writers update precedents" on public.precedents for update using (can_write_workspace(workspace_id)) with check (can_write_workspace(workspace_id));
create policy "writers delete precedents" on public.precedents for delete using (can_write_workspace(workspace_id));

create policy "members read tasks"   on public.tasks for select using (is_workspace_member(workspace_id));
create policy "writers insert tasks" on public.tasks for insert with check (can_write_workspace(workspace_id));
create policy "writers update tasks" on public.tasks for update using (can_write_workspace(workspace_id)) with check (can_write_workspace(workspace_id));
create policy "writers delete tasks" on public.tasks for delete using (can_write_workspace(workspace_id));

create policy "members read comments"   on public.comments for select using (is_workspace_member(workspace_id));
create policy "writers insert comments" on public.comments for insert with check (can_write_workspace(workspace_id));
create policy "authors update comments" on public.comments for update using (author_id = auth.uid() or can_admin_workspace(workspace_id)) with check (can_write_workspace(workspace_id));
create policy "authors delete comments" on public.comments for delete using (author_id = auth.uid() or can_admin_workspace(workspace_id));

create policy "members read approvals"   on public.approvals for select using (is_workspace_member(workspace_id));
create policy "writers insert approvals" on public.approvals for insert with check (can_write_workspace(workspace_id));
-- Only an owner/admin may decide; a requester cannot approve their own request.
create policy "admins decide approvals"  on public.approvals for update using (can_admin_workspace(workspace_id)) with check (can_admin_workspace(workspace_id));
create policy "admins delete approvals"  on public.approvals for delete using (can_admin_workspace(workspace_id));

create policy "members read links"   on public.links for select using (is_workspace_member(workspace_id));
create policy "writers insert links" on public.links for insert with check (can_write_workspace(workspace_id));
create policy "writers delete links" on public.links for delete using (can_write_workspace(workspace_id));

create trigger precedents_updated_at before update on public.precedents for each row execute function public.set_updated_at();
create trigger tasks_updated_at before update on public.tasks for each row execute function public.set_updated_at();
