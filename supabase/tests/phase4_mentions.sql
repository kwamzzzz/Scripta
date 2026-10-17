-- PHASE 4, STEP 3: mentions.
--
-- A mention means LOOK AT THIS. It creates nothing — no task, no row, no
-- notification — and the whole signal is one timestamp per person per matter.
--
-- The two assertions this file exists for:
--
--   1. A mention naming a non-member is refused AT WRITE TIME, not filtered at
--      read. A picker that only offers the matter team is a rule the interface
--      remembers, and a rule the interface remembers holds until the next
--      screen forgets it. Being told "you were mentioned in Atlas" is itself
--      something about Atlas, so this is the one control in Phase 4 able to
--      pull somebody toward a file they cannot open.
--
--   2. MENTIONS CREATE NOTHING. After a mention, the mentioned person's task
--      count is unchanged. This is the assertion that stops Tasks quietly
--      becoming a feed, which is what the four verbs exist to prevent.
--
-- Plus every nullable branch: an empty mentions array, a null mentions_seen_at,
-- a comment with no matter at all.
--
-- Runs against the live database as two real users and ROLLS BACK.

begin;
create temp table r(test text, got text, want text) on commit drop;
create temp table fx(k text, v text) on commit drop;
grant all on r to authenticated;
grant all on fx to authenticated;

insert into fx values
 ('atlas','c0c2b172-4856-4e84-bf40-fafe7f9dee42'),  -- Kwame leads, Podrick edits
 ('ptm','99bc433c-4910-4c96-aa95-5196e0eae29d'),    -- Kwame leads, Podrick is NOT on it
 ('ws','d832b081-cf82-4dc0-a5b9-b0241fe50d9b'),
 ('me','6df711b6-27b0-4aaf-8129-ef39700de7bb'),
 ('them','176d2a8c-10f1-429b-82f2-dde207c99a68');

set local role authenticated;
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';

-- ===========================================================================
-- M — a mention names somebody who can open the file
-- ===========================================================================
do $t$
declare c uuid; before_tasks integer;
begin
  select count(*) into before_tasks from public.tasks where assignee_id = (select v::uuid from fx where k='them');
  insert into fx values ('tasks_before', before_tasks::text);

  -- Podrick is an Editor on Atlas. Naming him is allowed.
  /* created_at is stamped with clock_timestamp() rather than left to default.
     `now()` is TRANSACTION-scoped in Postgres, so every row written in this
     suite would otherwise share one timestamp to the microsecond and the
     marker's before/after comparison would have nothing to compare. That tie
     is not only a test artefact — it is what exposed the strict `>` bug fixed
     in 20260916140000. */
  insert into public.comments (workspace_id, entity_kind, entity_id, body, author_id, mentions, created_at)
  values ((select v::uuid from fx where k='ws'), 'matter', (select v::uuid from fx where k='atlas'),
          'Can you look at the indemnity, @Podrick Robogo?', (select v::uuid from fx where k='me'),
          array[(select v::uuid from fx where k='them')], clock_timestamp())
  returning id into c;
  insert into fx values ('mention', c::text);
  insert into r select 'M01 a colleague on the matter can be mentioned',
    (select array_length(mentions, 1)::text from public.comments where id = c), '1';
end $t$;

-- The refusal. Podrick is not on Personal Trade Management, so he cannot be
-- named in a thread on it — refused when the row is written, not hidden later.
do $t$
declare wrote integer := 0;
begin
  begin
    insert into public.comments (workspace_id, entity_kind, entity_id, body, author_id, mentions)
    values ((select v::uuid from fx where k='ws'), 'matter', (select v::uuid from fx where k='ptm'),
            'Naming somebody who is not on this file.', (select v::uuid from fx where k='me'),
            array[(select v::uuid from fx where k='them')]);
  exception when others then null;
  end;
  insert into r select 'M02 a mention of a NON-MEMBER is refused at write time',
    (select count(*)::text from public.comments where body = 'Naming somebody who is not on this file.'), '0';
end $t$;

-- The control case. Without it M02 also passes when the insert is broken for
-- some unrelated reason, which is how a suite ends up agreeing with itself.
do $t$
begin
  insert into public.comments (workspace_id, entity_kind, entity_id, body, author_id, mentions)
  values ((select v::uuid from fx where k='ws'), 'matter', (select v::uuid from fx where k='ptm'),
          'The same comment, naming nobody.', (select v::uuid from fx where k='me'), '{}');
  insert into r select 'M03 the identical comment without the mention is written',
    (select count(*)::text from public.comments where body = 'The same comment, naming nobody.'), '1';
end $t$;

-- A mention needs a matter team. Unfiled private work has none, and the answer
-- is to refuse rather than to fall back to the firm — the third time in this
-- codebase that the fallback is the thing worth being suspicious of.
do $t$
declare t uuid;
begin
  insert into public.tasks (workspace_id, title, status)
  values ((select v::uuid from fx where k='ws'), 'P4 unfiled task for mentions', 'Open')
  returning id into t;
  insert into fx values ('unfiled_task', t::text);
  begin
    insert into public.comments (workspace_id, entity_kind, entity_id, body, author_id, mentions)
    values ((select v::uuid from fx where k='ws'), 'task', t,
            'Mentioning on unfiled work.', (select v::uuid from fx where k='me'),
            array[(select v::uuid from fx where k='them')]);
  exception when others then null;
  end;
  insert into r select 'M04 a mention on work with no matter is refused',
    (select count(*)::text from public.comments where body = 'Mentioning on unfiled work.'), '0';

  -- And the same comment with no mention is fine, because the thread itself is
  -- legitimate — it is only the naming that has nowhere to stand.
  insert into public.comments (workspace_id, entity_kind, entity_id, body, author_id)
  values ((select v::uuid from fx where k='ws'), 'task', t,
          'A private note to myself.', (select v::uuid from fx where k='me'));
  insert into r select 'M05 but the comment itself is fine without one',
    (select count(*)::text from public.comments where body = 'A private note to myself.'), '1';
end $t$;

-- The empty branch. `mentions` is not null and defaults to empty, so a comment
-- that names nobody has an array rather than a null to reason about.
insert into r select 'M06 a comment naming nobody has an EMPTY array, not null',
  (select coalesce(array_length(mentions, 1)::text, 'empty') from public.comments
    where body = 'A private note to myself.'), 'empty';
insert into r select 'M07 and the column is never null',
  (select (mentions is not null)::text from public.comments where body = 'A private note to myself.'), 'true';

-- ===========================================================================
-- N — MENTIONS CREATE NOTHING
-- ===========================================================================
insert into r select 'N01 the mentioned persons task count is unchanged',
  (select count(*)::text from public.tasks where assignee_id = (select v::uuid from fx where k='them')),
  (select v from fx where k='tasks_before');
insert into r select 'N02 no task anywhere has a mention as its origin',
  (select count(*)::text from public.tasks where origin_kind::text = 'mention'), '0';
insert into r select 'N03 and no approval was created either',
  (select count(*)::text from public.approvals
    where entity_id = (select v::uuid from fx where k='atlas')), '0';

-- ===========================================================================
-- S — the marker, which is the entire mention signal
-- ===========================================================================
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
begin
  -- Podrick has never opened Atlas in this transaction, so mentions_seen_at is
  -- whatever it was — the marker is computed against it rather than against a
  -- count of unread rows.
  insert into r select 'S01 the mentioned person sees the matter marked',
    (select count(*)::text from public.matters_with_unseen_mentions()
      where matters_with_unseen_mentions = (select v::uuid from fx where k='atlas')), '1';

  -- Opening the matter clears it.
  perform public.mark_mentions_seen((select v::uuid from fx where k='atlas'));
  insert into r select 'S02 opening the matter clears the marker',
    (select count(*)::text from public.matters_with_unseen_mentions()
      where matters_with_unseen_mentions = (select v::uuid from fx where k='atlas')), '0';
end $t$;

-- A mention made AFTER he looked marks it again. This is the property that
-- makes one timestamp sufficient and a read-state table unnecessary.
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
insert into public.comments (workspace_id, entity_kind, entity_id, body, author_id, mentions, created_at)
values ((select v::uuid from fx where k='ws'), 'matter', (select v::uuid from fx where k='atlas'),
        'One more thing, @Podrick Robogo.', (select v::uuid from fx where k='me'),
        array[(select v::uuid from fx where k='them')], clock_timestamp());

set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
insert into r select 'S03 a later mention marks it again',
  (select count(*)::text from public.matters_with_unseen_mentions()
    where matters_with_unseen_mentions = (select v::uuid from fx where k='atlas')), '1';

-- Mentioning yourself is not a signal to yourself.
set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
do $t$
begin
  perform public.mark_mentions_seen((select v::uuid from fx where k='atlas'));
  insert into public.comments (workspace_id, entity_kind, entity_id, body, author_id, mentions, created_at)
  values ((select v::uuid from fx where k='ws'), 'matter', (select v::uuid from fx where k='atlas'),
          'Noting for myself, @Podrick Robogo.', (select v::uuid from fx where k='them'),
          array[(select v::uuid from fx where k='them')], clock_timestamp());
  insert into r select 'S04 mentioning yourself marks nothing',
    (select count(*)::text from public.matters_with_unseen_mentions()
      where matters_with_unseen_mentions = (select v::uuid from fx where k='atlas')), '0';
end $t$;

-- THE TIE, asserted rather than left to the clock.
--
-- A mention written at exactly the instant somebody opened the matter. The
-- strict `>` this suite was first written against dropped it permanently — the
-- dot is the only signal a mention has, so "never shown" is "lost". It now
-- breaks towards being seen: shown once more, and cleared by the next open,
-- which stamps a later time.
--
-- The collision is forced rather than waited for. `mentions_seen_at` is set
-- directly, as the suite owner, because `authenticated` cannot write that
-- column — which is itself the property P01 asserts.
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
do $t$
declare seen timestamptz := clock_timestamp();
begin
  insert into public.comments (workspace_id, entity_kind, entity_id, body, author_id, mentions, created_at)
  values ((select v::uuid from fx where k='ws'), 'matter', (select v::uuid from fx where k='atlas'),
          'A mention landing in the same instant.', (select v::uuid from fx where k='me'),
          array[(select v::uuid from fx where k='them')], seen);
  insert into fx values ('tie_at', seen::text);
end $t$;

reset role;
update public.matter_members set mentions_seen_at = (select v::timestamptz from fx where k='tie_at')
 where matter_id = (select v::uuid from fx where k='atlas')
   and user_id = (select v::uuid from fx where k='them');
set local role authenticated;

set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
insert into r select 'S05 a mention at EXACTLY seen_at is still shown, not lost',
  (select count(*)::text from public.matters_with_unseen_mentions() x
    where x = (select v::uuid from fx where k='atlas')), '1';

-- ===========================================================================
-- P — nobody learns when a colleague last read their mentions
-- ===========================================================================
-- This is a column privilege rather than a policy, because RLS is row-level and
-- the team card reads every row of matter_members. So the test is that the
-- column cannot be selected at all, not that some rows are filtered.
do $t$
declare leaked boolean := false; dummy timestamptz;
begin
  begin
    select mentions_seen_at into dummy from public.matter_members
     where matter_id = (select v::uuid from fx where k='atlas')
       and user_id = (select v::uuid from fx where k='me');
    leaked := true;
  exception when insufficient_privilege then leaked := false;
  end;
  insert into r select 'P01 a colleagues mentions_seen_at cannot be read', leaked::text, 'false';

  -- While the rest of the row still reads, or the team card would be empty.
  insert into r select 'P03 the rest of the team row still reads',
    (select count(*)::text from public.matter_members
      where matter_id = (select v::uuid from fx where k='atlas')), '2';
end $t$;

-- ===========================================================================
-- X — a non-member is not marked, and cannot be named
-- ===========================================================================
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
select public.remove_matter_member((select v::uuid from fx where k='atlas'),
                                   (select v::uuid from fx where k='them'));

set local request.jwt.claims = '{"sub":"176d2a8c-10f1-429b-82f2-dde207c99a68","role":"authenticated"}';
insert into r select 'X01 removed from the matter, the marker is gone',
  (select count(*)::text from public.matters_with_unseen_mentions()
    where matters_with_unseen_mentions = (select v::uuid from fx where k='atlas')), '0';
insert into r select 'X02 and the comment that named him is invisible',
  (select count(*)::text from public.comments where id = (select v::uuid from fx where k='mention')), '0';

-- He can no longer be named either, which is the same rule seen from the other
-- side: entitlement ended, so the picker and the trigger both stop offering him.
set local request.jwt.claims = '{"sub":"6df711b6-27b0-4aaf-8129-ef39700de7bb","role":"authenticated"}';
do $t$
begin
  begin
    insert into public.comments (workspace_id, entity_kind, entity_id, body, author_id, mentions)
    values ((select v::uuid from fx where k='ws'), 'matter', (select v::uuid from fx where k='atlas'),
            'Naming him after removal.', (select v::uuid from fx where k='me'),
            array[(select v::uuid from fx where k='them')]);
  exception when others then null;
  end;
  insert into r select 'X03 somebody removed from the matter can no longer be mentioned',
    (select count(*)::text from public.comments where body = 'Naming him after removal.'), '0';
end $t$;

reset role;
select test, got, want, case when got = want then 'PASS' else 'FAIL' end as result from r order by test;
rollback;
