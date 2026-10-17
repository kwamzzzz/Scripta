-- Phase 3: the confidentiality boundary, proved.
--
-- Two real users and two real matters, against the live database, ROLLED BACK.
-- Podrick is put on matter A only — and he is not a workspace member at all,
-- so this also proves the external-collaborator shape incidentally: matter
-- access without firm membership.
--
-- Every negative assertion counts ROWS and reads BY PRIMARY KEY. Row-level
-- security denies by returning an empty set rather than raising, so a test that
-- only checks "no exception" passes while leaking. And reading by key is the
-- direct-URL case: the router resolves a URL to exactly this query.
--
--   A = Personal Trade Management  (flow, deliverables, tasks, documents)
--   B = Atlas Industrial Supplies  (132 clauses, documents, a stored file)

begin;
create temp table r(test text, got text, want text) on commit drop;
create temp table fx(k text, v text) on commit drop;
grant all on r to authenticated;
grant all on fx to authenticated;

insert into fx values
 ('A','99bc433c-4910-4c96-aa95-5196e0eae29d'),
 ('B','c0c2b172-4856-4e84-bf40-fafe7f9dee42'),
 ('me','6df711b6-27b0-4aaf-8129-ef39700de7bb'),
 ('them','176d2a8c-10f1-429b-82f2-dde207c99a68'),
 ('ws','d832b081-cf82-4dc0-a5b9-b0241fe50d9b');
-- ---------------------------------------------------------------------------
-- THE SUITE'S PREMISE, restored rather than assumed
-- ---------------------------------------------------------------------------
--
-- This file was written when Podrick was on matter A and nothing else, and was
-- not a workspace member at all — which is what makes it prove the
-- external-collaborator shape incidentally.
--
-- Both of those have since changed in the live data: he was re-added to Atlas
-- (B) at the end of Phase 3 testing, and he joined the firm as a Lawyer. Left
-- alone, assertions 07 to 25 would fail because B is genuinely his now, and
-- assertion 44 would fail because firm knowledge is genuinely his now — neither
-- a leak, both correct.
--
-- A suite that quietly drifts out of its own premise is worse than one that
-- fails: it reports on a situation nobody meant to test. So the premise is
-- re-established here, inside the transaction that rolls back, and the file
-- keeps testing the thing it was written to test.
delete from public.matter_members
 where matter_id = (select v::uuid from fx where k='B')
   and user_id = (select v::uuid from fx where k='them');
delete from public.workspace_members
 where workspace_id = (select v::uuid from fx where k='ws')
   and user_id = (select v::uuid from fx where k='them');
-- Since then he was also put on "Playbook Test — Meridian Logistics" (16 Sep),
-- and matter A moved into the owner's personal workspace, so the firm register
-- no longer lists every matter the owner can see. Same remedy: restore the
-- premise here, and count the register against the firm's own matters.
delete from public.matter_members
 where user_id = (select v::uuid from fx where k='them')
   and matter_id <> (select v::uuid from fx where k='A');

insert into fx select 'B_clause', id::text from public.clauses where matter_id = (select v::uuid from fx where k='B') limit 1;
insert into fx select 'B_doc', id::text from public.documents where matter_id = (select v::uuid from fx where k='B') limit 1;
insert into fx select 'B_path', name from storage.objects where bucket_id='matter-documents'
  and (storage.foldername(name))[2] = (select v from fx where k='B') limit 1;
insert into fx select 'A_flow', id::text from public.matter_flows where matter_id = (select v::uuid from fx where k='A') limit 1;
insert into fx select 'A_deliv', d.id::text from public.flow_deliverables d
  join public.matter_flows f on f.id = d.flow_id where f.matter_id = (select v::uuid from fx where k='A') limit 1;
insert into fx select 'own_matters', count(*)::text from public.matters;
insert into fx select 'own_clauses', count(*)::text from public.clauses;
insert into fx select 'own_docs', count(*)::text from public.documents;
insert into fx select 'firm_matters', count(*)::text from public.matters where workspace_id = (select v::uuid from fx where k='ws');

insert into public.matter_members (matter_id, user_id, role, added_by)
values ((select v::uuid from fx where k='A'), (select v::uuid from fx where k='them'),
        'editor', (select v::uuid from fx where k='me'));

set local role authenticated;

-- ===========================================================================
-- As the person on matter A and nothing else
-- ===========================================================================
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
declare
  A uuid := (select v::uuid from fx where k='A');
  B uuid := (select v::uuid from fx where k='B');
  bclause uuid := (select v::uuid from fx where k='B_clause');
  bdoc uuid := (select v::uuid from fx where k='B_doc');
  bpath text := (select v from fx where k='B_path');
  aflow uuid := (select v::uuid from fx where k='A_flow');
  adeliv uuid := (select v::uuid from fx where k='A_deliv');
begin
  -- Positive. Without these, a boundary drawn so tight nobody can work passes
  -- every other test in this file.
  insert into r select '01 member reads matter A', (select count(*)::text from public.matters where id=A), '1';
  insert into r select '02 member reads A clauses', (select case when count(*)>0 then 'some' else 'none' end from public.clauses where matter_id=A), 'some';
  insert into r select '03 member reads A flow', (select count(*)::text from public.matter_flows where matter_id=A), '1';
  insert into r select '04 member reads A deliverables', (select case when count(*)>0 then 'some' else 'none' end from public.flow_deliverables where flow_id=aflow), 'some';
  insert into r select '05 member reads A documents', (select case when count(*)>0 then 'some' else 'none' end from public.documents where matter_id=A), 'some';
  insert into r select '06 member reads A tasks', (select case when count(*)>0 then 'some' else 'none' end from public.tasks where matter_id=A), 'some';

  -- Negative, by primary key: the direct-URL and known-UUID cases.
  insert into r select '07 matter B invisible', (select count(*)::text from public.matters where id=B), '0';
  insert into r select '08 B by known uuid invisible', (select count(*)::text from public.matters where id=B and workspace_id is not null), '0';
  insert into r select '09 B clauses invisible', (select count(*)::text from public.clauses where matter_id=B), '0';
  insert into r select '10 B clause by known id invisible', (select count(*)::text from public.clauses where id=bclause), '0';
  insert into r select '11 B documents invisible', (select count(*)::text from public.documents where matter_id=B), '0';
  insert into r select '12 B document by known id invisible', (select count(*)::text from public.documents where id=bdoc), '0';
  insert into r select '13 B document versions invisible', (select count(*)::text from public.document_versions where matter_id=B), '0';
  insert into r select '14 B contract issues invisible', (select count(*)::text from public.contract_issues where matter_id=B), '0';
  insert into r select '15 B key terms invisible', (select count(*)::text from public.contract_key_terms where matter_id=B), '0';
  insert into r select '16 B amendments invisible', (select count(*)::text from public.contract_amendments where matter_id=B), '0';
  insert into r select '17 B drafting points invisible', (select count(*)::text from public.drafting_points where matter_id=B), '0';
  insert into r select '18 B resolutions invisible', (select count(*)::text from public.resolutions where matter_id=B), '0';
  insert into r select '19 B transcripts invisible', (select count(*)::text from public.transcripts where matter_id=B), '0';
  insert into r select '20 B contract drafts invisible', (select count(*)::text from public.contract_drafts where matter_id=B), '0';
  insert into r select '21 B corporate docs invisible', (select count(*)::text from public.corporate_documents where matter_id=B), '0';
  insert into r select '22 B drafts invisible', (select count(*)::text from public.drafts where matter_id=B), '0';
  insert into r select '23 B research invisible', (select count(*)::text from public.research_matters where matter_id=B), '0';
  insert into r select '24 B audit trail invisible', (select count(*)::text from public.audit_events where matter_id=B), '0';
  insert into r select '25 B team invisible', (select count(*)::text from public.matter_members where matter_id=B), '0';

  -- Discovery through Flow: the indirect route, and the one most likely to be
  -- missed, because these tables never mention a matter.
  insert into r select '26 no flow outside his matters', (select count(*)::text from public.matter_flows where matter_id <> A), '0';
  insert into r select '27 no phases outside', (select count(*)::text from public.flow_phases p join public.matter_flows f on f.id=p.flow_id where f.matter_id <> A), '0';
  insert into r select '28 no deliverables outside', (select count(*)::text from public.flow_deliverables d join public.matter_flows f on f.id=d.flow_id where f.matter_id <> A), '0';

  -- Storage, by known and by guessed path.
  insert into r select '29 cannot read B file by path', public.can_read_storage_path(bpath)::text, 'false';
  insert into r select '30 cannot write B file by path', public.can_write_storage_path(bpath)::text, 'false';
  insert into r select '31 cannot invent a path into B',
    public.can_read_storage_path((select v from fx where k='ws') || '/' || B::text || '/anything.docx')::text, 'false';

  -- Counts and lists, which leak existence without leaking content.
  insert into r select '32 matter list shows only his', (select count(*)::text from public.matters), '1';
  insert into r select '33 task list shows only his', (select count(*)::text from public.tasks where matter_id is not null), '1';

  -- Security-definer functions are part of the surface, not a way round it.
  insert into r select '34 is_matter_member(B) false', public.is_matter_member(B)::text, 'false';
  insert into r select '35 can_write_matter(B) false', public.can_write_matter(B)::text, 'false';
  insert into r select '36 flow resolver answers for his own flow', public.is_flow_member(aflow)::text, 'true';
  insert into r select '37 deliverable resolver answers for his own', public.is_deliverable_member(adeliv)::text, 'true';

  -- The self-membership bypass, closed in the function and at the table.
  begin
    perform public.add_matter_member(B, (select v::uuid from fx where k='them'), 'editor');
    insert into r select '38 cannot add self to B', 'allowed', 'refused';
  exception when others then
    insert into r select '38 cannot add self to B', 'refused', 'refused';
  end;
  begin
    insert into public.matter_members (matter_id, user_id, role) values (B, (select v::uuid from fx where k='them'), 'editor');
    insert into r select '39 cannot insert membership directly', 'allowed', 'refused';
  exception when others then
    insert into r select '39 cannot insert membership directly', 'refused', 'refused';
  end;

  -- The administrative register is not a general route either.
  begin
    perform public.matter_register((select v::uuid from fx where k='ws'));
    insert into r select '40 register refused to non-admin', 'allowed', 'refused';
  exception when others then
    insert into r select '40 register refused to non-admin', 'refused', 'refused';
  end;

  update public.matters set stage = stage where id = A;
  insert into r select '41 editor may write matter A', 'ok', 'ok';
  insert into r select '42 editor cannot write matter B', (select count(*)::text from public.matters where id=B), '0';

  -- The purge used to be callable by anyone and scoped to nothing.
  insert into r select '43 purge does nothing for a non-member', public.purge_recently_deleted()::text, '0';
  insert into r select '44 a non-member sees no firm knowledge', (select count(*)::text from public.playbooks), '0';
  -- A client's organisation and its own documents are the firm's; outside it, nothing.
  insert into r select '44b a non-member sees no client documents', (select count(*)::text from public.documents where matter_id is null), '0';
  insert into r select '44c a non-member sees no client organisation', (select count(*)::text from public.org_entities), '0';
end
$t$;

-- ===========================================================================
-- Role behaviour, driven by the Lead
-- ===========================================================================
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
select public.set_matter_member_role((select v::uuid from fx where k='A'), (select v::uuid from fx where k='them'), 'viewer');
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
declare A uuid := (select v::uuid from fx where k='A');
begin
  insert into r select '45 viewer still reads matter A', (select count(*)::text from public.matters where id=A), '1';
  insert into r select '46 viewer cannot write', public.can_write_matter(A)::text, 'false';
  insert into r select '47 viewer cannot comment', public.can_review_matter(A)::text, 'false';
end $t$;

set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
select public.set_matter_member_role((select v::uuid from fx where k='A'), (select v::uuid from fx where k='them'), 'reviewer');
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
declare A uuid := (select v::uuid from fx where k='A');
begin
  insert into r select '48 reviewer may review', public.can_review_matter(A)::text, 'true';
  insert into r select '49 reviewer may not write content', public.can_write_matter(A)::text, 'false';
end $t$;

-- ===========================================================================
-- Removing actually removes
-- ===========================================================================
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
select public.remove_matter_member((select v::uuid from fx where k='A'), (select v::uuid from fx where k='them'));
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
declare A uuid := (select v::uuid from fx where k='A');
begin
  insert into r select '50 removal removes the matter', (select count(*)::text from public.matters where id=A), '0';
  insert into r select '51 removal removes its clauses', (select count(*)::text from public.clauses where matter_id=A), '0';
  insert into r select '52 removal removes its flow', (select count(*)::text from public.matter_flows where matter_id=A), '0';
  insert into r select '53 removal removes its documents', (select count(*)::text from public.documents where matter_id=A), '0';
  insert into r select '54 he now sees nothing at all', (select count(*)::text from public.matters), '0';
end $t$;

-- ===========================================================================
-- The owner lost nothing. The regression check, and the one most likely to
-- fail quietly.
-- ===========================================================================
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
do $t$
begin
  insert into r select '55 owner still sees every matter', (select count(*)::text from public.matters), (select v from fx where k='own_matters');
  insert into r select '56 owner still sees every clause', (select count(*)::text from public.clauses), (select v from fx where k='own_clauses');
  insert into r select '57 owner still sees every document', (select count(*)::text from public.documents), (select v from fx where k='own_docs');
  insert into r select '58 owner still sees firm knowledge', (select case when count(*)>0 then 'some' else 'none' end from public.playbooks), 'some';
  insert into r select '59 register works for the owner',
    (select count(*)::text from public.matter_register((select v::uuid from fx where k='ws'))), (select v from fx where k='firm_matters');
end $t$;

-- The register's shape, read from the catalogue. It must not grow.
insert into r select '60 register exposes only the agreed metadata',
  (select string_agg(nm, ',' order by ord)
     from (select unnest(p.proargnames) as nm, generate_series(1, array_length(p.proargnames,1)) as ord
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname='public' and p.proname='matter_register') q
    where nm <> 'p_workspace'),
  'reference,name,client,lead_name,member_count,archived,binned';

reset role;
select test, got, want, case when got = want then 'PASS' else 'FAIL' end as result from r order by test;
rollback;
