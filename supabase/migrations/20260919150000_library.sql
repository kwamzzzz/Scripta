-- The Library: the firm's research material in one place — statutes,
-- regulations, cases, treaties, books, articles, websites, guidance — kept
-- with enough about each to find it again and know whether it can be relied on.
--
-- It is firm knowledge: every member of the workspace reads a source and any
-- writer may improve it, unless its author marked it private, in which case it
-- is theirs alone. Collections ("Ghana tax", "OHADA") are shared shelves a
-- source can sit on several of at once.
--
-- A source's file lives in the documents bucket under `<workspace>/library/…`
-- (readable by the workspace) or, while private, under the author's
-- `<workspace>/personal/<user>/…` path; the app moves it when privacy changes.

create table public.library_collections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  description text not null default '',
  position integer not null default 0,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint library_collections_ws_id_key unique (workspace_id, id)
);

create table public.library_sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- statute | regulation | case | treaty | book | article | website | guidance
  -- | report | other. `kind_label` is the writer's own name for an "other".
  kind text not null default 'other'
    check (kind in ('statute', 'regulation', 'case', 'treaty', 'book', 'article',
                    'website', 'guidance', 'report', 'other')),
  kind_label text not null default '',
  title text not null check (btrim(title) <> ''),
  -- The formal reference: "Act 992", "[2019] GHASC 12", "ISBN 978-…".
  citation text not null default '',
  -- Author(s), or the court or body that issued it.
  authors text not null default '',
  -- Publisher, journal, reporter or website.
  publisher text not null default '',
  jurisdiction text not null default '',
  -- As written: "2019", "14 May 2019", "In force 1 Jan 2020". Not a date column.
  issued text not null default '',
  status text check (status in ('current', 'repealed', 'superseded', 'unverified')),
  weight text check (weight in ('binding', 'persuasive')),
  url text not null default '',
  file_path text,
  file_name text,
  file_mime text,
  file_bytes bigint,
  topics text[] not null default '{}',
  notes text not null default '',
  private boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint library_sources_ws_id_key unique (workspace_id, id)
);

create table public.library_source_collections (
  workspace_id uuid not null,
  source_id uuid not null,
  collection_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (source_id, collection_id),
  constraint library_sc_source_fk foreign key (workspace_id, source_id)
    references public.library_sources (workspace_id, id) on delete cascade,
  constraint library_sc_collection_fk foreign key (workspace_id, collection_id)
    references public.library_collections (workspace_id, id) on delete cascade
);

create index library_sources_ws_idx on public.library_sources (workspace_id, updated_at desc);
create index library_collections_ws_idx on public.library_collections (workspace_id, position);
create index library_sc_collection_idx on public.library_source_collections (collection_id);

create trigger library_sources_updated_at before update on public.library_sources
  for each row execute function public.set_updated_at();
create trigger library_collections_updated_at before update on public.library_collections
  for each row execute function public.set_updated_at();

create or replace function public.library_source_stamp()
returns trigger language plpgsql set search_path = public
as $$
begin
  new.updated_by := auth.uid();
  -- Who added a source never changes: it decides who may make it private.
  new.created_by := old.created_by;
  return new;
end;
$$;
create trigger library_sources_stamp_editor before update on public.library_sources
  for each row execute function public.library_source_stamp();

-- Whether the current user may see a source: a member of its workspace, and
-- either it is shared or it is theirs.
create or replace function public.can_see_library_source(_source uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.library_sources s
    where s.id = _source
      and public.is_workspace_member(s.workspace_id)
      and (not s.private or s.created_by = auth.uid())
  );
$$;

alter table public.library_sources enable row level security;
alter table public.library_collections enable row level security;
alter table public.library_source_collections enable row level security;
grant select, insert, update, delete on public.library_sources to authenticated;
grant select, insert, update, delete on public.library_collections to authenticated;
grant select, insert, update, delete on public.library_source_collections to authenticated;
grant all on public.library_sources to service_role;
grant all on public.library_collections to service_role;
grant all on public.library_source_collections to service_role;

create policy "members read shared or own library_sources" on public.library_sources
  for select to authenticated
  using (public.is_workspace_member(workspace_id) and (not private or created_by = auth.uid()));
create policy "writers add library_sources" on public.library_sources
  for insert to authenticated
  with check (public.can_write_workspace(workspace_id) and created_by = auth.uid());
-- Shared sources are the firm's to improve; a private one is its author's.
-- Only the author may change whether it is private.
create policy "writers edit shared or own library_sources" on public.library_sources
  for update to authenticated
  using (public.can_write_workspace(workspace_id) and (not private or created_by = auth.uid()))
  with check (public.can_write_workspace(workspace_id)
              and (created_by = auth.uid() or not private));
create policy "writers delete shared or own library_sources" on public.library_sources
  for delete to authenticated
  using (public.can_write_workspace(workspace_id) and (not private or created_by = auth.uid()));

create policy "members read library_collections" on public.library_collections
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "writers add library_collections" on public.library_collections
  for insert to authenticated with check (public.can_write_workspace(workspace_id));
create policy "writers edit library_collections" on public.library_collections
  for update to authenticated
  using (public.can_write_workspace(workspace_id))
  with check (public.can_write_workspace(workspace_id));
create policy "writers delete library_collections" on public.library_collections
  for delete to authenticated using (public.can_write_workspace(workspace_id));

-- A source's place on a shelf is visible to whoever can see the source.
create policy "members read library_source_collections" on public.library_source_collections
  for select to authenticated using (public.can_see_library_source(source_id));
create policy "writers file library_source_collections" on public.library_source_collections
  for insert to authenticated
  with check (public.can_write_workspace(workspace_id) and public.can_see_library_source(source_id));
create policy "writers unfile library_source_collections" on public.library_source_collections
  for delete to authenticated
  using (public.can_write_workspace(workspace_id) and public.can_see_library_source(source_id));
