-- Flow, moved off the browser.
--
-- Flow records lived in localStorage, which meant a matter's phases,
-- deliverables and attached versions existed on exactly one machine, in one
-- browser, until somebody cleared their site data. Nothing else in Scripta
-- could see them: a task could not point at a deliverable, and a deliverable
-- could not know a task was open against it.
--
-- Normalised rather than a jsonb body, because unlike a preset — which is
-- applied and edited whole — individual deliverables are now referenced from
-- outside Flow. A deliverable needs a stable uuid another table can hold.
--
-- Every child carries workspace_id so each policy is a direct check rather
-- than a join back through the parent.

create table public.matter_flows (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  matter_id uuid not null references public.matters(id) on delete cascade,
  kind text not null default 'document' check (kind in ('document', 'action')),
  started_at date,
  -- Who is involved, as drawn in the rail. Never referenced from elsewhere.
  parties jsonb not null default '[]'::jsonb,
  contacts jsonb not null default '[]'::jsonb,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One flow per matter: the flow is how that matter is run, not a document of it.
  constraint matter_flows_matter_key unique (matter_id),
  constraint matter_flows_workspace_id_id_key unique (workspace_id, id)
);

create table public.flow_phases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  flow_id uuid not null references public.matter_flows(id) on delete cascade,
  name text not null default '',
  description text not null default '',
  note text,
  steps jsonb not null default '[]'::jsonb,
  deadline date,
  position integer not null default 0,
  constraint flow_phases_workspace_id_id_key unique (workspace_id, id)
);

create table public.flow_deliverables (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  flow_id uuid not null references public.matter_flows(id) on delete cascade,
  phase_id uuid not null references public.flow_phases(id) on delete cascade,
  kind text not null default 'document' check (kind in ('document', 'action')),
  name text not null default '',
  type text not null default '',
  description text not null default '',
  -- Guidance carried in from a preset: what to watch out for here.
  note text,
  owner text not null default '',
  start_on date,
  deadline date,
  mandatory boolean not null default false,
  -- The lawyer's tick. Completion still needs a final version or evidence.
  ticked boolean not null default false,
  waiting_on jsonb,
  -- Named empty slots drawn in the repository (annexes still expected).
  expected jsonb not null default '[]'::jsonb,
  references_note text not null default '',
  -- Id of the editor document (e.g. a research matter for a memo).
  editor_ref text,
  counterparty text not null default '',
  depends_on jsonb not null default '[]'::jsonb,
  position integer not null default 0,
  constraint flow_deliverables_workspace_id_id_key unique (workspace_id, id)
);

create table public.flow_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  deliverable_id uuid not null references public.flow_deliverables(id) on delete cascade,
  -- Storage path, object URL or https URL; null while nothing is attached.
  file_ref text,
  label text not null default '',
  is_final boolean not null default false,
  -- Cached first-page raster; null until generated.
  thumbnail_ref text,
  pages integer,
  by_name text not null default '',
  note text not null default '',
  created_at timestamptz not null default now()
);

create table public.flow_evidence (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  deliverable_id uuid not null references public.flow_deliverables(id) on delete cascade,
  name text not null default '',
  file_ref text,
  email_ref text,
  note text not null default '',
  meta text not null default '',
  created_at timestamptz not null default now()
);

-- A reply logged against a deliverable: who said it, when, and verbatim.
create table public.flow_threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  deliverable_id uuid not null references public.flow_deliverables(id) on delete cascade,
  author text not null default '',
  body text not null default '',
  -- Folded and punctuation-stripped, so searching finds what was actually said.
  search_text text not null default '',
  received_at timestamptz,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- A composed email that Scripta never sends: the lawyer copies it out.
create table public.flow_emails (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  deliverable_id uuid not null references public.flow_deliverables(id) on delete cascade,
  to_line text not null default '',
  cc_line text not null default '',
  subject text not null default '',
  body text not null default '',
  updated_at timestamptz not null default now(),
  constraint flow_emails_deliverable_key unique (deliverable_id)
);

create index matter_flows_workspace_matter_idx on public.matter_flows (workspace_id, matter_id);
create index flow_phases_flow_position_idx on public.flow_phases (flow_id, position);
create index flow_deliverables_flow_idx on public.flow_deliverables (flow_id, phase_id, position);
create index flow_versions_deliverable_idx on public.flow_versions (deliverable_id, created_at);
create index flow_evidence_deliverable_idx on public.flow_evidence (deliverable_id, created_at);
create index flow_threads_deliverable_idx on public.flow_threads (deliverable_id, received_at);

create trigger matter_flows_updated_at before update on public.matter_flows
  for each row execute function public.set_updated_at();
create trigger flow_emails_updated_at before update on public.flow_emails
  for each row execute function public.set_updated_at();

do $$
declare t text;
begin
  foreach t in array array[
    'matter_flows', 'flow_phases', 'flow_deliverables',
    'flow_versions', 'flow_evidence', 'flow_threads', 'flow_emails'
  ] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "members read %1$s" on public.%1$I for select to authenticated
         using (public.is_workspace_member(workspace_id))', t);
    execute format(
      'create policy "writers insert %1$s" on public.%1$I for insert to authenticated
         with check (public.can_write_workspace(workspace_id))', t);
    execute format(
      'create policy "writers update %1$s" on public.%1$I for update to authenticated
         using (public.can_write_workspace(workspace_id))
         with check (public.can_write_workspace(workspace_id))', t);
    execute format(
      'create policy "writers delete %1$s" on public.%1$I for delete to authenticated
         using (public.can_write_workspace(workspace_id))', t);
  end loop;
end $$;
