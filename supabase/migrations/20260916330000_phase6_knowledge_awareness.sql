-- PHASE 6, STEP 4: two knowledge events a lawyer would expect to be told about.
--
-- The enumerated predicate gains exactly two lines, and the test for both is
-- the one Phase 5 left behind: WOULD THIS LAWYER REASONABLY EXPECT TO KNOW
-- THIS HAPPENED?
--
--   something shared DIRECTLY WITH ME — a share nobody mentions is a share
--   nobody uses;
--
--   knowledge I MAINTAIN being approved — a decision about my work, taken by
--   somebody else.
--
-- Deliberately not: a firm-wide item being edited, a visibility change, an
-- approval on somebody else's work, an approval going stale. Those are things
-- that happened, not things that happened to me. §19 is explicit that this
-- must not become a notification project, and the way that starts is by
-- notifying people about knowledge they merely have access to.
--
-- Note what carries the boundary here: `audit_event_visible()` already ties a
-- knowledge event to the object, and this function is SECURITY INVOKER, so a
-- share of something you cannot see cannot reach your bell even if the
-- predicate below matched. The rule is inherited rather than restated.

create or replace function public.events_involving_me(_limit integer default 30)
returns table (
  id uuid, matter_id uuid, event_type text, summary text, actor_id uuid, actor_name text,
  entity_type text, entity_id uuid, created_at timestamptz, is_new boolean)
language plpgsql stable security invoker set search_path = public
as $$
declare seen timestamptz := public.my_notifications_seen_at();
begin
  return query
  select e.id, e.matter_id, e.event_type, e.summary, e.actor_id, e.actor_name,
         e.entity_type, e.entity_id, e.created_at,
         (e.created_at >= coalesce(seen, '-infinity'::timestamptz))
    from public.audit_events e
   where e.actor_id is distinct from auth.uid()
     and (
       (e.entity_type = 'comment' and exists (
          select 1 from public.comments c
           where c.id = e.entity_id
             and (auth.uid() = any (c.mentions)
                  or c.author_id = auth.uid()
                  or exists (select 1 from public.comments mine
                              where mine.author_id = auth.uid()
                                and mine.entity_kind = c.entity_kind
                                and mine.entity_id = c.entity_id)
                  or public.entity_owner(c.entity_kind::text, c.entity_id) = auth.uid())))

       or (e.entity_type = 'task' and exists (
             select 1 from public.tasks t
              where t.id = e.entity_id
                and (t.assignee_id = auth.uid() or t.created_by = auth.uid())))

       or (e.entity_type = 'approval' and exists (
             select 1 from public.approvals a
              where a.id = e.entity_id
                and (a.assigned_to = auth.uid() or a.requested_by = auth.uid())))

       or (e.entity_type = 'clause'
           and e.event_type in ('change.settled', 'clause.edited')
           and public.entity_owner('clause', e.entity_id) = auth.uid())

       or (e.event_type = 'lease.broken'
           and (e.metadata->>'held_by')::uuid = auth.uid())

       or (e.entity_type = 'deliverable'
           and public.entity_owner('deliverable', e.entity_id) = auth.uid())

       -- Knowledge, and only these two.
       or (e.event_type = 'knowledge.shared'
           and (e.metadata->>'with')::uuid = auth.uid())
       or (e.event_type = 'knowledge.approved'
           and public.knowledge_owner(e.entity_type, e.entity_id) = auth.uid())
     )
   order by e.created_at desc
   limit greatest(1, least(coalesce(_limit, 30), 100));
end;
$$;
