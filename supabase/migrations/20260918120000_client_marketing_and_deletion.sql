-- A client's marketing, visible to whoever the client's creator lets in; and
-- deleting a client.
--
-- ---------------------------------------------------------------------------
-- WHO OWNS A CLIENT
-- ---------------------------------------------------------------------------
--
-- The person who created the client record. Clients created before anyone was
-- recorded (the seven drawn from matter names on 16 September) have no
-- creator; for those, the workspace's owners and admins stand in.
--
-- ---------------------------------------------------------------------------
-- MARKETING IS CLOSED BY DEFAULT
-- ---------------------------------------------------------------------------
--
-- Unlike the rest of a client — its register entry and its organisation, which
-- the firm reads — marketing is seen only by the client's owner and the people
-- the owner adds. Each person added is a contributor (ideas, drafts, asking for
-- review) or an approver (the brief, the brand kit, approving, scheduling,
-- publishing, overriding a blocked check with a reason). Only the owner adds
-- and removes people. Access needs workspace membership as well: someone who
-- leaves the firm loses it without anyone remembering to revoke it.
--
-- Nothing about marketing is visible through another door: its files sit under
-- `<ws>/marketing/<client>/`, which the storage check now closes, and its
-- history is written against entity type `marketing`, which the audit check
-- judges by the same rule. The client's Activity, read by the firm, never
-- shows it.
--
-- ---------------------------------------------------------------------------
-- A POST IS CHECKED BY THE DATABASE, NOT THE SCREEN
-- ---------------------------------------------------------------------------
--
-- `mkt_content_checks` reads the brand kit's words to avoid, the posting
-- entity's licences, the consent register and the chosen image, and says pass,
-- warn or block for each. Scheduling or publishing a post is refused unless the
-- current version is approved and every block has an override recorded by an
-- approver against that version. Editing the text makes a new version, which
-- needs approving again.
--
-- ---------------------------------------------------------------------------
-- DELETING A CLIENT
-- ---------------------------------------------------------------------------
--
-- Moving a client to Recently Deleted, restoring it and deleting it for good
-- are for its owner. Deleting for good removes its organisation, marketing and
-- client documents; matters, flows and tasks filed under it are kept and
-- unfiled, and a matter keeps the client's name as text.

-- ===========================================================================
-- 1. Ownership and access
-- ===========================================================================

create or replace function public.is_client_owner(_client uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce((
    select case when c.created_by is not null then c.created_by = auth.uid()
                else public.can_admin_workspace(c.workspace_id) end
      from public.clients c where c.id = _client), false);
$$;

create table public.client_marketing_access (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  level text not null check (level in ('contributor', 'approver')),
  granted_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_marketing_access_client_fk foreign key (workspace_id, client_id)
    references public.clients (workspace_id, id) on delete cascade,
  constraint client_marketing_access_unique unique (client_id, user_id)
);

-- 'owner', 'approver', 'contributor', or null for no access.
create or replace function public.marketing_level(_client uuid)
returns text language sql stable security definer set search_path = public
as $$
  select case
    when not exists (select 1 from public.clients c
                      where c.id = _client and public.is_workspace_member(c.workspace_id)) then null
    when public.is_client_owner(_client) then 'owner'
    else (select a.level from public.client_marketing_access a
           where a.client_id = _client and a.user_id = auth.uid())
  end;
$$;

create or replace function public.can_see_marketing(_client uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.marketing_level(_client) is not null; $$;

create or replace function public.can_approve_marketing(_client uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.marketing_level(_client) in ('owner', 'approver'), false); $$;

alter table public.client_marketing_access enable row level security;
grant select, insert, update, delete on public.client_marketing_access to authenticated;
grant all on public.client_marketing_access to service_role;
create trigger client_marketing_access_updated_at before update on public.client_marketing_access
  for each row execute function public.set_updated_at();
create policy "marketing people read access" on public.client_marketing_access for select to authenticated
  using (public.can_see_marketing(client_id));
create policy "owner grants access" on public.client_marketing_access for insert to authenticated
  with check (public.is_client_owner(client_id)
              and exists (select 1 from public.workspace_members m
                           where m.workspace_id = client_marketing_access.workspace_id
                             and m.user_id = client_marketing_access.user_id));
create policy "owner changes access" on public.client_marketing_access for update to authenticated
  using (public.is_client_owner(client_id)) with check (public.is_client_owner(client_id));
create policy "owner revokes access" on public.client_marketing_access for delete to authenticated
  using (public.is_client_owner(client_id));

-- ===========================================================================
-- 2. Marketing records
-- ===========================================================================

create table public.mkt_brand_kits (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid not null,
  -- [{ name, hex }]
  palette jsonb not null default '[]'::jsonb,
  heading_font text not null default '',
  body_font text not null default '',
  tone text not null default '',
  avoid_words text[] not null default '{}',
  rules text not null default '',
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mkt_brand_kits_client_fk foreign key (workspace_id, client_id)
    references public.clients (workspace_id, id) on delete cascade,
  constraint mkt_brand_kits_one_per_client unique (client_id)
);

create table public.mkt_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid not null,
  kind text not null default 'other' check (kind in
    ('logo_primary', 'logo_reversed', 'logo_mark', 'favicon', 'letterhead', 'email_signature',
     'template', 'photography', 'document', 'other')),
  name text not null check (btrim(name) <> ''),
  storage_path text,
  mime_type text,
  byte_size bigint,
  rules text not null default '',
  status text not null default 'awaiting_approval'
    check (status in ('awaiting_approval', 'approved', 'retired')),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  expires_on date,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mkt_assets_client_fk foreign key (workspace_id, client_id)
    references public.clients (workspace_id, id) on delete cascade,
  constraint mkt_assets_client_id_key unique (client_id, id)
);

create table public.mkt_consents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid not null,
  party text not null check (btrim(party) <> ''),
  status text not null default 'requested' check (status in ('requested', 'granted', 'refused')),
  document_id uuid references public.documents(id) on delete set null,
  note text not null default '',
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mkt_consents_client_fk foreign key (workspace_id, client_id)
    references public.clients (workspace_id, id) on delete cascade
);

create table public.mkt_campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid not null,
  name text not null check (btrim(name) <> ''),
  goal text not null default '',
  audience text not null default '',
  message text not null default '',
  channels text[] not null default '{}',
  measure text not null default '',
  -- The entity the campaign speaks as: its licences decide licence claims.
  entity_id uuid,
  starts_on date,
  ends_on date,
  status text not null default 'active' check (status in ('active', 'closed')),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint mkt_campaigns_client_fk foreign key (workspace_id, client_id)
    references public.clients (workspace_id, id) on delete cascade,
  constraint mkt_campaigns_client_id_key unique (client_id, id),
  constraint mkt_campaigns_dates check (ends_on is null or starts_on is null or ends_on >= starts_on),
  constraint mkt_campaigns_entity_fk foreign key (client_id, entity_id)
    references public.org_entities (client_id, id) on delete set null (entity_id)
);

create table public.mkt_content (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid not null,
  campaign_id uuid,
  channel text not null default 'linkedin' check (channel in
    ('linkedin', 'newsletter', 'one_pager', 'website', 'event', 'press', 'other')),
  title text not null check (btrim(title) <> ''),
  body text not null default '',
  asset_id uuid,
  stage text not null default 'idea' check (stage in ('idea', 'drafting', 'review', 'scheduled', 'published')),
  scheduled_at timestamptz,
  published_at timestamptz,
  -- { views, reactions, comments, note }
  metrics jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint mkt_content_client_fk foreign key (workspace_id, client_id)
    references public.clients (workspace_id, id) on delete cascade,
  constraint mkt_content_client_id_key unique (client_id, id),
  constraint mkt_content_campaign_fk foreign key (client_id, campaign_id)
    references public.mkt_campaigns (client_id, id) on delete set null (campaign_id),
  constraint mkt_content_asset_fk foreign key (client_id, asset_id)
    references public.mkt_assets (client_id, id) on delete set null (asset_id),
  constraint mkt_content_scheduled_needs_time check (stage <> 'scheduled' or scheduled_at is not null)
);

create table public.mkt_content_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid not null,
  content_id uuid not null,
  version integer not null,
  title text not null,
  body text not null,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint mkt_content_versions_client_fk foreign key (workspace_id, client_id)
    references public.clients (workspace_id, id) on delete cascade,
  constraint mkt_content_versions_content_fk foreign key (client_id, content_id)
    references public.mkt_content (client_id, id) on delete cascade,
  constraint mkt_content_versions_unique unique (content_id, version)
);

create table public.mkt_approvals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid not null,
  content_id uuid not null,
  kind text not null check (kind in ('legal_review', 'director_approval')),
  version integer not null,
  status text not null default 'requested' check (status in ('requested', 'approved', 'changes_requested')),
  requested_by uuid default auth.uid() references auth.users(id) on delete set null,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mkt_approvals_client_fk foreign key (workspace_id, client_id)
    references public.clients (workspace_id, id) on delete cascade,
  constraint mkt_approvals_content_fk foreign key (client_id, content_id)
    references public.mkt_content (client_id, id) on delete cascade
);

create table public.mkt_overrides (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid not null,
  content_id uuid not null,
  check_key text not null,
  version integer not null,
  reason text not null check (btrim(reason) <> ''),
  actor_id uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint mkt_overrides_client_fk foreign key (workspace_id, client_id)
    references public.clients (workspace_id, id) on delete cascade,
  constraint mkt_overrides_content_fk foreign key (client_id, content_id)
    references public.mkt_content (client_id, id) on delete cascade,
  constraint mkt_overrides_unique unique (content_id, check_key, version)
);

do $$
declare t text;
begin
  foreach t in array array['mkt_brand_kits','mkt_assets','mkt_consents','mkt_campaigns','mkt_content',
                           'mkt_content_versions','mkt_approvals','mkt_overrides'] loop
    execute format('create index %I on public.%I (client_id)', t || '_client_idx', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.can_see_marketing(client_id))',
                   'marketing people read ' || t, t);
  end loop;
  foreach t in array array['mkt_brand_kits','mkt_assets','mkt_consents','mkt_campaigns','mkt_content','mkt_approvals'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
                   t || '_updated_at', t);
  end loop;
end $$;

-- Contributors: content, asset uploads, review requests. Approvers: the rest.
create policy "marketing people add content" on public.mkt_content for insert to authenticated
  with check (public.can_see_marketing(client_id));
create policy "marketing people edit content" on public.mkt_content for update to authenticated
  using (public.can_see_marketing(client_id)) with check (public.can_see_marketing(client_id));
create policy "approvers delete content" on public.mkt_content for delete to authenticated
  using (public.can_approve_marketing(client_id));

create policy "marketing people add assets" on public.mkt_assets for insert to authenticated
  with check (public.can_see_marketing(client_id));
create policy "marketing people edit assets" on public.mkt_assets for update to authenticated
  using (public.can_see_marketing(client_id)) with check (public.can_see_marketing(client_id));
create policy "approvers delete assets" on public.mkt_assets for delete to authenticated
  using (public.can_approve_marketing(client_id));

create policy "marketing people request approval" on public.mkt_approvals for insert to authenticated
  with check (public.can_see_marketing(client_id) and status = 'requested');
create policy "approvers decide" on public.mkt_approvals for update to authenticated
  using (public.can_approve_marketing(client_id)) with check (public.can_approve_marketing(client_id));
create policy "approvers withdraw requests" on public.mkt_approvals for delete to authenticated
  using (public.can_approve_marketing(client_id));

do $$
declare t text;
begin
  foreach t in array array['mkt_brand_kits','mkt_consents','mkt_campaigns'] loop
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can_approve_marketing(client_id))',
                   'approvers add ' || t, t);
    execute format('create policy %I on public.%I for update to authenticated using (public.can_approve_marketing(client_id)) with check (public.can_approve_marketing(client_id))',
                   'approvers edit ' || t, t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.can_approve_marketing(client_id))',
                   'approvers delete ' || t, t);
  end loop;
end $$;

create policy "approvers override" on public.mkt_overrides for insert to authenticated
  with check (public.can_approve_marketing(client_id) and actor_id = auth.uid());
-- Versions are written by the database when a post's text changes; overrides
-- are a record and are neither edited nor removed.

create trigger mkt_brand_kits_stamp_author before insert on public.mkt_brand_kits for each row execute function public.stamp_created_by();
create trigger mkt_assets_stamp_author before insert on public.mkt_assets for each row execute function public.stamp_created_by();
create trigger mkt_consents_stamp_author before insert on public.mkt_consents for each row execute function public.stamp_created_by();
create trigger mkt_campaigns_stamp_author before insert on public.mkt_campaigns for each row execute function public.stamp_created_by();
create trigger mkt_content_stamp_author before insert on public.mkt_content for each row execute function public.stamp_created_by();

-- An asset is approved or retired by an approver; a contributor's upload waits.
create or replace function public.guard_mkt_asset()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if (tg_op = 'INSERT' and new.status <> 'awaiting_approval')
     or (tg_op = 'UPDATE' and new.status is distinct from old.status) then
    if not public.can_approve_marketing(new.client_id) then
      raise exception 'Only an approver can approve or retire a brand asset.' using errcode = '42501';
    end if;
    if new.status = 'approved' then
      new.approved_by := auth.uid();
      new.approved_at := now();
    end if;
  end if;
  return new;
end;
$$;
create trigger mkt_assets_guard before insert or update on public.mkt_assets
  for each row execute function public.guard_mkt_asset();

-- ===========================================================================
-- 3. Checks before a post goes out
-- ===========================================================================

-- Security invoker: it reads the post, the kit, the licences and the consents
-- through the caller's own policies, so it can never report on a post the
-- caller could not open.
create or replace function public.mkt_content_checks(_content uuid)
returns table (check_key text, level text, title text, reason text)
language plpgsql stable security invoker set search_path = public
as $$
declare
  post public.mkt_content;
  kit public.mkt_brand_kits;
  campaign public.mkt_campaigns;
  entity_name text;
  word text;
  hits text[] := '{}';
  consent record;
  asset public.mkt_assets;
  live text;
  lapsed text;
  plain text;
begin
  select * into post from public.mkt_content where id = _content;
  if not found then return; end if;
  plain := lower(coalesce(post.title, '') || ' ' || coalesce(post.body, ''));
  select * into kit from public.mkt_brand_kits where client_id = post.client_id;
  if post.campaign_id is not null then
    select * into campaign from public.mkt_campaigns where id = post.campaign_id;
  end if;

  -- Words the brand kit says not to use.
  if kit.id is not null then
    foreach word in array coalesce(kit.avoid_words, '{}') loop
      if btrim(word) <> '' and plain ~* ('\m' || regexp_replace(lower(btrim(word)), '([.*+?^${}()|\[\]\\])', '\\\1', 'g') || '\M') then
        hits := hits || btrim(word);
      end if;
    end loop;
    if array_length(hits, 1) > 0 then
      return query select 'tone'::text, 'block'::text, 'Words the brand kit avoids'::text,
        format('Uses %s.', array_to_string(array(select '"' || h || '"' from unnest(hits) h), ', '));
    else
      return query select 'tone'::text, 'pass'::text, 'Words the brand kit avoids'::text,
        case when array_length(kit.avoid_words, 1) > 0 then 'None of them are used.'
             else 'The brand kit lists none.' end;
    end if;
  end if;

  -- A licence claim must be true of the entity the campaign speaks as.
  if plain ~* '\m(licen[cs]ed|licen[cs]e|licen[cs]es|permit|permitted|regulated)\M' then
    if campaign.entity_id is null then
      return query select 'licence'::text, 'warn'::text, 'Licence claim'::text,
        'The post mentions a licence, but its campaign names no posting entity to check it against.'::text;
    else
      select coalesce(nullif(e.short_name, ''), e.name) into entity_name from public.org_entities e where e.id = campaign.entity_id;
      select string_agg(l.name, ', ') into live from public.org_licences l
       where l.entity_id = campaign.entity_id and l.archived_at is null
         and (l.expires_on is null or l.expires_on >= current_date);
      select string_agg(format('%s (expired %s)', l.name, to_char(l.expires_on, 'DD Mon YYYY')), ', ') into lapsed
        from public.org_licences l
       where l.entity_id = campaign.entity_id and l.archived_at is null and l.expires_on < current_date;
      if lapsed is not null then
        return query select 'licence'::text, 'block'::text, 'Licence claim'::text,
          format('%s has a licence that is not currently live: %s.', entity_name, lapsed);
      elsif live is not null then
        return query select 'licence'::text, 'pass'::text, 'Licence claim'::text,
          format('%s holds %s.', entity_name, live);
      else
        return query select 'licence'::text, 'block'::text, 'Licence claim'::text,
          format('%s has no licence recorded.', entity_name);
      end if;
    end if;
  end if;

  -- Anyone named needs consent on file.
  for consent in select c.party, c.status from public.mkt_consents c where c.client_id = post.client_id loop
    if position(lower(btrim(consent.party)) in plain) > 0 then
      return query select ('consent:' || lower(btrim(consent.party)))::text,
        case when consent.status = 'granted' then 'pass' else 'block' end,
        format('%s named', consent.party),
        case when consent.status = 'granted' then 'Consent is on file.'
             when consent.status = 'refused' then 'Consent was refused.'
             else 'Consent has been asked for but is not on file.' end;
    end if;
  end loop;

  -- The image must be approved and in date.
  if post.asset_id is not null then
    select * into asset from public.mkt_assets where id = post.asset_id;
    if asset.status = 'retired' or (asset.expires_on is not null and asset.expires_on < current_date) then
      return query select 'asset'::text, 'block'::text, 'Image'::text, format('%s is retired or out of date.', asset.name);
    elsif asset.status = 'awaiting_approval' then
      return query select 'asset'::text, 'warn'::text, 'Image'::text, format('%s is awaiting approval.', asset.name);
    else
      return query select 'asset'::text, 'pass'::text, 'Image'::text, format('%s is approved.', asset.name);
    end if;
  end if;
end;
$$;

create or replace function public.guard_mkt_content()
returns trigger language plpgsql security invoker set search_path = public
as $$
declare
  going_out boolean;
  blocked text;
begin
  if tg_op = 'UPDATE' and (new.title is distinct from old.title or new.body is distinct from old.body) then
    new.version := old.version + 1;
    -- A changed post is not the post that was approved.
    if new.stage in ('scheduled', 'published') then new.stage := 'review'; end if;
  end if;
  if tg_op = 'INSERT' then new.version := 1; end if;

  going_out := new.stage in ('scheduled', 'published')
    and (tg_op = 'INSERT' or old.stage is distinct from new.stage);
  if going_out then
    if not public.can_approve_marketing(new.client_id) then
      raise exception 'Only an approver can schedule or publish a post.' using errcode = '42501';
    end if;
    if tg_op = 'INSERT' or not exists (
      select 1 from public.mkt_approvals a
       where a.content_id = new.id and a.kind = 'director_approval'
         and a.status = 'approved' and a.version = new.version) then
      raise exception 'This version of the post has not been approved.' using errcode = '23514';
    end if;
    select string_agg(c.title, ', ') into blocked
      from public.mkt_content_checks(new.id) c
     where c.level = 'block'
       and not exists (select 1 from public.mkt_overrides o
                        where o.content_id = new.id and o.check_key = c.check_key and o.version = new.version);
    if blocked is not null then
      raise exception 'Blocked by: %. An approver must override each with a reason first.', blocked
        using errcode = '23514';
    end if;
    if new.stage = 'published' and new.published_at is null then new.published_at := now(); end if;
  end if;
  return new;
end;
$$;
create trigger mkt_content_guard before insert or update on public.mkt_content
  for each row execute function public.guard_mkt_content();

create or replace function public.mkt_record_version()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.version is distinct from old.version then
    insert into public.mkt_content_versions (workspace_id, client_id, content_id, version, title, body, created_by)
    values (new.workspace_id, new.client_id, new.id, new.version, new.title, new.body, auth.uid())
    on conflict (content_id, version) do nothing;
  end if;
  return null;
end;
$$;
create trigger mkt_content_versions_record after insert or update on public.mkt_content
  for each row execute function public.mkt_record_version();

-- An approval decision is on the version it was asked about.
create or replace function public.guard_mkt_approval()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.version := (select version from public.mkt_content where id = new.content_id);
    new.requested_by := auth.uid();
    new.decided_by := null;
    new.decided_at := null;
  elsif new.status is distinct from old.status then
    new.decided_by := auth.uid();
    new.decided_at := now();
    new.version := old.version;
  end if;
  return new;
end;
$$;
create trigger mkt_approvals_guard before insert or update on public.mkt_approvals
  for each row execute function public.guard_mkt_approval();

-- ===========================================================================
-- 4. History, visible only to the people who can see marketing
-- ===========================================================================

create or replace function public.mkt_record_change()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  noun text;
  label text;
begin
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'updated_at') = (to_jsonb(old) - 'updated_at') then
    return null;
  end if;
  noun := case tg_table_name
    when 'mkt_campaigns' then 'Campaign' when 'mkt_content' then 'Post'
    when 'mkt_assets' then 'Brand asset' when 'mkt_consents' then 'Consent'
    when 'mkt_brand_kits' then 'Brand kit' when 'mkt_approvals' then 'Approval'
    when 'mkt_overrides' then 'Check overridden' when 'client_marketing_access' then 'Marketing access'
    else tg_table_name end;
  label := coalesce(nullif(rec ->> 'name', ''), nullif(rec ->> 'title', ''), nullif(rec ->> 'party', ''),
                    nullif(rec ->> 'kind', ''), nullif(rec ->> 'check_key', ''), nullif(rec ->> 'level', ''), '');
  insert into public.audit_events
    (workspace_id, actor_id, actor_name, event_type, entity_type, entity_id, summary, metadata)
  values ((rec ->> 'workspace_id')::uuid, auth.uid(), public.actor_label(),
          'marketing.' || regexp_replace(tg_table_name, '^(mkt_|client_marketing_)', '') || '.' || lower(tg_op),
          'marketing', (rec ->> 'client_id')::uuid,
          noun || ' ' || case tg_op when 'INSERT' then 'added' when 'DELETE' then 'removed' else 'changed' end
            || case when label <> '' then ': ' || label else '' end,
          jsonb_build_object('record_id', rec ->> 'id', 'stage', rec ->> 'stage', 'status', rec ->> 'status',
                             'reason', rec ->> 'reason'));
  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['mkt_brand_kits','mkt_assets','mkt_consents','mkt_campaigns','mkt_content',
                           'mkt_approvals','mkt_overrides','client_marketing_access'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.mkt_record_change()',
                   t || '_history', t);
  end loop;
end $$;

create or replace function public.audit_event_visible(_matter uuid, _research uuid, _workspace uuid, _entity_type text, _entity_id uuid, _event text, _actor uuid)
returns boolean language plpgsql stable security definer set search_path = public
as $$
declare subject uuid; verdict boolean;
begin
  if _matter is not null then return public.is_matter_member(_matter); end if;
  subject := coalesce(_research, case when _entity_type='research_matter' then _entity_id end);
  if subject is not null then
    verdict := public.is_research_member(subject);
    return coalesce(verdict, _actor = auth.uid());
  end if;
  if _entity_type in ('playbook','precedent','template') and _entity_id is not null then
    return public.can_use_knowledge(_entity_type, _entity_id) or _actor = auth.uid();
  end if;
  if _entity_type = 'team' and _workspace is not null then
    return public.is_workspace_member(_workspace);
  end if;
  -- A client's marketing is seen only by the people its owner lets in.
  if _entity_type = 'marketing' then
    return _entity_id is not null and public.can_see_marketing(_entity_id);
  end if;
  -- Created, renamed, archived: facts about the register, never about work.
  -- Anything filed under a client carries its matter and is judged above.
  if _entity_type = 'client' and _workspace is not null then
    return public.is_workspace_member(_workspace);
  end if;
  if _workspace is not null and _event = any (array[
       'workspace.invite_created','workspace.invite_accepted','workspace.invite_revoked',
       'workspace.renamed','workspace.firm_created','workspace.register_viewed']) then
    return public.is_workspace_member(_workspace);
  end if;
  return _actor = auth.uid();
end;
$$;

-- ===========================================================================
-- 5. Marketing files
-- ===========================================================================

create or replace function public.can_read_storage_path(_name text)
returns boolean language plpgsql stable security definer set search_path = public
as $$
declare parts text[] := storage.foldername(_name); ws uuid; seg2 text; flow uuid; client uuid;
begin
  if array_length(parts,1) is null or array_length(parts,1) < 2 then return false; end if;
  begin ws := parts[1]::uuid; exception when others then return false; end;
  seg2 := parts[2];
  if seg2 ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return public.is_matter_member(seg2::uuid);
  end if;
  if seg2 = 'personal' then
    return array_length(parts,1) >= 3 and parts[3] = auth.uid()::text;
  end if;
  if seg2 = 'flows' then
    if array_length(parts,1) < 3 then return false; end if;
    begin flow := parts[3]::uuid; exception when others then return false; end;
    return exists (select 1 from public.matter_flows f where f.id = flow and f.workspace_id = ws)
       and public.is_flow_member(flow);
  end if;
  if seg2 in ('clients', 'marketing') then
    if array_length(parts,1) < 3 then return false; end if;
    begin client := parts[3]::uuid; exception when others then return false; end;
    if not exists (select 1 from public.clients c where c.id = client and c.workspace_id = ws) then
      return false;
    end if;
    return case when seg2 = 'marketing' then public.can_see_marketing(client)
                else public.is_workspace_member(ws) end;
  end if;
  return public.is_workspace_member(ws);
end;
$$;

create or replace function public.can_write_storage_path(_name text)
returns boolean language plpgsql stable security definer set search_path = public
as $$
declare parts text[] := storage.foldername(_name); ws uuid; seg2 text; flow uuid; client uuid;
begin
  if array_length(parts,1) is null or array_length(parts,1) < 2 then return false; end if;
  begin ws := parts[1]::uuid; exception when others then return false; end;
  seg2 := parts[2];
  if seg2 ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return public.can_write_matter(seg2::uuid);
  end if;
  if seg2 = 'personal' then
    return array_length(parts,1) >= 3 and parts[3] = auth.uid()::text;
  end if;
  if seg2 = 'flows' then
    if array_length(parts,1) < 3 then return false; end if;
    begin flow := parts[3]::uuid; exception when others then return false; end;
    return exists (select 1 from public.matter_flows f where f.id = flow and f.workspace_id = ws)
       and public.can_write_flow(flow);
  end if;
  if seg2 in ('clients', 'marketing') then
    if array_length(parts,1) < 3 then return false; end if;
    begin client := parts[3]::uuid; exception when others then return false; end;
    if not exists (select 1 from public.clients c where c.id = client and c.workspace_id = ws) then
      return false;
    end if;
    return case when seg2 = 'marketing' then public.can_see_marketing(client)
                else public.can_write_workspace(ws) end;
  end if;
  return public.can_write_workspace(ws);
end;
$$;

-- ===========================================================================
-- 6. Deleting a client
-- ===========================================================================

create or replace function public.guard_client_bin()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.deleted_at is distinct from old.deleted_at and not public.is_client_owner(old.id) then
    raise exception 'Only the person who created this client can delete or restore it.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger clients_guard_bin before update of deleted_at on public.clients
  for each row execute function public.guard_client_bin();

create policy "owners delete clients" on public.clients for delete to authenticated
  using (public.is_client_owner(id));

-- Deleting for good keeps the work and unfiles it.
alter table public.matters drop constraint matters_client_fk;
alter table public.matters add constraint matters_client_fk
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id) on delete set null (client_id);
alter table public.matter_flows drop constraint matter_flows_client_fk;
alter table public.matter_flows add constraint matter_flows_client_fk
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id) on delete set null (client_id);
alter table public.tasks drop constraint tasks_client_fk;
alter table public.tasks add constraint tasks_client_fk
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id) on delete set null (client_id);
-- The client's own documents are the client's records and go with it.
alter table public.documents drop constraint documents_client_fk;
alter table public.documents add constraint documents_client_fk
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id) on delete cascade;

create or replace function public.purge_recently_deleted()
returns integer language plpgsql security definer set search_path = public
as $$
declare t text; removed integer := 0; n integer; ws uuid;
  cut timestamptz := now() - make_interval(days => public.recently_deleted_days());
begin
  for ws in select m.workspace_id from public.workspace_members m
             where m.user_id = auth.uid() and m.role in ('owner','admin') loop
    foreach t in array array['matters','documents','playbooks','templates','corporate_documents',
                             'research_matters','flow_presets','flow_preset_families','precedents',
                             'contract_drafts','matter_flows','clients'] loop
      if t = 'documents' then
        execute 'delete from public.documents d where d.deleted_at is not null and d.deleted_at < $1'
              || ' and (exists (select 1 from public.matters m where m.id = d.matter_id and m.workspace_id = $2)'
              || '      or (d.matter_id is null and d.workspace_id = $2))'
          using cut, ws;
      else
        execute format('delete from public.%I where deleted_at is not null and deleted_at < $1 and workspace_id = $2', t)
          using cut, ws;
      end if;
      get diagnostics n = row_count;
      removed := removed + n;
    end loop;
  end loop;
  return removed;
end;
$$;

-- ===========================================================================
-- 7. Function hardening
-- ===========================================================================

DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig,
           pg_catalog.pg_get_function_result(p.oid) = 'trigger' AS is_trigger
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('is_client_owner', 'marketing_level', 'can_see_marketing', 'can_approve_marketing',
                         'guard_mkt_asset', 'mkt_content_checks', 'guard_mkt_content', 'mkt_record_version',
                         'guard_mkt_approval', 'mkt_record_change', 'audit_event_visible',
                         'can_read_storage_path', 'can_write_storage_path', 'guard_client_bin',
                         'purge_recently_deleted')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, public', f.sig);
    IF f.is_trigger THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', f.sig);
    ELSE
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
    END IF;
  END LOOP;
END $$;
