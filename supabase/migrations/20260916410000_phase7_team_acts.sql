-- PHASE 7, STEP 2: the acts — management, staffing, sharing.
--
-- Three groups of functions, and the middle one carries the phase's whole
-- architectural decision.

-- ---------------------------------------------------------------------------
-- 1. Managing teams
-- ---------------------------------------------------------------------------
--
-- Owner or admin of the firm, and nobody else. Derived from the existing role
-- model rather than invented: an ordinary lawyer USES teams in selectors and
-- does not restructure the firm's own lists. Phase 6 drew the same line for
-- approving knowledge.

create or replace function public.create_team(_workspace uuid, _name text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare made uuid;
begin
  if not public.can_admin_workspace(_workspace) then
    raise exception 'Only an owner or admin of the workspace can set up teams.' using errcode = '42501';
  end if;
  insert into public.teams (workspace_id, name) values (_workspace, btrim(_name)) returning id into made;
  insert into public.audit_events (workspace_id, actor_id, actor_name, event_type, entity_type, entity_id, summary)
  values (_workspace, auth.uid(),
          coalesce((select coalesce(full_name, email) from public.profiles where id = auth.uid()), 'Unknown'),
          'team.created', 'team', made, format('%s created', btrim(_name)));
  return made;
end;
$$;

-- A rename changes a label and nothing else. Every policy and every share row
-- addresses the id, so nothing about who can reach what moves — which is why
-- no permission predicate anywhere mentions a team NAME.
create or replace function public.rename_team(_team uuid, _name text)
returns void language plpgsql security definer set search_path = public
as $$
declare ws uuid; was text;
begin
  ws := public.team_workspace(_team);
  if ws is null or not public.can_admin_workspace(ws) then
    raise exception 'That team is not yours to change.' using errcode = '42501';
  end if;
  select name into was from public.teams where id = _team;
  update public.teams set name = btrim(_name), updated_at = now() where id = _team;
  insert into public.audit_events (workspace_id, actor_id, actor_name, event_type, entity_type, entity_id, summary, metadata)
  values (ws, auth.uid(),
          coalesce((select coalesce(full_name, email) from public.profiles where id = auth.uid()), 'Unknown'),
          'team.renamed', 'team', _team, format('%s renamed to %s', was, btrim(_name)),
          jsonb_build_object('from', was, 'to', btrim(_name)));
end;
$$;

-- ARCHIVING STOPS A TEAM ADDRESSING ANYBODY, and does nothing else.
--
--   `my_team_ids()` excludes archived teams, so team-derived KNOWLEDGE access
--   stops — which is the behaviour §21 asks for.
--
--   Matter memberships created through it are untouched. They are ordinary
--   matter members now and were from the moment they were created.
--
--   No knowledge is deleted and no share row is removed, so restoring brings
--   the addressing back exactly as it was.
create or replace function public.set_team_archived(_team uuid, _archived boolean)
returns void language plpgsql security definer set search_path = public
as $$
declare ws uuid;
begin
  ws := public.team_workspace(_team);
  if ws is null or not public.can_admin_workspace(ws) then
    raise exception 'That team is not yours to change.' using errcode = '42501';
  end if;
  update public.teams set archived_at = case when _archived then now() else null end,
                          updated_at = now()
   where id = _team;
  insert into public.audit_events (workspace_id, actor_id, actor_name, event_type, entity_type, entity_id, summary)
  values (ws, auth.uid(),
          coalesce((select coalesce(full_name, email) from public.profiles where id = auth.uid()), 'Unknown'),
          case when _archived then 'team.archived' else 'team.restored' end,
          'team', _team,
          format('%s %s', (select name from public.teams where id = _team),
                 case when _archived then 'archived' else 'restored' end));
end;
$$;

create or replace function public.add_team_member(_team uuid, _user uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare ws uuid;
begin
  ws := public.team_workspace(_team);
  if ws is null or not public.can_admin_workspace(ws) then
    raise exception 'Only an owner or admin of the workspace can change a team.' using errcode = '42501';
  end if;
  insert into public.team_members (team_id, user_id) values (_team, _user)
  on conflict (team_id, user_id) do nothing;
  insert into public.audit_events (workspace_id, actor_id, actor_name, event_type, entity_type, entity_id, summary, metadata)
  values (ws, auth.uid(),
          coalesce((select coalesce(full_name, email) from public.profiles where id = auth.uid()), 'Unknown'),
          'team.member_added', 'team', _team,
          format('%s joined %s',
                 coalesce((select coalesce(full_name, email) from public.profiles where id = _user), 'A colleague'),
                 (select name from public.teams where id = _team)),
          jsonb_build_object('user', _user));
end;
$$;

create or replace function public.remove_team_member(_team uuid, _user uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare ws uuid;
begin
  ws := public.team_workspace(_team);
  if ws is null or not public.can_admin_workspace(ws) then
    raise exception 'Only an owner or admin of the workspace can change a team.' using errcode = '42501';
  end if;
  delete from public.team_members where team_id = _team and user_id = _user;
  insert into public.audit_events (workspace_id, actor_id, actor_name, event_type, entity_type, entity_id, summary, metadata)
  values (ws, auth.uid(),
          coalesce((select coalesce(full_name, email) from public.profiles where id = auth.uid()), 'Unknown'),
          'team.member_removed', 'team', _team,
          format('%s left %s',
                 coalesce((select coalesce(full_name, email) from public.profiles where id = _user), 'A colleague'),
                 (select name from public.teams where id = _team)),
          jsonb_build_object('user', _user));
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. STAFFING A MATTER IS A SNAPSHOT
-- ---------------------------------------------------------------------------
--
-- The team is read once, here, and resolved into ordinary `matter_members`
-- rows. Nothing afterwards consults it. Somebody who joins the team next month
-- has not been staffed on anything; somebody who leaves keeps the file they
-- were staffed on. Matter membership stays a deliberate matter-level act,
-- which is the Phase 3 boundary left exactly where it was.
--
-- The alternative — a policy reading "you may open this matter if you are in a
-- team attached to it" — would be a second confidentiality boundary, invisible
-- from the matter's own team screen, changing with an unrelated list.

create or replace function public.preview_team_staffing(_matter uuid, _team uuid)
returns table (user_id uuid, name text, already_member boolean, existing_role public.matter_role)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_matter_member(_matter) then
    raise exception 'That matter is unavailable.' using errcode = '42501';
  end if;
  if public.team_workspace(_team) is distinct from public.matter_workspace(_matter) then
    raise exception 'That team belongs to a different workspace.' using errcode = '42501';
  end if;
  return query
  select tm.user_id, coalesce(p.full_name, p.email, 'Somebody'),
         mm.user_id is not null, mm.role
    from public.team_members tm
    join public.teams t on t.id = tm.team_id and t.archived_at is null
    left join public.profiles p on p.id = tm.user_id
    left join public.matter_members mm on mm.matter_id = _matter and mm.user_id = tm.user_id
   where tm.team_id = _team
   order by 2;
end;
$$;

create or replace function public.staff_matter_from_team(
  _matter uuid, _team uuid, _role public.matter_role)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare added integer := 0; already integer := 0; rec record; team_name text; ws uuid;
begin
  if not public.is_matter_lead(_matter) then
    raise exception 'Only the Lead of this matter may change its team.' using errcode = '42501';
  end if;
  -- One Lead, and handing a matter on is deliberate. A bulk role is never it.
  if _role = 'lead' then
    raise exception 'A matter has one Lead. Add people as Editor, Reviewer or Viewer, then hand the matter on.'
      using errcode = '22023';
  end if;
  ws := public.matter_workspace(_matter);
  select name into team_name from public.teams
   where id = _team and workspace_id = ws and archived_at is null;
  if team_name is null then
    raise exception 'That team is not available in this workspace.' using errcode = '42501';
  end if;

  for rec in select tm.user_id from public.team_members tm where tm.team_id = _team loop
    -- ADDING A TEAM NEVER CHANGES AN EXISTING MEMBER'S ROLE. A Reviewer does
    -- not quietly become an Editor because somebody staffed a team over the
    -- top of them; they are reported back as already there.
    if exists (select 1 from public.matter_members mm
                where mm.matter_id = _matter and mm.user_id = rec.user_id) then
      already := already + 1;
      continue;
    end if;
    insert into public.matter_members (matter_id, user_id, role, added_by, added_via_team)
    values (_matter, rec.user_id, _role, auth.uid(), _team)
    on conflict (matter_id, user_id) do nothing;
    added := added + 1;

    insert into public.audit_events (matter_id, actor_id, actor_name, event_type, entity_type, entity_id, summary, metadata)
    values (_matter, auth.uid(),
            coalesce((select full_name from public.profiles where id = auth.uid()), 'Someone'),
            'matter.member_added', 'matter', _matter,
            coalesce((select coalesce(full_name, email) from public.profiles where id = rec.user_id), 'A colleague')
              || ' joined the matter team as ' || _role::text,
            jsonb_build_object('user', rec.user_id, 'role', _role::text, 'via_team', _team));
  end loop;

  -- One event for the act, on top of the per-person ones, so the matter's
  -- history reads as "the Transactions team was added" rather than as four
  -- unexplained arrivals.
  insert into public.audit_events (matter_id, actor_id, actor_name, event_type, entity_type, entity_id, summary, metadata)
  values (_matter, auth.uid(),
          coalesce((select full_name from public.profiles where id = auth.uid()), 'Someone'),
          'matter.staffed_from_team', 'matter', _matter,
          format('%s added as %s — %s joined, %s already on the matter', team_name, _role, added, already),
          jsonb_build_object('team', _team, 'role', _role::text, 'added', added, 'already', already));

  return jsonb_build_object('added', added, 'already', already, 'team', team_name);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. KNOWLEDGE SHARED WITH A TEAM IS DYNAMIC
-- ---------------------------------------------------------------------------
--
-- "Shared with Transactions" is a statement about a group, not an act
-- performed on whoever was in it that morning. So the access rule LOOKS at
-- team membership every time rather than copying it.
--
-- The branch is added as another `or`, which is what makes access the UNION of
-- valid paths. Somebody with an individual share AND a team share keeps the
-- individual one when they leave the team; somebody reading firm-wide
-- knowledge is unaffected by either. Removing one route never destroys
-- another, because no route was ever written down as a consequence of the
-- others — there is no copied ACL anywhere in this.

create or replace function public.knowledge_visible(
  _workspace uuid, _visibility public.knowledge_visibility, _owner uuid, _kind text, _id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_workspace_member(_workspace)
     and case _visibility
           when 'firm' then true
           when 'private' then _owner is not null and _owner = auth.uid()
           when 'shared' then
             (_owner is not null and _owner = auth.uid())
             or exists (select 1 from public.knowledge_shares s
                         where s.kind = _kind and s.object_id = _id
                           and s.subject_type = 'user' and s.subject_id = auth.uid())
             or exists (select 1 from public.knowledge_shares s
                         where s.kind = _kind and s.object_id = _id
                           and s.subject_type = 'team'
                           and s.subject_id in (select public.my_team_ids()))
           else false
         end;
$$;

create or replace function public.share_knowledge_with_team(_kind text, _id uuid, _team uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare ws uuid;
begin
  ws := public.knowledge_workspace(_kind, _id);
  if ws is null or not public.can_write_knowledge(_kind, _id) then
    raise exception 'That is not yours to share.' using errcode = '42501';
  end if;
  -- Same firm, and live. An archived team addresses nobody, so sharing with
  -- one would be a share that silently reaches no one.
  if not exists (select 1 from public.teams t
                  where t.id = _team and t.workspace_id = ws and t.archived_at is null) then
    raise exception 'That team is not available in this workspace.' using errcode = '42501';
  end if;
  insert into public.knowledge_shares (kind, object_id, subject_type, subject_id, workspace_id, shared_by)
  values (_kind, _id, 'team', _team, ws, auth.uid())
  on conflict (kind, object_id, subject_type, subject_id) do nothing;
  insert into public.audit_events (workspace_id, actor_id, actor_name, event_type, entity_type, entity_id, summary, metadata)
  values (ws, auth.uid(),
          coalesce((select coalesce(full_name, email) from public.profiles where id = auth.uid()), 'Unknown'),
          'knowledge.shared_with_team', _kind, _id,
          format('Shared with %s', (select name from public.teams where id = _team)),
          jsonb_build_object('team', _team));
end;
$$;

create or replace function public.unshare_knowledge_from_team(_kind text, _id uuid, _team uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare ws uuid;
begin
  ws := public.knowledge_workspace(_kind, _id);
  if ws is null or not public.can_write_knowledge(_kind, _id) then
    raise exception 'That is not yours to share.' using errcode = '42501';
  end if;
  delete from public.knowledge_shares
   where kind = _kind and object_id = _id and subject_type = 'team' and subject_id = _team;
  insert into public.audit_events (workspace_id, actor_id, actor_name, event_type, entity_type, entity_id, summary, metadata)
  values (ws, auth.uid(),
          coalesce((select coalesce(full_name, email) from public.profiles where id = auth.uid()), 'Unknown'),
          'knowledge.team_share_removed', _kind, _id, 'Team share removed',
          jsonb_build_object('team', _team));
end;
$$;
