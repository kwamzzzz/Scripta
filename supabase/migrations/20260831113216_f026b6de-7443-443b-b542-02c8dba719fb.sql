-- ENUMS
create type public.app_role as enum ('owner','admin','lawyer','viewer');
create type public.workspace_kind as enum ('personal','firm');
create type public.doc_kind as enum ('contract','amendment','transcript','playbook');
create type public.parse_status as enum ('pending','parsing','parsed','failed');
create type public.clause_change as enum ('Modified','Added','Deleted');
create type public.clause_risk as enum ('Low','Medium','High');
create type public.clause_status as enum ('Accepted','Open','For discussion','Escalated');
create type public.analysis_source as enum ('ai','human');
create type public.seg_kind as enum ('n','d','i');
create type public.playbook_status as enum ('Active','Draft','Archived');
create type public.verdict as enum ('Consistent','Fallback','Red flag','Escalate');
create type public.resolution_status as enum ('Accepted','Open','Escalated');
create type public.drafting_status as enum ('Draft','Open','Escalated');

-- SHARED updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

-- PROFILES
create table public.profiles (
  id uuid primary key,
  full_name text,
  email text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();

-- WORKSPACES
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind public.workspace_kind not null default 'firm',
  owner_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.workspaces to authenticated;
grant all on public.workspaces to service_role;
alter table public.workspaces enable row level security;
create trigger workspaces_updated_at before update on public.workspaces for each row execute function public.set_updated_at();

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null,
  role public.app_role not null default 'lawyer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);
grant select, insert, update, delete on public.workspace_members to authenticated;
grant all on public.workspace_members to service_role;
alter table public.workspace_members enable row level security;
create trigger workspace_members_updated_at before update on public.workspace_members for each row execute function public.set_updated_at();

-- SECURITY DEFINER HELPERS
create or replace function public.is_workspace_member(_workspace_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspace_members m
    where m.workspace_id = _workspace_id and m.user_id = auth.uid());
$$;

create or replace function public.has_workspace_role(_workspace_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspace_members m
    where m.workspace_id = _workspace_id and m.user_id = auth.uid() and m.role = _role);
$$;

create or replace function public.can_write_workspace(_workspace_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspace_members m
    where m.workspace_id = _workspace_id and m.user_id = auth.uid()
      and m.role in ('owner','admin','lawyer'));
$$;

create or replace function public.can_admin_workspace(_workspace_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspace_members m
    where m.workspace_id = _workspace_id and m.user_id = auth.uid()
      and m.role in ('owner','admin'));
$$;

create policy "members read workspaces" on public.workspaces for select to authenticated using (public.is_workspace_member(id));
create policy "users create workspaces" on public.workspaces for insert to authenticated with check (owner_id = auth.uid());
create policy "admins update workspaces" on public.workspaces for update to authenticated using (public.can_admin_workspace(id)) with check (public.can_admin_workspace(id));
create policy "owner deletes firm workspaces" on public.workspaces for delete to authenticated using (owner_id = auth.uid() and kind = 'firm');

create policy "members read members" on public.workspace_members for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "admins manage members" on public.workspace_members for insert to authenticated with check (public.can_admin_workspace(workspace_id) or (user_id = auth.uid() and exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid())));
create policy "admins update members" on public.workspace_members for update to authenticated using (public.can_admin_workspace(workspace_id)) with check (public.can_admin_workspace(workspace_id));
create policy "admins remove members" on public.workspace_members for delete to authenticated using (public.can_admin_workspace(workspace_id) or user_id = auth.uid());

create policy "read own profile and co-members" on public.profiles for select to authenticated using (
  id = auth.uid() or exists (
    select 1 from public.workspace_members m
    where m.user_id = profiles.id and public.is_workspace_member(m.workspace_id)));
create policy "insert own profile" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- INVITATIONS
create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role public.app_role not null default 'lawyer',
  token text not null unique default encode(gen_random_bytes(24),'hex'),
  invited_by uuid not null,
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.workspace_invitations to authenticated;
grant all on public.workspace_invitations to service_role;
alter table public.workspace_invitations enable row level security;
create trigger workspace_invitations_updated_at before update on public.workspace_invitations for each row execute function public.set_updated_at();
create policy "admins read invitations" on public.workspace_invitations for select to authenticated using (public.can_admin_workspace(workspace_id));
create policy "admins create invitations" on public.workspace_invitations for insert to authenticated with check (public.can_admin_workspace(workspace_id) and invited_by = auth.uid());
create policy "admins update invitations" on public.workspace_invitations for update to authenticated using (public.can_admin_workspace(workspace_id)) with check (public.can_admin_workspace(workspace_id));
create policy "admins delete invitations" on public.workspace_invitations for delete to authenticated using (public.can_admin_workspace(workspace_id));

-- PLAYBOOKS
create table public.playbooks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  version_label text,
  status public.playbook_status not null default 'Active',
  owner_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.playbooks to authenticated;
grant all on public.playbooks to service_role;
alter table public.playbooks enable row level security;
create trigger playbooks_updated_at before update on public.playbooks for each row execute function public.set_updated_at();
create policy "members read playbooks" on public.playbooks for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "admins write playbooks" on public.playbooks for insert to authenticated with check (public.can_admin_workspace(workspace_id));
create policy "admins update playbooks" on public.playbooks for update to authenticated using (public.can_admin_workspace(workspace_id)) with check (public.can_admin_workspace(workspace_id));
create policy "admins delete playbooks" on public.playbooks for delete to authenticated using (public.can_admin_workspace(workspace_id));

create or replace function public.playbook_workspace(_playbook_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select workspace_id from public.playbooks where id = _playbook_id;
$$;

create table public.playbook_rules (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid not null references public.playbooks(id) on delete cascade,
  topic text not null,
  preferred text,
  fallback text,
  redflag text,
  escalate text,
  approved_clause_text text,
  owner_id uuid,
  owner_name text,
  usage_note text,
  suggestion_note text,
  ordinal integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.playbook_rules to authenticated;
grant all on public.playbook_rules to service_role;
alter table public.playbook_rules enable row level security;
create trigger playbook_rules_updated_at before update on public.playbook_rules for each row execute function public.set_updated_at();
create policy "members read rules" on public.playbook_rules for select to authenticated using (public.is_workspace_member(public.playbook_workspace(playbook_id)));
create policy "admins insert rules" on public.playbook_rules for insert to authenticated with check (public.can_admin_workspace(public.playbook_workspace(playbook_id)));
create policy "admins update rules" on public.playbook_rules for update to authenticated using (public.can_admin_workspace(public.playbook_workspace(playbook_id))) with check (public.can_admin_workspace(public.playbook_workspace(playbook_id)));
create policy "admins delete rules" on public.playbook_rules for delete to authenticated using (public.can_admin_workspace(public.playbook_workspace(playbook_id)));

-- MATTERS
create table public.matters (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  client text,
  counterparty text,
  stage text,
  playbook_id uuid references public.playbooks(id) on delete set null,
  is_sample boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.matters to authenticated;
grant all on public.matters to service_role;
alter table public.matters enable row level security;
create trigger matters_updated_at before update on public.matters for each row execute function public.set_updated_at();
create policy "members read matters" on public.matters for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "writers insert matters" on public.matters for insert to authenticated with check (public.can_write_workspace(workspace_id));
create policy "writers update matters" on public.matters for update to authenticated using (public.can_write_workspace(workspace_id)) with check (public.can_write_workspace(workspace_id));
create policy "writers delete matters" on public.matters for delete to authenticated using (public.can_write_workspace(workspace_id));

create or replace function public.matter_workspace(_matter_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select workspace_id from public.matters where id = _matter_id;
$$;
create or replace function public.is_matter_member(_matter_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_workspace_member(public.matter_workspace(_matter_id));
$$;
create or replace function public.can_write_matter(_matter_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_write_workspace(public.matter_workspace(_matter_id));
$$;

-- DOCUMENTS
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  matter_id uuid not null references public.matters(id) on delete cascade,
  name text not null,
  kind public.doc_kind not null,
  version_label text,
  doc_date date,
  storage_path text,
  mime_type text,
  byte_size bigint,
  page_count integer,
  uploaded_by uuid,
  parse_status public.parse_status not null default 'pending',
  parse_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.documents to authenticated;
grant all on public.documents to service_role;
alter table public.documents enable row level security;
create trigger documents_updated_at before update on public.documents for each row execute function public.set_updated_at();
create policy "members read documents" on public.documents for select to authenticated using (public.is_matter_member(matter_id));
create policy "writers insert documents" on public.documents for insert to authenticated with check (public.can_write_matter(matter_id));
create policy "writers update documents" on public.documents for update to authenticated using (public.can_write_matter(matter_id)) with check (public.can_write_matter(matter_id));
create policy "writers delete documents" on public.documents for delete to authenticated using (public.can_write_matter(matter_id));

-- CLAUSES
create table public.clauses (
  id uuid primary key default gen_random_uuid(),
  matter_id uuid not null references public.matters(id) on delete cascade,
  source_document_id uuid references public.documents(id) on delete set null,
  compared_to_document_id uuid references public.documents(id) on delete set null,
  num text,
  title text not null,
  change public.clause_change,
  risk public.clause_risk,
  status public.clause_status not null default 'Open',
  page_ref text,
  diff_summary text,
  analysis text,
  analysis_source public.analysis_source not null default 'ai',
  ordinal integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.clauses to authenticated;
grant all on public.clauses to service_role;
alter table public.clauses enable row level security;
create trigger clauses_updated_at before update on public.clauses for each row execute function public.set_updated_at();
create policy "members read clauses" on public.clauses for select to authenticated using (public.is_matter_member(matter_id));
create policy "writers insert clauses" on public.clauses for insert to authenticated with check (public.can_write_matter(matter_id));
create policy "writers update clauses" on public.clauses for update to authenticated using (public.can_write_matter(matter_id)) with check (public.can_write_matter(matter_id));
create policy "writers delete clauses" on public.clauses for delete to authenticated using (public.can_write_matter(matter_id));

create or replace function public.clause_matter(_clause_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select matter_id from public.clauses where id = _clause_id;
$$;
create or replace function public.is_clause_member(_clause_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_matter_member(public.clause_matter(_clause_id));
$$;
create or replace function public.can_write_clause(_clause_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_write_matter(public.clause_matter(_clause_id));
$$;

create table public.clause_segments (
  id uuid primary key default gen_random_uuid(),
  clause_id uuid not null references public.clauses(id) on delete cascade,
  ordinal integer not null,
  text text not null,
  kind public.seg_kind not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clause_id, ordinal)
);
grant select, insert, update, delete on public.clause_segments to authenticated;
grant all on public.clause_segments to service_role;
alter table public.clause_segments enable row level security;
create trigger clause_segments_updated_at before update on public.clause_segments for each row execute function public.set_updated_at();
create policy "members read segments" on public.clause_segments for select to authenticated using (public.is_clause_member(clause_id));
create policy "writers insert segments" on public.clause_segments for insert to authenticated with check (public.can_write_clause(clause_id));
create policy "writers update segments" on public.clause_segments for update to authenticated using (public.can_write_clause(clause_id)) with check (public.can_write_clause(clause_id));
create policy "writers delete segments" on public.clause_segments for delete to authenticated using (public.can_write_clause(clause_id));

create table public.clause_assessments (
  id uuid primary key default gen_random_uuid(),
  clause_id uuid not null references public.clauses(id) on delete cascade,
  playbook_rule_id uuid references public.playbook_rules(id) on delete set null,
  verdict public.verdict not null,
  detail text,
  source public.analysis_source not null default 'ai',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.clause_assessments to authenticated;
grant all on public.clause_assessments to service_role;
alter table public.clause_assessments enable row level security;
create trigger clause_assessments_updated_at before update on public.clause_assessments for each row execute function public.set_updated_at();
create policy "members read assessments" on public.clause_assessments for select to authenticated using (public.is_clause_member(clause_id));
create policy "writers insert assessments" on public.clause_assessments for insert to authenticated with check (public.can_write_clause(clause_id));
create policy "writers update assessments" on public.clause_assessments for update to authenticated using (public.can_write_clause(clause_id)) with check (public.can_write_clause(clause_id));
create policy "writers delete assessments" on public.clause_assessments for delete to authenticated using (public.can_write_clause(clause_id));

-- TRANSCRIPTS
create table public.transcripts (
  id uuid primary key default gen_random_uuid(),
  matter_id uuid not null references public.matters(id) on delete cascade,
  document_id uuid references public.documents(id) on delete set null,
  meeting_title text,
  meeting_date date,
  duration_minutes integer,
  source_label text,
  speaker_count integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.transcripts to authenticated;
grant all on public.transcripts to service_role;
alter table public.transcripts enable row level security;
create trigger transcripts_updated_at before update on public.transcripts for each row execute function public.set_updated_at();
create policy "members read transcripts" on public.transcripts for select to authenticated using (public.is_matter_member(matter_id));
create policy "writers insert transcripts" on public.transcripts for insert to authenticated with check (public.can_write_matter(matter_id));
create policy "writers update transcripts" on public.transcripts for update to authenticated using (public.can_write_matter(matter_id)) with check (public.can_write_matter(matter_id));
create policy "writers delete transcripts" on public.transcripts for delete to authenticated using (public.can_write_matter(matter_id));

create or replace function public.transcript_matter(_transcript_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select matter_id from public.transcripts where id = _transcript_id;
$$;

create table public.discussion_points (
  id uuid primary key default gen_random_uuid(),
  transcript_id uuid not null references public.transcripts(id) on delete cascade,
  timestamp_label text,
  speaker_name text,
  speaker_role text,
  text text not null,
  ordinal integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.discussion_points to authenticated;
grant all on public.discussion_points to service_role;
alter table public.discussion_points enable row level security;
create trigger discussion_points_updated_at before update on public.discussion_points for each row execute function public.set_updated_at();
create policy "members read discussion points" on public.discussion_points for select to authenticated using (public.is_matter_member(public.transcript_matter(transcript_id)));
create policy "writers insert discussion points" on public.discussion_points for insert to authenticated with check (public.can_write_matter(public.transcript_matter(transcript_id)));
create policy "writers update discussion points" on public.discussion_points for update to authenticated using (public.can_write_matter(public.transcript_matter(transcript_id))) with check (public.can_write_matter(public.transcript_matter(transcript_id)));
create policy "writers delete discussion points" on public.discussion_points for delete to authenticated using (public.can_write_matter(public.transcript_matter(transcript_id)));

-- RESOLUTIONS
create table public.resolutions (
  id uuid primary key default gen_random_uuid(),
  matter_id uuid not null references public.matters(id) on delete cascade,
  title text not null,
  status public.resolution_status not null default 'Open',
  text text,
  owner_id uuid,
  owner_name text,
  playbook_verdict public.verdict,
  playbook_detail text,
  ordinal integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.resolutions to authenticated;
grant all on public.resolutions to service_role;
alter table public.resolutions enable row level security;
create trigger resolutions_updated_at before update on public.resolutions for each row execute function public.set_updated_at();
create policy "members read resolutions" on public.resolutions for select to authenticated using (public.is_matter_member(matter_id));
create policy "writers insert resolutions" on public.resolutions for insert to authenticated with check (public.can_write_matter(matter_id));
create policy "writers update resolutions" on public.resolutions for update to authenticated using (public.can_write_matter(matter_id)) with check (public.can_write_matter(matter_id));
create policy "writers delete resolutions" on public.resolutions for delete to authenticated using (public.can_write_matter(matter_id));

create or replace function public.resolution_matter(_resolution_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select matter_id from public.resolutions where id = _resolution_id;
$$;

create table public.resolution_sources (
  id uuid primary key default gen_random_uuid(),
  resolution_id uuid not null references public.resolutions(id) on delete cascade,
  discussion_point_id uuid not null references public.discussion_points(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (resolution_id, discussion_point_id)
);
grant select, insert, update, delete on public.resolution_sources to authenticated;
grant all on public.resolution_sources to service_role;
alter table public.resolution_sources enable row level security;
create policy "members read resolution sources" on public.resolution_sources for select to authenticated using (public.is_matter_member(public.resolution_matter(resolution_id)));
create policy "writers insert resolution sources" on public.resolution_sources for insert to authenticated with check (public.can_write_matter(public.resolution_matter(resolution_id)));
create policy "writers delete resolution sources" on public.resolution_sources for delete to authenticated using (public.can_write_matter(public.resolution_matter(resolution_id)));

-- DRAFTING POINTS
create table public.drafting_points (
  id uuid primary key default gen_random_uuid(),
  matter_id uuid not null references public.matters(id) on delete cascade,
  resolution_id uuid references public.resolutions(id) on delete set null,
  title text not null,
  status public.drafting_status not null default 'Draft',
  text text,
  clause_id uuid references public.clauses(id) on delete set null,
  ordinal integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.drafting_points to authenticated;
grant all on public.drafting_points to service_role;
alter table public.drafting_points enable row level security;
create trigger drafting_points_updated_at before update on public.drafting_points for each row execute function public.set_updated_at();
create policy "members read drafting points" on public.drafting_points for select to authenticated using (public.is_matter_member(matter_id));
create policy "writers insert drafting points" on public.drafting_points for insert to authenticated with check (public.can_write_matter(matter_id));
create policy "writers update drafting points" on public.drafting_points for update to authenticated using (public.can_write_matter(matter_id)) with check (public.can_write_matter(matter_id));
create policy "writers delete drafting points" on public.drafting_points for delete to authenticated using (public.can_write_matter(matter_id));

-- AUDIT EVENTS
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  matter_id uuid not null references public.matters(id) on delete cascade,
  actor_id uuid,
  actor_name text,
  event_type text not null,
  entity_type text,
  entity_id uuid,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
grant select, insert on public.audit_events to authenticated;
grant all on public.audit_events to service_role;
alter table public.audit_events enable row level security;
create policy "members read audit events" on public.audit_events for select to authenticated using (public.is_matter_member(matter_id));
create policy "writers insert audit events" on public.audit_events for insert to authenticated with check (public.can_write_matter(matter_id));

create index on public.workspace_members(user_id);
create index on public.matters(workspace_id);
create index on public.documents(matter_id);
create index on public.clauses(matter_id);
create index on public.clause_segments(clause_id);
create index on public.clause_assessments(clause_id);
create index on public.discussion_points(transcript_id);
create index on public.resolutions(matter_id);
create index on public.drafting_points(matter_id);
create index on public.audit_events(matter_id, created_at desc);
create index on public.playbook_rules(playbook_id);