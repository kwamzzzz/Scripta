-- PHASE 6: knowledge sharing, approval, and the matter boundary.
--
-- The assertion this file exists for is P01: THE FIRM OWNER CANNOT SEE ANOTHER
-- LAWYER'S PRIVATE KNOWLEDGE.
--
-- Everything before Phase 6 read `is_workspace_member(workspace_id)` and
-- nothing else, so belonging to the firm WAS permission. That was never a
-- decision about knowledge; it was the absence of one. P01 is the proof it has
-- actually been replaced rather than merely described — and the firm's owner is
-- the hardest case, because every other rule in Scripta gives them more.
--
-- V02 is the other one to read. A precedent extracted from a matter is
-- deliberately reusable by people with no right to that matter, so the
-- provenance is the side channel: it is the only part of a shared object that
-- still points at confidential work. PROVENANCE VISIBILITY <= SOURCE
-- VISIBILITY, asserted field by field rather than in prose.
--
-- Fixtures are PLANTED and the roles are SET, so nothing here depends on who
-- happens to be in which workspace this week — the lesson from the Phase 5
-- lease suite, whose boundary block silently skipped.
--
-- Runs against the live database as three real users and ROLLS BACK.

begin;
create temp table r(test text, got text, want text) on commit drop;
create temp table fx(k text, v text) on commit drop;
grant all on r to authenticated;
grant all on fx to authenticated;

insert into fx values
 ('forex','d832b081-cf82-4dc0-a5b9-b0241fe50d9b'),   -- the firm
 ('atlas','c0c2b172-4856-4e84-bf40-fafe7f9dee42'),   -- a matter in it
 ('A','176d2a8c-10f1-429b-82f2-dde207c99a68'),       -- Podrick: lawyer, on the matter
 ('B','6df711b6-27b0-4aaf-8129-ef39700de7bb'),       -- Mawusi: OWNER of the firm
 ('C','4c43a265-d7e0-4eff-9d8f-2b6a9e5a8ed7');       -- Kwame: outside, then a firm lawyer

set local role authenticated;
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';

-- ===========================================================================
-- R — the shape the real client sends
-- ===========================================================================
--
-- `capturePrecedent()` really did send `approved: status === 'approved' ||
-- status === 'executed'`, and really did send matter provenance. This is that
-- insert, verbatim, including the parts that used to work.
do $t$
declare nid uuid;
begin
  insert into public.precedents
    (workspace_id, title, body, kind, source_kind, status, clause_type, source_note, matter_id, approved)
  values ((select v::uuid from fx where k='forex'), 'Limitation of liability',
          'The Seller''s aggregate liability shall not exceed the Price.',
          'clause', 'captured', 'executed', 'Liability',
          'Taken from the Westpoint Mining SPA', (select v::uuid from fx where k='atlas'), true)
  returning id into nid;
  insert into fx values ('p', nid::text);
end $t$;

insert into r select 'R01 a precedent never arrives approved, whatever the client sent',
  (select (approved_at is null)::text from public.precedents where id=(select v::uuid from fx where k='p')), 'true';
insert into r select 'R02 nor with the approved flag set',
  (select approved::text from public.precedents where id=(select v::uuid from fx where k='p')), 'false';
insert into r select 'R03 and authorship is stamped by the server, not sent',
  (select created_by::text from public.precedents where id=(select v::uuid from fx where k='p')),
  (select v from fx where k='A');

-- ===========================================================================
-- P — private is private, including from the firm's owner
-- ===========================================================================
select public.set_knowledge_visibility('precedent',(select v::uuid from fx where k='p'),'private');
insert into r select 'P00 the owner still sees their own private work',
  (select count(*)::text from public.precedents where id=(select v::uuid from fx where k='p')), '1';

set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
insert into r select 'P01 THE FIRM OWNER CANNOT SEE ANOTHER LAWYER''S PRIVATE KNOWLEDGE',
  (select count(*)::text from public.precedents where id=(select v::uuid from fx where k='p')), '0';
insert into r select 'P02 nor find it by listing',
  (select count(*)::text from public.precedents where title='Limitation of liability'), '0';
insert into r select 'P03 nor learn anything from the provenance resolver',
  (select count(*)::text from public.precedent_provenance((select v::uuid from fx where k='p'))), '0';
do $t$
declare refused boolean := false;
begin
  begin perform public.approve_knowledge('precedent',(select v::uuid from fx where k='p'));
  exception when others then refused := true; end;
  insert into r select 'P04 and cannot approve what they cannot see', refused::text, 'true';
end $t$;

-- ===========================================================================
-- X / S — outside the firm, and inside it without a share
-- ===========================================================================
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
select public.set_knowledge_visibility('precedent',(select v::uuid from fx where k='p'),'shared');
select public.share_knowledge('precedent',(select v::uuid from fx where k='p'),(select v::uuid from fx where k='B'));

set local request.jwt.claims = '{"sub":"4c43a265-d7e0-4eff-9d8f-2b6a9e5a8ed7","role":"authenticated"}';
insert into r select 'X01 somebody outside the firm sees nothing',
  (select count(*)::text from public.precedents where id=(select v::uuid from fx where k='p')), '0';

set local role postgres;
insert into public.workspace_members (workspace_id, user_id, role)
values ((select v::uuid from fx where k='forex'),(select v::uuid from fx where k='C'),'lawyer')
on conflict do nothing;
set local role authenticated;

set local request.jwt.claims = '{"sub":"4c43a265-d7e0-4eff-9d8f-2b6a9e5a8ed7","role":"authenticated"}';
insert into r select 'S01 a firm lawyer who was not shared with cannot use it',
  (select count(*)::text from public.precedents where id=(select v::uuid from fx where k='p')), '0';
insert into r select 'S01a nor see that anything happened to it',
  (select count(*)::text from public.audit_events where entity_id=(select v::uuid from fx where k='p')), '0';

set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
insert into r select 'S02 the person it was shared with can',
  (select count(*)::text from public.precedents where id=(select v::uuid from fx where k='p')), '1';
insert into r select 'S02a and is told it was shared with them',
  (select count(*)::text from public.events_involving_me(100)
    where entity_id=(select v::uuid from fx where k='p') and event_type='knowledge.shared'), '1';

set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
insert into r select 'S02b while the sharer is never told about their own doing',
  (select count(*)::text from public.events_involving_me(100)
    where entity_id=(select v::uuid from fx where k='p') and event_type='knowledge.shared'), '0';
select public.unshare_knowledge('precedent',(select v::uuid from fx where k='p'),(select v::uuid from fx where k='B'));
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
insert into r select 'S03 removing the share removes the access',
  (select count(*)::text from public.precedents where id=(select v::uuid from fx where k='p')), '0';

-- ===========================================================================
-- F / A — firm-wide, and what approval adds to it
-- ===========================================================================
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
select public.set_knowledge_visibility('precedent',(select v::uuid from fx where k='p'),'firm');
set local request.jwt.claims = '{"sub":"4c43a265-d7e0-4eff-9d8f-2b6a9e5a8ed7","role":"authenticated"}';
insert into r select 'F01 firm-wide reaches every firm lawyer',
  (select count(*)::text from public.precedents where id=(select v::uuid from fx where k='p')), '1';
insert into r select 'F02 BUT FIRM-WIDE IS NOT APPROVED',
  (select approved::text from public.precedents where id=(select v::uuid from fx where k='p')), 'false';

do $t$
declare refused boolean := false;
begin
  begin perform public.approve_knowledge('precedent',(select v::uuid from fx where k='p'));
  exception when others then refused := true; end;
  insert into r select 'A01 a lawyer who may edit firm knowledge may not approve it', refused::text, 'true';
end $t$;

set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
select public.approve_knowledge('precedent',(select v::uuid from fx where k='p'));
insert into r select 'A02 an owner or admin can, and it is attributable',
  (select approved_by::text from public.precedents where id=(select v::uuid from fx where k='p')),
  (select v from fx where k='B');
insert into r select 'A03 and it now reads as approved',
  (select approved::text from public.precedents where id=(select v::uuid from fx where k='p')), 'true';

-- The amendment rule. Metadata keeps it; wording does not.
update public.precedents set sector='Mining' where id=(select v::uuid from fx where k='p');
insert into r select 'A04 a metadata change keeps the approval',
  (select approved::text from public.precedents where id=(select v::uuid from fx where k='p')), 'true';
update public.precedents set body='The Seller''s liability shall not exceed 50% of the Price.'
 where id=(select v::uuid from fx where k='p');
insert into r select 'A05 REWRITING THE WORDING DOES NOT',
  (select approved::text from public.precedents where id=(select v::uuid from fx where k='p')), 'false';
insert into r select 'A06 and who approved what is still on the record',
  (select (approved_by is not null and approved_at is not null)::text
     from public.precedents where id=(select v::uuid from fx where k='p')), 'true';

-- The rules ARE the playbook, so a rule change invalidates its approval.
do $t$
declare pb uuid;
begin
  insert into public.playbooks (workspace_id, name, status, approval, approvers)
  values ((select v::uuid from fx where k='forex'), 'Supply playbook', 'Active', 'Not required', '{}')
  returning id into pb;
  insert into fx values ('pb', pb::text);
  perform public.set_knowledge_visibility('playbook', pb, 'firm');
  perform public.approve_knowledge('playbook', pb);
  insert into r select 'A07 a playbook can be approved',
    (select public.knowledge_approved(approved_at, content_changed_at)::text from public.playbooks where id=pb), 'true';
  insert into public.playbook_rules (playbook_id, topic, preferred, ordinal)
  values (pb, 'Liability', 'Cap at the Price', 1);
  insert into r select 'A08 and adding a rule invalidates it, because the rules ARE the playbook',
    (select public.knowledge_approved(approved_at, content_changed_at)::text from public.playbooks where id=pb), 'false';
end $t$;

-- Narrowing drops the approval outright.
--
-- Asserted from the OWNER's side, not the admin's. An earlier version checked
-- as the admin who narrowed it and got a null: the moment firm knowledge
-- becomes private it is its owner's private work, and an admin is not its
-- owner, so they correctly stop being able to see it. The product was right and
-- the assertion was reading from a viewpoint that no longer exists.
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
select public.approve_knowledge('precedent',(select v::uuid from fx where k='p'));
select public.set_knowledge_visibility('precedent',(select v::uuid from fx where k='p'),'private');
insert into r select 'A09 the admin who narrowed it can no longer see it',
  (select count(*)::text from public.precedents where id=(select v::uuid from fx where k='p')), '0';

set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
insert into r select 'A10 TAKING IT BACK FROM THE FIRM DROPS THE APPROVAL',
  (select (approved_at is null and not approved)::text
     from public.precedents where id=(select v::uuid from fx where k='p')), 'true';
select public.set_knowledge_visibility('precedent',(select v::uuid from fx where k='p'),'firm');
insert into r select 'A11 and it does not come back merely by going firm-wide again',
  (select approved::text from public.precedents where id=(select v::uuid from fx where k='p')), 'false';

-- ===========================================================================
-- V — PROVENANCE VISIBILITY <= SOURCE VISIBILITY
-- ===========================================================================
set local request.jwt.claims = '{"sub":"4c43a265-d7e0-4eff-9d8f-2b6a9e5a8ed7","role":"authenticated"}';
insert into r select 'V01 C can use knowledge derived from a matter he is not on',
  (select count(*)::text from public.precedents where id=(select v::uuid from fx where k='p')), '1';
insert into r select 'V02 AND LEARNS ONLY THAT IT IS DERIVED FROM PRIOR WORK',
  (select (derived and not may_see_source
           and matter_id is null and matter_name is null and matter_reference is null
           and document_id is null and clause_id is null and source_note is null)::text
     from public.precedent_provenance((select v::uuid from fx where k='p'))), 'true';
insert into r select 'V03 and cannot read the source columns directly either',
  (select has_column_privilege('authenticated','public.precedents','matter_id','SELECT')::text), 'false';

set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
insert into r select 'V04 while somebody on the matter gets the real thing',
  (select (may_see_source and matter_name is not null and source_note is not null)::text
     from public.precedent_provenance((select v::uuid from fx where k='p'))), 'true';

-- ===========================================================================
-- W — the workflow tools surface exactly what the caller may use
-- ===========================================================================
--
-- These are the EXACT reads the server functions issue, not paraphrases of
-- them: the precedent picker in `drafting.functions.ts`, the matter-side list
-- in `matter-data.ts`, and the rule-to-playbook join that
-- `analysis.functions.ts`, `contract-draft.functions.ts` and
-- `review/functions.ts` all use.
--
-- None of them needed changing, and that is the point worth recording.
-- `requireSupabaseAuth` builds its client from the publishable key with the
-- caller's own JWT — there is no service-role bypass anywhere in the knowledge
-- path — so RLS is the single enforcement point and tightening the policies
-- tightened every picker at once. A precedent picker that queried everything
-- and hid the rest client-side was never possible here.
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
declare nid uuid; pb uuid;
begin
  insert into public.precedents (workspace_id, title, body, kind, source_kind, status)
  values ((select v::uuid from fx where k='forex'), 'Private clause', 'Secret.', 'clause', 'captured', 'draft')
  returning id into nid;
  insert into fx values ('wp', nid::text);
  perform public.set_knowledge_visibility('precedent', nid, 'private');

  insert into public.playbooks (workspace_id, name, status, approval, approvers)
  values ((select v::uuid from fx where k='forex'), 'Private playbook', 'Active', 'Not required', '{}')
  returning id into pb;
  insert into fx values ('wpb', pb::text);
  perform public.set_knowledge_visibility('playbook', pb, 'private');
  insert into public.playbook_rules (playbook_id, topic, preferred, ordinal) values (pb, 'Liability', 'Cap', 1);
end $t$;

set local request.jwt.claims = '{"sub":"4c43a265-d7e0-4eff-9d8f-2b6a9e5a8ed7","role":"authenticated"}';
insert into r select 'W01 the precedent picker returns nothing it may not use',
  (select count(*)::text from public.precedents where id=(select v::uuid from fx where k='wp')), '0';
insert into r select 'W02 the matter-side precedent list likewise',
  (select count(*)::text from public.precedents
    where workspace_id=(select v::uuid from fx where k='forex') and title='Private clause'), '0';
insert into r select 'W03 a playbook rule is unreachable when its playbook is private',
  (select count(*)::text from public.playbook_rules where playbook_id=(select v::uuid from fx where k='wpb')), '0';
insert into r select 'W04 nor reachable through the rule-to-playbook join the tools use',
  (select count(*)::text from public.playbook_rules pr
     join public.playbooks p on p.id = pr.playbook_id
    where pr.playbook_id=(select v::uuid from fx where k='wpb')), '0';

set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
insert into r select 'W05 while the owner''s own tools still find their own work',
  (select count(*)::text from public.playbook_rules pr join public.playbooks p on p.id = pr.playbook_id
    where pr.playbook_id=(select v::uuid from fx where k='wpb')), '1';

reset role;
select test, got, want, case when got = want then 'PASS' else 'FAIL' end as result from r order by test;
rollback;
