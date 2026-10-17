-- Clients, and work that can be organised after it has begun.
--
-- The relationship Scripta should hold is Client → Matter → Flow, but it must
-- not be a creation sequence. A lawyer who does not yet know whose work this
-- is, or which file it belongs in, should still be able to capture it. So:
--
--   a matter MAY name a client                      matters.client_id
--   a flow  MAY belong to a matter, or to a client  matter_flows.matter_id / client_id
--   a task  MAY belong to a client                  tasks.client_id
--
-- and every one of those links can be made later without recreating the thing.
--
-- ---------------------------------------------------------------------------
-- ONE PATH TO A CLIENT, NEVER TWO
-- ---------------------------------------------------------------------------
--
-- A flow filed to a matter reaches its client THROUGH the matter. A task filed
-- to a matter, or raised from a flow deliverable, reaches it through that. A
-- row holds `client_id` only when nothing more specific does, and the database
-- enforces it: two stored answers to "whose work is this" is how they come to
-- disagree.
--
-- ---------------------------------------------------------------------------
-- A CLIENT GRANTS NOTHING
-- ---------------------------------------------------------------------------
--
-- Matter membership stays the confidentiality boundary. No policy anywhere
-- reads `client_id` to decide whether somebody may open anything. The client
-- RECORD is firm business, readable by the firm like its teams and its
-- register; what is filed under it is readable only by the route that already
-- governed it. A client page therefore shows each person exactly the matters,
-- flows and tasks they could already open, and counts nothing else.
--
-- ---------------------------------------------------------------------------
-- A FLOW WITH NO MATTER IS ITS AUTHOR'S
-- ---------------------------------------------------------------------------
--
-- `matter_flows.matter_id` becomes nullable. Every flow policy and predicate
-- read `is_matter_member(matter_id)`, which is false for null, so the naive
-- change would not leak — it would lock the author out of their own flow. The
-- rule is the one Phase 3c settled for unfiled work, as a CASE and never an OR:
-- filed → the matter decides; unfiled → the author alone. Once filed, authorship
-- stops counting, and a filed flow cannot be unfiled.

-- ===========================================================================
-- 1. Clients
-- ===========================================================================

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  kind text not null default 'organisation' check (kind in ('organisation', 'individual')),
  reference text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  -- Present so a client reads like every other put-aside collection. Clients
  -- are archived, not deleted: deleting one would mean unfiling matters the
  -- person deleting it may not be allowed to see.
  deleted_at timestamptz,
  constraint clients_workspace_id_id_key unique (workspace_id, id)
);

create index clients_workspace_name_idx on public.clients (workspace_id, lower(name));

create trigger clients_updated_at before update on public.clients
  for each row execute function public.set_updated_at();
create trigger clients_stamp_author before insert on public.clients
  for each row execute function public.stamp_created_by();

alter table public.clients enable row level security;
grant select, insert, update on public.clients to authenticated;
grant all on public.clients to service_role;

create policy "members read clients" on public.clients for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy "writers insert clients" on public.clients for insert to authenticated
  with check (public.can_write_workspace(workspace_id));
create policy "writers update clients" on public.clients for update to authenticated
  using (public.can_write_workspace(workspace_id))
  with check (public.can_write_workspace(workspace_id));
-- No delete policy: see `deleted_at` above.

-- ===========================================================================
-- 2. The links
-- ===========================================================================

-- Composite keys, so a link can never cross a workspace: a matter in one firm
-- cannot name a client held by another.
alter table public.matters add column client_id uuid;
alter table public.matters add constraint matters_client_fk
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id);
create index matters_client_idx on public.matters (client_id) where client_id is not null;

alter table public.matter_flows alter column matter_id drop not null;
-- A matter may now carry more than one flow: filing a standalone flow into a
-- matter that already has one is organising work, and refusing it would make
-- the lawyer choose which work to throw away.
alter table public.matter_flows drop constraint matter_flows_matter_key;
alter table public.matter_flows
  -- What a flow is called when no matter names it.
  add column name text,
  add column client_id uuid,
  add column archived_at timestamptz,
  add column deleted_at timestamptz;
alter table public.matter_flows add constraint matter_flows_client_fk
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id);
alter table public.matter_flows add constraint matter_flows_one_path_to_client
  check (matter_id is null or client_id is null);
create index matter_flows_client_idx on public.matter_flows (client_id) where client_id is not null;
create trigger matter_flows_stamp_author before insert on public.matter_flows
  for each row execute function public.stamp_created_by();

alter table public.tasks add column client_id uuid;
alter table public.tasks add constraint tasks_client_fk
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id);
alter table public.tasks add constraint tasks_one_path_to_client
  check (client_id is null or (matter_id is null and flow_deliverable_id is null));
create index tasks_client_idx on public.tasks (client_id) where client_id is not null;

-- ===========================================================================
-- 3. Flow access: the matter where there is one, the author where there is not
-- ===========================================================================

create or replace function public.is_flow_member(_flow_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce((
    select case when f.matter_id is not null then public.is_matter_member(f.matter_id)
                else f.created_by = auth.uid() end
      from public.matter_flows f where f.id = _flow_id), false);
$$;

create or replace function public.can_write_flow(_flow_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce((
    select case when f.matter_id is not null then public.can_write_matter(f.matter_id)
                else f.created_by = auth.uid() end
      from public.matter_flows f where f.id = _flow_id), false);
$$;

-- Versions, evidence, threads and emails hang off the deliverable, so they ask
-- the deliverable's flow rather than its matter, which may not exist.
create or replace function public.is_deliverable_member(_deliverable_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_flow_member((select flow_id from public.flow_deliverables where id = _deliverable_id)); $$;

create or replace function public.can_write_deliverable(_deliverable_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.can_write_flow((select flow_id from public.flow_deliverables where id = _deliverable_id)); $$;

drop policy if exists "members read matter_flows" on public.matter_flows;
create policy "members read matter_flows" on public.matter_flows for select to authenticated
  using (case when matter_id is not null then public.is_matter_member(matter_id)
              else created_by = auth.uid() end);

drop policy if exists "writers insert matter_flows" on public.matter_flows;
create policy "writers insert matter_flows" on public.matter_flows for insert to authenticated
  with check (case when matter_id is not null then public.can_write_matter(matter_id)
                   else created_by = auth.uid() and public.is_workspace_member(workspace_id) end);

drop policy if exists "writers update matter_flows" on public.matter_flows;
create policy "writers update matter_flows" on public.matter_flows for update to authenticated
  using (case when matter_id is not null then public.can_write_matter(matter_id)
              else created_by = auth.uid() end)
  with check (case when matter_id is not null then public.can_write_matter(matter_id)
                   else created_by = auth.uid() and public.is_workspace_member(workspace_id) end);

drop policy if exists "writers delete matter_flows" on public.matter_flows;
create policy "writers delete matter_flows" on public.matter_flows for delete to authenticated
  using (case when matter_id is not null then public.can_write_matter(matter_id)
              else created_by = auth.uid() end);

-- Files attached in a flow that has no matter go under `<ws>/flows/<flow>/`,
-- and the flow decides who may open them. When the flow is filed, the same
-- path starts answering to the matter without a single object being moved.
create or replace function public.can_read_storage_path(_name text)
returns boolean language plpgsql stable security definer set search_path = public
as $$
declare parts text[] := storage.foldername(_name); ws uuid; seg2 text; flow uuid;
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
  return public.is_workspace_member(ws);
end;
$$;

create or replace function public.can_write_storage_path(_name text)
returns boolean language plpgsql stable security definer set search_path = public
as $$
declare parts text[] := storage.foldername(_name); ws uuid; seg2 text; flow uuid;
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
  return public.can_write_workspace(ws);
end;
$$;

-- ===========================================================================
-- 4. Keeping the links honest
-- ===========================================================================

create or replace function public.actor_label()
returns text language sql stable security definer set search_path = public
as $$ select coalesce((select coalesce(p.full_name, p.email) from public.profiles p where p.id = auth.uid()), 'Unknown'); $$;

-- Filing a flow. Checked before the row is written, so a refusal names nothing
-- the caller could not already see.
create or replace function public.guard_flow_filing()
returns trigger language plpgsql security definer set search_path = public
as $$
declare matter_ws uuid; matter_client uuid;
begin
  if tg_op = 'UPDATE' and old.matter_id is not null
     and new.matter_id is distinct from old.matter_id then
    raise exception 'A flow filed to a matter stays with that matter.' using errcode = '42501';
  end if;
  -- A filed flow moves with its matter (move_matter_to_workspace). An unfiled
  -- one does not move at all: its phases and deliverables carry the workspace
  -- too, and nothing would take them along.
  if tg_op = 'UPDATE' and old.matter_id is null
     and new.workspace_id is distinct from old.workspace_id then
    raise exception 'A flow that is not filed to a matter cannot change workspace.' using errcode = '42501';
  end if;
  if new.matter_id is not null and (tg_op = 'INSERT' or old.matter_id is null) then
    if not public.can_write_matter(new.matter_id) then
      raise exception 'That matter is unavailable.' using errcode = '42501';
    end if;
    select workspace_id, client_id into matter_ws, matter_client
      from public.matters where id = new.matter_id;
    if matter_ws is distinct from new.workspace_id then
      raise exception 'That matter is in another workspace.' using errcode = '22023';
    end if;
    if new.client_id is not null and matter_client is not null
       and matter_client <> new.client_id then
      raise exception 'That matter is filed under a different client. Change the flow''s client or the matter''s first.'
        using errcode = '22023';
    end if;
    -- The matter answers for the client from here on.
    new.client_id := null;
  end if;
  return new;
end;
$$;

create trigger matter_flows_guard_filing before insert or update on public.matter_flows
  for each row execute function public.guard_flow_filing();

-- What filing carries with it. Runs as definer because tasks raised from the
-- flow must follow it into the matter even where they are not the caller's;
-- the guard above has already established the caller may write that matter.
create or replace function public.after_flow_filed()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if old.matter_id is null and new.matter_id is not null then
    -- A client the flow was organised under becomes the matter's, where the
    -- matter had none. Where it had one, the guard refused a different one.
    if old.client_id is not null then
      update public.matters set client_id = old.client_id
       where id = new.matter_id and client_id is null;
    end if;
    update public.tasks set matter_id = new.matter_id
     where matter_id is null
       and flow_deliverable_id in (select id from public.flow_deliverables where flow_id = new.id);
    insert into public.audit_events
      (matter_id, actor_id, actor_name, event_type, entity_type, entity_id, summary, metadata)
    values (new.matter_id, auth.uid(), public.actor_label(), 'flow.filed', 'flow', new.id,
            format('Flow filed to this matter: %s', coalesce(nullif(btrim(new.name), ''), 'Untitled flow')),
            jsonb_build_object('flow', new.id, 'client', old.client_id));
  end if;
  return new;
end;
$$;

create trigger matter_flows_after_filed after update of matter_id on public.matter_flows
  for each row execute function public.after_flow_filed();

-- A task reaches its matter through its deliverable when it has one, and holds
-- a client only when nothing more specific does.
create or replace function public.task_file_context()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.flow_deliverable_id is not null then
    new.matter_id := public.deliverable_matter(new.flow_deliverable_id);
  end if;
  if new.matter_id is not null or new.flow_deliverable_id is not null then
    new.client_id := null;
  end if;
  return new;
end;
$$;

create trigger tasks_file_context before insert or update on public.tasks
  for each row execute function public.task_file_context();

-- `matters.client` stays the display name everything already reads — exports,
-- the cover page, Scripta's context — and follows the client record. The text
-- a matter was opened under is kept in the audit event written when it was
-- linked, so nothing that was typed is lost.
create or replace function public.matter_client_name()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.client_id is not null
     and (tg_op = 'INSERT' or new.client_id is distinct from old.client_id) then
    new.client := (select name from public.clients where id = new.client_id);
  end if;
  return new;
end;
$$;

create trigger matters_client_name before insert or update of client_id on public.matters
  for each row execute function public.matter_client_name();

create or replace function public.audit_matter_client()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.client_id is not distinct from old.client_id then return new; end if;
  insert into public.audit_events
    (matter_id, actor_id, actor_name, event_type, entity_type, entity_id, summary, metadata)
  values (new.id, auth.uid(), public.actor_label(), 'matter.client_changed', 'matter', new.id,
          case when new.client_id is null then 'Client removed from this matter'
               else format('Filed under %s', (select name from public.clients where id = new.client_id)) end,
          jsonb_build_object('from', old.client_id, 'to', new.client_id));
  return new;
end;
$$;

create trigger matters_audit_client after update of client_id on public.matters
  for each row execute function public.audit_matter_client();

create or replace function public.client_renamed()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.name is distinct from old.name then
    update public.matters set client = new.name where client_id = new.id;
  end if;
  return new;
end;
$$;

create trigger clients_renamed after update of name on public.clients
  for each row execute function public.client_renamed();

-- ===========================================================================
-- 5. Activity on the client record itself is firm business
-- ===========================================================================

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
-- 6. Moving between workspaces, and the bin
-- ===========================================================================

-- A client belongs to the firm it was recorded in. A matter moved to another
-- workspace leaves its client behind; `matters.client` keeps the name as text.
create or replace function public.move_matter_to_workspace(_matter uuid, _to uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare src uuid; n integer;
begin
  select workspace_id into src from public.matters where id = _matter;
  if src is null then raise exception 'That matter is unavailable.' using errcode='42501'; end if;
  if _to is null or not exists (select 1 from public.workspaces w where w.id=_to) then
    raise exception 'That workspace does not exist.' using errcode='42501'; end if;
  if src = _to then raise exception 'That matter is already in that workspace.' using errcode='22023'; end if;
  if not public.can_admin_workspace(src) then
    raise exception 'Only an owner or admin of the workspace a matter is in can move it out.' using errcode='42501'; end if;
  if not public.can_admin_workspace(_to) then
    raise exception 'You can only move a matter into a workspace you administer.' using errcode='42501'; end if;

  perform set_config('scripta.moving_matter', _matter::text, true);

  update public.matters set client_id = null where id = _matter and client_id is not null;
  update public.matters set workspace_id=_to where id=_matter;
  update public.matter_flows set workspace_id=_to where matter_id=_matter;
  update public.flow_phases set workspace_id=_to
   where flow_id in (select id from public.matter_flows where matter_id=_matter);
  update public.flow_deliverables set workspace_id=_to
   where flow_id in (select id from public.matter_flows where matter_id=_matter);
  update public.flow_versions set workspace_id=_to
   where deliverable_id in (select d.id from public.flow_deliverables d join public.matter_flows f on f.id=d.flow_id where f.matter_id=_matter);
  update public.flow_evidence set workspace_id=_to
   where deliverable_id in (select d.id from public.flow_deliverables d join public.matter_flows f on f.id=d.flow_id where f.matter_id=_matter);
  update public.flow_threads set workspace_id=_to
   where deliverable_id in (select d.id from public.flow_deliverables d join public.matter_flows f on f.id=d.flow_id where f.matter_id=_matter);
  update public.flow_emails set workspace_id=_to
   where deliverable_id in (select d.id from public.flow_deliverables d join public.matter_flows f on f.id=d.flow_id where f.matter_id=_matter);
  update public.tasks set workspace_id=_to where matter_id=_matter;
  update public.links set workspace_id=_to where matter_id=_matter;
  update public.drafts set workspace_id=_to where matter_id=_matter;
  update public.contract_drafts set workspace_id=_to where matter_id=_matter;
  update public.corporate_documents set workspace_id=_to where matter_id=_matter;
  update public.comments set workspace_id=_to
   where public.comment_matter(entity_kind::text, entity_id)=_matter;
  update public.approvals set workspace_id=_to
   where public.comment_matter(entity_kind::text, entity_id)=_matter;

  insert into public.audit_events
    (matter_id, actor_id, actor_name, event_type, entity_type, entity_id, summary, metadata)
  values (_matter, auth.uid(), public.actor_label(),
          'matter.moved','matter',_matter,
          format('Moved from %s to %s',
                 (select w.name from public.workspaces w where w.id=src),
                 (select w.name from public.workspaces w where w.id=_to)),
          jsonb_build_object('from',src,'to',_to));

  perform set_config('scripta.moving_matter', '', true);

  select count(*)::integer into n from public.matter_flows where matter_id=_matter;
  return jsonb_build_object('from',src,'to',_to,'flows',n);
end;
$$;

create or replace function public.move_task_to_workspace(_task uuid, _to uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare src uuid; filed uuid;
begin
  select workspace_id, matter_id into src, filed from public.tasks where id=_task;
  if src is null then
    raise exception 'That task is unavailable.' using errcode = '42501';
  end if;
  if filed is not null then
    raise exception 'That task belongs to a matter. Move the matter and the task goes with it.' using errcode = '42501';
  end if;
  if src = _to then
    raise exception 'That task is already in that workspace.' using errcode = '22023';
  end if;
  if not public.can_admin_workspace(src) or not public.can_admin_workspace(_to) then
    raise exception 'You can only move a task between workspaces you administer.' using errcode = '42501';
  end if;
  update public.tasks set workspace_id = _to, client_id = null where id = _task;
  return jsonb_build_object('from', src, 'to', _to);
end;
$$;

-- A standalone flow has a bin of its own. A filed flow is put aside with its
-- matter, as before.
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
                             'contract_drafts','matter_flows'] loop
      if t = 'documents' then
        execute 'delete from public.documents d where d.deleted_at is not null and d.deleted_at < $1'
              || ' and exists (select 1 from public.matters m where m.id = d.matter_id and m.workspace_id = $2)'
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
-- 7. The clients Scripta already knows about, from the text on each matter
-- ===========================================================================
--
-- One client per distinct trimmed name per workspace. Exact match only: no
-- case folding, no fuzzy merge, because two names that look alike can be two
-- legal persons. The single merge below was confirmed by Kwame on 14 September
-- 2026 ("Nexis Africa Ghana and Nexis Africa Ghana Ltd are one client"); the
-- record takes the fuller name. A matter with no client text stays unassigned.
-- Nothing else is inferred — not from counterparties, not from matter names,
-- and not for unfiled tasks.
--
-- `matters.updated_at` is left alone: linking a client is filing, not work on
-- the matter, and every matter should not read "updated just now" because of it.

create temp table client_backfill on commit drop as
  select m.id as matter_id, m.workspace_id, m.client as intake_text, m.created_at,
         case when btrim(m.client) = 'Nexis Africa Ghana' then 'Nexis Africa Ghana Ltd'
              else btrim(m.client) end as canonical
    from public.matters m
   where nullif(btrim(m.client), '') is not null;

insert into public.clients (workspace_id, name, created_by, created_at)
select workspace_id, canonical, null, min(created_at)
  from client_backfill group by workspace_id, canonical;

alter table public.matters disable trigger matters_updated_at;
alter table public.matters disable trigger matters_client_name;
alter table public.matters disable trigger matters_audit_client;

update public.matters m
   set client_id = c.id
  from client_backfill b
  join public.clients c on c.workspace_id = b.workspace_id and c.name = b.canonical
 where m.id = b.matter_id;

alter table public.matters enable trigger matters_updated_at;
alter table public.matters enable trigger matters_client_name;
alter table public.matters enable trigger matters_audit_client;

insert into public.audit_events
  (matter_id, actor_id, actor_name, event_type, entity_type, entity_id, summary, metadata)
select b.matter_id, null, 'Scripta', 'matter.client_linked', 'matter', b.matter_id,
       format('Filed under the client record %s', b.canonical),
       jsonb_build_object('client', c.id, 'intake_text', b.intake_text)
  from client_backfill b
  join public.clients c on c.workspace_id = b.workspace_id and c.name = b.canonical;
