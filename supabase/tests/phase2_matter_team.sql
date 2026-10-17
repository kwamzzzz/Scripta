-- Phase 2: the matter team, and the one rule that holds it together.
--
-- Everything here is about the Lead. The roles are ordinary data; the Lead is
-- the thing Phase 3 turns into reachability, so a matter that loses one becomes
-- a file nobody can open. The database has three guards and one function for
-- it, and this proves all four.
--
-- Acts as the real owner against the live database, then ROLLS BACK.

begin;
create temp table results(test text, got text, want text) on commit drop;
grant all on results to authenticated;
set local role authenticated;
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';

do $probe$
declare
  me uuid := '6df711b6-27b0-4aaf-8129-ef39700de7bb';
  them uuid := '176d2a8c-10f1-429b-82f2-dde207c99a68';
  ws uuid := 'd832b081-cf82-4dc0-a5b9-b0241fe50d9b';
  m uuid;
begin
  insert into public.matters (workspace_id, name, owner_id)
  values (ws, 'PHASE2 PROBE - rolled back', me) returning id into m;

  insert into results select 'a new matter has exactly one lead',
    (select count(*)::text from public.matter_members where matter_id = m and role = 'lead'), '1';

  -- Nobody may be added straight into the Lead's chair.
  begin
    perform public.add_matter_member(m, them, 'lead');
    insert into results select 'cannot add somebody straight to Lead', 'allowed', 'refused';
  exception when others then
    insert into results select 'cannot add somebody straight to Lead', 'refused', 'refused';
  end;

  perform public.add_matter_member(m, them, 'editor');
  insert into results select 'added as an editor',
    (select role::text from public.matter_members where matter_id = m and user_id = them), 'editor';
  insert into results select 'the adder is recorded',
    (select added_by::text from public.matter_members where matter_id = m and user_id = them), me::text;

  -- An ordinary role change is ordinary.
  perform public.set_matter_member_role(m, them, 'reviewer');
  insert into results select 'an ordinary role changes freely',
    (select role::text from public.matter_members where matter_id = m and user_id = them), 'reviewer';

  -- The Lead is not an ordinary role.
  begin
    perform public.set_matter_member_role(m, me, 'editor');
    insert into results select 'the Lead cannot be demoted by a role change', 'allowed', 'refused';
  exception when others then
    insert into results select 'the Lead cannot be demoted by a role change', 'refused', 'refused';
  end;

  begin
    update public.matter_members set role = 'viewer' where matter_id = m and role = 'lead';
    insert into results select 'nor by writing to the table directly', 'allowed', 'refused';
  exception when others then
    insert into results select 'nor by writing to the table directly', 'refused', 'refused';
  end;

  -- Two Leads cannot exist.
  begin
    insert into public.matter_members (matter_id, user_id, role) values (m, them, 'lead');
    insert into results select 'two leads cannot exist', 'allowed', 'refused';
  exception when others then
    insert into results select 'two leads cannot exist', 'refused', 'refused';
  end;

  -- The Lead cannot be taken off the team.
  begin
    perform public.remove_matter_member(m, me);
    insert into results select 'the Lead cannot be removed', 'allowed', 'refused';
  exception when others then
    insert into results select 'the Lead cannot be removed', 'refused', 'refused';
  end;

  -- The handover, which is the only way it moves.
  perform public.set_matter_lead(m, them);
  insert into results select 'handover makes them the Lead',
    (select role::text from public.matter_members where matter_id = m and user_id = them), 'lead';
  insert into results select 'handover leaves the old Lead an Editor',
    (select role::text from public.matter_members where matter_id = m and user_id = me), 'editor';
  insert into results select 'handover still leaves exactly one Lead',
    (select count(*)::text from public.matter_members where matter_id = m and role = 'lead'), '1';
  insert into results select 'handover moves the matter owner',
    (select owner_id::text from public.matters where id = m), them::text;
  insert into results select 'handover is written to the matter history',
    (select count(*)::text from public.audit_events
      where matter_id = m and event_type = 'matter.lead_changed'), '1';

  -- And having handed it on, the old Lead is an ordinary member again.
  perform public.remove_matter_member(m, me);
  insert into results select 'the former Lead can now be removed',
    (select count(*)::text from public.matter_members where matter_id = m and user_id = me), '0';
end
$probe$;

reset role;
select test, got, want, case when got = want then 'PASS' else 'FAIL' end as result from results;
rollback;
