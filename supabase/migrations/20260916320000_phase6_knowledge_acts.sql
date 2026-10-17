-- PHASE 6, STEP 3: the deliberate acts, and what may be said about them.
--
-- Sharing, changing visibility and approving are the three things a lawyer
-- DOES to knowledge, as opposed to writing it. Each is a function rather than
-- a column the client sets, for the reason Phase 5 gave about settlement: the
-- right to do a thing and the act of doing it should be decided in the same
-- place, by the same code, every time.

-- ---------------------------------------------------------------------------
-- 1. Sharing with a person
-- ---------------------------------------------------------------------------

create or replace function public.share_knowledge(_kind text, _id uuid, _with uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare ws uuid;
begin
  ws := public.knowledge_workspace(_kind, _id);
  if ws is null or not public.can_write_knowledge(_kind, _id) then
    raise exception 'That is not yours to share.' using errcode = '42501';
  end if;
  -- With people in the firm. Phase 6 does not invite anybody, and sharing is
  -- deliberately NOT tied to matter membership: knowledge access and matter
  -- access are different things, which is the whole premise of the phase.
  if not exists (select 1 from public.workspace_members m
                  where m.workspace_id = ws and m.user_id = _with) then
    raise exception 'You can only share with people in this workspace.' using errcode = '42501';
  end if;
  if _with = auth.uid() then
    raise exception 'It is already yours.' using errcode = '22023';
  end if;

  insert into public.knowledge_shares (kind, object_id, subject_type, subject_id, workspace_id, shared_by)
  values (_kind, _id, 'user', _with, ws, auth.uid())
  on conflict (kind, object_id, subject_type, subject_id) do nothing;

  insert into public.audit_events
    (workspace_id, actor_id, actor_name, event_type, entity_type, entity_id, summary, metadata)
  values (ws, auth.uid(),
          coalesce((select coalesce(p.full_name, p.email) from public.profiles p where p.id = auth.uid()), 'Unknown'),
          'knowledge.shared', _kind, _id, 'Shared', jsonb_build_object('with', _with));
end;
$$;

create or replace function public.unshare_knowledge(_kind text, _id uuid, _with uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare ws uuid;
begin
  ws := public.knowledge_workspace(_kind, _id);
  if ws is null or not public.can_write_knowledge(_kind, _id) then
    raise exception 'That is not yours to share.' using errcode = '42501';
  end if;
  delete from public.knowledge_shares
   where kind = _kind and object_id = _id and subject_type = 'user' and subject_id = _with;
  insert into public.audit_events
    (workspace_id, actor_id, actor_name, event_type, entity_type, entity_id, summary, metadata)
  values (ws, auth.uid(),
          coalesce((select coalesce(p.full_name, p.email) from public.profiles p where p.id = auth.uid()), 'Unknown'),
          'knowledge.share_removed', _kind, _id, 'Share removed', jsonb_build_object('with', _with));
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Changing who can see it
-- ---------------------------------------------------------------------------

create or replace function public.set_knowledge_visibility(
  _kind text, _id uuid, _visibility public.knowledge_visibility)
returns void language plpgsql security definer set search_path = public
as $$
declare ws uuid; was public.knowledge_visibility; tbl text;
begin
  ws := public.knowledge_workspace(_kind, _id);
  if ws is null or not public.can_write_knowledge(_kind, _id) then
    raise exception 'That is not yours to change.' using errcode = '42501';
  end if;
  tbl := case _kind when 'playbook' then 'playbooks' when 'precedent' then 'precedents' else 'templates' end;
  execute format('select visibility from public.%I where id=$1', tbl) into was using _id;
  if was = _visibility then return; end if;

  -- NARROWING DROPS THE APPROVAL.
  --
  -- Approved firm knowledge is the firm's own position. Something no longer
  -- available to the firm is not the firm's position on anything, and leaving
  -- the approval attached would let it be made firm-wide again later still
  -- wearing an approval nobody re-made.
  execute format(
    'update public.%I set visibility = $1,
            approved_at = case when $1 = ''firm'' then approved_at else null end,
            approved_by = case when $1 = ''firm'' then approved_by else null end
      where id = $2', tbl) using _visibility, _id;

  insert into public.audit_events
    (workspace_id, actor_id, actor_name, event_type, entity_type, entity_id, summary, metadata)
  values (ws, auth.uid(),
          coalesce((select coalesce(p.full_name, p.email) from public.profiles p where p.id = auth.uid()), 'Unknown'),
          'knowledge.visibility_changed', _kind, _id, format('%s to %s', was, _visibility),
          jsonb_build_object('from', was, 'to', _visibility));
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Approval
-- ---------------------------------------------------------------------------
--
-- APPROVAL AUTHORITY IS OWNER OR ADMIN, and that is derived from the existing
-- model rather than invented for this phase: playbooks and their rules have
-- been admin-governed since Phase 1. A `lawyer` may write firm knowledge and is
-- not thereby somebody who may declare it authoritative — the same distinction
-- Phase 5 drew between writing a clause and settling another lawyer's wording.

create or replace function public.approve_knowledge(_kind text, _id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare ws uuid; tbl text; vis public.knowledge_visibility;
begin
  ws := public.knowledge_workspace(_kind, _id);
  if ws is null then raise exception 'That is unavailable.' using errcode = '42501'; end if;
  if not public.can_approve_knowledge(_kind, _id) then
    raise exception 'Approving firm knowledge is for an owner or admin of the workspace. Being able to edit it is not the same thing.'
      using errcode = '42501';
  end if;
  tbl := case _kind when 'playbook' then 'playbooks' when 'precedent' then 'precedents' else 'templates' end;
  execute format('select visibility from public.%I where id=$1', tbl) into vis using _id;

  -- There is no such thing as approved private knowledge.
  if vis is distinct from 'firm' then
    raise exception 'Only firm-wide knowledge can be approved. Make it available to the firm first.'
      using errcode = '22023';
  end if;

  -- clock_timestamp(), so an amendment in the same transaction is strictly
  -- later than the approval it invalidates. See the model migration.
  execute format('update public.%I set approved_at = clock_timestamp(), approved_by = auth.uid() where id=$1', tbl)
    using _id;

  insert into public.audit_events
    (workspace_id, actor_id, actor_name, event_type, entity_type, entity_id, summary)
  values (ws, auth.uid(),
          coalesce((select coalesce(p.full_name, p.email) from public.profiles p where p.id = auth.uid()), 'Unknown'),
          'knowledge.approved', _kind, _id, 'Approved as firm knowledge');
  return jsonb_build_object('approved', true);
end;
$$;

create or replace function public.withdraw_knowledge_approval(_kind text, _id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare ws uuid; tbl text;
begin
  ws := public.knowledge_workspace(_kind, _id);
  if ws is null or not public.can_approve_knowledge(_kind, _id) then
    raise exception 'That approval is not yours to withdraw.' using errcode = '42501';
  end if;
  tbl := case _kind when 'playbook' then 'playbooks' when 'precedent' then 'precedents' else 'templates' end;
  execute format('update public.%I set approved_at = null, approved_by = null where id=$1', tbl) using _id;
  insert into public.audit_events
    (workspace_id, actor_id, actor_name, event_type, entity_type, entity_id, summary)
  values (ws, auth.uid(),
          coalesce((select coalesce(p.full_name, p.email) from public.profiles p where p.id = auth.uid()), 'Unknown'),
          'knowledge.approval_withdrawn', _kind, _id, 'Approval withdrawn');
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. What the caller may do, answered by the deciding functions
-- ---------------------------------------------------------------------------

create or replace function public.knowledge_context(_kind text, _id uuid)
returns table (may_write boolean, may_approve boolean, is_owner boolean,
               visibility public.knowledge_visibility, approved boolean, shared_with integer)
language plpgsql stable security definer set search_path = public
as $$
declare tbl text; v public.knowledge_visibility; a timestamptz; c timestamptz; ws uuid;
begin
  ws := public.knowledge_workspace(_kind, _id);
  if ws is null or not public.is_workspace_member(ws) then return; end if;
  tbl := case _kind when 'playbook' then 'playbooks' when 'precedent' then 'precedents' else 'templates' end;
  execute format('select visibility, approved_at, content_changed_at from public.%I where id=$1', tbl)
    into v, a, c using _id;
  return query select
    public.can_write_knowledge(_kind, _id),
    public.can_approve_knowledge(_kind, _id),
    public.knowledge_owner(_kind, _id) = auth.uid(),
    v,
    public.knowledge_approved(a, c),
    (select count(*)::integer from public.knowledge_shares s
      where s.kind = _kind and s.object_id = _id and s.subject_type = 'user');
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Provenance, told to the extent the caller may hear it
-- ---------------------------------------------------------------------------
--
-- SECURITY DEFINER, because the columns it reads are revoked from
-- `authenticated` on purpose — that is the gate. Which means RLS cannot make
-- the entitlement check and it has to be made here, explicitly, before
-- anything is read. A reporting function must not outrank its caller; this one
-- asks exactly the question the caller's own policy would have asked.
--
-- The first version was SECURITY INVOKER and could not read the columns it
-- exists to protect. The suite found it immediately.

create or replace function public.precedent_provenance(_precedent uuid)
returns table (derived boolean, may_see_source boolean, matter_id uuid,
               matter_name text, matter_reference text, document_id uuid, clause_id uuid,
               source_note text, source_kind text, used_at date)
language plpgsql stable security definer set search_path = public
as $$
declare p record;
begin
  select pr.matter_id, pr.document_id, pr.clause_id, pr.source_note, pr.source_kind, pr.used_at,
         pr.workspace_id, pr.visibility, coalesce(pr.owner_id, pr.created_by) as owner
    into p from public.precedents pr where pr.id = _precedent;
  if not found then return; end if;

  if not public.knowledge_visible(p.workspace_id, p.visibility, p.owner, 'precedent', _precedent) then
    return;  -- Indistinguishable from a precedent that does not exist.
  end if;

  if p.matter_id is null then
    return query select false, true, null::uuid, null::text, null::text,
                        p.document_id, p.clause_id, p.source_note, p.source_kind, p.used_at;
    return;
  end if;

  if public.is_matter_member(p.matter_id) then
    return query
      select true, true, p.matter_id,
             (select m.name from public.matters m where m.id = p.matter_id),
             (select m.reference from public.matters m where m.id = p.matter_id),
             p.document_id, p.clause_id, p.source_note, p.source_kind, p.used_at;
  else
    -- Derived from prior work, and not one word more.
    return query select true, false, null::uuid, null::text, null::text,
                        null::uuid, null::uuid, null::text, null::text, null::date;
  end if;
end;
$$;

comment on function public.precedent_provenance(uuid) is
  'Where a precedent came from, told to the extent the caller is entitled to hear it. Somebody on the source matter gets the matter; everybody else gets "derived from prior work" and no identifiers at all. Provenance visibility never exceeds source visibility.';

-- ---------------------------------------------------------------------------
-- 6. AUDIT VISIBILITY <= KNOWLEDGE VISIBILITY
-- ---------------------------------------------------------------------------
--
-- `audit_event_visible()` fails closed: a workspace event is visible only if
-- its event type is on an explicit allow-list, and everything else falls
-- through to "only the actor sees it". So Phase 6's knowledge events were
-- invisible to the very people they are about.
--
-- Adding them to that allow-list would have been the wrong fix. "Mawusi shared
-- a precedent with Podrick", announced to the whole firm, tells everybody that
-- a private object exists and who has it. So knowledge events are tied to the
-- OBJECT instead: whoever may use the knowledge may read its history, and the
-- fact that it exists stays with the people entitled to know it does.

create or replace function public.can_use_knowledge(_kind text, _id uuid)
returns boolean language plpgsql stable security definer set search_path = public
as $$
declare tbl text; ws uuid; v public.knowledge_visibility; owner uuid;
begin
  if _kind not in ('playbook', 'precedent', 'template') or _id is null then return false; end if;
  tbl := case _kind when 'playbook' then 'playbooks' when 'precedent' then 'precedents' else 'templates' end;
  execute format('select workspace_id, visibility, coalesce(owner_id, created_by) from public.%I where id=$1', tbl)
    into ws, v, owner using _id;
  if ws is null then return false; end if;
  return public.knowledge_visible(ws, v, owner, _kind, _id);
end;
$$;

create or replace function public.audit_event_visible(_matter uuid, _research uuid, _workspace uuid,
  _entity_type text, _entity_id uuid, _event text, _actor uuid)
returns boolean language plpgsql stable security definer set search_path = public
as $$
declare subject uuid; verdict boolean;
begin
  if _matter is not null then return public.is_matter_member(_matter); end if;
  subject := coalesce(_research, case when _entity_type = 'research_matter' then _entity_id end);
  if subject is not null then
    verdict := public.is_research_member(subject);
    return coalesce(verdict, _actor = auth.uid());
  end if;
  if _entity_type in ('playbook', 'precedent', 'template') and _entity_id is not null then
    return public.can_use_knowledge(_entity_type, _entity_id) or _actor = auth.uid();
  end if;
  if _workspace is not null and _event = any (array[
       'workspace.invite_created','workspace.invite_accepted','workspace.invite_revoked',
       'workspace.renamed','workspace.firm_created','workspace.register_viewed']) then
    return public.is_workspace_member(_workspace);
  end if;
  return _actor = auth.uid();
end;
$$;
