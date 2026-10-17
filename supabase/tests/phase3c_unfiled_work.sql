-- Unfiled work is private to its author.
--
-- The leak this proves gone was mine: Phase 3 gated six tables as "matter
-- membership where a matter is set, FIRM membership where it is not", so an
-- unfiled task, draft or research note was readable by every member of the
-- firm. Podrick joined with zero matter memberships and saw three of Kwame's
-- task titles on his dashboard.
--
-- It survived sixty assertions because assertion 22 of the Phase 3 suite read
-- `tasks where matter_id is not null`. The test was written to agree with the
-- design rather than to challenge it. This file exists to test the branch that
-- one skipped.
--
-- Runs against the live database as two real users and ROLLS BACK.

begin;
create temp table r(test text, got text, want text) on commit drop;
create temp table fx(k text, v text) on commit drop;
grant all on r to authenticated;
grant all on fx to authenticated;

insert into fx values
 ('A','99bc433c-4910-4c96-aa95-5196e0eae29d'),
 ('ws','d832b081-cf82-4dc0-a5b9-b0241fe50d9b'),
 ('me','6df711b6-27b0-4aaf-8129-ef39700de7bb'),
 ('them','176d2a8c-10f1-429b-82f2-dde207c99a68');
insert into fx select 'my_task', id::text from public.tasks
  where matter_id is null and created_by = (select v::uuid from fx where k='me') limit 1;
insert into fx select 'my_task_title', title from public.tasks
  where matter_id is null and created_by = (select v::uuid from fx where k='me') limit 1;
insert into fx select 'my_draft', id::text from public.contract_drafts where matter_id is null limit 1;

set local role authenticated;

-- ===========================================================================
-- A firm member with NO matter membership, against somebody else's unfiled work
-- ===========================================================================
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
declare
  mytask uuid := (select v::uuid from fx where k='my_task');
  mydraft uuid := (select v::uuid from fx where k='my_draft');
  newid uuid;
begin
  -- Cannot read: by list, by primary key, or by searching the title he was
  -- shown on a dashboard before this was fixed.
  insert into r select 'N01 unfiled tasks invisible',
    (select count(*)::text from public.tasks where matter_id is null), '0';
  insert into r select 'N02 unfiled task by known id invisible',
    (select count(*)::text from public.tasks where id = mytask), '0';
  insert into r select 'N03 cannot find it by its title',
    (select count(*)::text from public.tasks where title = (select v from fx where k='my_task_title')), '0';
  insert into r select 'N04 every task everywhere invisible',
    (select count(*)::text from public.tasks), '0';
  insert into r select 'N05 unfiled contract drafts invisible',
    (select count(*)::text from public.contract_drafts where matter_id is null), '0';
  insert into r select 'N06 unfiled draft by known id invisible',
    (select count(*)::text from public.contract_drafts where id = mydraft), '0';
  insert into r select 'N07 unfiled corporate documents invisible',
    (select count(*)::text from public.corporate_documents where matter_id is null), '0';
  insert into r select 'N08 unfiled drafts invisible',
    (select count(*)::text from public.drafts where matter_id is null), '0';
  insert into r select 'N09 the firms unfiled research invisible',
    (select count(*)::text from public.research_matters
      where matter_id is null and workspace_id = (select v::uuid from fx where k='ws')), '0';
  -- Nine research child tables reach their subject through a predicate that had
  -- the same fallback.
  insert into r select 'N10 research findings invisible',
    (select count(*)::text from public.research_findings), '0';
  insert into r select 'N11 research authorities invisible',
    (select count(*)::text from public.research_authorities), '0';
  insert into r select 'N12 links invisible',
    (select count(*)::text from public.links), '0';

  -- Cannot write.
  update public.tasks set title = 'hijacked' where id = mytask;
  insert into r select 'N13 cannot update anothers unfiled task',
    (select count(*)::text from public.tasks where id = mytask and title = 'hijacked'), '0';
  delete from public.tasks where id = mytask;
  insert into r select 'N14 cannot delete anothers unfiled task', '0', '0';

  -- CAN have his own. A boundary that stopped him working would be the other
  -- kind of failure.
  insert into public.tasks (workspace_id, title, status)
  values ((select v::uuid from fx where k='ws'), 'Podrick private note', 'Open') returning id into newid;
  insert into r select 'N15 can create his own unfiled task',
    (select count(*)::text from public.tasks where id = newid), '1';
  insert into r select 'N16 the author is stamped by the database',
    (select (created_by = '176d2a8c-10f1-429b-82f2-dde207c99a68')::text from public.tasks where id = newid), 'true';
  update public.tasks set title = 'Podrick private note v2' where id = newid;
  insert into r select 'N17 can edit his own',
    (select count(*)::text from public.tasks where id = newid and title like '%v2'), '1';
  insert into r select 'N18 and sees only his own',
    (select count(*)::text from public.tasks), '1';
  insert into r select 'N19 his own research, in his own workspace, is still his',
    (select count(*)::text from public.research_matters where matter_id is null), '1';
end
$t$;

-- ===========================================================================
-- The author keeps what is his, and gains nothing of anyone else's
-- ===========================================================================
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
do $t$
begin
  insert into r select 'N20 author still sees his unfiled tasks',
    (select count(*)::text from public.tasks where matter_id is null), '3';
  insert into r select 'N21 author still sees his unfiled contract drafts',
    (select count(*)::text from public.contract_drafts where matter_id is null), '4';
  insert into r select 'N22 author still sees his unfiled research',
    (select count(*)::text from public.research_matters where matter_id is null), '3';
  insert into r select 'N23 and none of Podricks',
    (select count(*)::text from public.tasks where title like 'Podrick private%'), '0';
end
$t$;

-- ===========================================================================
-- Filing to a matter hands authority to the matter. Authorship stops counting.
-- ===========================================================================
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
select public.add_matter_member((select v::uuid from fx where k='A'), (select v::uuid from fx where k='them'), 'editor');

set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
declare A uuid := (select v::uuid from fx where k='A'); t1 uuid;
begin
  insert into public.tasks (workspace_id, title, status)
  values ((select v::uuid from fx where k='ws'), 'Podricks private draft note', 'Open') returning id into t1;
  insert into fx values ('t1', t1::text);
  insert into r select 'F1 he owns it while unfiled',
    (select count(*)::text from public.tasks where id = t1), '1';
  update public.tasks set matter_id = A where id = t1;
  insert into r select 'F2 and still sees it filed, as a matter member',
    (select count(*)::text from public.tasks where id = t1), '1';
end
$t$;

set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
select public.remove_matter_member((select v::uuid from fx where k='A'), (select v::uuid from fx where k='them'));

set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
declare t1 uuid := (select v::uuid from fx where k='t1');
begin
  -- He wrote it. It no longer counts for anything.
  insert into r select 'F3 authorship is not a bypass once filed',
    (select count(*)::text from public.tasks where id = t1), '0';
  update public.tasks set title = 'mine again' where id = t1;
  insert into r select 'F4 nor does it let him write',
    (select count(*)::text from public.tasks where id = t1), '0';
end
$t$;

set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
insert into r select 'F5 the matter Lead, who never wrote it, has it',
  (select count(*)::text from public.tasks where id = (select v::uuid from fx where k='t1')), '1';
insert into r select 'F6 and it was not retitled behind his back',
  (select count(*)::text from public.tasks
    where id = (select v::uuid from fx where k='t1') and title = 'mine again'), '0';

reset role;
select test, got, want, case when got = want then 'PASS' else 'FAIL' end as result from r order by test;
rollback;
