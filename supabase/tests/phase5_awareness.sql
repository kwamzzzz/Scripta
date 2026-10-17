-- PHASE 5, STEP 4: things I should know happened.
--
-- The assertion this file exists for is E05: THE PERSON WHO ASKED IS TOLD.
-- Phase 4's acceptance found the gap the hard way — Kwame could not find a
-- review he had requested four minutes earlier, on a matter with one contract,
-- because the reviewer got a task and the asker got nothing at all.
--
-- The other half is X01: the awareness layer inherits the confidentiality
-- boundary rather than re-implementing it. events_involving_me() is SECURITY
-- INVOKER, so audit_event_visible() — fixed in Phase 3d after it read research
-- titles out loud — filters the read.
--
-- Runs against the live database as two real users and ROLLS BACK.

begin;
create temp table r(test text, got text, want text) on commit drop;
create temp table fx(k text, v text) on commit drop;
grant all on r to authenticated;
grant all on fx to authenticated;

insert into fx values
 ('atlas','c0c2b172-4856-4e84-bf40-fafe7f9dee42'),
 ('ptm','99bc433c-4910-4c96-aa95-5196e0eae29d'),
 ('ws','d832b081-cf82-4dc0-a5b9-b0241fe50d9b'),
 ('me','6df711b6-27b0-4aaf-8129-ef39700de7bb'),
 ('them','176d2a8c-10f1-429b-82f2-dde207c99a68');
insert into fx select 'clause', id::text from public.clauses
  where matter_id = (select v::uuid from fx where k='atlas') limit 1;

set local role authenticated;
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
do $t$
declare rv uuid;
begin
  rv := public.request_review('clause', (select v::uuid from fx where k='clause'),
        (select v::uuid from fx where k='them'), 'Review clause', 'Please look.');
  insert into fx values ('rv', rv::text);
end $t$;

-- ===========================================================================
-- E — both ends of a collaboration
-- ===========================================================================
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
insert into r select 'E01 the reviewer is told a review was requested',
  (select count(*)::text from public.events_involving_me(50) where event_type='review.requested'), '1';
insert into r select 'E02 and it is new',
  (select is_new::text from public.events_involving_me(50) where event_type='review.requested'), 'true';
-- Deep-linked to the thing, not to the matter it happened on.
insert into r select 'E03 the entry points at the approval itself',
  (select (entity_type='approval' and entity_id=(select v::uuid from fx where k='rv'))::text
     from public.events_involving_me(50) where event_type='review.requested'), 'true';

update public.approvals set status = 'In review' where id = (select v::uuid from fx where k='rv');
insert into r select 'E04 and is never told about his own doing',
  (select count(*)::text from public.events_involving_me(50) where event_type='review.decided'), '0';

set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
insert into r select 'E05 THE PERSON WHO ASKED is told it was started',
  (select count(*)::text from public.events_involving_me(50) where event_type='review.decided'), '1';

-- ===========================================================================
-- S — one timestamp, no per-event read state
-- ===========================================================================
do $t$
begin
  perform public.mark_notifications_seen();
  insert into r select 'S01 marking seen clears what is new',
    (select count(*)::text from public.events_involving_me(50) where is_new), '0';
  insert into r select 'S02 but the events are still there to read',
    (select (count(*) > 0)::text from public.events_involving_me(50)), 'true';
end $t$;

-- ===========================================================================
-- X — the boundary is inherited, not re-implemented
-- ===========================================================================
do $t$
declare tk uuid;
begin
  insert into public.tasks (workspace_id, matter_id, title, status, assignee_id, created_by)
  values ((select v::uuid from fx where k='ws'), (select v::uuid from fx where k='ptm'),
          'Private to PTM', 'Open', (select v::uuid from fx where k='me'),
          (select v::uuid from fx where k='them'))
  returning id into tk;
  insert into public.audit_events (matter_id, actor_id, actor_name, event_type, entity_type, entity_id, summary)
  values ((select v::uuid from fx where k='ptm'), (select v::uuid from fx where k='them'), 'Podrick',
          'work.requested', 'task', tk, 'Work requested on PTM');
  insert into fx values ('ptm_task', tk::text);
end $t$;
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
insert into r select 'X01 an event on a matter he is not on never appears',
  (select count(*)::text from public.events_involving_me(100)
    where entity_id = (select v::uuid from fx where k='ptm_task')), '0';

-- ===========================================================================
-- P — nobody learns when a colleague last looked
-- ===========================================================================
do $t$
declare leaked boolean := false; dummy timestamptz;
begin
  begin
    select notifications_seen_at into dummy from public.profiles
     where id = (select v::uuid from fx where k='me');
    leaked := true;
  exception when insufficient_privilege then leaked := false;
  end;
  insert into r select 'P01 a colleague''s notifications_seen_at cannot be read', leaked::text, 'false';
  insert into r select 'P02 while the rest of the profile still reads',
    (select (count(*) > 0)::text from public.profiles), 'true';
end $t$;

reset role;
select test, got, want, case when got = want then 'PASS' else 'FAIL' end as result from r order by test;
rollback;
