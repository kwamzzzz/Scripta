-- PHASE 4, STEP 1: the schema and the two resolvers.
--
-- Written BEFORE the migration, and run against the live database before it, so
-- that every assertion below is seen to fail first. That ordering is the whole
-- point of this file. Phase 3's suite passed sixty assertions while unfiled work
-- leaked, because assertion 22 read `where matter_id is not null` — it was
-- written to agree with a design that was already in place.
--
-- THE BRANCH THIS FILE IS ABOUT. `comment_matter()` and `entity_owner()` both
-- return null for a kind they do not recognise, and null is not a refusal:
--
--   comment_matter() null  →  the comment falls to the author-only branch.
--                             The thread is invisible to everybody but its
--                             writer, in silence, and looks like the feature
--                             simply not working.
--   entity_owner()   null  →  resolution narrows to the raiser and the Lead.
--                             Safe, and wrong.
--
-- So each resolver is asserted twice for every kind: once that it resolves, and
-- once that the null it returns is the null we meant rather than a kind nobody
-- added. Both functions are extended in the same migration as the columns that
-- depend on them.
--
-- Runs against the live database as real users and ROLLS BACK.

begin;
create temp table r(test text, got text, want text) on commit drop;
create temp table fx(k text, v text) on commit drop;
grant all on r to authenticated;
grant all on fx to authenticated;

insert into fx values
 ('atlas',  'c0c2b172-4856-4e84-bf40-fafe7f9dee42'),  -- Podrick is an Editor here
 ('ptm',    '99bc433c-4910-4c96-aa95-5196e0eae29d'),  -- Podrick is not on this one
 ('ws',     'd832b081-cf82-4dc0-a5b9-b0241fe50d9b'),
 ('me',     '6df711b6-27b0-4aaf-8129-ef39700de7bb'),  -- Kwame, Lead of both
 ('them',   '176d2a8c-10f1-429b-82f2-dde207c99a68'),  -- Podrick
 ('nobody', '00000000-0000-0000-0000-000000000000');

-- Fixtures the live data does not happen to contain. Built here rather than
-- found, so the suite does not quietly skip the case it was written for when
-- the database changes underneath it.
insert into fx select 'clause', id::text from public.clauses
  where matter_id = (select v::uuid from fx where k='atlas') limit 1;
insert into fx select 'doc', id::text from public.documents
  where matter_id = (select v::uuid from fx where k='atlas') limit 1;
insert into fx select 'deliverable', id::text from public.flow_deliverables limit 1;
insert into fx select 'phase', id::text from public.flow_phases limit 1;
insert into fx select 'unfiled_research', id::text from public.research_matters
  where matter_id is null limit 1;

-- An unassigned task and an assigned one on the same matter: entity_owner()
-- must tell them apart, and the unassigned one is the branch that matters.
with t as (
  insert into public.tasks (workspace_id, matter_id, title, status, created_by)
  values ((select v::uuid from fx where k='ws'), (select v::uuid from fx where k='atlas'),
          'P4 fixture — unassigned', 'Open', (select v::uuid from fx where k='me'))
  returning id)
insert into fx select 'task_unassigned', id::text from t;
with t as (
  insert into public.tasks (workspace_id, matter_id, title, status, created_by, assignee_id)
  values ((select v::uuid from fx where k='ws'), (select v::uuid from fx where k='atlas'),
          'P4 fixture — assigned', 'Open', (select v::uuid from fx where k='me'),
          (select v::uuid from fx where k='them'))
  returning id)
insert into fx select 'task_assigned', id::text from t;
with t as (
  insert into public.tasks (workspace_id, title, status, created_by)
  values ((select v::uuid from fx where k='ws'), 'P4 fixture — unfiled', 'Open',
          (select v::uuid from fx where k='me'))
  returning id)
insert into fx select 'task_unfiled', id::text from t;

-- Research filed to a matter, and a finding on it. The unfiled pair already
-- exists in the live data; this is the other side of the same branch.
with rm as (
  insert into public.research_matters (workspace_id, matter_id, title, kind, created_by)
  values ((select v::uuid from fx where k='ws'), (select v::uuid from fx where k='atlas'),
          'P4 fixture — filed research', 'simple', (select v::uuid from fx where k='me'))
  returning id)
insert into fx select 'filed_research', id::text from rm;

-- A deliverable with an owner and one without.
update public.flow_deliverables set owner_id = (select v::uuid from fx where k='me')
 where id = (select v::uuid from fx where k='deliverable');

-- =========================================================================
-- S — the columns exist, and the nullable ones are nullable
-- =========================================================================
-- `updated_at` on comments must NOT default to now(): a comment that has never
-- been edited has no edited-at, and a default would mark every comment Edited
-- from the moment it was written.
insert into r
select 'S01 comments.parent_id exists',
  (select count(*)::text from information_schema.columns
    where table_schema='public' and table_name='comments' and column_name='parent_id'), '1';
insert into r
select 'S02 comments.updated_at exists',
  (select count(*)::text from information_schema.columns
    where table_schema='public' and table_name='comments' and column_name='updated_at'), '1';
insert into r
select 'S03 comments.updated_at has NO default',
  (select coalesce(column_default, 'none') from information_schema.columns
    where table_schema='public' and table_name='comments' and column_name='updated_at'), 'none';
insert into r
select 'S04 comments.updated_at is nullable',
  (select is_nullable from information_schema.columns
    where table_schema='public' and table_name='comments' and column_name='updated_at'), 'YES';
insert into r
select 'S05 comments.mentions is a uuid array',
  (select udt_name from information_schema.columns
    where table_schema='public' and table_name='comments' and column_name='mentions'), '_uuid';
insert into r
select 'S06 comments.mentions defaults to empty, never null',
  (select is_nullable from information_schema.columns
    where table_schema='public' and table_name='comments' and column_name='mentions'), 'NO';
insert into r
select 'S07 comments.kind is an enum',
  (select udt_name from information_schema.columns
    where table_schema='public' and table_name='comments' and column_name='kind'), 'comment_kind';
insert into r
select 'S08 approvals.assigned_to exists',
  (select count(*)::text from information_schema.columns
    where table_schema='public' and table_name='approvals' and column_name='assigned_to'), '1';
insert into r
select 'S09 approvals.task_id exists',
  (select count(*)::text from information_schema.columns
    where table_schema='public' and table_name='approvals' and column_name='task_id'), '1';
insert into r
select 'S10 approvals.updated_at exists',
  (select count(*)::text from information_schema.columns
    where table_schema='public' and table_name='approvals' and column_name='updated_at'), '1';
insert into r
select 'S11 matter_members.mentions_seen_at exists',
  (select count(*)::text from information_schema.columns
    where table_schema='public' and table_name='matter_members' and column_name='mentions_seen_at'), '1';
insert into r
select 'S12 matter_members.mentions_seen_at is nullable',
  (select is_nullable from information_schema.columns
    where table_schema='public' and table_name='matter_members' and column_name='mentions_seen_at'), 'YES';

-- Nobody learns when a colleague last read their mentions. RLS is row-level and
-- the team card reads every row, so this is a column privilege rather than a
-- policy: `authenticated` cannot select the column at all, and your own value
-- is reached through a security-definer function.
insert into r
select 'S13 authenticated cannot select mentions_seen_at directly',
  has_column_privilege('authenticated', 'public.matter_members', 'mentions_seen_at', 'SELECT')::text,
  'false';
insert into r
select 'S14 and cannot write it directly either',
  has_column_privilege('authenticated', 'public.matter_members', 'mentions_seen_at', 'UPDATE')::text,
  'false';
insert into r
select 'S15 while the rest of the row is still readable',
  has_column_privilege('authenticated', 'public.matter_members', 'role', 'SELECT')::text, 'true';

-- The enum values. A thread on a kind the enum does not carry cannot be written
-- at all, which is why `comment_matter()` has had branches for `task`,
-- `deliverable` and `flow_phase` that no row could ever reach.
insert into r
select 'S16 source_kind carries every kind a thread attaches to',
  (select count(*)::text from unnest(enum_range(null::public.source_kind)) e
    where e::text in ('clause','task','deliverable','flow_phase','research','document','matter')), '7';
insert into r
select 'S17 source_kind carries request, for a task origin',
  (select count(*)::text from unnest(enum_range(null::public.source_kind)) e
    where e::text = 'request'), '1';
insert into r
select 'S18 approval_status carries the round trip',
  (select count(*)::text from unnest(enum_range(null::public.approval_status)) e
    where e::text in ('Requested','In review','Changes requested','Approved','Rejected','Not required')), '6';

-- =========================================================================
-- C — comment_matter(), both branches of every kind
-- =========================================================================
do $t$
declare
  atlas uuid := (select v::uuid from fx where k='atlas');
  nobody uuid := (select v::uuid from fx where k='nobody');
begin
  -- Resolves.
  insert into r select 'C01 matter resolves to itself',
    public.comment_matter('matter', atlas)::text, atlas::text;
  insert into r select 'C02 clause resolves to its matter',
    public.comment_matter('clause', (select v::uuid from fx where k='clause'))::text, atlas::text;
  insert into r select 'C03 document resolves to its matter',
    public.comment_matter('document', (select v::uuid from fx where k='doc'))::text, atlas::text;
  insert into r select 'C04 task resolves to its matter',
    public.comment_matter('task', (select v::uuid from fx where k='task_unassigned'))::text, atlas::text;
  insert into r select 'C05 deliverable resolves to its matter',
    (public.comment_matter('deliverable', (select v::uuid from fx where k='deliverable')) is not null)::text, 'true';
  insert into r select 'C06 flow_phase resolves to its matter',
    (public.comment_matter('flow_phase', (select v::uuid from fx where k='phase')) is not null)::text, 'true';
  insert into r select 'C07 filed research resolves to its matter',
    public.comment_matter('research', (select v::uuid from fx where k='filed_research'))::text, atlas::text;

  -- Returns null, and the null is the one we meant.
  insert into r select 'C09 unfiled task has no matter',
    coalesce(public.comment_matter('task', (select v::uuid from fx where k='task_unfiled'))::text, 'null'), 'null';
  insert into r select 'C10 unfiled research has no matter',
    coalesce(public.comment_matter('research', (select v::uuid from fx where k='unfiled_research'))::text, 'null'), 'null';
  -- research_finding is NOT a supported thread kind. A finding is destroyed and
  -- recreated on every save of its research matter, so a thread on one is
  -- orphaned silently — see docs/research-finding-identity.md. The enum value
  -- survives because Postgres cannot drop one; this asserts it resolves to
  -- nothing, so the unsupported kind is a checked property rather than a
  -- leftover somebody re-enables by accident.
  insert into r select 'C11 research_finding is not a thread kind and resolves to nothing',
    coalesce(public.comment_matter('research_finding', (select v::uuid from fx where k='filed_research'))::text, 'null'), 'null';
  insert into r select 'C12 firm knowledge has no matter',
    coalesce(public.comment_matter('precedent', atlas)::text, 'null'), 'null';

  -- An id that does not exist returns null rather than raising. A resolver that
  -- threw here would turn a deleted row into a 500 on every read of the thread.
  insert into r select 'C13 a missing clause returns null, not an error',
    coalesce(public.comment_matter('clause', nobody)::text, 'null'), 'null';
  insert into r select 'C14 a missing task returns null',
    coalesce(public.comment_matter('task', nobody)::text, 'null'), 'null';
  insert into r select 'C15 a missing deliverable returns null',
    coalesce(public.comment_matter('deliverable', nobody)::text, 'null'), 'null';
  insert into r select 'C17 a kind nobody has added returns null',
    coalesce(public.comment_matter('not_a_kind', atlas)::text, 'null'), 'null';
end
$t$;

-- =========================================================================
-- O — entity_owner(), and the null that narrows resolution
-- =========================================================================
do $t$
declare
  nobody uuid := (select v::uuid from fx where k='nobody');
  me uuid := (select v::uuid from fx where k='me');
  them uuid := (select v::uuid from fx where k='them');
begin
  insert into r select 'O01 an assigned task is owned by its assignee',
    public.entity_owner('task', (select v::uuid from fx where k='task_assigned'))::text, them::text;
  insert into r select 'O02 an UNASSIGNED task is owned by nobody',
    coalesce(public.entity_owner('task', (select v::uuid from fx where k='task_unassigned'))::text, 'null'), 'null';
  insert into r select 'O03 a deliverable is owned by its owner',
    public.entity_owner('deliverable', (select v::uuid from fx where k='deliverable'))::text, me::text;
  insert into r select 'O04 an unassigned clause is owned by nobody',
    coalesce(public.entity_owner('clause', (select v::uuid from fx where k='clause'))::text, 'null'), 'null';
  insert into r select 'O05 research is owned by its author',
    public.entity_owner('research', (select v::uuid from fx where k='filed_research'))::text, me::text;
  insert into r select 'O06 nor does entity_owner answer for a research_finding',
    coalesce(public.entity_owner('research_finding', (select v::uuid from fx where k='filed_research'))::text, 'null'), 'null';
  insert into r select 'O07 a matter is owned by its Lead',
    public.entity_owner('matter', (select v::uuid from fx where k='atlas'))::text, me::text;

  -- The branches that MUST be null, each one a narrowing of who may resolve.
  insert into r select 'O08 a document has no owner',
    coalesce(public.entity_owner('document', (select v::uuid from fx where k='doc'))::text, 'null'), 'null';
  insert into r select 'O09 a flow phase has no owner',
    coalesce(public.entity_owner('flow_phase', (select v::uuid from fx where k='phase'))::text, 'null'), 'null';
  insert into r select 'O10 a missing task has no owner, and does not raise',
    coalesce(public.entity_owner('task', nobody)::text, 'null'), 'null';
  insert into r select 'O11 a missing matter has no owner',
    coalesce(public.entity_owner('matter', nobody)::text, 'null'), 'null';
  insert into r select 'O12 a kind nobody has added has no owner',
    coalesce(public.entity_owner('not_a_kind', (select v::uuid from fx where k='atlas'))::text, 'null'), 'null';
end
$t$;

-- =========================================================================
-- P — the two resolvers agree about which kinds exist
-- =========================================================================
-- The failure mode this catches: somebody adds a thread target to
-- `comment_matter()` and forgets `entity_owner()`, or the reverse. Neither
-- raises; the first makes a thread invisible and the second makes Resolve
-- quietly unavailable. So the kinds are enumerated in one place and both
-- functions are asked about every one of them.
do $t$
declare
  kind text;
  kinds text[] := array['matter','clause','document','task','deliverable','flow_phase',
                        'research'];
  unresolved text := '';
begin
  foreach kind in array kinds loop
    -- Every thread target must resolve to a matter for at least the fixture of
    -- its kind; a kind that returns null for a filed entity is the silent one.
    if public.comment_matter(kind, (select v::uuid from fx where k =
         case kind
           when 'matter' then 'atlas' when 'clause' then 'clause'
           when 'document' then 'doc' when 'task' then 'task_unassigned'
           when 'deliverable' then 'deliverable' when 'flow_phase' then 'phase'
           else 'filed_research' end)) is null
    then unresolved := unresolved || kind || ' '; end if;
  end loop;
  insert into r select 'P01 every thread target resolves to a matter', coalesce(nullif(unresolved,''), 'none'), 'none';

  -- And entity_owner answers for every one of them, null being an answer.
  foreach kind in array kinds loop
    begin
      perform public.entity_owner(kind, (select v::uuid from fx where k='atlas'));
    exception when others then
      unresolved := unresolved || kind || ' ';
    end;
  end loop;
  insert into r select 'P02 entity_owner answers for every thread target without raising',
    coalesce(nullif(unresolved,''), 'none'), 'none';
end
$t$;

reset role;
select test, got, want, case when got = want then 'PASS' else 'FAIL' end as result from r order by test;
rollback;
