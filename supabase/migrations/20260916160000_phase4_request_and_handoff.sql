-- PHASE 4, STEP 5: request, decline, and handing work over.
--
-- Three of the four verbs meet here, and the whole point is that they are not
-- the same verb:
--
--   REQUEST      Please do this.        Creates a task.       DECLINABLE.
--   ASSIGN       This is yours now.     Moves work that       Not declinable.
--                                       already exists.
--   MENTION      Look at this.          Creates nothing.      (step 3)
--
-- The difference between the first two is not politeness. A request is an ASK,
-- and an ask that cannot be refused is an instruction wearing a question mark —
-- so declining is a first-class move and the work goes back to the person who
-- wanted it rather than evaporating. An assignment is a STATEMENT OF FACT by
-- somebody entitled to make it: a Lead or an Editor moving work around the
-- file they are running. Refusing it would be refusing the allocation of work,
-- which is not a conversation the task list should be hosting.
--
-- That is also why the permissions differ. A Reviewer may REQUEST — asking a
-- colleague to do something is part of reviewing their work — and may not
-- ASSIGN, because moving work around the matter is running it.
--
-- ---------------------------------------------------------------------------
-- WHAT IS NOT BUILT HERE
-- ---------------------------------------------------------------------------
--
-- No new table and no new column. A decline does not get a `declined_reason`
-- field and reassignment does not get a history table: the reason and the
-- history are audit events, matter-scoped, which is where the rest of this
-- file's history already lives. The task returning to the asker's own list is
-- the signal that it was declined — a task that reappears is impossible to
-- miss, and an unread badge somewhere else is easy to.

-- ---------------------------------------------------------------------------
-- 1. Request: please do this
-- ---------------------------------------------------------------------------

create or replace function public.request_work(
  _matter uuid, _assignee uuid, _title text, _detail text default null,
  _due date default null)
returns uuid language plpgsql security definer set search_path = public
as $$
declare ws uuid; new_task uuid;
begin
  if not public.can_review_matter(_matter) then
    raise exception 'You cannot request work on this matter.' using errcode = '42501';
  end if;
  -- Same rule as a mention and a review request, same reason: asking somebody
  -- to do something on a file they cannot open tells them about the file.
  if not exists (select 1 from public.matter_members
                  where matter_id = _matter and user_id = _assignee) then
    raise exception 'You can only ask somebody on this matter.' using errcode = '42501';
  end if;
  if _assignee = auth.uid() then
    -- Not refused, but worth being clear about: asking yourself is just making
    -- a task, and `origin_kind` should say so rather than claiming a request.
    raise exception 'To give yourself work, add a task.' using errcode = '42501';
  end if;

  select workspace_id into ws from public.matters where id = _matter;

  insert into public.tasks (workspace_id, matter_id, title, detail, status, due_date,
                            assignee_id, created_by, origin_kind, origin_id)
  values (ws, _matter, _title, _detail, 'Open', _due, _assignee, auth.uid(), 'request', _matter)
  returning id into new_task;

  insert into public.audit_events
    (matter_id, actor_id, actor_name, event_type, entity_type, entity_id, summary, metadata)
  values (_matter, auth.uid(),
          coalesce((select coalesce(p.full_name, p.email) from public.profiles p
                     where p.id = auth.uid()), 'Unknown'),
          'work.requested', 'task', new_task,
          format('Work requested: %s', _title),
          jsonb_build_object('assignee', _assignee));

  return new_task;
end;
$$;

comment on function public.request_work(uuid, uuid, text, text, date) is
  'Ask a colleague on the matter to do something. Creates a task they may decline. A Reviewer may request; requesting is part of reviewing somebody''s work.';

-- ---------------------------------------------------------------------------
-- 2. Decline: it goes back, it does not vanish
-- ---------------------------------------------------------------------------
--
-- Only a REQUEST can be declined. A task you were assigned, or one you made
-- yourself, has no asker to return to — declining it would mean deleting
-- somebody else's decision about the file, which is a different act with a
-- different name.

create or replace function public.decline_work(_task uuid, _reason text)
returns void language plpgsql security definer set search_path = public
as $$
declare t record;
begin
  select * into t from public.tasks where id = _task;
  if not found then
    raise exception 'That task is unavailable.' using errcode = '42501';
  end if;
  if t.assignee_id is distinct from auth.uid() then
    raise exception 'Only the person asked can decline.' using errcode = '42501';
  end if;
  if t.origin_kind is distinct from 'request'::public.source_kind then
    raise exception 'Only a request can be declined. This work was assigned.'
      using errcode = '42501';
  end if;
  if t.created_by is null then
    raise exception 'There is nobody to return this to.' using errcode = '42501';
  end if;
  if coalesce(_reason, '') = '' then
    -- Declining without saying why sends the asker back to square one, which
    -- makes the whole round trip a waste of both people's time.
    raise exception 'Say why, so the person who asked knows what to do next.'
      using errcode = '42501';
  end if;

  -- Back to whoever asked. The task reappearing in their own list IS the
  -- signal; there is no notification and nothing to mark read.
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

-- ---------------------------------------------------------------------------
-- 3. Assign and hand off: this is yours now
-- ---------------------------------------------------------------------------
--
-- `can_write_matter`, not `can_review_matter`. Moving work around a matter is
-- running it, and a Reviewer reads the work rather than doing it.

create or replace function public.assign_work(_task uuid, _to uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare t record; previous uuid;
begin
  select * into t from public.tasks where id = _task;
  if not found then
    raise exception 'That task is unavailable.' using errcode = '42501';
  end if;
  if t.matter_id is null then
    -- Unfiled work is author-only. There is nobody to hand it to, because
    -- nobody else can see it.
    raise exception 'File this to a matter before handing it over.' using errcode = '42501';
  end if;
  if not public.can_write_matter(t.matter_id) then
    raise exception 'You cannot hand over work on this matter.' using errcode = '42501';
  end if;
  if _to is not null and not exists (select 1 from public.matter_members
                                      where matter_id = t.matter_id and user_id = _to) then
    raise exception 'You can only hand work to somebody on this matter.' using errcode = '42501';
  end if;

  previous := t.assignee_id;
  if previous is not distinct from _to then return; end if;

  update public.tasks set assignee_id = _to where id = _task;

  -- The reassignment history, as audit events rather than a history table. The
  -- matter scope means it inherits the matter's visibility, so it says no more
  -- than the task it is about.
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

-- The same act on a flow deliverable, whose responsible person is `owner_id`.
create or replace function public.set_deliverable_owner(_deliverable uuid, _to uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare target uuid; previous uuid; nm text;
begin
  target := public.deliverable_matter(_deliverable);
  if target is null then
    raise exception 'That deliverable is unavailable.' using errcode = '42501';
  end if;
  if not public.can_write_matter(target) then
    raise exception 'You cannot change who owns this deliverable.' using errcode = '42501';
  end if;
  if _to is not null and not exists (select 1 from public.matter_members
                                      where matter_id = target and user_id = _to) then
    raise exception 'You can only hand work to somebody on this matter.' using errcode = '42501';
  end if;

  select owner_id, name into previous, nm from public.flow_deliverables where id = _deliverable;
  if previous is not distinct from _to then return; end if;

  update public.flow_deliverables set owner_id = _to where id = _deliverable;

  insert into public.audit_events
    (matter_id, actor_id, actor_name, event_type, entity_type, entity_id, summary, metadata)
  values (target, auth.uid(),
          coalesce((select coalesce(p.full_name, p.email) from public.profiles p
                     where p.id = auth.uid()), 'Unknown'),
          'work.handed_off', 'deliverable', _deliverable,
          format('Handed over: %s', nm),
          jsonb_build_object('from', previous, 'to', _to));
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. What a screen needs
-- ---------------------------------------------------------------------------
--
-- The same arrangement as `thread_context()` and `review_for()`: the interface
-- asks rather than deriving, so the Decline button appears on exactly the tasks
-- the database would let this person decline.

create or replace function public.task_actions(_task uuid)
returns table (i_may_decline boolean, i_may_assign boolean, asked_by uuid)
language plpgsql stable security definer set search_path = public
as $$
declare t record;
begin
  select * into t from public.tasks where id = _task;
  if not found then return; end if;
  if t.matter_id is not null and not public.is_matter_member(t.matter_id) then
    return;  -- Nothing. Not a row of nulls.
  end if;
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
  'Whether the caller may decline or hand over one task, and who asked for it. Answers with the same rules the functions enforce, so no control is drawn that would be refused.';

-- ---------------------------------------------------------------------------
-- 5. The history is written by the table, not by the screen that happened to
--    change it
-- ---------------------------------------------------------------------------
--
-- `set_deliverable_owner()` above is the explicit "hand this over" act. It is
-- NOT the only way a deliverable changes hands: the deliverable dialog sets an
-- owner through the flow's bulk diff-and-upsert save, which never calls it. An
-- audit row written inside the function would therefore record some handovers
-- and silently miss others — reassignment history that is right most of the
-- time, which is worse than none because people would trust it.
--
-- So the history is a trigger. Every path that changes `owner_id` writes the
-- row, including paths nobody has written yet.
--
-- The membership check moves here for the same reason. Responsibility for part
-- of a file cannot sit with somebody who is not on the file — the task panel
-- has said so in a comment since Phase 2 — and until now the flow dialog could
-- quietly do it anyway.

create or replace function public.audit_deliverable_owner()
returns trigger language plpgsql security definer set search_path = public
as $$
declare target uuid;
begin
  if new.owner_id is not distinct from old.owner_id then return new; end if;
  target := public.deliverable_matter(new.id);
  if target is null then return new; end if;

  if new.owner_id is not null
     and not exists (select 1 from public.matter_members
                      where matter_id = target and user_id = new.owner_id) then
    raise exception 'A deliverable can only be owned by somebody on the matter.'
      using errcode = '42501';
  end if;

  insert into public.audit_events
    (matter_id, actor_id, actor_name, event_type, entity_type, entity_id, summary, metadata)
  values (target, auth.uid(),
          coalesce((select coalesce(p.full_name, p.email) from public.profiles p
                     where p.id = auth.uid()), 'Unknown'),
          'work.handed_off', 'deliverable', new.id,
          format('Handed over: %s', new.name),
          jsonb_build_object('from', old.owner_id, 'to', new.owner_id));
  return new;
end;
$$;

drop trigger if exists flow_deliverables_audit_owner on public.flow_deliverables;
create trigger flow_deliverables_audit_owner after update of owner_id on public.flow_deliverables
  for each row execute function public.audit_deliverable_owner();

-- And the function stops writing its own row, now that the table writes one.
create or replace function public.set_deliverable_owner(_deliverable uuid, _to uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare target uuid;
begin
  target := public.deliverable_matter(_deliverable);
  if target is null then
    raise exception 'That deliverable is unavailable.' using errcode = '42501';
  end if;
  if not public.can_write_matter(target) then
    raise exception 'You cannot change who owns this deliverable.' using errcode = '42501';
  end if;
  -- Membership is checked by the trigger, on every path rather than this one.
  update public.flow_deliverables set owner_id = _to where id = _deliverable;
end;
$$;
