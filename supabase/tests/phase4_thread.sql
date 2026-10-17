-- PHASE 4, STEP 2: the thread, and who may do what to it.
--
-- The exit condition for this step is stated as an interface property — "a
-- Viewer sees threads and no comment box anywhere; an Editor sees Resolve only
-- where the rule allows it" — and an interface property proved only in an
-- interface is a property that lasts until the next screen. So it is proved
-- here first, at the write, and the component is then written to render against
-- the same predicates. The unit tests in `src/lib/thread.test.ts` cover the same
-- table of cases from the other side.
--
-- ADVERSARIAL, NOT CONFIRMATORY. Podrick is demoted and then removed PART WAY
-- THROUGH, while holding ids he legitimately obtained a moment earlier, because
-- that is the shape of the thing that actually goes wrong — not a stranger
-- guessing a uuid, but a colleague whose entitlement ended after they had
-- already seen it.
--
-- Runs against the live database as two real users and ROLLS BACK.

begin;
create temp table r(test text, got text, want text) on commit drop;
create temp table fx(k text, v text) on commit drop;
grant all on r to authenticated;
grant all on fx to authenticated;

insert into fx values
 ('atlas','c0c2b172-4856-4e84-bf40-fafe7f9dee42'),  -- Kwame leads, Podrick edits
 ('ptm','99bc433c-4910-4c96-aa95-5196e0eae29d'),    -- Kwame leads, Podrick is not on it
 ('ws','d832b081-cf82-4dc0-a5b9-b0241fe50d9b'),
 ('me','6df711b6-27b0-4aaf-8129-ef39700de7bb'),
 ('them','176d2a8c-10f1-429b-82f2-dde207c99a68');

insert into fx select 'clause', id::text from public.clauses
  where matter_id = (select v::uuid from fx where k='atlas') limit 1;

set local role authenticated;
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';

-- Two tasks on Atlas: one Podrick is responsible for, one nobody is. The
-- difference between them is the whole of the resolution rule.
do $t$
declare owned uuid; orphan uuid;
begin
  insert into public.tasks (workspace_id, matter_id, title, status, assignee_id)
  values ((select v::uuid from fx where k='ws'), (select v::uuid from fx where k='atlas'),
          'P4 thread — Podricks task', 'Open', (select v::uuid from fx where k='them'))
  returning id into owned;
  insert into public.tasks (workspace_id, matter_id, title, status)
  values ((select v::uuid from fx where k='ws'), (select v::uuid from fx where k='atlas'),
          'P4 thread — nobodys task', 'Open')
  returning id into orphan;
  insert into fx values ('owned_task', owned::text), ('orphan_task', orphan::text);
end $t$;

-- Kwame raises a point on each, and one on a clause.
do $t$
declare a uuid; b uuid; c uuid;
begin
  insert into public.comments (workspace_id, entity_kind, entity_id, body, author_id)
  values ((select v::uuid from fx where k='ws'), 'task', (select v::uuid from fx where k='owned_task'),
          'Please confirm the indemnity position.', (select v::uuid from fx where k='me'))
  returning id into a;
  insert into public.comments (workspace_id, entity_kind, entity_id, body, author_id)
  values ((select v::uuid from fx where k='ws'), 'task', (select v::uuid from fx where k='orphan_task'),
          'This one belongs to nobody yet.', (select v::uuid from fx where k='me'))
  returning id into b;
  insert into public.comments (workspace_id, entity_kind, entity_id, body, author_id)
  values ((select v::uuid from fx where k='ws'), 'clause', (select v::uuid from fx where k='clause'),
          'Clause point raised by the Lead.', (select v::uuid from fx where k='me'))
  returning id into c;
  insert into fx values ('c_owned', a::text), ('c_orphan', b::text), ('c_clause', c::text);
end $t$;

insert into r select 'T01 a thread on a task is written and read back',
  (select count(*)::text from public.comments where id = (select v::uuid from fx where k='c_owned')), '1';
insert into r select 'T02 a thread on a clause too',
  (select count(*)::text from public.comments where id = (select v::uuid from fx where k='c_clause')), '1';
insert into r select 'T03 a new comment is not marked edited',
  (select coalesce(updated_at::text,'null') from public.comments where id = (select v::uuid from fx where k='c_owned')), 'null';

-- ===========================================================================
-- The Editor. Can speak; can resolve only what is his to resolve.
-- ===========================================================================
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
declare reply uuid;
begin
  insert into r select 'E01 an Editor reads the Leads thread',
    (select count(*)::text from public.comments where id = (select v::uuid from fx where k='c_owned')), '1';

  insert into public.comments (workspace_id, entity_kind, entity_id, parent_id, body, author_id)
  values ((select v::uuid from fx where k='ws'), 'task', (select v::uuid from fx where k='owned_task'),
          (select v::uuid from fx where k='c_owned'), 'Confirmed — cap at 12 months fees.',
          (select v::uuid from fx where k='them'))
  returning id into reply;
  insert into fx values ('reply', reply::text);
  insert into r select 'E02 and can reply', (select count(*)::text from public.comments where id = reply), '1';

  -- Responsible for the task, so the thread about it is his to close even
  -- though the Lead raised it.
  update public.comments set resolved = true where id = (select v::uuid from fx where k='c_owned');
  insert into r select 'E03 the responsible person may resolve',
    (select resolved::text from public.comments where id = (select v::uuid from fx where k='c_owned')), 'true';

  -- Nobody is responsible for the other task, so the rule narrows to the
  -- raiser and the Lead. He is neither.
  --
  -- The attempt is wrapped so a refusal that RAISES does not abort the block,
  -- and the assertion then reads the row itself. Asserting a constant inside
  -- the exception handler would be a test that passes because it was reached,
  -- which is the shape of the Phase 3 assertion that let unfiled work leak.
  begin
    update public.comments set resolved = true where id = (select v::uuid from fx where k='c_orphan');
  exception when others then null;
  end;
  insert into r select 'E04 an Editor may NOT resolve where nobody is responsible',
    (select resolved::text from public.comments where id = (select v::uuid from fx where k='c_orphan')), 'false';

  -- Nor rewrite what a colleague is recorded as having said.
  begin
    update public.comments set body = 'Rewritten by somebody else'
     where id = (select v::uuid from fx where k='c_owned');
  exception when others then null;
  end;
  insert into r select 'E05 an Editor may not edit anothers comment',
    (select (body = 'Rewritten by somebody else')::text from public.comments
      where id = (select v::uuid from fx where k='c_owned')), 'false';
end $t$;

-- An edit of his own says so, and the audit trail keeps what it said before.
do $t$
declare before_count integer;
begin
  select count(*) into before_count from public.audit_events where event_type = 'comment.edited';
  update public.comments set body = 'Confirmed — cap at 12 months fees, subject to carve-outs.'
   where id = (select v::uuid from fx where k='reply');

  insert into r select 'E06 an author may edit their own',
    (select (body like '%carve-outs%')::text from public.comments where id = (select v::uuid from fx where k='reply')), 'true';
  insert into r select 'E07 and it is marked edited',
    (select (updated_at is not null)::text from public.comments where id = (select v::uuid from fx where k='reply')), 'true';
  insert into r select 'E08 one audit row per edit',
    (select (count(*) - before_count)::text from public.audit_events where event_type = 'comment.edited'), '1';
  insert into r select 'E09 the audit row keeps the previous text',
    (select (metadata->>'previous' = 'Confirmed — cap at 12 months fees.')::text
       from public.audit_events where event_type = 'comment.edited'
        and entity_id = (select v::uuid from fx where k='reply') order by created_at desc limit 1), 'true';
  insert into r select 'E10 and is scoped to the matter, so it inherits its visibility',
    (select (matter_id = (select v::uuid from fx where k='atlas'))::text
       from public.audit_events where event_type = 'comment.edited'
        and entity_id = (select v::uuid from fx where k='reply') order by created_at desc limit 1), 'true';
end $t$;

-- ===========================================================================
-- A reply cannot smuggle a thread onto another matter
-- ===========================================================================
-- The Lead of BOTH matters attempts it, which is the only person who could: he
-- can legitimately write to either, so nothing but the trigger stops the row
-- claiming to be on Personal Trade Management while hanging off an Atlas root.
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
do $t$
declare smuggled uuid;
begin
  insert into public.comments (workspace_id, entity_kind, entity_id, parent_id, body, author_id)
  values ((select v::uuid from fx where k='ws'), 'matter', (select v::uuid from fx where k='ptm'),
          (select v::uuid from fx where k='c_owned'), 'Aimed at another matter.',
          (select v::uuid from fx where k='me'))
  returning id into smuggled;
  insert into r select 'R01 a reply takes its entity from the root, not the row',
    (select entity_id::text from public.comments where id = smuggled),
    (select v from fx where k='owned_task');
  insert into r select 'R02 and its kind',
    (select entity_kind::text from public.comments where id = smuggled), 'task';
  insert into r select 'R03 so it lands on the roots matter',
    public.comment_matter(
      (select entity_kind::text from public.comments where id = smuggled),
      (select entity_id from public.comments where id = smuggled))::text,
    (select v from fx where k='atlas');

  -- A reply to a reply flattens to the root rather than building a tree.
  insert into public.comments (workspace_id, entity_kind, entity_id, parent_id, body, author_id)
  values ((select v::uuid from fx where k='ws'), 'task', (select v::uuid from fx where k='owned_task'),
          (select v::uuid from fx where k='reply'), 'A reply to a reply.',
          (select v::uuid from fx where k='me'))
  returning id into smuggled;
  insert into r select 'R04 a reply to a reply flattens to the root',
    (select parent_id::text from public.comments where id = smuggled),
    (select v from fx where k='c_owned');
end $t$;

-- The entity cannot be moved afterwards either, which is the other half of R01.
do $t$
begin
  begin
    update public.comments set entity_id = (select v::uuid from fx where k='ptm'), entity_kind = 'matter'
     where id = (select v::uuid from fx where k='c_owned');
  exception when others then null;
  end;
  insert into r select 'R05 a comment cannot be moved to another entity',
    (select entity_id::text from public.comments where id = (select v::uuid from fx where k='c_owned')),
    (select v from fx where k='owned_task');
  insert into r select 'R06 nor to another kind',
    (select entity_kind::text from public.comments where id = (select v::uuid from fx where k='c_owned')), 'task';
end $t$;

-- The Lead may resolve anything on the matter, including the orphan thread.
update public.comments set resolved = true where id = (select v::uuid from fx where k='c_orphan');
insert into r select 'L01 the Lead may resolve where nobody is responsible',
  (select resolved::text from public.comments where id = (select v::uuid from fx where k='c_orphan')), 'true';

-- ===========================================================================
-- The Viewer. Reads everything, writes nothing.
-- ===========================================================================
select public.set_matter_member_role((select v::uuid from fx where k='atlas'),
                                     (select v::uuid from fx where k='them'), 'viewer');

set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
begin
  insert into r select 'V01 a Viewer still reads the thread',
    (select count(*)::text from public.comments where id = (select v::uuid from fx where k='c_owned')), '1';

  -- The comment box is absent in the interface. Here is why that is not merely
  -- a courtesy.
  begin
    insert into public.comments (workspace_id, entity_kind, entity_id, body, author_id)
    values ((select v::uuid from fx where k='ws'), 'task', (select v::uuid from fx where k='owned_task'),
            'A viewer speaking.', (select v::uuid from fx where k='them'));
  exception when others then null;
  end;
  insert into r select 'V02 a Viewer cannot comment',
    (select count(*)::text from public.comments where body = 'A viewer speaking.'), '0';

  begin
    insert into public.comments (workspace_id, entity_kind, entity_id, parent_id, body, author_id)
    values ((select v::uuid from fx where k='ws'), 'task', (select v::uuid from fx where k='owned_task'),
            (select v::uuid from fx where k='c_owned'), 'A viewer replying.',
            (select v::uuid from fx where k='them'));
  exception when others then null;
  end;
  insert into r select 'V03 a Viewer cannot reply',
    (select count(*)::text from public.comments where body = 'A viewer replying.'), '0';

  -- Demoted mid-thread, holding the id of a comment he wrote himself minutes
  -- ago and was entitled to resolve at the time.
  begin
    update public.comments set resolved = true where id = (select v::uuid from fx where k='reply');
  exception when others then null;
  end;
  insert into r select 'V04 a Viewer cannot resolve even their own',
    (select resolved::text from public.comments where id = (select v::uuid from fx where k='reply')), 'false';

  begin
    update public.comments set body = 'Edited after demotion.'
     where id = (select v::uuid from fx where k='reply');
  exception when others then null;
  end;
  insert into r select 'V05 a Viewer cannot edit even their own',
    (select (body = 'Edited after demotion.')::text from public.comments
      where id = (select v::uuid from fx where k='reply')), 'false';

  insert into r select 'V06 thread_context tells the interface not to draw the box',
    (select may_comment::text from public.thread_context('task', (select v::uuid from fx where k='owned_task'))), 'false';
  insert into r select 'V07 and reports the role honestly',
    (select my_role from public.thread_context('task', (select v::uuid from fx where k='owned_task'))), 'viewer';
end $t$;

-- THE CONTROL CASE, without which V02 to V05 prove nothing.
--
-- Every refusal above is a row that did not change, and a row that did not
-- change is also what a broken fixture looks like. So the demotion is undone
-- and the identical write is made again: if it now succeeds, the refusal was
-- the Viewer role and not the setup. This is the assertion that would have
-- caught the shape of the Phase 3 failure — a test agreeing with itself.
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
select public.set_matter_member_role((select v::uuid from fx where k='atlas'),
                                     (select v::uuid from fx where k='them'), 'editor');
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
begin
  begin
    update public.comments set resolved = true where id = (select v::uuid from fx where k='reply');
  exception when others then null;
  end;
  insert into r select 'V08 restored to Editor, the identical write succeeds',
    (select resolved::text from public.comments where id = (select v::uuid from fx where k='reply')), 'true';
end $t$;

-- ===========================================================================
-- Removed from the matter. The thread was never there.
-- ===========================================================================
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
select public.remove_matter_member((select v::uuid from fx where k='atlas'),
                                   (select v::uuid from fx where k='them'));

set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
begin
  insert into r select 'X01 the thread is gone by list',
    (select count(*)::text from public.comments
      where entity_kind = 'task' and entity_id = (select v::uuid from fx where k='owned_task')), '0';
  insert into r select 'X02 gone by primary key',
    (select count(*)::text from public.comments where id = (select v::uuid from fx where k='c_owned')), '0';
  insert into r select 'X03 gone even for the reply he wrote himself',
    (select count(*)::text from public.comments where id = (select v::uuid from fx where k='reply')), '0';
  insert into r select 'X04 and cannot be found by its text',
    (select count(*)::text from public.comments where body like '%indemnity position%'), '0';

  -- The non-disclosure property: nothing, not a row of nulls.
  insert into r select 'X05 thread_context returns NOTHING for a non-member',
    (select count(*)::text from public.thread_context('task', (select v::uuid from fx where k='owned_task'))), '0';

  -- And the audit trail does not read the thread out loud either, which was the
  -- Phase 3d defect in a new place.
  insert into r select 'X06 nor does the audit trail mention the edit',
    (select count(*)::text from public.audit_events
      where event_type = 'comment.edited' and entity_id = (select v::uuid from fx where k='reply')), '0';
end $t$;

reset role;
select test, got, want, case when got = want then 'PASS' else 'FAIL' end as result from r order by test;
rollback;

-- ===========================================================================
-- S — a comment is signed by whoever wrote it
-- ===========================================================================
--
-- Added after the two-user browser test, which found that nothing set
-- `comments.author_id` and nothing checked it. Every assertion above this line
-- writes comments with `author_id` supplied by hand, because that made the
-- authorship rules readable — and so the whole suite tested A ROW SHAPE THE
-- APPLICATION NEVER PRODUCED.
--
-- These assertions insert the way the composer does: without an author. That is
-- the only way this file could have caught it.

begin;
create temp table r2(test text, got text, want text) on commit drop;
grant all on r2 to authenticated;
set local role authenticated;
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
declare c uuid; t uuid; refused boolean := false; spoof uuid;
begin
  -- Exactly what <Thread> sends: no author_id.
  insert into public.comments (workspace_id, entity_kind, entity_id, body)
  values ('d832b081-cf82-4dc0-a5b9-b0241fe50d9b', 'matter',
          'c0c2b172-4856-4e84-bf40-fafe7f9dee42', 'Signed-by probe')
  returning id into c;
  insert into r2 select 'S01 a comment posted the way the app posts it is signed',
    (select author_id::text from public.comments where id = c),
    '176d2a8c-10f1-429b-82f2-dde207c99a68';

  update public.comments set body = 'Signed-by probe, edited' where id = c;
  insert into r2 select 'S02 so its author can edit it',
    (select (body = 'Signed-by probe, edited')::text from public.comments where id = c), 'true';

  -- The consequence that was not merely cosmetic: with a null author the insert
  -- policy's `author_id = auth.uid()` branch refused a person's own private note.
  insert into public.tasks (workspace_id, title, status)
  values ('d832b081-cf82-4dc0-a5b9-b0241fe50d9b', 'Signed-by probe unfiled', 'Open')
  returning id into t;
  begin
    insert into public.comments (workspace_id, entity_kind, entity_id, body)
    values ('d832b081-cf82-4dc0-a5b9-b0241fe50d9b', 'task', t, 'A note on my own unfiled task');
  exception when others then refused := true;
  end;
  insert into r2 select 'S03 and you can comment on your own unfiled work', refused::text, 'false';
  insert into r2 select 'S04 and read it back',
    (select count(*)::text from public.comments where body = 'A note on my own unfiled task'), '1';

  -- IMPERSONATION. The insert policy checks can_review_matter and says nothing
  -- about author_id, so without the stamp any member could sign a comment as a
  -- colleague — on the professional record, with the audit trail agreeing.
  insert into public.comments (workspace_id, entity_kind, entity_id, body, author_id)
  values ('d832b081-cf82-4dc0-a5b9-b0241fe50d9b', 'matter',
          'c0c2b172-4856-4e84-bf40-fafe7f9dee42', 'I did not write this',
          '6df711b6-27b0-4aaf-8129-ef39700de7bb')
  returning id into spoof;
  insert into r2 select 'S05 a comment sent signed as somebody else is stamped with its REAL writer',
    (select author_id::text from public.comments where id = spoof),
    '176d2a8c-10f1-429b-82f2-dde207c99a68';

  begin
    update public.comments set author_id = '6df711b6-27b0-4aaf-8129-ef39700de7bb' where id = c;
  exception when others then null;
  end;
  insert into r2 select 'S06 nor re-attributed afterwards',
    (select author_id::text from public.comments where id = c),
    '176d2a8c-10f1-429b-82f2-dde207c99a68';
end $t$;

set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
do $t$
declare c uuid := (select id from public.comments where body = 'Signed-by probe, edited' limit 1);
begin
  begin update public.comments set body = 'Rewritten by the Lead' where id = c; exception when others then null; end;
  insert into r2 select 'S07 and the Lead still cannot rewrite what a colleague said',
    (select (body = 'Rewritten by the Lead')::text from public.comments where id = c), 'false';
end $t$;

reset role;
select test, got, want, case when got = want then 'PASS' else 'FAIL' end as result from r2 order by test;
rollback;
