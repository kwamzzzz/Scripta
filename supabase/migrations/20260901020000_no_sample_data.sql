-- Praxis ships no sample data. A new account starts empty and the user
-- populates it. This was applied once before and came back when an older
-- migration was replayed, so the seeder itself is neutralised here rather than
-- only its caller: even a restored bootstrap_user cannot plant demo content.
-- The signature is preserved (returns uuid) so existing callers still resolve.
create or replace function public.seed_demo_matter(_workspace_id uuid, _user_id uuid)
returns uuid language plpgsql security definer set search_path = public as $fn$
begin
  return null::uuid;
end $fn$;

create or replace function public.bootstrap_user(_user_id uuid, _email text, _full_name text, _avatar_url text)
returns void language plpgsql security definer set search_path = public as $fn$
declare ws uuid;
begin
  insert into public.profiles(id, email, full_name, avatar_url)
  values (_user_id, _email, _full_name, _avatar_url)
  on conflict (id) do update set
    email = coalesce(excluded.email, public.profiles.email),
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url);

  select w.id into ws from public.workspaces w
   where w.owner_id = _user_id and w.kind = 'personal' limit 1;

  if ws is null then
    insert into public.workspaces(name, kind, owner_id)
    values (coalesce(nullif(_full_name,''), 'Personal'), 'personal', _user_id) returning id into ws;
    insert into public.workspace_members(workspace_id, user_id, role) values (ws, _user_id, 'owner');
  end if;
end $fn$;

revoke all on function public.bootstrap_user(uuid,text,text,text) from public, anon;
revoke all on function public.seed_demo_matter(uuid,uuid) from public, anon, authenticated;
