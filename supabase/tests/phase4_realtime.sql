-- PHASE 4, STEP 6: realtime, asserted on its own.
--
-- The original plan treated this as a line in a phase — "publish some tables,
-- it respects RLS". Deletes do not, and presence is not gated by table policies
-- at all, so it became its own step with its own suite. This is that suite.
--
-- WHAT THIS FILE CAN AND CANNOT PROVE.
--
-- Realtime authorises a change by running the table's SELECT policy AS THE
-- SUBSCRIBER and dropping the row if it would not be readable. So asking those
-- four policies, as a non-member, for a matter they are not on, is asking
-- Realtime's own question — and that is what section S does.
--
-- What it cannot do is prove the delivery: that the websocket actually stayed
-- silent. That is the two-user browser test, and it is the reason this step has
-- one.
--
-- Runs against the live database as two real users and ROLLS BACK.

begin;
create temp table r(test text, got text, want text) on commit drop;
create temp table fx(k text, v text) on commit drop;
grant all on r to authenticated;
grant all on fx to authenticated;

insert into fx values
 ('atlas','c0c2b172-4856-4e84-bf40-fafe7f9dee42'),  -- Podrick is on this one
 ('ptm','99bc433c-4910-4c96-aa95-5196e0eae29d'),    -- and not on this one
 ('ws','d832b081-cf82-4dc0-a5b9-b0241fe50d9b'),
 ('me','6df711b6-27b0-4aaf-8129-ef39700de7bb'),
 ('them','176d2a8c-10f1-429b-82f2-dde207c99a68');

-- ===========================================================================
-- W — what is published
-- ===========================================================================
insert into r select 'W01 exactly four tables are published',
  (select count(*)::text from pg_publication_rel pr join pg_publication p on p.oid = pr.prpubid
     join pg_class c on c.oid = pr.prrelid join pg_namespace n on n.oid = c.relnamespace
    where p.pubname = 'supabase_realtime' and n.nspname = 'public'), '4';
insert into r select 'W02 and they are the four we meant',
  (select string_agg(c.relname, ',' order by c.relname) from pg_publication_rel pr
     join pg_publication p on p.oid = pr.prpubid join pg_class c on c.oid = pr.prrelid
     join pg_namespace n on n.oid = c.relnamespace
    where p.pubname = 'supabase_realtime' and n.nspname = 'public'),
  'approvals,comments,flow_deliverables,tasks';

-- The one that is easy to get wrong and impossible to see: a DELETE payload
-- carries only the primary key, because the row is gone and there is nothing
-- left to run a policy against. It therefore reaches EVERY subscriber.
insert into r select 'W03 DELETES ARE NOT PUBLISHED — RLS cannot filter a payload that is only a key',
  (select pubdelete::text from pg_publication where pubname = 'supabase_realtime'), 'false';
insert into r select 'W04 nor truncates',
  (select pubtruncate::text from pg_publication where pubname = 'supabase_realtime'), 'false';
insert into r select 'W05 inserts and updates are',
  (select (pubinsert and pubupdate)::text from pg_publication where pubname = 'supabase_realtime'), 'true';

-- Section 13: document text waits for a model that can merge it. Publishing it
-- now would establish last-write-wins as the concurrent-editing behaviour, and
-- Phase 5 would have to unpick that from a product people had already learned.
insert into r select 'W06 no document text is published',
  (select count(*)::text from pg_publication_rel pr join pg_publication p on p.oid = pr.prpubid
     join pg_class c on c.oid = pr.prrelid join pg_namespace n on n.oid = c.relnamespace
    where p.pubname = 'supabase_realtime' and n.nspname = 'public'
      and c.relname in ('clauses','documents','contract_drafts','drafts',
                        'corporate_documents','document_versions')), '0';

-- Realtime's filtering IS the table's SELECT policy. A published table with RLS
-- off is a firehose.
insert into r select 'W07 every published table has row-level security on',
  (select count(*)::text from pg_publication_rel pr join pg_publication p on p.oid = pr.prpubid
     join pg_class c on c.oid = pr.prrelid join pg_namespace n on n.oid = c.relnamespace
    where p.pubname = 'supabase_realtime' and n.nspname = 'public' and not c.relrowsecurity), '0';
insert into r select 'W08 replica identity stays default, so an update carries no whole old row',
  (select count(*)::text from pg_publication_rel pr join pg_publication p on p.oid = pr.prpubid
     join pg_class c on c.oid = pr.prrelid join pg_namespace n on n.oid = c.relnamespace
    where p.pubname = 'supabase_realtime' and n.nspname = 'public' and c.relreplident <> 'd'), '0';

-- ===========================================================================
-- S — the question Realtime will ask, asked here
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
do $t$
declare tk uuid; cm uuid; ap uuid;
begin
  insert into public.tasks (workspace_id, matter_id, title, status)
  values ((select v::uuid from fx where k='ws'), (select v::uuid from fx where k='ptm'),
          'Realtime probe task', 'Open') returning id into tk;
  insert into public.comments (workspace_id, entity_kind, entity_id, body, author_id)
  values ((select v::uuid from fx where k='ws'), 'matter', (select v::uuid from fx where k='ptm'),
          'Realtime probe comment', (select v::uuid from fx where k='me')) returning id into cm;
  insert into public.approvals (workspace_id, entity_kind, entity_id, status, requested_by, assigned_to)
  values ((select v::uuid from fx where k='ws'), 'matter', (select v::uuid from fx where k='ptm'),
          'Requested', (select v::uuid from fx where k='me'), (select v::uuid from fx where k='me'))
  returning id into ap;
  insert into fx values ('tk', tk::text), ('cm', cm::text), ('ap', ap::text);
end $t$;

set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
begin
  insert into r select 'S01 a non-member cannot read the task row, so realtime drops it',
    (select count(*)::text from public.tasks where id = (select v::uuid from fx where k='tk')), '0';
  insert into r select 'S02 nor the comment row',
    (select count(*)::text from public.comments where id = (select v::uuid from fx where k='cm')), '0';
  insert into r select 'S03 nor the approval row',
    (select count(*)::text from public.approvals where id = (select v::uuid from fx where k='ap')), '0';
  insert into r select 'S04 nor any deliverable on a matter he is not on',
    (select count(*)::text from public.flow_deliverables d
      join public.matter_flows f on f.id = d.flow_id
      where f.matter_id = (select v::uuid from fx where k='ptm')), '0';
end $t$;

-- The control, without which S01 to S04 also pass when the fixture is broken.
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
do $t$
declare cm uuid;
begin
  insert into public.comments (workspace_id, entity_kind, entity_id, body, author_id)
  values ((select v::uuid from fx where k='ws'), 'matter', (select v::uuid from fx where k='atlas'),
          'Realtime control comment', (select v::uuid from fx where k='me')) returning id into cm;
  insert into fx values ('cm2', cm::text);
end $t$;
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
insert into r select 'S05 CONTROL: on a matter he IS on, the identical read succeeds',
  (select count(*)::text from public.comments where id = (select v::uuid from fx where k='cm2')), '1';

reset role;
select test, got, want, case when got = want then 'PASS' else 'FAIL' end as result from r order by test;
rollback;
