-- Phase 1 foundation: what the database must do, proved against the real one.
--
-- HOW TO RUN: paste the whole file. It opens a transaction, acts as real signed-in
-- users by setting `request.jwt.claims`, prints a PASS/FAIL table, and ROLLS BACK.
-- Nothing it creates survives. Re-runnable as often as you like.
--
-- Why this exists rather than a vitest file: every behaviour below lives in a
-- trigger, a security-definer function or a row-level policy. None of it is
-- reachable from Node, and a mocked Supabase client would prove only that the
-- mock agrees with itself. The two vitest suites cover the pure logic beside
-- this — `src/lib/invites.test.ts` and `src/lib/file-path.test.ts`.
--
-- The assertion this file exists for is the last one: JOINING THE FIRM GRANTS NO
-- MATTER. Everything else in Phase 1 is plumbing; that one is the whole plan.

begin;

create temp table results(test text, got text, want text) on commit drop;
create temp table tok(t text) on commit drop;
grant all on results to authenticated;
grant all on tok to authenticated;

set local role authenticated;

-- The firm's owner.
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';

do $probe$
declare
  me uuid := '6df711b6-27b0-4aaf-8129-ef39700de7bb';
  ws uuid := 'd832b081-cf82-4dc0-a5b9-b0241fe50d9b';
  m uuid; t uuid; inv record; inv2 record; newtok text;
begin
  -- A matter that nobody leads is a matter nobody can open once the boundary
  -- moves, so the Lead is written by the database rather than by whichever
  -- screen created it.
  insert into public.matters (workspace_id, name, owner_id)
  values (ws, 'PHASE1 PROBE - rolled back', me) returning id into m;
  insert into results select 'new matter seeds a lead',
    (select count(*)::text from public.matter_members where matter_id = m and role = 'lead' and user_id = me), '1';

  -- completed_by is stamped in the database, so no screen can close a task
  -- without saying who closed it.
  insert into public.tasks (workspace_id, title, status) values (ws, 'PHASE1 PROBE task', 'Open') returning id into t;
  insert into results select 'open task has no completer',
    (select coalesce(completed_by::text,'null') from public.tasks where id = t), 'null';
  update public.tasks set status = 'Done', completed_at = now() where id = t;
  insert into results select 'completing stamps completed_by',
    (select coalesce(completed_by::text,'null') from public.tasks where id = t), me::text;
  update public.tasks set status = 'Open', completed_at = null where id = t;
  insert into results select 'reopening clears completed_by',
    (select coalesce(completed_by::text,'null') from public.tasks where id = t), 'null';

  -- The invitation lifecycle.
  select * into inv from public.create_workspace_invite(ws, 'Podrick.Test@Example.com', 'lawyer');
  insert into results select 'invite is created pending', inv.status::text, 'pending';
  insert into results select 'address is stored folded', inv.email, 'podrick.test@example.com';
  insert into results select 'token is long enough to be a secret', (length(inv.token) >= 64)::text, 'true';

  -- Inviting the same person twice is something people do. It supersedes the
  -- earlier row rather than being refused or leaving two live links.
  select * into inv2 from public.create_workspace_invite(ws, 'podrick.test@example.com', 'viewer');
  insert into results select 'earlier invite superseded',
    (select status::text from public.workspace_invites where id = inv.id), 'superseded';
  insert into results select 'only one live invite for the address',
    (select count(*)::text from public.workspace_invites where workspace_id = ws
      and lower(email)='podrick.test@example.com' and status='pending'), '1';

  select token into newtok from public.resend_workspace_invite(inv2.id);
  insert into results select 'resend reissues the token on the same row', (newtok <> inv2.token)::text, 'true';
  insert into results select 'resend creates no second row',
    (select count(*)::text from public.workspace_invites where workspace_id = ws
      and lower(email)='podrick.test@example.com'), '2';

  perform public.revoke_workspace_invite(inv2.id);
  insert into results select 'revoke closes the invite',
    (select status::text from public.workspace_invites where id = inv2.id), 'revoked';

  begin
    perform public.create_workspace_invite(ws, 'mawusikwame009@gmail.com', 'lawyer');
    insert into results select 'refuses to invite an existing member', 'allowed', 'refused';
  exception when others then
    insert into results select 'refuses to invite an existing member', 'refused', 'refused';
  end;

  begin
    perform public.create_workspace_invite(ws, 'not-an-address', 'lawyer');
    insert into results select 'refuses a malformed address', 'allowed', 'refused';
  exception when others then
    insert into results select 'refuses a malformed address', 'refused', 'refused';
  end;

  -- A fresh link for the accept tests below.
  insert into tok select token from public.create_workspace_invite(ws, 'podrickrobogo@gmail.com', 'lawyer');
end
$probe$;

-- A link that leaks admits nobody but the person it was written for. Here the
-- owner tries to use a link addressed to someone else.
do $wrong$
begin
  begin
    perform public.accept_workspace_invite((select t from tok));
    insert into results select 'a link written for someone else is refused', 'accepted', 'refused';
  exception when others then
    insert into results select 'a link written for someone else is refused', 'refused', 'refused';
  end;
end
$wrong$;

-- Now as the person it was written for.
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';

do $accept$
declare joined uuid;
begin
  insert into results select 'before accepting, not a member of the firm',
    (select count(*)::text from public.workspace_members
      where workspace_id='d832b081-cf82-4dc0-a5b9-b0241fe50d9b'
        and user_id='176d2a8c-10f1-429b-82f2-dde207c99a68'), '0';

  joined := public.accept_workspace_invite((select t from tok));
  insert into results select 'accepting returns the firm', joined::text, 'd832b081-cf82-4dc0-a5b9-b0241fe50d9b';
  insert into results select 'now a member, once',
    (select count(*)::text from public.workspace_members
      where workspace_id='d832b081-cf82-4dc0-a5b9-b0241fe50d9b'
        and user_id='176d2a8c-10f1-429b-82f2-dde207c99a68'), '1';
  insert into results select 'joined with the invited role',
    (select role::text from public.workspace_members
      where workspace_id='d832b081-cf82-4dc0-a5b9-b0241fe50d9b'
        and user_id='176d2a8c-10f1-429b-82f2-dde207c99a68'), 'lawyer';
  insert into results select 'joining was written to the audit trail',
    (select count(*)::text from public.audit_events where event_type='workspace.invite_accepted'
      and actor_id='176d2a8c-10f1-429b-82f2-dde207c99a68'), '1';

  -- THE ONE THAT MATTERS.
  insert into results select 'joining the firm grants no matter membership',
    (select count(*)::text from public.matter_members
      where user_id='176d2a8c-10f1-429b-82f2-dde207c99a68'), '0';

  begin
    perform public.accept_workspace_invite((select t from tok));
    insert into results select 'the same link cannot be used twice', 'accepted again', 'refused';
  exception when others then
    insert into results select 'the same link cannot be used twice', 'refused', 'refused';
  end;
end
$accept$;

-- Back to the administrator: invitations are administration, and only an owner
-- or admin may read them. (Checked here rather than above because the person
-- who just joined correctly cannot see the invitation they accepted.)
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
insert into results select 'the invite is closed',
  (select status::text from public.workspace_invites where token=(select t from tok)), 'accepted';
insert into results select 'accepted_by records who joined',
  (select accepted_by::text from public.workspace_invites where token=(select t from tok)),
  '176d2a8c-10f1-429b-82f2-dde207c99a68';

-- Standing property of the whole table, not of anything this file created.
insert into results select 'every matter in the firm has a lead',
  (select count(*)::text from public.matters m
    where not exists (select 1 from public.matter_members mm
                       where mm.matter_id = m.id and mm.role = 'lead')), '0';

reset role;
select test, got, want, case when got = want then 'PASS' else 'FAIL' end as result from results;

rollback;
