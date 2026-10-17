-- PHASE 5, STEP 5: leases, presence, and clauses going live.
--
-- ---------------------------------------------------------------------------
-- A LEASE IS NEVER A PERMISSION
-- ---------------------------------------------------------------------------
--
-- This is the whole doctrine of this step and every function below is written
-- to make it unfalsifiable. Holding a clause grants NOTHING. `can_write_matter`
-- decides whether you may write; `can_settle_change` decides whether you may
-- settle. The lease decides only who is currently at the keyboard, so that two
-- lawyers do not silently overwrite one another.
--
-- Put the other way: every check the previous step installed still runs, in the
-- same order, whether or not a lease exists. If the lease table were dropped
-- tomorrow, nobody would gain a single right.
--
-- ---------------------------------------------------------------------------
-- WHAT THE DATABASE ACTUALLY REFUSES, AND WHY IT IS TWO RULES
-- ---------------------------------------------------------------------------
--
-- It would be easy to write one rule — "you may not save without a live lease"
-- — and believe the problem solved. That rule is both too strict and too weak.
--
-- Too strict: a lease expires by itself, on purpose, so that a closed laptop
-- never shuts a colleague out. If an expired lease also forbade the saving, a
-- lawyer who stepped away mid-clause would come back to a refusal and lose the
-- work, with nobody else waiting on the clause. That is obstruction with no
-- beneficiary.
--
-- Too weak: a lease says nothing about what the document looked like when you
-- started typing. Two people can each hold the clause at different moments,
-- neither lease overlapping, and the second still silently destroys the first's
-- wording — the lost update the lease was supposed to be about.
--
-- So there are two rules, and they answer different questions:
--
--   THE LEASE RULE       A save is refused while SOMEBODY ELSE holds a live
--                        lease. This is what makes a broken or expired lease
--                        bite: it bites when, and only when, the clause has
--                        actually passed to another lawyer.
--
--   THE STALENESS RULE   A save may carry `_seen` — the clause's `updated_at`
--                        as the editor loaded it. If the clause has moved
--                        since, the save is refused. This is the real
--                        lost-update guard, and it holds even where no lease
--                        was ever taken.
--
-- The lease is the courtesy that stops the collision happening; the staleness
-- check is the rule that catches it when the courtesy was not observed.
--
-- ---------------------------------------------------------------------------
-- BREAKING IS THE LEAD'S, WAITING IS EVERYBODY ELSE'S
-- ---------------------------------------------------------------------------
--
-- Kwame's third refinement. An ordinary Editor who finds a clause held waits
-- for it to expire — two minutes, unattended — or asks. Only the matter Lead
-- may take a clause out of a colleague's hands while they are still in it, and
-- when they do it is an audited act with the interrupted person's name on it,
-- and that person is told through the awareness layer.
--
-- Taking somebody's work away from them mid-sentence is a real thing to do to a
-- colleague. It should be possible, attributable, and rare.

-- ---------------------------------------------------------------------------
-- 0. The lease table's own policies, which were wider than they read
-- ---------------------------------------------------------------------------
--
-- FOUND WHILE READING FOR THIS STEP, and worth stating plainly because it is
-- the Phase 3 doctrine again: ABSENCE OF NARROWER SCOPE NEVER WIDENS ACCESS.
--
--   insert with check (user_id = auth.uid())
--
-- The row is signed, so nobody could take a lease in another lawyer's name —
-- which is what the policy was written to stop, and it does. But it says
-- nothing at all about the matter. Anybody authenticated could insert a lease
-- row against any clause id on any matter, including one they have no access
-- to and cannot read back. They would gain no ability to read the clause and no
-- ability to write it. They would simply hold it, and every genuine member of
-- that matter would find their own clause occupied by a person whose name they
-- are not permitted to see.
--
-- A denial of service across the confidentiality boundary is still a crossing
-- of the confidentiality boundary. The update and delete policies had the same
-- shape: `expires_at < now()` let any authenticated user clear a lease row on a
-- matter they are not on.

-- Signed AND scoped, on all four — and the matter is DERIVED FROM THE CLAUSE
-- rather than read off the row being written.
--
-- The first version of this fix trusted the row: `when matter_id is not null
-- then can_write_matter(matter_id) else true`. The suite broke it in four
-- moves, each of which is the same mistake wearing a different hat:
--
--   leave matter_id off the row       the `else true` branch waves it through
--   name a matter you ARE on          for a clause on one you are not
--   call it a 'document'              and no branch applies at all
--   own a lease, then move it         UPDATE had no WITH CHECK, so the row
--                                     could be pointed anywhere after the fact
--
-- A row cannot be asked to vouch for itself. `clause_matter()` is a security
-- definer lookup of where the clause actually lives, and the policies compare
-- the row to that. The kind is pinned to 'clause' because that is the only
-- thing this table has ever leased — a future kind must add its own branch,
-- which fails in the safe direction rather than inheriting a permissive else.

-- Including the read. This was the last place a lease row vouched for its own
-- matter, and while the insert policy now makes an inconsistent row impossible
-- to create, a policy that is only correct because another policy is correct is
-- not a policy anybody should have to reason about. Judged by the clause.
drop policy if exists "members read locks" on public.edit_locks;
create policy "members read locks" on public.edit_locks for select to authenticated
  using (
    case when entity_kind = 'clause'
         then public.is_matter_member(public.clause_matter(entity_id))
         -- Nothing has ever leased anything else. If something does, it is
         -- private to its holder until this gains a branch for it.
         else user_id = auth.uid() end);

drop policy if exists "holders take locks" on public.edit_locks;
create policy "holders take locks" on public.edit_locks for insert to authenticated
  with check (
    user_id = auth.uid()
    and entity_kind = 'clause'
    and public.clause_matter(entity_id) is not null
    and matter_id is not distinct from public.clause_matter(entity_id)
    and public.can_write_matter(public.clause_matter(entity_id)));

drop policy if exists "holders refresh locks" on public.edit_locks;
create policy "holders refresh locks" on public.edit_locks for update to authenticated
  using (
    entity_kind = 'clause'
    and public.is_matter_member(public.clause_matter(entity_id))
    and (user_id = auth.uid() or expires_at < now()))
  -- WITH CHECK, because a USING-only update policy judges the row you started
  -- with and never the row you end up with.
  with check (
    user_id = auth.uid()
    and entity_kind = 'clause'
    and matter_id is not distinct from public.clause_matter(entity_id)
    and public.can_write_matter(public.clause_matter(entity_id)));

drop policy if exists "holders release locks" on public.edit_locks;
create policy "holders release locks" on public.edit_locks for delete to authenticated
  using (
    entity_kind = 'clause'
    and public.is_matter_member(public.clause_matter(entity_id))
    and (user_id = auth.uid() or expires_at < now()));

-- ---------------------------------------------------------------------------
-- 1. Reading a lease
-- ---------------------------------------------------------------------------
--
-- SECURITY INVOKER. A function that reports on a row must not read that row
-- with more authority than its caller — the rule Phase 4 left behind after
-- `task_actions()` and `review_for()` were found answering questions about
-- objects their callers could not see. The lease policy above therefore does
-- the filtering, and a non-member gets an empty row rather than a name.

create or replace function public.clause_lease(_clause uuid)
returns table (holder uuid, holder_name text, since timestamptz, expires_at timestamptz, is_mine boolean)
language sql stable security invoker set search_path = public
as $$
  select l.user_id,
         coalesce(p.full_name, p.email, 'Somebody'),
         l.acquired_at, l.expires_at,
         l.user_id = auth.uid()
    from public.edit_locks l
    left join public.profiles p on p.id = l.user_id
   where l.entity_kind = 'clause' and l.entity_id = _clause
     and l.expires_at > now();
$$;

comment on function public.clause_lease(uuid) is
  'Who currently holds this clause, if anybody. SECURITY INVOKER, so a non-member sees nothing rather than a name. An expired lease is not a lease and is never returned.';

-- ---------------------------------------------------------------------------
-- 2. Taking, refreshing, releasing
-- ---------------------------------------------------------------------------
--
-- SECURITY DEFINER, because taking a clause has to be able to see a lease held
-- by somebody whose row the caller could otherwise contend with — but the FIRST
-- thing each of them does is ask `can_write_matter`. A reader cannot hold a
-- clause, not because holding would let them write it (it would not) but
-- because a lease that a reader can take is a lease a reader can use to keep a
-- writer out.

create or replace function public.take_clause(_clause uuid)
returns table (taken boolean, holder uuid, holder_name text, expires_at timestamptz)
language plpgsql security definer set search_path = public
as $$
declare
  target uuid;
  live record;
  until timestamptz := now() + interval '2 minutes';
begin
  select matter_id into target from public.clauses where id = _clause;
  if target is null or not public.is_matter_member(target) then
    raise exception 'That clause is unavailable.' using errcode = '42501';
  end if;
  -- A lease is never a permission, so it is never granted to somebody who has
  -- nothing to do with it.
  if not public.can_write_matter(target) then
    raise exception 'That clause is not yours to edit.' using errcode = '42501';
  end if;

  select l.user_id, l.expires_at into live
    from public.edit_locks l
   where l.entity_kind = 'clause' and l.entity_id = _clause and l.expires_at > now();

  if live.user_id is not null and live.user_id <> auth.uid() then
    return query
      select false, live.user_id,
             coalesce((select coalesce(p.full_name, p.email) from public.profiles p
                        where p.id = live.user_id), 'Somebody'),
             live.expires_at;
    return;
  end if;

  insert into public.edit_locks (entity_kind, entity_id, matter_id, user_id,
                                 acquired_at, refreshed_at, expires_at)
  values ('clause', _clause, target, auth.uid(), now(), now(), until)
  on conflict (entity_kind, entity_id) do update
    set matter_id = excluded.matter_id,
        user_id = excluded.user_id,
        -- An expired lease retaken by the same person starts a new holding.
        acquired_at = case when public.edit_locks.user_id = auth.uid()
                             and public.edit_locks.expires_at > now()
                           then public.edit_locks.acquired_at else now() end,
        refreshed_at = now(),
        expires_at = excluded.expires_at;

  return query select true, auth.uid(), null::text, until;
end;
$$;

comment on function public.take_clause(uuid) is
  'Take or renew the lease on a clause. Returns taken=false and the current holder if somebody else has it. Grants no rights whatsoever — can_write_matter still decides every write.';

-- Refreshing is deliberately not the same call as taking. A heartbeat that
-- could acquire would let a client that has lost the clause silently steal it
-- back the moment the new holder's lease lapsed, which is not what the person
-- at the keyboard asked for.
create or replace function public.refresh_clause(_clause uuid)
returns timestamptz language plpgsql security definer set search_path = public
as $$
declare until timestamptz := now() + interval '2 minutes';
begin
  update public.edit_locks
     set refreshed_at = now(), expires_at = until
   where entity_kind = 'clause' and entity_id = _clause
     and user_id = auth.uid() and expires_at > now();
  if not found then return null; end if;
  return until;
end;
$$;

comment on function public.refresh_clause(uuid) is
  'Heartbeat. Extends a lease the caller already holds and still holds. Returns null if it has lapsed or passed to somebody else — it never acquires.';

create or replace function public.release_clause(_clause uuid)
returns void language sql security definer set search_path = public
as $$
  delete from public.edit_locks
   where entity_kind = 'clause' and entity_id = _clause and user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- 3. Breaking, which is the Lead's alone
-- ---------------------------------------------------------------------------

create or replace function public.break_clause_lease(_clause uuid)
returns table (taken boolean, holder uuid, holder_name text, expires_at timestamptz)
language plpgsql security definer set search_path = public
as $$
declare
  target uuid;
  held uuid;
  held_name text;
begin
  select matter_id into target from public.clauses where id = _clause;
  if target is null or not public.is_matter_member(target) then
    raise exception 'That clause is unavailable.' using errcode = '42501';
  end if;
  if not public.is_matter_lead(target) then
    raise exception 'Only the matter Lead can take a clause out of a colleague''s hands. An Editor waits for the lease to lapse.'
      using errcode = '42501';
  end if;

  select l.user_id into held from public.edit_locks l
   where l.entity_kind = 'clause' and l.entity_id = _clause and l.expires_at > now();

  if held is not null and held <> auth.uid() then
    select coalesce(p.full_name, p.email, 'Somebody') into held_name
      from public.profiles p where p.id = held;

    -- The act, named, with the interrupted person in the metadata so the
    -- awareness layer can tell them. The clause text is not here and never is.
    insert into public.audit_events
      (matter_id, actor_id, actor_name, event_type, entity_type, entity_id, summary, metadata)
    values (target, auth.uid(),
            coalesce((select coalesce(p.full_name, p.email) from public.profiles p
                       where p.id = auth.uid()), 'Unknown'),
            'lease.broken', 'clause', _clause,
            format('Took the clause from %s', held_name),
            jsonb_build_object('held_by', held));
  end if;

  delete from public.edit_locks
   where entity_kind = 'clause' and entity_id = _clause;

  return query select * from public.take_clause(_clause);
end;
$$;

comment on function public.break_clause_lease(uuid) is
  'Take a clause from a colleague who is still in it. Lead only, audited, and the interrupted lawyer is told. An ordinary Editor waits for expiry.';

-- ---------------------------------------------------------------------------
-- 4. Presence, which is a row and not a channel
-- ---------------------------------------------------------------------------
--
-- Phase 4 refused presence channels, and the objection stands: channel
-- membership is a second authorisation surface, and a matter-keyed channel
-- would need its own join check written from scratch.
--
-- This sidesteps it rather than overruling it. A lease is a ROW, in a table
-- with a policy, on a matter. Reading who is in the document is reading rows
-- you were already entitled to read, through the boundary that already exists.
-- Nothing new is authorised.
--
-- What it therefore cannot show: somebody reading the matter without editing
-- anything. That is a real limitation and it is the right one — "who has this
-- open" is ambient surveillance of a colleague, while "who is in this clause"
-- is a fact you need in order not to collide with them.

create or replace function public.matter_presence(_matter uuid)
returns table (user_id uuid, name text, clause_id uuid, clause_num text,
               since timestamptz, expires_at timestamptz)
language sql stable security invoker set search_path = public
as $$
  select l.user_id,
         coalesce(p.full_name, p.email, 'Somebody'),
         c.id, c.num, l.acquired_at, l.expires_at
    from public.edit_locks l
    join public.clauses c on c.id = l.entity_id
    left join public.profiles p on p.id = l.user_id
   where l.entity_kind = 'clause'
     and l.matter_id = _matter
     and l.expires_at > now()
     and l.user_id is distinct from auth.uid()
   order by l.acquired_at;
$$;

comment on function public.matter_presence(uuid) is
  'Who is in which clause on this matter, read from the lease rows. SECURITY INVOKER — the edit_locks policy is the boundary, and no presence channel is introduced.';

-- ---------------------------------------------------------------------------
-- 5. Saving, with the two rules
-- ---------------------------------------------------------------------------
--
-- Dropped and recreated rather than overloaded: a third argument with a default
-- alongside the two-argument original would leave every existing call
-- ambiguous, and an ambiguous security function is not a security function.

drop function if exists public.save_clause_doc(uuid, jsonb);

create or replace function public.save_clause_doc(_clause uuid, _doc jsonb, _seen timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  target uuid;
  previous jsonb;
  moved timestamptz;
  me text := auth.uid()::text;
  live record;
  rec record;
  added integer := 0;
  settled integer := 0;
begin
  select matter_id, doc, updated_at into target, previous, moved
    from public.clauses where id = _clause;
  if target is null then
    raise exception 'That clause is unavailable.' using errcode = '42501';
  end if;

  -- Permission first, and permission alone. Nothing below this line is allowed
  -- to be the reason somebody may write.
  if not public.can_write_matter(target) then
    raise exception 'That clause is not yours to edit.' using errcode = '42501';
  end if;

  -- THE LEASE RULE. Only ever a refusal, never a grant.
  select l.user_id, l.expires_at into live
    from public.edit_locks l
   where l.entity_kind = 'clause' and l.entity_id = _clause and l.expires_at > now();
  if live.user_id is not null and live.user_id <> auth.uid() then
    raise exception 'This clause is open with %. Your changes have not been saved — they are still on your screen.',
      coalesce((select coalesce(p.full_name, p.email) from public.profiles p
                 where p.id = live.user_id), 'another lawyer')
      using errcode = '55006';
  end if;

  -- THE STALENESS RULE. Holds whether or not a lease was ever taken.
  if _seen is not null and moved is not null and moved > _seen then
    raise exception 'This clause moved while you were editing it. Your changes have not been saved — they are still on your screen.'
      using errcode = '40001';
  end if;

  -- (a) Nothing may be introduced in somebody else's name, and nothing already
  --     here may be re-attributed.
  for rec in
    select n.change_id, n.author_id, p.author_id as was
      from public.doc_change_marks(_doc) n
      left join public.doc_change_marks(coalesce(previous, '{}'::jsonb)) p
        on p.change_id = n.change_id
  loop
    if rec.was is null then
      if rec.author_id is distinct from me then
        raise exception 'A change can only be made in your own name.' using errcode = '42501';
      end if;
      added := added + 1;
    elsif rec.author_id is distinct from rec.was then
      raise exception 'A change cannot be re-attributed.' using errcode = '42501';
    end if;
  end loop;

  -- (b) Anything that has GONE was settled, and settling is a right.
  for rec in
    select p.change_id, p.author_id
      from public.doc_change_marks(coalesce(previous, '{}'::jsonb)) p
      left join public.doc_change_marks(_doc) n on n.change_id = p.change_id
     where n.change_id is null
  loop
    if not public.can_settle_change(_clause, rec.author_id) then
      raise exception 'That wording is not yours to settle. The matter Lead, the clause''s assignee, or a reviewer it is addressed to can.'
        using errcode = '42501';
    end if;
    settled := settled + 1;
  end loop;

  update public.clauses set doc = _doc, updated_at = now() where id = _clause;

  -- Saving is being at the keyboard, so it renews a lease already held. It
  -- does not acquire one: a save by somebody holding nothing stays holding
  -- nothing, which keeps the lease honest as a report of where people are.
  update public.edit_locks
     set refreshed_at = now(), expires_at = now() + interval '2 minutes'
   where entity_kind = 'clause' and entity_id = _clause
     and user_id = auth.uid() and expires_at > now();

  if added > 0 or settled > 0 then
    insert into public.audit_events
      (matter_id, actor_id, actor_name, event_type, entity_type, entity_id, summary, metadata)
    values (target, auth.uid(),
            coalesce((select coalesce(p.full_name, p.email) from public.profiles p
                       where p.id = auth.uid()), 'Unknown'),
            case when added > 0 and settled > 0 then 'clause.edited'
                 when added > 0 then 'change.proposed'
                 else 'change.settled' end,
            'clause', _clause,
            format('%s proposed, %s settled', added, settled),
            jsonb_build_object('proposed', added, 'settled', settled));
  end if;

  return jsonb_build_object('proposed', added, 'settled', settled);
end;
$$;

comment on function public.save_clause_doc(uuid, jsonb, timestamptz) is
  'The one way a clause document is written. Refuses a save while another lawyer holds the clause, refuses a save built on a stale read, and validates that nothing is written in another lawyer''s name, nothing re-attributed, and nothing settled the caller had no right to settle.';

-- ---------------------------------------------------------------------------
-- 6. Being told your clause was taken
-- ---------------------------------------------------------------------------
--
-- The enumerated predicate gains exactly one line. If this list ever cannot be
-- read in a paragraph, the awareness layer has drifted into the feed we refused
-- to build — so the line is as narrow as the fact: the person whose lease was
-- broken, and nobody else.

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

       -- The Lead took a clause out of MY hands. Told to the interrupted
       -- lawyer only; it is not news to anybody else.
       or (e.event_type = 'lease.broken'
           and (e.metadata->>'held_by')::uuid = auth.uid())

       or (e.entity_type = 'deliverable'
           and public.entity_owner('deliverable', e.entity_id) = auth.uid())
     )
   order by e.created_at desc
   limit greatest(1, least(coalesce(_limit, 30), 100));
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Clauses go live
-- ---------------------------------------------------------------------------
--
-- Phase 4 refused this, and refused it in code: its realtime migration raises
-- if `clauses` is in the publication. The reason was stated precisely and it
-- was not performance — turning on live clause updates before there was a
-- model for concurrent editing would have established LAST WRITE WINS as the
-- behaviour, and Phase 5 would have had to unpick it from a product people had
-- already learned.
--
-- That reason is now spent. The two rules above mean the last write does not
-- win: it is refused, with the losing lawyer's text left on their screen. So
-- the prohibition is lifted for `clauses` and for `clauses` alone.
--
-- `documents` and `document_versions` stay out. Nothing has changed about
-- them: there is no lease on a whole document and no merge model for one, and
-- publishing them would reintroduce exactly the behaviour this step exists to
-- prevent, one level up.
--
-- REPLICA IDENTITY STAYS DEFAULT. `replica identity full` would put the whole
-- previous document in every payload — the old text of a clause, to every
-- subscriber, on every keystroke-batch. A subscriber who needs the previous
-- wording reads a revision, which is a row with a policy on it.

-- `edit_locks` joins them, so that somebody ARRIVING in a clause lands at once
-- rather than on the next poll. Only arrival: nobody writes a row when a lease
-- lapses, so an expiry is not an event and cannot be pushed. The clients poll
-- for that, which is the mechanism that matches the fact.
do $$
declare t text;
begin
  foreach t in array array['clauses', 'edit_locks'] loop
    if not exists (
      select 1 from pg_publication_rel pr
        join pg_publication p on p.oid = pr.prpubid
        join pg_class c on c.oid = pr.prrelid
        join pg_namespace n on n.oid = c.relnamespace
       where p.pubname = 'supabase_realtime' and n.nspname = 'public' and c.relname = t)
    then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- The guard Phase 4 wrote, minus the one table this step deliberately admits.
do $$
declare leaked text;
begin
  select string_agg(c.relname, ' ') into leaked
    from pg_publication_rel pr
    join pg_publication p on p.oid = pr.prpubid
    join pg_class c on c.oid = pr.prrelid
    join pg_namespace n on n.oid = c.relnamespace
   where p.pubname = 'supabase_realtime' and n.nspname = 'public'
     and c.relname in ('documents', 'contract_drafts', 'drafts',
                       'corporate_documents', 'document_versions');
  if leaked is not null then
    raise exception 'Refusing to finish: whole-document text must not be published to realtime (%). There is no lease on a document.', leaked;
  end if;

  -- And a published table without row-level security is a firehose.
  if not (select relrowsecurity from pg_class where oid = 'public.clauses'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.edit_locks'::regclass) then
    raise exception 'Refusing to publish: row-level security is not enabled on clauses or edit_locks.';
  end if;

  if (select relreplident from pg_class where oid = 'public.clauses'::regclass) = 'f' then
    raise exception 'Refusing to finish: clauses is set to replica identity full, which would put the previous document text in every payload.';
  end if;
end $$;
