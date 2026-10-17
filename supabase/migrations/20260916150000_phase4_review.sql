-- PHASE 4, STEP 4: review.
--
-- `Requested → In review → Changes requested → Approved`, which is how review
-- actually goes: somebody prepares, somebody reads it, changes come back, they
-- are addressed, it is approved. Four values on a column that already existed
-- and one rule about who may move them.
--
-- NOT A WORKFLOW ENGINE. No branches, no conditions, no configuration, no
-- designer. The whole of the machinery is one transition table and one
-- predicate, and if it ever needs a second predicate that is the signal to stop
-- and ask what is being modelled.
--
-- ---------------------------------------------------------------------------
-- THE SUPERVISORY POINT, which is the reason the rule is not just "the assignee"
-- ---------------------------------------------------------------------------
--
-- Who may move a review:
--
--   the person it is ADDRESSED TO, provided they are STILL ELIGIBLE —
--     assigned_to = auth.uid() AND can_review_matter(matter). Somebody removed
--     from the matter, or demoted to Viewer, stops being able to decide. Their
--     entitlement to judge the work ended when their entitlement to the work
--     did, and a review is not a token you keep after leaving the file.
--
--   the LEAD, always, on any review on their matter, including reassigning one.
--     This is the other half: a partner has to be able to unstick a review whose
--     reviewer has gone on leave, and a file whose Lead cannot act on it is not
--     a file anybody is answerable for.
--
--   the AUTHOR, for one move only: resubmitting after changes were requested.
--     `Changes requested → Requested` is the round trip, and it belongs to the
--     person whose work it is.
--
-- Everything else is refused.

-- ---------------------------------------------------------------------------
-- 1. Which moves are legal at all
-- ---------------------------------------------------------------------------
--
-- Separated from WHO may make them, because they are different questions and
-- collapsing them is how a state machine becomes unreadable. A move that is not
-- in this table does not happen, whoever asks.

create or replace function public.review_transition_allowed(
  _from public.approval_status, _to public.approval_status)
returns boolean language sql immutable
as $$
  select (_from, _to) in (
    -- Asked, not yet picked up.
    ('Requested',        'In review'),
    ('Requested',        'Approved'),           -- read it there and then
    ('Requested',        'Changes requested'),
    ('Requested',        'Rejected'),
    -- Being read now.
    ('In review',        'Changes requested'),
    ('In review',        'Approved'),
    ('In review',        'Rejected'),
    -- Back with the author. The round trip, and the only way out of it.
    ('Changes requested','Requested'),
    -- 'Not required' is the resting state of the existing enum and can be
    -- turned into a real request.
    ('Not required',     'Requested')
  );
  -- Approved and Rejected are terminal. Deliberately: a review that can be
  -- reopened is not a decision, and the way to revisit an approved thing is to
  -- ask for a new review of it.
$$;

comment on function public.review_transition_allowed(public.approval_status, public.approval_status) is
  'Which review moves exist. Approved and Rejected are terminal by design — a decision that can be quietly reopened is not a decision.';

-- ---------------------------------------------------------------------------
-- 2. Who may make them
-- ---------------------------------------------------------------------------

create or replace function public.can_move_review(_approval uuid)
returns boolean language plpgsql stable security definer set search_path = public
as $$
declare
  a record;
  target uuid;
begin
  select * into a from public.approvals where id = _approval;
  if not found then return false; end if;

  target := public.comment_matter(a.entity_kind::text, a.entity_id);
  -- A review on something with no matter — unfiled private work — is the
  -- requester's own business and nobody else's. It never falls to the firm.
  if target is null then return a.requested_by = auth.uid(); end if;

  if public.is_matter_lead(target) then return true; end if;

  -- Still addressed to you AND still entitled to the work.
  if a.assigned_to = auth.uid() and public.can_review_matter(target) then return true; end if;

  -- The author resubmitting after changes were asked for.
  if a.requested_by = auth.uid()
     and a.status = 'Changes requested'
     and public.can_review_matter(target) then return true; end if;

  return false;
end;
$$;

comment on function public.can_move_review(uuid) is
  'The addressee while still an eligible member, the Lead always, or the author resubmitting after changes. Somebody removed from the matter or demoted to Viewer stops being able to decide, which is the supervisory point.';

-- ---------------------------------------------------------------------------
-- 3. The transition itself, enforced at the row
-- ---------------------------------------------------------------------------
--
-- A trigger rather than a check constraint, because the rule is about the pair
-- (old, new) and about who is asking — neither of which a constraint can see.

create or replace function public.enforce_review_move()
returns trigger language plpgsql security definer set search_path = public
as $$
declare target uuid := public.comment_matter(new.entity_kind::text, new.entity_id);
begin
  -- What a review is ABOUT never changes. Moving it would carry its whole
  -- history onto another matter in one update, the same hole `parent_id` had.
  if new.entity_kind is distinct from old.entity_kind
     or new.entity_id is distinct from old.entity_id
     or new.workspace_id is distinct from old.workspace_id
     or new.requested_by is distinct from old.requested_by then
    raise exception 'A review cannot be moved to another entity.' using errcode = '42501';
  end if;

  -- Reassignment is the Lead's alone. Not the reviewer's: handing your own
  -- review to somebody else is how a review quietly stops happening.
  if new.assigned_to is distinct from old.assigned_to then
    if target is null or not public.is_matter_lead(target) then
      raise exception 'Only the matter Lead can reassign a review.' using errcode = '42501';
    end if;
  end if;

  if new.status is distinct from old.status then
    if not public.review_transition_allowed(old.status, new.status) then
      raise exception 'A review cannot go from % to %.', old.status, new.status
        using errcode = '42501';
    end if;
    if not public.can_move_review(old.id) then
      raise exception 'This review is not yours to move.' using errcode = '42501';
    end if;

    -- A decision is stamped by the database, not by whoever wrote the screen.
    if new.status in ('Approved', 'Rejected', 'Changes requested') then
      new.decided_by := auth.uid();
      new.decided_at := now();
    elsif new.status = 'Requested' then
      -- Resubmitted. The previous decision is no longer the current one.
      new.decided_by := null;
      new.decided_at := null;
    end if;

    -- The reviewer's task is done when the review leaves their hands.
    if new.task_id is not null and new.status in ('Approved', 'Rejected', 'Changes requested') then
      update public.tasks set status = 'Done'
       where id = new.task_id and status <> 'Done';
    end if;

    insert into public.audit_events
      (matter_id, actor_id, actor_name, event_type, entity_type, entity_id, summary, metadata)
    values (target, auth.uid(),
            coalesce((select coalesce(p.full_name, p.email) from public.profiles p
                       where p.id = auth.uid()), 'Unknown'),
            'review.decided', 'approval', new.id,
            format('Review moved to %s', new.status),
            jsonb_build_object('from', old.status, 'to', new.status,
                               'reason', new.reason));
  end if;

  return new;
end;
$$;

drop trigger if exists approvals_enforce_move on public.approvals;
create trigger approvals_enforce_move before update on public.approvals
  for each row execute function public.enforce_review_move();

-- The policy admits everybody the trigger might allow; the trigger decides
-- which move was actually attempted and refuses the rest. One UPDATE policy
-- cannot tell a decision from a reassignment.
drop policy if exists "admins decide approvals" on public.approvals;
create policy "reviewers move approvals" on public.approvals for update
  using (public.can_move_review(id)
         or case
              when public.comment_matter(entity_kind::text, entity_id) is not null
                then public.is_matter_lead(public.comment_matter(entity_kind::text, entity_id))
              else false
            end)
  with check (
    case
      when public.comment_matter(entity_kind::text, entity_id) is not null
        then public.can_review_matter(public.comment_matter(entity_kind::text, entity_id))
           or public.is_matter_lead(public.comment_matter(entity_kind::text, entity_id))
      else requested_by = auth.uid()
    end);

-- ---------------------------------------------------------------------------
-- 4. Asking for a review
-- ---------------------------------------------------------------------------
--
-- A function rather than an insert, because asking has three parts that must
-- happen together: the approval, the reviewer's task, and the audit row. A
-- review that arrives as a notice nobody checks is the failure this is shaped
-- to avoid — it arrives as work, in the one list that means "what do I have to
-- do".

create or replace function public.request_review(
  _kind text, _id uuid, _reviewer uuid, _title text, _reason text default null)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  target uuid := public.comment_matter(_kind, _id);
  ws uuid;
  new_task uuid;
  new_review uuid;
begin
  if target is null then
    raise exception 'Review is for work filed to a matter.' using errcode = '42501';
  end if;
  if not public.can_review_matter(target) then
    raise exception 'You cannot ask for a review on this matter.' using errcode = '42501';
  end if;
  -- The reviewer must be on the matter. Same rule as a mention, same reason:
  -- asking somebody to review a file they cannot open tells them about the file.
  if not exists (select 1 from public.matter_members
                  where matter_id = target and user_id = _reviewer) then
    raise exception 'You can only ask somebody on this matter to review.' using errcode = '42501';
  end if;

  select workspace_id into ws from public.matters where id = target;

  insert into public.tasks (workspace_id, matter_id, title, status, assignee_id,
                            created_by, origin_kind, origin_id)
  values (ws, target, _title, 'Open', _reviewer, auth.uid(), 'review', _id)
  returning id into new_task;

  insert into public.approvals (workspace_id, entity_kind, entity_id, status,
                                requested_by, assigned_to, task_id, reason)
  values (ws, _kind::public.source_kind, _id, 'Requested', auth.uid(), _reviewer, new_task, _reason)
  returning id into new_review;

  -- The task points back at the review, so opening one reaches the other.
  update public.tasks set origin_kind = 'review', origin_id = new_review where id = new_task;

  insert into public.audit_events
    (matter_id, actor_id, actor_name, event_type, entity_type, entity_id, summary, metadata)
  values (target, auth.uid(),
          coalesce((select coalesce(p.full_name, p.email) from public.profiles p
                     where p.id = auth.uid()), 'Unknown'),
          'review.requested', 'approval', new_review,
          'Review requested',
          jsonb_build_object('reviewer', _reviewer, 'kind', _kind));

  return new_review;
end;
$$;

comment on function public.request_review(text, uuid, uuid, text, text) is
  'Ask somebody on the matter to check one entity. Creates the approval, the reviewer''s task and the audit row together, so a review arrives as work rather than as a notice.';

-- ---------------------------------------------------------------------------
-- 5. Withdrawing
-- ---------------------------------------------------------------------------
--
-- The asker changed their mind. Not a state: a withdrawn review did not happen,
-- and leaving a `Withdrawn` row in the lifecycle would put a dead entry in
-- front of the next person who reads the thing's review state. The reviewer's
-- task goes with it, because a task for a review that no longer exists is
-- exactly the kind of orphan that teaches people to ignore their list.

create or replace function public.withdraw_review(_approval uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare
  a record;
  target uuid;
begin
  select * into a from public.approvals where id = _approval;
  if not found then return; end if;
  target := public.comment_matter(a.entity_kind::text, a.entity_id);

  if not (a.requested_by = auth.uid()
          or (target is not null and public.is_matter_lead(target))) then
    raise exception 'Only the person who asked, or the matter Lead, can withdraw a review.'
      using errcode = '42501';
  end if;
  if a.status in ('Approved', 'Rejected') then
    raise exception 'A decided review cannot be withdrawn.' using errcode = '42501';
  end if;

  if a.task_id is not null then delete from public.tasks where id = a.task_id; end if;
  delete from public.approvals where id = _approval;

  insert into public.audit_events
    (matter_id, actor_id, actor_name, event_type, entity_type, entity_id, summary, metadata)
  values (target, auth.uid(),
          coalesce((select coalesce(p.full_name, p.email) from public.profiles p
                     where p.id = auth.uid()), 'Unknown'),
          'review.withdrawn', 'approval', _approval,
          'Review withdrawn', jsonb_build_object('from', a.status));
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. What a screen needs to draw the control
-- ---------------------------------------------------------------------------
--
-- Same arrangement as `thread_context()`, for the same reason: the interface
-- must not re-derive in TypeScript what the database already decides. It asks,
-- and the answer comes from `can_move_review()` and
-- `review_transition_allowed()` — the identical functions the trigger consults.

create or replace function public.review_for(_kind text, _id uuid)
returns table (
  id uuid, status public.approval_status, assigned_to uuid, requested_by uuid,
  task_id uuid, reason text, decided_at timestamptz, updated_at timestamptz,
  i_may_move boolean, i_may_withdraw boolean)
language plpgsql stable security definer set search_path = public
as $$
declare target uuid := public.comment_matter(_kind, _id);
begin
  if target is not null and not public.is_matter_member(target) then
    return;  -- Nothing. Not a row of nulls.
  end if;
  return query
    select a.id, a.status, a.assigned_to, a.requested_by, a.task_id, a.reason,
           a.decided_at, a.updated_at,
           public.can_move_review(a.id),
           a.requested_by = auth.uid()
             or (target is not null and public.is_matter_lead(target))
      from public.approvals a
     where a.entity_kind::text = _kind and a.entity_id = _id
     order by a.created_at desc
     limit 1;
end;
$$;

comment on function public.review_for(text, uuid) is
  'The current review on one entity, and whether the caller may move or withdraw it. Answers with the same functions that judge the write.';
