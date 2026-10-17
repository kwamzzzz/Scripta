-- Moving a matter, or an unfiled task, to another workspace.
--
-- ---------------------------------------------------------------------------
-- THE WORKSPACE IS NOT THE CONFIDENTIALITY BOUNDARY, WHICH IS WHY THIS IS SAFE
-- ---------------------------------------------------------------------------
--
-- Phase 3 decided that `is_matter_member()` does not consult `workspace_members`
-- — "belonging to the firm is not authorisation on a file, and not belonging to
-- the firm is not a bar to being on one." Every read policy that matters is
-- written on top of that:
--
--   matters          is_matter_member(id)
--   matter_flows     is_matter_member(matter_id)
--   tasks            is_matter_member(matter_id), or your own unfiled task
--   comments         is_matter_member(comment_matter(...))
--   approvals        is_matter_member(comment_matter(...))
--
-- So THE MATTER TEAM TRAVELS WITH THE MATTER. Moving a file to another
-- workspace shows it to nobody new: a member of the destination workspace who
-- is not on the matter still cannot read a word of it. That is the property
-- that makes this feature a filing operation rather than a disclosure, and the
-- suite asserts it directly rather than trusting this paragraph.
--
-- ---------------------------------------------------------------------------
-- WHAT IT DOES CHANGE, WHICH THE INTERFACE MUST SAY OUT LOUD
-- ---------------------------------------------------------------------------
--
-- `can_write_matter` and `can_review_matter` treat a firm role as a CEILING:
-- somebody admitted to the workspace as a viewer is a Viewer on every matter in
-- it, whatever the matter team says. That ceiling is read from
-- `matter_workspace(matter)` — so it is the DESTINATION's ceiling that applies
-- the moment the move lands.
--
-- A lawyer who is an Editor on this matter, and a viewer in the destination
-- workspace, silently stops being able to write. That is the one real
-- consequence of a move, it is invisible in the data, and
-- `matter_move_preview()` exists so the interface can name those people before
-- anybody presses anything.
--
-- ---------------------------------------------------------------------------
-- A FLOW CANNOT BE MOVED, AND THAT IS NOT A GAP
-- ---------------------------------------------------------------------------
--
-- `matter_flows.matter_id` is NOT NULL: a flow always belongs to a matter, so
-- "this flow is in workspace A and its matter is in workspace B" is not a state
-- the schema can hold. A flow moves when its matter moves, and there is no
-- function here to move one on its own, because the only honest implementation
-- of that button is the one that moves the matter.
--
-- The same is true of a task filed to a matter. An UNFILED task has no matter
-- and belongs only to the workspace and its author, so that one moves alone.

-- ---------------------------------------------------------------------------
-- 1. Two Phase 4 guards learn about one legitimate exception
-- ---------------------------------------------------------------------------
--
-- `enforce_comment_change` and `enforce_review_move` both refuse outright when
-- `workspace_id` changes — "a comment cannot be moved to another entity or
-- thread". They are right to, and they are not being relaxed.
--
-- A matter move is not a comment being re-parented; it is the FIRM under the
-- comment changing while the comment stays exactly where it is. So the guards
-- gain one exception, and the exception is as narrow as it can be made:
--
--   * a transaction-local setting, so it cannot outlive the statement that set
--     it, cannot be set from the client, and is gone whether the move commits
--     or rolls back;
--   * carrying the MATTER ID rather than a boolean, and checked against the
--     matter this very row belongs to — so a move of matter A cannot be used
--     as cover to change the workspace of a comment on matter B.
--
-- Anything that is not `move_matter_to_workspace` still gets the refusal.

create or replace function public.moving_matter()
returns uuid language sql stable
as $$ select nullif(current_setting('scripta.moving_matter', true), '')::uuid; $$;

comment on function public.moving_matter() is
  'The matter currently being moved between workspaces, or null. Transaction-local, set only by move_matter_to_workspace(), and the single exception the comment and review guards make for a changing workspace_id.';

create or replace function public.enforce_comment_change()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  target uuid := public.comment_matter(new.entity_kind::text, new.entity_id);
  owner  uuid := public.entity_owner(new.entity_kind::text, new.entity_id);
  lead   boolean := target is not null and public.is_matter_lead(target);
begin
  if new.entity_kind is distinct from old.entity_kind
     or new.entity_id is distinct from old.entity_id
     or new.parent_id is distinct from old.parent_id then
    raise exception 'A comment cannot be moved to another entity or thread.' using errcode = '42501';
  end if;
  -- The firm under the comment may change, during a move of the matter this
  -- comment is actually on, and at no other time.
  if new.workspace_id is distinct from old.workspace_id
     and (target is null or public.moving_matter() is distinct from target) then
    raise exception 'A comment cannot be moved to another workspace on its own.' using errcode = '42501';
  end if;
  if new.author_id is distinct from old.author_id then
    raise exception 'A comment cannot be re-attributed.' using errcode = '42501';
  end if;
  if new.body is distinct from old.body
     or new.mentions is distinct from old.mentions
     or new.kind is distinct from old.kind then
    if old.author_id is distinct from auth.uid() then
      raise exception 'Only the author can edit a comment.' using errcode = '42501';
    end if;
    if new.body is distinct from old.body then
      new.updated_at := now();
      insert into public.audit_events
        (matter_id, actor_id, actor_name, event_type, entity_type, entity_id, summary, metadata)
      values (target, auth.uid(),
              coalesce((select coalesce(p.full_name,p.email) from public.profiles p where p.id=auth.uid()),'Unknown'),
              'comment.edited','comment', new.id,'Comment edited',
              jsonb_build_object('previous', old.body, 'current', new.body));
    end if;
  end if;
  if new.resolved is distinct from old.resolved then
    if not (old.author_id = auth.uid() or (owner is not null and owner = auth.uid()) or lead) then
      raise exception 'Only the person who raised this, the person responsible for it, or the matter Lead can resolve it.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_review_move()
returns trigger language plpgsql security definer set search_path = public
as $$
declare target uuid := public.comment_matter(new.entity_kind::text, new.entity_id);
begin
  if new.entity_kind is distinct from old.entity_kind
     or new.entity_id is distinct from old.entity_id
     or new.requested_by is distinct from old.requested_by then
    raise exception 'A review cannot be moved to another entity.' using errcode = '42501';
  end if;
  if new.workspace_id is distinct from old.workspace_id
     and (target is null or public.moving_matter() is distinct from target) then
    raise exception 'A review cannot be moved to another workspace on its own.' using errcode = '42501';
  end if;
  if new.assigned_to is distinct from old.assigned_to then
    if target is null or not public.is_matter_lead(target) then
      raise exception 'Only the matter Lead can reassign a review.' using errcode = '42501';
    end if;
  end if;
  if new.status is distinct from old.status then
    if not public.review_transition_allowed(old.status, new.status) then
      raise exception 'A review cannot go from % to %.', old.status, new.status using errcode = '42501';
    end if;
    if not public.can_move_review(old.id) then
      raise exception 'This review is not yours to move.' using errcode = '42501';
    end if;
    if old.status = 'Changes requested' and new.status = 'Requested' then
      if not (old.requested_by = auth.uid()
              or (target is not null and public.is_matter_lead(target))) then
        raise exception 'Only the person whose work this is, or the matter Lead, can resubmit it.'
          using errcode = '42501';
      end if;
    end if;
    if new.status in ('Approved','Rejected','Changes requested') then
      new.decided_by := auth.uid(); new.decided_at := now();
    elsif new.status = 'Requested' then
      new.decided_by := null; new.decided_at := null;
    end if;
    if new.task_id is not null then
      if new.status in ('Approved','Rejected','Changes requested') then
        update public.tasks set status='Done' where id=new.task_id and status <> 'Done';
      elsif new.status = 'Requested' then
        update public.tasks set status='Open' where id=new.task_id and status='Done';
      end if;
    end if;
    insert into public.audit_events
      (matter_id, actor_id, actor_name, event_type, entity_type, entity_id, summary, metadata)
    values (target, auth.uid(),
            coalesce((select coalesce(p.full_name,p.email) from public.profiles p where p.id=auth.uid()),'Unknown'),
            'review.decided','approval', new.id, format('Review moved to %s', new.status),
            jsonb_build_object('from', old.status, 'to', new.status, 'reason', new.reason));
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Where may I file things?
-- ---------------------------------------------------------------------------
--
-- Only workspaces you administer. Moving a matter INTO a firm you do not run
-- would let anybody put work on somebody else's books; moving one OUT of a firm
-- you do not run is worse. Both ends are checked, every time.

create or replace function public.workspaces_i_administer()
returns table (id uuid, name text)
language sql stable security definer set search_path = public
as $$
  select w.id, w.name
    from public.workspaces w
    join public.workspace_members m on m.workspace_id = w.id
   where m.user_id = auth.uid() and m.role in ('owner', 'admin')
   order by w.name;
$$;

-- ---------------------------------------------------------------------------
-- 3. What would happen if I did
-- ---------------------------------------------------------------------------

create or replace function public.matter_move_preview(_matter uuid, _to uuid)
returns table (
  from_workspace uuid, from_name text, to_name text,
  flows integer, tasks integer, notes integer, reviews integer, documents integer,
  -- The people this would quietly demote, and the people it would release.
  capped_names text[], released_names text[])
language plpgsql stable security definer set search_path = public
as $$
declare src uuid;
begin
  select workspace_id into src from public.matters where id = _matter;
  if src is null or not public.is_matter_member(_matter) then
    raise exception 'That matter is unavailable.' using errcode = '42501';
  end if;

  return query
  select src,
         (select w.name from public.workspaces w where w.id = src),
         (select w.name from public.workspaces w where w.id = _to),
         (select count(*)::integer from public.matter_flows f where f.matter_id = _matter),
         (select count(*)::integer from public.tasks t where t.matter_id = _matter),
         (select count(*)::integer from public.comments c
           where public.comment_matter(c.entity_kind::text, c.entity_id) = _matter),
         (select count(*)::integer from public.approvals a
           where public.comment_matter(a.entity_kind::text, a.entity_id) = _matter),
         (select count(*)::integer from public.documents d where d.matter_id = _matter),
         -- Capped: on the matter as more than a Viewer, but a viewer in the
         -- destination firm, whose ceiling would come down on them.
         coalesce((select array_agg(coalesce(p.full_name, p.email))
                     from public.matter_members mm
                     join public.workspace_members wm
                       on wm.user_id = mm.user_id and wm.workspace_id = _to
                     left join public.profiles p on p.id = mm.user_id
                    where mm.matter_id = _matter
                      and mm.role in ('lead','editor','reviewer')
                      and wm.role = 'viewer'), '{}'::text[]),
         -- Released: capped where the matter is now, and not capped where it
         -- is going.
         coalesce((select array_agg(coalesce(p.full_name, p.email))
                     from public.matter_members mm
                     join public.workspace_members wm
                       on wm.user_id = mm.user_id and wm.workspace_id = src
                     left join public.profiles p on p.id = mm.user_id
                    where mm.matter_id = _matter
                      and mm.role in ('lead','editor','reviewer')
                      and wm.role = 'viewer'
                      and not exists (select 1 from public.workspace_members w2
                                       where w2.user_id = mm.user_id
                                         and w2.workspace_id = _to and w2.role = 'viewer')), '{}'::text[]);
end;
$$;

comment on function public.matter_move_preview(uuid, uuid) is
  'What moving this matter would change, including the people the destination firm''s Viewer ceiling would silently demote. Readable by any matter member; moving still requires admin of both workspaces.';

-- ---------------------------------------------------------------------------
-- 4. The move
-- ---------------------------------------------------------------------------
--
-- One statement per table, in one transaction, ordered so that
-- `check_corporate_document_matter` — which insists a document's workspace
-- matches its matter's — sees the matter already moved rather than half moved.

create or replace function public.move_matter_to_workspace(_matter uuid, _to uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare src uuid; moved jsonb; n integer;
begin
  select workspace_id into src from public.matters where id = _matter;
  if src is null then
    raise exception 'That matter is unavailable.' using errcode = '42501';
  end if;
  if _to is null or not exists (select 1 from public.workspaces w where w.id = _to) then
    raise exception 'That workspace does not exist.' using errcode = '42501';
  end if;
  if src = _to then
    raise exception 'That matter is already in that workspace.' using errcode = '22023';
  end if;

  -- BOTH ENDS. Out of a firm you run, into a firm you run.
  if not public.can_admin_workspace(src) then
    raise exception 'Only an owner or admin of the workspace a matter is in can move it out.'
      using errcode = '42501';
  end if;
  if not public.can_admin_workspace(_to) then
    raise exception 'You can only move a matter into a workspace you administer.'
      using errcode = '42501';
  end if;

  -- The one exception the comment and review guards make, for this matter only,
  -- and only until this transaction ends.
  perform set_config('scripta.moving_matter', _matter::text, true);

  update public.matters set workspace_id = _to where id = _matter;

  update public.matter_flows set workspace_id = _to where matter_id = _matter;
  update public.flow_phases set workspace_id = _to
   where flow_id in (select id from public.matter_flows where matter_id = _matter);
  update public.flow_deliverables set workspace_id = _to
   where flow_id in (select id from public.matter_flows where matter_id = _matter);
  update public.flow_versions set workspace_id = _to
   where deliverable_id in (select d.id from public.flow_deliverables d
                             join public.matter_flows f on f.id = d.flow_id
                            where f.matter_id = _matter);
  update public.flow_evidence set workspace_id = _to
   where deliverable_id in (select d.id from public.flow_deliverables d
                             join public.matter_flows f on f.id = d.flow_id
                            where f.matter_id = _matter);
  update public.flow_threads set workspace_id = _to
   where deliverable_id in (select d.id from public.flow_deliverables d
                             join public.matter_flows f on f.id = d.flow_id
                            where f.matter_id = _matter);
  update public.flow_emails set workspace_id = _to
   where deliverable_id in (select d.id from public.flow_deliverables d
                             join public.matter_flows f on f.id = d.flow_id
                            where f.matter_id = _matter);

  update public.tasks set workspace_id = _to where matter_id = _matter;

  -- AUDIT EVENTS ARE DELIBERATELY NOT TOUCHED, and the schema stopped the
  -- first version of this function from touching them.
  --
  --   check (num_nonnulls(matter_id, workspace_id) = 1)
  --
  -- An audit event has exactly ONE subject. A matter's events carry `matter_id`
  -- and a null workspace; the firm's own events carry `workspace_id` and no
  -- matter. That is Phase 3d's rule — audit visibility never exceeds resource
  -- visibility — expressed as a constraint, after `audit_event_visible()` was
  -- found reading research titles out loud.
  --
  -- So a matter's history is scoped by the matter, which is not changing. It
  -- needs no update, and the update this function originally attempted would
  -- have taken every matter-private audit row and made it visible to everybody
  -- in the firm. The constraint refused it. It is written out here so nobody
  -- adds it back.

  update public.links set workspace_id = _to where matter_id = _matter;
  update public.drafts set workspace_id = _to where matter_id = _matter;
  update public.contract_drafts set workspace_id = _to where matter_id = _matter;
  update public.corporate_documents set workspace_id = _to where matter_id = _matter;

  update public.comments set workspace_id = _to
   where public.comment_matter(entity_kind::text, entity_id) = _matter;
  update public.approvals set workspace_id = _to
   where public.comment_matter(entity_kind::text, entity_id) = _matter;

  -- Deliberately NOT moved. A precedent is firm knowledge that happens to
  -- record where it came from, and a research matter has its own team and its
  -- own life; neither is part of this file, and relocating them would take
  -- library and research out of a firm because one contract left it.
  --
  -- `matter_reference_counters` is a per-workspace counter, not a per-matter
  -- one, so the matter keeps the reference it was given. Its old number is part
  -- of its history.

  -- matter_id only, for the same reason: this is the matter's history, not the
  -- firm's noticeboard.
  insert into public.audit_events
    (matter_id, actor_id, actor_name, event_type, entity_type, entity_id, summary, metadata)
  values (_matter, auth.uid(),
          coalesce((select coalesce(p.full_name, p.email) from public.profiles p
                     where p.id = auth.uid()), 'Unknown'),
          'matter.moved', 'matter', _matter,
          format('Moved from %s to %s',
                 (select w.name from public.workspaces w where w.id = src),
                 (select w.name from public.workspaces w where w.id = _to)),
          jsonb_build_object('from', src, 'to', _to));

  -- Shut the exception behind us.
  --
  -- `set_config(..., is_local := true)` is scoped to the TRANSACTION, not to
  -- this function call, so without this line the comment and review guards
  -- stayed open for this matter for the rest of the caller's transaction. Each
  -- RPC is its own transaction today, which is exactly the kind of assumption
  -- that stops being true quietly.
  --
  -- A permission granted for one operation ends with that operation. Found by
  -- asserting `moving_matter()` was null again after a move, which it was not.
  perform set_config('scripta.moving_matter', '', true);

  select count(*)::integer into n from public.matter_flows where matter_id = _matter;
  moved := jsonb_build_object('from', src, 'to', _to, 'flows', n);
  return moved;
end;
$$;

comment on function public.move_matter_to_workspace(uuid, uuid) is
  'File a matter under a different workspace, with everything that belongs to it. Requires owner or admin of BOTH workspaces. Shows the matter to nobody new — the matter team is the confidentiality boundary and travels with it — but the destination firm''s Viewer ceiling applies from the moment it lands.';

-- ---------------------------------------------------------------------------
-- 5. An unfiled task, which belongs to nothing but its workspace
-- ---------------------------------------------------------------------------

create or replace function public.move_task_to_workspace(_task uuid, _to uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare src uuid; filed uuid;
begin
  select workspace_id, matter_id into src, filed from public.tasks where id = _task;
  if src is null then
    raise exception 'That task is unavailable.' using errcode = '42501';
  end if;

  -- A task filed to a matter is part of that matter's file. Moving it alone
  -- would put it in a different firm from the work it is about.
  if filed is not null then
    raise exception 'That task belongs to a matter. Move the matter and the task goes with it.'
      using errcode = '42501';
  end if;
  if src = _to then
    raise exception 'That task is already in that workspace.' using errcode = '22023';
  end if;
  if not public.can_admin_workspace(src) or not public.can_admin_workspace(_to) then
    raise exception 'You can only move a task between workspaces you administer.'
      using errcode = '42501';
  end if;

  update public.tasks set workspace_id = _to where id = _task;
  return jsonb_build_object('from', src, 'to', _to);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Nothing may be left behind
-- ---------------------------------------------------------------------------
--
-- A matter whose notes are still filed under the firm it left is not a bug you
-- would ever see on screen — every read is scoped by the matter team, so it
-- looks perfectly normal — and it would quietly corrupt every
-- workspace-scoped list, export and usage figure. So it is checked rather
-- than assumed.

create or replace function public.matter_stragglers(_matter uuid)
returns table (relation text, rows integer)
language plpgsql stable security definer set search_path = public
as $$
declare ws uuid;
begin
  select workspace_id into ws from public.matters where id = _matter;
  return query
  select 'matter_flows', count(*)::integer from public.matter_flows
    where matter_id = _matter and workspace_id is distinct from ws
  union all select 'tasks', count(*)::integer from public.tasks
    where matter_id = _matter and workspace_id is distinct from ws
  union all select 'comments', count(*)::integer from public.comments
    where public.comment_matter(entity_kind::text, entity_id) = _matter and workspace_id is distinct from ws
  union all select 'approvals', count(*)::integer from public.approvals
    where public.comment_matter(entity_kind::text, entity_id) = _matter and workspace_id is distinct from ws
  union all select 'flow_deliverables', count(*)::integer from public.flow_deliverables d
    where d.flow_id in (select id from public.matter_flows where matter_id = _matter)
      and d.workspace_id is distinct from ws;
end;
$$;

comment on function public.matter_stragglers(uuid) is
  'Rows belonging to this matter that are still filed under a different workspace. Should always be zero; a move that leaves any is a move that half happened.';
