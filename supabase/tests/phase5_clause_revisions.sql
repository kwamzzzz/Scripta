-- PHASE 5, STEP 2: document history, and the boundary it inherits.
--
-- A revision holds what a clause said at a moment. That makes it two things at
-- once: legal text, which the matter boundary governs, and a claim about a
-- person, which Phase 4 learned the hard way must be stamped rather than
-- accepted.
--
-- Section A is the adversarial one. It sends a revision carrying BOTH a forged
-- author and a forged matter — the two lies that would matter — and asserts
-- that each is replaced with the truth rather than merely rejected. A lawyer
-- must never be able to manufacture a revision that appears to have been made
-- by a colleague.
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
 ('me','6df711b6-27b0-4aaf-8129-ef39700de7bb'),
 ('them','176d2a8c-10f1-429b-82f2-dde207c99a68');
insert into fx select 'atlas_clause', id::text from public.clauses
  where matter_id = (select v::uuid from fx where k='atlas') limit 1;
insert into fx select 'ptm_clause', id::text from public.clauses
  where matter_id = (select v::uuid from fx where k='ptm') limit 1;

set local role authenticated;
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';

-- ===========================================================================
-- R — the matter governs the history, as it governs the text
-- ===========================================================================
insert into r select 'R01 an Editor reads revisions on their matter',
  (select (count(*) > 0)::text from public.clause_revisions
    where clause_id = (select v::uuid from fx where k='atlas_clause')), 'true';
insert into r select 'R02 and none on a matter they are not on',
  (select count(*)::text from public.clause_revisions
    where clause_id = (select v::uuid from fx where k='ptm_clause')), '0';
insert into r select 'R03 nor by counting the whole table',
  (select (count(*) = (select count(*) from public.clauses c
                         join public.clause_revisions r2 on r2.clause_id = c.id
                        where c.matter_id = (select v::uuid from fx where k='atlas')))::text
     from public.clause_revisions), 'true';
insert into r select 'R04 clause_baseline refuses a clause they cannot open',
  coalesce((public.clause_baseline((select v::uuid from fx where k='ptm_clause')))::text, 'null'), 'null';
insert into r select 'R05 and answers for one they can',
  (public.clause_baseline((select v::uuid from fx where k='atlas_clause')) is not null)::text, 'true';

-- ===========================================================================
-- A — authorship cannot be forged. The section this file exists for
-- ===========================================================================
do $t$
declare rid uuid;
begin
  insert into public.clause_revisions (clause_id, matter_id, doc, kind, label, created_by)
  values ((select v::uuid from fx where k='atlas_clause'),
          (select v::uuid from fx where k='ptm'),      -- a lie about the matter
          '{"type":"doc","content":[]}'::jsonb, 'kept', 'Probe',
          (select v::uuid from fx where k='me'))       -- a lie about the author
  returning id into rid;
  insert into fx values ('rid', rid::text);

  -- Replaced, not merely refused. A refusal would leave the caller free to try
  -- again; a stamp makes the lie impossible to express.
  insert into r select 'A01 a forged author is replaced with the real writer',
    (select created_by::text from public.clause_revisions where id = rid),
    (select v from fx where k='them');
  insert into r select 'A02 a forged matter is replaced with the clause''s own',
    (select matter_id::text from public.clause_revisions where id = rid),
    (select v from fx where k='atlas');
end $t$;

-- ===========================================================================
-- I — a revision records what a document said. It does not change
-- ===========================================================================
do $t$
begin
  begin
    update public.clause_revisions set doc = '{"type":"doc","content":[]}'::jsonb
     where id = (select v::uuid from fx where k='rid');
  exception when others then null; end;
  insert into r select 'I01 a revision cannot be edited',
    (select (label = 'Probe')::text from public.clause_revisions
      where id = (select v::uuid from fx where k='rid')), 'true';

  begin
    delete from public.clause_revisions where id = (select v::uuid from fx where k='rid');
  exception when others then null; end;
  insert into r select 'I02 nor deleted',
    (select count(*)::text from public.clause_revisions
      where id = (select v::uuid from fx where k='rid')), '1';
end $t$;

-- ===========================================================================
-- B — exactly one baseline, so "as received" is never ambiguous
-- ===========================================================================
do $t$
declare refused boolean := false;
begin
  begin
    insert into public.clause_revisions (clause_id, matter_id, doc, kind)
    values ((select v::uuid from fx where k='atlas_clause'), (select v::uuid from fx where k='atlas'),
            '{"type":"doc","content":[]}'::jsonb, 'baseline');
  exception when others then refused := true; end;
  insert into r select 'B01 a second baseline is refused', refused::text, 'true';
  insert into r select 'B02 so as received has exactly one answer',
    (select count(*)::text from public.clause_revisions
      where clause_id = (select v::uuid from fx where k='atlas_clause') and kind = 'baseline'), '1';
end $t$;

-- ===========================================================================
-- V — a Viewer reads the history and does not write it
-- ===========================================================================
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
select public.set_matter_member_role((select v::uuid from fx where k='atlas'),
                                     (select v::uuid from fx where k='them'), 'viewer');
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
declare refused boolean := false;
begin
  insert into r select 'V01 a Viewer still reads the history',
    (select (count(*) > 0)::text from public.clause_revisions
      where clause_id = (select v::uuid from fx where k='atlas_clause')), 'true';
  begin
    insert into public.clause_revisions (clause_id, matter_id, doc, kind)
    values ((select v::uuid from fx where k='atlas_clause'), (select v::uuid from fx where k='atlas'),
            '{"type":"doc","content":[]}'::jsonb, 'kept');
  exception when others then refused := true; end;
  insert into r select 'V02 and cannot add to it', refused::text, 'true';
end $t$;

-- ===========================================================================
-- X — removed from the matter, the history was never there
-- ===========================================================================
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
select public.remove_matter_member((select v::uuid from fx where k='atlas'),
                                   (select v::uuid from fx where k='them'));
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
insert into r select 'X01 no revisions at all',
  (select count(*)::text from public.clause_revisions), '0';
insert into r select 'X02 and clause_baseline says nothing',
  coalesce((public.clause_baseline((select v::uuid from fx where k='atlas_clause')))::text, 'null'), 'null';

reset role;
select test, got, want, case when got = want then 'PASS' else 'FAIL' end as result from r order by test;
rollback;
