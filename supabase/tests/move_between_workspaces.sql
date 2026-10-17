-- Moving a matter, or an unfiled task, to another workspace.
--
-- The assertion this file exists for is C01: MOVING A MATTER SHOWS IT TO
-- NOBODY NEW.
--
-- That is the property that makes this a filing operation rather than a
-- disclosure. It holds because Phase 3 decided `is_matter_member()` does not
-- consult `workspace_members` — the matter team is the confidentiality
-- boundary and travels with the matter — and every read policy that matters is
-- written on top of that. The test asserts it from both directions: a stranger
-- who administers the destination firm still cannot read a word, and a matter
-- member with no place in the destination firm at all still can.
--
-- B08 is the other one to read. The first version of the move function updated
-- `audit_events.workspace_id` along with everything else, which would have
-- taken every matter-private audit row and made it visible to the whole firm.
-- `check (num_nonnulls(matter_id, workspace_id) = 1)` refused it — Phase 3d's
-- rule, written as a constraint, catching code written months later.
--
-- Fixtures are PLANTED rather than looked for. An earlier run reported the
-- comment guard as SKIPPED because the only comments in the database happened
-- to be on a different matter, which is a security assertion quietly not
-- running — the same way the Phase 5 lease suite failed to test its boundary.
--
-- Runs against the live database as real users and ROLLS BACK.

begin;
create temp table r(test text, got text, want text) on commit drop;
create temp table fx(k text, v text) on commit drop;
grant all on r to authenticated;
grant all on fx to authenticated;

insert into fx values
 ('atlas','c0c2b172-4856-4e84-bf40-fafe7f9dee42'),
 ('forex','d832b081-cf82-4dc0-a5b9-b0241fe50d9b'),    -- Mawusi owner, Podrick lawyer
 ('mawusi_ws','f3c5215d-ba97-43fc-8c43-0b5278675194'),-- Mawusi owner
 ('podrick_ws','95c2d6c8-cb70-4fe9-8dde-19177d4f0e82'),-- Podrick owner, Mawusi absent
 ('me','6df711b6-27b0-4aaf-8129-ef39700de7bb'),       -- Mawusi
 ('them','176d2a8c-10f1-429b-82f2-dde207c99a68');     -- Podrick
insert into fx select 'clause', id::text from public.clauses
  where matter_id = (select v::uuid from fx where k='atlas') order by ordinal limit 1;

-- A note and a filed task on the matter, so the two guard assertions run.
set local role authenticated;
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
insert into public.comments (workspace_id, entity_kind, entity_id, body, mentions, kind)
values ((select v::uuid from fx where k='forex'), 'clause',
        (select v::uuid from fx where k='clause'), 'Planted for the move test', '{}', 'note');
insert into public.tasks (workspace_id, matter_id, title, status)
values ((select v::uuid from fx where k='forex'), (select v::uuid from fx where k='atlas'),
        'Planted for the move test', 'Open');
insert into r select 'F00 the fixtures are actually there',
  ((select count(*) from public.comments
     where public.comment_matter(entity_kind::text, entity_id)=(select v::uuid from fx where k='atlas'))
   + (select count(*) from public.tasks where matter_id=(select v::uuid from fx where k='atlas')))::text, '2';

-- ===========================================================================
-- A — both ends, every time
-- ===========================================================================
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
declare refused boolean := false;
begin
  begin perform public.move_matter_to_workspace((select v::uuid from fx where k='atlas'),
                                                (select v::uuid from fx where k='podrick_ws'));
  exception when others then refused := true; end;
  insert into r select 'A01 a non-admin cannot move a matter out of a workspace', refused::text, 'true';
end $t$;

set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
do $t$
declare refused boolean := false;
begin
  begin perform public.move_matter_to_workspace((select v::uuid from fx where k='atlas'),
                                                (select v::uuid from fx where k='podrick_ws'));
  exception when others then refused := true; end;
  insert into r select 'A02 nor into a workspace they do not administer', refused::text, 'true';
end $t$;

insert into r select 'A03 the picker offers only workspaces you administer',
  (select count(*)::text from public.workspaces_i_administer()), '2';

-- ===========================================================================
-- B — the move
-- ===========================================================================
insert into r select 'B01 the matter team, before',
  (select count(*)::text from public.matter_members where matter_id=(select v::uuid from fx where k='atlas')), '2';

do $t$
declare res jsonb;
begin
  res := public.move_matter_to_workspace((select v::uuid from fx where k='atlas'),
                                         (select v::uuid from fx where k='mawusi_ws'));
  insert into r select 'B02 an admin of both ends can move it',
    (res->>'to'), (select v from fx where k='mawusi_ws');
end $t$;

insert into r select 'B03 the matter is in the new workspace',
  (select workspace_id::text from public.matters where id=(select v::uuid from fx where k='atlas')),
  (select v from fx where k='mawusi_ws');
insert into r select 'B04 and the matter team is untouched',
  (select count(*)::text from public.matter_members where matter_id=(select v::uuid from fx where k='atlas')), '2';
insert into r select 'B05 nothing was left behind in the old workspace',
  (select coalesce(sum(rows),0)::text from public.matter_stragglers((select v::uuid from fx where k='atlas'))), '0';
insert into r select 'B06 the note moved with it, despite the comment guard',
  (select workspace_id::text from public.comments
    where body='Planted for the move test'), (select v from fx where k='mawusi_ws');
insert into r select 'B07 so did the task',
  (select workspace_id::text from public.tasks where title='Planted for the move test'),
  (select v from fx where k='mawusi_ws');
insert into r select 'B08 and the matter history stayed matter-private',
  (select count(*)::text from public.audit_events
    where matter_id=(select v::uuid from fx where k='atlas') and workspace_id is not null), '0';
insert into r select 'B09 the move is on the file',
  (select count(*)::text from public.audit_events
    where entity_id=(select v::uuid from fx where k='atlas') and event_type='matter.moved'), '1';

-- ===========================================================================
-- C — THE BOUNDARY DID NOT MOVE WITH IT
-- ===========================================================================
--
-- Podrick owns his own workspace, is NOT a member of the destination firm, and
-- IS on the matter. The matter team is what lets him in.
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
insert into r select 'C01 a matter member with no place in the new firm still reads it',
  (select count(*)::text from public.matters where id=(select v::uuid from fx where k='atlas')), '1';
insert into r select 'C02 and can still write it',
  public.can_write_matter((select v::uuid from fx where k='atlas'))::text, 'true';
insert into r select 'C03 and still reads its notes',
  (select count(*)::text from public.comments where body='Planted for the move test'), '1';

-- ===========================================================================
-- D — the guards still refuse everything that is not a move
-- ===========================================================================
-- The AUTHOR attempts it, so RLS lets the statement through and the TRIGGER is
-- what decides. An earlier version had Podrick attempt it; he is not the
-- author, so the update matched no rows and refused nothing, and the assertion
-- failed while the product was correct. Same shape as R07 in the compare suite:
-- an error that never came is not the same as a change that never happened.
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
do $t$
declare refused boolean := false; cid uuid; msg text;
begin
  select id into cid from public.comments where body='Planted for the move test';
  begin
    update public.comments set workspace_id=(select v::uuid from fx where k='forex') where id=cid;
  exception when others then refused := true; get stacked diagnostics msg = message_text; end;
  insert into r select 'D01 the author cannot move their own comment between workspaces', refused::text, 'true';
  insert into r select 'D01a and the guard says why', coalesce(msg,'(none)'),
    'A comment cannot be moved to another workspace on its own.';
  insert into r select 'D01b and it did not move',
    (select workspace_id::text from public.comments where id=cid),(select v from fx where k='mawusi_ws');
end $t$;

-- And the exception the move opened is shut behind it. set_config(..., true)
-- is TRANSACTION-local, not call-local, so this was open until it was closed
-- explicitly.
insert into r select 'D01c moving_matter() is clear once the move has returned',
  coalesce(public.moving_matter()::text,'null'), 'null';

set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
do $t$
declare refused boolean := false; tid uuid;
begin
  select id into tid from public.tasks where title='Planted for the move test';
  begin perform public.move_task_to_workspace(tid,(select v::uuid from fx where k='forex'));
  exception when others then refused := true; end;
  insert into r select 'D03 a task filed to a matter cannot be moved on its own', refused::text, 'true';
end $t$;

reset role;
select test, got, want, case when got = want then 'PASS' else 'FAIL' end as result from r order by test;
rollback;
