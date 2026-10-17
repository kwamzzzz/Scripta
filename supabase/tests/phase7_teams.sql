-- PHASE 7: Teams.
--
-- The assertion this file exists for is N01: TEAM MEMBERSHIP ALONE GRANTS NO
-- MATTER ACCESS.
--
-- Everything else here is convenience. That one is the reason the phase was
-- allowed to exist at all: a Team is a saved list of colleagues, and the moment
-- anything reads it to decide whether somebody may open a file, Scripta has a
-- second confidentiality boundary that is invisible from the matter's own team
-- screen and changes whenever an unrelated list does.
--
-- The second pair to read is S02/S04, which prove the snapshot in both
-- directions: joining the team later gains nothing, and leaving it later loses
-- nothing. Matter membership stays a deliberate matter-level act.
--
-- And K05, which proves composition: access is the UNION of valid paths, so
-- removing one never destroys another.
--
-- Fixtures are PLANTED and roles are SET. Runs as three real users and ROLLS
-- BACK.

begin;
create temp table r(test text, got text, want text) on commit drop;
create temp table fx(k text, v text) on commit drop;
grant all on r to authenticated;
grant all on fx to authenticated;

insert into fx values
 ('forex','d832b081-cf82-4dc0-a5b9-b0241fe50d9b'),    -- the firm
 ('personal','95c2d6c8-cb70-4fe9-8dde-19177d4f0e82'), -- a personal workspace
 ('atlas','c0c2b172-4856-4e84-bf40-fafe7f9dee42'),
 ('B','6df711b6-27b0-4aaf-8129-ef39700de7bb'),        -- Mawusi: firm owner, matter Lead
 ('A','176d2a8c-10f1-429b-82f2-dde207c99a68'),        -- Podrick: lawyer
 ('C','4c43a265-d7e0-4eff-9d8f-2b6a9e5a8ed7');        -- Kwame: outside the firm, then in it

set local role postgres;
update public.matter_members set role = 'lead'
 where matter_id = (select v::uuid from fx where k='atlas') and user_id = (select v::uuid from fx where k='B');
delete from public.matter_members
 where matter_id = (select v::uuid from fx where k='atlas') and user_id = (select v::uuid from fx where k='A');
insert into fx select 'before_A', count(*)::text from public.audit_events
 where event_type='matter.member_added' and (metadata->>'user')::uuid = (select v::uuid from fx where k='A');
set local role authenticated;

-- ===========================================================================
-- T — who may keep the firm's lists
-- ===========================================================================
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
declare refused boolean := false;
begin
  begin perform public.create_team((select v::uuid from fx where k='forex'),'Transactions');
  exception when others then refused := true; end;
  insert into r select 'T01 an ordinary lawyer cannot create firm teams', refused::text, 'true';
end $t$;

set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
insert into fx select 'team', public.create_team((select v::uuid from fx where k='forex'),'Transactions')::text;
insert into r select 'T02 an owner or admin can',
  (select (count(*)=1)::text from public.teams where id=(select v::uuid from fx where k='team')), 'true';

do $t$
declare refused boolean := false;
begin
  begin perform public.create_team((select v::uuid from fx where k='personal'),'Me');
  exception when others then refused := true; end;
  insert into r select 'T03 a personal workspace cannot have teams', refused::text, 'true';
end $t$;

-- C is still OUTSIDE the firm, so eligibility is a real assertion rather than
-- one that quietly passes because everybody happens to be a member.
do $t$
declare refused boolean := false;
begin
  begin perform public.add_team_member((select v::uuid from fx where k='team'),(select v::uuid from fx where k='C'));
  exception when others then refused := true; end;
  insert into r select 'T04 a team cannot hold somebody outside the firm', refused::text, 'true';
end $t$;

set local role postgres;
insert into public.workspace_members (workspace_id, user_id, role)
values ((select v::uuid from fx where k='forex'),(select v::uuid from fx where k='C'),'lawyer')
on conflict do nothing;
set local role authenticated;
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
select public.add_team_member((select v::uuid from fx where k='team'),(select v::uuid from fx where k='C'));
select public.add_team_member((select v::uuid from fx where k='team'),(select v::uuid from fx where k='A'));

-- Leaving the firm leaves its teams: no dangling membership to a non-member.
set local role postgres;
delete from public.workspace_members
 where workspace_id=(select v::uuid from fx where k='forex') and user_id=(select v::uuid from fx where k='C');
set local role authenticated;
insert into r select 'T05 leaving the firm leaves its teams',
  (select count(*)::text from public.team_members
    where team_id=(select v::uuid from fx where k='team') and user_id=(select v::uuid from fx where k='C')), '0';
set local role postgres;
insert into public.workspace_members (workspace_id, user_id, role)
values ((select v::uuid from fx where k='forex'),(select v::uuid from fx where k='C'),'lawyer')
on conflict do nothing;
set local role authenticated;
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
select public.add_team_member((select v::uuid from fx where k='team'),(select v::uuid from fx where k='C'));

-- ===========================================================================
-- N — NO TRANSITIVITY
-- ===========================================================================
-- C is in the team. The team has not been used on the matter.
set local request.jwt.claims = '{"sub":"4c43a265-d7e0-4eff-9d8f-2b6a9e5a8ed7","role":"authenticated"}';
insert into r select 'N01 TEAM MEMBERSHIP ALONE GRANTS NO MATTER ACCESS',
  (select count(*)::text from public.matters where id=(select v::uuid from fx where k='atlas')), '0';
insert into r select 'N02 nor its clauses',
  (select count(*)::text from public.clauses where matter_id=(select v::uuid from fx where k='atlas')), '0';
insert into r select 'N03 nor its history',
  (select count(*)::text from public.audit_events where matter_id=(select v::uuid from fx where k='atlas')), '0';
insert into r select 'N04 and a team confers no approval authority',
  public.can_approve_knowledge('precedent', gen_random_uuid())::text, 'false';

-- ===========================================================================
-- S — MATTER STAFFING IS A SNAPSHOT
-- ===========================================================================
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
do $t$
declare refused boolean := false;
begin
  begin perform public.staff_matter_from_team((select v::uuid from fx where k='atlas'),
                                              (select v::uuid from fx where k='team'), 'lead');
  exception when others then refused := true; end;
  insert into r select 'S01 Lead is never available as a bulk team role', refused::text, 'true';
end $t$;

select public.staff_matter_from_team((select v::uuid from fx where k='atlas'),
                                     (select v::uuid from fx where k='team'), 'editor');
insert into r select 'S02 the team''s people become explicit matter members',
  (select count(*)::text from public.matter_members
    where matter_id=(select v::uuid from fx where k='atlas')
      and user_id in ((select v::uuid from fx where k='A'),(select v::uuid from fx where k='C'))), '2';
insert into r select 'S03 with the role that was chosen',
  (select role::text from public.matter_members
    where matter_id=(select v::uuid from fx where k='atlas') and user_id=(select v::uuid from fx where k='A')), 'editor';

-- Staffing again must not change anybody's role.
set local role postgres;
update public.matter_members set role='reviewer'
 where matter_id=(select v::uuid from fx where k='atlas') and user_id=(select v::uuid from fx where k='A');
set local role authenticated;
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
select public.staff_matter_from_team((select v::uuid from fx where k='atlas'),
                                     (select v::uuid from fx where k='team'), 'editor');
insert into r select 'S04 ADDING A TEAM NEVER CHANGES AN EXISTING MEMBER''S ROLE',
  (select role::text from public.matter_members
    where matter_id=(select v::uuid from fx where k='atlas') and user_id=(select v::uuid from fx where k='A')), 'reviewer';

-- THE SNAPSHOT, BOTH DIRECTIONS.
set local role postgres;
delete from public.team_members
 where team_id=(select v::uuid from fx where k='team') and user_id=(select v::uuid from fx where k='A');
set local role authenticated;
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
insert into r select 'S05 LEAVING THE TEAM KEEPS THE MATTER YOU WERE STAFFED ON',
  (select count(*)::text from public.matters where id=(select v::uuid from fx where k='atlas')), '1';

-- Somebody who joins the team AFTER the staffing gains nothing.
set local role postgres;
delete from public.matter_members
 where matter_id=(select v::uuid from fx where k='atlas') and user_id=(select v::uuid from fx where k='C');
delete from public.team_members
 where team_id=(select v::uuid from fx where k='team') and user_id=(select v::uuid from fx where k='C');
set local role authenticated;
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
select public.add_team_member((select v::uuid from fx where k='team'),(select v::uuid from fx where k='C'));
insert into r select 'S06 JOINING THE TEAM LATER GAINS NOTHING',
  (select count(*)::text from public.matter_members
    where matter_id=(select v::uuid from fx where k='atlas') and user_id=(select v::uuid from fx where k='C')), '0';
set local request.jwt.claims = '{"sub":"4c43a265-d7e0-4eff-9d8f-2b6a9e5a8ed7","role":"authenticated"}';
insert into r select 'S07 and the matter stays invisible to them',
  (select count(*)::text from public.matters where id=(select v::uuid from fx where k='atlas')), '0';

-- Deleting the team outright leaves the staffing standing.
set local role postgres;
delete from public.teams where id=(select v::uuid from fx where k='team');
set local role authenticated;
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
insert into r select 'S08 DELETING THE TEAM LEAVES THE STAFFING, AND CLEARS THE PROVENANCE',
  (select (role::text='reviewer' and added_via_team is null)::text from public.matter_members
    where matter_id=(select v::uuid from fx where k='atlas') and user_id=(select v::uuid from fx where k='A')), 'true';
insert into r select 'S09 the person staffed was told, once',
  ((select count(*) from public.events_involving_me(100) where event_type='matter.member_added')
   - (select v::int from fx where k='before_A'))::text, '1';

-- ===========================================================================
-- K — KNOWLEDGE SHARED WITH A TEAM IS DYNAMIC
-- ===========================================================================
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
insert into fx select 'team2', public.create_team((select v::uuid from fx where k='forex'),'Corporate')::text;
select public.add_team_member((select v::uuid from fx where k='team2'),(select v::uuid from fx where k='C'));

set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
declare nid uuid;
begin
  insert into public.precedents (workspace_id, title, body, kind, source_kind, status, source_note, matter_id)
  values ((select v::uuid from fx where k='forex'), 'Team precedent', 'Wording.', 'clause', 'captured', 'draft',
          'Taken from the Westpoint Mining SPA', (select v::uuid from fx where k='atlas'))
  returning id into nid;
  insert into fx values ('p', nid::text);
  perform public.set_knowledge_visibility('precedent', nid, 'shared');
  perform public.share_knowledge_with_team('precedent', nid, (select v::uuid from fx where k='team2'));
end $t$;

set local request.jwt.claims = '{"sub":"4c43a265-d7e0-4eff-9d8f-2b6a9e5a8ed7","role":"authenticated"}';
insert into r select 'K01 a current team member can use knowledge shared with the team',
  (select count(*)::text from public.precedents where id=(select v::uuid from fx where k='p')), '1';
insert into r select 'K02 AND STILL CANNOT REACH THE MATTER IT CAME FROM',
  (select count(*)::text from public.matters where id=(select v::uuid from fx where k='atlas')), '0';
insert into r select 'K03 nor learn anything through provenance',
  (select (derived and not may_see_source and matter_id is null and matter_name is null
           and source_note is null)::text
     from public.precedent_provenance((select v::uuid from fx where k='p'))), 'true';

set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
select public.remove_team_member((select v::uuid from fx where k='team2'),(select v::uuid from fx where k='C'));
set local request.jwt.claims = '{"sub":"4c43a265-d7e0-4eff-9d8f-2b6a9e5a8ed7","role":"authenticated"}';
insert into r select 'K04 leaving the team loses team-derived access',
  (select count(*)::text from public.precedents where id=(select v::uuid from fx where k='p')), '0';

-- COMPOSITION. An independent individual share survives losing the team.
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
select public.share_knowledge('precedent',(select v::uuid from fx where k='p'),(select v::uuid from fx where k='C'));
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
select public.add_team_member((select v::uuid from fx where k='team2'),(select v::uuid from fx where k='C'));
select public.remove_team_member((select v::uuid from fx where k='team2'),(select v::uuid from fx where k='C'));
set local request.jwt.claims = '{"sub":"4c43a265-d7e0-4eff-9d8f-2b6a9e5a8ed7","role":"authenticated"}';
insert into r select 'K05 REMOVING ONE ACCESS PATH NEVER DESTROYS ANOTHER',
  (select count(*)::text from public.precedents where id=(select v::uuid from fx where k='p')), '1';

-- Archiving stops the team addressing anybody, and destroys nothing.
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
select public.unshare_knowledge('precedent',(select v::uuid from fx where k='p'),(select v::uuid from fx where k='C'));
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
select public.add_team_member((select v::uuid from fx where k='team2'),(select v::uuid from fx where k='C'));
select public.set_team_archived((select v::uuid from fx where k='team2'), true);
set local request.jwt.claims = '{"sub":"4c43a265-d7e0-4eff-9d8f-2b6a9e5a8ed7","role":"authenticated"}';
insert into r select 'K06 archiving the team stops it addressing anybody',
  (select count(*)::text from public.precedents where id=(select v::uuid from fx where k='p')), '0';
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
select public.set_team_archived((select v::uuid from fx where k='team2'), false);
set local request.jwt.claims = '{"sub":"4c43a265-d7e0-4eff-9d8f-2b6a9e5a8ed7","role":"authenticated"}';
insert into r select 'K07 and restoring brings it back, having destroyed nothing',
  (select count(*)::text from public.precedents where id=(select v::uuid from fx where k='p')), '1';

-- A team share never makes knowledge firm-wide or approved.
insert into r select 'K08 a team share is still just Shared',
  (select visibility::text from public.precedents where id=(select v::uuid from fx where k='p')), 'shared';
insert into r select 'K09 and still unapproved',
  (select approved::text from public.precedents where id=(select v::uuid from fx where k='p')), 'false';

reset role;
select test, got, want, case when got = want then 'PASS' else 'FAIL' end as result from r order by test;
rollback;
