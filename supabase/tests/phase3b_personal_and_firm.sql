-- Personal workspaces are personal, and firms are firms.
--
-- A foundation correction found during the Phase 3 acceptance test:
-- `workspace_kind` had existed as an enum since the schema was written and
-- nothing read it, so a personal workspace offered "Invite someone" under the
-- heading "Your firm" — and an invitation was issued into one.
--
-- Runs against the live database as real users and ROLLS BACK.
--
-- The last group matters most: none of this weakens the matter boundary.
-- Belonging to a firm still grants access to not one matter.

begin;
create temp table r(test text, got text, want text) on commit drop;
create temp table fx(k text, v text) on commit drop;
grant all on r to authenticated;
grant all on fx to authenticated;

insert into fx values
 ('firm','d832b081-cf82-4dc0-a5b9-b0241fe50d9b'),
 ('me','6df711b6-27b0-4aaf-8129-ef39700de7bb'),
 ('them','176d2a8c-10f1-429b-82f2-dde207c99a68');
insert into fx select 'my_personal', id::text from public.workspaces
  where owner_id = (select v::uuid from fx where k='me') and kind = 'personal' limit 1;
insert into fx select 'their_personal', id::text from public.workspaces
  where owner_id = (select v::uuid from fx where k='them') and kind = 'personal' limit 1;

set local role authenticated;
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';

do $t$
declare
  firm uuid := (select v::uuid from fx where k='firm');
  mine uuid := (select v::uuid from fx where k='my_personal');
  them uuid := (select v::uuid from fx where k='them');
  made uuid;
  tok text;
begin
  -- The conversion held: same id, same contents.
  insert into r select '01 the firm kept its id and its matters',
    (select count(*)::text from public.matters where workspace_id = firm), '10';
  insert into r select '02 the firm is a firm',
    (select kind::text from public.workspaces where id = firm), 'firm';
  insert into r select '03 no matter sits in a personal workspace',
    (select count(*)::text from public.matters m join public.workspaces w on w.id = m.workspace_id
      where w.kind = 'personal'), '0';
  insert into r select '04 the owner has a personal workspace again',
    (select count(*)::text from public.workspaces
      where owner_id = (select v::uuid from fx where k='me') and kind = 'personal'), '1';
  insert into r select '05 and it holds none of the firm''s work',
    (select count(*)::text from public.matters where workspace_id = mine), '0';

  -- A personal workspace cannot gain a member, by any route.
  begin
    insert into public.workspace_members (workspace_id, user_id, role) values (mine, them, 'lawyer');
    insert into r select '06 personal workspace refuses a second member', 'allowed', 'refused';
  exception when others then
    insert into r select '06 personal workspace refuses a second member', 'refused', 'refused';
  end;

  -- ...and cannot issue an invitation at all.
  begin
    perform public.create_workspace_invite(mine, 'someone@example.com', 'lawyer');
    insert into r select '07 personal workspace refuses to invite', 'allowed', 'refused';
  exception when others then
    insert into r select '07 personal workspace refuses to invite', 'refused', 'refused';
  end;

  -- A firm can.
  select token into tok from public.create_workspace_invite(firm, 'newjoiner@example.com', 'lawyer');
  insert into r select '08 a firm can invite', (tok is not null)::text, 'true';
  insert into r select '09 the invitation is pending',
    (select status::text from public.workspace_invites where token = tok), 'pending';

  -- Creating a firm is now possible, and makes you its owner.
  made := public.create_firm_workspace('Test Firm — rolled back');
  insert into r select '10 a firm can be created',
    (select kind::text from public.workspaces where id = made), 'firm';
  insert into r select '11 its creator owns it',
    (select role::text from public.workspace_members where workspace_id = made
      and user_id = (select v::uuid from fx where k='me')), 'owner';

  -- Renaming is display only.
  perform public.rename_workspace(made, 'Renamed Firm');
  insert into r select '12 renaming changes the name',
    (select name from public.workspaces where id = made), 'Renamed Firm';
  insert into r select '13 renaming does not change the id',
    (select count(*)::text from public.workspaces where id = made), '1';
  begin
    perform public.rename_workspace(mine, 'My Fake Firm');
    insert into r select '14 a personal workspace cannot be renamed', 'allowed', 'refused';
  exception when others then
    insert into r select '14 a personal workspace cannot be renamed', 'refused', 'refused';
  end;

  -- The matter boundary is untouched by any of it.
  insert into r select '15 the firm owner still sees every matter',
    (select count(*)::text from public.matters), '10';
end
$t$;

-- ===========================================================================
-- As the invited person: joining a firm grants no matter
-- ===========================================================================
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
insert into fx select 'tok', token from public.create_workspace_invite(
  (select v::uuid from fx where k='firm'), 'podrickrobogo@gmail.com', 'lawyer');

set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
declare joined uuid;
begin
  insert into r select '16 an invitation addressed to me is findable',
    (select count(*)::text from public.my_pending_invites()), '1';
  insert into r select '17 and it names the firm',
    (select firm_name from public.my_pending_invites() limit 1), 'Nexis Africa';

  joined := public.accept_workspace_invite((select v from fx where k='tok'));
  insert into r select '18 joining makes me a firm member',
    (select role::text from public.workspace_members
      where workspace_id = joined and user_id = '176d2a8c-10f1-429b-82f2-dde207c99a68'), 'lawyer';

  -- THE ONE THAT MATTERS.
  insert into r select '19 joining a firm grants no matter membership',
    (select count(*)::text from public.matter_members
      where user_id = '176d2a8c-10f1-429b-82f2-dde207c99a68'), '0';
  insert into r select '20 and therefore no matters are visible',
    (select count(*)::text from public.matters), '0';
  insert into r select '21 nor any flow',
    (select count(*)::text from public.matter_flows), '0';
  insert into r select '22 nor any matter task',
    (select count(*)::text from public.tasks where matter_id is not null), '0';
  insert into r select '23 nor any document',
    (select count(*)::text from public.documents), '0';

  -- But the firm itself is there: knowledge, paper, people.
  insert into r select '24 the firm''s knowledge is visible',
    (select case when count(*) > 0 then 'some' else 'none' end from public.playbooks), 'some';
  insert into r select '25 the firm''s letterheads are visible',
    (select case when count(*) > 0 then 'some' else 'none' end from public.letterheads), 'some';
  insert into r select '26 the firm appears in my workspaces',
    (select count(*)::text from public.workspaces where kind = 'firm'), '1';
  insert into r select '27 alongside my own personal one',
    (select count(*)::text from public.workspaces where kind = 'personal'), '1';
end
$t$;

reset role;
select test, got, want, case when got = want then 'PASS' else 'FAIL' end as result from r order by test;
rollback;
