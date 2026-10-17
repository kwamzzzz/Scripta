-- PHASE 4: what the two-user browser test proved, kept as assertions.
--
-- Run with two real sessions on 15–16 September 2026. Every case below was seen
-- on screen; this file is the database half of each, written so that none of it
-- ever needs re-testing by hand.
--
-- It also carries the four defects the browser found that the other suites had
-- missed, because a regression is only a regression if something watches for it:
--
--   1. comments.author_id was never stamped         → phase4_thread.sql, S01-S07
--   2. the mention marker cleared on the LIST       → a client wiring defect, and
--                                                     the one case here that SQL
--                                                     cannot reach; see the note
--                                                     at the end
--   3. a resubmitted review did not reopen the task → phase4_review.sql, T07b
--   4. task_actions / review_for outranked callers  → phase4_reader_functions.sql
--
-- What is asserted HERE is the collaboration lifecycle end to end, in the order
-- two people actually performed it.
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
-- A — request, decline, and the return
-- ===========================================================================
do $t$
declare tk uuid;
begin
  tk := public.request_work((select v::uuid from fx where k='atlas'),
                            (select v::uuid from fx where k='them'),
                            'Check the Westpoint indemnity cap',
                            'Compare against the playbook position.');
  insert into fx values ('req', tk::text);
  insert into r select 'A01 a request arrives as a task for the person asked',
    (select assignee_id::text from public.tasks where id = tk), (select v from fx where k='them');
  insert into r select 'A02 recorded as a request, not a review and not a plain task',
    (select origin_kind::text from public.tasks where id = tk), 'request';
end $t$;

set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
declare refused boolean := false;
begin
  insert into r select 'A03 the person asked is offered Decline',
    (select i_may_decline::text from public.task_actions((select v::uuid from fx where k='req'))), 'true';
  -- The browser's Send-back button is disabled without a reason; the database
  -- refuses it regardless, which is the half that survives a screen change.
  begin perform public.decline_work((select v::uuid from fx where k='req'), '');
  exception when others then refused := true; end;
  insert into r select 'A04 declining without a reason is refused', refused::text, 'true';

  perform public.decline_work((select v::uuid from fx where k='req'),
                              'I am in hearings until Thursday.');
  insert into r select 'A05 declining RETURNS it to the asker',
    (select assignee_id::text from public.tasks where id = (select v::uuid from fx where k='req')),
    (select v from fx where k='me');
  insert into r select 'A06 and the task still exists — it did not vanish',
    (select count(*)::text from public.tasks where id = (select v::uuid from fx where k='req')), '1';
end $t$;

-- ===========================================================================
-- B — the review round trip, exactly as the two sessions performed it
-- ===========================================================================
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
do $t$
declare rv uuid;
begin
  rv := public.request_review('clause', (select v::uuid from fx where k='clause'),
                              (select v::uuid from fx where k='them'),
                              'Review clause 1.3', 'Please review this well');
  insert into fx values ('rv', rv::text);
  insert into r select 'B01 asking creates the approval and the reviewers task together',
    (select (status::text = 'Requested' and task_id is not null)::text
       from public.approvals where id = rv), 'true';
end $t$;

set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
begin
  update public.approvals set status = 'In review' where id = (select v::uuid from fx where k='rv');
  insert into r select 'B02 the reviewer starts it',
    (select status::text from public.approvals where id = (select v::uuid from fx where k='rv')), 'In review';
  insert into r select 'B03 and starting is not a decision',
    (select coalesce(decided_by::text,'null') from public.approvals
      where id = (select v::uuid from fx where k='rv')), 'null';

  update public.approvals set status = 'Changes requested',
         reason = 'Track the order form wording and cross-refer to 2.3.'
   where id = (select v::uuid from fx where k='rv');
  insert into r select 'B04 changes go back stamped with the person who decided',
    (select decided_by::text from public.approvals where id = (select v::uuid from fx where k='rv')),
    (select v from fx where k='them');
  insert into r select 'B05 and the reviewers task closes',
    (select status::text from public.tasks
      where id = (select task_id from public.approvals where id = (select v::uuid from fx where k='rv'))), 'Done';

  -- The reviewer is not offered Resubmit, and cannot take it.
  begin update public.approvals set status = 'Requested'
         where id = (select v::uuid from fx where k='rv');
  exception when others then null; end;
  insert into r select 'B06 the reviewer cannot resubmit their own request',
    (select status::text from public.approvals where id = (select v::uuid from fx where k='rv')),
    'Changes requested';
end $t$;

set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
do $t$
begin
  update public.approvals set status = 'Requested' where id = (select v::uuid from fx where k='rv');
  insert into r select 'B07 the author resubmits',
    (select status::text from public.approvals where id = (select v::uuid from fx where k='rv')), 'Requested';
  -- THE DEFECT THE BROWSER FOUND. Without this the second lap arrived nowhere.
  insert into r select 'B08 and the reviewers task REOPENS, so the second lap is work again',
    (select status::text from public.tasks
      where id = (select task_id from public.approvals where id = (select v::uuid from fx where k='rv'))), 'Open';
  update public.approvals set status = 'Approved' where id = (select v::uuid from fx where k='rv');
  insert into r select 'B09 approving is terminal',
    (select status::text from public.approvals where id = (select v::uuid from fx where k='rv')), 'Approved';
  insert into r select 'B10 and closes the task again',
    (select status::text from public.tasks
      where id = (select task_id from public.approvals where id = (select v::uuid from fx where k='rv'))), 'Done';
end $t$;

-- ===========================================================================
-- C — resolution is earned, and the browser showed it exactly
-- ===========================================================================
-- Same raiser, same role, same matter. The only difference is whether the
-- reader is responsible for the work, and on screen that was the difference
-- between a Resolve control and no Resolve control.
do $t$
declare owned uuid; orphan uuid;
begin
  insert into public.tasks (workspace_id, matter_id, title, status, assignee_id)
  values ((select v::uuid from fx where k='ws'), (select v::uuid from fx where k='atlas'),
          'ACCEPTANCE owned by Podrick', 'Open', (select v::uuid from fx where k='them'))
  returning id into owned;
  insert into public.tasks (workspace_id, matter_id, title, status)
  values ((select v::uuid from fx where k='ws'), (select v::uuid from fx where k='atlas'),
          'ACCEPTANCE owned by nobody', 'Open')
  returning id into orphan;
  insert into public.comments (workspace_id, entity_kind, entity_id, body)
  values ((select v::uuid from fx where k='ws'), 'task', owned, 'A point on work Podrick owns.');
  insert into public.comments (workspace_id, entity_kind, entity_id, body)
  values ((select v::uuid from fx where k='ws'), 'task', orphan, 'A point on work nobody owns.');
  insert into fx values ('owned', owned::text), ('orphan', orphan::text);
end $t$;

set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
begin
  update public.comments set resolved = true
   where entity_id = (select v::uuid from fx where k='owned');
  insert into r select 'C01 the responsible person may resolve a thread they did not raise',
    (select resolved::text from public.comments where entity_id = (select v::uuid from fx where k='owned')), 'true';
  begin
    update public.comments set resolved = true
     where entity_id = (select v::uuid from fx where k='orphan');
  exception when others then null; end;
  insert into r select 'C02 and may NOT where nobody is responsible',
    (select resolved::text from public.comments where entity_id = (select v::uuid from fx where k='orphan')), 'false';
end $t$;

-- ===========================================================================
-- D — demotion mid-flight: everything collapses to read-only
-- ===========================================================================
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
select public.set_matter_member_role((select v::uuid from fx where k='atlas'),
                                     (select v::uuid from fx where k='them'), 'viewer');
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
begin
  insert into r select 'D01 a Viewer still reads the thread',
    (select count(*)::text from public.comments
      where entity_id = (select v::uuid from fx where k='owned')), '1';
  insert into r select 'D02 but thread_context withdraws every control',
    (select may_comment::text from public.thread_context('task', (select v::uuid from fx where k='owned'))), 'false';
  -- He OWNS this task and still cannot resolve it. A Viewer resolves nothing.
  begin
    update public.comments set resolved = false
     where entity_id = (select v::uuid from fx where k='owned');
  exception when others then null; end;
  insert into r select 'D03 and ownership does not survive the demotion',
    (select resolved::text from public.comments where entity_id = (select v::uuid from fx where k='owned')), 'true';
  insert into r select 'D04 nor may he move a review addressed to him',
    (select i_may_move::text from public.review_for('clause', (select v::uuid from fx where k='clause'))), 'false';
end $t$;

-- ===========================================================================
-- E — removal mid-flight: it was never there
-- ===========================================================================
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
select public.remove_matter_member((select v::uuid from fx where k='atlas'),
                                   (select v::uuid from fx where k='them'));
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
begin
  insert into r select 'E01 no matters at all',      (select count(*)::text from public.matters), '0';
  insert into r select 'E02 no comments',            (select count(*)::text from public.comments), '0';
  insert into r select 'E03 no tasks',               (select count(*)::text from public.tasks), '0';
  insert into r select 'E04 no approvals',           (select count(*)::text from public.approvals), '0';
  insert into r select 'E05 no thread context',
    (select count(*)::text from public.thread_context('task', (select v::uuid from fx where k='owned'))), '0';
  insert into r select 'E06 no review',
    (select count(*)::text from public.review_for('clause', (select v::uuid from fx where k='clause'))), '0';
  insert into r select 'E07 no mention markers',
    (select count(*)::text from public.matters_with_unseen_mentions()), '0';
  insert into r select 'E08 and the task he was asked to do is gone with it',
    (select count(*)::text from public.tasks where id = (select v::uuid from fx where k='owned')), '0';
end $t$;

reset role;
select test, got, want, case when got = want then 'PASS' else 'FAIL' end as result from r order by test;
rollback;

-- ---------------------------------------------------------------------------
-- THE ONE THING THIS FILE CANNOT ASSERT
-- ---------------------------------------------------------------------------
--
-- The mention marker defect was a CLIENT WIRING error: useClearMentionsOnOpen
-- was passed `matterId`, which falls back to matters[0], so visiting the matters
-- LIST marked the first matter as read. `mark_mentions_seen()` behaved perfectly
-- throughout, and every assertion in phase4_mentions.sql passed while the dot
-- was never once visible to a human.
--
-- No SQL can catch that, and it is worth saying so plainly rather than adding an
-- assertion that pretends to. It is guarded instead by the comment in
-- src/store/app.tsx, which names both values and says why the wrong one looks
-- right. If that hook ever moves, read it.
--
-- Which is the argument for keeping a two-user browser test at all: three of the
-- four defects this phase shipped with were invisible to a suite that was, in
-- each case, correctly asserting a rule the product was not using.
