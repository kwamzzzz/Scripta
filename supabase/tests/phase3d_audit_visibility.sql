-- An audit event must never reveal more than the thing it records.
--
-- The third defect of this shape in Phase 3. Podrick, a firm member with no
-- access to Kwame's unfiled research, could read the trail about it: titles,
-- renames, and how many authorities and findings each note held. The research
-- table correctly returned nothing; the audit table read it out loud.
--
-- Note what is NOT asserted here: raw row totals. An audit table grows while
-- you work, and a test that counts all of it fails for reasons that have
-- nothing to do with access. Every assertion below is about WHOSE rows are
-- visible, not how many exist.
--
-- Runs as two real users against the live database and ROLLS BACK.

begin;
create temp table r(test text, got text, want text) on commit drop;
grant all on r to authenticated;

set local role authenticated;

-- ===========================================================================
-- Podrick: firm member, Editor on Atlas, no access to matter A or to any of
-- Kwame's unfiled research.
-- ===========================================================================
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
declare
  him uuid := '176d2a8c-10f1-429b-82f2-dde207c99a68';
  atlas uuid := 'c0c2b172-4856-4e84-bf40-fafe7f9dee42';
  matterA uuid := '99bc433c-4910-4c96-aa95-5196e0eae29d';
begin
  -- The leak itself, three ways: by event type, by the titles it carried, and
  -- by the work-volume counts in its summaries.
  insert into r select 'A1 no research events by anybody else',
    (select count(*)::text from public.audit_events
      where event_type like 'research.%' and actor_id <> him), '0';
  insert into r select 'A2 cannot find the UAE liability cap title',
    (select count(*)::text from public.audit_events where summary ilike '%Liability Cap%'), '0';
  insert into r select 'A3 cannot find the WAGAS gold title',
    (select count(*)::text from public.audit_events where summary ilike '%WAGAS whether Ghanaian%'), '0';
  insert into r select 'A4 no authority or finding counts',
    (select count(*)::text from public.audit_events where summary ilike '%authorities%'), '0';

  -- Entity identifiers and metadata JSON are part of the row and covered by the
  -- same policy, but asserted separately because they are how a leak survives a
  -- fix to the summary text.
  insert into r select 'A5 no research entity ids by anybody else',
    (select count(*)::text from public.audit_events
      where entity_type = 'research_matter' and actor_id <> him), '0';
  insert into r select 'A6 no metadata from hidden research rows',
    (select count(*)::text from public.audit_events
      where metadata::text ilike '%research%' and matter_id is null and actor_id <> him), '0';

  -- Matter history follows the matter.
  insert into r select 'A7 nothing about matter A',
    (select count(*)::text from public.audit_events where matter_id = matterA), '0';
  insert into r select 'A8 nothing about any matter he is not on',
    (select count(*)::text from public.audit_events
      where matter_id is not null and matter_id <> atlas), '0';

  -- Nothing of Kwame's, anywhere, except firm administration.
  insert into r select 'A9 no rows of Kwames outside Atlas and firm admin',
    (select count(*)::text from public.audit_events
      where actor_id = '6df711b6-27b0-4aaf-8129-ef39700de7bb'
        and matter_id is distinct from atlas
        and event_type not like 'workspace.%'), '0';

  -- What he legitimately keeps. A boundary that took these away would be the
  -- other kind of failure.
  insert into r select 'A10 his own matter history is his',
    (select case when count(*) > 0 then 'some' else 'none' end
       from public.audit_events where matter_id = atlas), 'some';
  insert into r select 'A11 firm administration remains visible',
    (select case when count(*) > 0 then 'some' else 'none' end from public.audit_events
      where event_type in ('workspace.renamed','workspace.invite_created','workspace.invite_accepted')), 'some';
  insert into r select 'A12 his own research event is still his',
    (select count(*)::text from public.audit_events
      where event_type like 'research.%' and actor_id = him), '1';
end
$t$;

-- ===========================================================================
-- The author keeps his own and gains none of Podrick's.
-- ===========================================================================
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
do $t$
declare me uuid := '6df711b6-27b0-4aaf-8129-ef39700de7bb';
begin
  insert into r select 'A13 the author keeps his research trail',
    (select case when count(*) > 10 then 'many' else 'too few' end from public.audit_events
      where event_type like 'research.%' and actor_id = me), 'many';
  insert into r select 'A14 and gains none of Podricks',
    (select count(*)::text from public.audit_events
      where event_type like 'research.%' and actor_id = '176d2a8c-10f1-429b-82f2-dde207c99a68'), '0';
  insert into r select 'A15 and keeps every matter history',
    (select case when count(*) > 0 then 'some' else 'none' end from public.audit_events
      where matter_id = '99bc433c-4910-4c96-aa95-5196e0eae29d'), 'some';
end
$t$;

-- ===========================================================================
-- The fail-safe itself: an unclassified event type is the actor's alone.
-- ===========================================================================
reset role;
insert into r select 'A16 an unclassified firm event is actor-only',
  public.audit_event_visible(
    null, null, 'd832b081-cf82-4dc0-a5b9-b0241fe50d9b'::uuid,
    'workspace', null, 'workspace.some_future_private_thing',
    '6df711b6-27b0-4aaf-8129-ef39700de7bb'::uuid)::text,
  'false';
insert into r select 'A17 a classified firm event is not',
  (public.audit_event_visible(
    null, null, 'd832b081-cf82-4dc0-a5b9-b0241fe50d9b'::uuid,
    'workspace', null, 'workspace.renamed',
    '6df711b6-27b0-4aaf-8129-ef39700de7bb'::uuid) is not null)::text,
  'true';

select test, got, want, case when got = want then 'PASS' else 'FAIL' end as result from r order by test;
rollback;
