-- PHASE 4: two reader functions stop bypassing the boundary they were meant to
-- report on.
--
-- Found by a regression run, not by review, and it is the fourth defect of this
-- exact shape in two phases. Recording it plainly because that is the only part
-- of it that is useful.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS WRONG
-- ---------------------------------------------------------------------------
--
-- `task_actions()` and `review_for()` were written `security definer` so they
-- could call `is_matter_member()` and `can_write_matter()`. That also made their
-- own `select ... from tasks` and `from approvals` bypass row-level security —
-- and both then guarded only the FILED case:
--
--   if t.matter_id is not null and not public.is_matter_member(t.matter_id)
--   then return; end if;
--
-- So for UNFILED work, where `matter_id is null`, the guard was skipped
-- entirely. Phase 3c established that unfiled work is author-only. These two
-- functions did not know that.
--
-- What it actually leaked, proved against the live database before this fix:
--
--   task_actions(<another person's unfiled request>)
--     returned a row — confirming the task exists, which by itself breaks the
--     non-disclosure property: a thing you cannot open must be indistinguishable
--     from a thing that does not exist —
--     AND returned `asked_by`, naming the colleague who created it.
--
--   review_for('research', <another person's unfiled research>)
--     returned the approval: its status, its assignee, who asked for it.
--
-- The same null branch, skipped the same way, for the fourth time: Phase 3's
-- three defects were all a fallback that widened access when a more specific
-- scope was absent. This is that again, written by me, in the step whose whole
-- stated purpose was not to do it.
--
-- ---------------------------------------------------------------------------
-- THE FIX, AND WHY IT IS THIS ONE
-- ---------------------------------------------------------------------------
--
-- The obvious repair is to add the missing branch:
--
--   if t.matter_id is null and t.created_by <> auth.uid() then return; end if;
--
-- That is a SECOND OPINION about who may read a task, written beside the policy
-- that already knows. It would be correct today and wrong the next time the
-- tasks policy changes, silently, in the direction of showing too much.
--
-- So instead both functions become `security invoker`. Their reads then run
-- under the caller's own row-level security — the policy filters the row, the
-- function never sees it, and there is no branch to forget. The predicates they
-- call (`is_matter_member`, `can_write_matter`, `can_move_review`,
-- `is_matter_lead`) are security definer in their own right and keep working
-- exactly as before.
--
-- The rule this leaves behind: a function that REPORTS on a row must not read
-- that row with more authority than its caller has. Security definer is for
-- answering a question about permissions, not for fetching the thing the
-- permissions are about.

create or replace function public.task_actions(_task uuid)
returns table (i_may_decline boolean, i_may_assign boolean, asked_by uuid)
language plpgsql
stable
security invoker          -- the caller's RLS filters the read
set search_path = public
as $$
declare t record;
begin
  -- Under the caller's own policy. A task they cannot see is not found, and
  -- an empty result is indistinguishable from a task that does not exist.
  select * into t from public.tasks where id = _task;
  if not found then return; end if;

  return query select
    t.assignee_id is not distinct from auth.uid()
      and t.origin_kind is not distinct from 'request'::public.source_kind
      and t.created_by is not null,
    t.matter_id is not null and public.can_write_matter(t.matter_id),
    case when t.origin_kind is not distinct from 'request'::public.source_kind
         then t.created_by else null end;
end;
$$;

comment on function public.task_actions(uuid) is
  'Whether the caller may decline or hand over one task, and who asked for it. SECURITY INVOKER on purpose: the tasks policy filters the read, so unfiled work stays author-only without this function holding a second opinion about that.';

create or replace function public.review_for(_kind text, _id uuid)
returns table (
  id uuid, status public.approval_status, assigned_to uuid, requested_by uuid,
  task_id uuid, reason text, decided_at timestamptz, updated_at timestamptz,
  i_may_move boolean, i_may_withdraw boolean)
language plpgsql
stable
security invoker          -- the caller's RLS filters the read
set search_path = public
as $$
declare target uuid := public.comment_matter(_kind, _id);
begin
  -- No explicit membership guard, and none needed: the approvals policy already
  -- says a matter's approvals are its members', research follows the research,
  -- and everything else is the requester's own.
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
  'The current review on one entity, and whether the caller may move or withdraw it. SECURITY INVOKER on purpose: the approvals policy filters the read.';

-- ---------------------------------------------------------------------------
-- The same probe, closed on the writers
-- ---------------------------------------------------------------------------
--
-- `decline_work()` and `assign_work()` refuse correctly, but they refused with
-- two different sentences — "That task is unavailable" when the row does not
-- exist, and "Only the person asked can decline" when it does. That difference
-- is a existence oracle for anybody willing to try uuids. They now say the same
-- thing, because from outside the boundary those two situations are the same
-- situation.

create or replace function public.decline_work(_task uuid, _reason text)
returns void language plpgsql security definer set search_path = public
as $$
declare t record;
begin
  select * into t from public.tasks where id = _task;
  -- One sentence for "there is no such task" and for "it is not yours", because
  -- telling them apart is telling somebody a task exists.
  if not found or t.assignee_id is distinct from auth.uid() then
    raise exception 'That task is not yours to decline.' using errcode = '42501';
  end if;
  if t.origin_kind is distinct from 'request'::public.source_kind then
    raise exception 'Only a request can be declined. This work was assigned.'
      using errcode = '42501';
  end if;
  if t.created_by is null then
    raise exception 'There is nobody to return this to.' using errcode = '42501';
  end if;
  if coalesce(_reason, '') = '' then
    raise exception 'Say why, so the person who asked knows what to do next.'
      using errcode = '42501';
  end if;

  update public.tasks set assignee_id = t.created_by, status = 'Open' where id = _task;

  insert into public.audit_events
    (matter_id, actor_id, actor_name, event_type, entity_type, entity_id, summary, metadata)
  values (t.matter_id, auth.uid(),
          coalesce((select coalesce(p.full_name, p.email) from public.profiles p
                     where p.id = auth.uid()), 'Unknown'),
          'work.declined', 'task', _task,
          format('Declined: %s', t.title),
          jsonb_build_object('reason', _reason, 'returned_to', t.created_by));
end;
$$;

create or replace function public.assign_work(_task uuid, _to uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare t record; previous uuid;
begin
  select * into t from public.tasks where id = _task;
  if not found
     or t.matter_id is null
     or not public.can_write_matter(t.matter_id) then
    -- Unfiled work is author-only and has nobody to hand it to; a matter you
    -- cannot write is a matter you are not told about. One sentence for all of
    -- it.
    raise exception 'That work is not yours to hand over.' using errcode = '42501';
  end if;
  if _to is not null and not exists (select 1 from public.matter_members
                                      where matter_id = t.matter_id and user_id = _to) then
    raise exception 'You can only hand work to somebody on this matter.' using errcode = '42501';
  end if;

  previous := t.assignee_id;
  if previous is not distinct from _to then return; end if;

  update public.tasks set assignee_id = _to where id = _task;

  insert into public.audit_events
    (matter_id, actor_id, actor_name, event_type, entity_type, entity_id, summary, metadata)
  values (t.matter_id, auth.uid(),
          coalesce((select coalesce(p.full_name, p.email) from public.profiles p
                     where p.id = auth.uid()), 'Unknown'),
          'work.handed_off', 'task', _task,
          format('Handed over: %s', t.title),
          jsonb_build_object('from', previous, 'to', _to));
end;
$$;

-- ---------------------------------------------------------------------------
-- The audit, done properly this time
-- ---------------------------------------------------------------------------
--
-- Every security-definer function added in Phase 4, and what it reads:
--
--   thread_context      reads nothing. Calls resolvers only, and returns the
--                       same shape for a real entity and a fabricated one.
--   can_move_review     reads approvals, returns a BOOLEAN. A boolean about a
--                       row you cannot see is false either way, and its null
--                       branch is `requested_by = auth.uid()`.
--   mark_mentions_seen  writes one column of the caller's own row.
--   matters_with_unseen_mentions  reads only rows where user_id = auth.uid().
--   request_review      checks can_review_matter before anything.
--   withdraw_review     null target requires requested_by = auth.uid().
--   request_work        checks can_review_matter before anything.
--   decline_work        fixed above.
--   assign_work         fixed above.
--   set_deliverable_owner  null target refuses; otherwise can_write_matter.
--   audit_deliverable_owner  a trigger; runs on a row already being written.
--   entity_owner / comment_matter / finding_research  resolvers, by design, and
--                       never called with a caller's id as an argument.
--
--   task_actions        WAS WRONG. Now security invoker.
--   review_for          WAS WRONG. Now security invoker.

do $$
declare bad text := '';
begin
  select string_agg(p.proname, ' ') into bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('task_actions', 'review_for')
     and p.prosecdef;
  if bad is not null then
    raise exception 'Refusing to finish: % still reads with more authority than its caller.', bad;
  end if;
end $$;
