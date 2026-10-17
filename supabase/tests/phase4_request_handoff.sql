-- PHASE 4, STEP 5: request, decline, hand over.
--
-- Four verbs, and this file is about the three that are easy to confuse:
--
--   REQUEST   Please do this.      Creates a task.                 Declinable.
--   DECLINE   Not me, because…     Returns it to whoever asked.
--   ASSIGN    This is yours now.   Moves work that already exists. Not declinable.
--
-- The assertions that matter are the ones that tell them apart: an assigned
-- task offers no Decline and refuses one; a declined request comes BACK rather
-- than vanishing; and a Reviewer may ask but may not allocate, which is the
-- line between commenting on the work and running the file.
--
-- Runs against the live database as two real users and ROLLS BACK.

begin;
create temp table r(test text, got text, want text) on commit drop;
create temp table fx(k text, v text) on commit drop;
grant all on r to authenticated;
grant all on fx to authenticated;

insert into fx values
 ('atlas','c0c2b172-4856-4e84-bf40-fafe7f9dee42'),
 ('ptm','99bc433c-4910-4c96-aa95-5196e0eae29d'),
 ('ws','d832b081-cf82-4dc0-a5b9-b0241fe50d9b'),
 ('me','6df711b6-27b0-4aaf-8129-ef39700de7bb'),
 ('them','176d2a8c-10f1-429b-82f2-dde207c99a68'),
 ('stranger','00000000-0000-0000-0000-000000000009');

set local role authenticated;
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';

-- Atlas has no flow, so one is built here rather than found. A fixture that is
-- silently absent turns an assertion into a no-op that still reports PASS.
do $t$
declare f uuid; ph uuid; d uuid;
begin
  insert into public.matter_flows (workspace_id, matter_id)
  values ((select v::uuid from fx where k='ws'), (select v::uuid from fx where k='atlas')) returning id into f;
  insert into public.flow_phases (workspace_id, flow_id, name)
  values ((select v::uuid from fx where k='ws'), f, 'Negotiation') returning id into ph;
  insert into public.flow_deliverables (workspace_id, flow_id, phase_id, name)
  values ((select v::uuid from fx where k='ws'), f, ph, 'Signed framework agreement') returning id into d;
  insert into fx values ('d', d::text);
end $t$;

-- ===========================================================================
-- Q — request
-- ===========================================================================
do $t$
declare tk uuid;
begin
  tk := public.request_work((select v::uuid from fx where k='atlas'), (select v::uuid from fx where k='them'),
        'Check the Westpoint indemnity wording', 'Compare against the playbook position.');
  insert into fx values ('req', tk::text);
  insert into r select 'Q01 a request creates a task for the person asked',
    (select assignee_id::text from public.tasks where id = tk), (select v from fx where k='them');
  insert into r select 'Q02 recorded as a request, not a mention and not a review',
    (select origin_kind::text from public.tasks where id = tk), 'request';
  insert into r select 'Q03 and remembers who asked, so it has somewhere to go back to',
    (select created_by::text from public.tasks where id = tk), (select v from fx where k='me');

  begin
    perform public.request_work((select v::uuid from fx where k='ptm'), (select v::uuid from fx where k='them'),
                                'On a matter he is not on');
  exception when others then null;
  end;
  insert into r select 'Q04 cannot request of somebody not on the matter',
    (select count(*)::text from public.tasks where title = 'On a matter he is not on'), '0';

  begin
    perform public.request_work((select v::uuid from fx where k='atlas'), (select v::uuid from fx where k='me'),
                                'Asking myself');
  exception when others then null;
  end;
  insert into r select 'Q05 asking yourself is just a task, and is refused as a request',
    (select count(*)::text from public.tasks where title = 'Asking myself'), '0';
end $t$;

-- ===========================================================================
-- D — decline. It goes back; it does not vanish
-- ===========================================================================
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
begin
  insert into r select 'D01 the person asked is offered Decline',
    (select i_may_decline::text from public.task_actions((select v::uuid from fx where k='req'))), 'true';

  -- Declining without a reason sends the asker back to square one.
  begin perform public.decline_work((select v::uuid from fx where k='req'), ''); exception when others then null; end;
  insert into r select 'D02 declining without a reason is refused',
    (select assignee_id::text from public.tasks where id = (select v::uuid from fx where k='req')),
    (select v from fx where k='them');

  perform public.decline_work((select v::uuid from fx where k='req'), 'I am in hearings all week.');
  insert into r select 'D03 declining RETURNS it to the asker',
    (select assignee_id::text from public.tasks where id = (select v::uuid from fx where k='req')),
    (select v from fx where k='me');
  insert into r select 'D04 the task still exists — it did not vanish',
    (select count(*)::text from public.tasks where id = (select v::uuid from fx where k='req')), '1';
  insert into r select 'D05 and the reason is on the record',
    (select (metadata->>'reason' = 'I am in hearings all week.')::text from public.audit_events
      where event_type = 'work.declined' and entity_id = (select v::uuid from fx where k='req')), 'true';
end $t$;

-- An ASSIGNED task is a statement of fact, not an ask.
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
do $t$
declare tk uuid;
begin
  insert into public.tasks (workspace_id, matter_id, title, status, assignee_id, created_by, origin_kind)
  values ((select v::uuid from fx where k='ws'), (select v::uuid from fx where k='atlas'),
          'Assigned, not asked', 'Open', (select v::uuid from fx where k='them'),
          (select v::uuid from fx where k='me'), 'manual') returning id into tk;
  insert into fx values ('assigned', tk::text);
end $t$;

set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
begin
  insert into r select 'D06 an assigned task offers no Decline',
    (select i_may_decline::text from public.task_actions((select v::uuid from fx where k='assigned'))), 'false';
  begin perform public.decline_work((select v::uuid from fx where k='assigned'), 'No thanks'); exception when others then null; end;
  insert into r select 'D07 and declining one is refused',
    (select assignee_id::text from public.tasks where id = (select v::uuid from fx where k='assigned')),
    (select v from fx where k='them');
end $t$;

-- ===========================================================================
-- H — hand over, and the history that records it
-- ===========================================================================
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
do $t$
begin
  perform public.assign_work((select v::uuid from fx where k='assigned'), (select v::uuid from fx where k='me'));
  insert into r select 'H01 a Lead may hand work over',
    (select assignee_id::text from public.tasks where id = (select v::uuid from fx where k='assigned')),
    (select v from fx where k='me');
  insert into r select 'H02 the reassignment is on the record with both ends',
    (select (metadata->>'from' = (select v from fx where k='them'))::text from public.audit_events
      where event_type = 'work.handed_off' and entity_id = (select v::uuid from fx where k='assigned')
      order by created_at desc limit 1), 'true';

  perform public.set_deliverable_owner((select v::uuid from fx where k='d'), (select v::uuid from fx where k='them'));
  insert into r select 'H03 a deliverable owner can be handed over too',
    (select owner_id::text from public.flow_deliverables where id = (select v::uuid from fx where k='d')),
    (select v from fx where k='them');
  insert into r select 'H04 the trigger wrote the history, with both ends',
    (select (metadata->>'to' = (select v from fx where k='them'))::text from public.audit_events
      where event_type = 'work.handed_off' and entity_type = 'deliverable'
        and entity_id = (select v::uuid from fx where k='d') order by created_at desc limit 1), 'true';

  -- THE PATH THAT BYPASSES THE FUNCTION. The deliverable dialog writes owner_id
  -- through the flow's bulk diff-and-upsert save and never calls
  -- set_deliverable_owner(). History written inside that function would be
  -- right most of the time, which is worse than none because people trust it.
  update public.flow_deliverables set owner_id = (select v::uuid from fx where k='me')
   where id = (select v::uuid from fx where k='d');
  insert into r select 'H05 a direct write, as the flow dialog makes, is recorded too',
    (select count(*)::text from public.audit_events
      where event_type = 'work.handed_off' and entity_type = 'deliverable'
        and entity_id = (select v::uuid from fx where k='d')), '2';

  begin
    update public.flow_deliverables set owner_id = (select v::uuid from fx where k='stranger')
     where id = (select v::uuid from fx where k='d');
  exception when others then null;
  end;
  insert into r select 'H06 and cannot be given to somebody who is not on the matter',
    (select owner_id::text from public.flow_deliverables where id = (select v::uuid from fx where k='d')),
    (select v from fx where k='me');
end $t$;

-- ===========================================================================
-- P — a Reviewer may ask, and may not allocate. That is the line
-- ===========================================================================
select public.set_matter_member_role((select v::uuid from fx where k='atlas'),
                                     (select v::uuid from fx where k='them'), 'reviewer');
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
declare tk uuid;
begin
  tk := public.request_work((select v::uuid from fx where k='atlas'), (select v::uuid from fx where k='me'),
                            'Reviewer asking the Lead for something');
  insert into r select 'P01 a Reviewer MAY request work',
    (select count(*)::text from public.tasks where id = tk), '1';
  insert into r select 'P02 and is told they may not hand work over',
    (select i_may_assign::text from public.task_actions(tk)), 'false';
  begin perform public.assign_work(tk, (select v::uuid from fx where k='them')); exception when others then null; end;
  insert into r select 'P03 and the write is refused too',
    (select assignee_id::text from public.tasks where id = tk), (select v from fx where k='me');
end $t$;

set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
select public.set_matter_member_role((select v::uuid from fx where k='atlas'),
                                     (select v::uuid from fx where k='them'), 'viewer');
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
begin
  begin perform public.request_work((select v::uuid from fx where k='atlas'), (select v::uuid from fx where k='me'), 'A viewer asking');
  exception when others then null; end;
  insert into r select 'P04 a Viewer cannot request work either',
    (select count(*)::text from public.tasks where title = 'A viewer asking'), '0';
end $t$;

-- ===========================================================================
-- U — unfiled work has nobody to hand it to
-- ===========================================================================
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
do $t$
declare tk uuid;
begin
  insert into public.tasks (workspace_id, title, status)
  values ((select v::uuid from fx where k='ws'), 'My own unfiled note', 'Open') returning id into tk;
  begin perform public.assign_work(tk, (select v::uuid from fx where k='them')); exception when others then null; end;
  insert into r select 'U01 unfiled work cannot be handed over, because nobody else can see it',
    (select coalesce(assignee_id::text, 'null') from public.tasks where id = tk), 'null';
end $t$;

reset role;
select test, got, want, case when got = want then 'PASS' else 'FAIL' end as result from r order by test;
rollback;
