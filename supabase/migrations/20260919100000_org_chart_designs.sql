-- How a client's two charts are drawn: where boxes were placed, their colours,
-- the containers grouping them, free notes and the legend.
--
-- The records say what is true (who holds what, who reports to whom); this row
-- says how the firm chose to draw it. It is kept for the whole firm, like the
-- organisation it draws, so a colleague opens the same chart and an export
-- matches the screen. It is not history: moving a box or colouring it is not a
-- change to the client, so no trigger copies it into the organisation's
-- history.
--
-- One row per client per chart. The document is versioned by `version` so an
-- older client cannot silently overwrite a newer shape.

create table public.org_chart_designs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid not null,
  kind text not null check (kind in ('reporting', 'ownership')),
  design jsonb not null default '{}'::jsonb check (jsonb_typeof(design) = 'object'),
  version integer not null default 1,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint org_chart_designs_client_fk foreign key (workspace_id, client_id)
    references public.clients (workspace_id, id) on delete cascade,
  constraint org_chart_designs_one_per_chart unique (client_id, kind)
);

create index org_chart_designs_client_idx on public.org_chart_designs (client_id);

create trigger org_chart_designs_updated_at before update on public.org_chart_designs
  for each row execute function public.set_updated_at();
create trigger org_chart_designs_stamp_author before insert on public.org_chart_designs
  for each row execute function public.stamp_created_by();

create or replace function public.org_chart_design_stamp()
returns trigger language plpgsql set search_path = public
as $$
begin
  new.updated_by := auth.uid();
  return new;
end;
$$;
create trigger org_chart_designs_stamp_editor before update on public.org_chart_designs
  for each row execute function public.org_chart_design_stamp();

alter table public.org_chart_designs enable row level security;
grant select, insert, update, delete on public.org_chart_designs to authenticated;
grant all on public.org_chart_designs to service_role;

create policy "members read org_chart_designs" on public.org_chart_designs
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "writers insert org_chart_designs" on public.org_chart_designs
  for insert to authenticated with check (public.can_write_workspace(workspace_id));
create policy "writers update org_chart_designs" on public.org_chart_designs
  for update to authenticated
  using (public.can_write_workspace(workspace_id))
  with check (public.can_write_workspace(workspace_id));
create policy "writers delete org_chart_designs" on public.org_chart_designs
  for delete to authenticated using (public.can_write_workspace(workspace_id));
