alter table public.transcripts add column if not exists meeting_kind text not null default 'negotiation';

alter table public.profiles
  add column if not exists role_title text,
  add column if not exists use_case text,
  add column if not exists org_name text,
  add column if not exists jurisdiction text,
  add column if not exists agreement_types text[] not null default '{}',
  add column if not exists onboarded_at timestamptz;

create table if not exists public.transcript_insights (
  id uuid primary key default gen_random_uuid(),
  transcript_id uuid not null references public.transcripts(id) on delete cascade,
  category text not null,
  title text not null,
  detail text,
  excerpt text,
  discussion_point_id uuid references public.discussion_points(id) on delete set null,
  source public.analysis_source not null default 'ai',
  ordinal integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.transcript_insights to authenticated;
grant all on public.transcript_insights to service_role;
alter table public.transcript_insights enable row level security;

create policy "members read transcript insights" on public.transcript_insights for select to authenticated
  using (public.is_matter_member(public.transcript_matter(transcript_id)));
create policy "writers insert transcript insights" on public.transcript_insights for insert to authenticated
  with check (public.can_write_matter(public.transcript_matter(transcript_id)));
create policy "writers update transcript insights" on public.transcript_insights for update to authenticated
  using (public.can_write_matter(public.transcript_matter(transcript_id)))
  with check (public.can_write_matter(public.transcript_matter(transcript_id)));
create policy "writers delete transcript insights" on public.transcript_insights for delete to authenticated
  using (public.can_write_matter(public.transcript_matter(transcript_id)));

create trigger transcript_insights_updated_at before update on public.transcript_insights
  for each row execute function public.set_updated_at();

create table if not exists public.drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  matter_id uuid references public.matters(id) on delete set null,
  title text not null default 'Untitled draft',
  body text not null default '',
  source public.analysis_source not null default 'ai',
  agreement_type text,
  clause_category text,
  jurisdiction text,
  sector text,
  risk_position text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.drafts to authenticated;
grant all on public.drafts to service_role;
alter table public.drafts enable row level security;

create policy "members read drafts" on public.drafts for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy "writers insert drafts" on public.drafts for insert to authenticated
  with check (public.can_write_workspace(workspace_id));
create policy "writers update drafts" on public.drafts for update to authenticated
  using (public.can_write_workspace(workspace_id)) with check (public.can_write_workspace(workspace_id));
create policy "writers delete drafts" on public.drafts for delete to authenticated
  using (public.can_write_workspace(workspace_id));

create trigger drafts_updated_at before update on public.drafts
  for each row execute function public.set_updated_at();

create index if not exists transcript_insights_transcript_idx on public.transcript_insights(transcript_id);
create index if not exists drafts_workspace_idx on public.drafts(workspace_id);