-- Flow presets: the reusable structure of a matter, kept as firm knowledge.
--
-- A family is a kind of work ("Gold Transaction Safeguard"); a preset is one
-- variant of it ("Spot sale, refining in country"), because no two transactions
-- of a type run the same way. The variant's body is the structure itself —
-- phases, deliverables, expected uploads, guidance notes and party roles —
-- held as jsonb in the same shape the Flow screen reads, with dates as
-- working-day offsets from the matter start rather than fixed dates.
--
-- jsonb rather than tables for the body: nothing queries an individual preset
-- deliverable, and the body is applied and edited whole.

create table public.flow_preset_families (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  description text not null default '',
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint flow_preset_families_workspace_name_key unique (workspace_id, name),
  constraint flow_preset_families_workspace_id_id_key unique (workspace_id, id)
);

create table public.flow_presets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  family_id uuid not null,
  name text not null check (btrim(name) <> ''),
  summary text not null default '',
  kind text not null default 'document' check (kind in ('document', 'action')),
  body jsonb not null default '{"version":1,"kind":"document","phases":[],"deliverables":[],"parties":[]}'::jsonb,
  position integer not null default 0,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A variant can only sit in a family of its own workspace.
  constraint flow_presets_family_fkey foreign key (workspace_id, family_id)
    references public.flow_preset_families (workspace_id, id) on delete cascade,
  constraint flow_presets_family_name_key unique (family_id, name)
);

create index flow_preset_families_workspace_name_idx
  on public.flow_preset_families (workspace_id, name);
create index flow_presets_family_position_idx
  on public.flow_presets (family_id, position, created_at);

create trigger flow_preset_families_updated_at before update on public.flow_preset_families
  for each row execute function public.set_updated_at();
create trigger flow_presets_updated_at before update on public.flow_presets
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.flow_preset_families to authenticated;
grant select, insert, update, delete on public.flow_presets to authenticated;
grant all on public.flow_preset_families to service_role;
grant all on public.flow_presets to service_role;

alter table public.flow_preset_families enable row level security;
alter table public.flow_presets enable row level security;

create policy "members read preset families" on public.flow_preset_families
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "writers insert preset families" on public.flow_preset_families
  for insert to authenticated with check (public.can_write_workspace(workspace_id));
create policy "writers update preset families" on public.flow_preset_families
  for update to authenticated using (public.can_write_workspace(workspace_id))
  with check (public.can_write_workspace(workspace_id));
create policy "writers delete preset families" on public.flow_preset_families
  for delete to authenticated using (public.can_write_workspace(workspace_id));

create policy "members read presets" on public.flow_presets
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "writers insert presets" on public.flow_presets
  for insert to authenticated with check (public.can_write_workspace(workspace_id));
create policy "writers update presets" on public.flow_presets
  for update to authenticated using (public.can_write_workspace(workspace_id))
  with check (public.can_write_workspace(workspace_id));
create policy "writers delete presets" on public.flow_presets
  for delete to authenticated using (public.can_write_workspace(workspace_id));
