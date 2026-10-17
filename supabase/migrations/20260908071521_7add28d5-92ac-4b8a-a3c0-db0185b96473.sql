create table if not exists public.platform_admins (
  user_id uuid primary key,
  granted_by uuid,
  created_at timestamptz not null default now()
);

grant select, insert, delete on public.platform_admins to authenticated;
grant all on public.platform_admins to service_role;

alter table public.platform_admins enable row level security;

create or replace function public.is_platform_admin(_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.platform_admins a where a.user_id = _user_id);
$$;

create policy "Admins read the admin list"
on public.platform_admins for select to authenticated
using (public.is_platform_admin(auth.uid()) or user_id = auth.uid());

create policy "Admins add admins"
on public.platform_admins for insert to authenticated
with check (public.is_platform_admin(auth.uid()) and granted_by = auth.uid());

create policy "Admins remove other admins"
on public.platform_admins for delete to authenticated
using (public.is_platform_admin(auth.uid()) and user_id <> auth.uid());

create policy "Admins read all profiles"
on public.profiles for select to authenticated
using (public.is_platform_admin(auth.uid()));

insert into public.platform_admins (user_id)
select id from auth.users where lower(email) = 'mawusikwame009@gmail.com'
on conflict (user_id) do nothing;

create or replace function public.bootstrap_user(_user_id uuid, _email text, _full_name text, _avatar_url text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  ws uuid;
  clean_email text := lower(nullif(trim(_email), ''));
  clean_name text := nullif(trim(_full_name), '');
begin
  if _user_id is null then raise exception 'A user id is required'; end if;

  insert into public.profiles(id, email, full_name, avatar_url)
  values (_user_id, clean_email, clean_name, nullif(trim(_avatar_url), ''))
  on conflict (id) do update set
    email = coalesce(excluded.email, public.profiles.email),
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url);

  if clean_email = 'mawusikwame009@gmail.com' then
    insert into public.platform_admins(user_id) values (_user_id)
    on conflict (user_id) do nothing;
  end if;

  select id into ws from public.workspaces
  where owner_id = _user_id and kind = 'personal' limit 1;

  if ws is null then
    insert into public.workspaces(name, kind, owner_id)
    values (coalesce(clean_name, 'Personal workspace'), 'personal', _user_id)
    returning id into ws;
  end if;

  insert into public.workspace_members(workspace_id, user_id, role)
  values (ws, _user_id, 'owner')
  on conflict (workspace_id, user_id) do update set role = 'owner';
end
$function$;