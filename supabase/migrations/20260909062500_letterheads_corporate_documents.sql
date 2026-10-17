-- Firm paper and the corporate documents that use it.
--
-- Image bytes stay in the existing private `matter-documents` bucket. Its
-- storage policies already authorize paths whose first segment is a workspace
-- id, so letterheads use <workspace-id>/letterheads/<uuid>.<ext>. The table
-- records only the name, storage pointer and dimensions needed to place the
-- image in a Word header.

create table public.letterheads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg')),
  byte_size bigint not null check (byte_size > 0),
  width_px integer not null check (width_px > 0),
  height_px integer not null check (height_px > 0),
  is_default boolean not null default false,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint letterheads_workspace_path check (
    storage_path like workspace_id::text || '/letterheads/%'
  ),
  constraint letterheads_workspace_id_id_key unique (workspace_id, id)
);

create unique index letterheads_one_default_per_workspace_idx
  on public.letterheads (workspace_id)
  where is_default;
create index letterheads_workspace_updated_idx
  on public.letterheads (workspace_id, updated_at desc);

grant select, insert, update, delete on public.letterheads to authenticated;
grant all on public.letterheads to service_role;
alter table public.letterheads enable row level security;

create policy "members read letterheads" on public.letterheads
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "writers insert letterheads" on public.letterheads
  for insert to authenticated with check (public.can_write_workspace(workspace_id));
create policy "writers update letterheads" on public.letterheads
  for update to authenticated using (public.can_write_workspace(workspace_id))
  with check (public.can_write_workspace(workspace_id));
create policy "writers delete letterheads" on public.letterheads
  for delete to authenticated using (public.can_write_workspace(workspace_id));

create trigger letterheads_updated_at before update on public.letterheads
  for each row execute function public.set_updated_at();

-- Choosing a default is one statement from the client. Clear the previous
-- default before the partial unique index checks the new row.
create or replace function public.keep_one_default_letterhead()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_default and (tg_op = 'INSERT' or old.is_default is distinct from true) then
    update public.letterheads
       set is_default = false
     where workspace_id = new.workspace_id
       and id <> new.id
       and is_default;
  end if;
  return new;
end;
$$;

create trigger letterheads_keep_one_default
  before insert or update of is_default on public.letterheads
  for each row execute function public.keep_one_default_letterhead();

create table public.corporate_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  matter_id uuid references public.matters(id) on delete set null,
  kind text not null check (kind in ('resolution', 'letter')),
  title text not null check (btrim(title) <> ''),
  content jsonb not null default '{}'::jsonb check (jsonb_typeof(content) = 'object'),
  letterhead_id uuid,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint corporate_documents_letterhead_workspace_fkey
    foreign key (workspace_id, letterhead_id)
    references public.letterheads(workspace_id, id)
    on delete restrict
);

create index corporate_documents_workspace_updated_idx
  on public.corporate_documents (workspace_id, updated_at desc);
create index corporate_documents_letterhead_idx
  on public.corporate_documents (letterhead_id)
  where letterhead_id is not null;

grant select, insert, update, delete on public.corporate_documents to authenticated;
grant all on public.corporate_documents to service_role;
alter table public.corporate_documents enable row level security;

create policy "members read corporate documents" on public.corporate_documents
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "writers insert corporate documents" on public.corporate_documents
  for insert to authenticated with check (public.can_write_workspace(workspace_id));
create policy "writers update corporate documents" on public.corporate_documents
  for update to authenticated using (public.can_write_workspace(workspace_id))
  with check (public.can_write_workspace(workspace_id));
create policy "writers delete corporate documents" on public.corporate_documents
  for delete to authenticated using (public.can_write_workspace(workspace_id));

create trigger corporate_documents_updated_at before update on public.corporate_documents
  for each row execute function public.set_updated_at();

-- A document may be left unfiled, but a selected matter must be in the same
-- workspace. This keeps the workspace predicate true all the way through the
-- record instead of trusting the picker alone.
create or replace function public.check_corporate_document_matter()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.matter_id is not null and not exists (
    select 1 from public.matters m
     where m.id = new.matter_id and m.workspace_id = new.workspace_id
  ) then
    raise exception 'The selected matter is not in this workspace.';
  end if;
  return new;
end;
$$;

create trigger corporate_documents_check_matter
  before insert or update of workspace_id, matter_id on public.corporate_documents
  for each row execute function public.check_corporate_document_matter();
