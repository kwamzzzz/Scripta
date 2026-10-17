-- PHASE 5, STEP 5: leases, presence, and clauses going live.
--
-- The assertion this file exists for is L-PERM: A LEASE IS NEVER A PERMISSION.
-- Every other test here is about collision; that one is about the boundary, and
-- it is the one that would matter if the rest were wrong.
--
-- Runs against the live database as two real users and ROLLS BACK.
--
-- NOTE ON TIME. `now()` is the transaction's start time and does not advance
-- inside one, so expiry is simulated by pushing `expires_at` into the past
-- rather than by waiting. That is the same condition the functions actually
-- test, reached honestly.

begin;
create temp table r(test text, got text, want text) on commit drop;
create temp table fx(k text, v text) on commit drop;
grant all on r to authenticated;
grant all on fx to authenticated;

insert into fx values
 ('atlas','c0c2b172-4856-4e84-bf40-fafe7f9dee42'),
 ('ptm','99bc433c-4910-4c96-aa95-5196e0eae29d'),
 ('me','6df711b6-27b0-4aaf-8129-ef39700de7bb'),      -- Mawusi
 ('them','176d2a8c-10f1-429b-82f2-dde207c99a68');    -- Podrick
insert into fx select 'clause', id::text from public.clauses
  where matter_id = (select v::uuid from fx where k='atlas') order by ordinal limit 1;
insert into fx select 'clause2', id::text from public.clauses
  where matter_id = (select v::uuid from fx where k='atlas') order by ordinal offset 1 limit 1;
insert into fx select 'doc', coalesce(doc, '{"type":"doc","content":[]}'::jsonb)::text
  from public.clauses where id = (select v::uuid from fx where k='clause');

-- Roles are SET here rather than assumed, so the suite says what it tests
-- instead of depending on who happens to lead Atlas this week.
update public.matter_members set role = 'lead'
 where matter_id = (select v::uuid from fx where k='atlas')
   and user_id = (select v::uuid from fx where k='me');
update public.matter_members set role = 'editor'
 where matter_id = (select v::uuid from fx where k='atlas')
   and user_id = (select v::uuid from fx where k='them');

-- ===========================================================================
-- L — taking, finding it taken, and being refused
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
insert into r select 'L01 an Editor can take a free clause',
  (select taken::text from public.take_clause((select v::uuid from fx where k='clause'))), 'true';

set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
insert into r select 'L02 the next lawyer in finds it occupied',
  (select taken::text from public.take_clause((select v::uuid from fx where k='clause'))), 'false';
insert into r select 'L03 and is told whose it is',
  (select holder::text from public.take_clause((select v::uuid from fx where k='clause'))),
  (select v from fx where k='them');

-- The refusal that matters. Mawusi is the LEAD and can write every clause on
-- this matter; she is refused anyway, because the clause is in use.
do $t$
declare refused boolean := false;
begin
  begin
    perform public.save_clause_doc((select v::uuid from fx where k='clause'),
                                   (select v::jsonb from fx where k='doc'));
  exception when others then refused := true;
  end;
  insert into r select 'L04 a save into a clause somebody else holds is refused', refused::text, 'true';
end $t$;

-- ===========================================================================
-- L-PERM — A LEASE IS NEVER A PERMISSION
-- ===========================================================================
--
-- The two halves, and both have to hold for the sentence to mean anything:
-- holding gives you nothing you did not have, and the things you DO have are
-- not withdrawn because you failed to take a lease.

set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
declare refused boolean := false;
begin
  -- Podrick holds the clause. He is an Editor, not the Lead and not the
  -- assignee, so settling another lawyer's wording is still not his.
  insert into r select 'L05 holding a clause does not confer the right to settle',
    public.can_settle_change((select v::uuid from fx where k='clause'),
                             (select v from fx where k='me'))::text, 'false';

  -- And a clause nobody holds is still writable by somebody entitled to write
  -- it. A lease that had to be taken would be a permission by another name.
  begin
    perform public.save_clause_doc((select v::uuid from fx where k='clause2'),
      (select coalesce(doc,'{"type":"doc","content":[]}'::jsonb) from public.clauses
        where id = (select v::uuid from fx where k='clause2')));
  exception when others then refused := true;
  end;
  insert into r select 'L06 a save with no lease at all is allowed', refused::text, 'false';
end $t$;

-- ===========================================================================
-- B — breaking is the Lead's, waiting is everybody else's
-- ===========================================================================
--
-- Mawusi holds clause2 now (the save above was Podrick's; take it properly).
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
select public.take_clause((select v::uuid from fx where k='clause2'));

set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
declare refused boolean := false;
begin
  begin
    perform public.break_clause_lease((select v::uuid from fx where k='clause2'));
  exception when others then refused := true;
  end;
  insert into r select 'B01 an Editor cannot take a clause from a colleague', refused::text, 'true';
end $t$;

-- The Lead can, on the clause Podrick is holding.
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
insert into r select 'B02 the Lead can',
  (select taken::text from public.break_clause_lease((select v::uuid from fx where k='clause'))), 'true';
insert into r select 'B03 and it goes on the file, with the interrupted lawyer named',
  (select (metadata->>'held_by') from public.audit_events
    where event_type = 'lease.broken' and entity_id = (select v::uuid from fx where k='clause')
    order by created_at desc limit 1),
  (select v from fx where k='them');

set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
insert into r select 'B04 and the interrupted lawyer is told',
  (select count(*)::text from public.events_involving_me(100) where event_type = 'lease.broken'), '1';

-- ===========================================================================
-- E — an expired lease is not a lease
-- ===========================================================================
--
-- The clause frees itself, so a closed laptop never shuts a colleague out.
set local role postgres;
update public.edit_locks set expires_at = now() - interval '1 minute'
 where entity_kind = 'clause' and entity_id = (select v::uuid from fx where k='clause');
set local role authenticated;

insert into r select 'E01 an expired lease is never reported as a holder',
  (select count(*)::text from public.clause_lease((select v::uuid from fx where k='clause'))), '0';
insert into r select 'E02 and the clause can be taken by whoever wants it',
  (select taken::text from public.take_clause((select v::uuid from fx where k='clause'))), 'true';

-- The heartbeat cannot acquire. Mawusi's lease lapsed and Podrick took it; her
-- client beating on must not creep back in.
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
insert into r select 'E03 a heartbeat never acquires a clause it has lost',
  coalesce((select public.refresh_clause((select v::uuid from fx where k='clause')))::text, 'null'), 'null';

-- ===========================================================================
-- S — the staleness rule, which holds with no lease involved at all
-- ===========================================================================
set local role postgres;
delete from public.edit_locks where entity_kind = 'clause';
set local role authenticated;
do $t$
declare refused boolean := false;
begin
  begin
    perform public.save_clause_doc((select v::uuid from fx where k='clause'),
                                   (select v::jsonb from fx where k='doc'),
                                   now() - interval '1 day');
  exception when others then refused := true;
  end;
  insert into r select 'S01 a save built on a stale read is refused', refused::text, 'true';

  refused := false;
  begin
    perform public.save_clause_doc((select v::uuid from fx where k='clause'),
                                   (select v::jsonb from fx where k='doc'),
                                   now() + interval '1 second');
  exception when others then refused := true;
  end;
  insert into r select 'S02 a save built on a current read is not', refused::text, 'false';
end $t$;

-- ===========================================================================
-- X — the boundary, which the lease table was quietly wider than
-- ===========================================================================
--
-- The hole this step closed: `insert with check (user_id = auth.uid())` signed
-- the row but said nothing about the matter, so anybody could hold a clause on
-- a matter they have no access to. No read, no write — just a colleague finding
-- their own clause occupied by a person whose name they may not see.
--
-- THE FIRST FIX WAS ALSO WRONG, and this block is why it did not ship that way.
-- It read `when matter_id is not null then can_write_matter(matter_id) else
-- true`, which is the Phase 3 rule broken in its own words: ABSENCE OF NARROWER
-- SCOPE NEVER WIDENS ACCESS. Four dodges, all asserted below.
--
-- The clause is PLANTED here rather than looked for. An earlier run of this
-- suite reported X01 as skipped because the matter happened to have no clauses,
-- which is a security assertion quietly not running — the worst possible
-- outcome for the one test in this file that is about the boundary.
set local role postgres;
insert into public.clauses (matter_id, num, title, ordinal)
values ((select v::uuid from fx where k='ptm'), '99.1', 'Planted for the boundary test', 9999);
insert into fx select 'off', id::text from public.clauses
  where matter_id = (select v::uuid from fx where k='ptm') and num = '99.1';
set local role authenticated;
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';

do $t$
declare ok boolean; off_target uuid; on_target uuid;
begin
  select v::uuid into off_target from fx where k='off';
  select v::uuid into on_target from fx where k='clause';

  insert into r select 'X00 and he cannot read it in the first place',
    (select count(*)::text from public.clauses where id = off_target), '0';

  ok := false;
  begin
    insert into public.edit_locks (entity_kind, entity_id, matter_id, user_id)
    values ('clause', off_target, (select v::uuid from fx where k='ptm'), auth.uid());
    ok := true;
  exception when others then ok := false; end;
  insert into r select 'X01 a non-member cannot hold a clause on a matter they are not on', ok::text, 'false';

  ok := false;
  begin
    insert into public.edit_locks (entity_kind, entity_id, user_id)
    values ('clause', off_target, auth.uid());
    ok := true;
  exception when others then ok := false; end;
  insert into r select 'X01b nor by leaving the matter off the row', ok::text, 'false';

  ok := false;
  begin
    insert into public.edit_locks (entity_kind, entity_id, matter_id, user_id)
    values ('clause', off_target, (select v::uuid from fx where k='atlas'), auth.uid());
    ok := true;
  exception when others then ok := false; end;
  insert into r select 'X01c nor by naming a matter he IS on for a clause he is not', ok::text, 'false';

  ok := false;
  begin
    insert into public.edit_locks (entity_kind, entity_id, matter_id, user_id)
    values ('document', off_target, null, auth.uid());
    ok := true;
  exception when others then ok := false; end;
  insert into r select 'X01d nor by calling it something other than a clause', ok::text, 'false';

  ok := false;
  begin perform public.take_clause(off_target); ok := true;
  exception when others then ok := false; end;
  insert into r select 'X01e and take_clause refuses him outright', ok::text, 'false';

  -- The rule has not become "nobody may hold anything", which is the way a
  -- tightening like this usually goes wrong.
  ok := false;
  begin
    insert into public.edit_locks (entity_kind, entity_id, matter_id, user_id)
    values ('clause', on_target, (select v::uuid from fx where k='atlas'), auth.uid());
    ok := true;
  exception when others then ok := false; end;
  insert into r select 'X02 but he can still hold a clause on a matter he IS on', ok::text, 'true';

  -- USING alone judges the row you started with, never the row you end up with.
  ok := false;
  begin
    update public.edit_locks set entity_id = off_target
     where entity_kind='clause' and entity_id = on_target;
    ok := (select count(*) > 0 from public.edit_locks where entity_id = off_target);
  exception when others then ok := false; end;
  insert into r select 'X03 nor can he move a lease he owns onto a clause he cannot see', ok::text, 'false';
end $t$;

-- The read, judged by the clause rather than by what the row claims.
do $t$
declare off_target uuid;
begin
  select v::uuid into off_target from fx where k='off';
  insert into r select 'X03a a colleague ON the matter still reads a lease there',
    (select count(*)::text from public.edit_locks
      where entity_id = (select v::uuid from fx where k='clause')), '1';
end $t$;

set local role postgres;
insert into public.edit_locks (entity_kind, entity_id, matter_id, user_id, expires_at)
values ('clause', (select v::uuid from fx where k='off'), (select v::uuid from fx where k='ptm'),
        (select v::uuid from fx where k='me'), now() + interval '2 minutes');
set local role authenticated;
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
insert into r select 'X03b a lease on a matter he is off stays invisible',
  (select count(*)::text from public.edit_locks where entity_id=(select v::uuid from fx where k='off')), '0';

-- And the row is not believed when it claims otherwise. Before the read policy
-- derived the matter from the clause, this row talked its way into view.
set local role postgres;
update public.edit_locks set matter_id=(select v::uuid from fx where k='atlas')
 where entity_id=(select v::uuid from fx where k='off');
set local role authenticated;
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
insert into r select 'X03c and a row claiming the wrong matter cannot talk its way in',
  (select count(*)::text from public.edit_locks where entity_id=(select v::uuid from fx where k='off')), '0';
set local role postgres;
delete from public.edit_locks where entity_id=(select v::uuid from fx where k='off');
set local role authenticated;
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';

insert into r select 'X04 a non-member reads no clause on that matter — which is what realtime asks',
  (select count(*)::text from public.clauses
    where matter_id = (select v::uuid from fx where k='ptm')), '0';
insert into r select 'X05 and sees nobody in it',
  (select count(*)::text from public.matter_presence((select v::uuid from fx where k='ptm'))), '0';

-- ===========================================================================
-- P — presence
-- ===========================================================================
--
-- The X block left Podrick holding the Atlas clause, and a lease is not
-- transferable — so without this the take below correctly returns taken=false,
-- Mawusi holds nothing, and P02 reports an empty document.
--
-- FOUND BY RUNNING THIS FILE AS ONE TRANSACTION. Every section had passed on
-- its own; the suite failed the first time it was run start to finish, because
-- a section had been relying on state an earlier section happened not to leave
-- behind. A suite that only passes in pieces is not a suite.
set local role postgres;
delete from public.edit_locks where entity_kind = 'clause';
set local role authenticated;

set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
select public.take_clause((select v::uuid from fx where k='clause'));
insert into r select 'P01 you are never present to yourself',
  (select count(*)::text from public.matter_presence((select v::uuid from fx where k='atlas'))
    where user_id = (select v::uuid from fx where k='me')), '0';
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
insert into r select 'P02 but a colleague in a clause is',
  (select count(*)::text from public.matter_presence((select v::uuid from fx where k='atlas'))
    where user_id = (select v::uuid from fx where k='me')), '1';

-- ===========================================================================
-- R — what is live, and what still is not
-- ===========================================================================
reset role;
insert into r select 'R01 clauses are published',
  (select count(*)::text from pg_publication_rel pr
     join pg_publication p on p.oid = pr.prpubid
     join pg_class c on c.oid = pr.prrelid
    where p.pubname = 'supabase_realtime' and c.relname = 'clauses'), '1';
insert into r select 'R02 whole documents still are not',
  (select count(*)::text from pg_publication_rel pr
     join pg_publication p on p.oid = pr.prpubid
     join pg_class c on c.oid = pr.prrelid
    where p.pubname = 'supabase_realtime'
      and c.relname in ('documents','document_versions','contract_drafts')), '0';
insert into r select 'R03 deletes are still not published',
  (select (pubinsert and pubupdate and not pubdelete)::text
     from pg_publication where pubname = 'supabase_realtime'), 'true';
insert into r select 'R04 clauses is not replica identity full',
  (select (relreplident <> 'f')::text from pg_class where oid = 'public.clauses'::regclass), 'true';

select test, got, want, case when got = want then 'PASS' else 'FAIL' end as result from r order by test;
rollback;
