-- PHASE 4: a resubmitted review arrives as work, like the first one did.
--
-- Found in the two-user acceptance test, at the point of the round trip that
-- the round trip exists for.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS WRONG
-- ---------------------------------------------------------------------------
--
-- `Changes requested → Requested` is the author saying "I have dealt with your
-- points, look again". It moved the status and nothing else:
--
--   review status   Changes requested  →  Requested     ✓
--   reviewer's task Done               →  Done          ✗
--
-- So the review was waiting on the reviewer, and the reviewer had no work item
-- and no signal. The first pass arrives in their Tasks list; the second pass
-- arrives nowhere.
--
-- That is precisely the thing step 4 was shaped to avoid. `request_review()`
-- creates a task in the same breath as the approval, with a comment above it
-- saying "a review that arrives as a notice nobody checks is the failure this
-- is shaped to avoid" — and then the second lap silently became that.
--
-- The task is closed on the way out, in this same trigger, because a task for a
-- review that has left your hands is an orphan. The mistake was doing half of a
-- symmetric pair: closing it when the review leaves, and never reopening it when
-- the review comes back.
--
-- WHY THE SUITE MISSED IT. `phase4_review.sql` asserts T06 — "the author
-- resubmits" — by checking that the status returns to `Requested`, and then
-- moves on to the next state. It never looked at the task. The assertion tested
-- the thing I was thinking about rather than the thing that mattered, which is
-- the same shape as the author_id defect: a suite agreeing with its own idea of
-- the feature.
--
-- ---------------------------------------------------------------------------
-- AND WHO MAY RESUBMIT
-- ---------------------------------------------------------------------------
--
-- The plan says `Changes requested` moves on by "the author, by resubmitting".
-- `can_move_review()` admits the addressee for ANY legal transition, so the
-- REVIEWER was being offered Resubmit — a button that bounced their own request
-- back into their own queue.
--
-- Not a security hole: the reviewer is entitled to be involved in this review,
-- and nothing escapes the matter. But it is meaningless as an act, and an
-- interface that offers a meaningless act teaches people that the controls are
-- decorative. The move belongs to the person whose work is being resubmitted,
-- or to the Lead.

create or replace function public.enforce_review_move()
returns trigger language plpgsql security definer set search_path = public
as $$
declare target uuid := public.comment_matter(new.entity_kind::text, new.entity_id);
begin
  if new.entity_kind is distinct from old.entity_kind
     or new.entity_id is distinct from old.entity_id
     or new.workspace_id is distinct from old.workspace_id
     or new.requested_by is distinct from old.requested_by then
    raise exception 'A review cannot be moved to another entity.' using errcode = '42501';
  end if;

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

    -- Resubmitting belongs to whoever's work is being resubmitted, or the Lead.
    -- The reviewer may not hand their own request back to themselves.
    if old.status = 'Changes requested' and new.status = 'Requested' then
      if not (old.requested_by = auth.uid()
              or (target is not null and public.is_matter_lead(target))) then
        raise exception 'Only the person whose work this is, or the matter Lead, can resubmit it.'
          using errcode = '42501';
      end if;
    end if;

    if new.status in ('Approved', 'Rejected', 'Changes requested') then
      new.decided_by := auth.uid();
      new.decided_at := now();
    elsif new.status = 'Requested' then
      new.decided_by := null;
      new.decided_at := null;
    end if;

    -- THE SYMMETRIC PAIR, both halves now.
    --
    -- Out: the reviewer's task closes when the review leaves their hands,
    --      because a task for a review that is no longer theirs is an orphan.
    -- Back: it reopens when the review returns to them, because otherwise the
    --      second lap of the round trip arrives nowhere at all.
    if new.task_id is not null then
      if new.status in ('Approved', 'Rejected', 'Changes requested') then
        update public.tasks set status = 'Done'
         where id = new.task_id and status <> 'Done';
      elsif new.status = 'Requested' then
        update public.tasks set status = 'Open'
         where id = new.task_id and status = 'Done';
      end if;
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
