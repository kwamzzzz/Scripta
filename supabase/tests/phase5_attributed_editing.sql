-- PHASE 5, STEP 3: authorship that cannot be forged, settlement that is earned.
--
-- Two separate questions, and this file keeps them separate:
--
--   P  can a lawyer put a colleague's name on wording they did not write?
--   S  can a lawyer decide what the contract says without the standing to?
--
-- The P section is the one that matters most. Phase 4's worst defect was a
-- comment that could be signed as a colleague; a tracked change makes the same
-- claim about a person, on the same professional record, and arrives buried in
-- a blob of JSON where it is far easier to miss.
--
-- Runs against the live database as two real users and ROLLS BACK.

begin;
create temp table r(test text, got text, want text) on commit drop;
create temp table fx(k text, v text) on commit drop;
grant all on r to authenticated;
grant all on fx to authenticated;

insert into fx values
 ('atlas','c0c2b172-4856-4e84-bf40-fafe7f9dee42'),
 ('me','6df711b6-27b0-4aaf-8129-ef39700de7bb'),
 ('them','176d2a8c-10f1-429b-82f2-dde207c99a68');
insert into fx select 'clause', id::text from public.clauses
  where matter_id = (select v::uuid from fx where k='atlas')
    and doc::text not like '%insertion%' limit 1;

-- Documents built as text rather than nested jsonb_build_object calls, which
-- become unreadable four levels down and were got wrong once already.
create or replace function pg_temp.mk(change text, author text) returns jsonb language sql as $m$
  select ('{"type":"doc","content":[{"type":"paragraph","content":['
       || '{"type":"text","text":"Base wording. "},'
       || '{"type":"text","text":"Proposed. ","marks":[{"type":"insertion","attrs":'
       || '{"changeId":"' || change || '","setId":"s1","authorId":"' || author || '","at":"2026-09-16T00:00:00Z"}}]}'
       || ']}]}')::jsonb;
$m$;
create or replace function pg_temp.plain() returns jsonb language sql as $m$
  select '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Base wording. "}]}]}'::jsonb;
$m$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';

-- ===========================================================================
-- P — a change can only be made in your own name
-- ===========================================================================
do $t$
declare c uuid := (select v::uuid from fx where k='clause'); refused boolean;
begin
  perform public.save_clause_doc(c, pg_temp.mk('p1', (select v from fx where k='them')));
  insert into r select 'P01 a lawyer may propose wording in their own name',
    (select count(*)::text from public.doc_change_marks((select doc from public.clauses where id=c))), '1';

  -- The forgery.
  refused := false;
  begin perform public.save_clause_doc(c, pg_temp.mk('f1', (select v from fx where k='me')));
  exception when others then refused := true; end;
  insert into r select 'P02 and may NOT propose wording in a colleague''s name', refused::text, 'true';

  -- The slower forgery: leave the wording, change whose it is.
  refused := false;
  begin perform public.save_clause_doc(c, pg_temp.mk('p1', (select v from fx where k='me')));
  exception when others then refused := true; end;
  insert into r select 'P03 nor re-attribute a change that is already there', refused::text, 'true';

  perform public.save_clause_doc(c, pg_temp.plain());
  insert into r select 'W01 the author may withdraw their own proposal',
    (select count(*)::text from public.doc_change_marks((select doc from public.clauses where id=c))), '0';
end $t$;

-- ===========================================================================
-- S — settling another lawyer's wording is earned, not implied by write access
-- ===========================================================================
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
do $t$
declare c uuid := (select v::uuid from fx where k='clause');
begin
  perform public.save_clause_doc(c, pg_temp.mk('L1', (select v from fx where k='me')));
  insert into r select 'S01 the Lead proposes something',
    (select count(*)::text from public.doc_change_marks((select doc from public.clauses where id=c))), '1';
end $t$;

set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
declare c uuid := (select v::uuid from fx where k='clause'); refused boolean := false;
begin
  -- An Editor, with full write access to the matter, and no standing here.
  begin perform public.save_clause_doc(c, pg_temp.plain()); exception when others then refused := true; end;
  insert into r select 'S02 an Editor may NOT settle a colleague''s wording', refused::text, 'true';
  insert into r select 'S03 and the wording is untouched by the attempt',
    (select count(*)::text from public.doc_change_marks((select doc from public.clauses where id=c))), '1';
end $t$;

-- Responsibility is what earns it. entity_owner('clause') was built in Phase 4.
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
update public.clauses set assignee_id = (select v::uuid from fx where k='them')
 where id = (select v::uuid from fx where k='clause');
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
declare c uuid := (select v::uuid from fx where k='clause');
begin
  perform public.save_clause_doc(c, pg_temp.plain());
  insert into r select 'S04 the clause''s assignee may settle it',
    (select count(*)::text from public.doc_change_marks((select doc from public.clauses where id=c))), '0';
end $t$;

-- ===========================================================================
-- D — the function is the only door
-- ===========================================================================
-- Without this the checks above are a convention. A screen writing clauses.doc
-- straight through would bypass every one of them.
do $t$
declare refused boolean := false;
begin
  begin update public.clauses set doc = '{"type":"doc","content":[]}'::jsonb
         where id = (select v::uuid from fx where k='clause');
  exception when others then refused := true; end;
  insert into r select 'D01 clauses.doc cannot be written directly', refused::text, 'true';

  refused := false;
  begin update public.clauses set status = 'Accepted' where id = (select v::uuid from fx where k='clause');
  exception when others then refused := true; end;
  insert into r select 'D02 but the rest of the clause still can be', refused::text, 'false';
end $t$;

-- ===========================================================================
-- V — a Viewer edits nothing
-- ===========================================================================
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
select public.set_matter_member_role((select v::uuid from fx where k='atlas'),
                                     (select v::uuid from fx where k='them'), 'viewer');
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
declare refused boolean := false;
begin
  begin perform public.save_clause_doc((select v::uuid from fx where k='clause'), pg_temp.plain());
  exception when others then refused := true; end;
  insert into r select 'V01 a Viewer cannot save a clause', refused::text, 'true';
end $t$;

reset role;
select test, got, want, case when got = want then 'PASS' else 'FAIL' end as result from r order by test;
rollback;
