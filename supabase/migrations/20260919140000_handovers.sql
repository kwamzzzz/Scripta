-- Handover notes: an email written in Scripta, with tables and attachments,
-- that leaves as a draft for the author's own mail client to send. Scripta
-- still sends nothing itself.
--
-- A handover is its author's: only they read or change it. The people it is
-- handed to receive the email and the Word copy, not access to the draft.
--
-- `body` is the editor's document. `attachments` lists files already stored in
-- the documents bucket under the author's personal path:
-- [{ "id", "name", "fileRef", "bytes", "mime" }].

create table public.handovers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  to_line text not null default '',
  cc_line text not null default '',
  subject text not null default '',
  body jsonb,
  attachments jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'sent')),
  sent_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index handovers_author_idx on public.handovers (created_by, workspace_id, updated_at desc);

create trigger handovers_updated_at before update on public.handovers
  for each row execute function public.set_updated_at();

alter table public.handovers enable row level security;
grant select, insert, update, delete on public.handovers to authenticated;
grant all on public.handovers to service_role;

create policy "authors read handovers" on public.handovers
  for select to authenticated
  using (created_by = auth.uid() and public.is_workspace_member(workspace_id));
create policy "authors insert handovers" on public.handovers
  for insert to authenticated
  with check (created_by = auth.uid() and public.is_workspace_member(workspace_id));
create policy "authors update handovers" on public.handovers
  for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid() and public.is_workspace_member(workspace_id));
create policy "authors delete handovers" on public.handovers
  for delete to authenticated
  using (created_by = auth.uid());
