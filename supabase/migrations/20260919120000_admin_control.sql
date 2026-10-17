-- Admin portal: control over the platform.
--
--   feature_flags        gains early access: people who see a switched-off
--                        feature as on (a beta group). `note` (already here)
--                        is what members read on a "coming soon" feature.
--   platform_settings    platform-wide switches, one row per key; today
--                        maintenance mode.
--   announcements        banners shown to everyone (or to administrators),
--                        within a window.
--   admin_events         what administrators did: the portal's own log.
--   admin_overview()     headline numbers, across every firm.
--   admin_people()       everyone, with their firms and when last active.
--   admin_usage(since)   AI spend across the platform.
-- The three functions are security definer and refuse anyone who is not a
-- platform administrator; nothing here widens what members can read.
-- Everything is additive.

-- -------------------------------------------------------------- early access
alter table public.feature_flags
  add column if not exists preview_users uuid[] not null default '{}';

-- --------------------------------------------------------- platform settings
create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
grant select on public.platform_settings to authenticated;
grant insert, update, delete on public.platform_settings to authenticated;
grant all on public.platform_settings to service_role;
alter table public.platform_settings enable row level security;
drop policy if exists "signed in read platform settings" on public.platform_settings;
create policy "signed in read platform settings" on public.platform_settings
  for select to authenticated using (true);
drop policy if exists "platform admins write platform settings" on public.platform_settings;
create policy "platform admins write platform settings" on public.platform_settings
  for all to authenticated
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

-- ------------------------------------------------------------- announcements
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  tone text not null default 'info' check (tone in ('info', 'warning', 'success')),
  audience text not null default 'everyone' check (audience in ('everyone', 'admins')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  dismissible boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists announcements_live_idx on public.announcements (starts_at desc)
  where archived_at is null;
grant select, insert, update, delete on public.announcements to authenticated;
grant all on public.announcements to service_role;
alter table public.announcements enable row level security;
drop policy if exists "members read live announcements" on public.announcements;
create policy "members read live announcements" on public.announcements
  for select to authenticated using (
    public.is_platform_admin(auth.uid())
    or (archived_at is null and audience = 'everyone')
  );
drop policy if exists "platform admins manage announcements" on public.announcements;
create policy "platform admins manage announcements" on public.announcements
  for all to authenticated
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

-- -------------------------------------------------------------- admin events
create table if not exists public.admin_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text not null default '',
  action text not null,
  target text not null default '',
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_events_created_idx on public.admin_events (created_at desc);
grant select, insert on public.admin_events to authenticated;
grant all on public.admin_events to service_role;
alter table public.admin_events enable row level security;
drop policy if exists "platform admins read admin events" on public.admin_events;
create policy "platform admins read admin events" on public.admin_events
  for select to authenticated using (public.is_platform_admin(auth.uid()));
-- An administrator records only their own actions; nobody edits or deletes
-- the log.
drop policy if exists "platform admins record their actions" on public.admin_events;
create policy "platform admins record their actions" on public.admin_events
  for insert to authenticated
  with check (public.is_platform_admin(auth.uid()) and actor_id = auth.uid());

-- ------------------------------------------------------------------ overview
create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  month_start timestamptz := date_trunc('month', now());
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'Only platform administrators can read this.';
  end if;
  return jsonb_build_object(
    'people', (select count(*) from profiles),
    'newPeople30d', (select count(*) from profiles where created_at > now() - interval '30 days'),
    'active7d', (select count(distinct u) from (
        select actor_id u from audit_events where created_at > now() - interval '7 days'
        union select user_id from ai_usage_events where created_at > now() - interval '7 days'
      ) x where u is not null),
    'workspaces', (select count(*) from workspaces),
    'matters', (select count(*) from matters where deleted_at is null),
    'aiCostMonth', coalesce((select sum(cost_usd) from ai_usage_events where created_at >= month_start), 0),
    'aiCallsMonth', (select count(*) from ai_usage_events where created_at >= month_start),
    'aiFailuresMonth', (select count(*) from ai_usage_events where created_at >= month_start and ok = false),
    'feedbackUnread', (select count(*) from feedback where status = 'unread'),
    'feedbackOpen', (select count(*) from feedback where status <> 'resolved'),
    'admins', (select count(*) from platform_admins)
  );
end; $$;

-- -------------------------------------------------------------------- people
create or replace function public.admin_people()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'Only platform administrators can read this.';
  end if;
  return coalesce((
    select jsonb_agg(row_to_json(p) order by p.last_active desc nulls last, p.email)
    from (
      select pr.id, pr.full_name, pr.email, pr.role_title, pr.created_at,
        exists (select 1 from platform_admins a where a.user_id = pr.id) as is_admin,
        greatest(
          (select max(created_at) from audit_events where actor_id = pr.id),
          (select max(created_at) from ai_usage_events where user_id = pr.id),
          (select max(created_at) from feedback where author_id = pr.id)
        ) as last_active,
        coalesce((
          select jsonb_agg(jsonb_build_object('name', w.name, 'role', wm.role, 'kind', w.kind))
          from workspace_members wm join workspaces w on w.id = wm.workspace_id
          where wm.user_id = pr.id
        ), '[]'::jsonb) as workspaces
      from profiles pr
    ) p
  ), '[]'::jsonb);
end; $$;

-- --------------------------------------------------------------------- usage
create or replace function public.admin_usage(since timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'Only platform administrators can read this.';
  end if;
  return jsonb_build_object(
    'total', (select jsonb_build_object(
        'calls', count(*), 'failures', count(*) filter (where not ok),
        'cost', coalesce(sum(cost_usd), 0),
        'inputTokens', coalesce(sum(input_tokens), 0), 'outputTokens', coalesce(sum(output_tokens), 0))
      from ai_usage_events where created_at >= since),
    'byFeature', coalesce((select jsonb_agg(x order by x.cost desc) from (
        select feature as key, count(*) calls, coalesce(sum(cost_usd), 0) cost,
          coalesce(sum(input_tokens + output_tokens), 0) tokens
        from ai_usage_events where created_at >= since group by feature) x), '[]'::jsonb),
    'byPerson', coalesce((select jsonb_agg(x order by x.cost desc) from (
        select coalesce(p.full_name, p.email, 'Unknown') as key, count(*) calls,
          coalesce(sum(e.cost_usd), 0) cost, coalesce(sum(e.input_tokens + e.output_tokens), 0) tokens
        from ai_usage_events e left join profiles p on p.id = e.user_id
        where e.created_at >= since group by 1) x), '[]'::jsonb),
    'byModel', coalesce((select jsonb_agg(x order by x.cost desc) from (
        select provider || ' · ' || model as key, count(*) calls, coalesce(sum(cost_usd), 0) cost,
          coalesce(sum(input_tokens + output_tokens), 0) tokens
        from ai_usage_events where created_at >= since group by 1) x), '[]'::jsonb),
    'byDay', coalesce((select jsonb_agg(x order by x.day) from (
        select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day, count(*) calls,
          coalesce(sum(cost_usd), 0) cost
        from ai_usage_events where created_at >= since group by 1) x), '[]'::jsonb)
  );
end; $$;

revoke all on function public.admin_overview() from public, anon;
revoke all on function public.admin_people() from public, anon;
revoke all on function public.admin_usage(timestamptz) from public, anon;
grant execute on function public.admin_overview() to authenticated;
grant execute on function public.admin_people() to authenticated;
grant execute on function public.admin_usage(timestamptz) to authenticated;
