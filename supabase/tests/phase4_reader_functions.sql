-- PHASE 4: the reader functions do not read with more authority than their
-- caller.
--
-- This file exists because two of them did.
--
-- `task_actions()` and `review_for()` were written `security definer` so they
-- could call `is_matter_member()` and `can_write_matter()`. That also made their
-- own reads bypass row-level security, and both then guarded only the FILED
-- case — `if matter_id is not null and not is_matter_member(...)`. For UNFILED
-- work the guard was skipped entirely, and Phase 3c had already established
-- that unfiled work is author-only.
--
-- Proved against the live database before the fix:
--
--   task_actions(<another person's unfiled request>) returned a row, confirming
--   the task exists, AND returned `asked_by` — naming the colleague who made it.
--   review_for('research', <another person's unfiled research>) returned the
--   approval: its status, its assignee, who asked.
--
-- The same null branch, skipped the same way, for the fourth time in two
-- phases. Found by a regression run rather than by review.
--
-- THE RULE IT LEAVES BEHIND: a function that reports on a row must not read
-- that row with more authority than its caller has. Security definer is for
-- answering a question about permissions, not for fetching the thing the
-- permissions are about.
--
-- Runs against the live database as two real users and ROLLS BACK.

begin;
create temp table r(test text, got text, want text) on commit drop;
create temp table fx(k text, v text) on commit drop;
grant all on r to authenticated;
grant all on fx to authenticated;

insert into fx values
 ('ws','d832b081-cf82-4dc0-a5b9-b0241fe50d9b'),
 ('atlas','c0c2b172-4856-4e84-bf40-fafe7f9dee42'),
 ('me','6df711b6-27b0-4aaf-8129-ef39700de7bb'),
 ('them','176d2a8c-10f1-429b-82f2-dde207c99a68');

set local role authenticated;
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';

do $t$
declare t uuid; rm uuid; ft uuid;
begin
  -- Kwame's own private work, of both shapes that were leaking.
  insert into public.tasks (workspace_id, title, status, created_by, origin_kind)
  values ((select v::uuid from fx where k='ws'), 'Probe private request', 'Open',
          (select v::uuid from fx where k='me'), 'request') returning id into t;
  insert into public.research_matters (workspace_id, title, kind, created_by)
  values ((select v::uuid from fx where k='ws'), 'Probe private research', 'simple',
          (select v::uuid from fx where k='me')) returning id into rm;
  insert into public.approvals (workspace_id, entity_kind, entity_id, status, requested_by, assigned_to)
  values ((select v::uuid from fx where k='ws'), 'research', rm, 'Requested',
          (select v::uuid from fx where k='me'), (select v::uuid from fx where k='me'));
  -- And a real, filed request to Podrick, so the controls below can prove the
  -- functions still work rather than merely refusing everything.
  ft := public.request_work((select v::uuid from fx where k='atlas'),
                            (select v::uuid from fx where k='them'), 'A real request he can see');
  insert into fx values ('t', t::text), ('rm', rm::text), ('ft', ft::text);
end $t$;

set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';

insert into r select 'A1 task_actions on anothers unfiled task returns nothing',
  (select count(*)::text from public.task_actions((select v::uuid from fx where k='t'))), '0';
insert into r select 'A2 and does not name who asked',
  (select coalesce(max(asked_by::text), 'null') from public.task_actions((select v::uuid from fx where k='t'))), 'null';
insert into r select 'A3 review_for on anothers unfiled research returns nothing',
  (select count(*)::text from public.review_for('research', (select v::uuid from fx where k='rm'))), '0';

-- The non-disclosure property: a thing you cannot open is indistinguishable
-- from a thing that does not exist.
insert into r select 'A4 a fabricated id looks exactly the same as a real one',
  (select count(*)::text from public.task_actions('00000000-0000-0000-0000-000000000001')), '0';

-- THE CONTROLS. Without these, A1 to A4 pass on a function that returns nothing
-- to anybody, which is the other way to be wrong.
insert into r select 'A5 CONTROL: on a request he CAN see, it still answers',
  (select i_may_decline::text from public.task_actions((select v::uuid from fx where k='ft'))), 'true';
insert into r select 'A6 CONTROL: and still names who asked, to him',
  (select asked_by::text from public.task_actions((select v::uuid from fx where k='ft'))),
  (select v from fx where k='me');

-- The writers refused correctly but with two different sentences, which is an
-- existence oracle for anybody willing to try uuids.
do $t$
declare msg text; missing text;
begin
  begin perform public.decline_work('00000000-0000-0000-0000-000000000001', 'x');
  exception when others then missing := sqlerrm; end;
  begin perform public.decline_work((select v::uuid from fx where k='t'), 'x');
  exception when others then msg := sqlerrm; end;
  insert into r select 'A7 a real task and a fabricated one refuse identically',
    (msg = missing)::text, 'true';
end $t$;

-- And the whole review path still behaves, since review_for changed under it.
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
insert into fx select 'clause', id::text from public.clauses
  where matter_id = (select v::uuid from fx where k='atlas') limit 1;
do $t$
begin
  perform public.request_review('clause', (select v::uuid from fx where k='clause'),
                                (select v::uuid from fx where k='them'), 'Review clause 7', 'Check the cap.');
  insert into r select 'B1 review_for answers for the asker',
    (select status::text from public.review_for('clause', (select v::uuid from fx where k='clause'))), 'Requested';
  insert into r select 'B2 and says the Lead may move it',
    (select i_may_move::text from public.review_for('clause', (select v::uuid from fx where k='clause'))), 'true';
end $t$;
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
insert into r select 'B3 the reviewer sees it and may move it',
  (select i_may_move::text from public.review_for('clause', (select v::uuid from fx where k='clause'))), 'true';

set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
select public.set_matter_member_role((select v::uuid from fx where k='atlas'),
                                     (select v::uuid from fx where k='them'), 'viewer');
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
insert into r select 'B4 demoted to Viewer he reads it but may not move it',
  (select i_may_move::text from public.review_for('clause', (select v::uuid from fx where k='clause'))), 'false';
insert into r select 'B5 and still reads it, being still on the matter',
  (select count(*)::text from public.review_for('clause', (select v::uuid from fx where k='clause'))), '1';

set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
select public.remove_matter_member((select v::uuid from fx where k='atlas'),
                                   (select v::uuid from fx where k='them'));
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
insert into r select 'B6 removed from the matter, he sees nothing',
  (select count(*)::text from public.review_for('clause', (select v::uuid from fx where k='clause'))), '0';

-- Neither function may go back to reading with more authority than its caller.
reset role;
insert into r select 'C1 neither reader function is security definer',
  (select coalesce(string_agg(p.proname, ' '), 'none') from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('task_actions', 'review_for') and p.prosecdef), 'none';

select test, got, want, case when got = want then 'PASS' else 'FAIL' end as result from r order by test;
rollback;
