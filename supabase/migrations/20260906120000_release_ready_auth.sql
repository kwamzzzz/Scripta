-- Release hardening: email/password accounts receive only a profile and an
-- empty personal workspace. Account deletion removes that user's workspace.

drop function if exists public.seed_demo_matter(uuid, uuid);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_auth_user_fkey' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_auth_user_fkey
      foreign key (id) references auth.users(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'workspaces_owner_id_fkey' and conrelid = 'public.workspaces'::regclass
  ) then
    alter table public.workspaces
      add constraint workspaces_owner_id_fkey
      foreign key (owner_id) references public.profiles(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'workspace_members_user_id_fkey'
      and conrelid = 'public.workspace_members'::regclass
  ) then
    alter table public.workspace_members
      add constraint workspace_members_user_id_fkey
      foreign key (user_id) references public.profiles(id) on delete cascade;
  end if;
end $$;

-- Drafts survive collaborator removal, but must not block account deletion.
alter table public.drafts drop constraint if exists drafts_created_by_fkey;
alter table public.drafts
  add constraint drafts_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

create unique index if not exists workspaces_one_personal_per_owner
  on public.workspaces(owner_id) where kind = 'personal';

create or replace function public.bootstrap_user(
  _user_id uuid,
  _email text,
  _full_name text,
  _avatar_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  ws uuid;
  clean_email text := lower(nullif(trim(_email), ''));
  clean_name text := nullif(trim(_full_name), '');
begin
  if _user_id is null then
    raise exception 'A user id is required';
  end if;

  insert into public.profiles(id, email, full_name, avatar_url)
  values (_user_id, clean_email, clean_name, nullif(trim(_avatar_url), ''))
  on conflict (id) do update set
    email = coalesce(excluded.email, public.profiles.email),
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url);

  select id into ws
  from public.workspaces
  where owner_id = _user_id and kind = 'personal'
  limit 1;

  if ws is null then
    insert into public.workspaces(name, kind, owner_id)
    values (coalesce(clean_name, 'Personal workspace'), 'personal', _user_id)
    returning id into ws;
  end if;

  insert into public.workspace_members(workspace_id, user_id, role)
  values (ws, _user_id, 'owner')
  on conflict (workspace_id, user_id) do update set role = 'owner';
end
$fn$;

revoke all on function public.bootstrap_user(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.bootstrap_user(uuid, text, text, text) to service_role;

create or replace function public.bootstrap_current_user()
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  current_user_row record;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select id, email, raw_user_meta_data
    into current_user_row
  from auth.users
  where id = auth.uid();

  perform public.bootstrap_user(
    current_user_row.id,
    current_user_row.email,
    coalesce(
      current_user_row.raw_user_meta_data->>'full_name',
      current_user_row.raw_user_meta_data->>'name',
      split_part(current_user_row.email, '@', 1)
    ),
    current_user_row.raw_user_meta_data->>'avatar_url'
  );
end
$fn$;

revoke all on function public.bootstrap_current_user() from public, anon;
grant execute on function public.bootstrap_current_user() to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  perform public.bootstrap_user(
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end
$fn$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
