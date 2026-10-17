-- PHASE 5, STEP 4: things I should know happened.
--
--   Tasks           what I must do
--   Notifications   what I should know happened      ← this
--   Matter Activity what happened on the file
--
-- The middle one was missing, and Phase 4's acceptance test produced the
-- sharpest argument for it: Kwame could not find a review he had requested four
-- minutes earlier, on a matter with one contract, because the clause selection
-- had moved by one row.
--
-- ---------------------------------------------------------------------------
-- WHAT MAKES AN EVENT MINE
-- ---------------------------------------------------------------------------
--
-- "Involving me" is doing all the work in the requirement, and it is exactly
-- where this feature would become the feed we refused to build. So the
-- predicate is ENUMERATED, and if it ever cannot be written in a paragraph the
-- feature has drifted:
--
--   a comment or reply on a thread I am in
--   a mention of me
--   a request or assignment TO me, and a decline OF SOMETHING I ASKED FOR
--   a review addressed to me — requested, or resubmitted
--   a review I ASKED FOR — started, changes requested, approved, rejected
--   a change on wording I am responsible for, settled by somebody else
--
-- The third, fourth and fifth lines are where BOTH ENDS are covered. That is
-- the half Phase 4 was missing: the reviewer got a task and the person who
-- asked got nothing.
--
-- ---------------------------------------------------------------------------
-- WHAT IT IS NOT
-- ---------------------------------------------------------------------------
--
-- No per-event read state and no table of notifications. One timestamp per
-- person — the same shape as `matter_members.mentions_seen_at`, which works —
-- and everything else derived from `audit_events` on read, so there is no
-- second write path and nothing that can drift from the audit trail.
--
-- Deriving also means the boundary is inherited rather than re-implemented:
-- `audit_event_visible()` already decides who may see an event, and it was
-- fixed in Phase 3d after it read research titles out loud to somebody with no
-- access to the research.

alter table public.profiles
  add column if not exists notifications_seen_at timestamptz;

-- Nobody learns when a colleague last looked at theirs. Same treatment as
-- mentions_seen_at: a table-level grant outranks a column-level revoke, so the
-- grant comes off and the columns are handed back.
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ')
    into cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'profiles'
     and column_name <> 'notifications_seen_at';
  execute 'revoke select, update on public.profiles from authenticated, anon';
  execute format('grant select (%s) on public.profiles to authenticated, anon', cols);
  execute format('grant update (%s) on public.profiles to authenticated, anon', cols);
end $$;

create or replace function public.mark_notifications_seen()
returns void language plpgsql security definer set search_path = public
as $$
begin
  update public.profiles set notifications_seen_at = clock_timestamp() where id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- Events involving me
-- ---------------------------------------------------------------------------
--
-- Derived from `audit_events`, filtered by the enumerated predicate, and every
-- row carrying enough to deep-link to the exact thing rather than to the matter
-- it happened on. An entry you cannot act on from is noise.

-- The caller's own seen-at, and only ever their own. The events themselves stay
-- SECURITY INVOKER so the audit policy filters them; this is the one value the
-- function needs that its caller is deliberately not allowed to read.
--
-- Found by the suite: the first version read the column inline and was refused
-- by its own privacy rule, which is the rule working.
create or replace function public.my_notifications_seen_at()
returns timestamptz language sql stable security definer set search_path = public
as $$ select notifications_seen_at from public.profiles where id = auth.uid(); $$;

create or replace function public.events_involving_me(_limit integer default 30)
returns table (
  id uuid, matter_id uuid, event_type text, summary text, actor_id uuid, actor_name text,
  entity_type text, entity_id uuid, created_at timestamptz, is_new boolean)
language plpgsql stable security invoker set search_path = public
as $$
declare seen timestamptz := public.my_notifications_seen_at();
begin
  -- SECURITY INVOKER, so `audit_events`' own policy filters the read. The
  -- awareness layer cannot show an event the matter would not show.
  return query
  select e.id, e.matter_id, e.event_type, e.summary, e.actor_id, e.actor_name,
         e.entity_type, e.entity_id, e.created_at,
         (e.created_at >= coalesce(seen, '-infinity'::timestamptz))
    from public.audit_events e
   where e.actor_id is distinct from auth.uid()        -- never your own doing
     and (
       -- A mention of me, or a comment on a thread I am in.
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

       -- Work asked of me, or a decline of something I asked for.
       or (e.entity_type = 'task' and exists (
             select 1 from public.tasks t
              where t.id = e.entity_id
                and (t.assignee_id = auth.uid() or t.created_by = auth.uid())))

       -- A review addressed to me, or one I asked for. BOTH ENDS.
       or (e.entity_type = 'approval' and exists (
             select 1 from public.approvals a
              where a.id = e.entity_id
                and (a.assigned_to = auth.uid() or a.requested_by = auth.uid())))

       -- Wording settled on a clause I am responsible for.
       or (e.entity_type = 'clause'
           and e.event_type in ('change.settled', 'clause.edited')
           and public.entity_owner('clause', e.entity_id) = auth.uid())

       -- A deliverable I own changing hands.
       or (e.entity_type = 'deliverable'
           and public.entity_owner('deliverable', e.entity_id) = auth.uid())
     )
   order by e.created_at desc
   limit greatest(1, least(coalesce(_limit, 30), 100));
end;
$$;

comment on function public.events_involving_me(integer) is
  'Collaboration events involving the caller, newest first. SECURITY INVOKER so the audit policy filters the read — the awareness layer can never show an event the matter would not. Never the caller''s own doing.';

-- How many are new. A dot, not a number that climbs — but the count is what
-- decides whether the dot is lit.
create or replace function public.unseen_event_count()
returns integer language sql stable security invoker set search_path = public
as $$
  select count(*)::integer from public.events_involving_me(100) where is_new;
$$;

do $$
begin
  if has_column_privilege('authenticated', 'public.profiles', 'notifications_seen_at', 'SELECT') then
    raise exception 'Refusing to finish: notifications_seen_at is readable by other people.';
  end if;
  if not has_column_privilege('authenticated', 'public.profiles', 'full_name', 'SELECT') then
    raise exception 'Refusing to finish: the rest of the profile stopped being readable.';
  end if;
end $$;
