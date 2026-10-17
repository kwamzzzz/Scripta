-- Notes kept on a client: what a partner asked for, what was said in a meeting,
-- anything a lawyer needs for context before picking the work up.
--
-- Like the client record and its organisation, notes are firm business: every
-- member of the workspace reads them and anyone who may write in it adds,
-- edits, archives or deletes them. They grant nothing over the client's
-- matters, which keep their own boundary.
--
-- Archiving is the reversible way to put a note aside. Deleting removes it,
-- and the interface asks first.

create table public.client_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid not null,
  kind text not null default 'note' check (kind in ('instruction', 'meeting', 'note')),
  title text not null default '',
  body text not null default '',
  -- The day a meeting took place or an instruction was given, when it matters.
  noted_on date,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint client_notes_client_fk foreign key (workspace_id, client_id)
    references public.clients (workspace_id, id) on delete cascade,
  constraint client_notes_not_empty check (btrim(title) <> '' or btrim(body) <> '')
);

create index client_notes_client_idx on public.client_notes (client_id, created_at desc);

create trigger client_notes_updated_at before update on public.client_notes
  for each row execute function public.set_updated_at();
create trigger client_notes_stamp_author before insert on public.client_notes
  for each row execute function public.stamp_created_by();

create or replace function public.client_note_stamp()
returns trigger language plpgsql set search_path = public
as $$
begin
  new.updated_by := auth.uid();
  return new;
end;
$$;
create trigger client_notes_stamp_editor before update on public.client_notes
  for each row execute function public.client_note_stamp();

alter table public.client_notes enable row level security;
grant select, insert, update, delete on public.client_notes to authenticated;
grant all on public.client_notes to service_role;

create policy "members read client_notes" on public.client_notes
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "writers insert client_notes" on public.client_notes
  for insert to authenticated with check (public.can_write_workspace(workspace_id));
create policy "writers update client_notes" on public.client_notes
  for update to authenticated
  using (public.can_write_workspace(workspace_id))
  with check (public.can_write_workspace(workspace_id));
create policy "writers delete client_notes" on public.client_notes
  for delete to authenticated using (public.can_write_workspace(workspace_id));
