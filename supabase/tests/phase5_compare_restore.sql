-- PHASE 5, STEP 8: compare, and going back.
--
-- The assertion this file exists for is R02: AN EDITOR CANNOT GO BACK OVER A
-- COLLEAGUE'S WORDING.
--
-- "Restore an earlier version" sounds like an undo and is not. Bringing back
-- Tuesday's wording throws away every proposal made since, so if three of them
-- were Podrick's, the restore has rejected Podrick's drafting without anybody
-- pressing Reject. Kwame's second refinement was that Editor permission must
-- not silently become the authority to settle a colleague's wording, and this
-- is the largest possible version of exactly that.
--
-- R07 is the other one worth reading. There is no update policy on
-- clause_revisions, so a member's UPDATE matches no rows and is a SILENT NO-OP
-- rather than an error. A test that asserted "an exception was raised" would
-- have failed while the product was correct — and, worse, would have passed for
-- the wrong reason the day somebody added an update policy. So it asserts the
-- ROW is unchanged, and separately that the trigger refuses where RLS would not.
--
-- Runs against the live database as two real users and ROLLS BACK.

begin;
create temp table r(test text, got text, want text) on commit drop;
create temp table fx(k text, v text) on commit drop;
grant all on r to authenticated;
grant all on fx to authenticated;

insert into fx values
 ('atlas','c0c2b172-4856-4e84-bf40-fafe7f9dee42'),
 ('me','6df711b6-27b0-4aaf-8129-ef39700de7bb'),      -- Mawusi, Lead here
 ('them','176d2a8c-10f1-429b-82f2-dde207c99a68');    -- Podrick, Editor here
insert into fx select 'clause', id::text from public.clauses
  where matter_id = (select v::uuid from fx where k='atlas') order by ordinal limit 1;

update public.matter_members set role = 'lead'
 where matter_id = (select v::uuid from fx where k='atlas')
   and user_id = (select v::uuid from fx where k='me');
update public.matter_members set role = 'editor'
 where matter_id = (select v::uuid from fx where k='atlas')
   and user_id = (select v::uuid from fx where k='them');

-- A clean clause to go back to.
update public.clauses
   set doc = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"The Seller shall deliver."}]}]}'::jsonb
 where id = (select v::uuid from fx where k='clause');

-- ===========================================================================
-- V — keeping a version
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
insert into fx select 'tuesday',
  public.keep_clause_revision((select v::uuid from fx where k='clause'),
                              'What we sent on Tuesday', null, 'milestone')::text;

insert into r select 'V01 a version can be kept, and is named',
  (select label from public.clause_revision_list((select v::uuid from fx where k='clause')) limit 1),
  'What we sent on Tuesday';
insert into r select 'V02 and signed by whoever kept it — stamped, never sent',
  (select created_by::text from public.clause_revision_list((select v::uuid from fx where k='clause')) limit 1),
  (select v from fx where k='me');

do $t$
declare refused boolean := false;
begin
  begin
    perform public.keep_clause_revision((select v::uuid from fx where k='clause'), 'Fake', null, 'baseline');
  exception when others then refused := true;
  end;
  insert into r select 'V03 but nobody can manufacture a second "as received"', refused::text, 'true';
end $t$;

-- ===========================================================================
-- R — going back
-- ===========================================================================
--
-- The Lead proposes wording, so an Editor going back would discard a
-- colleague's drafting.
select public.save_clause_doc((select v::uuid from fx where k='clause'),
  '{"type":"doc","content":[{"type":"paragraph","content":[
     {"type":"text","text":"The Seller shall "},
     {"type":"text","text":"immediately ","marks":[{"type":"insertion","attrs":{"changeId":"c2","setId":"s2","authorId":"6df711b6-27b0-4aaf-8129-ef39700de7bb","at":"2026-09-16T09:00:00Z"}}]},
     {"type":"text","text":"deliver."}]}]}'::jsonb);

set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
declare refused boolean := false;
begin
  begin perform public.restore_clause_revision((select v::uuid from fx where k='tuesday'));
  exception when others then refused := true;
  end;
  insert into r select 'R02 an Editor cannot go back over a colleague''s wording', refused::text, 'true';
end $t$;

set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
insert into r select 'R03 the Lead can, and is told what it cost',
  (select (public.restore_clause_revision((select v::uuid from fx where k='tuesday'))->>'discarded')), '1';
insert into r select 'R04 and the clause reads as it did on Tuesday',
  (select (doc->'content'->0->'content'->0->>'text') from public.clauses
    where id = (select v::uuid from fx where k='clause')),
  'The Seller shall deliver.';

-- Somebody who restores the wrong version must be able to restore the one they
-- were on, so the current document is kept BEFORE the restore lands.
insert into r select 'R05 going back is itself reversible',
  (select count(*)::text from public.clause_revision_list((select v::uuid from fx where k='clause'))
    where label = 'Before going back'), '1';
insert into r select 'R06 and going back is itself history',
  (select count(*)::text from public.clause_revision_list((select v::uuid from fx where k='clause'))
    where kind = 'restored'), '1';

-- ===========================================================================
-- R07 — a revision records what a document said
-- ===========================================================================
do $t$
begin
  update public.clause_revisions set label = 'rewritten'
   where id = (select v::uuid from fx where k='tuesday');
exception when others then null;
end $t$;
insert into r select 'R07 a member''s attempt to rewrite a revision changes nothing',
  (select label from public.clause_revision_list((select v::uuid from fx where k='clause'))
    where id = (select v::uuid from fx where k='tuesday')), 'What we sent on Tuesday';

set local role postgres;
do $t$
declare refused boolean := false;
begin
  begin update public.clause_revisions set label='rewritten' where id=(select v::uuid from fx where k='tuesday');
  exception when others then refused := true; end;
  insert into r select 'R07b and the trigger refuses even where RLS would not', refused::text, 'true';
  refused := false;
  begin delete from public.clause_revisions where id=(select v::uuid from fx where k='tuesday');
  exception when others then refused := true; end;
  insert into r select 'R07c including a delete', refused::text, 'true';
end $t$;

-- ===========================================================================
-- R08 — the lease rule applies to a restore like any other write
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
select public.take_clause((select v::uuid from fx where k='clause'));
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
do $t$
declare refused boolean := false;
begin
  begin perform public.restore_clause_revision((select v::uuid from fx where k='tuesday'));
  exception when others then refused := true; end;
  insert into r select 'R08 and never while a colleague is in the clause', refused::text, 'true';
end $t$;

reset role;
select test, got, want, case when got = want then 'PASS' else 'FAIL' end as result from r order by test;
rollback;
