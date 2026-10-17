-- PHASE 4, STEP 4: review.
--
-- The exit condition for this step is one sentence: a reviewer removed from the
-- matter mid-review can no longer move it, and the Lead still can. Both halves
-- matter, and the second is the one a suite written to agree with the design
-- would skip — it is easy to prove somebody was stopped, and easy to forget to
-- prove that anybody can still act.
--
-- So the demotion is done PART WAY THROUGH a live review, while Podrick holds
-- an id he legitimately obtained and a task that is genuinely his, and the Lead
-- then finishes the review he can no longer touch.
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
 ('them','176d2a8c-10f1-429b-82f2-dde207c99a68');
insert into fx select 'clause', id::text from public.clauses
  where matter_id = (select v::uuid from fx where k='atlas') limit 1;

set local role authenticated;
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';

-- ===========================================================================
-- R — asking. A review arrives as WORK, not as a notice nobody checks
-- ===========================================================================
do $t$
declare rv uuid; tasks_before integer;
begin
  select count(*) into tasks_before from public.tasks
   where assignee_id = (select v::uuid from fx where k='them');
  rv := public.request_review('clause', (select v::uuid from fx where k='clause'),
                              (select v::uuid from fx where k='them'),
                              'Review clause 7 indemnity', 'Please check the cap.');
  insert into fx values ('rv', rv::text), ('tasks_before', tasks_before::text);

  insert into r select 'R01 the review is created as Requested',
    (select status::text from public.approvals where id = rv), 'Requested';
  insert into r select 'R02 addressed to the reviewer',
    (select assigned_to::text from public.approvals where id = rv), (select v from fx where k='them');
  insert into r select 'R03 and it arrives as WORK, not a notice',
    (select count(*)::text from public.tasks
      where assignee_id = (select v::uuid from fx where k='them') and status <> 'Done'),
    ((select v::int from fx where k='tasks_before') + 1)::text;
  insert into r select 'R04 the task records where it came from',
    (select origin_kind::text from public.tasks
      where id = (select task_id from public.approvals where id = rv)), 'review';
end $t$;

-- The reviewer must be on the matter. Same rule as a mention, same reason:
-- asking somebody to check a file they cannot open tells them about the file.
do $t$
begin
  begin
    perform public.request_review('clause', (select v::uuid from fx where k='clause'),
                                  '00000000-0000-0000-0000-000000000009', 'Review by a stranger');
    insert into r select 'R05 cannot ask a non-member to review', 'created', 'refused';
  exception when others then
    insert into r select 'R05 cannot ask a non-member to review', 'refused', 'refused';
  end;
end $t$;

-- ===========================================================================
-- T — the round trip
-- ===========================================================================
-- Which moves EXIST is a separate question from who may make them, and this is
-- the first: an illegal transition is refused whoever asks, including the Lead.
do $t$
begin
  begin
    update public.approvals set status = 'Not required' where id = (select v::uuid from fx where k='rv');
  exception when others then null;
  end;
  insert into r select 'T01 an illegal transition is refused even for the Lead',
    (select status::text from public.approvals where id = (select v::uuid from fx where k='rv')), 'Requested';
end $t$;

set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
begin
  update public.approvals set status = 'In review' where id = (select v::uuid from fx where k='rv');
  insert into r select 'T02 the reviewer starts it',
    (select status::text from public.approvals where id = (select v::uuid from fx where k='rv')), 'In review';

  update public.approvals set status = 'Changes requested',
         reason = 'Cap should be 12 months, not 24.'
   where id = (select v::uuid from fx where k='rv');
  insert into r select 'T03 and sends changes back with a reason',
    (select status::text from public.approvals where id = (select v::uuid from fx where k='rv')), 'Changes requested';
  insert into r select 'T04 the decision is stamped by the database, not the screen',
    (select (decided_by = (select v::uuid from fx where k='them'))::text from public.approvals
      where id = (select v::uuid from fx where k='rv')), 'true';
  -- A task for a review that has left your hands is an orphan, and orphans are
  -- how people learn to ignore their list.
  insert into r select 'T05 the reviewers task closes when it leaves their hands',
    (select status::text from public.tasks
      where id = (select task_id from public.approvals where id = (select v::uuid from fx where k='rv'))), 'Done';
end $t$;

set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
do $t$
begin
  update public.approvals set status = 'Requested' where id = (select v::uuid from fx where k='rv');
  insert into r select 'T06 the author resubmits, which is the one move that is theirs',
    (select status::text from public.approvals where id = (select v::uuid from fx where k='rv')), 'Requested';
  insert into r select 'T07 and the previous decision stops being the current one',
    (select coalesce(decided_by::text, 'null') from public.approvals
      where id = (select v::uuid from fx where k='rv')), 'null';

  /* T07b IS THE ONE THIS SUITE ORIGINALLY MISSED.
  
     T06 checked that the status returned to `Requested` and moved on to the
     next state. It never looked at the task — so for the whole of step 4 the
     second lap of the round trip arrived NOWHERE: the review was waiting on the
     reviewer, whose task was still `Done` from when it left their hands. The
     first pass arrived as work and the second as neither work nor notice, which
     is exactly what step 4 was shaped to prevent.
  
     Found in the two-user browser test. The assertion tested the thing I was
     thinking about rather than the thing that mattered. */
  insert into r select 'T07b and the reviewers task REOPENS, so the second lap arrives as work',
    (select status::text from public.tasks
      where id = (select task_id from public.approvals where id = (select v::uuid from fx where k='rv'))), 'Open';
end $t$;

-- Resubmitting belongs to the person whose work it is, or the Lead. The
-- reviewer was being offered a button that handed their own request back to
-- themselves.
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
begin
  update public.approvals set status = 'Changes requested', reason = 'Second pass.'
   where id = (select v::uuid from fx where k='rv');
  begin
    update public.approvals set status = 'Requested' where id = (select v::uuid from fx where k='rv');
  exception when others then null;
  end;
  insert into r select 'T07c the REVIEWER cannot resubmit',
    (select status::text from public.approvals where id = (select v::uuid from fx where k='rv')),
    'Changes requested';
end $t$;
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
do $t$
begin
  update public.approvals set status = 'Requested' where id = (select v::uuid from fx where k='rv');
  insert into r select 'T07d but the author can',
    (select status::text from public.approvals where id = (select v::uuid from fx where k='rv')), 'Requested';
end $t$;

-- ===========================================================================
-- S — THE SUPERVISORY POINT, both halves
-- ===========================================================================
select public.set_matter_member_role((select v::uuid from fx where k='atlas'),
                                     (select v::uuid from fx where k='them'), 'viewer');

set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
begin
  begin
    update public.approvals set status = 'Approved' where id = (select v::uuid from fx where k='rv');
  exception when others then null;
  end;
  insert into r select 'S01 demoted to Viewer, the reviewer can no longer decide',
    (select status::text from public.approvals where id = (select v::uuid from fx where k='rv')), 'Requested';
  insert into r select 'S02 and review_for says so, so no control is drawn',
    (select i_may_move::text from public.review_for('clause', (select v::uuid from fx where k='clause'))), 'false';
  insert into r select 'S03 though he still reads it, being still on the matter',
    (select count(*)::text from public.review_for('clause', (select v::uuid from fx where k='clause'))), '1';
end $t$;

-- The half a confirmatory suite forgets: somebody can still act.
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
do $t$
begin
  insert into r select 'S04 the Lead still may move it',
    (select i_may_move::text from public.review_for('clause', (select v::uuid from fx where k='clause'))), 'true';
  update public.approvals set assigned_to = (select v::uuid from fx where k='me')
   where id = (select v::uuid from fx where k='rv');
  insert into r select 'S05 and may reassign it, which is how a stuck review unsticks',
    (select assigned_to::text from public.approvals where id = (select v::uuid from fx where k='rv')),
    (select v from fx where k='me');
  update public.approvals set status = 'Approved' where id = (select v::uuid from fx where k='rv');
  insert into r select 'S06 and decide it',
    (select status::text from public.approvals where id = (select v::uuid from fx where k='rv')), 'Approved';
end $t$;

do $t$
begin
  begin
    update public.approvals set status = 'In review' where id = (select v::uuid from fx where k='rv');
  exception when others then null;
  end;
  insert into r select 'T08 Approved is terminal, even for the Lead',
    (select status::text from public.approvals where id = (select v::uuid from fx where k='rv')), 'Approved';
  begin
    perform public.withdraw_review((select v::uuid from fx where k='rv'));
  exception when others then null;
  end;
  insert into r select 'T09 and a decided review cannot be withdrawn',
    (select count(*)::text from public.approvals where id = (select v::uuid from fx where k='rv')), '1';
end $t$;

-- ===========================================================================
-- X — removed from the matter: the review was never there
-- ===========================================================================
select public.remove_matter_member((select v::uuid from fx where k='atlas'),
                                   (select v::uuid from fx where k='them'));

set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
insert into r select 'X01 a non-member sees NOTHING from review_for',
  (select count(*)::text from public.review_for('clause', (select v::uuid from fx where k='clause'))), '0';
insert into r select 'X02 nor the approval row itself',
  (select count(*)::text from public.approvals where id = (select v::uuid from fx where k='rv')), '0';
insert into r select 'X03 nor the task it created',
  (select count(*)::text from public.tasks
    where id = (select v::uuid from fx where k='rv')), '0';

reset role;
select test, got, want, case when got = want then 'PASS' else 'FAIL' end as result from r order by test;
rollback;
